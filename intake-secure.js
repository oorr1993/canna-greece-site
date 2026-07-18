(function () {
  var form = document.querySelector('form[action*="formsubmit"], form[data-secure-intake]');
  if (!form) return;

  // One event id per page load, shared between the client pixel fire (on
  // thanks.html) and the server-side TikTok Events API call, so TikTok can
  // deduplicate the two instead of double-counting one conversion.
  function genEventId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
  var eventId = genEventId();
  var nextField = form.querySelector('input[name="_next"]');
  if (nextField) {
    try {
      var nextUrl = new URL(nextField.value, location.href);
      nextUrl.searchParams.set('eid', eventId);
      nextField.value = nextUrl.href;
    } catch (e) {}
  }

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

  fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
    if (!h || !h.configured) return; // stay on legacy flow
    activateSecureFlow();
  }).catch(function () { /* legacy flow remains */ });

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

  function activateSecureFlow() {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var isEn = (document.documentElement.lang || '').slice(0, 2) === 'en';
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
          eventId: eventId,
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
          consents: checkedVals('הסכמה - גיל').concat(checkedVals('הסכמה - תנאי שימוש'), checkedVals('הסכמה - פרטיות'))
            .map(function (v, i) { return ['גיל', 'תנאי שימוש', 'פרטיות'][i] + ': ' + v; }),
          files: uploaded.files,
        };
        return fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('submit failed');
        window.location.href = '/thanks.html?eid=' + encodeURIComponent(eventId);
      }).catch(function () {
        if (submitBtn) submitBtn.disabled = false;
        setStatus(isEn
          ? 'Something went wrong. Please try again, and if it persists — email us at 1cana.flight@gmail.com'
          : 'משהו השתבש בשליחה. נסו שוב, ואם זה חוזר — כתבו לנו למייל 1cana.flight@gmail.com', true);
      });
    });
  }
})();
