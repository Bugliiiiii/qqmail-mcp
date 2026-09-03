# Security policy

Do not include mailbox addresses, IMAP authorization codes, message contents, or downloaded attachments in public issues.

The server uses IMAP in read-only mode and exposes no send, delete, move, flag, or mailbox-management tools. Email content is returned as untrusted data. Attachment downloads create a new local file, never overwrite an existing file, and never execute, install, or unpack it.

Rotate the QQ Mail IMAP authorization code immediately if it is exposed. Report suspected vulnerabilities privately to the package maintainer.
