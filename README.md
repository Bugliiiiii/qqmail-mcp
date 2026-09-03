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

The server reads configuration from its process environment:

| Variable | Required | Default |
| --- | --- | --- |
| `QQMAIL_USER` | Yes | — |
| `QQMAIL_PASS` | Yes | — |
| `QQMAIL_FOLDER` | No | `INBOX` |
| `QQMAIL_IMAP_HOST` | No | `imap.qq.com` |
| `QQMAIL_IMAP_PORT` | No | `993` |
| `QQMAIL_IMAP_SECURE` | No | `true` |
| `QQMAIL_ATTACHMENT_DIR` | No | `<system temp>/qqmail-readonly-mcp-attachments` |

Keep authorization codes in the MCP host's secret store or injected environment. Never commit them to a repository or publish them in MCP configuration examples.

## Run with any STDIO MCP client

Configure a local MCP client to run:

```text
command: npx
args: -y @ethanli666/qqmail-mcp@1.2.1
environment: QQMAIL_USER, QQMAIL_PASS
```

Generic JSON-style client configuration:

```json
{
  "mcpServers": {
    "qqmail": {
      "command": "npx",
      "args": ["-y", "@ethanli666/qqmail-mcp@1.2.1"],
      "env": {
        "QQMAIL_USER": "${QQMAIL_USER}",
        "QQMAIL_PASS": "${QQMAIL_PASS}"
      }
    }
  }
}
```

Environment-variable interpolation varies by client. If a client does not support it, use that client's credential store or a local launcher that injects the variables.

## Codex

Codex can forward variables from its environment without storing their values in `config.toml`:

```toml
[mcp_servers.qqmail]
command = "npx"
args = ["-y", "@ethanli666/qqmail-mcp@1.2.1"]
env_vars = ["QQMAIL_USER", "QQMAIL_PASS"]
default_tools_approval_mode = "writes"
```

Or add it from the CLI after setting the two variables in the environment used to launch Codex:

```sh
codex mcp add qqmail -- npx -y @ethanli666/qqmail-mcp@1.2.1
```

Restart the client after changing MCP configuration.

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
