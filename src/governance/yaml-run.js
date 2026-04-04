'use strict';

/**
 * Shared YAML `run:` command extraction for GitHub Actions workflows.
 *
 * Both `crag analyze` and `crag diff` need to enumerate the shell commands
 * inside CI workflows to either generate gates from them or compare them
 * against governance. This module is the single source of truth so a fix to
 * the parser benefits both commands.
 *
 * Handles:
 *   run: npm test                    (inline)
 *   run: "npm test"                  (inline, quoted)
 *   run: |                           (literal block scalar)
 *     npm test
 *     npm run build
 *   run: >-                          (folded block scalar)
 *     npm test
 *
 * Comment-only lines and blank lines inside blocks are skipped.
 */
function extractRunCommands(content) {
  const commands = [];
  const lines = String(content).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)-?\s*run:\s*(.*)$/);
    if (!m) continue;

    const baseIndent = m[1].length;
    const rest = m[2].trim();

    if (/^[|>][+-]?\s*$/.test(rest)) {
      // Block scalar: collect following lines with greater indent than the key
      for (let j = i + 1; j < lines.length; j++) {
        const ln = lines[j];
        if (ln.trim() === '') continue;
        const indentMatch = ln.match(/^(\s*)/);
        if (indentMatch[1].length <= baseIndent) break;
        const trimmed = ln.trim();
        if (trimmed && !trimmed.startsWith('#')) commands.push(trimmed);
      }
    } else if (rest && !rest.startsWith('#')) {
      // Inline: strip surrounding single/double quotes if present
      commands.push(rest.replace(/^["']|["']$/g, ''));
    }
  }

  return commands;
}

/**
 * Classify a shell command as a "gate" — i.e., a quality check that belongs
 * in governance.md (test, lint, typecheck, build, etc.) as opposed to
 * deployment, git operations, or environment setup.
 *
 * This is a heuristic and intentionally conservative: false positives
 * (extra gates) are easier to spot than false negatives (missing gates).
 */
function isGateCommand(cmd) {
  const patterns = [
    /\bnpm (run |ci|test|install)/,
    /\bnpx /,
    /\bnode /,
    /\bcargo (test|build|check|clippy)/,
    /\brustfmt/,
    /\bgo (test|build|vet)/,
    /\bgolangci-lint/,
    /\bpytest/,
    /\bpython -m/,
    /\bruff/,
    /\bmypy/,
    /\bflake8/,
    /\bgradle/,
    /\bmvn /,
    /\bmaven/,
    /\beslint/,
    /\bbiome/,
    /\bprettier/,
    /\btsc/,
    /\bdocker (build|compose)/,
    /\bmake /,
    /\bjust /,
  ];
  return patterns.some((p) => p.test(cmd));
}

module.exports = { extractRunCommands, isGateCommand };
