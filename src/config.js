import { chmodSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const OFFICIAL_MCP_URL = 'https://api.mail.qq.com/mcp';
export const FULL_SCOPE = 'alias:read mail:read mail:send mail:delete';
export const SUPPORTED_FALLBACK_NAMES = Object.freeze(['Codex', 'Claude', 'WorkBuddy']);

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

export function buildRemoteArgs({ clientName = resolveClientName() } = {}) {
  const resolvedName = resolveClientName(clientName);
  return [
    OFFICIAL_MCP_URL,
    '--transport',
    'http-only',
    '--static-oauth-client-metadata',
    JSON.stringify({ client_name: resolvedName, scope: FULL_SCOPE })
  ];
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
