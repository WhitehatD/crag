---
title: "I Audited 99 Top GitHub Repos — 55% Have No AI Agent Configs"
published: false
description: "AI coding tools are guessing at your quality standards. I built a tool to fix it and audited 99 repos to prove it."
tags: ai, devtools, opensource, productivity
# cover_image: https://crag.sh/og-image.png
---

# I Audited 99 Top GitHub Repos — 55% Have No AI Agent Configs

AI coding tools are everywhere. Claude Code, Cursor, GitHub Copilot, Codex, Gemini — they're writing real code in real repos every day. But there's a gap nobody talks about: **most repos don't tell these tools what the rules are.**

Your CI pipeline knows. It runs the linter, the tests, the type checker, the formatter. It knows your commit conventions and your security policies. But that knowledge lives in `.github/workflows/` and `package.json` — and AI tools don't read those.

So what happens? The AI guesses. Sometimes it's right. Often it runs `npm test` when you use `pnpm test`, or skips `cargo clippy` entirely, or generates code that fails your lint config.

## The audit

I wanted to quantify this. I took 100 of the most popular open-source repos on GitHub — React, Django, FastAPI, Tauri, Svelte, Grafana, Terraform, and more — and checked three things (1 repo failed to clone due to size):

1. **Do they have AI agent config files?** (CLAUDE.md, AGENTS.md, .cursorrules, etc.)
2. **If they do, are those configs in sync with CI?**
3. **How many quality gates does CI enforce that AI tools don't know about?**

### The results

| Metric | Result |
|---|---|
| Repos audited | 99 |
| Repos with zero AI configs | **54 (55%)** |
| Repos with at least one AI config | 45 (45%) |
| Total quality gates inferred | 3,540 |
| Average gates per repo | 35.8 |

Some notable repos with **zero** AI config files:

- **tauri** — 105K stars, 42 quality gates, no AI configs
- **fastapi** — 97K stars, 26 gates, no AI configs
- **laravel** — 84K stars, 20 gates, no AI configs
- **express** — 69K stars, 23 gates, no AI configs

These are well-maintained projects with solid CI pipelines. They just don't have a way to communicate those rules to AI tools.

### Even repos WITH configs are drifting

Having a CLAUDE.md doesn't mean it's correct. Some examples:

- **langchain** — Has both CLAUDE.md and AGENTS.md, but 4 phantom gates (references tools not in the project).
- **n8n** — Has configs, but 3 drift issues between AI config and CI.

"Drift" means the AI config says one thing, but CI enforces something different. The AI tool follows the stale config, generates code that fails CI, and the developer wastes time figuring out why.

## The fix

I built [crag](https://github.com/WhitehatD/crag) to solve this. It's a CLI that:

1. **Analyzes** your repo — reads CI configs, package manifests, and code patterns to infer your actual rules
2. **Generates** a single `governance.md` — your source of truth
3. **Compiles** that to 14 tool-specific config files

```bash
npx @whitehatd/crag
```

That's the whole setup. It detects your stack, finds your gates, and generates configs for Claude Code, Cursor, Copilot, Codex, Gemini, Cline, Continue, Windsurf, Zed, Amazon Q, GitHub Actions, Forgejo Actions, Husky, and pre-commit.

### Example output

Running `crag analyze` on a TypeScript project with GitHub Actions might infer:

```
Gates:
  - npm run test
  - npm run lint
  - npm run build
  - npx tsc --noEmit

Code Style:
  - Indent: 2 spaces
  - Module system: ESM

Branch Strategy:
  - Trunk-based development
  - Conventional commits
```

Then `crag compile --target all` writes that to each tool's native format. Cursor gets MDC frontmatter. AGENTS.md gets numbered steps. GitHub Actions gets a `gates.yml` workflow. Each format follows the tool's conventions.

### Keeping it in sync

The whole point is that when your CI changes, your AI configs update too:

```bash
# Install a pre-commit hook that recompiles when governance.md changes
npx @whitehatd/crag hook install

# Or add drift detection to CI
# .github/workflows/crag-audit.yml
- uses: WhitehatD/crag-audit-action@v1
```

## Technical details

- **Zero npm dependencies** — no supply chain risk
- **Deterministic** — same input produces byte-identical output across platforms
- **25+ language detectors** — Node, Python, Rust, Go, Java, Swift, Elixir, PHP, and more
- **12 CI system extractors** — GitHub Actions, GitLab CI, CircleCI, Jenkins (Groovy parsing), Travis, Azure Pipelines, Buildkite, Drone, and more
- **605 tests passing**
- **MIT licensed**

It runs entirely offline. No LLM, no API calls, no account required.

## Try it

**Audit any public repo without installing anything:**

Go to [crag.sh/audit](https://crag.sh/audit), paste a GitHub repo URL, and get a letter grade in about 10 seconds. You'll see exactly where your AI configs drift from your CI pipeline.

**Full setup:**

```bash
# Analyze + compile in one shot
npx @whitehatd/crag

# Check for drift
npx @whitehatd/crag audit

# Auto-fix drift
npx @whitehatd/crag audit --fix
```

**See the full leaderboard:** [crag.sh/leaderboard](https://crag.sh/leaderboard) — 99 repos scored and graded.

**GitHub:** [github.com/WhitehatD/crag](https://github.com/WhitehatD/crag)

If you're using AI coding tools — and at this point, who isn't — your repo should tell them what the rules are. Not hope they figure it out.
