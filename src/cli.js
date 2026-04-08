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
const { audit } = require('./commands/audit');
const { auto, looksLikeProject } = require('./commands/auto');
const { hook } = require('./commands/hook');
const { login } = require('./commands/login');
const { sync } = require('./commands/sync');
const { team } = require('./commands/team');
const { checkOnce } = require('./update/version-check');
const { EXIT_USER } = require('./cli-errors');

function printUsage() {
  console.log(`
  crag — the bedrock layer for AI coding agents
  One governance.md. Any project. Never stale.

  Usage:
    crag                Run analyze + compile in one shot (auto-detects project)
    crag demo           Self-contained proof-of-value run (~3 s, no config)
    crag analyze        Generate governance from existing project (no interview)
    crag compile        Compile governance.md → CI, hooks, AGENTS.md, Cursor, Gemini
    crag audit          Drift report: stale configs, outdated rules, missing targets
    crag hook install   Install pre-commit hook (auto-recompile on governance change)
    crag diff           Compare governance against codebase reality
    crag doctor         Deep diagnostic: governance integrity, drift, hook validity
    crag init           Interview → generate governance, hooks, agents
    crag check          Verify infrastructure is complete
    crag upgrade        Update universal skills to latest version
    crag workspace      Inspect detected workspace (type, members, governance hierarchy)
    crag install        Install agent globally for /crag-project
    crag login          Authenticate with crag cloud (GitHub OAuth)
    crag sync           Sync governance.md with crag cloud
    crag team           Manage teams on crag cloud
    crag version        Show version

  Compile targets (${ALL_TARGETS.length}):
    AI agents — universal standard:
      crag compile --target agents-md    AGENTS.md (60K+ repos, Linux Foundation)
    AI agents — native:
      crag compile --target cursor       .cursor/rules/governance.mdc
      crag compile --target gemini       GEMINI.md
      crag compile --target copilot      .github/copilot-instructions.md
    AI agents — additional:
      crag compile --target cline        .clinerules
      crag compile --target continue     .continuerules
      crag compile --target windsurf     .windsurf/rules/governance.md
      crag compile --target zed          .rules
      crag compile --target amazonq      .amazonq/rules/governance.md
    CI / git hooks:
      crag compile --target github       .github/workflows/gates.yml
      crag compile --target husky        .husky/pre-commit
      crag compile --target pre-commit   .pre-commit-config.yaml
    crag compile --target all            All ${ALL_TARGETS.length} targets at once

  Audit options:
    crag audit                        Human-readable drift report
    crag audit --json                 Machine-readable JSON output
    crag audit --fix                  Auto-recompile stale targets

  Hook options:
    crag hook install                 Install hook (auto-recompile on governance change)
    crag hook install --drift-gate    Also block commits if drift is detected
    crag hook uninstall               Remove crag-installed hook
    crag hook status                  Check hook installation status

  Analyze options:
    crag analyze --dry-run            Print inferred governance without writing
    crag analyze --workspace          Analyze all workspace members
    crag analyze --merge              Merge with existing governance

  Compile options:
    crag compile --target <t> --dry-run  Preview output paths without writing

  Upgrade options:
    crag upgrade --check              Show what would change
    crag upgrade --workspace          Update all workspace members
    crag upgrade --force              Overwrite modified skills (with backup)

  Cloud:
    crag login                        Authenticate via GitHub OAuth
    crag login --status               Check auth state
    crag login --logout               Clear saved credentials

    crag sync                         Show sync status
    crag sync --push                  Push governance.md to cloud
    crag sync --pull                  Pull governance from cloud
    crag sync --force                 Force overwrite on conflict

    crag team                         Show current team
    crag team create <name>           Create a team
    crag team join <code>             Join with invite code
    crag team members                 List members
    crag team invite                  Generate invite link
    crag team leave                   Leave current team

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
    case 'audit':     audit(args); break;
    case 'hook':      hook(args); break;
    case 'login':     return login(args);
    case 'sync':      return sync(args);
    case 'team':      return team(args);
    case 'version': case '--version': case '-v':
      console.log(`  crag v${require('../package.json').version}`);
      break;
    case 'help': case '--help': case '-h':
      printUsage(); break;
    case undefined:
      if (looksLikeProject(process.cwd())) {
        auto(args || []);
      } else {
        printUsage();
      }
      break;
    default:
      console.error(`  Unknown command: ${command}`);
      printUsage();
      process.exit(EXIT_USER);
  }
}

module.exports = { run };
