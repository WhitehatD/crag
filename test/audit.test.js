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

test('audit: placeholder-only governance flags placeholderOnly, exits 0, no issues', () => {
  // Governance whose ONLY gate is the `- true  # TODO...` placeholder analyze
  // writes when it can infer nothing. It passes checkGateReality forever, so
  // it must be surfaced (placeholderOnly:true) but never counted as an issue.
  const gov = `# Governance — test
## Identity
- Project: test

## Gates
### Test
- true  # TODO: crag could not detect a gate — replace with your real test command
`;
  const dir = mkProject({
    '.claude/governance.md': gov,
    'CLAUDE.md': '# governance',
  });

  let out, status = 0;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
    status = err.status;
  }
  const parsed = JSON.parse(out.trim());
  assert.strictEqual(status, 0, `placeholder-only must exit 0, got ${status}`);
  assert.strictEqual(parsed.summary.total, 0, `placeholder must not be an issue, got total ${parsed.summary.total}`);
  assert.strictEqual(parsed.summary.placeholderOnly, true, 'expected summary.placeholderOnly true');
  assert.strictEqual(parsed.placeholderOnly, true, 'expected report.placeholderOnly true');
});

test('audit: real gate present ⇒ placeholderOnly is false', () => {
  const gov = `# Governance — test
## Identity
- Project: test

## Gates
### Test
- true  # TODO: crag could not detect a gate — replace with your real test command
- npm run test
`;
  const dir = mkProject({
    '.claude/governance.md': gov,
    'CLAUDE.md': '# governance',
    'package.json': '{"scripts":{"test":"echo ok"}}',
  });
  let out;
  try { out = run(['audit', '--json'], { cwd: dir }); }
  catch (err) { out = err.stdout || ''; }
  const parsed = JSON.parse(out.trim());
  assert.strictEqual(parsed.placeholderOnly, false,
    'a real gate alongside the placeholder must clear placeholderOnly');
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

test('audit: drift detail mentions "script" for missing npm script', () => {
  const gov = `# Governance — test
## Identity
- Project: test
- Stack: node

## Gates (run in order, stop on failure)
### Test
- npm run nonexistent-script
`;
  const dir = mkProject({
    '.claude/governance.md': gov,
    'package.json': '{"scripts":{}}', // script does not exist
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
  const detail = parsed.drift[0].detail || '';
  assert.ok(/script/i.test(detail), `detail should mention "script", got: "${detail}"`);
});

test('audit: human-readable output contains → when drift is present', () => {
  const gov = `# Governance — test
## Identity
- Project: test
- Stack: node

## Gates (run in order, stop on failure)
### Test
- npm run nonexistent-script
`;
  const dir = mkProject({
    '.claude/governance.md': gov,
    'package.json': '{"scripts":{}}', // script does not exist
    'CLAUDE.md': '# governance',
  });

  let out;
  try {
    out = run(['audit'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
  }
  assert.ok(out.includes('→'), `human output should contain →, got:\n${out}`);
});

// --- Fix 3: ADVISORY gates are not counted as enforced drift --------------

test('audit: ADVISORY gate failure does not count as an issue (exit 0, total 0, advisory 1)', () => {
  const gov = `# Governance — test
## Identity
- Project: test
- Stack: node

## Gates
### Test
- true
### Contributor docs (ADVISORY — confirm before enforcing)
- cargo test  # [ADVISORY]
`;
  // No Cargo.toml → the advisory `cargo test` gate fails its reality check.
  // CLAUDE.md makes the gate axis run (hasAnyAIConfig).
  const dir = mkProject({
    '.claude/governance.md': gov,
    'package.json': '{}',
    'CLAUDE.md': '# governance',
  });

  // Compile so CLAUDE.md is in sync (no stale drift muddying the total).
  try { run(['compile', '--target', 'claude'], { cwd: dir }); } catch { /* best effort */ }

  let out, status = 0;
  try {
    out = run(['audit', '--json'], { cwd: dir });
  } catch (err) {
    out = err.stdout || '';
    status = err.status;
  }
  const parsed = JSON.parse(out.trim());
  assert.strictEqual(status, 0, `audit must exit 0 when only advisory gate fails, got status ${status}`);
  assert.strictEqual(parsed.summary.total, 0, `summary.total must be 0, got ${parsed.summary.total}`);
  assert.ok(Array.isArray(parsed.advisory), 'advisory array must be present');
  assert.strictEqual(parsed.advisory.length, 1, `expected 1 advisory entry, got ${JSON.stringify(parsed.advisory)}`);
});
