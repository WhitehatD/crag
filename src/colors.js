'use strict';

/**
 * Shared ANSI color helper — the single choke-point for terminal colors.
 *
 * Colors are disabled when:
 *   - NO_COLOR is set (https://no-color.org), or
 *   - stdout is not a TTY (piped/redirected output, CI logs, --json consumers).
 *
 * Commands import the escape constants from here instead of hardcoding
 * `\x1b[...m` literals, so the gating logic lives in exactly one place.
 * The constants become empty strings when colors are off — call sites keep
 * interpolating them unconditionally and need no branching.
 */

const enabled = !process.env.NO_COLOR && !!(process.stdout && process.stdout.isTTY);

const codes = {
  G: '\x1b[32m',  // green
  R: '\x1b[31m',  // red
  Y: '\x1b[33m',  // yellow
  C: '\x1b[36m',  // cyan
  B: '\x1b[1m',   // bold
  D: '\x1b[2m',   // dim
  GRAY: '\x1b[90m', // bright black / gray
  X: '\x1b[0m',   // reset
};

const off = Object.fromEntries(Object.keys(codes).map(k => [k, '']));

module.exports = {
  colorsEnabled: enabled,
  ...(enabled ? codes : off),
};
