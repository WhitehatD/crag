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
 * True if ANY of the four split-source files exist. Backward-compat
 * switch: when false, `crag compile` must behave exactly as it did before
 * the composed model existed (read .claude/governance.md directly, no
 * compose step).
 */
function hasSplitSources(cwd) {
  const p = layerPaths(cwd);
  return Object.values(p).some((f) => fs.existsSync(f));
}

module.exports = { resolveHome, userCragDir, projectCragDir, layerPaths, artifactPath, hasSplitSources };
