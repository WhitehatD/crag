# crag

**Governance compiler for AI-assisted codebases.**

You tighten a lint rule in `.cursor/rules/`. The Copilot file still has
the old one. CI enforces a third version. Your AI agent writes code that
CI rejects — and nobody knows which config is the source of truth.

`crag` fixes this. One command analyzes your project — stack, CI, test
framework, code style, dependencies, anti-patterns — and writes a
`governance.md` that reads like a senior engineer wrote it. One more
command compiles it to all 12 targets. Change a rule, recompile, done.

![crag demo](assets/demo.gif)

> 500 ms · zero dependencies · no LLM · no network · SHA-verified deterministic output

```bash
npx @whitehatd/crag demo          # see it work (no install needed)
npx @whitehatd/crag analyze       # generate governance.md from your project
npx @whitehatd/crag compile       # regenerate all 12 files
```

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)

---

## What `crag analyze` actually produces

Most tools give you a template. `crag analyze` reads your project — CI
workflows, manifests, configs, directory structure — and writes
governance that's specific to what it finds. On a Node + TypeScript +
Next.js project with Prisma and Vitest:

```markdown
## Gates (run in order, stop on failure)
### Lint
- npm run lint
### Test
- npm run test
### Build
- npm run build
- npm run typecheck

## Architecture
- Type: monolith
- Entry: bin/app.js

## Key Directories
- `src/` — source
- `test/` — tests (unit + integration)
- `prisma/` — database
- `.github/` — CI/CD

## Testing
- Framework: vitest
- Layout: unit + integration
- Naming: *.test.ts
- Snapshot testing: yes

## Code Style
- Indent: 2 spaces
- Line length: 100
- Formatter: prettier
- Linter: eslint

## Dependencies
- Package manager: pnpm (pnpm-lock.yaml)
- Node: >=20

## Import Conventions
- Module system: ESM
- TypeScript module: NodeNext
- Path aliases: @/

## Anti-Patterns

Do not:
- Use `any` type in TypeScript — use `unknown` or proper types
- Use `@ts-ignore` — fix the type error instead
- Use `getServerSideProps` with App Router — use Server Components
- Use `pages/api/` with App Router — use `app/api/` route handlers

## Framework Conventions
- Next.js 14 (App Router)
- Use Server Components by default
- Use route handlers for API endpoints
- Use Prisma Client for database access
- Use tRPC for type-safe API communication
```

That's ~80 lines of project-specific governance, generated in under a
second, from zero configuration. 25+ language detectors, 11 CI systems,
8 framework convention engines. Every section is only emitted when data
is actually found.

---

## What `crag compile` produces from it

```
$ crag compile --target all --dry-run --verbose

  Compiling governance.md → github, husky, pre-commit, agents-md, cursor,
  gemini, copilot, cline, continue, windsurf, zed, amazonq
  10 gates, 1 runtimes detected (dry-run)

  plan .github/workflows/gates.yml                  1.57 KB
  plan .husky/pre-commit                              507 B
  plan .pre-commit-config.yaml                      2.23 KB
  plan AGENTS.md                                    1.20 KB
  plan .cursor/rules/governance.mdc                   984 B
  plan GEMINI.md                                    1.24 KB
  plan .github/copilot-instructions.md              1.95 KB
  plan .clinerules                                  1.54 KB
  plan .continuerules                               1.76 KB
  plan .windsurf/rules/governance.md                 1.90 KB
  plan .rules                                       1.79 KB
  plan .amazonq/rules/governance.md                 1.87 KB

  Total: 18.5 KB across 12 target(s)
  Dry-run complete — no files written.
```

Each target uses the tool's native format — verified against real-world
production files from OpenAI Codex, Vercel Next.js, Google ADK, Zed,
Windsurf, and GitHub's own repos.

**Path-scoped sections** like `### Frontend (path: web/)` automatically
emit glob-scoped files: `.cursor/rules/web.mdc`,
`.windsurf/rules/web.md`, `.github/instructions/web.instructions.md`,
`.continue/rules/web.md` — each with the tool's native activation
frontmatter.

**Custom content survives recompilation.** Generated content is wrapped
in markers. Anything you add outside the markers persists across
`crag compile` runs.

---

## Supported targets

| Target | Output | Consumer | Format |
|---|---|---|---|
| `github` | `.github/workflows/gates.yml` | GitHub Actions | YAML workflow |
| `husky` | `.husky/pre-commit` | husky | Shell script |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com | YAML config |
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory | Freeform markdown |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor | MDC with frontmatter |
| `gemini` | `GEMINI.md` | Gemini CLI | Freeform markdown |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot | Freeform markdown |
| `cline` | `.clinerules` | Cline | Markdown |
| `continue` | `.continuerules` | Continue.dev | Plain text |
| `windsurf` | `.windsurf/rules/governance.md` | Windsurf Cascade | MD with `trigger:` frontmatter |
| `zed` | `.rules` | Zed | Plain markdown |
| `amazonq` | `.amazonq/rules/governance.md` | Amazon Q Developer | Markdown |

Plus per-path glob-scoped files for Cursor, Windsurf, Copilot, and Continue when governance has path-scoped sections.

---

## How it works

**Step 1 — Analyze.** `crag analyze` reads your repo (stack, CI, tests,
style, deps, frameworks) and writes `governance.md` with gates,
architecture, testing profile, code style, anti-patterns, and
framework conventions.

**Step 2 — Edit.** Review the generated governance. Change a rule, add a
gate, remove a section. This is your single source of truth.

**Step 3 — Compile.** `crag compile --target all` regenerates all 12
output files from governance.md. CI workflow, pre-commit hook, AGENTS.md,
.cursor/rules, GEMINI.md, copilot-instructions.md, .clinerules,
.continuerules, .windsurf/rules, .rules, .amazonq/rules — all in sync.

**Step 4 — Verify.** `crag diff` compares governance against your CI
reality: MATCH, DRIFT, MISSING, EXTRA. `crag doctor` checks infrastructure
integrity, drift, and security.

Deterministic: same input produces byte-identical output. No LLM. No network.

---

## Proof

| Metric | Result |
|---|---|
| Stress test | [101 repos · 4,400 invocations · 0 crashes](./benchmarks/stress-test.md) |
| Benchmark | [40/40 Grade A](./benchmarks/results.md) across 7 language families |
| Determinism | SHA-verified, byte-identical across Ubuntu + macOS + Windows × Node 18/20/22 |
| Tests | 510 passing |
| Dependencies | 0 |
| Self-audit | `crag doctor` 29/29 pass · `crag diff` 0 drift · `crag check` 9/9 files |

Full methodology: [`benchmarks/stress-test.md`](./benchmarks/stress-test.md) ·
[`benchmarks/results.md`](./benchmarks/results.md)

---

## Why not X?

| Alternative | When it's better than crag | When crag is better |
|---|---|---|
| Hand-written `.cursorrules` | You use exactly one AI tool, rules rarely change | You use more than one AI tool, **or** rules drift from CI |
| Makefile as source of truth | Small repos, single-language, Jenkins-shaped CI | Cross-stack projects, multiple targets, AI agents need their own formats |
| Conftest / OPA | Runtime policy enforcement on cluster state | Dev-time gate definition *before* code reaches the cluster |
| Pre-commit framework alone | Pre-commit is the only surface you care about | You also want the same rules in CI, AI agents, and contributor docs |
| Copy-pasted `CONTRIBUTING.md` | You trust contributors to read and follow docs | You want rules *enforced* mechanically, not documented |

---

## First 5 minutes

```bash
# 1. See it work (no install needed)
npx @whitehatd/crag demo

# 2. Generate governance.md from your project
cd your-repo
npx @whitehatd/crag analyze

# 3. Verify it matches reality
npx @whitehatd/crag diff

# 4. Compile to every target
npx @whitehatd/crag compile --target all --dry-run   # preview
npx @whitehatd/crag compile --target all             # write

# 5. Health check
npx @whitehatd/crag doctor
```

These five commands cover 95 % of real-world usage. Everything else is
in [`docs/`](./docs/index.md).

**Requirements**: Node.js 18+ and `git`. Zero runtime dependencies.

---

## Further reading

All reference material lives under [`docs/`](./docs/index.md):

- [`docs/commands.md`](./docs/commands.md) — every subcommand, every flag, every exit code
- [`docs/compile-targets.md`](./docs/compile-targets.md) — the 12 compile targets, their outputs, their consumers
- [`docs/governance-format.md`](./docs/governance-format.md) — the `governance.md` v2 format (annotations, sections, inheritance)
- [`docs/languages.md`](./docs/languages.md) — the 25+ stack detectors and the gates each emits
- [`docs/ci-systems.md`](./docs/ci-systems.md) — the 11 CI extractors and the files they parse
- [`docs/workspaces.md`](./docs/workspaces.md) — the 12 workspace types, fixture filtering, symlink protection
- [`docs/claude-code.md`](./docs/claude-code.md) — Claude Code session loop (pre-start / post-start skills)
- [`docs/release-pipeline.md`](./docs/release-pipeline.md) — how the auto-release workflow publishes to npm

---

## Contributing

Issues and PRs at [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag).
See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow.

If `crag analyze` misses a language, CI system, or gate pattern on a
public repo, file an issue with the repo URL and `crag analyze
--dry-run` output. That's the most valuable bug report.

---

## License

MIT — see [LICENSE](./LICENSE). Built by
[Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD).
