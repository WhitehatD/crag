# crag

**Governance compiler for AI-assisted codebases.**

You tighten a lint rule in `.cursor/rules/`. The Copilot file still has
the old one. CI enforces a third version. Your AI agent writes code that
CI rejects — and nobody knows which config is the source of truth.

`crag` fixes this. Write your rules once in a ~20-line `governance.md`.
Compile to all 12 targets — CI workflow, pre-commit hook, and 10 AI
agent configs — in one command. Change a rule, recompile, done.

![crag demo](assets/demo.gif)

> 404 ms · zero dependencies · no LLM · no network · SHA-verified deterministic output

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

## What 12 files from one governance.md looks like

`crag compile --target all --dry-run --verbose` on crag itself:

```
$ crag compile --target all --dry-run --verbose

  Compiling governance.md → github, husky, pre-commit, agents-md, cursor,
  gemini, copilot, cline, continue, windsurf, zed, amazonq
  9 gates, 1 runtimes detected (dry-run)

  plan .github/workflows/gates.yml                  1.57 KB
  plan .husky/pre-commit                              507 B
  plan .pre-commit-config.yaml                      2.23 KB
  plan AGENTS.md                                    1.08 KB
  plan .cursor/rules/governance.mdc                   993 B
  plan GEMINI.md                                    1.24 KB
  plan .github/copilot-instructions.md              1.86 KB
  plan .clinerules                                  1.58 KB
  plan .continuerules                               1.70 KB
  plan .windsurf/rules/governance.md                 1.80 KB
  plan .rules                                       1.69 KB
  plan .amazonq/rules/governance.md                 1.75 KB

  Total: 18.0 KB across 12 target(s)
  Dry-run complete — no files written.
```

Same rules, 12 files, zero copy-paste. Change one gate, recompile, all
12 update together.

---

## How it works

```
your repo  ───►  crag analyze  ───►  governance.md  ───►  crag compile  ───►  12 files
                                      (~20 lines)                              CI workflow
                                           │                                   pre-commit hook
                                      edit one line                            AGENTS.md
                                      recompile all                            .cursor/rules
                                                                               + 8 more

crag diff    ───►  MATCH / DRIFT / MISSING / EXTRA
crag doctor  ───►  integrity + drift + security check
```

Deterministic: same input → byte-identical output. No LLM. No network.

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
