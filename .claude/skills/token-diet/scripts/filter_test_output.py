#!/usr/bin/env python3
"""token-diet test-output filter (Claude Code PreToolUse hook, matcher: Bash).

Wraps test-runner commands so Claude sees failures + a short summary instead of
thousands of lines of passing-test noise. The exit code is preserved.

- Short outputs (<= 60 lines) pass through untouched.
- Opt out for one command: prefix it with TOKEN_DIET_RAW=1
- Commands that already pipe (|) or redirect to a file are left alone.
- Never crashes the session: any error => allow unchanged.
"""
import json, re, sys

# Only a PURE test command is wrapped (optionally "cd <dir> &&" and VAR=value prefixes).
# Anything chained (;, &&, ||, |, backticks, $(), redirects) is left alone, because this
# hook auto-approves the command it rewrites.
RUNNER = (
    r"((npx|bunx|pnpm\s+exec)\s+)?"
    r"((npm|pnpm|yarn|bun)\s+(run\s+)?test|pytest|python3?\s+-m\s+pytest|go\s+test|cargo\s+(test|nextest)|"
    r"(\./)?mvnw?|(\./)?gradlew?|jest|vitest|rspec|bundle\s+exec\s+rspec|"
    r"(vendor/bin/)?phpunit|mix\s+test|dotnet\s+test|make\s+(test|check)|tox|nox|ctest|swift\s+test|dart\s+test|flutter\s+test)"
)
PURE = re.compile(
    r"^(cd\s+[^;&|`$<>\n]+\s*&&\s*)?([A-Z_][A-Z0-9_]*=\S*\s+)*" + RUNNER + r"(\s+[^;&|`$<>\n]*)?$"
)
MAVEN_GRADLE = re.compile(r"^(cd\s+\S+\s*&&\s*)?([A-Z_][A-Z0-9_]*=\S*\s+)*(\./)?(mvnw?|gradlew?)\b")
FAIL_PATTERN = r"(FAIL|FAILED|ERROR|Error:|error\[|error:|panicked|Traceback|AssertionError|Exception|✗|✕|×|failures?:|not ok)"


def passthrough():
    print("{}")
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        passthrough()
    ti = data.get("tool_input") or {}
    cmd = (ti.get("command") or "").strip()
    if not cmd or "TOKEN_DIET_RAW=1" in cmd or "__td_out" in cmd:
        passthrough()
    if not PURE.match(cmd):
        passthrough()
    if MAVEN_GRADLE.match(cmd) and not re.search(r"\btest\b", cmd):
        passthrough()  # e.g. "mvn package" is not a test run

    wrapped = (
        "__td_out=$( { " + cmd + " ; } 2>&1 ); __td_code=$?; "
        "__td_n=$(printf '%s\\n' \"$__td_out\" | wc -l); "
        "if [ \"$__td_n\" -le 60 ]; then printf '%s\\n' \"$__td_out\"; else "
        "printf '%s\\n' \"$__td_out\" | grep -E -A 8 '" + FAIL_PATTERN + "' | head -150; "
        "echo '--- last 15 lines ---'; printf '%s\\n' \"$__td_out\" | tail -15; "
        "echo \"[token-diet: filtered $__td_n lines of test output; exit code $__td_code. Prefix TOKEN_DIET_RAW=1 for full output]\"; fi; "
        "exit $__td_code"
    )
    new_input = dict(ti)
    new_input["command"] = wrapped
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "updatedInput": new_input,
    }}))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        passthrough()
