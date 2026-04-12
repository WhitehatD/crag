# Architecture

Technical architecture of the crag governance engine (`@whitehatd/crag`).

Zero runtime dependencies. Node >= 18.

## System overview

Crag's core loop has three phases:

1. **Analyze** -- inspect a project directory (manifests, CI configs, git history) and generate `.claude/governance.md`.
2. **Compile** -- read `governance.md` and emit target-specific config files (AGENTS.md, CLAUDE.md, .cursor/rules/, GitHub Actions, Husky, etc.).
3. **Audit** -- detect drift between governance, compiled configs, and codebase reality.

Running `crag` with no arguments executes analyze (if no governance.md exists) then compile-all in one shot (`auto` command).

## Directory structure

```
bin/
  crag.js                 CLI entry point — delegates to src/cli.js:run()

src/
  cli.js                  Command dispatcher (switch on argv[0])
  cli-args.js             Flag validation with Levenshtein typo hints
  cli-errors.js           Exit codes (0=ok, 1=user, 2=internal), cliError(), cliWarn()

  governance/             Governance file parsing and utilities
    parse.js              Parser: governance.md -> structured object
    yaml-run.js           GitHub Actions `run:` command extraction, isGateCommand()
    drift-utils.js        Branch strategy / commit convention drift detection
    gate-to-shell.js      Convert gate commands to shell-safe strings

  analyze/                Project analysis subsystem
    stacks.js             Language/framework detection (25+ detectors)
    gates.js              Per-language gate inference (lint/test/build commands)
    ci-extractors.js      Multi-CI command extraction (12 CI systems)
    normalize.js          CI gate deduplication and normalization
    project-mining.js     Architecture, testing profile, code style, anti-patterns
    doc-mining.js         Gate discovery from README/CONTRIBUTING docs
    task-runners.js       Makefile/Taskfile/Justfile target mining

  compile/                Compile target generators (one file per target)
    agents-md.js          AGENTS.md (Linux Foundation standard)
    claude.js             CLAUDE.md
    cursor-rules.js       .cursor/rules/governance.mdc
    gemini-md.js          GEMINI.md
    copilot.js            .github/copilot-instructions.md
    cline.js              .clinerules
    continue.js           .continuerules
    windsurf.js           .windsurf/rules/governance.md
    zed.js                .rules
    amazonq.js            .amazonq/rules/governance.md
    forgejo.js            .forgejo/workflows/gates.yml (Forgejo / Gitea Actions)
    github-actions.js     .github/workflows/gates.yml
    husky.js              .husky/pre-commit
    pre-commit.js         .pre-commit-config.yaml
    scaffold.js           Infrastructure: hooks, settings, agents, CI playbook
    atomic-write.js       Crash-safe file writes (tmpfile + rename)
    preserve.js           Preserve user sections across recompile (crag:auto-start markers)
    path-groups.js        Path-scoped gate grouping for CI workflows

  commands/               Command implementations
    analyze.js            `crag analyze` — project analysis + governance generation
    audit.js              `crag audit` — three-axis drift detection
    compile.js            `crag compile` — target dispatch + dry-run + verbose sizing
    diff.js               `crag diff` — governance vs reality comparison
    doctor.js             `crag doctor` — deep diagnostic
    auto.js               `crag` (no args) — analyze-if-needed + compile-all
    init.js               `crag init` — interactive interview + skill installation
    check.js              `crag check` — infrastructure completeness verification
    hook.js               `crag hook` — pre-commit hook install/uninstall/status
    upgrade.js            `crag upgrade` — update universal skills, --siblings
    workspace.js           `crag workspace` — workspace type + member inspection
    demo.js               `crag demo` — self-contained proof-of-value run
    login.js              `crag login` — GitHub OAuth to crag cloud
    sync.js               `crag sync` — push/pull governance to cloud
    team.js               `crag team` — cloud team management

  workspace/              Workspace detection and enumeration
    detect.js             Detect workspace type (npm, pnpm, yarn, cargo, go, lerna, etc.)
    enumerate.js          List workspace members
    governance.js         Workspace-level governance hierarchy

  cloud/                  Cloud client (api.crag.sh)
    auth.js               OAuth token storage
    client.js             HTTP client for cloud API
    config.js             Cloud endpoint configuration

  update/                 Version management
    version-check.js      Non-blocking update nudge (cached, ~1ms warm)
    integrity.js          Skill file integrity verification
    skill-sync.js         Skill hash synchronization

  skills/                 Universal skills (ship with crag, same for every project)
  crag-agent.md           Agent persona definition

test/                     591 tests, run via `node test/all.js`
benchmarks/               Benchmark harness and results
docs/                     Documentation
```

## Parser

**File:** `src/governance/parse.js` (294 lines)

`parseGovernance(content)` parses a governance.md string into a structured object:

```js
{
  name, description, stack, runtimes, inherit,
  branchStrategy, commitConvention, commitTrailer, security,
  gates: { [sectionName]: { commands: [{cmd, classification}], path, condition } },
  // Enriched sections (from project-mining):
  architecture, keyDirectories, testing, codeStyleSection,
  importConventions, dependencyPolicy, antiPatterns, frameworkConventions,
  warnings: []
}
```

### Gate parsing

Gates live under `## Gates` and are organized into subsections (`### Lint`, `### Test`, etc.). Two command carriers are supported:

1. **Bullet lists:** `- npm run test` (lines matching `^\s*- `)
2. **Fenced code blocks:** ` ```bash` / ` ``` ` -- every non-blank, non-comment line inside is extracted as MANDATORY.

Each command can carry a classification suffix: `# [MANDATORY]`, `# [OPTIONAL]`, or `# [ADVISORY]`. Default is MANDATORY.

### Section annotations

Subsection headings support path scoping and conditionals:

- `### Frontend (path: frontend/)` -- gates resolve against the subdirectory
- `### Docker (if: Dockerfile)` -- section only applies when the file exists

Path annotations are validated by `isValidAnnotationPath()` (line 29) which rejects absolute paths, parent traversal, newlines, and null bytes -- these paths are interpolated into shell commands downstream.

### Flattening

- `flattenGates(gates)` -- returns `{ section: ['cmd1', 'cmd2'] }` (strips metadata, for backward compat)
- `flattenGatesRich(gates)` -- returns `[{ section, cmd, classification, path, condition }]` (preserves all metadata)

### Size guard

Content exceeding 256 KB is truncated at the last section boundary to prevent ReDoS on backtracking-prone regex (line 16).

## Compiler

**File:** `src/commands/compile.js` (297 lines)

### Target registry

14 compile targets, stored in `ALL_TARGETS` (line 25):

| Group | Targets |
|-------|---------|
| CI / git hooks | `github`, `forgejo`, `husky`, `pre-commit` |
| AI agents (native) | `agents-md`, `cursor`, `gemini` |
| AI agents (additional) | `copilot`, `cline`, `continue`, `windsurf`, `zed`, `amazonq`, `claude` |

Plus `scaffold` (separate from `all` -- generates hooks, settings, agents, CI playbook).

### Dispatch

`runGenerator(target, cwd, parsed)` (line 209) dispatches to the appropriate `generate*()` function via a switch statement. Each generator:

1. Reads the parsed governance object
2. Generates target-specific content (Markdown, YAML, shell script, or MDC)
3. Writes via `atomicWrite()` (crash-safe: tmpfile + rename)

### Output path mapping

`planOutputPath(cwd, target)` (line 278) maps target names to file paths. Used by compile, audit, and dry-run.

### Content preservation

Generators use `preserveCustomSections()` from `src/compile/preserve.js` to wrap generated content in markers (`<!-- crag:auto-start -->` / `<!-- crag:auto-end -->` for Markdown, `# crag:auto-start` / `# crag:auto-end` for YAML/shell). User content outside these markers survives recompilation.

### Dry-run and verbose

- `--dry-run`: prints planned output paths without writing
- `--dry-run --verbose`: runs generators into a temp scratch dir, stats the files, reports byte sizes, then cleans up (`computeArtifactSizes()`, line 237)

### Safety

Executable targets (`github`, `husky`, `pre-commit`) are refused when gate count is 0 (line 133) -- they would produce broken workflows with no checks.

## Audit engine

**File:** `src/commands/audit.js` (265 lines)

Three drift detection axes:

### Axis 1: Staleness (line 50)

For each of the 14 compile targets, compare `mtime` of the compiled config against `mtime` of `governance.md`. If governance is newer, the config is **stale**.

### Axis 2: Reality (line 79)

For each gate command in governance (using `flattenGatesRich` to respect path scoping), call `checkGateReality(dir, cmd)` from `src/commands/diff.js`. This checks:

- `npx <tool>`: does the npm package exist in deps or `.bin`?
- `npm run <script>`: does the script exist in package.json?
- `node --check <file>`: does the file exist?
- `cargo`, `go`, `gradlew`, `pytest`, `ruff`, `docker`: do their respective manifests exist?

Binary-to-package aliases (`BINARY_PKG_ALIASES` in diff.js line 80) handle cases where the CLI binary name differs from the npm package name (e.g., `biome` -> `@biomejs/biome`, `tsc` -> `typescript`).

Monorepo fallback (`checkSubdirs`, diff.js line 150): if a tool is not at root, scans immediate subdirectories.

Additionally, CI extras are detected: commands in CI workflows that are not in governance (line 89). Uses `extractCIGateCommands()` which calls the analyze-side multi-CI extractor. Only crag-managed files (those with `# crag:auto-start`) are checked; companion workflows are listed separately as informational.

### Axis 3: Missing targets (line 105)

Checks for tool indicator directories/files (`.cursor/`, `.github/workflows/`, `AGENTS.md`, etc.) that exist but have no corresponding compiled config.

### Output modes

- Terminal: colored output with aligned columns, summary bar, fix hints
- `--json`: structured `{ summary, stale, current, drift, extra, missing, unmanagedCI }`
- `--fix`: auto-recompiles stale targets via `runGenerator()`
- Exit code `EXIT_USER` (1) when issues are found

## Stack detection

**File:** `src/analyze/stacks.js` (839 lines)

`detectStack(dir, result)` (line 121) runs 25+ independent language detectors sequentially. Each detector checks for primary manifests:

| Detector | Manifest | Stack entries |
|----------|----------|---------------|
| `detectNode` | `package.json` | node, typescript, react, next.js, vue, svelte, angular, express, hono, ... |
| `detectRust` | `Cargo.toml` | rust |
| `detectGo` | `go.mod` | go |
| `detectPython` | `pyproject.toml`, `setup.py` | python, django, flask, fastapi |
| `detectJava` | `build.gradle`, `pom.xml` | java, kotlin, gradle, maven |
| `detectDotNet` | `*.csproj`, `*.fsproj` | dotnet |
| `detectSwift` | `Package.swift` | swift |
| `detectElixir` | `mix.exs` | elixir |
| `detectRuby` | `Gemfile` | ruby |
| `detectPhp` | `composer.json` | php |
| `detectDart` | `pubspec.yaml` | dart, flutter |
| `detectCFamily` | `CMakeLists.txt`, `Makefile`, `meson.build` | c, cpp |
| ... | | (also: deno, bun, haskell, ocaml, zig, crystal, nim, julia, lua, erlang) |

### Recursive nested-stack detection

When `recursive: true` (default), `detectNestedStacks()` scans conventional subservice directories (`src/`, `services/`, `packages/`, `apps/`, `cmd/`, etc.) to pick up polyglot monorepo layouts. Goes two levels deep. Excludes fixture/example directories (`NESTED_SCAN_EXCLUDE` set, line 191).

### Manifest attachment

Detectors attach raw manifest data to `result._manifests` (e.g., `_manifests.packageJson`, `_manifests.cargoWorkspace`) for downstream gate inference. This is cleaned up before returning from `analyzeProject()`.

## Gate inference

**File:** `src/analyze/gates.js` (561 lines)

`inferGates(dir, result)` runs per-language gate inferrers that read `result._manifests` and populate `result.linters`, `result.testers`, `result.builders`:

- **Node**: checks `scripts.test`, `scripts.lint`, `scripts.build` in package.json. Falls back to config file detection (eslint.config.*, biome.json, .prettierrc). Detects XO, Vitest, Jest, Playwright, Cypress.
- **Python**: infers from pyproject.toml sections (`tool.pytest`, `tool.ruff`, `tool.mypy`), setup.cfg, tox.ini.
- **Rust**: `cargo test`, `cargo clippy`, `cargo fmt --check` based on Cargo.toml.
- **Go**: `go test ./...`, `go vet ./...`, `golangci-lint run` if config exists.
- **Java/Gradle**: `./gradlew test`, `./gradlew check`, `./gradlew build`.
- Similarly for all 25+ supported languages.

Conservative principle: prefer canonical commands, never guess exotic flags.

## CI extraction

**File:** `src/analyze/ci-extractors.js` (572 lines)

`extractCiCommands(dir)` detects the CI system and extracts raw shell commands:

| CI System | Config file(s) | Extractor |
|-----------|---------------|-----------|
| GitHub Actions | `.github/workflows/*.yml` | `extractRunCommands()` from yaml-run.js |
| Forgejo / Gitea | `.forgejo/workflows/*.yml`, `.gitea/workflows/*.yml` | `extractRunCommands()` (same as GH Actions) |
| GitLab CI | `.gitlab-ci.yml` | `extractGitlabCommands()` |
| CircleCI | `.circleci/config.yml` | `extractCircleCommands()` |
| Travis CI | `.travis.yml` | `extractTravisCommands()` |
| Azure Pipelines | `azure-pipelines.yml` | `extractAzureCommands()` |
| Buildkite | `.buildkite/pipeline.yml` | `extractBuildkiteCommands()` |
| Drone | `.drone.yml` | `extractDroneCommands()` |
| Woodpecker | `.woodpecker.yml` | `extractWoodpeckerCommands()` |
| Bitbucket | `bitbucket-pipelines.yml` | `extractBitbucketCommands()` |
| Jenkins | `Jenkinsfile` | `extractJenkinsCommands()` (Groovy parsing) |
| Cirrus CI | `.cirrus.yml` | `extractCirrusCommands()` |

Returns `{ system, commands, managedCommands, unmanagedSources }`. For GitHub Actions, files with `# crag:auto-start` are "managed" (crag-generated); others are "companion" workflows reported separately by audit.

### Command filtering

`isGateCommand(cmd)` in `yaml-run.js` (line 78) classifies extracted commands. Two-pass approach:

1. **Exclude patterns** (line 95): reject echo, printf, variable assignments, git mutations, npm publish, filesystem setup, GitHub Actions output streams, control flow.
2. **Include patterns** (line 120): match test/lint/build commands across all supported ecosystems (100+ patterns).

### Normalization

`src/analyze/normalize.js` deduplicates and normalizes CI gates -- collapses matrix variants, strips CI-specific flags, removes install-only commands.

## CLI architecture

**File:** `src/cli.js` (163 lines)

### Entry point

`bin/crag.js` calls `run(process.argv.slice(2))`. The `run()` function (line 122) dispatches on `args[0]` via a switch statement.

### Async handling

Cloud commands (`login`, `sync`, `team`) are async. `bin/crag.js` detects Promise returns and attaches `.catch()` for clean error handling (line 10).

### Default behavior

When no command is given and `looksLikeProject(cwd)` returns true (checks for 16 known manifest files), the `auto` command runs. Otherwise, usage is printed.

### Exit codes

Defined in `src/cli-errors.js`:

- `0` -- success
- `EXIT_USER = 1` -- user-recoverable error (missing governance, bad flag, drift detected)
- `EXIT_INTERNAL = 2` -- environmental error (permission denied, disk full, bug)

### Flag validation

`validateFlags(commandName, args, spec)` in `src/cli-args.js` rejects unknown flags with Levenshtein-based typo suggestions. Universal flags (`--help`, `--no-color`, `--verbose`, `--quiet`) are accepted by all commands.

### Error output

`cliError(message, exitCode)` prints `  [red X] Error: <message>` and exits. `cliWarn(message)` prints a yellow warning without exiting.

## Key data flows

### analyze flow

```
crag analyze
  -> analyze.js:analyze(args)
      -> analyzeProject(cwd)
          -> stacks.js:detectStack(dir, result)       // populate result.stack, result._manifests
          -> ci-extractors.js:extractCiCommands(dir)   // detect CI, extract commands
          -> normalize.js:normalizeCiGates(commands)   // dedup, filter
          -> gates.js:inferGates(dir, result)           // per-language gate inference
          -> task-runners.js:mineTaskTargets(dir)       // Makefile/Task/Just targets
          -> project-mining.js:mine*()                  // architecture, testing, style, etc.
          -> doc-mining.js:mineDocGates(dir)            // advisory gates from docs
      -> workspace/detect.js:detectWorkspace(cwd)      // detect workspace type
      -> generateGovernance(analysis, cwd)             // render governance.md text
      -> fs.writeFileSync(govPath, governance)
      -> init.js:installSkills(cwd)                    // copy universal skills
```

### compile flow

```
crag compile --target all
  -> compile.js:compile(args)
      -> parse.js:parseGovernance(content)             // parse governance.md
      -> flattenGates(parsed.gates)                    // simple {section: [cmds]}
      -> for each target in ALL_TARGETS:
          -> runGenerator(target, cwd, parsed)
              -> e.g. agents-md.js:generateAgentsMd(cwd, parsed)
                  -> preserve.js:preserveCustomSections()  // wrap in markers
                  -> atomic-write.js:atomicWrite()          // crash-safe write
```

### audit flow

```
crag audit --json
  -> audit.js:audit(args)
      -> parse.js:parseGovernance(content)
      -> Axis 1: for each target, compare mtime(governance.md) vs mtime(compiled config)
      -> Axis 2: flattenGatesRich(parsed.gates)
          -> for each gate:
              -> diff.js:checkGateReality(dir, cmd)    // verify tool/dep exists
      -> extractCIGateCommands(cwd)                    // find CI extras
      -> extractUnmanagedCIFiles(cwd)                  // companion workflows
      -> Axis 3: check tool indicators vs compiled configs
      -> output JSON or terminal report
```

### diff flow

```
crag diff
  -> diff.js:diff(args)
      -> parse.js:parseGovernance(content)
      -> flattenGatesRich() for path-scoped gate checking
      -> checkGateReality(dir, cmd) per gate
      -> extractCIGateCommands(cwd) for CI extras
      -> checkBranchStrategy() via drift-utils.js
      -> checkCommitConvention() via drift-utils.js
```

### auto flow (zero-arg invocation)

```
crag
  -> cli.js: looksLikeProject(cwd) ? auto(args) : printUsage()
  -> auto.js:auto(args)
      -> if no governance.md:
          -> analyze(['analyze', '--no-install-skills'])
      -> compile(['compile', '--target', 'all'])
      -> init.js:installSkills(cwd)
```

## File counts

| Directory | Files | Lines |
|-----------|-------|-------|
| `src/analyze/` | 7 | 2,954 |
| `src/compile/` | 17 | 1,891 |
| `src/commands/` | 15 | ~3,500 |
| `src/governance/` | 4 | 673 |
| `src/` (total) | 55 | ~10,000 |
| `test/` | 39 | ~6,000 |
