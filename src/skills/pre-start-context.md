---
name: pre-start-context
version: 0.2.2
source_hash: b7be8434b99d5b189c904263e783d573c82109218725cc31fbd4fa1bf81538b6
description: Universal context loader. Discovers any project's stack, architecture, and state at runtime. Reads governance.md for project-specific rules. Works for any language, framework, or deployment target.
---

# /pre-start-context

Run this **before starting any task**. It discovers the project, loads cross-session knowledge, and applies your governance rules — all from the filesystem, nothing hardcoded.

> **Chain:** pre-start → task → /post-start-validation. Do not skip post-start.

---

## 0. Execution Policy

Read `.claude/governance.md` for project-specific rules. If it exists, its policies override defaults below.

### Sandbox Boundaries

All tools and subagents MUST operate within these limits:

- **Filesystem:** Write/delete ONLY within this repository (`git rev-parse --show-toplevel`). Read access is broader for discovery, but mutations stay in-repo.
- **Network:** Only access resources explicitly required by the task (package registries, CI APIs, documented endpoints). NEVER pipe remote content to a shell (`curl|bash`, `wget|sh`).
- **System:** NEVER modify system files, global packages, PATH, system services, or environment outside this process.
- **Destructive commands — NEVER run:**
  - `rm -rf` on paths above the project root, `/`, `~`, `$HOME`
  - `dd`, `mkfs`, `fdisk`, `parted` (raw disk operations)
  - `shutdown`, `reboot`, `halt`, `init 0/6`
  - `DROP TABLE/DATABASE/SCHEMA` without explicit user confirmation
  - `docker system prune -a`, `kubectl delete namespace`
  - `git push --force` to main/master
  - `chmod -R 777` or recursive permission changes outside repo
- **Subagents:** Spawned agents inherit these boundaries. Agent definitions should include `## Boundaries` referencing these rules. Subagents MUST NOT escalate their own permissions.

> The `sandbox-guard.sh` hook enforces these rules at the system level. Even if instructions are misread, destructive commands are hard-blocked.

**Default AUTO-EXECUTE (unless governance overrides):**
- Reading files, build, compile, test, lint, format, git operations, package management, environment checks
- Any command operating on files within this repository

**Default ASK FIRST:**
- Destructive infrastructure (rm containers, drop databases, delete volumes)
- Production deployments
- Secrets/credentials modification
- System-level changes outside this repository

### Shell Rule

Detect OS and shell. Use appropriate syntax (Unix forward slashes if Git Bash on Windows).

---

## 0.05. Skill Currency Check

Check installed skill version:

```
Read .claude/skills/pre-start-context/SKILL.md
```

If the file has a `version:` frontmatter field, compare it to the expected version (0.2.0). If outdated:
- Report: `"Pre-start skill vX.Y.Z is outdated (v0.2.0 available). Run: crag upgrade"`
- Continue with current version — never block startup.

> This check costs one Read call. If skills are current, no action needed.

---

## 0.1. Session Continuity (Warm Start)

Check for a previous session state:

```
Read .claude/.session-state.json
```

If the file exists, check:
- **Timestamp:** Less than 4 hours old?
- **Branch:** Same as current? (`git branch --show-current`)
- **Commit:** Same or ancestor of HEAD? (`git merge-base --is-ancestor <cached-commit> HEAD`)

**Warm start** (all three pass):
- Report: `"Warm start — continuing from <N> minutes ago: <task_summary>"`
- Previous session's open questions and next steps are immediately relevant
- If discovery cache is also valid (Section 0.3), most discovery is skipped
- Skip full MemStack loading if session was recent (< 1 hour) — just load new insights

**Cold start** (any check fails):
- Treat as a fresh session. Full discovery.
- Stale `.claude/.session-state.json` can be ignored

---

## 0.2. Intent Classification

Before running discovery, classify the task scope from the user's message or skill arguments.

| Signals in user message | Scope | Discovery to skip |
|---|---|---|
| component, style, CSS, UI, page, layout, form, React, Vue | **Frontend** | Backend runtimes, backend architecture |
| API, endpoint, database, migration, model, query, auth, server | **Backend** | Frontend architecture, frontend configs |
| Docker, deploy, CI, k8s, infra, pipeline, workflow, terraform | **Infra** | Code architecture (keep runtimes for CI) |
| README, docs, changelog, license, typo | **Docs** | All code + infra discovery |
| Ambiguous, multiple domains, or no clear signal | **Full** | Nothing — run everything |

Set the discovery scope. Sections 1–3 respect it — skip domains outside scope. Section 4 (Governance) and Section 0.6 (Context Loading) always run regardless of scope.

> **Override:** If governance.md contains `## Discovery: full`, always do full discovery regardless of intent.

---

## 0.3. Discovery Cache (Fast Path)

Check for a cached discovery state:

```
Read .claude/.discovery-cache.json
```

If the cache exists:

1. Get current state:

// turbo
```
git rev-parse --short HEAD
```

// turbo
```
git branch --show-current
```

2. Compare to cached `commit` and `branch`
3. Check if timestamp is less than 4 hours old

**Decision tree:**

- **Same commit + same branch + < 4 hours → FAST PATH**
  Skip Sections 0.5, 1, 2, 3, 5 entirely. Use cached runtimes, architecture, key files.
  Still run: Section 0.6 (context loading — MemStack may have new data), Section 4 (governance — may have changed).
  Report: `"Fast path — cached discovery (N min old, commit XXXXXX). Skipping full scan."`

- **Different commit + < 4 hours → INCREMENTAL**
  Run: `git diff --name-only <cached-commit>..HEAD`
  Only re-discover domains where files changed:
    - `package.json`, `tsconfig.json`, `.js/.ts` files → re-run Node/frontend discovery
    - `Cargo.toml`, `.rs` files → re-run Rust discovery
    - `pyproject.toml`, `.py` files → re-run Python discovery
    - `go.mod`, `.go` files → re-run Go discovery
    - `build.gradle.kts`, `.java/.kt` files → re-run Java discovery
    - `Dockerfile`, `docker-compose*` → re-run infra discovery
    - `governance.md` → always re-read (Section 4)
  Keep cached data for unchanged domains.
  Report: `"Incremental discovery — N files changed since cached session."`

- **No cache OR > 4 hours OR different branch → FULL DISCOVERY**
  Run Sections 0.5 through 5 as normal (current behavior).
  Report: `"Full discovery — no valid cache."`

**Also at session start:** Delete `.claude/.gates-passed` if it exists — gates must be re-verified each session.

```
rm -f .claude/.gates-passed 2>/dev/null
```

> The fast path reduces pre-start from 15+ tool calls to 3-4. The incremental path only re-discovers what changed. Full discovery is the fallback.

---

## 0.5. Stack Health

Check what optimization tools are available (non-blocking — skip if missing):

// turbo
```
headroom --version 2>/dev/null && echo "Headroom: OK" || echo "Headroom: not installed"
```

// turbo
```
rtk --version 2>/dev/null && echo "RTK: OK" || echo "RTK: not installed"
```

// turbo
```
curl -s http://localhost:8787/health 2>/dev/null && echo "Headroom proxy: running" || echo "Headroom proxy: not running"
```

---

## 0.6. Context Loading

### Step 0: What changed since last session?

```
git log --oneline -5 2>/dev/null || echo "Not a git repo or no commits"
```

```
git diff --stat HEAD~5 -- . ':!node_modules' ':!.next' ':!build' ':!target' ':!dist' ':!__pycache__' 2>/dev/null | tail -10
```

> **Adaptive depth:** If nothing changed, abbreviate S1-S4. If only one module changed, focus there. If major structural changes, do a full deep read.

### Step 1: Load cross-session memory (if available)

Check for MemStack:
```
ls .claude/rules/echo.md 2>/dev/null && echo "MemStack rules: loaded" || echo "MemStack: not configured"
```

If MemStack rules exist, follow them — they trigger context loading from the SQLite database (get-context, get-sessions, get-insights, stale-insights verification).

### Step 2: Check CI health

Detect CI system and check recent runs:
```
ls .github/workflows/*.yml 2>/dev/null && echo "CI: GitHub Actions" || true
ls .gitlab-ci.yml 2>/dev/null && echo "CI: GitLab CI" || true
ls Jenkinsfile 2>/dev/null && echo "CI: Jenkins" || true
```

```
gh run list --limit 3 2>/dev/null || echo "gh CLI not available or not authenticated"
```

### Step 3: Periodic audits (if due)

```
bash -c 'LAST=$(stat -c %Y .claude/.last-audit 2>/dev/null || echo 0); NOW=$(date +%s); DAYS=$(( (NOW - LAST) / 86400 )); if [ "$DAYS" -ge 7 ]; then echo "AUDIT DUE: $DAYS days"; else echo "Audit current ($DAYS days ago)"; fi'
```

> If due, spawn skill-auditor and dependency-scanner as background agents after pre-start.

---

> **Tool preference:** Use **Read** instead of `cat`, **Glob** instead of `ls`, **Grep** instead of `grep`. Built-in tools are more token-efficient and enable parallel execution.

## 1. Environment Discovery

Detect the runtime:

// turbo
```
node --version 2>/dev/null
```

// turbo
```
java --version 2>&1 | head -1 2>/dev/null
```

// turbo
```
python3 --version 2>/dev/null || python --version 2>/dev/null
```

// turbo
```
go version 2>/dev/null
```

// turbo
```
rustc --version 2>/dev/null
```

// turbo
```
git --version
```

// turbo
```
docker --version 2>/dev/null
```

> Only relevant runtimes will return output. Note what's available.

---

## 1.5. Workspace Detection

Check if this project is part of a larger workspace:

### Workspace markers (check in order)

```
ls pnpm-workspace.yaml 2>/dev/null && echo "Workspace: pnpm"
```

```
Read package.json
```
> Check for `"workspaces"` field. If present → npm/yarn workspace.

```
ls Cargo.toml 2>/dev/null
```
> Check for `[workspace]` section. If present → Cargo workspace.

```
ls go.work 2>/dev/null && echo "Workspace: Go"
```

```
ls settings.gradle.kts settings.gradle 2>/dev/null && echo "Workspace: Gradle"
```

```
ls nx.json turbo.json 2>/dev/null && echo "Workspace: Nx/Turbo"
```

```
ls .gitmodules 2>/dev/null && echo "Workspace: git submodules"
```

If a workspace marker is found:
1. Enumerate member packages/modules
2. Check each member for `.claude/governance.md`
3. Note the workspace type and member list in the discovery cache

### Multi-level governance

If members have their own governance files, load the hierarchy:
- Root governance gates are mandatory for all members
- Member governance gates are additive
- When running gates (in post-start), merge root + member gates

### Independent nested repos

If no workspace marker found but multiple `.git` directories exist in child directories:
- Classify as independent-repos workspace
- Each child with `.git` is a member
- Report: `"Workspace: independent repos (N members)"`

---

## 2. Project Identity

Detect the project type and read its configuration:

// turbo
```
Read README.md
```

**Detect build system and read config:**

// turbo
```
Read package.json
```

// turbo
```
Read build.gradle.kts
```

// turbo
```
Read settings.gradle.kts
```

// turbo
```
Read Cargo.toml
```

// turbo
```
Read pyproject.toml
```

// turbo
```
Read go.mod
```

> Most of these will return "file not found" — that's fine. The ones that exist tell you the stack. Read `.env.example` or `.env.template` if they exist for environment variable documentation.

---

## 3. Architecture Map

Discover how the project is structured:

**Frontend (if detected):**
```
Read next.config.ts 2>/dev/null || Read next.config.js 2>/dev/null || Read vite.config.ts 2>/dev/null
```

```
Glob src/app/* 2>/dev/null || Glob src/pages/* 2>/dev/null || Glob app/* 2>/dev/null
```

**Backend (if detected):**
```
Glob src/main/java/**/controller/* 2>/dev/null || Glob src/controllers/* 2>/dev/null || Glob app/api/* 2>/dev/null
```

**Services (if multi-service):**
```
Read docker-compose.yml 2>/dev/null || Read docker-compose.yaml 2>/dev/null
```

```
Glob infrastructure/k8s/services/*/deployment.yaml 2>/dev/null || Glob k8s/**/deployment.yaml 2>/dev/null
```

**CI/CD:**
```
Read .github/workflows/*.yml 2>/dev/null
```

> Count what you find. Note the patterns. Don't hardcode anything — next session will re-discover.

---

## 4. Governance

```
Read .claude/governance.md
```

> This file contains YOUR rules — quality bar, security requirements, gate commands, branch strategy, conventions. Apply everything in it to this session. If it doesn't exist, use sensible defaults.

---

## 5. Key Files

Discover critical files by pattern, not by hardcoded path:

```
Glob **/application.yml **/application.yaml **/application.properties 2>/dev/null
```

```
Glob **/.env.example **/.env.template 2>/dev/null
```

```
Glob **/Dockerfile **/docker-compose*.yml 2>/dev/null
```

```
Glob **/*.config.ts **/*.config.js **/tsconfig.json 2>/dev/null
```

> Build a mental map of what exists. This is your reference for the rest of the session.

---

## 6. Write Discovery Cache

After completing discovery (full or incremental), write the cache for next session.

Get the current commit and branch:

// turbo
```
git rev-parse --short HEAD
```

// turbo
```
git branch --show-current
```

Write `.claude/.discovery-cache.json` containing:

```json
{
  "version": 1,
  "timestamp": "<ISO 8601 — use: date -u +%Y-%m-%dT%H:%M:%SZ>",
  "branch": "<current branch>",
  "commit": "<HEAD short hash>",
  "runtimes": {
    "node": "<version or null>",
    "java": "<version or null>",
    "python": "<version or null>",
    "go": "<version or null>",
    "rust": "<version or null>",
    "git": "<version>",
    "docker": "<version or null>"
  },
  "stack_health": {
    "headroom": "<version or null>",
    "rtk": "<version or null>",
    "headroom_proxy": true/false
  },
  "architecture": {
    "type": "<monolith|microservices|cli|library|monorepo>",
    "frontend": "<framework or null>",
    "backend": "<framework or null>",
    "services": ["<service names if multi-service>"],
    "ci": "<github-actions|gitlab-ci|jenkins|none>"
  },
  "key_files": ["<list of discovered config/build files that exist>"]
}
```

> Cost: one Write call. Savings: 10-15 tool calls skipped on next fast path. The cache is purely advisory — if it's wrong or missing, full discovery runs as normal.
