# Changelog

All notable changes to crag are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **159 tests** across 11 test files (was 0). Zero dependencies. Run via `npm test` or `node test/all.js`.
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

Initial release under the `scaffold-cli` name. Proven in production on:
- **example-app** — multi-stack project
- **example-app** — multi-service project
- **example-app** — multi-language project
- **scaffold-cli (self)** — full dogfooding

Initial capabilities: universal skills (pre-start-context, post-start-validation), interview-driven governance generation, 3 compile targets (github, husky, pre-commit), basic workspace support for monorepos via multi-level `governance.md`.

[Unreleased]: https://github.com/WhitehatD/crag/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/WhitehatD/crag/releases/tag/v0.2.0
[0.1.0]: https://github.com/WhitehatD/crag/releases/tag/v0.1.0
