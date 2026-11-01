/* SRK Office for Windows: the same bridge the Android apps use (window.SRKAndroid and friends) */
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const bridge = {
  saveFile: (name, mime, b64) => ipcRenderer.sendSync('srk:saveFile', name, mime, b64),
  shareFile: (name, mime, b64) => ipcRenderer.sendSync('srk:shareFile', name, mime, b64),
  openFile: (name, mime, b64) => ipcRenderer.sendSync('srk:openFile', name, mime, b64),
  httpAsync: (id, method, url, headersJson, body) => { ipcRenderer.send('srk:http', id, method, url, headersJson, body); },
  print: (html, name) => { ipcRenderer.send('srk:print', html, name); },
  pendingIncoming: () => ipcRenderer.sendSync('srk:pending'),
  ready: () => ipcRenderer.send('srk:ready'),
  setLandscape: () => {},
};
for (const n of ['SRKAndroid', 'SRKDocs', 'SRKSlides', 'SRKSheets', 'SRKNotes']) contextBridge.exposeInMainWorld(n, bridge);
contextBridge.exposeInMainWorld('SRK_WINDOWS', true);
contextBridge.exposeInMainWorld('srkOffice', { launch: k => ipcRenderer.send('srk:launch', k), openFile: () => ipcRenderer.send('srk:pickAndOpen') });

/* SRK Share: only in its own window */
if (location.hostname === 'share') {
  const call = name => (...args) => { ipcRenderer.send('share:call', name, args); return 'ok'; };
  const api = {}; for (const n of ['start', 'setName', 'pickFiles', 'forget', 'send', 'respond', 'cancel', 'connect', 'untrust', 'copy', 'open', 'showInFolder', 'openFolder']) api[n] = call(n);
  api.addDropped = () => 'ok';
  contextBridge.exposeInMainWorld('SRKShare', api);
  window.addEventListener('drop', e => { try { const paths = [...e.dataTransfer.files].map(f => webUtils.getPathForFile(f)).filter(Boolean); if (paths.length) ipcRenderer.send('share:call', 'addPaths', [paths]); } catch (err) { } }, true);
}
