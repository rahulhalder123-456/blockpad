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

  RTC.join = async (id, topicHex) => {
    if (!RTC.available()) return { error: 'WebRTC is not available' };
    if (rooms.has(id)) return { ok: true };
    try {
      const room = T.joinRoom({ appId: 'blockpad-p2p-v1', password: 'bp:' + topicHex }, topicHex);
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

  RTC.stop = async () => { await Promise.all([...rooms.keys()].map(RTC.leave)); };
})();
