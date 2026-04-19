'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateAider } = require('../src/compile/aider');
const { generateLefthook } = require('../src/compile/lefthook');
const { generateGitlabCI } = require('../src/compile/gitlab-ci');
const { generateCoderabbit } = require('../src/compile/coderabbit');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-new-targets-test-'));
  const origLog = console.log;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// Minimal parsed governance object used across tests
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
      frontend: {
        commands: [
          { cmd: 'npx biome check .', classification: 'MANDATORY' },
        ],
        path: 'frontend/',
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
// aider.js
// ---------------------------------------------------------------------------

console.log('\n  compile/aider.js');

test('generates CONVENTIONS.md at repo root', () => {
  withTempDir((dir) => {
    generateAider(dir, sampleParsed());
    const out = path.join(dir, 'CONVENTIONS.md');
    assert.ok(fs.existsSync(out), 'CONVENTIONS.md should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Quality Gates'), 'should include Quality Gates heading');
    assert.ok(content.includes('npm test'), 'should include gate command');
  });
});

test('aider output groups gates by section', () => {
  withTempDir((dir) => {
    generateAider(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'CONVENTIONS.md'), 'utf-8');
    assert.ok(content.includes('### Test') || content.includes('### Frontend'), 'should have section headings');
    assert.ok(content.includes('npx biome check .'), 'should include frontend gate');
  });
});

test('aider output includes crag attribution', () => {
  withTempDir((dir) => {
    generateAider(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'CONVENTIONS.md'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
    assert.ok(content.includes('governance.md'), 'should mention governance.md');
  });
});

test('aider output with no gates writes minimal file', () => {
  withTempDir((dir) => {
    generateAider(dir, emptyParsed());
    const out = path.join(dir, 'CONVENTIONS.md');
    assert.ok(fs.existsSync(out), 'CONVENTIONS.md should exist even with no gates');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Quality Gates'), 'should still have Quality Gates section');
  });
});

test('aider optional gate annotated in output', () => {
  withTempDir((dir) => {
    generateAider(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'CONVENTIONS.md'), 'utf-8');
    assert.ok(content.includes('OPTIONAL'), 'should annotate OPTIONAL gates');
  });
});

// ---------------------------------------------------------------------------
// lefthook.js
// ---------------------------------------------------------------------------

console.log('\n  compile/lefthook.js');

test('generates lefthook.yml at repo root', () => {
  withTempDir((dir) => {
    generateLefthook(dir, sampleParsed());
    const out = path.join(dir, 'lefthook.yml');
    assert.ok(fs.existsSync(out), 'lefthook.yml should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('pre-commit:'), 'should include pre-commit key');
    assert.ok(content.includes('commands:'), 'should include commands key');
  });
});

test('lefthook output names commands gate-N', () => {
  withTempDir((dir) => {
    generateLefthook(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'lefthook.yml'), 'utf-8');
    assert.ok(content.includes('gate-0:'), 'should have gate-0');
    assert.ok(content.includes('gate-1:'), 'should have gate-1');
    assert.ok(content.includes('npm test'), 'should include gate command');
  });
});

test('lefthook output adds glob for path-scoped gates', () => {
  withTempDir((dir) => {
    generateLefthook(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'lefthook.yml'), 'utf-8');
    assert.ok(content.includes('glob:'), 'should have glob for path-scoped gate');
    assert.ok(content.includes('frontend/'), 'should reference path');
  });
});

test('lefthook optional gate marked with skip: true', () => {
  withTempDir((dir) => {
    generateLefthook(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'lefthook.yml'), 'utf-8');
    assert.ok(content.includes('skip: true'), 'OPTIONAL gate should have skip: true');
    assert.ok(content.includes('fail_text:'), 'OPTIONAL gate should have fail_text');
    assert.ok(content.includes('[OPTIONAL]'), 'should reference OPTIONAL classification');
  });
});

test('lefthook output with no gates writes header only', () => {
  withTempDir((dir) => {
    generateLefthook(dir, emptyParsed());
    const out = path.join(dir, 'lefthook.yml');
    assert.ok(fs.existsSync(out), 'lefthook.yml should exist even with no gates');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('pre-commit:'), 'should still have pre-commit key');
  });
});

// ---------------------------------------------------------------------------
// gitlab-ci.js
// ---------------------------------------------------------------------------

console.log('\n  compile/gitlab-ci.js');

test('generates .gitlab-ci.yml at repo root', () => {
  withTempDir((dir) => {
    generateGitlabCI(dir, sampleParsed());
    const out = path.join(dir, '.gitlab-ci.yml');
    assert.ok(fs.existsSync(out), '.gitlab-ci.yml should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('crag-audit:'), 'should include crag-audit job');
    assert.ok(content.includes('stages:'), 'should include stages');
    assert.ok(content.includes('governance'), 'should include governance stage');
  });
});

test('gitlab-ci output runs crag audit in script', () => {
  withTempDir((dir) => {
    generateGitlabCI(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.gitlab-ci.yml'), 'utf-8');
    assert.ok(content.includes('crag audit'), 'should run crag audit');
    assert.ok(content.includes('npm install -g @whitehatd/crag'), 'should install crag');
  });
});

test('gitlab-ci output triggers on merge requests and default branch', () => {
  withTempDir((dir) => {
    generateGitlabCI(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.gitlab-ci.yml'), 'utf-8');
    assert.ok(content.includes('merge_request_event'), 'should trigger on MRs');
    assert.ok(content.includes('CI_DEFAULT_BRANCH'), 'should trigger on default branch');
  });
});

test('gitlab-ci output includes crag attribution', () => {
  withTempDir((dir) => {
    generateGitlabCI(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.gitlab-ci.yml'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
  });
});

// ---------------------------------------------------------------------------
// coderabbit.js
// ---------------------------------------------------------------------------

console.log('\n  compile/coderabbit.js');

test('generates .coderabbit.yaml at repo root', () => {
  withTempDir((dir) => {
    generateCoderabbit(dir, sampleParsed());
    const out = path.join(dir, '.coderabbit.yaml');
    assert.ok(fs.existsSync(out), '.coderabbit.yaml should exist');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('path_instructions'), 'should include path_instructions');
    assert.ok(content.includes('version:'), 'should include version');
  });
});

test('coderabbit output flattens all gates into instructions block', () => {
  withTempDir((dir) => {
    generateCoderabbit(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.coderabbit.yaml'), 'utf-8');
    assert.ok(content.includes('npm test'), 'should include mandatory gate');
    assert.ok(content.includes('npx biome check .'), 'should include path-scoped gate');
  });
});

test('coderabbit output applies to all paths', () => {
  withTempDir((dir) => {
    generateCoderabbit(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.coderabbit.yaml'), 'utf-8');
    assert.ok(content.includes('"**/*"'), 'should apply to all paths');
  });
});

test('coderabbit output with no gates writes minimal file', () => {
  withTempDir((dir) => {
    generateCoderabbit(dir, emptyParsed());
    const out = path.join(dir, '.coderabbit.yaml');
    assert.ok(fs.existsSync(out), '.coderabbit.yaml should exist even with no gates');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('path_instructions'), 'should still have path_instructions');
  });
});

test('coderabbit output includes crag attribution', () => {
  withTempDir((dir) => {
    generateCoderabbit(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.coderabbit.yaml'), 'utf-8');
    assert.ok(content.includes('crag'), 'should reference crag');
    assert.ok(content.includes('governance.md'), 'should mention governance.md');
  });
});

// ---------------------------------------------------------------------------
// compile.js integration: ALL_TARGETS and planOutputPath
// ---------------------------------------------------------------------------

console.log('\n  compile.js — new target registration');

test('ALL_TARGETS includes all 4 new targets', () => {
  const { ALL_TARGETS } = require('../src/commands/compile');
  assert.ok(ALL_TARGETS.includes('aider'), 'ALL_TARGETS should include aider');
  assert.ok(ALL_TARGETS.includes('lefthook'), 'ALL_TARGETS should include lefthook');
  assert.ok(ALL_TARGETS.includes('gitlab'), 'ALL_TARGETS should include gitlab');
  assert.ok(ALL_TARGETS.includes('coderabbit'), 'ALL_TARGETS should include coderabbit');
});

test('planOutputPath returns correct paths for new targets', () => {
  const { planOutputPath } = require('../src/commands/compile');
  const cwd = '/fake/cwd';
  assert.ok(planOutputPath(cwd, 'aider').endsWith('CONVENTIONS.md'), 'aider → CONVENTIONS.md');
  assert.ok(planOutputPath(cwd, 'lefthook').endsWith('lefthook.yml'), 'lefthook → lefthook.yml');
  assert.ok(planOutputPath(cwd, 'gitlab').endsWith('.gitlab-ci.yml'), 'gitlab → .gitlab-ci.yml');
  assert.ok(planOutputPath(cwd, 'coderabbit').endsWith('.coderabbit.yaml'), 'coderabbit → .coderabbit.yaml');
});
