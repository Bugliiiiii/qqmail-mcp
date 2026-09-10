import { chmodSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const OFFICIAL_MCP_URL = 'https://api.mail.qq.com/mcp';
export const FULL_SCOPE = 'alias:read mail:read mail:send mail:delete';
export const SUPPORTED_FALLBACK_NAMES = Object.freeze(['Codex', 'Claude', 'WorkBuddy']);

export function assertNoV1Environment(env = process.env) {
  const hasUser = Boolean(env.QQMAIL_USER);
  const hasPass = Boolean(env.QQMAIL_PASS);
  if (hasUser || hasPass) {
    throw new Error(
      'QQ Mail MCP v2 uses Tencent official OAuth. Plain-text credentials (QQMAIL_USER, QQMAIL_PASS) are no longer supported. Please remove these environment variables and authenticate via OAuth browser login.'
    );
  }
}

export function resolveCallbackPort(value = process.env.QQMAIL_OAUTH_CALLBACK_PORT) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const port = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `QQMAIL_OAUTH_CALLBACK_PORT must be a valid port number between 1 and 65535, received: "${value}"`
    );
  }
  return port;
}

export function resolveClientName(value = process.env.QQMAIL_OAUTH_CLIENT_NAME) {
  const clientName = value || 'Codex';
  if (!SUPPORTED_FALLBACK_NAMES.includes(clientName)) {
    throw new Error(
      `QQMAIL_OAUTH_CLIENT_NAME must be one of: ${SUPPORTED_FALLBACK_NAMES.join(', ')}`
    );
  }
  return clientName;
}

export function buildClientCandidates({ explicitName, cachedName } = {}) {
  if (explicitName) return [resolveClientName(explicitName)];
  if (cachedName && SUPPORTED_FALLBACK_NAMES.includes(cachedName)) return [cachedName];
  return [...SUPPORTED_FALLBACK_NAMES];
}

export function buildRemoteArgs({
  clientName = resolveClientName(),
  callbackPort = resolveCallbackPort()
} = {}) {
  const resolvedName = resolveClientName(clientName);
  const resolvedPort = resolveCallbackPort(callbackPort);
  const args = [OFFICIAL_MCP_URL];
  if (resolvedPort !== undefined) {
    args.push(String(resolvedPort));
  }
  args.push(
    '--transport',
    'http-only',
    '--static-oauth-client-metadata',
    JSON.stringify({ client_name: resolvedName, scope: FULL_SCOPE })
  );
  return args;
}

export function buildStdioConfig() {
  return {
    mcpServers: {
      'qq-mail': {
        command: 'npx',
        args: ['-y', '@ethanli666/qqmail-mcp']
      }
    }
  };
}

export function prepareCredentialDir(
  configuredPath = process.env.MCP_REMOTE_CONFIG_DIR,
  homeDir = os.homedir()
) {
  const credentialDir = path.resolve(configuredPath || path.join(homeDir, '.qqmail-mcp'));
  mkdirSync(credentialDir, { recursive: true, mode: 0o700 });
  chmodSync(credentialDir, 0o700);
  return credentialDir;
}

export function getClientCredentialDir(rootDir, clientName) {
  const directory = path.join(rootDir, resolveClientName(clientName).toLowerCase());
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  return directory;
}
