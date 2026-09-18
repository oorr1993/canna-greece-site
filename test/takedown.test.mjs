// Behavioural test for middleware.js — the temporary site takedown.
// Guards the two things that are easy to break by accident: that no page
// escapes the block, and that /api/* plus the crawler files stay reachable.
// Run:  npm test
import middleware, { config } from '../middleware.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const call = (path) => middleware(new Request(`https://www.canaflight.com${path}`));
const blocked = (path) => call(path).headers.get('x-middleware-next') !== '1';

console.log('\n1. every public page is blocked');
for (const p of ['/', '/index.html', '/guide.html', '/intake.html', '/thanks.html',
                 '/en/', '/en/index.html', '/en/guide.html', '/santorini.html',
                 '/llms.txt', '/og-image.png', '/brand/logo-hero.png', '/does-not-exist']) {
  ok(`${p} blocked`, blocked(p));
}
ok('query string does not slip past', blocked('/guide.html?utm_source=fb'));
ok('/apitest.html is not mistaken for /api/', blocked('/apitest.html'));

console.log('\n2. the matcher reaches every URL');
// These tests call the handler directly, so they cannot see a matcher that
// never invokes it. Pin the catch-all instead: the exceptions belong in the
// allow-list, and narrowing the matcher would route around every test below.
const matchers = [].concat(config.matcher);
ok('matcher is a catch-all', matchers.length === 1 && matchers[0] === '/(.*)', JSON.stringify(matchers));

console.log('\n3. the block carries the signals Google needs');
const res = call('/guide.html');
ok('status is 200, not 404/410/503', res.status === 200, String(res.status));
ok('noindex header present',   /noindex/.test(res.headers.get('x-robots-tag')));
ok('nofollow header present',  /nofollow/.test(res.headers.get('x-robots-tag')));
ok('served as HTML',           /text\/html/.test(res.headers.get('content-type')));
ok('never cached',             res.headers.get('cache-control') === 'no-store, max-age=0');

console.log('\n4. lead intake and crawler access stay alive');
for (const p of ['/api/submit', '/api/lead', '/api/track', '/api/upload-url', '/api/health',
                 '/api/cron-unhandled', '/robots.txt', '/sitemap.xml',
                 '/_vercel/insights/script.js']) {
  ok(`${p} reachable`, !blocked(p));
}
// The logo is branding, not infrastructure: serving it would leave the leaf
// mark visible in a browser tab even with no name or contact on the page.
ok('/favicon.svg is blocked (it is the logo)',          blocked('/favicon.svg'));
ok('/apple-touch-icon.png is blocked (it is the logo)', blocked('/apple-touch-icon.png'));

console.log('\n5. the offline page reveals nothing about the business');
const body = await call('/guide.html').text();
const leaks = ['קנאפלייט', 'CanaFlight', 'canaflight', 'cana.flight', '@gmail.com', 'mailto:'];
for (const needle of leaks) {
  ok(`page does not contain "${needle}"`, !body.includes(needle), body);
}
ok('og:title is set (controls link previews)',       /property="og:title"/.test(body));
ok('og:description is set (controls link previews)', /property="og:description"/.test(body));
ok('no og:image (nothing for a preview to show)',    !/property="og:image"/.test(body));

console.log('\n6. search-engine verification survives the takedown');
ok('Search Console file reachable', !blocked('/googlefa1f8772fea8ce15.html'));
ok('Bing file reachable',           !blocked('/7483bb19af422462f6fbade6c131f90f.txt'));
// Verifying the property from a different Google account issues a file under a
// new token, so the allow-list cannot be pinned to the one token in the repo.
ok('a NEW Search Console token is reachable', !blocked('/google1a2b3c4d5e6f7890.html'));
ok('well-known challenges reachable',         !blocked('/.well-known/acme-challenge/xyz'));
// Still narrow: the pattern must not become a hole for ordinary pages.
ok('/google-guide.html still blocked',        blocked('/google-guide.html'));
ok('/en/google123.html still blocked',        blocked('/en/google123.html'));

console.log('\n7. the SITE_OFFLINE switch');
ok('takedown is on by default', blocked('/'));
process.env.SITE_OFFLINE = '0';
ok('SITE_OFFLINE=0 restores the site', !blocked('/') && !blocked('/en/guide.html'));
process.env.SITE_OFFLINE = '1';
ok('SITE_OFFLINE=1 keeps it down', blocked('/'));
delete process.env.SITE_OFFLINE;

console.log(`\n${'='.repeat(40)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(40)}`);
process.exit(fail ? 1 : 0);
