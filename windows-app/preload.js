/* SRK Office for Windows: the same bridge the Android apps use (window.SRKAndroid and friends) */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
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
