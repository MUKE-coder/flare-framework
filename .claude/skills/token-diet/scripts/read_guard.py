#!/usr/bin/env python3
"""token-diet read-guard (Claude Code PreToolUse hook, matcher: Read).

Blocks whole-file Reads of files larger than a token budget and returns an outline
(line numbers of definitions) so Claude can re-read just the slice it needs.

- Sliced reads (limit set) are always allowed.
- Budget: env TOKEN_DIET_READ_BUDGET (default 8000 est. tokens ≈ 32 KB).
- Allowlist: globs, one per line, in .claude/token-diet/read-allow.txt
- Never crashes the session: any error => allow.
"""
import fnmatch, json, os, re, sys

BUDGET = int(os.environ.get("TOKEN_DIET_READ_BUDGET", "8000"))
PASSTHRU_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".ipynb", ".svg"}
DEF_RE = re.compile(
    r"^\s*(export\s+)?(default\s+)?(public\s+|private\s+|protected\s+|internal\s+|static\s+|abstract\s+|final\s+|override\s+|async\s+|pub(\(crate\))?\s+)*"
    r"(def|class|function|func|fn|interface|type|struct|enum|trait|impl|module|namespace|record|object|const\s+\w+\s*=\s*(async\s*)?\(|let\s+\w+\s*=\s*(async\s*)?\()\b"
)
HEADING_RE = re.compile(r"^#{1,3}\s")


def allow():
    print("{}")
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        allow()
    ti = data.get("tool_input") or {}
    path = ti.get("file_path") or ""
    if not path or ti.get("limit"):
        allow()
    if not os.path.isfile(path) or os.path.splitext(path)[1].lower() in PASSTHRU_EXT:
        allow()

    project = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    rel = os.path.relpath(path, project) if os.path.isabs(path) else path
    allow_file = os.path.join(project, ".claude", "token-diet", "read-allow.txt")
    if os.path.exists(allow_file):
        for line in open(allow_file, encoding="utf-8", errors="ignore"):
            g = line.strip()
            if g and not g.startswith("#") and (fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(path, g)):
                allow()

    size = os.path.getsize(path)
    est = size // 4
    if est <= BUDGET:
        allow()

    outline, n = [], 0
    is_md = path.lower().endswith((".md", ".mdx", ".rst"))
    with open(path, encoding="utf-8", errors="ignore") as f:
        for i, line in enumerate(f, 1):
            n = i
            if len(outline) < 100 and ((HEADING_RE.match(line) if is_md else DEF_RE.match(line))):
                outline.append(f"{i}: {line.strip()[:120]}")

    reason = (
        f"token-diet read-guard: {rel} is ~{est:,} tokens ({n:,} lines), over the {BUDGET:,}-token whole-file budget. "
        f"Read only the slice you need with offset/limit (e.g. 150-300 lines around the target), "
        f"or locate it first with Grep / LSP / symbol tools.\n"
        + ("Outline (line: definition):\n" + "\n".join(outline) if outline else "No outline found; Grep for the symbol to get line numbers.")
        + "\nIf you truly need the whole file, read it in consecutive slices."
    )
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        allow()
