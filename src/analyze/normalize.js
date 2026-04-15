'use strict';

/**
 * CI step normalization.
 *
 * The benchmark showed crag analyze producing 40-step dumps for fastify and
 * axios. Most of those steps are either:
 *   - Matrix expansions of the same command
 *   - Background processes (servers started with &)
 *   - Shell noise (echo, export, set-output, GITHUB_CONTEXT dumps)
 *   - `npm install --no-save ../artifacts/x-*.tgz` style throwaway setup
 *   - Repeated `npm install --ignore-scripts` across jobs
 *
 * This module turns a raw list of extracted CI commands into a short,
 * unique list of actual gates. It runs AFTER extraction and BEFORE
 * governance generation.
 */

/** Canonicalize `${{ matrix.X }}` and similar expressions to a single form. */
function canonicalize(cmd) {
  return cmd
    .replace(/\$\{\{\s*matrix\.[A-Za-z0-9_-]+\s*\}\}/g, '<matrix>')
    .replace(/\$\{\{\s*env\.[A-Za-z0-9_-]+\s*\}\}/g, '<env>')
    .replace(/\$\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g, '<expr>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A command is "noise" if it's setup, plumbing, or side-effecting rather than a gate. */
function isNoise(cmd) {
  const trimmed = cmd.trim();
  if (!trimmed) return true;

  // Background processes are not gates (they're servers/daemons for tests)
  if (trimmed.endsWith('&') && !trimmed.endsWith('&&')) return true;

  // Line-continuation leak: a "command" that ends in a trailing backslash
  // means the extractor captured half of a multi-line shell line from a
  // `run: |` block. Example from duckdb: `make \`. These are never complete
  // gates — the real command continues on the next line, which the
  // line-based extractor also captures as a separate entry.
  if (/\\\s*$/.test(trimmed)) return true;
  // Bare backslash (line-continuation remnant on its own)
  if (/^\\+$/.test(trimmed)) return true;

  // Subshell / compound command fragments — leaked from shell compounds.
  // `)` = tail of `(cmd; cmd)` subshell. `}` = tail of `{ cmd; cmd; }` group.
  // `{` = head of a group command. `{ [` = test inside a group command.
  if (/^[)}\{]$/.test(trimmed)) return true;
  if (/^\)/.test(trimmed)) return true;
  // Group command fragments: `{ [ ... ] || (echo ...` — the naive split on
  // && and ; breaks compound commands containing `{ cmd || cmd; }`.
  if (/^\{\s*\[/.test(trimmed)) return true;

  // Standalone shell builtins — NEVER gates on their own. When a `run: |`
  // block scalar contains a retry loop like `for i in 1 2 3; do npm ci &&
  // break; done`, the line-based extractor pulls out `break` as a
  // pseudo-command. Same for `exit`, `continue`, `return`, `shift`.
  if (/^(break|continue|return|exit|shift|trap|:)\s*\d*\s*[)}\s]*$/.test(trimmed)) return true;
  if (/^(pushd|popd)(\s|$)/.test(trimmed)) return true;

  // Version / health probes — `node --version`, `go version`,
  // `rustc --version`, `python --version`, `which node || true`,
  // `shellcheck --version`, `foo -v`. These are environment sanity
  // checks, not quality gates. General rule: any command of the form
  // `<tool> (--version|-v|version)` (optionally followed by `|| true`)
  // is a probe regardless of tool name.
  if (/^[\w./+-]+\s+(-v|--version|version)\s*(\|\|.*)?$/.test(trimmed)) return true;
  // `which X` — utility probe, not a gate
  if (/^which(\s|$)/.test(trimmed)) return true;
  if (/^command\s+-v\s/.test(trimmed)) return true;
  if (/^type\s+-[a-z]\s/.test(trimmed)) return true;

  // Cross-language print/output statements leaked from `run: |` blocks that
  // embed Ruby/Python/JS/Perl code. Filters `puts ...`, `print ...`,
  // `console.log ...`, `fmt.Println ...`, `die ...`. These are not gates —
  // they're string emissions from inline scripts. Allow either whitespace
  // or `(` after the keyword so Python `print("x")` is also caught.
  if (/^(puts|print|printf|console\.log|fmt\.Println|die)\s*[(\s"'`]/.test(trimmed)) return true;
  if (/^(raise|throw)\s/.test(trimmed)) return true;

  // Process substitution install scripts: `bash <(curl ...)` or `sh <(wget ...)`
  // These are one-off bootstrap scripts, not gates. Also guards against
  // accepting unreviewed remote scripts as "quality checks".
  if (/^(bash|sh|zsh|fish)\s+<\s*\(/.test(trimmed)) return true;
  // Same pattern via `curl URL | bash` / `curl URL | sh`
  if (/\bcurl\s.*\|\s*(bash|sh)\b/.test(trimmed)) return true;
  if (/\bwget\s.*\|\s*(bash|sh)\b/.test(trimmed)) return true;

  // Variable assignments leaked from embedded code (Ruby, Python, etc. inside
  // a `run: |` block). Pattern: `identifier = value` — note the spaces, which
  // distinguishes this from shell assignment `NAME=value` (no spaces). This
  // catches `rake_version = File.read(...)` from ruby's workflows.
  if (/^[A-Za-z_][A-Za-z0-9_]*\s+=\s/.test(trimmed)) return true;
  // Shell-style assignment `FOO=bar` at start of line is also not a gate.
  // Exclude env-prefixed commands like `FOO=bar node run.js` — those have
  // a command after the assignment.
  if (/^[A-Z_][A-Z0-9_]*=[^\s=][^\s]*\s*$/.test(trimmed)) return true;

  // Bare shell variable references
  if (/^\$\{?\w+\}?\s*$/.test(trimmed)) return true;

  // Shell loop variables — commands containing `$f`, `$i`, `$d`, etc.
  // (single-letter) or common loop names like `$file`, `$dir`, `$item`.
  // These are meaningless when extracted from a for-loop body in isolation.
  if (/\$\{?[a-z]\}?(?=["'\s;|&>)\]}]|$)/.test(trimmed)) return true;
  if (/\$\{?(file|dir|item|entry|elem|pkg|mod|src|lib)\}?(?=["'\s;|&>)\]}]|$)/.test(trimmed)) return true;

  // Echo / printf / export / set-output — shell plumbing
  if (/^(echo|printf|export|set)\s/.test(trimmed)) return true;
  if (trimmed.startsWith('echo "::set-output')) return true;
  if (trimmed.startsWith('echo "$GITHUB_CONTEXT')) return true;
  if (/^echo\s+['"]::/.test(trimmed)) return true;

  // Throwaway setup
  if (/^(mkdir|rm|cp|mv|touch|ln)\s/.test(trimmed)) return true;
  if (/^git\s+(config|submodule|diff|show|log|status|rev-parse)/.test(trimmed)) return true;
  if (/^cd\s/.test(trimmed) && !trimmed.includes('&&')) return true;

  // npm install variants — these are setup, not gates (we capture npm test/lint directly)
  if (/^npm\s+(ci|install)(\s|$)/.test(trimmed) && !trimmed.includes('&&')) return true;
  if (/^yarn\s+(install)(\s|$)/.test(trimmed) && !trimmed.includes('&&')) return true;
  if (/^pnpm\s+(install|i)(\s|$)/.test(trimmed)) return true;
  if (/^bun\s+install/.test(trimmed)) return true;
  if (/^npm\s+install\s+--no-save/.test(trimmed)) return true;
  if (/^npm\s+install\s+--global/.test(trimmed)) return true;
  if (/^pip\s+install/.test(trimmed)) return true;
  if (/^python\s+-m\s+pip\s+(install|uninstall)/.test(trimmed)) return true;
  if (/^uv\s+(sync|pip|lock)/.test(trimmed)) return true;
  if (/^poetry\s+install/.test(trimmed)) return true;
  if (/^composer\s+(install|update|require)/.test(trimmed)) return true;
  if (/^bundle\s+install/.test(trimmed)) return true;
  if (/^cargo\s+fetch/.test(trimmed)) return true;

  // Action setup steps (rustup, etc.)
  if (/^rustup\s/.test(trimmed)) return true;

  // node_modules/ direct references — setup scripts (e.g. puppeteer install),
  // not quality gates. These fail in shallow clones anyway.
  if (/^node\s+node_modules\//.test(trimmed)) return true;

  // CI orchestration / distributed runner commands — not quality gates.
  // Examples: nx-cloud start-ci-run, nx-cloud stop-all-agents, circleci step halt.
  if (/\b(start-ci-run|stop-all-agents|step halt|setup-remote-docker)\b/.test(trimmed)) return true;
  if (/^npx\s+nx-cloud\s/.test(trimmed)) return true;

  // make install / make clean / make examples — build operations, not quality gates.
  // Also filter `make -j1 install_sw` (OpenSSL build), `make -C bld install`.
  if (/^(time\s+)?make\s+.*\b(install\w*|clean|uninstall)\b/.test(trimmed)) return true;
  // make with -C (cross-directory build) is CI-specific build plumbing
  if (/^(time\s+)?make\s+-C\s/.test(trimmed)) return true;

  // Release / publish steps — not gates
  if (/^npm\s+publish/.test(trimmed)) return true;
  if (/^cargo\s+publish/.test(trimmed)) return true;
  if (/^docker\s+push/.test(trimmed)) return true;
  // bundle exec rake install:* and release:* are publish targets, not gates
  if (/^bundle\s+exec\s+rake\s+(install|release|build):/.test(trimmed)) return true;
  if (/^rake\s+(install|release|build):/.test(trimmed)) return true;

  // README / doc generation scripts
  if (trimmed.includes('update-readme')) return true;
  if (trimmed.includes('clean-cspell')) return true;
  if (trimmed.includes('validate-ecosystem-links')) return true;

  // Benchmark/micro-regression one-offs
  if (/--debug-benchmark/.test(trimmed)) return true;
  if (/grep\s+"['"]?Latency avg/.test(trimmed)) return true;
  if (/-v\s*\|\s*grep/.test(trimmed)) return true;

  // YAML ternary / expression fragment leaks. When a `run: |` block scalar
  // wraps a multi-line ${{ ... && ... || ... }} expression, our line-based
  // extractor pulls out the inner fragment as a pseudo-command. These look
  // like `'--flag value' || '--other' }}` or similar.
  if (/^['"][^'"]*['"]\s*(\|\||&&)/.test(trimmed)) return true;
  if (/\}\}\s*$/.test(trimmed)) return true;

  // License checker long one-liners with baked-in allow lists — not stable gates
  if (/^npx\s+license-checker/.test(trimmed)) return true;

  // License checkers are typically gates, but their exact invocation is
  // long and project-specific. Keep them.

  // Dev/maintenance scripts under a `scripts/` directory are one-off tasks,
  // not gates. FastAPI runs its doc, sponsor, people, translation pipelines
  // this way via `uv run ./scripts/*.py`. These are publishing automations,
  // not quality checks.
  if (/^(uv|poetry|pdm|hatch|rye|pipenv)\s+run\s+(\.\/)?scripts\//.test(trimmed)) return true;
  if (/^python3?\s+(\.\/)?scripts\//.test(trimmed)) return true;
  if (/^node\s+(\.\/)?scripts\//.test(trimmed)) return true;
  if (/^(bash|sh)\s+(\.\/)?scripts\//.test(trimmed)) return true;
  if (/^npx\s+(tsx?|ts-node)\s+(\.\/)?scripts\//.test(trimmed)) return true;

  // Shell control-flow fragments leaked from block scalars. When a `run: |`
  // wraps a multi-line if/for/while/case, our line-based extractor pulls out
  // the control keyword line as a pseudo-command.
  if (/^(if|then|else|elif|fi|for|do|done|while|until|case|esac)\s/.test(trimmed)) return true;
  if (/^(then|else|fi|do|done|esac)$/.test(trimmed)) return true;

  return false;
}

/**
 * Extract the first real gate command from a compound shell line.
 * "cd test/bundler/webpack && npm install && npm run test" → "npm run test"
 * (we keep the last non-install command, which is usually the gate)
 *
 * Handles `&&` and `;` as separators. `||` is intentionally not split —
 * the second half of an `X || Y` compound is a fallback, not a gate.
 *
 * If ALL parts are noise (e.g. `npm ci && break` where both halves are
 * install/builtin), the function returns empty string so the caller's
 * isNoise() check rejects the compound wholesale instead of letting the
 * last part leak through as a gate.
 */
function extractMainCommand(cmd) {
  if (!cmd.includes('&&') && !cmd.includes(';')) return cmd;

  // Split on `&&` OR `;` but NOT inside quoted substrings. Simple split
  // is fine for our use case — workflow commands rarely quote `&&`/`;`
  // and when they do, we'd rather over-split than under-split.
  const parts = cmd
    .split(/&&|;/)
    .map(s => s.trim())
    .filter(Boolean);

  // Find the last non-noise, non-cd command.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!isNoise(p) && !p.startsWith('cd ')) return p;
  }
  // All parts are noise — return empty so caller's isNoise() rejects it.
  // (Empty-string is treated as noise by isNoise's early return.)
  return '';
}

/**
 * Normalize a raw list of CI commands into deduped, filtered gates.
 *
 * @param {string[]} rawCommands — output of extractRunCommands()
 * @param {object} [opts]
 * @param {number} [opts.maxGates=8] — cap the returned list
 * @returns {string[]} — canonical, deduped, gate-worthy commands
 */
function normalizeCiGates(rawCommands, opts = {}) {
  const { maxGates = 8 } = opts;
  const seen = new Set();
  const result = [];

  for (const raw of rawCommands) {
    if (!raw || typeof raw !== 'string') continue;
    const main = extractMainCommand(raw);
    if (isNoise(main)) continue;
    const canonical = canonicalize(main);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    // Keep the first human-readable form (not the canonical with <matrix>)
    result.push(main.replace(/\s+/g, ' ').trim());
    if (result.length >= maxGates) break;
  }

  return result;
}

module.exports = { normalizeCiGates, canonicalize, isNoise, extractMainCommand };
