# CI Playbook — scaffold-cli

## Node.js Failures

### node --check fails on scaffold.js
- **Symptom:** Syntax error in bin/scaffold.js
- **Fix:** Check recent edits for missing brackets, unclosed strings

### scaffold check shows missing files
- **Symptom:** check reports files missing after code changes
- **Fix:** Verify file paths in bin/scaffold.js check() match actual generated structure

## Agent Failures

### scaffold init hangs at prompt
- **Symptom:** Claude Code launches but agent doesn't start talking
- **Fix:** Verify src/scaffold-agent.md contains "START IMMEDIATELY" instruction

### Agent regenerates universal skills
- **Symptom:** Agent writes 257 lines to SKILL.md that CLI already installed
- **Fix:** Verify agent definition says "DO NOT overwrite" universal skills

## Sync Failures

### Global agent out of sync
- **Symptom:** drift-detector warns "Global agent out of sync"
- **Fix:** cp src/scaffold-agent.md ~/.claude/agents/scaffold-project.md

*Add entries as failures are discovered.*
