# QQ Mail MCP

A portable Model Context Protocol server that gives MCP-compatible local agents read-only access to QQ Mail and Foxmail over IMAP. It uses the official STDIO transport and does not depend on Codex-specific APIs.

## Requirements

- Node.js 20 or newer
- A QQ Mail or Foxmail account with IMAP enabled
- A QQ Mail IMAP authorization code (not the account password)
- An MCP client with STDIO server support

## Tools

| Tool | Effect |
| --- | --- |
| `qqmail_connection_status` | Check the read-only IMAP connection |
| `qqmail_list_new_messages` | List recent message metadata and optional previews |
| `qqmail_get_snippet` | Read a capped plain-text preview by IMAP UID |
| `qqmail_get_message` | Read selected headers and capped plain-text content |
| `qqmail_list_attachments` | List attachment metadata without downloading bytes |
| `qqmail_download_attachment` | Save one attachment of any file type to a local directory |

All tools use standard MCP schemas and tool annotations. The five mailbox-reading tools declare `readOnlyHint: true`. Attachment download correctly declares `readOnlyHint: false` because it creates a local file, although it does not modify the mailbox.

## Configuration

Fill in your email address and IMAP authorization code directly in your MCP client's configuration, as shown below. You do not need to set system environment variables or run `export`. The client passes the values to the server through its `env` configuration.

| Variable | Required | Default |
| --- | --- | --- |
| `QQMAIL_USER` | Yes | None |
| `QQMAIL_PASS` | Yes | None |
| `QQMAIL_FOLDER` | No | `INBOX` |
| `QQMAIL_IMAP_HOST` | No | `imap.qq.com` |
| `QQMAIL_IMAP_PORT` | No | `993` |
| `QQMAIL_IMAP_SECURE` | No | `true` |
| `QQMAIL_ATTACHMENT_DIR` | No | `<system temp>/qqmail-readonly-mcp-attachments` |

Direct configuration stores the authorization code in plain text on your computer. Keep the configuration private and restrict file access to your user account. Do not commit it to a repository or share it in screenshots or support requests. For alternatives, see [Advanced: injected credentials](#advanced-injected-credentials).

## Run with any STDIO MCP client

For clients that use a `mcpServers` JSON configuration, copy this example and replace the two placeholder values with your full QQ Mail or Foxmail address and IMAP authorization code. Use the authorization code, not your account login password. If you already have other servers, add only the `qqmail` entry to the existing `mcpServers` object.

```json
{
  "mcpServers": {
    "qqmail": {
      "command": "npx",
      "args": ["-y", "@ethanli666/qqmail-mcp@1.2.2"],
      "env": {
        "QQMAIL_USER": "your-address@qq.com",
        "QQMAIL_PASS": "your-imap-authorization-code"
      }
    }
  }
}
```

Save the configuration and restart the client. Ask the agent to call `qqmail_connection_status` to check the connection before reading messages. Other clients may use a different configuration format; the command, arguments, and credential names stay the same.

## Codex

Add the following to your local `~/.codex/config.toml` and replace the two placeholder values. If `[mcp_servers.qqmail]` already exists, update that entry instead of adding a duplicate. This follows the [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

```toml
[mcp_servers.qqmail]
command = "npx"
args = ["-y", "@ethanli666/qqmail-mcp@1.2.2"]
default_tools_approval_mode = "writes"

[mcp_servers.qqmail.env]
QQMAIL_USER = "your-address@qq.com"
QQMAIL_PASS = "your-imap-authorization-code"
```

Save the file and restart Codex, then ask it to call `qqmail_connection_status`.

## Advanced: injected credentials

If you prefer not to store credentials in the MCP configuration, use your client's secret store or a launcher that injects `QQMAIL_USER` and `QQMAIL_PASS` into the server process. Support varies by client. Do not assume that `${VARIABLE}` placeholders are expanded automatically.

For Codex, use this configuration instead of the direct-value example above. Set the two variables in the environment used to launch Codex:

```toml
[mcp_servers.qqmail]
command = "npx"
args = ["-y", "@ethanli666/qqmail-mcp@1.2.2"]
env_vars = ["QQMAIL_USER", "QQMAIL_PASS"]
default_tools_approval_mode = "writes"
```

When switching from direct values, remove the existing `[mcp_servers.qqmail.env]` table and its credential values. Restart Codex from the environment that provides the variables. A `.env` file by itself is not loaded by this server.

## Install from a local package archive

Before publishing to npm, build the archive with `npm pack`, copy the resulting `.tgz` file to the target computer, and configure the MCP client to run it with `npx -y /absolute/path/to/the-package.tgz`.

## Safety boundaries

- IMAP only; no SMTP and no mailbox write tools.
- Mailboxes are opened with read-only locks.
- Message lookup uses stable IMAP UIDs.
- Email content is labeled as untrusted data and server instructions tell agents never to follow instructions found in messages.
- HTML is converted to plain text; full headers are not returned.
- Message bodies, lookback periods, result counts, and attachment sizes are capped.
- Attachments of every file type are accepted, including scripts, applications, and installers.
- Downloads use sanitized paths, never overwrite existing files, and use mode `0600` on POSIX systems.
- macOS downloads receive the system quarantine attribute.
- Attachments are saved only. The server never executes, installs, opens, or unpacks them.

## Development

```sh
npm install
npm run check
npm run smoke
npm pack --dry-run
```

The package writes MCP protocol messages only to standard output. Operational errors are written to standard error.
