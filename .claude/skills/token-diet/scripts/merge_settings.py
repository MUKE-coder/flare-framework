#!/usr/bin/env python3
"""token-diet: safely merge settings into a Claude Code settings file.

Never overwrites: dicts merge recursively, lists are unioned (order kept, duplicates dropped).
A timestamped backup is written to .claude/token-diet/backup/ before any change.

Usage:
  merge_settings.py <settings-file> --deny-from .claude/token-diet/detect.json [--include-review]
  merge_settings.py <settings-file> --deny "Read(./dist/**/*)" --deny "Read(./vendor/**/*)"
  merge_settings.py <settings-file> --hooks            # register read_guard + filter_test_output
  merge_settings.py <settings-file> --json '{"enabledPlugins": {"typescript-lsp@claude-plugins-official": true}}'
  merge_settings.py <settings-file> --remove-hooks     # undo --hooks
  add --dry-run to print the result without writing.
"""
import argparse, json, os, shutil, sys, time

# `python3` isn't on PATH on plain Windows installs (only `python` is), and
# hook commands are baked into settings.json verbatim, so resolve whichever
# interpreter this machine actually has at merge time instead of hardcoding it.
PYTHON_CMD = "python3" if shutil.which("python3") else "python"


def hooks_patch(python_cmd):
    return {
        "hooks": {
            "PreToolUse": [
                {"matcher": "Read", "hooks": [{"type": "command", "command": f"{python_cmd} \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/read_guard.py"}]},
                {"matcher": "Bash", "hooks": [{"type": "command", "command": f"{python_cmd} \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/filter_test_output.py"}]},
            ]
        }
    }


HOOKS = hooks_patch(PYTHON_CMD)


def merge(a, b):
    if isinstance(a, dict) and isinstance(b, dict):
        out = dict(a)
        for k, v in b.items():
            out[k] = merge(a[k], v) if k in a else v
        return out
    if isinstance(a, list) and isinstance(b, list):
        out = list(a)
        seen = {json.dumps(x, sort_keys=True) for x in a}
        for x in b:
            key = json.dumps(x, sort_keys=True)
            if key not in seen:
                out.append(x); seen.add(key)
        return out
    return b


def backup(path):
    if not os.path.exists(path):
        return None
    root = os.getcwd()
    dest_dir = os.path.join(root, ".claude", "token-diet", "backup", time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, os.path.relpath(os.path.abspath(path), root).replace(os.sep, "__"))
    shutil.copy2(path, dest)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("settings")
    ap.add_argument("--deny", action="append", default=[])
    ap.add_argument("--deny-from")
    ap.add_argument("--include-review", action="store_true")
    ap.add_argument("--hooks", action="store_true")
    ap.add_argument("--remove-hooks", action="store_true")
    ap.add_argument("--json")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    current = {}
    if os.path.exists(a.settings):
        try:
            with open(a.settings) as f:
                current = json.load(f)
        except json.JSONDecodeError as e:
            sys.exit(f"ERROR: {a.settings} is not valid JSON ({e}). Fix it first; nothing changed.")

    patch = {}
    deny = list(a.deny)
    if a.deny_from:
        d = json.load(open(a.deny_from))
        deny += [r["rule"] for r in d.get("suggested_deny_rules", [])]
        if a.include_review:
            deny += [r["rule"] for r in d.get("review_before_deny", [])]
    if deny:
        patch = merge(patch, {"permissions": {"deny": deny}})
    if a.hooks:
        patch = merge(patch, HOOKS)
    if a.json:
        patch = merge(patch, json.loads(a.json))

    new = merge(current, patch)

    if a.remove_hooks:
        pre = new.get("hooks", {}).get("PreToolUse", [])
        markers = ("read_guard.py", "filter_test_output.py")

        def is_ours(h):
            cmds = " ".join(c.get("command", "") for c in h.get("hooks", []))
            return any(m in cmds for m in markers)

        new.setdefault("hooks", {})["PreToolUse"] = [h for h in pre if not is_ours(h)]
        if not new["hooks"]["PreToolUse"]:
            del new["hooks"]["PreToolUse"]
        if not new["hooks"]:
            del new["hooks"]

    text = json.dumps(new, indent=2) + "\n"
    if a.dry_run:
        print(text); return
    if new == current:
        print(f"{a.settings}: no changes needed"); return
    b = backup(a.settings)
    os.makedirs(os.path.dirname(os.path.abspath(a.settings)), exist_ok=True)
    with open(a.settings, "w") as f:
        f.write(text)
    added = len(new.get("permissions", {}).get("deny", [])) - len(current.get("permissions", {}).get("deny", []))
    print(f"updated {a.settings}" + (f" (backup: {b})" if b else " (new file)") + (f"; +{added} deny rules" if added else ""))


if __name__ == "__main__":
    main()
