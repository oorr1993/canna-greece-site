/* Opens and closes the site navigation panel.

   The panel's links are static HTML in the page, so navigation works with
   JavaScript disabled — this only adds the open/close behaviour, plus the
   focus and scroll handling a full-screen overlay needs to stay accessible. */
(function () {
  var btn = document.querySelector('.snav-btn');
  var panel = document.querySelector('.snav');
  if (!btn || !panel) return;

  var closeBtn = panel.querySelector('.snav-close');
  var prevFocus = null;

  // Starts closed and out of the tab order; `hidden` is removed on open so the
  // CSS transition still runs.
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');

  function open() {
    prevFocus = document.activeElement;
    panel.hidden = false;
    // force a frame so the transition animates from the off-screen position
    requestAnimationFrame(function () { panel.classList.add('open'); });
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    var first = panel.querySelector('a, button');
    if (first) first.focus();
  }

  function close() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    // keep it out of the tab order once the slide-up has finished
    var done = function () { if (!panel.classList.contains('open')) panel.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 360);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    else btn.focus();
  }

  btn.addEventListener('click', function () {
    if (panel.classList.contains('open')) close(); else open();
  });
  if (closeBtn) closeBtn.addEventListener('click', close);

  panel.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') close();
  });

  addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });

  // A resize past the desktop breakpoint hides the hamburger; without this the
  // panel could stay open with no visible way to dismiss it.
  addEventListener('resize', function () {
    if (innerWidth > 820 && panel.classList.contains('open')) close();
  });
})();
