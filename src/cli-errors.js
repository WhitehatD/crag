'use strict';

/**
 * Exit code convention for crag commands:
 *   0            — success
 *   EXIT_USER=1  — user-recoverable error (missing governance.md, bad flag,
 *                  invalid argument, file not found in expected location,
 *                  gate assertion failure in `check`, drift in `diff`)
 *   EXIT_INTERNAL=2 — internal / environmental error the user likely cannot
 *                     fix by re-running with different input (EACCES on write,
 *                     disk full, unexpected stat failure, bug in crag itself)
 *
 * Scripts can use `if [ $? -eq 1 ]` to distinguish user mistakes from
 * infrastructure problems.
 */
const EXIT_USER = 1;
const EXIT_INTERNAL = 2;

/**
 * Print a formatted error message and exit with the given code.
 * Matches the style of other crag output (two-space indent, red marker).
 */
function cliError(message, exitCode) {
  const code = exitCode === EXIT_INTERNAL ? EXIT_INTERNAL : EXIT_USER;
  console.error(`  \x1b[31m✗\x1b[0m Error: ${message}`);
  process.exit(code);
}

/**
 * Print a warning but do NOT exit. Use for non-fatal conditions.
 */
function cliWarn(message) {
  console.warn(`  \x1b[33m!\x1b[0m Warning: ${message}`);
}

/**
 * Read a file with a clear error message on failure.
 * Throws a structured error that command wrappers can catch and exit with.
 */
function readFileOrExit(fs, filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const what = label || filePath;
    if (err.code === 'ENOENT') {
      cliError(`${what} not found: ${filePath}`, EXIT_USER);
    } else if (err.code === 'EACCES' || err.code === 'EPERM') {
      cliError(`permission denied reading ${what}: ${filePath}`, EXIT_INTERNAL);
    } else {
      cliError(`failed to read ${what}: ${err.message}`, EXIT_INTERNAL);
    }
  }
}

/**
 * Safely get mtime of a file. Returns 0 if the file doesn't exist.
 */
function safeMtime(filePath) {
  try { return require('fs').statSync(filePath).mtimeMs; } catch { return 0; }
}

/**
 * Guard: require .claude/governance.md to exist.
 * Returns the resolved path if it exists; calls cliError (and exits) if not.
 */
function requireGovernance(cwd) {
  const path = require('path');
  const fs = require('fs');
  const govPath = path.join(cwd, '.claude', 'governance.md');
  if (!fs.existsSync(govPath)) {
    cliError('no .claude/governance.md found. Run crag init or crag analyze first.', EXIT_USER);
  }
  return govPath;
}

module.exports = { EXIT_USER, EXIT_INTERNAL, cliError, cliWarn, readFileOrExit, safeMtime, requireGovernance };
