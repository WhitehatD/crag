'use strict';

const fs = require('fs');
const path = require('path');
const { parseGovernance, flattenGates } = require('../governance/parse');
const { generateGitHubActions } = require('../compile/github-actions');
const { generateForgejo } = require('../compile/forgejo');
const { generateHusky } = require('../compile/husky');
const { generatePreCommitConfig } = require('../compile/pre-commit');
const { generateAgentsMd } = require('../compile/agents-md');
const { generateCursorRules } = require('../compile/cursor-rules');
const { generateGeminiMd } = require('../compile/gemini-md');
const { generateCopilot } = require('../compile/copilot');
const { generateCline } = require('../compile/cline');
const { generateContinue } = require('../compile/continue');
const { generateWindsurf } = require('../compile/windsurf');
const { generateZed } = require('../compile/zed');
const { generateAmazonQ } = require('../compile/amazonq');
const { generateClaude } = require('../compile/claude');
const { generateAider } = require('../compile/aider');
const { generateLefthook } = require('../compile/lefthook');
const { generateGitlabCI } = require('../compile/gitlab-ci');
const { generateCoderabbit } = require('../compile/coderabbit');
const { generateJunie } = require('../compile/junie');
const { generateKiro } = require('../compile/kiro');
const { generateCircleCI } = require('../compile/circleci');
const { generateAzureDevOps } = require('../compile/azuredevops');
const { generateGoose } = require('../compile/goose');
const { generateScaffold } = require('../compile/scaffold');
const { cliError, readFileOrExit, EXIT_USER, EXIT_INTERNAL, requireGovernance } = require('../cli-errors');
const { validateFlags } = require('../cli-args');

// All supported compile targets in dispatch order.
// Grouped: CI (3) + AI agent native (3) + AI agent extras (6) + new (4)
const ALL_TARGETS = [
  'github',
  'forgejo',
  'husky',
  'pre-commit',
  'agents-md',
  'cursor',
  'gemini',
  'copilot',
  'cline',
  'continue',
  'windsurf',
  'zed',
  'amazonq',
  'claude',
  'aider',
  'lefthook',
  'gitlab',
  'coderabbit',
  'junie',
  'kiro',
  'circleci',
  'azuredevops',
  'goose',
];

function compile(args) {
  validateFlags('compile', args, {
    boolean: ['--dry-run', '--verbose', '--force'],
    string: ['--target'],
  });
  const targetIdx = args.indexOf('--target');
  const target = targetIdx !== -1 ? args[targetIdx + 1] : (args[1] && !args[1].startsWith('--') ? args[1] : undefined);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  // Validate the target BEFORE reading governance.md or doing any work. A
  // previous bug had target validation buried inside the compile loop, so
  // `crag compile --target zzzunknown` would print "Compiling → zzzunknown"
  // and "0 gates, 0 runtimes" before finally erroring. Fail fast.
  const KNOWN_TARGETS = new Set([...ALL_TARGETS, 'all', 'list', 'scaffold']);
  if (target && !KNOWN_TARGETS.has(target)) {
    console.error(`  Unknown target: ${target}`);
    console.error(`  Valid targets: ${ALL_TARGETS.join(', ')}, scaffold, all, list`);
    process.exit(EXIT_USER);
  }

  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  requireGovernance(cwd);

  const content = readFileOrExit(fs, govPath, 'governance.md');
  const parsed = parseGovernance(content);
  if (parsed.warnings && parsed.warnings.length > 0) {
    for (const w of parsed.warnings) console.warn(`  \x1b[33m!\x1b[0m ${w}`);
  }
  const flat = flattenGates(parsed.gates);
  const gateCount = Object.values(flat).flat().length;

  if (!target || target === 'list') {
    console.log(`\n  crag compile — ${parsed.name || 'unnamed project'}`);
    console.log(`  ${gateCount} gate(s) in ${Object.keys(parsed.gates).length} section(s), ${parsed.runtimes.length} runtime(s) detected\n`);
    console.log('  CI / git hooks:');
    console.log('    crag compile --target github       .github/workflows/gates.yml');
    console.log('    crag compile --target forgejo      .forgejo/workflows/gates.yml');
    console.log('    crag compile --target husky        .husky/pre-commit');
    console.log('    crag compile --target pre-commit   .pre-commit-config.yaml');
    console.log('    crag compile --target lefthook     lefthook.yml');
    console.log('    crag compile --target gitlab       .gitlab-ci.yml');
    console.log('    crag compile --target circleci     .circleci/config.yml');
    console.log('    crag compile --target azuredevops  azure-pipelines.yml\n');
    console.log('  AI coding agents — native formats:');
    console.log('    crag compile --target agents-md    AGENTS.md (Codex, Aider, Factory)');
    console.log('    crag compile --target cursor       .cursor/rules/governance.mdc');
    console.log('    crag compile --target gemini       GEMINI.md\n');
    console.log('  AI coding agents — additional formats:');
    console.log('    crag compile --target copilot      .github/copilot-instructions.md');
    console.log('    crag compile --target cline        .clinerules');
    console.log('    crag compile --target continue     .continuerules');
    console.log('    crag compile --target windsurf     .windsurf/rules/governance.md');
    console.log('    crag compile --target zed          .rules');
    console.log('    crag compile --target amazonq      .amazonq/rules/governance.md');
    console.log('    crag compile --target claude       CLAUDE.md');
    console.log('    crag compile --target aider        CONVENTIONS.md');
    console.log('    crag compile --target coderabbit   .coderabbit.yaml');
    console.log('    crag compile --target junie        .junie/guidelines.md');
    console.log('    crag compile --target kiro         .kiro/steering/quality-gates.md');
    console.log('    crag compile --target goose        .goose/GOOSEHINTS\n');
    console.log('  Infrastructure:');
    console.log('    crag compile --target scaffold     Hooks, settings, agents, CI playbook\n');
    console.log('  Combined:');
    console.log(`    crag compile --target all          All ${ALL_TARGETS.length} AI config targets at once`);
    console.log('    crag compile --target <t> --dry-run  Preview paths without writing\n');
    return;
  }

  // Scaffold is separate from `all` — it generates infrastructure, not AI configs
  if (target === 'scaffold') {
    const force = args.includes('--force');
    if (dryRun) {
      const scaffoldFiles = [
        '.claude/hooks/sandbox-guard.sh',
        '.claude/hooks/drift-detector.sh',
        '.claude/hooks/circuit-breaker.sh',
        '.claude/settings.local.json',
        '.claude/agents/test-runner.md',
        '.claude/agents/security-reviewer.md',
        '.claude/ci-playbook.md',
      ];
      for (const f of scaffoldFiles) {
        console.log(`  \x1b[36mplan\x1b[0m ${f}`);
      }
      console.log('\n  Dry-run complete — no files written.\n');
      return;
    }
    generateScaffold(cwd, parsed, { force });
    console.log('\n  Done. Infrastructure scaffolded.\n');
    return;
  }

  const targets = target === 'all' ? ALL_TARGETS : [target];

  // Refuse to emit a workflow / hook / CI file when there are 0 gates —
  // these targets produce broken artifacts (empty workflows, hooks with
  // no checks). The user should either fix governance.md or run analyze
  // again. Doc-only targets (cursor, agents-md, gemini, ...) still work
  // because they're reference material, not executable.
  const EXECUTABLE_TARGETS = new Set(['github', 'forgejo', 'husky', 'pre-commit']);
  const wantsExecutable = targets.some(t => EXECUTABLE_TARGETS.has(t));
  if (gateCount === 0 && wantsExecutable) {
    console.error(`  \x1b[31m✗\x1b[0m Refusing to compile executable targets with 0 gates.`);
    console.error(`    Targets affected: ${targets.filter(t => EXECUTABLE_TARGETS.has(t)).join(', ')}`);
    console.error(`    This would generate a broken workflow/hook with no quality checks.`);
    console.error(`    Fix: edit .claude/governance.md and add real gate commands under ### Test / ### Lint.`);
    process.exit(EXIT_USER);
  }

  console.log(`\n  Compiling governance.md → ${targets.join(', ')}`);
  console.log(`  ${gateCount} gates, ${parsed.runtimes.length} runtimes detected${dryRun ? ' (dry-run)' : ''}\n`);

  // --dry-run: print the planned output paths without writing files.
  // With --verbose, also compute the byte size of each generated artifact
  // by running the real generators into a temp scratch directory and
  // stat-ing the results. The scratch dir is cleaned up immediately.
  if (dryRun) {
    const sizes = verbose ? computeArtifactSizes(parsed, targets) : null;
    for (const t of targets) {
      const outPath = planOutputPath(cwd, t);
      if (outPath) {
        const rel = path.relative(cwd, outPath);
        if (verbose && sizes && sizes[t] !== undefined) {
          const sizeLabel = formatBytes(sizes[t]);
          console.log(`  \x1b[36mplan\x1b[0m ${rel.padEnd(44)} \x1b[2m${sizeLabel}\x1b[0m`);
        } else {
          console.log(`  \x1b[36mplan\x1b[0m ${rel}`);
        }
      } else {
        console.error(`  Unknown target: ${t}`);
        console.error(`  Valid targets: ${ALL_TARGETS.join(', ')}, all, list`);
        process.exit(EXIT_USER);
      }
    }
    if (verbose && sizes) {
      const total = Object.values(sizes).reduce((a, b) => a + b, 0);
      console.log(`\n  \x1b[2mTotal: ${formatBytes(total)} across ${Object.keys(sizes).length} target(s)\x1b[0m`);
    }
    console.log('\n  Dry-run complete — no files written.\n');
    return;
  }

  let failures = 0;
  for (const t of targets) {
    try {
      runGenerator(t, cwd, parsed);
      if (verbose) {
        const outPath = planOutputPath(cwd, t);
        let size = 0;
        try { size = fs.statSync(outPath).size; } catch { /* ignore */ }
        const rel = path.relative(cwd, outPath);
        console.log(`  \x1b[32mwrote\x1b[0m ${rel.padEnd(44)} \x1b[2m${formatBytes(size)}\x1b[0m`);
      }
    } catch (err) {
      // Per-target failure: warn and continue so one broken target
      // doesn't prevent the remaining targets from compiling.
      const outPath = planOutputPath(cwd, t);
      const rel = outPath ? path.relative(cwd, outPath) : t;
      console.error(`  \x1b[33m!\x1b[0m ${rel} \x1b[2m(skipped: ${err.message.split('\n')[0]})\x1b[0m`);
      failures++;
    }
  }
  if (failures > 0 && targets.length === 1) {
    // Single-target compile should still fail hard
    process.exit(EXIT_INTERNAL);
  }

  console.log('\n  Done. Governance is now executable infrastructure.\n');
}

/**
 * Dispatch to the right generator for a given target name. Shared by the
 * real compile path and by `computeArtifactSizes` (which runs the same
 * generators against a scratch dir for dry-run byte counts).
 */
function runGenerator(target, cwd, parsed) {
  switch (target) {
    case 'github':     generateGitHubActions(cwd, parsed); break;
    case 'forgejo':    generateForgejo(cwd, parsed); break;
    case 'husky':      generateHusky(cwd, parsed); break;
    case 'pre-commit': generatePreCommitConfig(cwd, parsed); break;
    case 'agents-md':  generateAgentsMd(cwd, parsed); break;
    case 'cursor':     generateCursorRules(cwd, parsed); break;
    case 'gemini':     generateGeminiMd(cwd, parsed); break;
    case 'copilot':    generateCopilot(cwd, parsed); break;
    case 'cline':      generateCline(cwd, parsed); break;
    case 'continue':   generateContinue(cwd, parsed); break;
    case 'windsurf':   generateWindsurf(cwd, parsed); break;
    case 'zed':        generateZed(cwd, parsed); break;
    case 'amazonq':    generateAmazonQ(cwd, parsed); break;
    case 'claude':     generateClaude(cwd, parsed); break;
    case 'aider':      generateAider(cwd, parsed); break;
    case 'lefthook':   generateLefthook(cwd, parsed); break;
    case 'gitlab':     generateGitlabCI(cwd, parsed); break;
    case 'coderabbit': generateCoderabbit(cwd, parsed); break;
    case 'junie':      generateJunie(cwd, parsed); break;
    case 'kiro':       generateKiro(cwd, parsed); break;
    case 'circleci':   generateCircleCI(cwd, parsed); break;
    case 'azuredevops': generateAzureDevOps(cwd, parsed); break;
    case 'goose':      generateGoose(cwd, parsed); break;
    default:
      console.error(`  Unknown target: ${target}`);
      console.error(`  Valid targets: ${ALL_TARGETS.join(', ')}, all, list`);
      process.exit(EXIT_USER);
  }
}

/**
 * Dry-run helper: run every generator into a scratch temp directory, stat
 * the produced files, then clean up. Returns `{ [target]: byteSize }`.
 * This gives `--verbose --dry-run` real artifact sizes without leaving any
 * trace on the user's filesystem.
 */
function computeArtifactSizes(parsed, targets) {
  const os = require('os');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-compile-verbose-'));
  const sizes = {};
  try {
    for (const t of targets) {
      try {
        runGenerator(t, scratch, parsed);
        const outPath = planOutputPath(scratch, t);
        const stat = fs.statSync(outPath);
        sizes[t] = stat.size;
      } catch {
        // If a single target fails to generate in the scratch dir, record
        // size as 0 and keep going. The real compile path will re-raise.
        sizes[t] = 0;
      }
    }
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  return sizes;
}

/**
 * Human-readable byte count: `"1.2 KB"`, `"456 B"`, `"12.8 KB"`. Kept
 * tiny on purpose — this is surface output, not a library function.
 */
function formatBytes(n) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return '? B';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 10) return `${kb.toFixed(2)} KB`;
  if (kb < 100) return `${kb.toFixed(1)} KB`;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Map a target name to its destination path relative to cwd.
 * Used by --dry-run to show what would be written.
 */
function planOutputPath(cwd, target) {
  const map = {
    'github':     path.join(cwd, '.github', 'workflows', 'gates.yml'),
    'forgejo':    path.join(cwd, '.forgejo', 'workflows', 'gates.yml'),
    'husky':      path.join(cwd, '.husky', 'pre-commit'),
    'pre-commit': path.join(cwd, '.pre-commit-config.yaml'),
    'agents-md':  path.join(cwd, 'AGENTS.md'),
    'cursor':     path.join(cwd, '.cursor', 'rules', 'governance.mdc'),
    'gemini':     path.join(cwd, 'GEMINI.md'),
    'copilot':    path.join(cwd, '.github', 'copilot-instructions.md'),
    'cline':      path.join(cwd, '.clinerules'),
    'continue':   path.join(cwd, '.continuerules'),
    'windsurf':   path.join(cwd, '.windsurf', 'rules', 'governance.md'),
    'zed':        path.join(cwd, '.rules'),
    'amazonq':    path.join(cwd, '.amazonq', 'rules', 'governance.md'),
    'claude':     path.join(cwd, 'CLAUDE.md'),
    'aider':      path.join(cwd, 'CONVENTIONS.md'),
    'lefthook':   path.join(cwd, 'lefthook.yml'),
    'gitlab':     path.join(cwd, '.gitlab-ci.yml'),
    'coderabbit': path.join(cwd, '.coderabbit.yaml'),
    'junie':      path.join(cwd, '.junie', 'guidelines.md'),
    'kiro':       path.join(cwd, '.kiro', 'steering', 'quality-gates.md'),
    'circleci':   path.join(cwd, '.circleci', 'config.yml'),
    'azuredevops': path.join(cwd, 'azure-pipelines.yml'),
    'goose':      path.join(cwd, '.goose', 'GOOSEHINTS'),
  };
  return map[target] || null;
}

module.exports = { compile, ALL_TARGETS, planOutputPath, formatBytes, computeArtifactSizes, runGenerator };
