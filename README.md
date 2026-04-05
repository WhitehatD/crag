# crag

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![228 tests](https://img.shields.io/badge/tests-228%20passing-brightgreen)](./test)
[![Security hardened](https://img.shields.io/badge/security-hardened-brightgreen)](./SECURITY.md)

**The bedrock layer for AI coding agents. One `governance.md`. Any project. Never stale.**

Write your AI agent rules once. Enforce them in **Claude Code, Cursor, Copilot, Codex, Gemini, Aider, Cline, Continue, Windsurf, Zed, and Sourcegraph Cody** — plus your CI pipeline and git hooks. From a single 20-line file.

```bash
npx @whitehatd/crag init        # Interview → generate governance
npx @whitehatd/crag analyze     # Or skip the interview: infer from existing project
npx @whitehatd/crag compile --target all   # Output for 12 downstream tools
```

> **The one-sentence pitch:** Every other AI coding tool ships static config files that hardcode your project's current shape. They rot. crag ships a runtime discovery engine plus a single governance file — the engine reads the filesystem every session so it never goes stale, and the governance is your rules, not your paths.

---

## The 12-target pitch, visually

```
                     ┌──────────────────┐
                     │  governance.md   │    ← you maintain this (20-30 lines)
                     │  one file        │
                     └────────┬─────────┘
                              │
                      crag compile
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  ┌─────┴──────┐        ┌─────┴──────┐        ┌─────┴──────┐
  │ CI / hooks │        │ AI native  │        │ AI extras  │
  ├────────────┤        ├────────────┤        ├────────────┤
  │ GitHub CI  │        │ AGENTS.md  │        │ Copilot    │
  │ husky      │        │ Cursor     │        │ Cline      │
  │ pre-commit │        │ Gemini     │        │ Continue   │
  └────────────┘        └────────────┘        │ Windsurf   │
                                              │ Zed        │
                                              │ Cody       │
                                              └────────────┘
```

Change one line in `governance.md`, re-run `crag compile --target all`, and 12 downstream configs regenerate. Your rules, your CI, your git hooks, and 9 different AI coding agents all stay in lock-step from a single source.

---

## Why "crag"?

A crag is a rocky outcrop — an unmoving landmark that stands while seasons, paths, and generations change around it. That's exactly what this tool is. Your skills discover. Your gates run. Your CI regenerates. But `governance.md` — the crag — doesn't move until you say so. Your AI agents anchor to it.

---

## Proven in Production

Not on demos. On real systems, in production, shipping to real infrastructure.

| Project | Stack | Services | Deployment | Result |
|---|---|---|---|---|
| **example-app** | Full-stack | Monolith | Docker | Full-stack governance generated |
| **example-app** | Multi-service | Services | Kubernetes | Multi-level governance hierarchy |
| **example-app** | Multi-language | Services | Docker Compose | Multiple languages detected, gates generated |
| **crag** | Node.js CLI | Single module | npm | Scaffolds itself — full dogfooding, 159 tests, zero deps |

The same universal skills — written once, never modified per project — discovered multiple projects across varied stacks. Zero project-specific instructions in the skills. They discovered everything.

---

## The Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Ships with crag (universal — same for every project)       │
│                                                              │
│  ┌──────────────────────┐        ┌──────────────────────┐   │
│  │  pre-start skill     │        │  post-start skill    │   │
│  │  discovers ANY       │        │  validates using     │   │
│  │  project             │        │  YOUR gates          │   │
│  └──────────┬───────────┘        └──────────┬───────────┘   │
└─────────────┼───────────────────────────────┼───────────────┘
              │                               │
              │  reads at runtime             │  reads at runtime
              ▼                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Generated from interview or analyze (project-specific)     │
│                                                              │
│      ┌────────────────────────────────────────────┐          │
│      │  governance.md — 20-30 lines of YOUR rules │          │
│      └────────────────────────────────────────────┘          │
│                                                              │
│  Also generated:  hooks/    agents/    settings              │
└──────────────────────────────────────────────────────────────┘
```

The skills ship once and work forever. They don't know your stack — they discover it. They don't know your gates — they read them from governance.md. Add a service, change your CI, switch frameworks — the skills adapt. Nothing to update.

### The Core Insight: Discovery vs Governance

Every other tool in this space mixes "how to find things" with "what to enforce." crag separates them cleanly:

- **Discovery** (universal skills) — reads the filesystem, detects runtimes, maps architecture, finds configs. Works on any project without modification.
- **Governance** (your `governance.md`) — defines YOUR rules: quality gates, security requirements, branch strategy, deployment pipeline. Changes only when YOU change it.

The skills handle discovery. `governance.md` handles governance. The skills never go stale because they re-discover every session. The governance never goes stale because it's your standards, not your file paths.

---

## Quick Start

```bash
# Install once globally (the package is scoped; the binary name is `crag`)
npm install -g @whitehatd/crag

# Or use via npx (no install)
npx @whitehatd/crag init

# After install, all commands use the plain `crag` binary
crag init            # Interview → generate governance + hooks + agents
crag analyze         # Zero-interview: infer governance from existing project
crag check           # Verify infrastructure
crag diff            # Compare governance against codebase reality
crag upgrade         # Update universal skills (with hash-based conflict detection)
crag workspace       # Inspect detected workspace
crag compile --target all   # Compile governance → CI, hooks, and 9 AI agent configs
crag install         # Install interview agent globally for /crag-project
```

After setup, in any Claude Code session:
```bash
/pre-start-context           # Discovers project, loads governance, ready to work
# ... do your task ...
/post-start-validation       # Validates, captures knowledge, commits, deploys
```

---

## User Guide

### Installation

crag is a zero-dependency Node.js CLI. You don't need to install it — run it via `npx`:

```bash
npx crag <command>
```

Or install globally:
```bash
npm install -g @whitehatd/crag
crag <command>
```

The package is published under a scope (`@whitehatd/crag`) but the binary name remains `crag`, so after installation all commands work as `crag init`, `crag analyze`, etc.

**Requirements:**
- Node.js 18+ (uses built-in `https`, `crypto`, `fs`, `child_process`)
- Git (for branch strategy inference and discovery cache)
- Claude Code CLI (`claude --version`) — only needed for `crag init`

### Choosing Your Entry Point

crag has two ways to generate governance for a project:

| Situation | Command | What happens |
|-----------|---------|--------------|
| New project, unsure of standards | `crag init` | Interactive interview — agent asks about your stack, quality bar, security, deployment |
| Existing project with CI/linters already configured | `crag analyze` | Zero-interview mode — reads your CI workflows, package.json scripts, linter configs, git history |
| Want to see what would be generated | `crag analyze --dry-run` | Prints inferred governance without writing |
| Already have governance, want to add inferred gates | `crag analyze --merge` | Preserves existing governance, appends inferred additions |
| Monorepo with sub-projects | `crag analyze --workspace` | Analyzes root + every workspace member |

### Command Reference

#### `crag init` — Interactive Setup

Runs an interview agent that asks about your project, then generates all infrastructure:

```bash
cd your-project
npx crag init
```

**What gets generated:**
- `.claude/skills/pre-start-context/SKILL.md` — universal discovery skill
- `.claude/skills/post-start-validation/SKILL.md` — universal validation skill
- `.claude/governance.md` — your rules (from interview answers)
- `.claude/hooks/` — sandbox-guard, drift-detector, circuit-breaker, auto-post-start
- `.claude/agents/` — test-runner, security-reviewer, skill-auditor
- `.claude/settings.local.json` — permissions + hook wiring
- `.claude/ci-playbook.md` — empty template for known CI failures

After init, the skills are ready to use in any Claude Code session via `/pre-start-context`.

#### `crag analyze` — Zero-Interview Governance

Generates `governance.md` from your existing project without asking questions:

```bash
crag analyze              # Generate .claude/governance.md
crag analyze --dry-run    # Preview without writing
crag analyze --workspace  # Analyze all workspace members
crag analyze --merge      # Merge with existing governance
```

**What it detects:**
- **Stack:** Node, Rust, Python, Java, Go, Docker (from manifests)
- **Gates from CI:** parses `.github/workflows/*.yml` (recursively) for `run:` steps including multiline `run: |` blocks
- **Gates from scripts:** `package.json` `test`, `lint`, `build`, `format`, `typecheck`
- **Linters:** ESLint, Biome, Prettier, Ruff, Clippy, Rustfmt, Mypy, TypeScript
- **Branch strategy:** feature branches vs trunk-based (from git history)
- **Commit convention:** conventional vs free-form (from git log)
- **Deployment:** Docker, Kubernetes, Vercel, Fly.io, Netlify, Render, Terraform

Output sections marked `# Inferred` should be reviewed.

#### `crag check` — Verify Infrastructure

Lists all core and optional files, shows which are present:

```bash
crag check
```

Run this after `crag init` to verify everything was generated, or any time you're unsure if the setup is complete.

#### `crag compile` — Export Governance (12 targets)

Compiles your `governance.md` to multiple formats:

```bash
# CI / git hooks
crag compile --target github        # .github/workflows/gates.yml
crag compile --target husky         # .husky/pre-commit
crag compile --target pre-commit    # .pre-commit-config.yaml

# AI coding agents — native formats
crag compile --target agents-md     # AGENTS.md (Codex, Aider, Factory)
crag compile --target cursor        # .cursor/rules/governance.mdc
crag compile --target gemini        # GEMINI.md

# AI coding agents — additional formats
crag compile --target copilot       # .github/copilot-instructions.md
crag compile --target cline         # .clinerules
crag compile --target continue      # .continuerules
crag compile --target windsurf      # .windsurfrules
crag compile --target zed           # .zed/rules.md
crag compile --target cody          # .sourcegraph/cody-instructions.md

crag compile --target all           # All 12 targets at once
crag compile                        # List available targets
```

**Why this matters:** one `governance.md` becomes your CI workflow, your git hooks, and configuration for **9 different AI coding agents**. Change a gate once, recompile, and every downstream tool sees the update. The generator detects Node/Python/Java/Go versions from your project files (`package.json engines.node`, `pyproject.toml requires-python`, `build.gradle.kts` toolchain, `go.mod` directive) instead of hardcoding defaults.

Gate classifications control behavior per target:
- `# [MANDATORY]` (default) — stop on failure
- `# [OPTIONAL]` — warn via `continue-on-error: true` (GitHub) or wrapper (husky/pre-commit)
- `# [ADVISORY]` — log result, never block

#### `crag diff` — Governance Drift Detection

Compares `governance.md` against codebase reality:

```bash
crag diff
```

```
  MATCH   node --check bin/crag.js
  DRIFT   ESLint referenced but biome.json found
  MISSING CI gate: cargo test              (in governance, not in CI)
  EXTRA   docker build                     (in CI, not in governance)

  3 match, 1 drift, 1 missing, 1 extra
```

Command alias normalization means `npm test` and `npm run test` are treated as equivalent, as are `./gradlew` and `gradlew`.

#### `crag upgrade` — Update Skills

Updates universal skills in the current project to the latest version:

```bash
crag upgrade                # Update skills in current project
crag upgrade --check        # Dry run — show what would change
crag upgrade --workspace    # Update all workspace members
crag upgrade --force        # Overwrite locally modified skills (creates backup)
```

**How it works:**
- Skills track their version in YAML frontmatter (`version: 0.2.1`)
- A `source_hash` (SHA-256, CRLF-normalized) detects local modifications
- If you modified a skill locally, upgrade won't overwrite it without `--force`
- When force-overwriting, a timestamped backup is created (`SKILL.md.bak.1712252400`)
- Global 24-hour cache at `~/.claude/crag/update-check.json`
- Opt-out: `CRAG_NO_UPDATE_CHECK=1`

#### `crag workspace` — Inspect Workspace

Shows the detected workspace, all members, their tech stacks, and governance hierarchy:

```bash
crag workspace              # Human-readable
crag workspace --json       # Machine-readable JSON (for CI/scripting)
```

Example output:
```
  Workspace: npm
  Root: /path/to/monorepo
  Config: package.json
  Members: 3
  Root governance: 2 gate section(s), runtimes: node

  Members:
    ✓ backend                        [node]
      packages/backend
    ✓ frontend                       [node]  (inherits)
      packages/frontend
    ○ shared                         [node]
      packages/shared
```

Use this to debug workspace detection or understand governance inheritance in monorepos.

#### `crag install` — Install Global Agent

Installs the `crag-project` interview agent to `~/.claude/agents/` so you can invoke it with `/crag-project` from any Claude Code session:

```bash
crag install
```

#### `crag version` / `crag help`

```bash
crag version              # Print version
crag help                 # Print usage
```

### The Session Loop

Once crag is set up, your workflow in any Claude Code session becomes:

```
1. /pre-start-context       → Discovers project, loads governance, checks skill currency
2. ... your task ...        → Write code, fix bugs, add features
3. /post-start-validation   → Runs gates, security review, captures knowledge, commits
```

**Pre-start does:**
- Detects workspace type (pnpm, Cargo, Go, Gradle, Maven, Nx, Turbo, Bazel, submodules, nested repos)
- Enumerates members and checks for multi-level governance
- Detects runtime versions (Node, Java, Python, Go, Rust, Docker)
- Reads `governance.md` and applies rules for the session
- Loads cross-session memory (if MemStack enabled)
- Checks skill currency — notifies if `crag upgrade` available

**Post-start does:**
- Runs governance gates in order (stops on MANDATORY failure; logs OPTIONAL/ADVISORY)
- Auto-fixes mechanical errors (lint, format) with bounded retry
- Runs security review (grep for secrets, check new endpoints)
- Captures knowledge (insights, sessions) if MemStack enabled
- Commits with conventional commit format
- Writes `.session-state.json` for next session's warm start

### Common Workflows

**Workflow 1: Add crag to an existing project**
```bash
cd my-existing-project
npx crag analyze --dry-run    # Preview what it would generate
npx crag analyze              # Write .claude/governance.md
# Review the generated file, adjust as needed
npx crag check                # Verify infrastructure
# Use /pre-start-context in Claude Code
```

**Workflow 2: Start a brand new project**
```bash
mkdir my-new-project && cd my-new-project
git init
npx crag init                 # Interactive interview
# Follow the prompts — agent asks ~20 questions
# Skills + hooks + agents are all generated
npx crag check
```

**Workflow 3: Monorepo with per-service governance**
```bash
cd my-monorepo
npx crag workspace            # See detected type + members
npx crag init                 # Root-level governance
cd packages/backend
npx crag analyze --merge      # Add backend-specific gates
cd ../../packages/frontend
npx crag analyze --merge      # Add frontend-specific gates
# Now each package has its own governance.md, and root has cross-cutting rules
```

**Workflow 4: Keep everything current**
```bash
npx crag upgrade --check       # See what would update
npx crag upgrade               # Apply updates (preserves local changes)
npx crag diff                  # Check governance hasn't drifted
npx crag compile --target all  # Regenerate CI workflows, hooks, cross-agent files
```

**Workflow 5: Switch AI tools (Claude → Cursor → Gemini)**
```bash
npx crag compile --target agents-md    # Generate AGENTS.md
npx crag compile --target cursor       # Generate .cursor/rules/
npx crag compile --target gemini       # Generate GEMINI.md
# Same governance rules now work in Codex, Cursor, Gemini CLI, Aider, Factory
```

### Troubleshooting

**Q: `crag init` says "Claude Code CLI not found"**
A: Install Claude Code from https://claude.com/claude-code. Only `init` needs it; other commands don't.

**Q: `crag upgrade` shows "locally modified" and won't update**
A: You edited a skill file. Either (1) accept that your edits are preserved and stay on the old version, or (2) run `crag upgrade --force` to overwrite (backup is created).

**Q: `crag analyze` generates nothing useful**
A: It needs signals — CI configs, `package.json` scripts, linter configs. For greenfield projects, use `crag init` for the interview flow instead.

**Q: `crag diff` reports drift but my CI is working**
A: Drift means `governance.md` says one thing and the codebase uses another. Either update `governance.md` to match reality, or update the codebase to match governance. Both are valid.

**Q: Skills don't auto-update when I run `/pre-start-context`**
A: Auto-update runs via the CLI commands, not the skill itself. Run `crag upgrade` from your terminal. The skill reports skill version on pre-start so you know when to run upgrade.

**Q: Multi-level governance not merging correctly**
A: Check that member governance files use `## Gates (inherit: root)` to opt in to inheritance. Without this marker, member governance replaces root.

---

## governance.md

The only file you maintain. 20-30 lines. Everything else is universal.

```markdown
# Governance — example-app

## Identity
- Project: example-app
- Description: Example project using crag

## Gates (run in order, stop on failure)
### Frontend
- npx eslint frontend/ --max-warnings 0
- cd frontend && npx vite build

### Backend
- node --check scripts/server.js scripts/worker.js scripts/queue.js
- cargo clippy --manifest-path api/Cargo.toml
- cargo test --manifest-path api/Cargo.toml

### Infrastructure
- docker compose config --quiet

## Branch Strategy
- Trunk-based, conventional commits
- Auto-commit after all gates pass

## Security
- No hardcoded secrets
- No hardcoded secrets or API keys in source
```

Change a gate → takes effect next session. Add a security rule → enforced immediately. The skills read this file every time — they never cache stale instructions.

### Governance v2 annotations (optional)

Gate sections support optional annotations for workspace-aware execution:

```markdown
## Gates (run in order, stop on failure)
### Frontend (path: frontend/)          # cd to frontend/ before running
- npx biome check .                     # [MANDATORY] (default)
- npx tsc --noEmit                      # [OPTIONAL] — warn but don't fail

### TypeScript (if: tsconfig.json)       # skip section if file doesn't exist
- npx tsc --noEmit

### Audit
- npm audit                             # [ADVISORY] — informational only

## Gates (inherit: root)                 # merge with root governance
```

All annotations are optional. Existing governance files work unchanged. Classifications are honored by all compile targets (GitHub Actions `continue-on-error`, husky/pre-commit wrapper scripts).

### Multi-level governance (monorepos)

For projects with multiple sub-repos or services, governance can be hierarchical:

```
project-root/
├── .claude/governance.md          # Cross-stack: branch strategy, deployment, security
├── backend/.claude/governance.md  # Backend-specific: Gradle gates, service tests
└── frontend/.claude/governance.md # Frontend-specific: Biome, Vitest, responsive audit
```

Each level gets the same universal skills. Each reads its own `governance.md`. Open Claude Code at the root — get the cross-stack view. Open it in `backend/` — get backend-specific gates. The skills adapt to wherever you are.

---

## Workspace Detection

crag auto-detects 11+ workspace types:

| Marker | Workspace Type |
|--------|----------------|
| `pnpm-workspace.yaml` | pnpm |
| `package.json` with `"workspaces"` | npm/yarn |
| `Cargo.toml` with `[workspace]` | Cargo |
| `go.work` | Go |
| `settings.gradle.kts` with `include(` | Gradle |
| `pom.xml` with `<modules>` | Maven |
| `nx.json` | Nx |
| `turbo.json` | Turborepo |
| `WORKSPACE` / `MODULE.bazel` | Bazel |
| `.gitmodules` | Git submodules |
| Multiple child `.git` dirs | Independent repos |

Workspace members are enumerated, checked for their own `.claude/governance.md`, and their tech stacks detected. Multi-level governance merges root gates (mandatory) with member gates (additive).

---

## Governance Compiler — 12 Targets

`governance.md` is agent-readable. But the gates in it are just shell commands — they can also drive your CI pipeline, git hooks, and configuration for **9 different AI coding agents**. One source of truth, twelve outputs:

### Full target list

| Group | Target | Output path | Consumed by |
|---|---|---|---|
| **CI** | `github` | `.github/workflows/gates.yml` | GitHub Actions |
| **CI** | `husky` | `.husky/pre-commit` | husky pre-commit framework |
| **CI** | `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com framework |
| **AI native** | `agents-md` | `AGENTS.md` | Codex, Aider, Factory, and any tool reading `AGENTS.md` |
| **AI native** | `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| **AI native** | `gemini` | `GEMINI.md` | Google Gemini CLI |
| **AI extras** | `copilot` | `.github/copilot-instructions.md` | GitHub Copilot (VS Code, JetBrains, Visual Studio, Copilot Workspace) |
| **AI extras** | `cline` | `.clinerules` | Cline (VS Code extension) |
| **AI extras** | `continue` | `.continuerules` | Continue.dev |
| **AI extras** | `windsurf` | `.windsurfrules` | Windsurf IDE (Codeium) |
| **AI extras** | `zed` | `.zed/rules.md` | Zed Editor AI assistant |
| **AI extras** | `cody` | `.sourcegraph/cody-instructions.md` | Sourcegraph Cody |

```bash
crag compile --target all           # Generate all 12 at once
crag compile --target github        # Or pick one
crag compile                        # Or list targets interactively
```

The compiler parses your gates, auto-detects runtimes from the commands (Node, Rust, Python, Java, Go, Docker), and generates the right setup steps with proper version inference from your project files (not hardcoded defaults). Human-readable `Verify X contains Y` gates are compiled to `grep` commands automatically (with shell-injection-safe escaping). All 12 targets write atomically (temp file + rename) so partial failures leave the old state intact.

```
                      ┌────────────────────┐
                      │   governance.md    │
                      │     (one file)     │
                      └──────────┬─────────┘
                                 │
                        crag compile --target all
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
       ▼                         ▼                         ▼
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ CI / hooks  │          │  AI native  │          │  AI extras  │
├─────────────┤          ├─────────────┤          ├─────────────┤
│ gates.yml   │          │ AGENTS.md   │          │ Copilot     │
│ husky       │          │ Cursor MDC  │          │ Cline       │
│ pre-commit  │          │ GEMINI.md   │          │ Continue    │
└─────────────┘          └─────────────┘          │ Windsurf    │
                                                  │ Zed         │
                                                  │ Cody        │
                                                  └─────────────┘

                                 + read at runtime by
                                   universal skills
                                   (pre-start / post-start)
```

Governance-as-config that compiles to agent behavior, CI/CD pipelines, and **9 different AI coding tool configs** from a single 20-line file.

---

## Zero-Interview Mode

Don't want an interview? `crag analyze` generates governance from your existing project:

```bash
crag analyze              # Infer governance from codebase + CI
crag analyze --dry-run    # Preview without writing
crag analyze --workspace  # Analyze all workspace members
crag analyze --merge      # Merge with existing governance
```

It reads your CI workflows (recursively, handling `run: |` multiline blocks), `package.json` scripts, linter configs, git history, and deployment configs. Outputs `governance.md` with `# Inferred` markers so you know what to verify.

---

## Governance Drift Detection

`crag diff` compares your `governance.md` against codebase reality:

```bash
crag diff
```

```
  MATCH   node --check bin/crag.js     (tool exists)
  DRIFT   ESLint referenced but biome.json found
  MISSING CI gate: cargo test          (in governance, not in CI)
  EXTRA   CI step: docker build        (in CI, not in governance)

  3 match, 1 drift, 1 missing, 1 extra
```

---

## Auto-Update

Skills track their version in YAML frontmatter. When you run any crag command, it checks for updates:

```bash
crag upgrade              # Update skills in current project
crag upgrade --workspace  # Update all workspace members
crag upgrade --check      # Dry run — show what would change
crag upgrade --force      # Overwrite locally modified skills (with backup)
```

The update checker queries the npm registry (cached for 24 hours, 3s timeout, graceful failure offline). Skills are only overwritten if the user hasn't modified them — local modifications are detected via SHA-256 content hash (CRLF-normalized for cross-platform consistency) and preserved unless `--force` is used.

---

## What Ships vs What's Generated

| Component | Source | Maintains itself? |
|-----------|--------|-------------------|
| Pre-start skill | **Ships universal** | Yes — discovers at runtime, caches results, auto-updates |
| Post-start skill | **Ships universal** | Yes — reads governance for gates, auto-fixes, auto-updates |
| `governance.md` | **Generated from interview or analyze** | No — you maintain it (20-30 lines) |
| Hooks | **Generated for your tools** | Yes — sandbox guard + drift detector + gate enforcement |
| Agents | **Generated for your stack** | Yes — read governance for commands |
| Settings | **Generated** | Yes — RTK wildcards cover new tools |
| CI playbook | **Generated template** | You add entries as failures are found |
| Compile targets | **Generated on demand** | `crag compile` regenerates from governance (12 targets) |
| Workspace detection | **Ships universal** | Yes — detects 11+ workspace types at runtime |
| Governance diff | **Ships universal** | Yes — compares governance vs codebase reality |

---

## Why Everything Else Is Static

| Current ecosystem                         | Why it rots                          | crag's approach                                |
|-------------------------------------------|--------------------------------------|------------------------------------------------|
| **CLAUDE.md / AGENTS.md** static files    | Hardcode project facts; manual edits | **Universal skills** read filesystem every session — always current |
| **Skill collections** (1,234+ skills)     | Pick-per-project; stack mismatch     | **One engine** that works for any stack        |
| **Per-framework templates**               | One stack per template; rot on change | **`governance.md`** — 20–30 lines of YOUR rules only, human-controlled |

**The difference:** everything else tries to pack facts INTO config files. crag reads facts FROM the filesystem at runtime. The skills don't know your stack — they discover it. The governance doesn't know your paths — it holds your rules.

---

## The Session Loop

```
┌────────────────────────────────────────────────────────────────┐
│  PRE-START (universal skill — runs before every task)          │
│                                                                │
│  Warm start?         Intent?          Cache valid?             │
│  .session-state.json → classify  →   .discovery-cache.json     │
│       │                │                  │                   │
│       │                │          ┌───────┴───────┐            │
│       │                │          ▼               ▼            │
│       │                │      Fast path      Full discovery    │
│       │                │      (skip 80%)     (detect stack,    │
│       │                │          │           load memory)     │
│       └────────────────┴──────────┴───────────────┘            │
│                                │                               │
│                                ▼                               │
│                        Read governance.md                      │
└───────────────────────────────┬────────────────────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │    YOUR TASK     │
                      │   (code changes) │
                      └────────┬─────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  POST-START (universal skill — runs after every task)          │
│                                                                │
│  Detect changes → Run gates → (fail?) → Auto-fix → retry       │
│                                  │                             │
│                                 pass                           │
│                                  ▼                             │
│                       Security review → Capture knowledge      │
│                                               │                │
│                                               ▼                │
│                                Write session state · Commit    │
└────────────────────────────────┬───────────────────────────────┘
                                 │
                                 │ cache + state + knowledge
                                 └─────► feeds next session
```

### What makes this loop tight

| Feature | What it does | Savings |
|---|---|---|
| **Discovery cache** | Hashes build files, skips unchanged domains | ~80% of pre-start tool calls on unchanged projects |
| **Intent-scoped discovery** | Classifies task, skips irrelevant domains | Skip frontend discovery for backend bugs, and vice versa |
| **Session continuity** | Reads `.session-state.json` for warm starts | Near-zero-latency startup when continuing work |
| **Gate auto-fix** | Fixes lint/format errors, retries gate (max 2x) | Eliminates human round-trip for mechanical failures |
| **Auto-post-start** | Hook warns before commit if gates haven't run | Removes "forgot to validate" failure mode |
| **Sandbox guard** | Hard-blocks destructive commands at hook level | Security at system level, not instruction level |
| **Workspace detection** | Detects 11+ workspace types, enumerates members | Automatic monorepo/polyrepo awareness |
| **Auto-update** | Version-tracked skills with hash-based conflict detection | Skills stay current across all projects |
| **Governance diff** | Compares `governance.md` against actual codebase | Catches drift before it causes failures |

No agent framework does all of these. Most re-discover cold every session, require manual validation, and trust instructions for safety.

---

## Generated Infrastructure

```
.claude/
├── governance.md                         # YOUR rules (only custom file)
├── skills/
│   ├── pre-start-context/SKILL.md        # Universal discoverer
│   └── post-start-validation/SKILL.md    # Universal validator
├── hooks/
│   ├── sandbox-guard.sh                  # Hard-blocks destructive commands
│   ├── auto-post-start.sh                # Gate enforcement before commits
│   ├── drift-detector.sh                 # Checks key files exist
│   ├── circuit-breaker.sh                # Failure loop detection
│   ├── pre-compact-snapshot.sh           # Memory before compaction
│   └── post-compact-recovery.sh          # Memory after compaction
├── agents/
│   ├── test-runner.md                    # Parallel tests (Sonnet)
│   ├── security-reviewer.md              # Security audit (Opus)
│   ├── dependency-scanner.md             # Vulnerability scan
│   └── skill-auditor.md                  # Infrastructure audit
├── rules/                                # Cross-session memory
├── ci-playbook.md                        # Known CI failures
├── .session-name                         # Notification routing
├── .discovery-cache.json                  # Cached discovery (auto-generated)
├── .session-state.json                    # Session continuity (auto-generated)
├── .gates-passed                          # Gate sentinel (auto-generated)
└── settings.local.json                   # Hooks + permissions
```

---

## Principles

1. **Discover, don't hardcode.** Every fact about the codebase is read at runtime. The skills never say "22 controllers" — they say "read the controller directory."

2. **Govern, don't hope.** Your quality bar lives in `governance.md`. The skills enforce it but never modify it. It changes only when you change it.

3. **Ship the engine, generate the config.** Universal skills ship once. `governance.md` is generated per-project. The engine works forever. The config is 20 lines.

4. **Enforce, don't instruct.** Hooks are 100% reliable at zero token cost. CLAUDE.md rules are ~80% compliance. Critical behavior goes in hooks.

5. **Compound, don't restart.** Cross-session memory means each session knows what the last one learned. Knowledge self-verifies against source files.

6. **Guard, don't trust.** Security hooks hard-block destructive commands at the system level — `rm -rf /`, `DROP TABLE`, `curl|bash`, force-push to main. Even if instructions are misread, the sandbox catches it. Defense in depth: hooks enforce what skills instruct.

7. **Cache, don't re-discover.** Every discovery result is cached with content hashes. If nothing changed, the next session starts in seconds, not minutes. The cache is advisory — if it's wrong, full discovery runs as normal.

---

## Prior Art

An independent review assessed every major AI coding tool, open-source project, academic paper, and patent filing as of April 2026. The closest candidates and why they differ:

| Candidate | What it does | Why it's not this |
|---|---|---|
| **AGENTS.md** (60K+ repos) | Static config file AI agents read | Human-maintained, multiple files by scope, no runtime discovery |
| **Claude Code** `/init` + CLAUDE.md | Scans repo, generates static instructions | Generates static output that rots. Multiple files. No governance separation |
| **Cursor** `.cursor/rules/` | Per-directory rule files | Static context, multiple artifacts, no universal engine |
| **Gemini CLI** GEMINI.md hierarchy | JIT instruction file scanning | Discovers *instruction files*, not the project itself |
| **Kiro** steering docs | Generates product/tech/structure docs | Multiple steering files, not single governance, not universal |
| **Codex** AGENTS.md + hooks + skills | Layered static instructions + extensibility | Instruction chain by directory. Could host this engine but doesn't ship one |
| **claude-code-kit** | Framework detection + generated .claude/ | Kit/framework-specific (Next.js, React, Express). Not universal polyglot |
| **OpenDev** (arxiv paper) | CLI agent with lazy tool discovery | Research prototype. No governance file. Not productized |
| **Repo2Run** (arxiv paper) | Repo → runnable Dockerfile synthesis | Build/CI domain only. No agent governance architecture |

**Adjacent patents identified:**
- **US20250291583A1** (Microsoft) — YAML-configured agent rules/actions. Covers "config file drives AI agents" broadly but not universal repo discovery.
- **US9898393B2** (Solano Labs) — Repo pattern analysis → inferred CI config. Strong historic prior art for build-system discovery, but not AI agent governance.

Neither patent blocks this architecture. Both are adjacent, not overlapping.

**Three novelty hypotheses validated by the review:**
1. **Compositional:** Many systems have pieces (hooks, skills, context files). None compose them into universal discovery engine + single governance file + continuously regenerated artifacts.
2. **Scope:** Closest implementations (claude-code-kit) are framework-specific, not polyglot-universal.
3. **Governance-as-contract:** Existing tools treat instruction files as context (often non-enforced). This treats governance as an executable contract that deterministically shapes gates and commit behavior.

---

## Roadmap

- [x] Universal pre-start and post-start skills
- [x] Interview-driven governance generation
- [x] CLI (`crag init`, `crag check`, `crag install`)
- [x] Proven on 5-language multi-service project (example-app)
- [x] Proven on full-stack monolith with deployment (example-app)
- [x] Proven on multi-service platform (example-app)
- [x] Multi-level governance hierarchy (root + backend + frontend)
- [x] `crag compile` — governance.md → GitHub Actions, husky, pre-commit, AGENTS.md, Cursor, Gemini
- [x] Incremental discovery cache — content-addressed, skips 80% of pre-start on unchanged projects
- [x] Intent-scoped discovery — classifies task, skips irrelevant domains
- [x] Session continuity — warm starts via `.session-state.json`
- [x] Gate auto-fix loop — fixes lint/format errors automatically, bounded retry (max 2x)
- [x] Auto-post-start hook — gate enforcement before commits
- [x] Sandbox guard — hard-blocks destructive commands (rm -rf /, DROP TABLE, curl|bash, force-push main)
- [x] `crag analyze` — generate governance from existing project without interview
- [x] `crag diff` — compare governance against codebase reality
- [x] `crag upgrade` — update universal skills when new version ships
- [x] `crag workspace` — inspect detected workspace type and members
- [x] Workspace detection — 11+ types (pnpm, npm, Cargo, Go, Gradle, Maven, Nx, Turbo, Bazel, submodules, nested repos)
- [x] Governance v2 format — path-scoped gates, conditional sections, mandatory/optional/advisory classification
- [x] Auto-update — version tracking, npm registry check, content-hash conflict detection
- [x] Cross-agent compilation — **12 targets** (GitHub Actions, husky, pre-commit, AGENTS.md, Cursor, Gemini, Copilot, Cline, Continue, Windsurf, Zed, Sourcegraph Cody)
- [x] Modular architecture — 24 modules across 6 directories (zero dependencies)
- [x] Test suite — 159 tests covering parse, integrity, detect, enumerate, merge, compile, version, shell, CLI, 6 new compile targets, analyze internals, diff internals
- [x] Published on npm as `@whitehatd/crag`
- [x] GitHub Actions CI/CD — multi-OS (Ubuntu/macOS/Windows) × multi-Node (18/20/22) test matrix, automated npm publish with SLSA provenance, stale issue cleanup
- [ ] Cross-repo benchmark — 20-30 repos, measure coverage %, false positives, failure modes
- [ ] Drift resilience test — add services, change linters, rename directories. Does the engine re-discover?
- [ ] Baseline comparison — same governance in AGENTS.md, CLAUDE.md, .cursor/rules, GEMINI.md
- [ ] crag Cloud (paid tier) — hosted governance registry, cross-repo dashboard, team library, compliance templates, drift alerts

---

## License

MIT

---

*Built by [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD)*
