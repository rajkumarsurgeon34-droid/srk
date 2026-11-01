/* SRK Office for Windows: runs SRK, SRK Docs, SRK Slides, SRK Sheets and SRK Notes in their own windows.
   Each app is the same web app as on Android; this file gives it what the Android shell gave it
   (saving, sharing, printing, opening files, internet for Copilot) through the same SRKAndroid bridge. */
'use strict';
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu, session, nativeImage } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), { pathToFileURL } = require('url');

const APPS = {
  pdf:    { name: 'SRK',        color: '#2F5DD8', exts: ['pdf'] },
  docs:   { name: 'SRK Docs',   color: '#2F5DD8', exts: ['docx', 'doc', 'txt', 'md', 'html', 'htm', 'odt', 'rtf'] },
  slides: { name: 'SRK Slides', color: '#E8710A', exts: ['pptx', 'ppt', 'odp'] },
  sheets: { name: 'SRK Sheets', color: '#1E7B47', exts: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'] },
  notes:  { name: 'SRK Notes',  color: '#7B2FB0', exts: ['srknotes'] },
};
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', wasm: 'application/wasm', map: 'application/json' };
const iconPath = k => app.isPackaged ? path.join(process.resourcesPath, 'icons', k + '.ico') : path.join(__dirname, 'build', 'icons', k + '.ico');

protocol.registerSchemesAsPrivileged([{ scheme: 'srk', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);
app.setAppUserModelId('in.shazverse.srkoffice');

if (!app.requestSingleInstanceLock()) { app.quit(); }

/* ---------- which app / file a command line asks for ---------- */
function parseArgs(argv) {
  let key = null, file = null;
  for (const a of argv.slice(1)) {
    const m = /^--app=(\w+)$/.exec(a); if (m && APPS[m[1]]) { key = m[1]; continue; }
    if (a.startsWith('-') || a === '.' || /electron(\.exe)?$/i.test(a) || /main\.js$/i.test(a)) continue;
    try { if (fs.existsSync(a) && fs.statSync(a).isFile()) file = path.resolve(a); } catch (e) { }
  }
  if (file && !key) { const ext = path.extname(file).slice(1).toLowerCase(); key = Object.keys(APPS).find(k => APPS[k].exts.includes(ext)) || null; }
  return { key, file };
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
  const { key, file } = parseArgs(argv);
  if (key) openApp(key, file);
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
  if (!r.canceled && r.filePaths[0]) { const { key, file } = parseArgs(['x', r.filePaths[0]]); if (key) openApp(key, file); }
});

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
    { label: 'Help', submenu: [{ label: 'About SRK Office', click: () => dialog.showMessageBox({ title: 'SRK Office', message: 'SRK Office ' + app.getVersion(), detail: 'SRK, SRK Docs, SRK Slides, SRK Sheets and SRK Notes for Windows.\nShazVerse Technologies' }) }] },
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
    let info = null; try { info = await win.webContents.executeJavaScript(`JSON.stringify({bridge: typeof window.SRKAndroid === 'object' && typeof SRKAndroid.saveFile, windows: !!window.SRK_WINDOWS, text: document.body.innerText.slice(0, 300), fonts: [...document.fonts].filter(f => f.status === 'loaded').length, idb: typeof indexedDB})`); } catch (e) { info = 'eval failed: ' + e.message; }
    try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, key + '.png'), img.toPNG()); } catch (e) { errs.push('capture ' + e.message); }
    report[key] = { info, errors: errs }; fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); win.destroy(); await wait(800);
  }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); app.exit(0);
}
app.on('window-all-closed', () => { if (!process.env.SRK_SELFTEST) app.quit(); });
