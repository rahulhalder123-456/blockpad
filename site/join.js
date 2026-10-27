/* Join page: reads the invite from the URL fragment (never sent to a server), shows who invited to what, and launches Blockpad. */
(function () {
  const $ = (id) => document.getElementById(id);
  const cfg = window.BLOCKPAD || {};
  const m = /^#d=([A-Za-z0-9_-]+)$/.exec(location.hash);
  let info = null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    info = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!info || info.v !== 1 || !info.s || !info.g || !info.r || !info.p) info = null;
  } catch (_) { info = null; }

  if (!info) { $('bad').hidden = false; return; }
  $('ok').hidden = false;
  $('name').textContent = String(info.n || 'A shared page').slice(0, 120);
  $('access').textContent = info.k ? 'You can edit' : 'View only';
  document.title = 'Join “' + $('name').textContent + '” in Blockpad';

  const appLink = 'blockpad://join?d=' + m[1];
  $('open').href = appLink;
  $('applink').value = appLink;
  $('applink2').value = appLink;
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'macosArm' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : '';
  const dls = cfg.downloads || { windows: cfg.downloadUrl };
  const label = { windows: 'Windows', macosArm: 'macOS', linux: 'Linux' }[os] || 'your computer';
  const link = dls[os] || (os ? '' : '');
  if (link) { $('dl').href = link; $('dl').textContent = 'Download Blockpad for ' + label; } else { $('dl').removeAttribute('href'); $('dl').textContent = 'Download link not set up yet'; }
  const copy = (inp, btn) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(inp.value); } catch (_) { inp.select(); document.execCommand('copy'); }
    const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = t), 1500);
  });
  copy($('applink'), $('copy')); copy($('applink2'), $('copy2'));

  const desktop = !!os;
  if (!desktop) { $('desktop').hidden = true; $('mobile').hidden = false; return; }

  // try once automatically; if the page stays visible, Blockpad is probably not installed, so the install help is already shown below
  let left = false;
  const mark = () => { left = true; $('trying').textContent = 'If Blockpad opened, you can close this tab.'; };
  window.addEventListener('blur', mark);
  document.addEventListener('visibilitychange', () => document.hidden && mark());
  $('open').addEventListener('click', () => { $('trying').textContent = 'Opening Blockpad…'; setTimeout(() => !left && ($('trying').textContent = 'Blockpad did not open. Install it with the steps below, then press Open again.'), 2500); });
  setTimeout(() => { location.href = appLink; }, 500);
  setTimeout(() => { if (!left) $('trying').textContent = 'Blockpad did not open. Install it with the steps below, then press Open again.'; }, 3000);
})();
