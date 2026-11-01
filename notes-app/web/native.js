/* SRK Notes Android bridge: saving, sharing, opening attachments, files shared from other apps */
'use strict';
window.SRK_NATIVE = true;
(function(){ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'fonts/fonts.css'; document.head.appendChild(l); })();
window.SRK_LIBS = { pdfjs: 'libs/pdf.min.js', pdfjsWorker: 'libs/pdf.worker.min.js', html2canvas: 'libs/html2canvas.min.js' };
(function(){
  const toB64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const MIMES = {pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', html: 'text/html', md: 'text/markdown', txt: 'text/plain', srknotes: 'application/zip'};
  const asBlob = (data, name) => data instanceof Blob && data.type ? data : new Blob([data], {type: MIMES[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'});
  const downloads = { async save({filename, data}){
    if (!window.SRKAndroid) throw {code: 'unavailable'};
    const blob = asBlob(data, filename); const r = window.SRKAndroid.saveFile(filename, blob.type || 'application/octet-stream', await toB64(blob));
    if (r === 'ok') return {status: 'saved'}; throw {code: r === 'perm' ? 'perm' : 'unavailable'}; } };
  window.claude = { use: async n => n === 'downloads' ? downloads : null };
  window.srkShare = async (data, name) => {
    if (!window.SRKAndroid) return; const blob = asBlob(data, name);
    const r = window.SRKAndroid.shareFile(name, blob.type || 'application/octet-stream', await toB64(blob));
    if (r !== 'ok' && window.UI) UI.toast('Couldn’t open the share menu.');
  };
})();
/* internet requests through the app (no browser CORS limits): srkFetch(url, {method, headers, body}) → {status, text} */
(function(){
  const waiting = new Map(); let n = 0;
  window.__srkHttp = (id, status, b64) => { const w = waiting.get(id); if (!w) return; waiting.delete(id); let text = ''; try { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); text = new TextDecoder('utf-8').decode(u); } catch(e){} w({status, text}); };
  window.srkFetch = (url, o = {}) => new Promise(res => { if (!window.SRKAndroid || !window.SRKAndroid.httpAsync){ res({status: 0, text: 'unavailable'}); return; } const id = 'h' + (++n); waiting.set(id, res); window.SRKAndroid.httpAsync(id, o.method || 'GET', url, JSON.stringify(o.headers || {}), o.body || ''); });
})();
