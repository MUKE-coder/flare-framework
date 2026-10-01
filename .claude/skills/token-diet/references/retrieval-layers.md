# Code intelligence & retrieval layers (Phases 0, 3, 4)

Rule: **LSP plugin always (if the language has one) + at most ONE of Serena / code-review-graph / claude-context.** Overlapping tools add tool definitions to context and duplicate reads.

## Recommending (Phase 0)

`detect.json.retrieval_recommendation` is a heuristic. Adjust with what you know:

| Situation | Recommend |
|---|---|
| Mostly typed languages (TS, Go, Rust, Java, C#, Kotlin) or Python; tasks are "edit function X" | **serena** |
| Many "what calls this / what breaks if I change this" questions, heavy PR review | **code-review-graph** |
| > 300k lines, inconsistent naming, frequent "where do we handle X?" questions; user OK with external embedding service | **claude-context** |
| Small-to-medium repo (< 50k lines) | **none** (LSP + native config is enough) |

Tell the user honestly: vendor-reported savings (Serena 60–80%, claude-context ~40%, code-review-graph 6–80x on reviews) are the authors' benchmarks; some users report Serena *increasing* usage on small tasks. Phase 7 benchmarks decide whether it stays.

## LSP code-intelligence plugins (Phase 3)

Official marketplace: `anthropics/claude-plugins-official`. Plugin names in `detect.json.lsp` are best guesses except `typescript-lsp` (documented). Confirm the real name before installing:

```bash
claude plugin marketplace add anthropics/claude-plugins-official
# find the manifest and list LSP plugin names
find ~/.claude/plugins -path '*claude-plugins-official*' -name marketplace.json -exec $PY -c "import json,sys; [print(p['name']) for p in json.load(open(sys.argv[1])).get('plugins',[]) if 'lsp' in p['name'] or 'analyzer' in p['name']]" {} \;
claude plugin install <name>@claude-plugins-official
```
If `claude plugin …` subcommands are unavailable in this version, give the user the exact `/plugin install <name>@claude-plugins-official` line to run and continue.

Each plugin needs its language-server binary on PATH (`detect.json.lsp.*.install` has the command). Global installs require user approval.

Team scope: `merge_settings.py .claude/settings.json --json '{"enabledPlugins":{"<name>@claude-plugins-official":true}}'`

## Option A — Serena

Symbol-level retrieval and editing via language servers. Local, no external service.

Prereq: `uv`/`uvx` (install: `curl -LsSf https://astral.sh/uv/install.sh | sh` — ask first).

```bash
claude mcp add --scope user serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project-from-cwd
claude mcp list          # expect: serena ... connected
```
Install from the official repo only (github.com/oraios/serena), not marketplace forks. Initial indexing of big projects takes minutes; to pre-index: `uvx --from git+https://github.com/oraios/serena serena project index` (if the command exists in the installed version; otherwise indexing happens on first use).

CLAUDE.md usage rule to append:
```markdown
## Serena
Prefer Serena's `get_symbols_overview`, `find_symbol`, `find_referencing_symbols` over reading whole files. For edits confined to one function/class, use `replace_symbol_body` / `insert_after_symbol`.
```

## Option B — code-review-graph

Local Tree-sitter graph in SQLite; blast-radius and review context over MCP.

```bash
pipx install code-review-graph      # or: pip install --user code-review-graph
code-review-graph install --platform claude-code
code-review-graph build
code-review-graph status
```
Keep it fresh: suggest adding `code-review-graph update` to `.git/hooks/post-commit` (ask), or run `code-review-graph watch` during sessions.

CLAUDE.md usage rule to append:
```markdown
## Code graph
Narrow scope with the code-review-graph tools first (minimal context, callers_of / callees_of / tests_for, impact radius), then read only the returned source. Never edit based on graph output alone.
```

## Option C — claude-context (Zilliz)

Hybrid BM25 + vector semantic search with AST chunking and incremental indexing.

**Requires explicit consent**: code chunks are sent to an embedding provider, embeddings stored in Milvus/Zilliz Cloud. Local alternative: Ollama embeddings + self-hosted Milvus (Docker).

Ask the user for: embedding provider + key (OpenAI / VoyageAI / Gemini / Ollama) and Milvus address/token (Zilliz Cloud free tier or local). Never write keys into committed files.

```bash
claude mcp add --scope user claude-context \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" -e MILVUS_TOKEN="$MILVUS_TOKEN" \
  -- npx @zilliz/claude-context-mcp@latest
claude mcp list
```
Then, in the next session, ask Claude to "index this codebase" with the claude-context tool (indexing runs via the MCP tool, not the CLI).

CLAUDE.md usage rule to append:
```markdown
## Semantic search
For "where is X handled / find code related to Y" questions, use the claude-context search tool before Grep. Read only the returned ranges.
```

## After any install

- Remove MCP servers the user no longer uses: `claude mcp list` → ask → `claude mcp remove <name>`.
- Prefer CLIs (`gh`, `aws`, `gcloud`) over MCP servers that duplicate them.
