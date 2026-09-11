#!/usr/bin/env node
/**
 * Can the payment callback actually write?
 *
 * Run after filling the Supabase secret key in .env.local:
 *
 *   node scripts/check-admin.mjs
 *
 * The webhook has no session behind it, so it works through a key that
 * bypasses row security. If that key is wrong, missing, or is the publishable
 * one pasted into the wrong slot, the callback answers 503 and every payment
 * whose browser went away is lost — silently, because nobody watches a 503 on
 * an endpoint only a provider calls.
 *
 * This proves the two things that matter, and nothing else: that the key
 * authenticates, and that it can SEE PAST row security. The second is the
 * real test — the publishable key authenticates perfectly well and then
 * returns an empty list for every table, which looks like an empty database
 * rather than a wrong key.
 *
 * Read-only. It writes nothing and never prints a key.
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
const pick = (name) => process.env[name] || file[name] || '';

const url = pick('NEXT_PUBLIC_SUPABASE_URL');
const secret = pick('SUPABASE_SECRET_KEY') || pick('SUPABASE_SERVICE_ROLE_KEY');
const anon = pick('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const say = (mark, text) => console.log(`${mark}  ${text}`);
const masked = (s) => (s.length <= 12 ? '•'.repeat(s.length) : `${s.slice(0, 12)}${'•'.repeat(6)}`);

console.log('\nCostbook · the callback\'s key\n');

if (url === '') {
  say('✗', 'NEXT_PUBLIC_SUPABASE_URL is not set.');
  process.exit(1);
}
if (secret === '') {
  say('·', 'No secret key set.');
  console.log(
    '\n   Supabase → Project Settings → API Keys → Secret keys → reveal the\n' +
      '   sb_secret_... row and copy it into SUPABASE_SECRET_KEY in .env.local.\n' +
      '   The legacy service_role key works too, under the "Legacy" tab, in\n' +
      '   SUPABASE_SERVICE_ROLE_KEY. Either is read.\n\n' +
      '   Until one is set the payment callback answers 503 and says so in the\n' +
      '   log. Payments confirmed in the browser still work.\n',
  );
  process.exit(1);
}

say('·', `Key         ${masked(secret)}`);

/*
 * The wrong key, caught by shape before a single request.
 *
 * Pasting the publishable key here is the easy mistake — the two rows sit
 * one above the other on the same screen — and it does not fail like a wrong
 * key. It authenticates, and then row security returns nothing for every
 * table, which reads as an empty database.
 */
if (secret === anon || secret.startsWith('sb_publishable_')) {
  say('✗', 'That is the PUBLISHABLE key, not the secret one.');
  console.log(
    '\n   They sit one above the other on the same screen. The publishable key\n' +
      '   authenticates and then sees nothing, because row security is exactly\n' +
      '   what it is subject to — so this would look like an empty database\n' +
      '   rather than a wrong key. Take the row headed "Secret keys".\n',
  );
  process.exit(1);
}

const kind = secret.startsWith('sb_secret_')
  ? 'the new secret key'
  : secret.startsWith('eyJ')
    ? 'the legacy service_role key'
    : 'an unrecognised shape';
say('·', `Shape       ${kind}`);

/* One read, of a table row security would otherwise hide completely. */
let res;
try {
  res = await fetch(`${url}/rest/v1/payment_orders?select=id&limit=1`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
} catch (e) {
  say('✗', `Could not reach Supabase: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

if (res.status === 401 || res.status === 403) {
  say('✗', `Supabase refused the key (${res.status}).`);
  console.log('\n   Copy it again — the whole string, from the Secret keys row.\n');
  process.exit(1);
}
if (!res.ok) {
  say('✗', `Supabase answered ${res.status}. ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}

say('✓', 'Reaches     Supabase accepted it');

/*
 * The proof. payment_orders is owner-only under RLS, so a key WITHOUT the
 * bypass gets 200 and an empty array here — indistinguishable from a table
 * that happens to have no rows. A key with the bypass sees whatever is
 * actually there. So the count is only meaningful next to the anon key's:
 * if both see nothing, this says so rather than claiming success.
 */
const rows = await res.json();
const seen = Array.isArray(rows) ? rows.length : 0;

if (seen > 0) {
  say('✓', 'Sees past   row security — it can settle an order');
  console.log('\n   The payment callback can write. Restart the server if it was\n   running before you filled this in.\n');
  process.exit(0);
}

/* Nothing there to see. Ask the anon key the same question to tell apart
   "no orders yet" from "this key cannot see them". */
let anonSaw = null;
if (anon !== '') {
  try {
    const a = await fetch(`${url}/rest/v1/payment_orders?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    anonSaw = a.ok ? ((await a.json())?.length ?? 0) : null;
  } catch {
    anonSaw = null;
  }
}

say('·', `Sees        no orders yet${anonSaw === 0 ? ' (and neither does the publishable key)' : ''}`);
console.log(
  '\n   That is consistent with a working key on a book that has never had a\n' +
    '   paid order. It cannot be proved either way until there is one — open a\n' +
    '   checkout once and run this again, and it will say so plainly.\n',
);
