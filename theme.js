(function () {
  var KEY = 'cf_theme';
  var root = document.documentElement;
  var isEn = (root.lang || '').slice(0, 2) === 'en';

  function save(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }

  function init() {
    var nav = document.querySelector('header .nav');
    if (!nav) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    function paint() {
      var dark = root.classList.contains('dark');
      btn.textContent = dark ? '☀️' : '🌙';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark
        ? (isEn ? 'Switch to light mode' : 'מעבר למצב בהיר')
        : (isEn ? 'Switch to dark mode' : 'מעבר למצב כהה'));
    }
    btn.addEventListener('click', function () {
      var dark = !root.classList.contains('dark');
      root.classList.toggle('dark', dark);
      save(dark ? 'dark' : 'light');
      paint();
    });
    nav.appendChild(btn);
    paint();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
