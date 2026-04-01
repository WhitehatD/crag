---
name: post-start-validation
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

Execute the gates defined in governance.md, in order. Stop at first failure.

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
