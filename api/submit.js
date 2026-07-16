import { createClient } from '@supabase/supabase-js';

const REQUIRED = ['plan', 'full_name', 'email', 'phone', 'condition_text'];
const MAX_LEN = 5000;

function clean(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_LEN) : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

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
