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
ok('contains arrival',   msg.includes('2026-09-14'));
ok('id truncated to 8',  msg.includes('11111111') && !msg.includes('2222-3333'));

// The real safety property: no leaked personal field can appear.
const forbidden = ['ישראל ישראלי', 'test@example.com', '0501234567', 'X1234567', 'כאבי גב'];
ok('no PII in message',  forbidden.every(f => !msg.includes(f)));
ok('message is short',   msg.length < 400, `len=${msg.length}`);

console.log('\n4. notifyUnhandled ordering');
sent.length = 0;
const now = Date.now();
await notifyUnhandled(fakeSupabase, [
  { id: 'aaaaaaaa-1', plan: 'בסיסי (169 ₪)', arrival_date: '2026-10-01', created_at: new Date(now - 9e6).toISOString() },
  { id: 'bbbbbbbb-2', plan: 'VIP (349 ₪)',   arrival_date: '2026-09-14', created_at: new Date(now - 5e6).toISOString() },
  { id: 'cccccccc-3', plan: 'מהיר (249 ₪)',  arrival_date: '2026-09-20', created_at: new Date(now - 7e6).toISOString() },
]);
const digest = sent[0].body.text;
const iVip = digest.indexOf('bbbbbbbb'), iFast = digest.indexOf('cccccccc'), iBasic = digest.indexOf('aaaaaaaa');
ok('VIP listed first',   iVip < iFast && iFast < iBasic, `vip=${iVip} fast=${iFast} basic=${iBasic}`);
ok('count in header',    digest.includes('3 פניות'));
ok('empty list no-ops',  (await notifyUnhandled(fakeSupabase, [])).length === 0);

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
