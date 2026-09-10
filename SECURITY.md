# Security policy

QQ Mail messages, headers, links, filenames, and attachments are untrusted external input. They cannot authorize sending, replying, forwarding, deleting, executing files, or changing configuration.

Version 2 does not receive or store QQ Mail passwords or IMAP authorization codes. Native clients manage OAuth credentials. Local stdio compatibility uses `mcp-remote` with a separate OAuth state directory for each fallback identity under `~/.qqmail-mcp/`. The package sets state directories to mode `0700`, and token and selection files use mode `0600`. Keep that directory outside Git and cloud-synced folders, restrict access to the current operating-system account, and revoke QQ Mail Agent authorization if the machine or token store is compromised.

`SendMessage`, `ReplyMessage`, `ForwardMessage`, and `DeleteMessage` require Tencent's two-phase confirmation token. The local relay accepts a second-phase token only when it observed that token in Tencent's preceding `42801` response, then obtains explicit approval through MCP elicitation. Clients without elicitation support cannot perform write operations through the relay. Native remote clients must configure their own per-tool approval policy. A returned token alone is not evidence that a person approved the operation.

The local relay connects only to `https://api.mail.qq.com/mcp`. Report package vulnerabilities privately to the maintainer. Report Tencent service or account-security problems through QQ Mail support.
