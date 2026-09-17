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
// Unit-testing the handler cannot catch a matcher that never invokes it, and a
// matcher that skipped '/' shipped once already. Guard the root explicitly.
const matchers = [].concat(config.matcher);
ok('matcher covers the site root', matchers.includes('/'), JSON.stringify(matchers));
ok('matcher covers deep paths',    matchers.some((m) => /\*|\(/.test(m)), JSON.stringify(matchers));

console.log('\n3. the block carries the signals Google needs');
const res = call('/guide.html');
ok('status is 200, not 404/410/503', res.status === 200, String(res.status));
ok('noindex header present',   /noindex/.test(res.headers.get('x-robots-tag')));
ok('nofollow header present',  /nofollow/.test(res.headers.get('x-robots-tag')));
ok('served as HTML',           /text\/html/.test(res.headers.get('content-type')));
ok('never cached',             res.headers.get('cache-control') === 'no-store, max-age=0');

console.log('\n4. lead intake and crawler access stay alive');
for (const p of ['/api/submit', '/api/lead', '/api/track', '/api/upload-url', '/api/health',
                 '/api/cron-unhandled', '/robots.txt', '/sitemap.xml', '/favicon.svg',
                 '/apple-touch-icon.png', '/_vercel/insights/script.js']) {
  ok(`${p} reachable`, !blocked(p));
}

console.log('\n5. search-engine verification survives the takedown');
ok('Search Console file reachable', !blocked('/googlefa1f8772fea8ce15.html'));
ok('Bing file reachable',           !blocked('/7483bb19af422462f6fbade6c131f90f.txt'));

console.log('\n6. the SITE_OFFLINE switch');
ok('takedown is on by default', blocked('/'));
process.env.SITE_OFFLINE = '0';
ok('SITE_OFFLINE=0 restores the site', !blocked('/') && !blocked('/en/guide.html'));
process.env.SITE_OFFLINE = '1';
ok('SITE_OFFLINE=1 keeps it down', blocked('/'));
delete process.env.SITE_OFFLINE;

console.log(`\n${'='.repeat(40)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(40)}`);
process.exit(fail ? 1 : 0);
