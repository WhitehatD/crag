# Compile targets

`crag compile --target all` writes, atomically, every file below. Partial
failures leave prior state intact (temp-file + rename).

| Target | Output | Consumer |
|---|---|---|
| `github` | `.github/workflows/gates.yml` | GitHub Actions |
| `forgejo` | `.forgejo/workflows/gates.yml` | Forgejo / Gitea Actions |
| `husky` | `.husky/pre-commit` | husky |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com |
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory (60K+ repos) |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| `gemini` | `GEMINI.md` | Gemini, Gemini CLI |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `cline` | `.clinerules` | Cline (VS Code) |
| `continue` | `.continuerules` | Continue.dev |
| `windsurf` | `.windsurf/rules/governance.md` | Windsurf Cascade |
| `zed` | `.rules` | Zed |
| `amazonq` | `.amazonq/rules/governance.md` | Amazon Q Developer |
| `claude` | `CLAUDE.md` | Claude Code |

## Scaffold target

`crag compile --target scaffold` generates project infrastructure that
`crag doctor` and `crag check` expect. Unlike the 14 AI-config targets
above, scaffold is **not** included in `--target all` — it's run
separately because these files are commit-once infrastructure, not
frequently recompiled.

| Output | Purpose |
|---|---|
| `.claude/hooks/sandbox-guard.sh` | Hard-block destructive system commands |
| `.claude/hooks/drift-detector.sh` | Warn when compiled configs are stale |
| `.claude/hooks/circuit-breaker.sh` | Prevent runaway retries |
| `.claude/settings.local.json` | Wire hooks into Claude Code settings |
| `.claude/agents/test-runner.md` | Run quality gates in a worktree |
| `.claude/agents/security-reviewer.md` | Review changes for security issues |
| `.claude/ci-playbook.md` | CI failure resolution playbook |

Existing files are preserved by default. Pass `--force` to regenerate.
Settings are merged: existing `permissions.allow` entries are kept and
the `hooks` section is added or updated.

---

Each compiler detects runtime versions from the manifest
(`package.json` `engines.node`, `pyproject.toml` `requires-python`,
`go.mod` directive, Gradle toolchain) so generated CI matrices match the
project automatically.

## Refusal behavior

`crag compile` refuses to emit the `github`, `forgejo`, `husky`, and `pre-commit`
targets when the governance has zero gates — these targets produce valid
YAML but broken artifacts in that state. Doc-only targets (`cursor`,
`agents-md`, `gemini`, `copilot`, `cline`, `continue`, `windsurf`, `zed`,
`amazonq`) still work with zero gates because they're reference material,
not executable.

## Atomicity

All 14 compilers route file writes through `src/compile/atomic-write.js`,
which writes to a crypto-random temp file and then renames. This means:

- A crash during compile never leaves a half-written file.
- A write race with another process never corrupts the output.
- `diff` before/after a failed compile produces no false drift.
