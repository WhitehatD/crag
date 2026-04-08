'use strict';

const { validateFlags } = require('../cli-args');
const { cliError, EXIT_USER } = require('../cli-errors');
const { readCredentials, writeCredentials, clearCredentials, browserAuth } = require('../cloud/auth');

/**
 * crag login — authenticate with crag cloud via GitHub OAuth.
 *
 * Subcommands:
 *   crag login            Open browser for GitHub OAuth
 *   crag login --status   Show current auth state
 *   crag login --logout   Clear saved credentials
 */
async function login(args) {
  validateFlags('login', args, {
    boolean: ['--status', '--logout'],
  });

  if (args.includes('--status')) return loginStatus();
  if (args.includes('--logout')) return loginLogout();
  return loginInteractive();
}

async function loginInteractive() {
  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';

  console.log(`\n  ${B}crag login${X}\n`);
  console.log(`  ${D}Opening browser for GitHub authentication...${X}`);

  try {
    const { token, user } = await browserAuth();
    writeCredentials({ token, user, created: new Date().toISOString() });
    console.log(`  ${G}\u2713${X} Logged in as ${B}${user}${X}`);
    console.log(`  ${D}Token saved to ~/.crag/credentials.json${X}\n`);
  } catch (err) {
    cliError(`login failed: ${err.message}`, EXIT_USER);
  }
}

function loginStatus() {
  const G = '\x1b[32m'; const Y = '\x1b[33m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = readCredentials();

  console.log(`\n  ${B}crag login${X} ${D}\u2014 status${X}\n`);

  if (!creds || !creds.token) {
    console.log(`  ${Y}\u25cb${X} Not logged in`);
    console.log(`  ${D}Run:${X} crag login\n`);
    return;
  }

  console.log(`  ${G}\u2713${X} Logged in as ${B}${creds.user}${X}`);
  if (creds.created) console.log(`  ${D}Since${X}  ${creds.created}`);
  console.log('');
}

function loginLogout() {
  const G = '\x1b[32m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = readCredentials();

  if (!creds || !creds.token) {
    console.log(`\n  ${D}Not logged in \u2014 nothing to do.${X}\n`);
    return;
  }

  clearCredentials();
  console.log(`\n  ${G}\u2713${X} Logged out.\n`);
}

module.exports = { login };
