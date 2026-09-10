#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  assertNoV1Environment,
  buildStdioConfig,
  prepareCredentialDir,
  resolveCallbackPort
} from '../src/config.js';
import { createProtocolAdapter } from '../src/protocol-adapter.js';
import { createUpstreamSupervisor } from '../src/upstream-supervisor.js';
import { createWriteConfirmation } from '../src/write-confirmation.js';

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

function parseMessage(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
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

  const protocolAdapter = createProtocolAdapter();
  const writeConfirmation = createWriteConfirmation({ pid: process.pid });
  const preInitializationOutput = [];
  let started = false;
  let input;

  const supervisor = createUpstreamSupervisor({
    stateRoot,
    env,
    callbackPort,
    explicitName: env.QQMAIL_OAUTH_CLIENT_NAME,
    spawnFn,
    onStderr: (chunk) => stderr.write(chunk),
    onPortConflict: (portMsg) => {
      if (!supervisor.initialized && protocolAdapter.initializeId !== null) {
        writeError(protocolAdapter.initializeId, `QQ Mail local relay: ${portMsg} is already in use.`);
      }
    },
    onAllCandidatesFailed: () => {
      if (!supervisor.initialized && protocolAdapter.initializeId !== null) {
        writeError(
          protocolAdapter.initializeId,
          'QQ Mail OAuth registration failed for every allowed client name'
        );
      }
    },
    onExit: (code) => {
      input?.close();
      onExitCode(code);
    },
    onLine: (line) => {
      const message = parseMessage(line);
      if (!supervisor.initialized) {
        if (message?.id === protocolAdapter.initializeId && message?.result?.serverInfo) {
          supervisor.handleInitializeSuccess();
          const adapted = protocolAdapter.adaptOutbound(message);
          const finalLine = adapted.adaptedLine || JSON.stringify(adapted.message);
          for (const bufferedLine of preInitializationOutput) {
            writeProtocol(bufferedLine);
          }
          writeProtocol(finalLine);
          preInitializationOutput.length = 0;
          return;
        }
        if (message?.id === protocolAdapter.initializeId && message?.error) {
          const errMsg = message.error.message || JSON.stringify(message.error);
          supervisor.handleInitializeError(errMsg);
          writeProtocol(line);
          return;
        }
        preInitializationOutput.push(line);
        return;
      }

      writeConfirmation.interceptOutbound(message);
      writeProtocol(line);
    }
  });

  input = readline.createInterface({ input: stdin });
  input.on('line', (line) => {
    const message = parseMessage(line);
    if (!message) {
      writeError(null, 'Invalid JSON-RPC message');
      return;
    }

    if (message.method === 'initialize') {
      writeConfirmation.setClientCapabilities(message.params?.capabilities);
      const adapted = protocolAdapter.adaptInbound(message);
      if (adapted.error) {
        writeProtocol({
          jsonrpc: '2.0',
          id: message.id,
          error: adapted.error
        });
        stderr.write(`QQ Mail local relay: initialization rejected - ${adapted.error.message}\n`);
        return;
      }

      line = adapted.adaptedLine || JSON.stringify(adapted.message);
      if (!started) {
        started = true;
        supervisor.start();
      }
      supervisor.send(line);
      return;
    }

    const action = writeConfirmation.interceptInbound(message, line);
    switch (action.action) {
      case 'elicit':
        writeProtocol(action.elicitationMessage);
        return;
      case 'error':
        writeError(action.originalId, action.error.message);
        return;
      case 'forward_confirmed':
        supervisor.send(action.originalLine);
        return;
      case 'reject_unconfirmed':
        writeError(action.originalId, action.error.message);
        return;
      case 'pass':
      default:
        supervisor.send(line);
        return;
    }
  });

  input.once('close', () => supervisor.activeChild?.stdin?.end());

  if (handleSignals) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => supervisor.kill(signal));
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
