(function () {
  var eid = new URLSearchParams(location.search).get('eid') || undefined;
  var fired = false;

  function fire() {
    if (fired) return;
    fired = true;
    try {
      if (window.ttq) window.ttq.track('SubmitForm', {}, eid ? { event_id: eid } : undefined);
    } catch (e) {}
    try {
      if (window.fbq) window.fbq('track', 'Lead', {}, eid ? { eventID: eid } : undefined);
    } catch (e) {}
  }

  if (window.ttq || window.fbq) fire();
  else window.addEventListener('cf-trackers-ready', fire, { once: true });
})();
