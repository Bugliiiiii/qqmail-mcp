# Domain docs

This repository uses a single-context domain documentation layout.

## Read before changing the project

- Read the root `CONTEXT.md` when it exists.
- Read relevant records under `docs/adr/` when they exist.
- If either path does not exist, continue without creating placeholder files.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Use terms exactly as the glossary in `CONTEXT.md` defines them. If a needed concept is missing, resolve its meaning before adding it. Surface any conflict with an existing ADR instead of silently overriding the decision.
