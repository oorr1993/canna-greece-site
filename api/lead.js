// Soft lead capture — two fields, no medical data.
//
// The full intake form is the right shape for someone ready to buy and much
// too heavy for someone halfway through a guide. This endpoint backs the
// short form on the content pages so those readers can leave a way to reach
// them instead of leaving nothing.
//
// See the DESIGN CONSTRAINT in supabase/growth.sql: nothing resembling a
// symptom, condition or treatment may be accepted here. If a future version
// needs that, it belongs in the intake pipeline, which is built for it.

import { createClient } from '@supabase/supabase-js';
import { originAllowed, readJsonBody, clean, cleanEmail } from '../lib/http.js';
import { notifyLightLead } from '../lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'not configured' });

  const body = readJsonBody(req);
  if (!body) return res.status(400).json({ error: 'bad request' });

  // Honeypot: the field is hidden from real users, so anything in it is a bot.
  // Answer 200 so the bot cannot tell it was filtered and retry differently.
  if (clean(body.website)) return res.status(200).json({ ok: true });

  const email = cleanEmail(body.email);
  if (!email) return res.status(400).json({ error: 'invalid email' });

  const record = {
    email,
    travel_month: clean(body.travel_month, 60),
    lang: clean(body.lang, 2) === 'en' ? 'en' : 'he',
    source_page: clean(body.source_page, 120),
  };

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from('light_leads').insert(record);
  if (error) return res.status(500).json({ error: 'db error' });

  // Counted for the funnel view alongside the intake events.
  try {
    await supabase.from('funnel_events').insert({ event: 'light_lead', lang: record.lang });
  } catch { /* a missing counter must not fail a captured lead */ }

  try {
    await notifyLightLead(supabase, record);
  } catch { /* the lead is saved; never fail the request over an alert */ }

  return res.status(200).json({ ok: true });
}
