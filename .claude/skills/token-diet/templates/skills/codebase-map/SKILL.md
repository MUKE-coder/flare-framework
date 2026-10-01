---
name: codebase-map
description: Architecture and "where is X" map of this repository — modules, entry points, owners of each domain concept, and where cross-cutting concerns (auth, DB, config, jobs, errors) live. Use before exploring unfamiliar code, when locating where a feature or concept is implemented, or when planning a change that spans modules.
---
Read `${CLAUDE_SKILL_DIR}/MAP.md` and jump directly to the files it points to. Do not re-explore areas it covers.

If you find the map wrong or stale for an area you touched, fix that line in MAP.md at the end of the task (keep it terse; paths over prose). If asked to "refresh the codebase map", regenerate MAP.md with the scout subagent following the same section structure.
