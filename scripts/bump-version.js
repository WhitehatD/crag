#!/usr/bin/env node
'use strict';

// Single-command version bump.
// Usage:
//   node scripts/bump-version.js patch   # 0.2.1 → 0.2.2
//   node scripts/bump-version.js minor   # 0.2.1 → 0.3.0
//   node scripts/bump-version.js major   # 0.2.1 → 1.0.0
//   node scripts/bump-version.js 1.2.3   # explicit version
//
// What it does:
//   1. Bumps package.json version
//   2. Updates CHANGELOG.md: converts [Unreleased] → [X.Y.Z] — YYYY-MM-DD
//      and inserts a new empty [Unreleased] section above
//   3. Prints next steps (commit + push)
//
// It does NOT commit or push. You review the diff, then commit yourself.
// The release.yml workflow handles everything else automatically on push.

const fs = require('fs');
const path = require('path');

const VALID_BUMPS = new Set(['patch', 'minor', 'major']);
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/;

function bumpSemver(current, kind) {
  const m = current.match(SEMVER_RE);
  if (!m) throw new Error(`invalid current version: ${current}`);
  let [, major, minor, patch] = m;
  major = Number(major);
  minor = Number(minor);
  patch = Number(patch);

  switch (kind) {
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'major': return `${major + 1}.0.0`;
    default: throw new Error(`unknown bump kind: ${kind}`);
  }
}

function validateSemver(v) {
  if (!SEMVER_RE.test(v)) {
    throw new Error(`not a valid semver: ${v}`);
  }
}

function bumpPackageJson(newVersion) {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  // Preserve formatting by doing a surgical replace on the version line
  const updated = raw.replace(
    /"version":\s*"[^"]+"/,
    `"version": "${newVersion}"`
  );
  if (updated === raw) {
    throw new Error('could not find version field in package.json');
  }
  fs.writeFileSync(pkgPath, updated);
}

function bumpChangelog(newVersion) {
  const clPath = path.join(__dirname, '..', 'CHANGELOG.md');
  if (!fs.existsSync(clPath)) {
    console.warn('  warning: no CHANGELOG.md found — skipping');
    return false;
  }

  const raw = fs.readFileSync(clPath, 'utf-8');
  // Use local date (not UTC) so the entry matches the maintainer's wall-clock day
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Find the [Unreleased] section and convert it to the new version.
  // Insert a trailing blank line so the new section is separated from the next one.
  const unreleasedRe = /^## \[Unreleased\]\s*$/m;
  if (!unreleasedRe.test(raw)) {
    console.warn('  warning: no "## [Unreleased]" section in CHANGELOG.md');
    console.warn('  add a "## [Unreleased]" section above the latest version and re-run');
    return false;
  }

  const replacement = `## [Unreleased]\n\n## [${newVersion}] — ${today}\n`;
  const updated = raw.replace(unreleasedRe, replacement);

  // Also update the compare links at the bottom (if present)
  // Format: [Unreleased]: https://github.com/.../compare/vX.Y.Z...HEAD
  const compareRe = /^\[Unreleased\]:\s*https:\/\/github\.com\/([^/]+\/[^/]+)\/compare\/(v[\d.]+)\.\.\.HEAD\s*$/m;
  let final = updated;
  const compareMatch = updated.match(compareRe);
  if (compareMatch) {
    const [, repo, prevTag] = compareMatch;
    final = updated.replace(
      compareRe,
      `[Unreleased]: https://github.com/${repo}/compare/v${newVersion}...HEAD\n[${newVersion}]: https://github.com/${repo}/compare/${prevTag}...v${newVersion}`
    );
  }

  fs.writeFileSync(clPath, final);
  return true;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node scripts/bump-version.js <patch|minor|major|X.Y.Z>');
    process.exit(2);
  }

  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const currentVersion = pkg.version;

  let newVersion;
  if (VALID_BUMPS.has(arg)) {
    newVersion = bumpSemver(currentVersion, arg);
  } else {
    validateSemver(arg);
    newVersion = arg;
  }

  console.log(`\n  crag version bump: ${currentVersion} → ${newVersion}\n`);

  bumpPackageJson(newVersion);
  console.log('  ✓ package.json updated');

  const clUpdated = bumpChangelog(newVersion);
  if (clUpdated) console.log('  ✓ CHANGELOG.md updated');

  console.log('');
  console.log('  Next steps:');
  console.log(`    1. Review the diff: git diff`);
  console.log(`    2. Commit:          git add -A && git commit -m "release: v${newVersion}"`);
  console.log(`    3. Push:            git push`);
  console.log('');
  console.log('  The release.yml workflow will auto-publish to npm, create the tag,');
  console.log('  and create the GitHub release. No manual npm publish needed.\n');
}

try {
  main();
} catch (err) {
  console.error(`  error: ${err.message}`);
  process.exit(1);
}
