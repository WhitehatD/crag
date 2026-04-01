# scaffold-cli

Meta-framework that generates complete Claude Code infrastructure from an interactive interview.

**Input:** A vague project idea + answers to questions about stack, deployment, quality bar, and workflow preferences.

**Output:** Complete `.claude/` directory — pre-start skill, post-start skill, hooks, agents, CI playbook, settings, MemStack rules — all using the discovery/governance split.

## Usage

From any Claude Code session:
```
/scaffold-project
```

The agent runs an interactive interview, then generates all files.

## Architecture

```
User → /scaffold-project agent
  → Phase 1: Interview (8 sections, adaptive questions)
  → Phase 2: Generate (9 file types, discovery/governance classified)
  → Phase 3: Summary (counts, next steps)
```

### Discovery vs Governance

Every generated instruction is classified:

| Type | Example | Updates how |
|------|---------|-------------|
| **Discovery** | "Read settings.gradle.kts to find subprojects" | Agent auto-updates when codebase changes (S8.6) |
| **Governance** | "Every endpoint must have rate limiting" | Only changes when user decides |

Discovery instructions read the filesystem at runtime — they never hardcode facts. Governance rules come from the interview answers — they encode the user's quality bar and policies.

## What Gets Generated

```
.claude/
├── skills/
│   ├── pre-start-context/SKILL.md      # Context loading workflow
│   └── post-start-validation/SKILL.md  # Validation + capture workflow
├── hooks/
│   ├── drift-detector.sh               # Checks skill assumptions
│   ├── circuit-breaker.sh              # Failure loop detection
│   ├── pre-compact-snapshot.sh         # MemStack state before compaction
│   └── post-compact-recovery.sh        # MemStack restore after compaction
├── agents/
│   ├── test-runner.md                  # Parallel test execution
│   ├── security-reviewer.md           # Security audit
│   ├── dependency-scanner.md          # Vulnerability scanning
│   └── skill-auditor.md              # Workflow accuracy audit
├── rules/
│   ├── knowledge.md                   # MemStack knowledge protocol
│   ├── diary.md                       # Session logging protocol
│   └── echo.md                        # Memory recall protocol
├── ci-playbook.md                     # Known CI failure patterns
├── .session-name                      # tmux session routing
└── settings.local.json                # Hooks + permissions

.agents/
└── workflows/
    ├── pre-start-context.md           # Skill copy (no name: line)
    └── post-start-validation.md       # Skill copy (no name: line)
```

## Status

Work in progress. The scaffold agent definition is in `src/scaffold-agent.md`.
