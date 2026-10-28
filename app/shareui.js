/* Blockpad sharing UI: Share dialog (Invite / People / Export), Join dialog, collaborator bar, live "who is editing" marks, Settings panel. */
(function () {
  const BP = (window.BP = window.BP || {});
  const { h } = BP;
  const SH = BP.share;
  const initials = (n) => (String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
  const roleName = (r) => (r === 'owner' ? 'Owner' : r === 'editor' ? 'Can edit' : 'View only');
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); BP.toast(msg || 'Copied', 3000); } catch (_) { BP.toast('Could not copy. Select the link and copy it by hand.', 5000); } };
  const dot = (c) => h('span', { class: 'who-dot', style: { background: c } });

  /* ---------- collaborator bar in the top bar ---------- */
  SH.bar = function (p) {
    const sp = p && SH.spaceOf(p);
    if (!sp) return null;
    const on = SH.online(sp);
    const here = on.filter((x) => x.page === p.id);
    const el = h('button', { class: 'who-bar', title: on.length ? on.map((x) => x.name).join(', ') + ' online' : 'Shared space “' + sp.name + '”. Nobody else is online right now.', onclick: () => BP.shareDialog(p, 'people') });
    el.dataset.sig = sp.id + '|' + on.map((x) => x.id + x.page).join(',') + '|' + sp.role;
    el.append(h('span', { class: 'who-state ' + (on.length ? 'on' : '') }));
    on.slice(0, 4).forEach((x) => el.append(h('span', { class: 'who-av' + (here.includes(x) ? ' here' : ''), style: { background: x.color } }, initials(x.name))));
    if (on.length > 4) el.append(h('span', { class: 'who-more' }, '+' + (on.length - 4)));
    el.append(h('span', { class: 'who-t' }, sp.role === 'viewer' ? 'View only' : on.length ? on.length + ' online' : 'Shared'));
    return el;
  };

  /* coloured bar + name tag on blocks other people are editing right now */
  SH.paintMarks = function () {
    document.querySelectorAll('.block.has-who').forEach((e) => { e.classList.remove('has-who'); e.removeAttribute('data-who'); e.style.removeProperty('--who'); });
    const cur = BP.state.current;
    const p = cur && BP.page(cur);
    const sp = p && SH.spaceOf(p);
    if (!sp) return;
    SH.online(sp).forEach((x) => {
      if (x.page !== cur || !x.block) return;
      const el = document.querySelector('.block[data-id="' + x.block + '"]');
      if (el) { el.classList.add('has-who'); el.setAttribute('data-who', x.name); el.style.setProperty('--who', x.color); }
    });
  };


  /* connection test: shows what this device can reach (signalling servers, public address) and who is connected */
  BP.netTest = function (host) {
    const out = h('pre', { class: 'muted small', style: 'white-space:pre-wrap;margin:6px 0 0' });
    const btn = h('button', { class: 'btn small', onclick: async () => {
      btn.disabled = true; out.textContent = 'Testing… (about 8 seconds)';
      try { const lines = BP.rtc && BP.rtc.diagnose ? await BP.rtc.diagnose() : ['WebRTC transport not available']; const st = await SH.net.status(); out.textContent = lines.concat('connected people: ' + st.peers + (st.error ? '  error: ' + st.error : '')).join(String.fromCharCode(10)); }
      catch (e) { out.textContent = 'Test failed: ' + e.message; }
      btn.disabled = false;
    } }, 'Test connection');
    host.append(btn, out);
  };

  /* optional relay (TURN) server, for networks where two devices cannot connect directly */
  BP.relaySettings = function (host) {
    const cur = (BP.state.settings.turn = BP.state.settings.turn || {});
    const field = (key, label, ph, type) => h('label', { class: 'muted small', style: 'display:block;margin-top:6px' }, label, h('input', { class: 'input', type: type || 'text', placeholder: ph, value: cur[key] || '', oninput: (e) => { cur[key] = e.target.value.trim(); BP.save(); } }));
    host.append(h('h3', null, 'Relay server (optional)'),
      h('p', { class: 'muted small' }, 'If a phone and a computer cannot connect (some mobile networks block direct connections), a TURN relay can forward the already-encrypted traffic. Free accounts: Metered.ca or Cloudflare Realtime. Reopen Blockpad after changing this.'),
      field('urls', 'Server URL(s)', 'turn:host:80, turns:host:443'), field('username', 'Username', ''), field('credential', 'Password', '', 'password'));
  };

  /* ---------- join ---------- */
  BP.joinDialog = function (url) {
    if (!SH.available()) return BP.toast('Sharing is not available here (no network transport)', 4000);
    BP.modal('Join a shared page', (body, close) => {
      const inp = h('input', { class: 'input', placeholder: 'Paste the share link', value: url || '' });
      const info = h('div', { class: 'join-info' });
      const go = h('button', { class: 'btn primary', disabled: '' }, 'Join');
      let data = null;
      const parse = () => {
        info.innerHTML = '';
        data = null; go.disabled = true;
        if (!inp.value.trim()) return;
        try {
          data = SH.parseLink(inp.value);
          const have = SH.space(data.id);
          info.append(h('div', { class: 'join-card' }, h('b', null, '“' + data.name + '”'), h('span', { class: 'chip' }, data.writeSec ? 'You can edit' : 'View only')),
            h('p', { class: 'muted small' }, have ? 'You already have this page.' + (data.writeSec && have.role === 'viewer' ? ' Joining again upgrades you to edit access.' : '') : 'A copy will be added to this workspace and kept in sync with whoever else has it open. Nothing goes through a server; you only get changes while someone from the group is online.'));
          go.disabled = false;
          go.textContent = have ? (data.writeSec && have.role === 'viewer' ? 'Upgrade to edit' : 'Open') : 'Join';
        } catch (e) { info.append(h('div', { class: 'join-err' }, e.message)); }
      };
      inp.addEventListener('input', parse);
      go.onclick = async () => {
        if (!data) return;
        go.disabled = true; go.textContent = 'Joining…';
        try {
          const sp = await SH.join(data);
          close();
          BP.open(sp.root);
          BP.toast('Joined “' + sp.name + '”. Syncing with whoever is online…', 5000);
        } catch (e) { go.disabled = false; go.textContent = 'Join'; info.innerHTML = ''; info.append(h('div', { class: 'join-err' }, e.message)); }
      };
      body.append(h('p', { class: 'muted' }, 'Anyone with a Blockpad share link can join. Links only open in the Blockpad app.'), inp, info, h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), go));
      parse();
      setTimeout(() => !url && inp.focus(), 30);
    }, { class: 'join' });
  };

  /* ---------- share dialog ---------- */
  BP.shareDialog = function (p, tab) {
    BP.modal('Share', (body, close) => {
      const tabs = h('div', { class: 'set-tabs row-tabs' });
      const pane = h('div', { class: 'share-pane' });
      const names = [['invite', 'Invite'], ['people', 'People'], ['export', 'Export']];
      const show = (k) => {
        tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.k === k));
        pane.innerHTML = '';
        ({ invite, people, export: exp }[k])(pane);
        pane.dataset.tab = k;
      };
      names.forEach(([k, n]) => tabs.append(h('button', { 'data-k': k, onclick: () => show(k) }, n)));
      body.append(tabs, pane);
      const rerender = () => { if (pane.isConnected && pane.dataset.tab !== 'export') show(pane.dataset.tab || 'invite'); };
      const off = SH.on(rerender);
      const obs = new MutationObserver(() => { if (!document.body.contains(body)) { off(); obs.disconnect(); } });
      obs.observe(document.body, { childList: true });

      function invite(el) {
        if (!SH.available()) return el.append(h('p', { class: 'muted' }, 'Sharing is not available here (no network transport).'));
        const sp = SH.spaceOf(p);
        if (!sp) {
          el.append(h('h3', null, 'Share “' + (p.title || 'Untitled') + '” with other people'),
            h('p', { class: 'muted' }, 'This shares the page and everything inside it. There is no server and no account: people join with a link, their Blockpad connects straight to yours, and edits flow between everyone who has the page open.'),
            h('ul', { class: 'share-list' }, h('li', null, 'Two links: one lets people edit, one is view-only.'), h('li', null, 'Links only open in the Blockpad app. If your friend does not have it yet, you can send them a copy.'), h('li', null, 'Changes sync while at least two people are online together; each person keeps a full local copy.')),
            h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await SH.start(p.id); BP.toast('Sharing is on. Copy a link below.', 4000); BP.ui && BP.ui.refreshChrome && BP.ui.refreshChrome(); show('invite'); } catch (err) { e.target.disabled = false; BP.toast(err.message, 5000); } } }, 'Start sharing'));
          return;
        }
        const root = BP.page(sp.root);
        el.append(h('div', { class: 'sh-head' }, h('b', null, '“' + sp.name + '”'), h('span', { class: 'chip' }, roleName(sp.role))));
        if (root && root.id !== p.id) el.append(h('p', { class: 'muted small' }, 'This page is inside “' + (root.title || 'Untitled') + '”. The links below share that whole space.'));
        const linkRow = (title, desc, canEdit) => {
          const url = SH.link(sp, canEdit);
          const inp = h('input', { class: 'input small link-in', readonly: '', value: url });
          inp.addEventListener('focus', () => inp.select());
          return h('div', { class: 'link-row' }, h('div', { class: 'lr-t' }, h('b', null, title), h('small', null, desc)), h('div', { class: 'row-gap' }, inp, h('button', { class: 'btn small', onclick: () => copy(url, title + ' link copied') }, 'Copy')),
            SH.site() ? h('button', { class: 'btn small ghost', onclick: () => copy(SH.link(sp, canEdit, true), 'App-only link copied') }, 'Copy app-only link (blockpad://)') : null);
        };
        if (sp.writeSec) el.append(linkRow('Can edit', 'People with this link can read and change everything.', true));
        el.append(linkRow('View only', 'People with this link can read but not change anything.', false));
        el.append(h('p', { class: 'muted small' }, SH.site() ? 'Anyone who gets a link can join, so share it only with people you trust. The link opens a page that launches Blockpad, or helps them download it first.' : 'Anyone who gets a link can join, so share it only with people you trust. These links open only in the Blockpad app. To make links clickable in WhatsApp or Telegram, set your Blockpad website in Settings → Sharing.'));
        const on = SH.online(sp);
        el.append(h('div', { class: 'sh-status' }, h('span', { class: 'who-state ' + (on.length ? 'on' : '') }), on.length ? on.length + ' other ' + (on.length === 1 ? 'person' : 'people') + ' online now' : 'Nobody else is online. Changes sync the next time someone from the group opens Blockpad.'));
        const row = h('div', { class: 'row-gap sh-actions' });
        if (window.bp && window.bp.zipApp) row.append(h('button', { class: 'btn small', title: 'Save a zip of the Blockpad app for someone who does not have it', onclick: async (e) => { e.target.disabled = true; BP.toast('Preparing a copy of Blockpad… this can take a minute', 6000); try { const r = await window.bp.zipApp(); if (r && r.error) BP.toast(r.error, 7000); else if (r && r.path) { BP.toast('Saved ' + r.path, 7000); window.bp.showItem && window.bp.showItem(r.path); } } finally { e.target.disabled = false; } } }, 'Send Blockpad to a friend (zip)'));
        row.append(h('button', { class: 'btn small danger', onclick: async () => {
          const owner = sp.role === 'owner';
          if (!await BP.confirm(owner ? 'Stop sharing' : 'Leave shared page', owner ? 'This stops syncing and makes the old links useless. Everyone keeps their own copy of the page. To share again, start sharing to get new links.' : 'You keep your copy of the page, but it stops syncing.')) return;
          await SH.leave(sp.id); BP.ui && BP.ui.refreshChrome && BP.ui.refreshChrome(); show('invite');
        } }, sp.role === 'owner' ? 'Stop sharing' : 'Leave'));
        el.append(row);
      }

      function people(el) {
        const sp = SH.spaceOf(p);
        const me = SH.me();
        if (!sp) return el.append(h('p', { class: 'muted' }, 'This page is not shared yet. Use the Invite tab to start sharing.'));
        const item = (color, name, sub, tag) => h('div', { class: 'ppl-row' }, h('span', { class: 'who-av big', style: { background: color } }, initials(name)), h('div', { class: 'ppl-t' }, h('b', null, name), h('small', null, sub)), tag ? h('span', { class: 'chip' }, tag) : null);
        el.append(h('h3', null, 'In this space'));
        el.append(item(me.color, BP.me() + ' (you)', BP.page(BP.state.current) ? 'Viewing “' + (BP.page(BP.state.current).title || 'Untitled') + '”' : '', roleName(sp.role)));
        const on = SH.online(sp);
        on.forEach((x) => { const pg = x.page && BP.page(x.page); el.append(item(x.color, x.name, pg ? 'Viewing “' + (pg.title || 'Untitled') + '”' : 'Online', 'Online')); });
        if (!on.length) el.append(h('p', { class: 'muted small' }, 'Nobody else is online right now.'));
        const seen = new Set(Object.values(sp.units).map((u) => u.n).filter((n) => n && n !== BP.me() && !on.some((x) => x.name === n)));
        if (seen.size) { el.append(h('h3', null, 'Also edited here')); seen.forEach((n) => el.append(item('#9a9890', n, 'Offline', ''))); }
        const net = h('div', { class: 'muted small' }, 'Network: checking…');
        el.append(net);
        BP.netTest(el);
        SH.net.status().then((s) => { net.textContent = 'Network: ' + (s.running ? 'connected to the peer network' : 'idle') + ' · ' + SH.peerCount(sp) + ' direct connection' + (SH.peerCount(sp) === 1 ? '' : 's') + (s.error ? ' · ' + s.error : ''); }).catch(() => {});
      }
      function exp(el) { BP.exportRows(el, p, close); }
      show(tab || (SH.spaceOf(p) ? 'invite' : 'invite'));
    }, { class: 'share' });
  };

  /* ---------- Settings → Sharing ---------- */
  BP.shareSettings = function (pane) {
    const s = BP.state.settings;
    const me = SH.me();
    pane.append(h('h3', null, 'Your identity'), h('p', { class: 'muted small' }, 'Shown to the people you share with. There is no account; this stays on your computer.'));
    const nm = h('input', { class: 'input', value: s.userName || '' });
    nm.addEventListener('change', () => { s.userName = nm.value.trim() || 'You'; BP.save(); SH.presenceSoon(); });
    const sw = h('div', { class: 'row-gap' });
    ['#e5484d', '#e08a00', '#2f9e44', '#0b8a8f', '#3b6fd8', '#7c4ddb', '#c2379a', '#7a6a50'].forEach((c) => sw.append(h('button', { class: 'color-sw' + (me.color === c ? ' on' : ''), style: { background: c }, onclick: (e) => { me.color = c; BP.save(); SH.presenceSoon(); sw.querySelectorAll('.color-sw').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
    pane.append(h('label', { class: 'muted' }, 'Name'), nm, h('label', { class: 'muted' }, 'Colour'), sw);
    pane.append(h('h3', null, 'Share links'));
    const site = h('input', { class: 'input', placeholder: 'https://your-blockpad-site.vercel.app', value: s.shareSite || '' });
    const siteMsg = h('div', { class: 'muted small' });
    const paintSite = () => { const v = site.value.trim().replace(/\/+$/, ''); siteMsg.textContent = !v ? 'Not set: links look like blockpad://… and only open inside the app.' : /^https:\/\/[^\s#?]+$/i.test(v) ? 'Links will be https://…/join#… : clickable in chats, and they open Blockpad or offer the download.' : 'Enter a full https:// address.'; };
    site.addEventListener('change', () => { s.shareSite = site.value.trim().replace(/\/+$/, ''); BP.save(); paintSite(); });
    paintSite();
    pane.append(h('label', { class: 'muted' }, 'Your Blockpad website (optional)'), site, siteMsg);
    pane.append(h('h3', null, 'Shared pages'));
    if (!SH.available()) return pane.append(h('p', { class: 'muted' }, 'Sharing is not available here (no network transport).'));
    const list = h('div', { class: 'sh-list' });
    const draw = () => {
      list.innerHTML = '';
      const all = SH.spaces();
      if (!all.length) list.append(h('p', { class: 'muted small' }, 'Nothing is shared yet. Open a page and press Share, or join someone else’s page with a link.'));
      all.forEach((sp) => list.append(h('div', { class: 'ppl-row' }, h('div', { class: 'ppl-t' }, h('b', null, sp.name), h('small', null, roleName(sp.role) + ' · ' + SH.peerCount(sp) + ' connected · ' + (() => { const n = Object.keys(sp.units).length; return n + (n === 1 ? ' item' : ' items'); })())),
        h('button', { class: 'btn small', onclick: () => BP.state.pages[sp.root] && BP.open(sp.root) }, 'Open'),
        h('button', { class: 'btn small danger', onclick: async () => { if (await BP.confirm(sp.role === 'owner' ? 'Stop sharing' : 'Leave shared page', 'You keep your copy; it stops syncing.')) { await SH.leave(sp.id); draw(); } } }, sp.role === 'owner' ? 'Stop' : 'Leave'))));
    };
    draw();
    pane.append(list, h('div', { class: 'row-gap' }, h('button', { class: 'btn', onclick: () => BP.joinDialog() }, 'Join with a link…'),
      window.bp && window.bp.zipApp ? h('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; BP.toast('Preparing a copy of Blockpad… this can take a minute', 6000); try { const r = await window.bp.zipApp(); if (r && r.error) BP.toast(r.error, 7000); else if (r && r.path) BP.toast('Saved ' + r.path, 7000); } finally { e.target.disabled = false; } } }, 'Send Blockpad to a friend (zip)') : null));
    BP.netTest(pane);
    BP.relaySettings(pane);
    pane.append(h('h3', null, 'How sharing works'), h('p', { class: 'muted small' }, 'Blockpad uses peer-to-peer networking (the same idea as BitTorrent). A share link holds a secret that lets Blockpads on different computers find each other and connect directly, encrypted. No Blockpad server and no account are involved, and nothing is contacted until you share or join something. People with a view-only link cannot change your page, because every edit is signed with a key that link does not contain. Only the newest change to the same block wins, so two people typing in the very same block at once can overwrite each other.'));
    const off = SH.on(() => { if (pane.isConnected) draw(); else off(); });
  };

  /* pasting a share link anywhere offers to join it */
  document.addEventListener('paste', (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t && /^\s*(?:blockpad:\/\/join\?d=|https?:\/\/[^\s#?]+\/join#d=)[A-Za-z0-9_-]+\s*$/i.test(t) && !(e.target && e.target.classList && e.target.classList.contains('link-in')) && !(e.target && e.target.closest && e.target.closest('.modal'))) { e.preventDefault(); e.stopPropagation(); BP.joinDialog(t.trim()); }
  }, true);
})();
