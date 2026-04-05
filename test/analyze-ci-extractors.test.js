'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractCiCommands } = require('../src/analyze/ci-extractors');

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

function mkFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-ci-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

console.log('\n  analyze/ci-extractors.js');

test('extractCiCommands: GitHub Actions', () => {
  const dir = mkFixture({
    '.github/workflows/test.yml': `
name: Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
      - run: cargo clippy -- -D warnings
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'github-actions');
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('cargo clippy -- -D warnings'));
});

test('extractCiCommands: GitLab CI script list', () => {
  const dir = mkFixture({
    '.gitlab-ci.yml': `
test:
  script:
    - npm ci
    - npm test
    - npm run lint
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'gitlab-ci');
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('npm run lint'));
});

test('extractCiCommands: CircleCI inline run', () => {
  const dir = mkFixture({
    '.circleci/config.yml': `
version: 2.1
jobs:
  build:
    steps:
      - run: cargo test
      - run: cargo clippy
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'circle-ci');
  assert.ok(commands.includes('cargo test'));
  assert.ok(commands.includes('cargo clippy'));
});

test('extractCiCommands: Travis CI script block', () => {
  const dir = mkFixture({
    '.travis.yml': `
language: ruby
script:
  - bundle exec rspec
  - bundle exec rubocop
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'travis-ci');
  assert.ok(commands.includes('bundle exec rspec'));
});

test('extractCiCommands: Azure Pipelines script', () => {
  const dir = mkFixture({
    'azure-pipelines.yml': `
steps:
- script: dotnet test
  displayName: Run tests
- script: dotnet build
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'azure-pipelines');
  assert.ok(commands.includes('dotnet test'));
  assert.ok(commands.includes('dotnet build'));
});

test('extractCiCommands: Buildkite commands list', () => {
  const dir = mkFixture({
    '.buildkite/pipeline.yml': `
steps:
  - label: test
    commands:
      - go test ./...
      - go vet ./...
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'buildkite');
  assert.ok(commands.includes('go test ./...'));
});

test('extractCiCommands: Drone commands list', () => {
  const dir = mkFixture({
    '.drone.yml': `
kind: pipeline
steps:
  - name: test
    commands:
      - make test
      - make lint
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'drone');
  assert.ok(commands.includes('make test'));
});

test('extractCiCommands: Bitbucket script', () => {
  const dir = mkFixture({
    'bitbucket-pipelines.yml': `
pipelines:
  default:
    - step:
        script:
          - pytest
          - ruff check .
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'bitbucket');
  assert.ok(commands.includes('pytest'));
  assert.ok(commands.includes('ruff check .'));
});

test('extractCiCommands: no CI returns null system and empty commands', () => {
  const dir = mkFixture({ 'README.md': 'no ci here' });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, null);
  assert.deepStrictEqual(commands, []);
});
