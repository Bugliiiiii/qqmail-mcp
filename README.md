# QQ Mail MCP (@ethanli666/qqmail-mcp)

English | [简体中文](README.zh-CN.md)

Empower your AI assistants (Claude Desktop, Cursor, Google Antigravity, etc.) to check emails, read full content, search messages, download attachments, and send emails safely.

No complex IMAP passwords or authorization codes needed: simply scan a QR code with Mobile QQ and get set up in under 2 minutes!

---

## What is QQ Mail MCP?

In simple terms, **this is a bridge plugin connecting your AI assistant to your QQ Mail inbox**.

Tencent has rolled out an official AI tool interface for QQ Mail. However, desktop AI software (such as Claude Desktop, Cursor, and Antigravity) cannot connect directly to Tencent web endpoints due to protocol differences and OAuth admission restrictions.

This project is a foolproof relay tool designed to solve all these headaches:
- **Zero Passwords**: No searching for or entering IMAP authorization codes. Log in securely via Tencent official OAuth QR code. Plaintext passwords are never saved locally.
- **Scan Once, Logged in Forever**: After the initial QR scan, authorization credentials are saved securely on your local machine. Future AI conversations start silently without scanning again.
- **Two-Phase Safety Guardrail**: When the AI attempts to send, delete, or empty trash, an interactive confirmation card pops up. The AI will only execute after you explicitly click approve, preventing hallucinations.
- **Complete Official Toolset**: Transparently proxies all 12 official Tencent mail tools: unread checks, full-text reading, smart search, attachment downloads, composing, and replying.

---

## 3-Step Foolproof Quick Start

Follow these 3 simple steps to get running in under 2 minutes.

### Step 1: Add Configuration to Your AI Client

Choose your AI software and paste the configuration into its setting file.

#### Client A: Claude Desktop (Most Popular)
Open your configuration file:
- **macOS**: In Finder, press `Cmd + Shift + G` and enter:
  `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: Press `Win + R`, type and enter:
  `%APPDATA%\Claude\claude_desktop_config.json`

Paste this inside the `mcpServers` object:
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

#### Client B: Cursor / Antigravity / Other Stdio Clients
In your client MCP settings panel, add a new server:
- **Name**: `qq-mail`
- **Command**: `npx`
- **Args**: `-y @ethanli666/qqmail-mcp@latest`

> Handy tip: Run `npx -y @ethanli666/qqmail-mcp --print-config` in your terminal to see the standard JSON configuration.

---

### Step 2: Scan QR Code with Mobile QQ (Only Once)

After configuring, complete authorization once:

1. **Trigger Authorization (Choose either)**:
   - **Method 1 (Recommended)**: Open terminal (or command prompt) and run:
     ```bash
     npx -y @ethanli666/qqmail-mcp
     ```
   - **Method 2**: Start your AI client (e.g. Claude Desktop) and send any email-related question to your AI (such as: "Check my emails").
2. **Browser Opens Automatically**:
   - Your default browser automatically opens Tencent official login page (listening on local callback port `39300`).
   - If the browser does not open automatically, copy the URL displayed in your terminal or client logs.
3. **Scan with Mobile QQ**:
   - The webpage displays "QQ Mail Agent Login Authorization" with a QR code.
   - Open **Mobile QQ** on your phone, tap the "+" in the top right, select "Scan", and scan the QR code on your computer screen (or log in directly on the webpage).
   - Review the requested permissions and tap **Confirm Authorization**.
4. **Setup Complete**:
   - Once the page indicates authorization was successful, close the browser tab.
   - Credentials are saved automatically under `~/.qqmail-mcp/`.
   - **No repeated scanning**: Future sessions automatically use the saved credentials.

---

### Step 3: Talk to Your AI Assistant

You can now manage your inbox through natural conversations:

```markdown
- "Show me my latest 5 unread emails"
- "Search for emails from GitHub last week and summarize the highlights"
- "Download the invoice PDF attachment from the latest bill email"
- "Draft a reply to Alice (alice@example.com) confirming attendance for tomorrow's 2 PM meeting"
```

> 💡 **Safety Reminder**: Whenever the AI tries to reply, send, or delete emails, an interactive confirmation dialog pops up displaying details. The action only takes effect after you click approve. If declined or ignored for 5 minutes, the action is automatically cancelled.

---

## Architecture & Technical Deep Dive

For developers interested in the underlying implementation:

![QQ Mail MCP Architecture](docs/assets/architecture.svg)

- **Transparent Protocol Negotiation**: Translates legacy client protocols (`2024-11-05`, `2025-11-25`) to Tencent official `2025-03-26`.
- **Client Admission Fallback**: Rotates through verified names (`Codex` -> `Claude` -> `WorkBuddy`) and caches the working candidate.
- **Two-Phase Write Interception**: Captures Tencent `42801` challenge codes and `confirmation_token`, converting them to standard MCP `elicitation/create` dialogs.

---

## Features & Official Tools

Tencent official service provides 12 mailbox management tools (calling `GetMe` first is recommended):

| Tool | Type | Description |
| --- | --- | --- |
| `GetMe` | Read | Retrieves authorized mailbox aliases, active scopes, limits, and attachment rules (recommended first call) |
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

> Note: All tool schemas and validations are dynamic from Tencent cloud. This package does not alter any official tool definitions.

---

## Environment Variables (Optional)

Default settings work out of the box. For customized setups:

| Variable | Default | Purpose |
| --- | --- | --- |
| `QQMAIL_OAUTH_CLIENT_NAME` | Auto-detect | Forces an accepted client name (`Codex`, `Claude`, `WorkBuddy`) |
| `QQMAIL_OAUTH_CALLBACK_PORT` | `39300` | Local OAuth redirect port if port conflicts occur |
| `MCP_REMOTE_CONFIG_DIR` | `~/.qqmail-mcp` | Custom path for local credential storage |

---

## Native Remote Clients (Optional)

Clients with native Streamable HTTP and OAuth support can connect directly to Tencent official endpoints:

- **Codex CLI**:
  ```bash
  codex mcp add qqmail --url https://api.mail.qq.com/mcp
  codex mcp login qqmail --scopes alias:read,mail:read,mail:send,mail:delete
  ```
- **Claude Code**:
  ```bash
  claude mcp add --transport http qq-mail https://api.mail.qq.com/mcp
  ```
- **WorkBuddy**: Reference [`mcp.json`](mcp.json) directly.

---

## Migrating from 1.x

Version 1.x used `QQMAIL_USER`, `QQMAIL_PASS`, and direct IMAP. Version 2.x completely deprecates this approach.
- If `QQMAIL_USER` or `QQMAIL_PASS` are found in your environment, the relay halts immediately to prevent credential leaks.
- Remove legacy credentials and use the configuration in Step 1.

---

## Development

```bash
# Install dependencies
npm install

# Run linters and tests
npm test

# Verify package artifact
npm pack --dry-run
```

---

## Disclaimer

This repository is an independent open-source connector. QQ Mail, the remote MCP service, and related trademarks are owned by Tencent.
