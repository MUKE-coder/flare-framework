---
paths:
  - "**/migrations/**"
---
# Migrations
- Never edit a migration that has been merged; create a new one.
- Generate with `{{MIGRATION_CMD}}`; don't hand-write timestamps.
- Every migration needs a working down/rollback.
