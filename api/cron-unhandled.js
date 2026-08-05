// Escalation job — the layer that actually prevents a lost lead.
//
// A single push can be missed: phone on silent, notification swiped away,
// email filed under Promotions. This endpoint runs hourly and re-alerts for
// every submission still marked handled = false after a grace period, and it
// keeps doing so until the row is marked handled in Supabase. Missing one
// alert therefore costs a delay, never the lead.
//
// Scheduled from Supabase pg_cron (see supabase/notifications.sql), with the
// daily Vercel cron in vercel.json as a backstop in case pg_net is disabled
// on the project. Both call this same endpoint, and it is idempotent — the
// worst case of a double call is a duplicate digest.

import { createClient } from '@supabase/supabase-js';
import { notifyUnhandled } from '../lib/notify.js';

const DEFAULT_GRACE_HOURS = 3;
const MAX_ROWS = 10;

// Timing-safe-ish comparison. The secret is compared byte by byte over the
// full length of both strings so a wrong guess cannot be narrowed down by
// measuring how early the comparison bailed out.
function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function providedSecret(req) {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  const header = req.headers['x-cron-secret'];
  if (typeof header === 'string') return header;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Without a configured secret the endpoint stays shut rather than falling
  // open: an unauthenticated caller could otherwise use it to fire alerts.
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(503).json({ error: 'not configured' });
  if (!secretMatches(providedSecret(req), expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'not configured' });

  const graceHours = Number(process.env.UNHANDLED_GRACE_HOURS) || DEFAULT_GRACE_HOURS;
  const cutoff = new Date(Date.now() - graceHours * 3600000).toISOString();

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Only the three non-identifying columns the alert is allowed to mention.
  // Selecting the whole row here would pull names and medical text into a
  // context that exists to talk to Telegram.
  const { data, error } = await supabase
    .from('submissions')
    .select('id, plan, arrival_date, created_at')
    .eq('handled', false)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS);

  if (error) return res.status(500).json({ error: 'db error' });
  if (!data || !data.length) return res.status(200).json({ ok: true, pending: 0 });

  const results = await notifyUnhandled(supabase, data);

  return res.status(200).json({
    ok: true,
    pending: data.length,
    delivered: results.filter((r) => r.ok).map((r) => r.channel),
    failed: results.filter((r) => !r.ok).map((r) => ({ channel: r.channel, detail: r.detail })),
  });
}
