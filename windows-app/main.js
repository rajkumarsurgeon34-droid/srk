/* SRK Office for Windows: runs SRK, SRK Docs, SRK Slides, SRK Sheets and SRK Notes in their own windows.
   Each app is the same web app as on Android; this file gives it what the Android shell gave it
   (saving, sharing, printing, opening files, internet for Copilot) through the same SRKAndroid bridge. */
'use strict';
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu, session, nativeImage, clipboard, Tray, Notification } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), { pathToFileURL } = require('url');

const APPS = {
  pdf:    { name: 'SRK',        color: '#2F5DD8', exts: ['pdf'] },
  docs:   { name: 'SRK Docs',   color: '#2F5DD8', exts: ['docx', 'doc', 'txt', 'md', 'html', 'htm', 'odt', 'rtf'] },
  slides: { name: 'SRK Slides', color: '#E8710A', exts: ['pptx', 'ppt', 'odp'] },
  sheets: { name: 'SRK Sheets', color: '#1E7B47', exts: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'] },
  notes:  { name: 'SRK Notes',  color: '#7B2FB0', exts: ['srknotes'] },
  share:  { name: 'SRK Share',  color: '#0B8A87', exts: [] },
  torrent: { name: 'SRK Torrent', color: '#B3245B', exts: ['torrent'] },
};
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', wasm: 'application/wasm', map: 'application/json' };
const iconPath = k => app.isPackaged ? path.join(process.resourcesPath, 'icons', k + '.ico') : path.join(__dirname, 'build', 'icons', k + '.ico');

protocol.registerSchemesAsPrivileged([{ scheme: 'srk', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);
app.setAppUserModelId('in.shazverse.srkoffice');

if (!app.requestSingleInstanceLock()) { app.quit(); }

/* ---------- which app / file a command line asks for ---------- */
function parseArgs(argv) {
  let key = null, file = null, magnet = null;
  for (const a of argv.slice(1)) {
    const m = /^--app=(\w+)$/.exec(a); if (m && APPS[m[1]]) { key = m[1]; continue; }
    if (/^magnet:\?/i.test(a)) { magnet = a; key = 'torrent'; continue; }
    if (a.startsWith('-') || a === '.' || /electron(\.exe)?$/i.test(a) || /main\.js$/i.test(a)) continue;
    try { if (fs.existsSync(a) && fs.statSync(a).isFile()) file = path.resolve(a); } catch (e) { }
  }
  if (file && !key) { const ext = path.extname(file).slice(1).toLowerCase(); key = Object.keys(APPS).find(k => APPS[k].exts.includes(ext)) || null; }
  return { key, file, magnet };
}

/* ---------- windows ---------- */
const wins = new Map();            // webContents.id -> {key, win, incoming}
let launcher = null;
function stateFile(key) { return path.join(app.getPath('userData'), `window-${key}.json`); }
function openApp(key, file) {
  const existing = [...wins.values()].find(w => w.key === key && !w.win.isDestroyed());
  if (existing && !file) { if (existing.win.isMinimized()) existing.win.restore(); existing.win.focus(); return existing.win; }
  let st = { width: 1280, height: 820 }; try { st = { ...st, ...JSON.parse(fs.readFileSync(stateFile(key), 'utf8')) }; } catch (e) { }
  const win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y, minWidth: 360, minHeight: 480, show: false, title: APPS[key].name,
    icon: iconPath(key), backgroundColor: '#ffffff', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, spellcheck: true },
  });
  if (st.max) win.maximize();
  const rec = { key, win, incoming: file ? { path: file, name: path.basename(file), delivered: false } : null };
  wins.set(win.webContents.id, rec);
  win.once('ready-to-show', () => win.show());
  win.on('close', () => { try { const b = win.getNormalBounds(); fs.writeFileSync(stateFile(key), JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) { } });
  win.on('closed', () => { wins.delete(rec.id); });
  rec.id = win.webContents.id;
  win.webContents.on('page-title-updated', e => e.preventDefault());
  win.webContents.on('did-finish-load', () => setTimeout(() => deliver(rec), 1500));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('srk://')) { e.preventDefault(); if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url); } });
  win.loadURL(`srk://${key}/index.html`);
  if (launcher && !launcher.isDestroyed()) launcher.close();
  return win;
}
function deliver(rec) {
  if (!rec.incoming || rec.incoming.delivered || rec.win.isDestroyed()) return;
  rec.incoming.delivered = true;
  rec.win.webContents.executeJavaScript(`window.srkOpenIncoming && window.srkOpenIncoming(${JSON.stringify(rec.incoming.name)})`).catch(() => { });
}
function openLauncher() {
  if (launcher && !launcher.isDestroyed()) { launcher.focus(); return; }
  launcher = new BrowserWindow({ width: 760, height: 520, resizable: true, title: 'SRK Office', icon: iconPath('office'), autoHideMenuBar: true, backgroundColor: '#13151d',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false } });
  launcher.loadFile(path.join(__dirname, 'launcher.html'));
  launcher.on('closed', () => { launcher = null; });
}
function route(argv) {
  const { key, file, magnet } = parseArgs(argv);
  if (key === 'torrent') { openApp('torrent'); if (file) torrent.call('stageFile', file); if (magnet) torrent.ui({ type: 'incomingMagnet', uri: magnet }); }
  else if (key) openApp(key, file);
  else if (!wins.size) openLauncher();
  else { const w = [...wins.values()][0].win; if (w.isMinimized()) w.restore(); w.focus(); }
}
app.on('second-instance', (e, argv) => route(argv));

/* ---------- the bridge (same names the Android apps call) ---------- */
const recOf = e => wins.get(e.sender.id);
const docsDir = () => { const d = path.join(app.getPath('documents'), 'SRK'); try { fs.mkdirSync(d, { recursive: true }); } catch (e) { } return d; };
const safe = n => String(n || 'file').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150);
ipcMain.on('srk:saveFile', (e, name, mime, b64) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    const ext = path.extname(name).slice(1);
    const target = dialog.showSaveDialogSync(win, { defaultPath: path.join(docsDir(), safe(name)), filters: ext ? [{ name: ext.toUpperCase() + ' file', extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : undefined });
    if (!target) { e.returnValue = 'ok'; return; }      // cancelled: nothing to report
    fs.writeFileSync(target, Buffer.from(b64, 'base64'));
    e.returnValue = 'ok';
  } catch (err) { e.returnValue = 'error'; }
});
ipcMain.on('srk:shareFile', (e, name, mime, b64) => {
  // Windows has no share sheet for apps like this; save it and show it in File Explorer, ready to attach or send
  try {
    const dir = path.join(docsDir(), 'Shared'); fs.mkdirSync(dir, { recursive: true });
    let f = path.join(dir, safe(name)); let n = 2; const base = f.replace(/(\.[^.]+)?$/, ''), ext = path.extname(f); while (fs.existsSync(f)) f = `${base} (${n++})${ext}`;
    fs.writeFileSync(f, Buffer.from(b64, 'base64')); shell.showItemInFolder(f); e.returnValue = 'ok';
  } catch (err) { e.returnValue = 'error'; }
});
ipcMain.on('srk:openFile', (e, name, mime, b64) => {
  try { const dir = path.join(os.tmpdir(), 'srk-open'); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, safe(name)); fs.writeFileSync(f, Buffer.from(b64, 'base64')); shell.openPath(f).then(err => { if (err) shell.showItemInFolder(f); }); e.returnValue = 'ok'; }
  catch (err) { e.returnValue = 'error'; }
});
ipcMain.on('srk:http', async (e, id, method, url, headersJson, body) => {
  let status = 0, out = Buffer.alloc(0);
  try {
    const headers = headersJson ? JSON.parse(headersJson) : {};
    const r = await net.fetch(url, { method: method || 'GET', headers, body: body || undefined });
    status = r.status; out = Buffer.from(await r.arrayBuffer());
  } catch (err) { status = 0; out = Buffer.from(String(err && err.message || err)); }
  if (!e.sender.isDestroyed()) e.sender.executeJavaScript(`window.__srkHttp && window.__srkHttp(${JSON.stringify(id)},${status},${JSON.stringify(out.toString('base64'))})`).catch(() => { });
});
ipcMain.on('srk:print', (e, html, name) => {
  const pw = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  const f = path.join(os.tmpdir(), 'srk-print-' + Date.now() + '.html'); fs.writeFileSync(f, html);
  pw.loadFile(f).then(() => pw.webContents.print({ printBackground: true }, () => { pw.destroy(); fs.unlink(f, () => { }); }));
});
ipcMain.on('srk:pending', e => { const r = recOf(e); if (r && r.incoming && !r.incoming.delivered) { r.incoming.delivered = true; e.returnValue = r.incoming.name; } else e.returnValue = ''; });
ipcMain.on('srk:ready', e => { const r = recOf(e); if (r) deliver(r); });
ipcMain.on('srk:launch', (e, key) => { if (APPS[key]) openApp(key); });
ipcMain.on('srk:pickAndOpen', async e => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Documents', extensions: Object.values(APPS).flatMap(a => a.exts) }] });
  if (!r.canceled && r.filePaths[0]) route(['x', r.filePaths[0]]);
});

/* ---------- SRK Share: nearby file sharing (same protocol as the Android app) ---------- */
const { ShareEngine } = require('./share-engine.js');
let share = null; const shareQueue = []; let shareReady = false;
function shareWins() { return [...wins.values()].filter(w => w.key === 'share' && !w.win.isDestroyed()); }
function shareEngine() {
  if (share) return share;
  const pf = path.join(app.getPath('userData'), 'share.json'); let prefs = {}; try { prefs = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch (e) { }
  share = new ShareEngine({ name: os.hostname(), platform: 'windows', saveDir: path.join(app.getPath('downloads'), 'SRK Share'),
    prefs: { get: k => prefs[k], set: (k, v) => { prefs[k] = v; try { fs.writeFileSync(pf, JSON.stringify(prefs)); } catch (e) { } } },
    emit: ev => { const ws = shareWins(); if (!ws.length || !shareReady) { if (ev.type !== 'progress' && shareQueue.length < 500) shareQueue.push(ev); if (ev.type === 'offer') notifyOffer(ev); return; }
      const js = `window.__shareEvent && window.__shareEvent(${JSON.stringify(JSON.stringify(ev))})`; for (const w of ws) w.win.webContents.executeJavaScript(js).catch(() => { });
      if (ev.type === 'offer') for (const w of ws) { if (!w.win.isFocused()) w.win.flashFrame(true); } } });
  return share;
}
function notifyOffer(ev) { try { const { Notification } = require('electron'); const n = new Notification({ title: `${ev.from && ev.from.name || 'A device'} wants to send you ${ev.items.length} file${ev.items.length === 1 ? '' : 's'}`, body: 'Open SRK Share to accept', icon: iconPath('share') }); n.on('click', () => openApp('share')); n.show(); } catch (e) { } }
const shareCalls = {
  start: async () => { shareReady = true; await shareEngine().start(); const q = shareQueue.splice(0); const ws = shareWins(); for (const ev of q) for (const w of ws) w.win.webContents.executeJavaScript(`window.__shareEvent(${JSON.stringify(JSON.stringify(ev))})`).catch(() => { }); },
  setName: n => shareEngine().setName(n),
  pickFiles: async (e, kind) => { const F = { media: [{ name: 'Photos & videos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'mp4', 'mov', 'm4v', 'mkv', 'avi', '3gp', 'webm', 'wmv'] }], docs: [{ name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'] }], audio: [{ name: 'Music & audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'amr'] }] }[kind];
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Choose files to send', properties: ['openFile', 'multiSelections'], filters: F ? [...F, { name: 'All files', extensions: ['*'] }] : [{ name: 'All files', extensions: ['*'] }] }); if (!r.canceled) shareEngine().addPaths(r.filePaths); },
  addPaths: (e, paths) => shareEngine().addPaths((paths || []).filter(Boolean)),
  forget: (e, id) => shareEngine().forget(id),
  send: (e, peers, files, text) => shareEngine().sendTo(JSON.parse(peers || '[]'), JSON.parse(files || '[]'), text || ''),
  respond: (e, id, accept, always) => shareEngine().respond(id, accept, always),
  cancel: (e, id) => shareEngine().cancel(id),
  connect: (e, addr) => shareEngine().connect(addr).then(i => shareEngine().emit({ type: 'toast', msg: 'Connected to ' + i.name })).catch(x => shareEngine().emit({ type: 'toast', msg: x.message })),
  untrust: (e, id) => shareEngine().untrust(id),
  copy: (e, t) => clipboard.writeText(String(t || '')),
  open: (e, id, ref) => { const f = shareEngine().ref(id) || ref; if (f) shell.openPath(f).then(err => { if (err) shell.showItemInFolder(f); }); },
  showInFolder: (e, ref) => { if (ref) shell.showItemInFolder(ref); },
  openFolder: () => { const d = path.join(app.getPath('downloads'), 'SRK Share'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); },
};
ipcMain.on('share:call', (e, name, args) => { const f = shareCalls[name]; if (!f) return; try { const r = name === 'start' || name === 'setName' ? f(...args) : f(e, ...args); if (r && r.catch) r.catch(err => console.error(err)); } catch (err) { console.error(err); } });
app.on('before-quit', () => { try { if (share) share.stop(); } catch (e) { } });

/* ---------- SRK Torrent: libtorrent engine in a Java child process (same engine as Android), JSON lines over stdin/stdout ---------- */
const { spawn } = require('child_process');
const torrent = (() => {
  let proc = null, buf = '', ready = false, quitting = false, restarts = 0, seq = 0, settings = {}, tray = null; const queue = [], waiting = new Map();
  const base = app.isPackaged ? path.join(process.resourcesPath, 'torrent') : path.join(__dirname, 'torrent');
  const winsT = () => [...wins.values()].filter(w => w.key === 'torrent' && !w.win.isDestroyed());
  function ui(ev) {
    const ws = winsT();
    if (!ws.length || !ready) { if (ev.type !== 'list' && ev.type !== 'details' && ev.type !== 'creating' && queue.length < 300) queue.push(ev); return; }
    const js = `window.__torrentEvent && window.__torrentEvent(${JSON.stringify(JSON.stringify(ev))})`; for (const w of ws) w.win.webContents.executeJavaScript(js).catch(() => { });
  }
  function onEvent(ev) {
    if (ev.type === 'settings') settings = ev;
    if (ev.type === 'list') updateTray(ev);
    if (ev.type === 'finished') { const focused = winsT().some(w => w.win.isFocused()); if (!focused) try { const n = new Notification({ title: 'Download finished', body: ev.name, icon: iconPath('torrent') }); n.on('click', () => openApp('torrent')); n.show(); } catch (e) { } }
    ui(ev);
  }
  function startProc() {
    if (proc || quitting) return;
    const java = path.join(base, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    const dll = path.join(base, process.platform === 'win32' ? 'libtorrent4j.dll' : 'libtorrent4j.so');
    if (!fs.existsSync(java)) { ui({ type: 'toast', msg: 'The torrent engine is missing — reinstall SRK Office' }); return; }
    const data = path.join(app.getPath('userData'), 'torrent'); fs.mkdirSync(data, { recursive: true });
    const save = path.join(app.getPath('downloads'), 'SRK Torrent');
    const cp = [path.join(base, 'srk-torrent.jar'), path.join(base, 'libtorrent4j.jar')].join(path.delimiter);
    proc = spawn(java, ['-Xmx384m', '-XX:+UseSerialGC', '-Dfile.encoding=UTF-8', '-Dlibtorrent4j.jni.path=' + dll, '-cp', cp, 'in.shazverse.srktorrent.StdioMain', data, save, 'windows'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      try { if (line.startsWith('E ')) onEvent(JSON.parse(line.slice(2))); else if (line.startsWith('R ')) { const r = JSON.parse(line.slice(2)); const w = waiting.get(r.r); if (w) { waiting.delete(r.r); w(r.v); } } } catch (e) { } } });
    proc.stderr.on('data', d => { if (process.env.SRK_SELFTEST) torrentLog.push(String(d)); });
    proc.on('exit', code => { proc = null; buf = ''; for (const w of waiting.values()) w(null); waiting.clear();
      if (!quitting && restarts < 3) { restarts++; ui({ type: 'toast', msg: 'Restarting the torrent engine…' }); setTimeout(startProc, 1500); } });
  }
  function call(m, ...a) { startProc(); if (proc) proc.stdin.write(JSON.stringify({ m, a }) + '\n'); }
  function ask(m, ...a) { startProc(); if (!proc) return Promise.resolve(null); const r = ++seq; return new Promise(res => { waiting.set(r, res); proc.stdin.write(JSON.stringify({ m, a, r }) + '\n'); setTimeout(() => { if (waiting.has(r)) { waiting.delete(r); res(null); } }, 8000); }); }
  function flush() { ready = true; const q = queue.splice(0); const ws = winsT(); for (const ev of q) for (const w of ws) w.win.webContents.executeJavaScript(`window.__torrentEvent(${JSON.stringify(JSON.stringify(ev))})`).catch(() => { }); }
  function updateTray(ev) {
    if (!tray) return; const n = (ev.torrents || []).filter(t => t.state === 'downloading' || t.state === 'metadata').length;
    const sp = b => b < 1048576 ? Math.round(b / 1024) + ' KB/s' : (b / 1048576).toFixed(1) + ' MB/s';
    tray.setToolTip(`SRK Torrent — ${n} downloading · ↓ ${sp(ev.dl || 0)} ↑ ${sp(ev.ul || 0)}`);
  }
  function ensureTray() {
    if (tray || process.env.SRK_SELFTEST) return;
    try { tray = new Tray(iconPath('torrent')); tray.setToolTip('SRK Torrent');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open SRK Torrent', click: () => openApp('torrent') }, { label: 'Resume all', click: () => call('resumeAll') }, { label: 'Pause all', click: () => call('pauseAll') }, { type: 'separator' }, { label: 'Quit SRK Torrent', click: () => stop(true) }]));
      tray.on('click', () => openApp('torrent')); } catch (e) { }
  }
  function stop(thenQuitIfIdle) {
    return new Promise(res => { quitting = true; if (tray) { tray.destroy(); tray = null; } if (!proc) return res();
      const p = proc; const t = setTimeout(() => { try { p.kill(); } catch (e) { } res(); }, 7000); p.once('exit', () => { clearTimeout(t); res(); });
      try { p.stdin.write('quit\n'); } catch (e) { clearTimeout(t); res(); } }).then(() => { quitting = false; restarts = 0; ready = false; if (thenQuitIfIdle && !wins.size) app.quit(); });
  }
  return { ui, call, ask, flush, ensureTray, stop, running: () => !!proc, settings: () => settings };
})();
const torrentLog = [];
const torrentDir = async e => (await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Choose a folder', properties: ['openDirectory', 'createDirectory'] }));
const dirSize = p => { try { const s = fs.statSync(p); if (s.isFile()) return s.size; return fs.readdirSync(p).reduce((a, n) => a + dirSize(path.join(p, n)), 0); } catch (e) { return 0; } };
const torrentCalls = {
  start: e => { torrent.call('start'); torrent.flush(); torrent.ensureTray(); try { if (app.isPackaged && !app.isDefaultProtocolClient('magnet')) app.setAsDefaultProtocolClient('magnet'); } catch (err) { } },
  pickTorrent: async e => { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Open .torrent file', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Torrent files', extensions: ['torrent'] }, { name: 'All files', extensions: ['*'] }] }); if (!r.canceled) for (const f of r.filePaths) torrent.call('stageFile', f); },
  stageFile: (e, f) => torrent.call('stageFile', f),
  chooseFolder: async (e, purpose) => { const r = await torrentDir(e); if (!r.canceled && r.filePaths[0]) torrent.ui({ type: 'folder', purpose, path: r.filePaths[0] }); },
  createPick: async (e, kind) => { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: kind === 'folder' ? 'Choose the folder to share' : 'Choose the file to share', properties: [kind === 'folder' ? 'openDirectory' : 'openFile'] }); if (!r.canceled && r.filePaths[0]) { const p = r.filePaths[0]; torrent.ui({ type: 'createSource', path: p, name: path.basename(p), size: dirSize(p) }); } },
  open: async (e, id, i) => { const p = await torrent.ask('contentPath', id, i); if (!p) return; if (!fs.existsSync(p)) return torrent.ui({ type: 'toast', msg: 'The file isn’t there yet' }); const err = await shell.openPath(p); if (err) shell.showItemInFolder(p); },
  showInFolder: async (e, id, i) => { const p = await torrent.ask('contentPath', id, i); if (p) shell.showItemInFolder(p); },
  copyMagnet: async (e, id) => { const m = await torrent.ask('magnet', id); if (m) clipboard.writeText(m); },
  copy: (e, t) => clipboard.writeText(String(t || '')),
  paste: () => torrent.ui({ type: 'clipboard', text: clipboard.readText() }),
  openDownloads: () => { const d = torrent.settings().savePath || path.join(app.getPath('downloads'), 'SRK Torrent'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); },
  exportTorrent: async (e, id) => { const r = await torrentDir(e); if (r.canceled || !r.filePaths[0]) return; const out = await torrent.ask('exportTorrent', id, r.filePaths[0]); if (out) { torrent.ui({ type: 'toast', msg: 'Saved ' + path.basename(out) }); shell.showItemInFolder(out); } },
  shareFile: (e, p) => { if (p) shell.showItemInFolder(p); },
  quit: () => torrent.stop(true),
};
ipcMain.on('torrent:call', (e, name, args) => { try { const f = torrentCalls[name]; const r = f ? f(e, ...args) : torrent.call(name, ...args); if (r && r.catch) r.catch(err => console.error(err)); } catch (err) { console.error(err); } });
let quittingAll = false;
app.on('before-quit', ev => { if (quittingAll || !torrent.running()) return; ev.preventDefault(); quittingAll = true; torrent.stop(false).then(() => app.quit()); });

/* ---------- app files and files opened from Explorer, served at srk://<app>/... ---------- */
function serve(req) {
  const u = new URL(req.url); const key = u.hostname;
  if (u.pathname.startsWith('/incoming/')) {
    const rec = [...wins.values()].find(w => w.key === key && w.incoming);
    if (!rec) return new Response('no file', { status: 404 });
    return net.fetch(pathToFileURL(rec.incoming.path).toString());
  }
  if (!APPS[key]) return new Response('not found', { status: 404 });
  const root = path.join(__dirname, 'apps', key);
  let p = decodeURIComponent(u.pathname); if (p === '/' || !p) p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
  try { const data = fs.readFileSync(file); return new Response(data, { headers: { 'content-type': MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream' } }); }
  catch (err) { return new Response('not found', { status: 404 }); }
}

app.whenReady().then(() => {
  protocol.handle('srk', serve);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'notifications', 'speaker-selection'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ['media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen'].includes(perm));
  session.defaultSession.setSpellCheckerLanguages(['en-US', 'en-GB']);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Open a file…', accelerator: 'CmdOrCtrl+Shift+O', click: () => ipcMain.emit('srk:pickAndOpen', { sender: null }) }, { type: 'separator' }, ...Object.entries(APPS).map(([k, a]) => ({ label: 'Open ' + a.name, click: () => openApp(k) })), { type: 'separator' }, { role: 'quit', label: 'Exit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools', label: 'Developer tools' }] },
    { label: 'Help', submenu: [{ label: 'About SRK Office', click: () => dialog.showMessageBox({ title: 'SRK Office', message: 'SRK Office ' + app.getVersion(), detail: 'SRK, SRK Docs, SRK Slides, SRK Sheets, SRK Notes, SRK Share and SRK Torrent for Windows.\nShazVerse Technologies' }) }] },
  ]));
  if (process.env.SRK_SELFTEST) selftest(process.env.SRK_SELFTEST); else route(process.argv);
});

/* ---------- self-test on the build machine: open every app, record errors, take a screenshot ---------- */
async function selftest(dir) {
  fs.mkdirSync(dir, { recursive: true }); const report = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
  const csv = path.join(os.tmpdir(), 'srk-test.csv'); fs.writeFileSync(csv, 'Name,Marks\nAsha,91\nRavi,78\n');
  for (const key of Object.keys(APPS)) {
    const errs = []; const win = openApp(key, key === 'sheets' ? csv : null);
    win.webContents.on('console-message', (e, level, message, line, src) => { if (level >= 3) errs.push(message + ' @' + String(src).split('/').pop() + ':' + line); });
    win.webContents.on('did-fail-load', (e, code, desc, url) => errs.push('LOAD FAIL ' + desc + ' ' + url));
    win.webContents.on('render-process-gone', (e, d) => errs.push('CRASH ' + d.reason));
    await new Promise(r => { win.webContents.once('did-finish-load', r); setTimeout(r, 15000); }); await wait(6000);
    if (key === 'torrent') await wait(8000);
    let info = null; try { info = await win.webContents.executeJavaScript(`JSON.stringify({torrent: typeof window.SRKTorrent === 'object' ? (document.getElementById('rates')||{}).textContent : null, share: typeof window.SRKShare === 'object' ? (document.getElementById('meName')||{}).textContent : null, bridge: typeof window.SRKAndroid === 'object' && typeof SRKAndroid.saveFile, windows: !!window.SRK_WINDOWS, text: document.body.innerText.slice(0, 300), fonts: [...document.fonts].filter(f => f.status === 'loaded').length, idb: typeof indexedDB})`); } catch (e) { info = 'eval failed: ' + e.message; }
    try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, key + '.png'), img.toPNG()); } catch (e) { errs.push('capture ' + e.message); }
    report[key] = { info, errors: errs }; fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); win.destroy(); await wait(800);
  }
  report.torrentEngineLog = torrentLog.join('').slice(-4000);
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); await torrent.stop(false); app.exit(0);
}
app.on('window-all-closed', () => { if (process.env.SRK_SELFTEST) return; if (torrent.running()) return; /* keeps seeding in the tray */ app.quit(); });
