/* Landing page: fills the download links from config.js and highlights the visitor's platform */
(function () {
  const cfg = window.BLOCKPAD || {};
  const d = cfg.downloads || { windows: cfg.downloadUrl };
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'macosArm' : /Linux|X11/i.test(ua) ? 'linux' : 'windows';
  const names = { windows: 'Windows', macosArm: 'macOS (Apple silicon)', macosIntel: 'macOS (Intel)', linux: 'Linux', android: 'Android' };
  Object.keys(names).forEach((k) => {
    const a = document.getElementById('p-' + k);
    if (!a) return;
    if (d[k]) { a.href = d[k]; if (/.(apk|exe)$/i.test(d[k])) a.setAttribute('download', ''); } else { a.removeAttribute('href'); a.style.opacity = '.55'; a.title = 'Download link not set up yet'; }
    if (k === os) a.style.outline = '2px solid var(--accent)';
  });
  const dl = document.getElementById('dl');
  if (os === 'ios') { dl.textContent = 'Open the web app'; dl.href = 'app/'; document.getElementById('dl-note').textContent = 'On iPhone and iPad: open it in Safari, then Share → Add to Home Screen.'; document.getElementById('webapp').hidden = true; }
  else {
    dl.textContent = 'Download for ' + names[os];
    if (d[os]) { dl.href = d[os]; if (/.(apk|exe)$/i.test(d[os])) dl.setAttribute('download', ''); } else { dl.removeAttribute('href'); dl.textContent = 'Download link not set up yet'; dl.style.opacity = '.6'; }
    if (os === 'windows' && cfg.sizeMB) document.getElementById('dl-note').textContent = 'Version ' + (cfg.version || '') + ' · about ' + cfg.sizeMB + ' MB · Windows 10 or 11, 64-bit.';
    else document.getElementById('dl-note').textContent = 'Version ' + (cfg.version || '');
  }
  if (cfg.version) document.getElementById('ver').textContent = 'v' + cfg.version;
  if (cfg.sha256) document.getElementById('sha').textContent = 'SHA-256 of the Windows installer: ' + cfg.sha256;
})();
