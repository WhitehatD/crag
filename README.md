# crag

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![Release](https://github.com/WhitehatD/crag/actions/workflows/release.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![357 tests](https://img.shields.io/badge/tests-357%20passing-brightgreen)](./test)
[![40/40 grade A](https://img.shields.io/badge/benchmark-40%2F40%20grade%20A-brightgreen)](./benchmarks/results.md)

> **One `governance.md`. Any project. Generated in 250 ms.**
>
> Point crag at an existing codebase. It reads the filesystem, detects your
> stack, parses your CI, and writes a 30-line governance file that compiles
> to GitHub Actions, git hooks, and config for nine AI coding agents.

```bash
npx @whitehatd/crag analyze            # Generate governance.md from an existing project
npx @whitehatd/crag compile --target all  # Turn it into CI + 12 downstream configs
```

Zero dependencies. Node 18+. Validated across [40 OSS projects](#validation-on-real-repos) (100% grade A).

---

## What it does

crag turns project-specific configuration work into a single file.

- **You write**: a 20–30 line `governance.md` describing your quality gates, branch strategy, and security rules.
- **crag generates**: GitHub Actions workflow, husky hooks, pre-commit config, and configuration for **AGENTS.md** (Codex/Aider/Factory), **Cursor**, **Gemini**, **Copilot**, **Cline**, **Continue**, **Windsurf**, **Zed**, and **Sourcegraph Cody** — from that one file.
- **crag discovers**: runtimes, frameworks, linters, test runners, CI systems, and monorepo layouts — at session time, from the filesystem. Nothing to hardcode.

The result is a single source of truth for your rules that stays in lock-step with your CI pipeline, your pre-commit hooks, and every AI tool your team uses.

---

## Validation on real repos

Unlike most tools in this space, crag ships with a reproducible cross-repo benchmark. `crag analyze --dry-run` was run against **40 diverse open-source projects** in two tiers:

- **Tier 1** — 20 well-known libraries across 7 language families (Node, Python, Rust, Go, Java, Ruby, PHP).
- **Tier 2** — 20 dense repos picked for **density over storage**: multi-language, matrix-heavy CI, polyglot microservices, and workspace layouts (pnpm monorepos, Cargo workspaces, Gradle multi-module).

| Grade | Tier 1 | Tier 2 | Combined | Meaning |
|---|---:|---:|---:|---|
| **A** — ship-ready governance | **20 / 20** | **20 / 20** | **40 / 40 (100%)** | Stack + test + lint + build gates captured. Minimal noise. Ready to commit with light review. |
| **B** — usable after cleanup | 0 | 0 | **0 / 40 (0%)** | — |
| **C** — rework needed | 0 | 0 | **0 / 40 (0%)** | — |

**Tier 1 repos:** `expressjs/express`, `chalk/chalk`, `fastify/fastify`, `axios/axios`, `prettier/prettier`, `vitejs/vite`, `psf/requests`, `pallets/flask`, `pallets/click`, `tiangolo/fastapi`, `BurntSushi/ripgrep`, `clap-rs/clap`, `rust-lang/mdBook`, `tokio-rs/axum`, `spf13/cobra`, `gin-gonic/gin`, `charmbracelet/bubbletea`, `spring-projects/spring-petclinic`, `sinatra/sinatra`, `slimphp/Slim`.

**Tier 2 repos:** `GoogleCloudPlatform/microservices-demo` (11-language polyglot), `vercel/turbo`, `swc-project/swc`, `dagger/dagger` (8-stack density max), `cloudflare/workers-sdk`, `tailwindlabs/tailwindcss`, `rust-lang/cargo`, `rust-lang/rust-analyzer`, `denoland/deno`, `nushell/nushell`, `withastro/astro`, `nrwl/nx` (7-stack pnpm monorepo), `mastodon/mastodon` (6-stack Rails+Node+Docker), `phoenixframework/phoenix_live_view`, `celery/celery`, `laravel/framework`, `grafana/k6`, `prometheus/prometheus`, `nats-io/nats-server`, `open-telemetry/opentelemetry-collector`.

### Full-capability run on the 10 hardest repos

Beyond `analyze`, the 10 densest repos across both tiers were exercised against every command in crag's surface — **80 / 80 operations succeeded**:

| Command | Result |
|---|---|
| `crag analyze --dry-run` | 10 / 10 ✓ |
| `crag analyze` (writes governance.md) | 10 / 10 ✓ |
| `crag analyze --workspace --dry-run` | 10 / 10 ✓ (vite: 79 members in 322 ms) |
| `crag workspace --json` | 10 / 10 ✓ |
| `crag diff` | 10 / 10 ✓ |
| `crag doctor --ci` | 10 / 10 ✓ |
| `crag compile --target github` | 10 / 10 ✓ |
| `crag compile --target agents-md` | 10 / 10 ✓ |

### Coverage

| Metric | Value |
|---|---|
| Repos tested | **40** |
| Mean `crag analyze` time | **≈ 250 ms** per repo |
| Grade A | **40 / 40 (100%)** |
| Language families detected | Node, TypeScript, React, Next.js, Astro, Hono, Python, Rust, Go, Java (Maven + Gradle), Kotlin, Ruby (+Rails/Sinatra), PHP (+Laravel/Symfony/Slim), Elixir (+Phoenix), .NET, Swift, C# |
| CI systems parsed | 10 — GitHub Actions, GitLab CI, CircleCI, Travis, Azure Pipelines, Buildkite, Drone, Woodpecker, Bitbucket, Jenkins |
| Workspace types detected | pnpm, npm, cargo, go, gradle, maven, bazel, nx, turbo, git-submodules, independent-repos, subservices |

Full methodology, grading rubric, per-repo results, and raw outputs: [`benchmarks/results.md`](./benchmarks/results.md).

---

## Quick start

```bash
# Use via npx (no install)
npx @whitehatd/crag analyze
npx @whitehatd/crag compile --target all

# Or install globally
npm install -g @whitehatd/crag
crag analyze
crag compile --target all
```

**Requirements:** Node.js 18+. Git. (Claude Code CLI is only needed for the interactive `crag init` flow.)

---

## How it works

crag separates two things that every other tool in this space conflates:

```
┌────────────────────────────────────────────────────────────────┐
│  DISCOVERY  (ships with crag — universal, same for any repo)   │
│                                                                │
│  Reads the filesystem at runtime. Detects languages, frame-    │
│  works, CI systems, workspace layout, linters, test runners.   │
│                                                                │
│  Never hardcoded. Never goes stale. Add a service, switch      │
│  frameworks, change CI — discovery adapts automatically.       │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  GOVERNANCE  (your governance.md — project-specific)           │
│                                                                │
│  20-30 lines of YOUR rules: quality gates, branch strategy,    │
│  security requirements, deployment policy.                     │
│                                                                │
│  Human-controlled. Version-pinned. Changes only when you do.   │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  COMPILE  (crag compile --target all)                          │
│                                                                │
│  One governance.md → 12 outputs                                │
│                                                                │
│    CI / hooks:     GitHub Actions · husky · pre-commit         │
│    AI (native):    AGENTS.md · Cursor · Gemini                 │
│    AI (extras):    Copilot · Cline · Continue · Windsurf ·     │
│                    Zed · Sourcegraph Cody                      │
└────────────────────────────────────────────────────────────────┘
```

Change one line in `governance.md`, re-run `crag compile --target all`, and 12 downstream configs regenerate. Every AI tool on your team — plus your CI pipeline and pre-commit hooks — stays in sync from a single source.

---

## What crag detects

### Languages and runtimes

| Family | Detected | Gates emitted |
|---|---|---|
| **Node / Deno / Bun** | `package.json`, `deno.json`, `bun.lockb`, `bunfig.toml` | `npm run test/lint/build`, `tsc --noEmit`, `eslint`, `biome check`, `xo`, `deno test/lint/fmt`, `bun test` |
| **Python** | `pyproject.toml`, `setup.py`, `requirements.txt` | `uv run pytest`, `poetry run pytest`, `pdm run pytest`, `hatch run pytest`, `tox run`, `nox`, `ruff check/format`, `mypy`, `black` — detected per runner |
| **Rust** | `Cargo.toml`, `Cargo.toml [workspace]` | `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` |
| **Go** | `go.mod`, `.golangci.yml` | `go test ./...`, `go vet ./...`, `golangci-lint run` |
| **Java / Kotlin** | `pom.xml`, `build.gradle(.kts)`, Kotlin plugin detection | `./mvnw test verify`, `./gradlew test build`, `checkstyle`, `detekt` |
| **Ruby** | `Gemfile`, `*.gemspec`, `Rakefile` | `bundle exec rspec`, `bundle exec rake test`, `rubocop`, `standardrb`, `brakeman`, `bundle-audit` |
| **PHP** | `composer.json`, `phpunit.xml(.dist)` | `composer test`, `vendor/bin/phpunit`, `vendor/bin/pest`, `vendor/bin/phpstan analyse`, `vendor/bin/psalm`, `vendor/bin/phpcs`, `composer validate --strict` |
| **.NET** | `*.csproj`, `*.fsproj`, `*.sln` | `dotnet test`, `dotnet build`, `dotnet format --verify-no-changes` |
| **Swift** | `Package.swift` | `swift test`, `swift build`, `swiftlint` |
| **Elixir** | `mix.exs` | `mix test`, `mix format --check-formatted`, `mix credo --strict`, `mix dialyzer` |
| **Infrastructure** | `*.tf`, `Chart.yaml`, `Dockerfile`, `openapi.yaml`, `*.proto` | `terraform fmt/validate/plan`, `tflint`, `helm lint`, `hadolint`, `spectral lint`, `buf lint` |

### CI systems

`crag analyze` parses `run:` / `script:` / `command:` steps from nine CI systems and feeds them through a normalizer that dedupes matrix expansions, filters background processes, and strips shell plumbing:

GitHub Actions · GitLab CI · CircleCI · Travis CI · Azure Pipelines · Buildkite · Drone · Woodpecker · Bitbucket Pipelines

### Task runners

Real target mining — not placeholders. Canonical test/lint/build targets extracted from:

- **Makefile** (`.PHONY` directives + column-0 targets)
- **Taskfile.yml** (`tasks:` sub-keys)
- **justfile** (recipe names)

### Workspaces

Twelve workspace types, enumerated at discovery time:

pnpm · npm/yarn · Cargo · Go · Gradle · Maven · Nx · Turborepo · Bazel · git submodules · independent nested repos · **subservices** (polyglot microservices under `src/*`, `services/*`, `packages/*`, `apps/*`, etc. — no root manifest required)

### Nested stack detection

When a project has no root-level manifest but ships code under conventional container directories, crag scans one level down for per-service manifests and merges the detected stacks. This handles:

- **Polyglot microservice monorepos** — e.g. `src/frontend/go.mod`, `src/cartservice/*.csproj`, `src/emailservice/pyproject.toml` — detected as a 6-stack `subservices` workspace
- **Auxiliary subdirectory stacks** — e.g. `web/ui/package.json` (React UI), `editors/code/package.json` (VSCode extension), `sdk/typescript/package.json` (SDK) — surfaced as additional stacks alongside the root language

### Frameworks

Detected from manifest dependencies (runtime deps only — no false positives from dev fixtures):

**Web:** Next.js · React · Vue · Svelte · SvelteKit · Nuxt · Astro · Solid · Qwik · Remix · Express · Fastify · Koa · Hono · NestJS · Phoenix
**Backend:** Rails · Sinatra · Hanami · Laravel · Symfony · Slim · Yii · CakePHP

### Documentation mining

`CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md` are scanned for gate candidates in code fences and inline backticks — advisory-only, capped at 5, gated by canonical-verb filter.

---

## Commands

```bash
crag analyze                     # Generate .claude/governance.md from filesystem
crag analyze --dry-run           # Print what would be generated, don't write
crag analyze --workspace         # Analyze root + every workspace member
crag analyze --merge             # Preserve existing governance, append inferred sections

crag init                        # Interactive interview (needs Claude Code CLI)

crag compile --target <name>     # Compile governance to a single target
crag compile --target all        # Compile to all 12 targets at once
crag compile                     # List available targets

crag diff                        # Compare governance against codebase reality
crag doctor                      # Deep diagnostic — governance integrity, drift, hook validity, security
crag doctor --ci                 # CI mode: skips checks that need runtime infrastructure
crag doctor --json               # Machine-readable output
crag doctor --strict             # Treat warnings as failures
crag upgrade                     # Update universal skills to latest version
crag upgrade --check             # Dry-run: show what would change
crag check                       # Verify Claude Code infrastructure is in place
crag workspace                   # Inspect detected workspace
crag workspace --json            # Machine-readable workspace report

crag version / crag help
```

---

## The governance file

The only file you maintain. 20–30 lines. Everything else is universal or generated.

```markdown
# Governance — example-app

## Identity
- Project: example-app
- Description: Example project using crag

## Gates (run in order, stop on failure)
### Frontend (path: web/)
- npx eslint web/ --max-warnings 0
- cd web && npx vite build

### Backend
- cargo clippy --all-targets -- -D warnings
- cargo test

### Infrastructure
- docker compose config --quiet

## Branch Strategy
- Trunk-based, conventional commits
- Auto-commit after gates pass

## Security
- No hardcoded secrets or API keys
```

**Annotations** (all optional):

- `### Section (path: subdir/)` — run this section's gates from `subdir/`
- `### Section (if: config.json)` — skip if file doesn't exist
- `- command  # [OPTIONAL]` — warn but don't fail
- `- command  # [ADVISORY]` — log only, never block
- `## Gates (inherit: root)` — merge with root governance (monorepo)

---

## Compile targets (12 outputs)

| Target | Output | Consumer |
|---|---|---|
| `github` | `.github/workflows/gates.yml` | GitHub Actions |
| `husky` | `.husky/pre-commit` | husky framework |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com |
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory, Crush |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| `gemini` | `GEMINI.md` | Gemini CLI |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `cline` | `.clinerules` | Cline (VS Code) |
| `continue` | `.continuerules` | Continue.dev |
| `windsurf` | `.windsurfrules` | Windsurf IDE |
| `zed` | `.zed/rules.md` | Zed Editor |
| `cody` | `.sourcegraph/cody-instructions.md` | Sourcegraph Cody |

The compiler detects runtime versions from your project (`package.json engines.node`, `pyproject.toml requires-python`, `go.mod` directive, Gradle toolchain). All writes are atomic — partial failures leave the old state intact.

---

## Workspaces

```bash
crag workspace              # Human-readable
crag workspace --json       # Machine-readable

crag analyze --workspace    # Analyze every member and emit per-member gates
```

Detected types: `pnpm` · `npm/yarn` · `cargo` · `go` · `gradle` · `maven` · `nx` · `turbo` · `bazel` · `git-submodules` · `independent-repos`.

Test-fixture directories (`playground/`, `fixtures/`, `examples/`, `demos/`, `__fixtures__/`) are excluded from per-member enumeration so monorepos like Vite don't generate 79 sections for their playground directories.

Multi-level governance is supported: root governance sets cross-cutting rules (branch strategy, security), member governance adds stack-specific gates via `## Gates (inherit: root)`.

---

## The session loop (Claude Code)

Once crag is set up in a Claude Code project, each session is:

```
/pre-start-context       → Discovers project, loads governance, caches runtimes
   ↓
   your task
   ↓
/post-start-validation   → Runs gates, auto-fixes lint/format, commits
```

`/pre-start-context` classifies task intent, uses a content-hashed discovery cache to skip ~80% of redundant scans on unchanged code, and reads `governance.md` fresh every session so the rules are always current.

`/post-start-validation` runs gates in the order declared in `governance.md`, stops on `[MANDATORY]` failure, retries mechanical errors (lint, format) up to twice with auto-fix, runs a security review, and creates a conventional-commit commit when everything passes.

---

## Installation and requirements

```bash
npm install -g @whitehatd/crag
# or
npx @whitehatd/crag <command>
```

- **Node.js 18+** — uses built-in `https`, `crypto`, `fs`, `child_process`. No runtime dependencies.
- **Git** — for branch strategy inference and the discovery cache.
- **Claude Code CLI** — only needed for the interactive `crag init` flow. `analyze`, `compile`, `diff`, `doctor`, `upgrade`, `workspace`, `check` all run standalone.

The package is published under `@whitehatd/crag` but the binary name is plain `crag` after install.

---

## Release pipeline

Every push to `master` runs the full CI matrix (Ubuntu / macOS / Windows × Node 18 / 20 / 22) and, if tests pass, auto-bumps the patch version and publishes to npm with SLSA provenance attestation. Tags are created automatically. GitHub releases are generated from `CHANGELOG.md`.

To skip a release on a specific push, put `crag:skip-release` on its own line in the commit body.

---

## Design principles

1. **Discover, don't hardcode.** Every fact about the codebase is read at runtime. Skills never say "22 controllers" — they say "read the controller directory." They never go stale because there is nothing to go stale.

2. **Govern, don't hope.** Your quality bar lives in `governance.md`. Skills enforce it but never modify it. It changes only when you change it.

3. **Ship the engine, generate the config.** Universal skills ship once and work for every project. `governance.md` is generated per project. The engine works forever. The config is 20 lines.

4. **Enforce, don't instruct.** Hooks are 100% reliable at zero token cost. Prose rules in context files are ~80% compliant. Critical behavior (destructive-command blocks, gate enforcement) goes in hooks.

---

## Honest status

- **Published:** 2026-04-04 as `@whitehatd/crag` on npm. Scoped public package.
- **Tests:** 357 unit tests, passing on Ubuntu/macOS/Windows × Node 18/20/22.
- **Benchmark:** **40/40 grade A** across 20 tier-1 + 20 tier-2 reference repos. **80/80 operations succeeded** on the 10 hardest repos across every command (analyze, analyze --workspace, workspace, diff, doctor --ci, compile). Reproducible via `benchmarks/results.md`.
- **Languages fully supported:** Node, Deno, Bun, Python, Rust, Go, Java, Kotlin, Ruby, PHP, .NET, Swift, Elixir (+ Terraform/Helm/K8s infra gates).
- **CI systems parsed:** **10** — GitHub Actions, GitLab CI, CircleCI, Travis, Azure Pipelines, Buildkite, Drone, Woodpecker, Bitbucket, **Jenkins** (declarative + scripted pipelines).
- **Compile targets:** 12 (GitHub Actions, husky, pre-commit, AGENTS.md, Cursor, Gemini, Copilot, Cline, Continue, Windsurf, Zed, Cody).
- **Nested stack detection:** Scans `src/*`, `services/*`, `packages/*`, `apps/*`, `sdk/*`, `web/*`, `ui/*`, `editors/*`, `extensions/*`, `clients/*` one level deep for per-service manifests. Handles polyglot microservice monorepos (`microservices-demo`) and auxiliary subdirectories (`prometheus/web/ui`, `rust-analyzer/editors/code`, `dagger/sdk/typescript`).
- **`crag doctor`:** Deep diagnostic command — validates governance integrity, skill currency, hook validity, drift vs git, and runs a security smoke test (8 secret patterns: Stripe, AWS, GitHub PAT/OAuth, Slack, PEM keys). Wired into crag's own CI via `--ci` mode.

### Known limitations

- **Kotlin via `.kt` source files only (no Gradle kotlin plugin)** isn't detected. Most Kotlin projects use Gradle + the plugin, so this is rare in practice.
- **`crag analyze --workspace` still needs to be opted in.** Workspaces are auto-detected and reported, but per-member governance is only emitted when the flag is passed — an intentional guard against surprising enumeration on fixture-heavy monorepos.
- **No telemetry, no network calls** beyond the optional `crag upgrade --check` npm registry ping (24h cached, 3s timeout, graceful offline).

### What crag does not do

- It does not write or modify code in your repo.
- It does not call any LLM. Discovery, analysis, and compilation are pure filesystem operations.
- It does not replace your CI provider, your linters, or your test runners. It generates config for them.
- It does not gate-keep. You can add, remove, or edit any gate in `governance.md` at any time.

---

## Why "crag"

A crag is a rocky outcrop — an unmoving landmark that stands while seasons, paths, and generations change around it. Your skills discover, your gates run, your CI regenerates — but `governance.md`, the crag, doesn't move until you say so. Your AI agents anchor to it.

---

## Contributing

Issues and PRs welcome at [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag). See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow.

If you run crag on a repo and it misses something — a language, a CI system, a gate pattern — that's the bug report I want most. Include the URL of the repo and a paste of `crag analyze --dry-run` output.

---

## License

MIT — see [LICENSE](./LICENSE).

Built by [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD).
