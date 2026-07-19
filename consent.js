(function () {
  var KEY = 'cf_consent_v3';
  var GA_ID = 'G-T9N752S80S';
  var FB_PIXEL_ID = '1323004023320424';
  var TT_PIXEL_ID = 'D9CSE9JC77UDPAPRO6FG';

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  function loadGA() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
  }

  function loadMetaPixel() {
    if (window.__fbLoaded) return;
    window.__fbLoaded = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', FB_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function loadTikTokPixel() {
    if (window.__ttLoaded) return;
    window.__ttLoaded = true;
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e };
      ttq.load = function (e, n) {
        var r = "https://analytics.tiktok.com/i18n/pixel/events.js", o = n && n.partner;
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
        ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        n = document.createElement("script"); n.type = "text/javascript"; n.async = !0;
        n.src = r + "?sdkid=" + e + "&lib=" + t;
        e = document.getElementsByTagName("script")[0]; e.parentNode.insertBefore(n, e)
      };
      ttq.load(TT_PIXEL_ID);
      ttq.page();
    }(window, document, 'ttq');
  }

  function loadAll() {
    loadGA(); loadMetaPixel(); loadTikTokPixel();
    try { window.dispatchEvent(new Event('cf-trackers-ready')); } catch (e) {}
  }

  if (stored() === 'granted') { loadAll(); return; }
  if (stored() === 'denied') { return; }

  function injectStyles() {
    if (document.getElementById('cf-consent-style')) return;
    var st = document.createElement('style');
    st.id = 'cf-consent-style';
    st.textContent =
      '.cf-consent{position:fixed;inset-inline:10px;bottom:10px;z-index:9999;max-width:420px;margin-inline:auto;' +
      'background:#FBF8EF;color:#1B331E;border:2px solid #000;border-radius:12px;box-shadow:4px 4px 0 #000;' +
      'padding:12px 14px;font-family:Rubik,sans-serif;font-size:13px;line-height:1.5;' +
      'display:flex;align-items:center;gap:10px;flex-wrap:wrap;}' +
      '.cf-consent-txt{margin:0;flex:1 1 220px;}' +
      '.cf-consent a{color:#2F5233;font-weight:700;text-decoration:underline;}' +
      '.cf-consent-btns{display:flex;gap:8px;flex-shrink:0;}' +
      '.cf-consent-btn{font-family:inherit;border:2px solid #000;border-radius:9px;box-shadow:2px 2px 0 #000;' +
      'padding:6px 14px;font-weight:900;font-size:13px;cursor:pointer;white-space:nowrap;}' +
      '.cf-consent-yes{background:#8FBF5D;color:#1B331E;}' +
      '.cf-consent-no{background:#FFF;color:#1B331E;}' +
      '.cf-consent-btn:focus-visible{outline:3px dashed #5E8C3B;outline-offset:2px;}' +
      '@media (prefers-reduced-motion:no-preference){.cf-consent{animation:cfup .35s ease both;}' +
      '@keyframes cfup{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}}';
    document.head.appendChild(st);
  }

  function banner() {
    injectStyles();
    var wrap = document.createElement('div');
    wrap.className = 'cf-consent';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'הודעת עוגיות');
    var isEn = (document.documentElement.lang || '').slice(0, 2) === 'en';
    if (isEn) {
      wrap.style.direction = 'ltr';
      wrap.innerHTML =
        '<p class="cf-consent-txt">We use cookies for analytics and ads. See our <a href="/privacy.html">privacy policy</a>.</p>' +
        '<div class="cf-consent-btns">' +
        '<button type="button" class="cf-consent-btn cf-consent-no">Decline</button>' +
        '<button type="button" class="cf-consent-btn cf-consent-yes">Accept</button>' +
        '</div>';
    } else {
      wrap.innerHTML =
        '<p class="cf-consent-txt">האתר משתמש בעוגיות אנליטיקה ופרסום. פרטים ב<a href="/privacy.html">מדיניות הפרטיות</a>.</p>' +
        '<div class="cf-consent-btns">' +
        '<button type="button" class="cf-consent-btn cf-consent-no">דחייה</button>' +
        '<button type="button" class="cf-consent-btn cf-consent-yes">אישור</button>' +
        '</div>';
    }
    document.body.appendChild(wrap);

    wrap.querySelector('.cf-consent-yes').addEventListener('click', function () {
      save('granted'); loadAll(); wrap.remove();
    });
    wrap.querySelector('.cf-consent-no').addEventListener('click', function () {
      save('denied'); wrap.remove();
    });
  }

  if (document.readyState !== 'loading') banner();
  else document.addEventListener('DOMContentLoaded', banner);
})();
