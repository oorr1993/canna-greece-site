import { createClient } from '@supabase/supabase-js';

// TEMPORARY — one-shot QA cleanup endpoint. Deletes a single submission
// row + its storage files by exact id. Removed immediately after use.
const CLEANUP_SECRET = '365b387fc85bf6c4203c4ea98353abd9ab4ee4e4c34b2ace';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (req.headers['x-cleanup-secret'] !== CLEANUP_SECRET) return res.status(403).json({ error: 'forbidden' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const id = body && typeof body.id === 'string' && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : null;
  if (!id) return res.status(400).json({ error: 'bad id' });

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { error: storageError } = await supabase.storage.from('intake-files').remove([
    `${id}/passport.jpg`,
    `${id}/selfie.jpg`,
  ]);

  const { data, error } = await supabase.from('submissions').delete().eq('id', id).select('id');
  if (error) return res.status(500).json({ error: 'db error', detail: error.message });

  return res.status(200).json({ ok: true, deletedRow: data, storageError: storageError ? storageError.message : null });
}
