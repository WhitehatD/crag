# Twitter/X Thread

Post as a thread. Each numbered item is one tweet (under 280 chars).

---

1/ I audited 100 of the most popular open-source repos for AI agent config health.

55% have zero AI config files. No CLAUDE.md, no .cursorrules, no AGENTS.md. Nothing.

Your AI tools are guessing at your quality standards.

2/ Repos with zero AI configs:

- tauri (105K stars)
- fastapi (97K stars)
- svelte (86K stars)
- laravel (84K stars)
- express (69K stars)

These projects have solid CI pipelines. But none of that reaches the AI tools writing code against them.

3/ Even repos that DO have AI configs are drifting.

facebook/react: grade D
langchain: grade D
n8n: grade C

Their CLAUDE.md and .cursorrules exist but don't match what CI actually enforces.

4/ The root cause: your CI pipeline is the source of truth for quality. But there's no mechanism to sync those rules to AI agent config files.

You add an eslint rule in CI. Your Cursor rules don't update. Your CLAUDE.md doesn't update. 14 files, all drifting.

5/ I built an open-source tool that fixes this. It reads your CI + codebase, writes one governance.md, and compiles it to all 14 AI tool formats.

Deterministic. No LLM. Zero dependencies.

npx @whitehatd/crag

6/ Want to see your repo's score? Free audit, no install:

crag.sh/audit

Paste any GitHub repo URL. Takes ~10 seconds. You get a letter grade (A-F) and exactly what's broken.

7/ Full data: 100 repos, 3,620 quality gates found, 0 crashes. MIT licensed, 598 tests.

GitHub: github.com/WhitehatD/crag

If your AI tools are writing code against your repo, they should follow your rules. Not guess.
