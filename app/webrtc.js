/* Blockpad WebRTC transport (renderer). Same interface as the desktop's window.bp.p2p, so sharing also works in a browser, on a phone
   and between a phone and a computer, where Hyperswarm (raw UDP) is not available.
   Peers find each other through public BitTorrent WebSocket trackers (Trystero, vendored in vendor/trystero-torrent.min.js), then talk over
   direct, encrypted WebRTC data channels. The room name is a hash of the secret topic and the signalling is encrypted with a password derived
   from it, so a tracker only sees opaque hashes. There is no Blockpad server and no account. This file only moves framed strings; the sharing
   logic and permissions live in share.js. */
(function () {
  const BP = (window.BP = window.BP || {});
  const T = window.Trystero;
  const rooms = new Map();       // spaceId -> { room, send, peers:Set }
  const subs = [];
  let lastError = '';
  const emit = (ev) => subs.slice().forEach((fn) => { try { fn(ev); } catch (_) {} });

  const RTC = (BP.rtc = {
    available: () => !!(T && T.joinRoom && typeof RTCPeerConnection !== 'undefined'),
    onEvent: (fn) => { subs.push(fn); },
  });

  /* Optional relay (TURN) servers, used only when two devices cannot connect directly (strict NAT, many mobile networks); the data stays end-to-end
     encrypted, a relay only forwards it. Sources: turn.json shipped next to the app (see README), or Settings -> Sharing -> Relay server. */
  const turnOf = (c) => {
    const urls = (Array.isArray(c && c.urls) ? c.urls : String((c && c.urls) || '').split(/[\s,]+/)).filter((u) => /^turns?:/i.test(u));
    return urls.length ? { urls, username: String(c.username || ''), credential: String(c.credential || '') } : null;
  };
  let shipped = [];
  RTC.turnReady = (async () => {
    try {
      if (!/^https?:$/.test(location.protocol)) return;
      const r = await fetch('turn.json', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); shipped = (Array.isArray(j) ? j : [j]).map(turnOf).filter(Boolean); }
    } catch (_) {}
  })();
  const turnServers = () => { const st = BP.state && BP.state.settings && BP.state.settings.turn; const mine = st && turnOf(st); return mine ? shipped.concat(mine) : shipped; };
  RTC.relayCount = () => turnServers().length;

  RTC.join = async (id, topicHex) => {
    if (!RTC.available()) return { error: 'WebRTC is not available' };
    if (rooms.has(id)) return { ok: true };
    try {
      await RTC.turnReady;
      const cfg = { appId: 'blockpad-p2p-v1', password: 'bp:' + topicHex };
      const turn = turnServers();
      if (turn.length) cfg.turnConfig = turn;
      const room = T.joinRoom(cfg, topicHex);
      const act = room.makeAction('bp');
      const rec = { room, act, peers: new Set() };
      const pid = (p) => 'w:' + id + ':' + p;
      room.onPeerJoin = (p) => { rec.peers.add(p); emit({ type: 'open', peer: pid(p), remoteKey: p, localKey: T.selfId }); };
      room.onPeerLeave = (p) => { if (rec.peers.delete(p)) emit({ type: 'close', peer: pid(p) }); };
      act.onMessage = (data, meta) => { const p = meta && meta.peerId !== undefined ? meta.peerId : meta; if (typeof data === 'string') emit({ type: 'msg', peer: pid(p), data }); };
      rooms.set(id, rec);
    } catch (e) { lastError = String((e && e.message) || e); return { error: lastError }; }
    return { ok: true };
  };

  RTC.leave = async (id) => {
    const rec = rooms.get(id);
    if (!rec) return { ok: true };
    rooms.delete(id);
    rec.peers.forEach((p) => emit({ type: 'close', peer: 'w:' + id + ':' + p }));
    try { await rec.room.leave(); } catch (_) {}
    return { ok: true };
  };

  RTC.owns = (peer) => typeof peer === 'string' && peer.startsWith('w:');

  RTC.send = (peer, data) => {
    const str = String(data);
    let n = 0;
    if (peer === 'all') { rooms.forEach((rec) => { if (rec.peers.size) { try { rec.act.send(str); n += rec.peers.size; } catch (_) {} } }); return n; }
    const m = /^w:(.*?):(.+)$/.exec(peer);
    const rec = m && rooms.get(m[1]);
    if (rec && rec.peers.has(m[2])) { try { rec.act.send(str, { target: m[2] }); n = 1; } catch (_) {} }
    return n;
  };

  RTC.status = async () => {
    let peers = 0;
    rooms.forEach((r) => { peers += r.peers.size; });
    return { running: rooms.size > 0, topics: rooms.size, peers, error: lastError };
  };

  /* what can this device reach? (used by the "Test connection" button) */
  RTC.diagnose = async () => {
    const out = [];
    const trackers = ['open.ftorrent.com', 'tracker.webtorrent.dev', 'tracker.openwebtorrent.com', 'tracker.btorrent.xyz', 'tracker.files.fm:7073/announce'];
    await Promise.all(trackers.map((t) => new Promise((res) => {
      let done = false;
      const fin = (ok) => { if (done) return; done = true; out.push((ok ? 'OK   ' : 'FAIL ') + 'signalling server ' + t.split('/')[0]); res(); };
      try { const ws = new WebSocket('wss://' + t); ws.onopen = () => { fin(true); try { ws.close(); } catch (_) {} }; ws.onerror = () => fin(false); setTimeout(() => { fin(false); try { ws.close(); } catch (_) {} }, 6000); } catch (_) { fin(false); }
    })));
    out.sort();
    const types = await new Promise((res) => {
      if (typeof RTCPeerConnection === 'undefined') return res([]);
      const set = new Set(); let pc;
      try { pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }); } catch (_) { return res([]); }
      pc.createDataChannel('d');
      pc.onicecandidate = (e) => { if (e.candidate) { const m = / typ (\w+)/.exec(e.candidate.candidate); if (m) set.add(m[1]); } else res([...set]); };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => res([]));
      setTimeout(() => res([...set]), 6000);
    });
    out.push((types.includes('srflx') ? 'OK   ' : 'FAIL ') + 'public address via STUN (candidates: ' + (types.join(', ') || 'none') + ')');
    const st = await RTC.status();
    out.push((RTC.relayCount() ? 'OK   ' : 'none ') + 'relay servers configured: ' + RTC.relayCount() + (RTC.relayCount() ? '' : '  (only direct connections are possible)'));
    out.push('rooms joined: ' + st.topics + ', peers: ' + st.peers);
    return out;
  };

  RTC.stop = async () => { await Promise.all([...rooms.keys()].map(RTC.leave)); };
})();
