# Session habits (copy into REPORT.md for the human)

1. **One task per session.** `/clear` between unrelated tasks (`/rename` first, `/resume` later). `/clear` is free; `/compact` is itself a big request.
2. **Be specific.** Name the file/function: "add `email_verified` to `User` in `src/models/user.py` and its serializer". Vague asks ("improve X") trigger broad scanning.
3. **Launch inside the subsystem** (`cd services/billing && claude`) for local tasks; `--add-dir ../shared` when needed.
4. **Plan mode (Shift+Tab)** for multi-file changes; the plan file survives compaction.
5. **Stop early.** Esc as soon as it goes wrong; `/rewind` instead of arguing it back on course.
6. **Mind the cache.** Coming back to a huge session after a long break re-processes the whole context — start fresh or resume from summary.
7. **Big investigations → "use the scout agent"** so file reads stay out of your main context.
8. **Watch context** (`/context`, or status line) and `/compact <what to keep>` before auto-compact.
9. **Check `/usage` weekly**: which MCP servers, skills, subagents cost the most. Remove what doesn't pay.
10. **Regenerate the codebase map** after big restructures: "refresh the codebase-map skill".
