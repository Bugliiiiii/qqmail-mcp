import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('CLI prints an unpinned stdio configuration for local-only fallback clients', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['bin/qqmail-mcp.js', '--print-config']);
  const config = JSON.parse(stdout);
  assert.deepEqual(config, {
    mcpServers: {
      'qq-mail': {
        command: 'npx',
        args: ['-y', '@ethanli666/qqmail-mcp']
      }
    }
  });
});

test('CLI exits with error and migration guidance when v1 credentials are provided', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['bin/qqmail-mcp.js'], {
      env: { ...process.env, QQMAIL_USER: 'test@qq.com' },
      timeout: 1500
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /QQ Mail MCP v2 uses Tencent official OAuth/);
      return true;
    }
  );
});

test('CLI exits with error when invalid callback port is provided', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['bin/qqmail-mcp.js'], {
      env: { ...process.env, QQMAIL_OAUTH_CALLBACK_PORT: 'invalid' },
      timeout: 1500
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /valid port number/);
      return true;
    }
  );
});

test('CLI executes properly through symlinks (like npx)', async (t) => {
  const { mkdtemp, rm, symlink } = await import('node:fs/promises');
  const os = (await import('node:os')).default;
  const path = (await import('node:path')).default;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-symlink-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));
  const linkPath = path.join(tmpDir, 'qqmail-symlink.js');
  await symlink(path.resolve('bin/qqmail-mcp.js'), linkPath);
  const { stdout } = await execFileAsync(process.execPath, [linkPath, '--print-config']);
  const config = JSON.parse(stdout);
  assert.equal(config.mcpServers['qq-mail'].command, 'npx');
});
