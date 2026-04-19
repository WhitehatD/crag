'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CRAG_BIN = path.join(__dirname, '..', 'bin', 'crag.js');

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

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crag-write-gov-test-'));
}

function rimraf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log('\n  analyze --write-governance');

// Test 1: writes governance.md from a package.json + CI workflow
test('writes .claude/governance.md when it does not exist', () => {
  const tmp = makeTmpDir();
  try {
    // Create a minimal Node project
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      name: 'test-proj',
      scripts: { test: 'node test/all.js', lint: 'eslint .' },
    }));

    // Create a .github/workflows dir with a test job
    const wfDir = path.join(tmp, '.github', 'workflows');
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, 'test.yml'), [
      'name: CI',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: npm test',
    ].join('\n'));

    execSync(`node "${CRAG_BIN}" analyze --write-governance --no-install-skills`, {
      cwd: tmp,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const govPath = path.join(tmp, '.claude', 'governance.md');
    assert.ok(fs.existsSync(govPath), '.claude/governance.md was not created');
    const content = fs.readFileSync(govPath, 'utf-8');
    assert.ok(content.includes('npm test') || content.includes('node test/all.js') || content.includes('### Test') || content.includes('### CI'),
      'governance.md does not contain expected gate content');
    assert.ok(content.includes('# Governance'), 'governance.md missing header');
  } finally {
    rimraf(tmp);
  }
});

// Test 2: aborts without --force when governance.md already exists
test('aborts with helpful message when governance.md exists and --force not set', () => {
  const tmp = makeTmpDir();
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-proj', scripts: { test: 'npm test' } }));

    const claudeDir = path.join(tmp, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const govPath = path.join(claudeDir, 'governance.md');
    fs.writeFileSync(govPath, '# Governance — test-proj\n## Identity\n- Project: test-proj\n');

    let threw = false;
    try {
      execSync(`node "${CRAG_BIN}" analyze --write-governance --no-install-skills`, {
        cwd: tmp,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      threw = true;
      const combined = (err.stdout || '') + (err.stderr || '');
      assert.ok(
        combined.includes('already exists') || combined.includes('--force'),
        `expected "already exists" or "--force" in error output, got: ${combined}`
      );
    }
    assert.ok(threw, 'expected process to exit non-zero when governance.md already exists');
  } finally {
    rimraf(tmp);
  }
});

// Test 3: --force overwrites existing governance.md
test('--force overwrites existing governance.md', () => {
  const tmp = makeTmpDir();
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-proj', scripts: { test: 'npm test' } }));

    const claudeDir = path.join(tmp, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const govPath = path.join(claudeDir, 'governance.md');
    const originalContent = '# Original governance\n';
    fs.writeFileSync(govPath, originalContent);

    execSync(`node "${CRAG_BIN}" analyze --write-governance --force --no-install-skills`, {
      cwd: tmp,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const newContent = fs.readFileSync(govPath, 'utf-8');
    assert.ok(newContent !== originalContent, 'governance.md was not overwritten with --force');
    assert.ok(newContent.includes('# Governance'), 'overwritten governance.md missing header');
  } finally {
    rimraf(tmp);
  }
});
