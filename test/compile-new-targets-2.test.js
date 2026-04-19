'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateJunie } = require('../src/compile/junie');
const { generateKiro } = require('../src/compile/kiro');
const { generateCircleCI } = require('../src/compile/circleci');
const { generateAzureDevOps } = require('../src/compile/azuredevops');
const { generateGoose } = require('../src/compile/goose');

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

function emptyParsed() {
  return {
    name: 'empty-project',
    description: '',
    stack: [],
    runtimes: [],
    commitConvention: '',
    commitTrailer: '',
    security: '',
    gates: {},
  };
}

// ---------------------------------------------------------------------------
// junie.js
// ---------------------------------------------------------------------------

console.log('\n  compile/junie.js');

test('generates .junie/guidelines.md', () => {
  withTempDir((dir) => {
    generateJunie(dir, sampleParsed());
    const out = path.join(dir, '.junie', 'guidelines.md');
    assert.ok(fs.existsSync(out), '.junie/guidelines.md should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Quality Gates'), 'should include Quality Gates heading');
    assert.ok(content.includes('npm test'), 'should include gate command');
  });
});

test('junie output includes crag attribution', () => {
  withTempDir((dir) => {
    generateJunie(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.junie', 'guidelines.md'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
    assert.ok(content.includes('governance.md'), 'should mention governance.md');
  });
});

test('junie output includes stack and runtimes', () => {
  withTempDir((dir) => {
    generateJunie(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.junie', 'guidelines.md'), 'utf-8');
    assert.ok(content.includes('**Stack:**'), 'should include Stack line');
    assert.ok(content.includes('**Runtimes:**'), 'should include Runtimes line');
    assert.ok(content.includes('node'), 'should include node runtime');
  });
});

test('junie output annotates OPTIONAL gates', () => {
  withTempDir((dir) => {
    generateJunie(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.junie', 'guidelines.md'), 'utf-8');
    assert.ok(content.includes('OPTIONAL'), 'should annotate OPTIONAL gates');
  });
});

test('junie output with no gates writes minimal file', () => {
  withTempDir((dir) => {
    generateJunie(dir, emptyParsed());
    const out = path.join(dir, '.junie', 'guidelines.md');
    assert.ok(fs.existsSync(out), '.junie/guidelines.md should exist even with no gates');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Quality Gates'), 'should still have Quality Gates section');
  });
});

// ---------------------------------------------------------------------------
// kiro.js
// ---------------------------------------------------------------------------

console.log('\n  compile/kiro.js');

test('generates .kiro/steering/quality-gates.md', () => {
  withTempDir((dir) => {
    generateKiro(dir, sampleParsed());
    const out = path.join(dir, '.kiro', 'steering', 'quality-gates.md');
    assert.ok(fs.existsSync(out), '.kiro/steering/quality-gates.md should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('alwaysApply: true'), 'should include alwaysApply: true frontmatter');
    assert.ok(content.includes('Quality Gates'), 'should include Quality Gates heading');
  });
});

test('kiro output includes YAML frontmatter with description', () => {
  withTempDir((dir) => {
    generateKiro(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.kiro', 'steering', 'quality-gates.md'), 'utf-8');
    assert.ok(content.includes('description:'), 'should include description in frontmatter');
    assert.ok(content.includes('---'), 'should have YAML frontmatter delimiters');
  });
});

test('kiro output includes gate commands', () => {
  withTempDir((dir) => {
    generateKiro(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.kiro', 'steering', 'quality-gates.md'), 'utf-8');
    assert.ok(content.includes('npm test'), 'should include mandatory gate command');
  });
});

test('kiro output includes crag attribution', () => {
  withTempDir((dir) => {
    generateKiro(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.kiro', 'steering', 'quality-gates.md'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
    assert.ok(content.includes('governance.md'), 'should mention governance.md');
  });
});

test('kiro output with no gates writes minimal file', () => {
  withTempDir((dir) => {
    generateKiro(dir, emptyParsed());
    const out = path.join(dir, '.kiro', 'steering', 'quality-gates.md');
    assert.ok(fs.existsSync(out), '.kiro/steering/quality-gates.md should exist even with no gates');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('alwaysApply: true'), 'should still have alwaysApply: true');
  });
});

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
    assert.ok(content.includes('npx @whitehatd/crag audit'), 'should run crag audit command');
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
    assert.ok(content.includes('npx @whitehatd/crag audit'), 'should run crag audit');
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
// goose.js
// ---------------------------------------------------------------------------

console.log('\n  compile/goose.js');

test('generates .goose/GOOSEHINTS', () => {
  withTempDir((dir) => {
    generateGoose(dir, sampleParsed());
    const out = path.join(dir, '.goose', 'GOOSEHINTS');
    assert.ok(fs.existsSync(out), '.goose/GOOSEHINTS should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Quality Gates'), 'should include Quality Gates heading');
    assert.ok(content.includes('npm test'), 'should include gate command');
  });
});

test('goose output includes crag attribution', () => {
  withTempDir((dir) => {
    generateGoose(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.goose', 'GOOSEHINTS'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
    assert.ok(content.includes('governance.md'), 'should mention governance.md');
  });
});

test('goose output includes stack and runtimes', () => {
  withTempDir((dir) => {
    generateGoose(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.goose', 'GOOSEHINTS'), 'utf-8');
    assert.ok(content.includes('**Stack:**'), 'should include Stack line');
    assert.ok(content.includes('**Runtimes:**'), 'should include Runtimes line');
    assert.ok(content.includes('node'), 'should include node runtime');
  });
});

test('goose output annotates OPTIONAL gates', () => {
  withTempDir((dir) => {
    generateGoose(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.goose', 'GOOSEHINTS'), 'utf-8');
    assert.ok(content.includes('OPTIONAL'), 'should annotate OPTIONAL gates');
  });
});

test('goose output with no gates writes minimal file', () => {
  withTempDir((dir) => {
    generateGoose(dir, emptyParsed());
    const out = path.join(dir, '.goose', 'GOOSEHINTS');
    assert.ok(fs.existsSync(out), '.goose/GOOSEHINTS should exist even with no gates');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Quality Gates'), 'should still have Quality Gates section');
  });
});

// ---------------------------------------------------------------------------
// compile.js integration: ALL_TARGETS and planOutputPath for new targets
// ---------------------------------------------------------------------------

console.log('\n  compile.js — new target registration (batch 2)');

test('ALL_TARGETS includes all 5 new targets', () => {
  const { ALL_TARGETS } = require('../src/commands/compile');
  assert.ok(ALL_TARGETS.includes('junie'), 'ALL_TARGETS should include junie');
  assert.ok(ALL_TARGETS.includes('kiro'), 'ALL_TARGETS should include kiro');
  assert.ok(ALL_TARGETS.includes('circleci'), 'ALL_TARGETS should include circleci');
  assert.ok(ALL_TARGETS.includes('azuredevops'), 'ALL_TARGETS should include azuredevops');
  assert.ok(ALL_TARGETS.includes('goose'), 'ALL_TARGETS should include goose');
});

test('ALL_TARGETS total is now 23', () => {
  const { ALL_TARGETS } = require('../src/commands/compile');
  assert.strictEqual(ALL_TARGETS.length, 23, `expected 23 targets, got ${ALL_TARGETS.length}`);
});

test('planOutputPath returns correct paths for new targets', () => {
  const { planOutputPath } = require('../src/commands/compile');
  const cwd = '/fake/cwd';
  assert.ok(planOutputPath(cwd, 'junie').endsWith(path.join('.junie', 'guidelines.md')), 'junie → .junie/guidelines.md');
  assert.ok(planOutputPath(cwd, 'kiro').endsWith(path.join('.kiro', 'steering', 'quality-gates.md')), 'kiro → .kiro/steering/quality-gates.md');
  assert.ok(planOutputPath(cwd, 'circleci').endsWith(path.join('.circleci', 'config.yml')), 'circleci → .circleci/config.yml');
  assert.ok(planOutputPath(cwd, 'azuredevops').endsWith('azure-pipelines.yml'), 'azuredevops → azure-pipelines.yml');
  assert.ok(planOutputPath(cwd, 'goose').endsWith(path.join('.goose', 'GOOSEHINTS')), 'goose → .goose/GOOSEHINTS');
});
