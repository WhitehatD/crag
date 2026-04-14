# r/ClaudeAI Post

**Flair:** Tool

**Title:** I audited 100 top repos for AI governance — 55% have zero config for Claude Code or any agent. Built a tool to fix it.

---

**Body:**

I've been using Claude Code heavily and noticed a pattern: CLAUDE.md files either don't exist, or they're stale copies of rules that no longer match what CI actually enforces.

So I wrote a tool to quantify this. I audited 100 of the most popular GitHub repos (React, Django, FastAPI, Tauri, Svelte, etc.) and checked whether their AI agent configs match their CI pipelines.

### What I found

- **55 out of 100 repos** have zero AI agent config files — no CLAUDE.md, no AGENTS.md, no .cursorrules. Nothing.
- Of the 45 that do have configs, most are **drifting** from their CI. facebook/react scored D. langchain scored D.
- 3,620 quality gates were inferred across all 100 repos. Most of those gates exist only in CI — AI tools never see them.

### Why this matters for Claude Code users

When you open Claude Code in a repo without CLAUDE.md, Claude has no idea what your test command is, what linter you use, or what your commit conventions are. It guesses. Sometimes it's right. Often it's not.

The fix I built is called **crag**. It's a CLI that:

1. Reads your CI config + package manifests (zero config needed)
2. Generates a `governance.md` with all your gates, style rules, and conventions
3. Compiles that to CLAUDE.md (and 13 other formats — Cursor, Copilot, AGENTS.md, etc.)

No LLM involved — it's a deterministic compiler. Zero dependencies. MIT licensed.

### How to try it

**Quick audit (no install):** Paste any GitHub repo at [crag.sh/audit](https://crag.sh/audit) — you'll get a letter grade and a breakdown of what's drifting.

**Full setup:**
```bash
npx @whitehatd/crag
```

This generates governance.md and compiles it to all AI tool formats. Takes about 1 second.

To keep CLAUDE.md in sync automatically:
```bash
npx @whitehatd/crag hook install
```

This adds a pre-commit hook that recompiles when governance changes.

### The data

- 100 repos audited, 0 crashes
- 598 tests passing
- Supports 25+ languages, 12 CI systems
- [Full leaderboard](https://crag.sh/leaderboard)
- [GitHub](https://github.com/WhitehatD/crag)

Curious what score your repos get. If crag misses something on your project, happy to look into it.
