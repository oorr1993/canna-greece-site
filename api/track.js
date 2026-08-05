// Funnel counters — anonymous by construction.
//
// Google Analytics sits behind the cookie banner, so every visitor who
// declines is invisible. That makes "how many people start the form and give
// up?" unanswerable from GA, because the sample is biased toward people who
// consent to tracking in the first place.
//
// This endpoint counts events and nothing else. No cookie is set, no session
// id is accepted, and neither the IP nor the user agent is recorded. Rows are
// aggregated by day and never joined, so a row cannot be traced to a person —
// which is why this needs no consent banner to run. See the DESIGN CONSTRAINT
// in supabase/growth.sql before adding any field here.

import { createClient } from '@supabase/supabase-js';
import { originAllowed, readJsonBody, clean } from '../lib/http.js';

// Closed allowlist. An open `event` string would let anyone POST arbitrary
// rows and grow the table without bound.
const EVENTS = new Set(['intake_viewed', 'intake_started', 'intake_completed']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'forbidden' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'not configured' });

  const body = readJsonBody(req);
  if (!body) return res.status(400).json({ error: 'bad request' });

  const event = clean(body.event, 40);
  if (!event || !EVENTS.has(event)) return res.status(400).json({ error: 'unknown event' });

  const lang = clean(body.lang, 2) === 'en' ? 'en' : 'he';

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from('funnel_events').insert({ event, lang });
  if (error) return res.status(500).json({ error: 'db error' });

  return res.status(204).end();
}
