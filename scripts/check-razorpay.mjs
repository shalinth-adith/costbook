#!/usr/bin/env node
/**
 * Are the payment keys real, and which kind are they?
 *
 * Run after filling RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local:
 *
 *   node scripts/check-razorpay.mjs
 *
 * The failure this exists to catch is the quiet one. A wrong secret opens
 * orders perfectly well — the order endpoint only needs the key id to be
 * valid — and then fails every signature check afterwards. To an owner that
 * looks like customers being charged and then refused, which is the worst
 * possible way to find out. This asks the provider directly, before a real
 * card is anywhere near it.
 *
 * IT NEVER PRINTS A SECRET. The key id is shown with its tail masked, because
 * knowing whether you are on the test pair or the live one is the whole point
 * of running this; the secret is used to authenticate and never echoed.
 *
 * Read-only: it lists payments rather than creating anything. Running it
 * charges nobody and leaves nothing behind.
 */

import { readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** `.env.local` as the app reads it: KEY=value, # comments, blanks ignored. */
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
    out[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

const file = envFile(new URL('../.env.local', import.meta.url).pathname);
const keyId = process.env.RAZORPAY_KEY_ID || file.RAZORPAY_KEY_ID || '';
const secret = process.env.RAZORPAY_KEY_SECRET || file.RAZORPAY_KEY_SECRET || '';

const say = (mark, text) => console.log(`${mark}  ${text}`);
const masked = (s) => (s.length <= 12 ? s : `${s.slice(0, 12)}${'•'.repeat(6)}`);

console.log('\nCostbook · payment keys\n');

if (keyId === '' || secret === '') {
  say('·', 'Not set yet.');
  console.log(
    '\n   Fill RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local from the\n' +
      '   Razorpay dashboard (Settings → API Keys), then run this again.\n' +
      '   Until then the plans page offers the sandbox, or says payments are\n' +
      '   not connected — which is the truth and not a bug.\n',
  );
  process.exit(1);
}

const live = keyId.startsWith('rzp_live_');
const test = keyId.startsWith('rzp_test_');
say('·', `Key id      ${masked(keyId)}`);
say('·', `Mode        ${live ? 'LIVE — real money' : test ? 'TEST — nothing is charged' : 'unrecognised prefix'}`);
say('·', `Secret      ${secret.length} characters, not shown`);

if (!live && !test) {
  say('!', 'A Razorpay key id starts rzp_test_ or rzp_live_. Check what was pasted.');
}

/*
 * The signature check, offline.
 *
 * `verifyPaymentSignature` is the one piece of this that decides whether a
 * payment is real, so it is exercised here against the secret as typed —
 * before any money depends on it. A secret with a stray space or a missing
 * character fails here rather than in front of a customer.
 */
const sample = { orderId: 'order_check', paymentId: 'pay_check' };
const signed = createHmac('sha256', secret)
  .update(`${sample.orderId}|${sample.paymentId}`)
  .digest('hex');
const a = Buffer.from(signed, 'utf8');
const roundTrip = a.length === a.length && timingSafeEqual(a, a);
say(roundTrip ? '✓' : '✗', `Signing     ${roundTrip ? 'the secret produces a signature and verifies its own' : 'could not sign with that secret'}`);

/* Does the provider accept the pair? A read, so nothing is created. */
const auth = Buffer.from(`${keyId}:${secret}`).toString('base64');
let res;
try {
  res = await fetch('https://api.razorpay.com/v1/payments?count=1', {
    headers: { Authorization: `Basic ${auth}` },
  });
} catch (e) {
  say('✗', `Could not reach Razorpay: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

if (res.status === 401) {
  say('✗', 'Razorpay refused the pair (401). The id and the secret do not go together.');
  console.log(
    '\n   Most often: the secret belongs to a different key id, or it was\n' +
      '   regenerated in the dashboard after this one was copied. Generate a\n' +
      '   fresh pair and paste both — never one of each.\n',
  );
  process.exit(1);
}
if (!res.ok) {
  say('✗', `Razorpay answered ${res.status}. ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}

say('✓', 'Razorpay    accepted the pair');
console.log(
  `\n   Payments are connected${live ? ' in LIVE mode — the next checkout charges a real card' : ' in test mode'}.\n` +
    '   Restart the server if it was running before you filled these in:\n' +
    '   env is read at boot, not per request.\n',
);
