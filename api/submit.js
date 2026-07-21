import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const REQUIRED = ['plan', 'full_name', 'email', 'phone', 'condition_text'];
const MAX_LEN = 5000;

const ALLOWED_ORIGINS = new Set([
  'https://www.canaflight.com',
  'https://canaflight.com',
]);

// Defense-in-depth against cross-site abuse: a browser doing a legit
// same-origin POST sends Origin: https://www.canaflight.com. Non-browser
// clients (no Origin header) are still allowed — this is not a rate
// limiter, just a block on a foreign site scripting a visitor's browser
// to spam this endpoint cross-origin.
function originAllowed(req) {
  const origin = req.headers['origin'];
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function clean(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_LEN) : null;
}

// Customer-facing confirmation email — dormant until GMAIL_APP_PASSWORD
// is set. Sent from the business Gmail via SMTP; never blocks the
// submission on failure.
async function sendCustomerConfirmation({ email, fullName, plan, lang }) {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass || !email) return;

  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  const isEn = lang === 'en';
  const planPromise = (p) => {
    p = String(p || '');
    if (p.includes('VIP')) return isEn
      ? 'On your VIP track — expect an answer within about an hour during working hours. ⚡'
      : 'במסלול ה-VIP שבחרת — תשובה עד שעה בשעות הפעילות. ⚡';
    if (p.includes('מהיר')) return isEn
      ? 'On your Fast track — expect an answer within 24 hours. ⚡'
      : 'במסלול המהיר שבחרת — תשובה עד 24 שעות. ⚡';
    if (p.includes('בסיסי')) return isEn
      ? 'On the Basic track — expect an answer within one to two weeks.'
      : 'במסלול הבסיסי — תשובה תוך שבוע–שבועיים.';
    return '';
  };

  const subject = isEn
    ? 'We got your request 🌿 CanaFlight'
    : 'הפנייה שלך התקבלה 🌿 קנאפלייט';
  const text = isEn
    ? `Hi ${first},\n\nYour request is in! A licensed Greek doctor will personally review it. 🎉\n${planPromise(plan)}\n\nWhat now? Nothing 😎 Just keep an eye on WhatsApp and email — we take it from here.\n\nQuestions? Simply reply to this email.\n\nThe CanaFlight team 🌿\nwww.canaflight.com`
    : `היי ${first},\n\nהפנייה שלך אצלנו! רופא מורשה ביוון יעבור עליה אישית. 🎉\n${planPromise(plan)}\n\nמה עכשיו? כלום 😎 רק תהיו זמינים בוואטסאפ ובמייל — משם זה עלינו.\n\nיש שאלה? פשוט משיבים למייל הזה.\n\nצוות קנאפלייט 🌿\nwww.canaflight.com`;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: '1cana.flight@gmail.com', pass },
    });
    await transporter.sendMail({
      from: '"CanaFlight קנאפלייט" <1cana.flight@gmail.com>',
      to: email,
      subject,
      text,
    });
  } catch { /* never block the submission on this */ }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad request' });

  // Honeypot: real users never fill this hidden field.
  if (clean(body.website)) return res.status(200).json({ ok: true });

  const record = {
    id: typeof body.submissionId === 'string' && /^[0-9a-f-]{36}$/.test(body.submissionId) ? body.submissionId : undefined,
    plan: clean(body.plan),
    services: Array.isArray(body.services) ? body.services.map(clean).filter(Boolean).slice(0, 5) : [],
    full_name: clean(body.full_name),
    passport_number: clean(body.passport_number),
    citizenship: clean(body.citizenship),
    age: clean(body.age),
    gender: clean(body.gender),
    email: clean(body.email),
    phone: clean(body.phone),
    stay_city: clean(body.stay_city),
    arrival_date: clean(body.arrival_date),
    condition_text: clean(body.condition_text),
    has_existing_rx: clean(body.has_existing_rx),
    product_pref: clean(body.product_pref),
    thc_pref: clean(body.thc_pref),
    grams: clean(body.grams),
    referral_source: clean(body.referral_source),
    consents: Array.isArray(body.consents) ? body.consents.map(clean).filter(Boolean).slice(0, 5) : [],
    files: Array.isArray(body.files)
      ? body.files.filter(f => f && typeof f.path === 'string' && typeof f.kind === 'string')
          .map(f => ({ kind: f.kind.slice(0, 20), path: f.path.slice(0, 200) })).slice(0, 3)
      : [],
  };

  for (const field of REQUIRED) {
    if (!record[field]) return res.status(400).json({ error: `missing ${field}` });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('submissions').insert(record).select('id').single();
  if (error) return res.status(500).json({ error: 'db error' });

  // Send the customer their confirmation email (best-effort; never blocks).
  // No conversion or health-related event is sent to any advertising platform.
  await sendCustomerConfirmation({
    email: record.email,
    fullName: record.full_name,
    plan: record.plan,
    lang: clean(body.lang) === 'en' ? 'en' : 'he',
  });

  // Operational ping with zero personal data (submission id only).
  try {
    await fetch('https://formsubmit.co/ajax/1cana.flight@gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'פנייה חדשה — קנאפלייט (מערכת מאובטחת)',
        message: `התקבלה פנייה חדשה. מספר פנייה: ${data.id}. הפרטים המלאים בפאנל Supabase (טבלת submissions).`,
      }),
    });
  } catch {}

  return res.status(200).json({ ok: true, id: data.id });
}
