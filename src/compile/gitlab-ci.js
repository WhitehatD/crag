'use strict';

const path = require('path');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to GitLab CI workflow.
 * Output: .gitlab-ci.yml
 *
 * Generates a GitLab CI pipeline that runs `crag audit` on merge requests
 * and on the default branch, ensuring governance drift is detected in CI.
 *
 * Reference:
 *   https://docs.gitlab.com/ee/ci/yaml/
 */
function generateGitlabCI(cwd, parsed) {
  const content = `# Generated from governance.md by crag — https://crag.sh
# Regenerate: crag compile --target gitlab

stages:
  - governance

crag-audit:
  stage: governance
  image: node:lts-alpine
  script:
    - npm install -g @whitehatd/crag
    - crag audit
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
`;

  const outPath = path.join(cwd, '.gitlab-ci.yml');
  const final = preserveCustomSections(outPath, content, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateGitlabCI };
