import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  createProtocolAdapter
} from '../src/protocol-adapter.js';

test('negotiateProtocolVersion adapts 2024-11-05 and 2025-11-25 to 2025-03-26 and throws on invalid', () => {
  assert.equal(TARGET_PROTOCOL_VERSION, '2025-03-26');
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, ['2025-11-25', '2025-03-26', '2024-11-05']);
  assert.equal(negotiateProtocolVersion('2024-11-05'), '2025-03-26');
  assert.equal(negotiateProtocolVersion('2025-11-25'), '2025-03-26');
  assert.equal(negotiateProtocolVersion('2025-03-26'), '2025-03-26');
  assert.throws(() => negotiateProtocolVersion('2023-01-01'), /Unsupported protocol version/);
  assert.throws(() => negotiateProtocolVersion(undefined), /Unsupported protocol version/);
});

test('ProtocolAdapter translates inbound 2024-11-05 to 2025-03-26 and echoes in outbound response', () => {
  const adapter = createProtocolAdapter();

  const inbound = {
    jsonrpc: '2.0',
    id: 10,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' }
  };

  const adaptedInbound = adapter.adaptInbound(inbound);
  assert.equal(adaptedInbound.error, undefined);
  assert.equal(adaptedInbound.message.params.protocolVersion, '2025-03-26');
  assert.equal(JSON.parse(adaptedInbound.adaptedLine).params.protocolVersion, '2025-03-26');
  assert.equal(adapter.clientRequestedVersion, '2024-11-05');
  assert.equal(adapter.initializeId, 10);

  const outbound = {
    jsonrpc: '2.0',
    id: 10,
    result: {
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'QQMail' }
    }
  };

  const adaptedOutbound = adapter.adaptOutbound(outbound);
  assert.equal(adaptedOutbound.message.result.protocolVersion, '2024-11-05');
  assert.equal(JSON.parse(adaptedOutbound.adaptedLine).result.protocolVersion, '2024-11-05');
});

test('ProtocolAdapter rejects unsupported protocol version on inbound initialize', () => {
  const adapter = createProtocolAdapter();
  const inbound = {
    jsonrpc: '2.0',
    id: 11,
    method: 'initialize',
    params: { protocolVersion: '2023-01-01' }
  };

  const adaptedInbound = adapter.adaptInbound(inbound);
  assert.notEqual(adaptedInbound.error, undefined);
  assert.equal(adaptedInbound.error.code, -32602);
  assert.match(adaptedInbound.error.message, /Unsupported protocol version "2023-01-01"/);
});

test('ProtocolAdapter passes non-initialize messages untouched', () => {
  const adapter = createProtocolAdapter();
  const ping = { jsonrpc: '2.0', id: 12, method: 'ping' };
  const adapted = adapter.adaptInbound(ping);
  assert.equal(adapted.error, undefined);
  assert.equal(adapted.adaptedLine, undefined);
  assert.deepEqual(adapted.message, ping);
});
