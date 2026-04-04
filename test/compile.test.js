'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateHusky } = require('../src/compile/husky');
const { generateGitHubActions, detectNodeVersion, detectJavaVersion, detectGoVersion, detectPythonVersion } = require('../src/compile/github-actions');
const { generatePreCommitConfig } = require('../src/compile/pre-commit');

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

// --- Security regression tests: injection via gate.path / gate.condition ---
//
// The parser now rejects absolute / traversal paths, but the compile targets
// must ALSO escape anything that does pass the parser. These tests exercise
// the escaper directly by bypassing the parser and handing the target a gate
// object with adversarial metadata — this simulates both a future parser bug
// AND a caller that constructs gates programmatically.

test('husky: gate.path with quote does not break shell syntax', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        evil: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: 'foo" && rm -rf / ; echo "',
          condition: null,
        },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    // The quote must be escaped so it doesn't close the cd "..." context.
    assert.ok(script.includes('\\"'));
    // The raw unescaped payload must NOT appear in the script.
    assert.ok(!script.includes('" && rm -rf / ; echo "'));
  });
});

test('husky: gate.path with backslash is escaped before quote', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        evil: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: 'foo\\',
          condition: null,
        },
      },
    };
    generateHusky(dir, parsed);
    const script = fs.readFileSync(path.join(dir, '.husky', 'pre-commit'), 'utf-8');
    // Backslash must be doubled so the closing " is not escaped away.
    assert.ok(script.includes('cd "foo\\\\"'));
  });
});

test('github-actions: gate.path with colon is YAML-quoted', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        evil: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: 'weird: path',
          condition: null,
        },
      },
    };
    generateGitHubActions(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.github', 'workflows', 'gates.yml'), 'utf-8');
    // Colon-containing path must be quoted as a YAML scalar.
    assert.ok(yaml.includes('working-directory: "weird: path"'));
  });
});

test('github-actions: gate.condition with single quote is GHA-expr-escaped', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        evil: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: null,
          condition: "foo') || true; #",
        },
      },
    };
    generateGitHubActions(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.github', 'workflows', 'gates.yml'), 'utf-8');
    // GHA expressions double single-quotes to escape them. The raw unclosed
    // quote must not appear as a bare ' in the hashFiles() argument.
    assert.ok(yaml.includes("''") || !yaml.includes("hashFiles('foo')"));
  });
});

test('github-actions: step name with colon is YAML-quoted', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        'wacky: section': {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: null,
          condition: null,
        },
      },
    };
    generateGitHubActions(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.github', 'workflows', 'gates.yml'), 'utf-8');
    // The name line must be wrapped in double quotes because it contains a colon.
    assert.ok(/name: "[^"]*wacky[^"]*"/.test(yaml));
  });
});

console.log('\n  compile/pre-commit.js');

test('pre-commit: basic gate produces valid YAML', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        code: { commands: [{ cmd: 'npm test', classification: 'MANDATORY' }], path: null, condition: null },
      },
    };
    generatePreCommitConfig(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.pre-commit-config.yaml'), 'utf-8');
    assert.ok(yaml.includes('repos:'));
    assert.ok(yaml.includes('repo: local'));
    assert.ok(yaml.includes('id: gate-1'));
    assert.ok(yaml.includes('entry: bash -c'));
    assert.ok(yaml.includes('npm test'));
  });
});

test('pre-commit: optional gate is wrapped in failure-tolerant block', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        lint: { commands: [{ cmd: 'eslint .', classification: 'OPTIONAL' }], path: null, condition: null },
      },
    };
    generatePreCommitConfig(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.pre-commit-config.yaml'), 'utf-8');
    assert.ok(yaml.includes('[OPTIONAL]'));
    assert.ok(yaml.includes('continuing'));
  });
});

test('pre-commit: gate.path with single quote is single-quote-escaped', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        evil: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          // The string inside the gate.path contains a single quote which
          // would close the outer bash -c '...' wrapper if unescaped.
          path: "it's",
          condition: null,
        },
      },
    };
    generatePreCommitConfig(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.pre-commit-config.yaml'), 'utf-8');
    // The single quote must be escaped via '\'' so the bash wrapper is intact.
    assert.ok(yaml.includes("'\\''"));
  });
});

test('pre-commit: gate.path with double quote does not escape wrapper', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        evil: {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: 'foo" && rm',
          condition: null,
        },
      },
    };
    generatePreCommitConfig(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.pre-commit-config.yaml'), 'utf-8');
    // Double quote inside the cd argument must be backslash-escaped so it
    // stays inside the cd's " string rather than closing it.
    assert.ok(yaml.includes('\\"'));
  });
});

test('pre-commit: section name with colon is YAML-quoted in name field', () => {
  withTempDir((dir) => {
    const parsed = {
      name: 't', description: '', runtimes: ['node'],
      gates: {
        'edge: case': {
          commands: [{ cmd: 'npm test', classification: 'MANDATORY' }],
          path: null,
          condition: null,
        },
      },
    };
    generatePreCommitConfig(dir, parsed);
    const yaml = fs.readFileSync(path.join(dir, '.pre-commit-config.yaml'), 'utf-8');
    // The name: value contains a colon, so yamlScalar must quote it.
    assert.ok(/name: "[^"]*edge: case[^"]*"/.test(yaml));
  });
});
