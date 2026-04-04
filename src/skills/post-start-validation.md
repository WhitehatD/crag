---
name: post-start-validation
version: 0.2.2
source_hash: 5a64dfe68b13577dff818fa63ddb6185be360c80b100f205bc586aac39e19e80
description: Universal validation and knowledge capture. Detects what changed, runs governance gates, captures knowledge, verifies deployment. Works for any project.
---

# /post-start-validation

Run **after completing any task**. Discovers what changed, applies governance gates, captures knowledge, commits and verifies.

---

## 0. Shell Rule

Detect OS. Use Git Bash syntax on Windows (forward slashes, /dev/null).

---

## 1. Determine Scope

```
git diff --name-only HEAD 2>/dev/null || git status --short
```

Classify changes by detecting file patterns:
- **Frontend?** — `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.vue`, `.svelte` files
- **Backend?** — `.java`, `.kt`, `.py`, `.go`, `.rs`, `.rb` files
- **Infrastructure?** — `Dockerfile`, `docker-compose*`, `k8s/`, `.github/workflows/`, `*.tf`
- **Docs-only?** — `.md` files only outside source directories

> **Skip rules:** Docs-only → skip code checks. Infra-only → skip local checks.

---

## 2. Read Governance Gates

```
Read .claude/governance.md
```

> The governance file defines which gates to run and in what order. If it specifies "biome → tsc → build" — run exactly that. If it specifies "pytest" — run that. The gates are project-specific; this skill is not.

---

## 3. Run Gates

### 3.0. Workspace-aware gate execution

If the discovery cache indicates a workspace:
1. Read root governance gates (from workspace root `.claude/governance.md`)
2. Identify which members have changes: check `git diff --name-only HEAD` paths
3. For changed members with their own governance: read member governance, merge with root gates
4. Execute merged gates in order: root cross-stack gates first, then member-specific gates

### Gate annotations (v2 format)

**Path-scoped sections:** `### Frontend (path: frontend/)`
Before running any command in this section, `cd` into the specified directory. After the section completes, `cd` back to the project root. Example:
```bash
(cd frontend/ && npx biome check .) || exit 1
```

**Conditional sections:** `### TypeScript (if: tsconfig.json)`
Skip the ENTIRE section if the referenced file does not exist at project root. Check before running any gate in the section:
```bash
[ -e tsconfig.json ] || echo "Skipping TypeScript gates (no tsconfig.json)"
```

**Gate classifications** (suffix on individual gate lines):
- `# [MANDATORY]` (default) — stop execution on failure
- `# [OPTIONAL]` — log failure, print warning, continue to next gate
- `# [ADVISORY]` — always run, log result, never stop

When an OPTIONAL gate fails:
1. Print: `⚠ [OPTIONAL] <gate command> failed — continuing`
2. Record in gate_results.failed but do NOT exit
3. Proceed to the next gate in order

When an ADVISORY gate fails:
1. Print: `ℹ [ADVISORY] <gate command> failed (informational)`
2. Record in gate_results.failed for session state
3. Always proceed

**Inheritance marker:** `## Gates (inherit: root)`
When found in a member's governance.md, merge root gates first (prepend), then member gates (append). Execute in order.

### Standard execution (no annotations)

Execute the gates defined in governance.md, in order. Stop at first MANDATORY failure.

**Common patterns** (the governance file will specify which apply):

Frontend gates:
```
# Lint (biome, eslint, etc.)
# Type check (tsc --noEmit, mypy, etc.)
# Build (npm run build, etc.)
# Test (vitest, jest, pytest, etc.)
```

Backend gates:
```
# Compile (gradlew compileJava, cargo build, go build, etc.)
# Test (gradlew test, pytest, cargo test, go test, etc.)
# Check (gradlew check, clippy, etc.)
```

> Use `rtk` prefix on all commands for token compression.

---

## 3.5. Gate Auto-Fix (Bounded Retry)

If a gate command fails, attempt an automatic fix before escalating to the user.

**Step 1 — Classify the failure:**

| Error pattern | Classification | Action |
|---|---|---|
| Lint errors with auto-fix flag | **Auto-fixable** | Run linter with `--fix` / `--write` |
| Format errors (prettier, rustfmt, ruff, biome) | **Auto-fixable** | Run the formatter on affected files |
| Unused imports / variables | **Auto-fixable** | Remove them |
| Missing semicolons, trailing commas | **Auto-fixable** | Fix inline |
| Type errors in files you changed this session | **Maybe fixable** | Attempt one fix, re-run |
| Failing tests | **NOT auto-fixable** | Escalate — tests may be validating the change |
| Build errors from missing dependencies | **NOT auto-fixable** | Escalate |
| Errors in files you did NOT change | **NOT auto-fixable** | Escalate — pre-existing issue |

**Step 2 — If auto-fixable, apply the fix:**

```bash
# Lint auto-fix (use whichever the project has)
npx eslint --fix <files>           # or: npx biome check --write <files>
npx prettier --write <files>       # format
cargo clippy --fix --allow-dirty   # Rust
ruff check --fix <files>           # Python
ruff format <files>                # Python format
```

For other mechanical errors (unused imports, missing semicolons): edit the files directly.

**Auto-fix boundaries:**
- ONLY edit files within this repository
- NEVER install new global packages as a fix
- NEVER modify files outside the repo or system config
- NEVER delete files that weren't created this session
- If a fix requires out-of-bounds changes → escalate to user

**Step 3 — Re-run ONLY the failed gate.** Do not re-run gates that already passed.

**Step 4 — Bounded retry:**
- Maximum **2 auto-fix attempts** per gate
- If the same gate fails after 2 attempts → **stop and escalate to the user**
- Never retry the exact same fix that didn't work
- The circuit breaker hook (`PostToolUseFailure`) provides an additional safety net

**Step 5 — After ALL gates pass, write the sentinel:**

```bash
touch .claude/.gates-passed
```

This sentinel is:
- **Checked** by the auto-post-start hook before commits
- **Cleared** by pre-start-context at the beginning of each session
- Ensures gates are verified at least once per session before any commit

---

## 4. Cross-Stack Consistency

If both frontend and backend changed, verify alignment:
- API contracts match (routes, types, schemas)
- New environment variables added to `.env.example`
- Docker/K8s configs updated if services changed
- Migration files don't conflict

> Read governance.md for project-specific alignment points.

---

## 5. Security Review

```
Grep -rn "sk_live\|sk_test\|AKIA\|password.*=.*['\"]" . --type ts --type java --type py 2>/dev/null | grep -v node_modules | grep -v test | grep -v example | head -20
```

For every new endpoint/route added:
- Authentication required (unless explicitly public)?
- Input validation present?
- No mass-assignment (explicit DTOs, not raw entity binding)?

> Read governance.md for project-specific security requirements (rate limiting, file upload rules, auth patterns).

---

## 6. Documentation

If changes introduced new endpoints, services, env vars, or architecture changes — update README.

If changes are bug fixes, refactors, tests, CSS — skip.

---

## 7. Knowledge Capture

If MemStack rules exist (`.claude/rules/diary.md`), follow them — add-insight, add-session, set-context.

If not, at minimum report:
- What was done
- Key decisions made and why
- Any gotchas discovered
- What to do next session

---

## 8. Self-Update

Check: did any governance rule get violated during this session? Did any discovery instruction find something unexpected?

**If governance was violated:** Flag it to the user. Do NOT change governance.md.

**If the pre-start or post-start skill itself had a gap** (missing a check, wrong assumption): Update the skill file. Log the change.

> Discovery instructions rarely need updating — they read the filesystem. Governance rules only change when the user decides.

---

## 9. Commit & Deploy

Read governance.md for:
- Branch strategy (feature branches or trunk-based?)
- Commit convention (conventional commits or free-form?)
- Autonomy level (auto-commit after gates or ask first?)

Execute accordingly:

```
git add <files>
git commit -m "<type>: <description>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Then:
- Push to remote
- Monitor CI (if configured): `gh run list --limit 3`
- Verify deployment (if governance specifies how)

### Branch cleanup (if feature branch workflow)

After merge:
```
git branch -d <branch-name>
```

---

## Skip Rules

| Change type | Skip |
|---|---|
| Docs-only | S3-S5 |
| Infra-only | S3 (local gates), S6 |
| Backend-only (no API change) | Frontend gates |
| Frontend-only (no API change) | Backend gates |
| CSS/styling only | Backend gates, S4, S5 |

---

## 10. Write Session State

Write `.claude/.session-state.json` for warm starts next session:

```json
{
  "version": 1,
  "timestamp": "<ISO 8601 — use: date -u +%Y-%m-%dT%H:%M:%SZ>",
  "branch": "<current branch>",
  "commit": "<HEAD short hash>",
  "task_summary": "<one-line summary of what was accomplished>",
  "gate_results": {
    "passed": ["<gate commands that passed>"],
    "failed": ["<gate commands that failed — empty if all passed>"],
    "auto_fixed": ["<gates that needed auto-fix before passing>"]
  },
  "files_changed": ["<files modified this session>"],
  "open_questions": ["<unresolved decisions or ambiguities>"],
  "next_steps": ["<suggested actions for next session>"]
}
```

This file is consumed by pre-start Section 0.1 for warm starts. It enables the next session to:
- Skip re-explaining context if the user is continuing the same work
- Surface open questions and next steps immediately
- Combined with the discovery cache, achieve near-zero-latency startup
