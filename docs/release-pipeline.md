# Release pipeline

Every push to `master` runs the CI matrix (Ubuntu / macOS / Windows ×
Node 18 / 20 / 22). On green, the patch version auto-bumps and
publishes to npm with SLSA provenance attestation. Tags and GitHub
releases are created from `CHANGELOG.md` automatically.

## Workflow

```
push to master
   │
   ├─► Test workflow (.github/workflows/test.yml)
   │     ├── Syntax check every source file
   │     ├── crag help / version / check / analyze --dry-run
   │     ├── crag upgrade --check / workspace --json / doctor --ci
   │     ├── crag demo --json (determinism SHA verification)
   │     ├── node test/all.js (539 tests)
   │     └── crag compile --target all (artifact smoke test)
   │
   └─► Release workflow (.github/workflows/release.yml)
         ├── Detect if package.json version is new
         ├── If new: npm publish with --provenance
         ├── git tag + GitHub release from CHANGELOG.md
         └── Verify package appears on registry
```

## Skipping a release

To skip the release pipeline on a specific push, add
`crag:skip-release` on its own line in the commit body. The Test
workflow still runs, but Release is not triggered.

## Determinism enforcement

The `crag demo` step in the Test workflow runs on every matrix slot
(Ubuntu + macOS + Windows × Node 18/20/22 = 9 runners per push) and
SHA-verifies that two back-to-back `crag analyze --dry-run` invocations
produce byte-identical output. If any runner diverges, the release is
blocked. This is the contract behind the "Deterministic — SHA-verified"
badge.

## Contributor flow

For maintainers cutting a release manually:

```bash
# 1. Make your changes, add to CHANGELOG.md under ## [Unreleased]
# 2. Bump the version:
npm run release:patch    # 0.2.1 → 0.2.2 (bug fixes)
npm run release:minor    # 0.2.1 → 0.3.0 (new features)
npm run release:major    # 0.2.1 → 1.0.0 (breaking changes)

# 3. Commit and push — everything else is automatic:
git add -A
git commit -m "release: v0.2.2"
git push
```
