/* SRK Share — the screen. Talks to the device's share engine through window.SRKShare; engine events arrive at window.__shareEvent. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a)) { if (v == null || v === false) continue; if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    logo: S('<path d="M7 17L17 7M17 7H9M17 7v8"/><path d="M4 12a8 8 0 0013 6.3M20 12A8 8 0 007 5.7"/>'), more: S('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
    edit: S('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), plus: S('<path d="M12 5v14M5 12h14"/>'), send: S('<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>'), text: S('<path d="M5 6h14M5 11h14M5 16h9"/>'), x: S('<path d="M6 6l12 12M18 6L6 18"/>'), check: S('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    phone: S('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'), pc: S('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>'), wifi: S('<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>'),
    up: S('<path d="M12 19V6M6 11l6-6 6 6"/>'), down: S('<path d="M12 5v13M6 13l6 6 6-6"/>'), file: S('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'), open: S('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'), folder: S('<path d="M3 6h6l2 2h10v11H3z"/>'),
    link: S('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'), shield: S('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'), trash: S('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'), copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'), info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'), moon: S('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  };
  /* what kind of file is it: coloured badge shown on chips and in the activity list */
  const KINDS = [
    [/^(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|svg|raw|dng)$/, 'Photo', '#1E8E3E', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>'],
    [/^(mp4|mov|m4v|mkv|avi|3gp|webm|wmv|flv|mpe?g|ts)$/, 'Video', '#D93025', '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'],
    [/^pdf$/, 'PDF', '#C5221F', '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M8.5 16v-4h1.3a1.2 1.2 0 010 2.4H8.5M12.5 12v4h1a2 2 0 000-4z"/>'],
    [/^(docx?|odt|rtf|pages)$/, 'Word', '#2F5DD8', '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M8.5 11l1.3 6 1.7-4.5 1.7 4.5 1.3-6"/>'],
    [/^(xlsx?|xlsm|csv|ods|numbers)$/, 'Excel', '#1E7B47', '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 11l5 6M14 11l-5 6"/>'],
    [/^(pptx?|odp|key)$/, 'PowerPoint', '#C2410C', '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9.5 17v-6h2a1.8 1.8 0 010 3.6h-2"/>'],
    [/^(mp3|m4a|aac|wav|flac|ogg|opus|amr|wma)$/, 'Audio', '#7B2FB0', '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'],
    [/^(zip|rar|7z|tar|gz|tgz)$/, 'Archive', '#6D4C41', '<path d="M5 3h14v18H5z"/><path d="M12 3v2M12 7v2M12 11v2M10.5 15h3v3h-3z"/>'],
    [/^apk$/, 'App', '#0B8A87', '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 18h4"/>'],
  ];
  const kindOf = name => { const ext = (String(name).split('.').pop() || '').toLowerCase(); for (const k of KINDS) if (k[0].test(ext)) return k; return [null, 'File', '#56707a', '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>']; };
  const badge = (name, sz = 38) => { const k = kindOf(name); return `<span class="kb" style="width:${sz}px;height:${sz}px;background:${k[2]}1f;color:${k[2]}" title="${k[1]}">${S(k[3])}</span>`; };
  const B = window.SRKShare; const store = { get: (k, d) => { try { const v = localStorage.getItem('srk-share-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('srk-share-' + k, JSON.stringify(v)); } catch (e) { } } };
  const st = { me: null, peers: [], sel: new Set(store.get('sel', [])), files: [], acts: store.get('acts', []), offers: [] };
  const size = n => { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; };
  const eta = s => s < 60 ? Math.ceil(s) + ' s' : Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
  const COLORS = ['#0B8A87', '#2F6FDE', '#7B2FB0', '#C2410C', '#B4235A', '#1E7B47', '#6D4C41', '#0E7490'];
  const colorOf = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  let toastT; const toast = (m, ms = 2800) => { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = h('div', { class: 'toast', role: 'status' }, m); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms); };
  const call = (fn, ...a) => { try { return B && B[fn] ? B[fn](...a) : undefined; } catch (e) { toast(String(e.message || e)); } };
  function dialog(title, body, buttons, opts = {}) { return new Promise(res => { const sc = h('div', { class: 'scrim' }); const df = h('div', { class: 'df' }); const close = v => { sc.remove(); res(v); };
    for (const [label, cls, fn] of buttons) { const b = h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button' }, label); b.addEventListener('click', () => { const r = fn ? fn() : label; if (r !== false) close(r); }); df.append(b); }
    sc.append(h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', {}, title), h('div', { class: 'db' }, body), df)); if (!opts.modal) sc.addEventListener('pointerdown', e => { if (e.target === sc) close(null); }); document.body.append(sc); if (opts.onOpen) opts.onOpen(sc); setTimeout(() => { const i = sc.querySelector('input:not([type=checkbox]),textarea'); if (i) i.focus(); }, 40); }); }
  function menu(anchor, items) { document.querySelectorAll('.menu').forEach(m => m.remove()); const m = h('div', { class: 'menu', role: 'menu' }); for (const it of items) { if (!it) continue; const b = h('button', { class: 'mi', type: 'button', role: 'menuitem', html: it.icon + `<span>${esc(it.text)}</span>` }); b.addEventListener('click', () => { m.remove(); it.fn(); }); m.append(b); } document.body.append(m); const r = anchor.getBoundingClientRect(); m.style.top = r.bottom + 4 + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px'; setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0); }

  /* ---------------------------------------------------------------- rendering */
  function render() { const w = $('#wrap'); w.innerHTML = '';
    // nearby devices
    const peers = st.peers; for (const id of [...st.sel]) if (!peers.some(p => p.id === id)) st.sel.delete(id);
    w.append(h('h2', {}, 'Nearby', h('span', { class: 'sp' }), peers.length ? h('button', { class: 'btn sm', type: 'button', onclick: () => { if (st.sel.size === peers.length) st.sel.clear(); else peers.forEach(p => st.sel.add(p.id)); saveSel(); render(); } }, st.sel.size === peers.length ? 'Clear' : 'Select all') : null));
    if (!peers.length) w.append(h('div', { class: 'scan' }, h('div', { class: 'radar', html: IC.wifi }), h('b', { style: 'color:var(--ink)' }, 'Looking for devices…'), h('p', {}, 'Open SRK Share on the other phones or computers. Everyone must be on the same Wi-Fi, or connected to one phone’s hotspot.'), h('button', { class: 'btn sm', type: 'button', onclick: connectDlg, html: IC.link + '<span>Connect by address</span>' })));
    else { const g = h('div', { class: 'peers' }); for (const p of peers) { const on = st.sel.has(p.id); const b = h('button', { class: 'peer' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), title: on ? 'Selected' : 'Tap to send to ' + p.name },
          h('span', { class: 'tick', html: IC.check }), h('span', { class: 'av', style: `background:${colorOf(p.id)}`, html: esc(initials(p.name)) + `<span class="pl">${p.platform === 'windows' ? IC.pc : IC.phone}</span>` }), h('b', {}, p.name || 'Device'), h('small', {}, p.ip || ''));
        b.addEventListener('click', () => { if (st.sel.has(p.id)) st.sel.delete(p.id); else st.sel.add(p.id); saveSel(); render(); }); g.append(b); } w.append(g); }
    // what to send
    const tray = h('div', { class: 'tray' }); const total = st.files.reduce((a, f) => a + f.size, 0);
    if (st.files.length){ const chips = h('div', { class: 'chips' }); for (const f of st.files) { const x = h('button', { type: 'button', 'aria-label': 'Remove ' + f.name, html: IC.x }); x.addEventListener('click', () => { st.files = st.files.filter(y => y !== f); call('forget', f.id); render(); }); chips.append(h('span', { class: 'chip', html: badge(f.name, 24) }, h('span', {}, f.name), h('small', {}, size(f.size)), x)); } tray.append(chips); }
    else tray.append(h('p', { class: 'hint' }, window.SRK_WINDOWS ? 'Choose files or drag them onto this window — videos, photos, PDF, Word, Excel or any other file, any size.' : 'Photos, videos (.mp4, .mov), PDF, Word, Excel, PowerPoint, music, apps or any other file — as many as you like, any size, original quality.'));
    const n = st.sel.size; const sendBtn = h('button', { class: 'btn primary grow', type: 'button', html: IC.send + `<span>${!st.files.length ? 'Send' : n ? `Send ${st.files.length} file${st.files.length === 1 ? '' : 's'} (${size(total)}) to ${n === 1 ? (peers.find(p => st.sel.has(p.id)) || {}).name : n + ' devices'}` : 'Pick who to send to'}</span>` }); sendBtn.disabled = !st.files.length || !n; sendBtn.addEventListener('click', sendNow);
    tray.append(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: e => pickMenu(e.currentTarget), html: IC.plus + '<span>Files</span>' }), h('button', { class: 'btn', type: 'button', onclick: textDlg, html: IC.text + '<span>Text</span>' }), sendBtn, st.files.length ? h('button', { class: 'btn sm', type: 'button', onclick: () => { st.files.forEach(f => call('forget', f.id)); st.files = []; render(); } }, 'Clear') : null));
    w.append(h('h2', {}, 'Send'), tray);
    // activity
    w.append(h('h2', {}, 'Activity', h('span', { class: 'sp' }), st.acts.some(a => isOver(a)) ? h('button', { class: 'btn sm', type: 'button', onclick: () => { st.acts = st.acts.filter(a => !isOver(a)); saveActs(); render(); } }, 'Clear finished') : null));
    const list = h('div', { class: 'list', id: 'acts' }); if (!st.acts.length) list.append(h('p', { class: 'empty' }, 'Files you send and receive show up here.')); for (const a of st.acts) list.append(actEl(a)); w.append(list); }
  const isOver = a => a.kind === 'text' || ['done', 'failed', 'cancelled', 'declined'].includes(a.state);
  const STATE = { waiting: 'Waiting…', sending: 'Sending', receiving: 'Receiving', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', declined: 'Declined' };
  function metaOf(a) { const who = a.dir === 'in' ? 'from ' + (a.peer && a.peer.name || 'device') : 'to ' + (a.peer && a.peer.name || 'device');
    if (a.state === 'sending' || a.state === 'receiving') { const left = a.speed > 0 ? (a.size - a.done) / a.speed : 0; return `${who} · ${size(a.done)} of ${size(a.size)}${a.speed > 0 ? ' · ' + size(a.speed) + '/s · ' + eta(left) + ' left' : ''}`; }
    if (a.state === 'waiting') return `${who} · ${size(a.size)} · ${a.dir === 'out' ? 'waiting for them to accept' : 'starting…'}`;
    return `${who} · ${size(a.size)} · ${STATE[a.state] || a.state}${a.error ? ' — ' + a.error : ''}`; }
  function actEl(a) {
    if (a.kind === 'text') { const cp = h('button', { class: 'ib', type: 'button', title: 'Copy', 'aria-label': 'Copy text', html: IC.copy }); cp.addEventListener('click', () => copy(a.text));
      return h('div', { class: 'tr' + (a.dir === 'in' ? ' in' : ''), 'data-id': a.id }, h('span', { class: 'ic', html: IC.text }), h('b', {}, a.dir === 'in' ? 'Text from ' + (a.peer && a.peer.name) : 'Text to ' + (a.peer && a.peer.name)), h('span', { class: 'acts' }, cp), h('div', { class: 'txt', html: linkify(a.text) })); }
    const pct = a.size ? Math.min(100, Math.round(100 * (a.done || 0) / a.size)) : (a.state === 'done' ? 100 : 0); const acts = h('span', { class: 'acts' });
    if (!isOver(a)) acts.append(h('button', { class: 'ib', type: 'button', title: 'Cancel', 'aria-label': 'Cancel ' + a.name, html: IC.x, onclick: () => call('cancel', a.id) }));
    else if (a.dir === 'in' && a.state === 'done') { acts.append(h('button', { class: 'ib', type: 'button', title: 'Open', 'aria-label': 'Open ' + a.name, html: IC.open, onclick: () => call('open', a.id, a.ref || '') })); if (window.SRK_WINDOWS) acts.append(h('button', { class: 'ib', type: 'button', title: 'Show in folder', 'aria-label': 'Show in folder', html: IC.folder, onclick: () => call('showInFolder', a.ref || '') })); }
    return h('div', { class: `tr ${a.dir} ${a.state}`, 'data-id': a.id }, h('span', { class: 'ic kind', html: badge(a.name) + `<span class="dir">${a.dir === 'in' ? IC.down : IC.up}</span>` }), h('b', {}, a.name), acts, h('span', { class: 'meta' }, metaOf(a)), !isOver(a) || a.state === 'done' ? h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })) : null); }
  const linkify = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  function copy(t) { const done = () => toast('Copied'); try { navigator.clipboard.writeText(t).then(done, () => { call('copy', t); done(); }); } catch (e) { call('copy', t); done(); } }
  const saveSel = () => store.set('sel', [...st.sel]); let saveT; const saveActs = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set('acts', st.acts.slice(0, 200).map(a => ({ ...a, speed: 0, state: isOver(a) ? a.state : 'failed', error: isOver(a) ? a.error : 'Stopped when the app closed' }))), 400); };
  function updateAct(a) { const el = document.querySelector(`.tr[data-id="${a.id}"]`); const fresh = actEl(a); if (el) el.replaceWith(fresh); else render(); }

  /* ---------------------------------------------------------------- actions */
  function sendNow() { if (!st.files.length || !st.sel.size) return; call('send', JSON.stringify([...st.sel]), JSON.stringify(st.files.map(f => f.id)), ''); toast(`Sending to ${st.sel.size === 1 ? (st.peers.find(p => st.sel.has(p.id)) || {}).name : st.sel.size + ' devices'}…`); st.files = []; render(); }
  function pickMenu(anchor) { const k = (n, i) => S(KINDS.find(x => x[1] === n)[3]); menu(anchor, [
      { text: 'Photos & videos', icon: k('Photo'), fn: () => call('pickFiles', 'media') },
      { text: 'Documents (PDF, Word, Excel, PowerPoint)', icon: k('Word'), fn: () => call('pickFiles', 'docs') },
      { text: 'Music & audio', icon: k('Audio'), fn: () => call('pickFiles', 'audio') },
      { text: 'Any file', icon: IC.file, fn: () => call('pickFiles', 'any') }]); }
  async function textDlg() { if (!st.sel.size) return toast('First tap who to send it to'); const t = h('textarea', { class: 'inp', rows: 5, placeholder: 'A message, link or anything you want to paste on the other device' }); const r = await dialog('Send text', t, [['Cancel'], ['Send', 'primary', () => t.value.trim() ? 'send' : false]]); if (r !== 'send') return; call('send', JSON.stringify([...st.sel]), '[]', t.value.trim()); }
  async function connectDlg() { const me = st.me || {}; const i = h('input', { class: 'inp', placeholder: '192.168.1.5', inputmode: 'decimal', autocomplete: 'off' });
    const r = await dialog('Connect by address', h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, h('p', { class: 'hint' }, 'Use this when devices don’t find each other on their own (some office or hospital Wi-Fi blocks it). Type the other device’s address, shown under “This device” in its menu.'), i, h('p', { class: 'hint' }, 'This device’s address:'), h('div', { class: 'addr' }, (me.addrs || []).length ? me.addrs.join('  ·  ') : 'Not on Wi-Fi')), [['Cancel'], ['Connect', 'primary', () => i.value.trim() ? 'go' : false]]);
    if (r === 'go') { call('connect', i.value.trim()); toast('Looking for SRK Share at ' + i.value.trim() + '…'); } }
  async function renameDlg() { const i = h('input', { class: 'inp', value: st.me ? st.me.name : '', maxlength: 40 }); const r = await dialog('This device’s name', h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, h('p', { class: 'hint' }, 'Others see this name when you’re nearby.'), i), [['Cancel'], ['Save', 'primary', () => i.value.trim() ? 'ok' : false]]); if (r === 'ok') call('setName', i.value.trim()); }
  async function aboutMe() { const me = st.me || {}; const tr = me.trusted || []; const box = h('div', { style: 'display:flex;flex-direction:column;gap:12px' }, h('div', {}, h('p', { class: 'hint' }, 'Name'), h('b', {}, me.name || '')), h('div', {}, h('p', { class: 'hint' }, 'Address (for Connect by address)'), h('div', { class: 'addr' }, (me.addrs || []).join('  ·  ') || 'Not on Wi-Fi')), h('div', {}, h('p', { class: 'hint' }, 'Received files are saved in'), h('b', {}, window.SRK_WINDOWS ? 'Downloads\\SRK Share' : 'Download/SRK Share')));
    if (tr.length) { const l = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, h('p', { class: 'hint' }, 'Devices you always accept from')); for (const t of tr) l.append(h('div', { class: 'row' }, h('span', { class: 'grow' }, t.name), h('button', { class: 'btn sm danger', type: 'button', onclick: e => { call('untrust', t.id); e.currentTarget.closest('.row').remove(); } }, 'Stop'))); box.append(l); }
    dialog('This device', box, [['Close', 'primary']]); }
  function toggleTheme() { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; store.set('theme', r.dataset.theme); }

  /* incoming offers: one dialog at a time */
  let offerOpen = false;
  async function nextOffer() { if (offerOpen || !st.offers.length) return; offerOpen = true; const o = st.offers[0]; const fl = h('div', { class: 'flist' }); for (const it of o.items.slice(0, 200)) fl.append(h('div', {}, h('span', {}, it.name), h('small', {}, size(it.size)))); if (o.items.length > 200) fl.append(h('div', {}, h('span', {}, `…and ${o.items.length - 200} more`)));
    const always = h('input', { type: 'checkbox' }); const name = (o.from && o.from.name) || 'A device';
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { }
    const r = await dialog(`${name} wants to send you ${o.items.length} file${o.items.length === 1 ? '' : 's'}`, h('div', { style: 'display:flex;flex-direction:column;gap:12px' }, h('p', { class: 'hint' }, `${size(o.total)} in total`), fl, h('label', { class: 'chk' }, always, `Always accept from ${name}`)), [['Decline', 'danger'], ['Accept', 'primary']], { modal: true, onOpen: sc => { o.sc = sc; } });
    st.offers.shift(); offerOpen = false; if (!o.closed) call('respond', o.offerId, r === 'Accept', r === 'Accept' && always.checked); nextOffer(); }

  /* ---------------------------------------------------------------- engine events */
  let renderT; const soon = () => { clearTimeout(renderT); renderT = setTimeout(render, 60); };
  window.__shareEvent = raw => { const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
    switch (ev.type) {
      case 'self': st.me = ev; $('#meName').textContent = ev.name + (ev.addrs && ev.addrs.length ? ' · ' + ev.addrs[0] : ' · no Wi-Fi'); break;
      case 'peers': st.peers = (ev.peers || []).sort((a, b) => String(a.name).localeCompare(String(b.name))); soon(); break;
      case 'picked': st.files.push(...ev.files.filter(f => !st.files.some(x => x.id === f.id))); render(); break;
      case 'offer': st.offers.push(ev); nextOffer(); break;
      case 'offerClosed': { const o = st.offers.find(x => x.offerId === ev.offerId); if (o){ o.closed = true; if (o.sc) { o.sc.remove(); st.offers.shift(); offerOpen = false; nextOffer(); } else st.offers = st.offers.filter(x => x !== o); toast(`${o.from && o.from.name || 'The sender'} stopped waiting`); } break; }
      case 'transfer': { let a = st.acts.find(x => x.id === ev.id); const isNew = !a; if (!a){ a = { ...ev }; st.acts.unshift(a); } else Object.assign(a, ev); if (isNew) render(); else updateAct(a); saveActs(); if (ev.state === 'done' && ev.dir === 'in') toast('Received ' + ev.name); break; }
      case 'progress': { const a = st.acts.find(x => x.id === ev.id); if (a){ a.done = ev.done; a.speed = ev.speed; if (a.state === 'waiting') a.state = a.dir === 'in' ? 'receiving' : 'sending'; const el = document.querySelector(`.tr[data-id="${a.id}"]`); if (el){ const m = el.querySelector('.meta'), bar = el.querySelector('.bar i'); if (m) m.textContent = metaOf(a); if (bar) bar.style.width = (a.size ? Math.min(100, 100 * a.done / a.size) : 0) + '%'; } } break; }
      case 'text': st.acts.unshift({ id: 't' + Date.now() + Math.random(), kind: 'text', dir: 'in', peer: ev.from, text: ev.text, t: ev.t }); saveActs(); render(); toast('Text from ' + (ev.from && ev.from.name)); break;
      case 'textSent': st.acts.unshift({ id: 't' + Date.now() + Math.random(), kind: 'text', dir: 'out', peer: ev.to, text: ev.text, t: ev.t }); saveActs(); render(); break;
      case 'toast': toast(ev.msg, 3500); break;
    } };

  /* ---------------------------------------------------------------- start */
  try { const th = store.get('theme', ''); if (th) document.documentElement.dataset.theme = th; } catch (e) { }
  $('#logo').innerHTML = IC.logo; $('#moreBtn').innerHTML = IC.more; $('#meBtn').append(h('span', { html: IC.edit, style: 'display:inline-grid' }));
  $('#meBtn').addEventListener('click', renameDlg);
  $('#moreBtn').addEventListener('click', e => menu(e.currentTarget, [{ text: 'Connect by address', icon: IC.link, fn: connectDlg }, { text: 'This device', icon: IC.info, fn: aboutMe }, window.SRK_WINDOWS || (B && B.openFolder) ? { text: 'Open received files', icon: IC.folder, fn: () => call('openFolder') } : null, { text: 'Rename this device', icon: IC.edit, fn: renameDlg }, { text: 'Dark mode', icon: IC.moon, fn: toggleTheme }]));
  if (!B){ $('#wrap').innerHTML = ''; $('#wrap').append(h('div', { class: 'noapp' }, h('div', { class: 'logo', html: IC.logo }), h('h2', { style: 'font-size:20px;text-transform:none;letter-spacing:0;color:var(--ink)' }, 'SRK Share runs in the app'), h('p', { class: 'hint' }, 'Install SRK Share on your Android phone, or SRK Office on Windows. Devices on the same Wi-Fi or hotspot then send files straight to each other.'))); $('#meName').textContent = 'Not available here'; return; }
  // drag and drop (Windows)
  if (window.SRK_WINDOWS){ let dz = null, depth = 0; addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; depth++; if (!dz){ dz = h('div', { class: 'drop' }, 'Drop files to send'); document.body.append(dz); } }); addEventListener('dragleave', () => { depth--; if (depth <= 0 && dz){ dz.remove(); dz = null; depth = 0; } }); addEventListener('dragover', e => e.preventDefault()); addEventListener('drop', e => { e.preventDefault(); depth = 0; if (dz){ dz.remove(); dz = null; } const fs = [...e.dataTransfer.files]; if (fs.length) call('addDropped', fs); }); }
  render(); call('start');
})();
