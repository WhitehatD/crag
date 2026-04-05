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
//   2. Bumps the `version:` frontmatter field of every src/skills/*.md
//      so installed skills no longer lag behind the CLI on `crag upgrade`
//   3. Updates CHANGELOG.md: converts [Unreleased] → [X.Y.Z] — YYYY-MM-DD
//      and inserts a new empty [Unreleased] section above
//   4. Prints next steps (commit + push)
//
// It does NOT commit or push. You review the diff, then commit yourself.
// The release.yml workflow handles everything else automatically on push.
//
// NOTE: skill source_hash fields are recomputed by scripts/sync-skill-hashes.js,
// which runs automatically in CI on any src/skills/ change. Run it locally
// (`npm run sync-hashes`) if you want the hash refreshed in the same commit
// as the version bump.

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

/**
 * Update the `version:` frontmatter field of every *.md file in `skillsDir`
 * to `newVersion`. Returns the list of files that were rewritten.
 *
 * Without this, `crag upgrade` reports skill versions that are stuck at
 * whatever value someone last set manually (e.g. 0.2.2 while the CLI ships
 * 0.2.7), so installed copies never appear to need updating on release
 * even when the skill body has changed. Keeping skill versions in lockstep
 * with the package version is the simplest contract.
 *
 * `skillsDir` defaults to `src/skills/` inside the crag repo; tests pass
 * a tmpdir fixture instead.
 */
function bumpSkillVersions(newVersion, skillsDir) {
  const dir = skillsDir || path.join(__dirname, '..', 'src', 'skills');
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const changed = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Only touch the frontmatter block (between the first pair of `---`
    // lines). Replacing site-wide would clobber any legitimate prose
    // mention of `version: X.Y.Z` in the skill body.
    const fmMatch = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/);
    if (!fmMatch) continue;

    const [full, openDelim, fmBody, closeDelim] = fmMatch;
    const versionLineRe = /^version:\s*[^\r\n]+$/m;
    if (!versionLineRe.test(fmBody)) continue;

    const newFmBody = fmBody.replace(versionLineRe, `version: ${newVersion}`);
    if (newFmBody === fmBody) continue;

    const updated = raw.replace(full, `${openDelim}${newFmBody}${closeDelim}`);
    fs.writeFileSync(filePath, updated);
    changed.push(file);
  }

  return changed;
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

  const skillChanges = bumpSkillVersions(newVersion);
  if (skillChanges.length > 0) {
    console.log(`  ✓ ${skillChanges.length} skill${skillChanges.length === 1 ? '' : 's'} bumped: ${skillChanges.join(', ')}`);
  } else {
    console.log('  ○ no skill frontmatter needed updating');
  }

  const clUpdated = bumpChangelog(newVersion);
  if (clUpdated) console.log('  ✓ CHANGELOG.md updated');

  console.log('');
  console.log('  Next steps:');
  console.log(`    1. Refresh skill hashes: npm run sync-hashes`);
  console.log(`    2. Review the diff:      git diff`);
  console.log(`    3. Commit:               git add -A && git commit -m "release: v${newVersion}"`);
  console.log(`    4. Push:                 git push`);
  console.log('');
  console.log('  The release.yml workflow will auto-publish to npm, create the tag,');
  console.log('  and create the GitHub release. No manual npm publish needed.\n');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`  error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { bumpSemver, bumpPackageJson, bumpSkillVersions, bumpChangelog };
