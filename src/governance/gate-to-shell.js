'use strict';

/**
 * Escape a string for safe inclusion inside double quotes in a shell command.
 * Escapes: backslash, backtick, dollar sign, double quote.
 */
function shellEscapeDoubleQuoted(s) {
  return String(s).replace(/[\\`"$]/g, '\\$&');
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

module.exports = { gateToShell, shellEscapeDoubleQuoted };
