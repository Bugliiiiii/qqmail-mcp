# ADR 0001: Use Tencent's official remote MCP

- Status: accepted
- Date: 2026-09-10

## Context

Version 1 connected directly to `imap.qq.com` and required users to supply a mailbox address and IMAP authorization code. Tencent now provides an OAuth-protected Streamable HTTP MCP service with the complete QQ Mail Agent tool set.

Tencent's dynamic client registration currently accepts client metadata containing the case-sensitive names `Codex`, `Claude`, `WorkBuddy`, or `CodeBuddy`. Codex OAuth was verified locally. Other local MCP hosts may need a stdio relay.

## Decision

Version 2 removes the IMAP implementation and forwards users to Tencent's official service. Native clients connect directly. Stdio-only or rejected local clients can run the package as a local relay, using `Codex` by default and allowing `Claude` or `WorkBuddy` as explicit local fallback names.

The relay uses `mcp-remote` instead of maintaining custom OAuth and Streamable HTTP code. It does not rename, wrap, or reimplement Tencent's tools.

## Consequences

- Tencent controls all mailbox functions and may change availability, schemas, quotas, or client admission.
- Version 2 is intentionally incompatible with version 1 configuration.
- No mailbox password, IMAP authorization code, message, or attachment is processed by repository-owned code.
- OAuth tokens are stored by the MCP host or `mcp-remote`, not by this package.
- If Tencent becomes unavailable or rejects all fallback client names, the package has no IMAP fallback.
