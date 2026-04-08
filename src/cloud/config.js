'use strict';

const path = require('path');
const os = require('os');

// Prefer env vars over os.homedir() — macOS ignores HOME in os.homedir()
// (it reads the password database), making it untestable without this.
const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir() || os.tmpdir();

/** Base URL for the crag cloud API. Override with CRAG_API_URL for testing. */
const API_BASE = process.env.CRAG_API_URL || 'https://api.crag.sh';

/** Directory for crag credentials and cloud config. */
const CREDENTIALS_DIR = path.join(HOME, '.crag');

/** Path to the credentials JSON file. */
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');

module.exports = { API_BASE, CREDENTIALS_DIR, CREDENTIALS_PATH };
