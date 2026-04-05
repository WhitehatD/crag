'use strict';

const assert = require('assert');
const { extractRunCommands, isGateCommand, stripYamlQuotes } = require('../src/governance/yaml-run');

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

console.log('\n  governance/yaml-run.js');

// --- extractRunCommands ---

test('inline run step', () => {
  const yaml = `
jobs:
  test:
    steps:
      - run: npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test']);
});

test('block scalar literal (run: |)', () => {
  const yaml = `
      - run: |
          npm test
          npm run build
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test', 'npm run build']);
});

test('block scalar folded (run: >-)', () => {
  const yaml = `
      - run: >-
          npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test']);
});

test('skips comments inside block', () => {
  const yaml = `
      - run: |
          # this is a comment
          npm test
          # another comment
          npm run lint
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test', 'npm run lint']);
});

test('strips surrounding quotes from inline form', () => {
  const yaml = `
      - run: "npm test"
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test']);
});

test('preserves inner quotes when only one end is quoted (clap-style ARGS)', () => {
  // Regression: previously replace(/^["']|["']$/g, '') greedily stripped the
  // trailing quote even when no leading quote existed, truncating
  //   make test-X ARGS='--workspace --benches'
  // to
  //   make test-X ARGS='--workspace --benches
  const yaml = `
      - name: Test (benches)
        run: make test-\${{matrix.features}} ARGS='--workspace --benches'
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ["make test-${{matrix.features}} ARGS='--workspace --benches'"]);
});

test('stripYamlQuotes: only strips matching outer quotes', () => {
  assert.strictEqual(stripYamlQuotes('"hello"'), 'hello');
  assert.strictEqual(stripYamlQuotes("'hello'"), 'hello');
  // No matching outer quotes — leave alone
  assert.strictEqual(stripYamlQuotes("ARGS='--foo'"), "ARGS='--foo'");
  assert.strictEqual(stripYamlQuotes("'--foo"), "'--foo");
  assert.strictEqual(stripYamlQuotes("--foo'"), "--foo'");
  // Mixed quotes — don't strip
  assert.strictEqual(stripYamlQuotes(`"hello'`), `"hello'`);
  // Empty and plain
  assert.strictEqual(stripYamlQuotes(''), '');
  assert.strictEqual(stripYamlQuotes('plain'), 'plain');
});

test('returns empty for yaml without run steps', () => {
  const yaml = `
jobs:
  test:
    runs-on: ubuntu-latest
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, []);
});

test('multiple run blocks', () => {
  const yaml = `
      - run: npm ci
      - run: npm test
      - run: |
          npm run build
          npm run lint
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm ci', 'npm test', 'npm run build', 'npm run lint']);
});

test('handles empty content', () => {
  assert.deepStrictEqual(extractRunCommands(''), []);
  assert.deepStrictEqual(extractRunCommands('\n\n\n'), []);
});

test('handles CRLF line endings', () => {
  const yaml = '      - run: npm test\r\n      - run: npm run build\r\n';
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test', 'npm run build']);
});

// --- isGateCommand ---

test('recognizes common test and lint commands', () => {
  assert.ok(isGateCommand('npm test'));
  assert.ok(isGateCommand('npm run test'));
  assert.ok(isGateCommand('cargo test'));
  assert.ok(isGateCommand('go test ./...'));
  assert.ok(isGateCommand('pytest'));
  assert.ok(isGateCommand('npx eslint .'));
  assert.ok(isGateCommand('npx biome check .'));
  assert.ok(isGateCommand('cargo clippy -- -D warnings'));
});

test('recognizes build and type-check commands', () => {
  assert.ok(isGateCommand('tsc --noEmit'));
  assert.ok(isGateCommand('cargo build'));
  assert.ok(isGateCommand('go build ./...'));
  assert.ok(isGateCommand('./gradlew test'));
  assert.ok(isGateCommand('mvn verify'));
});

test('recognizes docker build and compose', () => {
  assert.ok(isGateCommand('docker build .'));
  assert.ok(isGateCommand('docker compose up -d'));
});

test('rejects shell utilities and unrelated commands', () => {
  assert.ok(!isGateCommand('echo hello'));
  assert.ok(!isGateCommand('cd src'));
  assert.ok(!isGateCommand('rm file.txt'));
  assert.ok(!isGateCommand('git log'));
  assert.ok(!isGateCommand('mkdir foo'));
  assert.ok(!isGateCommand('export PATH=/usr/bin'));
});

// --- isGateCommand: CI-plumbing false-positive rejections (v0.2.10) ---
// These are commands that the old isGateCommand mis-classified as gates
// because the substring match tripped on text inside quoted strings or
// on keywords that happen to appear in setup/release verbs.

test('rejects echoes that embed gate keywords in quoted strings', () => {
  // Real example from crag's release.yml — echoing an install hint.
  assert.ok(!isGateCommand('echo "**Install:** \\`npm install -g @whitehatd/crag@$VERSION\\`"'));
  assert.ok(!isGateCommand('echo "run npm test to check"'));
  assert.ok(!isGateCommand('printf "cargo build done\\n"'));
});

test('rejects variable assignments whose RHS mentions gate keywords', () => {
  assert.ok(!isGateCommand('VERSION=$(node -p "require(\'./package.json\').version")'));
  assert.ok(!isGateCommand('PKG_NAME=$(node -p "require(\'./package.json\').name")'));
  assert.ok(!isGateCommand('NEW_VERSION=$(npm view pkg version)'));
  assert.ok(!isGateCommand('RESULT=$(cargo test)'));
});

test('rejects git config, push, merge and other git plumbing', () => {
  assert.ok(!isGateCommand('git config user.name "github-actions[bot]"'));
  assert.ok(!isGateCommand('git push origin main'));
  assert.ok(!isGateCommand('git commit -m "foo"'));
  assert.ok(!isGateCommand('git tag -a v1.0.0 -m "release"'));
  assert.ok(!isGateCommand('git merge feat/foo'));
});

test('rejects npm release/publish verbs', () => {
  assert.ok(!isGateCommand('npm publish --access=public'));
  assert.ok(!isGateCommand('npm view @whitehatd/crag version'));
  assert.ok(!isGateCommand('npm pack --dry-run'));
});

test('rejects GitHub Actions output plumbing', () => {
  assert.ok(!isGateCommand('echo "key=value" >> "$GITHUB_OUTPUT"'));
  assert.ok(!isGateCommand('echo "summary" >> $GITHUB_STEP_SUMMARY'));
  assert.ok(!isGateCommand('echo "PATH=/foo" >> $GITHUB_ENV'));
});

test('rejects release scripts and release npm run targets', () => {
  assert.ok(!isGateCommand('node scripts/bump-version.js patch'));
  assert.ok(!isGateCommand('node scripts/release.js'));
  assert.ok(!isGateCommand('node scripts/sync-skill-hashes.js'));
  assert.ok(!isGateCommand('npm run release'));
  assert.ok(!isGateCommand('npm run publish'));
  assert.ok(!isGateCommand('npm run sync-hashes'));
  assert.ok(!isGateCommand('npm run prepublish'));
});

test('rejects shell control-flow keywords on their own line', () => {
  assert.ok(!isGateCommand('if [ -f file ]; then'));
  assert.ok(!isGateCommand('for f in *.js; do'));
  assert.ok(!isGateCommand('while read line; do'));
  assert.ok(!isGateCommand('fi'));
  assert.ok(!isGateCommand('done'));
});

test('rejects filesystem setup that is not a gate', () => {
  assert.ok(!isGateCommand('mkdir -p dist'));
  assert.ok(!isGateCommand('touch file.txt'));
  assert.ok(!isGateCommand('chmod +x script.sh'));
  assert.ok(!isGateCommand('cp src/template.md dest/'));
});

test('still accepts legitimate gates that happen to look similar', () => {
  // These should still be recognized as gates.
  assert.ok(isGateCommand('npm run test'));
  assert.ok(isGateCommand('npm test'));
  assert.ok(isGateCommand('npm install'));  // install IS a prereq gate
  assert.ok(isGateCommand('cargo clippy -- -D warnings'));
  assert.ok(isGateCommand('./gradlew test'));
  assert.ok(isGateCommand('node --check bin/crag.js'));
});

test('rejects non-string input', () => {
  assert.ok(!isGateCommand(null));
  assert.ok(!isGateCommand(undefined));
  assert.ok(!isGateCommand(42));
  assert.ok(!isGateCommand(''));
});
