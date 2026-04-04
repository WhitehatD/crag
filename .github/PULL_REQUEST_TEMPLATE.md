<!--
Thanks for contributing to crag.
Keep PRs focused — one logical change per PR is much easier to review and merge.
-->

## What this does

<!-- 1-3 sentences. If it fixes an issue, link it: "Fixes #42" -->

## Why

<!-- What problem does it solve? Why is this the right approach? -->

## How

<!-- Key files changed and the high-level mechanism. -->

## Testing

- [ ] All existing tests pass (`node test/all.js`)
- [ ] Added new tests for the change (if logic was added)
- [ ] All 12 governance gates pass (`node bin/crag.js` commands)
- [ ] Ran `node bin/crag.js diff` — no drift introduced
- [ ] Manually tested on (describe: platform, node version, scenario)

## Screenshots / output

<!-- If the change affects CLI output or generated files, paste before/after. -->

## Checklist

- [ ] Branch is rebased on `master`
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- [ ] Updated CHANGELOG.md under `[Unreleased]`
- [ ] Updated README.md if user-facing behavior changed
- [ ] No new dependencies added to `package.json`
- [ ] Zero-dependency rule preserved

## Related issues

<!-- Fixes #, closes #, references # -->
