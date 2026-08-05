// Draft recovery for the intake form.
//
// The form runs to six fieldsets and asks for a passport photo and a selfie.
// People drop out partway through, and today that costs them everything they
// already typed — so the ones who come back start from zero, and most do not
// come back. This keeps the tedious first half.
//
// WHAT IS SAVED IS AN ALLOWLIST, NOT A BLOCKLIST. This is the important part.
// A blocklist means a medical field added to the form next year is silently
// written to localStorage until somebody remembers to exclude it; an
// allowlist means it is excluded until somebody opts it in on purpose. On a
// health site that default has to point the safe way.
//
// Never saved, by construction:
//   - תיאור המצב, מרשם קיים, העדפת מוצר, ריכוז THC, כמות — medical and
//     treatment data. localStorage survives on shared and family devices.
//   - מספר דרכון and the three file inputs — identity documents. (Browsers
//     cannot repopulate a file input from script anyway.)
//   - All four consent checkboxes. A consent has to be given by the person,
//     now, not replayed from a week-old draft. This one is not a privacy
//     nicety — a pre-ticked consent box is not consent.

(function () {
  var form = document.querySelector('form[data-secure-intake]');
  if (!form) return;

  var KEY = 'cf_intake_draft_v1';
  var MAX_AGE_MS = 7 * 24 * 3600 * 1000;

  var SAVE = [
    'מסלול', 'שם מלא', 'גיל', 'מין', 'אימייל',
    'טלפון', 'אזרחות', 'איך הגעתם', 'עיר ביוון', 'תאריך הגעה'
  ];

  var isEn = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var t = isEn ? {
    prompt: 'You have an unfinished form from earlier. Restore what you filled in?',
    restore: 'Restore',
    discard: 'Start fresh',
    restored: 'Restored. The medical and document sections still need filling in.'
  } : {
    prompt: 'יש לכם טופס שלא הושלם. לשחזר את מה שמילאתם?',
    restore: 'שחזרו',
    discard: 'להתחיל מחדש',
    restored: 'שוחזר. את החלק הרפואי והמסמכים עדיין צריך למלא.'
  };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !d.savedAt) return null;
      if (Date.now() - d.savedAt > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
      return d.fields && typeof d.fields === 'object' ? d.fields : null;
    } catch (e) { return null; }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function collect() {
    var out = {};
    SAVE.forEach(function (name) {
      var nodes = form.querySelectorAll('[name="' + name + '"]');
      if (!nodes.length) return;
      var first = nodes[0];
      if (first.type === 'radio') {
        var picked = form.querySelector('[name="' + name + '"]:checked');
        if (picked) out[name] = picked.value;
      } else if (first.value) {
        out[name] = first.value;
      }
    });
    return out;
  }

  function save() {
    var fields = collect();
    if (!Object.keys(fields).length) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), fields: fields }));
    } catch (e) { /* private mode or quota — recovery is a bonus, not a feature to fail on */ }
  }

  function restore(fields) {
    Object.keys(fields).forEach(function (name) {
      if (SAVE.indexOf(name) === -1) return;   // re-check on the way in too
      var nodes = form.querySelectorAll('[name="' + name + '"]');
      if (!nodes.length) return;
      if (nodes[0].type === 'radio') {
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].value === fields[name]) {
            nodes[i].checked = true;
            nodes[i].dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      } else {
        nodes[0].value = fields[name];
        nodes[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  var draft = read();
  if (draft && Object.keys(draft).length) {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', t.prompt);
    bar.style.cssText =
      'background:var(--white,#fff);border:2px solid #000;border-radius:12px;' +
      'box-shadow:3px 3px 0 #000;padding:12px 16px;margin:0 0 18px;' +
      'display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:15px;';
    var msg = document.createElement('p');
    msg.textContent = t.prompt;
    msg.style.cssText = 'margin:0;flex:1 1 220px;font-weight:700;';
    var yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = t.restore;
    yes.style.cssText =
      'font:inherit;font-weight:900;cursor:pointer;background:var(--green,#8FBF5D);' +
      'color:#1B331E;border:2px solid #000;border-radius:9px;box-shadow:2px 2px 0 #000;padding:7px 16px;';
    var no = document.createElement('button');
    no.type = 'button';
    no.textContent = t.discard;
    no.style.cssText =
      'font:inherit;font-weight:900;cursor:pointer;background:var(--white,#fff);' +
      'color:#1B331E;border:2px solid #000;border-radius:9px;box-shadow:2px 2px 0 #000;padding:7px 16px;';

    bar.appendChild(msg);
    bar.appendChild(no);
    bar.appendChild(yes);
    form.insertBefore(bar, form.firstChild);

    yes.addEventListener('click', function () {
      restore(draft);
      msg.textContent = t.restored;
      yes.remove(); no.remove();
    });
    no.addEventListener('click', function () { clear(); bar.remove(); });
  }

  // Debounced so a burst of keystrokes writes once, not per character.
  var timer = null;
  form.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  });
  form.addEventListener('change', function () {
    clearTimeout(timer);
    timer = setTimeout(save, 200);
  });

  // intake-secure.js navigates to /thanks.html on success. Clearing on unload
  // would also fire when someone simply leaves, so key off the success
  // navigation instead — a draft outliving a completed submission would offer
  // to restore a form the person already sent.
  window.addEventListener('cf-intake-submitted', clear);
})();
