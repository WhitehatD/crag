# Changelog

All notable changes to crag are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.10] — 2026-04-05

## [0.2.9] — 2026-04-05

## [0.2.8] — 2026-04-05

## [0.2.7] — 2026-04-05

## [0.2.6] — 2026-04-05

## [0.2.5] — 2026-04-05

## [0.2.4] — 2026-04-05

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

[Unreleased]: https://github.com/WhitehatD/crag/compare/v0.2.10...HEAD
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
