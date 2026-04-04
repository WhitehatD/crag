# CI Playbook — crag

## Node.js Failures

### node --check fails on crag.js
- **Symptom:** Syntax error in bin/crag.js or any src/ module
- **Fix:** Check recent edits for missing brackets, unclosed strings

### crag check shows missing files
- **Symptom:** check reports files missing after code changes
- **Fix:** Verify file paths in src/commands/check.js match actual generated structure

## Agent Failures

### crag init hangs at prompt
- **Symptom:** Claude Code launches but agent doesn't start talking
- **Fix:** Verify src/crag-agent.md contains "START IMMEDIATELY" instruction

### Agent regenerates universal skills
- **Symptom:** Agent writes 257 lines to SKILL.md that CLI already installed
- **Fix:** Verify agent definition says "DO NOT overwrite" universal skills

## Sync Failures

### Global agent out of sync
- **Symptom:** drift-detector warns "Global agent out of sync"
- **Fix:** cp src/crag-agent.md ~/.claude/agents/crag-project.md

### Skill hash mismatch on Windows
- **Symptom:** upgrade reports "locally modified" when file was not edited
- **Fix:** Re-run — computeHash normalizes CRLF to LF, but if the file was rewritten with different line endings, the hash may differ temporarily

## Tests Failures

### Test fixtures fail with ENOENT on Windows
- **Symptom:** `fs.mkdirSync(path.join(root, 'packages', 'a'))` fails
- **Fix:** Add `{ recursive: true }` — intermediate directories don't exist

*Add entries as failures are discovered.*
