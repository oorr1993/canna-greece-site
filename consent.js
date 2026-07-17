(function () {
  var KEY = 'cf_consent_v2';
  var GA_ID = 'G-T9N752S80S';
  var FB_PIXEL_ID = '1323004023320424';

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

  function loadAll() { loadGA(); loadMetaPixel(); }

  if (stored() === 'granted') { loadAll(); return; }
  if (stored() === 'denied') { return; }

  function injectStyles() {
    if (document.getElementById('cf-consent-style')) return;
    var st = document.createElement('style');
    st.id = 'cf-consent-style';
    st.textContent =
      '.cf-consent{position:fixed;inset-inline:12px;bottom:12px;z-index:9999;max-width:520px;margin-inline:auto;' +
      'background:#FBF8EF;color:#1B331E;border:2px solid #000;border-radius:14px;box-shadow:5px 5px 0 #000;' +
      'padding:16px 18px;font-family:Rubik,sans-serif;font-size:14.5px;line-height:1.6;}' +
      '.cf-consent-txt{margin:0 0 12px;}' +
      '.cf-consent a{color:#2F5233;font-weight:700;text-decoration:underline;}' +
      '.cf-consent-btns{display:flex;gap:10px;justify-content:flex-end;}' +
      '.cf-consent-btn{font-family:inherit;border:2px solid #000;border-radius:10px;box-shadow:3px 3px 0 #000;' +
      'padding:8px 20px;font-weight:900;font-size:14px;cursor:pointer;}' +
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
    wrap.innerHTML =
      '<p class="cf-consent-txt">אנחנו משתמשים בעוגיות אנליטיקה ופרסום (Google Analytics ו-Meta Pixel) כדי להבין איך משתמשים באתר ולמדוד אפקטיביות קמפיינים. אפשר לאשר או לדחות — הדחייה לא פוגעת בשימוש באתר. פרטים ב<a href="/privacy.html">מדיניות הפרטיות</a>.</p>' +
      '<div class="cf-consent-btns">' +
      '<button type="button" class="cf-consent-btn cf-consent-no">דחייה</button>' +
      '<button type="button" class="cf-consent-btn cf-consent-yes">אישור</button>' +
      '</div>';
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
