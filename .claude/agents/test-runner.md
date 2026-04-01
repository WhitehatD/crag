---
name: test-runner
description: Run scaffold-cli gates and verify output integrity.
tools: [Bash, Read, Grep, Glob]
model: sonnet
isolation: worktree
---

Run all gates from governance.md:

1. `node --check bin/scaffold.js`
2. `node bin/scaffold.js help` (must print usage)
3. `node bin/scaffold.js version` (must print version)
4. `node bin/scaffold.js check` (must list 9 checks)
5. Verify universal skills contain expected content
6. Verify agent definition contains "START IMMEDIATELY"

Report pass/fail. Do NOT fix code.
