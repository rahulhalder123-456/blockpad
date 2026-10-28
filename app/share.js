/* Blockpad sharing: serverless, peer-to-peer collaboration.

   How it works
   - Sharing a page creates a "space" (the page plus everything inside it) with two secrets that live only inside the invite links:
       readKey   -> hashed into a secret topic; people who hold it can find each other on the Hyperswarm network (no Blockpad server)
       write key -> an Ed25519 key pair. The edit link carries the private half, the view-only link only the public half.
   - Every change is a small signed "op" (one per page-meta or top-level block) stamped with a Lamport clock. Anyone can verify the
     signature with the public key, so people with a view-only link cannot change anything, even by talking to peers directly.
   - Peers exchange a summary of what they have, then send each other whatever is newer. Edits are stored locally first and every
     peer relays what it learns, so the group converges even if nobody is online at the same time as the author (like seeding).
   - Conflicts: the newest change to the same block (or page properties) wins. Different blocks never conflict.
   Honest limits: no character-level merging inside one block, nobody can be removed except by stopping and re-sharing, and you
   only get changes while someone else who has the space is online. */
(function () {
  const BP = (window.BP = window.BP || {});
  const nacl = window.nacl;
  const te = new TextEncoder();
  const PALETTE = ['#e5484d', '#e08a00', '#2f9e44', '#0b8a8f', '#3b6fd8', '#7c4ddb', '#c2379a', '#7a6a50'];

  /* ---------- small helpers ---------- */
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (s) => Uint8Array.from((s.match(/../g) || []).map((x) => parseInt(x, 16)));
  const b64 = {
    enc: (u8) => btoa(String.fromCharCode.apply(null, u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  };
  const sha = (str) => nacl.hash(te.encode(str));
  const fnv = (str) => {
    let a = 0x811c9dc5, b = 0x01000193 ^ str.length;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2246822519) ^ (b >>> 13); }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36) + str.length.toString(36);
  };
  /* canonical JSON: sorted keys, so the same data always has the same bytes (needed for signatures) */
  function cstr(v) {
    if (v === undefined || typeof v === 'function') return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(cstr).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort().map((k) => JSON.stringify(k) + ':' + cstr(v[k])).join(',') + '}';
  }
  const cmpT = (a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

  const LOCAL = new Set(['blocks', 'history', 'favorite', 'open', 'sharedRoot']);      // never sent
  const ROOT_LOCAL = new Set(['parent', 'order', 'trashed', 'trashedAt']);              // your own placement of the shared root

  const SH = (BP.share = { subs: [], pres: {}, peers: new Map(), applying: false });
  SH.on = (fn) => { SH.subs.push(fn); return () => { SH.subs = SH.subs.filter((x) => x !== fn); }; };
  const changed = () => SH.subs.slice().forEach((fn) => { try { fn(); } catch (_) {} });

  const store = () => {
    const s = BP.state;
    s.share = s.share || {};
    s.share.me = s.share.me || { id: hex(nacl.randomBytes(8)), color: PALETTE[Math.floor(Math.random() * PALETTE.length)] };
    s.share.spaces = s.share.spaces || {};
    return s.share;
  };
  SH.me = () => store().me;
  SH.spaces = () => Object.values(store().spaces);
  SH.space = (id) => store().spaces[id] || null;
  /* transports: Hyperswarm in the desktop app, WebRTC (webrtc.js) everywhere, so a phone and a computer can share with each other */
  const nets = () => [window.bp && window.bp.p2p, BP.rtc && BP.rtc.available() ? BP.rtc : null].filter(Boolean);
  const netOf = (peer) => (BP.rtc && BP.rtc.owns(peer) ? BP.rtc : window.bp && window.bp.p2p);
  SH.net = {
    join: (id, topic) => Promise.all(nets().map((n) => Promise.resolve(n.join(id, topic)).catch((e) => console.error(e)))),
    leave: (id) => Promise.all(nets().map((n) => Promise.resolve(n.leave(id)).catch(() => {}))),
    send: (peer, data) => { const n = netOf(peer); return n && n.send(peer, data); },
    onEvent: (fn) => nets().forEach((n) => n.onEvent(fn)),
    status: async () => {
      const all = await Promise.all(nets().map((n) => Promise.resolve(n.status()).catch(() => ({}))));
      return { running: all.some((x) => x.running), peers: all.reduce((a, x) => a + (x.peers || 0), 0), error: all.map((x) => x.error).filter(Boolean)[0] || '' };
    },
  };
  SH.available = () => !!(nacl && nets().length);

  SH.spaceOf = (p) => {
    const spaces = store().spaces;
    for (let c = p, n = 0; c && n < 60; c = BP.page(c.parent), n++) if (c.sharedRoot && spaces[c.sharedRoot]) return spaces[c.sharedRoot];
    return null;
  };
  SH.isViewer = (p) => { const sp = p && SH.spaceOf(p); return !!sp && sp.role === 'viewer'; };
  const members = (sp) => [sp.root, ...BP.descendants(sp.root)].filter((id) => BP.page(id));
  const kP = (pid) => 'p:' + pid;
  const kB = (pid, bid) => 'b:' + pid + ':' + bid;

  function metaOf(p, isRoot) {
    const m = {};
    Object.keys(p).forEach((k) => { if (!LOCAL.has(k) && !(isRoot && ROOT_LOCAL.has(k)) && p[k] !== undefined) m[k] = p[k]; });
    return m;
  }

  /* ---------- signing ---------- */
  const canon = (k, t, pos, payload) => k + '\n' + t[0] + '.' + t[1] + '\n' + (pos == null ? '' : pos) + '\n' + (payload == null ? 'DEL' : payload);
  const signOp = (sp, k, t, pos, payload) => hex(nacl.sign.detached(sha(canon(k, t, pos, payload)), b64.dec(sp.writeSec)));
  const verifyOp = (sp, op) => { try { return nacl.sign.detached.verify(sha(canon(op.k, op.t, op.pos, op.v)), unhex(op.sig), b64.dec(sp.writePub)); } catch (_) { return false; } };

  /* ---------- block positions: keep as many existing positions as possible (longest increasing run), give new ones a spot in between ---------- */
  function assignPos(sp, pid, blocks) {
    const cur = blocks.map((b) => { const u = sp.units[kB(pid, b.id)]; return u && !u.del && typeof u.pos === 'number' ? u.pos : null; });
    const n = cur.length, len = new Array(n).fill(0), prev = new Array(n).fill(-1);
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (cur[i] == null) continue;
      len[i] = 1;
      for (let j = 0; j < i; j++) if (cur[j] != null && cur[j] < cur[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
      if (best < 0 || len[i] > len[best]) best = i;
    }
    const keep = new Set();
    for (let i = best; i >= 0; i = prev[i]) keep.add(i);
    const out = cur.slice();
    let lo = null, renumber = false;
    for (let i = 0; i < n; i++) {
      if (keep.has(i)) { lo = out[i]; continue; }
      let hi = null;
      for (let j = i + 1; j < n; j++) if (keep.has(j)) { hi = out[j]; break; }
      const v = lo == null ? (hi == null ? 1024 : hi - 1024) : hi == null ? lo + 1024 : (lo + hi) / 2;
      if (hi != null && lo != null && hi - lo < 1e-6) renumber = true;
      out[i] = v; lo = v;
    }
    return renumber ? blocks.map((_, i) => (i + 1) * 1024) : out;
  }

  /* ---------- scan: turn local edits into signed ops ---------- */
  function scan(sp) {
    if (sp.role === 'viewer' || !sp.writeSec) return [];
    const me = store().me.id, name = BP.me();
    const ops = [];
    const mk = (k, payload, pos, del) => {
      const u = sp.units[k];
      const h = del ? 'DEL' : fnv(payload) + ':' + (pos == null ? '' : pos);
      if (u && u.h === h) return;
      const t = [++sp.lamport, me];
      sp.units[k] = { t, h, pos: pos == null ? null : pos, del: !!del, n: name, sig: signOp(sp, k, t, pos, del ? null : payload) };
      ops.push(k);
    };
    const ids = members(sp);
    const alive = new Set(ids);
    ids.forEach((pid) => {
      const p = BP.page(pid);
      mk(kP(pid), cstr(metaOf(p, pid === sp.root)), null, false);
      const blocks = p.blocks || [];
      const pos = assignPos(sp, pid, blocks);
      const seen = new Set();
      blocks.forEach((b, i) => { seen.add(b.id); mk(kB(pid, b.id), cstr(b), pos[i], false); });
      const prefix = 'b:' + pid + ':';
      Object.keys(sp.units).forEach((k) => { if (k.startsWith(prefix) && !sp.units[k].del && !seen.has(k.slice(prefix.length))) mk(k, null, null, true); });
    });
    Object.keys(sp.units).forEach((k) => {
      if (k[0] === 'p' && !sp.units[k].del && !alive.has(k.slice(2)) && !BP.page(k.slice(2))) mk(k, null, null, true);
    });
    return ops;
  }
  function payloadOf(sp, k) {
    if (k[0] === 'p') { const p = BP.page(k.slice(2)); return p ? cstr(metaOf(p, k.slice(2) === sp.root)) : null; }
    const m = /^b:([^:]+):(.+)$/.exec(k);
    const p = m && BP.page(m[1]);
    const b = p && (p.blocks || []).find((x) => x.id === m[2]);
    return b ? cstr(b) : null;
  }
  function opFor(sp, k) {
    const u = sp.units[k];
    if (!u) return null;
    const v = u.del ? null : payloadOf(sp, k);
    if (!u.del && v == null) return null;
    return { k, t: u.t, pos: u.pos, sig: u.sig, n: u.n, v };
  }
  const opsOf = (sp, keys) => keys.map((k) => opFor(sp, k)).filter(Boolean).sort((a, b) => (a.k[0] === 'p' ? 0 : 1) - (b.k[0] === 'p' ? 0 : 1));

  /* ---------- apply remote ops ---------- */
  function applyOps(sp, ops) {
    const done = [];
    const touched = new Set(), metaCh = new Set(), blockCh = new Set(), gone = new Set();
    const S = BP.state;
    let ppl = false;
    SH.applying = true;
    try {
      ops.forEach((op) => {
        if (!op || typeof op.k !== 'string' || !Array.isArray(op.t) || !verifyOp(sp, op)) return;
        const u = sp.units[op.k];
        if (u && cmpT(u.t, op.t) >= 0) return;
        sp.lamport = Math.max(sp.lamport, op.t[0] | 0);
        const del = op.v == null;
        if (op.k[0] === 'p') {
          const pid = op.k.slice(2);
          if (del) {
            if (pid === sp.root) return;
            const had = !!S.pages[pid];
            delete S.pages[pid];
            (S.purged = S.purged || {})[pid] = Date.now();
            if (had) { gone.add(pid); touched.add(pid); }
          } else {
            const m = JSON.parse(op.v);
            let p = S.pages[pid];
            const isRoot = pid === sp.root;
            if (!p) { p = S.pages[pid] = Object.assign({ type: 'page', blocks: [], history: [], comments: [], favorite: false, trashed: false }, m, { id: pid }); if (S.purged) delete S.purged[pid]; }
            else {
              Object.keys(p).forEach((key) => { if (!LOCAL.has(key) && !(isRoot && ROOT_LOCAL.has(key)) && !(key in m)) delete p[key]; });
              Object.keys(m).forEach((key) => { if (!(isRoot && ROOT_LOCAL.has(key))) p[key] = m[key]; });
            }
            touched.add(pid); metaCh.add(pid);
          }
          sp.units[op.k] = { t: op.t, h: del ? 'DEL' : fnv(op.v) + ':', pos: null, del, n: op.n, sig: op.sig };
        } else {
          const m = /^b:([^:]+):(.+)$/.exec(op.k);
          if (!m) return;
          const pid = m[1], bid = m[2];
          const pu = sp.units[kP(pid)];
          if (pu && pu.del) return;
          let p = S.pages[pid];
          if (!p) p = S.pages[pid] = { id: pid, type: 'page', parent: sp.root, title: '', blocks: [], history: [], comments: [], favorite: false, trashed: false, created: Date.now(), updated: Date.now() };
          const i = p.blocks.findIndex((b) => b.id === bid);
          if (del) { if (i >= 0) p.blocks.splice(i, 1); }
          else { const b = JSON.parse(op.v); if (i >= 0) p.blocks[i] = b; else p.blocks.push(b); }
          sp.units[op.k] = { t: op.t, h: del ? 'DEL' : fnv(op.v) + ':' + op.pos, pos: op.pos == null ? null : op.pos, del, n: op.n, sig: op.sig };
          touched.add(pid); blockCh.add(pid);
        }
        done.push(op);
        if (op.n && S.settings && S.settings.people && !S.settings.people.includes(op.n) && op.n !== BP.me()) { S.settings.people.push(op.n); ppl = true; }
      });
      blockCh.forEach((pid) => {
        const p = S.pages[pid];
        if (!p) return;
        const prefix = 'b:' + pid + ':';
        const byId = new Map(p.blocks.map((b) => [b.id, b]));
        const order = [];
        Object.keys(sp.units).forEach((k) => { if (k.startsWith(prefix) && !sp.units[k].del) { const id = k.slice(prefix.length); if (byId.has(id)) order.push([sp.units[k].pos == null ? 0 : sp.units[k].pos, id]); } });
        order.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : 1));
        p.blocks = order.map(([, id]) => byId.get(id));
        if (BP.syncIn) { try { BP.syncIn(p); } catch (_) {} }
      });
    } finally { SH.applying = false; }
    if (done.length) { BP.__origSave ? BP.__origSave() : BP.save(); }
    return { done, touched, metaCh, blockCh, gone, ppl };
  }

  /* ---------- transport ---------- */
  const send = (peer, msg) => { try { SH.net.send(peer, JSON.stringify(msg)); } catch (_) {} };
  const proof = (readKey, a, b) => hex(sha(readKey + '|' + a + '|' + b)).slice(0, 32);
  const verifiedPeers = (sp, except) => [...SH.peers.values()].filter((p) => p.ok.has(sp.id) && p.id !== except);

  function sendHi(peerId, retry) {
    const peer = SH.peers.get(peerId);
    if (!peer) return;
    const spaces = SH.spaces().map((sp) => ({ id: sp.id, proof: proof(sp.readKey, peer.localKey, peer.remoteKey) }));
    send(peerId, { t: 'hi', v: 1, r: retry ? 1 : 0, who: { id: store().me.id, name: BP.me(), color: store().me.color }, spaces });
  }
  function sendHave(sp, peerId) {
    const units = {};
    Object.keys(sp.units).forEach((k) => { units[k] = sp.units[k].t; });
    send(peerId, { t: 'have', s: sp.id, units });
  }
  const sendOps = (peerId, spId, ops) => {
    let batch = [], size = 0;
    const flush = () => { if (batch.length) send(peerId, { t: 'ops', s: spId, ops: batch }); batch = []; size = 0; };
    ops.forEach((op) => { const sz = (op.v ? op.v.length : 0) + 220; if (size + sz > 1500000) flush(); batch.push(op); size += sz; });
    flush();
  };
  function broadcast(sp, ops, except) { if (!ops.length) return; verifiedPeers(sp, except).forEach((p) => sendOps(p.id, sp.id, ops)); }

  function onMsg(peerId, m) {
    const peer = SH.peers.get(peerId);
    if (!peer || !m || typeof m !== 'object') return;
    if (m.t === 'hi') {
      peer.who = m.who || {};
      if (m.r) sendHi(peerId);          // the other side is still waiting for our hello: answer again (a hello can get lost)
      (m.spaces || []).forEach((x) => {
        const sp = SH.space(x.id);
        if (!sp || x.proof !== proof(sp.readKey, peer.remoteKey, peer.localKey)) return;
        if (peer.ok.has(sp.id)) return;
        peer.ok.add(sp.id);
        scan(sp);
        sendHave(sp, peerId);
        sendPresence(sp, peerId);
      });
      changed();
      return;
    }
    const sp = SH.space(m.s);
    if (!sp || !peer.ok.has(sp.id)) return;
    if (m.t === 'have') {
      scan(sp);
      const theirs = m.units || {};
      const want = Object.keys(sp.units).filter((k) => sp.units[k].t[0] > 0 && (!theirs[k] || cmpT(sp.units[k].t, theirs[k]) > 0));
      if (want.length) sendOps(peerId, sp.id, opsOf(sp, want));
    } else if (m.t === 'ops') {
      const mine = scan(sp);
      if (mine.length) { broadcast(sp, opsOf(sp, mine)); }
      const r = applyOps(sp, m.ops || []);
      if (r.done.length) {
        broadcast(sp, r.done, peerId);
        if (BP.ui && BP.ui.remote) BP.ui.remote(r);
        changed();
      }
    } else if (m.t === 'pres') {
      const P = (SH.pres[sp.id] = SH.pres[sp.id] || {});
      const w = m.who || {};
      if (!w.id) return;
      P[w.id] = { id: w.id, name: String(w.name || 'Someone').slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(w.color) ? w.color : '#7a6a50', page: m.page || null, block: m.block || null, seen: Date.now(), peer: peerId };
      if (BP.ui && BP.ui.presence) BP.ui.presence();
      changed();
    }
  }

  function onEvent(ev) {
    if (ev.type === 'open') {
      SH.peers.set(ev.peer, { id: ev.peer, remoteKey: ev.remoteKey, localKey: ev.localKey, ok: new Set(), who: {} });
      sendHi(ev.peer);
      changed();
    } else if (ev.type === 'close') {
      SH.peers.delete(ev.peer);
      Object.keys(SH.pres).forEach((s) => Object.keys(SH.pres[s]).forEach((id) => { if (SH.pres[s][id].peer === ev.peer) delete SH.pres[s][id]; }));
      if (BP.ui && BP.ui.presence) BP.ui.presence();
      changed();
    } else if (ev.type === 'msg') {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      try { onMsg(ev.peer, m); } catch (e) { console.error('share:', e); }
    }
  }

  /* ---------- presence ---------- */
  let focusBlock = null, presTimer = null;
  function sendPresence(sp, only) {
    const cur = BP.state.current;
    const inSpace = cur && SH.spaceOf(BP.page(cur)) === sp;
    const msg = { t: 'pres', s: sp.id, page: inSpace ? cur : null, block: inSpace ? focusBlock : null, who: { id: store().me.id, name: BP.me(), color: store().me.color } };
    (only ? [SH.peers.get(only)] : verifiedPeers(sp)).filter(Boolean).forEach((p) => send(p.id, msg));
  }
  const presenceNow = () => SH.spaces().forEach((sp) => sendPresence(sp));
  SH.presenceSoon = () => { clearTimeout(presTimer); presTimer = setTimeout(presenceNow, 250); };
  SH.online = (sp) => Object.values(SH.pres[sp.id] || {}).filter((x) => Date.now() - x.seen < 30000 && [...SH.peers.values()].some((p) => p.id === x.peer));
  SH.peerCount = (sp) => verifiedPeers(sp).length;

  /* ---------- local changes -> ops ---------- */
  let pushTimer = null;
  function pushLocal() {
    pushTimer = null;
    let any = false;
    SH.spaces().forEach((sp) => {
      const keys = scan(sp);
      if (keys.length) { any = true; broadcast(sp, opsOf(sp, keys)); }
    });
    if (any) (BP.__origSave || BP.save)();
  }
  SH.pushNow = () => { clearTimeout(pushTimer); pushLocal(); };
  SH.schedule = () => { if (SH.applying || !store().spaces || !Object.keys(store().spaces).length) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushLocal, 300); };

  /* ---------- spaces: start / join / leave / links ---------- */
  const topicOf = (readKey) => hex(sha('blockpad-topic|' + readKey).slice(0, 32));
  async function connect(sp) {
    if (!SH.available()) return;
    try { await SH.net.join(sp.id, topicOf(sp.readKey)); } catch (e) { console.error(e); }
    [...SH.peers.keys()].forEach(sendHi);
  }
  SH.start = async function (pageId) {
    if (!SH.available()) throw new Error('Sharing is not available here (no network transport)');
    const p = BP.page(pageId);
    if (!p) throw new Error('Page not found');
    const existing = SH.spaceOf(p);
    if (existing) return existing;
    const kp = nacl.sign.keyPair();
    const sp = {
      id: b64.enc(nacl.randomBytes(9)), name: p.title || 'Untitled', root: p.id, role: 'owner',
      readKey: b64.enc(nacl.randomBytes(32)), writePub: b64.enc(kp.publicKey), writeSec: b64.enc(kp.secretKey),
      lamport: 0, units: {}, created: Date.now(),
    };
    store().spaces[sp.id] = sp;
    p.sharedRoot = sp.id;
    scan(sp);
    (BP.__origSave || BP.save)();
    await connect(sp);
    changed();
    return sp;
  };
  SH.link = (sp, canEdit, appOnly) => {
    const d = { v: 1, s: sp.id, n: sp.name, g: sp.root, r: sp.readKey, p: sp.writePub };
    if (canEdit && sp.writeSec) d.k = sp.writeSec;
    const payload = b64.enc(te.encode(JSON.stringify(d)));
    const site = SH.site();
    // with a website set, links are normal https links (clickable in chat apps); the secrets sit after the # so they are never sent to the website
    return !appOnly && site ? site + '/join#d=' + payload : 'blockpad://join?d=' + payload;
  };
  SH.site = () => { const s = String(BP.state.settings.shareSite || '').trim().replace(/\/+$/, ''); return /^https:\/\/[^\s#?]+$/i.test(s) ? s : ''; };
  SH.parseLink = (url) => {
    const m = /^(?:blockpad:\/\/join\?d=|https?:\/\/[^\s#?]+\/join#d=)([A-Za-z0-9_-]+)\s*$/i.exec(String(url || '').trim());
    if (!m) throw new Error('That is not a Blockpad share link');
    let d;
    try { d = JSON.parse(new TextDecoder().decode(b64.dec(m[1]))); } catch (_) { throw new Error('The share link is damaged'); }
    if (!d || d.v !== 1 || !d.s || !d.g || !d.r || !d.p) throw new Error('The share link is damaged');
    return { id: String(d.s), name: String(d.n || 'Shared page').slice(0, 120), root: String(d.g), readKey: String(d.r), writePub: String(d.p), writeSec: d.k ? String(d.k) : null };
  };
  SH.join = async function (info) {
    if (!SH.available()) throw new Error('Sharing is not available here (no network transport)');
    const have = SH.space(info.id);
    if (have) {
      if (info.writeSec && have.role === 'viewer') { have.writeSec = info.writeSec; have.role = 'editor'; (BP.__origSave || BP.save)(); changed(); }
      return have;
    }
    const stale = BP.page(info.root);
    if (stale) {
      if (!BP.isTrashed(stale)) throw new Error('This workspace already has that page as a normal page. Move it to Trash first, then join again.');
      [info.root, ...BP.descendants(info.root)].forEach((x) => { delete BP.state.pages[x]; });      // an old copy sitting in Trash: replace it with the shared page
    }
    const sp = { id: info.id, name: info.name, root: info.root, role: info.writeSec ? 'editor' : 'viewer', readKey: info.readKey, writePub: info.writePub, writeSec: info.writeSec, lamport: 0, units: {}, created: Date.now() };
    store().spaces[sp.id] = sp;
    BP.createPage(null, { id: info.root, title: info.name, sharedRoot: sp.id, blocks: [] });
    // the empty stub must lose against the owner's real page: clock 0 is older than any real change and is never offered to others
    sp.units[kP(info.root)] = { t: [0, ''], h: fnv(cstr(metaOf(BP.page(info.root), true))) + ':', pos: null, del: false, n: '', sig: '' };
    (BP.__origSave || BP.save)();
    await connect(sp);
    changed();
    return sp;
  };
  SH.leave = async function (spId) {
    const sp = SH.space(spId);
    if (!sp) return;
    delete store().spaces[spId];
    delete SH.pres[spId];
    const root = BP.page(sp.root);
    if (root) delete root.sharedRoot;          // the pages stay on this computer as a normal copy
    SH.peers.forEach((p) => p.ok.delete(spId));
    try { await SH.net.leave(spId); } catch (_) {}
    (BP.__origSave || BP.save)();
    changed();
  };

  /* ---------- boot ---------- */
  SH.init = function () {
    if (SH.inited) return;
    SH.inited = true;
    BP.__origSave = BP.save;
    BP.save = function () { BP.__origSave.apply(this, arguments); SH.schedule(); };
    if (!SH.available()) return;
    SH.net.onEvent(onEvent);
    window.bp && window.bp.onLink && window.bp.onLink((url) => BP.joinDialog && BP.joinDialog(url));
    const track = () => { const a = document.activeElement; const b = a && a.closest ? a.closest('.block') : null; focusBlock = b ? b.dataset.id : null; SH.presenceSoon(); };
    document.addEventListener('focusin', track);
    setInterval(() => { presenceNow(); Object.keys(SH.pres).forEach((s) => Object.keys(SH.pres[s]).forEach((id) => { if (Date.now() - SH.pres[s][id].seen > 30000) delete SH.pres[s][id]; })); changed(); }, 10000);
    SH.spaces().forEach(connect);
    /* flaky links: keep re-introducing ourselves to peers that have not accepted us yet, and every 20 s compare what each side has so a lost message heals */
    setInterval(() => {
      SH.peers.forEach((peer) => { if (SH.spaces().some((sp) => !peer.ok.has(sp.id)) && (peer.hiTries = (peer.hiTries || 0) + 1) <= 20) sendHi(peer.id, true); });
    }, 3000);
    setInterval(() => { SH.spaces().forEach((sp) => verifiedPeers(sp).forEach((p) => sendHave(sp, p.id))); }, 20000);
    const hm = /^#d=([A-Za-z0-9_-]+)$/.exec(location.hash);     // the web app opened from a share link (…/app/#d=…)
    if (hm) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => BP.joinDialog && BP.joinDialog('https://blockpad.invalid/join#d=' + hm[1]), 600); }
    window.bp && window.bp.ready && window.bp.ready();
  };
  SH.newPage = () => SH.presenceSoon();
  SH.reconnect = () => { SH.spaces().forEach(connect); };
})();
