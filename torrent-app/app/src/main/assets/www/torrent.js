/* SRK Torrent — the screen. Talks to the torrent engine through window.SRKTorrent; engine events arrive at window.__torrentEvent. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a)) { if (v == null || v === false) continue; if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    logo: S('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
    more: S('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'), x: S('<path d="M6 6l12 12M18 6L6 18"/>'), back: S('<path d="M15 5l-7 7 7 7"/>'),
    down: S('<path d="M12 5v13M6 13l6 6 6-6"/>'), up: S('<path d="M12 19V6M6 11l6-6 6 6"/>'),
    pause: S('<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>'), play: S('<path d="M8 5v14l11-7z"/>'),
    check: S('<path d="M5 12.5l4.5 4.5L19 7"/>'), clock: S('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'), warn: S('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
    search: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'), magnet: S('<path d="M5 4h4v8a3 3 0 006 0V4h4v8a7 7 0 01-14 0z"/><path d="M5 8h4M15 8h4"/>'),
    file: S('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'), folder: S('<path d="M3 6h6l2 2h10v11H3z"/>'), open: S('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
    copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'), trash: S('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    create: S('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>'), refresh: S('<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>'),
    peers: S('<circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19a5 5 0 0110 0M14 19a4 4 0 017 0"/>'), order: S('<path d="M4 6h10M4 12h10M4 18h10M18 5v14M15 16l3 3 3-3"/>'),
    bolt: S('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'), link: S('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
    save: S('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'), qup: S('<path d="M12 19V5M5 12l7-7 7 7"/>'), qdown: S('<path d="M12 5v14M5 12l7 7 7-7"/>'),
    move: S('<path d="M3 6h6l2 2h10v11H3z"/><path d="M10 13h6M13 10l3 3-3 3"/>'), theme: S('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'), limit: S('<path d="M4 18a8 8 0 1116 0"/><path d="M12 14l4-5"/>'), info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  };
  const B = window.SRKTorrent;
  const store = { get: (k, d) => { try { const v = localStorage.getItem('srk-torrent-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('srk-torrent-' + k, JSON.stringify(v)); } catch (e) { } } };
  const st = { list: [], rates: { dl: 0, ul: 0, dht: 0 }, settings: {}, filter: store.get('filter', 'all'), q: '', sort: store.get('sort', { k: 'added', d: -1 }), sel: null, details: null, tab: 'general', inspect: null, started: false };
  const call = (fn, ...a) => { try { if (B && typeof B[fn] === 'function') return B[fn](...a); } catch (e) { toast(String(e.message || e)); } };
  const WIN = !!window.SRK_WINDOWS, platform = () => st.settings.platform || (WIN ? 'windows' : 'android');

  /* ---------- formatting ---------- */
  const size = n => { n = +n || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(n < 104857600 ? 1 : 0) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; };
  const speed = n => (+n || 0) < 1024 ? ((+n || 0) ? (+n).toFixed(0) + ' B/s' : '0 B/s') : size(n) + '/s';
  const eta = s => { if (s == null || s < 0 || !isFinite(s)) return '∞'; if (s < 60) return Math.max(1, Math.round(s)) + 's'; if (s < 3600) return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's'; if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm'; const d = Math.floor(s / 86400); return d > 99 ? '∞' : d + 'd ' + Math.round((s % 86400) / 3600) + 'h'; };
  const pct = p => { const v = Math.max(0, Math.min(1, +p || 0)) * 100; return (v >= 99.95 ? '100' : v < 10 ? v.toFixed(1) : v.toFixed(1)) + '%'; };
  const date = t => t > 0 ? new Date(t * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const STATE = { downloading: 'Downloading', metadata: 'Getting details', seeding: 'Seeding', done: 'Finished', paused: 'Paused', queued: 'Queued', checking: 'Checking', moving: 'Moving', error: 'Error', waiting: 'Waiting for Wi-Fi' };
  const stateIcon = s => ({ downloading: IC.down, metadata: IC.magnet, seeding: IC.up, done: IC.check, paused: IC.pause, queued: IC.clock, checking: IC.refresh, moving: IC.move, error: IC.warn, waiting: IC.clock })[s] || IC.down;
  const stalled = t => t.state === 'downloading' && !t.dl && t.peers + t.seeds === 0;
  const stateText = t => stalled(t) ? 'Looking for peers' : (STATE[t.state] || t.state);
  const isActive = t => ['downloading', 'metadata', 'seeding', 'checking', 'moving'].includes(t.state);

  /* ---------- small UI pieces ---------- */
  let toastT; function toast(m, action, ms = 3200) { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, m)); if (action) { const b = h('button', { type: 'button' }, action[0]); b.addEventListener('click', () => { t.remove(); action[1](); }); t.append(b); } document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), action ? ms + 2500 : ms); }
  function dialog(title, body, buttons, opts = {}) { return new Promise(res => { const sc = h('div', { class: 'scrim' }); const df = h('div', { class: 'df' }); const close = v => { sc.remove(); document.removeEventListener('keydown', key); if (opts.onClose) opts.onClose(v); res(v); };
    for (const [label, cls, fn] of buttons) { const b = h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button' }, label); b.addEventListener('click', () => { const r = fn ? fn() : label; if (r !== false) close(r); }); df.append(b); }
    const key = e => { if (e.key === 'Escape') close(null); }; document.addEventListener('keydown', key);
    const d = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', {}, title), h('div', { class: 'db' }, body), df); if (opts.wide) d.style.width = 'min(620px,100%)';
    sc.append(d); sc.addEventListener('pointerdown', e => { if (e.target === sc) close(null); }); document.body.append(sc); const f = d.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 30); if (opts.onOpen) opts.onOpen(d, close); }); }
  function menu(anchor, items, at) { document.querySelectorAll('.menu').forEach(m => m.remove()); const m = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) { if (!it) continue; if (it === '-') { m.append(h('div', { class: 'msep' })); continue; } const b = h('button', { class: 'mi' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', html: (it.icon || '') + `<span>${esc(it.text)}</span>` }); b.addEventListener('click', () => { m.remove(); it.fn(); }); m.append(b); }
    document.body.append(m); let x, y; if (at) { x = at.x; y = at.y; } else { const r = anchor.getBoundingClientRect(); x = r.right - m.offsetWidth; y = r.bottom + 4; }
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, x)) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, y)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0); }
  const field = (label, input, hint) => h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
  const check = (label, on, attrs = {}) => { const i = h('input', Object.assign({ type: 'checkbox' }, attrs)); i.checked = !!on; return [h('label', { class: 'chk' }, i, h('span', {}, label)), i]; };

  /* ---------- header + toolbar ---------- */
  $('#logo').innerHTML = IC.logo; $('#moreBtn').innerHTML = IC.more; $('#addBtn').innerHTML = IC.plus + '<span>Add</span>';
  $('#addBtn').addEventListener('click', e => addMenu(e.currentTarget));
  $('#moreBtn').addEventListener('click', e => menu(e.currentTarget, [
    { text: 'Resume all', icon: IC.play, fn: () => call('resumeAll') }, { text: 'Pause all', icon: IC.pause, fn: () => call('pauseAll') }, '-',
    { text: 'Create a torrent…', icon: IC.create, fn: createDlg }, { text: 'Open download folder', icon: IC.folder, fn: () => call('openDownloads') }, '-',
    { text: 'Settings', icon: IC.gear, fn: settingsDlg }, { text: 'Theme: ' + ({ light: 'Light', dark: 'Dark' }[store.get('theme', '')] || 'Automatic'), icon: IC.theme, fn: cycleTheme }, { text: 'About SRK Torrent', icon: IC.info, fn: aboutDlg }, platform() === 'android' ? '-' : null, platform() === 'android' ? { text: 'Quit (stop downloading and seeding)', icon: IC.x, fn: () => call('quit') } : null]));
  function addMenu(anchor) { menu(anchor, [{ text: 'Magnet link…', icon: IC.magnet, fn: () => magnetDlg('') }, { text: 'Torrent file…', icon: IC.file, fn: () => call('pickTorrent') }, '-', { text: 'Create a torrent…', icon: IC.create, fn: createDlg }]); }
  const sb = $('#searchBox'); sb.innerHTML = IC.search; const si = h('input', { class: 'inp', type: 'search', placeholder: 'Search torrents', 'aria-label': 'Search torrents' }); si.addEventListener('input', () => { st.q = si.value.trim().toLowerCase(); render(); }); sb.append(si);
  const applyTheme = () => { const t = store.get('theme', ''); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }; applyTheme();
  function cycleTheme() { const t = store.get('theme', ''); store.set('theme', t === '' ? 'dark' : t === 'dark' ? 'light' : ''); applyTheme(); }

  const FILTERS = [['all', 'All', () => true], ['downloading', 'Downloading', t => ['downloading', 'metadata', 'queued', 'checking', 'waiting'].includes(t.state) || (t.state === 'paused' && t.progress < 1)], ['seeding', 'Seeding', t => t.state === 'seeding'], ['done', 'Completed', t => t.progress >= 1 && t.metadata], ['active', 'Active', t => t.dl > 0 || t.ul > 0], ['paused', 'Paused', t => t.state === 'paused' || t.state === 'done' || t.state === 'queued']];
  function renderTabs() { const tabs = $('#tabs'); tabs.innerHTML = ''; for (const [k, label, fn] of FILTERS) { const n = st.list.filter(fn).length; const b = h('button', { class: 'tab' + (st.filter === k ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(st.filter === k) }, label, h('small', {}, n)); b.addEventListener('click', () => { st.filter = k; store.set('filter', k); render(); }); tabs.append(b); } }

  const COLS = [['', 'state', ''], ['Name', 'name', ''], ['Size', 'size', 'r'], ['Done', 'progress', ''], ['Status', 'state', ''], ['Down', 'dl', 'r'], ['Up', 'ul', 'r'], ['ETA', 'eta', 'r'], ['Seeds', 'seeds', 'r'], ['Ratio', 'ratio', 'r'], ['', '', '']];
  function renderHead() { const th = $('#thead'); th.innerHTML = ''; for (const [label, k, cls] of COLS) { const s = h('span', { class: cls + (k && st.sort.k === k && label ? ' on' : ''), title: label ? 'Sort by ' + label : null }, label + (k && st.sort.k === k && label ? (st.sort.d > 0 ? ' ▲' : ' ▼') : '')); if (label) s.addEventListener('click', () => { st.sort = { k, d: st.sort.k === k ? -st.sort.d : (k === 'name' ? 1 : -1) }; store.set('sort', st.sort); render(); }); th.append(s); } }

  /* ---------- the list ---------- */
  const rows = new Map();
  function sorted() { const f = (FILTERS.find(x => x[0] === st.filter) || FILTERS[0])[2]; let l = st.list.filter(f); if (st.q) l = l.filter(t => String(t.name).toLowerCase().includes(st.q));
    const { k, d } = st.sort; return l.sort((a, b) => { let x = a[k], y = b[k]; if (k === 'eta') { x = x < 0 ? 1e15 : x; y = y < 0 ? 1e15 : y; } if (typeof x === 'string') return d * x.localeCompare(y); return d * ((+x || 0) - (+y || 0)) || (b.added - a.added); }); }
  function rowEl(t) { let r = rows.get(t.id); if (!r) { r = h('div', { class: 'row', 'data-id': t.id, tabindex: '0' }); r.addEventListener('click', e => { if (e.target.closest('.act')) return; select(t.id); }); r.addEventListener('dblclick', e => { if (!e.target.closest('.act')) openT(rows.get(t.id).t); }); r.addEventListener('contextmenu', e => { e.preventDefault(); select(t.id, true); rowMenu(r.t, null, { x: e.clientX, y: e.clientY }); }); r.addEventListener('keydown', e => { if (e.key === 'Enter') select(t.id); if (e.key === 'Delete') removeDlg(r.t); });
      let pressT; r.addEventListener('touchstart', e => { pressT = setTimeout(() => { const tt = e.touches[0]; rowMenu(r.t, null, { x: tt.clientX, y: tt.clientY }); }, 550); }, { passive: true }); r.addEventListener('touchend', () => clearTimeout(pressT)); r.addEventListener('touchmove', () => clearTimeout(pressT), { passive: true });
      rows.set(t.id, r); }
    r.t = t; const wide = innerWidth >= 980; r.className = 'row s-' + t.state + (wide ? ' wide' : '') + (st.sel === t.id ? ' sel' : '');
    const p = Math.max(0, Math.min(1, t.progress || 0)), paused = ['paused', 'done', 'queued'].includes(t.state);
    const speedTxt = (t.dl ? `<span class="d">↓ ${speed(t.dl)}</span>` : '') + (t.ul ? ` <span class="u">↑ ${speed(t.ul)}</span>` : '');
    let meta;
    if (t.state === 'error') meta = `<span class="w">${esc(t.error || 'Error')}</span>`;
    else if (t.state === 'metadata') meta = `Getting torrent details from peers… · ${t.peers + t.seeds} peers`;
    else if (t.state === 'downloading') meta = `<b>${pct(p)}</b> · ${size(t.done)} of ${size(t.size)} · ${speedTxt || stateText(t)}${t.dl ? ' · ' + eta(t.eta) + ' left' : ''} · ${t.seeds}/${t.seedsTotal} seeds`;
    else if (t.state === 'seeding') meta = `Seeding · ${size(t.size)} ${speedTxt ? '· ' + speedTxt : ''} · ratio ${(+t.ratio || 0).toFixed(2)} · ${t.peers} peers`;
    else meta = `${stateText(t)} · ${p >= 1 ? size(t.size) : pct(p) + ' of ' + size(t.size)}${t.ratio ? ' · ratio ' + (+t.ratio).toFixed(2) : ''}`;
    r.innerHTML = `<span class="st" title="${esc(stateText(t))}">${stateIcon(t.state)}</span><span class="nm" title="${esc(t.name)}">${esc(t.name)}</span>`
      + `<span class="act"><button class="ib sm" data-a="toggle" type="button" title="${paused ? 'Resume' : 'Pause'}" aria-label="${paused ? 'Resume' : 'Pause'}">${paused ? IC.play : IC.pause}</button><button class="ib sm" data-a="more" type="button" title="More" aria-label="More actions">${IC.more}</button></span>`
      + `<div class="pbar"><i style="width:${(p * 100).toFixed(2)}%"></i></div><span class="meta">${meta}</span>`
      + `<span class="cols"><span class="r">${t.size ? size(t.size) : '—'}</span><span class="prog"><div class="pbar"><i style="width:${(p * 100).toFixed(2)}%"></i></div><em>${pct(p)}</em></span><span class="stt">${esc(stateText(t))}</span>`
      + `<span class="r d">${t.dl ? speed(t.dl) : ''}</span><span class="r u">${t.ul ? speed(t.ul) : ''}</span><span class="r">${t.state === 'downloading' && t.dl ? eta(t.eta) : ''}</span><span class="r">${t.seeds} (${t.seedsTotal})</span><span class="r">${(+t.ratio || 0).toFixed(2)}</span></span>`;
    if (wide) { const act = r.querySelector('.act'); r.append(act); }
    r.querySelector('[data-a="toggle"]').addEventListener('click', () => paused ? call('resume', t.id) : call('pause', t.id));
    r.querySelector('[data-a="more"]').addEventListener('click', e => rowMenu(t, e.currentTarget));
    return r; }
  function render() {
    renderTabs(); renderHead();
    const list = $('#list'), l = sorted(), seen = new Set();
    l.forEach((t, i) => { const r = rowEl(t); seen.add(t.id); if (list.children[i] !== r) list.insertBefore(r, list.children[i] || null); });
    for (const [id, r] of rows) if (!seen.has(id)) { r.remove(); if (!st.list.find(t => t.id === id)) rows.delete(id); }
    const empty = $('#emptyBox'); empty.innerHTML = '';
    $('#thead').hidden = !l.length; list.hidden = !l.length;
    if (!st.list.length && st.started) empty.append(h('div', { class: 'empty' }, h('div', { class: 'big', html: IC.logo }), h('h3', {}, 'No torrents yet'), h('p', {}, 'Paste a magnet link or open a .torrent file to start downloading. You can also share your own files by creating a torrent.'),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', type: 'button', onclick: () => magnetDlg(''), html: IC.magnet + '<span>Magnet link</span>' }), h('button', { class: 'btn', type: 'button', onclick: () => call('pickTorrent'), html: IC.file + '<span>Torrent file</span>' }), h('button', { class: 'btn', type: 'button', onclick: createDlg, html: IC.create + '<span>Create</span>' })),
      h('p', { class: 'legal' }, 'Download and share only files you have the right to — your own work, free and open content, or files the owner has shared publicly.')));
    else if (!l.length && st.list.length) empty.append(h('div', { class: 'empty' }, h('p', {}, st.q ? 'No torrents match “' + st.q + '”.' : 'Nothing here right now.')));
    const r = st.rates; $('#rates').innerHTML = `<span class="d">${IC.down}${speed(r.dl)}</span><span class="u">${IC.up}${speed(r.ul)}</span><span class="x">${st.list.length} torrent${st.list.length === 1 ? '' : 's'}</span><span class="x">DHT ${r.dht || 0}</span>`;
    const bn = $('#banner'); if (!r.paused && st.noAccess) { bn.hidden = false; bn.innerHTML = ''; bn.append(h('span', {}, 'Allow “All files access” so downloads are saved in Downloads › SRK Torrent, where every app can open them.'), h('button', { class: 'btn sm', type: 'button', onclick: () => call('allFilesAccess') }, 'Allow')); } else if (r.paused) { bn.hidden = false; bn.innerHTML = ''; bn.append(h('span', {}, 'Paused — you’re on mobile data and “Wi-Fi only” is on.'), h('button', { class: 'btn sm', type: 'button', onclick: () => call('setSettings', JSON.stringify({ wifiOnly: false })) }, 'Use mobile data')); } else bn.hidden = true;
  }
  addEventListener('resize', () => { clearTimeout(render.t); render.t = setTimeout(render, 120); });

  /* ---------- row actions ---------- */
  function rowMenu(t, anchor, at) {
    const paused = ['paused', 'done', 'queued'].includes(t.state), done = t.progress >= 1 && t.metadata;
    menu(anchor, [
      paused ? { text: 'Resume', icon: IC.play, fn: () => call('resume', t.id) } : { text: 'Pause', icon: IC.pause, fn: () => call('pause', t.id) },
      (paused || t.state === 'queued') && !done ? { text: 'Force start (skip the queue)', icon: IC.bolt, fn: () => call('forceStart', t.id) } : null, '-',
      { text: done ? 'Open' : 'Open folder', icon: IC.open, fn: () => openT(t) },
      WIN ? { text: 'Show in folder', icon: IC.folder, fn: () => call('showInFolder', t.id, -1) } : null,
      { text: 'Copy magnet link', icon: IC.link, fn: () => { call('copyMagnet', t.id); toast('Magnet link copied'); } },
      t.metadata ? { text: 'Save .torrent file', icon: IC.save, fn: () => call('exportTorrent', t.id) } : null, '-',
      !done ? { text: (t.sequential ? '✓ ' : '') + 'Download in order (watch while downloading)', icon: IC.order, fn: () => { call('setSequential', t.id, !t.sequential); toast(t.sequential ? 'Normal order' : 'Downloading in order — you can start watching early'); } } : null,
      { text: 'Ask for more peers', icon: IC.peers, fn: () => call('reannounce', t.id) },
      { text: 'Speed limit for this torrent…', icon: IC.limit, fn: () => limitDlg(t) },
      { text: 'Check files', icon: IC.refresh, fn: () => call('recheck', t.id) },
      WIN ? { text: 'Move files to…', icon: IC.move, fn: () => { st.pendingMove = t.id; call('chooseFolder', 'move'); } } : null,
      !done ? { text: 'Move up in queue', icon: IC.qup, fn: () => call('queue', t.id, 'up') } : null, !done ? { text: 'Move down in queue', icon: IC.qdown, fn: () => call('queue', t.id, 'down') } : null, '-',
      { text: 'Details', icon: IC.info, fn: () => select(t.id) }, { text: 'Remove…', icon: IC.trash, danger: true, fn: () => removeDlg(t) }], at);
  }
  function openT(t) { if (!t) return; call('open', t.id, -1); }
  async function removeDlg(t) {
    const [lab, box] = check('Also delete the downloaded files', false);
    const r = await dialog('Remove torrent?', [h('div', { class: 'sum' }, h('div', {}, h('b', {}, t.name), h('small', {}, size(t.size) + ' · ' + stateText(t)))), lab, h('p', { class: 'hint' }, 'Without the tick, the files stay in your download folder.')],
      [['Cancel', '', () => null], ['Remove', 'dangerfill', () => box.checked ? 'del' : 'keep']]);
    if (!r) return; call('remove', t.id, r === 'del'); if (st.sel === t.id) closeDetails();
  }
  async function limitDlg(t) {
    const d = st.details && st.details.id === t.id ? st.details : {};
    const dl = h('input', { class: 'inp', type: 'number', min: '0', inputmode: 'numeric', value: d.dlLimit || 0 }), ul = h('input', { class: 'inp', type: 'number', min: '0', inputmode: 'numeric', value: d.ulLimit || 0 });
    const r = await dialog('Speed limit', [h('p', { class: 'hint' }, t.name), h('div', { class: 'two' }, field('Download (KB/s)', dl), field('Upload (KB/s)', ul)), h('p', { class: 'hint' }, '0 means no limit.')], [['Cancel', '', () => null], ['Save', 'primary', () => true]]);
    if (r) { call('setLimits', t.id, Math.max(0, +dl.value | 0), Math.max(0, +ul.value | 0)); toast('Speed limit saved'); }
  }

  /* ---------- add: magnet ---------- */
  async function magnetDlg(prefill) {
    const ta = h('textarea', { class: 'inp', placeholder: 'magnet:?xt=urn:btih:…', autofocus: true, spellcheck: 'false', 'aria-label': 'Magnet link' }); ta.value = prefill || '';
    const [l1, seq] = check('Download in order (to watch a video while it downloads)', false); const [l2, start] = check('Start downloading now', true);
    const paste = h('button', { class: 'btn sm', type: 'button', onclick: () => { st.pasteTo = ta; call('paste'); } }, 'Paste');
    const r = await dialog('Add magnet link', [field('Magnet link — one per line for several', ta), h('div', { class: 'row-actions', style: 'display:flex;gap:8px' }, paste), l1, l2, h('p', { class: 'hint' }, 'Saved to ' + (st.settings.savePath || 'your download folder'))],
      [['Cancel', '', () => null], ['Add', 'primary', () => ta.value.trim() ? true : (toast('Paste a magnet link first'), false)]]);
    st.pasteTo = null; if (!r) return;
    const links = ta.value.split(/\s+/).map(s => s.trim()).filter(Boolean); const opts = JSON.stringify({ sequential: seq.checked, start: start.checked });
    for (const u of links) call('addMagnet', u, opts);
  }

  /* ---------- add: .torrent (after the engine has read it) ---------- */
  async function inspectDlg(info) {
    if (st.inspect) return; st.inspect = info;
    const files = info.files || []; const boxes = [];
    const fl = h('div', { class: 'flist' });
    const total = () => files.reduce((a, f, i) => a + (boxes[i].checked ? f.size : 0), 0);
    const sumLine = h('small', {});
    const upd = () => { sumLine.textContent = `${boxes.filter(b => b.checked).length} of ${files.length} files · ${size(total())}`; };
    files.forEach((f, i) => { const b = h('input', { type: 'checkbox' }); b.checked = true; b.addEventListener('change', upd); boxes.push(b); fl.append(h('label', { class: 'fl', title: f.path }, b, h('span', {}, f.path), h('small', {}, size(f.size)))); });
    const all = h('button', { class: 'btn sm', type: 'button', onclick: () => { const on = boxes.some(b => !b.checked); boxes.forEach(b => b.checked = on); upd(); } }, 'All / none');
    let savePath = info.savePath || st.settings.savePath || ''; const pathCode = h('code', { title: savePath }, savePath);
    const change = WIN ? h('button', { class: 'btn sm', type: 'button', onclick: () => { st.folderTarget = p => { savePath = p; pathCode.textContent = p; pathCode.title = p; }; call('chooseFolder', 'add'); } }, 'Change') : null;
    const [l1, seq] = check('Download in order (to watch a video while it downloads)', false); const [l2, start] = check('Start downloading now', true);
    upd();
    const r = await dialog('Add torrent', [
      h('div', { class: 'sum' }, h('div', {}, h('b', {}, info.name), sumLine)),
      info.exists ? h('p', { class: 'hint bad' }, 'This torrent is already in your list.') : null,
      files.length > 1 ? h('div', { style: 'display:flex;align-items:center;gap:8px' }, h('span', { class: 'hint', style: 'flex:1' }, 'Untick the files you don’t want'), all) : null,
      files.length > 1 ? fl : null,
      field('Save to', h('div', { class: 'path' }, pathCode, change)), l1, l2,
      info.comment ? h('p', { class: 'hint' }, 'Comment: ' + info.comment) : null],
      [['Cancel', '', () => null], ['Add', 'primary', () => boxes.some(b => b.checked) || files.length <= 1 ? true : (toast('Pick at least one file'), false)]], { wide: true });
    st.inspect = null; st.folderTarget = null;
    if (!r) { call('unstage', info.token); return; }
    const skip = files.map((f, i) => boxes[i].checked ? null : f.i).filter(x => x != null);
    call('addStaged', info.token, JSON.stringify({ skip, sequential: seq.checked, start: start.checked, savePath }));
  }

  /* ---------- create a torrent ---------- */
  const DEFAULT_TRACKERS = ['udp://tracker.opentrackr.org:1337/announce', 'udp://open.stealth.si:80/announce', 'udp://tracker.torrent.eu.org:451/announce', 'udp://exodus.desync.com:6969/announce'].join('\n');
  async function createDlg() {
    st.createSrc = null;
    const srcBox = h('div', { class: 'sum' }, h('div', {}, h('b', {}, 'Nothing chosen yet'), h('small', {}, 'Pick the file or folder you want to share')));
    const pickF = h('button', { class: 'btn sm', type: 'button', onclick: () => call('createPick', 'file'), html: IC.file + '<span>File</span>' }), pickD = h('button', { class: 'btn sm', type: 'button', onclick: () => call('createPick', 'folder'), html: IC.folder + '<span>Folder</span>' });
    const tr = h('textarea', { class: 'inp', spellcheck: 'false' }); tr.value = store.get('trackers', DEFAULT_TRACKERS);
    const cm = h('input', { class: 'inp', placeholder: 'Optional' }); const [lp, priv] = check('Private (only these trackers, no DHT)', false);
    st.onCreateSrc = s => { st.createSrc = s; srcBox.innerHTML = ''; srcBox.append(h('div', {}, h('b', {}, s.name), h('small', {}, size(s.size) + (s.copied ? ' · copied to SRK Torrent/Shared' : '')))); };
    const r = await dialog('Create a torrent', [h('p', { class: 'hint' }, 'Share your own files with anyone who has a BitTorrent app. SRK Torrent makes the .torrent file and a magnet link, then seeds it from this device.'), srcBox, h('div', { style: 'display:flex;gap:8px' }, pickF, pickD), field('Trackers (one per line)', tr), field('Comment', cm), lp],
      [['Cancel', '', () => null], ['Create', 'primary', () => st.createSrc ? true : (toast('Choose a file or folder first'), false)]], { wide: true });
    st.onCreateSrc = null; if (!r) return; store.set('trackers', tr.value);
    call('create', st.createSrc.path, tr.value, cm.value, priv.checked); toast('Creating the torrent…');
  }
  async function createdDlg(ev) {
    if (ev.error) return;
    const box = h('div', { class: 'addr', style: 'font-family:var(--f-mono);font-size:12px;background:var(--bg);border-radius:10px;padding:10px;word-break:break-all;user-select:all' }, ev.magnet);
    await dialog('Torrent created', [h('div', { class: 'sum' }, h('div', {}, h('b', {}, ev.name), h('small', {}, 'Now seeding from this device'))), h('p', { class: 'hint' }, 'Send the magnet link (or the .torrent file) to the people you want to share with. Keep SRK Torrent running so they can download from you.'), box, h('p', { class: 'hint' }, '.torrent saved at ' + ev.file)],
      [['Share .torrent file', '', () => { call('shareFile', ev.file); return false; }], ['Copy magnet link', 'primary', () => { call('copy', ev.magnet); toast('Magnet link copied'); return false; }], ['Done', '', () => true]], { wide: true });
  }

  /* ---------- settings ---------- */
  async function settingsDlg() {
    const s = st.settings; const num = (v, min = 0) => h('input', { class: 'inp', type: 'number', min: String(min), inputmode: 'numeric', value: v ?? 0 });
    const dl = num(s.dlLimit), ul = num(s.ulLimit), md = num(s.maxDownloads), ms = num(s.maxSeeds), ratio = h('input', { class: 'inp', type: 'number', min: '0', step: '0.1', inputmode: 'decimal', value: s.ratio || 0 }), port = num(s.port, 1), conns = num(s.maxConnections, 20);
    let savePath = s.savePath; const pathCode = h('code', { title: savePath }, savePath);
    const change = WIN ? h('button', { class: 'btn sm', type: 'button', onclick: () => { st.folderTarget = p => { savePath = p; pathCode.textContent = p; }; call('chooseFolder', 'settings'); } }, 'Change') : null;
    const [lSeed, seed] = check('Keep seeding after a download finishes', s.seedWhenDone !== false);
    const [lWifi, wifi] = check('Download only on Wi-Fi', !!s.wifiOnly);
    const [lDht, dht] = check('DHT (find peers without trackers)', s.dht !== false), [lLsd, lsd] = check('Local peer discovery (same Wi-Fi)', s.lsd !== false), [lUp, upnp] = check('UPnP / NAT-PMP port forwarding', s.upnp !== false);
    const enc = h('select', { class: 'inp' }, ...[['prefer', 'Prefer encrypted'], ['require', 'Encrypted only'], ['off', 'Off']].map(([v, l]) => { const o = h('option', { value: v }, l); if ((s.encryption || 'prefer') === v) o.selected = true; return o; }));
    const r = await dialog('Settings', [
      field('Download folder', h('div', { class: 'path' }, pathCode, change), WIN ? null : 'Files go to Downloads › SRK Torrent on your phone.'),
      h('div', { class: 'two' }, field('Download limit (KB/s)', dl), field('Upload limit (KB/s)', ul)), h('p', { class: 'hint', style: 'margin-top:-6px' }, '0 means no limit.'),
      h('div', { class: 'two' }, field('Downloads at a time', md), field('Seeds at a time', ms)),
      field('Stop seeding at ratio', ratio, '0 = never stop. A ratio of 1 means you have uploaded as much as you downloaded.'), lSeed,
      platform() === 'android' ? lWifi : null,
      h('div', { class: 'two' }, field('Listening port', port), field('Max connections', conns)), field('Encryption', enc), lDht, lLsd, lUp],
      [['Cancel', '', () => null], ['Save', 'primary', () => true]], { wide: true });
    if (!r) return;
    call('setSettings', JSON.stringify({ savePath, dlLimit: +dl.value | 0, ulLimit: +ul.value | 0, maxDownloads: +md.value | 0, maxSeeds: +ms.value | 0, ratio: Math.max(0, +ratio.value || 0), seedWhenDone: seed.checked, wifiOnly: wifi.checked, port: Math.max(1, Math.min(65535, +port.value | 0)), maxConnections: Math.max(20, +conns.value | 0), dht: dht.checked, lsd: lsd.checked, upnp: upnp.checked, encryption: enc.value }));
    toast('Settings saved');
  }
  function aboutDlg() { dialog('SRK Torrent', [h('p', {}, 'A BitTorrent app for Android and Windows, built on libtorrent: magnet links, .torrent files, DHT, peer exchange, local discovery, encryption, file selection, download-in-order and torrent creation.'), h('p', { class: 'hint' }, 'Version ' + (st.settings.version || '1.0') + ' · ' + (WIN ? 'Windows' : 'Android')), h('p', { class: 'hint' }, 'Download and share only files you have the right to. Respect copyright and the laws where you live.')], [['Close', 'primary', () => true]]); }

  /* ---------- details panel ---------- */
  const det = $('#details');
  function select(id, quiet) { st.sel = id; for (const [k, r] of rows) r.classList.toggle('sel', k === id); if (quiet) return; if (!st.details || st.details.id !== id) st.details = { id, loading: true }; det.hidden = false; renderDetails(); call('details', id); }
  function closeDetails() { det.hidden = true; st.details = null; st.sel = null; call('closeDetails'); for (const r of rows.values()) r.classList.remove('sel'); }
  addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.scrim') && !det.hidden) closeDetails(); });
  function renderDetails() {
    const d = st.details; if (!d) return; const t = st.list.find(x => x.id === d.id) || {};
    const keep = det.querySelector('.dbody'); const scroll = keep ? keep.scrollTop : 0;
    det.innerHTML = '';
    const back = h('button', { class: 'ib', type: 'button', 'aria-label': 'Close details', title: 'Close', html: innerWidth <= 760 ? IC.back : IC.x, onclick: closeDetails });
    const paused = ['paused', 'done', 'queued'].includes(t.state);
    det.append(h('div', { class: 'dhead' }, back, h('span', { class: 't', title: t.name || d.name }, t.name || d.name || 'Torrent'),
      h('button', { class: 'ib', type: 'button', title: paused ? 'Resume' : 'Pause', 'aria-label': paused ? 'Resume' : 'Pause', html: paused ? IC.play : IC.pause, onclick: () => paused ? call('resume', d.id) : call('pause', d.id) }),
      h('button', { class: 'ib', type: 'button', title: 'More', 'aria-label': 'More', html: IC.more, onclick: e => rowMenu(t, e.currentTarget) })));
    const tabs = h('div', { class: 'dtabs', role: 'tablist' });
    for (const [k, l] of [['general', 'General'], ['files', 'Files' + (d.files ? ' (' + d.files.length + ')' : '')], ['trackers', 'Trackers'], ['peers', 'Peers' + (d.peers ? ' (' + d.peers.length + ')' : '')]]) tabs.append(h('button', { class: 'dtab' + (st.tab === k ? ' on' : ''), type: 'button', role: 'tab', onclick: () => { st.tab = k; renderDetails(); } }, l));
    det.append(tabs);
    const body = h('div', { class: 'dbody' }); det.append(body);
    if (st.tab === 'general') {
      const p = Math.max(0, Math.min(1, t.progress || 0));
      body.append(h('div', { class: 'bigbar' }, h('i', { style: `width:${(p * 100).toFixed(2)}%;background:${t.state === 'seeding' || t.state === 'done' ? 'var(--ul)' : 'var(--dl)'}` })));
      const kv = (k, v, cls) => h('div', { class: 'kv' + (cls ? ' ' + cls : '') }, h('small', {}, k), h('span', { class: cls === 'mono' ? 'mono' : '' }, v));
      body.append(h('div', { class: 'grid' },
        kv('Status', stateText(t)), kv('Progress', pct(p) + (t.size ? ' of ' + size(t.size) : '')), kv('Download speed', speed(t.dl)), kv('Upload speed', speed(t.ul)), kv('Time left', t.state === 'downloading' ? eta(t.eta) : '—'),
        kv('Seeds', `${t.seeds ?? 0} of ${t.seedsTotal ?? 0}`), kv('Peers', `${t.peers ?? 0} of ${t.peersTotal ?? 0}`), kv('Downloaded', size(t.downloaded)), kv('Uploaded', size(t.uploaded)), kv('Share ratio', (+t.ratio || 0).toFixed(3)),
        kv('Added', date(t.added)), kv('Completed', date(t.completed)), d.pieces ? kv('Pieces', `${d.pieces} × ${size(d.pieceSize)}`) : null, kv('Download order', t.sequential ? 'In order' : 'Rarest first'), d.private ? kv('Private torrent', 'Yes') : null,
        h('div', { class: 'kv wide' }, h('small', {}, 'Saved in'), h('span', { class: 'mono' }, d.savePath || t.savePath || '')), h('div', { class: 'kv wide' }, h('small', {}, 'Info hash'), h('span', { class: 'mono' }, d.hash || d.id)),
        t.error ? h('div', { class: 'kv wide' }, h('small', {}, 'Problem'), h('span', { class: 'bad' }, t.error)) : null));
      body.append(h('div', { class: 'dacts', style: 'margin-top:14px' },
        h('button', { class: 'btn sm', type: 'button', onclick: () => openT(t), html: IC.open + '<span>' + (p >= 1 ? 'Open' : 'Open folder') + '</span>' }),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { call('copyMagnet', d.id); toast('Magnet link copied'); }, html: IC.link + '<span>Copy magnet</span>' }),
        p < 1 ? h('button', { class: 'btn sm', type: 'button', onclick: () => call('setSequential', d.id, !t.sequential), html: IC.order + '<span>' + (t.sequential ? 'Normal order' : 'Download in order') + '</span>' }) : null,
        h('button', { class: 'btn sm', type: 'button', onclick: () => limitDlg(t), html: IC.limit + '<span>Speed limit</span>' }),
        h('button', { class: 'btn sm danger', type: 'button', onclick: () => removeDlg(t), html: IC.trash + '<span>Remove</span>' })));
    } else if (st.tab === 'files') {
      if (!d.files || !d.files.length) body.append(h('p', { class: 'hint' }, t.metadata === false ? 'The file list appears once the torrent’s details arrive from peers.' : 'Loading…'));
      else {
        body.append(h('div', { class: 'dacts' }, h('button', { class: 'btn sm', type: 'button', onclick: () => call('setAllFiles', d.id, 4) }, 'Download all'), h('button', { class: 'btn sm', type: 'button', onclick: () => call('setAllFiles', d.id, 0) }, 'Skip all')));
        const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', { class: 'r' }, 'Size'), h('th', {}, 'Done'), h('th', {}, 'Priority'), h('th', {}, ''))));
        const tbody = h('tbody'); tb.append(tbody);
        for (const f of d.files) { const fp = f.size ? f.done / f.size : 1; const sel = h('select', { class: 'prio', 'aria-label': 'Priority for ' + f.path }); for (const [v, l] of [[0, 'Skip'], [1, 'Low'], [4, 'Normal'], [7, 'High']]) { const o = h('option', { value: v }, l); if ((f.prio === 0 ? 0 : f.prio <= 2 ? 1 : f.prio >= 6 ? 7 : 4) === v) o.selected = true; sel.append(o); }
          sel.addEventListener('change', () => call('setFilePriority', d.id, f.i, +sel.value));
          const name = f.path.split(/[\\/]/).pop(), dir = f.path.slice(0, f.path.length - name.length);
          tbody.append(h('tr', { class: f.prio === 0 ? 'skip' : '' }, h('td', { class: 'nm', title: f.path, html: (dir ? `<span class="hint">${esc(dir)}</span>` : '') + esc(name) }), h('td', { class: 'r' }, size(f.size)), h('td', { html: `<span class="mini"><i style="width:${(fp * 100).toFixed(1)}%"></i></span>${pct(fp)}` }), h('td', {}, sel),
            h('td', {}, fp >= 1 ? h('button', { class: 'ib sm', type: 'button', title: 'Open', 'aria-label': 'Open ' + name, html: IC.open, onclick: () => call('open', d.id, f.i) }) : null))); }
        body.append(tb);
      }
    } else if (st.tab === 'trackers') {
      const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tracker'), h('th', {}, 'Status'), h('th', {}, 'Message')))); const tbody = h('tbody'); tb.append(tbody);
      for (const x of d.trackers || []) tbody.append(h('tr', {}, h('td', { class: 'wrap' }, x.special ? h('b', {}, x.url) : x.url), h('td', { class: x.status === 'Working' ? 'ok' : x.status === 'Not working' ? 'bad' : '' }, x.status), h('td', { class: 'wrap hint' }, x.msg || '')));
      const add = h('textarea', { class: 'inp', placeholder: 'udp://tracker.example.org:1337/announce', spellcheck: 'false', style: 'min-height:60px' });
      body.append(tb, h('div', { class: 'field', style: 'margin-top:14px' }, h('label', {}, 'Add trackers (one per line)'), add, h('div', { class: 'dacts', style: 'margin-top:6px' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { if (add.value.trim()) call('addTrackers', d.id, add.value); } }, 'Add trackers'), h('button', { class: 'btn sm', type: 'button', onclick: () => call('reannounce', d.id) }, 'Ask for more peers'))));
    } else if (st.tab === 'peers') {
      if (!d.peers || !d.peers.length) body.append(h('p', { class: 'hint' }, 'Not connected to anyone right now.'));
      else { const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Client'), h('th', { class: 'r' }, 'Has'), h('th', { class: 'r' }, 'Down'), h('th', { class: 'r' }, 'Up')))); const tbody = h('tbody'); tb.append(tbody);
        for (const p of d.peers) tbody.append(h('tr', {}, h('td', { style: 'font-family:var(--f-mono);font-size:12px' }, p.ip), h('td', { class: 'nm' }, p.client || '—'), h('td', { class: 'r' }, pct(p.progress)), h('td', { class: 'r', style: 'color:var(--dl)' }, p.dl ? speed(p.dl) : ''), h('td', { class: 'r', style: 'color:var(--ul)' }, p.ul ? speed(p.ul) : '')));
        body.append(tb); }
      const ad = h('input', { class: 'inp', placeholder: '192.168.1.20:51413', style: 'max-width:260px' });
      body.append(h('div', { class: 'dacts', style: 'margin-top:14px;align-items:center' }, ad, h('button', { class: 'btn sm', type: 'button', onclick: () => { if (ad.value.trim()) call('connectPeer', d.id, ad.value.trim()); } }, 'Add peer')));
    }
    body.scrollTop = scroll;
  }

  /* ---------- events from the engine ---------- */
  let finishedQueue = [];
  window.__torrentEvent = raw => { let ev; try { ev = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; } if (!ev) return;
    switch (ev.type) {
      case 'list': { st.started = true; st.list = ev.torrents || []; st.rates = { dl: ev.dl, ul: ev.ul, dht: ev.dht, paused: ev.paused }; render(); if (st.details && !document.querySelector('.dbody select:focus,.dbody input:focus,.dbody textarea:focus') && st.tab === 'general') renderDetails(); break; }
      case 'settings': st.settings = ev; break;
      case 'inspect': inspectDlg(ev); break;
      case 'details': if (st.details && st.details.id === ev.id) { if (ev.gone) { closeDetails(); break; } st.details = ev; if (!document.querySelector('.dbody select:focus,.dbody input:focus,.dbody textarea:focus')) renderDetails(); } break;
      case 'added': toast('Added “' + ev.name + '”'); break;
      case 'metadata': break;
      case 'finished': toast('Downloaded: ' + ev.name, ['Open', () => call('open', ev.id, -1)]); break;
      case 'removed': if (st.sel === ev.id) closeDetails(); toast(ev.deleted ? 'Removed and deleted the files' : 'Removed — your files are still there'); break;
      case 'created': createdDlg(ev); break;
      case 'creating': if (ev.progress < 1) toast(`Creating “${ev.name}” · ${pct(ev.progress)}`, null, 1500); break;
      case 'createSource': if (st.onCreateSrc) st.onCreateSrc(ev); break;
      case 'folder': if (ev.purpose === 'move' && st.pendingMove) { call('move', st.pendingMove, ev.path); st.pendingMove = null; } else if (st.folderTarget) st.folderTarget(ev.path); break;
      case 'clipboard': if (st.pasteTo) { st.pasteTo.value = (st.pasteTo.value ? st.pasteTo.value.trim() + '\n' : '') + (ev.text || ''); } break;
      case 'incomingMagnet': magnetDlg(ev.uri); break;
      case 'error': if (ev.msg) toast(ev.msg); break;
      case 'toast': toast(ev.msg); break;
    }
  };

  /* drag & drop .torrent files / magnet text (Windows) */
  let dropEl = null;
  addEventListener('dragover', e => { e.preventDefault(); if (!dropEl) { dropEl = h('div', { class: 'drop' }, 'Drop .torrent files or a magnet link'); document.body.append(dropEl); } });
  addEventListener('dragleave', e => { if (e.relatedTarget == null && dropEl) { dropEl.remove(); dropEl = null; } });
  addEventListener('drop', e => { e.preventDefault(); if (dropEl) { dropEl.remove(); dropEl = null; } const t = e.dataTransfer.getData('text/plain'); if (t && /magnet:\?/i.test(t)) magnetDlg(t.trim()); });
  addEventListener('paste', e => { if (document.querySelector('.scrim')) return; const t = (e.clipboardData && e.clipboardData.getData('text')) || ''; if (/^\s*magnet:\?/i.test(t)) magnetDlg(t.trim()); });

  if (!B) { document.body.innerHTML = ''; document.body.append(h('div', { class: 'noapp' }, h('div', { class: 'logo', style: 'width:64px;height:64px;border-radius:18px', html: IC.logo }), h('h2', { style: 'margin:0;font:800 24px var(--f-display)' }, 'SRK Torrent'), h('p', {}, 'This is the SRK Torrent app screen. Install SRK Torrent on Android or SRK Office on Windows to download torrents.'))); return; }
  const checkAccess = () => { st.noAccess = B && typeof B.hasAllFilesAccess === 'function' && B.hasAllFilesAccess() === false; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkAccess(); render(); } });
  checkAccess(); render(); call('start');
})();
