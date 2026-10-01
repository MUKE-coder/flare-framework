---
name: token-diet
description: Autonomously configure a large codebase so Claude Code uses far fewer tokens per task. Measures a baseline, adds Read deny rules for generated/vendored code, slims and splits CLAUDE.md, installs code-intelligence (LSP) and one retrieval layer (Serena, code graph, or semantic search), adds read-guard and test-output hooks, creates a scout subagent and a codebase-map skill, then verifies and reports savings. Use whenever the user mentions high token usage, expensive sessions, hitting usage limits, context filling up, huge repos, monorepos, "Claude reads too many files", or asks to optimize/set up Claude Code for a big codebase — even if they don't say "token-diet".
---

# token-diet

You are going to optimize THIS repository so that small changes cost small numbers of tokens. You do the work yourself end to end. The user only answers questions and approves risky steps.

Everything below uses `${CLAUDE_SKILL_DIR}` for this skill's folder. Scripts are Python 3 (stdlib only) and bash.

## Operating rules (read first)

1. **Do the work, don't describe it.** Every phase ends with files changed or tools installed and verified, not advice.
2. **Ask before:** installing third‑party software, running global package installs, sending code to external services, deleting or rewriting existing instructions, committing. Batch questions — never ask one at a time when you can ask three at once. Use the AskUserQuestion tool if available.
3. **Never ask about:** things you can detect (languages, test runners, generated dirs, installed binaries). Run the scripts instead.
4. **Back up before editing** any existing CLAUDE.md, settings, or rules file: copy it into `.claude/token-diet/backup/<timestamp>/` first.
5. **Merge, never overwrite** JSON settings. Always use `scripts/merge_settings.py`.
6. **Track state** in `.claude/token-diet/state.json` so the run is resumable. Update it at the end of every phase. If it exists when you start, resume from the first phase not marked `done`.
7. **Keep your own context lean while doing this**: use the scripts' summaries; don't read big files; delegate wide exploration to a subagent.
8. **Some changes only take effect in a NEW session** (hooks, settings, MCP servers, plugins, CLAUDE.md). Say so at the end; don't claim they are active now.
9. **You cannot run slash commands** like `/context` or `/usage`. Use the CLI (`claude mcp …`, `claude plugin …`) and scripts. When a slash command's output would help, ask the user to paste it — optional, never blocking.

## Phase 0 — Preflight & plan (one round of questions)

1. Confirm you're at the repo root (`git rev-parse --show-toplevel`). If not a git repo, warn and continue without git features.
2. Resolve the Python 3 command once and reuse it for every command below (plain Windows installs typically only have `python`, not `python3`):
   ```bash
   PY="$(command -v python3 || command -v python)"
   ```
   Then run:
   ```bash
   $PY ${CLAUDE_SKILL_DIR}/scripts/detect.py --out .claude/token-diet/detect.json
   ```
   Read only the printed summary (the JSON is for later phases).
3. If `git status --porcelain` is non-empty, recommend a branch: `git checkout -b chore/token-diet`.
4. Ask the user ONE batched set of questions (skip any already answered in conversation):
   - **Autonomy:** (a) "Ask me only before installs/external services" (recommended) or (b) "Ask before every phase".
   - **Scope:** commit config for the whole team (`.claude/settings.json`) or personal only (`.claude/settings.local.json`).
   - **Retrieval layer:** present your recommendation from `references/retrieval-layers.md` using the detection results, plus the alternatives and "none".
   - **Optional extras:** RTK command-output compressor? Terse-output style? (both default no)
   - **Branch/commit:** create branch and commit at the end?
5. Write `.claude/token-diet/state.json`:
   ```json
   {"version":1,"answers":{...},"phases":{"0":"done","1":"pending","2":"pending","3":"pending","4":"pending","5":"pending","6":"pending","7":"pending"}}
   ```

## Phase 1 — Baseline

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/baseline.sh > .claude/token-baseline.md
```
Then append a "Benchmark tasks" section: pick 3 realistic small tasks from `git log --oneline -50` (e.g. a one-file bug fix, adding a field, a small refactor). These are re-run after the setup. Optionally ask the user to paste `/context` output into the file.

## Phase 2 — Native configuration (no third-party code)

Details and exact formats: `references/native-config.md`. Do all of these:

1. **Read deny rules.** Take `suggested_deny_rules` from `detect.json`, sanity-check them (never deny real source dirs; a dir named `build/` holding source code must not be denied), then merge:
   ```bash
   $PY ${CLAUDE_SKILL_DIR}/scripts/merge_settings.py <settings-file> --deny-from .claude/token-diet/detect.json
   ```
2. **Slim root CLAUDE.md to < 200 lines.** Back it up. Keep only repo-wide essentials. Everything area-specific moves to per-directory CLAUDE.md files or `.claude/rules/*.md` with `paths:`; long procedures move to skills. `@imports` do NOT save tokens — inline-import chains must be converted to on-demand files. Show the user the proposed moves as a short table and get one approval before rewriting (rule 2: rewriting instructions).
3. **Append** `templates/claude-md-snippet.md` (exploration policy + compact instructions) to root CLAUDE.md, filling in real build/test commands from `detect.json`.
4. **Per-directory CLAUDE.md** for each major area listed in `detect.json.top_areas` that has ≥ 5% of the code and no CLAUDE.md yet: 10–40 lines each — stack, how to test that area alone, conventions, gotchas. Base them on a quick look (manifest files, 1–2 representative files), or delegate to a subagent for many areas.
5. **Path-scoped rules** for cross-cutting conventions (migrations, tests, protos, i18n): copy/adapt `templates/rules/example-migrations.md`.
6. **claudeMdExcludes**: only if the user named areas they never touch.

## Phase 3 — Code intelligence (LSP)

See `references/retrieval-layers.md` §LSP. For each language in `detect.json.languages` with an official plugin:
1. Check the language-server binary (`detect.json.lsp`). If missing, propose the install command and ask (global install).
2. Install the plugin via CLI:
   ```bash
   claude plugin marketplace add anthropics/claude-plugins-official
   claude plugin install <lang>-lsp@claude-plugins-official
   ```
   If the CLI subcommand fails, print the exact `/plugin install …` line and ask the user to run it.
3. For team scope, add the plugin to `enabledPlugins` in `.claude/settings.json` via `merge_settings.py --json`.

## Phase 4 — ONE retrieval layer (only with approval)

Install exactly the option the user chose in Phase 0 following `references/retrieval-layers.md`. Then:
- Verify with `claude mcp list` (server shows connected) or the tool's own status command.
- Append that tool's usage rule (from the reference) to root CLAUDE.md.
- Never install two retrieval layers. If "none", skip.

## Phase 5 — Enforcement hooks

See `references/hooks.md`.
```bash
mkdir -p .claude/hooks
cp ${CLAUDE_SKILL_DIR}/scripts/read_guard.py ${CLAUDE_SKILL_DIR}/scripts/filter_test_output.py .claude/hooks/
chmod +x .claude/hooks/*.py
$PY ${CLAUDE_SKILL_DIR}/scripts/merge_settings.py <settings-file> --hooks
bash ${CLAUDE_SKILL_DIR}/scripts/test_hooks.sh .claude/hooks
```
`test_hooks.sh` must print `ALL HOOK TESTS PASSED`. If it fails, fix before continuing.
Adapt the test-runner regex in `filter_test_output.py` if `detect.json.test_commands` shows a runner it doesn't cover.
If the user opted into RTK, follow `references/hooks.md` §RTK (and then you may skip the test filter hook if RTK covers the runners).

## Phase 6 — Scout subagent + codebase-map skill

1. Copy `templates/agents/scout.md` → `.claude/agents/scout.md`.
2. Build the map. Delegate to a subagent (the scout if the session already sees it; otherwise the built-in Explore/general subagent with the same instructions) with this task:
   *"Using `.claude/token-diet/detect.json` as the starting inventory, produce a module map of this repository following the structure in `${CLAUDE_SKILL_DIR}/templates/skills/codebase-map/MAP.template.md`. Paths over prose, max ~400 lines. Read slices, not whole files. Return the finished markdown."*
3. Write the result to `.claude/skills/codebase-map/MAP.md` and copy `templates/skills/codebase-map/SKILL.md` next to it.
4. Propose (don't force) 1–3 area skills for recurring workflows you noticed (e.g. migrations, API tests, release). Create the ones the user accepts, with `paths:` frontmatter where applicable.
5. If the user opted into terse output, install per `references/extras.md`.

## Phase 7 — Verify & report

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/verify.sh
bash ${CLAUDE_SKILL_DIR}/scripts/baseline.sh > .claude/token-diet/after.md
```
Then write `.claude/token-diet/REPORT.md` using `templates/report.md`: what changed (files list), always-loaded instruction tokens before → after, tools installed, open items, and the **next-session checklist**:
1. Restart Claude Code (new session) so hooks/settings/MCP/plugins load.
2. Run `/context` — confirm Memory files are small and the new MCP/plugin is listed.
3. Run `/hooks` — confirm the two PreToolUse hooks.
4. Re-run the 3 benchmark tasks from `.claude/token-baseline.md`, compare with `/usage`.
5. If a third-party tool didn't help on those tasks, remove it (`claude mcp remove <name>`).

If the user chose to commit: `git add .claude CLAUDE.md '**/CLAUDE.md' && git commit -m "chore: token-diet Claude Code setup"` (exclude `settings.local.json`).

Finally give the user a SHORT summary (≤ 15 lines) and point to REPORT.md. Mark all phases `done` in state.json.

## Undo

Everything edited is backed up under `.claude/token-diet/backup/`. To roll back: restore those files, remove `.claude/hooks/read_guard.py` and `filter_test_output.py`, remove the hook entries with `$PY ${CLAUDE_SKILL_DIR}/scripts/merge_settings.py <settings-file> --remove-hooks`, and `claude mcp remove <server>` / `claude plugin uninstall <plugin>`. If asked to undo, do exactly this.

## Reference map

| File | Read when |
|---|---|
| `references/native-config.md` | Phase 2 |
| `references/retrieval-layers.md` | Phase 0 (recommendation) and Phases 3–4 |
| `references/hooks.md` | Phase 5 |
| `references/extras.md` | Optional extras (terse output) |
| `references/habits.md` | Include in final report for the human |
