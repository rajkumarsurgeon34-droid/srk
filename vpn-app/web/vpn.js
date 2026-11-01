/* SRK VPN — the screen. Talks to the app through window.SRKVpn; events arrive at window.__vpnEvent. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a)) { if (v == null || v === false) continue; if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    logo: S('<path d="M12 3l7 3v5.5c0 4.3-3 8.2-7 9.5-4-1.3-7-5.2-7-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.4-4.6"/>'),
    power: S('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1011.4 0"/>'), plus: S('<path d="M12 5v14M5 12h14"/>'), more: S('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
    qr: S('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M16 16h2v2"/>'),
    file: S('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'), paste: S('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/>'), key: S('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>'),
    edit: S('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), split: S('<path d="M6 4v6a4 4 0 004 4h8M14 10l4 4-4 4M6 20v-4"/>'), share: S('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'), trash: S('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'), rename: S('<path d="M4 7V5h16v2M12 5v14M9 19h6"/>'),
    globe: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>'), refresh: S('<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>'), lock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    chev: S('<path d="M6 9l6 6 6-6"/>'), theme: S('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'), info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'), plug: S('<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 01-10 0zM12 16v5"/>'),
  };
  const B = window.SRKVpn;
  const store = { get: (k, d) => { try { const v = localStorage.getItem('srk-vpn-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('srk-vpn-' + k, JSON.stringify(v)); } catch (e) { } } };
  const st = { tunnels: [], loaded: false, sel: null, status: { state: 'down' }, ip: null, ipLoading: false, apps: null, waitSave: null, waitApps: null };
  const call = (fn, ...a) => { try { if (B && typeof B[fn] === 'function') return B[fn](...a); } catch (e) { toast(String(e.message || e)); } };
  const size = n => { n = +n || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; };
  const dur = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (hh ? String(hh).padStart(2, '0') + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };
  const ago = ms => { const s = Math.round(ms / 1000); if (s < 60) return s + ' s ago'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; return Math.floor(s / 3600) + ' h ago'; };
  let toastT; const toast = (m, ms = 3000) => { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = h('div', { class: 'toast', role: 'status' }, m); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms); };
  const openDialogs = [];
  function dialog(title, body, buttons, opts = {}) { return new Promise(res => { const sc = h('div', { class: 'scrim' }); const df = h('div', { class: 'df' }); const close = v => { sc.remove(); const i = openDialogs.indexOf(close); if (i >= 0) openDialogs.splice(i, 1); res(v); };
    for (const [label, cls, fn] of buttons) { const b = h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button' }, label); b.addEventListener('click', async () => { const r = fn ? await fn() : label; if (r !== false) close(r); }); df.append(b); }
    const d = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h3', {}, title), h('div', { class: 'db' }, body), df);
    sc.append(d); sc.addEventListener('pointerdown', e => { if (e.target === sc && !opts.modal) close(null); }); document.body.append(sc); openDialogs.push(close); if (opts.onOpen) opts.onOpen(d, close); }); }
  function menu(anchor, items) { document.querySelectorAll('.menu').forEach(m => m.remove()); const m = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) { if (!it) continue; if (it === '-') { m.append(h('div', { class: 'msep' })); continue; } const b = h('button', { class: 'mi' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', html: (it.icon || '') + `<span>${esc(it.text)}</span>` }); b.addEventListener('click', () => { m.remove(); it.fn(); }); m.append(b); }
    document.body.append(m); const r = anchor.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0); }
  window.srkBack = () => { const m = document.querySelector('.menu'); if (m) { m.remove(); return true; } if (openDialogs.length) { openDialogs[openDialogs.length - 1](null); return true; } return false; };

  $('#logo').innerHTML = IC.logo; $('#addBtn').innerHTML = IC.plus; $('#moreBtn').innerHTML = IC.more;
  $('#addBtn').addEventListener('click', e => addMenu(e.currentTarget));
  $('#moreBtn').addEventListener('click', e => menu(e.currentTarget, [
    { text: 'Add a tunnel', icon: IC.plus, fn: () => addMenu($('#addBtn')) }, { text: 'Check my IP address', icon: IC.globe, fn: checkIp },
    { text: 'Kill switch & Always-on', icon: IC.lock, fn: killSwitchDlg }, '-',
    { text: 'Theme: ' + ({ light: 'Light', dark: 'Dark' }[store.get('theme', '')] || 'Automatic'), icon: IC.theme, fn: () => { const t = store.get('theme', ''); store.set('theme', t === '' ? 'dark' : t === 'dark' ? 'light' : ''); applyTheme(); } },
    { text: 'About SRK VPN', icon: IC.info, fn: aboutDlg }]));
  const applyTheme = () => { const t = store.get('theme', ''); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }; applyTheme();
  function addMenu(anchor) { menu(anchor, [{ text: 'Scan QR code', icon: IC.qr, fn: () => call('scanQr') }, { text: 'Import file (.conf or .zip)', icon: IC.file, fn: () => call('importFile') }, { text: 'Paste config', icon: IC.paste, fn: pasteDlg }, { text: 'Create from scratch', icon: IC.key, fn: () => call('template') }]); }

  /* ---------- main screen ---------- */
  const selected = () => st.tunnels.find(t => t.id === (st.status.id || st.sel)) || st.tunnels[0];
  function render() {
    const w = $('#wrap'); w.innerHTML = '';
    if (!st.loaded) return;
    if (!st.tunnels.length) {
      w.append(h('div', { class: 'hero' }, h('div', { class: 'empty' }, h('div', { class: 'big', html: IC.logo }), h('h3', {}, 'Add your VPN'),
        h('p', {}, 'SRK VPN connects with WireGuard. Your VPN provider or server admin gives you a config — a QR code, a .conf file or text. Add it here, then tap the big button to connect.'),
        h('div', { class: 'grid2' }, h('button', { class: 'btn', type: 'button', onclick: () => call('scanQr'), html: IC.qr + '<span>Scan QR code</span>' }), h('button', { class: 'btn', type: 'button', onclick: () => call('importFile'), html: IC.file + '<span>Import file</span>' }),
          h('button', { class: 'btn', type: 'button', onclick: pasteDlg, html: IC.paste + '<span>Paste config</span>' }), h('button', { class: 'btn', type: 'button', onclick: () => call('template'), html: IC.key + '<span>Create from scratch</span>' })))));
      return;
    }
    const s = st.status, t = selected(), up = s.state === 'up', connecting = s.state === 'connecting';
    const power = h('button', { class: 'power' + (up ? ' up' : connecting ? ' connecting' : ''), type: 'button', 'aria-label': up ? 'Disconnect' : 'Connect', title: up ? 'Disconnect' : 'Connect', html: IC.power, disabled: connecting ? true : null, onclick: () => up ? call('disconnect') : t && call('connect', t.id) });
    const hero = h('div', { class: 'hero' }, power, h('p', { class: 'state' + (up ? ' up' : ''), role: 'status' }, up ? 'Connected' : connecting ? 'Connecting…' : 'Not connected'),
      h('button', { class: 'tname', type: 'button', onclick: () => { const l = $('#tlist'); if (l) l.scrollIntoView({ behavior: 'smooth' }); }, html: `<span>${esc(t ? t.name : '')}</span>` + IC.chev }));
    if (up) {
      const hsAge = s.handshake ? Date.now() - s.handshake : null, stale = hsAge != null ? hsAge > 180000 : (Date.now() - s.since > 15000);
      hero.append(h('div', { class: 'timer', 'data-since': s.since }, dur(Date.now() - s.since)),
        h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('small', {}, '↓ Received'), h('b', {}, size(s.rx))), h('div', { class: 'stat' }, h('small', {}, '↑ Sent'), h('b', {}, size(s.tx))),
          h('div', { class: 'stat' + (stale ? ' bad' : '') }, h('small', {}, 'Server'), h('b', {}, s.handshake ? (stale ? 'No reply' : ago(hsAge)) : 'Waiting…'))));
      if (stale) hero.append(h('div', { class: 'err' }, 'The server isn’t answering. Check that the config is right and that the server is running — or try another tunnel.'));
    } else if (t && t.endpoints && t.endpoints.length) hero.append(h('p', { class: 'hint' }, 'Server ' + t.endpoints[0] + (t.fullTunnel ? ' · all traffic' : ' · some networks only')));
    if (s.error && !up) hero.append(h('div', { class: 'err' }, s.error));
    w.append(hero);
    // your IP
    const ip = st.ip;
    w.append(h('div', { class: 'card ipcard' }, h('div', { class: 'flag', html: ip && ip.country ? flag(ip.country) : IC.globe }),
      h('div', { class: 't' }, h('b', { style: ip && !ip.error && !st.ipLoading ? '' : 'font-family:var(--f-ui)' }, st.ipLoading ? 'Checking…' : ip ? (ip.error ? '—' : ip.ip) : 'Your IP address'), h('small', {}, st.ipLoading ? 'Asking the internet what it sees' : ip ? (ip.error || [ip.city, ip.region, ip.country].filter(Boolean).join(', ') + (ip.org ? ' · ' + ip.org.replace(/^AS\d+\s*/, '') : '')) : 'Tap refresh to see what websites see')),
      h('button', { class: 'ib', type: 'button', 'aria-label': 'Check my IP', title: 'Check my IP', html: IC.refresh, onclick: checkIp })));
    // tunnels
    w.append(h('h2', { id: 'tlist' }, 'Your tunnels', h('span', { class: 'sp' }), h('button', { class: 'btn sm', type: 'button', onclick: e => addMenu(e.currentTarget), html: IC.plus + '<span>Add</span>' })));
    const list = h('div', { class: 'list' });
    for (const x of st.tunnels) {
      const isUp = x.id === s.id && up, isSel = t && x.id === t.id;
      const tags = [];
      if (isUp) tags.push(h('span', { class: 'tag on' }, 'Connected'));
      if (x.error) tags.push(h('span', { class: 'tag bad' }, 'Config problem'));
      else tags.push(h('span', { class: 'tag' }, x.fullTunnel ? 'All traffic' : 'Some networks'));
      if (x.mode === 'exclude' && x.apps.length) tags.push(h('span', { class: 'tag' }, x.apps.length + (x.apps.length === 1 ? ' app skips VPN' : ' apps skip VPN')));
      if (x.mode === 'only' && x.apps.length) tags.push(h('span', { class: 'tag' }, 'Only ' + x.apps.length + (x.apps.length === 1 ? ' app' : ' apps')));
      const more = h('button', { class: 'ib', type: 'button', 'aria-label': 'More for ' + x.name, html: IC.more, onclick: e => { e.stopPropagation(); tunMenu(x, e.currentTarget); } });
      const row = h('div', { class: 'tun' + (isSel ? ' sel' : '') + (isUp ? ' up' : ''), role: 'button', tabindex: '0' }, h('span', { class: 'dot' }), h('b', {}, x.name), more,
        h('span', { class: 'meta' }, x.error ? x.error : (x.endpoints && x.endpoints[0] ? x.endpoints[0] : 'No server address') + (x.addresses && x.addresses[0] ? ' · ' + x.addresses[0] : '')), h('div', { class: 'tags' }, tags));
      row.addEventListener('click', () => { if (up && x.id !== s.id) { call('connect', x.id); toast('Switching to ' + x.name); } else { st.sel = x.id; store.set('sel', x.id); render(); } });
      list.append(row);
    }
    w.append(list);
    w.append(h('p', { class: 'hint', style: 'text-align:center;margin-top:6px' }, 'Tip: add the SRK VPN tile to Quick Settings to connect from the notification shade.'));
  }
  function liveStats(s) {
    const b = document.querySelectorAll('.stats .stat b'); if (b.length < 3) return render();
    const hsAge = s.handshake ? Date.now() - s.handshake : null, stale = hsAge != null ? hsAge > 180000 : (Date.now() - s.since > 15000);
    if (stale !== !!document.querySelector('.hero .err')) return render();
    b[0].textContent = size(s.rx); b[1].textContent = size(s.tx); b[2].textContent = s.handshake ? (stale ? 'No reply' : ago(hsAge)) : 'Waiting…'; b[2].parentNode.classList.toggle('bad', stale);
  }
  const flag = cc => /^[A-Z]{2}$/.test(cc || '') ? `<span aria-label="${cc}">${String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))}</span>` : IC.globe;
  setInterval(() => { const tm = document.querySelector('.timer'); if (tm) tm.textContent = dur(Date.now() - (+tm.dataset.since)); }, 1000);
  function checkIp() { st.ipLoading = true; render(); call('checkIp'); }

  /* ---------- tunnel actions ---------- */
  function tunMenu(x, anchor) {
    const up = st.status.state === 'up' && st.status.id === x.id;
    menu(anchor, [up ? { text: 'Disconnect', icon: IC.power, fn: () => call('disconnect') } : { text: 'Connect', icon: IC.power, fn: () => call('connect', x.id) }, '-',
      { text: 'Edit config', icon: IC.edit, fn: () => { st.editAfterConfig = x.id; call('getConfig', x.id); } },
      { text: 'Split tunnelling (choose apps)', icon: IC.split, fn: () => splitDlg(x) },
      { text: 'Details', icon: IC.info, fn: () => detailsDlg(x) },
      { text: 'Show QR code', icon: IC.qr, fn: () => call('showQr', x.id) }, { text: 'Share .conf file', icon: IC.share, fn: () => call('shareFile', x.id) },
      { text: 'Rename', icon: IC.rename, fn: () => renameDlg(x) }, '-', { text: 'Delete', icon: IC.trash, danger: true, fn: () => deleteDlg(x) }]);
  }
  async function saveDlg(title, name, text, id) {
    const nm = h('input', { class: 'inp', value: name || '', placeholder: 'e.g. Mumbai server', 'aria-label': 'Tunnel name', maxlength: '40' });
    const ta = h('textarea', { class: 'inp', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'WireGuard config' }); ta.value = text || '';
    const msg = h('div', { class: 'bad-msg', hidden: true });
    const pub = (text || '').match(/# Your public key[^:]*:\s*(\S+)/);
    await dialog(title, [field('Name', nm), pub ? h('div', { class: 'card', style: 'padding:10px 12px' }, h('p', { class: 'hint' }, 'Your new public key — give it to the server so it accepts this device:'), h('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:6px' }, h('code', { style: 'flex:1;min-width:0;font-size:12px;word-break:break-all' }, pub[1]), h('button', { class: 'btn sm', type: 'button', onclick: () => { call('copy', pub[1]); toast('Public key copied'); } }, 'Copy'))) : null,
      field('WireGuard config', ta), msg, h('p', { class: 'hint' }, 'Keep this private — anyone with the config can use your VPN.')],
      [['Cancel', '', () => null], ['Save', 'primary', () => new Promise(res => { st.waitSave = r => { st.waitSave = null; if (r.ok) { toast('Saved “' + r.name + '”'); if (!id) { st.sel = r.id; store.set('sel', r.id); } res(true); } else { msg.hidden = false; msg.textContent = r.msg; res(false); } }; call('save', id || '', nm.value.trim(), ta.value); })]], { modal: true });
  }
  const field = (label, input) => h('div', { class: 'field' }, h('label', {}, label), input);
  async function pasteDlg() { st.pasteTarget = true; call('paste'); }
  async function renameDlg(x) { const nm = h('input', { class: 'inp', value: x.name, maxlength: '40', 'aria-label': 'Name' }); const r = await dialog('Rename tunnel', [nm], [['Cancel', '', () => null], ['Save', 'primary', () => nm.value.trim() || false]]); if (r) call('rename', x.id, r); }
  async function deleteDlg(x) { const r = await dialog('Delete “' + x.name + '”?', [h('p', { class: 'hint' }, 'The config is removed from this phone. You can add it again later from the file or QR code.')], [['Cancel', '', () => null], ['Delete', 'dangerfill', () => true]]); if (r) call('remove', x.id); }
  function detailsDlg(x) {
    const kv = h('dl', { class: 'kv' }); const add = (k, v) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) return; kv.append(h('dt', {}, k), h('dd', {}, Array.isArray(v) ? v.join(', ') : String(v))); };
    add('Server', x.endpoints); add('Your address', x.addresses); add('DNS', x.dns); add('Routed through VPN', x.allowed); add('Your public key', x.publicKey); add('MTU', x.mtu);
    add('Split tunnelling', x.mode === 'exclude' ? x.apps.length + ' apps skip the VPN' : x.mode === 'only' ? 'Only ' + x.apps.length + ' apps use the VPN' : 'All apps');
    dialog(x.name, [kv, x.error ? h('div', { class: 'bad-msg' }, x.error) : null], [['Copy public key', '', () => { call('copy', x.publicKey); toast('Public key copied'); return false; }], ['Close', 'primary', () => true]]);
  }
  async function splitDlg(x) {
    let mode = x.mode || 'all'; const chosen = new Set(x.apps || []);
    const list = h('div', { class: 'apps' }, h('p', { class: 'hint', style: 'padding:12px' }, 'Loading your apps…'));
    const q = h('input', { class: 'inp', type: 'search', placeholder: 'Search apps', 'aria-label': 'Search apps' });
    const help = h('p', { class: 'hint' });
    const seg = h('div', { class: 'seg', role: 'tablist' });
    const modes = [['all', 'All apps'], ['exclude', 'Skip these apps'], ['only', 'Only these apps']];
    const draw = () => {
      seg.innerHTML = ''; for (const [k, l] of modes) seg.append(h('button', { class: mode === k ? 'on' : '', type: 'button', role: 'tab', onclick: () => { mode = k; draw(); } }, l));
      help.textContent = mode === 'all' ? 'Every app on the phone uses the VPN.' : mode === 'exclude' ? 'Ticked apps go straight to the internet (useful for banking apps or local casting); everything else uses the VPN.' : 'Only ticked apps use the VPN; everything else goes straight to the internet.';
      list.hidden = q.hidden = mode === 'all';
      if (!st.apps) return; const f = q.value.trim().toLowerCase(); list.innerHTML = '';
      const apps = st.apps.filter(a => !f || a.name.toLowerCase().includes(f) || a.pkg.includes(f)).sort((a, b) => (chosen.has(b.pkg) - chosen.has(a.pkg)) || a.name.localeCompare(b.name));
      for (const a of apps) { const cb = h('input', { type: 'checkbox', 'aria-label': a.name }); cb.checked = chosen.has(a.pkg); cb.addEventListener('change', () => { cb.checked ? chosen.add(a.pkg) : chosen.delete(a.pkg); });
        list.append(h('label', { class: 'app' }, a.icon ? h('img', { src: a.icon, alt: '' }) : h('span', { style: 'width:32px;flex:none' }), h('span', {}, a.name, h('small', {}, a.pkg)), cb)); }
      if (!apps.length) list.append(h('p', { class: 'hint', style: 'padding:12px' }, 'No apps match.'));
    };
    q.addEventListener('input', draw);
    st.onApps = draw; if (!st.apps) call('apps', x.id);
    draw();
    const r = await dialog('Split tunnelling — ' + x.name, [seg, help, q, list], [['Cancel', '', () => null], ['Save', 'primary', () => true]]);
    st.onApps = null; if (!r) return;
    if (mode !== 'all' && !chosen.size) { toast('No apps ticked — all apps will use the VPN'); mode = 'all'; }
    call('setSplit', x.id, mode, JSON.stringify([...chosen])); toast(st.status.id === x.id && st.status.state === 'up' ? 'Saved — reconnecting' : 'Saved');
  }
  function killSwitchDlg() {
    dialog('Kill switch & Always-on', [h('p', {}, 'Android can keep SRK VPN connected all the time and block the internet whenever the VPN drops, so nothing leaks outside it.'),
      h('ol', { class: 'steps' }, h('li', {}, 'Tap Open VPN settings below.'), h('li', {}, 'Tap the ⚙ next to SRK VPN.'), h('li', {}, 'Turn on “Always-on VPN”.'), h('li', {}, 'Turn on “Block connections without VPN” — that’s the kill switch.')),
      h('p', { class: 'hint' }, 'SRK VPN then connects your last-used tunnel by itself, even after the phone restarts.')],
      [['Close', '', () => true], ['Open VPN settings', 'primary', () => { call('vpnSettings'); return true; }]]);
  }
  function aboutDlg() { dialog('SRK VPN', [h('p', {}, 'A WireGuard VPN app. It connects to the VPN servers you choose — from a VPN provider, your company, or your own server — using the official WireGuard engine.'), h('p', { class: 'hint' }, 'Version 1.0 · Configs stay on this phone and are never uploaded anywhere.')], [['Close', 'primary', () => true]]); }

  /* ---------- events from the app ---------- */
  window.__vpnEvent = raw => { let ev; try { ev = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return; } if (!ev) return;
    switch (ev.type) {
      case 'tunnels': { st.loaded = true; st.tunnels = ev.tunnels || []; if (!st.sel || !st.tunnels.find(t => t.id === st.sel)) st.sel = st.tunnels.find(t => t.id === store.get('sel'))?.id || ev.last || (st.tunnels[0] && st.tunnels[0].id); render(); break; }
      case 'status': { const was = st.status.state; const changed = was !== ev.state || st.status.id !== ev.id; st.status = ev; if (changed) { render(); if ((was === 'up' || ev.state === 'up') && was !== ev.state) setTimeout(checkIp, ev.state === 'up' ? 2500 : 1200); } else if (ev.state === 'up') liveStats(ev); break; }
      case 'incoming': saveDlg('Add tunnel', ev.name, ev.text, ''); break;
      case 'template': saveDlg('New tunnel', 'My VPN', ev.text, ''); break;
      case 'clipboard': if (st.pasteTarget) { st.pasteTarget = false; const t = ev.text || ''; saveDlg('Add tunnel', '', t.includes('[Interface]') ? t : '', ''); if (t && !t.includes('[Interface]')) toast('The clipboard doesn’t contain a WireGuard config — paste it into the box'); } break;
      case 'saved': if (st.waitSave) st.waitSave({ ok: true, id: ev.id, name: ev.name }); break;
      case 'invalid': if (st.waitSave) st.waitSave({ ok: false, msg: ev.msg }); else toast(ev.msg); break;
      case 'config': if (st.editAfterConfig === ev.id) { st.editAfterConfig = null; saveDlg('Edit tunnel', ev.name, ev.text, ev.id); } break;
      case 'qr': dialog(ev.name, [h('img', { class: 'qr', src: ev.png, alt: 'QR code of the tunnel config' }), h('p', { class: 'hint' }, 'Scan this with SRK VPN or the WireGuard app on another device. Anyone who sees it can use this VPN — only show it to people you trust.')], [['Close', 'primary', () => true]]); break;
      case 'apps': st.apps = ev.apps || []; if (st.onApps) st.onApps(); break;
      case 'ip': st.ipLoading = false; st.ip = ev; render(); break;
      case 'error': toast(ev.msg, 4500); break;
      case 'toast': toast(ev.msg); break;
    }
  };

  if (!B) { document.body.innerHTML = ''; document.body.append(h('div', { class: 'noapp' }, h('div', { class: 'logo', style: 'width:64px;height:64px;border-radius:18px', html: IC.logo }), h('h2', { style: 'margin:0;font:800 24px var(--f-display);text-transform:none;letter-spacing:0;color:inherit' }, 'SRK VPN'), h('p', {}, 'This is the SRK VPN app screen. Install SRK VPN on your Android phone to connect.'))); return; }
  st.sel = store.get('sel', null);
  render(); call('start');
})();
