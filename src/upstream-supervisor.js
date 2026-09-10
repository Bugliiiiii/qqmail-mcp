import { spawn } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import {
  buildClientCandidates,
  buildRemoteArgs,
  getClientCredentialDir,
  prepareCredentialDir,
  resolveCallbackPort
} from './config.js';

export function resolveMcpRemoteBin() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve('mcp-remote/package.json');
  const packageJson = require(packagePath);
  const relativeBin =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.['mcp-remote'];
  if (!relativeBin) throw new Error('The installed mcp-remote package has no mcp-remote binary');
  return path.resolve(path.dirname(packagePath), relativeBin);
}

export function readCachedClient(cachePath) {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    return typeof parsed.clientName === 'string' ? parsed.clientName : undefined;
  } catch {
    return undefined;
  }
}

export function cacheClient(cachePath, clientName) {
  writeFileSync(
    cachePath,
    `${JSON.stringify({ clientName, cachedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 }
  );
  chmodSync(cachePath, 0o600);
}

/**
 * Creates an Upstream Supervisor module.
 * Encapsulates the lifecycle, fallback rotation, port conflict handling,
 * and credential isolation of upstream mcp-remote child processes.
 */
export function createUpstreamSupervisor({
  stateRoot = prepareCredentialDir(process.env.MCP_REMOTE_CONFIG_DIR),
  env = process.env,
  callbackPort = resolveCallbackPort(env.QQMAIL_OAUTH_CALLBACK_PORT),
  explicitName = env.QQMAIL_OAUTH_CLIENT_NAME,
  spawnFn = spawn,
  execPath = process.execPath,
  mcpRemoteBin,
  onLine = () => {},
  onStderr = (chunk) => process.stderr.write(chunk),
  onError = () => {},
  onPortConflict = () => {},
  onAllCandidatesFailed = () => {},
  onExit = () => {}
} = {}) {
  const cachePath = path.join(stateRoot, 'selected-client.json');
  const cachedName = explicitName ? undefined : readCachedClient(cachePath);
  const candidates = buildClientCandidates({ explicitName, cachedName });

  let candidateIndex = 0;
  let activeChild = null;
  let activeClientName = null;
  let outputReader = null;
  let isPortConflict = false;
  let initialized = false;
  let receivedInitializeResponse = false;
  const inputBuffer = [];

  function terminate(code) {
    if (outputReader) {
      outputReader.close();
      outputReader = null;
    }
    if (activeChild && !activeChild.killed) {
      try {
        activeChild.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    onExit(code);
  }

  function forwardToChild(line) {
    if (activeChild?.stdin?.writable) {
      activeChild.stdin.write(`${line}\n`);
    }
  }

  function startNextCandidate() {
    if (candidateIndex >= candidates.length) {
      onStderr('QQ Mail OAuth registration failed for every allowed client name.\n');
      onAllCandidatesFailed();
      terminate(1);
      return null;
    }

    const clientName = candidates[candidateIndex++];
    activeClientName = clientName;
    const credentialDir = getClientCredentialDir(stateRoot, clientName);
    onStderr(`QQ Mail local relay: trying OAuth client name "${clientName}".\n`);

    isPortConflict = false;
    const binPath = mcpRemoteBin || resolveMcpRemoteBin();
    const args = [binPath, ...buildRemoteArgs({ clientName, callbackPort })];

    const child = spawnFn(execPath, args, {
      env: { ...env, MCP_REMOTE_CONFIG_DIR: credentialDir },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    activeChild = child;

    child.stderr?.on('data', (chunk) => {
      onStderr(chunk);
      const text = chunk.toString();
      if (text.includes('EADDRINUSE') || text.includes('address already in use')) {
        isPortConflict = true;
      }
    });

    for (const bufferedLine of inputBuffer) {
      forwardToChild(bufferedLine);
    }

    outputReader = readline.createInterface({ input: child.stdout });
    outputReader.on('line', (line) => {
      onLine(line, activeClientName);
    });

    child.once('error', (error) => {
      onStderr(`Failed to start mcp-remote: ${error.message}\n`);
      onError(error);
    });

    child.once('exit', (code, signal) => {
      if (outputReader) {
        outputReader.close();
        outputReader = null;
      }

      const exitCode = signal ? 1 : (code ?? 1);
      const isAbnormalExit = Boolean(signal) || (code !== 0 && code !== null);

      if (isPortConflict) {
        const portMsg = callbackPort ? `callback port ${callbackPort}` : 'OAuth callback port';
        onStderr(`QQ Mail local relay: ${portMsg} is already in use.\n`);
        onPortConflict(portMsg);
        terminate(1);
        return;
      }

      if (!initialized && !receivedInitializeResponse && isAbnormalExit) {
        startNextCandidate();
        return;
      }

      terminate(exitCode);
    });

    return child;
  }

  return {
    get initialized() {
      return initialized;
    },
    get activeClientName() {
      return activeClientName;
    },
    get activeChild() {
      return activeChild;
    },
    get candidates() {
      return [...candidates];
    },

    start() {
      return startNextCandidate();
    },

    send(line) {
      if (!initialized) {
        inputBuffer.push(line);
      }
      forwardToChild(line);
    },

    handleInitializeSuccess(clientName = activeClientName) {
      initialized = true;
      receivedInitializeResponse = true;
      inputBuffer.length = 0;
      cacheClient(cachePath, clientName);
      onStderr(`QQ Mail local relay: using OAuth client name "${clientName}".\n`);
    },

    handleInitializeError(errMsg) {
      receivedInitializeResponse = true;
      onStderr(`QQ Mail remote MCP initialization error: ${errMsg}\n`);
      activeChild?.kill('SIGTERM');
    },

    kill(signal = 'SIGTERM') {
      return activeChild?.kill(signal);
    },

    terminate
  };
}
