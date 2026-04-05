'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectStack, parseSimpleToml } = require('../src/analyze/stacks');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-stacks-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function analyze(files) {
  const dir = mkFixture(files);
  const result = { stack: [], name: '', description: '' };
  detectStack(dir, result);
  return { result, dir };
}

console.log('\n  analyze/stacks.js');

// --- Ruby ---
test('detectStack: Ruby via Gemfile', () => {
  const { result } = analyze({ 'Gemfile': "source 'https://rubygems.org'\ngem 'rspec'\ngem 'rubocop'" });
  assert.ok(result.stack.includes('ruby'));
  assert.ok(result._manifests.ruby);
  assert.strictEqual(result._manifests.ruby.hasRspec, true);
  assert.strictEqual(result._manifests.ruby.hasRubocop, true);
});

test('detectStack: Ruby via gemspec only', () => {
  const { result } = analyze({ 'foo.gemspec': "Gem::Specification.new do |s|\n  s.name = 'foo'\nend" });
  assert.ok(result.stack.includes('ruby'));
});

test('detectStack: Rails detected from Gemfile', () => {
  const { result } = analyze({ 'Gemfile': "gem 'rails', '~> 7.0'" });
  assert.ok(result.stack.includes('ruby'));
  assert.ok(result.stack.includes('rails'));
});

test('detectStack: Sinatra detected from Gemfile', () => {
  const { result } = analyze({ 'Gemfile': "gem 'sinatra'" });
  assert.ok(result.stack.includes('sinatra'));
});

// --- PHP ---
test('detectStack: PHP via composer.json', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({
      name: 'vendor/project',
      require: { php: '^8.1' },
      'require-dev': { 'phpunit/phpunit': '^10.0', 'phpstan/phpstan': '^1.10' },
    }),
  });
  assert.ok(result.stack.includes('php'));
  assert.strictEqual(result._manifests.php.hasPhpunit, true);
  assert.strictEqual(result._manifests.php.hasPhpStan, true);
});

test('detectStack: Laravel detected', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
  });
  assert.ok(result.stack.includes('php'));
  assert.ok(result.stack.includes('laravel'));
});

test('detectStack: Symfony detected', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({ require: { 'symfony/framework-bundle': '^7.0' } }),
  });
  assert.ok(result.stack.includes('symfony'));
});

test('detectStack: Slim PHP detected', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({ require: { 'slim/slim': '^4.0' } }),
  });
  assert.ok(result.stack.includes('slim'));
});

// --- Deno / Bun ---
test('detectStack: Deno via deno.json', () => {
  const { result } = analyze({ 'deno.json': JSON.stringify({ name: 'x', tasks: {} }) });
  assert.ok(result.stack.includes('deno'));
});

test('detectStack: Bun via bunfig.toml', () => {
  const { result } = analyze({ 'bunfig.toml': '[install]\ncache = true' });
  assert.ok(result.stack.includes('bun'));
});

// --- .NET / Swift / Elixir ---
test('detectStack: .NET via .csproj', () => {
  const { result } = analyze({ 'MyApp.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>' });
  assert.ok(result.stack.includes('dotnet'));
});

test('detectStack: Swift via Package.swift', () => {
  const { result } = analyze({ 'Package.swift': '// swift-tools-version:5.5\nimport PackageDescription' });
  assert.ok(result.stack.includes('swift'));
});

test('detectStack: Elixir via mix.exs', () => {
  const { result } = analyze({
    'mix.exs': 'defmodule App.MixProject do\n  use Mix.Project\nend',
  });
  assert.ok(result.stack.includes('elixir'));
});

test('detectStack: Phoenix detected from mix.exs', () => {
  const { result } = analyze({
    'mix.exs': 'defmodule App.MixProject do\n  defp deps do\n    [{:phoenix, "~> 1.7"}]\n  end\nend',
  });
  assert.ok(result.stack.includes('elixir'));
  assert.ok(result.stack.includes('phoenix'));
});

// --- Python ---
test('detectStack: Python with uv lock → runner=uv', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"',
    'uv.lock': '',
  });
  assert.ok(result.stack.includes('python'));
  assert.strictEqual(result._manifests.pythonRunner, 'uv');
});

test('detectStack: Python with poetry → runner=poetry', () => {
  const { result } = analyze({
    'pyproject.toml': '[tool.poetry]\nname = "app"',
  });
  assert.ok(result.stack.includes('python'));
  assert.strictEqual(result._manifests.pythonRunner, 'poetry');
});

test('detectStack: Python with tox detected', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"',
    'tox.ini': '[tox]\nenvlist = py311',
  });
  assert.strictEqual(result._manifests.hasTox, true);
});

test('detectStack: Python with nox detected', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"',
    'noxfile.py': 'import nox',
  });
  assert.strictEqual(result._manifests.hasNox, true);
});

// --- Node framework false-positive prevention ---
test('detectStack: express in devDependencies does NOT set stack=express', () => {
  const { result } = analyze({
    'package.json': JSON.stringify({
      name: 'axios-like',
      dependencies: {},
      devDependencies: { express: '^4.18.0' },
    }),
  });
  assert.ok(result.stack.includes('node'));
  assert.ok(!result.stack.includes('express'), 'express should NOT be flagged when only in devDeps');
});

test('detectStack: express in runtime dependencies DOES set stack=express', () => {
  const { result } = analyze({
    'package.json': JSON.stringify({
      name: 'real-express-app',
      dependencies: { express: '^4.18.0' },
    }),
  });
  assert.ok(result.stack.includes('express'));
});

// --- Java / Kotlin ---
test('detectStack: Maven via pom.xml', () => {
  const { result } = analyze({ 'pom.xml': '<project></project>' });
  assert.ok(result.stack.includes('java/maven'));
  assert.strictEqual(result._manifests.javaBuildSystem, 'maven');
});

test('detectStack: Gradle Kotlin DSL with kotlin plugin → stack includes kotlin', () => {
  const { result } = analyze({
    'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "1.9.0"\n}',
  });
  assert.ok(result.stack.includes('java/gradle'));
  assert.ok(result.stack.includes('kotlin'));
});

// --- TOML parser ---
test('parseSimpleToml: basic sections and keys', () => {
  const toml = parseSimpleToml('[project]\nname = "test"\nversion = "1.0"\n[tool.ruff]\nline-length = 100');
  assert.ok(toml.sections.has('project'));
  assert.ok(toml.sections.has('tool.ruff'));
  assert.strictEqual(toml.values.get('project.name'), 'test');
  assert.strictEqual(toml.values.get('tool.ruff.line-length'), '100');
});

test('parseSimpleToml: skips comments', () => {
  const toml = parseSimpleToml('# top comment\n[project]\n# inline comment\nname = "x" # trailing');
  assert.strictEqual(toml.values.get('project.name'), 'x');
});

// --- Infrastructure detection ---
test('detectStack: Terraform via .tf files', () => {
  const { result } = analyze({ 'main.tf': 'resource "aws_s3_bucket" "x" {}' });
  assert.ok(result.stack.includes('terraform'));
  assert.strictEqual(result._manifests.infra.terraform, true);
});

test('detectStack: Helm via Chart.yaml', () => {
  const { result } = analyze({ 'Chart.yaml': 'name: my-chart\nversion: 0.1.0' });
  assert.strictEqual(result._manifests.infra.helm, true);
});

test('detectStack: OpenAPI via openapi.yaml', () => {
  const { result } = analyze({ 'openapi.yaml': 'openapi: 3.0.0' });
  assert.strictEqual(result._manifests.infra.openapi, 'openapi.yaml');
});

// --- Nested stack detection (subservices + auxiliary subdirs) ---

test('detectNestedStacks: polyglot microservices monorepo (no root manifests)', () => {
  // Simulates GoogleCloudPlatform/microservices-demo layout
  const { result } = analyze({
    'README.md': 'microservices demo',
    'src/frontend/go.mod': 'module github.com/example/frontend\ngo 1.21',
    'src/cartservice/cart.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>',
    'src/emailservice/pyproject.toml': '[project]\nname = "emailservice"',
    'src/paymentservice/package.json': '{"name":"paymentservice","dependencies":{"express":"^4"}}',
    'src/adservice/pom.xml': '<project><artifactId>adservice</artifactId></project>',
  });
  assert.ok(result.stack.includes('go'), 'Go detected from src/frontend');
  assert.ok(result.stack.includes('dotnet'), '.NET detected from src/cartservice');
  assert.ok(result.stack.includes('python'), 'Python detected from src/emailservice');
  assert.ok(result.stack.includes('node'), 'Node detected from src/paymentservice');
  assert.ok(result.stack.includes('java/maven'), 'Maven detected from src/adservice');
  assert.ok(result._manifests.subservices);
  assert.strictEqual(result._manifests.subservices.length, 5);
  assert.strictEqual(result._manifests.workspaceType, 'subservices');
});

test('detectNestedStacks: auxiliary subdirs alongside root stack', () => {
  // Simulates prometheus layout: Go at root + React UI at web/ui
  const { result } = analyze({
    'go.mod': 'module github.com/example/prometheus\ngo 1.21',
    'web/ui/package.json': '{"name":"prometheus-ui","dependencies":{"react":"^18","typescript":"^5"}}',
  });
  assert.ok(result.stack.includes('go'));
  assert.ok(result.stack.includes('node'));
  assert.ok(result.stack.includes('react'));
  assert.ok(result.stack.includes('typescript'));
  // Root had stacks, so this is NOT flagged as subservices workspace
  assert.notStrictEqual(result._manifests.workspaceType, 'subservices');
});

test('detectNestedStacks: SDK subdirectories (dagger-style)', () => {
  // Simulates dagger layout: Go core + sdk/typescript + sdk/python
  const { result } = analyze({
    'go.mod': 'module github.com/example/dagger\ngo 1.21',
    'sdk/typescript/package.json': '{"name":"@dagger/sdk","devDependencies":{"typescript":"^5"}}',
    'sdk/python/pyproject.toml': '[project]\nname = "dagger-sdk"',
  });
  assert.ok(result.stack.includes('go'));
  assert.ok(result.stack.includes('node'));
  assert.ok(result.stack.includes('typescript'));
  assert.ok(result.stack.includes('python'));
  assert.strictEqual(result._manifests.subservices.length, 2);
});

test('detectNestedStacks: does not recurse infinitely', () => {
  // Sanity check: deeply nested manifests are NOT re-scanned beyond depth 2
  const { result } = analyze({
    'package.json': '{"name":"root"}',
    'packages/a/package.json': '{"name":"a"}',
    'packages/a/nested/deeply/package.json': '{"name":"deep"}', // should NOT register
  });
  assert.ok(result.stack.includes('node'));
  // Only depth-2 subservices count (packages/a), not packages/a/nested/deeply
  // Depth: root(0) → packages(1) → a(2) ← scanned. nested(3) → deeply(4) NOT scanned.
  // So the subservice list has 1 entry (packages/a), not 2.
  assert.ok(result._manifests.subservices && result._manifests.subservices.length >= 1);
  const deeplyEntry = result._manifests.subservices.find(s => s.path.includes('deeply'));
  assert.strictEqual(deeplyEntry, undefined, 'depth-4 manifest should not be scanned');
});

test('detectNestedStacks: empty containers are skipped', () => {
  const { result } = analyze({
    'package.json': '{"name":"root"}',
    'src/README.md': 'no manifests here',
  });
  assert.ok(result.stack.includes('node'));
  // src/ exists but has no manifests → no subservices recorded
  assert.ok(!result._manifests.subservices || result._manifests.subservices.length === 0);
});

test('detectNestedStacks: services/ container pattern', () => {
  const { result } = analyze({
    'services/auth/go.mod': 'module auth',
    'services/api/package.json': '{"name":"api"}',
  });
  assert.ok(result.stack.includes('go'));
  assert.ok(result.stack.includes('node'));
  assert.strictEqual(result._manifests.workspaceType, 'subservices');
});

test('detectNestedStacks: apps/ container pattern', () => {
  const { result } = analyze({
    'apps/web/package.json': '{"name":"web","dependencies":{"next":"^14"}}',
    'apps/api/go.mod': 'module api',
  });
  assert.ok(result.stack.includes('node'));
  assert.ok(result.stack.includes('next.js'));
  assert.ok(result.stack.includes('go'));
});

// --- Monolith tier-naming (backend/frontend/mobile layouts) ---

test('detectNestedStacks: backend/ + frontend/ monolith (Leyoda-style)', () => {
  // Real case: Leyoda's layout is backend/ (Java+Gradle) + frontend/ (Next.js)
  // + signal-engine/ (Python). Without `backend`/`frontend` in containerDirs,
  // top-level analyze would report `Stack: unknown`.
  const { result } = analyze({
    'README.md': 'Leyoda — investor-startup matching',
    'backend/build.gradle.kts': 'plugins { kotlin("jvm") version "1.9.0" }',
    'backend/settings.gradle.kts': 'rootProject.name = "leyoda-backend"',
    'frontend/package.json': '{"name":"leyoda-frontend","dependencies":{"next":"^16","react":"^19"}}',
    'frontend/next.config.ts': 'export default {};',
    'signal-engine/pyproject.toml': '[project]\nname = "signal-engine"',
  });
  assert.ok(result.stack.includes('java/gradle'), 'backend Gradle detected');
  assert.ok(result.stack.includes('node'), 'frontend Node detected');
  assert.ok(result.stack.includes('next.js'), 'Next.js detected');
  assert.ok(result.stack.includes('python'), 'signal-engine Python detected');
  assert.ok(result._manifests.subservices, 'subservices list populated');
  assert.ok(result._manifests.subservices.length >= 3);
});

test('detectNestedStacks: api/ + client/ monolith', () => {
  const { result } = analyze({
    'api/go.mod': 'module example.com/api',
    'client/package.json': '{"name":"client","dependencies":{"react":"^18"}}',
  });
  assert.ok(result.stack.includes('go'));
  assert.ok(result.stack.includes('node'));
  assert.ok(result.stack.includes('react'));
});

test('detectNestedStacks: mobile/ + server/ monolith', () => {
  const { result } = analyze({
    'server/pyproject.toml': '[project]\nname = "server"',
    'mobile/package.json': '{"name":"mobile","dependencies":{"react-native":"^0.73"}}',
  });
  assert.ok(result.stack.includes('python'));
  assert.ok(result.stack.includes('node'));
});

test('detectNestedStacks: ml/ + pipelines/ data monolith', () => {
  const { result } = analyze({
    'ml/pyproject.toml': '[project]\nname = "ml"',
    'pipelines/pyproject.toml': '[project]\nname = "pipelines"',
  });
  assert.ok(result.stack.includes('python'));
  assert.ok(result._manifests.subservices.length >= 2);
});

// --- NEW: detectors added during the v0.2.11 stress-test fix pass -------

test('detectStack: C++ with CMake', () => {
  const { result } = analyze({ 'CMakeLists.txt': 'project(foo)\nadd_library(bar bar.cpp)' });
  assert.ok(result.stack.includes('c++/cmake'));
  assert.strictEqual(result._manifests.cBuildSystem, 'cmake');
});

test('detectStack: C/autotools', () => {
  const { result } = analyze({ 'configure.ac': 'AC_INIT(foo, 1.0)\nAC_OUTPUT' });
  assert.ok(result.stack.includes('c/autotools'));
});

test('detectStack: Meson', () => {
  const { result } = analyze({ 'meson.build': "project('foo', 'c')" });
  assert.ok(result.stack.includes('c/meson'));
});

test('detectStack: Haskell via cabal', () => {
  const { result } = analyze({
    'foo.cabal': 'name: foo\nversion: 1.0',
  });
  assert.ok(result.stack.includes('haskell'));
  assert.strictEqual(result._manifests.haskellBuildSystem, 'cabal');
});

test('detectStack: Haskell via stack.yaml', () => {
  const { result } = analyze({ 'stack.yaml': 'resolver: lts-20.0' });
  assert.ok(result.stack.includes('haskell'));
  assert.strictEqual(result._manifests.haskellBuildSystem, 'stack');
});

test('detectStack: OCaml via dune', () => {
  const { result } = analyze({ 'dune-project': '(lang dune 3.0)' });
  assert.ok(result.stack.includes('ocaml'));
  assert.strictEqual(result._manifests.ocamlBuildSystem, 'dune');
});

test('detectStack: Zig via build.zig', () => {
  const { result } = analyze({ 'build.zig': 'const std = @import("std");' });
  assert.ok(result.stack.includes('zig'));
});

test('detectStack: Crystal via shard.yml', () => {
  const { result } = analyze({ 'shard.yml': 'name: foo\nversion: 0.1.0' });
  assert.ok(result.stack.includes('crystal'));
});

test('detectStack: Nim via .nimble', () => {
  const { result } = analyze({ 'foo.nimble': 'version = "0.1.0"' });
  assert.ok(result.stack.includes('nim'));
});

test('detectStack: Julia via Project.toml with uuid', () => {
  const { result } = analyze({
    'Project.toml': 'name = "Foo"\nuuid = "a1234567-89ab-cdef-0123-456789abcdef"\n[deps]\nJSON = "..."',
  });
  assert.ok(result.stack.includes('julia'));
});

test('detectStack: Julia does NOT match Python Project.toml (no uuid, no deps)', () => {
  const { result } = analyze({
    'Project.toml': '# Some other tool\n[tool.foo]\nname = "x"',
  });
  assert.ok(!result.stack.includes('julia'));
});

test('detectStack: Dart via pubspec', () => {
  const { result } = analyze({ 'pubspec.yaml': 'name: foo\nversion: 0.1.0' });
  assert.ok(result.stack.includes('dart'));
});

test('detectStack: Flutter via pubspec sdk', () => {
  const { result } = analyze({ 'pubspec.yaml': 'name: foo\ndependencies:\n  flutter:\n    sdk: flutter' });
  assert.ok(result.stack.includes('dart'));
  assert.ok(result.stack.includes('flutter'));
});

test('detectStack: Erlang via rebar.config', () => {
  const { result } = analyze({ 'rebar.config': '{erl_opts, [debug_info]}.' });
  assert.ok(result.stack.includes('erlang'));
});

test('detectStack: Lua via rockspec', () => {
  const { result } = analyze({ 'foo-scm-1.rockspec': 'package = "foo"\nversion = "scm-1"' });
  assert.ok(result.stack.includes('lua'));
});

test('detectStack: Kotlin-only .kts adds java/gradle to stack', () => {
  // Previously a repo with only build.gradle.kts (no .gradle) could get
  // `kotlin` without `java/gradle`, leaving inferKotlinGates without a
  // build system hook. Now detectKotlin ensures both are set.
  const { result } = analyze({
    'build.gradle.kts': 'plugins { kotlin("jvm") version "1.9.0" }',
    'gradlew': '#!/bin/sh\nexec gradle "$@"',
  });
  assert.ok(result.stack.includes('kotlin'));
  assert.ok(result.stack.includes('java/gradle'));
  assert.strictEqual(result._manifests.javaBuildSystem, 'gradle');
});

test('detectStack: C family does NOT fire on Node project with Makefile', () => {
  // Node projects often have a convenience Makefile — this should NOT make
  // crag label them as C.
  const { result } = analyze({
    'package.json': '{"name":"foo","scripts":{"test":"jest"}}',
    'Makefile': 'test:\n\tnpm test',
  });
  assert.ok(result.stack.includes('node'));
  assert.ok(!result.stack.includes('c'));
});

test('detectNestedStacks: fixture directories are excluded', () => {
  // Previously nx reported 7 stacks because `examples/java-app/pom.xml`
  // and similar fixture manifests were being walked. Now filtered.
  const { result } = analyze({
    'package.json': '{"name":"root","workspaces":["packages/*"]}',
    'examples/java-app/pom.xml': '<project></project>',
    'samples/go-app/go.mod': 'module sample',
    'fixtures/python-fixture/pyproject.toml': '[project]\nname="fx"',
    'docs/rust-example/Cargo.toml': '[package]\nname = "doc"',
  });
  assert.ok(result.stack.includes('node'));
  // None of the fixture directory stacks should have leaked in
  assert.ok(!result.stack.includes('java/maven'));
  assert.ok(!result.stack.includes('go'));
  assert.ok(!result.stack.some(s => s === 'rust' || s === 'python'));
});
