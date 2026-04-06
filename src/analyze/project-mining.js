'use strict';

const fs = require('fs');
const path = require('path');

// ── 1. Key Directories ──────────────────────────────────────────────

const DIR_ROLES = {
  'src': 'source', 'lib': 'source', 'libs': 'source', 'pkg': 'source',
  'test': 'tests', 'tests': 'tests', 'spec': 'tests', 'specs': 'tests',
  '__tests__': 'tests', 'e2e': 'tests', 'integration': 'tests',
  'docs': 'documentation', 'doc': 'documentation',
  '.github': 'CI/CD', '.gitlab': 'CI/CD', '.circleci': 'CI/CD',
  'scripts': 'tooling', 'tools': 'tooling', 'ci': 'tooling',
  'bin': 'executables', 'cmd': 'executables',
  'public': 'static assets', 'static': 'static assets', 'assets': 'static assets',
  'migrations': 'database', 'db': 'database', 'prisma': 'database',
  'deploy': 'infrastructure', 'infra': 'infrastructure', 'k8s': 'infrastructure',
  'terraform': 'infrastructure', 'helm': 'infrastructure',
  'packages': 'workspace packages', 'apps': 'workspace apps', 'services': 'workspace services',
  'crates': 'workspace crates', 'modules': 'modules',
  'web': 'frontend', 'frontend': 'frontend', 'client': 'frontend', 'ui': 'frontend',
  'api': 'backend', 'backend': 'backend', 'server': 'backend',
  'config': 'configuration', '.config': 'configuration',
};

function mineKeyDirectories(cwd) {
  const dirs = [];
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name = e.name;
      if (name === 'node_modules' || name === '.git' || name === 'vendor' ||
          name === 'target' || name === 'dist' || name === 'build' ||
          name === '__pycache__' || name === '.next' || name === 'coverage') continue;
      const role = DIR_ROLES[name] || null;
      if (role) dirs.push({ dir: name + '/', role });
    }
  } catch { /* permission error or missing dir */ }
  return dirs;
}

// ── 2. Architecture ─────────────────────────────────────────────────

function mineArchitecture(cwd, analysis) {
  const arch = { type: 'monolith', entryPoints: [], workspaceLayout: null, services: [] };

  // Classify project type
  if (analysis.workspaceType || (analysis._manifests && analysis._manifests.cargoWorkspace) ||
      (analysis._manifests && analysis._manifests.goWorkspace)) {
    arch.type = 'monorepo';
    arch.workspaceLayout = analysis.workspaceType || 'cargo';
  }
  if (analysis.subservices && analysis.subservices.length > 2) {
    arch.type = 'microservices';
    arch.services = analysis.subservices.map(s => s.name);
  }

  // Entry points
  const pkg = analysis._manifests && analysis._manifests.packageJson;
  if (pkg) {
    if (pkg.main) arch.entryPoints.push(pkg.main);
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') arch.entryPoints.push(pkg.bin);
      else if (typeof pkg.bin === 'object') arch.entryPoints.push(...Object.values(pkg.bin));
    }
    // Classify as library if no bin and has main/exports
    if (!pkg.bin && (pkg.main || pkg.exports) && !pkg.scripts) arch.type = 'library';
    // Classify as CLI if has bin
    if (pkg.bin) arch.type = arch.type === 'monorepo' ? 'monorepo' : 'cli';
  }

  return arch;
}

// ── 3. Testing Profile ──────────────────────────────────────────────

const TEST_FRAMEWORKS = {
  'jest': 'jest', '@jest/core': 'jest',
  'vitest': 'vitest',
  'mocha': 'mocha',
  'ava': 'ava',
  'tape': 'tape',
  'pytest': 'pytest',
  'junit': 'JUnit',
};

function mineTestingProfile(cwd, analysis) {
  const profile = { framework: null, layout: 'flat', hasSnapshots: false, hasCoverage: false, namingPattern: null };

  // Detect framework from deps
  const pkg = analysis._manifests && analysis._manifests.packageJson;
  if (pkg) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, fw] of Object.entries(TEST_FRAMEWORKS)) {
      if (allDeps[dep]) { profile.framework = fw; break; }
    }
  }
  // Python
  if (!profile.framework && analysis.stack.includes('python')) profile.framework = 'pytest';
  // Rust
  if (!profile.framework && analysis.stack.includes('rust')) profile.framework = 'cargo test';
  // Go
  if (!profile.framework && analysis.stack.includes('go')) profile.framework = 'go test';

  // Directory layout
  const testDirs = [];
  for (const name of ['test', 'tests', 'spec', '__tests__']) {
    const dir = path.join(cwd, name);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      testDirs.push(name);
      try {
        const subs = fs.readdirSync(dir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name);
        if (subs.includes('unit') || subs.includes('integration') || subs.includes('e2e')) {
          profile.layout = 'structured';
          if (subs.includes('unit') && subs.includes('integration')) profile.layout = 'unit + integration';
          if (subs.includes('e2e')) profile.layout += ' + e2e';
        }
      } catch { /* ignore */ }
    }
  }

  // Snapshots
  try {
    const testDir = testDirs[0] || 'test';
    const snap = path.join(cwd, testDir, '__snapshots__');
    if (fs.existsSync(snap)) profile.hasSnapshots = true;
    // Rust insta
    if (fs.existsSync(path.join(cwd, 'src', 'snapshots'))) profile.hasSnapshots = true;
  } catch { /* ignore */ }

  // Coverage config
  if (fs.existsSync(path.join(cwd, '.nycrc')) ||
      fs.existsSync(path.join(cwd, '.nycrc.json')) ||
      fs.existsSync(path.join(cwd, 'codecov.yml')) ||
      fs.existsSync(path.join(cwd, '.coveragerc')) ||
      fs.existsSync(path.join(cwd, 'jest.config.js')) ||
      fs.existsSync(path.join(cwd, 'vitest.config.ts'))) {
    profile.hasCoverage = true;
  }

  // Naming pattern
  if (testDirs.length > 0) {
    try {
      const dir = path.join(cwd, testDirs[0]);
      const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
      if (files.some(f => f.endsWith('.test.js') || f.endsWith('.test.ts'))) profile.namingPattern = '*.test.{js,ts}';
      else if (files.some(f => f.endsWith('.spec.js') || f.endsWith('.spec.ts'))) profile.namingPattern = '*.spec.{js,ts}';
      else if (files.some(f => f.startsWith('test_') && f.endsWith('.py'))) profile.namingPattern = 'test_*.py';
      else if (files.some(f => f.endsWith('_test.go'))) profile.namingPattern = '*_test.go';
    } catch { /* ignore */ }
  }

  return profile;
}

// ── 4. Code Style ───────────────────────────────────────────────────

function mineCodeStyle(cwd) {
  const style = { indent: null, lineLength: null, formatter: null, linter: null };

  // .editorconfig
  try {
    const ec = fs.readFileSync(path.join(cwd, '.editorconfig'), 'utf-8');
    const indentMatch = ec.match(/indent_style\s*=\s*(\w+)/);
    const sizeMatch = ec.match(/indent_size\s*=\s*(\d+)/);
    if (indentMatch) style.indent = `${sizeMatch ? sizeMatch[1] : '?'} ${indentMatch[1] === 'tab' ? 'tabs' : 'spaces'}`;
    const lineMatch = ec.match(/max_line_length\s*=\s*(\d+)/);
    if (lineMatch) style.lineLength = parseInt(lineMatch[1], 10);
  } catch { /* no editorconfig */ }

  // Detect formatter
  for (const f of ['.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.js', 'prettier.config.js']) {
    if (fs.existsSync(path.join(cwd, f))) { style.formatter = 'prettier'; break; }
  }
  if (!style.formatter && fs.existsSync(path.join(cwd, 'biome.json'))) style.formatter = 'biome';
  if (!style.formatter && fs.existsSync(path.join(cwd, 'biome.jsonc'))) style.formatter = 'biome';
  if (!style.formatter && fs.existsSync(path.join(cwd, 'rustfmt.toml'))) style.formatter = 'rustfmt';
  if (!style.formatter && fs.existsSync(path.join(cwd, '.style.yapf'))) style.formatter = 'yapf';

  // Detect linter
  for (const f of ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts']) {
    if (fs.existsSync(path.join(cwd, f))) { style.linter = 'eslint'; break; }
  }
  if (!style.linter && fs.existsSync(path.join(cwd, 'biome.json'))) style.linter = 'biome';
  if (!style.linter && fs.existsSync(path.join(cwd, 'ruff.toml'))) style.linter = 'ruff';
  if (!style.linter && fs.existsSync(path.join(cwd, '.golangci.yml'))) style.linter = 'golangci-lint';
  if (!style.linter && fs.existsSync(path.join(cwd, '.rubocop.yml'))) style.linter = 'rubocop';

  // Read biome/prettier for line length if not from editorconfig
  if (!style.lineLength) {
    try {
      const biome = JSON.parse(fs.readFileSync(path.join(cwd, 'biome.json'), 'utf-8'));
      if (biome.formatter && biome.formatter.lineWidth) style.lineLength = biome.formatter.lineWidth;
    } catch { /* ignore */ }
  }
  if (!style.lineLength) {
    try {
      const ruff = fs.readFileSync(path.join(cwd, 'ruff.toml'), 'utf-8');
      const m = ruff.match(/line-length\s*=\s*(\d+)/);
      if (m) style.lineLength = parseInt(m[1], 10);
    } catch { /* ignore */ }
  }

  return style;
}

// ── 5. Import Conventions ───────────────────────────────────────────

function mineImportConventions(cwd, analysis) {
  const conv = { moduleSystem: null, pathAliases: [], tsModule: null };

  const pkg = analysis._manifests && analysis._manifests.packageJson;
  if (pkg) {
    conv.moduleSystem = pkg.type === 'module' ? 'ESM' : 'CJS';
  }

  // tsconfig
  try {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf-8'));
    const co = tsconfig.compilerOptions || {};
    if (co.module) conv.tsModule = co.module;
    if (co.paths) {
      conv.pathAliases = Object.keys(co.paths).map(k => k.replace('/*', '/'));
    }
    if (co.baseUrl && conv.pathAliases.length === 0) {
      conv.pathAliases.push(co.baseUrl);
    }
  } catch { /* no tsconfig */ }

  return conv;
}

// ── 6. Dependency Policy ────────────────────────────────────────────

function mineDependencyPolicy(cwd, analysis) {
  const policy = { packageManager: null, lockfile: null, engines: {} };

  const pkg = analysis._manifests && analysis._manifests.packageJson;

  // Lockfile
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) { policy.lockfile = 'pnpm-lock.yaml'; policy.packageManager = 'pnpm'; }
  else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) { policy.lockfile = 'yarn.lock'; policy.packageManager = 'yarn'; }
  else if (fs.existsSync(path.join(cwd, 'package-lock.json'))) { policy.lockfile = 'package-lock.json'; policy.packageManager = 'npm'; }
  else if (fs.existsSync(path.join(cwd, 'bun.lockb'))) { policy.lockfile = 'bun.lockb'; policy.packageManager = 'bun'; }
  else if (fs.existsSync(path.join(cwd, 'Cargo.lock'))) { policy.lockfile = 'Cargo.lock'; policy.packageManager = 'cargo'; }
  else if (fs.existsSync(path.join(cwd, 'poetry.lock'))) { policy.lockfile = 'poetry.lock'; policy.packageManager = 'poetry'; }
  else if (fs.existsSync(path.join(cwd, 'uv.lock'))) { policy.lockfile = 'uv.lock'; policy.packageManager = 'uv'; }
  else if (fs.existsSync(path.join(cwd, 'go.sum'))) { policy.lockfile = 'go.sum'; policy.packageManager = 'go'; }

  // packageManager field
  if (pkg && pkg.packageManager) {
    const m = pkg.packageManager.match(/^(\w+)@/);
    if (m) policy.packageManager = m[1];
  }

  // Engine constraints
  if (pkg && pkg.engines) {
    if (pkg.engines.node) policy.engines.node = pkg.engines.node;
    if (pkg.engines.npm) policy.engines.npm = pkg.engines.npm;
  }

  // Python requires-python
  if (analysis._manifests && analysis._manifests.pyproject) {
    const py = analysis._manifests.pyproject;
    if (py.values && py.values['requires-python']) {
      policy.engines.python = py.values['requires-python'];
    }
  }

  // Go version
  try {
    const gomod = fs.readFileSync(path.join(cwd, 'go.mod'), 'utf-8');
    const m = gomod.match(/^go\s+([\d.]+)/m);
    if (m) policy.engines.go = '>=' + m[1];
  } catch { /* no go.mod */ }

  // Rust edition
  try {
    const cargo = fs.readFileSync(path.join(cwd, 'Cargo.toml'), 'utf-8');
    const m = cargo.match(/rust-version\s*=\s*"([\d.]+)"/);
    if (m) policy.engines.rust = '>=' + m[1];
    const ed = cargo.match(/edition\s*=\s*"(\d+)"/);
    if (ed) policy.engines['rust-edition'] = ed[1];
  } catch { /* no Cargo.toml */ }

  return policy;
}

// ── 7. Anti-Patterns ────────────────────────────────────────────────

const ANTI_PATTERNS = {
  typescript: [
    'Do not use `any` type — use `unknown` or proper types instead',
    'Do not use `@ts-ignore` — fix the type error or use `@ts-expect-error` with a reason',
    'Prefer `as const` over `enum` for string unions',
  ],
  node: [
    'Do not leave `console.log` in production code — use a proper logger',
    'Do not use synchronous filesystem APIs in request handlers',
  ],
  rust: [
    'Do not use `unwrap()` in library code — return `Result` instead',
    'Do not `clone()` without justification — prefer borrowing',
    'Do not use `unsafe` without a safety comment explaining invariants',
  ],
  python: [
    'Do not catch bare `Exception` — catch specific exceptions',
    'Do not use mutable default arguments (e.g., `def f(x=[])`)',
    'Do not use `import *` — use explicit imports',
  ],
  go: [
    'Do not ignore returned errors — handle or explicitly discard with `_ =`',
    'Do not use `panic()` in library code — return errors instead',
    'Do not use `init()` functions unless absolutely necessary',
  ],
  react: [
    'Do not use class components — use functional components with hooks',
    'Do not mutate state directly — use setter functions or immutable updates',
  ],
  'next.js': [
    'Do not use `getServerSideProps`/`getStaticProps` with App Router — use Server Components',
    'Do not use `pages/api/` with App Router — use `app/api/` route handlers',
  ],
  docker: [
    'Do not use `latest` tag in FROM — pin to a specific version',
    'Do not run containers as root — use a non-root USER',
  ],
  java: [
    'Do not catch generic `Exception` — catch specific exception types',
    'Do not use raw types — use generics',
  ],
  php: [
    'Do not use `eval()` or `exec()` with user input',
    'Do not suppress errors with `@` operator',
  ],
};

function mineAntiPatterns(analysis) {
  const patterns = [];
  for (const stack of analysis.stack) {
    const key = stack.toLowerCase();
    if (ANTI_PATTERNS[key]) patterns.push(...ANTI_PATTERNS[key]);
  }
  // Dedupe (react + next.js might both exist)
  return [...new Set(patterns)];
}

// ── 8. Framework Conventions ────────────────────────────────────────

function mineFrameworkConventions(cwd, analysis) {
  const conv = { framework: null, version: null, routing: null, conventions: [] };

  const pkg = analysis._manifests && analysis._manifests.packageJson;
  const allDeps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};

  // Next.js
  if (allDeps.next) {
    conv.framework = 'Next.js';
    conv.version = (allDeps.next || '').replace(/^\^|~/, '');
    conv.routing = fs.existsSync(path.join(cwd, 'app')) ? 'App Router' : 'Pages Router';
    if (conv.routing === 'App Router') {
      conv.conventions.push('Use Server Components by default — add "use client" only when needed');
      conv.conventions.push('Use route handlers (app/api/) for API endpoints');
      conv.conventions.push('Use loading.tsx and error.tsx for route-level loading/error states');
    } else {
      conv.conventions.push('Use getStaticProps for static data, getServerSideProps for dynamic');
    }
  }

  // React (standalone, not Next.js)
  if (!conv.framework && allDeps.react) {
    conv.framework = 'React';
    conv.version = (allDeps.react || '').replace(/^\^|~/, '');
    conv.conventions.push('Use functional components with hooks — no class components');
    if (allDeps['react-router-dom'] || allDeps['react-router']) {
      conv.conventions.push('Use React Router for client-side routing');
    }
  }

  // Vue
  if (!conv.framework && allDeps.vue) {
    conv.framework = 'Vue';
    conv.version = (allDeps.vue || '').replace(/^\^|~/, '');
    if (conv.version.startsWith('3')) {
      conv.conventions.push('Use Composition API with <script setup> — avoid Options API in new code');
    }
  }

  // Svelte
  if (!conv.framework && (allDeps.svelte || allDeps['@sveltejs/kit'])) {
    conv.framework = allDeps['@sveltejs/kit'] ? 'SvelteKit' : 'Svelte';
    conv.conventions.push('Use runes ($state, $derived) for reactivity');
  }

  // Express / Fastify
  if (!conv.framework && allDeps.express) {
    conv.framework = 'Express';
    conv.conventions.push('Use async middleware with error handling — pass errors to next()');
  }
  if (!conv.framework && allDeps.fastify) {
    conv.framework = 'Fastify';
    conv.conventions.push('Use schema validation for routes — define JSON Schema for request/response');
  }

  // Prisma
  if (allDeps.prisma || allDeps['@prisma/client']) {
    conv.conventions.push('Use Prisma Client for database access — keep schema in sync with migrations');
  }

  // tRPC
  if (allDeps['@trpc/server'] || allDeps['@trpc/client']) {
    conv.conventions.push('Use tRPC for type-safe API communication between client and server');
  }

  // GraphQL
  if (allDeps.graphql || allDeps['@apollo/server'] || allDeps['@graphql-tools/schema']) {
    conv.conventions.push('Use GraphQL schema-first or code-first approach consistently');
  }

  return conv;
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  mineKeyDirectories,
  mineArchitecture,
  mineTestingProfile,
  mineCodeStyle,
  mineImportConventions,
  mineDependencyPolicy,
  mineAntiPatterns,
  mineFrameworkConventions,
};
