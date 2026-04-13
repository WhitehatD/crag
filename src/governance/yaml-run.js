'use strict';

/**
 * Strip surrounding matching quotes from a YAML scalar value.
 *
 * Only strips when the ENTIRE string is wrapped in matching single or double
 * quotes. Previously we used `replace(/^["']|["']$/g, '')` which stripped a
 * trailing quote even when no leading quote existed — that truncated commands
 * like `make test-X ARGS='--workspace --benches'` to `make test-X ARGS='--workspace --benches`.
 */
function stripYamlQuotes(str) {
  const m = str.match(/^(['"])(.*)\1$/);
  return m ? m[2] : str;
}

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
        if (trimmed && !trimmed.startsWith('#')) {
          // Strip surrounding quotes so `"cargo test"` compares equal to
          // `cargo test`. Consistent with inline and list forms below and
          // with all other CI extractors in src/analyze/ci-extractors.js.
          commands.push(stripYamlQuotes(trimmed));
        }
      }
    } else if (rest && !rest.startsWith('#')) {
      commands.push(stripYamlQuotes(rest));
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
  if (typeof cmd !== 'string' || cmd.length === 0) return false;

  // ---------------------------------------------------------------------
  // Early excludes — NEVER gates, regardless of keyword substring matches.
  //
  // A workflow step like `echo "Install: npm install -g foo"` contains
  // the substring "npm install" even though it's shell plumbing (emitting
  // a string to stdout). The old isGateCommand relied entirely on positive
  // regex matches and so flagged these as gates, which `crag diff` then
  // reported as EXTRA — noisy false positives.
  //
  // This first pass rejects obvious non-gates: variable assignments,
  // echoes, git plumbing, release-specific scripts, and GitHub Actions
  // output-writing. If ANY of these match, the command is definitively
  // not a gate regardless of what it mentions downstream.
  // ---------------------------------------------------------------------
  const excludePatterns = [
    // Shell I/O plumbing
    /^\s*echo(\s|$)/,
    /^\s*printf(\s|$)/,
    // Shell variable assignment: NAME=value or NAME=$(subshell)
    /^\s*[A-Z_][A-Z0-9_]*=/,
    // Git mutations and introspection (deploy/release, not gates)
    /^\s*git\s+(config|push|pull|fetch|add|commit|tag|merge|rebase|reset|checkout|stash|clone|init|remote|log|status)\b/,
    // npm release/distribution verbs — not gates
    /^\s*npm\s+(publish|pack|view|audit|login|logout|adduser|deprecate|owner|team|whoami|access)\b/,
    // Release scripts live under scripts/ and are NOT gates themselves
    /^\s*node\s+scripts\/(bump-version|release|publish|sync-)/,
    /^\s*npm\s+run\s+(release|publish|sync-|prepublish|postpublish|prepare)\b/,
    // GitHub Actions output streams — these are CI plumbing, not gates
    /\$GITHUB_(STEP_SUMMARY|OUTPUT|ENV|PATH)/,
    // Conditional / control flow keywords on their own line
    /^\s*(if|then|else|elif|fi|while|do|done|for|case|esac|break|continue|return)\s*$/,
    /^\s*(if|for|while|case)\s+/,
    // Filesystem setup that is not a gate
    /^\s*(mkdir|rmdir|touch|ln|cp|mv|chmod|chown)\s/,
    // crag's own meta-tooling (governance-guard workflow) — not a project gate
    /\b@whitehatd\/crag\b/,
    /\bcrag\s+(diff|audit|compile|analyze|sync|upgrade|hook|check|doctor|demo|init|workspace|auto|login|team)\b/,
  ];
  for (const rx of excludePatterns) {
    if (rx.test(cmd)) return false;
  }

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

module.exports = { extractRunCommands, isGateCommand, stripYamlQuotes };
