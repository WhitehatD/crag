'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectStack } = require('../src/analyze/stacks');
const { inferGates } = require('../src/analyze/gates');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-gates-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function analyze(files) {
  const dir = mkFixture(files);
  const result = { stack: [], name: '', description: '', linters: [], testers: [], builders: [], formatters: [] };
  detectStack(dir, result);
  inferGates(dir, result);
  return { result, dir };
}

console.log('\n  analyze/gates.js');

// --- Ruby gates ---
test('inferGates: Ruby with rspec → bundle exec rspec', () => {
  const { result } = analyze({
    'Gemfile': "source 'https://rubygems.org'\ngem 'rspec'",
  });
  assert.ok(result.testers.includes('bundle exec rspec'), 'rspec gate missing');
});

test('inferGates: Ruby with rubocop → bundle exec rubocop', () => {
  const { result } = analyze({
    'Gemfile': "gem 'rubocop'",
    '.rubocop.yml': 'AllCops:\n  NewCops: enable',
  });
  assert.ok(result.linters.includes('bundle exec rubocop'));
});

test('inferGates: Ruby rake fallback for minitest', () => {
  const { result } = analyze({
    'Gemfile': "gem 'minitest'",
    'Rakefile': "task :test",
  });
  assert.ok(result.testers.includes('bundle exec rake test'));
});

// --- PHP gates ---
test('inferGates: PHP with phpunit → vendor/bin/phpunit', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({
      'require-dev': { 'phpunit/phpunit': '^10.0' },
    }),
  });
  assert.ok(result.testers.includes('vendor/bin/phpunit'));
});

test('inferGates: PHP with Pest → vendor/bin/pest', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({
      'require-dev': { 'pestphp/pest': '^2.0' },
    }),
  });
  assert.ok(result.testers.includes('vendor/bin/pest'));
});

test('inferGates: PHP with phpstan → vendor/bin/phpstan analyse', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({
      'require-dev': { 'phpstan/phpstan': '^1.0' },
    }),
  });
  assert.ok(result.linters.includes('vendor/bin/phpstan analyse'));
});

test('inferGates: PHP composer validate is always added', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({ name: 'a/b' }),
  });
  assert.ok(result.linters.includes('composer validate --strict'));
});

test('inferGates: PHP prefers composer test script when present', () => {
  const { result } = analyze({
    'composer.json': JSON.stringify({
      'require-dev': { 'phpunit/phpunit': '^10.0' },
      scripts: { test: 'phpunit' },
    }),
  });
  assert.ok(result.testers.includes('composer test'));
  assert.ok(!result.testers.includes('vendor/bin/phpunit'), 'should not dual-emit when composer script exists');
});

// --- Python gates ---
test('inferGates: Python with uv + tox → uv run tox run', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"',
    'uv.lock': '',
    'tox.ini': '[tox]\nenvlist = py311',
  });
  assert.ok(result.testers.some(t => t.includes('uv run tox run')));
});

test('inferGates: Python with poetry + pytest → poetry run pytest', () => {
  const { result } = analyze({
    'pyproject.toml': '[tool.poetry]\nname = "app"\n[tool.pytest.ini_options]\nminversion = "7.0"',
  });
  assert.ok(result.testers.some(t => t.includes('poetry run pytest')));
});

test('inferGates: Python with ruff → ruff check + ruff format --check', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"\n[tool.ruff]\nline-length = 100',
  });
  assert.ok(result.linters.some(l => l.includes('ruff check')));
  assert.ok(result.linters.some(l => l.includes('ruff format --check')));
});

test('inferGates: Python with mypy → mypy .', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"\n[tool.mypy]\nstrict = true',
  });
  assert.ok(result.linters.some(l => l.endsWith('mypy .')));
});

test('inferGates: Python with hatch + pytest', () => {
  const { result } = analyze({
    'pyproject.toml': '[project]\nname = "app"\n[tool.hatch.envs.default]\nfeatures = ["dev"]\n[tool.pytest.ini_options]\nminversion = "7.0"',
  });
  assert.ok(result.testers.some(t => t.startsWith('hatch run pytest')));
});

// --- Java / Maven gates ---
test('inferGates: Maven with wrapper → ./mvnw test + verify', () => {
  const { result } = analyze({
    'pom.xml': '<project></project>',
    'mvnw': '#!/bin/sh',
  });
  assert.ok(result.testers.includes('./mvnw test'));
  assert.ok(result.builders.includes('./mvnw verify'));
});

test('inferGates: Maven without wrapper → mvn test', () => {
  const { result } = analyze({
    'pom.xml': '<project></project>',
  });
  assert.ok(result.testers.includes('mvn test'));
});

test('inferGates: Gradle with wrapper → ./gradlew test + build', () => {
  const { result } = analyze({
    'build.gradle.kts': 'plugins { java }',
    'gradlew': '#!/bin/sh',
  });
  assert.ok(result.testers.includes('./gradlew test'));
  assert.ok(result.builders.includes('./gradlew build'));
});

// --- Kotlin gates ---
test('inferGates: Kotlin skips java path, uses gradle test', () => {
  const { result } = analyze({
    'build.gradle.kts': 'plugins { kotlin("jvm") version "1.9.0" }',
    'gradlew': '#!/bin/sh',
  });
  assert.ok(result.stack.includes('kotlin'));
  assert.ok(result.testers.includes('./gradlew test'));
});

// --- .NET / Swift / Elixir ---
test('inferGates: .NET → dotnet test + build + format', () => {
  const { result } = analyze({
    'App.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>',
  });
  assert.ok(result.testers.some(t => t.startsWith('dotnet test')));
  assert.ok(result.builders.some(b => b.startsWith('dotnet build')));
  assert.ok(result.linters.some(l => l.includes('dotnet format')));
});

test('inferGates: Swift → swift test', () => {
  const { result } = analyze({
    'Package.swift': '// swift-tools-version:5.5',
  });
  assert.ok(result.testers.includes('swift test'));
});

test('inferGates: Elixir → mix test + mix format --check', () => {
  const { result } = analyze({
    'mix.exs': 'defmodule App.MixProject do\n  use Mix.Project\nend',
  });
  assert.ok(result.testers.includes('mix test'));
  assert.ok(result.linters.some(l => l.includes('mix format --check-formatted')));
});

test('inferGates: Elixir with credo → mix credo', () => {
  const { result } = analyze({
    'mix.exs': 'defp deps, do: [{:credo, "~> 1.0"}]',
  });
  assert.ok(result.linters.some(l => l.includes('mix credo --strict')));
});

// --- Node xo/biome/eslint ---
test('inferGates: Node with XO → npx xo', () => {
  const { result } = analyze({
    'package.json': JSON.stringify({
      name: 'x',
      devDependencies: { xo: '^1.0.0' },
    }),
  });
  assert.ok(result.linters.includes('npx xo'));
});

test('inferGates: Node with biome → npx biome check', () => {
  const { result } = analyze({
    'package.json': JSON.stringify({ name: 'x' }),
    'biome.json': '{"files":{"include":["src"]}}',
  });
  assert.ok(result.linters.includes('npx biome check .'));
});

test('inferGates: Node with eslint config file → npx eslint', () => {
  const { result } = analyze({
    'package.json': JSON.stringify({ name: 'x' }),
    'eslint.config.js': 'export default [];',
  });
  assert.ok(result.linters.includes('npx eslint . --max-warnings 0'));
});

// --- Rust + Go ---
test('inferGates: Rust → cargo test + clippy + fmt', () => {
  const { result } = analyze({ 'Cargo.toml': '[package]\nname = "x"\nversion = "0.1.0"' });
  assert.ok(result.testers.includes('cargo test'));
  assert.ok(result.linters.includes('cargo clippy -- -D warnings'));
  assert.ok(result.linters.includes('cargo fmt --check'));
});

test('inferGates: Go with golangci-lint config', () => {
  const { result } = analyze({
    'go.mod': 'module x',
    '.golangci.yml': 'linters:\n  enable: []',
  });
  assert.ok(result.linters.includes('golangci-lint run'));
});

// --- Infrastructure ---
test('inferGates: Terraform → fmt + validate', () => {
  const { result } = analyze({ 'main.tf': 'resource "x" "y" {}' });
  assert.ok(result.linters.includes('terraform fmt -check -recursive'));
  assert.ok(result.linters.includes('terraform validate'));
});

test('inferGates: Helm → helm lint', () => {
  const { result } = analyze({ 'Chart.yaml': 'name: x\nversion: 0.1.0' });
  assert.ok(result.linters.includes('helm lint'));
});
