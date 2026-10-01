# Native Claude Code configuration (Phase 2)

All features here are official Claude Code behavior (docs: code.claude.com/docs/en/large-codebases, /memory, /costs).

## How instructions load (why this matters)

| Mechanism | Loads | Token impact |
|---|---|---|
| Root `CLAUDE.md` (+ every ancestor dir's) | At session start, every request | Always paid |
| `@path` imports inside CLAUDE.md | At session start (same as inline) | Always paid — **no savings** |
| `.claude/rules/*.md` **without** `paths:` | At session start | Always paid |
| `.claude/rules/*.md` **with** `paths:` | When Claude touches a matching file | On demand |
| `sub/dir/CLAUDE.md` | When Claude reads a file in that subtree (or when launched from there) | On demand |
| Skills | Name + description always; body only when invoked | Cheap until used |

Target: root CLAUDE.md < 200 lines. Everything else on demand.

## 1. Read deny rules

- `.gitignore`d paths are already excluded from Claude's searches. Deny rules are for **checked-in** noise.
- Pattern `Read(./path/**/*)` blocks contents but still allows `ls path`.
- Scope: team → `.claude/settings.json` (commit). Personal → `.claude/settings.local.json` (gitignore it). If the user starts sessions from subdirectories, personal rules must use `//`-absolute paths: `Read(//abs/path/to/repo/**/vendor/**/*)`.
- Limits: raw `grep -r`/`find` in Bash over denied dirs still prints content; subprocesses aren't covered. That's fine — the exploration policy tells Claude to use built-in Grep/Glob.
- **Sanity-check before merging**: never deny a directory that contains hand-written source. Directories in `review_before_deny` (bin, obj, fixtures, testdata, gen, out, build) need a quick look (`ls` + one file head) before adding with `--deny`.
- `.claudeignore` is NOT an official feature. Don't create one.

## 2. Slimming root CLAUDE.md

Keep:
- 2–4 line project description
- Exact build / test / lint commands, **including how to run one test file or one test case**
- Repo-wide conventions (commit format, codegen rule, "never edit generated files")
- Exploration policy + compact instructions (from `templates/claude-md-snippet.md`)
- One line: "Module map: use the `codebase-map` skill."

Move out:
- Area-specific conventions → that area's `CLAUDE.md`
- Conventions for a file type scattered across the tree → `.claude/rules/<topic>.md` with `paths:`
- Step-by-step procedures (release, migrations, deploy, PR review) → skills
- Architecture descriptions → `codebase-map` skill's MAP.md
- Outdated rules that worked around old model limitations → delete (ask)

Present the move plan as a table: `section | lines | destination`. One approval, then execute. Back up first.

## 3. Per-directory CLAUDE.md template

```markdown
# <area name>
<one line: what this area is>

- Stack: <framework, key libs>
- Test only this area: `<command>` ; one file: `<command path>`
- Conventions: <3–6 bullets that differ from repo-wide rules>
- Gotchas: <env setup, codegen step, things that commonly break>
```
10–40 lines. Only create for areas with meaningful code share or real local conventions.

## 4. Path-scoped rules

```markdown
---
paths:
  - "**/migrations/**"
  - "**/*.sql"
---
<rule text>
```
Good candidates: migrations, tests (`**/*.test.*`, `**/tests/**`), API schemas/protos, i18n files, infra (`**/*.tf`), CI files.

## 5. claudeMdExcludes (personal, `.claude/settings.local.json`)

```json
{ "claudeMdExcludes": ["**/legacy/**", "**/packages/other-team-*/**"] }
```
Only for areas the user says they never work in. Patterns match absolute paths — start with `**/`.

## 6. Where to launch Claude (tell the user)

Launching `claude` inside a subsystem directory loads only that directory's CLAUDE.md + ancestors and restricts file access to that subtree. Use `claude --add-dir ../shared` for cross-package tasks. For worktrees in huge repos, `worktree.sparsePaths` in settings checks out only listed directories.
