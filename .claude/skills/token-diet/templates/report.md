# token-diet report — {{DATE}}

## Summary
| metric | before | after |
|---|---:|---:|
| Always-loaded instruction tokens (root CLAUDE.md + unscoped rules) | | |
| Root CLAUDE.md lines | | |
| Read deny rules | | |
| Largest file readable whole | | (guarded above {{BUDGET}} tokens) |

## What changed
_(files created / modified, with one line each)_

## Installed
- LSP plugins:
- Retrieval layer:
- Hooks: read_guard.py, filter_test_output.py
- Subagents / skills: scout, codebase-map
- Extras:

## Backups
`.claude/token-diet/backup/` — see "Undo" in the token-diet skill.

## Next session checklist
1. Restart Claude Code so hooks, settings, MCP servers and plugins load.
2. `/context` → Memory files small; new tools listed.
3. `/hooks` → two PreToolUse hooks.
4. Re-run the 3 benchmark tasks from `.claude/token-baseline.md`; compare `/usage`.
5. Remove any third-party tool that didn't help (`claude mcp remove <name>`).

## Habits
_(paste references/habits.md)_

## Open items
