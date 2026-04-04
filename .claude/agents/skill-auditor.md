---
name: skill-auditor
description: Verify universal skills are truly universal and governance.md is the only custom file.
tools: [Bash, Read, Grep, Glob]
model: sonnet
isolation: worktree
---

Audit the crag architecture:

1. Read src/skills/pre-start-context.md — does it contain ANY hardcoded project names, versions, or file counts?
2. Read src/skills/post-start-validation.md — same check
3. Read src/crag-agent.md — does it generate governance.md as the ONLY custom config?
4. Check: are the installed skills (.claude/skills/) identical to src/skills/?
5. Check: is the global agent (~/.claude/agents/crag-project.md) synced with src/crag-agent.md?
6. Check: does src/update/skill-sync.js use isTrustedSource() to validate the source path?

Report: UNIVERSAL (good), HARDCODED (bad), OUT_OF_SYNC (needs fix).
