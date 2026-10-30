/* SRK Docs — start screen, documents store, file menu, open/save/export */
'use strict';
(function(){
const toast = Editor.toast;
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', txt: 'text/plain', html: 'text/html', md: 'text/markdown' };
const extOf = n => ((String(n).match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
const baseName = n => String(n || 'Document').replace(/\.[^.]+$/, '');
const cleanName = (n, ext) => { n = String(n || 'Document').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'Document'; return n.toLowerCase().endsWith('.' + ext) ? n : n + '.' + ext; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now() + Math.random().toString(36).slice(2));
const LIBS = window.SRK_LIBS || { html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js' };
const _loaded = {};
const loadScript = k => _loaded[k] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = LIBS[k]; s.onload = res; s.onerror = () => { delete _loaded[k]; rej(new Error('A part of the app couldn’t load. Check your connection and try again.')); }; document.head.append(s); });

/* ================= storage (this device) ================= */
const Store = (() => {
  let dbp = null; const mem = new Map();
  function db(){ if (!dbp) dbp = new Promise((res) => { try { const r = indexedDB.open('srk-docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs', {keyPath: 'id'}); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch(e){ res(null); } }); return dbp; }
  async function tx(mode, fn){ const d = await db(); if (!d) return null; return new Promise((res) => { try { const t = d.transaction('docs', mode); const st = t.objectStore('docs'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => res(null); } catch(e){ res(null); } }); }
  return {
    async all(){ const r = await tx('readonly', s => s.getAll()); const list = r || [...mem.values()]; return list.sort((a, b) => b.updated - a.updated); },
    async get(id){ return (await tx('readonly', s => s.get(id))) || mem.get(id) || null; },
    async put(doc){ mem.set(doc.id, doc); await tx('readwrite', s => s.put(doc)); },
    async del(id){ mem.delete(id); await tx('readwrite', s => s.delete(id)); },
  };
})();

/* ================= saving files ================= */
let downloads;
const dlReady = (async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch(e){ downloads = null; } })();
async function saveFile(data, name){
  await Promise.race([dlReady, new Promise(r => setTimeout(r, 1500))]);
  if (!downloads){ toast('Saving files isn’t available in this view. Open SRK Docs in Chrome or in the app.', 4000); return false; }
  try { const blob = data instanceof Blob ? data : new Blob([data], {type: MIME[extOf(name)] || 'application/octet-stream'}); await downloads.save({filename: name, data: blob}); toast(window.SRK_NATIVE ? `Saved to Downloads › SRK Docs: ${name}` : `Saved ${name}`, 3200); return true; }
  catch(e){ const c = e && e.code; toast(c === 'declined' ? 'Save cancelled.' : c === 'perm' ? 'Allow SRK Docs to save files, then try again.' : 'The file couldn’t be saved here.'); return false; }
}

/* ================= templates ================= */
const today = () => new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
const TEMPLATES = [
  {id: 'blank', name: 'Blank document', html: '<p><br></p>'},
  {id: 'letter', name: 'Letter', html: () => `<p>[Your name]<br>[Street address]<br>[City, PIN code]<br>[Phone] · [Email]</p><p>${today()}</p><p>[Recipient name]<br>[Title]<br>[Organisation]<br>[Address]</p><p><b>Subject: [What this letter is about]</b></p><p>Dear [Recipient name],</p><p>[Start with why you are writing. Keep each paragraph to one idea.]</p><p>[Give the details the reader needs: dates, numbers, what has already happened.]</p><p>[Close with what you would like the reader to do next, and by when.]</p><p>Yours sincerely,</p><p><br></p><p>[Your name]<br>[Designation]</p>`},
  {id: 'resume', name: 'Resume', html: `<h1 class="title">[Your Name]</h1><p>[City] · [Phone] · [Email] · [LinkedIn or website]</p><h1>Profile</h1><p>[Two or three lines on who you are, your field, and what you are looking for.]</p><h1>Experience</h1><h2>[Job title], [Organisation]</h2><p><i>[Month Year] – [Month Year or Present]</i></p><ul><li>[What you were responsible for]</li><li>[A result you achieved, with a number if possible]</li><li>[A skill you used or developed]</li></ul><h2>[Job title], [Organisation]</h2><p><i>[Month Year] – [Month Year]</i></p><ul><li>[Responsibility or achievement]</li><li>[Responsibility or achievement]</li></ul><h1>Education</h1><p><b>[Degree]</b>, [Institution] — [Year]</p><p><b>[Degree]</b>, [Institution] — [Year]</p><h1>Skills</h1><ul><li>[Skill]</li><li>[Skill]</li><li>[Language: level]</li></ul>`},
  {id: 'report', name: 'Report', html: () => `<h1 class="title">[Report title]</h1><p><i>Prepared by [Name] · ${today()}</i></p><h1>Summary</h1><p>[The main findings in three or four sentences.]</p><h1>Background</h1><p>[Why this report was written and what question it answers.]</p><h1>Findings</h1><table><tbody><tr><th>Item</th><th>Value</th><th>Comment</th></tr><tr><td>[Item]</td><td>[Value]</td><td>[Comment]</td></tr><tr><td>[Item]</td><td>[Value]</td><td>[Comment]</td></tr></tbody></table><h1>Recommendations</h1><ol><li>[First recommendation]</li><li>[Second recommendation]</li></ol>`},
  {id: 'certificate', name: 'Medical certificate', html: () => `<p style="text-align:center"><b><span style="font-size:16pt">[Hospital / Clinic name]</span></b><br>[Address] · [Phone]</p><hr><h1 style="text-align:center;color:#000000;font-weight:700">MEDICAL CERTIFICATE</h1><p style="text-align:right">Date: ${today()}</p><p style="line-height:1.5">This is to certify that [Mr./Ms. Patient name], aged [age] years, [Male/Female], residing at [address], was examined and treated by me for <b>[diagnosis]</b> from [start date] to [end date].</p><p style="line-height:1.5">[He/She] was advised rest during this period and is fit to resume [duties / school / college] from [date].</p><p><br></p><p style="text-align:right">[Doctor’s signature]<br><b>Dr. [Name]</b><br>[Qualifications]<br>Reg. No. [Registration number]</p>`},
  {id: 'discharge', name: 'Discharge summary', html: () => `<h1 class="title">Discharge Summary</h1><table><tbody><tr><th>Patient name</th><td>[Name]</td><th>IP No.</th><td>[Number]</td></tr><tr><th>Age / Sex</th><td>[Age] / [Sex]</td><th>Ward / Bed</th><td>[Ward] / [Bed]</td></tr><tr><th>Admitted</th><td>[Date]</td><th>Discharged</th><td>${new Date().toLocaleDateString('en-GB')}</td></tr><tr><th>Consultant</th><td colspan="3">[Name, unit]</td></tr></tbody></table><h1>Diagnosis</h1><p>[Final diagnosis]</p><h1>Presenting complaints</h1><p>[Complaints and duration]</p><h1>Investigations</h1><p>[Key results]</p><h1>Procedure / treatment</h1><p>[Procedure, date, findings]</p><h1>Condition at discharge</h1><p>[Condition]</p><h1>Medications</h1><table><tbody><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th>Days</th></tr><tr><td>[Drug]</td><td>[Dose]</td><td>[Frequency]</td><td>[Days]</td></tr><tr><td>[Drug]</td><td>[Dose]</td><td>[Frequency]</td><td>[Days]</td></tr></tbody></table><h1>Advice and follow-up</h1><ul><li>[Diet and activity advice]</li><li>[Warning signs: return if …]</li><li>Review on [date] at [OPD]</li></ul>`},
];
function templateDoc(t){ return {id: uid(), name: t.id === 'blank' ? 'Untitled document' : t.name, html: typeof t.html === 'function' ? t.html() : t.html, page: {size: 'a4', orient: 'portrait', margins: {t: 1, r: 1, b: 1, l: 1}}, header: '', footer: '', pageNumbers: false, defaults: {font: 'Calibri', size: 11, after: 8, line: 1.08}, created: Date.now(), updated: Date.now()}; }

/* ================= start screen ================= */
function renderStart(){
  const box = $('#tpls'); box.innerHTML = '';
  const st = document.createElement('style'); st.textContent = Editor.docCss({defaults: {font: 'Calibri', size: 11, after: 8, line: 1.08}}, '.tplpage') + '.tplpage{background:#fff}'; box.append(st);
  for (const t of TEMPLATES){
    let mini;
    if (t.id === 'blank') mini = h('span', {class: 'mini blank', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'});
    else { const sc = h('div', {class: 'scale tplpage', 'aria-hidden': 'true', html: typeof t.html === 'function' ? t.html() : t.html}); mini = h('span', {class: 'mini'}, sc); }
    box.append(h('button', {class: 'tpl', type: 'button', onclick: () => openDoc(templateDoc(t), true)}, mini, h('b', null, t.name)));
  }
  const fit = () => $$('.mini .scale', box).forEach(s => { s.style.transform = `scale(${s.parentElement.clientWidth / 794})`; });
  requestAnimationFrame(fit); if (window.ResizeObserver) new ResizeObserver(fit).observe(box);
  const row = $('#openRow'); row.innerHTML = '';
  row.append(picker('Open a Word file', '.docx,.txt,.md,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html', true), h('span', {class: 'hint'}, '.docx, .txt and .html files'));
  renderRecent();
}
function picker(label, accept, primary){
  const inp = h('input', {type: 'file', accept, class: 'fileover', 'aria-label': label});
  inp.addEventListener('change', async () => { const f = inp.files[0]; inp.value = ''; if (f) openBytes(new Uint8Array(await f.arrayBuffer()), f.name); });
  return h('span', {class: 'btn filepick' + (primary ? ' primary' : '')}, h('span', {html: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>', style: 'display:inline-flex'}), label, inp);
}
async function renderRecent(){
  const box = $('#recent'); const list = await Store.all();
  box.innerHTML = '';
  if (!list.length){ box.append(h('div', {class: 'empty'}, 'Documents you create or open appear here.')); return; }
  const fmt = t => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? 'Today ' + d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric'}); };
  for (const d of list.slice(0, 60)){
    const row = h('div', {class: 'rrow'}, h('span', {class: 'doci', 'aria-hidden': 'true'}, 'DOC'), h('button', {class: 'meta', type: 'button', onclick: async () => openDoc(await Store.get(d.id))}, h('b', null, d.name), h('small', null, `${fmt(d.updated)} · ${(d.words || 0).toLocaleString('en-IN')} words`)));
    const del = h('button', {class: 'ib', type: 'button', 'aria-label': `Delete ${d.name}`, title: 'Delete', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>'});
    del.onclick = () => { const conf = h('span', {style: 'display:flex;gap:6px;align-items:center;flex:none'}, h('span', {class: 'hint'}, 'Delete?'), h('button', {class: 'btn sm danger', type: 'button', onclick: async () => { await Store.del(d.id); renderRecent(); toast('Deleted from this device.'); }}, 'Delete'), h('button', {class: 'btn sm', type: 'button', onclick: () => renderRecent()}, 'Keep')); del.replaceWith(conf); };
    row.append(del); box.append(row);
  }
}

/* ================= opening ================= */
function textToHtml(t){ return t.replace(/\r/g, '').split(/\n/).map(l => `<p>${l ? l.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/\t/g, '<span class="tab">\t</span>') : '<br>'}</p>`).join(''); }
function cleanHtml(s){ const d = new DOMParser().parseFromString(s, 'text/html'); d.querySelectorAll('script,style,iframe,object,embed,link,meta,noscript,form,input,button').forEach(e => e.remove()); d.querySelectorAll('*').forEach(e => { for (const a of [...e.attributes]) if (/^on/i.test(a.name) || /javascript:/i.test(a.value) || a.name === 'class' || a.name === 'id') e.removeAttribute(a.name); }); d.querySelectorAll('img').forEach(i => { if (!/^data:image\//.test(i.getAttribute('src') || '')) i.remove(); }); return d.body.innerHTML || '<p><br></p>'; }
async function openBytes(bytes, name){
  toast('Opening ' + name + '…', 1500);
  try {
    const ext = extOf(name); const zip = bytes[0] === 0x50 && bytes[1] === 0x4B; const ole = bytes[0] === 0xD0 && bytes[1] === 0xCF;
    let doc = templateDoc(TEMPLATES[0]); doc.name = baseName(name);
    if (ext === 'docx' || ext === 'docm' || ext === 'dotx' || zip || ole || ext === 'doc'){ const m = await readDocx(bytes); Object.assign(doc, {html: m.html, page: m.page, header: m.header, footer: m.footer, pageNumbers: m.pageNumbers, defaults: m.defaults}); }
    else if (ext === 'html' || ext === 'htm'){ doc.html = cleanHtml(new TextDecoder().decode(bytes)); }
    else if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'log' || !ext){ doc.html = textToHtml(new TextDecoder().decode(bytes)); }
    else throw new Error('SRK Docs opens Word (.docx), text (.txt) and web page (.html) files.');
    doc.created = doc.updated = Date.now(); await openDoc(doc, true);
  } catch(e){ console.error(e); Editor.dialog('Couldn’t open this file', [h('p', {style: 'margin:0;line-height:1.5'}, e.message || 'This file couldn’t be read.')], [['OK', () => {}, 'primary']]); }
}
window.srkOpenIncoming = async name => {
  try { const r = await fetch('/incoming/file?t=' + Date.now()); if (!r.ok) throw 0; await openBytes(new Uint8Array(await r.arrayBuffer()), name || 'document.docx'); }
  catch(e){ toast('That file couldn’t be opened.'); }
};

/* ================= editing session ================= */
let cur = null, saveT = null;
async function openDoc(doc, isNew){
  if (!doc){ toast('That document is no longer on this device.'); renderRecent(); return; }
  cur = doc; if (isNew) await Store.put({...doc, words: 0});
  $('#docTitle').value = doc.name; $('#savedLbl').textContent = isNew ? '' : 'Saved';
  $('#startView').hidden = true; $('#editView').hidden = false;
  Editor.load(doc); $('#toast').hidden = true;
  if (location.hash !== '#edit') location.hash = 'edit';
  try { localStorage.setItem('srkdocs-last', doc.id); } catch(e){}
}
async function persist(){
  if (!cur) return; clearTimeout(saveT); Editor.flush();
  const D = Editor.doc; Object.assign(cur, {html: Editor.html(), page: D.page, header: D.header, footer: D.footer, pageNumbers: D.pageNumbers, defaults: D.defaults, name: $('#docTitle').value.trim() || 'Untitled document', updated: Date.now(), words: Editor.stats().words});
  await Store.put(cur); $('#savedLbl').textContent = 'Saved';
}
Editor.onChange(() => { $('#savedLbl').textContent = 'Saving…'; clearTimeout(saveT); saveT = setTimeout(persist, 700); });
$('#docTitle').addEventListener('change', () => { if (!$('#docTitle').value.trim()) $('#docTitle').value = 'Untitled document'; persist(); });
$('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); Editor.focus(); } });
async function closeDoc(){ if (cur){ Editor.stopSpeak(); await persist(); } cur = null; $('#editView').hidden = true; $('#startView').hidden = false; Editor.closePop(); renderRecent(); }
$('#homeBtn').addEventListener('click', () => { if (location.hash === '#edit') history.back(); else closeDoc(); });
addEventListener('hashchange', () => { if (location.hash !== '#edit' && cur) closeDoc(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cur) persist(); });
$('#saveBtn').addEventListener('click', () => doFile('saveDocx'));
Editor.onFile(a => doFile(a));

/* ================= exports ================= */
function currentModel(){ const D = Editor.doc; return {html: Editor.html(), page: D.page, header: D.header || '', footer: D.footer || '', pageNumbers: !!D.pageNumbers, defaults: D.defaults, title: $('#docTitle').value.trim() || 'Document'}; }
const fileBase = () => $('#docTitle').value.trim() || 'Document';
async function makeDocx(){ return writeDocx(currentModel()); }
async function exportPdf(progress){
  await loadScript('html2canvas');
  const m = currentModel(); const g = Editor.pageGeom(); const S = 2;
  const cw = (g.w - g.ml - g.mr) * 96, ch = (g.h - g.mt - g.mb) * 96;
  const fr = h('iframe', {class: 'offscreen', 'aria-hidden': 'true', tabindex: '-1', sandbox: 'allow-same-origin'}); fr.style.width = cw + 'px'; fr.style.height = '200px'; document.body.append(fr);
  try {
    const d = fr.contentDocument; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}${Editor.docCss(m, 'body')} body .pb{border:0;margin:0;height:0} body .pb::after{display:none} body .tab{min-width:.5in}</style></head><body>${m.html}</body></html>`); d.close();
    await Promise.all([...d.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); })));
    try { await d.fonts.ready; } catch(e){}
    fr.style.height = Math.ceil(d.documentElement.scrollHeight) + 'px'; await new Promise(r => setTimeout(r, 30));
    const total = d.documentElement.scrollHeight;
    const slices = Editor.pageSlices(d.body, ch, 1, d.body.getBoundingClientRect().top);
    const pdf = await PDFLib.PDFDocument.create(); pdf.setTitle(m.title); pdf.setCreator('SRK Docs');
    const PW = Math.round(g.w * 96 * S), PH = Math.round(g.h * 96 * S);
    for (let i = 0; i < slices.length; i++){
      progress && progress(i + 1, slices.length);
      const [y0, y1] = slices[i];
      const shot = await html2canvas(d.body, {scale: S, x: 0, y: Math.floor(y0), width: Math.ceil(cw), height: Math.max(1, Math.ceil(y1 - y0)), windowWidth: Math.ceil(cw), windowHeight: total, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff', logging: false});
      const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH; const x = pc.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH);
      x.drawImage(shot, Math.round(g.ml * 96 * S), Math.round(g.mt * 96 * S));
      x.fillStyle = '#555'; x.textAlign = 'center'; x.font = `${9 * 96 / 72 * S}px ${fontStack(m.defaults.font)}`;
      if (m.header) m.header.split('\n').forEach((l, k) => x.fillText(l, PW / 2, Math.max(14 * S, g.mt * 96 * S * .5) + k * 12 * S));
      const foot = [m.footer, m.pageNumbers ? `Page ${i + 1} of ${slices.length}` : ''].filter(Boolean).join('\n');
      if (foot) foot.split('\n').forEach((l, k, arr) => x.fillText(l, PW / 2, PH - Math.max(14 * S, g.mb * 96 * S * .45) - (arr.length - 1 - k) * 12 * S));
      const jpg = await new Promise(r => pc.toBlob(r, 'image/jpeg', .9));
      const img = await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      pdf.addPage([g.w * 72, g.h * 72]).drawImage(img, {x: 0, y: 0, width: g.w * 72, height: g.h * 72});
    }
    return pdf.save();
  } finally { fr.remove(); }
}
function printHtml(){
  const m = currentModel(); const g = Editor.pageGeom();
  const cssStr = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ') + '"';
  const foot = [m.footer ? cssStr(m.footer) : '', m.pageNumbers ? `${m.footer ? '"\\A "' : ''} "Page " counter(page) " of " counter(pages)` : ''].join(' ').trim();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${m.title.replace(/[<&]/g, '')}</title><style>@page{size:${g.w}in ${g.h}in;margin:${g.mt}in ${g.mr}in ${g.mb}in ${g.ml}in;${m.header ? `@top-center{content:${cssStr(m.header)};font:9pt sans-serif;color:#555;white-space:pre}` : ''}${foot ? `@bottom-center{content:${foot};font:9pt sans-serif;color:#555;white-space:pre}` : ''}}html,body{margin:0;background:#fff}${Editor.docCss(m, 'body')} body .pb{break-after:page;border:0;margin:0;height:0} body .pb::after{display:none} body table,body img{break-inside:avoid} body h1,body h2,body h3{break-after:avoid}</style></head><body>${m.html}</body></html>`;
}

/* ================= file menu ================= */
const FI = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
function fileMenu(){
  const native = !!window.SRK_NATIVE;
  const close = () => wrap.remove();
  const item = (icon, label, note, fn) => h('button', {class: 'fm-item', type: 'button', onclick: () => { close(); fn(); }}, h('span', {html: icon, style: 'display:inline-flex'}), h('span', null, label, note ? h('small', null, note) : null));
  const openInp = h('input', {type: 'file', accept: '.docx,.txt,.md,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/html', class: 'fileover', 'aria-label': 'Open a file'});
  openInp.addEventListener('change', async () => { const f = openInp.files[0]; openInp.value = ''; close(); if (f){ await persist(); openBytes(new Uint8Array(await f.arrayBuffer()), f.name); } });
  const openItem = h('div', {class: 'fm-item filepick'}, h('span', {html: FI('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'), style: 'display:inline-flex'}), h('span', null, 'Open…', h('small', null, 'A Word, text or web page file')), openInp);
  const list = h('div', {class: 'fm-wrap'},
    item(FI('<path d="M7 3h7l4 4v14H7z"/><path d="M12 10v6M9 13h6"/>'), 'New document', 'Start from blank or a template', async () => { await persist(); history.back(); }),
    openItem, h('div', {class: 'fm-sep'}),
    item(FI('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'), 'Save as Word document', '.docx · opens in Microsoft Word and Google Docs', () => doFile('saveDocx')),
    item(FI('<path d="M7 3h7l4 4v14H7z"/><path d="M9.5 16v-4h1.5a1.3 1.3 0 0 1 0 2.6H9.5"/>'), 'Save as PDF', native ? 'Pages saved as pictures, exactly as shown' : 'Pages saved as pictures, exactly as shown', () => doFile('savePdf')),
    native ? item(FI('<path d="M7 9V3h10v6"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'), 'Print or save as PDF with text', 'Uses Android printing; text stays searchable', () => doFile('print')) : null,
    item(FI('<path d="M7 3h7l4 4v14H7z"/><path d="M9.5 12h5M9.5 15h5M9.5 18h3"/>'), 'Save as plain text', '.txt · words only, no formatting', () => doFile('saveTxt')),
    item(FI('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.8 2.6 14.2 0 17M12 3.5c-2.6 2.8-2.6 14.2 0 17"/>'), 'Save as web page', '.html · opens in any browser', () => doFile('saveHtml')),
    window.srkShare ? item(FI('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>'), 'Share as Word file', 'Send to WhatsApp, Gmail or Drive', () => doFile('share')) : null,
    h('div', {class: 'fm-sep'}),
    item(FI('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), 'Rename', null, () => { const t = $('#docTitle'); t.focus(); t.select(); }),
    item(FI('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'), 'Document info', null, info),
    item(FI('<path d="M15 18l-6-6 6-6"/>'), 'Close document', 'Back to your documents', () => history.back()),
  );
  const wrap = h('div', {class: 'filemenu', role: 'dialog', 'aria-label': 'File'},
    h('header', {class: 'bar gut'}, h('button', {class: 'ib', type: 'button', 'aria-label': 'Close file menu', onclick: close, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>'}), h('b', {style: 'font-size:17px;padding-left:4px'}, 'File')),
    h('div', {class: 'fm-scroll gut'}, list));
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(wrap);
}
function info(){
  const s = Editor.stats(); const D = Editor.doc; const g = Editor.pageGeom();
  Editor.dialog('Document info', [h('dl', {class: 'stats'},
    h('dt', null, 'Name'), h('dd', {style: 'font-family:inherit'}, $('#docTitle').value), h('dt', null, 'Pages'), h('dd', null, s.pages), h('dt', null, 'Words'), h('dd', null, s.words.toLocaleString('en-IN')),
    h('dt', null, 'Page size'), h('dd', null, `${({a4: 'A4', letter: 'Letter', legal: 'Legal'})[D.page.size]} · ${D.page.orient}`), h('dt', null, 'Margins'), h('dd', null, `${(g.mt * 2.54).toFixed(2)} / ${(g.ml * 2.54).toFixed(2)} cm`),
    h('dt', null, 'Created'), h('dd', null, new Date(cur.created).toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})), h('dt', null, 'Stored'), h('dd', {style: 'font-family:inherit'}, 'On this device'))], [['Close', () => {}, 'primary']]);
}
async function doFile(a){
  if (a === 'menu') return fileMenu();
  await persist();
  const busy = msg => toast(msg, 60000);
  try {
    if (a === 'saveDocx'){ busy('Saving Word file…'); await saveFile(await makeDocx(), cleanName(fileBase(), 'docx')); }
    else if (a === 'share'){ busy('Preparing…'); await window.srkShare(await makeDocx(), cleanName(fileBase(), 'docx')); $('#toast').hidden = true; }
    else if (a === 'savePdf'){ busy('Making PDF…'); const b = await exportPdf((i, n) => busy(`Making PDF… page ${i} of ${n}`)); await saveFile(b, cleanName(fileBase(), 'pdf')); }
    else if (a === 'print'){ if (window.SRKDocs && SRKDocs.print){ const D = Editor.doc; SRKDocs.print(printHtml(), fileBase(), D.page.size, D.page.orient); } }
    else if (a === 'saveTxt'){ await saveFile(new TextEncoder().encode($('#ed').innerText.replace(/\n{3,}/g, '\n\n')), cleanName(fileBase(), 'txt')); }
    else if (a === 'saveHtml'){ const m = currentModel(); await saveFile(new TextEncoder().encode(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.title.replace(/[<&]/g, '')}</title><style>body{max-width:${(Editor.pageGeom().w - Editor.pageGeom().ml - Editor.pageGeom().mr)}in;margin:40px auto;padding:0 16px}${Editor.docCss(m, 'body')} body .pb{border:0;margin:24px 0;height:0} body .pb::after{display:none}</style></head><body>${m.html}</body></html>`), cleanName(fileBase(), 'html')); }
  } catch(e){ console.error(e); toast(e.message || 'That didn’t work. Please try again.', 4000); }
}

/* ================= start ================= */
if (!window.SRK_NATIVE){ try { if (window.self !== window.top) $('#tipBox').hidden = false; } catch(e){ $('#tipBox').hidden = false; } }
renderStart();
(async () => {
  if (location.hash === '#edit'){ let id = null; try { id = localStorage.getItem('srkdocs-last'); } catch(e){} const d = id && await Store.get(id); if (d) openDoc(d); else history.replaceState(null, '', location.pathname + location.search); }
})();
})();
