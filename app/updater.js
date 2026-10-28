/* "Update available" popup for the installed apps (Windows, Linux, macOS, Android, iOS).
   At launch the app reads the release manifest the site publishes (https://blockpad-umber.vercel.app/version.json, written by
   tools/make-site-config.js on every release) and, if it lists a newer version than this build, offers the download for this platform.
   The web app is skipped: it updates itself. */
(function () {
  const BP = (window.BP = window.BP || {});
  const SITE = 'https://blockpad-umber.vercel.app';
  const cap = window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
  const desktop = !!(window.bp && window.bp.updateInfo);
  BP.isInstalledApp = !!(cap || desktop);

  const platformKey = () => {
    if (cap) return window.Capacitor.getPlatform();                                   // 'android' | 'ios'
    const p = window.bp && window.bp.platform;
    return p === 'win32' ? 'windows' : p === 'linux' ? 'linux' : p === 'darwin' ? (window.bp.arch === 'arm64' ? 'macosArm' : 'macosIntel') : '';
  };
  const NAMES = { windows: 'Windows', linux: 'Linux', macosArm: 'macOS', macosIntel: 'macOS', android: 'Android', ios: 'iOS' };
  const num = (v) => String(v || '0').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
  const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

  const fetchManifest = async () => {
    if (desktop) return window.bp.updateInfo();
    const r = await fetch(SITE + '/version.json', { cache: 'no-store' });
    return r.ok ? r.json() : null;
  };
  const go = (url) => { if (cap) window.location.href = url; else window.open(url, '_blank', 'noopener'); };

  function popup(m, key) {
    const h = BP.h;
    const url = (m.downloads && m.downloads[key]) || m.page || SITE;
    const notes = Array.isArray(m.notes) ? m.notes : m.notes ? [String(m.notes)] : [];
    const hint = key === 'android' ? 'Download the new APK, open it and tap Install: it replaces the old version and keeps your pages.'
      : key === 'ios' ? 'Open the link to get the new version.'
      : key === 'linux' ? 'Download, unpack and replace the old folder. Your pages stay where they are.'
      : key.startsWith('macos') ? 'Download, unzip and drag Blockpad to Applications, replacing the old one. Your pages stay where they are.'
      : 'Download and run the installer: it updates Blockpad and keeps your pages.';
    BP.modal('Update available', (body, close) => {
      body.append(
        h('div', { class: 'upd-head' }, h('img', { src: '../assets/logo.svg', alt: '', width: 44, height: 44 }),
          h('div', null, h('b', null, 'Blockpad ' + m.version + ' is ready'), h('div', { class: 'muted small' }, 'You have ' + BP.appVersion + ' · ' + (NAMES[key] || 'your device')))),
        notes.length ? h('ul', { class: 'upd-notes' }, ...notes.slice(0, 6).map((n) => h('li', null, n))) : '',
        h('p', { class: 'muted small' }, hint),
        h('div', { class: 'row-end' },
          h('button', { class: 'btn ghost', onclick: () => { BP.state.settings.skipUpdate = m.version; BP.save && BP.save(); close(); } }, 'Skip this version'),
          h('button', { class: 'btn', onclick: close }, 'Later'),
          h('button', { class: 'btn primary', onclick: () => { go(url); close(); } }, 'Download')));
    }, { class: 'small' });
  }

  /* manual = from Settings > About: always answers, even for a skipped version */
  BP.checkUpdate = async (manual) => {
    if (!BP.isInstalledApp) { manual && BP.toast('The web app always runs the latest version.'); return; }
    try {
      const m = await fetchManifest();
      const key = platformKey();
      if (!m || !m.version) { manual && BP.toast('Could not check for updates right now.'); return; }
      if (!newer(m.version, BP.appVersion)) { manual && BP.toast('Blockpad is up to date (' + BP.appVersion + ').'); return; }
      if (!manual && BP.state.settings.skipUpdate === m.version) return;
      popup(m, key);
    } catch (_) { manual && BP.toast('Could not check for updates right now.'); }
  };

  if (BP.isInstalledApp) {
    let tries = 0;
    const start = () => { if (BP.state && BP.modal && BP.toast) BP.checkUpdate(false); else if (++tries < 30) setTimeout(start, 1000); };
    window.addEventListener('load', () => setTimeout(start, 4000));
  }
})();
