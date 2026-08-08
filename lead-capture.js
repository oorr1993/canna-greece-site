// Short lead-capture form for the content pages.
//
// Drop <div data-lead-capture></div> anywhere and load this file with defer.
// Language and the source page are read from the document, so the same markup
// works on the Hebrew and English sides without configuration.
//
// Two fields only. There is deliberately no symptom or condition question:
// the moment this collects health data it inherits the obligations the full
// intake form is built to meet and this one is not. See the DESIGN CONSTRAINT
// in supabase/growth.sql.

(function () {
  var mount = document.querySelector('[data-lead-capture]');
  if (!mount) return;

  var isEn = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var t = isEn ? {
    title: 'Not ready for the full form?',
    body: 'Leave your email and roughly when you fly. We will send a short eligibility checklist and a reminder before your trip — no commitment.',
    email: 'Email',
    when: 'When are you flying?',
    whenHint: 'e.g. September, or "in two months"',
    submit: 'Send it to me',
    sending: 'Sending…',
    done: 'Got it. Check your inbox before you fly. 🌿',
    badEmail: 'That email address looks off — mind checking it?',
    error: 'Something went wrong. Please try again, or email 1cana.flight@gmail.com'
  } : {
    title: 'עוד לא מוכנים לטופס המלא?',
    body: 'השאירו מייל ומתי בערך אתם טסים. נשלח לכם צ׳ק-ליסט קצר לבדיקת התאמה ותזכורת לפני הנסיעה — בלי התחייבות.',
    email: 'אימייל',
    when: 'מתי אתם טסים?',
    whenHint: 'למשל ספטמבר, או "עוד חודשיים"',
    submit: 'שלחו לי',
    sending: 'שולחים…',
    done: 'נרשם. נהיה איתכם בקשר לפני הטיסה. 🌿',
    badEmail: 'כתובת המייל נראית שגויה — תבדקו אותה?',
    error: 'משהו השתבש. נסו שוב, או כתבו ל-1cana.flight@gmail.com'
  };

  if (!document.getElementById('lc-style')) {
    var st = document.createElement('style');
    st.id = 'lc-style';
    st.textContent =
      '.lc{background:var(--white,#fff);border:2px solid #000;border-radius:14px;' +
      'box-shadow:4px 4px 0 #000;padding:18px 20px;margin:26px 0;}' +
      '.lc h2{margin:0 0 6px;font-size:20px;line-height:1.3;}' +
      '.lc p.lc-body{margin:0 0 14px;font-size:15.5px;line-height:1.6;}' +
      '.lc-row{display:flex;gap:10px;flex-wrap:wrap;}' +
      '.lc-field{flex:1 1 200px;display:flex;flex-direction:column;gap:4px;}' +
      '.lc-field label{font-weight:700;font-size:14px;}' +
      '.lc-field small{font-size:12.5px;opacity:.75;}' +
      '.lc input{font:inherit;padding:10px 12px;border:2px solid #000;border-radius:9px;' +
      'background:var(--white,#fff);color:var(--navy,#1B331E);width:100%;}' +
      '.lc input:focus-visible{outline:3px dashed #5E8C3B;outline-offset:2px;}' +
      '.lc-btn{font:inherit;font-weight:900;cursor:pointer;margin-top:14px;' +
      'background:var(--green,#8FBF5D);color:#1B331E;border:2px solid #000;' +
      'border-radius:10px;box-shadow:3px 3px 0 #000;padding:11px 22px;' +
      'transition:transform .12s;}' +
      '.lc-btn:hover:not(:disabled){transform:translate(-1px,-1px);}' +
      '.lc-btn:disabled{opacity:.6;cursor:default;}' +
      '.lc-btn:focus-visible{outline:3px dashed #5E8C3B;outline-offset:2px;}' +
      '.lc-status{margin:12px 0 0;font-weight:700;font-size:15px;}' +
      // Offset upwards, never sideways: in an RTL document a negative `left`
      // is real scrollable overflow, and this element is positioned against
      // the initial containing block, so it escapes the overflow-x clip on
      // html/body and stretches the layout viewport to ~10000px on mobile.
      '.lc-hp{position:absolute;top:-9999px;left:0;width:1px;height:1px;overflow:hidden;}' +
      'html.dark .lc{background:#222E23;color:#E9EFE1;}' +
      'html.dark .lc input{background:#1B241C;color:#E9EFE1;}' +
      '@media (prefers-reduced-motion:reduce){.lc-btn{transition:none;}}';
    document.head.appendChild(st);
  }

  var form = document.createElement('form');
  form.className = 'lc';
  form.setAttribute('novalidate', '');
  form.innerHTML =
    '<h2>' + t.title + '</h2>' +
    '<p class="lc-body">' + t.body + '</p>' +
    '<div class="lc-row">' +
      '<span class="lc-field">' +
        '<label for="lc-email">' + t.email + '</label>' +
        '<input id="lc-email" name="email" type="email" autocomplete="email" required>' +
      '</span>' +
      '<span class="lc-field">' +
        '<label for="lc-when">' + t.when + '</label>' +
        '<input id="lc-when" name="travel_month" type="text" autocomplete="off">' +
        '<small>' + t.whenHint + '</small>' +
      '</span>' +
    '</div>' +
    // Honeypot: hidden from sight and from assistive tech, so only a bot fills it.
    '<span class="lc-hp" aria-hidden="true">' +
      '<label for="lc-website">Website</label>' +
      '<input id="lc-website" name="website" type="text" tabindex="-1" autocomplete="off">' +
    '</span>' +
    '<button class="lc-btn" type="submit">' + t.submit + '</button>' +
    '<p class="lc-status" role="status" aria-live="polite"></p>';

  mount.appendChild(form);

  var statusEl = form.querySelector('.lc-status');
  var btn = form.querySelector('.lc-btn');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.querySelector('#lc-email').value.trim();
    // Mirrors cleanEmail() on the server: reject obvious junk, let the server
    // be the authority. Rejecting harder here would cost real leads.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      statusEl.textContent = t.badEmail;
      form.querySelector('#lc-email').focus();
      return;
    }

    btn.disabled = true;
    statusEl.textContent = t.sending;

    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        travel_month: form.querySelector('#lc-when').value.trim(),
        website: form.querySelector('#lc-website').value,
        lang: isEn ? 'en' : 'he',
        source_page: location.pathname
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('lead failed');
      // Replace the form outright: leaving it on screen invites a second
      // submission and reads as though nothing happened.
      form.innerHTML = '<h2>' + t.title + '</h2>' +
        '<p class="lc-status" role="status" aria-live="polite">' + t.done + '</p>';
    }).catch(function () {
      btn.disabled = false;
      statusEl.textContent = t.error;
    });
  });
})();
