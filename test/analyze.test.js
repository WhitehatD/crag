'use strict';

const assert = require('assert');
const { isGateCommand, mergeWithExisting } = require('../src/commands/analyze');

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

console.log('\n  commands/analyze.js');

// --- isGateCommand ---

test('isGateCommand: recognizes npm commands', () => {
  assert.ok(isGateCommand('npm run test'));
  assert.ok(isGateCommand('npm ci'));
  assert.ok(isGateCommand('npx eslint'));
});

test('isGateCommand: recognizes cargo, go, pytest', () => {
  assert.ok(isGateCommand('cargo test'));
  assert.ok(isGateCommand('cargo clippy -- -D warnings'));
  assert.ok(isGateCommand('go test ./...'));
  assert.ok(isGateCommand('pytest -v'));
});

test('isGateCommand: recognizes gradle and maven', () => {
  assert.ok(isGateCommand('./gradlew test'));
  assert.ok(isGateCommand('mvn verify'));
});

test('isGateCommand: rejects shell utilities', () => {
  assert.ok(!isGateCommand('echo hello'));
  assert.ok(!isGateCommand('cd src'));
  assert.ok(!isGateCommand('rm file.txt'));
});

// --- mergeWithExisting: section order preservation ---

test('mergeWithExisting: preserves existing content verbatim', () => {
  const existing = `# Governance — test

## Identity
- Project: test

## Gates
### Code
- echo hi
`;
  const generated = `## Identity
- Project: test
## Gates
### Code
- echo hi
`;
  const merged = mergeWithExisting(existing, generated);
  // No new sections, existing preserved
  assert.ok(merged.includes('## Identity'));
  assert.ok(merged.includes('## Gates'));
  assert.ok(merged.includes('- echo hi'));
});

test('mergeWithExisting: appends new sections preserving order', () => {
  const existing = `# Governance — test

## Identity
- Project: test

## Gates
- npm test
`;
  const generated = `## Identity
- Project: test
## Deployment
- Target: docker
## Security
- No secrets
`;
  const merged = mergeWithExisting(existing, generated);
  assert.ok(merged.includes('Inferred additions'));
  assert.ok(merged.includes('## Deployment'));
  assert.ok(merged.includes('## Security'));
  // Order: Deployment should come before Security (same as in generated)
  const depIdx = merged.indexOf('## Deployment');
  const secIdx = merged.indexOf('## Security');
  assert.ok(depIdx > 0);
  assert.ok(secIdx > depIdx);
});

test('mergeWithExisting: new section body is kept with the section', () => {
  const existing = `## Identity\n- Project: test\n`;
  const generated = `## Identity\n- Project: test\n## Deployment\n- Target: docker\n- CI: github-actions\n`;
  const merged = mergeWithExisting(existing, generated);
  assert.ok(merged.includes('## Deployment'));
  assert.ok(merged.includes('- Target: docker'));
  assert.ok(merged.includes('- CI: github-actions'));
});

test('mergeWithExisting: skips sections already present', () => {
  const existing = `## Identity\n- Project: test\n## Gates\n- echo\n`;
  const generated = `## Identity\n- Project: different\n## Gates\n- something-else\n## New\n- new content\n`;
  const merged = mergeWithExisting(existing, generated);
  // Original Identity and Gates preserved
  assert.ok(merged.includes('Project: test'));
  assert.ok(merged.includes('- echo'));
  assert.ok(!merged.includes('different'));
  assert.ok(!merged.includes('something-else'));
  // New section added
  assert.ok(merged.includes('## New'));
  assert.ok(merged.includes('- new content'));
});

test('mergeWithExisting: returns existing unchanged when generated has no new sections', () => {
  const existing = `## Identity\n- Project: test\n`;
  const generated = `## Identity\n- Project: test\n`;
  const merged = mergeWithExisting(existing, generated);
  assert.strictEqual(merged, existing);
});
