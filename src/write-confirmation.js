export const WRITE_TOOLS = new Set([
  'SendMessage',
  'ReplyMessage',
  'ForwardMessage',
  'DeleteMessage',
  'PermanentDeleteMessage',
  'ClearTrash'
]);

export function isWriteTool(name) {
  return WRITE_TOOLS.has(name);
}

export function isSecondPhaseWriteCall(message) {
  return (
    message?.method === 'tools/call' &&
    isWriteTool(message?.params?.name) &&
    typeof message?.params?.arguments?.confirmation_token === 'string' &&
    message.params.arguments.confirmation_token.length > 0
  );
}

export function hasElicitationCapability(capabilities) {
  return Boolean(
    capabilities &&
      Object.prototype.hasOwnProperty.call(capabilities, 'elicitation') &&
      capabilities.elicitation !== null
  );
}

function findChallengeRecursive(value, inheritedCode) {
  if (typeof value === 'string') {
    try {
      return findChallengeRecursive(JSON.parse(value), inheritedCode);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findChallengeRecursive(item, inheritedCode);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  const code = value.code ?? inheritedCode;
  if (
    Number(code) === 42801 &&
    typeof value.confirmation_token === 'string' &&
    value.confirmation_token
  ) {
    return {
      token: value.confirmation_token,
      summary:
        typeof value.operation_summary === 'string'
          ? value.operation_summary
          : JSON.stringify(value.operation_summary ?? '未提供操作摘要')
    };
  }

  for (const child of Object.values(value)) {
    const found = findChallengeRecursive(child, code);
    if (found) return found;
  }
  return null;
}

export function findConfirmationChallenge(message) {
  return findChallengeRecursive(message, undefined);
}

export function buildConfirmationElicitation(id, summary) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'elicitation/create',
    params: {
      mode: 'form',
      message: `QQ 邮箱请求执行写操作。请核对腾讯返回的操作摘要：\n\n${summary}`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirmed: {
            type: 'boolean',
            title: '我已核对并确认执行'
          }
        },
        required: ['confirmed']
      }
    }
  };
}

export function isConfirmedElicitationResponse(message) {
  return message?.result?.action === 'accept' && message?.result?.content?.confirmed === true;
}

/**
 * Creates a Write Confirmation module.
 * Encapsulates the multi-turn state machine for write tool two-phase confirmation,
 * challenge inspection, token TTL expiration, and MCP elicitation requests.
 */
export function createWriteConfirmation({
  ttlMs = 5 * 60 * 1000,
  now = () => Date.now(),
  pid = process.pid,
  clientCapabilities: initialCapabilities = {}
} = {}) {
  const challenges = new Map();
  const pendingElicitations = new Map();
  const firstPhaseIds = new Map();
  let clientCapabilities = initialCapabilities || {};

  return {
    setClientCapabilities(capabilities) {
      clientCapabilities = capabilities || {};
    },

    getClientCapabilities() {
      return clientCapabilities;
    },

    getChallengeCount() {
      return challenges.size;
    },

    getPendingElicitationCount() {
      return pendingElicitations.size;
    },

    /**
     * Intercepts an inbound client message.
     * @param {object} message Parsed JSON-RPC message
     * @param {string} [rawLine] Raw incoming JSON line
     * @returns {{
     *   action: 'pass' | 'elicit' | 'error' | 'forward_confirmed' | 'reject_unconfirmed',
     *   elicitationMessage?: object,
     *   message?: object,
     *   originalId?: any,
     *   id?: any,
     *   originalLine?: string,
     *   originalMessage?: object,
     *   error?: { code: number, message: string },
     *   reason?: string
     * }}
     */
    interceptInbound(message, rawLine) {
      if (!message) return { action: 'pass' };

      // 1. Check if this is an elicitation response from the client
      const pending = pendingElicitations.get(message.id);
      if (!message.method && pending) {
        pendingElicitations.delete(message.id);
        challenges.delete(pending.token);
        if (isConfirmedElicitationResponse(message)) {
          return {
            action: 'forward_confirmed',
            originalId: pending.originalId,
            id: pending.originalId,
            originalLine: pending.originalLine,
            originalMessage: pending.originalMessage,
            message: pending.originalMessage
          };
        }
        const err = {
          code: -32001,
          message: 'QQ Mail write operation was not confirmed by the user'
        };
        return {
          action: 'reject_unconfirmed',
          originalId: pending.originalId,
          id: pending.originalId,
          error: err,
          reason: err.message
        };
      }

      // 2. Check if this is a second-phase write tool call
      if (isSecondPhaseWriteCall(message)) {
        const token = message.params.arguments.confirmation_token;
        const challenge = challenges.get(token);
        if (!challenge || challenge.expiresAt <= now()) {
          challenges.delete(token);
          const err = {
            code: -32001,
            message:
              'No valid Tencent confirmation challenge was observed. Start the write operation again without confirmation_token.'
          };
          return {
            action: 'error',
            originalId: message.id,
            id: message.id,
            error: err,
            reason: err.message
          };
        }

        if (!hasElicitationCapability(clientCapabilities)) {
          const err = {
            code: -32001,
            message:
              'This MCP client does not support elicitation, so the QQ Mail write operation was blocked.'
          };
          return {
            action: 'error',
            originalId: message.id,
            id: message.id,
            error: err,
            reason: err.message
          };
        }

        const elicitationId = `qqmail-confirm-${pid}-${now()}-${message.id}`;
        pendingElicitations.set(elicitationId, {
          originalId: message.id,
          originalLine: rawLine || JSON.stringify(message),
          originalMessage: message,
          token
        });

        const elicitationMessage = buildConfirmationElicitation(elicitationId, challenge.summary);
        return {
          action: 'elicit',
          elicitationMessage,
          message: elicitationMessage
        };
      }

      // 3. Check if this is a first-phase write call (no token yet)
      if (
        message.method === 'tools/call' &&
        isWriteTool(message.params?.name) &&
        message.params?.arguments?.confirmation_token === undefined
      ) {
        firstPhaseIds.set(message.id, { toolName: message.params.name });
      }

      return { action: 'pass' };
    },

    /**
     * Intercepts an outbound upstream message.
     * Captures confirmation challenges returned by Tencent for first-phase write calls.
     * @param {object} message Parsed JSON-RPC message
     * @returns {{ action: 'pass' | 'challenge_captured', challenge?: object }}
     */
    interceptOutbound(message) {
      if (!message) return { action: 'pass' };

      const request = firstPhaseIds.get(message.id);
      if (request) {
        firstPhaseIds.delete(message.id);
        const challenge = findConfirmationChallenge(message);
        if (challenge) {
          challenges.set(challenge.token, {
            summary: challenge.summary,
            toolName: request.toolName,
            expiresAt: now() + ttlMs
          });
          return { action: 'challenge_captured', challenge };
        }
      }

      return { action: 'pass' };
    }
  };
}
