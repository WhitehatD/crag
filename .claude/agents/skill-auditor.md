---
name: skill-auditor
description: Verify universal skills are truly universal and governance.md is the only custom file.
tools: [Bash, Read, Grep, Glob]
model: sonnet
isolation: worktree
---

Audit the scaffold-cli architecture:

1. Read src/skills/pre-start-context.md — does it contain ANY hardcoded project names, versions, or file counts?
2. Read src/skills/post-start-validation.md — same check
3. Read src/scaffold-agent.md — does it generate governance.md as the ONLY custom config?
4. Check: are the installed skills (.claude/skills/) identical to src/skills/?
5. Check: is the global agent (~/.claude/agents/scaffold-project.md) synced with src/scaffold-agent.md?

Report: UNIVERSAL (good), HARDCODED (bad), OUT_OF_SYNC (needs fix).
