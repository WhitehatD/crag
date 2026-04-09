'use strict';

const { validateFlags } = require('../cli-args');
const { cliError, EXIT_USER } = require('../cli-errors');
const { requireAuth } = require('../cloud/auth');
const { apiRequest } = require('../cloud/client');

/**
 * crag team — manage teams on crag cloud.
 *
 * Subcommands:
 *   crag team                Show current team
 *   crag team create <name>  Create a new team
 *   crag team join <code>    Join with invite code
 *   crag team members        List team members
 *   crag team invite         Generate invite link
 *   crag team leave          Leave current team
 */
async function team(args) {
  const sub = args[1];
  switch (sub) {
    case 'create':  return teamCreate(args.slice(2));
    case 'join':    return teamJoin(args.slice(2));
    case 'members': return teamMembers(args.slice(2));
    case 'invite':  return teamInvite(args.slice(2));
    case 'leave':   return teamLeave(args.slice(2));
    default:
      if (!sub || sub === '--json') return teamInfo(args);
      if (sub === '--help' || sub === '-h') { printTeamUsage(); return; }
      printTeamUsage();
      process.exit(EXIT_USER);
  }
}

function printTeamUsage() {
  console.log(`
  crag team \u2014 team management

  Usage:
    crag team                       Show current team (if any)
    crag team create <name>         Create a new team
    crag team join <code>           Join a team with a shared invite code
    crag team members               List team members
    crag team invite <email>        Send an email invitation (personal link)
    crag team invite                Generate a shared invite code (legacy)
    crag team leave                 Leave current team

  Options:
    --json                          Machine-readable JSON output (team, members)
  `);
}

// ── team info ───────────────────────────────────────────────────────────

async function teamInfo(args) {
  validateFlags('team', args, { boolean: ['--json'] });
  const json = args.includes('--json');
  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = requireAuth();

  let result;
  try {
    result = await apiRequest('GET', '/api/teams/me', { token: creds.token });
  } catch (err) {
    cliError(`failed to fetch team info: ${err.message}`, EXIT_USER);
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.team) {
    console.log(`\n  ${B}crag team${X}\n`);
    console.log(`  ${D}No team. Create one:${X} crag team create <name>\n`);
    return;
  }

  console.log(`\n  ${B}crag team${X} ${D}\u2014 ${result.team.name}${X}\n`);
  console.log(`  ${D}Name${X}     ${result.team.name}`);
  console.log(`  ${D}ID${X}       ${result.team.id}`);
  console.log(`  ${D}Members${X}  ${result.team.member_count}`);
  console.log(`  ${D}Repos${X}    ${result.team.repo_count}`);
  if (result.team.role) console.log(`  ${D}Role${X}     ${result.team.role}`);
  console.log('');
}

// ── create ──────────────────────────────────────────────────────────────

async function teamCreate(args) {
  const name = args.find(a => !a.startsWith('-'));
  if (!name) {
    cliError('team name required: crag team create <name>', EXIT_USER);
  }

  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = requireAuth();

  console.log(`\n  ${B}crag team create${X}\n`);

  let result;
  try {
    result = await apiRequest('POST', '/api/teams', {
      token: creds.token,
      body: { name },
    });
  } catch (err) {
    cliError(`failed to create team: ${err.message}`, EXIT_USER);
  }

  console.log(`  ${G}\u2713${X} Team ${B}${result.name}${X} created`);
  console.log(`  ${D}ID${X}      ${result.id}`);
  console.log(`  ${D}Invite${X}  crag team join ${result.invite_code}\n`);
}

// ── join ────────────────────────────────────────────────────────────────

async function teamJoin(args) {
  const code = args.find(a => !a.startsWith('-'));
  if (!code) {
    cliError('invite code required: crag team join <code>', EXIT_USER);
  }

  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = requireAuth();

  console.log(`\n  ${B}crag team join${X}\n`);

  let result;
  try {
    result = await apiRequest('POST', '/api/teams/join', {
      token: creds.token,
      body: { code },
    });
  } catch (err) {
    cliError(`failed to join team: ${err.message}`, EXIT_USER);
  }

  console.log(`  ${G}\u2713${X} Joined team ${B}${result.name}${X}`);
  console.log(`  ${D}Members${X}  ${result.member_count}\n`);
}

// ── members ─────────────────────────────────────────────────────────────

async function teamMembers(args) {
  validateFlags('team members', args, { boolean: ['--json'] });
  const json = args.includes('--json');
  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = requireAuth();

  let result;
  try {
    result = await apiRequest('GET', '/api/teams/me/members', { token: creds.token });
  } catch (err) {
    cliError(`failed to list members: ${err.message}`, EXIT_USER);
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  ${B}crag team members${X}\n`);

  for (const m of result.members) {
    const roleTag = m.role === 'owner' ? ` ${D}(owner)${X}` : '';
    console.log(`  ${G}\u25cf${X} ${m.username}${roleTag}`);
  }
  console.log(`\n  ${D}${result.members.length} member${result.members.length !== 1 ? 's' : ''}${X}\n`);
}

// ── invite ──────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function teamInvite(args) {
  // If an email-looking positional is present, dispatch to the email flow.
  // Otherwise fall back to generating a shared code (legacy behaviour).
  const positional = args.find(a => !a.startsWith('-'));
  if (positional && EMAIL_RE.test(positional)) {
    return teamInviteEmail(positional);
  }
  return teamInviteCode(args);
}

async function teamInviteEmail(email) {
  const G = '\x1b[32m'; const Y = '\x1b[33m';
  const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = requireAuth();

  console.log(`\n  ${B}crag team invite${X} ${D}\u2014 ${email}${X}\n`);

  let result;
  try {
    result = await apiRequest('POST', '/api/teams/me/invitations', {
      token: creds.token,
      body: { email },
    });
  } catch (err) {
    cliError(`failed to send invitation: ${err.message}`, EXIT_USER);
  }

  const sent = result.mail && result.mail.sent;
  if (sent) {
    console.log(`  ${G}\u2713${X} Invitation emailed to ${B}${email}${X}`);
  } else {
    const reason = (result.mail && result.mail.reason) || 'email delivery not configured';
    console.log(`  ${Y}!${X} Invitation created, but email not sent (${reason})`);
    console.log(`  ${D}Copy the link and send it manually:${X}`);
  }

  if (result.accept_url) {
    console.log(`  ${D}Link${X}    ${result.accept_url}`);
  }
  if (result.expires_at) {
    console.log(`  ${D}Expires${X} ${new Date(result.expires_at).toUTCString()}`);
  }
  console.log('');
}

async function teamInviteCode(args) {
  validateFlags('team invite', args, {});
  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const creds = requireAuth();

  console.log(`\n  ${B}crag team invite${X}\n`);

  let result;
  try {
    result = await apiRequest('POST', '/api/teams/me/invite', { token: creds.token });
  } catch (err) {
    cliError(`failed to generate invite: ${err.message}`, EXIT_USER);
  }

  console.log(`  ${G}\u2713${X} Invite code: ${B}${result.code}${X}`);
  console.log(`  ${D}Share:${X}  crag team join ${result.code}`);
  console.log(`  ${D}Tip:${X}    for single-use email invites, run ${B}crag team invite <email>${X}`);
  if (result.expires) console.log(`  ${D}Expires${X} ${result.expires}`);
  console.log('');
}

// ── leave ───────────────────────────────────────────────────────────────

async function teamLeave(args) {
  validateFlags('team leave', args, {});
  const G = '\x1b[32m'; const B = '\x1b[1m'; const X = '\x1b[0m';
  const creds = requireAuth();

  console.log(`\n  ${B}crag team leave${X}\n`);

  let result;
  try {
    result = await apiRequest('POST', '/api/teams/me/leave', { token: creds.token });
  } catch (err) {
    cliError(`failed to leave team: ${err.message}`, EXIT_USER);
  }

  console.log(`  ${G}\u2713${X} Left team ${B}${result.name}${X}\n`);
}

module.exports = { team };
