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
    // Node ecosystem
    /\bnpm (run |ci|test|install)/,
    /\bnpx /,
    /\bnode /,
    /\byarn (test|lint|build|check)/,
    /\bpnpm (run |test|lint|build|check|install|i\b)/,
    /\bbun (test|run)/,
    /\bdeno (test|lint|fmt|check)/,
    // Rust
    /\bcargo (test|build|check|clippy|fmt)/,
    /\brustfmt/,
    // Go
    /\bgo (test|build|vet)/,
    /\bgolangci-lint/,
    // Python — direct + modern runner wrappers
    /\bpytest/,
    /\bpython -m/,
    /\bruff/,
    /\bmypy/,
    /\bflake8/,
    /\bblack\b/,
    /\bisort\b/,
    /\bpylint\b/,
    /\btox\s+(run|r)/,
    /\buv run /,
    /\bpoetry run /,
    /\bpdm run /,
    /\bhatch run /,
    /\brye run /,
    /\bnox\b/,
    // JVM
    /\bgradle/,
    /\bmvn /,
    /\bmaven/,
    /\.\/gradlew/,
    /\.\/mvnw/,
    // Ruby
    /\bbundle exec /,
    /\brake\b/,
    /\brspec\b/,
    /\brubocop/,
    // PHP
    /\bcomposer (test|lint|run|validate)/,
    /\bvendor\/bin\/(phpunit|phpcs|phpstan|psalm|pest|php-cs-fixer|rector)/,
    // .NET
    /\bdotnet (test|build|format)/,
    // Swift
    /\bswift (test|build)/,
    /\bswiftlint/,
    // Elixir
    /\bmix (test|format|credo|dialyzer)/,
    // Node linters
    /\beslint/,
    /\bbiome/,
    /\bprettier/,
    /\btsc/,
    /\bxo\b/,
    // Task runners
    /\bmake /,
    /\bjust /,
    /\btask /,
    // Containers / infra
    /\bdocker (build|compose)/,
    /\bterraform (fmt|validate|plan)/,
    /\btflint/,
    /\bhelm (lint|template)/,
    /\bkubeconform/,
    /\bkubeval/,
    /\bhadolint/,
    /\bactionlint/,
    /\bmarkdownlint/,
    /\byamllint/,
    /\bbuf (lint|build)/,
    /\bspectral lint/,
    /\bshellcheck/,
    /\bsemgrep/,
    /\btrivy/,
    /\bgitleaks/,
  ];
  return patterns.some((p) => p.test(cmd));
}

module.exports = { extractRunCommands, isGateCommand };
