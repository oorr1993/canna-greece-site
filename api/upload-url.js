import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BUCKET = 'intake-files';
const KINDS = { passport: 'passport', selfie: 'selfie', rx: 'rx' };
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};
const MAX_FILES_PER_REQUEST = 3;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const files = body && Array.isArray(body.files) ? body.files.slice(0, MAX_FILES_PER_REQUEST) : null;
  if (!files || !files.length) return res.status(400).json({ error: 'bad request' });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const submissionId = randomUUID();
  const grants = [];

  for (const f of files) {
    const kind = KINDS[f.kind];
    const ext = EXT_BY_TYPE[f.contentType];
    if (!kind || !ext) return res.status(400).json({ error: 'unsupported file kind or type' });
    const path = `${submissionId}/${kind}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return res.status(500).json({ error: 'storage error' });
    grants.push({ kind, path, token: data.token, signedUrl: data.signedUrl });
  }

  return res.status(200).json({ submissionId, bucket: BUCKET, grants });
}
