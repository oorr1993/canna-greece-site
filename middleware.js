// Temporary site takedown.
//
// While this is active every public URL answers with a short offline notice
// carrying `X-Robots-Tag: noindex` on a **200** response. The 200 is
// deliberate: noindex only counts if Google can actually fetch and read the
// page. A 404 or 410 would read as a permanent removal, and a 503 tells Google
// to come back later without ever processing the noindex — neither is what we
// want for a takedown we intend to reverse.
//
// To bring the site back: set SITE_OFFLINE=0 on the Vercel project
// (Settings → Environment Variables → Production) and redeploy, or revert the
// commit that added this file. See docs/site-takedown.md for the full runbook,
// including the Search Console steps that are not code.

import { next } from '@vercel/functions';

export const config = {
  // Deliberately a catch-all, including '/'. Every exception is carved out by
  // the allow-list below rather than by narrowing this pattern, so that adding
  // one is a single edit in one place — narrow this and the allow-list silently
  // stops being the whole story.
  matcher: '/(.*)',
};

// Paths that must keep working even while the site is down.
const PASS_THROUGH_PREFIXES = [
  '/api/', // lead intake, tracking and cron stay live
  '/_vercel/', // Vercel platform internals
];

const PASS_THROUGH_PATHS = new Set([
  // Crawlers must be able to reach the site to see the noindex above — a
  // blocked robots.txt would leave every URL stuck in the index instead.
  '/robots.txt',
  // Kept on purpose: it keeps Google recrawling the listed URLs, which is what
  // makes the noindex land in days rather than months.
  '/sitemap.xml',
  // Bing verification — losing it loses access to Bing's removal tool while
  // the site is down.
  '/7483bb19af422462f6fbade6c131f90f.txt',
]);

// favicon.svg and apple-touch-icon.png are deliberately NOT on the
// pass-through list: both are the company logo (a leaf mark), and serving them
// while the offline page carries no brand name or contact info would still
// leave the logo visible in a browser tab or a home-screen bookmark. A request
// for either now gets the same offline notice — wrong content-type for an
// icon, so browsers just show no icon, which is the point.

// Any Search Console HTML verification file, not just the one currently in the
// repo. Verifying a *new* Google account issues a file under a fresh token, and
// blocking it would fail the verification with no hint as to why — which is
// exactly when we need Search Console most, since its removal tool is what
// hides the site within hours rather than weeks.
const GOOGLE_VERIFICATION = /^\/google[0-9a-z]+\.html$/;

// Domain-control and certificate challenges. Nothing here is site content, and
// a blocked challenge breaks renewals rather than anything a visitor sees.
const WELL_KNOWN_PREFIX = '/.well-known/';

// Deliberately brand-free: no company name, no description of what the site
// does, no contact address. A visitor — or a link-preview bot in WhatsApp,
// Facebook, Telegram, iMessage — should come away with nothing to connect
// this URL to the business. The og:/twitter: tags are set explicitly rather
// than omitted: an unfurler with no og:title falls back to guessing from
// <title> or page text, and an empty content="" is often treated by
// unfurlers as "not set" and triggers the same fallback — so this pins a
// neutral value that wins over any fallback instead of leaving a gap for one.
const OFFLINE_PAGE = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>לא זמין</title>
<meta name="description" content="לא זמין">
<meta property="og:title" content="לא זמין">
<meta property="og:description" content="לא זמין">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="לא זמין">
<meta name="twitter:description" content="לא זמין">
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
    background: #faf9f6;
    color: #1c1b18;
    font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    line-height: 1.6;
    text-align: center;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #161513; color: #f2f0eb; }
  }
</style>
</head>
<body>
<p>הדף אינו זמין.</p>
</body>
</html>
`;

export default function middleware(request) {
  // The takedown is on unless it is explicitly switched off, so merging this
  // is enough to take the site down and no one has to remember a second step.
  if (process.env.SITE_OFFLINE === '0') {
    return next();
  }

  const { pathname } = new URL(request.url);
  const isPassThrough =
    PASS_THROUGH_PATHS.has(pathname) ||
    PASS_THROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith(WELL_KNOWN_PREFIX) ||
    GOOGLE_VERIFICATION.test(pathname);

  if (isPassThrough) {
    return next();
  }

  return new Response(OFFLINE_PAGE, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      // No caching anywhere, so flipping SITE_OFFLINE back to 0 takes effect
      // immediately instead of waiting out a CDN or browser cache.
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
