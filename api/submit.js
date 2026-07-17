import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const REQUIRED = ['plan', 'full_name', 'email', 'phone', 'condition_text'];
const MAX_LEN = 5000;
const TIKTOK_PIXEL_CODE = 'D9CSE9JC77UDPAPRO6FG';
const META_PIXEL_ID = '1323004023320424';

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

function sha256(v) {
  return createHash('sha256').update(v.trim().toLowerCase()).digest('hex');
}

// Server-side half of the TikTok Events API — dormant until
// TIKTOK_ACCESS_TOKEN is set. Uses the same event_id the browser pixel
// fires on thanks.html so TikTok deduplicates instead of double-counting.
async function sendTikTokEvent({ eventId, email, phone, req, pageUrl }) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token || typeof eventId !== 'string' || !eventId) return;

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const ua = req.headers['user-agent'];
  const user = {};
  if (ip) user.ip = ip;
  if (ua) user.user_agent = ua;
  if (email) user.email = sha256(email);
  if (phone) user.phone = sha256(phone.replace(/[^\d+]/g, ''));

  const body = {
    event_source: 'web',
    event_source_id: TIKTOK_PIXEL_CODE,
    data: [{
      event: 'SubmitForm',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      user,
      page: { url: pageUrl },
    }],
  };

  try {
    await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Access-Token': token },
      body: JSON.stringify(body),
    });
  } catch { /* never block the submission on this */ }
}

function parseCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// Server-side half of Meta's Conversions API — dormant until
// META_ACCESS_TOKEN is set. Shares the same event_id as the browser
// pixel fire on thanks.html so Meta deduplicates instead of double-counting.
async function sendMetaEvent({ eventId, email, phone, req, pageUrl }) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || typeof eventId !== 'string' || !eventId) return;

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const ua = req.headers['user-agent'];
  const cookieHeader = req.headers['cookie'];
  const fbp = parseCookie(cookieHeader, '_fbp');
  const fbc = parseCookie(cookieHeader, '_fbc');

  const user_data = {};
  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;
  if (email) user_data.em = [sha256(email)];
  if (phone) user_data.ph = [sha256(phone.replace(/[^\d+]/g, ''))];
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;

  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: pageUrl,
      action_source: 'website',
      user_data,
    }],
  };

  try {
    await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  await Promise.all([
    sendTikTokEvent({
      eventId: clean(body.eventId),
      email: record.email,
      phone: record.phone,
      req,
      pageUrl: 'https://www.canaflight.com/intake.html',
    }),
    sendMetaEvent({
      eventId: clean(body.eventId),
      email: record.email,
      phone: record.phone,
      req,
      pageUrl: 'https://www.canaflight.com/intake.html',
    }),
  ]);

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
