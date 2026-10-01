#!/usr/bin/env bash
# token-diet: print a markdown snapshot of token-relevant repo facts.
# Usage: baseline.sh > .claude/token-baseline.md
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3 || command -v python)"
[ -n "$PY" ] || { echo "Python 3 not found (tried python3, python)"; exit 1; }
tmpjson="$(mktemp)"; trap 'rm -f "$tmpjson"' EXIT
"$PY" "$DIR/detect.py" --out "$tmpjson" >/dev/null 2>&1 || { echo "detect.py failed"; exit 1; }
"$PY" - "$tmpjson" <<'PY'
import json, sys, datetime, os
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
d = json.load(open(sys.argv[1]))
print(f"# token-diet snapshot — {datetime.datetime.now():%Y-%m-%d %H:%M}\n")
print(f"- Tracked files: **{d['files_tracked']:,}**  |  Lines: **{d['total_lines']:,}**  |  Whole repo ≈ **{d['est_total_tokens']:,}** tokens")
print(f"- Always-loaded instructions (root CLAUDE.md + unscoped rules) ≈ **{d['always_loaded_instruction_tokens_est']:,}** tokens (loaded on EVERY request)")
print(f"- CLAUDE.md/AGENTS.md files: {len(d['claude_md_files'])}  |  rules files: {len(d['rules_files'])} ({sum(1 for r in d['rules_files'] if r['path_scoped'])} path-scoped)")
s = d['existing_settings']
print(f"- settings.json: {'yes' if s['.claude/settings.json'] else 'no'}  |  settings.local.json: {'yes' if s['.claude/settings.local.json'] else 'no'}  |  .mcp.json: {'yes' if s['.mcp.json'] else 'no'}")
hooks = os.path.exists('.claude/hooks/read_guard.py')
print(f"- token-diet hooks installed: {'yes' if hooks else 'no'}")
agents = os.path.exists('.claude/agents/scout.md'); cmap = os.path.exists('.claude/skills/codebase-map/MAP.md')
print(f"- scout subagent: {'yes' if agents else 'no'}  |  codebase-map skill: {'yes' if cmap else 'no'}")
try:
    deny = len(json.load(open('.claude/settings.json')).get('permissions', {}).get('deny', []))
except Exception:
    deny = 0
print(f"- Read deny rules in settings.json: {deny}\n")
print("## Languages\n\n| language | lines |\n|---|---:|")
for k, v in list(d['languages'].items())[:10]: print(f"| {k} | {v:,} |")
print("\n## Largest areas\n\n| area | files | lines | share |\n|---|---:|---:|---:|")
for a in d['top_areas'][:15]: print(f"| {a['area']} | {a['files']:,} | {a['lines']:,} | {a['share']:.0%} |")
print("\n## Largest files (whole-file read cost)\n\n| file | lines | ≈ tokens |\n|---|---:|---:|")
for f in d['largest_files'][:15]: print(f"| {f['path']} | {f['lines']:,} | {f['est_tokens']:,} |")
print("\n## CLAUDE.md files\n\n| file | lines | ≈ tokens |\n|---|---:|---:|")
for c in d['claude_md_files'][:30]: print(f"| {c['path']} | {c['lines']} | {c['est_tokens']:,} |")
if not d['claude_md_files']: print("| (none) | | |")
print("\n## Benchmark tasks\n\n_Filled in by the agent: 3 realistic small tasks to re-run in a fresh session before/after._\n")
print("## /context and /usage (optional)\n\n_Paste output of `/context` and `/usage` from a fresh session here._")
PY
