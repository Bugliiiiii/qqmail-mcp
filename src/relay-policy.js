const WRITE_TOOLS = new Set([
  'SendMessage',
  'ReplyMessage',
  'ForwardMessage',
  'DeleteMessage'
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

function inspect(value, inheritedCode) {
  if (typeof value === 'string') {
    try {
      return inspect(JSON.parse(value), inheritedCode);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = inspect(item, inheritedCode);
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
    const found = inspect(child, code);
    if (found) return found;
  }
  return null;
}

export function findConfirmationChallenge(message) {
  return inspect(message, undefined);
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
