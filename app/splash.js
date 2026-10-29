/* Removes the startup animation (#splash in index.html) once the app has loaded and the animation has had time to play. */
(function () {
  const s = document.getElementById('splash');
  if (!s) return;
  const t0 = Date.now();
  const MIN = matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 700;           // the logo's blocks have landed by then; the app is not held back any longer
  let gone = false;
  const hide = () => { if (gone) return; gone = true; s.classList.add('out'); setTimeout(() => s.remove(), 300); };
  const tick = () => { const waited = Date.now() - t0; if ((window.BP && window.BP.state && waited >= MIN) || waited > 8000) hide(); else setTimeout(tick, 80); };
  tick();
})();
