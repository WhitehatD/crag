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
  if (trimmed.endsWith('&')) return true;

  // Echo / printf / export / set-output — shell plumbing
  if (/^(echo|printf|export|set)\s/.test(trimmed)) return true;
  if (trimmed.startsWith('echo "::set-output')) return true;
  if (trimmed.startsWith('echo "$GITHUB_CONTEXT')) return true;
  if (/^echo\s+['"]::/.test(trimmed)) return true;

  // Throwaway setup
  if (/^(mkdir|rm|cp|mv|touch)\s/.test(trimmed)) return true;
  if (/^git\s+(config|submodule)/.test(trimmed)) return true;
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

  return false;
}

/**
 * Extract the first real gate command from a compound shell line.
 * "cd test/bundler/webpack && npm install && npm run test" → "npm run test"
 * (we keep the last non-install command, which is usually the gate)
 */
function extractMainCommand(cmd) {
  if (!cmd.includes('&&')) return cmd;
  const parts = cmd.split('&&').map(s => s.trim()).filter(Boolean);
  // Find the last non-install, non-cd command
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!isNoise(parts[i]) && !parts[i].startsWith('cd ')) return parts[i];
  }
  // All parts are noise — return the last part so the caller can reject it
  // via isNoise(main) rather than letting the compound leak through.
  return parts[parts.length - 1] || cmd;
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
