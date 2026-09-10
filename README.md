# QQ Mail MCP (@ethanli666/qqmail-mcp)

English | [简体中文](README.zh-CN.md)

Connect your AI assistant (Claude Desktop, Cursor, Google Antigravity, etc.) safely and seamlessly to Tencent QQ Mail.

---

## About the Project

### What is QQ Mail MCP?

Tencent officially operates a Remote MCP service (`https://api.mail.qq.com/mcp`) over Streamable HTTP, offering full agentic capabilities for email composition, searching, and mailbox management.

**`@ethanli666/qqmail-mcp`** is a **transparent protocol adapter and safety relay** designed specifically for local MCP clients. Most desktop MCP clients (such as Claude Desktop, Cursor, Antigravity) communicate via standard I/O (stdio) with local subprocesses, while Tencent cloud enforces strict OAuth client-name admission and specific protocol version requirements.

This project serves as an intelligent bridge between local AI agents and Tencent official servers, resolving protocol negotiation, client admission, and execution safety:

- **Zero Local Passwords**: No IMAP/SMTP passwords or authorization codes are ever required or stored. Authorization is completed securely through official Tencent OAuth 2.0 web and mobile QR code scanning.
- **Out-of-the-Box Protocol Adaptation**: Built-in bidirectional protocol translation automatically bridges legacy client protocols (`2024-11-05`, `2025-11-25`) with Tencent official `2025-03-26`, preventing version negotiation failures.
- **Whitelist Candidate Rotation**: Automatically cycles through verified OAuth client identities (`Codex` -> `Claude` -> `WorkBuddy`), saving the working client for instant, zero-delay subsequent boots.
- **Persistent Silent Credentials**: Once authorized, tokens are stored securely in your local directory (`~/.qqmail-mcp/`, dir mode `0700`, token mode `0600`). Future sessions reuse credentials automatically without re-scanning.
- **Two-Phase Write Safety**: High-risk write operations (sending, deleting, emptying trash) are intercepted via Tencent official `42801` challenge and presented as an interactive MCP Elicitation card for user confirmation, eliminating agent hallucinations.
- **Full Tool Surface**: Transparently proxies all 12 official Tencent mail tools, preserving upstream schemas and parameters.

### System Architecture

![QQ Mail MCP Architecture](docs/assets/architecture.svg)

---

## Quick Start

Get your AI agent managing your QQ Mail inbox in three simple steps.

### Step 1: Configure Your Client

Add the stdio relay configuration to your MCP client.

#### Claude Desktop
Configuration path:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "qq-mail": {
      "command": "npx",
      "args": ["-y", "@ethanli666/qqmail-mcp@latest"]
    }
  }
}
```

#### Cursor / Google Antigravity / Other Stdio Clients
Add the server in your client settings:
- **Command**: `npx`
- **Args**: `-y @ethanli666/qqmail-mcp@latest`

> Tip: Run `npx -y @ethanli666/qqmail-mcp --print-config` in your terminal to inspect the standard JSON configuration.

#### Clients with Native Remote OAuth Support (Optional)
If your client natively supports Streamable HTTP endpoints and OAuth flow, connect directly to Tencent official servers:
- **Codex CLI**:
  ```bash
  codex mcp add qqmail --url https://api.mail.qq.com/mcp
  codex mcp login qqmail --scopes alias:read,mail:read,mail:send,mail:delete
  ```
- **Claude Code**:
  ```bash
  claude mcp add --transport http qq-mail https://api.mail.qq.com/mcp
  ```
- **WorkBuddy / Connector Manifest**: Reference [`mcp.json`](mcp.json) directly.

---

### Step 2: First-Time Authorization & QR Code Scan

After configuration, complete a one-time authorization using Mobile QQ.

1. **Trigger Authorization**:
   - Run a pre-check directly in your terminal:
     ```bash
     npx -y @ethanli666/qqmail-mcp
     ```
   - Or start your MCP client (such as Claude Desktop) and ask any mail-related query.

2. **Browser Opens Automatically**:
   - The relay automatically launches your default browser to Tencent official OAuth login page (listening on local callback port `39300` by default).
   - If the browser does not open automatically, copy and open the link printed in the terminal logs.

3. **Scan with Mobile QQ**:
   - The page displays "QQ Mail Agent Login Authorization" with a QR code.
   - Open Mobile QQ, tap the "+" in the top right, select "Scan", and scan the QR code (or log in directly on the page).
   - Review the requested permissions (read aliases, read messages, send messages, delete messages), then tap **Confirm Authorization**.

4. **Authorized and Silently Cached**:
   - The webpage confirms successful authorization, and you can close the browser.
   - Credentials are encrypted and saved under `~/.qqmail-mcp/`.
   - **One-time authorization**: Subsequent sessions reload the cached token automatically with no further QR scans.

---

### Step 3: Start Conversing with Your Agent

With setup complete, talk directly to your agent in your client:

```markdown
- "Show me my latest 5 unread emails"
- "Search for notification emails from GitHub this week and summarize them"
- "Download the Excel attachment from the latest financial report email"
- "Draft a reply to Alice (alice@example.com) confirming tomorrow's 2 PM meeting"
```

When the agent attempts to reply, send, or delete messages, an interactive confirmation dialog will prompt you to verify the operation before execution.

---

## Features & Official Tools

Tencent official service exposes 12 mailbox management tools:

| Tool | Type | Description |
| --- | --- | --- |
| `GetMe` | Read | Retrieves authorized mailbox aliases, active scopes, limits, and attachment size rules (recommended first call) |
| `ListMessages` | Read | Lists and filters messages in inbox, sent, drafts, trash, or spam |
| `GetMessage` | Read | Retrieves full message body (HTML and plain text) with metadata |
| `SearchMessages` | Read | Searches messages by keyword, sender, recipient, date, or folder |
| `ListAttachments` | Read | Lists attachment metadata and sizes for a message |
| `DownloadAttachment` | Read | Downloads Base64 encoded attachment content |
| `SendMessage` | Write | Composes and sends an email (requires user confirmation) |
| `ReplyMessage` | Write | Replies to an existing message (requires user confirmation) |
| `ForwardMessage` | Write | Forwards a message to recipients (requires user confirmation) |
| `DeleteMessage` | Write | Moves a message to the trash folder (requires user confirmation) |
| `PermanentDeleteMessage` | Write | Permanently deletes a message with no recovery (requires user confirmation) |
| `ClearTrash` | Write | Clears all messages in the trash folder (requires user confirmation) |

> Note: All tool schemas, arguments, and validations are served dynamically by Tencent at runtime. This package does not modify any tool interface.

---

## Safety & Two-Phase Confirmation

### 1. Zero Local Passwords
No mailbox passwords or authorization codes are ever stored, processed, or transmitted by this package. All tokens are minted directly by Tencent OAuth.

### 2. Two-Phase Write Safety (Elicitation)
To prevent accidental actions or hallucinations by AI agents, Tencent enforces a two-phase challenge on write operations:
- When an agent first invokes a write tool (such as `SendMessage`, `DeleteMessage`, or `ClearTrash`), Tencent returns error code `42801` containing an operation summary and a single-use token.
- This relay intercepts the challenge and displays an interactive confirmation dialog (via standard MCP `elicitation/create`).
- Only when the user inspects and confirms the action does the relay replay the call with the confirmation token. If declined or expired after 5 minutes, the operation is blocked.

---

## Environment Variables

Default settings work for almost all environments. Advanced configurations are available:

| Variable | Default | Purpose |
| --- | --- | --- |
| `QQMAIL_OAUTH_CLIENT_NAME` | Auto-detect | Forces a verified client name (`Codex`, `Claude`, `WorkBuddy`) |
| `QQMAIL_OAUTH_CALLBACK_PORT` | `39300` | Sets a fixed local port for OAuth redirects if conflicts occur |
| `MCP_REMOTE_CONFIG_DIR` | `~/.qqmail-mcp` | Customizes local OAuth state directory |

---

## Migrating from 1.x

Version 1.x relied on `QQMAIL_USER`, `QQMAIL_PASS`, and direct IMAP connections. Version 2.x removes all IMAP support.
- If `QQMAIL_USER` or `QQMAIL_PASS` are detected in your environment, the relay halts immediately to avoid credential leakage.
- Remove legacy credentials from your client config and use the stdio configuration above.

---

## Development

```bash
# Install dependencies
npm install

# Run checks and tests
npm test

# Verify npm packaging
npm pack --dry-run
```

---

## Disclaimer

This repository is an independent open-source connector. QQ Mail, the remote MCP service, and related trademarks are owned by Tencent.
