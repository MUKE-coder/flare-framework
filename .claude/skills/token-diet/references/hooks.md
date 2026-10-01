# Enforcement hooks (Phase 5)

CLAUDE.md rules get forgotten under pressure; hooks can't be. Both hooks are Python 3 stdlib, fail open (any error = allow), and are registered as `PreToolUse` hooks by `merge_settings.py --hooks`.

## read_guard.py (matcher: Read)

- Denies a **whole-file** Read when the file is estimated above the budget (default 8,000 tokens ≈ 32 KB) and returns an outline with line numbers, so Claude re-reads just a slice with offset/limit.
- Sliced reads, images/PDFs/notebooks, and small files are always allowed.
- Tune: env `TOKEN_DIET_READ_BUDGET=12000` (set in `settings.json` → `"env": {"TOKEN_DIET_READ_BUDGET": "12000"}` via merge_settings `--json`).
- Allowlist: glob per line in `.claude/token-diet/read-allow.txt` (e.g. `docs/ARCHITECTURE.md`).
- If the repo has many files 200–800 lines that are routinely needed whole, raise the budget rather than fighting the hook.

## filter_test_output.py (matcher: Bash)

- Wraps a **pure** test-runner command (npm/pnpm/yarn/bun test, pytest, go test, cargo test/nextest, mvn/gradle test, jest, vitest, rspec, phpunit, mix test, dotnet test, make test/check, tox, nox, ctest, swift/dart/flutter test). Optional `cd dir &&` and `VAR=value` prefixes are allowed.
- Output ≤ 60 lines passes through unchanged; longer output is reduced to failure blocks (+8 lines context, max 150) plus the last 15 lines. Exit code preserved.
- Chained/piped/redirected commands (`;`, `&&` after the runner, `|`, `$()`, backticks, `>`) are never touched.
- **Important:** because it rewrites the command it returns `permissionDecision: "allow"`, so matched pure test commands run without a permission prompt. Tell the user. If they don't want that, edit the hook to use `"ask"`.
- Opt out once: `TOKEN_DIET_RAW=1 npm test`.
- Unusual runner? Add it to the `RUNNER` regex and re-run `test_hooks.sh`.

## Verifying

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/test_hooks.sh .claude/hooks   # must print ALL HOOK TESTS PASSED
```
In the next session the user can run `/hooks` to see both registered.

## RTK (optional, third-party)

Rust binary that compresses output of ~100 common commands (git, ls, builds, tests, docker…) via a Bash-rewrite hook. Doesn't affect built-in Read/Grep/Glob.

- Repo: https://github.com/rtk-ai/rtk — **do not** `cargo install rtk` from crates.io (that's an unrelated "Rust Type Kit").
- Install per the repo README (Homebrew / release binary / `cargo install --git https://github.com/rtk-ai/rtk`). Ask first.
- Verify it's the right tool: `rtk gain` shows token stats.
- `rtk init -g` installs its hook globally (~/.claude/settings.json) — tell the user it's global.
- `rtk discover` shows past commands it would have compressed — include the summary in REPORT.md.
- With RTK covering test runners you may unregister filter_test_output.py to avoid double-wrapping (edit hooks list, or keep one and test).
