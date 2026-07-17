'use strict';

/**
 * layer-paths.js — where the four composed-governance source files live.
 *
 * Two layers (docs/closed-loop.md REV 3 "hierarchy flattened to TWO
 * layers"), each with a manual (.src) and machine (.gen) file:
 *
 *   user layer     ~/.crag/governance.src.md   (manual, human-edited)
 *                  ~/.crag/governance.gen.md   (machine, `crag distill`)
 *   project layer  <repo>/.crag/governance.src.md
 *                  <repo>/.crag/governance.gen.md
 *
 * `~/.crag/` already exists as crag's user-level state directory (see
 * src/cloud/config.js's CREDENTIALS_DIR) — this reuses the same directory,
 * not a new one. Pure path/fs logic only: no MCP, no network. Both
 * src/compile/compose.js (pure, reads only) and src/distill/index.js
 * (writes, after an opt-in MCP fetch) import this single source of truth
 * so the two never disagree about where a file lives.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveHome() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir() || os.tmpdir();
}

function userCragDir() {
  return path.join(resolveHome(), '.crag');
}

function projectCragDir(cwd) {
  return path.join(cwd, '.crag');
}

/**
 * All four split-source paths for a given project cwd.
 */
function layerPaths(cwd) {
  return {
    userSrc: path.join(userCragDir(), 'governance.src.md'),
    userGen: path.join(userCragDir(), 'governance.gen.md'),
    projectSrc: path.join(projectCragDir(cwd), 'governance.src.md'),
    projectGen: path.join(projectCragDir(cwd), 'governance.gen.md'),
  };
}

/**
 * Path to the pure composed artifact this repo compiles from.
 */
function artifactPath(cwd) {
  return path.join(cwd, '.claude', 'governance.md');
}

/**
 * Composition activation gate — deliberately keyed on PROJECT-level opt-in
 * only (`<repo>/.crag/governance.src.md` or `.gen.md`), NOT the user layer.
 *
 * Why not the user layer too: a user who sets up ~/.crag/governance.src.md
 * would otherwise silently activate composition — and overwrite the
 * hand-maintained .claude/governance.md — in EVERY legacy repo they touch
 * that never opted into the split model. That is exactly the destructive
 * surprise backward-compat must prevent. A repo opts in explicitly by
 * adding a project-level .crag source (the migration step:
 * governance.md -> .crag/governance.src.md, or a first `crag distill`
 * which writes .crag/governance.gen.md). Once opted in, the user-layer
 * files ARE composed in (see composeGovernance, which reads all four).
 *
 * When this returns false, `crag compile` behaves byte-for-byte as it did
 * before the composed model existed.
 */
function hasSplitSources(cwd) {
  const p = layerPaths(cwd);
  return fs.existsSync(p.projectSrc) || fs.existsSync(p.projectGen);
}

module.exports = { resolveHome, userCragDir, projectCragDir, layerPaths, artifactPath, hasSplitSources };
