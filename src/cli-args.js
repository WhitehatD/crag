'use strict';

/**
 * Shared argument validator for crag subcommands.
 *
 * Each subcommand declares the flags and options it accepts. The validator
 * rejects unknown flags with exit code 2 (user error). This prevents silent
 * acceptance of typos like `crag analyze --drty-run` which previously
 * ran analyze in non-dry-run mode and wrote governance.md without warning.
 *
 * Usage:
 *   const { validateFlags } = require('./cli-args');
 *   validateFlags('analyze', args, {
 *     boolean: ['--dry-run', '--workspace', '--merge'],
 *     string: [],            // --target foo (takes a value)
 *     positional: [],        // non-flag arguments allowed
 *   });
 *
 * The validator also accepts a few universal flags that every command tolerates:
 *   --help, -h, --json, --no-color, --verbose, --quiet
 */

const { cliError, EXIT_USER } = require('./cli-errors');

// Flags that every subcommand accepts (help, output format toggles).
const UNIVERSAL_FLAGS = new Set([
  '--help', '-h',
  '--no-color',
  '--verbose', '-V',
  '--quiet', '-q',
]);

/**
 * Validate that every `--flag` in `args` is in the command's declared whitelist.
 * Positional arguments (no leading `-`) are allowed by default.
 * Single-dash short options (`-h`, `-v`) are allowed if in the whitelist.
 *
 * @param {string} commandName - for the error message
 * @param {string[]} args - argv slice (without the command name)
 * @param {{ boolean?: string[], string?: string[] }} spec - allowed flags
 * @throws via cliError on unknown flag (exits process)
 */
function validateFlags(commandName, args, spec = {}) {
  const allowedBool = new Set([...(spec.boolean || []), ...UNIVERSAL_FLAGS]);
  const allowedString = new Set(spec.string || []);
  const allAllowed = new Set([...allowedBool, ...allowedString]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) continue; // positional

    // Handle --flag=value form
    const eqIdx = arg.indexOf('=');
    const flag = eqIdx !== -1 ? arg.slice(0, eqIdx) : arg;

    if (allAllowed.has(flag)) {
      // If it's a string-taking flag, consume the next arg as its value
      if (allowedString.has(flag) && eqIdx === -1) i++;
      continue;
    }

    // Unknown flag. Offer a hint if it looks like a typo of a known flag.
    const hint = suggestSimilar(flag, [...allAllowed]);
    const msg = hint
      ? `unknown option: ${flag} for 'crag ${commandName}' (did you mean ${hint}?)`
      : `unknown option: ${flag} for 'crag ${commandName}'`;
    cliError(msg, EXIT_USER);
  }
}

/** Very small Levenshtein-style hint — returns the closest allowed flag if any. */
function suggestSimilar(input, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = editDistance(input, c);
    if (d < bestDist && d <= Math.max(1, Math.floor(c.length / 3))) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function editDistance(a, b) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[la][lb];
}

module.exports = { validateFlags, UNIVERSAL_FLAGS };
