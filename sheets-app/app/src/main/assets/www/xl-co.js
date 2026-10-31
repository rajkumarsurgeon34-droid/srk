/* SRK Sheets — real-time co-authoring (web version): shared workbooks, live cell edits, and who’s here */
'use strict';
const CO = (() => {
  const $ = (s, r = document) => r.querySelector(s); const G = Grid.G;
  const h = UI.h, toast = (...a) => UI.toast(...a), dialog = (...a) => UI.dialog(...a), mi = (...a) => UI.mi(...a);
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {share: S('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8v6M14 11h6"/>'), live: S('<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>')};
  const ok = () => !window.SRK_NATIVE && window.claude && window.claude.use;
  let caps = null; const getCaps = () => caps || (caps = (async () => { if (!ok()) return {}; const [db, room, user] = await Promise.all(['db', 'room', 'user'].map(n => window.claude.use(n).catch(() => null))); return {db, room, user}; })());
  const BLOCK = 100; const blockOf = k => Math.floor(+k.split(',')[0] / BLOCK);
  const COLORS = ['#D9480F', '#2F6FDE', '#7B2FBE', '#C2255C', '#0B7285', '#E8590C', '#5C940D'];

  /* ---------------------------------------------------------------- session state */
  let S_ = null; // {id, wb, unsub: [], sent: Map(docId → {k: json}), metaSent, timer, room, peers}
  const sheetMeta = s => { const {cells, sel, ...rest} = s; return rest; };
  const metaOf = wb => ({name: wb.name, sheets: wb.sheets.map(sheetMeta), names: wb.names || {}, active: wb.active});
  const cellDocs = wb => { const out = new Map(); for (const s of wb.sheets) for (const k in s.cells){ const id = s.id + '_' + blockOf(k); if (!out.has(id)) out.set(id, {sheet: s.id, b: blockOf(k), cells: {}}); out.get(id).cells[k] = s.cells[k]; } return out; };

  async function share(){ const {db, user} = await getCaps(); if (!db) return dialog('Live editing', h('p', {style: 'margin:0'}, ok() ? 'Live editing isn’t available here. Sign in to claude.ai and open SRK Sheets from there.' : 'Live editing works in the web version of SRK Sheets on claude.ai: open it there, share the page with your colleagues, then use File › Share for live editing.'), [['OK', 'primary']]);
    const wb = G.wb; if (wb.coId){ return info(); } if (G.edit) Grid.commitEdit();
    if (JSON.stringify(wb).length > 4e6) return toast('This workbook is too large for live editing (over about 4 MB)', 5000);
    toast('Sharing…', 20000); const id = uid() + uid();
    try { const me = user ? await user.id().catch(() => null) : null; await db.doc('co/' + id).set({...metaOf(wb), owner: me, created: Date.now(), updated: Date.now()});
      for (const [docId, d] of cellDocs(wb)) await db.doc(`co/${id}/cells/${docId}`).set(d);
      wb.coId = id; App.dirty(); await start(wb); toast('Shared. Anyone you share this page with can open it from the start screen under “Live workbooks”.', 6000); info(); }
    catch(e){ console.error(e); toast(e.code === 'quota_exceeded' ? 'There’s no room left for more shared workbooks. Delete some first.' : 'Couldn’t share: ' + (e.message || e.code), 6000); } }
  function info(){ const n = S_ ? (S_.peers || []).filter(p => !p.isMe).length : 0; dialog('Live editing is on', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, h('p', {style: 'margin:0'}, 'Changes you and others make appear for everyone within a second or two. ' + (n ? `${n} other${n === 1 ? ' person is' : ' people are'} here now.` : 'Nobody else is here right now.')),
      h('p', {class: 'hint'}, 'To invite someone: share this SRK Sheets page with them from the page’s Share menu (give them edit access). They’ll find this workbook on their start screen under “Live workbooks”.')), [['Stop sharing', 'danger', () => stopSharing()], ['OK', 'primary']]); }
  async function stopSharing(){ const {db} = await getCaps(); const id = G.wb.coId; if (!id || !db) return; stop(); try { const snap = await db.collection(`co/${id}/cells`).get(); for (const d of snap.docs || []) await db.doc(`co/${id}/cells/${d.id}`).delete(); await db.doc('co/' + id).delete(); } catch(e){} delete G.wb.coId; App.dirty(); toast('Live editing stopped. Your copy stays on this device.'); }

  /* ---------------------------------------------------------------- live session */
  async function start(wb){ stop(); const {db, room, user} = await getCaps(); if (!db) return; S_ = {id: wb.coId, wb, unsub: [], sent: new Map(), metaSent: JSON.stringify(metaOf(wb)), timer: 0, peers: [], first: true};
    for (const [docId, d] of cellDocs(wb)) S_.sent.set(docId, Object.fromEntries(Object.entries(d.cells).map(([k, v]) => [k, JSON.stringify(v)])));
    const loadTimer = setTimeout(() => { if (S_ && S_.first) badge('offline'); }, 10000);
    S_.unsub.push(db.doc('co/' + S_.id).onSnapshot(snap => { if (!S_) return; if (!snap.exists){ toast('This live workbook was deleted by its owner'); stop(); return; } const d = snap.data(); const local = JSON.stringify(metaOf(S_.wb)); const remote = JSON.stringify({name: d.name, sheets: d.sheets, names: d.names || {}, active: d.active}); if (remote === S_.metaSent || snap.metadata && snap.metadata.hasPendingWrites) return; S_.metaSent = remote; if (local !== remote) applyMeta(d); }, e => badge('offline')));
    S_.unsub.push(db.collection(`co/${S_.id}/cells`).onSnapshot(snap => { if (!S_) return; clearTimeout(loadTimer); S_.first = false; badge('live'); let changed = false; for (const d of snap.docs || []){ const data = d.data(); if (applyCells(d.id, data)) changed = true; } if (changed) redraw(); }, e => badge('offline')));
    // who's here
    if (room){ try { S_.room = await room.join('co-' + S_.id); S_.unsub.push(S_.room.onPeers(ch => { if (!S_) return; S_.peers = ch.peers; names(ch.peers); drawPeers(); Grid.refresh(false); })); sendPresence(); } catch(e){ S_.room = null; } }
    badge('live'); }
  function stop(){ if (!S_) return; flush(); for (const u of S_.unsub) try { u(); } catch(e){} if (S_.room) S_.room.leave().catch(() => {}); clearTimeout(S_.timer); S_ = null; badge(null); document.querySelectorAll('.copeer').forEach(e => e.remove()); }
  function applyMeta(d){ const wb = S_.wb; const byId = new Map(wb.sheets.map(s => [s.id, s])); wb.name = d.name; $('#docTitle').value = d.name; wb.names = d.names || {};
    wb.sheets = d.sheets.map(m => { const s = byId.get(m.id) || {cells: {}}; const cells = s.cells || {}; const sel = s.sel; for (const k of Object.keys(s)) delete s[k]; Object.assign(s, clone(m), {cells}); if (sel) s.sel = sel; return s; });
    if (!wb.sheets.includes(G.sh)){ wb.active = Math.min(wb.active, wb.sheets.length - 1); Grid.showSheet(wb.active); } UI.tabs(); redraw(); }
  function applyCells(docId, data){ const s = S_.wb.sheets.find(x => x.id === data.sheet); if (!s) return false; const sent = S_.sent.get(docId) || {}; let changed = false;
    for (const [k, v] of Object.entries(data.cells || {})){ const j = v == null ? null : JSON.stringify(v); if (sent[k] === j) continue; const cur = s.cells[k] ? JSON.stringify(s.cells[k]) : null; sent[k] = j; if (cur === j) continue; if (v == null) delete s.cells[k]; else s.cells[k] = v; changed = true; }
    S_.sent.set(docId, sent); return changed; }
  let rd = 0; function redraw(){ cancelAnimationFrame(rd); rd = requestAnimationFrame(() => { Calc.invalidate(); Grid.refresh(); UI.onSel(); App.dirty(); }); }
  // local changes: after every edit, send what differs from what was last sent
  function schedule(){ if (!S_) return; clearTimeout(S_.timer); S_.timer = setTimeout(flush, 400); }
  let flushing = null;
  async function flush(){ if (!S_ || flushing) return; const {db} = await getCaps(); if (!db || !S_) return; const id = S_.id; const writes = [];
    const meta = JSON.stringify(metaOf(S_.wb)); if (meta !== S_.metaSent){ S_.metaSent = meta; writes.push(['meta', {...JSON.parse(meta), updated: Date.now()}]); }
    const now = cellDocs(S_.wb); const ids = new Set([...now.keys(), ...S_.sent.keys()]);
    for (const docId of ids){ const cur = now.get(docId); const sent = S_.sent.get(docId) || {}; const patch = {}; let n = 0; const curCells = cur ? cur.cells : {};
      for (const k in curCells){ const j = JSON.stringify(curCells[k]); if (sent[k] !== j){ patch[k] = curCells[k]; sent[k] = j; n++; } }
      for (const k in sent){ if (sent[k] != null && !(k in curCells)){ patch[k] = null; sent[k] = null; n++; } }
      if (n){ S_.sent.set(docId, sent); const [sid, b] = docId.split('_'); writes.push([docId, {sheet: sid, b: +b, cells: patch}, !!(cur && Object.keys(sent).length === Object.keys(curCells).length && n === Object.keys(curCells).length)]); } }
    if (!writes.length) return;
    flushing = (async () => { for (const [docId, data, fresh] of writes){ try { if (docId === 'meta') await db.doc('co/' + id).update(data); else { const ref = db.doc(`co/${id}/cells/${docId}`); try { await ref.update(data); } catch(e){ if (e.code === 'invalid_argument') await ref.set(data); else throw e; } } } catch(e){ console.warn('live save', e); if (e.code === 'not_granted' || e.code === 'revoked'){ toast('You can view this live workbook but not change it (ask the owner for edit access)', 5000); } } } })();
    await flushing; flushing = null; }
  // wrap the undo stack: every committed change triggers a send
  const _commit = History.commit, _wbc = History.wbChange, _undo = History.undo, _redo = History.redo;
  History.commit = function(...a){ const r = _commit.apply(this, a); schedule(); return r; }; History.wbChange = function(...a){ const r = _wbc.apply(this, a); schedule(); return r; };
  History.undo = function(...a){ const r = _undo.apply(this, a); schedule(); return r; }; History.redo = function(...a){ const r = _redo.apply(this, a); schedule(); return r; };
  setInterval(() => { if (S_) schedule(); }, 5000); // objects and other direct changes

  /* ---------------------------------------------------------------- presence */
  const profiles = new Map();
  async function names(peers){ const {user} = await getCaps(); if (!user) return; const ids = [...new Set(peers.map(p => p.by).filter(Boolean))].filter(i => !profiles.has(i)); if (!ids.length) return; try { const ps = await user.profiles(ids); for (const i of ids) profiles.set(i, (ps[i] && ps[i].name) || 'Someone'); drawPeers(); } catch(e){} }
  let lastP = '';
  function sendPresence(){ if (!S_ || !S_.room) return; const p = {sheet: G.sh.id, r: G.sel.r, c: G.sel.c, g: G.sel.g}; const j = JSON.stringify(p); if (j === lastP) return; lastP = j; S_.room.presence(p).catch(() => {}); }
  setTimeout(() => { (G.selHooks = G.selHooks || []).push(() => { clearTimeout(sendPresence.t); sendPresence.t = setTimeout(sendPresence, 150); });
    (G.renderHooks = G.renderHooks || []).push(drawBoxes); }, 0);
  function drawBoxes(){ document.querySelectorAll('#gmain .copeer').forEach(e => e.remove()); if (!S_ || !S_.peers) return; const main = $('#gmain'); if (!main) return;
    S_.peers.filter(p => !p.isMe && p.presence && p.presence.sheet === G.sh.id && p.presence.g).forEach((p, i) => { const g = p.presence.g; const a = Grid.cellBox(g.r1, g.c1), b = Grid.cellBox(Math.min(g.r2, g.r1 + 200), Math.min(g.c2, g.c1 + 50)); const col = COLORS[i % COLORS.length]; const x = Grid.hw() + a.x, y = Grid.hh() + a.y, w = b.x + b.w - a.x, hh = b.y + b.h - a.y;
      main.append(h('div', {class: 'copeer', style: `left:${x}px;top:${y}px;width:${w}px;height:${hh}px;--pc:${col}`}, h('span', {}, profiles.get(p.by) || (p.guest ? 'Guest' : 'Someone')))); }); }
  function drawPeers(){ let bar = $('#coPeers'); if (!S_){ if (bar) bar.remove(); return; } const others = (S_.peers || []).filter(p => !p.isMe); if (!bar){ bar = h('div', {id: 'coPeers', class: 'copeers'}); const t = $('#savedLbl'); t.parentNode.insertBefore(bar, t); }
    bar.innerHTML = ''; others.slice(0, 4).forEach((p, i) => { const n = profiles.get(p.by) || (p.guest ? 'Guest' : '?'); const sh = G.wb.sheets.find(s => s.id === (p.presence || {}).sheet); bar.append(h('span', {style: `background:${COLORS[i % COLORS.length]}`, title: `${n}${sh ? ' — ' + sh.name + (p.presence.g ? '!' + addr(p.presence.r, p.presence.c) : '') : ''}`}, n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())); }); if (others.length > 4) bar.append(h('span', {style: 'background:#888'}, '+' + (others.length - 4))); }
  function badge(state){ let b = $('#coBadge'); if (!state){ if (b) b.remove(); return; } if (!b){ b = h('button', {id: 'coBadge', class: 'cobadge', type: 'button', onclick: info}); const t = $('#savedLbl'); t.parentNode.insertBefore(b, t); } b.className = 'cobadge ' + state; b.innerHTML = IC.live + (state === 'live' ? '<span>Live</span>' : '<span>Offline</span>'); b.title = state === 'live' ? 'Live editing is on' : 'Can’t reach the shared copy right now; your changes will be sent when it’s back'; }

  /* ---------------------------------------------------------------- start screen: Live workbooks */
  async function listShared(){ const box = $('#coList'); if (!box) return; const {db} = await getCaps(); if (!db){ box.closest('.sec').hidden = true; return; } box.closest('.sec').hidden = false; box.innerHTML = '<div class="empty">Loading…</div>';
    let docs = []; try { const q = await db.collection('co').orderBy('updated', 'desc').limit(30).get(); docs = q.docs || []; } catch(e){ box.innerHTML = '<div class="empty">Couldn’t load live workbooks.</div>'; return; }
    box.innerHTML = ''; if (!docs.length){ box.append(h('div', {class: 'empty'}, 'Workbooks shared for live editing appear here. Open a workbook, then File › Share for live editing.')); return; }
    for (const d of docs){ const m = d.data(); const when = new Date(m.updated || m.created || Date.now()); const meta = h('button', {class: 'meta', type: 'button'}, h('b', {}, m.name || 'Workbook'), h('small', {}, `Live · ${(m.sheets || []).length} sheet${(m.sheets || []).length === 1 ? '' : 's'} · ${when.toLocaleDateString(undefined, {day: 'numeric', month: 'short'})} ${when.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})}`));
      meta.addEventListener('click', () => openShared(d.id, m)); box.append(h('div', {class: 'rrow'}, h('span', {class: 'ricon', style: 'background:#E7F0FF;color:#2F6FDE'}, 'LIVE'), meta)); } }
  async function openShared(id, m){ const {db} = await getCaps(); toast('Opening…', 15000); try { const snap = await db.collection(`co/${id}/cells`).get(); const book = {id: 'co-' + id, name: m.name, sheets: (m.sheets || []).map(x => ({...clone(x), cells: {}})), active: m.active || 0, names: m.names || {}, media: {}, coId: id, updated: Date.now()};
      for (const d of snap.docs || []){ const data = d.data(); const s = book.sheets.find(x => x.id === data.sheet); if (!s) continue; for (const [k, v] of Object.entries(data.cells || {})) if (v != null) s.cells[k] = v; }
      if (!book.sheets.length) book.sheets.push(newSheet('Sheet1')); App.openBook(book); toast('', 1); } catch(e){ toast('Couldn’t open it: ' + (e.message || e.code), 5000); } }
  setTimeout(() => { if (!ok()) return; const recent = $('#recent'); if (!recent || $('#coList')) return; const sec = h('section', {class: 'sec', hidden: true}, h('h2', {}, 'Live workbooks'), h('div', {class: 'recent', id: 'coList'})); recent.closest('.sec').after(sec); listShared(); }, 0);

  const ext = {
    fileItems(item){ return ok() ? [item('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8v6M14 11h6"/>', G.wb.coId ? 'Live editing is on' : 'Share for live editing', G.wb.coId ? 'See who’s here, or stop sharing' : 'Edit this workbook together, at the same time', share)] : []; },
    ribbon(tab, r, {grp, rb}){ if (tab === 'review' && ok()) r.append(grp('Co-authoring', rb(IC.share, G.wb.coId ? 'Live editing' : 'Share for live editing', share, {label: G.wb.coId ? 'Live: on' : 'Share Live'}))); },
    onOpen(wb){ if (wb.coId && ok()) start(wb); else stop(); },
  };
  SRK_EXT.push(ext);
  return {share, start, stop, listShared, flush, get session(){ return S_; }};
})();
