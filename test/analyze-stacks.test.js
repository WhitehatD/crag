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
