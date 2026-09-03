import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.env.QQMAIL_MCP_COMMAND || process.execPath,
  args: process.env.QQMAIL_MCP_ARGS ? JSON.parse(process.env.QQMAIL_MCP_ARGS) : ['src/index.js'],
  env: {
    ...process.env,
    QQMAIL_USER: 'smoke-test@qq.com',
    QQMAIL_PASS: 'not-a-real-secret'
  }
});
const client = new Client({ name: 'qqmail-smoke-test', version: '1.0.0' });

try {
  await client.connect(transport);
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'qqmail_connection_status',
    'qqmail_download_attachment',
    'qqmail_get_message',
    'qqmail_get_snippet',
    'qqmail_list_attachments',
    'qqmail_list_new_messages'
  ]);
  const tools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));
  assert.equal(tools.qqmail_get_message.annotations.readOnlyHint, true);
  assert.equal(tools.qqmail_get_message.annotations.destructiveHint, false);
  assert.equal(tools.qqmail_get_message.annotations.idempotentHint, true);
  assert.equal(tools.qqmail_get_message.annotations.openWorldHint, true);
  assert.equal(tools.qqmail_download_attachment.annotations.readOnlyHint, false);
  assert.equal(tools.qqmail_download_attachment.annotations.destructiveHint, false);
  assert.equal(tools.qqmail_download_attachment.annotations.idempotentHint, false);
  console.log(`MCP smoke test passed: ${names.join(', ')}`);
} finally {
  await client.close();
}
