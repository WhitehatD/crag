---
trigger: always_on
description: Governance rules for @whitehatd/crag — compiled from governance.md by crag
---

# Windsurf Rules — @whitehatd/crag

Generated from governance.md by crag. Regenerate: `crag compile --target windsurf`

## Project

Make every AI agent obey your codebase. One governance.md → compiled to CI, hooks, and every agent. No drift.

**Stack:** node

## Runtimes

node

## Cascade Behavior

When Windsurf's Cascade agent operates on this project:

- **Always read governance.md first.** It is the single source of truth for quality gates and policies.
- **Run all mandatory gates before proposing changes.** Stop on first failure.
- **Respect classifications.** OPTIONAL gates warn but don't block. ADVISORY gates are informational.
- **Respect path scopes.** Gates with a `path:` annotation must run from that directory.
- **No destructive commands.** Never run rm -rf, dd, DROP TABLE, force-push to main, curl|bash, docker system prune.
- - No hardcoded secrets — grep for sk_live, AKIA, password= before commit
- **Conventional commits.** Every commit must follow `<type>(<scope>): <description>`.
- **Commit trailer:** Co-Authored-By: Claude <noreply@anthropic.com>

## Quality Gates (run in order)

1. `node test/all.js`
2. `node --check bin/crag.js`
3. `node bin/crag.js help > /dev/null`
4. `node bin/crag.js version`
5. `node bin/crag.js analyze --dry-run > /dev/null`
6. `node bin/crag.js upgrade --check > /dev/null`
7. `node bin/crag.js workspace --json > /dev/null`

## Rules of Engagement

1. **Minimal changes.** Don't rewrite files that weren't asked to change.
2. **No new dependencies** without explicit approval.
3. **Prefer editing** existing files over creating new ones.
4. **Always explain** non-obvious changes in commit messages.
5. **Ask before** destructive operations (delete, rename, migrate schema).

---

**Tool:** crag — https://www.npmjs.com/package/@whitehatd/crag
