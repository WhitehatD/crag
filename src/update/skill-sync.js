'use strict';

const fs = require('fs');
const path = require('path');
const { computeHash, readFrontmatter, isModified } = require('./integrity');
const { compareVersions } = require('./version-check');

const SKILLS = [
  { name: 'pre-start-context', srcFile: 'pre-start-context.md', installDir: 'pre-start-context' },
  { name: 'post-start-validation', srcFile: 'post-start-validation.md', installDir: 'post-start-validation' },
];

/**
 * Verify a source file is a regular file (not a symlink) inside the scaffold-cli package.
 * Protects against symlink attacks where a malicious skill file could be redirected.
 */
function isTrustedSource(srcPath) {
  try {
    const lstat = fs.lstatSync(srcPath);
    if (!lstat.isFile() || lstat.isSymbolicLink()) return false;
    // Must be inside our own src/skills directory
    const expectedRoot = path.resolve(path.join(__dirname, '..', 'skills'));
    const real = fs.realpathSync(srcPath);
    const rel = path.relative(expectedRoot, real);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

/**
 * Sync installed skills with source skills.
 * Options: { force: bool, dryRun: bool }
 * Returns { updated: [], skipped: [], conflicted: [] }
 */
function syncSkills(targetDir, options = {}) {
  const srcDir = path.join(__dirname, '..', 'skills');
  const result = { updated: [], skipped: [], conflicted: [] };
  const dryRun = !!options.dryRun;

  for (const skill of SKILLS) {
    const srcPath = path.join(srcDir, skill.srcFile);
    const installPath = path.join(targetDir, '.claude', 'skills', skill.installDir, 'SKILL.md');
    const workflowPath = path.join(targetDir, '.agents', 'workflows', skill.srcFile);

    // Source skill must exist and be trusted (no symlinks to unexpected locations)
    if (!fs.existsSync(srcPath)) continue;
    if (!isTrustedSource(srcPath)) {
      result.skipped.push({ name: skill.name, version: 'unknown', reason: 'untrusted source (symlink or out-of-tree)' });
      continue;
    }

    const srcMeta = readFrontmatter(srcPath);
    const srcVersion = srcMeta?.version || '0.0.0';

    // If skill not installed yet, install it
    if (!fs.existsSync(installPath)) {
      if (!dryRun) {
        const dir = path.dirname(installPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(srcPath, installPath);

        // Also copy workflow version
        const wfDir = path.dirname(workflowPath);
        if (!fs.existsSync(wfDir)) fs.mkdirSync(wfDir, { recursive: true });
        const content = fs.readFileSync(srcPath, 'utf-8').replace(/^name:.*\n/m, '');
        fs.writeFileSync(workflowPath, content);
      }

      result.updated.push({ name: skill.name, from: 'none', to: srcVersion });
      continue;
    }

    // Compare versions
    const installedMeta = readFrontmatter(installPath);
    const installedVersion = installedMeta?.version || '0.0.0';

    if (compareVersions(srcVersion, installedVersion) <= 0) {
      result.skipped.push({ name: skill.name, version: installedVersion, reason: 'current' });
      continue;
    }

    // Newer version available — check for local modifications
    if (!options.force && isModified(installPath)) {
      result.conflicted.push({
        name: skill.name,
        installed: installedVersion,
        available: srcVersion,
        reason: 'locally modified',
      });
      continue;
    }

    if (!dryRun) {
      // Backup and update
      if (options.force && isModified(installPath)) {
        const backupPath = installPath + '.bak.' + Date.now();
        fs.copyFileSync(installPath, backupPath);
      }

      fs.copyFileSync(srcPath, installPath);

      // Update workflow copy
      const wfDir = path.dirname(workflowPath);
      if (!fs.existsSync(wfDir)) fs.mkdirSync(wfDir, { recursive: true });
      const content = fs.readFileSync(srcPath, 'utf-8').replace(/^name:.*\n/m, '');
      fs.writeFileSync(workflowPath, content);
    }

    result.updated.push({ name: skill.name, from: installedVersion, to: srcVersion });
  }

  return result;
}

module.exports = { syncSkills };
