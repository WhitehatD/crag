# crag

[![npm version](https://img.shields.io/npm/v/%40whitehatd%2Fcrag?color=%23e8bb3a&label=npm&logo=npm)](https://www.npmjs.com/package/@whitehatd/crag)
[![Test](https://github.com/WhitehatD/crag/actions/workflows/test.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/test.yml)
[![Release](https://github.com/WhitehatD/crag/actions/workflows/release.yml/badge.svg)](https://github.com/WhitehatD/crag/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/%40whitehatd%2Fcrag)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)

[![Tests](https://img.shields.io/badge/tests-510%20passing-brightgreen)](./test)
[![Deterministic](https://img.shields.io/badge/deterministic-SHA--verified-brightgreen)](#see-it-work-in-3-seconds)
[![Stress test](https://img.shields.io/badge/stress%20test-101%20repos%20%C2%B7%204%2C400%20invocations%20%C2%B7%200%20crashes-brightgreen)](./benchmarks/stress-test.md)
[![Reference benchmark](https://img.shields.io/badge/benchmark-40%2F40%20Grade%20A-brightgreen)](./benchmarks/results.md)

**Your AI coding rules and your CI will never disagree again.**

Write your quality rules once in a ~20-line `governance.md`. `crag` keeps
them in sync with your CI workflow, your pre-commit hooks, and whichever
AI coding tool you use — Cursor, Copilot, Gemini, Cline, Continue, Zed,
Windsurf, Sourcegraph Cody, plus 4 more. Change one line, regenerate
everything. Deterministic — no LLM, no network, SHA-verified on every
release.

```bash
npx @whitehatd/crag demo          # 3-second proof-of-value, no install, no config
npx @whitehatd/crag analyze       # write governance.md from your existing project
npx @whitehatd/crag compile       # regenerate every derived file
```

---

## See it work in 3 seconds

```bash
npx @whitehatd/crag demo
```

![crag demo](assets/demo.gif)

568 ms. No install, no config, no network, no LLM. Scaffolds a
synthetic polyglot project (Node + TypeScript + Rust cargo workspace),
analyzes it, diffs the governance against the CI workflow, compiles to
all 12 targets, then runs a second analyze and SHA-verifies the output
is byte-identical. The same SHA is verified on every CI push across 9
runner slots (Ubuntu + macOS + Windows × Node 18/20/22).

---

## What 12 files from one governance.md actually looks like

This is the real output of `crag compile --target all --dry-run --verbose`
on a small project (crag itself):

```
$ crag compile --target all --dry-run --verbose

  Compiling governance.md → github, husky, pre-commit, agents-md, cursor,
  gemini, copilot, cline, continue, windsurf, zed, cody
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
  plan .windsurfrules                               1.72 KB
  plan .zed/rules.md                                1.69 KB
  plan .sourcegraph/cody-instructions.md            1.75 KB

  Total: 17.9 KB across 12 target(s)
  Dry-run complete — no files written.
```

Same rules, 12 output files, zero copy-paste, atomic writes. Every file
reflects the same `governance.md`. Change one gate in the source, re-run
`crag compile`, and all 12 update together.

---

## Why this exists

Every project duplicates the same quality rules across multiple config
files: the CI workflow, a pre-commit hook, contributor docs, the README,
and one instruction file per AI coding tool you use (`AGENTS.md`,
`.cursor/rules/`, `GEMINI.md`, `.clinerules`, `.continuerules`,
`.windsurfrules`, `.zed/rules.md`, `.sourcegraph/cody-instructions.md`,
`.github/copilot-instructions.md`). That's **up to 12 places to keep in
sync**, every single time a rule changes.

They drift. Someone tightens the lint rules in `.cursor/rules/`, misses
the Copilot file. Someone updates the CI workflow, forgets the
pre-commit hook. A new AI agent ships and needs its own instruction
format. The rules split into N copies that start disagreeing with each
other and the truth gets lost.

`crag` removes the duplication at its source. You maintain one ~20 line
`governance.md`. `crag compile` regenerates every derived file from it,
atomically. Changing a rule means editing one line and re-running the
compiler.

---

## How it works at a glance

```
  Your repo                      crag                       Output
  ─────────                      ────                       ──────

  any stack       ─►   crag analyze        ─►    governance.md  (one file, ~20 lines)
  any CI system         (detects stack,           ▲
  any workspace          gates, CI, and           │  Hand-edit ANY rule here
                         workspace layout)         │  when it needs to change.
                                                    │
                                                    ▼
                       crag compile          ─►    .github/workflows/gates.yml
                       --target all                .husky/pre-commit
                                                   .pre-commit-config.yaml
                                                   AGENTS.md              (Codex, Aider, Factory)
                                                   .cursor/rules/*        (Cursor)
                                                   GEMINI.md              (Gemini CLI)
                                                   copilot-instructions.md
                                                   .clinerules
                                                   .continuerules
                                                   .windsurfrules
                                                   .zed/rules.md
                                                   cody-instructions.md
                                                   └─ 12 files, regenerated atomically

                       crag diff            ─►    MATCH / DRIFT / MISSING / EXTRA
                                                   (governance.md vs your 11 supported
                                                    CI systems, deduplicated, normalized)

                       crag doctor          ─►    governance integrity + drift +
                                                   security smoke test + hook validity

  Deterministic: same input → byte-identical output. No LLM. No network.
```

---

## Validated on 141 open-source repositories

`crag` ships with two independent OSS validation corpora, both
reproducible in-tree, both rerun on every release.

**Stress test — 101 repos, 4,400 invocations, 0 crashes.** The primary
robustness metric. 101 open-source repos picked to span every supported
language, every CI system, every workspace type, plus deliberate edge
cases (mirror repos, dotfile repos, docs-only, kernel-style Makefiles,
embedded CMake, multi-GB monorepos, non-English READMEs, Fossil and
Mercurial mirrors). Each repo exercised against a 21-command main matrix
plus a 23-step edge-case matrix. Result: **0 unexpected exit codes, 28
findings surfaced, 28 resolved** before release. 141 regression tests
added as guards. Full report with corpus breakdown, matrix definitions,
and per-step aggregation: [`benchmarks/stress-test.md`](./benchmarks/stress-test.md).

**Reference benchmark — 40 repos, 100 % Grade A.** The output-quality
metric. 40 well-known repos graded on whether `crag analyze` produces
ship-ready governance. 20 Tier 1 libraries across 7 language families,
20 Tier 2 polyglot density repos. Full methodology, per-repo grades,
raw outputs: [`benchmarks/results.md`](./benchmarks/results.md).

**Self-audit**: `crag` applies its own `governance.md` and passes its
own gates on every commit.

```
crag doctor   29/29 pass, 0 warn, 0 fail
crag diff     12 match, 0 drift, 0 missing, 0 extra
crag check    9/9 core files present
```

---

## Why not X?

| Alternative | When it's better than crag | When crag is better |
|---|---|---|
| Hand-written `.cursorrules` (or equivalent) | You use exactly one AI tool, rules rarely change | You use more than one AI tool, **or** rules drift from CI |
| Makefile + comments as the source of truth | Small repos, single-language, CI is Jenkins-shaped | Cross-stack projects, multiple compile targets, AI agents need their own formats |
| Conftest / OPA | Runtime policy enforcement on cluster state | Dev-time gate definition *before* code reaches the cluster |
| Pre-commit framework alone | Pre-commit is the only surface you care about | You also want the same rules to reach CI, AI agents, and contributor docs |
| Copy-pasted `CONTRIBUTING.md` gates | You trust contributors to read and follow docs | You want the rules to be *enforced* mechanically, not documented |

---

## First 5 minutes

```bash
# 1. Prove it works in 3 seconds (no install, no config)
npx @whitehatd/crag demo

# 2. Generate governance.md from your project
cd your-repo
npx @whitehatd/crag analyze

# 3. Verify it matches reality
npx @whitehatd/crag diff

# 4. Compile to every AI agent + CI + hook config you use
npx @whitehatd/crag compile --target all --dry-run   # preview
npx @whitehatd/crag compile --target all             # write

# 5. Health check (run before committing)
npx @whitehatd/crag doctor
```

These five commands carry 95 % of real-world crag usage. Everything
else — workspace enumeration, per-target compile, merge mode, skills
upgrade, governance v2 annotations, the Claude Code session loop — is
in [`docs/`](./docs/index.md).

**Requirements**: Node.js 18+ and `git`. Zero runtime dependencies.
Binary name is `crag` (package is `@whitehatd/crag`).

---

## Further reading

All deep reference material lives under [`docs/`](./docs/index.md):

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
