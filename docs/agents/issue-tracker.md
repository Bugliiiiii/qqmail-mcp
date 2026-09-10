# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI for operations and infer the repository from `git remote -v`.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Pull requests are not treated as incoming feature requests by default.

When a skill says to publish something to the issue tracker, create a GitHub issue. When it asks for the relevant ticket, read that issue and its comments before acting.

## Dependencies

Use GitHub sub-issues and native issue dependencies when available. Otherwise, put `Blocked by: #<number>` at the top of the blocked issue. An issue is ready only when all blockers are closed.
