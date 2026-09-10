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
