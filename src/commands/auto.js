'use strict';

const fs = require('fs');
const path = require('path');
const { parseGovernance, flattenGates } = require('../governance/parse');
const { validateFlags } = require('../cli-args');
const { cliError, EXIT_INTERNAL, requireGovernance } = require('../cli-errors');

// Project markers — if any of these exist in cwd, it looks like a project.
const PROJECT_MARKERS = [
  'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
  'build.gradle', 'build.gradle.kts', 'pom.xml', 'Makefile',
  'setup.py', 'requirements.txt', 'composer.json', 'Gemfile',
  'mix.exs', 'CMakeLists.txt', 'meson.build', 'deno.json',
];

/**
 * Returns true if `cwd` looks like a project root.
 */
function looksLikeProject(cwd) {
  return PROJECT_MARKERS.some(f => fs.existsSync(path.join(cwd, f)));
}

/**
 * crag (no args) — auto-detect, analyze if needed, compile all targets.
 *
 * The zero-friction onboarding experience:
 *   $ npx @whitehatd/crag
 *   Detected: Node 25 · TypeScript · Vitest · pnpm · GitHub Actions
 *   Generated: .claude/governance.md (34 lines)
 *   Compiled: 13 targets in 487ms
 */
function auto(args) {
  validateFlags('auto', args, {
    boolean: ['--dry-run'],
  });
  const dryRun = args.includes('--dry-run');
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');
  const hadGovernance = fs.existsSync(govPath);
  const start = Date.now();

  // Step 1: Analyze if no governance.md exists
  if (!hadGovernance) {
    const { analyze } = require('./analyze');
    // Let analyze print its own progression (stack, CI, gates, etc.)
    // Suppress only the header/footer — keep the progress lines
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = (msg) => {
      const s = String(msg || '');
      // Pass through progress lines (✓, ✗, →), suppress headers/footers
      if (/[✓✗→]/.test(s) || /\u2713|\u2717|\u2192/.test(s)) origLog(s);
    };
    console.warn = () => {};
    try {
      analyze(['analyze', '--no-install-skills']);
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  }

  // After analyze, governance.md should exist
  if (!fs.existsSync(govPath)) {
    requireGovernance(cwd); // exits with consistent error message
  }

  const content = fs.readFileSync(govPath, 'utf-8');
  const parsed = parseGovernance(content);
  const flat = flattenGates(parsed.gates);
  const gateCount = Object.values(flat).flat().length;
  const govLines = content.split('\n').length;

  // Step 2: Compile all targets
  const { ALL_TARGETS, runGenerator, planOutputPath } = require('./compile');
  const written = [];

  if (!dryRun) {
    for (const target of ALL_TARGETS) {
      try {
        runGenerator(target, cwd, parsed);
        const outPath = planOutputPath(cwd, target);
        if (outPath && fs.existsSync(outPath)) {
          written.push(path.relative(cwd, outPath));
        }
      } catch {
        // Non-fatal: some targets may fail (e.g. 0 gates for executable targets)
      }
    }
  }

  const elapsed = Date.now() - start;

  // Step 3: Print summary
  const G = '\x1b[32m';  // green
  const B = '\x1b[1m';   // bold
  const D = '\x1b[2m';   // dim
  const C = '\x1b[36m';  // cyan
  const X = '\x1b[0m';   // reset

  console.log(`\n  ${B}crag${X} ${D}\u2014 auto-pilot${X}\n`);

  // Detected stack
  const stack = parsed.stack.length > 0 ? parsed.stack : parsed.runtimes;
  if (stack.length > 0) {
    console.log(`  ${D}Stack${X}      ${stack.join(` ${D}\u00b7${X} `)}`);
  }

  // Gate count
  const sectionNames = Object.keys(flat);
  if (sectionNames.length > 0) {
    console.log(`  ${D}Gates${X}      ${gateCount} ${D}(${sectionNames.join(' \u00b7 ')})${X}`);
  }

  console.log('');

  // Governance status
  if (!hadGovernance) {
    console.log(`  ${G}\u2713${X} Generated  .claude/governance.md ${D}(${govLines} lines)${X}`);
  } else {
    console.log(`  ${G}\u2713${X} Loaded     .claude/governance.md ${D}(${govLines} lines)${X}`);
  }

  // Compiled targets
  if (dryRun) {
    console.log(`  ${C}\u2713${X} Dry run    ${ALL_TARGETS.length} targets ${D}(no files written)${X}`);
  } else {
    console.log(`  ${G}\u2713${X} Compiled   ${written.length} targets ${D}in ${elapsed}ms${X}`);
  }

  console.log('');

  // Next steps
  if (!hadGovernance) {
    console.log(`  ${D}Review .claude/governance.md \u2014 sections marked "Inferred" should be verified.${X}`);
  }
  console.log(`  ${D}Next:${X} crag audit ${D}\u00b7${X} crag hook install ${D}\u00b7${X} crag doctor\n`);
}

module.exports = { auto, looksLikeProject };
