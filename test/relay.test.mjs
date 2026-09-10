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

  // Client sends initialize request to trigger child spawn
  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(harness.spawnedChildren.length, 1);
  const firstChild = harness.spawnedChildren[0];
  assert.equal(firstChild.clientName, 'Codex');

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

  // Client sends initialize request to trigger candidate spawn
  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

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

for (const version of ['2024-11-05', '2025-11-25']) {
  test(`adapts protocol version ${version} when forwarding and echoes ${version} back to client`, async (t) => {
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

    // Client sends initialize with requested version
    harness.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'initialize',
        params: { protocolVersion: version, capabilities: {} }
      }) + '\n'
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(harness.spawnedChildren.length, 1);
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

    // Client receives echoed requested version
    assert.equal(harness.stdoutLines.length, 1);
    assert.equal(harness.stdoutLines[0].id, 42);
    assert.equal(harness.stdoutLines[0].result.protocolVersion, version);
  });
}

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
  // Must not spawn any child or start OAuth when protocol version is invalid
  assert.equal(harness.spawnedChildren.length, 0);
});

test('does not fallback when child process exits cleanly with code 0 before initialize', async (t) => {
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

  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  const child = harness.spawnedChildren[0];
  // Child exits cleanly without outputting initialize response
  child.emit('exit', 0, null);

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Must not trigger fallback to next candidate
  assert.equal(harness.spawnedChildren.length, 1);
  assert.equal(harness.getExitCode(), 0);
});

test('does not fallback and reports error when callback port is already in use', async (t) => {
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
    env: { MCP_REMOTE_CONFIG_DIR: tmpDir, QQMAIL_OAUTH_CALLBACK_PORT: '8080' }
  });

  harness.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {} }
    }) + '\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  const child = harness.spawnedChildren[0];
  child.stderr.write('listen EADDRINUSE: address already in use :::8080\n');
  child.emit('exit', 1, null);

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Must not fallback to next candidate on port conflict
  assert.equal(harness.spawnedChildren.length, 1);
  assert.equal(harness.getExitCode(), 1);
  assert.match(harness.getStderr(), /callback port 8080 is already in use/);
});
