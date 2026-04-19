'use strict';

const fs = require('fs');
const path = require('path');
const { parseGovernance, flattenGates, flattenGatesRich } = require('../governance/parse');
const { cliError, readFileOrExit, EXIT_USER, safeMtime, requireGovernance } = require('../cli-errors');
const { validateFlags } = require('../cli-args');
const { planOutputPath, ALL_TARGETS } = require('./compile');
const { checkGateReality, extractCIGateCommands, extractUnmanagedCIFiles, normalizeCmd } = require('./diff');

/**
 * Detect whether the repo has ANY AI governance artifacts. If none exist,
 * Axis 2 (drift) findings are semantically meaningless — crag is inferring
 * governance from CI commands and flagging them against a baseline that
 * doesn't exist. In that case we skip Axis 2.
 */
function hasAnyAIConfig(cwd) {
  const fileTargets = [
    'CLAUDE.md',
    'AGENTS.md',
    'GEMINI.md',
    '.github/copilot-instructions.md',
    '.clinerules',
    '.continuerules',
    '.rules',
    'CONVENTIONS.md',        // aider
    '.coderabbit.yaml',      // coderabbit
    '.junie/guidelines.md',  // junie
    '.kiro/steering/quality-gates.md', // kiro
    '.goose/GOOSEHINTS',     // goose
    // '.pre-commit-config.yaml' — excluded: pre-commit is a hook system, not AI governance
    // 'lefthook.yml' — excluded: hook system, not AI governance
    // '.gitlab-ci.yml' — excluded: CI system, not AI governance
    // '.circleci/config.yml' — excluded: CI system, not AI governance
    // 'azure-pipelines.yml' — excluded: CI system, not AI governance
  ];
  const dirTargets = [
    '.cursor',
    '.windsurf',
    '.amazonq',
    '.husky',
  ];
  for (const rel of fileTargets) {
    const p = path.join(cwd, rel);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
    } catch (_) { /* ignore */ }
  }
  for (const rel of dirTargets) {
    const p = path.join(cwd, rel);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return true;
    } catch (_) { /* ignore */ }
  }
  return false;
}

/**
 * crag audit — drift detection across governance, compiled configs, and reality.
 *
 * Three detection axes:
 *   1. Staleness:  compiled configs older than governance.md
 *   2. Reality:    governance references tools/deps that don't exist
 *   3. Missing:    AI tool dirs exist but no compiled config for them
 */
function audit(args) {
  validateFlags('audit', args, {
    boolean: ['--json', '--fix'],
  });
  const json = args.includes('--json');
  const fix = args.includes('--fix');
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  if (!fs.existsSync(govPath)) {
    if (json) {
      console.log(JSON.stringify({ error: 'no governance.md found' }));
      process.exit(EXIT_USER);
    }
    requireGovernance(cwd); // exits with consistent error message
  }

  const content = readFileOrExit(fs, govPath, 'governance.md');
  const parsed = parseGovernance(content);
  const flat = flattenGates(parsed.gates);

  const report = {
    stale: [],
    current: [],
    missing: [],
    drift: [],
    extra: [],
    unmanagedCI: [],
  };

  // --- Axis 1: Compiled file staleness ---
  const govMtime = safeMtime(govPath);
  for (const target of ALL_TARGETS) {
    const outPath = planOutputPath(cwd, target);
    if (!outPath) continue;
    if (!fs.existsSync(outPath)) {
      // Not compiled yet — check if the tool is in use (Axis 3 handles)
      continue;
    }
    const outMtime = safeMtime(outPath);
    if (govMtime > outMtime) {
      report.stale.push({
        target,
        path: path.relative(cwd, outPath),
        govAge: govMtime,
        fileAge: outMtime,
      });
    } else {
      report.current.push({
        target,
        path: path.relative(cwd, outPath),
      });
    }
  }

  // --- Axis 2: Governance vs reality ---
  // Use flattenGatesRich to preserve path-scoping. When a gate section has
  // `path: frontend/`, we resolve tools against that subdirectory instead
  // of the project root. This prevents false-positive drift in monorepos
  // where e.g. `npx tsc` lives in frontend/node_modules, not root.
  //
  // Skip this axis entirely when the repo has NO authoritative AI config.
  // Without a governance source on disk (CLAUDE.md, AGENTS.md, husky,
  // pre-commit, etc.), drift findings are spurious — crag is just flagging
  // CI commands against a baseline that doesn't exist.
  const richGates = flattenGatesRich(parsed.gates);
  const aiConfigPresent = hasAnyAIConfig(cwd);
  if (aiConfigPresent) {
    for (const gate of richGates) {
      const checkDir = gate.path ? path.join(cwd, gate.path) : cwd;
      const check = checkGateReality(checkDir, gate.cmd);
      if (check.status === 'drift' || check.status === 'missing') {
        report.drift.push({ command: gate.cmd, detail: check.detail });
      }
    }
  }

  // CI extras: gates in CI but not in governance
  const govCommands = richGates.map(g => g.cmd);
  const ciGates = extractCIGateCommands(cwd);
  const reportedExtras = new Set();
  for (const ciGate of ciGates) {
    const normalized = normalizeCmd(ciGate);
    if (reportedExtras.has(normalized)) continue;
    if (!govCommands.some(g => normalizeCmd(g) === normalized)) {
      report.extra.push({ command: ciGate, detail: 'In CI workflow but not in governance' });
      reportedExtras.add(normalized);
    }
  }

  // Unmanaged CI: companion workflows without # crag:auto-start (informational only)
  report.unmanagedCI = extractUnmanagedCIFiles(cwd);

  // --- Axis 3: Missing compile targets ---
  const toolIndicators = [
    { dir: '.cursor', target: 'cursor', label: 'Cursor' },
    { file: '.github/copilot-instructions.md', target: 'copilot', label: 'GitHub Copilot', checkFile: true },
    { dir: '.windsurf', target: 'windsurf', label: 'Windsurf' },
    { dir: '.amazonq', target: 'amazonq', label: 'Amazon Q' },
    { file: '.clinerules', target: 'cline', label: 'Cline', checkFile: true },
    { file: '.continuerules', target: 'continue', label: 'Continue', checkFile: true },
    { file: '.rules', target: 'zed', label: 'Zed', checkFile: true },
    { file: 'GEMINI.md', target: 'gemini', label: 'Gemini', checkFile: true },
    { file: 'AGENTS.md', target: 'agents-md', label: 'AGENTS.md', checkFile: true },
    { dir: '.github/workflows', target: 'github', label: 'GitHub Actions' },
    { dir: '.forgejo/workflows', target: 'forgejo', label: 'Forgejo Actions' },
    { dir: '.husky', target: 'husky', label: 'Husky' },
  ];

  for (const indicator of toolIndicators) {
    const indicatorPath = indicator.dir
      ? path.join(cwd, indicator.dir)
      : path.join(cwd, indicator.file);
    const indicatorExists = indicator.dir
      ? fs.existsSync(indicatorPath) && fs.statSync(indicatorPath).isDirectory()
      : indicator.checkFile && fs.existsSync(indicatorPath);

    if (!indicatorExists) continue;

    const outPath = planOutputPath(cwd, indicator.target);
    if (outPath && !fs.existsSync(outPath)) {
      report.missing.push({
        tool: indicator.label,
        target: indicator.target,
        indicator: indicator.dir || indicator.file,
      });
    }
  }

  // --- JSON output ---
  if (json) {
    const summary = {
      stale: report.stale.length,
      current: report.current.length,
      drift: report.drift.length,
      extra: report.extra.length,
      missing: report.missing.length,
      unmanagedCI: report.unmanagedCI.length,
      total: report.stale.length + report.drift.length + report.extra.length + report.missing.length,
    };
    console.log(JSON.stringify({ summary, ...report }, null, 2));
    if (summary.total > 0) process.exit(EXIT_USER);
    return;
  }

  // --- Terminal output ---
  const G = '\x1b[32m';  // green
  const R = '\x1b[31m';  // red
  const Y = '\x1b[33m';  // yellow
  const C = '\x1b[36m';  // cyan
  const B = '\x1b[1m';   // bold
  const D = '\x1b[2m';   // dim
  const X = '\x1b[0m';   // reset

  console.log(`\n  ${B}crag audit${X} ${D}\u2014 governance drift report${X}\n`);

  let issues = 0;

  // --- Compiled configs ---
  const hasCompiled = report.stale.length + report.current.length > 0;
  if (hasCompiled) {
    console.log(`  ${D}Compiled configs${X}`);
    // Compute max path width for alignment
    const allPaths = [...report.stale.map(s => s.path), ...report.current.map(c => c.path)];
    const maxLen = Math.min(Math.max(...allPaths.map(p => p.length), 10), 48);

    for (const s of report.stale) {
      const padded = s.path.padEnd(maxLen);
      console.log(`  ${R}\u2717${X} ${padded}  ${R}stale${X} ${D}\u2014 governance.md is newer${X}`);
      issues++;
    }
    for (const c of report.current) {
      const padded = c.path.padEnd(maxLen);
      console.log(`  ${G}\u2713${X} ${padded}  ${D}in sync${X}`);
    }
    console.log('');
  }

  // --- Gate reality ---
  if (report.drift.length > 0) {
    console.log(`  ${D}Gate reality${X}`);
    for (const d of report.drift) {
      console.log(`  ${Y}\u2717${X} ${d.command}`);
      if (d.detail) console.log(`          ${Y}\u2192${X} ${d.detail}`);
      issues++;
    }
    console.log('');
  }

  // --- CI extras ---
  if (report.extra.length > 0) {
    console.log(`  ${D}CI extras${X}`);
    for (const e of report.extra) {
      console.log(`  ${C}+${X} ${e.command}  ${D}in CI, not in governance${X}`);
      issues++;
    }
    console.log('');
  }

  // --- Unmanaged CI (informational — not counted as issues) ---
  if (report.unmanagedCI.length > 0) {
    console.log(`  ${D}Companion workflows${X} ${D}(no crag:auto-start — not managed by crag)${X}`);
    for (const src of report.unmanagedCI) {
      console.log(`  ${D}\u2139${X} ${src.file}`);
      for (const cmd of src.commands) {
        console.log(`    ${D}· ${cmd}${X}`);
      }
    }
    console.log('');
  }

  // --- Missing targets ---
  if (report.missing.length > 0) {
    console.log(`  ${D}Missing targets${X}`);
    for (const m of report.missing) {
      console.log(`  ${Y}?${X} ${m.tool} detected  ${D}crag compile --target ${m.target}${X}`);
      issues++;
    }
    console.log('');
  }

  // --- Summary bar ---
  const parts = [];
  if (report.stale.length > 0) parts.push(`${report.stale.length} stale`);
  if (report.drift.length > 0) parts.push(`${report.drift.length} drift`);
  if (report.extra.length > 0) parts.push(`${report.extra.length} extra`);
  if (report.missing.length > 0) parts.push(`${report.missing.length} missing`);

  if (issues === 0) {
    console.log(`  ${G}${B}\u2713 All clear${X} ${D}\u2014 governance and compiled configs are in sync.${X}\n`);
  } else {
    console.log(`  ${R}${B}${issues} issue${issues !== 1 ? 's' : ''}${X} ${D}\u2014 ${parts.join(' \u00b7 ')}${X}`);
    if (!fix) {
      console.log(`  ${D}Fix:${X} crag compile --target all ${D}\u2014 or \u2014${X} crag audit --fix\n`);
    }
  }

  // --fix: recompile stale targets
  if (fix && report.stale.length > 0) {
    console.log(`  ${D}Recompiling stale targets...${X}`);
    const { runGenerator } = require('./compile');
    for (const s of report.stale) {
      try {
        runGenerator(s.target, cwd, parsed);
        console.log(`  ${G}\u2713${X} ${s.path}`);
      } catch (err) {
        console.error(`  ${R}\u2717${X} ${s.target}: ${err.message}`);
      }
    }
    console.log('');
  }

  if (issues > 0 && !fix) process.exit(EXIT_USER);
}

module.exports = { audit };
