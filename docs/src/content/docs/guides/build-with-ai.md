---
title: Building Flare apps with AI
description: An agent skill, a machine-readable docs index, and a prompt you can paste into any coding agent.
---

Flare generates most of an application from a description of a resource,
which makes it a good fit for a coding agent — there is less code to write
and more structure to follow. The catch is that an agent that doesn't know
the structure will fight it: hand-editing generated blocks, checking roles in
the wrong place, reaching for wrangler in a Next.js app.

Three things exist to prevent that.

## 1. The skill

```bash
npx skills add MUKE-coder/flare-framework@flare
```

Installs a [skill](https://skills.sh) your agent loads when it notices it is
in a Flare app. It carries the CLI reference, the field grammar, the rules
with the reasoning behind each, and recipes for relations, uploads, search,
auth, billing and policies.

It works with Claude Code, Codex, Copilot, Cursor, OpenCode and the rest —
the installer places it where each one looks.

## 2. `llms.txt`

[flare-docs.codetotech.com/llms.txt](/llms.txt) is every page on this site as
one list, with a one-line description each, in the
[llmstxt.org](https://llmstxt.org) format. Point an agent at it and it can
find the right page without crawling.

It is generated from the same content the sidebar is built from, so a page
that exists is listed.

## 3. The prompt

The **Build with AI** button at the bottom of every page copies a brief that
explains Flare to an agent from scratch: what it generates, how the two
stacks differ, the commands, the field grammar, the seven rules, the things
not to do, and a link to every relevant page. It ends with a blank for your
own description.

Paste it into a fresh conversation, say what you want built, and the agent
starts with the context it would otherwise spend your tokens guessing at.

## What to expect

An agent with this context is good at the parts Flare made mechanical:
descriptors, fields, relations, policies, seeds, the shape of a dashboard
page. It is much less good at the parts that are actually your application —
pricing rules, what a status transition means, which of two designs is
right.

That division is worth keeping. The generated two-thirds is where an agent
saves you real time; the remaining third is where it will confidently invent
something plausible and wrong. Review what it writes in `hooks` and
`policies` especially — those are the files where a mistake is a security
bug rather than a compile error.

## If you are the agent

Start here:

- [Choosing a stack](/start/stacks/) — establish which one before anything
  else; it changes the database, the ORM and the deploy.
- [The resource descriptor](/concepts/resource-descriptor/) — the source of
  truth everything is derived from.
- [The codegen overwrite contract](/concepts/codegen-contract/) — what
  survives regeneration and what doesn't. Read this before editing any
  generated file.
- [Roles and policies](/guides/roles-and-policies/) — the one place
  permissions are decided.
- [CLI reference](/reference/cli/) — every command, per stack.
