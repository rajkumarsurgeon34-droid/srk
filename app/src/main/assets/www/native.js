/* SRK Android bridge: saving, sharing and PDFs opened from other apps */
'use strict';
window.SRK_NATIVE = true;
window.SRK_LIBS = { html2canvas: 'libs/html2canvas.min.js', pptx: 'libs/pptxgen.bundle.js' };
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.js';
(function(){
  const toB64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i+0x8000)); return btoa(s); };
  const asBlob = (data, name) => data instanceof Blob ? data : new Blob([data], {type: (typeof MIME!=='undefined' && MIME[(name.split('.').pop()||'').toLowerCase()]) || 'application/octet-stream'});
  const downloads = { async save({filename, data}){
    if (!window.SRKAndroid) throw {code:'unavailable'};
    const blob = asBlob(data, filename); const r = window.SRKAndroid.saveFile(filename, blob.type || 'application/octet-stream', await toB64(blob));
    if (r === 'ok') return {status:'saved'}; throw {code: r === 'perm' ? 'perm' : 'unavailable', message: r}; } };
  window.claude = { use: async n => n === 'downloads' ? downloads : null };
  window.srkShare = async (data, name) => {
    if (!window.SRKAndroid) return; const blob = asBlob(data, name);
    const r = window.SRKAndroid.shareFile(name, blob.type || 'application/octet-stream', await toB64(blob));
    if (r !== 'ok' && typeof toast === 'function') toast('Couldn’t open the share menu.');
  };
  window.srkOpenIncoming = async name => {
    try { const res = await fetch('/incoming/file?t=' + Date.now()); if (!res.ok) throw 0;
      const bytes = new Uint8Array(await res.arrayBuffer()); await openInReader(bytes, name || 'document.pdf');
    } catch (e) { if (typeof toast === 'function') toast('That PDF couldn’t be opened.'); }
  };
})();
