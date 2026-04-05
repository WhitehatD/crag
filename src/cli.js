'use strict';

const { init, install } = require('./commands/init');
const { check } = require('./commands/check');
const { compile, ALL_TARGETS } = require('./commands/compile');
const { analyze } = require('./commands/analyze');
const { diff } = require('./commands/diff');
const { doctor } = require('./commands/doctor');
const { upgrade } = require('./commands/upgrade');
const { workspace } = require('./commands/workspace');
const { demo } = require('./commands/demo');
const { checkOnce } = require('./update/version-check');
const { EXIT_USER } = require('./cli-errors');

function printUsage() {
  console.log(`
  crag — the bedrock layer for AI coding agents
  One governance.md. Any project. Never stale.

  Usage:
    crag demo         Self-contained proof-of-value run (~3 s, no config)
    crag init         Interview → generate governance, hooks, agents
    crag analyze      Generate governance from existing project (no interview)
    crag check        Verify infrastructure is complete
    crag doctor       Deep diagnostic: governance integrity, drift, hook validity, security
    crag compile      Compile governance.md → CI, hooks, AGENTS.md, Cursor, Gemini
    crag diff         Compare governance against codebase reality
    crag upgrade      Update universal skills to latest version
    crag workspace    Inspect detected workspace (type, members, governance hierarchy)
    crag install      Install agent globally for /crag-project
    crag version      Show version

  Compile targets (${ALL_TARGETS.length}):
    CI / git hooks:
      crag compile --target github       .github/workflows/gates.yml
      crag compile --target husky        .husky/pre-commit
      crag compile --target pre-commit   .pre-commit-config.yaml
    AI agents — native:
      crag compile --target agents-md    AGENTS.md (Codex, Aider, Factory)
      crag compile --target cursor       .cursor/rules/governance.mdc
      crag compile --target gemini       GEMINI.md
    AI agents — additional:
      crag compile --target copilot      .github/copilot-instructions.md
      crag compile --target cline        .clinerules
      crag compile --target continue     .continuerules
      crag compile --target windsurf     .windsurfrules
      crag compile --target zed          .zed/rules.md
      crag compile --target cody         .sourcegraph/cody-instructions.md
    crag compile --target all            All ${ALL_TARGETS.length} targets at once

  Analyze options:
    crag analyze --dry-run            Print inferred governance without writing
    crag analyze --workspace          Analyze all workspace members
    crag analyze --merge              Merge with existing governance

  Check options:
    crag check                        Human-readable infrastructure report
    crag check --json                 Machine-readable JSON output

  Compile options:
    crag compile --target <t> --dry-run  Preview output paths without writing

  Upgrade options:
    crag upgrade --check              Show what would change
    crag upgrade --workspace          Update all workspace members
    crag upgrade --force              Overwrite modified skills (with backup)

  Workspace options:
    crag workspace                    Human-readable workspace inspection
    crag workspace --json             Machine-readable JSON output

  Architecture:
    Universal skills (ship with crag, same for every project):
      pre-start-context     discovers any project at runtime
      post-start-validation validates using governance gates

    Generated per-project (from your interview or analysis):
      governance.md         your rules, quality bar, policies
      hooks/                sandbox guard, drift detector, circuit breaker
      agents/               test-runner, security-reviewer, scanners
      settings.local.json   permissions + hook wiring

  The skills read governance.md and adapt. Nothing is hardcoded.
  `);
}

function run(args) {
  const command = args[0];

  // Non-blocking update check (cached, ~1ms on warm path)
  checkOnce();

  switch (command) {
    case 'init':      init(); break;
    case 'install':   install(); break;
    case 'check':     check(args); break;
    case 'compile':   compile(args); break;
    case 'analyze':   analyze(args); break;
    case 'diff':      diff(args); break;
    case 'doctor':    doctor(args.slice(1)); break;
    case 'upgrade':   upgrade(args); break;
    case 'workspace': workspace(args); break;
    case 'demo':      demo(args.slice(1)); break;
    case 'version': case '--version': case '-v':
      console.log(`  crag v${require('../package.json').version}`);
      break;
    case 'help': case '--help': case '-h': case undefined:
      printUsage(); break;
    default:
      console.error(`  Unknown command: ${command}`);
      printUsage();
      process.exit(EXIT_USER);
  }
}

module.exports = { run };
