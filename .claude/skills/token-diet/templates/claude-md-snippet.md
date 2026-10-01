## Exploration policy (token budget)
- Locate before reading: LSP / symbol tools / Grep with narrow globs first. Never read a file "to see what's in it".
- Unfamiliar area? Use the `codebase-map` skill before exploring.
- Read slices, not files: for files > 300 lines, Read with offset/limit around the target.
- Never read generated, vendored, lock, snapshot or minified files.
- Questions needing > 5 files: delegate to the `scout` subagent; ask for `path:line` conclusions only.
- Filter output at the source: run the single relevant test, use quiet flags, `git log --oneline -20`, `| tail -50`.
- Don't re-read a file already read this session unless it changed.
- Replies: lead with the change; don't restate plans or re-print diffs.

## Commands
- Build: `{{BUILD_CMD}}`
- Test all: `{{TEST_CMD}}`
- Test one file: `{{TEST_ONE_CMD}}`
- Lint/typecheck: `{{LINT_CMD}}`

## Compact instructions
When compacting keep: the task goal, files changed and why, failing test names and errors, decisions made, open TODOs. Drop: file contents already read, exploration dead ends, full command output.
