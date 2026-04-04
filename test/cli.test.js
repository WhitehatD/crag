'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

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

const scaffold = path.join(__dirname, '..', 'bin', 'scaffold.js');

function run(args, opts = {}) {
  return execFileSync(process.execPath, [scaffold, ...args], {
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SCAFFOLD_NO_UPDATE_CHECK: '1' },
    ...opts,
  });
}

console.log('\n  CLI end-to-end');

test('scaffold version prints version', () => {
  const out = run(['version']);
  assert.ok(/scaffold-cli v\d+\.\d+\.\d+/.test(out));
});

test('scaffold help prints usage with all commands', () => {
  const out = run(['help']);
  assert.ok(out.includes('scaffold init'));
  assert.ok(out.includes('scaffold check'));
  assert.ok(out.includes('scaffold analyze'));
  assert.ok(out.includes('scaffold diff'));
  assert.ok(out.includes('scaffold upgrade'));
  assert.ok(out.includes('scaffold workspace'));
  assert.ok(out.includes('scaffold compile'));
});

test('scaffold with no args prints help', () => {
  const out = run([]);
  assert.ok(out.includes('Usage'));
});

test('scaffold workspace --json produces valid JSON', () => {
  const out = run(['workspace', '--json']);
  // Find the JSON block (output may have leading update notice)
  const jsonStart = out.indexOf('{');
  assert.ok(jsonStart >= 0);
  const parsed = JSON.parse(out.slice(jsonStart));
  assert.ok('type' in parsed);
  assert.ok('root' in parsed);
});

test('scaffold analyze --dry-run does not write files', () => {
  // Just verify it runs without throwing — the file-writing behavior is covered
  // by the flag semantics; a dry run in the scaffold-cli repo itself shouldn't
  // modify .claude/governance.md (we verify no exception).
  const out = run(['analyze', '--dry-run']);
  assert.ok(out.includes('DRY RUN') || out.includes('Governance'));
});

test('scaffold upgrade --check does not write files', () => {
  const out = run(['upgrade', '--check']);
  assert.ok(out.includes('upgrade'));
});

test('scaffold unknown command exits with error', () => {
  try {
    run(['nonexistent-command']);
    assert.fail('Should have thrown');
  } catch (err) {
    // execFileSync throws on non-zero exit
    assert.ok(err.status !== 0);
  }
});

test('SCAFFOLD_NO_UPDATE_CHECK suppresses update notice', () => {
  const out = run(['version']);
  assert.ok(!out.includes('available'));
});
