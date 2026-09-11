#!/usr/bin/env node
/**
 * Is the mail provider connected, and will it accept what we send as?
 *
 * Run after filling RESEND_API_KEY in .env.local:
 *
 *   node scripts/check-resend.mjs
 *
 * The failure this exists to catch: a key that works perfectly and a domain
 * that is not verified. Resend accepts the key, lists your domains happily,
 * and then refuses every send with a 403 saying the from address is not
 * yours. Nothing in Costbook would look broken — mail_outbox would simply
 * fill up with rows whose last_error nobody reads.
 *
 * So this checks the two things together: that the key authenticates, and
 * that the DOMAIN IN MAIL_FROM is one the provider has actually verified.
 *
 * IT NEVER SENDS AN EMAIL and never prints the key.
 */

import { readFileSync } from 'node:fs';

function envFile(path) {
  const out = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const file = envFile(new URL('../.env.local', import.meta.url).pathname);
const key = process.env.RESEND_API_KEY || file.RESEND_API_KEY || '';
const from = process.env.MAIL_FROM || file.MAIL_FROM || '';

const say = (mark, text) => console.log(`${mark}  ${text}`);
const masked = (s) => (s.length <= 9 ? s : `${s.slice(0, 9)}${'•'.repeat(6)}`);

/** The domain out of "Costbook <hello@costbook.in>" or a bare address. */
function domainOf(address) {
  const inAngles = /<([^>]+)>/.exec(address);
  const bare = (inAngles ? inAngles[1] : address).trim();
  const at = bare.lastIndexOf('@');
  return at === -1 ? null : bare.slice(at + 1).toLowerCase();
}

console.log('\nCostbook · mail\n');

if (key === '') {
  say('·', 'Not connected.');
  console.log(
    '\n   Nothing is lost while this is unset: a support reply is delivered\n' +
      '   inside Costbook and its copy waits in mail_outbox, dated when it was\n' +
      '   written. Fill RESEND_API_KEY in .env.local, restart, and press\n' +
      '   "Send waiting" on /admin/mail — the backlog goes out oldest first.\n',
  );
  process.exit(1);
}

say('·', `API key     ${masked(key)}`);
say('·', `Sends as    ${from === '' ? 'Costbook <hello@costbook.in>  (the fallback)' : from}`);

const sending = domainOf(from === '' ? 'hello@costbook.in' : from);
if (sending === null) {
  say('!', `MAIL_FROM has no address in it: ${from}`);
}

let res;
try {
  res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${key}` },
  });
} catch (e) {
  say('✗', `Could not reach Resend: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

if (!res.ok) {
  const said = (await res.text()).slice(0, 300);
  /*
   * A rejected key comes back 400 as often as 401 — malformed is a validation
   * error to Resend, revoked is an auth one. Both mean the same thing to an
   * owner, so both get the same sentence rather than the raw JSON.
   */
  const aboutTheKey =
    res.status === 401 || res.status === 403 || /api key/i.test(said);
  say('✗', `Resend refused (${res.status}). ${aboutTheKey ? 'The key is not one it knows.' : said}`);
  if (aboutTheKey) {
    console.log(
      '\n   Resend → API Keys → Create API Key. Sending access is enough;\n' +
        '   it does not need full access. It is shown once — paste the whole\n' +
        '   thing, including the re_ at the front, and restart afterwards.\n',
    );
  }
  process.exit(1);
}

say('✓', 'Key         Resend accepted it');

const body = await res.json();
const domains = Array.isArray(body?.data) ? body.data : [];
if (domains.length === 0) {
  say('✗', 'No domains on this account at all.');
  console.log(
    '\n   Resend → Domains → Add Domain, enter costbook.in, then put the DNS\n' +
      '   records it gives you at your registrar and press Verify.\n',
  );
  process.exit(1);
}

console.log('');
for (const d of domains) {
  const ok = d.status === 'verified';
  say(ok ? '✓' : '·', `${String(d.name).padEnd(20)} ${d.status}${d.region ? `  (${d.region})` : ''}`);
}

const match = domains.find((d) => String(d.name).toLowerCase() === sending);
console.log('');

if (match === undefined) {
  say('✗', `Nothing sends as ${sending}: it is not a domain on this account.`);
  console.log(
    '\n   Either add it in Resend, or point MAIL_FROM at a domain that is\n' +
      "   there. Every send would be refused 403 until they agree — and the\n" +
      '   only sign would be rows piling up in mail_outbox.\n',
  );
  process.exit(1);
}

if (match.status !== 'verified') {
  say('✗', `${sending} is "${match.status}", not verified. Sends will be refused.`);
  /*
   * The two are not the same problem and they do not have the same fix.
   * "not_started" means the provider has never gone and looked — the records
   * may be perfect and nobody has pressed the button. "pending" means it
   * looked and did not find everything. Telling an owner to go hunting for a
   * missing record when the truth is that nothing has been checked yet costs
   * an afternoon.
   */
  console.log(
    match.status === 'not_started'
      ? `\n   Nothing has been checked yet — that is what "not_started" means.\n` +
          `   Add the three records at your DNS provider, then press Verify in\n` +
          `   Resend → Domains → ${sending}. It moves to "pending" while it looks.\n`
      : '\n   Checked, and something is missing. Resend → Domains → ' +
          `${sending}\n   marks which record it could not find. DNS can take a few hours;\n` +
          '   nothing is lost meanwhile, the queue simply waits.\n',
  );
  process.exit(1);
}

say('✓', `Sending     ${sending} is verified — mail will go out as ${from || 'the fallback'}`);
console.log(
  '\n   Restart the server if it was running before you filled this in, then\n' +
    '   press "Send waiting" on /admin/mail to drain anything queued.\n',
);
