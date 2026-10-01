#!/usr/bin/env bash
# token-diet: self-test the installed hooks. Usage: test_hooks.sh [hooks-dir]
set -u
DIR="${1:-.claude/hooks}"
PY="${PYTHON:-$(command -v python3 || command -v python)}"
[ -n "$PY" ] || { echo "Python 3 not found (tried python3, python)"; exit 1; }
# filter_test_output.py's FAIL_PATTERN contains non-ASCII glyphs (✗ ✕ ×); this
# script's helper one-liners decode and print them, which crashes on Windows'
# default cp1252 console unless stdout is forced to UTF-8.
export PYTHONIOENCODING=utf-8
fail=0
pass() { echo "  ok   $1"; }
bad()  { echo "  FAIL $1"; fail=1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
# On Windows/git-bash, argv paths passed straight to a native (non-MSYS) python are
# auto-translated from /tmp/... to C:\... , but paths embedded in JSON sent over
# stdin are not — python then can't find the file. Convert explicitly with cygpath
# (present in git-bash) wherever a $tmp path is embedded in piped JSON below.
if command -v cygpath >/dev/null 2>&1; then winroot="$(cygpath -m "$tmp")"; else winroot="$tmp"; fi

echo "read_guard.py"
$PY - "$tmp/big.py" <<'PY'
import sys
with open(sys.argv[1], "w") as f:
    for i in range(4000):
        f.write(f"def fn_{i}(x):\n    return x + {i}  # padding padding padding\n")
PY
printf 'x = 1\n' > "$tmp/small.py"
out=$(printf '{"tool_input":{"file_path":"%s"}}' "$winroot/big.py" | CLAUDE_PROJECT_DIR="$winroot" $PY "$DIR/read_guard.py")
echo "$out" | grep -q '"deny"' && echo "$out" | grep -q 'fn_0' && pass "blocks big whole-file read with outline" || bad "big file not blocked: $out"
out=$(printf '{"tool_input":{"file_path":"%s","offset":10,"limit":50}}' "$winroot/big.py" | CLAUDE_PROJECT_DIR="$winroot" $PY "$DIR/read_guard.py")
[ "$out" = "{}" ] && pass "allows sliced read" || bad "sliced read blocked: $out"
out=$(printf '{"tool_input":{"file_path":"%s"}}' "$winroot/small.py" | CLAUDE_PROJECT_DIR="$winroot" $PY "$DIR/read_guard.py")
[ "$out" = "{}" ] && pass "allows small file" || bad "small file blocked"
mkdir -p "$tmp/.claude/token-diet"; echo "*big.py" > "$tmp/.claude/token-diet/read-allow.txt"
out=$(printf '{"tool_input":{"file_path":"%s"}}' "$winroot/big.py" | CLAUDE_PROJECT_DIR="$winroot" $PY "$DIR/read_guard.py")
[ "$out" = "{}" ] && pass "respects read-allow.txt" || bad "allowlist ignored"
out=$(echo 'not json' | $PY "$DIR/read_guard.py")
[ "$out" = "{}" ] && pass "fails open on bad input" || bad "crashed on bad input"

echo "filter_test_output.py"
chk() { # $1 cmd  $2 expect(wrap|pass)
  out=$(printf '%s' "$1" | $PY -c 'import json,sys; print(json.dumps({"tool_input":{"command":sys.stdin.read()}}))' | $PY "$DIR/filter_test_output.py")
  if [ "$2" = wrap ]; then echo "$out" | grep -q '__td_out' && pass "wraps: $1" || bad "should wrap: $1"
  else [ "$out" = "{}" ] && pass "leaves alone: $1" || bad "should NOT wrap: $1"; fi
}
chk "npm test" wrap
chk "pytest -x tests/unit" wrap
chk "cd services/api && go test ./..." wrap
chk "CI=1 pnpm run test -- --silent" wrap
chk "./gradlew test" wrap
chk "git status" pass
chk "rm -rf build; npm test" pass
chk "npm test && rm -rf /tmp/x" pass
chk "npm test | tail -20" pass
chk "pytest \$(cat list.txt)" pass
chk "mvn package" pass
chk "TOKEN_DIET_RAW=1 npm test" pass

# End-to-end: wrapped command must preserve exit code and filter
cmdjson=$($PY -c 'import json; print(json.dumps({"tool_input":{"command":"pytest"}}))')
wrapped=$(echo "$cmdjson" | $PY "$DIR/filter_test_output.py" | $PY -c 'import json,sys; print(json.load(sys.stdin)["hookSpecificOutput"]["updatedInput"]["command"])')
fake="$tmp/bin"; mkdir -p "$fake"
cat > "$fake/pytest" <<'SH'
#!/usr/bin/env bash
for i in $(seq 1 500); do echo "test_$i PASSED"; done
echo "test_bad FAILED"; echo "AssertionError: 1 != 2"; echo "1 failed, 500 passed"; exit 1
SH
chmod +x "$fake/pytest"
res=$(PATH="$fake:$PATH" bash -c "$wrapped"); code=$?
lines=$(printf '%s\n' "$res" | wc -l)
[ "$code" = 1 ] && pass "exit code preserved (1)" || bad "exit code was $code"
[ "$lines" -lt 60 ] && echo "$res" | grep -q "AssertionError" && pass "503 lines -> $lines lines, failure kept" || bad "filtering failed ($lines lines)"

echo
[ $fail = 0 ] && echo "ALL HOOK TESTS PASSED" || { echo "SOME HOOK TESTS FAILED"; exit 1; }
