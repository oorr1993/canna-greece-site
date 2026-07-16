// Reports whether the secure intake pipeline is configured.
// The intake form's client script probes this endpoint and falls back
// to the legacy FormSubmit flow when it returns { configured: false }.
export default function handler(req, res) {
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ configured });
}
