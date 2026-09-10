# QQ Mail MCP context

## Purpose

This repository connects MCP clients to Tencent's official QQ Mail MCP service. It does not implement mailbox operations and does not connect to QQ Mail through IMAP or SMTP.

## Vocabulary

- **Official service**: Tencent's remote Streamable HTTP MCP endpoint at `https://api.mail.qq.com/mcp`.
- **Native client**: an MCP host that can connect to the official service and complete OAuth without a local adapter.
- **Local relay**: the stdio-to-HTTP adapter used only when a local MCP host cannot complete Tencent OAuth itself. It forwards the official tool schemas and calls unchanged.
- **Fallback client name**: one of `Codex`, `Claude`, or `WorkBuddy`, supplied as OAuth dynamic client metadata for the user's local relay.
- **Connector skill**: agent instructions for using the official tools, including `GetMe` bootstrapping and two-phase confirmation.

## Product boundary

The package owns connection setup and local transport compatibility. Tencent owns mailbox behavior, tool schemas, OAuth authorization, quotas, and service availability. No IMAP compatibility layer is retained in version 2.
