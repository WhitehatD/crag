'use strict';

const assert = require('assert');
const { normalizeCiGates, canonicalize, isNoise, extractMainCommand } = require('../src/analyze/normalize');

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

console.log('\n  analyze/normalize.js');

// --- canonicalize ---
test('canonicalize: collapses ${{ matrix.X }} tokens', () => {
  assert.strictEqual(canonicalize('cargo test --target ${{ matrix.target }}'),
    'cargo test --target <matrix>');
});

test('canonicalize: collapses ${{ env.X }} tokens', () => {
  assert.strictEqual(canonicalize('cargo test --target ${{ env.TARGET }}'),
    'cargo test --target <env>');
});

test('canonicalize: generic ${{ ... }} → <expr>', () => {
  assert.strictEqual(canonicalize('echo ${{ steps.out.outputs.x }}'),
    'echo <expr>');
});

// --- isNoise ---
test('isNoise: background processes', () => {
  assert.ok(isNoise('node integration/server.js &'));
});

test('isNoise: npm install variants', () => {
  assert.ok(isNoise('npm install --ignore-scripts'));
  assert.ok(isNoise('npm ci'));
  assert.ok(isNoise('npm install --no-save ../artifacts/x.tgz'));
  assert.ok(isNoise('pnpm install'));
  assert.ok(isNoise('bun install'));
});

test('isNoise: pip / uv sync', () => {
  assert.ok(isNoise('pip install -e .'));
  assert.ok(isNoise('uv sync --no-dev'));
  assert.ok(isNoise('python -m pip install build'));
});

test('isNoise: echo / export / GITHUB_CONTEXT', () => {
  assert.ok(isNoise('echo hello'));
  assert.ok(isNoise('export PATH=$HOME/bin:$PATH'));
  assert.ok(isNoise('echo "$GITHUB_CONTEXT"'));
});

test('isNoise: mkdir / rm / cp setup', () => {
  assert.ok(isNoise('mkdir coverage'));
  assert.ok(isNoise('rm -rf build'));
});

test('isNoise: rejects real gates', () => {
  assert.ok(!isNoise('npm run test'));
  assert.ok(!isNoise('cargo test'));
  assert.ok(!isNoise('pytest'));
  assert.ok(!isNoise('./gradlew build'));
  assert.ok(!isNoise('vendor/bin/phpunit'));
});

// --- extractMainCommand ---
test('extractMainCommand: strips leading cd and npm install', () => {
  assert.strictEqual(
    extractMainCommand('cd test/bundler/webpack && npm install && npm run test'),
    'npm run test'
  );
});

test('extractMainCommand: returns single command unchanged', () => {
  assert.strictEqual(extractMainCommand('cargo test'), 'cargo test');
});

// --- normalizeCiGates ---
test('normalizeCiGates: dedupes exact matches', () => {
  const result = normalizeCiGates(['cargo test', 'cargo test', 'cargo clippy']);
  assert.deepStrictEqual(result, ['cargo test', 'cargo clippy']);
});

test('normalizeCiGates: dedupes matrix-expanded variants', () => {
  const result = normalizeCiGates([
    'cargo test --target ${{ matrix.target }}',
    'cargo test --target ${{ matrix.target }}',
    'cargo test --target x86_64-unknown-linux-gnu',
  ]);
  // Only 2 canonical: the matrix form (collapsed) and the concrete one
  assert.ok(result.length <= 2);
});

test('normalizeCiGates: filters background processes', () => {
  const result = normalizeCiGates([
    'node integration/server.js &',
    'npm run test',
  ]);
  assert.deepStrictEqual(result, ['npm run test']);
});

test('normalizeCiGates: caps at maxGates', () => {
  const many = Array.from({ length: 20 }, (_, i) => `cargo test --feature feat${i}`);
  const result = normalizeCiGates(many, { maxGates: 5 });
  assert.strictEqual(result.length, 5);
});

test('normalizeCiGates: real-world axios-like matrix dump collapses to few gates', () => {
  // Simulating what the benchmark showed for axios/fastify
  const raw = [
    'npm install --ignore-scripts',
    'npm install --ignore-scripts',
    'npm install --no-save ../../../artifacts/axios-*.tgz',
    'npm run test:vitest:unit',
    'npm install --ignore-scripts',
    'npm run test:vitest:browser:headless',
    'npm install --ignore-scripts',
    'npm run test:smoke:cjs:mocha',
    'npm install --ignore-scripts',
    'npm run test:smoke:esm:vitest',
    'echo "::set-output name=newTag::$(node -p \\"require(\\\'./package.json\\\').version\\")"',
    'npm ci --ignore-scripts',
  ];
  const result = normalizeCiGates(raw);
  // Should keep the distinct test variants, drop installs and echo
  assert.ok(result.length <= 8, `expected ≤8 gates, got ${result.length}: ${JSON.stringify(result)}`);
  assert.ok(result.some(r => r.includes('test:vitest:unit')));
  assert.ok(!result.some(r => r.includes('npm install')), 'installs leaked');
  assert.ok(!result.some(r => r.includes('set-output')), 'set-output leaked');
});
