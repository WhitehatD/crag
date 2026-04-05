'use strict';

/**
 * Stack detection for crag analyze.
 *
 * Each language/runtime gets its own detector that runs against a project
 * directory and contributes to the `result.stack` list. Detectors are
 * intentionally independent — a project can be polyglot and every detector
 * that matches fires.
 *
 * The golden rule: a detector only fires when a *primary manifest* exists.
 * Substring matches in test fixtures, node_modules, or dependencies do NOT
 * count. If axios's tests import express, that does not make axios an
 * Express app.
 */

const fs = require('fs');
const path = require('path');

const exists = (dir, f) => fs.existsSync(path.join(dir, f));
const existsAny = (dir, files) => files.some(f => exists(dir, f));

/**
 * Read a file with a conservative size cap so a 100MB lockfile can't exhaust
 * memory on a pathological repo. Returns '' on any failure.
 */
function safeRead(filePath, maxBytes = 2 * 1024 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) return '';
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function safeJson(filePath) {
  const content = safeRead(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (err) {
    // Leave a breadcrumb so analyze can warn about malformed manifests.
    // We can't import cli-errors here (circular risk + stacks.js is called
    // from many test fixtures), so we stash the error on a module-level map
    // that analyze.js can drain and report.
    MALFORMED_JSON_FILES.set(filePath, err.message);
    return null;
  }
}

/**
 * Files where JSON.parse failed. analyze.js drains this map after each run
 * to surface warnings. Keyed by absolute path.
 */
const MALFORMED_JSON_FILES = new Map();

function drainMalformedJsonFiles() {
  const snapshot = [...MALFORMED_JSON_FILES.entries()];
  MALFORMED_JSON_FILES.clear();
  return snapshot;
}

/**
 * Minimal TOML reader — extracts top-level section tables and key=value pairs.
 * We do not need a full TOML parser; we just need to see whether specific
 * tables exist (e.g. [tool.pytest.ini_options]) and read string values from
 * well-known keys. This is vastly simpler than pulling in a dependency.
 *
 * Returns: { sections: Set<string>, values: Map<string, string> } where
 * values keys are flattened (e.g. "project.name", "tool.poetry.dependencies").
 */
function parseSimpleToml(content) {
  const sections = new Set();
  const values = new Map();
  let currentSection = '';

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections.add(currentSection);
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
    if (kvMatch) {
      const key = (currentSection ? currentSection + '.' : '') + kvMatch[1];
      let value = kvMatch[2].trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values.set(key, value);
    }
  }

  return { sections, values };
}

/**
 * Detect languages, frameworks, and package managers in `dir`.
 * Mutates `result.stack`, `result.name`, `result.description`, and attaches
 * `result._manifests` for downstream gate detection.
 *
 * When `recursive` is true (default), also scans conventional subservice
 * directories (`src/`, `services/`, `packages/`, `apps/`, `cmd/`, `sdk/`,
 * `web/`, `ui/`, `editors/`, `extensions/`, `projects/`, `microservices/`)
 * to pick up polyglot microservice layouts (e.g. GoogleCloudPlatform's
 * microservices-demo, or auxiliary subdirectories like prometheus's
 * `web/ui` React app and rust-analyzer's `editors/code` VSCode extension).
 * The recursive call is one level only to prevent infinite recursion.
 */
function detectStack(dir, result, options = {}) {
  const { recursive = true } = options;
  result._manifests = result._manifests || {};

  detectNode(dir, result);
  detectDeno(dir, result);
  detectBun(dir, result);
  detectRust(dir, result);
  detectGo(dir, result);
  detectPython(dir, result);
  detectJava(dir, result);
  detectKotlin(dir, result);
  detectDotNet(dir, result);
  detectSwift(dir, result);
  detectElixir(dir, result);
  detectErlang(dir, result);
  detectRuby(dir, result);
  detectPhp(dir, result);
  detectHaskell(dir, result);
  detectOCaml(dir, result);
  detectZig(dir, result);
  detectCrystal(dir, result);
  detectNim(dir, result);
  detectJulia(dir, result);
  detectDart(dir, result);
  detectLua(dir, result);
  // C / C++ family (CMake, autotools, meson, make) — must come AFTER language
  // detectors above so repos that also have a higher-level language manifest
  // aren't flagged as C just because they include a Makefile.
  detectCFamily(dir, result);
  detectDocker(dir, result);
  detectInfrastructure(dir, result);

  if (recursive) {
    detectNestedStacks(dir, result);
  }
}

/**
 * Scan conventional subservice/auxiliary directories one level deep for
 * manifests. Adds unique detected stacks to `result.stack` and stores the
 * per-subservice breakdown in `result._manifests.subservices`.
 *
 * Two cases this handles:
 *
 *   1. Polyglot microservices monorepo (no root manifests):
 *        root/src/adservice/pom.xml        → java/maven
 *        root/src/cartservice/x.csproj     → dotnet
 *        root/src/frontend/go.mod          → go
 *        root/src/emailservice/pyproject.toml → python
 *      → result.stack = [java/maven, dotnet, go, python, ...]
 *      → workspaceType = subservices
 *
 *   2. Auxiliary subdirectory stack (root manifests present):
 *        root/go.mod                       → go (primary)
 *        root/web/ui/package.json          → node, react, typescript (aux)
 *      → result.stack = [go, node, react, typescript]
 *      → subservices list records the breakdown for reporting
 *
 * Scans two depths below each container: container/manifest (depth 1) and
 * container/<child>/manifest (depth 2). Does NOT recurse further.
 */
// Directory basenames that should NOT be treated as subservices. These are
// test fixtures, samples, benchmarks, and docs — they contain manifests that
// look real but are one-off setups for testing or demonstration. If a repo's
// `examples/` directory has a package.json, that does not make the repo a
// Node project; it just means the examples directory has Node demos.
//
// This list must stay in sync with FIXTURE_DIR_PATTERNS in commands/analyze.js
// so workspace enumeration and nested-stack detection filter identically.
const NESTED_SCAN_EXCLUDE = new Set([
  // Test & benchmark harnesses
  'examples', 'example', 'samples', 'sample',
  'demos', 'demo', 'fixtures', 'fixture',
  'testdata', 'test-data', 'test_data',
  'benchmarks', 'benchmark', 'bench',
  'e2e', 'integration-tests', 'perf', 'stress',
  'playground', 'playgrounds', 'sandbox',
  '__fixtures__', '__mocks__', '__snapshots__',
  // Documentation / site generators
  'docs', 'doc', 'documentation', 'website', 'site', 'www',
  // Generated / vendored
  'node_modules', 'vendor', 'vendored', 'third_party', 'third-party',
  'target', 'dist', 'build', 'out', 'bin', 'obj',
  '.git', '.svn', '.hg', '.idea', '.vscode',
]);

function detectNestedStacks(dir, result, visited = new Set()) {
  const containerDirs = [
    // Classic containers (monorepos, microservice demos, VSCode-style editors)
    'src', 'services', 'packages', 'apps', 'cmd', 'projects', 'microservices',
    'sdk', 'sdks', 'web', 'ui', 'editors', 'extensions', 'clients',
    // Monolith tier-naming (backend/frontend/mobile layouts are extremely
    // common in single-repo full-stack projects — e.g. Leyoda, Metabase,
    // many Y Combinator startups). Without these, `crag analyze` on a
    // top-level monolith root reports `Stack: unknown` because no root
    // manifest exists and none of the classic containers are present.
    'backend', 'frontend', 'api', 'client', 'server', 'worker', 'workers',
    'mobile', 'ios', 'android', 'desktop', 'cli', 'lib', 'libs', 'shared',
    // Common AI / data pipeline layouts
    'signal-engine', 'pipelines', 'ml', 'models', 'agents', 'notebooks',
  ];

  const rootHadStacks = result.stack.length > 0;
  const subservices = [];

  // Guard against symlink cycles: resolve the real path of `dir` and skip if
  // we've already scanned it on this invocation. Uses lstat to detect links
  // before following them; realpath canonicalizes for identity comparison.
  const rootReal = safeRealpath(dir);
  if (rootReal && visited.has(rootReal)) return;
  if (rootReal) visited.add(rootReal);

  for (const container of containerDirs) {
    const containerPath = path.join(dir, container);
    if (!fs.existsSync(containerPath)) continue;
    if (isSymlink(containerPath)) continue; // skip symlinked containers

    // Depth 1: container itself has a manifest (e.g. web/ui/package.json where
    // the container is `ui` directly, or sdk/package.json)
    scanOneSubdir(containerPath, container, result, subservices, visited);

    // Depth 2: container/<child>/manifest (the common microservices pattern)
    let children;
    try {
      children = fs.readdirSync(containerPath, { withFileTypes: true })
        // Skip symlinks — they can create cycles or double-count targets
        .filter(e => e.isDirectory() && !e.isSymbolicLink())
        .map(e => e.name)
        // Drop fixture / docs / sample directories so we don't report
        // `java/maven` for nx just because it has a Java example.
        .filter(name => !NESTED_SCAN_EXCLUDE.has(name));
    } catch { continue; }

    // Cap children scan at a reasonable number to avoid pathological
    // enumeration on huge directories (monorepos with hundreds of packages)
    const capped = children.slice(0, 64);
    for (const child of capped) {
      const childPath = path.join(containerPath, child);
      const relPath = container + '/' + child;
      scanOneSubdir(childPath, relPath, result, subservices, visited);
    }
  }

  if (subservices.length > 0) {
    result._manifests.subservices = subservices;
    if (!rootHadStacks) {
      // Root had no manifests — this is a subservice-only project (e.g.
      // microservices-demo). Flag for downstream reporting.
      result._manifests.workspaceType = result._manifests.workspaceType || 'subservices';
    }
  }
}

function safeRealpath(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/**
 * Run non-recursive stack detection on `subdir` and merge unique stacks into
 * the main `result`. Records the subservice in `subservices` if any stacks
 * were detected. Skips symlinks and already-visited realpaths (cycle guard).
 */
function scanOneSubdir(subdir, relPath, result, subservices, visited = new Set()) {
  if (!fs.existsSync(subdir)) return;
  if (isSymlink(subdir)) return;
  try {
    const st = fs.lstatSync(subdir);
    if (!st.isDirectory()) return;
  } catch { return; }

  // Cycle guard via realpath identity.
  const real = safeRealpath(subdir);
  if (real && visited.has(real)) return;
  if (real) visited.add(real);

  // Skip fixture directories at depth-1 as well (a repo might put examples
  // directly under `src/` with no intermediate container).
  const base = path.basename(subdir);
  if (NESTED_SCAN_EXCLUDE.has(base)) return;

  const subResult = { stack: [], _manifests: {} };
  detectStack(subdir, subResult, { recursive: false });

  if (subResult.stack.length === 0) return;

  subservices.push({
    name: path.basename(subdir),
    path: relPath,
    stacks: subResult.stack,
  });

  for (const s of subResult.stack) {
    if (!result.stack.includes(s)) result.stack.push(s);
  }
}

// --- Node ------------------------------------------------------------------

function detectNode(dir, result) {
  if (!exists(dir, 'package.json')) return;
  result.stack.push('node');

  const pkg = safeJson(path.join(dir, 'package.json'));
  if (!pkg) return;

  result._manifests.packageJson = pkg;
  if (pkg.name) result.name = pkg.name;
  if (pkg.description) result.description = pkg.description;

  // FRAMEWORK DETECTION — only flag if in runtime dependencies (not devDeps).
  // devDeps often contains test/build frameworks that the project USES to test
  // itself without BEING that framework. axios pulls express into devDeps for
  // its test server; that does not make axios an Express application.
  const runtimeDeps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};
  const allDeps = { ...runtimeDeps, ...devDeps };

  const pushFramework = (name, label) => {
    if (runtimeDeps[name]) result.stack.push(label);
  };

  pushFramework('next', 'next.js');
  if (runtimeDeps.react && !runtimeDeps.next) result.stack.push('react');
  pushFramework('vue', 'vue');
  pushFramework('svelte', 'svelte');
  pushFramework('@sveltejs/kit', 'sveltekit');
  pushFramework('nuxt', 'nuxt');
  pushFramework('astro', 'astro');
  pushFramework('solid-js', 'solid');
  pushFramework('qwik', 'qwik');
  pushFramework('remix', 'remix');
  pushFramework('express', 'express');
  pushFramework('fastify', 'fastify');
  pushFramework('koa', 'koa');
  pushFramework('hono', 'hono');
  pushFramework('nestjs', 'nestjs');
  pushFramework('@nestjs/core', 'nestjs');

  // TypeScript can legitimately be in devDeps — it's a language, not a framework.
  if (allDeps.typescript || exists(dir, 'tsconfig.json')) {
    if (!result.stack.includes('typescript')) result.stack.push('typescript');
  }
}

// --- Deno ------------------------------------------------------------------

function detectDeno(dir, result) {
  if (existsAny(dir, ['deno.json', 'deno.jsonc'])) {
    result.stack.push('deno');
    const cfg = safeJson(path.join(dir, 'deno.json')) || safeJson(path.join(dir, 'deno.jsonc'));
    if (cfg) result._manifests.denoJson = cfg;
  }
}

// --- Bun -------------------------------------------------------------------

function detectBun(dir, result) {
  if (exists(dir, 'bun.lockb') || exists(dir, 'bunfig.toml')) {
    if (!result.stack.includes('bun')) result.stack.push('bun');
  }
}

// --- Rust ------------------------------------------------------------------

function detectRust(dir, result) {
  if (!exists(dir, 'Cargo.toml')) return;
  result.stack.push('rust');
  const content = safeRead(path.join(dir, 'Cargo.toml'));
  if (content.includes('[workspace]')) {
    result._manifests.cargoWorkspace = true;
  }
}

// --- Go --------------------------------------------------------------------

function detectGo(dir, result) {
  if (exists(dir, 'go.mod')) result.stack.push('go');
  if (exists(dir, 'go.work')) result._manifests.goWorkspace = true;
}

// --- Python ----------------------------------------------------------------

function detectPython(dir, result) {
  const hasPyproject = exists(dir, 'pyproject.toml');
  const hasSetup = exists(dir, 'setup.py') || exists(dir, 'setup.cfg');
  const hasRequirements = exists(dir, 'requirements.txt');

  if (!hasPyproject && !hasSetup && !hasRequirements) return;
  result.stack.push('python');

  // Detect package manager / runner
  if (exists(dir, 'uv.lock')) result._manifests.pythonRunner = 'uv';
  else if (exists(dir, 'poetry.lock')) result._manifests.pythonRunner = 'poetry';
  else if (exists(dir, 'pdm.lock')) result._manifests.pythonRunner = 'pdm';
  else if (exists(dir, 'Pipfile.lock')) result._manifests.pythonRunner = 'pipenv';

  if (hasPyproject) {
    const content = safeRead(path.join(dir, 'pyproject.toml'));
    const toml = parseSimpleToml(content);
    result._manifests.pyproject = toml;

    // Poetry / PDM / Hatch signals from build-system or tool section
    if (toml.sections.has('tool.poetry')) {
      result._manifests.pythonRunner = result._manifests.pythonRunner || 'poetry';
    }
    if (toml.sections.has('tool.pdm')) {
      result._manifests.pythonRunner = result._manifests.pythonRunner || 'pdm';
    }
    if (toml.sections.has('tool.hatch.envs.default') ||
        toml.sections.has('tool.hatch.envs.test') ||
        toml.sections.has('tool.hatch')) {
      result._manifests.pythonRunner = result._manifests.pythonRunner || 'hatch';
    }
    if (toml.sections.has('tool.rye')) {
      result._manifests.pythonRunner = result._manifests.pythonRunner || 'rye';
    }
  }

  // tox is a classic runner and may coexist with any package manager
  if (exists(dir, 'tox.ini') || (result._manifests.pyproject &&
      result._manifests.pyproject.sections.has('tool.tox'))) {
    result._manifests.hasTox = true;
  }

  // nox
  if (exists(dir, 'noxfile.py')) result._manifests.hasNox = true;
}

// --- Java ------------------------------------------------------------------

function detectJava(dir, result) {
  const hasMaven = exists(dir, 'pom.xml');
  const hasGradle = existsAny(dir, ['build.gradle.kts', 'build.gradle']);

  if (hasMaven) {
    result.stack.push('java/maven');
    result._manifests.javaBuildSystem = 'maven';
    result._manifests.javaWrapper = exists(dir, 'mvnw') || exists(dir, 'mvnw.cmd');
  }
  if (hasGradle) {
    // We push 'java/gradle' tentatively; detectKotlin may replace with kotlin
    result.stack.push('java/gradle');
    result._manifests.javaBuildSystem = result._manifests.javaBuildSystem || 'gradle';
    result._manifests.gradleWrapper = exists(dir, 'gradlew') || exists(dir, 'gradlew.bat');
  }
}

// --- Kotlin ----------------------------------------------------------------

function detectKotlin(dir, result) {
  // Kotlin is almost always also "java/gradle" via Gradle. We look for
  // the kotlin plugin in build.gradle.kts or .kt source files.
  let kotlinDetected = false;
  const gradleKts = path.join(dir, 'build.gradle.kts');
  if (fs.existsSync(gradleKts)) {
    const content = safeRead(gradleKts);
    if (/kotlin\(["']jvm["']\)|kotlin\(["']android["']\)|org\.jetbrains\.kotlin/.test(content)) {
      kotlinDetected = true;
    }
  }
  // Also detect via .kt files in src/
  try {
    const srcMain = path.join(dir, 'src', 'main', 'kotlin');
    if (fs.existsSync(srcMain)) kotlinDetected = true;
  } catch { /* skip */ }

  if (kotlinDetected) {
    if (!result.stack.includes('kotlin')) result.stack.push('kotlin');
    // Kotlin almost always uses Gradle. If detectJava didn't fire because
    // only `.kts` was present, ensure `java/gradle` is in the stack so
    // downstream gate inference (inferKotlinGates) has a build system hook.
    if (!result.stack.includes('java/gradle')) result.stack.push('java/gradle');
    if (!result._manifests.javaBuildSystem) result._manifests.javaBuildSystem = 'gradle';
    if (result._manifests.gradleWrapper === undefined) {
      result._manifests.gradleWrapper = exists(dir, 'gradlew') || exists(dir, 'gradlew.bat');
    }
  }
}

// --- Erlang ----------------------------------------------------------------

function detectErlang(dir, result) {
  if (existsAny(dir, ['rebar.config', 'rebar3.config'])) {
    result.stack.push('erlang');
    result._manifests.erlangBuildSystem = 'rebar3';
  } else if (exists(dir, 'erlang.mk')) {
    result.stack.push('erlang');
    result._manifests.erlangBuildSystem = 'erlang.mk';
  }
}

// --- Haskell ---------------------------------------------------------------

function detectHaskell(dir, result) {
  const hasStackYaml = existsAny(dir, ['stack.yaml', 'stack.yaml.lock']);
  const hasPackageYaml = exists(dir, 'package.yaml');
  const hasCabal = safeListContains(dir, /\.cabal$/);
  const hasCabalProject = exists(dir, 'cabal.project');

  if (!hasStackYaml && !hasCabal && !hasCabalProject && !hasPackageYaml) return;

  result.stack.push('haskell');
  if (hasStackYaml) {
    result._manifests.haskellBuildSystem = 'stack';
  } else if (hasCabal || hasCabalProject) {
    result._manifests.haskellBuildSystem = 'cabal';
  } else if (hasPackageYaml) {
    result._manifests.haskellBuildSystem = 'hpack';
  }
}

// --- OCaml -----------------------------------------------------------------

function detectOCaml(dir, result) {
  if (exists(dir, 'dune-project') || exists(dir, 'dune')) {
    result.stack.push('ocaml');
    result._manifests.ocamlBuildSystem = 'dune';
    return;
  }
  if (safeListContains(dir, /\.opam$/)) {
    result.stack.push('ocaml');
    result._manifests.ocamlBuildSystem = 'opam';
  }
}

// --- Zig -------------------------------------------------------------------

function detectZig(dir, result) {
  if (exists(dir, 'build.zig') || exists(dir, 'build.zig.zon')) {
    result.stack.push('zig');
  }
}

// --- Crystal ---------------------------------------------------------------

function detectCrystal(dir, result) {
  if (exists(dir, 'shard.yml') || exists(dir, 'shard.yaml')) {
    result.stack.push('crystal');
  }
}

// --- Nim -------------------------------------------------------------------

function detectNim(dir, result) {
  if (safeListContains(dir, /\.nimble$/) || exists(dir, 'nim.cfg') || exists(dir, 'config.nims')) {
    result.stack.push('nim');
  }
}

// --- Julia -----------------------------------------------------------------

function detectJulia(dir, result) {
  if (exists(dir, 'Project.toml')) {
    // Project.toml with `name = "X"` and `uuid = "..."` is Julia. Other
    // ecosystems also use Project.toml (Poetry shims, etc.), so sniff.
    const content = safeRead(path.join(dir, 'Project.toml'));
    if (/^uuid\s*=/m.test(content) || /\[deps\]/.test(content)) {
      result.stack.push('julia');
    }
  }
}

// --- Dart / Flutter --------------------------------------------------------

function detectDart(dir, result) {
  if (exists(dir, 'pubspec.yaml') || exists(dir, 'pubspec.yml')) {
    result.stack.push('dart');
    const content = safeRead(path.join(dir, 'pubspec.yaml'));
    if (/flutter\s*:\s*/.test(content) || /sdk\s*:\s*flutter/.test(content)) {
      result.stack.push('flutter');
    }
  }
}

// --- Lua -------------------------------------------------------------------

function detectLua(dir, result) {
  if (safeListContains(dir, /\.rockspec$/) || exists(dir, '.luarc.json') || exists(dir, '.luacheckrc')) {
    result.stack.push('lua');
  }
}

// --- C / C++ family (CMake, autotools, meson, plain Make) ------------------

function detectCFamily(dir, result) {
  // CMake — most common C++ build system today
  if (exists(dir, 'CMakeLists.txt')) {
    if (!result.stack.includes('c++/cmake')) result.stack.push('c++/cmake');
    result._manifests.cBuildSystem = 'cmake';
    return;
  }

  // Meson — modern alternative (used by e.g. postgres, systemd, glib)
  if (exists(dir, 'meson.build')) {
    if (!result.stack.includes('c/meson')) result.stack.push('c/meson');
    result._manifests.cBuildSystem = 'meson';
    return;
  }

  // GNU autotools (configure.ac / configure.in / autogen.sh)
  if (existsAny(dir, ['configure.ac', 'configure.in', 'autogen.sh'])) {
    if (!result.stack.includes('c/autotools')) result.stack.push('c/autotools');
    result._manifests.cBuildSystem = 'autotools';
    return;
  }

  // Plain Makefile with no higher-level build system. Only flag as C if the
  // repo also has C/C++ source files at root to avoid false positives on
  // Node/Python/Go projects that have a convenience Makefile.
  if (exists(dir, 'Makefile') || exists(dir, 'makefile') || exists(dir, 'GNUmakefile') || exists(dir, 'GNUmakefile.in')) {
    // Already detected a higher-level language? Don't overwrite it with C.
    const hasOtherLang = result.stack.some(s =>
      s === 'node' || s === 'python' || s === 'go' || s === 'rust' ||
      s === 'ruby' || s === 'php' || s === 'dotnet' || s === 'java/maven' ||
      s === 'java/gradle' || s === 'kotlin' || s === 'swift' || s === 'elixir'
    );
    if (hasOtherLang) return;

    // Sniff root files for C/C++ sources (cheap — readdir only)
    try {
      const entries = fs.readdirSync(dir);
      const hasCSources = entries.some(f =>
        f.endsWith('.c') || f.endsWith('.cpp') || f.endsWith('.cc') ||
        f.endsWith('.cxx') || f.endsWith('.h') || f.endsWith('.hpp')
      );
      if (hasCSources) {
        result.stack.push('c');
        result._manifests.cBuildSystem = 'make';
      } else {
        // Just a convenience Makefile — mine its targets via task-runners.js
        // but don't pollute the stack list.
      }
    } catch { /* skip */ }
  }
}

// --- C# / .NET -------------------------------------------------------------

function detectDotNet(dir, result) {
  // Look for *.csproj, *.fsproj, *.vbproj, *.sln, *.slnx at top level,
  // OR `Directory.Build.props` / `Directory.Packages.props` which are
  // central .NET convention files used in multi-project solutions like Jint.
  try {
    const entries = fs.readdirSync(dir);
    const hasDotNet = entries.some(f =>
      f.endsWith('.csproj') || f.endsWith('.fsproj') ||
      f.endsWith('.vbproj') || f.endsWith('.sln') || f.endsWith('.slnx') ||
      f === 'Directory.Build.props' || f === 'Directory.Packages.props' ||
      f === 'global.json'
    );
    if (hasDotNet) {
      result.stack.push('dotnet');
      result._manifests.dotnet = true;
      if (entries.some(f => f.endsWith('.fsproj'))) result.stack.push('fsharp');
    }
  } catch { /* skip */ }
}

// --- Swift -----------------------------------------------------------------

function detectSwift(dir, result) {
  if (exists(dir, 'Package.swift')) {
    result.stack.push('swift');
    result._manifests.swiftPackage = true;
  }
}

// --- Elixir ----------------------------------------------------------------

function detectElixir(dir, result) {
  if (exists(dir, 'mix.exs')) {
    result.stack.push('elixir');
    const content = safeRead(path.join(dir, 'mix.exs'));
    if (content.includes('phoenix') || content.includes(':phoenix')) {
      result.stack.push('phoenix');
    }
  }
}

// --- Ruby ------------------------------------------------------------------

function detectRuby(dir, result) {
  const hasGemfile = exists(dir, 'Gemfile');
  const hasGemspec = safeListContains(dir, /\.gemspec$/);
  const hasRakefile = exists(dir, 'Rakefile');

  if (!hasGemfile && !hasGemspec && !hasRakefile) return;
  result.stack.push('ruby');

  // Framework detection via Gemfile / gemspec content
  const gemfileContent = safeRead(path.join(dir, 'Gemfile'));
  const gemspecFile = listFiles(dir).find(f => f.endsWith('.gemspec'));
  const gemspecContent = gemspecFile ? safeRead(path.join(dir, gemspecFile)) : '';
  const allGemContent = gemfileContent + '\n' + gemspecContent;

  if (/['"]rails['"]/.test(allGemContent)) result.stack.push('rails');
  else if (/['"]sinatra['"]/.test(allGemContent)) result.stack.push('sinatra');
  else if (/['"]hanami['"]/.test(allGemContent)) result.stack.push('hanami');

  result._manifests.ruby = {
    gemfile: hasGemfile,
    gemspec: gemspecFile || null,
    rakefile: hasRakefile,
    hasRspec: /['"]rspec['"]/.test(allGemContent) || exists(dir, '.rspec'),
    hasMinitest: /['"]minitest['"]/.test(allGemContent),
    hasRubocop: /['"]rubocop['"]/.test(allGemContent) || exists(dir, '.rubocop.yml'),
    hasStandardRb: /['"]standard['"]/.test(allGemContent),
    hasReek: /['"]reek['"]/.test(allGemContent),
    hasBrakeman: /['"]brakeman['"]/.test(allGemContent),
  };
}

// --- PHP -------------------------------------------------------------------

function detectPhp(dir, result) {
  if (!exists(dir, 'composer.json')) return;
  result.stack.push('php');

  const composer = safeJson(path.join(dir, 'composer.json'));
  if (!composer) return;

  const requireAll = { ...composer.require, ...composer['require-dev'] };

  // Framework detection
  if (requireAll['laravel/framework']) result.stack.push('laravel');
  else if (requireAll['symfony/framework-bundle'] || requireAll['symfony/symfony']) result.stack.push('symfony');
  else if (requireAll['slim/slim']) result.stack.push('slim');
  else if (requireAll['yiisoft/yii2']) result.stack.push('yii');
  else if (requireAll['cakephp/cakephp']) result.stack.push('cakephp');

  result._manifests.composer = composer;
  result._manifests.php = {
    hasPhpunit: !!requireAll['phpunit/phpunit'] ||
                exists(dir, 'phpunit.xml') || exists(dir, 'phpunit.xml.dist'),
    hasPest: !!requireAll['pestphp/pest'],
    hasPhpcs: !!requireAll['squizlabs/php_codesniffer'] || exists(dir, 'phpcs.xml') || exists(dir, 'phpcs.xml.dist'),
    hasPhpStan: !!requireAll['phpstan/phpstan'] || exists(dir, 'phpstan.neon') || exists(dir, 'phpstan.neon.dist'),
    hasPsalm: !!requireAll['vimeo/psalm'] || exists(dir, 'psalm.xml'),
    hasPhpCsFixer: !!requireAll['friendsofphp/php-cs-fixer'] || exists(dir, '.php-cs-fixer.php') || exists(dir, '.php-cs-fixer.dist.php'),
    hasRector: !!requireAll['rector/rector'] || exists(dir, 'rector.php'),
    scripts: composer.scripts || {},
  };
}

// --- Docker ----------------------------------------------------------------

function detectDocker(dir, result) {
  if (exists(dir, 'Dockerfile') || exists(dir, 'Containerfile') ||
      exists(dir, 'Dockerfile.dev') || exists(dir, 'Dockerfile.prod')) {
    if (!result.stack.includes('docker')) result.stack.push('docker');
  }
}

// --- Infrastructure (Terraform, Helm, K8s) ---------------------------------

function detectInfrastructure(dir, result) {
  result._manifests.infra = {};

  try {
    const entries = fs.readdirSync(dir);
    if (entries.some(f => f.endsWith('.tf'))) {
      result._manifests.infra.terraform = true;
      if (!result.stack.includes('terraform')) result.stack.push('terraform');
    }
  } catch { /* skip */ }

  if (exists(dir, 'Chart.yaml')) {
    result._manifests.infra.helm = true;
  }

  // Kubernetes manifests: look for common patterns
  for (const k8sDir of ['k8s', 'kubernetes', 'deploy', 'manifests']) {
    if (exists(dir, k8sDir)) {
      result._manifests.infra.kubernetes = k8sDir;
      break;
    }
  }

  // OpenAPI / Swagger specs
  for (const spec of ['openapi.yaml', 'openapi.yml', 'openapi.json',
                      'swagger.yaml', 'swagger.yml', 'swagger.json']) {
    if (exists(dir, spec)) {
      result._manifests.infra.openapi = spec;
      break;
    }
  }

  // Protocol buffers
  try {
    const entries = fs.readdirSync(dir);
    if (entries.some(f => f.endsWith('.proto'))) {
      result._manifests.infra.proto = true;
    }
  } catch { /* skip */ }
}

// --- helpers ---------------------------------------------------------------

function listFiles(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function safeListContains(dir, regex) {
  return listFiles(dir).some(f => regex.test(f));
}

module.exports = {
  detectStack,
  safeRead,
  safeJson,
  parseSimpleToml,
  listFiles,
  drainMalformedJsonFiles,
};
