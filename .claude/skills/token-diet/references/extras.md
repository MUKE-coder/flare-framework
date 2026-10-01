# Optional extras

## Terse output (reduces OUTPUT tokens only)

Lightweight, no install — append to root CLAUDE.md:
```markdown
## Response style
Be terse. Lead with the change or answer. No restating the plan, no summaries of diffs already shown, no filler. Code, paths and commands exact.
```

Heavier, third-party: the `caveman` plugin (github.com/JuliusBrussee/caveman) — reports ~65% average output-token reduction; input tokens unaffected. Ask first:
```bash
claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman
```

## Model & effort defaults

Suggest (don't force) in `.claude/settings.json` or tell the user:
- Sonnet as the default model for routine work; Opus only for architecture / hard reasoning (`/model`).
- Lower effort for trivial edits (`/effort`).
- Subagents on Haiku (the scout template already sets `model: haiku`).

## Stop hook that proposes CLAUDE.md / MAP.md updates

Advanced, optional: a `Stop` hook receives the transcript path; a script can flag when Claude re-explored an area the map covers. Only build if the user asks.
