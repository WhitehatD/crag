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

test('isNoise: dev scripts under scripts/ (FastAPI-style)', () => {
  // Python runners invoking scripts/ files — publishing/doc automations
  assert.ok(isNoise('uv run ./scripts/docs.py update-languages'));
  assert.ok(isNoise('uv run ./scripts/contributors.py'));
  assert.ok(isNoise('uv run scripts/deploy_docs_status.py'));
  assert.ok(isNoise('poetry run ./scripts/publish.py'));
  assert.ok(isNoise('pdm run scripts/bump.py'));
  assert.ok(isNoise('hatch run ./scripts/release.py'));
  // Direct interpreters
  assert.ok(isNoise('python ./scripts/gen.py'));
  assert.ok(isNoise('python3 scripts/migrate.py'));
  assert.ok(isNoise('node ./scripts/build.js'));
  assert.ok(isNoise('node scripts/codegen.mjs'));
  assert.ok(isNoise('bash ./scripts/setup.sh'));
  assert.ok(isNoise('sh scripts/install.sh'));
  assert.ok(isNoise('npx tsx scripts/migrate.ts'));
  assert.ok(isNoise('npx ts-node ./scripts/gen.ts'));
  // Must NOT reject real gates that look superficially similar
  assert.ok(!isNoise('uv run pytest'));
  assert.ok(!isNoise('uv run mypy .'));
  assert.ok(!isNoise('poetry run tox run'));
  assert.ok(!isNoise('python -m build'));
  assert.ok(!isNoise('npx tsc --noEmit'));
});

test('isNoise: shell control-flow fragments from block scalars', () => {
  // Leaked from `run: |` multi-line blocks in smokeshow.yml etc.
  assert.ok(isNoise('if uv run smokeshow upload htmlcov; then'));
  assert.ok(isNoise('for i in 1 2 3 4 5; do'));
  assert.ok(isNoise('while read line; do'));
  assert.ok(isNoise('case $VAR in'));
  assert.ok(isNoise('then'));
  assert.ok(isNoise('else'));
  assert.ok(isNoise('fi'));
  assert.ok(isNoise('done'));
  assert.ok(isNoise('esac'));
  // Must NOT reject commands that contain these words mid-string
  assert.ok(!isNoise('make doifile'));
  assert.ok(!isNoise('cargo test'));
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
