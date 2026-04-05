'use strict';

/**
 * Task-runner target mining.
 *
 * Many projects use Make/Taskfile/just as the canonical entry points to
 * their test, lint, and build commands. The existing analyze emitted
 * "Makefile detected" which is useless — it doesn't tell the governance
 * compiler what to actually run.
 *
 * This module reads the task file and extracts target names that match
 * well-known patterns (test, lint, build, check, ci, fmt, format, etc.)
 * so those can be emitted as real gates.
 */

const fs = require('fs');
const path = require('path');
const { safeRead } = require('./stacks');

// Target names that consistently mean "run quality gates" across ecosystems.
// `style` was previously here but is ambiguous (often a CSS/JS build artifact
// target rather than a linter). Kernel-style projects use `kselftest`,
// `selftest`, `sanity` — added so e.g. linux and cpython get real gates.
const GATE_TARGET_NAMES = new Set([
  // Tests
  'test', 'tests', 'spec', 'specs', 'check', 'checks', 'ci',
  'unit', 'unittest', 'unit-test', 'unit_test',
  'integration', 'integration-test', 'integration_test', 'itest',
  'e2e', 'e2e-test', 'e2e_test',
  'kselftest', 'selftest', 'sanity', 'smoke', 'regress', 'regression',
  // Lint / format
  'lint', 'lints', 'format', 'format-check', 'fmt', 'fmt-check',
  'format-fix', 'formatting', 'linting',
  // Build / compile
  'build', 'compile', 'compile-check',
  // Type checking
  'typecheck', 'type-check', 'type_check', 'types', 'tc',
  // Verification / audit
  'verify', 'validate', 'audit',
  // Security smoke
  'security', 'sec', 'sast',
]);

function mineTaskTargets(dir) {
  const result = { make: [], task: [], just: [] };

  const makefile = path.join(dir, 'Makefile');
  if (fs.existsSync(makefile)) {
    result.make = extractMakeTargets(safeRead(makefile));
  }

  for (const taskFile of ['Taskfile.yml', 'Taskfile.yaml']) {
    const full = path.join(dir, taskFile);
    if (fs.existsSync(full)) {
      result.task = extractTaskfileTargets(safeRead(full));
      break;
    }
  }

  const justfile = path.join(dir, 'justfile');
  if (fs.existsSync(justfile)) {
    result.just = extractJustfileTargets(safeRead(justfile));
  }

  return result;
}

/**
 * Extract target names from a Makefile. Looks for:
 *   - .PHONY lines listing targets
 *   - Lines matching `name: deps` at column 0 (not prefixed by tabs)
 */
function extractMakeTargets(content) {
  const targets = new Set();

  // .PHONY lines
  for (const match of content.matchAll(/^\.PHONY\s*:\s*(.+)$/gm)) {
    for (const name of match[1].split(/\s+/)) {
      const clean = name.trim();
      if (clean && !clean.includes('=') && GATE_TARGET_NAMES.has(clean)) {
        targets.add(clean);
      }
    }
  }

  // Target definitions at column 0
  for (const line of content.split(/\r?\n/)) {
    // Skip comments and lines with leading whitespace (recipe bodies)
    if (line.startsWith('#') || line.startsWith('\t') || line.startsWith(' ')) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:(?!\s*=)/);
    if (match && GATE_TARGET_NAMES.has(match[1])) {
      targets.add(match[1]);
    }
  }

  return [...targets];
}

/**
 * Extract task names from Taskfile.yml. Looks for:
 *   tasks:
 *     test:
 *       cmds: [...]
 *     lint:
 *       ...
 */
function extractTaskfileTargets(content) {
  const targets = new Set();
  const lines = content.split(/\r?\n/);
  let inTasks = false;
  let tasksIndent = -1;

  for (const line of lines) {
    if (/^tasks\s*:/.test(line)) {
      inTasks = true;
      tasksIndent = (line.match(/^(\s*)/) || ['', ''])[1].length;
      continue;
    }
    if (!inTasks) continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch[1].length;

    // Leaving the tasks block (back to root-level key)
    if (line.trim() !== '' && indent <= tasksIndent) {
      inTasks = false;
      continue;
    }

    // Task name: direct children of tasks
    const taskMatch = line.match(/^\s+([A-Za-z0-9_:-]+)\s*:\s*(?:#.*)?$/);
    if (taskMatch && indent === tasksIndent + 2) {
      const name = taskMatch[1];
      if (GATE_TARGET_NAMES.has(name)) targets.add(name);
    }
  }

  return [...targets];
}

/**
 * Extract recipe names from a justfile. Recipes look like:
 *   test:
 *     cargo test
 *   lint:
 *     cargo clippy
 */
function extractJustfileTargets(content) {
  const targets = new Set();

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('#') || line.startsWith(' ') || line.startsWith('\t')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)(?:\s+[A-Za-z0-9_-]+)*\s*:(?!\s*=)/);
    if (match && GATE_TARGET_NAMES.has(match[1])) {
      targets.add(match[1]);
    }
  }

  return [...targets];
}

module.exports = { mineTaskTargets, extractMakeTargets, extractTaskfileTargets, extractJustfileTargets };
