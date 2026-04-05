# crag

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![Release](https://github.com/WhitehatD/crag/actions/workflows/release.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)

[![Tests](https://img.shields.io/badge/tests-498%20passing-brightgreen)](./test)
[![OSS repos](https://img.shields.io/badge/OSS%20repos%20tested-141-blue)](./benchmarks/results.md)
[![Languages](https://img.shields.io/badge/languages%20detected-25%2B-blue)](#supported-languages-and-runtimes)
[![CI systems](https://img.shields.io/badge/CI%20systems-11-blue)](#supported-ci-systems)
[![Workspace types](https://img.shields.io/badge/workspace%20types-12-blue)](#supported-workspaces)
[![Compile targets](https://img.shields.io/badge/compile%20targets-12-blue)](#2-twelve-derived-outputs-from-one-command)

One `governance.md` describing a project's quality gates, branch policy, and
security rules. `crag` generates it from an existing codebase, then compiles
it to CI configuration, git hooks, and config files for 9 AI coding agents.

```bash
npx @whitehatd/crag analyze               # write governance.md from the filesystem
npx @whitehatd/crag compile --target all  # compile to 12 downstream files
```

Zero runtime dependencies. Node 18+. Deterministic output (no LLM calls).

---

## Scale of validation

| | |
|---|---:|
| Open-source repositories `crag` has been run against | **141** |
|   — reference benchmark (Tier 1 + Tier 2, reproducible, 100% Grade A) | 40 |
|   — stress-test corpus (101 OSS repos × full command matrix) | 101 |
| Total command invocations in the stress test | **≈ 4,400** |
| Unexpected crashes / exit codes across the stress test | **0** |
| Languages and build systems detected | **25+** |
| CI systems with native command extraction | **11** |
| Workspace types recognised | **12** |
| Compile targets (CI + hooks + AI agents) | **12** |
| Unit tests passing (Ubuntu + macOS + Windows × Node 18/20/22) | **498** |
| Runtime dependencies | **0** |
| `crag analyze` wall-clock time (median) | **~250 ms** |

Reference benchmark: [`benchmarks/results.md`](./benchmarks/results.md) — 40
repos across 7 language families plus 20 polyglot density repos, every one
graded A. Stress test: 101 OSS repos covering every CI system, workspace
type, and language listed below; each repo exercised against 21 main
commands plus 23 edge-case commands. Findings from that run drove the fixes
in the current release.

Self-audit — `crag` applies its own governance.md and passes its own gates:

```
crag doctor   29/29 pass, 0 warn, 0 fail
crag diff     11 match, 0 drift, 0 missing, 0 extra
crag check    9/9 core files present
```

---

## The problem this solves

Every project duplicates the same quality rules across multiple config files:

- CI workflow (GitHub Actions / GitLab / Jenkins / Azure / Buildkite / Cirrus / …)
- Pre-commit hooks (husky / pre-commit)
- AI agent instructions (`AGENTS.md`, `.cursor/rules/`, `GEMINI.md`,
  `.clinerules`, `.continuerules`, `.windsurfrules`, `.zed/rules.md`,
  `.sourcegraph/cody-instructions.md`, `copilot-instructions.md`)
- Contributor docs and onboarding

These drift. Someone updates CI, forgets the pre-commit hook. Someone tightens
the lint rules in `.cursor/rules/`, misses the Copilot file. A new AI agent
ships and needs its own instruction format. The rules split into N copies and
start disagreeing.

`crag` removes the duplication. You maintain one ~20 line `governance.md`.
`crag compile` regenerates every derived file from it. Changing a rule means
editing one line and re-running the compiler.

---

## What you get

### 1. A single governance file

`governance.md` is the one file you edit. It looks like this:

```markdown
# Governance — example-app

## Identity
- Project: example-app

## Gates (run in order, stop on failure)
### Lint
- npx eslint . --max-warnings 0
- npx tsc --noEmit

### Test
- npm run test
- cargo test

### Build
- cargo build --release

## Branch Strategy
- Trunk-based, conventional commits

## Security
- No hardcoded secrets or API keys
```

Section annotations (optional): `### Section (path: subdir/)`,
`### Section (if: config.json)`, `- command  # [OPTIONAL]`,
`- command  # [ADVISORY]`, `## Gates (inherit: root)`.

### 2. Twelve derived outputs from one command

`crag compile --target all` writes, atomically, every file below:

| Target | Output | Consumer |
|---|---|---|
| `github` | `.github/workflows/gates.yml` | GitHub Actions |
| `husky` | `.husky/pre-commit` | husky |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com |
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory, Crush |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| `gemini` | `GEMINI.md` | Gemini CLI |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `cline` | `.clinerules` | Cline (VS Code) |
| `continue` | `.continuerules` | Continue.dev |
| `windsurf` | `.windsurfrules` | Windsurf |
| `zed` | `.zed/rules.md` | Zed |
| `cody` | `.sourcegraph/cody-instructions.md` | Sourcegraph Cody |

Each compiler detects runtime versions from the manifest (`package.json`
`engines.node`, `pyproject.toml` `requires-python`, `go.mod` directive,
Gradle toolchain) so generated CI matrices match the project. All writes
are atomic — partial failures leave prior state intact.

### 3. A no-interview path from an existing codebase

`crag analyze` reads the project and infers the governance file:

- **Stack detection** — Node, Deno, Bun, Python, Rust, Go, Java (Maven,
  Gradle), Kotlin, .NET (csproj/fsproj/sln/slnx/Directory.Build.props),
  Swift, Elixir, Erlang, Ruby, PHP, Haskell (cabal, stack, hpack), OCaml
  (dune), Zig, Crystal, Nim, Julia, Dart/Flutter, Lua, C/C++ (CMake,
  autotools, Meson), Docker, Terraform, Helm.
- **Gate inference per language** — pulls real commands from manifests
  (e.g. `npm run test` from `scripts.test`, `ruff check .` when `tool.ruff`
  exists in `pyproject.toml`, `./gradlew test build` when `gradlew` is
  present).
- **CI mining** — parses gate commands from 11 CI systems (list below).
- **Task runner mining** — reads Makefile `.PHONY` targets, `Taskfile.yml`,
  and `justfile` recipes; extracts canonical gate targets
  (`test`, `lint`, `check`, `kselftest`, `integration`, etc.).
- **Workspace detection** — 12 workspace types, with fixture-directory
  filtering so examples/samples/benchmarks don't pollute the member list.
- **Drift-safe normalization** — dedupes `npm test` vs `npm run test`,
  filters shell noise (`echo`, `export`, `break`, `exit`, version probes
  like `node --version`, variable assignments, backslash continuations,
  `curl | bash` installers).

### 4. Drift detection

`crag diff` compares the governance file against the actual codebase:
missing gates, CI workflow steps that aren't in governance, branch strategy
mismatches between governance and git.

`crag doctor` runs a 29-check deep diagnostic covering governance integrity,
skill currency, hook validity (shebang, `rtk-hook-version` marker, executable
bit), git drift, and a security smoke test for 8 secret patterns (Stripe,
AWS, GitHub PAT/OAuth, Slack, PEM keys).

---

## Install

```bash
npm install -g @whitehatd/crag        # global
# or
npx @whitehatd/crag <command>         # one-shot, no install
```

**Requirements**

- Node.js 18+ — uses only built-in modules (`fs`, `path`, `child_process`,
  `https`, `crypto`). No transitive dependency tree to audit.
- Git — for branch strategy inference and the discovery cache.
- Claude Code CLI — only required for the optional interactive `crag init`
  flow. All other commands run standalone.

Package: `@whitehatd/crag`. Binary: `crag`.

---

## Quick start

```bash
cd your-project
crag analyze                  # writes .claude/governance.md
crag diff                     # verify the generated file matches reality
crag compile --target all     # compile to 12 downstream files (dry-run: --dry-run)
```

If analyze can't detect any gates (e.g. an empty repo or a mirror of another
VCS), it still writes a valid governance.md with a `- true  # TODO:`
placeholder under `### Test`. Downstream tools will accept the file; you
replace the placeholder with real commands.

---

## Supported languages and runtimes

| Family | Detected from | Gates emitted |
|---|---|---|
| Node / Deno / Bun | `package.json`, `deno.json`, `bun.lockb`, `bunfig.toml`, `tsconfig.json` | `npm run test/lint/build`, `tsc --noEmit`, `eslint`, `biome check`, `xo`, `deno test/lint/fmt`, `bun test` |
| Python | `pyproject.toml`, `setup.py`, `requirements.txt` | `uv run pytest`, `poetry run pytest`, `pdm run pytest`, `hatch run pytest`, `tox run`, `nox`, `ruff check/format`, `mypy`, `black --check`, `python -m build` — detected per runner |
| Rust | `Cargo.toml` (incl. `[workspace]`) | `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` |
| Go | `go.mod`, `.golangci.yml` | `go test ./...`, `go vet ./...`, `golangci-lint run` |
| Java / Kotlin | `pom.xml`, `build.gradle(.kts)`, Kotlin plugin detection | `./mvnw test verify`, `./gradlew test build`, `checkstyle`, `detekt` |
| Ruby | `Gemfile`, `*.gemspec`, `Rakefile` | `bundle exec rspec`, `bundle exec rake test`, `rubocop`, `standardrb`, `brakeman`, `bundle-audit` |
| PHP | `composer.json`, `phpunit.xml(.dist)` | `composer test`, `vendor/bin/phpunit`, `vendor/bin/pest`, `vendor/bin/phpstan analyse`, `vendor/bin/psalm`, `vendor/bin/phpcs`, `composer validate --strict` |
| .NET | `*.csproj`, `*.fsproj`, `*.vbproj`, `*.sln`, `*.slnx`, `Directory.Build.props`, `global.json` | `dotnet test`, `dotnet build --no-restore`, `dotnet format --verify-no-changes` |
| Swift | `Package.swift` | `swift test`, `swift build`, `swiftlint` |
| Elixir / Erlang | `mix.exs`, `rebar.config` | `mix test`, `mix format --check-formatted`, `mix credo --strict`, `mix dialyzer`, `rebar3 eunit`, `rebar3 ct`, `rebar3 dialyzer` |
| Haskell | `*.cabal`, `cabal.project`, `stack.yaml`, `package.yaml` | `cabal test/build`, `stack test/build`, `hlint .` |
| OCaml | `dune-project`, `*.opam` | `dune runtest`, `dune build` |
| Zig | `build.zig`, `build.zig.zon` | `zig build test`, `zig build`, `zig fmt --check .` |
| Crystal | `shard.yml` | `crystal spec`, `shards build`, `crystal tool format --check` |
| Nim | `*.nimble`, `nim.cfg` | `nimble test`, `nimble build` |
| Julia | `Project.toml` (uuid-sniffed) | `julia --project=. -e 'Pkg.test()'` |
| Dart / Flutter | `pubspec.yaml` | `flutter test/analyze/build`, `dart test/analyze/compile`, `dart format --set-exit-if-changed .` |
| C / C++ | `CMakeLists.txt`, `configure.ac`, `meson.build`, `Makefile` (with C sources) | `cmake -S . -B build && cmake --build build`, `ctest --test-dir build`, `meson setup/compile/test`, `./configure && make && make check` |
| Lua | `*.rockspec`, `.luarc.json`, `.luacheckrc` | (task-runner mined) |
| Infrastructure | `*.tf`, `Chart.yaml`, `Dockerfile`, `openapi.yaml`, `*.proto` | `terraform fmt/validate`, `tflint`, `helm lint`, `hadolint Dockerfile`, `spectral lint`, `buf lint` |

False-positive guard: framework detection only fires when the dep is in
runtime `dependencies`, not `devDependencies`. Projects that use Express as
a test fixture don't get labeled as Express apps. Fixture directories
(`examples/`, `samples/`, `fixtures/`, `docs/`, `testdata/`, `benchmarks/`,
`node_modules/`, `target/`, `dist/`) are excluded from nested stack
detection, so monorepos with example sub-projects report the primary stack
only.

---

## Supported CI systems

`crag analyze` parses gate commands from the following CI formats. Each
extractor handles inline scalars, block scalars (`run: |` / `run: >-`), list
forms, and the system's equivalents. Output is normalized to drop shell
plumbing, dedupe matrix expansions, and filter background processes.

| System | File(s) |
|---|---|
| GitHub Actions | `.github/workflows/*.yml` (recursive) |
| GitLab CI | `.gitlab-ci.yml` |
| CircleCI | `.circleci/config.yml` |
| Travis CI | `.travis.yml` |
| Azure Pipelines | `azure-pipelines.yml`, `.azure-pipelines/**/*.yml` |
| Buildkite | `.buildkite/pipeline.yml` |
| Drone / Woodpecker | `.drone.yml`, `.woodpecker.yml`, `.woodpecker/*.yml` |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` |
| Jenkins | `Jenkinsfile`, `jenkins/Jenkinsfile`, `ci/Jenkinsfile` (declarative + scripted) |
| Cirrus CI | `.cirrus.yml` (`*_script:` keys) |
| Ad-hoc shell CI | `ci/*.sh`, `.ci/*.sh`, `scripts/ci-*.sh` (canonical names only) |

Task runners mined independently: Makefile (`.PHONY` + column-0 targets),
`Taskfile.yml`, `justfile`. Makefile target detection recognises 30+
canonical gate names including `test`, `lint`, `check`, `verify`,
`kselftest`, `selftest`, `sanity`, `smoke`, `integration`, `e2e`.

---

## Supported workspaces

pnpm · npm / yarn · Cargo (`[workspace]`) · Go multi-module (`go.work`) ·
Gradle multi-module · Maven reactor · Nx · Turborepo · Bazel · git submodules ·
independent nested repos · subservices (polyglot microservices under
`src/*`, `services/*`, `packages/*`, `apps/*`, `backend/`, `frontend/`, …
with no root manifest — handled by nested stack detection).

```bash
crag workspace              # human-readable inspection
crag workspace --json       # machine-readable
crag analyze --workspace    # per-member governance sections
```

Symlink cycle protection is built in: `detectNestedStacks` tracks visited
realpaths and skips symlinked directories so pathological monorepos can't
blow up the scanner.

---

## Commands

```
crag analyze                     Generate .claude/governance.md from filesystem
  --dry-run                      Print what would be generated, don't write
  --workspace                    Analyze root + every workspace member
  --merge                        Preserve existing governance, append inferred sections
  --no-install-skills            Skip auto-install of universal skills

crag init                        Interactive interview (requires Claude Code CLI)

crag compile --target <name>     Compile governance to a single target
  --target all                   Compile all 12 targets
  --dry-run                      Print planned output paths, don't write
crag compile                     List available targets

crag diff                        Compare governance against codebase reality

crag doctor                      Deep diagnostic
  --ci                           CI mode: skip checks requiring runtime infra
  --json                         Machine-readable output
  --strict                       Treat warnings as failures
  --workspace                    Run doctor on every workspace member

crag check                       Verify infrastructure file presence
  --json                         Machine-readable
  --governance-only              Only require governance.md (post-analyze mode)

crag workspace                   Inspect detected workspace
  --json                         Machine-readable

crag upgrade                     Update universal skills to latest version
  --check                        Dry-run: show what would change
  --workspace                    Update every workspace member
  --force                        Overwrite modified skills (with backup)

crag version
crag help
```

Unknown flags are rejected with exit code 1 and a typo suggestion for close
matches (e.g. `crag analyze --drty-run` → `did you mean --dry-run?`).

---

## Session loop (Claude Code integration)

When `crag init` sets up a Claude Code project, each session runs:

```
/pre-start-context       Discover project, load governance, cache runtimes
   ↓
   (the task)
   ↓
/post-start-validation   Run gates, auto-fix lint/format, commit
```

`/pre-start-context` reads `governance.md` fresh every session, classifies
task intent (frontend / backend / infra / docs / full), and uses a content-
hashed discovery cache to skip ~80% of redundant scans on unchanged code.

`/post-start-validation` runs gates in the order declared in `governance.md`,
stops on `[MANDATORY]` failure, retries mechanical errors (lint, format) up
to twice with auto-fix, runs a security review, and creates a conventional
commit when everything passes.

Both skills are universal — they ship with crag, never get edited per
project, and adapt to the current codebase via runtime discovery rather
than hardcoded paths.

---

## What crag does not do

- Does not write or modify application code.
- Does not call any LLM. Discovery, analysis, and compilation are pure
  filesystem operations with deterministic output.
- Does not replace CI providers, linters, or test runners. It generates
  config for them.
- Does not collect telemetry. The only network call is an optional
  `crag upgrade --check` npm registry ping (24h cached, 3s timeout,
  graceful offline).

---

## Release pipeline

Every push to `master` runs the CI matrix (Ubuntu / macOS / Windows × Node
18 / 20 / 22). On green, the patch version auto-bumps and publishes to npm
with SLSA provenance attestation. Tags and GitHub releases are created
from `CHANGELOG.md` automatically. To skip a release on a specific push,
add `crag:skip-release` on its own line in the commit body.

---

## Contributing

Issues and PRs at [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag).
See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow.

If `crag analyze` misses a language, CI system, or gate pattern on a public
repo, file an issue with the repo URL and `crag analyze --dry-run` output.
That's the most valuable bug report.

---

## License

MIT — see [LICENSE](./LICENSE). Built by
[Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD).
