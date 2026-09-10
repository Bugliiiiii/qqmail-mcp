#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { chmodSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  assertNoV1Environment,
  buildClientCandidates,
  buildRemoteArgs,
  buildStdioConfig,
  getClientCredentialDir,
  prepareCredentialDir,
  resolveCallbackPort
} from '../src/config.js';
import {
  buildConfirmationElicitation,
  findConfirmationChallenge,
  hasElicitationCapability,
  isConfirmedElicitationResponse,
  isSecondPhaseWriteCall,
  isWriteTool,
  negotiateProtocolVersion
} from '../src/relay-policy.js';

const HELP = `qqmail-mcp 2.x

Connect a local stdio-only MCP client to Tencent's official QQ Mail MCP service.

Usage:
  qqmail-mcp                 Start the local stdio relay
  qqmail-mcp --print-config  Print a generic MCP client configuration
  qqmail-mcp --help          Show this help

Environment:
  QQMAIL_OAUTH_CLIENT_NAME   Force Codex, Claude, or WorkBuddy
  QQMAIL_OAUTH_CALLBACK_PORT Fixed local callback port for OAuth redirect
  MCP_REMOTE_CONFIG_DIR      Override the local OAuth state directory

Without an explicit name, the relay tries Codex, Claude, then WorkBuddy and
caches the first successful registration. OAuth state is isolated per name.

Clients with native remote OAuth support should connect directly to:
  https://api.mail.qq.com/mcp
`;

function resolveMcpRemoteBin() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('mcp-remote/package.json');
  const packageJson = require(packagePath);
  const relativeBin =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.['mcp-remote'];
  if (!relativeBin) throw new Error('The installed mcp-remote package has no mcp-remote binary');
  return path.resolve(path.dirname(packagePath), relativeBin);
}

function readCachedClient(cachePath) {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    return typeof parsed.clientName === 'string' ? parsed.clientName : undefined;
  } catch {
    return undefined;
  }
}

function cacheClient(cachePath, clientName) {
  writeFileSync(
    cachePath,
    `${JSON.stringify({ clientName, cachedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 }
  );
  chmodSync(cachePath, 0o600);
}

function parseMessage(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function writeProtocol(message) {
  process.stdout.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
}

function writeError(id, message) {
  writeProtocol({ jsonrpc: '2.0', id, error: { code: -32001, message } });
}

export function runRelay({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  spawnFn = spawn,
  env = process.env,
  stateRoot = prepareCredentialDir(env.MCP_REMOTE_CONFIG_DIR),
  onExitCode = (code) => {
    process.exitCode = code;
  },
  handleSignals = true
} = {}) {
  assertNoV1Environment(env);
  const callbackPort = resolveCallbackPort(env.QQMAIL_OAUTH_CALLBACK_PORT);

  function writeProtocol(message) {
    stdout.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
  }

  function writeError(id, message) {
    writeProtocol({ jsonrpc: '2.0', id, error: { code: -32001, message } });
  }

  const cachePath = path.join(stateRoot, 'selected-client.json');
  const explicitName = env.QQMAIL_OAUTH_CLIENT_NAME;
  const cachedName = explicitName ? undefined : readCachedClient(cachePath);
  const candidates = buildClientCandidates({ explicitName, cachedName });
  const inputBuffer = [];
  const preInitializationOutput = [];
  const firstPhaseIds = new Map();
  const challenges = new Map();
  const pendingElicitations = new Map();
  let clientCapabilities = {};
  let initializeId;
  let child;
  let candidateIndex = 0;
  let initialized = false;
  let receivedInitializeResponse = false;
  let clientRequestedProtocolVersion;

  function forwardToChild(line) {
    if (child?.stdin?.writable) child.stdin.write(`${line}\n`);
  }

  function startNextCandidate() {
    if (candidateIndex >= candidates.length) {
      stderr.write('QQ Mail OAuth registration failed for every allowed client name.\n');
      onExitCode(1);
      return;
    }

    const clientName = candidates[candidateIndex++];
    const credentialDir = getClientCredentialDir(stateRoot, clientName);
    stderr.write(`QQ Mail local relay: trying OAuth client name "${clientName}".\n`);
    let isPortConflict = false;
    const attempt = spawnFn(
      process.execPath,
      [resolveMcpRemoteBin(), ...buildRemoteArgs({ clientName, callbackPort })],
      {
        env: { ...env, MCP_REMOTE_CONFIG_DIR: credentialDir },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    child = attempt;
    preInitializationOutput.length = 0;

    attempt.stderr?.on('data', (chunk) => {
      stderr.write(chunk);
      const text = chunk.toString();
      if (text.includes('EADDRINUSE') || text.includes('address already in use')) {
        isPortConflict = true;
      }
    });

    for (const line of inputBuffer) forwardToChild(line);

    const output = readline.createInterface({ input: attempt.stdout });
    output.on('line', (line) => {
      const message = parseMessage(line);
      if (!initialized) {
        if (message?.id === initializeId && message?.result?.serverInfo) {
          receivedInitializeResponse = true;
          initialized = true;
          cacheClient(cachePath, clientName);
          stderr.write(`QQ Mail local relay: using OAuth client name "${clientName}".\n`);
          if (clientRequestedProtocolVersion && message.result.protocolVersion) {
            message.result.protocolVersion = clientRequestedProtocolVersion;
            line = JSON.stringify(message);
          }
          for (const bufferedLine of preInitializationOutput) writeProtocol(bufferedLine);
          writeProtocol(line);
          inputBuffer.length = 0;
          preInitializationOutput.length = 0;
          return;
        }
        if (message?.id === initializeId && message?.error) {
          receivedInitializeResponse = true;
          const errMsg = message.error.message || JSON.stringify(message.error);
          stderr.write(`QQ Mail remote MCP initialization error: ${errMsg}\n`);
          writeProtocol(line);
          attempt.kill('SIGTERM');
          return;
        }
        preInitializationOutput.push(line);
        return;
      }

      const request = firstPhaseIds.get(message?.id);
      if (request) {
        firstPhaseIds.delete(message.id);
        const challenge = findConfirmationChallenge(message);
        if (challenge) {
          challenges.set(challenge.token, {
            summary: challenge.summary,
            toolName: request.toolName,
            expiresAt: Date.now() + 5 * 60 * 1000
          });
        }
      }
      writeProtocol(line);
    });

    attempt.once('error', (error) => {
      stderr.write(`Failed to start mcp-remote: ${error.message}\n`);
    });
    attempt.once('exit', (code, signal) => {
      output.close();
      const exitCode = signal ? 1 : (code ?? 1);
      const isAbnormalExit = Boolean(signal) || (code !== 0 && code !== null);

      if (isPortConflict) {
        stderr.write(`QQ Mail local relay: callback port ${callbackPort} is already in use.\n`);
        onExitCode(1);
        return;
      }

      if (!initialized && !receivedInitializeResponse && isAbnormalExit) {
        startNextCandidate();
        return;
      }
      onExitCode(exitCode);
    });
  }

  const input = readline.createInterface({ input: stdin });
  input.on('line', (line) => {
    const message = parseMessage(line);
    if (!message) {
      writeError(null, 'Invalid JSON-RPC message');
      return;
    }

    if (message.method === 'initialize') {
      initializeId = message.id;
      clientCapabilities = message.params?.capabilities ?? {};

      const requestedVersion = message.params?.protocolVersion;
      try {
        const negotiatedVersion = negotiateProtocolVersion(requestedVersion);
        clientRequestedProtocolVersion = requestedVersion;
        if (negotiatedVersion !== requestedVersion) {
          message.params.protocolVersion = negotiatedVersion;
          line = JSON.stringify(message);
        }
      } catch (err) {
        writeProtocol({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32602, message: err.message }
        });
        stderr.write(`QQ Mail local relay: initialization rejected - ${err.message}\n`);
        return;
      }

      if (!child) {
        inputBuffer.push(line);
        startNextCandidate();
        return;
      }
    }

    const pending = pendingElicitations.get(message.id);
    if (!message.method && pending) {
      pendingElicitations.delete(message.id);
      challenges.delete(pending.token);
      if (isConfirmedElicitationResponse(message)) {
        forwardToChild(pending.originalLine);
      } else {
        writeError(pending.originalId, 'QQ Mail write operation was not confirmed by the user');
      }
      return;
    }

    if (isSecondPhaseWriteCall(message)) {
      const token = message.params.arguments.confirmation_token;
      const challenge = challenges.get(token);
      if (!challenge || challenge.expiresAt <= Date.now()) {
        challenges.delete(token);
        writeError(
          message.id,
          'No valid Tencent confirmation challenge was observed. Start the write operation again without confirmation_token.'
        );
        return;
      }
      if (!hasElicitationCapability(clientCapabilities)) {
        writeError(
          message.id,
          'This MCP client does not support elicitation, so the QQ Mail write operation was blocked.'
        );
        return;
      }
      const elicitationId = `qqmail-confirm-${process.pid}-${Date.now()}-${message.id}`;
      pendingElicitations.set(elicitationId, {
        originalId: message.id,
        originalLine: line,
        token
      });
      writeProtocol(buildConfirmationElicitation(elicitationId, challenge.summary));
      return;
    }

    if (
      message.method === 'tools/call' &&
      isWriteTool(message.params?.name) &&
      message.params?.arguments?.confirmation_token === undefined
    ) {
      firstPhaseIds.set(message.id, { toolName: message.params.name });
    }

    if (!initialized) inputBuffer.push(line);
    forwardToChild(line);
  });
  input.once('close', () => child?.stdin?.end());

  if (handleSignals) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => child?.kill(signal));
    }
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isDirectExecution()) {
  const [command] = process.argv.slice(2);
  if (command === '--help' || command === '-h') {
    process.stdout.write(HELP);
  } else if (command === '--print-config') {
    process.stdout.write(`${JSON.stringify(buildStdioConfig(), null, 2)}\n`);
  } else if (command) {
    process.stderr.write(`Unknown option: ${command}\n\n${HELP}`);
    process.exitCode = 2;
  } else {
    try {
      assertNoV1Environment(process.env);
      resolveCallbackPort(process.env.QQMAIL_OAUTH_CALLBACK_PORT);
      runRelay();
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
      process.exitCode = 1;
    }
  }
}
