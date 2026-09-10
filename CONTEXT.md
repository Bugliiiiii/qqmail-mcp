# QQ Mail MCP context

## Purpose

This repository connects MCP clients to Tencent's official QQ Mail MCP service. It does not implement mailbox operations and does not connect to QQ Mail through IMAP or SMTP.

## Vocabulary

- **Official service**: Tencent's remote Streamable HTTP MCP endpoint at `https://api.mail.qq.com/mcp`.
- **Native client**: an MCP host that can connect to the official service and complete OAuth without a local adapter.
- **Local relay**: the stdio-to-HTTP adapter used only when a local MCP host cannot complete Tencent OAuth itself. It forwards the official tool schemas and calls unchanged.
- **Fallback client name**: one of `Codex`, `Claude`, or `WorkBuddy`, supplied as OAuth dynamic client metadata for the user's local relay.
- **Connector skill**: agent instructions for using the official tools, including `GetMe` bootstrapping and two-phase confirmation.
- **Protocol adapter**: the module that validates the client's MCP protocol version, negotiates it with the official service, and echoes the client's expected version in the response.
- **Write confirmation interceptor**: the module that manages Tencent's two-phase write challenges, token TTL expiration, and user elicitation confirmation.
- **Upstream supervisor**: the process supervisor that manages the `mcp-remote` child lifecycle, candidate fallback rotation, credentials directory isolation, and port conflict halts.

## Product boundary

The package owns connection setup and local transport compatibility. Tencent owns mailbox behavior, tool schemas, OAuth authorization, quotas, and service availability. No IMAP compatibility layer is retained in version 2.
