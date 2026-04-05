# Claude Code integration

When `crag init` sets up a Claude Code project, each session runs:

```
/pre-start-context       Discover project, load governance, cache runtimes
   ↓
   (the task)
   ↓
/post-start-validation   Run gates, auto-fix lint/format, commit
```

## /pre-start-context

Reads `governance.md` fresh every session, classifies task intent
(frontend / backend / infra / docs / full), and uses a content-hashed
discovery cache to skip ~80 % of redundant scans on unchanged code.

The discovery cache lives at `.claude/.discovery-cache.json` and is
keyed on the current git commit hash. A session on the same commit
reuses cached runtime detection, architecture map, and key-file list;
a session on a different commit triggers an incremental re-scan only
for the files that actually changed.

## /post-start-validation

Runs gates in the order declared in `governance.md`, stops on
`[MANDATORY]` failure, retries mechanical errors (lint, format) up to
twice with auto-fix, runs a security review, and creates a
conventional-commit commit when everything passes.

Gate-level auto-fix rules:

| Error pattern | Classification | Action |
|---|---|---|
| Lint errors with auto-fix flag | Auto-fixable | Re-run linter with `--fix` / `--write` |
| Format errors (prettier, rustfmt, ruff, biome) | Auto-fixable | Run formatter on affected files |
| Unused imports / variables | Auto-fixable | Remove them |
| Missing semicolons, trailing commas | Auto-fixable | Edit inline |
| Type errors in files changed this session | Maybe fixable | One attempt, re-run |
| Failing tests | NOT auto-fixable | Escalate — tests may be validating the change |
| Build errors from missing dependencies | NOT auto-fixable | Escalate |
| Errors in files not changed | NOT auto-fixable | Escalate — pre-existing |

Maximum 2 auto-fix attempts per gate. On the second failure, the skill
escalates to the user. The circuit-breaker hook
(`PostToolUseFailure`) provides an additional safety net.

## Universal skills

Both skills are universal — they ship with crag, never get edited per
project, and adapt to the current codebase via runtime discovery
rather than hardcoded paths.

Versions are tracked in the skill frontmatter along with a CRLF-
normalized SHA-256 of the body. `crag upgrade --check` compares
installed versions against the crag CLI's bundled versions and
reports what would change. `crag upgrade` performs the update, with a
timestamped backup for any skill the user has locally modified.

## Session state (warm starts)

After a successful session, `/post-start-validation` writes
`.claude/.session-state.json` with:

- `timestamp` — ISO 8601 UTC
- `branch` + `commit` — to verify the next session is on the same head
- `task_summary` — one-line of what was accomplished
- `gate_results` — which gates passed, failed, or auto-fixed
- `files_changed` — list of modified files
- `open_questions` — unresolved decisions
- `next_steps` — suggested actions

`/pre-start-context` reads this file on startup. If the timestamp is
< 4 hours old and branch + commit match, it skips full discovery and
continues the previous session's context. This enables near-zero-
latency startup on continuing work.
