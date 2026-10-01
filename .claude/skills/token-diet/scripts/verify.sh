#!/usr/bin/env bash
# token-diet: verify the setup. Exit non-zero on hard failures.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3 || command -v python)"
[ -n "$PY" ] || { echo "Python 3 not found (tried python3, python)"; exit 1; }
ok=0
echo "== settings JSON validity"
for f in .claude/settings.json .claude/settings.local.json .mcp.json; do
  [ -f "$f" ] || continue
  "$PY" -c "import json,sys; json.load(open(sys.argv[1]))" "$f" && echo "  ok   $f" || { echo "  FAIL $f invalid JSON"; ok=1; }
done
echo "== hooks"
if [ -f .claude/hooks/read_guard.py ]; then
  bash "$DIR/test_hooks.sh" .claude/hooks >/tmp/td_hooktest.txt 2>&1 && echo "  ok   hook self-test passed" || { echo "  FAIL hook self-test (see /tmp/td_hooktest.txt)"; ok=1; }
  grep -q read_guard.py .claude/settings.json .claude/settings.local.json 2>/dev/null && echo "  ok   read_guard registered" || { echo "  WARN read_guard.py not registered in settings"; }
else
  echo "  skip hooks not installed"
fi
echo "== instructions"
if [ -f CLAUDE.md ]; then
  n=$(wc -l < CLAUDE.md); [ "$n" -le 200 ] && echo "  ok   root CLAUDE.md $n lines" || echo "  WARN root CLAUDE.md $n lines (>200)"
  grep -qi "exploration policy" CLAUDE.md && echo "  ok   exploration policy present" || echo "  WARN exploration policy missing"
fi
for f in .claude/agents/scout.md .claude/skills/codebase-map/SKILL.md .claude/skills/codebase-map/MAP.md; do
  [ -f "$f" ] && echo "  ok   $f" || echo "  WARN missing $f"
done
echo "== MCP / plugins"
if command -v claude >/dev/null 2>&1; then
  claude mcp list 2>/dev/null | sed 's/^/  /' | head -20
else
  echo "  skip claude CLI not on PATH"
fi
echo
[ $ok = 0 ] && echo "VERIFY: OK (restart Claude Code to activate changes)" || echo "VERIFY: FAILURES ABOVE"
exit $ok
