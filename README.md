# scaffold-cli

**Templates rot. Collections require assembly. This generates self-maintaining Claude Code infrastructure from an interview.**

scaffold-cli is a meta-framework for Claude Code. It interviews you about your project — stack, deployment, quality bar, workflow preferences — then generates a complete `.claude/` infrastructure tailored to your specific setup. Every generated instruction is classified as **Discovery** (reads the codebase at runtime, never goes stale) or **Governance** (your policies, only change when you decide). The output self-corrects across sessions.

---

## The Problem

Setting up Claude Code for a serious project means creating skills, hooks, agents, rules, settings, and CI playbooks. Today you have two options:

1. **Templates** — copy someone's config and rewrite it for your stack. It works for their project, not yours. Spring Boot ≠ Express ≠ Django. Kubernetes ≠ Docker Compose ≠ Vercel.

2. **Collections** — browse 220+ skills, 1000+ templates, pick what you need, wire them together, hope they don't conflict. Manual assembly with no guarantees.

Both produce **static output** that decays. You write "11 Gradle subprojects" in your skill file — next month there's 12 and the instruction is lying to your agent. Every hardcoded fact is a future bug.

## The Solution

scaffold-cli generates infrastructure that **maintains itself**.

```
You run: /scaffold-project
Agent asks: What's your stack? How do you deploy? What's your quality bar?
Agent generates: Complete .claude/ directory — skills, hooks, agents, playbooks
Every instruction classified: Discovery (auto-updates) or Governance (human-controlled)
Result: Workflows that get more accurate with every session, not less
```

### Discovery vs Governance

The core architectural principle. Every instruction in a generated workflow is one of two types:

**Discovery** — reads the codebase at runtime:
```markdown
## 3. Architecture Map
Read the controller directory and count them:
Glob backend/src/main/java/com/example/controller/*
```
This never goes stale. If you add a controller, the agent discovers it naturally. No one updates the instruction.

**Governance** — encodes your policies:
```markdown
## 5. Development Mentality
Every endpoint must have rate limiting.
Gradle flags always: --console=plain -q --no-daemon --stacktrace
Never commit as primary author — co-author only.
```
This only changes when you decide to change it. The agent enforces it but never modifies it.

After every task, a self-update step (S8.6) checks: "Did any discovery instruction find something different from what the workflow described?" If yes, it updates the workflow. Governance rules are never touched.

**The result:** workflows that self-correct their facts while preserving your quality bar. Each session leaves the instructions more accurate without breaking your standards.

## What Gets Generated

```
.claude/
├── skills/
│   ├── pre-start-context/SKILL.md        # Session startup: context loading
│   └── post-start-validation/SKILL.md    # Task completion: validation + capture
├── hooks/
│   ├── drift-detector.sh                 # Checks if skill assumptions still hold
│   ├── circuit-breaker.sh                # Detects failure loops (warns at 3, alerts at 5)
│   ├── pre-compact-snapshot.sh           # Saves state before context compaction
│   └── post-compact-recovery.sh          # Restores context after compaction
├── agents/
│   ├── test-runner.md                    # Parallel test execution (Sonnet)
│   ├── security-reviewer.md             # Security audit (Opus, read-only)
│   ├── dependency-scanner.md            # Vulnerability scanning
│   └── skill-auditor.md                 # Workflow accuracy audit
├── rules/                               # MemStack integration (if enabled)
│   ├── knowledge.md
│   ├── diary.md
│   └── echo.md
├── ci-playbook.md                        # Known CI failure patterns
├── .session-name                         # Notification routing
└── settings.local.json                   # Hooks + permissions (rtk wildcards)

.agents/
└── workflows/
    ├── pre-start-context.md              # Skill copy for workflow runners
    └── post-start-validation.md
```

Every file is tailored to YOUR answers. Spring Boot projects get Gradle gates. Next.js projects get Biome + TSC gates. Kubernetes deployments get pod health verification. Docker Compose deployments get blue-green checks. Nothing is generic — everything is specific.

## How the Interview Works

The agent asks 8 phases of questions, one at a time, adapting based on your answers:

| Phase | What it covers | What it generates |
|-------|---------------|------------------|
| **Identity** | Project name, description, purpose | MemStack project ID, .session-name, skill headers |
| **Tech Stack** | Languages, frameworks, databases, build tools | Gate commands, test commands, dependency scanning |
| **Architecture** | Monolith/microservices, mono/multi-repo | Service discovery patterns, cross-stack checks |
| **Deployment** | CI/CD, infrastructure, deploy strategy | S9 commit/push/verify flow, CI monitoring |
| **Quality Bar** | Testing, linting, formatting, type checking | S2-S4 validation gates, auto-format hooks |
| **Security** | Auth, rate limiting, uploads, headers | S7 security review checklist |
| **Workflow** | Branch strategy, commits, autonomy level | S0 execution policy, S9 commit flow |
| **Session** | Remote access, notifications, persistence | Hooks, .session-name, resume aliases |

Questions are skipped when the answer is obvious from previous answers. A "Spring Boot + Gradle" answer auto-infers Java, JUnit, and `./gradlew` commands without asking.

## Usage

```bash
# From any Claude Code session:
/scaffold-project

# The agent will guide you through the interview.
# After answering, it generates all files in the current directory.
# Review, customize governance rules, and start working.
```

## Why Not Templates?

| | Templates | Collections | scaffold-cli |
|---|---|---|---|
| **Adapts to your stack** | No (one stack per template) | Manual assembly | Yes (from interview) |
| **Self-maintaining** | No (hardcoded facts rot) | No | Yes (discovery/governance split) |
| **Integrated** | Partially | No (mix and match) | Fully (hooks aware of MemStack, skills aware of hooks) |
| **Classified instructions** | No | No | Yes (every line is Discovery or Governance) |
| **Self-correcting** | No | No | Yes (S8.6 updates discovery, preserves governance) |
| **Time to working setup** | Hours of customization | Days of assembly | One interview session |

## Architecture Principles

1. **Enforce, don't instruct.** If it can be a hook, make it a hook. Hooks are 100% reliable at zero token cost. CLAUDE.md rules are ~80% compliance.

2. **Discover, don't hardcode.** Every fact about the codebase should be read at runtime, not written in the skill file. Files get added, versions change, pipelines evolve. Discovery instructions adapt automatically.

3. **Govern, don't hope.** Quality bar, security requirements, and workflow policies are governance rules that the agent enforces but never modifies. They change only when you change them.

4. **Compound, don't repeat.** Cross-session memory (MemStack) means each session builds on the last. Stale insights are verified against source files. Knowledge self-corrects over time.

5. **Survive, don't restart.** Compaction hooks snapshot and restore state. Session persistence reconnects in seconds. Resume aliases pick up where you left off. Context is never truly lost.

## Status

Early development. The scaffold agent works as a Claude Code agent (`/scaffold-project`). Future plans:

- [ ] Template fragments per stack (Spring Boot, Next.js, Django, Go, Rust)
- [ ] `--from-existing` mode (analyze a project and generate infrastructure)
- [ ] `--diff` mode (compare generated vs current, suggest updates)
- [ ] npm package (`npx scaffold-cli init`)
- [ ] Test suite (generate for sample projects, verify output)
- [ ] Multi-agent orchestration templates

## License

MIT

---

*Built by [WhitehatD](https://github.com/WhitehatD). The discovery/governance framework and self-correcting workflow architecture are original contributions to the Claude Code ecosystem.*
