import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BUCKET = 'intake-files';
const KINDS = Object.assign(Object.create(null), { passport: 'passport', selfie: 'selfie', rx: 'rx' });
const EXT_BY_TYPE = Object.assign(Object.create(null), {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
});
const MAX_FILES_PER_REQUEST = 3;

const ALLOWED_ORIGINS = new Set([
  'https://www.canaflight.com',
  'https://canaflight.com',
]);

// Defense-in-depth: block a foreign site from scripting a visitor's
// browser to mint signed upload URLs cross-origin. A legit same-origin
// POST carries our Origin; non-browser clients (no Origin) still pass.
function originAllowed(req) {
  const origin = req.headers['origin'];
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
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
