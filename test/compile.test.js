'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateHusky } = require('../src/compile/husky');
const { generateGitHubActions, detectNodeVersion, detectJavaVersion, detectGoVersion, detectPythonVersion } = require('../src/compile/github-actions');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-compile-test-'));
  // Silence console output from compile functions in tests
  const origLog = console.log;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch {}
  }
}

console.log('\n  compile/husky.js');

test('mandatory gate exits on failure', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        code: { commands: [{ cmd: 'echo test', classification: 'MANDATORY' }], path: null, condition: null },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    assert.ok(script.includes('echo test || exit 1'));
  });
});

test('optional gate warns but continues', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        lint: { commands: [{ cmd: 'eslint .', classification: 'OPTIONAL' }], path: null, condition: null },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    assert.ok(script.includes('[OPTIONAL]'));
    assert.ok(!script.match(/eslint \.\) ?\|\| exit 1/));
  });
});

test('advisory gate never exits', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        audit: { commands: [{ cmd: 'npm audit', classification: 'ADVISORY' }], path: null, condition: null },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    assert.ok(script.includes('[ADVISORY]'));
    assert.ok(!script.includes('exit 1'));
  });
});

test('path-scoped gate runs in subdirectory', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        frontend: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: 'frontend/',
          condition: null,
        },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    assert.ok(script.includes('(cd "frontend/" && npm test)'));
  });
});

test('conditional gate uses if statement (correct precedence)', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        typescript: {
          commands: [{ cmd: 'tsc --noEmit', classification: 'MANDATORY' }],
          path: null,
          condition: 'tsconfig.json',
        },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    // Must use `if [ -e ... ]; then ... fi` form so missing file is skipped, not failed
    assert.ok(script.includes('if [ -e "tsconfig.json" ]; then'));
    assert.ok(script.includes('fi'));
  });
});

console.log('\n  compile/github-actions.js — version detection');

test('detectNodeVersion from package.json engines', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      engines: { node: '>=18.0.0' },
    }));
    assert.strictEqual(detectNodeVersion(dir), '18');
  });
});

test('detectNodeVersion handles caret range', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      engines: { node: '^20' },
    }));
    assert.strictEqual(detectNodeVersion(dir), '20');
  });
});

test('detectNodeVersion returns null for missing package.json', () => {
  withTempDir((dir) => {
    assert.strictEqual(detectNodeVersion(dir), null);
  });
});

test('detectGoVersion from go.mod', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module example\n\ngo 1.22\n');
    assert.strictEqual(detectGoVersion(dir), '1.22');
  });
});

test('detectJavaVersion from build.gradle.kts', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'build.gradle.kts'),
      'java {\n  toolchain {\n    languageVersion = JavaLanguageVersion.of(21)\n  }\n}\n');
    assert.strictEqual(detectJavaVersion(dir), '21');
  });
});

test('detectPythonVersion from pyproject.toml', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'pyproject.toml'),
      '[project]\nrequires-python = ">=3.11"\n');
    assert.strictEqual(detectPythonVersion(dir), '3.11');
  });
});

test('github-actions generator uses detected Node version', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      engines: { node: '20' },
    }));
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: { code: { commands: [{ cmd: 'npm test', classification: 'MANDATORY' }], path: null, condition: null } },
    };
    generateGitHubActions(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.github', 'workflows', 'gates.yml'), 'utf-8');
    assert.ok(yaml.includes("node-version: '20'"));
  });
});

test('github-actions generator marks optional gates continue-on-error', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        lint: { commands: [{ cmd: 'eslint .', classification: 'OPTIONAL' }], path: null, condition: null },
      },
    };
    generateGitHubActions(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.github', 'workflows', 'gates.yml'), 'utf-8');
    assert.ok(yaml.includes('continue-on-error: true'));
    assert.ok(yaml.includes('[OPTIONAL]'));
  });
});
