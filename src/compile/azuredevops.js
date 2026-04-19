'use strict';

const path = require('path');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to Azure DevOps pipeline config.
 * Output: azure-pipelines.yml
 *
 * Generates an Azure DevOps pipeline that runs `crag audit` on pushes and
 * pull requests to main/master branches.
 *
 * Reference:
 *   https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/
 */
function generateAzureDevOps(cwd, parsed) {
  const content = `# Generated from governance.md by crag — https://crag.sh
# Regenerate: crag compile --target azuredevops
trigger:
  - main
  - master

pr:
  - main
  - master

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js'

  - script: npx @whitehatd/crag audit
    displayName: 'Run crag governance audit'
`;

  const outPath = path.join(cwd, 'azure-pipelines.yml');
  const final = preserveCustomSections(outPath, content, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAzureDevOps };
