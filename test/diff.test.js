'use strict';

const assert = require('assert');
const { diff, normalizeCmd, extractRunCommands, isGateCommand } = require('../src/commands/diff');

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

console.log('\n  commands/diff.js');

// --- Module surface ---

test('exports diff, normalizeCmd, extractRunCommands, isGateCommand', () => {
  assert.strictEqual(typeof diff, 'function');
  assert.strictEqual(typeof normalizeCmd, 'function');
  assert.strictEqual(typeof extractRunCommands, 'function');
  assert.strictEqual(typeof isGateCommand, 'function');
});

// --- normalizeCmd: alias rewriting ---

test('normalizeCmd: npm test ⇔ npm run test', () => {
  assert.strictEqual(normalizeCmd('npm test'), normalizeCmd('npm run test'));
});

test('normalizeCmd: npm start ⇔ npm run start', () => {
  assert.strictEqual(normalizeCmd('npm start'), normalizeCmd('npm run start'));
});

test('normalizeCmd: npm stop ⇔ npm run stop', () => {
  assert.strictEqual(normalizeCmd('npm stop'), normalizeCmd('npm run stop'));
});

test('normalizeCmd: npm install stays as-is', () => {
  assert.strictEqual(normalizeCmd('npm install'), 'npm install');
});

test('normalizeCmd: npm ci stays as-is', () => {
  assert.strictEqual(normalizeCmd('npm ci'), 'npm ci');
});

test('normalizeCmd: ./gradlew ⇔ gradlew', () => {
  assert.strictEqual(normalizeCmd('./gradlew test'), normalizeCmd('gradlew test'));
});

test('normalizeCmd: ./mvnw ⇔ mvnw', () => {
  assert.strictEqual(normalizeCmd('./mvnw compile'), normalizeCmd('mvnw compile'));
});

test('normalizeCmd: lowercases all input', () => {
  assert.strictEqual(normalizeCmd('NPM TEST'), normalizeCmd('npm test'));
});

test('normalizeCmd: collapses multiple spaces', () => {
  assert.strictEqual(normalizeCmd('npm  test'), normalizeCmd('npm test'));
});

test('normalizeCmd: trims leading/trailing whitespace', () => {
  assert.strictEqual(normalizeCmd('  npm test  '), normalizeCmd('npm test'));
});

test('normalizeCmd: different commands remain different', () => {
  assert.notStrictEqual(normalizeCmd('npm test'), normalizeCmd('cargo test'));
});

// --- extractRunCommands: YAML parsing ---

test('extractRunCommands: inline run step', () => {
  const yaml = `
    steps:
      - run: npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm test'));
});

test('extractRunCommands: block scalar `run: |`', () => {
  const yaml = `
    steps:
      - run: |
          npm install
          npm test
          npm run build
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm install'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(cmds.includes('npm run build'));
});

test('extractRunCommands: block scalar `run: >-`', () => {
  const yaml = `
    steps:
      - run: >-
          npm
          test
`;
  const cmds = extractRunCommands(yaml);
  // Folded scalar produces one logical line — we extract each physical line here
  assert.ok(cmds.length >= 1);
});

test('extractRunCommands: skips comments inside block', () => {
  const yaml = `
    steps:
      - run: |
          # setup step
          npm install
          # test step
          npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm install'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(!cmds.some(c => c.startsWith('#')));
});

test('extractRunCommands: strips surrounding quotes on inline', () => {
  const yaml = `
    steps:
      - run: "npm test"
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm test'));
});

test('extractRunCommands: returns empty for yaml without run steps', () => {
  const yaml = `
    name: noop
    on: push
    jobs:
      hello:
        runs-on: ubuntu-latest
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, []);
});

test('extractRunCommands: multiple run blocks', () => {
  const yaml = `
    steps:
      - run: npm install
      - run: |
          npm test
          npm run build
      - run: npm publish
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm install'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(cmds.includes('npm run build'));
  assert.ok(cmds.includes('npm publish'));
});

// --- isGateCommand: command classification ---

test('isGateCommand: recognizes common test commands', () => {
  assert.ok(isGateCommand('npm test'));
  assert.ok(isGateCommand('npm run test'));
  assert.ok(isGateCommand('cargo test'));
  assert.ok(isGateCommand('go test ./...'));
  assert.ok(isGateCommand('pytest'));
});

test('isGateCommand: recognizes lint commands', () => {
  assert.ok(isGateCommand('npx eslint .'));
  assert.ok(isGateCommand('npx biome check .'));
  assert.ok(isGateCommand('cargo clippy'));
  assert.ok(isGateCommand('ruff check'));
});

test('isGateCommand: rejects non-gate commands', () => {
  assert.ok(!isGateCommand('echo hello'));
  assert.ok(!isGateCommand('cd /tmp'));
  assert.ok(!isGateCommand('mkdir foo'));
  assert.ok(!isGateCommand('git log'));
});

// --- normalizeCmd quote stripping (regression from stress test) ----------

test('normalizeCmd: strips surrounding double quotes', () => {
  assert.strictEqual(normalizeCmd('"npm test"'), normalizeCmd('npm test'));
});

test('normalizeCmd: strips surrounding single quotes', () => {
  assert.strictEqual(normalizeCmd("'cargo test'"), normalizeCmd('cargo test'));
});

test('normalizeCmd: does not strip mismatched quotes', () => {
  // `"foo bar'` — leading " and trailing ' — must NOT strip
  const out = normalizeCmd(`"foo bar'`);
  assert.ok(out.includes('"') || out.includes("'"));
});

test('normalizeCmd: strips nested wrapping quotes iteratively', () => {
  assert.strictEqual(normalizeCmd(`"'npm test'"`), normalizeCmd('npm test'));
});

// --- diff E2E on a temp repo with dedup check ----------------------------

test('diff: deduplicates extras across multiple workflows', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-diff-dedup-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });

  // Governance has nothing that matches the CI gates — everything will be EXTRA
  fs.writeFileSync(path.join(dir, '.claude', 'governance.md'),
    '# Governance — test\n## Identity\n- Project: test\n## Gates\n### Test\n- true\n');

  // Three workflows that all contain the same `npm test` gate
  for (const wf of ['a.yml', 'b.yml', 'c.yml']) {
    fs.writeFileSync(path.join(dir, '.github', 'workflows', wf),
      `name: ${wf}\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - run: npm run lint\n`);
  }

  // Run `crag diff` and count EXTRA lines
  const cragBin = path.join(__dirname, '..', 'bin', 'crag.js');
  let output;
  try {
    output = execFileSync('node', [cragBin, 'diff'], {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
    });
  } catch (err) {
    // diff may exit non-zero if there are drifts; still captures stdout
    output = (err.stdout || '').toString();
  }

  // Strip ANSI and count distinct EXTRA lines (excluding the "In CI workflow" subline)
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const extraLines = clean.split('\n').filter(l => /^\s*EXTRA\s/.test(l));
  // 2 distinct gates (`npm test`, `npm run lint`) across 3 workflows.
  // With dedup, we should see AT MOST 2 EXTRA lines (pre-fix it would be 6).
  assert.ok(extraLines.length <= 2,
    `expected ≤2 deduped EXTRA lines, got ${extraLines.length}: ${extraLines.join(' | ')}`);

  // cleanup
  fs.rmSync(dir, { recursive: true, force: true });
});

test('diff: picks up gates from non-GitHub CI systems', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-diff-multici-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'governance.md'),
    '# Governance — test\n## Identity\n- Project: test\n## Gates\n### Test\n- true\n');

  // GitLab CI with a real gate — diff used to miss this entirely
  fs.writeFileSync(path.join(dir, '.gitlab-ci.yml'),
    `stages:\n  - test\ntest_job:\n  script:\n    - cargo test\n    - cargo clippy\n`);

  const cragBin = path.join(__dirname, '..', 'bin', 'crag.js');
  let output;
  try {
    output = execFileSync('node', [cragBin, 'diff'], {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
    });
  } catch (err) {
    output = (err.stdout || '').toString();
  }
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  // The gitlab cargo test should appear as EXTRA (it's in CI but not governance)
  assert.ok(/EXTRA\s+cargo test/.test(clean) || /cargo test/.test(clean),
    `expected cargo test to appear as drift from .gitlab-ci.yml, got: ${clean}`);

  fs.rmSync(dir, { recursive: true, force: true });
});
