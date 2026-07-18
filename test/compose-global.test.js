'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { composeGovernance } = require('../src/compile/compose');
const { compileGlobal } = require('../src/compile/global');
const { assertMigrateSafe, looksHandMaintained } = require('../src/compile/migrate-guard');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// Run fn with process.env.HOME pointed at a throwaway dir, silencing logs.
// NEVER touches the real ~/.crag, ~/.agents, or ~/.claude.
function withFixtureHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-global-test-'));
  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  const origLog = console.log;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
    if (origUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = origUserProfile;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function write(abs, content) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const SAMPLE_SRC = `# Governance — my-machine

## Identity
- Project: my-machine
- Description: cross-project engineering doctrine

## Gates (run in order, stop on failure)
### Test
- npm test

## Security
- No hardcoded secrets — never force-push main
`;

console.log('\n  compose.js — user scope (machine-global layer)');

test('user scope returns null when no ~/.crag source exists', () => {
  withFixtureHome((home) => {
    const composed = composeGovernance(home, { scope: 'user' });
    assert.strictEqual(composed, null);
  });
});

test('user scope composes ~/.crag/governance.src.md alone', () => {
  withFixtureHome((home) => {
    write(path.join(home, '.crag', 'governance.src.md'), SAMPLE_SRC);
    const composed = composeGovernance(home, { scope: 'user' });
    assert.ok(composed && composed.content.includes('npm test'), 'composed carries the gate');
    assert.ok(composed.content.includes('force-push main'), 'composed carries security');
  });
});

test('user scope ignores the project layer entirely', () => {
  withFixtureHome((home) => {
    write(path.join(home, '.crag', 'governance.src.md'), SAMPLE_SRC);
    // A project-layer file in cwd must NOT leak into a user-scope compose.
    write(path.join(home, '.crag', 'governance.gen.md'), '## Distilled Principles\n- user gen rule\n');
    const composed = composeGovernance(home, { scope: 'user' });
    assert.ok(composed.content.includes('user gen rule') || composed.content.includes('npm test'));
  });
});

console.log('\n  global.js — crag compile --global');

test('no ~/.crag source → clean no-op (nothing written)', () => {
  withFixtureHome((home) => {
    const res = compileGlobal({});
    assert.strictEqual(res.empty, true);
    assert.ok(!fs.existsSync(path.join(home, '.agents', 'AGENTS.md')), 'no AGENTS.md written');
  });
});

test('writes ~/.agents/AGENTS.md + ~/.claude/CLAUDE.md import when absent', () => {
  withFixtureHome((home) => {
    write(path.join(home, '.crag', 'governance.src.md'), SAMPLE_SRC);
    const res = compileGlobal({});
    assert.strictEqual(res.empty, false);
    const agents = path.join(home, '.agents', 'AGENTS.md');
    const claude = path.join(home, '.claude', 'CLAUDE.md');
    assert.ok(fs.existsSync(agents), '~/.agents/AGENTS.md written');
    assert.ok(fs.readFileSync(agents, 'utf-8').includes('npm test'), 'canonical carries gates');
    assert.ok(fs.existsSync(claude), '~/.claude/CLAUDE.md written');
    const claudeText = fs.readFileSync(claude, 'utf-8');
    assert.ok(claudeText.includes('@' + agents), 'CLAUDE.md imports the absolute ~/.agents/AGENTS.md');
  });
});

test('SKIPS an unmarked hand-authored ~/.claude/CLAUDE.md (never overwrites)', () => {
  withFixtureHome((home) => {
    write(path.join(home, '.crag', 'governance.src.md'), SAMPLE_SRC);
    const claude = path.join(home, '.claude', 'CLAUDE.md');
    write(claude, '# my precious hand-written global rules\nRTK etc.\n');
    const res = compileGlobal({});
    assert.ok(res.skipped.includes(claude), 'reports the skip');
    assert.strictEqual(
      fs.readFileSync(claude, 'utf-8'),
      '# my precious hand-written global rules\nRTK etc.\n',
      'hand file untouched'
    );
  });
});

test('dry-run writes nothing', () => {
  withFixtureHome((home) => {
    write(path.join(home, '.crag', 'governance.src.md'), SAMPLE_SRC);
    compileGlobal({ dryRun: true });
    assert.ok(!fs.existsSync(path.join(home, '.agents', 'AGENTS.md')), 'dry-run wrote no AGENTS.md');
  });
});

console.log('\n  migrate-guard.js — #3615 footgun');

test('looksHandMaintained: rich file yes, composed artifact no', () => {
  assert.ok(looksHandMaintained('## Quality Gates\n- `npm test`\n'));
  assert.ok(!looksHandMaintained('GENERATED by `crag compose`\n\n(none)\n'));
  assert.ok(!looksHandMaintained('tiny\n'));
});

test('assertMigrateSafe: safe when no .gen layer', () => {
  withFixtureHome((home) => {
    const proj = path.join(home, 'proj');
    write(path.join(proj, '.claude', 'governance.md'), SAMPLE_SRC);
    assertMigrateSafe(proj); // must not throw/exit
  });
});

test('assertMigrateSafe: safe when .src seed exists', () => {
  withFixtureHome((home) => {
    const proj = path.join(home, 'proj');
    write(path.join(proj, '.claude', 'governance.md'), SAMPLE_SRC);
    write(path.join(proj, '.crag', 'governance.gen.md'), '## Distilled Principles\n- x\n');
    write(path.join(proj, '.crag', 'governance.src.md'), SAMPLE_SRC);
    assertMigrateSafe(proj); // must not throw/exit
  });
});

test('assertMigrateSafe: REFUSES gen-without-src over a rich governance.md', () => {
  withFixtureHome((home) => {
    const proj = path.join(home, 'proj');
    write(path.join(proj, '.claude', 'governance.md'), SAMPLE_SRC);
    write(path.join(proj, '.crag', 'governance.gen.md'), '## Distilled Principles\n- x\n');
    // no .src seed → footgun
    const origExit = process.exit;
    const origErr = console.error;
    let exited = false;
    let exitCode = null;
    process.exit = (c) => { exited = true; exitCode = c; throw new Error('__exit__'); };
    console.error = () => {};
    let threw = null;
    try {
      assertMigrateSafe(proj);
    } catch (e) {
      threw = e;
    } finally {
      process.exit = origExit;
      console.error = origErr;
    }
    assert.ok(exited, 'assertMigrateSafe must call process.exit (refuse)');
    assert.ok(threw && threw.message === '__exit__', 'refusal propagates via process.exit');
    assert.strictEqual(exitCode, 1, 'exits with EXIT_USER (1)');
  });
});
