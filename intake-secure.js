(function () {
  var form = document.querySelector('form[data-secure-intake]');
  if (!form) return;

  var statusEl = null;
  function setStatus(msg, isError) {
    if (!statusEl) {
      statusEl = document.createElement('p');
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      statusEl.style.cssText = 'text-align:center;font-weight:700;margin-top:14px;';
      form.appendChild(statusEl);
    }
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#C0392B' : 'inherit';
  }

  function isEnLang() {
    return (document.documentElement.lang || '').slice(0, 2) === 'en';
  }

  // The secure pipeline (encrypted database, private file storage) is the
  // ONLY path that ever transmits this form. Sensitive medical and identity
  // data must never fall back to being emailed to a third party. Until
  // /api/health confirms the pipeline is configured, submission is blocked
  // and the user is directed to contact us directly.
  var secureReady = false;
  fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
    secureReady = Boolean(h && h.configured);
  }).catch(function () { secureReady = false; });

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }
  function checkedVal(name) {
    var el = form.querySelector('[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function checkedVals(name) {
    return [].slice.call(form.querySelectorAll('[name="' + name + '"]:checked')).map(function (el) { return el.value; });
  }
  function consentSummary() {
    var groups = [
      ['גיל', 'הסכמה - גיל'],
      ['תנאי שימוש', 'הסכמה - תנאי שימוש'],
      ['פרטיות', 'הסכמה - פרטיות'],
      ['מכס ויבוא', 'הסכמה - מכס ויבוא'],
    ];
    return groups.map(function (g) {
      var v = checkedVal(g[1]);
      return g[0] + ': ' + (v || 'לא סומן');
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;

    var isEn = isEnLang();

    if (!secureReady) {
      setStatus(isEn
        ? 'Online submissions are temporarily unavailable. Please email us at 1cana.flight@gmail.com and we will take it from there — your details are not sent anywhere until then.'
        : 'שליחת הטופס אונליין אינה זמינה כרגע. אנא כתבו לנו ל-1cana.flight@gmail.com ונמשיך משם — הפרטים שלכם אינם נשלחים לשום מקום עד אז.', true);
      return;
    }

    var submitBtn = form.querySelector('.submit-btn, [type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setStatus(isEn ? 'Sending your request securely…' : 'שולחים את הפנייה בצורה מאובטחת…');

    var fileInputs = [
      { kind: 'passport', el: document.getElementById('passport-file') },
      { kind: 'selfie', el: document.getElementById('selfie-file') },
      { kind: 'rx', el: document.getElementById('rx-file') },
    ].filter(function (f) { return f.el && f.el.files && f.el.files[0]; });

    var descriptors = fileInputs.map(function (f) {
      return { kind: f.kind, contentType: f.el.files[0].type || 'image/jpeg' };
    });

    var uploadPlan = descriptors.length
      ? fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: descriptors }),
        }).then(function (r) {
          if (!r.ok) throw new Error('upload-url failed');
          return r.json();
        })
      : Promise.resolve({ submissionId: null, grants: [] });

    uploadPlan.then(function (plan) {
      var uploads = plan.grants.map(function (grant, i) {
        var file = fileInputs[i].el.files[0];
        return fetch(grant.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        }).then(function (r) {
          if (!r.ok) throw new Error('file upload failed');
          return { kind: grant.kind, path: grant.path };
        });
      });
      return Promise.all(uploads).then(function (files) {
        return { submissionId: plan.submissionId, files: files };
      });
    }).then(function (uploaded) {
      var payload = {
        submissionId: uploaded.submissionId || undefined,
        lang: (document.documentElement.lang || 'he').slice(0, 2),
        website: val('website'),
        plan: checkedVal('מסלול'),
        services: checkedVals('שירות'),
        full_name: val('שם מלא'),
        passport_number: val('מספר דרכון'),
        citizenship: val('אזרחות'),
        age: val('גיל'),
        gender: val('מין'),
        email: val('אימייל'),
        phone: val('טלפון'),
        stay_city: val('עיר ביוון'),
        arrival_date: val('תאריך הגעה'),
        condition_text: val('תיאור המצב'),
        has_existing_rx: checkedVal('מרשם קיים'),
        product_pref: checkedVal('העדפת מוצר'),
        thc_pref: checkedVal('ריכוז THC'),
        grams: checkedVal('כמות (גרם)'),
        referral_source: val('איך הגעתם'),
        consents: consentSummary(),
        files: uploaded.files,
      };
      return fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('submit failed');
      window.location.href = '/thanks.html';
    }).catch(function () {
      if (submitBtn) submitBtn.disabled = false;
      setStatus(isEn
        ? 'Something went wrong. Please try again, and if it persists — email us at 1cana.flight@gmail.com'
        : 'משהו השתבש בשליחה. נסו שוב, ואם זה חוזר — כתבו לנו למייל 1cana.flight@gmail.com', true);
    });
  });
})();
