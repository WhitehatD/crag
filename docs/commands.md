# Commands

Every subcommand, every flag. Unknown flags are rejected with exit code 1
and a typo suggestion for close matches (e.g. `crag analyze --drty-run`
prints `did you mean --dry-run?`).

```
crag demo                        Self-contained proof-of-value (~3 s)
  --json                         Machine-readable summary
  --keep                         Leave the synthetic project on disk for inspection

crag analyze                     Generate .claude/governance.md from filesystem
  --dry-run                      Print what would be generated, don't write
  --workspace                    Analyze root + every workspace member
  --merge                        Preserve existing governance, append inferred sections
  --no-install-skills            Skip auto-install of universal skills

crag init                        Interactive interview (requires Claude Code CLI)

crag                             Run analyze + compile in one shot (auto-detects project)
  --dry-run                      Preview without writing files

crag audit                       Governance drift report
  --json                         Machine-readable JSON output
  --fix                          Auto-recompile stale targets

crag hook install                Install pre-commit hook (auto-recompile on governance change)
  --drift-gate                   Also block commits if drift is detected
  --force                        Overwrite existing non-crag hook
crag hook uninstall              Remove crag-installed hook
crag hook status                 Check hook installation status

crag compile --target <name>     Compile governance to a single target
  --target all                   Compile all 23 AI config targets
  --target scaffold              Generate hooks, settings, agents, CI playbook
  --dry-run                      Print planned output paths, don't write
  --verbose                      Print byte-size of each emitted target (dry-run or write)
  --force                        Overwrite existing scaffold files (scaffold target only)
crag compile                     List available targets

crag diff                        Compare governance against codebase reality
  --ci                             Exit non-zero on drift/missing/extra (for CI)
  --json                           Machine-readable JSON output

crag doctor                      Deep diagnostic
  --ci                           CI mode: skip checks requiring runtime infra
  --json                         Machine-readable output
  --strict                       Treat warnings as failures
  --workspace                    Run doctor on every workspace member

crag check                       Verify infrastructure file presence
  --json                         Machine-readable
  --governance-only              Only require governance.md (post-analyze mode)

crag workspace                   Inspect detected workspace
  --json                         Machine-readable

crag upgrade                     Update universal skills to latest version
  --check                        Dry-run: show what would change
  --workspace                    Update every workspace member
  --force                        Overwrite modified skills (with backup)

crag install                     Install crag-project agent globally (~/.claude/agents/)

crag login                       Authenticate with crag cloud (GitHub OAuth)
  --status                       Show current auth state
  --logout                       Clear saved credentials

crag sync                        Show sync status (default)
  --push                         Push local governance.md to cloud
  --pull                         Pull governance from cloud to local
  --force                        Force overwrite on push/pull conflict
  --status                       Explicit status check

crag team                        Show current team
crag team create <name>          Create a new team
crag team join <code>            Join a team with an invite code
crag team members                List team members
crag team invite                 Generate an invite link (owner only)
crag team leave                  Leave current team

crag version
crag help
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | User error (missing governance, invalid flag, gate failure, drift in `diff`) |
| `2` | Internal / environmental error (permission denied, disk full, unexpected stat failure) |

Scripts can use `if [ $? -eq 1 ]` to distinguish user mistakes from
infrastructure problems.
