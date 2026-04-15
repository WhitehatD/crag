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

// Regression: stress-test on 101 OSS repos found these leaks
test('isNoise: standalone shell builtins (break, exit, continue, shift)', () => {
  // vscode's workflows use `npm ci || break` in retry loops
  assert.ok(isNoise('break'));
  assert.ok(isNoise('break 2'));
  assert.ok(isNoise('continue'));
  assert.ok(isNoise('return'));
  assert.ok(isNoise('exit'));
  assert.ok(isNoise('exit 0'));
  assert.ok(isNoise('exit 1'));
  assert.ok(isNoise('shift'));
  assert.ok(isNoise('trap'));
  assert.ok(isNoise('pushd /tmp'));
  assert.ok(isNoise('popd'));
  // Must NOT reject commands that merely contain these words
  assert.ok(!isNoise('cargo test --no-exit-on-first-fail'));
  assert.ok(!isNoise('make break-stuff'));
});

test('isNoise: backslash line continuations leak from block scalars', () => {
  // duckdb workflow: `run: | \n  make \\\n    target` → extractor captures `make \`
  assert.ok(isNoise('make \\'));
  assert.ok(isNoise('\\'));
  assert.ok(isNoise('\\\\'));
  assert.ok(isNoise('make gather-libs \\'));
  // Real commands must not match
  assert.ok(!isNoise('make test'));
});

test('isNoise: version / health probes across tools', () => {
  // Common workflow sanity checks
  assert.ok(isNoise('node --version'));
  assert.ok(isNoise('node -v'));
  assert.ok(isNoise('go version'));
  assert.ok(isNoise('rustc --version'));
  assert.ok(isNoise('python --version'));
  assert.ok(isNoise('python3 --version'));
  assert.ok(isNoise('npm --version'));
  assert.ok(isNoise('yarn --version'));
  assert.ok(isNoise('pnpm --version'));
  assert.ok(isNoise('java --version'));
  assert.ok(isNoise('gcc --version'));
  assert.ok(isNoise('clang --version'));
  assert.ok(isNoise('shellcheck --version'));
  assert.ok(isNoise('deno --version'));
  // With `|| true` fallback
  assert.ok(isNoise('node --version || true'));
  // `which X` probes
  assert.ok(isNoise('which node'));
  assert.ok(isNoise('which node || true'));
  assert.ok(isNoise('which'));
  // Real commands must not match
  assert.ok(!isNoise('cargo test'));
  assert.ok(!isNoise('node bin/crag.js version'));
});

test('isNoise: cross-language print/output leaks', () => {
  // Ruby code embedded in `run: |` (ruby/workflow/bundled_gems.yml)
  assert.ok(isNoise('puts "::info:: just after released"'));
  assert.ok(isNoise('print("hello")'));
  assert.ok(isNoise('printf "%s\\n" "done"'));
  assert.ok(isNoise('console.log("test")'));
  assert.ok(isNoise('die "oops"'));
  assert.ok(isNoise('raise RuntimeError'));
  assert.ok(isNoise('throw new Error("x")'));
  // Must NOT reject commands that contain these as substrings
  assert.ok(!isNoise('printf-tests'));
});

test('isNoise: variable assignments from embedded code', () => {
  // Ruby workflow: `rake_version = File.read("...")` as a captured "command"
  assert.ok(isNoise('rake_version = File.read("gems/bundled_gems")'));
  assert.ok(isNoise('foo = "bar"'));
  assert.ok(isNoise('FOO=bar'));
  // Must NOT reject env-prefixed commands where the assignment prefixes a real command
  assert.ok(!isNoise('FOO=bar cargo test'));
});

test('isNoise: subshell fragments from multi-line compounds', () => {
  // gatsby workflow captured `exit 1) || npx -p renovate...` as a fragment
  assert.ok(isNoise(')'));
  assert.ok(isNoise(') || npx renovate'));
  assert.ok(isNoise(') && echo done'));
});

test('isNoise: process substitution / curl-pipe-bash install scripts', () => {
  // duckdb workflow has `bash <(curl --retry 5 https://...)` for actionlint install
  assert.ok(isNoise('bash <(curl --retry 5 https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)'));
  assert.ok(isNoise('sh <(curl -sL https://example.com/installer.sh)'));
  assert.ok(isNoise('curl https://example.com/script.sh | bash'));
  assert.ok(isNoise('wget -O - https://example.com/install.sh | sh'));
});

// --- extractMainCommand — split on `;` as well as `&&` ---
test('extractMainCommand: splits on semicolon', () => {
  assert.strictEqual(
    extractMainCommand('cd test ; npm install ; npm run lint'),
    'npm run lint'
  );
});

test('extractMainCommand: returns empty when all parts are noise', () => {
  // `npm ci && break` has all-noise parts — should return '' so caller rejects
  assert.strictEqual(extractMainCommand('npm ci && break'), '');
  assert.strictEqual(extractMainCommand('cd /tmp && exit 1'), '');
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

test('isNoise: node_modules direct references (setup scripts)', () => {
  assert.ok(isNoise('node node_modules/puppeteer/install.mjs'));
  assert.ok(isNoise('node node_modules/.bin/some-tool'));
  // Real node commands must not match
  assert.ok(!isNoise('node bin/crag.js'));
  assert.ok(!isNoise('node --check src/cli.js'));
});

test('isNoise: CI orchestration commands', () => {
  assert.ok(isNoise('npx nx-cloud start-ci-run --distribute-on=".nx/workflows/dynamic-changesets.yaml"'));
  assert.ok(isNoise('npx nx-cloud stop-all-agents'));
  // Real nx commands must not match
  assert.ok(!isNoise('npx nx run test'));
  assert.ok(!isNoise('npx nx affected --target=test'));
});

test('isNoise: make install/clean/cross-directory builds', () => {
  assert.ok(isNoise('make install'));
  assert.ok(isNoise('make clean'));
  assert.ok(isNoise('make -j1 install_sw'));
  assert.ok(isNoise('make -C bld V=1'));
  assert.ok(isNoise('make -C bld -C tests'));
  assert.ok(isNoise('time make -C bld install'));
  // Real make targets must not match
  assert.ok(!isNoise('make test'));
  assert.ok(!isNoise('make V=1'));
  assert.ok(!isNoise('make test-ci'));
  assert.ok(!isNoise('make lint'));
});

test('isNoise: npx setup/install commands (not gates)', () => {
  // Browser/tool installation via npx
  assert.ok(isNoise('npx playwright install --with-deps chromium'));
  assert.ok(isNoise('npx playwright install --with-deps'));
  assert.ok(isNoise('npx playwright install-deps'));
  assert.ok(isNoise('npx puppeteer install'));
  assert.ok(isNoise('npx cypress install'));
  assert.ok(isNoise('npx husky install'));
  assert.ok(isNoise('npx browserslist --update-db'));
  assert.ok(isNoise('npx patch-package'));
  assert.ok(isNoise('npx prisma generate'));
  assert.ok(isNoise('npx prisma migrate deploy'));
  // Must NOT reject real npx gates
  assert.ok(!isNoise('npx tsc --noEmit'));
  assert.ok(!isNoise('npx eslint .'));
  assert.ok(!isNoise('npx jest'));
  assert.ok(!isNoise('npx nx run test'));
  assert.ok(!isNoise('npx vitest'));
});

test('isNoise: node inline eval', () => {
  assert.ok(isNoise('node -e "console.log(1)"'));
  assert.ok(isNoise('node --eval "process.exit(0)"'));
  assert.ok(isNoise('node -p "require(\'./package.json\').version"'));
  // Must NOT reject real node gates
  assert.ok(!isNoise('node bin/crag.js'));
  assert.ok(!isNoise('node --check src/cli.js'));
});

test('isNoise: docker setup commands (not build)', () => {
  assert.ok(isNoise('docker run --rm redis:7'));
  assert.ok(isNoise('docker pull node:18'));
  assert.ok(isNoise('docker compose up -d'));
  assert.ok(isNoise('docker compose pull'));
  // Must NOT reject real docker gates
  assert.ok(!isNoise('docker build .'));
  assert.ok(!isNoise('docker compose build'));
});

test('isNoise: go install/generate (not test/build)', () => {
  assert.ok(isNoise('go install golang.org/x/tools/gopls@latest'));
  assert.ok(isNoise('go generate ./...'));
  // Must NOT reject real go gates
  assert.ok(!isNoise('go test ./...'));
  assert.ok(!isNoise('go build ./...'));
  assert.ok(!isNoise('go vet ./...'));
});

test('isNoise: GitHub Actions expressions (CI-only)', () => {
  assert.ok(isNoise('uv run coverage html --title "Coverage for ${{ github.sha }}"'));
  assert.ok(isNoise('echo ${{ secrets.NPM_TOKEN }}'));
  assert.ok(isNoise('curl -H "Authorization: ${{ steps.auth.outputs.token }}"'));
  // Note: matrix/env expressions are canonicalized BEFORE isNoise runs,
  // so isNoise never sees raw ${{ matrix.* }} or ${{ env.* }}.
  // After canonicalization they become e.g. "npm run test -- <node-version>"
  // which isNoise correctly allows.
});

test('isNoise: coverage report commands (not enforcement)', () => {
  assert.ok(isNoise('coverage combine coverage'));
  assert.ok(isNoise('uv run coverage html --title "Coverage report"'));
  assert.ok(isNoise('coverage xml'));
  assert.ok(isNoise('coverage json'));
  assert.ok(isNoise('coverage report'));
  // coverage with --fail-under IS a gate
  assert.ok(!isNoise('uv run coverage report --fail-under=100'));
  assert.ok(!isNoise('coverage report --fail-under=80'));
});

test('isNoise: benchmark-specific test flags', () => {
  assert.ok(isNoise('uv run --no-sync pytest tests/benchmarks --codspeed'));
  // Regular pytest is NOT noise
  assert.ok(!isNoise('uv run pytest'));
  assert.ok(!isNoise('pytest tests/'));
});
