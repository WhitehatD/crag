'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const crag = path.join(__dirname, '..', 'bin', 'crag.js');

function run(args, opts = {}) {
  return execFileSync(process.execPath, [crag, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
    ...opts,
  });
}

function mkProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-audit-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const SAMPLE_GOV = `# Governance — test
## Identity
- Project: test
- Stack: node

## Gates (run in order, stop on failure)
### Test
- npm run test

## Branch Strategy
- Trunk-based development
- Conventional commits
`;

console.log('\n  commands/audit.js');

test('audit: no governance exits non-zero', () => {
  const dir = mkProject({ 'package.json': '{}' });
  try {
    run(['audit'], { cwd: dir });
    assert.fail('should have exited non-zero');
  } catch (err) {
    assert.ok(err.status !== 0);
  }
});

test('audit: --json produces valid JSON', () => {
  const dir = mkProject({
    '.claude/governance.md': SAMPLE_GOV,
    'package.json': '{"scripts":{"test":"echo ok"}}',
    'AGENTS.md': '# stale',
  });
  // Make AGENTS.md older than governance.md
  const past = new Date(Date.now() - 60000);
  fs.utimesSync(path.join(dir, 'AGENTS.md'), past, past);

  let out;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || err.stderr;
  }
  const parsed = JSON.parse(out.trim());
  assert.ok('summary' in parsed);
  assert.ok(typeof parsed.summary.stale === 'number');
  assert.ok(typeof parsed.summary.drift === 'number');
});

test('audit: detects stale compiled file', () => {
  const dir = mkProject({
    '.claude/governance.md': SAMPLE_GOV,
    'package.json': '{"scripts":{"test":"echo ok"}}',
    'AGENTS.md': '# old content',
  });
  // Make AGENTS.md older
  const past = new Date(Date.now() - 60000);
  fs.utimesSync(path.join(dir, 'AGENTS.md'), past, past);

  let out;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
  }
  const parsed = JSON.parse(out.trim());
  assert.ok(parsed.stale.length > 0, 'should detect stale AGENTS.md');
  assert.ok(parsed.stale.some(s => s.target === 'agents-md'));
});

test('audit: current file reports in sync', () => {
  const dir = mkProject({
    'package.json': '{"scripts":{"test":"echo ok"}}',
  });
  // Write governance first, then AGENTS.md after
  const govPath = path.join(dir, '.claude', 'governance.md');
  fs.mkdirSync(path.dirname(govPath), { recursive: true });
  fs.writeFileSync(govPath, SAMPLE_GOV);
  // Give governance an older mtime
  const past = new Date(Date.now() - 60000);
  fs.utimesSync(govPath, past, past);
  // Write AGENTS.md now (newer)
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# current');

  let out;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
  }
  const parsed = JSON.parse(out.trim());
  assert.ok(parsed.current.some(c => c.target === 'agents-md'), 'AGENTS.md should be current');
});

test('audit: detects reality drift (missing npm script)', () => {
  const dir = mkProject({
    '.claude/governance.md': SAMPLE_GOV,
    'package.json': '{"scripts":{}}', // no "test" script
    // CLAUDE.md ensures Axis 2 is not skipped (repo has an AI config)
    'CLAUDE.md': '# governance',
  });

  let out;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
  }
  const parsed = JSON.parse(out.trim());
  assert.ok(parsed.drift.length > 0, 'should detect drift for missing npm script');
});

test('audit: no AI config → zero drift even if gate unresolvable', () => {
  // Repo has governance.md with a gate but NO AI config files at all.
  // Axis 2 should be skipped entirely → drift must be empty.
  const dir = mkProject({
    '.claude/governance.md': SAMPLE_GOV,
    'package.json': '{"scripts":{}}', // no "test" script → would normally drift
    // Intentionally: no CLAUDE.md, no AGENTS.md, no .husky, no pre-commit, etc.
  });

  let out;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
  }
  const parsed = JSON.parse(out.trim());
  assert.strictEqual(parsed.drift.length, 0,
    'drift should be empty when no AI config exists in the repo');
});

test('audit: help text mentions crag audit', () => {
  const out = run(['help']);
  assert.ok(out.includes('crag audit'));
});
