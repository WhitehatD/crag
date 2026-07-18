# crag

**The reliability layer for AI coding agents.**

Unit tests for memory, compiled into law. Your agents obey your codebase because crag compiles one `governance.md` to CI, hooks, and every agent — and, when you opt in, verifies what your agents learned is TRUE before it becomes an enforced rule.

```bash
npx @whitehatd/crag
```

> AGENTS.md | Claude Code | Cursor | Copilot | Gemini | Cline | Continue | Windsurf | Zed | Amazon Q | GitHub Actions | Forgejo Actions | Husky | Pre-commit | Aider | Goose | Junie | Kiro | CodeRabbit | GitLab CI | CircleCI | Azure DevOps | Lefthook

![crag on django/django -- zero config to 38 gates in 390ms](https://raw.githubusercontent.com/WhitehatD/crag/master/assets/poster-demo.gif)

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![99 repos audited](https://img.shields.io/badge/benchmark-99%20repos%20%C2%B7%200%20crashes-brightgreen)](./benchmarks/leaderboard.md)
[![55% zero AI config](https://img.shields.io/badge/audit-55%25%20zero%20AI%20config%20in%2099%20repos-orange)](./benchmarks/leaderboard.md)

**[crag.sh](https://crag.sh)** | [Audit Tool](https://crag.sh/audit) | [Leaderboard](https://crag.sh/leaderboard) | [Dashboard](https://app.crag.sh) | [Docs](https://crag.sh/docs) | [VS Code](https://marketplace.visualstudio.com/items?itemName=whitehatd.vscode-crag) | [Neovim](https://github.com/WhitehatD/crag.nvim) | [Status](https://crag.sh/status)

---

## The problem

Your CI is the ground truth for what quality means in your repo. Your AI agents don't know it. When you add a lint gate in GitHub Actions, your Cursor rules don't update. Your CLAUDE.md doesn't update. 23 tool-specific files -- all drifting apart.

Developers fix bad AI suggestions in 2 seconds and think "AI is dumb sometimes." They never aggregate the cost: 30 seconds per bad suggestion x 10 devs x 50 prompts per day = hours of wasted time. Nobody diffs their config files.

And the config is only half of it. Agents also accumulate *knowledge* between sessions — root causes, gotchas, conventions. Most of it is never checked against reality, so stale lessons quietly poison every future prompt.

## The fix

crag reads your CI and codebase once, writes a single `governance.md`, and compiles it to every tool's native format. One file in. 23 files out. Change a rule once, recompile, done.

Deterministic. No LLM. No network. No API keys. Zero dependencies.

That deterministic core is the whole product for most users. On top of it, an **opt-in** memory seam closes the reliability loop: an agent failure becomes an insight, the insight becomes atomic claims with executable predicates, those predicates are machine-verified against reality (grounding), verified claims distill into principles, and principles compile into enforced governance rules across all 23 targets.

Most tools check your config is well-formed. crag also checks your knowledge is *true* — then compiles it into enforcement.

---

## Install

```bash
# Global install
npm install -g @whitehatd/crag

# Or run directly
npx @whitehatd/crag
```

Requires Node.js 18+ and `git`.

---

## Quick start

```bash
# 1. See it live on a temp project (~3 seconds)
crag demo

# 2. Analyze your repo -- generates governance.md
crag analyze

# 3. Compile to all AI tools and CI
crag compile --target all

# 4. Check for drift
crag audit

# 5. Auto-fix drift
crag audit --fix

# 6. Install pre-commit hook to keep configs in sync
crag hook install
```

Or do it all in one shot:

```bash
crag              # analyze + compile + audit
crag auto         # full pipeline: analyze, compile, audit, hook install
```

---

## Commands

| Command | Description |
|---|---|
| `crag` | Default: analyze + compile + audit in one shot |
| `crag analyze` | Read CI, package manifests, code patterns. Write `governance.md` |
| `crag analyze --write-governance` | Generate `governance.md` from scratch. Add `--force` to overwrite existing. |
| `crag status` | Cockpit: trust score + corpus counts from the local engine (`--json`) *(next release)* |
| `crag inbox` | Items that need a human — TRUE-T2 dispositions (`--json`) *(next release)* |
| `crag why <id>` | Show the evidence chain behind a rule or claim (`--json`) *(next release)* |
| `crag sync --memory` | Push a verified-memory snapshot (overview + rules) to app.crag.sh *(next release)* |
| `crag compile --target <t>` | Compile governance.md to a specific target format |
| `crag compile --target all` | Compile to all 23 targets at once |
| `crag compile --target scaffold` | Generate hooks, settings, agents, CI playbook |
| `crag audit` | Detect drift between governance.md and compiled configs |
| `crag audit --json` | Machine-readable drift report |
| `crag audit --explain` | Show actionable fix hint per drift finding |
| `crag audit --fix` | Auto-recompile stale targets |
| `crag audit --memory` | Add the claim-health axis: check distilled rules against a live memory backend |
| `crag auto` | Full pipeline: analyze, compile, audit, hook install |
| `crag memory up` | Start the crag-engine memory backend and wire `.crag/mcp.json` (opt-in) |
| `crag memory status` | Reachability + corpus stats of the configured backend |
| `crag memory down` | Stop the engine daemon |
| `crag memory register` | Write `.crag/mcp.json` only (no daemon lifecycle) |
| `crag distill` | Render verified principles from the backend into managed `governance.gen.md` blocks |
| `crag distill --check` | Preview the would-change `.gen` diff, write nothing (CI-safe) |
| `crag check` | Verify crag infrastructure is complete and current |
| `crag demo` | Self-contained proof-of-value on a temp project |
| `crag diff` | Show exactly where governance and codebase diverge |
| `crag doctor` | Deep diagnostic: integrity, drift, hook validity |
| `crag hook install` | Install pre-commit hook (auto-recompile on governance change) |
| `crag hook install --drift-gate` | Also block commits if drift is detected |
| `crag init` | Interactive setup for new projects |
| `crag login` | Authenticate with crag cloud |
| `crag sync` | Sync governance to crag cloud |
| `crag team` | Manage team governance (create, invite, join) |
| `crag upgrade` | Update universal skills in this repo |
| `crag upgrade --siblings` | Update all repos in the parent directory at once |
| `crag workspace` | Detect and display monorepo/workspace structure |

---

## Compile targets

`crag compile --target all` generates configs for 23 targets:

| Target | Output file | Consumer |
|---|---|---|
| `github` | `.github/workflows/gates.yml` | GitHub Actions |
| `forgejo` | `.forgejo/workflows/gates.yml` | Forgejo / Gitea Actions |
| `husky` | `.husky/pre-commit` | Husky pre-commit hooks |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com |
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory (60K+ repos) |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| `gemini` | `GEMINI.md` | Gemini, Gemini CLI |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `cline` | `.clinerules` | Cline |
| `continue` | `.continuerules` | Continue.dev |
| `windsurf` | `.windsurf/rules/governance.md` | Windsurf Cascade |
| `zed` | `.rules` | Zed |
| `amazonq` | `.amazonq/rules/governance.md` | Amazon Q Developer |
| `claude` | `CLAUDE.md` | Claude Code |
| `aider` | `CONVENTIONS.md` | Aider |
| `lefthook` | `lefthook.yml` | Lefthook |
| `gitlab` | `.gitlab-ci.yml` | GitLab CI |
| `coderabbit` | `.coderabbit.yaml` | CodeRabbit |
| `junie` | `.junie/guidelines.md` | Junie |
| `kiro` | `.kiro/steering/quality-gates.md` | Kiro |
| `circleci` | `.circleci/config.yml` | CircleCI |
| `azuredevops` | `azure-pipelines.yml` | Azure DevOps |
| `goose` | `.goose/GOOSEHINTS` | Goose |

Each target uses the tool's native format: MDC frontmatter for Cursor, YAML triggers for Windsurf, numbered steps for AGENTS.md, path-scoped files for monorepos.

The `scaffold` meta-target generates hooks, editor settings, agent configurations, and CI playbooks.

---

## Audit system

`crag audit` detects drift across three axes:

| Axis | What it catches |
|---|---|
| **Stale configs** | Compiled configs older than governance.md |
| **Phantom gates** | Governance references tools that don't exist (e.g., "run eslint" but eslint isn't installed) |
| **Missing targets** | AI tool directories exist (`.cursor/`, `.github/copilot-instructions.md`) but no compiled config |

```bash
$ crag audit

  crag audit -- governance drift report

  Compiled configs
  X .cursor/rules/governance.mdc     stale -- governance.md is newer
  X AGENTS.md                        stale -- governance.md is newer
  OK .github/workflows/gates.yml     in sync
  OK .husky/pre-commit               in sync

  Gate reality
  X npx tsc --noEmit                 tsc not in devDependencies
  X npm run lint                     "lint" script not in package.json

  2 stale, 2 drift
  Fix: crag compile --target all
```

### JSON output

```bash
crag audit --json
```

Returns:

```json
{
  "summary": { "stale": 2, "drift": 2, "extra": 0, "missing": 1, "total": 5 },
  "stale": [{ "path": ".cursor/rules/governance.mdc", "target": "cursor" }],
  "drift": [{ "command": "npx tsc --noEmit", "detail": "tsc not in devDependencies" }],
  "extra": [],
  "missing": [{ "tool": "Copilot", "target": "copilot" }],
  "current": ["github", "husky"],
  "unmanagedCI": []
}
```

### Auto-fix

```bash
crag audit --fix    # recompiles all stale targets
```

---

## Cockpit — verified memory *(next release)*

When a local [crag-anchor](https://github.com/WhitehatD/crag-anchor) daemon is
running, the CLI becomes a read-model cockpit over your agent's verified memory.
These commands ship in the next `@whitehatd/crag` release (currently on
`feat/memory-seam`):

```bash
crag status              # trust score + corpus counts (--json for machines)
crag inbox               # items that need a human (TRUE-T2 dispositions)
crag why <id>            # the evidence chain behind a rule or claim
crag sync --memory       # push an overview + rules snapshot to app.crag.sh
```

`crag sync --memory` reads the daemon's `/overview` + `/rules` and pushes them
to the cloud, which renders a "Verified Memory" card — the cloud never reaches
back to your local daemon.

---

## GitHub Action

Add drift detection to your CI with [crag-audit-action](https://github.com/WhitehatD/crag-audit-action):

```yaml
# .github/workflows/crag-audit.yml
name: crag audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: WhitehatD/crag-audit-action@v1
```

The action runs `crag audit` on every PR and posts a comment with the drift report. Optional `fail-on-drift: true` blocks merging when drift is detected.

---

## Web audit tool

Audit any public GitHub repo at [crag.sh/audit](https://crag.sh/audit). Paste a repo URL, get a drift report in seconds. No install required.

Connect GitHub to also audit private repos.

---

## Benchmark: 99 repos audited

We audited 100 of the most popular open-source repos (1 clone timeout). 20+ languages. Multiple CI systems. Monorepos to single-file libraries.

| Metric | Result |
|---|---|
| Repos audited | 99 |
| Zero AI config files | 54 (55%) |
| AI config adoption | 45 (45%) |
| Repos with genuine drift | 13 (13%) |
| Total gates inferred | 3,540 |
| Mean gates per repo | 35.8 |
| Crashes | 0 |

Top repos by gate count:

| Repo | Stack | Gates | Score |
|---|---|---|---|
| grafana/grafana | React + TypeScript + Docker | 65 | 88 |
| astral-sh/ruff | Rust + Python + Docker | 53 | 88 |
| astral-sh/uv | Rust + Python + Docker | 52 | 88 |
| calcom/cal.com | TypeScript + Docker | 52 | 85 |
| rollup/rollup | TypeScript + Node | 50 | 68 |
| vercel/turborepo | TypeScript + Rust | 49 | 46 |

Full results: [`benchmarks/leaderboard.md`](./benchmarks/leaderboard.md) | [Live leaderboard](https://crag.sh/leaderboard)

Previous benchmark (50 repos): [`benchmarks/phase1-benchmark.md`](./benchmarks/phase1-benchmark.md)

---

## How it works

**Analyze.** Reads your repo with 25+ language detectors, 12 CI system extractors, and 8 framework convention engines. Writes `governance.md` with gates, architecture, testing profile, code style, and anti-patterns. Under a second, zero config. Use `--write-governance` to generate a `governance.md` from scratch (guarded by `--force` if one already exists).

**Compile.** Converts `governance.md` to each tool's native format. MDC frontmatter for Cursor. YAML triggers for Windsurf. Numbered steps for AGENTS.md. Path-scoped files for monorepos. Custom content survives recompilation.

**Audit.** Three detection axes: staleness (compiled configs older than governance.md), reality (governance references tools that don't exist), completeness (AI tool directories present but no compiled config). Run with `--explain` to see actionable fix hints inline.

**Diff.** Shows where governance and codebase diverge: gates in governance missing from CI, gates in CI missing from governance, and which files caused the discrepancy.

**Doctor.** Deep diagnostic that verifies governance integrity, hook installation, compile target presence, and latent drift that `audit` might miss.

**Hook.** Pre-commit hook auto-recompiles when governance.md changes. Optional drift gate blocks commits if configs are stale.

---

## Verified memory (opt-in)

The deterministic compiler answers "is my agent config well-formed and in sync?" The memory seam answers a harder question: "is what my agent *learned* actually true?"

It closes a loop:

```
agent failure -> insight -> atomic claims with executable predicates
   -> grounding (predicates machine-verified against reality)
   -> verified principle -> crag distill -> governance.gen.md
   -> crag compile -> enforced rule across 23 targets
```

A lesson only becomes an enforced rule after its predicate has been checked against reality. Stale claims stop rendering by omission — no rot, no manual delete.

```bash
crag memory up            # start the crag-engine backend, wire .crag/mcp.json
crag memory status        # reachability + corpus stats
crag distill              # verified principles -> managed governance.gen.md
crag distill --check      # preview the .gen diff, write nothing (CI-safe)
crag compile              # compose .crag/ sources -> governance.md -> targets
crag audit --memory       # add the claim-health axis to audit
```

**This is entirely opt-in and the trust boundary is sacred.** `crag compile` and `crag audit` (offline mode) stay zero-dependency, no-LLM, no-network — they never need a key. The memory backend is a separate install ([crag-engine](https://github.com/WhitehatD/crag-engine)); nothing under the compile core imports it. If you never run `crag memory`, crag behaves byte-for-byte as it always did. All backend/LLM interaction lives behind the opt-in adapter — crag itself only ever places verbatim, backend-verified text.

See [docs/distill.md](./docs/distill.md) for the composed-governance model.

---

## Universal skills

AI agents forget context between sessions. Two skills ship with crag to fix this:

| Skill | What it does |
|---|---|
| `pre-start-context` | Loads full project context at session start: stack, architecture, governance rules, prior session state. Every agent starts informed. |
| `post-start-validation` | Runs governance gates after any task, captures decisions as searchable knowledge, writes session state for continuity. |

```bash
crag compile --target scaffold    # install into .claude/skills/
crag upgrade --siblings           # update across all repos
```

The skills read `governance.md` and adapt. Nothing hardcoded. Works with Claude Code, Cursor Agent, Copilot Chat, any IDE with agent support.

---

## Verification

| Metric | Result |
|---|---|
| 99-repo benchmark | [99 repos, 0 crashes, 3,540 gates, 55% zero AI config](./benchmarks/leaderboard.md) |
| 50-repo benchmark | [50 repos, 0 crashes, 1,809 gates](./benchmarks/phase1-benchmark.md) |
| Stress test | [101 repos, 4,400 invocations, 0 crashes](./benchmarks/stress-test.md) |
| Reference benchmark | [40/40 Grade A](./benchmarks/results.md) across 7 language families |
| Determinism | SHA-verified, byte-identical across Ubuntu + macOS + Windows |
| Tests | 598 passing |
| Dependencies | 0 |

---

## Ecosystem

crag is a compiler, a CLI, and an MCP gateway. Around it:

| Component | What it is |
|---|---|
| **crag** (this repo) | The deterministic governance compiler + CLI + MCP gateway. One `governance.md` → 23 targets. Zero-dep core. |
| **[crag-engine](https://github.com/WhitehatD/crag-engine)** | The verified-memory engine: atomic claims with executable predicates, grounding that re-verifies against reality, a disposition control plane, and an embedded operator console. The opt-in backend for `crag memory` / `crag distill`. |
| **[crag.nvim](https://github.com/WhitehatD/crag.nvim)** | Neovim integration for crag governance workflows. |
| **[crag-audit-action](https://github.com/WhitehatD/crag-audit-action)** | GitHub Action that runs `crag audit` in CI to catch AI-config drift (and claim-health when a memory backend is configured). |
| **[app.crag.sh](https://app.crag.sh)** | The cloud console: audit, dashboard, docs, leaderboard, pricing, status. |

| Surface | URL |
|---|---|
| Website | [crag.sh](https://crag.sh) |
| Web Audit | [crag.sh/audit](https://crag.sh/audit) |
| Leaderboard | [crag.sh/leaderboard](https://crag.sh/leaderboard) |
| Dashboard | [app.crag.sh](https://app.crag.sh) |
| API | [api.crag.sh](https://api.crag.sh/api/status) |
| VS Code | [Marketplace](https://marketplace.visualstudio.com/items?itemName=whitehatd.vscode-crag) |
| Neovim | [crag.nvim](https://github.com/WhitehatD/crag.nvim) |
| GitHub Action | [crag-audit-action](https://github.com/WhitehatD/crag-audit-action) |
| npm | [@whitehatd/crag](https://www.npmjs.com/package/@whitehatd/crag) |
| Status | [crag.sh/status](https://crag.sh/status) |

---

## Contributing

Issues and PRs at [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag).

If `crag analyze` misses a language, CI system, or gate pattern on a public repo, file an issue with the repo URL and `crag analyze --dry-run` output. That's the most valuable bug report.

---

## Who builds this

crag is built by [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD), a systems and AI-infrastructure engineer. It came out of real production work: the same drift problem, hit across enough repos to be worth solving properly, then validated on 99 public repositories before shipping.

---

Apache-2.0 -- [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD)
