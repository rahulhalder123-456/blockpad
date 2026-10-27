/* Blockpad peer-to-peer transport (main process).
   Uses Hyperswarm, the same family of technology as BitTorrent: peers find each other through a distributed hash table keyed by a
   secret topic and then talk over direct, end-to-end encrypted connections (with NAT hole-punching). There is no Blockpad server,
   no account and no relay: if nobody who has the share link is online, nothing is exchanged. Nothing here starts until you join or
   start sharing something. The renderer owns all sharing logic and permissions; this file only moves framed bytes. */
const MAX_FRAME = 64 * 1024 * 1024;

let swarm = null;
const topics = new Map();      // spaceId -> { topic:Buffer, disc }
const conns = new Map();       // peerId -> { conn, buf, remoteKey, localKey }
let nextPeer = 1;
let emit = () => {};
let lastError = '';

function bootstrap() {
  const v = process.env.BP_DHT_BOOTSTRAP;           // tests: a private local DHT instead of the public one
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

function ensureSwarm() {
  if (swarm) return swarm;
  const Hyperswarm = require('hyperswarm');
  swarm = new Hyperswarm({ bootstrap: bootstrap() });
  swarm.on('error', (e) => { lastError = String(e && e.message || e); });
  swarm.on('connection', (conn, info) => {
    const id = 'p' + nextPeer++;
    const rec = { conn, buf: Buffer.alloc(0), remoteKey: conn.remotePublicKey.toString('hex'), localKey: conn.publicKey.toString('hex') };
    conns.set(id, rec);
    conn.on('data', (chunk) => {
      rec.buf = rec.buf.length ? Buffer.concat([rec.buf, chunk]) : chunk;
      while (rec.buf.length >= 4) {
        const len = rec.buf.readUInt32BE(0);
        if (len > MAX_FRAME) { conn.destroy(); return; }
        if (rec.buf.length < 4 + len) break;
        const payload = rec.buf.subarray(4, 4 + len).toString('utf8');
        rec.buf = rec.buf.subarray(4 + len);
        emit({ type: 'msg', peer: id, data: payload });
      }
    });
    const gone = () => { if (conns.get(id) === rec) { conns.delete(id); emit({ type: 'close', peer: id }); } };
    conn.on('close', gone);
    conn.on('error', gone);
    emit({ type: 'open', peer: id, remoteKey: rec.remoteKey, localKey: rec.localKey });
  });
  return swarm;
}

function frame(str) {
  const body = Buffer.from(str, 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

async function join(id, topicHex) {
  if (topics.has(id)) return { ok: true };
  const s = ensureSwarm();
  const topic = Buffer.from(topicHex, 'hex');
  if (topic.length !== 32) return { error: 'Bad topic' };
  const disc = s.join(topic, { server: true, client: true });
  topics.set(id, { topic, disc });
  // announcing on the network can take a while (or never finish when offline): never make the caller wait for it
  disc.flushed().catch((e) => { lastError = String(e && e.message || e); });
  return { ok: true };
}

async function leave(id) {
  const t = topics.get(id);
  if (!t || !swarm) return { ok: true };
  topics.delete(id);
  try { await swarm.leave(t.topic); } catch (_) {}
  return { ok: true };
}

function send(peer, data) {
  const out = frame(String(data));
  let n = 0;
  const targets = peer === 'all' ? [...conns.values()] : [conns.get(peer)].filter(Boolean);
  targets.forEach((r) => { try { r.conn.write(out); n++; } catch (_) {} });
  return n;
}

function status() {
  return { running: !!swarm, topics: topics.size, peers: conns.size, error: lastError };
}

async function stopAll() {
  const s = swarm;
  swarm = null;
  topics.clear();
  conns.forEach((r, id) => { try { r.conn.destroy(); } catch (_) {} emit({ type: 'close', peer: id }); });
  conns.clear();
  if (s) { try { await s.destroy(); } catch (_) {} }
}

function init(ipcMain, onEmit) {
  emit = onEmit;
  ipcMain.handle('p2p:join', (_e, { id, topic }) => join(String(id), String(topic)));
  ipcMain.handle('p2p:leave', (_e, { id }) => leave(String(id)));
  ipcMain.handle('p2p:send', (_e, { peer, data }) => send(String(peer), data));
  ipcMain.handle('p2p:status', () => status());
  ipcMain.handle('p2p:stop', () => stopAll());
}

module.exports = { init, stopAll, status };
