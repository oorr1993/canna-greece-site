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

export async function notifyNewLead(supabase, { id, plan, arrivalDate }) {
  const u = planUrgency(plan);
  const arrival = arrivalDate || 'לא צוין';

  const text =
    `🌿 <b>ליד חדש — קנאפלייט</b>\n\n` +
    `מסלול: <b>${u.label}</b>${u.promise ? ` — ${u.promise}` : ''}\n` +
    `הגעה ליוון: ${arrival}\n` +
    `מספר פנייה: <code>${shortId(id)}</code>\n\n` +
    PANEL_HINT;

  const mailText =
    `ליד חדש — קנאפלייט\n\n` +
    `מסלול: ${u.label}${u.promise ? ` (${u.promise})` : ''}\n` +
    `הגעה ליוון: ${arrival}\n` +
    `מספר פנייה: ${id}\n\n` +
    PANEL_HINT;

  const results = await Promise.all([
    sendTelegram(text),
    sendEmail(`ליד חדש — ${u.label} — קנאפלייט`, mailText),
  ]);

  await logAttempt(supabase, 'new_lead', id, results);
  return results;
}

export async function notifyUnhandled(supabase, rows) {
  if (!rows || !rows.length) return [];

  // Most urgent first: VIP before fast before basic, then oldest first.
  const sorted = [...rows].sort((a, b) => {
    const d = planUrgency(a.plan).rank - planUrgency(b.plan).rank;
    return d !== 0 ? d : new Date(a.created_at) - new Date(b.created_at);
  });

  const line = (r) => {
    const u = planUrgency(r.plan);
    const hours = Math.floor((Date.now() - new Date(r.created_at)) / 3600000);
    return `• ${u.label} · הגעה ${r.arrival_date || 'לא צוין'} · ${shortId(r.id)} · ממתין ${hours} שעות`;
  };

  const head = `⏰ <b>${sorted.length} פניות ממתינות לטיפול — קנאפלייט</b>`;
  const text = `${head}\n\n${sorted.map(line).join('\n')}\n\n` +
    `סמנו <code>handled = true</code> ב-Supabase אחרי טיפול כדי לעצור את התזכורות.`;

  const mailText = text.replace(/<\/?b>/g, '').replace(/<\/?code>/g, '');

  const results = await Promise.all([
    sendTelegram(text),
    sendEmail(`${sorted.length} פניות ממתינות — קנאפלייט`, mailText),
  ]);

  await logAttempt(supabase, 'unhandled_digest', null, results);
  return results;
}
