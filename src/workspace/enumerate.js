'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resolve workspace members from detected workspace.
 * Expands glob patterns to actual directories and enriches with metadata.
 */
function enumerateMembers(workspace) {
  const members = [];

  switch (workspace.type) {
    case 'pnpm':
      members.push(...resolvePnpmMembers(workspace));
      break;
    case 'npm':
    case 'yarn':
    case 'turbo':
      members.push(...resolveGlobMembers(workspace));
      break;
    case 'cargo':
    case 'go':
      members.push(...resolveGlobMembers(workspace));
      break;
    case 'gradle':
    case 'maven':
      members.push(...resolveExplicitMembers(workspace));
      break;
    case 'nx':
      members.push(...resolveNxMembers(workspace));
      break;
    case 'bazel':
      members.push(...resolveBazelMembers(workspace));
      break;
    case 'git-submodules':
      members.push(...resolveSubmodules(workspace));
      break;
    case 'independent-repos':
      members.push(...resolveNestedRepos(workspace));
      break;
    default:
      break;
  }

  // Enrich each member with metadata
  return members.map(m => enrichMember(workspace.root, m));
}

/**
 * Resolve pnpm workspace members from pnpm-workspace.yaml.
 */
function resolvePnpmMembers(workspace) {
  try {
    const content = fs.readFileSync(path.join(workspace.root, 'pnpm-workspace.yaml'), 'utf-8');
    const patterns = [];
    let inPackages = false;

    for (const line of content.split('\n')) {
      if (/^packages:/.test(line)) { inPackages = true; continue; }
      if (inPackages && /^\s+-\s+/.test(line)) {
        const pattern = line.replace(/^\s+-\s+/, '').replace(/['"]/g, '').trim();
        if (pattern) patterns.push(pattern);
      } else if (inPackages && /^\S/.test(line)) {
        inPackages = false;
      }
    }

    return expandGlobs(workspace.root, patterns);
  } catch {
    return [];
  }
}

/**
 * Resolve members from workspace patterns (npm, yarn, cargo, go).
 */
function resolveGlobMembers(workspace) {
  const patterns = workspace.patterns || [];
  return expandGlobs(workspace.root, patterns);
}

/**
 * Resolve explicitly listed members (gradle, maven).
 */
function resolveExplicitMembers(workspace) {
  const patterns = workspace.patterns || [];
  return patterns
    .map(p => {
      const fullPath = path.join(workspace.root, p);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        return { name: path.basename(p), path: fullPath };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Resolve Nx workspace members.
 */
function resolveNxMembers(workspace) {
  // Nx uses project.json or package.json in subdirectories
  // Try common patterns: apps/*, packages/*, libs/*
  return expandGlobs(workspace.root, ['apps/*', 'packages/*', 'libs/*']);
}

/**
 * Resolve Bazel workspace members by finding BUILD files.
 */
function resolveBazelMembers(workspace) {
  const members = [];
  try {
    const entries = fs.readdirSync(workspace.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dir = path.join(workspace.root, entry.name);
      if (fs.existsSync(path.join(dir, 'BUILD')) || fs.existsSync(path.join(dir, 'BUILD.bazel'))) {
        members.push({ name: entry.name, path: dir });
      }
    }
  } catch { /* skip */ }
  return members;
}

/**
 * Resolve git submodule members.
 */
function resolveSubmodules(workspace) {
  return (workspace.submodules || []).map(sm => ({
    name: sm.name,
    path: path.join(workspace.root, sm.path),
  }));
}

/**
 * Resolve independent nested repo members.
 */
function resolveNestedRepos(workspace) {
  return (workspace.nestedRepos || []).map(nr => ({
    name: nr.name,
    path: nr.path,
  }));
}

/**
 * Check that candidate path is contained within root.
 * Uses real-path resolution to defeat symlink escape attacks.
 */
function isWithinRoot(root, candidate) {
  try {
    const realRoot = fs.realpathSync(root);
    const realCandidate = fs.realpathSync(candidate);
    const rel = path.relative(realRoot, realCandidate);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    // If realpath fails (e.g., broken symlink), reject
    return false;
  }
}

/**
 * Build a set of negation patterns for filtering.
 */
function buildNegations(patterns) {
  const negs = [];
  for (const p of patterns) {
    if (p.startsWith('!')) {
      // Strip leading ! and trailing /*, /**
      const cleaned = p.slice(1).replace(/\/?\*\*?$/, '');
      if (cleaned) negs.push(cleaned);
    }
  }
  return negs;
}

/**
 * Expand simple glob patterns (dir/*, dir/**) to actual directories.
 * Only supports single-level wildcards (good enough for workspace configs).
 * Validates all resolved paths stay within the workspace root (no traversal via
 * .. or symlink escape).
 */
function expandGlobs(root, patterns) {
  const members = [];
  const seen = new Set();
  const negations = buildNegations(patterns).map(n => n.replace(/\\/g, '/'));

  // Normalize relative paths to forward slashes so comparisons work on Windows
  const normalize = (p) => p.replace(/\\/g, '/');
  const isNegated = (relPath) => {
    const norm = normalize(relPath);
    return negations.some(neg => norm === neg || norm.startsWith(neg + '/'));
  };

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) continue; // handled above
    // Reject patterns containing parent traversal
    if (pattern.includes('..')) continue;

    // Simple wildcard expansion: "packages/*" → list dirs in packages/
    const cleaned = pattern.replace(/\/?\*\*?$/, '');
    const searchDir = path.join(root, cleaned || '.');

    if (!fs.existsSync(searchDir)) continue;
    if (!isWithinRoot(root, searchDir)) continue;

    try {
      if (cleaned && !pattern.includes('*')) {
        // Exact path, not a glob
        if (fs.statSync(searchDir).isDirectory() && !seen.has(searchDir)) {
          const rel = path.relative(root, searchDir);
          if (!isNegated(rel)) {
            seen.add(searchDir);
            members.push({ name: path.basename(cleaned), path: searchDir });
          }
        }
        continue;
      }

      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(searchDir, entry.name);
        if (!isWithinRoot(root, fullPath)) continue;
        const rel = path.relative(root, fullPath);
        if (isNegated(rel)) continue;
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          members.push({ name: entry.name, path: fullPath });
        }
      }
    } catch { /* permission error — skip */ }
  }

  return members;
}

/**
 * Enrich a member with metadata about its stack and governance.
 */
function enrichMember(workspaceRoot, member) {
  const memberPath = member.path;
  return {
    name: member.name,
    path: memberPath,
    relativePath: path.relative(workspaceRoot, memberPath),
    hasGovernance: fs.existsSync(path.join(memberPath, '.claude', 'governance.md')),
    hasClaude: fs.existsSync(path.join(memberPath, '.claude')),
    hasGit: fs.existsSync(path.join(memberPath, '.git')),
    stack: detectMemberStack(memberPath),
  };
}

/**
 * Quick stack detection for a member directory.
 */
function detectMemberStack(dir) {
  const stack = [];
  if (fs.existsSync(path.join(dir, 'package.json'))) stack.push('node');
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) stack.push('rust');
  if (fs.existsSync(path.join(dir, 'go.mod'))) stack.push('go');
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'setup.py'))) stack.push('python');
  if (fs.existsSync(path.join(dir, 'build.gradle.kts')) || fs.existsSync(path.join(dir, 'build.gradle'))) stack.push('java');
  if (fs.existsSync(path.join(dir, 'pom.xml'))) stack.push('java');
  if (fs.existsSync(path.join(dir, 'Dockerfile'))) stack.push('docker');
  return stack;
}

module.exports = { enumerateMembers, expandGlobs, enrichMember };
