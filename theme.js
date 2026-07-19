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
    // Always in the visible header row (never tucked inside a menu) — on
    // narrow screens the logo wordmark shrinks instead to make room.
    mount(document.querySelector('header .nav'));
    paintAll();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
