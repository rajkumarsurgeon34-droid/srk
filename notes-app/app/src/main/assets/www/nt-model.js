/* SRK Notes — data: notebooks › sections › pages, attachments, versions, recycle bin, search, tags, section passwords */
'use strict';
const M = (() => {
  let nbs = []; const secs = new Map(), pages = new Map(), encPages = new Map(), keys = new Map(); const urls = new Map(); const listeners = new Set();
  const now = () => Date.now();
  const emit = (what, x) => listeners.forEach(f => { try { f(what, x); } catch(e){ console.error(e); } });
  const blobRefs = p => { const ids = new Set(); for (const it of p.items || []) for (const m of String(it.html || '').matchAll(/data-blob="([^"]+)"/g)) ids.add(m[1]); return ids; };
  const pageText = p => [p.title || '', ...(p.items || []).map(it => textOf(it.html || ''))].join('\n');

  /* ---------- load ---------- */
  async function load(){ nbs = (await DB.all('nb')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); secs.clear(); pages.clear(); encPages.clear();
    for (const s of await DB.all('sec')) secs.set(s.id, s);
    for (const p of await DB.all('page')){ if (p.enc) encPages.set(p.id, p); else pages.set(p.id, p); }
    // repair: section/page lists pointing at missing items, orphaned pages
    for (const nb of nbs) nb.sections = (nb.sections || []).filter(id => secs.has(id));
    for (const s of secs.values()){ s.pages = (s.pages || []).filter(id => pages.has(id) || encPages.has(id)); }
    for (const p of [...pages.values(), ...encPages.values()]){ const s = secs.get(p.sec); if (s && !s.pages.includes(p.id)) s.pages.push(p.id); }
    if (!nbs.length) await starter();
    try { const t = await DB.all('trash'); const old = now() - 60 * 864e5; for (const x of t) if (x.t < old) await purge(x.id); } catch(e){}
  }
  async function starter(){ const nb = await addNotebook('My Notebook', NB_COLORS[0]); const q = await addSection(nb.id, 'Quick Notes', SECTION_COLORS[0]); await addSection(nb.id, 'Ward & OPD', SECTION_COLORS[3]); await addSection(nb.id, 'Study', SECTION_COLORS[5]);
    await addPage(q.id, {title: 'Welcome to SRK Notes', items: [{id: uid(), x: 28, y: 120, w: 560, html: WELCOME}]}); }
  const WELCOME = `<h2>Your notes, organised like a binder</h2><p><b>Notebooks</b> hold coloured <b>sections</b>, and sections hold <b>pages</b>. Tap anywhere on a page to start typing in a new note box — drag its top bar to move it.</p><p><br></p><p>${'{{todo}}'}Try the To Do tag — tap the box to tick it</p><p>${'{{important}}'}Tags make things easy to find later (Home › Find tags)</p><p>${'{{idea}}'}Use <b>Draw</b> to write or sketch with your finger or a stylus</p><p><br></p><p>Type <b>[[</b>Page name<b>]]</b> to link to another page — it creates the page if needed.</p><p>Insert pictures, PDF printouts, audio and video recordings, tables and files from the <b>Insert</b> tab.</p><p>Lock a section with a password from its <b>⋮</b> menu. Deleted pages stay in the Recycle Bin for 60 days.</p>`.replace(/\{\{(\w+)\}\}/g, (_, k) => tagHTML(k, false));

  /* ---------- getters ---------- */
  const notebooks = () => nbs, notebook = id => nbs.find(n => n.id === id) || null, section = id => secs.get(id) || null;
  const sectionsOf = nbId => { const nb = notebook(nbId); return nb ? nb.sections.map(id => secs.get(id)).filter(Boolean) : []; };
  const pagesOf = secId => { const s = secs.get(secId); return s ? s.pages.map(id => pages.get(id)).filter(Boolean) : []; };
  const page = id => pages.get(id) || null;
  const isLocked = secId => { const s = secs.get(secId); return !!(s && s.lock && !keys.has(secId)); };
  const allPages = () => [...pages.values()].filter(p => secs.has(p.sec));
  const nbOfSec = secId => nbs.find(n => n.sections.includes(secId)) || null;

  /* ---------- notebooks & sections ---------- */
  async function addNotebook(name, color){ const nb = {id: uid(), name: name || 'Notebook', color: color || NB_COLORS[nbs.length % NB_COLORS.length], sections: [], order: nbs.length, created: now()}; nbs.push(nb); await DB.put('nb', nb); emit('nav'); return nb; }
  async function saveNb(nb){ await DB.put('nb', nb); emit('nav'); }
  async function addSection(nbId, name, color, at){ const nb = notebook(nbId); if (!nb) throw new Error('No notebook'); const s = {id: uid(), nb: nbId, name: name || 'New Section', color: color || SECTION_COLORS[nb.sections.length % SECTION_COLORS.length], pages: [], created: now()}; secs.set(s.id, s); if (at != null) nb.sections.splice(at, 0, s.id); else nb.sections.push(s.id); await DB.put('sec', s); await DB.put('nb', nb); emit('nav'); return s; }
  async function saveSec(s){ await DB.put('sec', s); emit('nav'); }
  async function moveSection(secId, toNb, at){ const s = secs.get(secId); const from = nbOfSec(secId); const to = notebook(toNb); if (!s || !to) return; if (from) from.sections = from.sections.filter(x => x !== secId); if (at == null || at > to.sections.length) to.sections.push(secId); else to.sections.splice(at, 0, secId); s.nb = toNb; await DB.put('sec', s); if (from && from !== to) await DB.put('nb', from); await DB.put('nb', to); emit('nav'); }
  async function deleteSection(secId){ const s = secs.get(secId); if (!s) return; const nb = nbOfSec(secId); const recs = []; for (const id of s.pages){ const p = pages.get(id) || encPages.get(id); if (p) recs.push(p); }
    await DB.put('trash', {id: uid(), kind: 'section', t: now(), title: s.name, nb: nb && nb.id, data: {sec: s, pages: recs}}); for (const p of recs){ await DB.del('page', p.id); pages.delete(p.id); encPages.delete(p.id); } secs.delete(secId); keys.delete(secId); await DB.del('sec', secId); if (nb){ nb.sections = nb.sections.filter(x => x !== secId); await DB.put('nb', nb); } emit('nav'); }
  async function deleteNotebook(nbId){ const nb = notebook(nbId); if (!nb) return; for (const id of [...nb.sections]) await deleteSection(id); nbs = nbs.filter(n => n !== nb); await DB.del('nb', nbId); await DB.put('trash', {id: uid(), kind: 'notebook', t: now(), title: nb.name, data: {nb: {...nb, sections: []}}}); emit('nav'); }

  /* ---------- pages ---------- */
  function blankPage(secId, o = {}){ return {id: uid(), sec: secId, title: o.title || '', lvl: o.lvl || 0, created: now(), modified: now(), color: o.color || '', rule: o.rule || '', items: o.items || [], ink: o.ink || []}; }
  async function addPage(secId, o = {}){ const s = secs.get(secId); if (!s) throw new Error('No section'); const p = blankPage(secId, o); pages.set(p.id, p); const i = o.after ? s.pages.indexOf(o.after) : -1; if (i >= 0){ let j = i + 1; const base = pages.get(o.after); if (o.lvl > (base ? base.lvl : 0)){} else while (j < s.pages.length && (pages.get(s.pages[j]) || {lvl: 0}).lvl > (base ? base.lvl : 0)) j++; s.pages.splice(j, 0, p.id); } else s.pages.push(p.id); await writePage(p); await DB.put('sec', s); emit('pages', secId); return p; }
  const saveTimers = new Map(); const lastVer = new Map();
  function touch(p, now_ = true){ if (now_) p.modified = now(); clearTimeout(saveTimers.get(p.id)); saveTimers.set(p.id, setTimeout(() => { saveTimers.delete(p.id); writePage(p).catch(e => UI.toast('Couldn’t save: ' + e.message)); }, 500)); emit('touch', p); }
  async function flush(){ const ids = [...saveTimers.keys()]; for (const id of ids){ clearTimeout(saveTimers.get(id)); saveTimers.delete(id); const p = pages.get(id); if (p) await writePage(p); } }
  async function writePage(p){ const s = secs.get(p.sec); if (s && s.lock){ const k = keys.get(p.sec); if (!k) return; const enc = await Crypt.encJSON(k, p); const rec = {id: p.id, sec: p.sec, enc, modified: p.modified}; encPages.set(p.id, rec); await DB.put('page', rec); return; }
    await DB.put('page', p); maybeVersion(p); }
  async function maybeVersion(p){ try { const t = lastVer.get(p.id) || 0; if (now() - t < 5 * 60e3) return; lastVer.set(p.id, now()); if (!(p.items || []).length && !(p.ink || []).length) return; await DB.put('ver', {id: uid(), page: p.id, t: now(), data: clone(p)}); const vs = (await DB.all('ver')).filter(v => v.page === p.id).sort((a, b) => b.t - a.t); for (const v of vs.slice(30)) await DB.del('ver', v.id); } catch(e){} }
  async function versions(pid){ return (await DB.all('ver')).filter(v => v.page === pid).sort((a, b) => b.t - a.t); }
  async function restoreVersion(v){ const p = pages.get(v.page); if (!p) return; await DB.put('ver', {id: uid(), page: p.id, t: now(), data: clone(p)}); Object.assign(p, clone(v.data), {modified: now()}); await writePage(p); emit('pages', p.sec); return p; }
  async function deletePage(pid, withSub = true){ const p = pages.get(pid); if (!p) return; const s = secs.get(p.sec); const ids = [pid]; if (withSub && s){ let j = s.pages.indexOf(pid) + 1; while (j < s.pages.length && (pages.get(s.pages[j]) || {lvl: 0}).lvl > p.lvl) ids.push(s.pages[j++]); }
    for (const id of ids){ const q = pages.get(id) || encPages.get(id); if (!q) continue; const rec = s && s.lock ? (encPages.get(id) || q) : q; await DB.put('trash', {id: uid(), kind: 'page', t: now(), title: (pages.get(id) || {}).title || 'Untitled page', nb: s && s.nb, sec: p.sec, data: {page: rec}}); pages.delete(id); encPages.delete(id); await DB.del('page', id); if (s) s.pages = s.pages.filter(x => x !== id); }
    if (s) await DB.put('sec', s); emit('pages', p.sec); }
  async function movePage(pid, toSec, copy){ const p = pages.get(pid); const to = secs.get(toSec); if (!p || !to) return; if (to.lock && !keys.has(toSec)) throw new Error('Unlock that section first');
    const q = copy ? {...clone(p), id: uid(), created: now(), lvl: 0} : p; const from = secs.get(p.sec);
    if (q.sec !== toSec || copy){ await rehomeBlobs(q, p.sec, toSec); }
    if (!copy && from){ from.pages = from.pages.filter(x => x !== pid); await DB.put('sec', from); if (from.lock) { encPages.delete(pid); await DB.del('page', pid); } }
    q.sec = toSec; q.lvl = 0; pages.set(q.id, q); if (!to.pages.includes(q.id)) to.pages.push(q.id); await writePage(q); await DB.put('sec', to); emit('pages', toSec); if (from) emit('pages', from.id); return q; }
  async function reorder(secId, pid, beforeId){ const s = secs.get(secId); if (!s) return; s.pages = s.pages.filter(x => x !== pid); const i = beforeId ? s.pages.indexOf(beforeId) : -1; if (i < 0) s.pages.push(pid); else s.pages.splice(i, 0, pid); await DB.put('sec', s); emit('pages', secId); }
  async function setLevel(pid, d){ const p = pages.get(pid); if (!p) return; const s = secs.get(p.sec); const i = s.pages.indexOf(pid); const prev = i > 0 ? pages.get(s.pages[i - 1]) : null; const max = prev ? Math.min(2, prev.lvl + 1) : 0; p.lvl = clamp(p.lvl + d, 0, max); await writePage(p); emit('pages', p.sec); }

  /* ---------- attachments ---------- */
  async function putBlob(blob, secId, name){ const id = uid(); const s = secs.get(secId); const rec = {id, sec: secId, type: blob.type || 'application/octet-stream', name: name || blob.name || 'file', size: blob.size};
    if (s && s.lock && keys.has(secId)){ const r = await Crypt.encBytes(keys.get(secId), await blob.arrayBuffer()); rec.enc = {iv: r.iv, ct: r.ct}; } else rec.data = blob;
    await DB.put('blob', rec); urls.set(id, URL.createObjectURL(blob)); return id; }
  async function getBlob(id){ const rec = await DB.get('blob', id); if (!rec) return null; if (rec.enc){ const k = keys.get(rec.sec); if (!k) return null; const b = await Crypt.decBytes(k, rec.enc); return {rec, blob: new Blob([b], {type: rec.type})}; } return {rec, blob: rec.data instanceof Blob ? rec.data : new Blob([rec.data], {type: rec.type})}; }
  async function blobURL(id){ if (urls.has(id)) return urls.get(id); const r = await getBlob(id); if (!r) return ''; const u = URL.createObjectURL(r.blob); urls.set(id, u); return u; }
  async function rehomeBlobs(p, fromSec, toSec){ const from = secs.get(fromSec), to = secs.get(toSec); const needs = (from && from.lock) || (to && to.lock); if (!needs) return; const map = {};
    for (const id of blobRefs(p)){ const r = await getBlob(id); if (!r) continue; map[id] = await putBlob(r.blob, toSec, r.rec.name); }
    for (const it of p.items || []) it.html = String(it.html || '').replace(/data-blob="([^"]+)"/g, (m, id) => map[id] ? `data-blob="${map[id]}"` : m); }

  /* ---------- section passwords ---------- */
  async function setPassword(secId, pw){ const s = secs.get(secId); if (!s || s.lock) return; const salt = Crypt.salt(); const k = await Crypt.key(pw, salt); s.lock = {salt, check: await Crypt.encJSON(k, 'srk-notes')}; keys.set(secId, k);
    for (const p of pagesOf(secId)){ for (const id of blobRefs(p)){ const rec = await DB.get('blob', id); if (rec && !rec.enc && rec.data){ const r = await Crypt.encBytes(k, await (rec.data instanceof Blob ? rec.data : new Blob([rec.data])).arrayBuffer()); rec.enc = {iv: r.iv, ct: r.ct}; delete rec.data; rec.sec = secId; await DB.put('blob', rec); } }
      await writePage(p); for (const v of await versions(p.id)) await DB.del('ver', v.id); }
    await DB.put('sec', s); emit('nav'); }
  async function unlock(secId, pw){ const s = secs.get(secId); if (!s || !s.lock) return true; let k; try { k = await Crypt.key(pw, s.lock.salt); await Crypt.decJSON(k, s.lock.check); } catch(e){ return false; }
    keys.set(secId, k); for (const id of s.pages){ const rec = encPages.get(id); if (!rec) continue; try { const p = await Crypt.decJSON(k, rec.enc); pages.set(p.id, p); } catch(e){ console.warn('page', id, e); } } emit('nav'); emit('pages', secId); return true; }
  function lock(secId){ const s = secs.get(secId); if (!s || !s.lock) return; for (const id of s.pages){ const t = saveTimers.get(id); if (t){ clearTimeout(t); saveTimers.delete(id); const p = pages.get(id); if (p) writePage(p); } } setTimeout(() => { for (const id of s.pages) pages.delete(id); keys.delete(secId); emit('nav'); emit('pages', secId); emit('locked', secId); }, 50); }
  function lockAll(){ for (const s of secs.values()) if (s.lock && keys.has(s.id)) lock(s.id); }
  async function removePassword(secId){ const s = secs.get(secId); if (!s || !s.lock || !keys.has(secId)) return; const k = keys.get(secId);
    for (const p of pagesOf(secId)) for (const id of blobRefs(p)){ const rec = await DB.get('blob', id); if (rec && rec.enc){ const b = await Crypt.decBytes(k, rec.enc); rec.data = new Blob([b], {type: rec.type}); delete rec.enc; await DB.put('blob', rec); } }
    delete s.lock; keys.delete(secId); await DB.put('sec', s); for (const p of pagesOf(secId)){ encPages.delete(p.id); await DB.put('page', p); } emit('nav'); }
  async function changePassword(secId, pw){ const s = secs.get(secId); if (!s || !keys.has(secId)) return; await removePassword(secId); await setPassword(secId, pw); }

  /* ---------- recycle bin ---------- */
  const trash = async () => (await DB.all('trash')).sort((a, b) => b.t - a.t);
  async function restore(id){ const x = await DB.get('trash', id); if (!x) return null; let goTo = null;
    if (x.kind === 'page'){ let s = secs.get(x.data.page.sec); if (!s){ const nb = notebook(x.nb) || nbs[0]; s = sectionsOf(nb.id).find(y => y.name === 'Restored pages') || await addSection(nb.id, 'Restored pages'); x.data.page.sec = s.id; }
      const rec = x.data.page; if (rec.enc){ if (!s.lock){ /* section lost its password: keep page locked data out */ } encPages.set(rec.id, rec); if (keys.has(s.id)) pages.set(rec.id, await Crypt.decJSON(keys.get(s.id), rec.enc)); } else pages.set(rec.id, rec); s.pages.push(rec.id); await DB.put('page', rec); await DB.put('sec', s); goTo = {sec: s.id, page: rec.id}; }
    else if (x.kind === 'section'){ const sec = x.data.sec; let nb = notebook(sec.nb) || notebook(x.nb) || nbs[0]; if (!nb) nb = await addNotebook('Restored'); sec.nb = nb.id; sec.pages = x.data.pages.map(p => p.id); secs.set(sec.id, sec); nb.sections.push(sec.id); for (const p of x.data.pages){ if (p.enc) encPages.set(p.id, p); else pages.set(p.id, p); await DB.put('page', p); } await DB.put('sec', sec); await DB.put('nb', nb); goTo = {sec: sec.id}; }
    else if (x.kind === 'notebook'){ const nb = {...x.data.nb, sections: [], order: nbs.length}; nbs.push(nb); await DB.put('nb', nb); goTo = {nb: nb.id}; }
    await DB.del('trash', id); emit('nav'); return goTo; }
  async function purge(id){ const x = await DB.get('trash', id); if (!x) return; const recs = x.kind === 'page' ? [x.data.page] : x.kind === 'section' ? x.data.pages : []; const live = new Set(); for (const p of pages.values()) for (const b of blobRefs(p)) live.add(b);
    for (const r of recs){ if (r.enc) continue; for (const b of blobRefs(r)) if (!live.has(b)) await DB.del('blob', b); for (const v of await versions(r.id)) await DB.del('ver', v.id); } await DB.del('trash', id); }
  async function emptyTrash(){ for (const x of await trash()) await purge(x.id); }

  /* ---------- search & tags ---------- */
  function search(q){ q = String(q || '').trim().toLowerCase(); if (!q) return []; const words = q.split(/\s+/); const out = [];
    for (const p of allPages()){ const t = pageText(p); const low = t.toLowerCase(); if (!words.every(w => low.includes(w))) continue; const i = low.indexOf(words[0]); const snip = t.slice(Math.max(0, i - 40), i + 120).replace(/\s+/g, ' ').trim(); const s = secs.get(p.sec);
      out.push({p, sec: s, nb: nbOfSec(p.sec), snip, score: (String(p.title).toLowerCase().includes(q) ? 10 : 0) + words.reduce((a, w) => a + low.split(w).length - 1, 0), t: p.modified}); }
    return out.sort((a, b) => b.score - a.score || b.t - a.t).slice(0, 200); }
  function tags(){ const out = []; const d = document.createElement('div');
    for (const p of allPages()) for (const it of p.items || []){ if (!/class="tag/.test(it.html || '')) continue; d.innerHTML = it.html; for (const t of d.querySelectorAll('.tag')){ const blk = t.closest('p,li,div:not(.ncb),h1,h2,h3,h4,blockquote,td') || t.parentElement; out.push({k: t.dataset.tag, done: t.classList.contains('done'), text: (blk ? blk.textContent : '').trim() || '(no text)', p, sec: secs.get(p.sec), nb: nbOfSec(p.sec)}); } }
    return out; }
  async function recent(){ const m = await DB.get('meta', 'recent'); return (m && m.list || []).map(id => pages.get(id)).filter(Boolean); }
  async function opened(pid){ const m = (await DB.get('meta', 'recent')) || {id: 'recent', list: []}; m.list = [pid, ...m.list.filter(x => x !== pid)].slice(0, 20); await DB.put('meta', m); }
  const getMeta = async (k, d) => { const m = await DB.get('meta', k); return m ? m.v : d; }, setMeta = (k, v) => DB.put('meta', {id: k, v});

  return {load, on: f => listeners.add(f), emit, notebooks, notebook, section, sectionsOf, pagesOf, page, allPages, isLocked, nbOfSec, addNotebook, saveNb, addSection, saveSec, moveSection, deleteSection, deleteNotebook,
    addPage, touch, flush, writePage, deletePage, movePage, reorder, setLevel, versions, restoreVersion, putBlob, getBlob, blobURL, blobRefs, setPassword, unlock, lock, lockAll, removePassword, changePassword, hasKey: id => keys.has(id),
    trash, restore, purge, emptyTrash, search, tags, recent, opened, pageText, getMeta, setMeta, encPages: () => encPages, secsMap: () => secs};
})();
