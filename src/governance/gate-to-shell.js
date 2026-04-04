'use strict';

/**
 * Escape a string for safe inclusion inside double quotes in a shell command.
 * Escapes: backslash, backtick, dollar sign, double quote.
 * Backslash MUST be replaced first so its replacement isn't re-escaped.
 */
function shellEscapeDoubleQuoted(s) {
  return String(s).replace(/[\\`"$]/g, '\\$&');
}

/**
 * Escape a string for safe inclusion inside single quotes in a shell command.
 * Single quotes cannot be escaped inside single quotes — the standard pattern
 * is to close the quote, emit an escaped quote, and reopen: 'foo'\''bar'.
 */
function shellEscapeSingleQuoted(s) {
  return String(s).replace(/'/g, "'\\''");
}

/**
 * Convert human-readable gate descriptions to shell commands.
 * e.g. Verify src/skills/pre-start-context.md contains "discovers any project"
 *   → grep -qi "discovers any project" "src/skills/pre-start-context.md"
 *
 * All interpolated values are shell-escaped to prevent command injection.
 */
function gateToShell(cmd) {
  const verify = cmd.match(/^Verify\s+(\S+)\s+contains\s+["']([^"']+)["']$/i);
  if (verify) {
    const needle = shellEscapeDoubleQuoted(verify[2]);
    const file = shellEscapeDoubleQuoted(verify[1]);
    return `grep -qi "${needle}" "${file}"`;
  }
  return cmd;
}

module.exports = { gateToShell, shellEscapeDoubleQuoted, shellEscapeSingleQuoted };
