(function () {
  var KEY = 'cf_theme';
  var root = document.documentElement;
  var isEn = (root.lang || '').slice(0, 2) === 'en';
  var buttons = [];

  function save(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }

  function paintAll() {
    var dark = root.classList.contains('dark');
    var label = dark
      ? (isEn ? 'Switch to light mode' : 'מעבר למצב בהיר')
      : (isEn ? 'Switch to dark mode' : 'מעבר למצב כהה');
    buttons.forEach(function (btn) {
      btn.textContent = dark ? '☀️' : '🌙';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
    });
  }

  function toggle() {
    var dark = !root.classList.contains('dark');
    root.classList.toggle('dark', dark);
    save(dark ? 'dark' : 'light');
    paintAll();
  }

  function mount(container) {
    if (!container) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.addEventListener('click', toggle);
    container.appendChild(btn);
    buttons.push(btn);
  }

  function init() {
    // Prefer the dedicated .header-settings group (sits at the far end
    // of the header row, next to the language pill) when present;
    // otherwise fall back to the plain header nav on pages without one.
    mount(document.querySelector('.header-settings') || document.querySelector('header .nav'));
    paintAll();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
