# crag

**Make every AI agent obey your codebase.**

One `governance.md` → compiled to CI, hooks, and every agent. No drift.

```bash
npx @whitehatd/crag
```

> AGENTS.md · Claude Code · Cursor · Copilot · Gemini · Cline · Continue · Windsurf · Zed · Amazon Q · GitHub Actions · Husky · Pre-commit

![crag on django/django — zero config to 38 gates in 390ms](https://raw.githubusercontent.com/WhitehatD/crag/master/assets/poster-demo.gif)

Your CI is the ground truth for what quality means in your repo.
Your agents don't know it. When you add a lint gate in GitHub Actions,
your Cursor rules don't update. Your CLAUDE.md doesn't update.
Thirteen tool-specific files — all drifting apart.

crag reads your CI and codebase once, writes a single `governance.md`,
and compiles it to every tool's native format. One file in. Thirteen
files out. Change a rule once, recompile, done.

Deterministic. No LLM. No network. No API keys.

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![50 repos · 0 crashes](https://img.shields.io/badge/benchmark-50%20repos%20%C2%B7%200%20crashes-brightgreen)](./benchmarks/phase1-benchmark.md)
[![46% drift found](https://img.shields.io/badge/audit-46%25%20drift%20in%2050%20top%20repos-orange)](./benchmarks/phase1-benchmark.md)

**[crag.sh](https://crag.sh)** · [Docs](https://crag.sh/docs) · [Dashboard](https://app.crag.sh) · [VS Code](https://marketplace.visualstudio.com/items?itemName=whitehatd.vscode-crag) · [Neovim](https://github.com/WhitehatD/crag.nvim) · [Status](https://crag.sh/status)

---

## What it does

`crag analyze` reads your project — CI workflows, package manifests,
configs, directory structure, code patterns — and writes a
`governance.md` that captures what a senior engineer would write after
spending a week with your codebase:

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

## Testing
- Framework: vitest
- Naming: *.test.ts

## Code Style
- Indent: 2 spaces
- Formatter: prettier
- Linter: eslint

## Anti-Patterns
Do not:
- Use `any` in TypeScript — use `unknown`
- Use `getServerSideProps` with App Router — use Server Components
```

Then `crag compile --target all` takes that single file and generates
configs for **every AI tool your team uses** — in each tool's native
format, with the right frontmatter, activation patterns, and structure:

| Target | Output | Consumer |
|---|---|---|
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory (60K+ repos) |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `gemini` | `GEMINI.md` | Gemini, Gemini CLI |
| `cline` | `.clinerules` | Cline |
| `continue` | `.continuerules` | Continue.dev |
| `windsurf` | `.windsurf/rules/governance.md` | Windsurf Cascade |
| `zed` | `.rules` | Zed |
| `amazonq` | `.amazonq/rules/governance.md` | Amazon Q Developer |
| `github` | `.github/workflows/gates.yml` | GitHub Actions |
| `husky` | `.husky/pre-commit` | husky |
| `claude` | `CLAUDE.md` | Claude Code |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com |

One file in, thirteen files out. Change a rule, recompile, done.

---

## Governance drifts. crag catches it.

```bash
$ crag audit

  crag audit — governance drift report

  Compiled configs
  ✗ .cursor/rules/governance.mdc     stale — governance.md is newer
  ✗ AGENTS.md                        stale — governance.md is newer
  ✓ .github/workflows/gates.yml      in sync
  ✓ .husky/pre-commit                in sync

  Gate reality
  ✗ npx tsc --noEmit                 tsc not in devDependencies
  ✗ npm run lint                     "lint" script not in package.json

  Companion workflows (no crag:auto-start — not managed by crag)
  ℹ .github/workflows/deploy.yml
    · docker compose build
    · ssh deploy@prod
  ℹ .github/workflows/publish.yml
    · npm publish

  2 stale · 2 drift
  Fix: crag compile --target all — or — crag audit --fix
```

Workflows without `# crag:auto-start` are shown as informational
context — they don't count as drift. Add the marker to any workflow you
want crag to enforce.

Install the pre-commit hook and it auto-recompiles on every commit:

```bash
crag hook install              # auto-recompile when governance changes
crag hook install --drift-gate # also block commits if drift detected
```

---

## 50 repos. Zero crashes. 46% had drift.

We cloned 50 of the highest-profile open-source projects and ran the
full crag pipeline on each one. 20 languages. 7 CI systems. Monorepos
to single-crate Rust libraries.

| Repo | Stack | Gates | Finding |
|---|---|---|---|
| grafana/grafana | Go + React + Docker | 67 | Clean |
| calcom/cal.com | Next.js + React + Docker | 53 | Clean |
| hashicorp/vault | Go + Docker + Node | 50 | Clean |
| biomejs/biome | Rust + React + TS | 47 | Clean |
| excalidraw/excalidraw | TypeScript + Docker | 46 | 2 drift |
| moby/moby | Go + Docker | 45 | Clean |
| vuejs/core | TypeScript | 44 | 2 drift |
| tauri-apps/tauri | Rust + TypeScript | 44 | Clean |
| supabase/supabase | TS + React + Docker | 43 | 1 drift |
| apache/airflow | Python + Docker | 41 | Clean |
| prisma/prisma | TypeScript | 40 | 2 drift |
| django/django | Python | 38 | Clean |
| angular/angular | TypeScript | 38 | 1 drift |
| remix-run/remix | TypeScript | 37 | 1 drift |
| dotnet/aspnetcore | .NET + TypeScript | 37 | 1 drift |
| pandas-dev/pandas | Python + C | 35 | Clean |

**1,809 gates inferred** across 50 repos. **46% had audit drift** —
governance rules that don't match codebase reality.
Full results: [`benchmarks/phase1-benchmark.md`](./benchmarks/phase1-benchmark.md)

---

## Get started

```bash
# See it live — zero config, zero install, ~3 seconds
npx @whitehatd/crag demo

# One command — analyze + compile in one shot
npx @whitehatd/crag

# Or step by step:
npx @whitehatd/crag analyze                   # generate governance.md
npx @whitehatd/crag compile --target all       # compile to 13 targets
npx @whitehatd/crag compile --target scaffold  # generate hooks, settings, agents
npx @whitehatd/crag audit                      # check for drift
npx @whitehatd/crag hook install               # enforce on every commit

# Health and diagnostics:
npx @whitehatd/crag check                     # verify infrastructure is complete
npx @whitehatd/crag diff                      # compare governance against codebase reality
npx @whitehatd/crag doctor                    # deep diagnostic (integrity, drift, hook validity)

# Keep skills current:
npx @whitehatd/crag upgrade                   # update universal skills in this repo
npx @whitehatd/crag upgrade --siblings        # update all repos in parent directory at once
```

**Requirements**: Node.js 18+ and `git`. Zero runtime dependencies.

---

## How it works

**Analyze.** Reads your repo: 25+ language detectors, 11 CI system
extractors, 8 framework convention engines. Writes `governance.md` with
gates, architecture, testing profile, code style, anti-patterns, and
framework conventions. Under a second, zero config.

**Compile.** Converts `governance.md` to each tool's native format. MDC
frontmatter for Cursor. YAML `trigger:` for Windsurf. Numbered steps
for AGENTS.md. Path-scoped files for monorepos. Custom content survives
recompilation.

**Audit.** Three detection axes: (1) compiled configs older than
governance.md, (2) governance references tools that don't exist, (3) AI
tool directories present but no compiled config. Reports drift, suggests
fixes. CI workflow files without `# crag:auto-start` are shown as an
informational footnote — not counted as issues — so companion workflows
(deploy, publish, extensions CI) don't generate noise.

**Diff.** Shows exactly where governance and codebase diverge: gates in
governance that don't exist in CI, gates in CI that governance doesn't
know about, and which specific files caused the discrepancy.

**Doctor.** Deep diagnostic that verifies governance file integrity,
checks hook installation, validates that all compile targets are present,
and surfaces latent drift that `audit` might miss.

**Hook.** Pre-commit hook auto-recompiles when governance.md changes.
Optional drift gate blocks commits if configs are stale.

Deterministic: same input produces byte-identical output. No LLM. No
network. No API keys.

---

## Universal skills

AI agents forget context between sessions. You re-explain the stack,
the conventions, the open PRs — every time. And after the agent does
work, nobody checks whether the governance gates actually passed.

Two skills ship with crag and solve this for any project, any language:

| Skill | What it does |
|---|---|
| `pre-start-context` | Loads full project context at the start of any session — stack, architecture, governance rules, session state from last time. Every agent starts informed, not blank. |
| `post-start-validation` | Runs your governance gates after any task, captures decisions as searchable knowledge, writes session state so the next session can pick up where you left off. |

```bash
# Install both into .claude/skills/
npx @whitehatd/crag compile --target scaffold

# Check they're current
npx @whitehatd/crag check

# Update after a crag release (all repos at once)
npx @whitehatd/crag upgrade --siblings
```

The skills read your `governance.md` and adapt. Nothing is hardcoded.
Works with Claude Code, Cursor Agent, Copilot Chat, any IDE with
slash-command or agent support.

---

## Proof

| Metric | Result |
|---|---|
| Phase 1 benchmark | [50 repos · 0 crashes · 1,809 gates · 46% drift](./benchmarks/phase1-benchmark.md) |
| Stress test | [101 repos · 4,400 invocations · 0 crashes](./benchmarks/stress-test.md) |
| Reference benchmark | [40/40 Grade A](./benchmarks/results.md) across 7 language families |
| Determinism | SHA-verified, byte-identical across Ubuntu + macOS + Windows |
| Tests | 591 passing |
| Dependencies | 0 |

---

## Further reading

- [`docs/commands.md`](./docs/commands.md) — every subcommand, every flag, every exit code
- [`docs/compile-targets.md`](./docs/compile-targets.md) — the 13 compile targets and their formats
- [`docs/governance-format.md`](./docs/governance-format.md) — the governance.md v2 format
- [`docs/languages.md`](./docs/languages.md) — the 25+ stack detectors
- [`docs/ci-systems.md`](./docs/ci-systems.md) — the 11 CI extractors
- [`docs/workspaces.md`](./docs/workspaces.md) — monorepo and workspace support

---

## Ecosystem

| Surface | URL | What it does |
|---|---|---|
| **Website** | [crag.sh](https://crag.sh) | Landing page, docs, status |
| **Dashboard** | [app.crag.sh](https://app.crag.sh) | Cloud sync, team governance, audit history |
| **API** | [api.crag.sh](https://api.crag.sh/api/status) | REST API for governance sync |
| **VS Code** | [Marketplace](https://marketplace.visualstudio.com/items?itemName=whitehatd.vscode-crag) | Sidebar, CodeLens, auto-recompile, diagnostics |
| **Neovim** | [crag.nvim](https://github.com/WhitehatD/crag.nvim) | Commands, statusline, diagnostics, auto-compile |
| **npm** | [@whitehatd/crag](https://www.npmjs.com/package/@whitehatd/crag) | CLI package |

---

## Contributing

Issues and PRs at [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag).

If `crag analyze` misses a language, CI system, or gate pattern on a
public repo, file an issue with the repo URL and `crag analyze
--dry-run` output. That's the most valuable bug report.

---

MIT — [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD)
