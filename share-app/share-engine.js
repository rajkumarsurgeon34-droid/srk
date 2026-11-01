/* SRK Share engine (Windows / Node): discovers nearby SRK Share devices on the same Wi-Fi or hotspot and moves files directly between them.
   Protocol (shared with the Android engine):
     UDP 47322 broadcast  {app:"srk-share", t:"hello"|"reply", id, name, platform, port}
     GET  /srk/info                       -> {app, v, id, name, platform, port}
     POST /srk/offer   {from, items, text} -> {session, accepted:[ids]} | {declined:true}   (waits for the receiver's answer)
     POST /srk/upload?s=<session>&f=<id>  raw bytes, Content-Length = size -> {ok:true}
     POST /srk/cancel?s=<session>         */
'use strict';
const http = require('http'), dgram = require('dgram'), os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const UDP = 47322, PORTS = [47321, 47331, 47341, 47351, 47361];
const rid = () => crypto.randomBytes(8).toString('hex');

class ShareEngine {
  constructor(opts) {
    this.o = opts; // {name, platform, saveDir, emit(ev), prefs:{get,set}, extraTargets?: [host]}
    this.id = opts.prefs.get('id') || rid(); opts.prefs.set('id', this.id);
    this.name = opts.prefs.get('name') || opts.name || os.hostname();
    this.trusted = new Set(opts.prefs.get('trusted') || []);
    this.peers = new Map(); this.files = new Map(); this.offers = new Map(); this.sessions = new Map(); this.transfers = new Map();
    this.port = 0;
  }
  emit(ev) { try { this.o.emit(ev); } catch (e) { } }
  addrs() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out; }
  self() { return { type: 'self', id: this.id, name: this.name, platform: this.o.platform, addrs: this.addrs(), port: this.port, trusted: [...this.trusted].map(id => ({ id, name: (this.o.prefs.get('names') || {})[id] || 'Device' })) }; }
  me() { return { id: this.id, name: this.name, platform: this.o.platform, port: this.port }; }

  /* ---------- start: server + discovery ---------- */
  async start() {
    if (this.server) { this.emit(this.self()); this.emitPeers(); return; }
    this.server = http.createServer((q, r) => this.handle(q, r));
    this.server.keepAliveTimeout = 5000;
    for (const p of (this.o.ports || PORTS)) { try { await new Promise((res, rej) => { this.server.once('error', rej); this.server.listen(p, '0.0.0.0', () => { this.server.removeListener('error', rej); res(); }); }); this.port = p; break; } catch (e) { } }
    if (!this.port) await new Promise(res => this.server.listen(0, '0.0.0.0', () => { this.port = this.server.address().port; res(); }));
    this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udp.on('message', (m, rinfo) => this.onUdp(m, rinfo)); this.udp.on('error', () => { });
    await new Promise(res => this.udp.bind(this.o.udpPort || UDP, () => { try { this.udp.setBroadcast(true); } catch (e) { } res(); }));
    this.hello(); this.timer = setInterval(() => { this.hello(); this.expire(); }, 3000);
    this.emit(this.self()); this.emitPeers();
  }
  stop() { clearInterval(this.timer); try { this.udp.close(); } catch (e) { } try { this.server.close(); } catch (e) { } }
  targets() { const t = new Set(['255.255.255.255']); for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && a.netmask) { const ip = a.address.split('.').map(Number), m = a.netmask.split('.').map(Number); t.add(ip.map((v, i) => (v & m[i]) | (~m[i] & 255)).join('.')); } for (const x of this.o.extraTargets || []) t.add(x); return [...t]; }
  hello(t = 'hello', to) { const msg = Buffer.from(JSON.stringify({ app: 'srk-share', t, ...this.me() })); for (const h of to ? [to] : this.targets()) this.udp.send(msg, this.o.udpPort || UDP, h, () => { }); }
  onUdp(buf, rinfo) { let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; } if (m.app !== 'srk-share' || !m.id || m.id === this.id) return; this.seen({ id: m.id, name: m.name, platform: m.platform, port: m.port, ip: rinfo.address }); if (m.t === 'hello') this.hello('reply', rinfo.address); }
  seen(p) { const old = this.peers.get(p.id); const now = Date.now(); this.peers.set(p.id, { ...old, ...p, seen: now }); if (!old || old.name !== p.name || old.ip !== p.ip || old.port !== p.port) this.emitPeers(); if (p.name){ const names = this.o.prefs.get('names') || {}; if (names[p.id] !== p.name){ names[p.id] = p.name; this.o.prefs.set('names', names); } } }
  expire() { let ch = false; for (const [id, p] of this.peers) if (!p.manual && Date.now() - p.seen > 12000) { this.peers.delete(id); ch = true; } if (ch) this.emitPeers(); }
  emitPeers() { this.emit({ type: 'peers', peers: [...this.peers.values()].map(p => ({ id: p.id, name: p.name, platform: p.platform, ip: p.ip, port: p.port, trusted: this.trusted.has(p.id) })) }); }
  async connect(address) { const m = /^\s*([\w.-]+)(?::(\d+))?\s*$/.exec(address || ''); if (!m) throw new Error('Type an address like 192.168.1.5'); const host = m[1]; const ports = m[2] ? [+m[2]] : PORTS; for (const port of ports) { try { const info = await this.json('GET', host, port, '/srk/info', null, 3000); if (info && info.app === 'srk-share') { this.seen({ id: info.id, name: info.name, platform: info.platform, port: info.port || port, ip: host, manual: true }); this.hello('hello', host); return info; } } catch (e) { } } throw new Error('No SRK Share found at ' + host); }

  /* ---------- the server ---------- */
  body(q, max = 1 << 20) { return new Promise((res, rej) => { let n = 0; const c = []; q.on('data', d => { n += d.length; if (n > max) { rej(new Error('too big')); q.destroy(); } else c.push(d); }); q.on('end', () => res(Buffer.concat(c).toString())); q.on('error', rej); }); }
  reply(r, code, obj) { const b = Buffer.from(JSON.stringify(obj)); r.writeHead(code, { 'content-type': 'application/json', 'content-length': b.length, connection: 'close' }); r.end(b); }
  async handle(q, r) {
    const u = new URL(q.url, 'http://x'); const ip = (q.socket.remoteAddress || '').replace(/^::ffff:/, '');
    try {
      if (q.method === 'GET' && u.pathname === '/srk/info') return this.reply(r, 200, { app: 'srk-share', v: 1, ...this.me() });
      if (q.method === 'POST' && u.pathname === '/srk/offer') {
        const o = JSON.parse(await this.body(q)); const from = o.from || {}; if (from.id) this.seen({ id: from.id, name: from.name, platform: from.platform, port: from.port, ip });
        if (o.text && !(o.items || []).length) { this.emit({ type: 'text', from: { id: from.id, name: from.name }, text: String(o.text).slice(0, 100000), t: Date.now() }); return this.reply(r, 200, { accepted: [] }); }
        const items = (o.items || []).slice(0, 1000).map(x => ({ id: String(x.id), name: String(x.name || 'file').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 200) || 'file', size: Math.max(0, +x.size || 0), mime: x.mime || '' }));
        const offerId = rid(); const total = items.reduce((a, b) => a + b.size, 0);
        const decision = await new Promise(res => { const t = setTimeout(() => { this.offers.delete(offerId); this.emit({ type: 'offerClosed', offerId }); res({ accept: false }); }, 120000); this.offers.set(offerId, { res: d => { clearTimeout(t); this.offers.delete(offerId); res(d); } });
          if (this.trusted.has(from.id)) this.offers.get(offerId).res({ accept: true }); else this.emit({ type: 'offer', offerId, from: { id: from.id, name: from.name, platform: from.platform }, items, total }); r.on('close', () => { if (this.offers.has(offerId)) { this.emit({ type: 'offerClosed', offerId }); this.offers.get(offerId).res({ accept: false }); } }); });
        if (!decision.accept) return this.reply(r, 200, { declined: true });
        if (decision.always && from.id) { this.trusted.add(from.id); this.o.prefs.set('trusted', [...this.trusted]); this.emitPeers(); this.emit(this.self()); }
        const session = rid(); const s = { from, files: new Map(), t: Date.now() }; this.sessions.set(session, s);
        for (const it of items) { const tid = 'i-' + rid(); s.files.set(it.id, { ...it, tid }); this.transfer({ id: tid, dir: 'in', peer: { id: from.id, name: from.name }, name: it.name, size: it.size, done: 0, state: 'waiting' }); }
        return this.reply(r, 200, { session, accepted: items.map(i => i.id) });
      }
      if (q.method === 'POST' && u.pathname === '/srk/upload') return this.receive(q, r, u.searchParams.get('s'), u.searchParams.get('f'));
      if (q.method === 'GET' && u.pathname === '/srk/status') { const se = this.sessions.get(u.searchParams.get('s')); const f = se && se.files.get(u.searchParams.get('f')); const t = f && this.transfers.get(f.tid); return this.reply(r, 200, { state: t ? t.state : 'unknown' }); }
      if (q.method === 'POST' && u.pathname === '/srk/cancel') { const s = this.sessions.get(u.searchParams.get('s')); if (s) for (const f of s.files.values()) { const t = this.transfers.get(f.tid); if (t && !['done', 'failed', 'cancelled'].includes(t.state)) this.transfer({ ...t, state: 'cancelled', error: 'Cancelled by the sender' }); } return this.reply(r, 200, { ok: true }); }
      this.reply(r, 404, { error: 'not found' });
    } catch (e) { try { this.reply(r, 400, { error: String(e.message || e) }); } catch (x) { } }
  }
  uniquePath(name) { fs.mkdirSync(this.o.saveDir, { recursive: true }); this.reserved = this.reserved || new Set(); let f = path.join(this.o.saveDir, name); const ext = path.extname(name), base = name.slice(0, name.length - ext.length); let n = 1; while (fs.existsSync(f) || fs.existsSync(f + '.part') || this.reserved.has(f.toLowerCase())) f = path.join(this.o.saveDir, `${base} (${n++})${ext}`); this.reserved.add(f.toLowerCase()); return f; }
  receive(q, r, session, fid) {
    const s = this.sessions.get(session); const f = s && s.files.get(fid); if (!f) { q.resume(); return this.reply(r, 403, { error: 'not accepted' }); }
    const t0 = this.transfers.get(f.tid); if (t0 && t0.state === 'cancelled') { q.resume(); return this.reply(r, 410, { error: 'cancelled' }); }
    const file = this.uniquePath(f.name); const part = file + '.part'; const out = fs.createWriteStream(part); out.on('error', () => fail('Couldn’t write the file')); let done = 0, last = 0, lastDone = 0, lastT = Date.now(), speed = 0, failed = false;
    this.transfer({ ...this.transfers.get(f.tid), state: 'receiving' });
    const release = () => this.reserved.delete(file.toLowerCase()); const fail = (msg, state = 'failed') => { if (failed) return; failed = true; release(); out.destroy(); fs.unlink(part, () => { }); const t = this.transfers.get(f.tid); const was = t && t.state === 'cancelled'; this.transfer({ ...t, state: was ? 'cancelled' : state, error: was ? t.error : msg }); };
    this.transfers.get(f.tid).abort = () => { fail('You cancelled it', 'cancelled'); q.destroy(); };
    q.on('data', d => { if (failed) return; done += d.length; if (!out.write(d)) { q.pause(); out.once('drain', () => q.resume()); } const now = Date.now(); if (now - last > 250) { const dt = (now - lastT) / 1000; if (dt > .4) { speed = (done - lastDone) / dt; lastDone = done; lastT = now; } last = now; this.progress(f.tid, done, f.size, speed); } });
    q.on('aborted', () => fail('The connection dropped')); q.on('error', () => fail('The connection dropped'));
    q.on('end', () => { if (failed) return; out.end(() => { if (failed) return; if (f.size && done !== f.size) return fail('The file arrived incomplete'); try { fs.renameSync(part, file); } catch (e) { return fail('Couldn’t save the file'); } release(); this.transfer({ ...this.transfers.get(f.tid), state: 'done', done, ref: file, name: path.basename(file) }); this.reply(r, 200, { ok: true }); }); });
  }
  transfer(t) { const keep = this.transfers.get(t.id) || {}; const n = { ...keep, ...t }; this.transfers.set(t.id, n); const { abort, src, ...pub } = n; this.emit({ type: 'transfer', ...pub }); }
  progress(id, done, size, speed) { const t = this.transfers.get(id); if (!t) return; t.done = done; t.speed = speed; this.emit({ type: 'progress', id, done, size, speed }); }

  /* ---------- picking and sending ---------- */
  addPaths(paths) { const out = []; for (const p of paths) { try { const st = fs.statSync(p); if (!st.isFile()) continue; const id = rid(); const f = { id, name: path.basename(p), size: st.size, mime: '', path: p }; this.files.set(id, f); out.push({ id, name: f.name, size: f.size, mime: '' }); } catch (e) { } } if (out.length) this.emit({ type: 'picked', files: out }); return out; }
  forget(id) { this.files.delete(id); }
  json(method, host, port, p, obj, timeout = 130000) { return new Promise((res, rej) => { const b = obj ? Buffer.from(JSON.stringify(obj)) : null; const q = http.request({ host, port, path: p, method, timeout, headers: b ? { 'content-type': 'application/json', 'content-length': b.length } : {} }, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString())); } catch (e) { rej(new Error('bad reply')); } }); }); q.on('timeout', () => q.destroy(new Error('timed out'))); q.on('error', rej); if (b) q.write(b); q.end(); }); }
  sendTo(peerIds, fileIds, text) {
    const files = fileIds.map(id => this.files.get(id)).filter(Boolean);
    for (const pid of peerIds) { const peer = this.peers.get(pid); if (!peer) { this.emit({ type: 'toast', msg: 'That device is no longer nearby' }); continue; } this.sendToPeer(peer, files, text).catch(e => this.emit({ type: 'toast', msg: `${peer.name}: ${e.message}` })); }
  }
  async sendToPeer(peer, files, text) {
    if (text && !files.length) { await this.json('POST', peer.ip, peer.port, '/srk/offer', { from: this.me(), items: [], text }); this.emit({ type: 'textSent', to: { id: peer.id, name: peer.name }, text, t: Date.now() }); return; }
    const ts = files.map(f => { const id = 'o-' + rid(); this.transfer({ id, dir: 'out', peer: { id: peer.id, name: peer.name }, name: f.name, size: f.size, done: 0, state: 'waiting', src: f }); return id; });
    let ans; try { ans = await this.json('POST', peer.ip, peer.port, '/srk/offer', { from: this.me(), items: files.map(f => ({ id: f.id, name: f.name, size: f.size, mime: f.mime })) }); } catch (e) { for (const id of ts) this.transfer({ id, state: 'failed', error: 'Couldn’t reach ' + peer.name }); return; }
    if (!ans || ans.declined) { for (const id of ts) this.transfer({ id, state: 'declined', error: peer.name + ' said no' }); return; }
    const acc = new Set(ans.accepted || []);
    for (let i = 0; i < files.length; i++) { const t = this.transfers.get(ts[i]); if (t.state === 'cancelled') continue; if (!acc.has(files[i].id)) { this.transfer({ id: ts[i], state: 'declined' }); continue; } t.session = ans.session; t.peerAddr = [peer.ip, peer.port]; await this.upload(ts[i], peer, ans.session, files[i]); }
  }
  upload(tid, peer, session, f) { return new Promise(res => {
    let done = 0, last = 0, lastDone = 0, lastT = Date.now(), speed = 0, over = false; const finish = (state, error) => { if (over) return; over = true; this.transfer({ id: tid, state, error, done }); res(); };
    const q = http.request({ host: peer.ip, port: peer.port, method: 'POST', path: `/srk/upload?s=${session}&f=${encodeURIComponent(f.id)}`, headers: { 'content-type': 'application/octet-stream', 'content-length': f.size } }, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => finish(r.statusCode === 200 ? 'done' : 'failed', r.statusCode === 200 ? undefined : (r.statusCode === 410 ? 'Cancelled by ' + peer.name : 'Not accepted'))); });
    q.on('error', async () => { const t = this.transfers.get(tid); if (t && t.state === 'cancelled') return finish('cancelled', 'You cancelled it'); let st = null; try { st = (await this.json('GET', peer.ip, peer.port, `/srk/status?s=${session}&f=${encodeURIComponent(f.id)}`, null, 4000)).state; } catch (e) { } if (st === 'cancelled') finish('cancelled', 'Cancelled by ' + peer.name); else finish('failed', 'The connection dropped'); });
    const rs = fs.createReadStream(f.path, { highWaterMark: 256 * 1024 }); this.transfer({ id: tid, state: 'sending' });
    this.transfers.get(tid).abort = () => { this.transfer({ id: tid, state: 'cancelled', error: 'You cancelled it' }); rs.destroy(); q.destroy(); this.json('POST', peer.ip, peer.port, '/srk/cancel?s=' + session, {}).catch(() => { }); finish('cancelled', 'You cancelled it'); };
    rs.on('data', d => { done += d.length; const now = Date.now(); if (now - last > 250) { const dt = (now - lastT) / 1000; if (dt > .4) { speed = (done - lastDone) / dt; lastDone = done; lastT = now; } last = now; this.progress(tid, done, f.size, speed); } });
    rs.on('error', () => { q.destroy(); finish('failed', 'Couldn’t read the file'); });
    rs.pipe(q);
  }); }
  respond(offerId, accept, always) { const o = this.offers.get(offerId); if (o) o.res({ accept: !!accept, always: !!always }); }
  cancel(tid) { const t = this.transfers.get(tid); if (!t) return; if (t.abort) t.abort(); else if (!['done', 'failed', 'cancelled'].includes(t.state)) this.transfer({ id: tid, state: 'cancelled', error: 'You cancelled it' }); }
  setName(n) { this.name = String(n || '').trim().slice(0, 40) || os.hostname(); this.o.prefs.set('name', this.name); this.hello(); this.emit(this.self()); }
  untrust(id) { this.trusted.delete(id); this.o.prefs.set('trusted', [...this.trusted]); this.emitPeers(); this.emit(this.self()); }
  ref(tid) { const t = this.transfers.get(tid); return t && t.ref; }
}
module.exports = { ShareEngine };
