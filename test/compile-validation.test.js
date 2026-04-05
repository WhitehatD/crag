'use strict';

/**
 * End-to-end tests for `crag compile` argument validation and empty-gates
 * refusal. These are regression tests for the stress-test findings:
 *   S-5: unknown --flag silently accepted
 *   S-6: --target value validated AFTER partial work (bad UX)
 *   S-13: 0-gate compile produces a broken workflow file
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

const CRAG_BIN = path.join(__dirname, '..', 'bin', 'crag.js');

function runCrag(cwd, args) {
  const r = spawnSync('node', [CRAG_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    stdout: (r.stdout || '').toString(),
    stderr: (r.stderr || '').toString(),
  };
}

function mkProject(gateSection) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-compile-val-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'governance.md'),
    `# Governance — t\n## Identity\n- Project: t\n## Gates\n${gateSection}\n## Branch Strategy\n- Trunk-based development\n- Free-form commits\n`);
  return dir;
}

console.log('\n  commands/compile (validation + refusal)');

test('compile: rejects unknown --target value before any work', () => {
  const dir = mkProject('### Test\n- echo ok');
  const { rc, stdout, stderr } = runCrag(dir, ['compile', '--target', 'zzzunknown']);
  assert.strictEqual(rc, 1);
  const combined = stdout + stderr;
  assert.ok(/Unknown target/.test(combined));
  // Must NOT print "Compiling" — the previous behavior was to print
  // "Compiling governance.md → zzzunknown" BEFORE rejecting.
  assert.ok(!/Compiling governance\.md → zzzunknown/.test(combined),
    `expected validation BEFORE compile step, got: ${combined}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: refuses to emit github workflow with 0 gates', () => {
  // No gates → empty Gates section
  const dir = mkProject('');
  const { rc, stderr } = runCrag(dir, ['compile', '--target', 'github']);
  assert.strictEqual(rc, 1);
  assert.ok(/0 gates/i.test(stderr) || /Refusing/i.test(stderr),
    `expected refusal message, got: ${stderr}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: refuses husky with 0 gates', () => {
  const dir = mkProject('');
  const { rc, stderr } = runCrag(dir, ['compile', '--target', 'husky']);
  assert.strictEqual(rc, 1);
  assert.ok(/Refusing|0 gates/i.test(stderr));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: doc-only targets (cursor, agents-md) succeed with 0 gates', () => {
  // These are reference material, not executable — they should still work
  // even if gates are empty so users can get the AI rules set up first.
  const dir = mkProject('');
  const { rc } = runCrag(dir, ['compile', '--target', 'cursor', '--dry-run']);
  assert.strictEqual(rc, 0, 'cursor should work with 0 gates (doc target)');
  const { rc: rc2 } = runCrag(dir, ['compile', '--target', 'agents-md', '--dry-run']);
  assert.strictEqual(rc2, 0, 'agents-md should work with 0 gates (doc target)');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: --target all with 0 gates refuses because of github/husky/pre-commit', () => {
  const dir = mkProject('');
  const { rc, stderr } = runCrag(dir, ['compile', '--target', 'all', '--dry-run']);
  assert.strictEqual(rc, 1);
  assert.ok(/Refusing|0 gates/i.test(stderr));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: rejects unknown --flag', () => {
  const dir = mkProject('### Test\n- echo ok');
  const { rc, stderr } = runCrag(dir, ['compile', '--target', 'cursor', '--nonsense']);
  assert.strictEqual(rc, 1);
  assert.ok(/unknown option/.test(stderr));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: --target github with real gates succeeds (dry run)', () => {
  const dir = mkProject('### Test\n- npm test\n### Lint\n- npx eslint .');
  const { rc, stdout } = runCrag(dir, ['compile', '--target', 'github', '--dry-run']);
  assert.strictEqual(rc, 0);
  assert.ok(/gates\.yml/.test(stdout));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: --verbose --dry-run prints byte sizes for every target', () => {
  const dir = mkProject('### Test\n- npm test\n### Lint\n- npx eslint .');
  const { rc, stdout } = runCrag(dir, ['compile', '--target', 'all', '--dry-run', '--verbose']);
  assert.strictEqual(rc, 0);
  // Strip ANSI before regex-matching plan lines.
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  const planLines = clean.split('\n').filter(l => /^\s*plan\s/.test(l));
  assert.ok(planLines.length === 12, `expected 12 plan lines, got ${planLines.length}:\n${clean}`);
  for (const line of planLines) {
    assert.ok(
      /\b\d+(?:\.\d+)?\s*(?:B|KB|MB)\s*$/.test(line.trim()),
      `expected byte size at end of plan line, got: ${line}`
    );
  }
  // Total line should be present
  assert.ok(/Total:\s+[\d.]+\s*(?:B|KB|MB)/.test(clean),
    `expected total line, got:\n${clean}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('compile: --verbose write mode prints sizes after each file', () => {
  const dir = mkProject('### Test\n- npm test');
  const { rc, stdout } = runCrag(dir, ['compile', '--target', 'cursor', '--verbose']);
  assert.strictEqual(rc, 0);
  // "wrote <path> <size>" instead of "plan"
  assert.ok(/wrote\s+.*governance\.mdc.*\b\d/.test(stdout.replace(/\x1b\[[0-9;]*m/g, '')),
    `expected wrote line with size, got: ${stdout}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('analyze: rejects unknown --flag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-analyze-val-'));
  const { rc, stderr } = runCrag(dir, ['analyze', '--garbage-flag']);
  assert.strictEqual(rc, 1);
  assert.ok(/unknown option/.test(stderr));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('analyze: generates placeholder for empty-gates projects', () => {
  // A bare directory with no recognizable build system — analyze should
  // still produce a governance file with a `- true` placeholder so that
  // downstream doctor/compile don't blow up.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-analyze-empty-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Random notes\n');
  const { rc } = runCrag(dir, ['analyze', '--no-install-skills']);
  assert.strictEqual(rc, 0);
  const gov = fs.readFileSync(path.join(dir, '.claude', 'governance.md'), 'utf-8');
  assert.ok(gov.includes('## Gates'));
  // Must contain at least one gate under ### Test — the true placeholder
  assert.ok(/### Test[\s\S]*?- true/.test(gov),
    `expected placeholder '- true' in Test section, got:\n${gov}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('analyze: warns when run from an infra subdirectory', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-analyze-subdir-'));
  const infra = path.join(parent, '.claude');
  fs.mkdirSync(infra, { recursive: true });
  const { stderr } = runCrag(infra, ['analyze', '--dry-run']);
  assert.ok(/tooling subdirectory|looks like/i.test(stderr),
    `expected subdir warning, got: ${stderr}`);
  fs.rmSync(parent, { recursive: true, force: true });
});
