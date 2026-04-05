# Contributing to crag

Thanks for wanting to make crag better. This document is short on purpose — crag is a small tool, and the contribution process should match.

## Quick start

```bash
git clone https://github.com/WhitehatD/crag.git
cd crag
node test/all.js        # all tests should pass (498)
node bin/crag.js help   # verify CLI works
```

No dependencies, no build step, no linter setup. It's just Node.js.

## What changes are welcome

### Highly welcome
- **New compile targets** — adding support for another AI coding tool (Tabnine, JetBrains, Void Editor, Kilo, etc.). See `src/compile/` for existing targets as templates.
- **New workspace types** — adding detection for another monorepo tool. See `src/workspace/detect.js`.
- **Bug fixes** — anything that reduces false positives in `crag diff`, handles new edge cases in workspace detection, or fixes Windows/Unix portability issues.
- **Test coverage** — more tests are always welcome, especially for edge cases.
- **Documentation** — README clarifications, new workflow examples, troubleshooting entries.

### Less welcome (at least for now)
- **New dependencies.** crag is intentionally zero-dependency. Stick to Node.js built-ins.
- **Breaking changes to `governance.md` format.** The v2 annotations are additive; the v1 format must keep working.
- **New runtime requirements.** crag should work on Node 18+ without polyfills.
- **Vendor-specific features** that don't generalize (e.g., "add a flag specific to my company's internal CI").

## How to contribute

1. **Open an issue first** for non-trivial changes. A quick discussion prevents wasted work.
2. **Fork the repo.**
3. **Create a feature branch:** `git checkout -b feat/my-improvement`
4. **Make your change.** Keep the commit focused — one logical change per PR.
5. **Run the gates:** everything in `.claude/governance.md` must pass.
   ```bash
   node bin/crag.js check
   node bin/crag.js diff
   node test/all.js
   ```
6. **Add tests** for any new logic (put them in `test/<module>.test.js`).
7. **Commit with a conventional commit message:** `feat: add X`, `fix: Y`, `docs: Z`, etc.
8. **Open a pull request** against `master`. Explain what and why in the PR description.

## Code style

- **Node.js CommonJS** (`require` / `module.exports`) — not ESM.
- **Zero dependencies** in `package.json`.
- **2-space indentation.**
- **Semicolons.**
- **Single quotes** for strings, backticks for template literals.
- **'use strict';** at the top of every file.
- **Comment why, not what.** If the code isn't self-explanatory, refactor rather than comment.
- **Error handling at boundaries.** Internal modules can assume inputs are valid; public APIs and file I/O must be defensive.

## Testing

All tests live in `test/`. Each file exports nothing — it runs assertions directly and updates `process.exitCode` on failure.

To run just one file:
```bash
node test/parse.test.js
```

To run everything:
```bash
node test/all.js
```

## Architecture pointers

- **`bin/crag.js`** — thin dispatcher, requires `src/cli.js`.
- **`src/cli.js`** — command router + auto-update check.
- **`src/commands/`** — one file per command. Keep commands thin; push logic into `src/governance/`, `src/workspace/`, etc.
- **`src/governance/`** — the v2 parser and gate-to-shell conversion.
- **`src/workspace/`** — workspace detection, member enumeration, hierarchy merge.
- **`src/compile/`** — one file per compile target. Use `atomicWrite()` from `src/compile/atomic-write.js` for all file writes.
- **`src/update/`** — version check, skill sync, integrity (hash/frontmatter).
- **`src/skills/`** — universal skills shipped as markdown. Read at runtime by the AI agent. Any change requires bumping `version:` in the frontmatter and recomputing `source_hash:`.

## Release process (maintainers)

Releases are fully automated. The maintainer workflow is:

```bash
# 1. Make your changes, add to CHANGELOG.md under ## [Unreleased]
# 2. When ready to release, bump the version:
npm run release:patch    # 0.2.1 → 0.2.2 (bug fixes)
npm run release:minor    # 0.2.1 → 0.3.0 (new features)
npm run release:major    # 0.2.1 → 1.0.0 (breaking changes)

# 3. Review the diff (package.json + CHANGELOG.md updated)
git diff

# 4. Commit and push — everything else is automatic:
git add -A
git commit -m "release: v0.2.2"
git push
```

That's it. The `release.yml` workflow will:
1. Run all gates + 498 tests + compile-all smoke test
2. Detect that the version in `package.json` is new
3. Publish to npm with SLSA provenance
4. Create the `v0.2.2` git tag
5. Create a GitHub release with notes extracted from `CHANGELOG.md`
6. Verify the package appears on the registry

If the version hasn't changed, the workflow runs tests and exits without publishing. This means every regular commit still goes through CI but only version-bump commits trigger a release.

**Requirements for the maintainer:**
- `NPM_TOKEN` secret must be set in GitHub repo settings (granular access token with "bypass 2FA" enabled for `@whitehatd/crag`)
- `GITHUB_TOKEN` is provided automatically
- No manual `npm publish` or `gh release create` commands needed

**Troubleshooting:**
- If the workflow fails on the publish step, the package version may already exist. Bump again.
- If the release fails after publish (rare), the npm publish stands — manually create the GitHub release from the CHANGELOG entry.
- To force a re-publish of an existing version (e.g. to fix a corrupt release), use the `workflow_dispatch` trigger with `force_publish=true`. Note: npm does not allow overwriting published versions, so you'll need a version bump anyway.

## Skill hash auto-sync

Whenever `src/skills/*.md` content changes on master, a separate workflow (`sync-hashes.yml`) automatically recomputes the `source_hash` frontmatter and commits the update as the `github-actions` bot with `[skip ci]`. Contributors don't need to manage hashes manually — just edit the skill content and push.

## Security

If you find a security issue, **do not open a public issue**. Email alexc.forbusiness@gmail.com instead.

## License

By contributing, you agree that your contributions will be licensed under the MIT license.
