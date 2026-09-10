import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runRelay } from '../bin/qqmail-mcp.js';

class MockChildProcess extends EventEmitter {
  constructor(clientName, command, args, options) {
    super();
    this.clientName = clientName;
    this.command = command;
    this.args = args;
    this.options = options;
    this.stdin = new PassThrough();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.killed = false;
  }

  kill(signal = 'SIGTERM') {
    this.killed = true;
    this.killedSignal = signal;
    setImmediate(() => {
      this.emit('exit', null, signal);
    });
    return true;
  }
}

function createTestHarness(tmpDir) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdoutLines = [];
  const stderrChunks = [];
  const spawnedChildren = [];
  let exitCode;

  let stdoutBuffer = '';
  stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) stdoutLines.push(JSON.parse(line));
    }
  });

  stderr.on('data', (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  function mockSpawn(command, args, options) {
    const metadataIndex = args.indexOf('--static-oauth-client-metadata');
    let clientName = 'Unknown';
    if (metadataIndex !== -1) {
      try {
        clientName = JSON.parse(args[metadataIndex + 1]).client_name;
      } catch {
        // ignore
      }
    }
    const child = new MockChildProcess(clientName, command, args, options);
    spawnedChildren.push(child);
    return child;
  }

  return {
    stdin,
    stdout,
    stderr,
    stdoutLines,
    getStderr: () => stderrChunks.join(''),
    spawnedChildren,
    mockSpawn,
    onExitCode: (code) => {
      exitCode = code;
    },
    getExitCode: () => exitCode
  };
}

test('initialize error is forwarded to client and stderr without rotating to next client name', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const harness = createTestHarness(tmpDir);

  runRelay({
    stdin: harness.stdin,
    stdout: harness.stdout,
    stderr: harness.stderr,
    spawnFn: harness.mockSpawn,
    onExitCode: harness.onExitCode,
    handleSignals: false,
    env: { MCP_REMOTE_CONFIG_DIR: tmpDir }
  });

  assert.equal(harness.spawnedChildren.length, 1);
  const firstChild = harness.spawnedChildren[0];
  assert.equal(firstChild.clientName, 'Codex');

  // Client sends initialize request
  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} }
    }) + '\n'
  );

  // Child returns an initialize error (e.g. protocol mismatch or Tencent server error)
  firstChild.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Protocol version mismatch from Tencent' }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  // The error must be forwarded to the client stdout
  assert.equal(harness.stdoutLines.length, 1);
  assert.equal(harness.stdoutLines[0].id, 1);
  assert.equal(harness.stdoutLines[0].error.code, -32602);
  assert.match(harness.stdoutLines[0].error.message, /Protocol version mismatch/);

  // stderr must log the error
  assert.match(harness.getStderr(), /Protocol version mismatch/);

  // Must NOT spawn a second client candidate (Claude)
  assert.equal(harness.spawnedChildren.length, 1);
  assert.equal(harness.getExitCode(), 1);
});

test('child process exiting before receiving initialize response triggers fallback', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const harness = createTestHarness(tmpDir);

  runRelay({
    stdin: harness.stdin,
    stdout: harness.stdout,
    stderr: harness.stderr,
    spawnFn: harness.mockSpawn,
    onExitCode: harness.onExitCode,
    handleSignals: false,
    env: { MCP_REMOTE_CONFIG_DIR: tmpDir }
  });

  assert.equal(harness.spawnedChildren.length, 1);
  const firstChild = harness.spawnedChildren[0];
  assert.equal(firstChild.clientName, 'Codex');

  // First child crashes or exits without any initialize response
  firstChild.emit('exit', 1, null);

  await new Promise((resolve) => setTimeout(resolve, 50));

  // A second child should be spawned with fallback candidate Claude
  assert.equal(harness.spawnedChildren.length, 2);
  assert.equal(harness.spawnedChildren[1].clientName, 'Claude');
});

test('adapts protocol version 2024-11-05 to 2025-03-26 when forwarding initialize', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const harness = createTestHarness(tmpDir);

  runRelay({
    stdin: harness.stdin,
    stdout: harness.stdout,
    stderr: harness.stderr,
    spawnFn: harness.mockSpawn,
    onExitCode: harness.onExitCode,
    handleSignals: false,
    env: { MCP_REMOTE_CONFIG_DIR: tmpDir }
  });

  const child = harness.spawnedChildren[0];
  const childReceived = [];
  let buffer = '';
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) childReceived.push(JSON.parse(line));
    }
  });

  // Client sends 2024-11-05
  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 42,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(childReceived.length, 1);
  assert.equal(childReceived[0].id, 42);
  assert.equal(childReceived[0].params.protocolVersion, '2025-03-26');

  // Child returns serverInfo with protocolVersion 2025-03-26
  child.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 42,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'QQMail', version: '2.0' },
        capabilities: {}
      }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Client receives echoed 2024-11-05
  assert.equal(harness.stdoutLines.length, 1);
  assert.equal(harness.stdoutLines[0].id, 42);
  assert.equal(harness.stdoutLines[0].result.protocolVersion, '2024-11-05');
});

test('rejects unknown protocol version immediately without forwarding to child', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const harness = createTestHarness(tmpDir);

  runRelay({
    stdin: harness.stdin,
    stdout: harness.stdout,
    stderr: harness.stderr,
    spawnFn: harness.mockSpawn,
    onExitCode: harness.onExitCode,
    handleSignals: false,
    env: { MCP_REMOTE_CONFIG_DIR: tmpDir }
  });

  // Client sends unknown protocol version
  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 99,
      method: 'initialize',
      params: { protocolVersion: '2023-01-01', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(harness.stdoutLines.length, 1);
  assert.equal(harness.stdoutLines[0].id, 99);
  assert.equal(harness.stdoutLines[0].error.code, -32602);
  assert.match(harness.stdoutLines[0].error.message, /Unsupported protocol version/);
});

test('adapts protocol version 2025-11-25 when forwarding and echoes 2025-11-25 back to client', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const harness = createTestHarness(tmpDir);

  runRelay({
    stdin: harness.stdin,
    stdout: harness.stdout,
    stderr: harness.stderr,
    spawnFn: harness.mockSpawn,
    onExitCode: harness.onExitCode,
    handleSignals: false,
    env: { MCP_REMOTE_CONFIG_DIR: tmpDir }
  });

  const child = harness.spawnedChildren[0];
  const childReceived = [];
  let buffer = '';
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) childReceived.push(JSON.parse(line));
    }
  });

  // Client sends 2025-11-25
  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 55,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(childReceived.length, 1);
  assert.equal(childReceived[0].id, 55);
  // Remote child receives adapted 2025-03-26
  assert.equal(childReceived[0].params.protocolVersion, '2025-03-26');

  // Child returns serverInfo with protocolVersion 2025-03-26
  child.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 55,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'QQMail', version: '2.0' },
        capabilities: {}
      }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Client receives echoed 2025-11-25
  assert.equal(harness.stdoutLines.length, 1);
  assert.equal(harness.stdoutLines[0].id, 55);
  assert.equal(harness.stdoutLines[0].result.protocolVersion, '2025-11-25');
});
