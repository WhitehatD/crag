# Governance — crag

## Identity
- Project: crag
- Description: The bedrock layer for AI coding agents. One governance.md. Any project. Never stale. Universal runtime discovery engine + single governance config. Compiles to CI, hooks, AGENTS.md, Cursor, and Gemini.

## Architecture
- CLI entry point: bin/crag.js (Node.js, zero dependencies, ≥ Node 18)
- Universal skills: src/skills/pre-start-context.md, src/skills/post-start-validation.md
- Interview agent: src/crag-agent.md (also installed globally at ~/.claude/agents/crag-project.md)
- 24 modules across 6 directories (commands/, governance/, workspace/, compile/, update/, cli.js)
- No backend. No frontend. No build step. Pure Node.js + markdown.

## Gates (run in order, stop on failure)
### Code
- node --check bin/crag.js
- node bin/crag.js help
- node bin/crag.js version
- node bin/crag.js check
- node bin/crag.js analyze --dry-run
- node bin/crag.js diff
- node bin/crag.js upgrade --check
- node bin/crag.js workspace --json

### Tests
- node test/all.js

### Validation
- Verify src/skills/pre-start-context.md contains "discovers any project"
- Verify src/skills/post-start-validation.md contains "governance gates"
- Verify src/crag-agent.md contains "START IMMEDIATELY"

## Branch Strategy
- Feature branches (feat/, fix/, docs/)
- Conventional commits
- Auto-commit after gates pass

## Security
- No secrets, no auth, no API keys
- The crag interview agent runs inside Claude Code's sandbox — no arbitrary code execution outside it
- governance.md files generated for users must never contain secrets

## Security Boundaries
- All tools and subagents operate ONLY within this repository
- Hard-blocked: rm -rf /, dd, mkfs, fdisk, DROP TABLE/DATABASE, docker system prune -a, kubectl delete namespace, curl|bash, force-push to main/master, shutdown/reboot
- Warned: file write/delete operations targeting paths outside the project root
- Subagents: inherit all boundaries, cannot escalate permissions
- Enforced by: sandbox-guard.sh hook (PreToolUse) + skill-level instructions

## Autonomy
- Auto-commit after gates pass

## Deployment
- Target: npm registry (package name `crag`)
- CI: GitHub Actions (future)
- Currently: direct git push to GitHub

## Conventions
- Universal skills must NEVER hardcode project-specific facts
- governance.md must be the ONLY project-specific file
- Every instruction in skills must be classified as Discovery or Governance
- README must always reflect current state — no aspirational claims without proof
- Agent definition synced to ~/.claude/agents/crag-project.md after every change
