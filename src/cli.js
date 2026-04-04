'use strict';

const { init, install } = require('./commands/init');
const { check } = require('./commands/check');
const { compile } = require('./commands/compile');
const { analyze } = require('./commands/analyze');
const { diff } = require('./commands/diff');
const { upgrade } = require('./commands/upgrade');
const { workspace } = require('./commands/workspace');
const { checkOnce } = require('./update/version-check');

function printUsage() {
  console.log(`
  scaffold-cli — Self-maintaining Claude Code infrastructure

  Usage:
    scaffold init         Interview → generate governance, hooks, agents
    scaffold check        Verify infrastructure is complete
    scaffold install      Install agent globally for /scaffold-project
    scaffold compile      Compile governance.md → CI, hooks, AGENTS.md, Cursor, Gemini
    scaffold analyze      Generate governance from existing project (no interview)
    scaffold diff         Compare governance against codebase reality
    scaffold upgrade      Update universal skills to latest version
    scaffold workspace    Inspect detected workspace (type, members, governance hierarchy)
    scaffold version      Show version

  Compile targets:
    scaffold compile --target github      .github/workflows/gates.yml
    scaffold compile --target husky       .husky/pre-commit
    scaffold compile --target pre-commit  .pre-commit-config.yaml
    scaffold compile --target agents-md   AGENTS.md
    scaffold compile --target cursor      .cursor/rules/governance.mdc
    scaffold compile --target gemini      GEMINI.md
    scaffold compile --target all         All of the above

  Analyze options:
    scaffold analyze --dry-run            Print inferred governance without writing
    scaffold analyze --workspace          Analyze all workspace members
    scaffold analyze --merge              Merge with existing governance

  Upgrade options:
    scaffold upgrade --check              Show what would change
    scaffold upgrade --workspace          Update all workspace members
    scaffold upgrade --force              Overwrite modified skills (with backup)

  Workspace options:
    scaffold workspace                    Human-readable workspace inspection
    scaffold workspace --json             Machine-readable JSON output

  Architecture:
    Universal skills (ship with scaffold-cli, same for every project):
      pre-start-context     discovers any project at runtime
      post-start-validation validates using governance gates

    Generated per-project (from your interview or analysis):
      governance.md         your rules, quality bar, policies
      hooks/                drift detector, circuit breaker, compaction
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
    case 'init':    init(); break;
    case 'install': install(); break;
    case 'check':   check(); break;
    case 'compile': compile(args); break;
    case 'analyze':   analyze(args); break;
    case 'diff':      diff(args); break;
    case 'upgrade':   upgrade(args); break;
    case 'workspace': workspace(args); break;
    case 'version': case '--version': case '-v':
      console.log(`  scaffold-cli v${require('../package.json').version}`);
      break;
    case 'help': case '--help': case '-h': case undefined:
      printUsage(); break;
    default:
      console.error(`  Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

module.exports = { run };
