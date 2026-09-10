import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createUpstreamSupervisor } from '../src/upstream-supervisor.js';

class MockChild extends EventEmitter {
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
    setImmediate(() => {
      this.emit('exit', null, signal);
    });
    return true;
  }
}

test('UpstreamSupervisor falls back to next candidate on abnormal exit before initialize', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'supervisor-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const spawned = [];
  function mockSpawn(command, args, options) {
    const metaIdx = args.indexOf('--static-oauth-client-metadata');
    const name = JSON.parse(args[metaIdx + 1]).client_name;
    const child = new MockChild(name, command, args, options);
    spawned.push(child);
    return child;
  }

  const supervisor = createUpstreamSupervisor({
    stateRoot: tmpDir,
    spawnFn: mockSpawn,
    mcpRemoteBin: '/mock/bin/mcp-remote'
  });

  supervisor.start();
  assert.equal(spawned.length, 1);
  assert.equal(supervisor.activeClientName, 'Codex');

  // First candidate crashes
  spawned[0].emit('exit', 1, null);

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Should rotate to Claude
  assert.equal(spawned.length, 2);
  assert.equal(supervisor.activeClientName, 'Claude');
});

test('UpstreamSupervisor halts and signals on port conflict without fallback', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'supervisor-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const spawned = [];
  function mockSpawn(command, args, options) {
    const child = new MockChild('Codex', command, args, options);
    spawned.push(child);
    return child;
  }

  let portConflictCaught = false;
  let exitCode = null;

  const supervisor = createUpstreamSupervisor({
    stateRoot: tmpDir,
    spawnFn: mockSpawn,
    mcpRemoteBin: '/mock/bin/mcp-remote',
    callbackPort: 39300,
    onPortConflict: (msg) => {
      portConflictCaught = true;
    },
    onExit: (code) => {
      exitCode = code;
    }
  });

  supervisor.start();
  spawned[0].stderr.write('listen EADDRINUSE: address already in use :::39300\n');
  spawned[0].emit('exit', 1, null);

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(portConflictCaught, true);
  assert.equal(exitCode, 1);
  assert.equal(spawned.length, 1); // No second candidate spawned
});

test('UpstreamSupervisor terminates cleanly on exit code 0 without fallback', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'supervisor-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const spawned = [];
  function mockSpawn(command, args, options) {
    const child = new MockChild('Codex', command, args, options);
    spawned.push(child);
    return child;
  }

  let exitCode = null;
  const supervisor = createUpstreamSupervisor({
    stateRoot: tmpDir,
    spawnFn: mockSpawn,
    mcpRemoteBin: '/mock/bin/mcp-remote',
    onExit: (code) => {
      exitCode = code;
    }
  });

  supervisor.start();
  spawned[0].emit('exit', 0, null);

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(exitCode, 0);
  assert.equal(spawned.length, 1);
});
