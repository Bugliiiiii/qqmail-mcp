import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWriteConfirmation,
  isWriteTool,
  isSecondPhaseWriteCall,
  hasElicitationCapability
} from '../src/write-confirmation.js';

test('isWriteTool identifies destructive and write operations', () => {
  assert.equal(isWriteTool('SendMessage'), true);
  assert.equal(isWriteTool('ReplyMessage'), true);
  assert.equal(isWriteTool('ForwardMessage'), true);
  assert.equal(isWriteTool('DeleteMessage'), true);
  assert.equal(isWriteTool('PermanentDeleteMessage'), true);
  assert.equal(isWriteTool('ClearTrash'), true);
  assert.equal(isWriteTool('ListMessages'), false);
  assert.equal(isWriteTool('GetMe'), false);
});

test('WriteConfirmation handles complete two-phase confirmation with elicitation approval', () => {
  let currentTime = 1000;
  const interceptor = createWriteConfirmation({
    ttlMs: 5000,
    now: () => currentTime,
    pid: 1234
  });
  interceptor.setClientCapabilities({ elicitation: {} });

  // Phase 1: Client calls SendMessage without token
  const firstPhaseCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'SendMessage',
      arguments: { to: ['test@example.com'], subject: 'Hi' }
    }
  };
  const res1 = interceptor.interceptInbound(firstPhaseCall);
  assert.equal(res1.action, 'pass');

  // Upstream returns 42801 challenge
  const upstreamResponse = {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 42801,
            confirmation_token: 'token-abc',
            operation_summary: '发送邮件至 test@example.com'
          })
        }
      ]
    }
  };
  const res2 = interceptor.interceptOutbound(upstreamResponse);
  assert.equal(res2.action, 'challenge_captured');
  assert.equal(interceptor.getChallengeCount(), 1);

  // Phase 2: Client calls SendMessage with confirmation_token
  const secondPhaseCall = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'SendMessage',
      arguments: {
        to: ['test@example.com'],
        subject: 'Hi',
        confirmation_token: 'token-abc'
      }
    }
  };
  const rawSecondPhaseLine = JSON.stringify(secondPhaseCall);
  const res3 = interceptor.interceptInbound(secondPhaseCall, rawSecondPhaseLine);
  assert.equal(res3.action, 'elicit');
  assert.equal(res3.elicitationMessage.method, 'elicitation/create');
  assert.match(res3.elicitationMessage.params.message, /发送邮件至 test@example\.com/);
  const elicitationId = res3.elicitationMessage.id;
  assert.equal(interceptor.getPendingElicitationCount(), 1);

  // User accepts the elicitation
  const clientElicitationResponse = {
    jsonrpc: '2.0',
    id: elicitationId,
    result: { action: 'accept', content: { confirmed: true } }
  };
  const res4 = interceptor.interceptInbound(clientElicitationResponse);
  assert.equal(res4.action, 'forward_confirmed');
  assert.equal(res4.originalId, 2);
  assert.equal(res4.originalLine, rawSecondPhaseLine);
  assert.equal(interceptor.getPendingElicitationCount(), 0);
  assert.equal(interceptor.getChallengeCount(), 0);
});

test('WriteConfirmation handles elicitation decline by user', () => {
  const interceptor = createWriteConfirmation({ pid: 1234 });
  interceptor.setClientCapabilities({ elicitation: {} });

  // Record challenge directly via 1st phase
  interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name: 'DeleteMessage', arguments: { message_id: 'm-1' } }
  });
  interceptor.interceptOutbound({
    jsonrpc: '2.0',
    id: 10,
    result: {
      content: [{ type: 'text', text: JSON.stringify({ code: 42801, confirmation_token: 'token-del' }) }]
    }
  });

  const resElicit = interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: { name: 'DeleteMessage', arguments: { confirmation_token: 'token-del' } }
  });
  assert.equal(resElicit.action, 'elicit');

  // User declines
  const resDecline = interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: resElicit.elicitationMessage.id,
    result: { action: 'decline' }
  });
  assert.equal(resDecline.action, 'reject_unconfirmed');
  assert.equal(resDecline.originalId, 11);
  assert.match(resDecline.error.message, /not confirmed/);
});

test('WriteConfirmation blocks second phase when client lacks elicitation capability', () => {
  const interceptor = createWriteConfirmation({ pid: 1234 });
  interceptor.setClientCapabilities({}); // No elicitation

  interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 20,
    method: 'tools/call',
    params: { name: 'ClearTrash', arguments: {} }
  });
  interceptor.interceptOutbound({
    jsonrpc: '2.0',
    id: 20,
    result: {
      content: [{ type: 'text', text: JSON.stringify({ code: 42801, confirmation_token: 'token-clear' }) }]
    }
  });

  const res = interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 21,
    method: 'tools/call',
    params: { name: 'ClearTrash', arguments: { confirmation_token: 'token-clear' } }
  });
  assert.equal(res.action, 'error');
  assert.equal(res.originalId, 21);
  assert.match(res.error.message, /does not support elicitation/);
});

test('WriteConfirmation rejects expired or unknown tokens', () => {
  let currentTime = 1000;
  const interceptor = createWriteConfirmation({
    ttlMs: 2000,
    now: () => currentTime,
    pid: 1234
  });
  interceptor.setClientCapabilities({ elicitation: {} });

  // Unknown token
  const resUnknown = interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 30,
    method: 'tools/call',
    params: { name: 'SendMessage', arguments: { confirmation_token: 'non-existent' } }
  });
  assert.equal(resUnknown.action, 'error');
  assert.match(resUnknown.error.message, /No valid Tencent confirmation challenge was observed/);

  // Expired token
  interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 31,
    method: 'tools/call',
    params: { name: 'SendMessage', arguments: {} }
  });
  interceptor.interceptOutbound({
    jsonrpc: '2.0',
    id: 31,
    result: {
      content: [{ type: 'text', text: JSON.stringify({ code: 42801, confirmation_token: 'token-exp' }) }]
    }
  });

  // Advance time past TTL
  currentTime = 4000;
  const resExpired = interceptor.interceptInbound({
    jsonrpc: '2.0',
    id: 32,
    method: 'tools/call',
    params: { name: 'SendMessage', arguments: { confirmation_token: 'token-exp' } }
  });
  assert.equal(resExpired.action, 'error');
  assert.match(resExpired.error.message, /No valid Tencent confirmation challenge was observed/);
});
