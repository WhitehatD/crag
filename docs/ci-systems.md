# Supported CI systems

`crag analyze` parses gate commands from the following 12 CI formats.
Each extractor handles inline scalars, block scalars (`run: |` /
`run: >-`), list forms, and the system's equivalents. Output is
normalized to drop shell plumbing, dedupe matrix expansions, and filter
background processes.

| System | File(s) |
|---|---|
| GitHub Actions | `.github/workflows/*.yml` (recursive) |
| Forgejo / Gitea Actions | `.forgejo/workflows/*.yml`, `.gitea/workflows/*.yml` (recursive) |
| GitLab CI | `.gitlab-ci.yml` |
| CircleCI | `.circleci/config.yml` |
| Travis CI | `.travis.yml` |
| Azure Pipelines | `azure-pipelines.yml`, `.azure-pipelines/**/*.yml` |
| Buildkite | `.buildkite/pipeline.yml` |
| Drone / Woodpecker | `.drone.yml`, `.woodpecker.yml`, `.woodpecker/*.yml` |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` |
| Jenkins | `Jenkinsfile`, `jenkins/Jenkinsfile`, `ci/Jenkinsfile` (declarative + scripted) |
| Cirrus CI | `.cirrus.yml` (`*_script:` keys) |
| Ad-hoc shell CI | `ci/*.sh`, `.ci/*.sh`, `scripts/ci-*.sh` (canonical names only) |

## Normalization pipeline

Every CI extractor feeds into the same normalizer in
`src/analyze/normalize.js`. The normalizer:

1. Canonicalizes matrix tokens (`${{ matrix.X }}` → `<matrix>`,
   `${{ env.X }}` → `<env>`, `${{ ... }}` → `<expr>`)
2. Strips YAML-style wrapping quotes iteratively (handles nested
   wrappers like `"'npm test'"`)
3. Decomposes compound commands on `&&` and `;`
4. Filters ~40 noise patterns including shell builtins (`break`,
   `exit`, `continue`, `shift`, `trap`), version probes (`node
   --version`, `which node`, `shellcheck --version`), variable
   assignments (shell-style and embedded-code), subshell fragments,
   cross-language prints (`puts`, `print`, `console.log`, `die`), and
   `curl | bash` installers
5. Deduplicates across workflows (same command in 5 files → reported
   once)
6. Caps the output at 8 canonical gates per CI system to prevent matrix
   explosion

The result is the same gate list regardless of which CI system the
project uses. `crag diff` compares against this normalized list so
drift detection is CI-agnostic.

## Task runners

Task runners are mined independently from the CI layer:

| Runner | File(s) | What we extract |
|---|---|---|
| Make | `Makefile`, `GNUmakefile`, `makefile` | `.PHONY` directives + column-0 targets matching `GATE_TARGET_NAMES` |
| Task | `Taskfile.yml`, `Taskfile.yaml` | `tasks:` sub-keys |
| just | `justfile` | Recipe names at column 0 |

Canonical gate target names recognised: `test`, `tests`, `spec`,
`specs`, `check`, `checks`, `ci`, `unit`, `unittest`, `unit-test`,
`integration`, `integration-test`, `itest`, `e2e`, `e2e-test`,
`kselftest`, `selftest`, `sanity`, `smoke`, `regress`, `regression`,
`lint`, `lints`, `format`, `format-check`, `fmt`, `fmt-check`,
`format-fix`, `formatting`, `linting`, `build`, `compile`,
`compile-check`, `typecheck`, `type-check`, `type_check`, `types`,
`tc`, `verify`, `validate`, `audit`, `security`, `sec`, `sast`.
