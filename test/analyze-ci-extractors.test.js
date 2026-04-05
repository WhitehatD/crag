'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractCiCommands, extractJenkinsfileCommands } = require('../src/analyze/ci-extractors');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-ci-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

console.log('\n  analyze/ci-extractors.js');

test('extractCiCommands: GitHub Actions', () => {
  const dir = mkFixture({
    '.github/workflows/test.yml': `
name: Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
      - run: cargo clippy -- -D warnings
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'github-actions');
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('cargo clippy -- -D warnings'));
});

test('extractCiCommands: GitLab CI script list', () => {
  const dir = mkFixture({
    '.gitlab-ci.yml': `
test:
  script:
    - npm ci
    - npm test
    - npm run lint
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'gitlab-ci');
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('npm run lint'));
});

test('extractCiCommands: CircleCI inline run', () => {
  const dir = mkFixture({
    '.circleci/config.yml': `
version: 2.1
jobs:
  build:
    steps:
      - run: cargo test
      - run: cargo clippy
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'circle-ci');
  assert.ok(commands.includes('cargo test'));
  assert.ok(commands.includes('cargo clippy'));
});

test('extractCiCommands: Travis CI script block', () => {
  const dir = mkFixture({
    '.travis.yml': `
language: ruby
script:
  - bundle exec rspec
  - bundle exec rubocop
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'travis-ci');
  assert.ok(commands.includes('bundle exec rspec'));
});

test('extractCiCommands: Azure Pipelines script', () => {
  const dir = mkFixture({
    'azure-pipelines.yml': `
steps:
- script: dotnet test
  displayName: Run tests
- script: dotnet build
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'azure-pipelines');
  assert.ok(commands.includes('dotnet test'));
  assert.ok(commands.includes('dotnet build'));
});

test('extractCiCommands: Buildkite commands list', () => {
  const dir = mkFixture({
    '.buildkite/pipeline.yml': `
steps:
  - label: test
    commands:
      - go test ./...
      - go vet ./...
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'buildkite');
  assert.ok(commands.includes('go test ./...'));
});

test('extractCiCommands: Drone commands list', () => {
  const dir = mkFixture({
    '.drone.yml': `
kind: pipeline
steps:
  - name: test
    commands:
      - make test
      - make lint
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'drone');
  assert.ok(commands.includes('make test'));
});

test('extractCiCommands: Bitbucket script', () => {
  const dir = mkFixture({
    'bitbucket-pipelines.yml': `
pipelines:
  default:
    - step:
        script:
          - pytest
          - ruff check .
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'bitbucket');
  assert.ok(commands.includes('pytest'));
  assert.ok(commands.includes('ruff check .'));
});

test('extractCiCommands: no CI returns null system and empty commands', () => {
  const dir = mkFixture({ 'README.md': 'no ci here' });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, null);
  assert.deepStrictEqual(commands, []);
});

// --- Jenkinsfile ---

test('extractCiCommands: Jenkinsfile declarative pipeline (inline sh)', () => {
  const dir = mkFixture({
    'Jenkinsfile': `pipeline {
  agent any
  stages {
    stage('Build') {
      steps {
        sh 'mvn clean package'
        sh 'npm test'
      }
    }
    stage('Lint') {
      steps {
        sh 'npm run lint'
      }
    }
  }
}
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'jenkins');
  assert.ok(commands.includes('mvn clean package'));
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('npm run lint'));
});

test('extractJenkinsfileCommands: triple-single-quoted multi-line', () => {
  const content = `pipeline {
  stages {
    stage('Test') {
      steps {
        sh '''
          npm ci
          npm run test
          npm run lint
        '''
      }
    }
  }
}`;
  const cmds = extractJenkinsfileCommands(content);
  assert.ok(cmds.includes('npm ci'));
  assert.ok(cmds.includes('npm run test'));
  assert.ok(cmds.includes('npm run lint'));
});

test('extractJenkinsfileCommands: triple-double-quoted multi-line with interpolation', () => {
  const content = `pipeline {
  stages {
    stage('Build') {
      steps {
        sh """
          export VERSION=\${env.BUILD_NUMBER}
          mvn -Dversion=\${VERSION} package
        """
      }
    }
  }
}`;
  const cmds = extractJenkinsfileCommands(content);
  assert.ok(cmds.some(c => c.includes('mvn')));
});

test('extractJenkinsfileCommands: bat and pwsh variants', () => {
  const content = `pipeline {
  stages {
    stage('Windows') {
      steps {
        bat 'mvn clean package'
        pwsh 'Get-ChildItem'
        powershell 'dotnet test'
      }
    }
  }
}`;
  const cmds = extractJenkinsfileCommands(content);
  assert.ok(cmds.includes('mvn clean package'));
  assert.ok(cmds.includes('Get-ChildItem'));
  assert.ok(cmds.includes('dotnet test'));
});

test('extractJenkinsfileCommands: scripted pipeline (node block)', () => {
  const content = `node {
  stage('Build') {
    sh 'cargo build --release'
  }
  stage('Test') {
    sh 'cargo test'
  }
}`;
  const cmds = extractJenkinsfileCommands(content);
  assert.ok(cmds.includes('cargo build --release'));
  assert.ok(cmds.includes('cargo test'));
});

test('extractJenkinsfileCommands: skips comments inside multi-line blocks', () => {
  const content = `pipeline {
  stages {
    stage('Test') {
      steps {
        sh '''
          # install deps
          npm ci
          // test
          npm test
        '''
      }
    }
  }
}`;
  const cmds = extractJenkinsfileCommands(content);
  assert.ok(cmds.includes('npm ci'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(!cmds.includes('# install deps'));
  assert.ok(!cmds.includes('// test'));
});

test('extractJenkinsfileCommands: credentials() calls are not captured as commands', () => {
  const content = `pipeline {
  environment {
    DAGGER_CLOUD_TOKEN = credentials('DAGGER_CLOUD_TOKEN')
  }
  stages {
    stage('Run') {
      steps {
        sh 'dagger call hello'
      }
    }
  }
}`;
  const cmds = extractJenkinsfileCommands(content);
  assert.ok(cmds.includes('dagger call hello'));
  assert.ok(!cmds.some(c => c.includes('credentials(')));
  assert.ok(!cmds.some(c => c.includes('DAGGER_CLOUD_TOKEN')));
});

test('extractCiCommands: Jenkinsfile with sh(script: ...) map form', () => {
  const dir = mkFixture({
    'Jenkinsfile': `pipeline {
  stages {
    stage('Build') {
      steps {
        sh(script: 'make build')
        sh(script: "make test")
      }
    }
  }
}
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'jenkins');
  assert.ok(commands.includes('make build'));
  assert.ok(commands.includes('make test'));
});

test('extractCiCommands: ci/Jenkinsfile subdirectory', () => {
  const dir = mkFixture({
    'ci/Jenkinsfile': `pipeline {
  stages {
    stage('Build') {
      steps {
        sh 'make release'
      }
    }
  }
}
`,
  });
  const { system, commands } = extractCiCommands(dir);
  assert.strictEqual(system, 'jenkins');
  assert.ok(commands.includes('make release'));
});
