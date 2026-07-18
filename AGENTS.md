<!-- crag:auto-start -->
# AGENTS.md

> Generated from governance.md by [crag](https://crag.sh). Regenerate: `crag compile --target agents-md`

## Project: @whitehatd/crag

Make every AI agent obey your codebase. One governance.md → compiled to CI, hooks, and every agent. No drift.

## Quality Gates

All changes must pass these checks before commit:

### Test
1. `node test/all.js`

### Build
1. `node --check bin/crag.js`
2. `node --check bin/crag-mcp.js`

### Ci (inferred from workflow)
1. `node bin/crag.js help > /dev/null`
2. `node bin/crag.js version`
3. `node bin/crag.js analyze --dry-run > /dev/null`
4. `node bin/crag.js upgrade --check > /dev/null`
5. `node bin/crag.js workspace --json > /dev/null`

## Coding Standards

- Stack: node
- Conventional commits (feat:, fix:, docs:, etc.)
- Commit trailer: Co-Authored-By: Claude <noreply@anthropic.com>

## Architecture

- Type: cli
- Entry: bin/crag.js, bin/crag-mcp.js

## Key Directories

- `.circleci/` — CI/CD
- `.github/` — CI/CD
- `assets/` — static assets
- `bin/` — executables
- `docs/` — documentation
- `scripts/` — tooling
- `src/` — source
- `test/` — tests

## Code Style

- Indent: 2 spaces

## Anti-Patterns

Do not:
- Do not write absolute local paths in governance (e.g. `D:/project/src/`) — use relative paths only (e.g. `src/`). Governance files are checked into the repo and must remain portable across machines.
- Do not leave `console.log` in production code — use a proper logger
- Do not use synchronous filesystem APIs in request handlers

## Security

- No hardcoded secrets — grep for sk_live, AKIA, password= before commit

## Workflow

1. Read `AGENTS.md` at the start of every session — it is the single source of truth.
2. Run all mandatory quality gates before committing.
3. If a gate fails, fix the issue and re-run only the failed gate.
4. Use the project commit conventions for all changes.

<!-- crag:auto-end -->

