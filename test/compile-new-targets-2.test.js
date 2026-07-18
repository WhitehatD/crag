'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateCircleCI } = require('../src/compile/circleci');
const { generateAzureDevOps } = require('../src/compile/azuredevops');

// junie, kiro, and goose are now satellite targets (their tools read AGENTS.md
// natively, so a duplicate file is unnecessary). Their bespoke generators were
// removed; satellite behavior is covered by test/satellite.test.js. This file
// retains the structural CI targets (circleci, azuredevops) + the compile.js
// registry-integration checks.

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-new-targets-2-test-'));
  const origLog = console.log;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function sampleParsed() {
  return {
    name: 'test-project',
    description: 'A test project',
    stack: ['node'],
    runtimes: ['node'],
    commitConvention: 'conventional',
    commitTrailer: 'Co-Authored-By: Claude <noreply@anthropic.com>',
    security: '- No hardcoded secrets',
    gates: {
      test: {
        commands: [
          { cmd: 'npm test', classification: 'MANDATORY' },
          { cmd: 'npm run lint', classification: 'OPTIONAL' },
        ],
        path: null,
        condition: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// circleci.js
// ---------------------------------------------------------------------------

console.log('\n  compile/circleci.js');

test('generates .circleci/config.yml', () => {
  withTempDir((dir) => {
    generateCircleCI(dir, sampleParsed());
    const out = path.join(dir, '.circleci', 'config.yml');
    assert.ok(fs.existsSync(out), '.circleci/config.yml should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('crag-audit'), 'should include crag-audit job');
    assert.ok(content.includes('version: 2.1'), 'should include CircleCI version');
  });
});

test('circleci output runs crag audit', () => {
  withTempDir((dir) => {
    generateCircleCI(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.circleci', 'config.yml'), 'utf-8');
    assert.ok(content.includes('npx -y -p @whitehatd/crag crag audit'), 'should run crag audit command');
  });
});

test('circleci output includes governance workflow', () => {
  withTempDir((dir) => {
    generateCircleCI(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.circleci', 'config.yml'), 'utf-8');
    assert.ok(content.includes('workflows:'), 'should include workflows section');
    assert.ok(content.includes('governance'), 'should have governance workflow');
  });
});

test('circleci output includes crag attribution', () => {
  withTempDir((dir) => {
    generateCircleCI(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.circleci', 'config.yml'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
  });
});

// ---------------------------------------------------------------------------
// azuredevops.js
// ---------------------------------------------------------------------------

console.log('\n  compile/azuredevops.js');

test('generates azure-pipelines.yml at repo root', () => {
  withTempDir((dir) => {
    generateAzureDevOps(dir, sampleParsed());
    const out = path.join(dir, 'azure-pipelines.yml');
    assert.ok(fs.existsSync(out), 'azure-pipelines.yml should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('npx -y -p @whitehatd/crag crag audit'), 'should run crag audit');
    assert.ok(content.includes('Run crag governance audit'), 'should have displayName');
  });
});

test('azuredevops output triggers on main and master', () => {
  withTempDir((dir) => {
    generateAzureDevOps(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'azure-pipelines.yml'), 'utf-8');
    assert.ok(content.includes('- main'), 'should trigger on main');
    assert.ok(content.includes('- master'), 'should trigger on master');
  });
});

test('azuredevops output includes Node.js setup', () => {
  withTempDir((dir) => {
    generateAzureDevOps(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'azure-pipelines.yml'), 'utf-8');
    assert.ok(content.includes('NodeTool@0'), 'should install Node.js via NodeTool task');
  });
});

test('azuredevops output includes crag attribution', () => {
  withTempDir((dir) => {
    generateAzureDevOps(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'azure-pipelines.yml'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
  });
});

// ---------------------------------------------------------------------------
// compile.js integration: registry-driven ALL_TARGETS and planOutputPath
// ---------------------------------------------------------------------------

console.log('\n  compile.js — registry integration (batch 2)');

test('ALL_TARGETS includes the satellite + CI targets', () => {
  const { ALL_TARGETS } = require('../src/commands/compile');
  for (const id of ['junie', 'kiro', 'goose', 'circleci', 'azuredevops']) {
    assert.ok(ALL_TARGETS.includes(id), `ALL_TARGETS should include ${id}`);
  }
});

test('ALL_TARGETS total is 23 (registry-sourced)', () => {
  const { ALL_TARGETS } = require('../src/commands/compile');
  assert.strictEqual(ALL_TARGETS.length, 23, `expected 23 targets, got ${ALL_TARGETS.length}`);
});

test('planOutputPath returns correct paths (registry-derived)', () => {
  const { planOutputPath } = require('../src/commands/compile');
  const cwd = '/fake/cwd';
  assert.ok(planOutputPath(cwd, 'junie').endsWith(path.join('.junie', 'guidelines.md')), 'junie → .junie/guidelines.md');
  assert.ok(planOutputPath(cwd, 'kiro').endsWith(path.join('.kiro', 'steering', 'quality-gates.md')), 'kiro → .kiro/steering/quality-gates.md');
  assert.ok(planOutputPath(cwd, 'circleci').endsWith(path.join('.circleci', 'config.yml')), 'circleci → .circleci/config.yml');
  assert.ok(planOutputPath(cwd, 'azuredevops').endsWith('azure-pipelines.yml'), 'azuredevops → azure-pipelines.yml');
  assert.ok(planOutputPath(cwd, 'goose').endsWith(path.join('.goose', 'GOOSEHINTS')), 'goose → .goose/GOOSEHINTS');
});
