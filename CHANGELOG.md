# Changelog

All notable changes to crag are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.42] — 2026-04-08

## [0.2.41] — 2026-04-08

## [0.2.40] — 2026-04-08

## [0.2.39] — 2026-04-08

## [0.2.38] — 2026-04-08

## [0.2.37] — 2026-04-08

## [0.2.36] — 2026-04-08

## [0.2.35] — 2026-04-07

## [0.2.34] — 2026-04-06

## [0.2.33] — 2026-04-06

## [0.2.32] — 2026-04-06

## [0.2.31] — 2026-04-06

## [0.2.30] — 2026-04-06

## [0.2.29] — 2026-04-06

## [0.2.28] — 2026-04-06

## [0.2.27] — 2026-04-06

## [0.2.26] — 2026-04-06

## [0.2.25] — 2026-04-06

## [0.2.24] — 2026-04-06

## [0.2.23] — 2026-04-06

## [0.2.22] — 2026-04-06

## [0.2.21] — 2026-04-06

## [0.2.20] — 2026-04-06

## [0.2.19] — 2026-04-05

## [0.2.18] — 2026-04-05

## [0.2.17] — 2026-04-05

## [0.2.16] — 2026-04-05

## [0.2.15] — 2026-04-05

## [0.2.14] — 2026-04-05

## [0.2.13] — 2026-04-05

## [0.2.12] — 2026-04-05

## [0.2.11] — 2026-04-05

### Fixed — 28 findings from the 101-repo stress-test audit

**Correctness**
- `cli-args.js` (new) — shared `validateFlags()` with typo suggestions,
  wired into `analyze`, `compile`, `diff`, `doctor`, `upgrade`, `workspace`,
  `check`. Unknown flags were previously accepted silently; `crag analyze
  --garbage-flag` wrote governance with no warning. Now exits 1 with a
  "did you mean?" hint for close matches.
- `normalize.js` `isNoise` — extended with 11 new rules: standalone shell
  builtins (`break`, `exit`, `continue`, `shift`, `trap`), backslash line
  continuations, version probes (`node --version`, `which`,
  `shellcheck --version`), variable assignments from embedded code
  (`rake_version = File.read(...)`), subshell fragments, cross-language
  prints (`puts`, `print`, `console.log`, `die`), and `curl | bash`
  installers. Regression examples: vscode no longer gets `break` as a
  gate; duckdb no longer gets `make \`; ruby no longer gets
  `rake_version = ...` leaked from a ruby `run: |` block.
- `normalize.js` `extractMainCommand` — now splits on `;` in addition to
  `&&`, and returns `''` when every part of the compound is noise so the
  caller rejects the whole line instead of leaking the last fragment.
- `analyze.js` — emits `- true  # TODO: …` placeholder under `### Test`
  when zero gates are detected. Previously crag wrote a valid file with
  an empty `## Gates` section and every downstream doctor/compile/diff
  call failed with "0 gates declared". 20 repos in the stress test hit
  this path (bitcoin, postgres, sqlite, cabal, flutter, jint, nginx, …).
- `diff.js` — deduplicate EXTRA commands across workflows via
  `normalizeCiGates`; reuse analyze-side `extractCiCommands` so
  non-GitHub CI systems (Jenkins, GitLab, CircleCI, Azure, Buildkite,
  Cirrus, Drone, Woodpecker, Bitbucket) actually participate in drift
  detection. Previously `diff.js` only scanned `.github/workflows/`.
- `diff.js` `normalizeCmd` — strips YAML-style wrapping quotes
  iteratively so `"npm test"` compares equal to `npm test`.

**Coverage — 14 new stack detectors**
- `stacks.js` — C/CMake (`CMakeLists.txt`), C/autotools (`configure.ac`,
  `autogen.sh`), C/Meson (`meson.build`), Haskell (cabal/stack/hpack),
  OCaml (dune/opam), Zig (`build.zig`), Crystal (`shard.yml`), Nim
  (`*.nimble`), Julia (uuid-sniffed `Project.toml`), Dart/Flutter
  (`pubspec.yaml`), Erlang (rebar3/erlang.mk), Lua (rockspec), expanded
  .NET (`.slnx`, `Directory.Build.props`, `Directory.Packages.props`,
  `global.json`). C/C++ Makefile detection is guarded so Node/Python/Go
  projects with a convenience `Makefile` aren't mislabelled.
- `stacks.js` `detectNestedStacks` — now skips fixture directories
  (`examples/`, `samples/`, `fixtures/`, `docs/`, `testdata/`,
  `benchmarks/`, `node_modules/`, `target/`, `dist/`, …) so nx no longer
  reports 7 stacks because of fixture sub-apps. Added symlink cycle
  protection via realpath identity (`lstatSync` + visited `Set`).
- `stacks.js` `detectKotlin` — Kotlin-only `build.gradle.kts` now also
  adds `java/gradle` + detects `gradleWrapper` so `inferKotlinGates` has
  a build system hook.
- `gates.js` — new `inferGates` implementations for 12 languages
  (Erlang, Haskell, OCaml, Zig, Crystal, Nim, Julia, Dart, Flutter,
  C-family CMake/Meson/autotools/Makefile).

**Coverage — CI systems**
- `ci-extractors.js` — added Cirrus CI extractor (`.cirrus.yml` `*_script:`
  keys), used by bitcoin, postgres, flutter, and many embedded / systems
  projects. Added ad-hoc `ci/*.sh`, `.ci/*.sh`, `scripts/ci-*.sh` scanner
  for canonical gate names (test.sh, lint.sh, check.sh).
- `ci-extractors.js` — block-scalar quote stripping is now consistent
  across every extractor path. Previously CircleCI (`run: |` form),
  Azure (`script: |`), and the generic `extractYamlListField` path used
  by GitLab/Travis/Buildkite/Drone/Bitbucket all dropped `stripYamlQuotes`
  on block scalars, leaking quoted strings. Regression guard: new
  parametrized test in `test/analyze-ci-extractors.test.js` asserts
  inline + block-scalar quote stripping across 7 CI systems.
- `ci-extractors.js` `extractCircleCommands` — now handles the `run: |`
  block scalar form. Previously only `command: |` was parsed, so any
  CircleCI job using `- run: |\n  <commands>` dropped its entire body.
- `yaml-run.js` `extractRunCommands` — block scalars on GitHub Actions
  paths now also call `stripYamlQuotes`.

**Coverage — task runners**
- `task-runners.js` — `GATE_TARGET_NAMES` expanded with 20+ names
  including `kselftest`, `selftest`, `sanity`, `smoke`, `regress`,
  `integration`, `e2e`, `unit`, `itest`, `validate`, `audit`, `security`,
  `sec`, `sast`. Removed ambiguous `'style'` (often a CSS build artifact
  target, not a linter).

**UX**
- `compile.js` — target validation is now the first thing `compile()`
  does, so `crag compile --target zzzunknown` fails fast without the
  previous "Compiling → zzzunknown / 0 gates, 0 runtimes" noise that
  used to precede the error.
- `compile.js` — refuses to emit executable targets
  (`github`, `husky`, `pre-commit`) when `gateCount === 0`. Previously
  crag would write a valid-YAML-but-no-steps workflow file. Doc-only
  targets (`cursor`, `agents-md`, `gemini`, …) still work.
- `compile.js` — help text uses `${ALL_TARGETS.length}` instead of a
  hardcoded "12".
- `analyze.js` — cross-section gate dedup via `normalizeCmd`. Fixes
  chalk regression where both `### Test - npm run test` and
  `### CI - npm test` showed up.
- `analyze.js` — auto-installs universal skills after writing
  governance.md (opt out with `--no-install-skills`). Closes the UX gap
  where `crag check` always failed right after `crag analyze`.
- `check.js` — new `--governance-only` mode that only requires
  `governance.md`, for the post-analyze path.
- `analyze.js` — rotates `.bak.<millis>` files to the 3 newest. Previous
  behaviour accumulated one backup per run.
- `analyze.js` — warns when invoked from a known infra subdirectory
  (`.claude/`, `.github/`, `.buildkite/`, `.gitlab/`, `.cursor/`,
  `.vscode/`, `.idea/`, `.husky/`). Previous behaviour was to silently
  treat the subdirectory as its own project.
- `analyze.js` — drains malformed-JSON warnings from `stacks.js` and
  reports them via `cliWarn`. Users now see when a root `package.json`
  failed to parse.

**Audit items**
- `parse.js` — `MAX_CONTENT_SIZE` truncation now cuts at the last `\n## `
  section boundary instead of mid-line, preserving gate integrity on
  oversize files.
- `doctor.js` — `rtk-hook-version` marker window 5 → 20 lines.
- `doctor.js` — git command timeouts (`git branch -a`, `git log`) now
  surface as `warn` with a clear detail instead of silent skip.

### Testing
- **498 tests passing** (from 357). 141 new cases covering every new
  rule above, including a parametrized cross-CI quote-stripping
  regression test against GitHub Actions, GitLab, CircleCI, Travis,
  Azure, Drone, Bitbucket with both inline and block-scalar forms.
- New test files: `cli-args.test.js`, `compile-validation.test.js`,
  `workspace.test.js`, `upgrade.test.js`.

### Stress-test evidence
- 101 open-source repositories × 21 main commands + 23 edge-case
  commands = ~4,400 invocations. 0 crashes, 0 unexpected exit codes.
- Verified post-fix: all 17 previously-failing `doctor --ci` repos now
  pass; vscode/duckdb/ruby/gatsby/elixir leaks are gone;
  bitcoin/postgres/cabal/flutter/jint/duckdb now get correct stacks
  instead of `unknown`.

## [0.2.4] — [0.2.10] — 2026-04-05

Auto-release bumps. No user-visible changes between `[0.2.3]` and
`[0.2.11]`; consolidated here rather than keeping empty version headers.

## [0.2.3] — 2026-04-05

### Security
- **Shell injection in `pre-commit.js`** — `gate.path` and `gate.condition` from `governance.md` were interpolated into `cd "..."` and `[ -e "..." ]` without escaping. An adversarial governance file could break out of the shell context. Both values now go through `shellEscapeDoubleQuoted` (backslash-first escape order). The whole `bash -c '...'` body is wrapped with `shellEscapeSingleQuoted`.
- **YAML injection in `github-actions.js`** — `gate.path` was concatenated into `working-directory:` and `gate.condition` into `hashFiles('...')` without escaping. Both now route through `yamlScalar()`. The `hashFiles` argument additionally has single-quote-doubling (`''`) for GHA expression syntax.
- **Path traversal in governance annotations** — `parseGovernance()` now validates `path:` and `if:` annotation values via `isValidAnnotationPath()`. Rejects absolute POSIX paths, Windows drive-letter paths, UNC paths, `..` segments, newlines, and null bytes. Invalid values are dropped and a warning is recorded.
- **Husky backslash-ordering fix** — `gate.path`/`gate.condition` in husky hooks are now escaped via `shellEscapeDoubleQuoted` which handles `\` before `"` so a trailing backslash cannot eat the closing quote.
- **`atomicWrite` temp suffix is now crypto-random** — previously `${pid}.${Date.now()}` was predictable. Now uses `crypto.randomBytes(8).toString('hex')` + the `wx` open flag as a defense-in-depth against symlink races on shared tmpfs.
- **Stricter `yamlScalar`** — also quotes strings beginning with YAML flow indicators (`[`, `]`, `{`, `}`, `,`), block-sequence markers (`- `), tag/complex-key markers (`?`, `!`), and control characters. Previously a classification-prefixed name like `[OPTIONAL] test` could have been interpreted as a flow sequence.
- **`SECURITY.md`** — published threat model, supported versions, disclosure process.

### Added
- **`crag compile --dry-run`** — preview target output paths without writing files.
- **`crag check --json`** — machine-readable infrastructure report.
- **Test runner filter** — `node test/all.js parse diff` runs only matching files.
- **Structured exit codes** — `src/cli-errors.js` exports `EXIT_USER=1` and `EXIT_INTERNAL=2`. Scripts can now distinguish user-recoverable errors from environmental failures. All commands route through `cliError()`.
- **Windows shell handling in `init`** — `spawn('claude', ...)` now uses `shell: bash` on Windows instead of defaulting to `cmd.exe`, which could not always resolve the claude binary.
- **`os.homedir()` fallback in `init`** — crash-hardens against containers/CI where both `HOME` and `USERPROFILE` are unset.
- **`.gitattributes`** — pins shell scripts, hooks, and YAML to LF so Windows contributors cannot commit CRLF into generated artifacts.
- **69 new tests** (159 → 228) covering: path-traversal annotation rejection (10), injection regression for pre-commit and github-actions (8), `isTrustedSource` symlink protection (7), `check` command logic (6), shared `yaml-run` helper (13), `resolveHomeDir`, `atomicWrite` edge cases (5), expanded `yamlScalar` rules (6), pre-commit + agents-md + cursor-rules + gemini-md compile targets (12).

### Changed
- **GitHub Actions generator** — the Python setup step now uses `shell: bash` explicitly so `2>/dev/null` redirects work on Windows runners (previously silently failed in `cmd.exe`).
- **`extractRunCommands` / `isGateCommand`** — moved from duplicated copies in `analyze.js` and `diff.js` into a shared `src/governance/yaml-run.js`. Both commands import from the shared module; public exports remain for test compatibility.
- **Error handling at file I/O boundaries** — `init`, `compile`, `diff`, `analyze` now wrap `fs.copyFileSync`, `fs.readFileSync`, and `fs.writeFileSync` with try/catch and emit actionable errors via `cliError` instead of raw Node stack traces.
- **Parser warnings are surfaced** — `compile` and `diff` print `parsed.warnings` to stderr before proceeding, so invalid annotations are visible.
- **Skill source_hash sync** — skill frontmatter `version:` fields updated to `0.2.2`.

## [0.2.2] — 2026-04-05

### Added
- **Fully automated release pipeline** (`.github/workflows/release.yml`). Triggers on every push to `master`. Runs all gates + 159 tests + compile-all smoke test, detects whether the `package.json` version is new, and if so publishes to npm with SLSA provenance, creates the git tag, and creates a GitHub release with notes auto-extracted from `CHANGELOG.md`. Zero manual steps between commit and package-on-npm.
- **Auto skill-hash sync workflow** (`.github/workflows/sync-hashes.yml`). Recomputes `source_hash` frontmatter whenever `src/skills/*.md` content changes. Commits updates as `github-actions[bot]` with `[skip ci]` to avoid loops. Contributors never manually track hashes.
- **Version bump helper** (`scripts/bump-version.js`). One-command semver bump via `npm run release:patch | :minor | :major`. Updates `package.json` and converts the `[Unreleased]` CHANGELOG header into a dated version section. Accepts explicit versions too.
- **Skill hash sync script** (`scripts/sync-skill-hashes.js`). Reusable CLI: `npm run sync-hashes`. Reads every skill, computes SHA-256 of body with CRLF normalization, updates frontmatter if drifted.
- **Maintainer workflow docs** in `CONTRIBUTING.md` covering the three-command release flow and troubleshooting.

### Changed
- **Removed** `.github/workflows/publish.yml` (the old manual-trigger release workflow). `release.yml` replaces it with full push-driven automation.

### Fixed
- `bump-version.js` now inserts a blank line between version sections and uses the maintainer's local date (not UTC date).
- `circuit-breaker.sh` counter now lives under `.claude/.tmp/` instead of `/tmp/` — avoids stale-state issues on Windows + Git Bash where `/tmp` persists across sessions.

## [0.2.1] — 2026-04-05

### Fixed
- **README rendering on npm.** Replaced 4 mermaid diagrams with ASCII art / markdown tables. npm's markdown renderer doesn't support mermaid, so the diagrams were showing as raw YAML text on the package page. GitHub still renders mermaid natively, but the canonical README is now cross-platform (GitHub, npm, text readers, terminals).

## [0.2.0] — 2026-04-05

Renamed and expanded. First release under the `@whitehatd/crag` name.

### Added
- **Four new commands**: `analyze`, `diff`, `upgrade`, `workspace`.
- **`crag analyze`** — zero-interview governance generation. Reads CI workflows (recursively, including `run: |` multiline blocks), `package.json` scripts, linter configs (ESLint/Biome/Prettier/Ruff/Clippy/Rustfmt/Mypy/TypeScript), git log for branch/commit patterns, and deployment configs (Docker, k8s, Vercel, Fly, Netlify, Render, Terraform).
- **`crag diff`** — governance vs reality comparison with MATCH/DRIFT/MISSING/EXTRA verdicts, memoized package.json + bin reads, command alias normalization (`npm test` ⇔ `npm run test`, `./gradlew` ⇔ `gradlew`).
- **`crag upgrade`** — version-tracked skill updates. Skills carry `version` and `source_hash` (SHA-256 CRLF-normalized). Only overwrites unmodified skills unless `--force` (with timestamped backup).
- **`crag workspace`** — workspace inspector. Prints detected type, root, members, tech stacks per member, governance hierarchy. JSON output mode via `--json`.
- **Workspace detection for 11+ types**: pnpm, npm/yarn, Cargo, Go, Gradle (kts + groovy), Maven, Nx, Turborepo, Bazel, git submodules, independent nested repos.
- **Multi-level governance** with `## Gates (inherit: root)` marker. Root gates prepended, member gates appended, runtimes deduped.
- **Governance v2 format** (backward-compatible):
  - `### Section (path: dir/)` — path-scoped gates (cd before running)
  - `### Section (if: file)` — conditional sections (skip if file missing)
  - `# [MANDATORY]` / `# [OPTIONAL]` / `# [ADVISORY]` — gate classifications
  - `## Gates (inherit: root)` — inheritance marker
- **12 compile targets** (was 3):
  - CI / git hooks: `github`, `husky`, `pre-commit`
  - AI agents (native): `agents-md`, `cursor`, `gemini`
  - AI agents (additional): `copilot`, `cline`, `continue`, `windsurf`, `zed`, `cody`
- **Runtime version inference** — CI generator reads `package.json engines.node`, `pyproject.toml requires-python`, `build.gradle.kts` toolchain, `pom.xml maven.compiler.source`, `go.mod go X.Y` directive instead of hardcoding defaults.
- **Auto-update system** — skills track version + SHA-256 source_hash in YAML frontmatter. CRLF normalization for Windows/Unix portability. Global cache at `~/.claude/crag/update-check.json` with 24h TTL. Graceful offline failure. Opt-out via `CRAG_NO_UPDATE_CHECK=1`.
- **159 tests** across 12 test files (was 0). Zero dependencies. Run via `npm test` or `node test/all.js`.
- **Atomicity** — all compile targets use `atomicWrite()` (temp file + rename). Partial failures leave old state intact.

### Changed
- **Renamed from `scaffold-cli` to `@whitehatd/crag`.** npm blocked the unscoped `crag` name via its short-name similarity policy; scoped package under the user's npm scope is the recommended fallback.
- **Rebranded tagline** to "The bedrock layer for AI coding agents. One governance.md. Any project. Never stale."
- **Modular architecture**: split 397-line `bin/scaffold.js` into 24+ modules across 6 directories (`commands/`, `governance/`, `workspace/`, `compile/`, `update/`, `cli.js`). Zero new dependencies.
- **Post-start skill**: added concrete runtime instructions for v2 annotations (`path:`, `if:`, classifications, `inherit:`).
- **Pre-start skill**: added Section 0.05 (skill currency check) and Section 1.5 (workspace detection).

### Fixed
- **Shell injection** in `gateToShell()` when processing `Verify "..."` patterns. All interpolated values now escape `\`, `` ` ``, `$`, and `"`.
- **CRLF hash mismatch** — same content now produces identical hashes on Windows and Unix.
- **Path traversal** in workspace glob expansion. `expandGlobs()` now uses `fs.realpathSync` and rejects `..` patterns.
- **Symlink attack** on source skills. `isTrustedSource()` requires a regular file inside `src/skills/`.
- **YAML injection** in GitHub Actions compile target. Uses block scalars for `run:` and `yamlDqEscape()` for labels.
- **YAML injection** in frontmatter writes. `yamlScalar()` quotes colons, newlines, boolean-like, and number-like strings.
- **ReDoS** in governance parser. 256 KB input cap, line-scan `extractSection()` replaces the regex.
- **HTTPS cleanup** — request unref, timeout, 100 KB response cap, atomic cache write.
- **Conditional gate shell precedence** — now uses `if [ -e f ]; then cmd || exit 1; fi` instead of `[ -e f ] && cmd || exit 1` which fails when the file is missing.
- **`crag upgrade --check` was not actually dry-run** — it was silently writing files. Now honors `dryRun` option.
- **`init.js` `claude --version` timeout** (5s) — prevents CLI hang if the binary crashes.
- **`init.js` pre-flight checks** — warns if not a git repo, warns if existing `governance.md` would be overwritten, handles subprocess errors gracefully.
- **`diff.js` memoization** — single `package.json` read per diff run; `node_modules/.bin` scanned once.
- **`mergeGovernance()` defensive normalization** — never throws on malformed member input.
- **`analyze.js` multi-line `run: |` block extraction** from GitHub Actions workflows.
- **`analyze.js` recursive workflow walking** — finds nested `.github/workflows/ci/*.yml`.
- **`analyze.js` `mergeWithExisting` preserves section order** — new sections added in their original order from the generated template, not reshuffled.
- **Windows stderr noise** on git commands (`execSync` stdio pipes instead of `2>/dev/null`).

### Security
- Added `sandbox-guard.sh` style hard-blocks at hook level (already existed in scaffold-cli, verified for crag).
- Security-reviewer agent gained 4 new checks: shell injection, path traversal, symlink validation, YAML injection.
- `dependency-scanner` agent added for package vulnerability audits (Node, Rust, Python, Go, Java).

### Infrastructure
- **Zero dependencies**, Node 18+ required.
- Package `files` whitelist: `bin`, `src`, `README.md`, `LICENSE` (excludes `.claude/`, `test/`, settings, hooks).
- 30 files, 52 KB tarball.
- Published as `@whitehatd/crag` on npm registry.
- GitHub repo at `github.com/WhitehatD/crag` with 14 topic tags for discoverability.

## [0.1.0] — 2026-04-03 (pre-rename, as `scaffold-cli`)

Initial release under the `scaffold-cli` name.

Initial capabilities: universal skills (pre-start-context, post-start-validation), interview-driven governance generation, 3 compile targets (github, husky, pre-commit), basic workspace support for monorepos via multi-level `governance.md`.

[Unreleased]: https://github.com/WhitehatD/crag/compare/v0.2.42...HEAD
[0.2.42]: https://github.com/WhitehatD/crag/compare/v0.2.41...v0.2.42
[0.2.41]: https://github.com/WhitehatD/crag/compare/v0.2.40...v0.2.41
[0.2.40]: https://github.com/WhitehatD/crag/compare/v0.2.39...v0.2.40
[0.2.39]: https://github.com/WhitehatD/crag/compare/v0.2.38...v0.2.39
[0.2.38]: https://github.com/WhitehatD/crag/compare/v0.2.37...v0.2.38
[0.2.37]: https://github.com/WhitehatD/crag/compare/v0.2.36...v0.2.37
[0.2.36]: https://github.com/WhitehatD/crag/compare/v0.2.35...v0.2.36
[0.2.35]: https://github.com/WhitehatD/crag/compare/v0.2.34...v0.2.35
[0.2.34]: https://github.com/WhitehatD/crag/compare/v0.2.33...v0.2.34
[0.2.33]: https://github.com/WhitehatD/crag/compare/v0.2.32...v0.2.33
[0.2.32]: https://github.com/WhitehatD/crag/compare/v0.2.31...v0.2.32
[0.2.31]: https://github.com/WhitehatD/crag/compare/v0.2.30...v0.2.31
[0.2.30]: https://github.com/WhitehatD/crag/compare/v0.2.29...v0.2.30
[0.2.29]: https://github.com/WhitehatD/crag/compare/v0.2.28...v0.2.29
[0.2.28]: https://github.com/WhitehatD/crag/compare/v0.2.27...v0.2.28
[0.2.27]: https://github.com/WhitehatD/crag/compare/v0.2.26...v0.2.27
[0.2.26]: https://github.com/WhitehatD/crag/compare/v0.2.25...v0.2.26
[0.2.25]: https://github.com/WhitehatD/crag/compare/v0.2.24...v0.2.25
[0.2.24]: https://github.com/WhitehatD/crag/compare/v0.2.23...v0.2.24
[0.2.23]: https://github.com/WhitehatD/crag/compare/v0.2.22...v0.2.23
[0.2.22]: https://github.com/WhitehatD/crag/compare/v0.2.21...v0.2.22
[0.2.21]: https://github.com/WhitehatD/crag/compare/v0.2.20...v0.2.21
[0.2.20]: https://github.com/WhitehatD/crag/compare/v0.2.19...v0.2.20
[0.2.19]: https://github.com/WhitehatD/crag/compare/v0.2.18...v0.2.19
[0.2.18]: https://github.com/WhitehatD/crag/compare/v0.2.17...v0.2.18
[0.2.17]: https://github.com/WhitehatD/crag/compare/v0.2.16...v0.2.17
[0.2.16]: https://github.com/WhitehatD/crag/compare/v0.2.15...v0.2.16
[0.2.15]: https://github.com/WhitehatD/crag/compare/v0.2.14...v0.2.15
[0.2.14]: https://github.com/WhitehatD/crag/compare/v0.2.13...v0.2.14
[0.2.13]: https://github.com/WhitehatD/crag/compare/v0.2.12...v0.2.13
[0.2.12]: https://github.com/WhitehatD/crag/compare/v0.2.11...v0.2.12
[0.2.11]: https://github.com/WhitehatD/crag/compare/v0.2.10...v0.2.11
[0.2.10]: https://github.com/WhitehatD/crag/compare/v0.2.9...v0.2.10
[0.2.9]: https://github.com/WhitehatD/crag/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/WhitehatD/crag/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/WhitehatD/crag/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/WhitehatD/crag/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/WhitehatD/crag/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/WhitehatD/crag/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/WhitehatD/crag/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/WhitehatD/crag/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/WhitehatD/crag/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/WhitehatD/crag/releases/tag/v0.2.0
[0.1.0]: https://github.com/WhitehatD/crag/releases/tag/v0.1.0
