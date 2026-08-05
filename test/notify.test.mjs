// Behavioural test for lib/notify.js — no credentials, no network calls.
// Run:  npm test
import { planUrgency, notifyNewLead, notifyUnhandled, notifyLightLead } from '../lib/notify.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// Capture what would be logged to the DB, and what text was built.
const logged = [];
const fakeSupabase = {
  rpc: async () => ({}),
  from() { return { insert(row) { logged.push(row); return Promise.resolve({}); } }; },
};

// Intercept outbound calls so we can assert on the message body.
const sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url: String(url), body: JSON.parse(opts.body) });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

console.log('\n1. planUrgency');
ok('VIP detected',      planUrgency('VIP (349 ₪)').label === 'VIP');
ok('fast detected',     planUrgency('מהיר (249 ₪)').label === 'מהיר');
ok('basic detected',    planUrgency('בסיסי (169 ₪)').label === 'בסיסי');
ok('VIP ranks first',   planUrgency('VIP (349 ₪)').rank < planUrgency('בסיסי (169 ₪)').rank);
ok('unknown is safe',   planUrgency(null).label === 'לא צוין');

console.log('\n2. notifyNewLead with NO credentials (dormant state)');
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
delete process.env.GMAIL_APP_PASSWORD;
const r1 = await notifyNewLead(fakeSupabase, { id: 'abc', plan: 'VIP (349 ₪)', arrivalDate: '2026-09-14' });
ok('does not throw',            Array.isArray(r1));
ok('both channels report skip', r1.every(r => !r.ok && r.detail === 'not configured'), JSON.stringify(r1));
ok('failure is logged',         logged.length === 1 && logged[0].delivered === false);
ok('no network attempted',      sent.length === 0);

console.log('\n3. notifyNewLead WITH telegram configured — privacy boundary');
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = '12345';
const PII = {
  id: '11111111-2222-3333-4444-555555555555',
  plan: 'VIP (349 ₪)',
  arrivalDate: '2026-09-14',
};
sent.length = 0;
const r2 = await notifyNewLead(fakeSupabase, PII);
const msg = sent[0].body.text;
ok('telegram called',    sent.length === 1 && sent[0].url.includes('api.telegram.org'));
ok('telegram succeeded', r2.find(r => r.channel === 'telegram').ok === true);
ok('contains plan',      msg.includes('VIP'));
ok('arrival shown as dd/mm/yy', msg.includes('14/09/26'), msg);
ok('id truncated to 8',  msg.includes('11111111') && !msg.includes('2222-3333'));

// BIDI: Latin runs must be isolated or Telegram reorders them into nonsense
// (the old digest split the id "2b25aa72" across the line). Hebrew must NOT
// be isolated — forcing an LTR isolate around RTL text causes the same bug.
const LRI = '⁦', PDI = '⁩';
ok('date is isolated',   msg.includes(LRI + '14/09/26' + PDI));
ok('id is isolated',     msg.includes(LRI + '11111111' + PDI));
ok('VIP is isolated',    msg.includes(LRI + 'VIP' + PDI));
ok('isolates are balanced',
   (msg.match(/⁦/g) || []).length === (msg.match(/⁩/g) || []).length);

// The real safety property: no leaked personal field can appear.
const forbidden = ['ישראל ישראלי', 'test@example.com', '0501234567', 'X1234567', 'כאבי גב'];
ok('no PII in message',  forbidden.every(f => !msg.includes(f)));
ok('message is short',   msg.length < 400, `len=${msg.length}`);

console.log('\n4. notifyUnhandled orders by flight date, not by plan');
sent.length = 0;
const now = Date.now();
const iso = (days) => new Date(now + days * 86400000).toISOString().slice(0, 10);
await notifyUnhandled(fakeSupabase, [
  // Deliberately inverted against plan rank: the VIP flies last. Sorting by
  // plan would put it on top, which is the bug this replaces — the customer's
  // deadline decides who to answer next, not what they paid.
  { id: 'aaaaaaaa-1', plan: 'VIP (349 ₪)',   arrival_date: iso(40), created_at: new Date(now).toISOString() },
  { id: 'bbbbbbbb-2', plan: 'בסיסי (169 ₪)', arrival_date: iso(-5), created_at: new Date(now).toISOString() },
  { id: 'cccccccc-3', plan: 'מהיר (249 ₪)',  arrival_date: iso(2),  created_at: new Date(now).toISOString() },
]);
const digest = sent[0].body.text;
const iOverdue = digest.indexOf('bbbbbbbb'), iSoon = digest.indexOf('cccccccc'), iLater = digest.indexOf('aaaaaaaa');
ok('soonest flight first', iOverdue < iSoon && iSoon < iLater,
   `overdue=${iOverdue} soon=${iSoon} later=${iLater}`);
ok('count in header',    digest.includes('3 פניות'));
ok('groups by urgency',  digest.includes('🔴') && digest.includes('🟠') && digest.includes('🟢'), digest);
ok('hebrew plan NOT isolated', digest.includes('· בסיסי ·'), digest);
ok('empty list no-ops',  (await notifyUnhandled(fakeSupabase, [])).length === 0);

console.log('\n4c. CRM link replaces the "edit Supabase by hand" instruction');
sent.length = 0;
process.env.CRM_URL = 'https://example.test/crm';
await notifyNewLead(fakeSupabase, { id: 'zz', plan: 'VIP', arrivalDate: iso(3) });
const linked = sent[0].body.text;
ok('links to CRM',       linked.includes('https://example.test/crm'));
ok('no handled=true hint', !linked.includes('handled = true'), linked);
delete process.env.CRM_URL;
sent.length = 0;
await notifyNewLead(fakeSupabase, { id: 'zz', plan: 'VIP', arrivalDate: iso(3) });
ok('degrades without CRM_URL', !sent[0].body.text.includes('undefined'), sent[0].body.text);

console.log('\n4b. notifyLightLead keeps the email address out of the alert');
sent.length = 0;
await notifyLightLead(fakeSupabase, {
  email: 'someone@example.com',
  travel_month: 'ספטמבר',
  lang: 'he',
  source_page: '/guide.html',
});
const soft = sent[0].body.text;
ok('page included',      soft.includes('/guide.html'));
ok('travel month included', soft.includes('ספטמבר'));
ok('EMAIL NOT SENT',     !soft.includes('someone@example.com') && !soft.includes('example.com'), soft);

console.log('\n5. telegram application-level error is caught');
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, description: 'chat not found' }) });
const r3 = await notifyNewLead(fakeSupabase, { id: 'x', plan: 'VIP', arrivalDate: '1' });
const tg = r3.find(r => r.channel === 'telegram');
ok('200-but-not-ok caught', tg.ok === false && tg.detail === 'chat not found', JSON.stringify(tg));

console.log('\n6. network throw is caught, never propagates');
globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
let threw = false;
try { await notifyNewLead(fakeSupabase, { id: 'y', plan: 'VIP', arrivalDate: '1' }); }
catch { threw = true; }
ok('does not propagate', !threw);

console.log(`\n${'='.repeat(40)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(40)}`);
process.exit(fail ? 1 : 0);
