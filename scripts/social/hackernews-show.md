# Hacker News — Show HN

**Title:** Show HN: Crag -- Compile CI rules to 14 AI agent config formats, no LLM

**URL:** https://github.com/WhitehatD/crag

---

**Body:**

I built crag to solve a problem I kept hitting: AI coding tools (Claude Code, Cursor, Copilot, Codex) don't know what your CI pipeline enforces. They generate code that passes locally but fails CI.

crag reads your repo — package.json, CI workflows, Cargo.toml, pyproject.toml, whatever you have — and generates a single governance.md. Then it compiles that to 14 tool-specific config files: CLAUDE.md, .cursor/rules/governance.mdc, AGENTS.md, .github/copilot-instructions.md, GEMINI.md, and so on.

Deterministic compiler, no LLM, no network calls, no API keys. Zero npm dependencies. Node >= 18.

I benchmarked it on 100 of the most popular GitHub repos across 20+ languages:

- 55 repos (55%) had zero AI agent config files
- 3,620 quality gates inferred total (avg 36 per repo)
- 0 crashes
- SHA-verified identical output across Ubuntu, macOS, Windows

Some results:
- tauri (105K stars): 44 gates detected, zero AI configs
- facebook/react: CLAUDE.md exists but 3 phantom gates (references tools not in deps)
- grafana: 67 gates, clean after compile

The compiler handles per-language gate inference (25+ language detectors), CI command extraction (12 CI systems including Jenkins Groovy parsing), and workspace detection for monorepos.

Audit any public repo without installing: https://crag.sh/audit

598 tests, MIT licensed.
