// Operational lead alerts — Telegram (instant push) + Gmail (backup).
//
// PRIVACY BOUNDARY — read before adding a field to any message here.
// These alerts travel through Telegram and Gmail, both third parties. They
// therefore carry NO name, email, phone, passport number, city or medical
// text. Ever. Plan and arrival date are the only payload, and they are the
// only two things that change what you do next: the plan sets the promised
// response time (VIP is one hour) and the arrival date sets the deadline.
// Everything identifying stays in Supabase behind the service-role key.
// The submission id is a random uuid and identifies a row, not a person.
//
// Both channels are dormant until their env vars are set, matching the rest
// of this codebase: nothing breaks while they are unset, the alert is simply
// recorded as skipped in notification_log so the gap is visible rather than
// silent.

import nodemailer from 'nodemailer';

const OPS_EMAIL = '1cana.flight@gmail.com';
const PANEL_HINT = 'הפרטים המלאים בפאנל Supabase → submissions.';
const TIMEOUT_MS = 5000;

// Bound every outbound call: a hanging third party must not hold the
// submission response open. The lead is already committed to the database
// by the time we get here, so a timed-out alert costs a notification, never
// the lead itself.
async function withTimeout(promise, ms = TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// The plan string is stored verbatim from the form ("VIP (349 ₪)"), and both
// the Hebrew and English forms post the same Hebrew values — see the radio
// inputs named "מסלול" in intake.html and en/intake.html.
export function planUrgency(plan) {
  const p = String(plan || '');
  if (p.includes('VIP')) return { label: 'VIP', promise: 'עד שעה בשעות הפעילות', rank: 0 };
  if (p.includes('מהיר')) return { label: 'מהיר', promise: 'עד 24 שעות', rank: 1 };
  if (p.includes('בסיסי')) return { label: 'בסיסי', promise: 'שבוע–שבועיים', rank: 2 };
  return { label: p || 'לא צוין', promise: '', rank: 3 };
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

// BIDI — why every Latin run below is wrapped.
// These messages are Hebrew (RTL) with dates and hex ids embedded in them
// (LTR). Without explicit isolation the Unicode bidi algorithm reorders those
// runs against the surrounding text, and the result is genuinely unreadable:
// the previous digest rendered the id "2b25aa72" as a stray "2" on one side of
// the line and "b25aa72" on the other. LRI…PDI tells the renderer to treat the
// wrapped run as one opaque left-to-right unit, which fixes it everywhere —
// Telegram, Gmail, and any client that follows the spec.
const LRI = '⁦';
const PDI = '⁩';
const ltr = (s) => `${LRI}${s}${PDI}`;

// Only Latin/numeric runs need the treatment. Wrapping Hebrew in a
// left-to-right isolate forces it to lay out against its own direction, which
// breaks exactly what the isolate is there to protect — so plan labels like
// "מהיר" are passed through untouched while "VIP" is wrapped.
const HEBREW = /[֐-׿]/;
const isolate = (s) => (HEBREW.test(String(s)) ? String(s) : ltr(s));

function parseDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(s) {
  const d = parseDate(s);
  if (!d) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;
}

function daysUntil(s) {
  const d = parseDate(s);
  if (!d) return null;
  const n = new Date();
  const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  return Math.round((d.getTime() - today) / 86400000);
}

// When the request actually came in. Postgres stores this as timestamptz in
// UTC, so it has to be rendered in Israel time or every alert reads two or
// three hours early — and the gap changes with DST, which rules out a fixed
// offset. Intl handles the transition; if the runtime ever ships without the
// timezone data, the fallback says UTC out loud rather than quietly showing
// the wrong local time.
function fmtWhen(ts, withYear = true) {
  if (!ts) return null;
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  const opts = {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  };
  if (withYear) opts.year = '2-digit';
  try {
    // Assembled from parts rather than taking the locale's own string: he-IL
    // formats dates with dots, and flight dates elsewhere in the same message
    // use slashes. Two separators for two dates in one alert reads like two
    // different kinds of value.
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('he-IL', opts).formatToParts(d).map((x) => [x.type, x.value]));
    const date = withYear ? `${p.day}/${p.month}/${p.year}` : `${p.day}/${p.month}`;
    return `${date} ${p.hour}:${p.minute}`;
  } catch {
    return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
}

function agoText(ts) {
  if (!ts) return null;
  const d = new Date(String(ts).replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 2) return 'ממש עכשיו';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return `לפני ${days} ימים`;
}

// The flight date, not the submission time, is what makes a lead urgent — a
// basic-track request for a flight tomorrow beats a VIP one for November. The
// old digest sorted by plan and reported "waiting 341 hours", which described
// our own lateness rather than the customer's deadline.
function arrival(s) {
  const n = daysUntil(s);
  const date = fmtDate(s);
  if (n === null) return { icon: '⚪', text: 'תאריך טיסה לא צוין', date: null, rank: 9e9 };
  const suffix = date ? ` · ${ltr(date)}` : '';
  if (n < 0) return { icon: '🔴', text: `הטיסה עברה לפני ${Math.abs(n)} ימים${suffix}`, date, rank: n };
  if (n === 0) return { icon: '🔴', text: `הטיסה היום${suffix}`, date, rank: n };
  if (n === 1) return { icon: '🟠', text: `הטיסה מחר${suffix}`, date, rank: n };
  if (n <= 3) return { icon: '🟠', text: `הטיסה בעוד ${n} ימים${suffix}`, date, rank: n };
  if (n <= 14) return { icon: '🟡', text: `הטיסה בעוד ${n} ימים${suffix}`, date, rank: n };
  return { icon: '🟢', text: `הטיסה בעוד ${n} ימים${suffix}`, date, rank: n };
}

// Lead handling lives in the CRM now, so every alert ends with a way into it
// rather than an instruction to go edit a database column by hand. The URL is
// configuration, not a secret, but it stays in an env var because this repo is
// public and the dashboard is not.
function crmLink(label = 'פתיחה ב-CRM') {
  const url = process.env.CRM_URL;
  return url ? `\n\n<a href="${url}">👉 ${label}</a>` : '';
}
function crmLinkPlain() {
  const url = process.env.CRM_URL;
  return url ? `\n\nל-CRM: ${url}` : '';
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { channel: 'telegram', ok: false, detail: 'not configured' };

  try {
    const res = await withTimeout(fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    }));
    // Telegram answers 200 with {"ok":false} for application-level errors
    // (bad chat id, bot blocked), so the HTTP status alone is not enough.
    const body = await res.json().catch(() => null);
    if (res.ok && body && body.ok === true) return { channel: 'telegram', ok: true, detail: null };
    return {
      channel: 'telegram',
      ok: false,
      detail: (body && body.description) || `http ${res.status}`,
    };
  } catch (err) {
    return { channel: 'telegram', ok: false, detail: String(err && err.message || err) };
  }
}

async function sendEmail(subject, text) {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return { channel: 'email', ok: false, detail: 'not configured' };

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: OPS_EMAIL, pass },
    });
    await withTimeout(transporter.sendMail({
      from: `"CanaFlight התראות" <${OPS_EMAIL}>`,
      to: OPS_EMAIL,
      subject,
      text,
    }));
    return { channel: 'email', ok: true, detail: null };
  } catch (err) {
    return { channel: 'email', ok: false, detail: String(err && err.message || err) };
  }
}

// Best-effort audit trail. The previous implementation swallowed delivery
// failures in an empty catch, which meant a dead notification channel looked
// exactly like a quiet week. Writing the outcome here is what makes
// "am I actually being told about leads?" an answerable question.
async function logAttempt(supabase, kind, submissionId, results) {
  if (!supabase) return;
  try {
    await supabase.from('notification_log').insert({
      kind,
      submission_id: submissionId || null,
      delivered: results.some((r) => r.ok),
      channels: results,
    });
  } catch { /* logging must never break the caller */ }
}

export async function notifyNewLead(supabase, { id, plan, arrivalDate, createdAt }) {
  const u = planUrgency(plan);
  const a = arrival(arrivalDate);
  // Falls back to now only when the caller has no row timestamp to pass. The
  // database value is the one to trust — it is when the customer actually hit
  // send, not when this alert happened to be built.
  const when = fmtWhen(createdAt || new Date().toISOString());

  const text =
    `🌿 <b>ליד חדש</b>\n` +
    `━━━━━━━━━━━━━━\n` +
    `⚡ מסלול <b>${isolate(u.label)}</b>${u.promise ? ` · ${u.promise}` : ''}\n` +
    `${a.icon} ${a.text}\n` +
    `📥 נכנס ${ltr(when)}\n` +
    `🆔 <code>${ltr(shortId(id))}</code>` +
    crmLink();

  const mailText =
    `ליד חדש — קנאפלייט\n\n` +
    `מסלול: ${u.label}${u.promise ? ` (${u.promise})` : ''}\n` +
    `${a.text}\n` +
    `נכנס: ${when}\n` +
    `מספר פנייה: ${id}` +
    crmLinkPlain();

  const results = await Promise.all([
    sendTelegram(text),
    sendEmail(`ליד חדש · ${u.label} · ${a.date || 'ללא תאריך'}`, mailText),
  ]);

  await logAttempt(supabase, 'new_lead', id, results);

  // Keeps the "התראות שנשלחו" counter in the CRM meaningful. Best-effort: a
  // failed counter must not turn a delivered alert into an error.
  if (supabase && id) {
    try {
      await supabase.rpc('bump_alerts_sent', { p_id: id });
    } catch { /* counter is cosmetic; the alert already went out */ }
  }

  return results;
}

// A soft lead carries no medical data, but the email address alone is still
// enough to infer a health interest once you know which site it came from —
// so it stays out of the alert for the same reason a name does. The page and
// travel month are what tell you how warm the lead is; the address is one
// click away in Supabase.
export async function notifyLightLead(supabase, { travel_month, lang, source_page }) {
  const when = travel_month || 'לא צוין';
  const page = source_page || 'לא ידוע';

  const text =
    `✉️ <b>ליד רך חדש</b>\n` +
    `━━━━━━━━━━━━━━\n` +
    `📄 מהעמוד ${ltr(page)}\n` +
    `✈️ טס ליוון: ${when}\n` +
    `🌐 ${lang === 'en' ? 'אנגלית' : 'עברית'}\n\n` +
    `הכתובת שמורה ב-Supabase → light_leads.`;

  const mailText = text.replace(/<\/?b>/g, '');

  const results = await Promise.all([
    sendTelegram(text),
    sendEmail('ליד רך חדש — קנאפלייט', mailText),
  ]);

  await logAttempt(supabase, 'light_lead', null, results);
  return results;
}

// Optional summary — nothing schedules this. The CRM dashboard is the queue
// now, and its own KPI tiles already answer "what is waiting?", so a recurring
// digest would just be the bot repeating what the dashboard shows. The
// endpoint stays because it is written and tested: re-enable it by scheduling
// api/cron-unhandled.js (see supabase/notifications.sql) if that changes.
export async function notifyUnhandled(supabase, rows) {
  if (!rows || !rows.length) return [];

  // Ordered by the flight date, soonest first — the customer's deadline is
  // what decides who to answer next, not which plan they paid for.
  const enriched = rows
    .map((r) => ({ ...r, a: arrival(r.arrival_date), u: planUrgency(r.plan) }))
    .sort((x, y) => x.a.rank - y.a.rank);

  const GROUPS = [
    { icon: '🔴', title: 'עברו או טסים היום', test: (n) => n <= 0 },
    { icon: '🟠', title: 'טסים ב-3 הימים הקרובים', test: (n) => n >= 1 && n <= 3 },
    { icon: '🟡', title: 'טסים בשבועיים הקרובים', test: (n) => n >= 4 && n <= 14 },
    { icon: '🟢', title: 'טסים בהמשך', test: (n) => n > 14 && n < 9e9 },
    { icon: '⚪', title: 'ללא תאריך טיסה', test: (n) => n >= 9e9 },
  ];

  // Two lines per lead: the flight and the plan on top, when the request came
  // in underneath. Cramming both onto one line is what made the old digest
  // unreadable — six fields, three direction changes, no room to scan.
  const row = (r) => {
    const when = fmtWhen(r.created_at, false);
    const ago = agoText(r.created_at);
    const head = `✈️ ${r.a.date ? ltr(r.a.date) : 'ללא תאריך'} · ${isolate(r.u.label)} · <code>${ltr(shortId(r.id))}</code>`;
    if (!when) return head;
    return `${head}\n   📥 נכנס ${ltr(when)}${ago ? ` · ${ago}` : ''}`;
  };

  const blocks = GROUPS
    .map((g) => ({ g, items: enriched.filter((r) => g.test(r.a.rank)) }))
    .filter(({ items }) => items.length)
    .map(({ g, items }) =>
      `${g.icon} <b>${g.title} · ${items.length}</b>\n${items.map(row).join('\n')}`);

  const text =
    `📋 <b>${enriched.length} פניות פתוחות</b>\n` +
    `━━━━━━━━━━━━━━\n` +
    blocks.join('\n\n') +
    crmLink('טיפול ב-CRM');

  const mailText = text.replace(/<\/?b>/g, '').replace(/<\/?code>/g, '');

  const results = await Promise.all([
    sendTelegram(text),
    sendEmail(`${enriched.length} פניות פתוחות — קנאפלייט`, mailText),
  ]);

  await logAttempt(supabase, 'unhandled_digest', null, results);
  return results;
}
