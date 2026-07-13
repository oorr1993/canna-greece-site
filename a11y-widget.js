(function () {
  var STORAGE_KEY = 'cg_a11y_prefs_v1';

  var TOGGLES = [
    { key: 'links', label: 'הדגשת קישורים', type: 'binary', cls: 'a11y-links' },
    { key: 'contrast', label: 'ניגודיות', type: 'cycle', values: ['off', 'high', 'invert', 'mono'],
      labels: { off: 'רגילה', high: 'גבוהה', invert: 'הפוכה', mono: 'מונוכרום' },
      classMap: { high: 'a11y-contrast-high', invert: 'a11y-contrast-invert', mono: 'a11y-contrast-mono' } },
    { key: 'text', label: 'גודל טקסט', type: 'cycle', values: ['100', '115', '130', '150'],
      labels: { '100': '100%', '115': '115%', '130': '130%', '150': '150%' },
      classMap: { '115': 'a11y-text-115', '130': 'a11y-text-130', '150': 'a11y-text-150' } },
    { key: 'lines', label: 'ריווח שורות', type: 'binary', cls: 'a11y-lines-wide' },
    { key: 'font', label: 'גופן קריא', type: 'binary', cls: 'a11y-font-readable' },
    { key: 'headings', label: 'הדגשת כותרות', type: 'binary', cls: 'a11y-headings' },
    { key: 'cursor', label: 'סמן גדול', type: 'binary', cls: 'a11y-cursor-big' },
    { key: 'motion', label: 'עצירת אנימציות', type: 'binary', cls: 'a11y-reduce-motion' }
  ];

  function defaults() {
    var p = { version: 1 };
    TOGGLES.forEach(function (t) { p[t.key] = t.type === 'binary' ? false : t.values[0]; });
    return p;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var p = JSON.parse(raw);
      if (p.version !== 1) return defaults();
      return p;
    } catch (e) { return defaults(); }
  }

  function save(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function applyPrefs(p) {
    var html = document.documentElement;
    TOGGLES.forEach(function (t) {
      if (t.type === 'binary') {
        html.classList.toggle(t.cls, !!p[t.key]);
      } else {
        t.values.forEach(function (v) {
          var cls = t.classMap[v];
          if (cls) html.classList.toggle(cls, p[t.key] === v);
        });
      }
    });
  }

  var prefs = load();
  applyPrefs(prefs);

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var fab = document.createElement('button');
    fab.className = 'a11y-fab';
    fab.type = 'button';
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'a11y-panel');
    fab.setAttribute('aria-keyshortcuts', 'Alt+A');
    fab.setAttribute('aria-label', 'פתיחת תפריט נגישות');
    fab.title = 'נגישות (Alt+A)';
    fab.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm9 7.5-6-1.2V22h-2v-6h-2v6H9V11.6l-6 1.2-.4-2 7-1.4V8c0-1.1.9-2 2-2s2 .9 2 2v1.4l7 1.4z"/></svg>';

    var panel = document.createElement('div');
    panel.id = 'a11y-panel';
    panel.className = 'a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'הגדרות נגישות');
    panel.hidden = true;

    var head = document.createElement('div');
    head.className = 'a11y-panel-head';
    head.innerHTML = '<h2>הגדרות נגישות</h2>';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'a11y-close';
    closeBtn.setAttribute('aria-label', 'סגירת תפריט נגישות');
    closeBtn.textContent = '✕';
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'a11y-grid';
    var toggleEls = {};
    TOGGLES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'a11y-toggle';
      btn.dataset.key = t.key;
      if (t.type === 'binary') {
        btn.setAttribute('aria-pressed', String(!!prefs[t.key]));
        btn.textContent = t.label;
      } else {
        btn.innerHTML = t.label + '<span class="val">' + t.labels[prefs[t.key]] + '</span>';
      }
      grid.appendChild(btn);
      toggleEls[t.key] = btn;
    });
    panel.appendChild(grid);

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'a11y-reset-btn';
    resetBtn.textContent = 'איפוס הגדרות';
    panel.appendChild(resetBtn);

    var live = document.createElement('div');
    live.id = 'a11y-live';
    live.className = 'a11y-sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    document.body.appendChild(live);

    function announce(msg) { live.textContent = msg; }

    function refreshUI() {
      TOGGLES.forEach(function (t) {
        var btn = toggleEls[t.key];
        if (t.type === 'binary') {
          btn.setAttribute('aria-pressed', String(!!prefs[t.key]));
        } else {
          btn.querySelector('.val').textContent = t.labels[prefs[t.key]];
        }
      });
    }

    function openPanel() {
      panel.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      var first = grid.querySelector('button');
      if (first) first.focus();
    }
    function closePanel(returnFocus) {
      panel.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
      if (returnFocus) fab.focus();
    }

    fab.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel(false);
    });
    closeBtn.addEventListener('click', function () { closePanel(true); });
    document.addEventListener('keydown', function (e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        if (panel.hidden) openPanel(); else closePanel(true);
      }
      if (e.key === 'Escape' && !panel.hidden) closePanel(true);
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
        closePanel(false);
      }
    });

    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.a11y-toggle');
      if (!btn) return;
      var t = TOGGLES.filter(function (x) { return x.key === btn.dataset.key; })[0];
      if (!t) return;
      if (t.type === 'binary') {
        prefs[t.key] = !prefs[t.key];
        announce(t.label + (prefs[t.key] ? ' הופעל' : ' כובה'));
      } else {
        var idx = t.values.indexOf(prefs[t.key]);
        var next = t.values[(idx + 1) % t.values.length];
        prefs[t.key] = next;
        announce(t.label + ': ' + t.labels[next]);
      }
      save(prefs);
      applyPrefs(prefs);
      refreshUI();
    });

    resetBtn.addEventListener('click', function () {
      prefs = defaults();
      save(prefs);
      applyPrefs(prefs);
      refreshUI();
      announce('הגדרות הנגישות אופסו');
    });
  });
})();
