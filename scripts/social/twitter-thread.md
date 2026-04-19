# Twitter/X Thread

Post as a thread. Each numbered item is one tweet (under 280 chars).

---

1/ I audited 99 of the most popular open-source repos for AI agent config health.

55% have zero AI config files. No CLAUDE.md, no .cursorrules, no AGENTS.md. Nothing.

Your AI tools are guessing at your quality standards.

2/ Repos with zero AI configs:

- tauri (105K stars)
- fastapi (97K stars)
- laravel (84K stars)
- express (69K stars)

These projects have solid CI pipelines. But none of that reaches the AI tools writing code against them.

3/ Even repos that DO have AI configs are drifting.

langchain: 4 phantom gates — config references tools not in the project
n8n: 3 drift issues between AI config and CI

Their CLAUDE.md exists but doesn't match what CI actually enforces.

4/ The root cause: your CI pipeline is the source of truth for quality. But there's no mechanism to sync those rules to AI agent config files.

You add an eslint rule in CI. Your Cursor rules don't update. Your CLAUDE.md doesn't update. 23 files, all drifting.

5/ I built an open-source tool that fixes this. It reads your CI + codebase, writes one governance.md, and compiles it to all 23 AI tool formats.

Deterministic. No LLM. Zero dependencies.

npx @whitehatd/crag

6/ Want to see your repo's score? Free audit, no install:

crag.sh/audit

Paste any GitHub repo URL. Takes ~10 seconds. You get a drift report and exactly what's broken.

7/ Full data: 99 repos, 3,540 quality gates found, 0 crashes. MIT licensed, 605 tests.

GitHub: github.com/WhitehatD/crag

If your AI tools are writing code against your repo, they should follow your rules. Not guess.
