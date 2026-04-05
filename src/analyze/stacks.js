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
  try { return JSON.parse(content); } catch { return null; }
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
 */
function detectStack(dir, result) {
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
  detectRuby(dir, result);
  detectPhp(dir, result);
  detectDocker(dir, result);
  detectInfrastructure(dir, result);
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
  const gradleKts = path.join(dir, 'build.gradle.kts');
  if (fs.existsSync(gradleKts)) {
    const content = safeRead(gradleKts);
    if (/kotlin\(["']jvm["']\)|kotlin\(["']android["']\)|org\.jetbrains\.kotlin/.test(content)) {
      if (!result.stack.includes('kotlin')) result.stack.push('kotlin');
    }
  }
  // Also detect via .kt files in src/
  try {
    const srcMain = path.join(dir, 'src', 'main', 'kotlin');
    if (fs.existsSync(srcMain)) {
      if (!result.stack.includes('kotlin')) result.stack.push('kotlin');
    }
  } catch { /* skip */ }
}

// --- C# / .NET -------------------------------------------------------------

function detectDotNet(dir, result) {
  // Look for *.csproj, *.fsproj, *.vbproj, *.sln at top level
  try {
    const entries = fs.readdirSync(dir);
    const hasDotNet = entries.some(f =>
      f.endsWith('.csproj') || f.endsWith('.fsproj') ||
      f.endsWith('.vbproj') || f.endsWith('.sln')
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
};
