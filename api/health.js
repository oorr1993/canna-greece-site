// Reports whether the secure intake pipeline is configured.
// The intake form's client script probes this endpoint. When it returns
// { configured: false } the form is BLOCKED (fail-safe) and the user is
// asked to contact us directly — sensitive data is never emailed to a
// third party as a fallback.
export default function handler(req, res) {
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    configured,
    // Presence-only booleans, never the values — safe to expose so setup can
    // be checked from a browser without pulling up the Vercel dashboard.
    notifications: {
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      email: Boolean(process.env.GMAIL_APP_PASSWORD),
      cron: Boolean(process.env.CRON_SECRET),
    },
  });
}
