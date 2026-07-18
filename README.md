# crag

**Your rules. Every agent. Verified.**

AI coding agents ignore your rules because your rules live in nine different files that all drift apart. crag ends that: one `governance.md`, compiled into exactly the files your tools actually read — and, when you opt in, it verifies that what your agents *learned* is still true before it becomes law.

```bash
npx @whitehatd/crag
```

![crag detects your AI tools and compiles only what they need](https://raw.githubusercontent.com/WhitehatD/crag/master/assets/poster-demo.gif)

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

You told Cursor to run the linter. You told Claude Code too, in a different file. Copilot has a third file. Then you changed the rule — in one of them.

Now every agent follows a different version of your rules, your CI enforces a fourth, and nobody diffs config files. Each bad AI suggestion costs 30 seconds; across a team and a workday that's hours — invisible, because it leaks two seconds at a time.

And config is only half of it. Agents also *learn* things between sessions — root causes, gotchas, conventions. Almost none of it is ever re-checked against reality, so stale lessons quietly poison every future prompt at full confidence.

## What crag does

**One source of truth, compiled to exactly what your tools read.**

In 2026, [AGENTS.md](https://agents.md) won: it's the Linux Foundation standard read natively by Codex, Cursor, Copilot, Gemini, Windsurf, Aider, Zed, Junie, and more. crag leans all the way in:

- `crag analyze` reads your CI and codebase, writes one `governance.md`. No LLM, no network, no keys, zero dependencies. Deterministic — byte-identical output on Linux, macOS, and Windows.
- `crag compile` **detects the AI tools your repo actually uses** and writes only what each one needs:
  - **`AGENTS.md`** — the canonical file, full rules, read natively by almost everything;
  - **`CLAUDE.md`** — a three-line `@AGENTS.md` import (Claude Code is the one holdout);
  - **path-scoped rules** for Cursor / Copilot / Windsurf — only the parts AGENTS.md can't express;
  - **executable gates** for GitHub Actions, Husky, pre-commit, and friends.
- Tools that read AGENTS.md natively get **no duplicate file at all**. (A duplicate isn't just noise — Zed, for example, would *prefer* a `.rules` file and silently ignore your canonical AGENTS.md. crag refuses to shadow its own source of truth.)
- `crag audit` catches drift; `crag hook install` keeps everything in sync on every commit.

Change a rule once. Every agent gets it. Nothing drifts, nothing is duplicated, nothing shadows.

No other tool in this space auto-detects your agent stack — ruler, rulesync and friends make you maintain a target list by hand.

---

## Quick start

```bash
npm install -g @whitehatd/crag     # or: npx @whitehatd/crag

cd your-repo
crag analyze      # reads CI + codebase → governance.md   (~1 second)
crag compile      # detects your tools → writes only their files
crag audit        # drift report
crag hook install # keep it in sync forever
```

That's it. The detected target set lives in `.crag/config.json` — edit it any time, or `crag compile --refresh` to re-detect.

Want to see it before touching your repo? `crag demo` runs the whole loop on a synthetic project in ~3 seconds.

---

## The machine-global layer

Some rules are about *you*, not any one project: "never force-push main", your commit style, your security baselines. Write them once in `~/.crag/governance.src.md` and:

- they **compose into every project** you compile (project rules stay project-local), and
- `crag compile --global` materializes them machine-wide: `~/.agents/AGENTS.md` plus each tool's global config — so even a throwaway repo you never onboarded gets your baseline rules.

crag never overwrites a hand-written global file. If your `~/.claude/CLAUDE.md` isn't crag-managed, it is skipped with a message, not clobbered.

---

## Verified memory (opt-in)

The compiler answers *"do all my agents have the same rules?"* The memory layer answers a harder question: *"is what my agent learned actually true?"*

Pair crag with **[crag Anchor](https://github.com/WhitehatD/crag-anchor)** — a local, self-hosted verified-memory engine — and the loop closes:

```
agent failure → insight → atomic claims with executable predicates
  → grounding (machine-verified against reality, on a schedule)
  → verified principle → crag distill → governance.gen.md
  → crag compile → an enforced rule, in every agent's file
```

A lesson becomes law only after its predicate has been re-checked against reality. Stale claims stop compiling *by omission* — no rot, no manual cleanup. Every rule answers `crag why <id>` with its full evidence chain: session → insight → claim → verification → principle → rule.

```bash
crag memory up        # start the Anchor backend, wire .crag/mcp.json
crag status           # trust score + corpus counts (--json)
crag inbox            # the few decisions that genuinely need a human
crag why <id>         # the receipt behind any rule
crag distill          # verified principles → managed governance.gen.md
crag audit --memory   # add the claim-health axis to audit
```

**The trust boundary is sacred.** The compile/audit core never touches a network, an LLM, or a key — if you never run `crag memory`, crag behaves byte-for-byte like the pure compiler it is. All memory/LLM machinery lives in the separate, opt-in backend.

---

## Commands

| Command | What it does |
|---|---|
| `crag` | analyze + compile + audit in one shot |
| `crag analyze` | Read CI + codebase → write `governance.md` |
| `crag compile` | Detect this repo's AI tools → compile only their files |
| `crag compile --refresh` | Re-detect (ignore `.crag/config.json`) |
| `crag compile --global` | Compile your machine-global rules (`~/.crag` → `~/.agents`) |
| `crag compile --target <t>` / `all` | Force one target / every target |
| `crag audit` / `--fix` / `--json` / `--memory` | Drift report / auto-recompile / machine output / claim-health |
| `crag diff` / `--ci` | Where governance and codebase diverge / CI-gate on drift |
| `crag hook install` | Pre-commit hook: recompile on governance change |
| `crag status` / `inbox` / `why <id>` | Verified-memory cockpit (needs Anchor) |
| `crag memory up` / `status` / `down` | Manage the opt-in Anchor backend |
| `crag distill` / `--check` | Verified principles → `governance.gen.md` / CI-safe preview |
| `crag session-start` / `session-end` | Session lifecycle (installed as harness hooks by `crag hooks install`) |
| `crag init` / `demo` / `doctor` / `workspace` | Interview setup / 3-second proof / deep diagnostic / monorepo map |
| `crag login` / `sync` / `team` | crag cloud: sync governance + verified-memory snapshots to [app.crag.sh](https://app.crag.sh) |

<details>
<summary><b>All compile targets (registry)</b></summary>

Every target is classified in [`src/compile/targets.js`](./src/compile/targets.js) — data, not code:

| Class | Targets | Behavior |
|---|---|---|
| **Canonical** | `agents-md` | Full rules. The file (almost) everything reads. |
| **Satellite — import** | `claude` | 3-line `@AGENTS.md` import for Claude Code |
| **Satellite — native** | `gemini`, `zed`, `aider`, `junie` | Their tools read AGENTS.md → **no file emitted** (no shadowing) |
| **Satellite — mirror** | `cline`, `amazonq`, `goose`, `kiro` | Labeled mirrors of the AGENTS.md body (tools that read neither) |
| **Structural** | `cursor`, `windsurf`, `continue`, `copilot` | Path-scoped / glob rules AGENTS.md can't express |
| **Structural — CI** | `github`, `forgejo`, `husky`, `pre-commit`, `lefthook`, `gitlab`, `circleci`, `azuredevops`, `coderabbit` | Executable gates |

Standalone `--target <satellite>` always emits a self-contained file (no dangling imports).
</details>

---

## Why teams trust it

| Property | What it means for you |
|---|---|
| **Deterministic** | SHA-verified byte-identical output across Ubuntu, macOS, Windows. Safe to run in CI, safe to diff, safe to review. |
| **Zero dependencies** | `npm ls --all` shows nothing. Nothing to supply-chain-audit but crag itself. |
| **No LLM, no network, no keys** | The core never phones home. Air-gapped friendly. |
| **Refuses to destroy work** | Composing over a hand-maintained `governance.md` without a migration seed is refused with instructions, not silently overwritten. Hand-written global files are never touched. |
| **Everything answers "why"** | With Anchor: full lineage receipts per rule (`crag why`). Supersede, never delete. |
| **Proven at scale** | [99 popular OSS repos, 0 crashes, 3,540 gates inferred](./benchmarks/leaderboard.md) · [101-repo stress test, 4,400 invocations, 0 crashes](./benchmarks/stress-test.md) · 780+ tests · Apache-2.0 |

---

## CI integration

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

[crag-audit-action](https://github.com/WhitehatD/crag-audit-action) posts a drift report on every PR; `fail-on-drift: true` blocks merges. `crag compile --target github` also generates a governance-guard workflow that re-checks CI ↔ governance sync whenever workflow files change.

Prefer zero install? Audit any public repo in the browser: [crag.sh/audit](https://crag.sh/audit).

---

## Benchmark: 99 repos, zero crashes

We ran crag against 100 of the most popular open-source repos (1 clone timeout). 20+ languages, every major CI system, monorepos to single-file libraries.

| Metric | Result |
|---|---|
| Repos audited | 99 |
| Crashes | **0** |
| Zero AI config files | 54 (55%) |
| Repos with genuine drift | 13 (13%) |
| Total gates inferred | 3,540 (35.8 mean per repo) |

Over half of the most popular repos on GitHub have **no AI agent configuration at all** — every agent session there starts blind. That's the gap.

Full results: [`benchmarks/leaderboard.md`](./benchmarks/leaderboard.md) · [Live leaderboard](https://crag.sh/leaderboard)

---

## The ecosystem

Three sovereign pieces. Versioned contracts, no import dependencies, each valuable alone:

| Piece | Role | Status |
|---|---|---|
| **crag** (this repo) | The deterministic compiler + CLI + MCP gateway. Governance in, exactly-what-your-tools-read out. | Shipping |
| **[crag Anchor](https://github.com/WhitehatD/crag-anchor)** | Verified memory: claims with executable predicates, grounding against reality, trust scores, an embedded console. | Shipping |
| **crag Gate** | The enforcement gateway: an OpenAI-compatible proxy that injects your compiled rules into *every* model request — the agent can't skip a rule that rides the request itself. | In design |

Plus: [VS Code extension](https://marketplace.visualstudio.com/items?itemName=whitehatd.vscode-crag) · [crag.nvim](https://github.com/WhitehatD/crag.nvim) · [GitHub Action](https://github.com/WhitehatD/crag-audit-action) · [app.crag.sh](https://app.crag.sh) cloud console.

---

## Contributing

Issues and PRs at [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag).

The most valuable bug report: a public repo where `crag analyze` misses a language, CI system, or gate pattern — file it with the repo URL and `crag analyze --dry-run` output.

---

## Who builds this

crag is built by [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD), a systems and AI-infrastructure engineer. It came out of real production pain — the same drift hit across enough repos to be worth solving properly — and it governs its own repository: the AGENTS.md you see here, the CLAUDE.md import, the CI guard, all compiled by crag itself. Dogfood is law.

---

Apache-2.0 — [Alexandru Cioc (WhitehatD)](https://github.com/WhitehatD)
