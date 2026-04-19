'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to CircleCI workflow config.
 * Output: .circleci/config.yml
 *
 * Generates a CircleCI pipeline that runs `crag audit` on every branch,
 * ensuring governance drift is detected in CI.
 *
 * Reference:
 *   https://circleci.com/docs/configuration-reference/
 */
function generateCircleCI(cwd, parsed) {
  const content = `# Generated from governance.md by crag — https://crag.sh
# Regenerate: crag compile --target circleci
version: 2.1

jobs:
  crag-audit:
    docker:
      - image: cimg/node:lts
    steps:
      - checkout
      - run:
          name: Run crag governance audit
          command: npx @whitehatd/crag audit

workflows:
  governance:
    jobs:
      - crag-audit:
          filters:
            branches:
              only: /.*/
`;

  const dir = path.join(cwd, '.circleci');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outPath = path.join(dir, 'config.yml');
  const final = preserveCustomSections(outPath, content, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateCircleCI };
