import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  FULL_SCOPE,
  OFFICIAL_MCP_URL,
  SUPPORTED_FALLBACK_NAMES,
  assertNoV1Environment,
  buildClientCandidates,
  buildRemoteArgs,
  getClientCredentialDir,
  prepareCredentialDir,
  resolveCallbackPort,
  resolveClientName
} from '../src/config.js';
import {
  TARGET_PROTOCOL_VERSION,
  buildConfirmationElicitation,
  findConfirmationChallenge,
  hasElicitationCapability,
  isConfirmedElicitationResponse,
  isSecondPhaseWriteCall,
  isWriteTool,
  negotiateProtocolVersion
} from '../src/relay-policy.js';

test('uses the official QQ Mail remote MCP endpoint and complete scope set', () => {
  assert.equal(OFFICIAL_MCP_URL, 'https://api.mail.qq.com/mcp');
  assert.equal(FULL_SCOPE, 'alias:read mail:read mail:send mail:delete');
});

test('local relay credential directory is isolated with owner-only permissions', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qqmail-mcp-credentials-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const credentialDir = prepareCredentialDir(path.join(root, 'oauth'), root);
  assert.equal((await stat(credentialDir)).mode & 0o777, 0o700);
});

test('local relay only permits verified allow-list fallback names', () => {
  assert.deepEqual(SUPPORTED_FALLBACK_NAMES, ['Codex', 'Claude', 'WorkBuddy']);
  assert.equal(resolveClientName(undefined), 'Codex');
  assert.equal(resolveClientName('Claude'), 'Claude');
  assert.throws(() => resolveClientName('codex'), /Codex, Claude, WorkBuddy/);
  assert.throws(() => resolveClientName('Gemini'), /Codex, Claude, WorkBuddy/);
});

test('automatic fallback uses the verified order and respects an explicit or cached choice', () => {
  assert.deepEqual(buildClientCandidates({}), ['Codex', 'Claude', 'WorkBuddy']);
  assert.deepEqual(buildClientCandidates({ cachedName: 'Claude' }), ['Claude']);
  assert.deepEqual(buildClientCandidates({ cachedName: 'tampered' }), [
    'Codex',
    'Claude',
    'WorkBuddy'
  ]);
  assert.deepEqual(buildClientCandidates({ explicitName: 'WorkBuddy', cachedName: 'Codex' }), [
    'WorkBuddy'
  ]);
});

test('OAuth state is isolated by fallback client name', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qqmail-mcp-identities-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(getClientCredentialDir(root, 'Codex'), path.join(root, 'codex'));
  assert.equal(getClientCredentialDir(root, 'Claude'), path.join(root, 'claude'));
  assert.notEqual(getClientCredentialDir(root, 'Codex'), getClientCredentialDir(root, 'Claude'));
});

test('relay arguments preserve the upstream tool surface and force streamable HTTP', () => {
  const args = buildRemoteArgs({ clientName: 'WorkBuddy' });
  assert.equal(args[0], OFFICIAL_MCP_URL);
  assert.deepEqual(args.slice(1, 3), ['--transport', 'http-only']);
  const metadataIndex = args.indexOf('--static-oauth-client-metadata');
  assert.notEqual(metadataIndex, -1);
  const metadata = JSON.parse(args[metadataIndex + 1]);
  assert.equal(metadata.client_name, 'WorkBuddy');
  assert.equal(metadata.scope, FULL_SCOPE);
});

test('package no longer ships IMAP, password, or local mail parsing dependencies', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const serialized = JSON.stringify(packageJson).toLowerCase();
  for (const forbidden of ['imapflow', 'mailparser', 'qqmail_pass', 'qqmail_user']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test('connector manifest points directly at the official service', async () => {
  const manifest = JSON.parse(await readFile(new URL('../mcp.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest, {
    mcpServers: {
      'qq-mail': {
        timeout: 600,
        url: OFFICIAL_MCP_URL
      }
    }
  });
});

test('public documentation follows the reviewed official-tool snapshot', async () => {
  const documents = await Promise.all([
    readFile(new URL('../skills/qq-mail/SKILL.md', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../README.zh-CN.md', import.meta.url), 'utf8')
  ]);
  const snapshot = JSON.parse(
    await readFile(new URL('../official-tools.json', import.meta.url), 'utf8')
  );
  assert.equal(snapshot.source, OFFICIAL_MCP_URL);
  for (const document of documents) {
    for (const tool of snapshot.tools) assert.match(document, new RegExp(`\\b${tool}\\b`));
  }
  const [skill] = documents;
  assert.match(skill, /GetMe.*first/is);
  assert.match(skill, /42801/);
  assert.match(skill, /confirmation_token/);
});

test('write-token replay requires an MCP elicitation confirmation', () => {
  const call = {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'SendMessage',
      arguments: { alias_id: 'a', to: ['x@example.com'], confirmation_token: 'token-1' }
    }
  };
  assert.equal(isSecondPhaseWriteCall(call), true);
  assert.equal(hasElicitationCapability({ elicitation: {} }), true);
  assert.equal(hasElicitationCapability({}), false);

  const challenge = findConfirmationChallenge({
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 42801,
            confirmation_token: 'token-1',
            operation_summary: '发送给 x@example.com'
          })
        }
      ]
    }
  });
  assert.deepEqual(challenge, {
    token: 'token-1',
    summary: '发送给 x@example.com'
  });

  const elicitation = buildConfirmationElicitation('confirm-1', challenge.summary);
  assert.equal(elicitation.method, 'elicitation/create');
  assert.match(elicitation.params.message, /发送给 x@example\.com/);
  assert.equal(
    isConfirmedElicitationResponse({
      id: 'confirm-1',
      result: { action: 'accept', content: { confirmed: true } }
    }),
    true
  );
  assert.equal(
    isConfirmedElicitationResponse({ id: 'confirm-1', result: { action: 'accept' } }),
    false
  );
  assert.equal(
    isConfirmedElicitationResponse({ id: 'confirm-1', result: { action: 'decline' } }),
    false
  );
});

test('destructive write tools include PermanentDeleteMessage and ClearTrash', () => {
  assert.equal(isWriteTool('PermanentDeleteMessage'), true);
  assert.equal(isWriteTool('ClearTrash'), true);
  assert.equal(isWriteTool('SendMessage'), true);
  assert.equal(isWriteTool('DeleteMessage'), true);
  assert.equal(isWriteTool('ListMessages'), false);

  const deletePermanentCall = {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'PermanentDeleteMessage',
      arguments: { message_id: 'm1', confirmation_token: 'token-del' }
    }
  };
  assert.equal(isSecondPhaseWriteCall(deletePermanentCall), true);

  const clearTrashCall = {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'ClearTrash',
      arguments: { confirmation_token: 'token-clear' }
    }
  };
  assert.equal(isSecondPhaseWriteCall(clearTrashCall), true);
});

test('validates and resolves OAuth callback port', () => {
  assert.equal(resolveCallbackPort(undefined), undefined);
  assert.equal(resolveCallbackPort(''), undefined);
  assert.equal(resolveCallbackPort('8080'), 8080);
  assert.equal(resolveCallbackPort(3000), 3000);
  assert.equal(resolveCallbackPort('1'), 1);
  assert.equal(resolveCallbackPort('65535'), 65535);

  assert.throws(() => resolveCallbackPort('0'), /valid port number/);
  assert.throws(() => resolveCallbackPort('65536'), /valid port number/);
  assert.throws(() => resolveCallbackPort('-1'), /valid port number/);
  assert.throws(() => resolveCallbackPort('not-a-port'), /valid port number/);
  assert.throws(() => resolveCallbackPort('80.5'), /valid port number/);

  const argsWithPort = buildRemoteArgs({ clientName: 'Codex', callbackPort: 8080 });
  assert.equal(argsWithPort[0], OFFICIAL_MCP_URL);
  assert.equal(argsWithPort[1], '8080');
  assert.equal(argsWithPort[2], '--transport');

  const argsWithoutPort = buildRemoteArgs({ clientName: 'Codex' });
  assert.equal(argsWithoutPort[0], OFFICIAL_MCP_URL);
  assert.equal(argsWithoutPort[1], '--transport');
});

test('rejects v1 plain-text credentials and guides users to OAuth', () => {
  assert.doesNotThrow(() => assertNoV1Environment({}));
  assert.throws(
    () => assertNoV1Environment({ QQMAIL_USER: 'user@qq.com' }),
    /QQ Mail MCP v2 uses Tencent official OAuth.*QQMAIL_USER/
  );
  assert.throws(
    () => assertNoV1Environment({ QQMAIL_PASS: 'auth-code' }),
    /QQ Mail MCP v2 uses Tencent official OAuth.*QQMAIL_PASS/
  );
  assert.throws(
    () => assertNoV1Environment({ QQMAIL_USER: 'user@qq.com', QQMAIL_PASS: 'auth-code' }),
    /QQ Mail MCP v2 uses Tencent official OAuth/
  );
});

test('negotiates protocol version: adapts 2024-11-05 to 2025-03-26 and fails on unknown versions', () => {
  assert.equal(TARGET_PROTOCOL_VERSION, '2025-03-26');
  assert.equal(negotiateProtocolVersion('2025-03-26'), '2025-03-26');
  assert.equal(negotiateProtocolVersion('2024-11-05'), '2025-03-26');
  assert.throws(() => negotiateProtocolVersion('2023-01-01'), /Unsupported protocol version/);
  assert.throws(() => negotiateProtocolVersion(''), /Unsupported protocol version/);
  assert.throws(() => negotiateProtocolVersion(undefined), /Unsupported protocol version/);
});
