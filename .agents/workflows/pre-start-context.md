---
description: Universal context loader. Discovers any project's stack, architecture, and state at runtime. Reads governance.md for project-specific rules. Works for any language, framework, or deployment target.
---

# /pre-start-context

Run this **before starting any task**. It discovers the project, loads cross-session knowledge, and applies your governance rules — all from the filesystem, nothing hardcoded.

> **Chain:** pre-start → task → /post-start-validation. Do not skip post-start.

---

## 0. Execution Policy

Read `.claude/governance.md` for project-specific rules. If it exists, its policies override defaults below.

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
