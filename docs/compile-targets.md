# Compile targets

`crag compile --target all` writes, atomically, every file below. Partial
failures leave prior state intact (temp-file + rename).

| Target | Output | Consumer |
|---|---|---|
| `github` | `.github/workflows/gates.yml` | GitHub Actions |
| `husky` | `.husky/pre-commit` | husky |
| `pre-commit` | `.pre-commit-config.yaml` | pre-commit.com |
| `agents-md` | `AGENTS.md` | Codex, Aider, Factory, Crush |
| `cursor` | `.cursor/rules/governance.mdc` | Cursor |
| `gemini` | `GEMINI.md` | Gemini CLI |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot |
| `cline` | `.clinerules` | Cline (VS Code) |
| `continue` | `.continuerules` | Continue.dev |
| `windsurf` | `.windsurfrules` | Windsurf |
| `zed` | `.zed/rules.md` | Zed |
| `cody` | `.sourcegraph/cody-instructions.md` | Sourcegraph Cody |

Each compiler detects runtime versions from the manifest
(`package.json` `engines.node`, `pyproject.toml` `requires-python`,
`go.mod` directive, Gradle toolchain) so generated CI matrices match the
project automatically.

## Refusal behavior

`crag compile` refuses to emit the `github`, `husky`, and `pre-commit`
targets when the governance has zero gates — these targets produce valid
YAML but broken artifacts in that state. Doc-only targets (`cursor`,
`agents-md`, `gemini`, `copilot`, `cline`, `continue`, `windsurf`, `zed`,
`cody`) still work with zero gates because they're reference material,
not executable.

## Atomicity

All 12 compilers route file writes through `src/compile/atomic-write.js`,
which writes to a crypto-random temp file and then renames. This means:

- A crash during compile never leaves a half-written file.
- A write race with another process never corrupts the output.
- `diff` before/after a failed compile produces no false drift.
