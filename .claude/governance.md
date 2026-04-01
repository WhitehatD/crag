# Governance — scaffold-cli

## Identity
- Project: scaffold-cli
- Description: Meta-framework for AI coding agents. Universal runtime discovery engine + single governance config. Ships skills that discover any project, generates governance from an interview.

## Architecture
- CLI entry point: bin/scaffold.js (Node.js, zero dependencies)
- Universal skills: src/skills/pre-start-context.md, src/skills/post-start-validation.md
- Scaffold agent: src/scaffold-agent.md (also installed globally at ~/.claude/agents/)
- No backend. No frontend. No build step. Pure Node.js + markdown.

## Gates (run in order, stop on failure)
### Code
- node --check bin/scaffold.js
- node bin/scaffold.js help
- node bin/scaffold.js version
- node bin/scaffold.js check

### Validation
- Verify src/skills/pre-start-context.md contains "discovers any project"
- Verify src/skills/post-start-validation.md contains "governance gates"
- Verify src/scaffold-agent.md contains "START IMMEDIATELY"

## Branch Strategy
- Feature branches (feat/, fix/, docs/)
- Conventional commits
- Auto-commit after gates pass

## Security
- No secrets, no auth, no API keys
- The scaffold agent runs inside Claude Code's sandbox — no arbitrary code execution outside it
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
- Target: npm registry (future)
- CI: GitHub Actions (future)
- Currently: direct git push to GitHub

## Conventions
- Universal skills must NEVER hardcode project-specific facts
- governance.md must be the ONLY project-specific file
- Every instruction in skills must be classified as Discovery or Governance
- README must always reflect current state — no aspirational claims without proof
- Agent definition synced to ~/.claude/agents/scaffold-project.md after every change
