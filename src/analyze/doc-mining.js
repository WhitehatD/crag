'use strict';

/**
 * Documentation-based gate mining.
 *
 * A CONTRIBUTING.md that says "Before submitting a PR, run `make test`
 * and `make lint`" is as authoritative as a CI workflow — maintainers
 * codify their expectations there. We scan these files for shell commands
 * in code fences and in inline backticks that look like gate candidates.
 *
 * Mined gates are returned as ADVISORY — the user should confirm them
 * rather than have them enforced immediately.
 */

const fs = require('fs');
const path = require('path');
const { safeRead } = require('./stacks');

const DOC_FILES = [
  'CONTRIBUTING.md',
  'CONTRIBUTING',
  '.github/CONTRIBUTING.md',
  'docs/CONTRIBUTING.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/pull_request_template.md',
  'DEVELOPING.md',
  'DEVELOPMENT.md',
  'HACKING.md',
];

const GATE_COMMAND_PATTERNS = [
  /^make\s+\w+/,
  /^just\s+\w+/,
  /^task\s+\w+/,
  /^npm\s+(run|test|ci)/,
  /^yarn\s+(test|lint|build|check)/,
  /^pnpm\s+(test|lint|build|check|run)/,
  /^bun\s+(test|run)/,
  /^cargo\s+(test|check|clippy|fmt)/,
  /^go\s+(test|vet|build)/,
  /^pytest/,
  /^python\s+-m\s+pytest/,
  /^tox\s+run/,
  /^uv\s+run/,
  /^poetry\s+run/,
  /^pdm\s+run/,
  /^hatch\s+run/,
  /^nox(\s|$)/,
  /^ruff\s+(check|format)/,
  /^mypy\s/,
  /^black\s/,
  /^bundle\s+exec\s+(rspec|rake|rubocop)/,
  /^composer\s+(test|lint)/,
  /^vendor\/bin\/(phpunit|phpcs|phpstan|pest)/,
  /^mix\s+(test|format|credo)/,
  /^dotnet\s+(test|build|format)/,
  /^swift\s+(test|build)/,
  /^mvn\s+(test|verify)/,
  /^\.\/(mvnw|gradlew)\s/,
  /^gradle\s/,
  /^terraform\s+(fmt|validate)/,
  /^helm\s+lint/,
];

/**
 * Mine gate candidates from contributor documentation.
 * Returns an array of { command, source } where source is the relative path
 * of the file the command was found in. Duplicates are removed.
 *
 * Doc mining is conservative: it only keeps commands that match canonical
 * patterns (test/lint/build/check verbs) and caps the output at
 * `opts.maxCandidates` (default 5) to avoid overwhelming governance with
 * every example snippet.
 */
function mineDocGates(dir, opts = {}) {
  const { maxCandidates = 5 } = opts;
  const candidates = new Map(); // command → source

  for (const relPath of DOC_FILES) {
    const full = path.join(dir, relPath);
    if (!fs.existsSync(full)) continue;
    const content = safeRead(full);
    if (!content) continue;

    // Code fences — multi-line blocks
    const fenceMatches = content.matchAll(/```(?:bash|sh|shell|console)?\n([\s\S]*?)```/g);
    for (const match of fenceMatches) {
      for (const line of match[1].split(/\r?\n/)) {
        const cleaned = cleanCommandLine(line);
        if (cleaned && isGateCandidate(cleaned) && looksCanonical(cleaned) && !candidates.has(cleaned)) {
          candidates.set(cleaned, relPath);
        }
      }
    }

    // Inline backticks — single-line snippets that look like commands
    const inlineMatches = content.matchAll(/`([^`\n]+)`/g);
    for (const match of inlineMatches) {
      const cleaned = cleanCommandLine(match[1]);
      if (cleaned && isGateCandidate(cleaned) && looksCanonical(cleaned) && !candidates.has(cleaned)) {
        candidates.set(cleaned, relPath);
      }
    }
  }

  const list = [...candidates.entries()].map(([command, source]) => ({ command, source }));
  return list.slice(0, maxCandidates);
}

/**
 * A command "looks canonical" if it names a real gate verb (test/lint/build/
 * fmt/format/check/typecheck) without placeholder markers that imply it's a
 * partial example (like `pnpm run test-serve [match]`).
 */
function looksCanonical(cmd) {
  // Reject commands containing placeholder markers
  if (/\[.*?\]/.test(cmd)) return false;
  if (/\{.*?\}/.test(cmd)) return false;
  if (cmd.includes('<') && cmd.includes('>')) return false;
  // Reject extremely long examples (typically worked examples, not gates)
  if (cmd.split(/\s+/).length > 8) return false;
  // Accept any command that contains a gate verb as one of its tokens
  const verbs = /\b(test|tests|spec|lint|build|check|fmt|format|typecheck|type-check|verify|validate|clippy|vet|rspec|rubocop|phpunit|phpstan|analyse|credo|dialyzer|pytest|mypy|ruff|black)\b/;
  return verbs.test(cmd);
}

function cleanCommandLine(line) {
  let cleaned = line.trim();
  // Strip shell prompts like "$ ", "> ", "# "
  cleaned = cleaned.replace(/^[$#>]\s+/, '');
  // Strip trailing comments
  cleaned = cleaned.replace(/\s+#.*$/, '');
  return cleaned;
}

function isGateCandidate(cmd) {
  if (!cmd || cmd.length > 120) return false;
  if (cmd.includes('\n')) return false;
  return GATE_COMMAND_PATTERNS.some(p => p.test(cmd));
}

module.exports = { mineDocGates, isGateCandidate };
