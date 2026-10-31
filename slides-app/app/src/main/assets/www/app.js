/* SRK Slides — start screen, storage, open/save/export, slide show */
'use strict';
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = Editor.h, I = Editor.I, toast = Editor.toast;
  const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const MIME = {pptx: PPTX_MIME, pdf: 'application/pdf', zip: 'application/zip', png: 'image/png'};

  /* ---------------------------------------------------------------- libraries */
  const LIBS = Object.assign({html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', pptxgen: 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js'}, window.SRK_LIBS || {});
  const loaded = {};
  function lib(name, test){ if (test()) return Promise.resolve(); return loaded[name] || (loaded[name] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = LIBS[name]; s.onload = () => res(); s.onerror = () => { delete loaded[name]; rej(new Error('Couldn’t load a component. Check your internet connection and try again.')); }; document.head.appendChild(s); })); }
  const needPptx = () => lib('pptxgen', () => window.PptxGenJS);
  const needCanvas = () => lib('html2canvas', () => window.html2canvas);

  /* ---------------------------------------------------------------- storage */
  const Store = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('srk-slides', 1); r.onupgradeneeded = () => { r.result.createObjectStore('decks', {keyPath: 'id'}); r.result.createObjectStore('meta', {keyPath: 'id'}); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch(e){ rej(e); } }));
    const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const st = t.objectStore(store); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
    return {
      async put(deck){
        const used = new Set(); const mark = s => { if (s && s.startsWith && s.startsWith('m:')) used.add(s.slice(2)); };
        deck.slides.forEach(s => { if (s.bg) mark(s.bg.image); s.objects.forEach(o => mark(o.src)); });
        const media = {}; for (const k of used) if (deck.media[k]) media[k] = deck.media[k];
        const copy = {...deck, media};
        const first = deck.slides[0]; const fm = {}; if (first){ if (first.bg && first.bg.image) mark(first.bg.image); first.objects.forEach(o => { if (o.src && o.src.startsWith('m:')) fm[o.src.slice(2)] = media[o.src.slice(2)]; }); if (first.bg && first.bg.image && first.bg.image.startsWith('m:')) fm[first.bg.image.slice(2)] = media[first.bg.image.slice(2)]; }
        const meta = {id: deck.id, name: deck.name, updated: deck.updated || Date.now(), count: deck.slides.length, first: {slide: first, media: fm, size: deck.size, theme: deck.theme, themeData: deck.themeData}};
        await tx('decks', 'readwrite', st => st.put(copy)); await tx('meta', 'readwrite', st => st.put(meta));
      },
      get: id => tx('decks', 'readonly', st => st.get(id)),
      list: async () => ((await tx('meta', 'readonly', st => st.getAll())) || []).sort((a, b) => b.updated - a.updated),
      del: async id => { await tx('decks', 'readwrite', st => st.delete(id)); await tx('meta', 'readwrite', st => st.delete(id)); },
    };
  })();

  /* ---------------------------------------------------------------- saving files */
  let downloads = null;
  const dlReady = (async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch(e){ downloads = null; } })();
  const extOf = n => (n.split('.').pop() || '').toLowerCase();
  async function saveFile(data, name){
    await dlReady; const blob = data instanceof Blob ? data : new Blob([data], {type: MIME[extOf(name)] || 'application/octet-stream'});
    if (downloads){ try { await downloads.save({filename: name, data: blob}); toast(window.SRK_NATIVE ? `Saved to Downloads › SRK Slides: ${name}` : `Saved ${name}`, 3400); return true; }
      catch(e){ if (e && e.code === 'perm'){ toast('Allow storage access for SRK Slides, then save again.', 4200); return false; } if (window.SRK_NATIVE){ toast('Couldn’t save the file.', 3000); return false; } } }
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast(`Downloading ${name}`); return true; }
    catch(e){ toast('Saving files isn’t available here. Open SRK Slides in Chrome or in the app.', 4200); return false; }
  }
  async function shareFile(data, name){
    const blob = data instanceof Blob ? data : new Blob([data], {type: MIME[extOf(name)] || 'application/octet-stream'});
    if (window.srkShare) return window.srkShare(blob, name);
    const f = new File([blob], name, {type: blob.type});
    if (navigator.canShare && navigator.canShare({files: [f]})){ try { await navigator.share({files: [f], title: name}); } catch(e){} return; }
    return saveFile(blob, name);
  }
  const cleanName = (n, ext) => (String(n || 'Presentation').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Presentation') + '.' + ext;

  /* ---------------------------------------------------------------- busy */
  function busy(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); }
  function unbusy(){ $('#toast').hidden = true; }

  /* ---------------------------------------------------------------- images */
  function imageToData(file){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => {
        const w = im.naturalWidth, hh = im.naturalHeight, max = 1920; const k = Math.min(1, max / Math.max(w, hh));
        const keepPng = /png|gif|svg/.test(file.type) && file.size < 700000 && k === 1;
        if (k === 1 && (keepPng || (/jpe?g/.test(file.type) && file.size < 900000))){ const fr = new FileReader(); fr.onload = () => { URL.revokeObjectURL(url); res({src: fr.result, w, h: hh}); }; fr.onerror = rej; fr.readAsDataURL(file); return; }
        const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k); const x = c.getContext('2d');
        if (!/png|gif|svg/.test(file.type)){ x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res({src: /png|gif|svg/.test(file.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height});
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
      im.src = url;
    });
  }

  /* ---------------------------------------------------------------- open */
  function fromPptx(model, name){
    const deck = {id: uid(), name, theme: 'custom', themeData: {name: 'From file', bg: '#FFFFFF', title: '#1F1F1F', text: '#1F1F1F', accent: '#4472C4', accent2: '#ED7D31', head: model.fonts.head || 'Calibri Light', body: model.fonts.body || 'Calibri', deco: 'none'},
      size: model.size, media: {}, slides: [], updated: Date.now()};
    const put = src => { const id = uid(); deck.media[id] = src; return 'm:' + id; };
    for (const s of model.slides){
      const sl = {id: uid(), layout: null, bg: s.bg ? {...s.bg} : null, transition: s.transition || 'none', notes: s.notes || '', objects: s.objects};
      if (sl.bg && sl.bg.image) sl.bg.image = put(sl.bg.image);
      for (const o of sl.objects) if (o.kind === 'image' && o.src && o.src.startsWith('data:')) o.src = put(o.src);
      deck.slides.push(sl);
    }
    if (!deck.slides.length) deck.slides.push({id: uid(), layout: 'blank', bg: null, transition: 'none', notes: '', objects: []});
    return deck;
  }
  async function openBytes(bytes, name){
    busy('Opening…');
    try { const model = await readPptx(new Uint8Array(bytes)); const deck = fromPptx(model, name.replace(/\.(pptx|ppt|potx)$/i, '')); await Store.put(deck); unbusy(); edit(deck); }
    catch(e){ unbusy(); toast(e.message || 'Couldn’t open that file.', 5200); console.error(e); }
  }
  async function openFile(file){ if (!file) return; if (/\.pdf$/i.test(file.name)){ toast('That’s a PDF. SRK Slides opens PowerPoint (.pptx) files.', 4000); return; } openBytes(await file.arrayBuffer(), file.name); }
  async function photosToDeck(files){
    if (!files.length) return; busy(`Adding ${files.length} photo${files.length > 1 ? 's' : ''}…`);
    const deck = makeDeck('Photo album', 'slate'); deck.slides = [];
    const W = deck.size.w, H = deck.size.h;
    for (const f of files){ try { const d = await imageToData(f); const id = uid(); deck.media[id] = d.src; const k = Math.min(W / d.w, H / d.h); const w = Math.round(d.w * k), hh = Math.round(d.h * k);
      deck.slides.push({id: uid(), layout: 'blank', bg: {color: '#000000'}, noDeco: true, transition: 'fade', notes: '', objects: [{id: uid(), kind: 'image', src: 'm:' + id, x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2), w, h: hh, rot: 0}]}); } catch(e){} }
    unbusy(); if (!deck.slides.length){ toast('Couldn’t read those photos'); return; }
    await Store.put(deck); edit(deck);
  }
  window.srkOpenIncoming = async name => { try { const r = await fetch('/incoming/file'); if (!r.ok) throw 0; openBytes(await r.arrayBuffer(), name || 'Presentation.pptx'); } catch(e){ toast('Couldn’t open the file you shared.', 4000); } };

  /* ---------------------------------------------------------------- export */
  function exportModel(deck){
    const th = themeOf(deck);
    const slides = deck.slides.map(s => {
      const objects = [];
      if (!(s.bg && s.bg.image) && !s.noDeco) objects.push(...themeDeco(th, deck.size, s.layout).map(o => ({...o, resolved: resolve(o, th)})));
      for (const o of s.objects){ if (o.picSlot) continue; if (o.kind === 'box' && o.ph && !(o.html || '').replace(/<[^>]+>/g, '').trim()) continue;
        const c = {...o, resolved: resolve(o, th)}; if (c.kind === 'image') c.src = mediaSrc(deck, c.src); objects.push(c); }
      return {...s, objects};
    });
    return {...deck, slides};
  }
  async function makePptx(){
    Editor.flush(); await needPptx(); const deck = Editor.deck;
    return writePptx(exportModel(deck), {resolveBg: async s => { const bg = slideBg(s, deck); return bg.image ? {image: mediaSrc(deck, bg.image)} : {color: bg.color}; }});
  }
  async function savePptx(){ try { busy('Saving PowerPoint file…'); const b = await makePptx(); unbusy(); await saveFile(new Blob([b], {type: PPTX_MIME}), cleanName(Editor.deck.name, 'pptx')); } catch(e){ unbusy(); toast(e.message || 'Couldn’t save.', 4000); console.error(e); } }
  async function slideCanvases(onEach, scaleK = 2){
    Editor.flush(); await needCanvas(); const deck = Editor.deck; const host = h('div', {class: 'offscreen'}); document.body.appendChild(host);
    try {
      await document.fonts.ready;
      for (let i = 0; i < deck.slides.length; i++){
        busy(`Rendering slide ${i + 1} of ${deck.slides.length}…`);
        host.innerHTML = ''; const el = renderSlide(deck.slides[i], deck, {edit: false}); el.style.position = 'relative'; host.appendChild(el);
        await Promise.all([...el.querySelectorAll('img')].map(im => im.decode ? im.decode().catch(() => {}) : null));
        const c = await html2canvas(el, {scale: scaleK, backgroundColor: null, logging: false, useCORS: true, width: deck.size.w, height: deck.size.h, windowWidth: deck.size.w + 40});
        await onEach(c, i);
      }
    } finally { host.remove(); }
  }
  async function savePdf(share){
    try {
      const deck = Editor.deck; const pdf = await PDFLib.PDFDocument.create(); pdf.setTitle(deck.name); pdf.setCreator('SRK Slides');
      await slideCanvases(async c => { const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const img = await pdf.embedJpg(await jpg.arrayBuffer()); const p = pdf.addPage([deck.size.w, deck.size.h]); p.drawImage(img, {x: 0, y: 0, width: deck.size.w, height: deck.size.h}); });
      const bytes = await pdf.save(); unbusy(); const blob = new Blob([bytes], {type: 'application/pdf'});
      share ? shareFile(blob, cleanName(deck.name, 'pdf')) : saveFile(blob, cleanName(deck.name, 'pdf'));
    } catch(e){ unbusy(); toast(e.message || 'Couldn’t make the PDF.', 4000); console.error(e); }
  }
  async function savePngs(){
    try { const deck = Editor.deck; const z = new JSZip();
      await slideCanvases(async (c, i) => { const b = await new Promise(r => c.toBlob(r, 'image/png')); z.file(`${cleanName(deck.name, 'x').slice(0, -2)} - slide ${String(i + 1).padStart(2, '0')}.png`, b); });
      busy('Packing pictures…'); const zip = await z.generateAsync({type: 'blob', mimeType: 'application/zip'}); unbusy(); saveFile(zip, cleanName(deck.name + ' slides', 'zip'));
    } catch(e){ unbusy(); toast(e.message || 'Couldn’t export pictures.', 4000); console.error(e); }
  }
  async function saveOnePng(){
    try { const deck = Editor.deck, idx = Editor.cur; Editor.flush(); await needCanvas(); const host = h('div', {class: 'offscreen'}); document.body.appendChild(host);
      const el = renderSlide(deck.slides[idx], deck, {edit: false}); el.style.position = 'relative'; host.appendChild(el); await document.fonts.ready;
      const c = await html2canvas(el, {scale: 2, backgroundColor: null, logging: false, width: deck.size.w, height: deck.size.h}); host.remove();
      const b = await new Promise(r => c.toBlob(r, 'image/png')); saveFile(b, cleanName(`${deck.name} - slide ${idx + 1}`, 'png'));
    } catch(e){ toast(e.message || 'Couldn’t export the picture.', 4000); }
  }

  /* ---------------------------------------------------------------- dialogs */
  function dialog(title, body, actions){
    document.querySelectorAll('.dlg-back').forEach(d => d.remove());
    const back = h('div', {class: 'dlg-back'}); const box = h('div', {class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title}, h('h3', {}, title), body, h('div', {class: 'acts'}, ...actions.map(([label, cls, fn]) => h('button', {class: 'btn ' + (cls || ''), type: 'button', onclick: async () => { if ((await (fn && fn())) !== false) back.remove(); }}, label))));
    back.append(box); back.addEventListener('click', e => { if (e.target === back) back.remove(); }); document.body.append(back); const f = box.querySelector('input'); if (f) setTimeout(() => f.focus(), 30); return back;
  }

  /* ---------------------------------------------------------------- file menu */
  const FI = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  function fileMenu(){
    Editor.flush(); Editor.closePop(); const deck = Editor.deck;
    const close = () => m.remove();
    const item = (icon, label, sub, fn) => h('button', {class: 'fm-item', type: 'button', onclick: () => { close(); fn(); }, html: icon + `<span>${label}<small>${sub}</small></span>`});
    const openItem = h('label', {class: 'fm-item filepick', html: FI('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') + '<span>Open<small>A PowerPoint file (.pptx) from your phone</small></span>'});
    const oi = h('input', {type: 'file', accept: '.pptx,.ppt,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint', class: 'fileover'}); oi.addEventListener('change', () => { const f = oi.files[0]; close(); if (f) openFile(f); }); openItem.append(oi);
    const m = h('div', {class: 'filemenu', role: 'dialog', 'aria-label': 'File'},
      h('header', {class: 'bar gut'}, h('button', {class: 'ib', type: 'button', 'aria-label': 'Close', onclick: close, html: FI('<path d="M15 18l-6-6 6-6"/>')}), h('b', {style: 'font-size:17px;padding-left:4px'}, 'File')),
      h('div', {class: 'fm-scroll gut'}, h('div', {class: 'fm-wrap'},
        item(FI('<path d="M12 5v14M5 12h14"/>'), 'New', 'Start from a template', () => goHome()),
        openItem,
        h('div', {class: 'fm-sep'}),
        item(FI('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'), 'Save as PowerPoint', 'A .pptx file that opens in PowerPoint and Google Slides', savePptx),
        item(FI('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 14h6M10 17h4"/>'), 'Save as PDF', 'Every slide as a PDF page, for printing or sending', () => savePdf(false)),
        item(FI('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'), 'Save this slide as a picture', 'PNG image of the current slide', saveOnePng),
        item(FI('<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>'), 'Save all slides as pictures', 'A .zip of PNG images', savePngs),
        h('div', {class: 'fm-sep'}),
        item(FI('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>'), 'Share as PowerPoint', 'Send to WhatsApp, Gmail or Drive', async () => { try { busy('Preparing…'); const b = await makePptx(); unbusy(); shareFile(new Blob([b], {type: PPTX_MIME}), cleanName(deck.name, 'pptx')); } catch(e){ unbusy(); toast(e.message || 'Couldn’t share.'); } }),
        item(FI('<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>'), 'Share as PDF', 'Send the slides as a PDF', () => savePdf(true)),
        h('div', {class: 'fm-sep'}),
        item(FI('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), 'Rename', deck.name, () => { const inp = h('input', {class: 'inp', value: deck.name}); dialog('Rename', inp, [['Cancel'], ['Rename', 'primary', () => { deck.name = inp.value.trim() || 'Presentation'; $('#docTitle').value = deck.name; Editor.deck.updated = Date.now(); scheduleSave(); }]]); }),
        item(FI('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'), 'Info', 'Slides, words and size', info),
        item(FI('<path d="M5 5l14 14M19 5L5 19"/>'), 'Close', 'Back to your presentations', () => goHome()),
      )));
    document.body.append(m);
  }
  function info(){
    const deck = Editor.deck; let words = 0, pics = 0, notes = 0;
    for (const s of deck.slides){ if (s.notes) notes++; for (const o of s.objects){ if (o.kind === 'image') pics++; const t = o.kind === 'table' ? o.rows.flat().join(' ') : o.html || ''; const d = document.createElement('div'); d.innerHTML = t; words += (d.textContent.match(/\S+/g) || []).length; } }
    const dl = h('dl', {class: 'stats'}); const row = (a, b) => dl.append(h('dt', {}, a), h('dd', {}, String(b)));
    row('Slides', deck.slides.length); row('Words', words); row('Pictures', pics); row('Slides with notes', notes); row('Slide size', deck.size.w === 720 ? 'Standard 4:3' : 'Widescreen 16:9'); row('Theme', (THEMES[deck.theme] || {name: 'From file'}).name);
    dialog('Info', dl, [['Close', 'primary']]);
  }

  /* ---------------------------------------------------------------- slide show */
  let show = null;
  function present(from = 0){
    Editor.flush(); const deck = Editor.deck; if (!deck) return;
    const ov = h('div', {class: 'show', role: 'dialog', 'aria-label': 'Slide show'}); const stage = h('div', {class: 'sstage'});
    const ctl = h('div', {class: 'sctl'}); const cnt = h('span', {style: 'flex:1;font-variant-numeric:tabular-nums'});
    const bPrev = h('button', {type: 'button'}, '‹ Prev'), bNext = h('button', {type: 'button'}, 'Next ›'), bEnd = h('button', {type: 'button'}, 'End show');
    ctl.append(cnt, bPrev, bNext, bEnd); ov.append(stage, ctl); document.body.append(ov);
    show = {i: from, ov, stage, ended: false};
    if (window.SRKSlides && SRKSlides.setLandscape) try { SRKSlides.setLandscape(true); } catch(e){}
    try { if (!window.SRK_NATIVE && ov.requestFullscreen) ov.requestFullscreen().catch(() => {}); } catch(e){}
    try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => show && (show.lock = l)).catch(() => {}); } catch(e){}
    if (innerHeight > innerWidth && !window.SRKSlides){ const hint = h('div', {class: 'hintrot'}, 'Turn your phone sideways for bigger slides'); ov.append(hint); setTimeout(() => hint.remove(), 3500); }
    const draw = (anim) => {
      stage.innerHTML = ''; cnt.textContent = '';
      if (show.ended){ stage.style.cssText = ''; stage.append(h('div', {class: 'end'}, 'End of slide show. Tap to exit.')); return; }
      const s = deck.slides[show.i]; const el = renderSlide(s, deck, {edit: false}); const W = deck.size.w, H = deck.size.h;
      const k = Math.min(innerWidth / W, innerHeight / H); el.style.transform = `scale(${k})`;
      stage.style.cssText = `width:${W * k}px;height:${H * k}px;margin-left:${-W * k / 2}px;margin-top:${-H * k / 2}px`;
      const wrap = h('div', {style: `position:absolute;inset:0`}); wrap.append(el); stage.append(wrap);
      if (anim && s.transition && s.transition !== 'none') wrap.classList.add('tr-' + s.transition);
      cnt.textContent = `${show.i + 1} / ${deck.slides.length}` + (s.notes ? '  ·  Notes: ' + s.notes.slice(0, 80) + (s.notes.length > 80 ? '…' : '') : '');
    };
    const go = d => { if (!show) return; if (show.ended){ if (d < 0){ show.ended = false; draw(false); } else end(); return; } const n = show.i + d; if (n >= deck.slides.length){ show.ended = true; draw(); return; } if (n < 0) return; show.i = n; draw(d > 0); };
    const end = () => { if (!show) return; try { show.lock && show.lock.release(); } catch(e){} show = null; ov.remove(); document.removeEventListener('keydown', key); removeEventListener('resize', rs);
      if (window.SRKSlides && SRKSlides.setLandscape) try { SRKSlides.setLandscape(false); } catch(e){} try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e){} Editor.layoutStage(); };
    const key = e => { if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)){ e.preventDefault(); go(1); } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)){ e.preventDefault(); go(-1); } else if (e.key === 'Escape'){ e.preventDefault(); end(); } else if (e.key === 'Home'){ show.i = 0; show.ended = false; draw(); } else if (e.key === 'End'){ show.i = deck.slides.length - 1; show.ended = false; draw(); } };
    const rs = () => show && draw(false);
    document.addEventListener('keydown', key); addEventListener('resize', rs);
    document.addEventListener('fullscreenchange', function fc(){ if (!document.fullscreenElement && show && !window.SRK_NATIVE && show.fs){ end(); } if (document.fullscreenElement && show) show.fs = true; if (!show) document.removeEventListener('fullscreenchange', fc); });
    bPrev.addEventListener('click', e => { e.stopPropagation(); go(-1); }); bNext.addEventListener('click', e => { e.stopPropagation(); go(1); }); bEnd.addEventListener('click', e => { e.stopPropagation(); end(); });
    let sx = null, sy = null, st = 0, uiT;
    const ui = () => { ov.classList.add('ui'); clearTimeout(uiT); uiT = setTimeout(() => ov.classList.remove('ui'), 2600); };
    ov.addEventListener('pointerdown', e => { if (e.target.closest('.sctl')) return; sx = e.clientX; sy = e.clientY; st = Date.now(); });
    ov.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') ui(); });
    ov.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){ go(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12){ if (e.pointerType !== 'mouse' && !ov.classList.contains('ui') && e.clientY > innerHeight * 0.75){ ui(); return; } go(e.clientX < innerWidth * 0.3 ? -1 : 1); } });
    draw(false); ui();
  }

  /* ---------------------------------------------------------------- views */
  let saveT = null;
  function scheduleSave(){ $('#savedLbl').textContent = 'Saving…'; clearTimeout(saveT); saveT = setTimeout(async () => { try { await Store.put(Editor.deck); $('#savedLbl').textContent = 'Saved on this phone'; } catch(e){ $('#savedLbl').textContent = 'Not saved'; } }, 900); }
  Editor.onChange = () => scheduleSave();
  function edit(deck){
    $('#startView').hidden = true; $('#editView').hidden = false; $('#docTitle').value = deck.name; $('#savedLbl').textContent = 'Saved on this phone';
    Editor.open(deck); try { history.pushState({v: 'edit'}, ''); } catch(e){}
  }
  async function goHome(){
    if (Editor.deck){ Editor.flush(); clearTimeout(saveT); try { await Store.put(Editor.deck); } catch(e){} }
    document.querySelectorAll('.filemenu,.pop,.dlg-back').forEach(n => n.remove());
    $('#editView').hidden = true; $('#startView').hidden = false; renderRecent();
  }
  function renderTemplates(){
    const box = $('#tpls'); box.innerHTML = '';
    for (const t of TEMPLATES){ const mini = h('div', {class: 'mini'}); const b = h('button', {class: 'tpl', type: 'button'}, mini, h('b', {}, t.name), h('small', {}, t.sub));
      b.addEventListener('click', async () => { const d = t.make(); try { await Store.put(d); } catch(e){} edit(d); }); box.append(b);
      const demo = t.make(); requestAnimationFrame(() => miniSlide(mini, demo.slides[0], demo)); }
    addEventListener('resize', () => { box.querySelectorAll('.mini').forEach(m => { const s = m.firstChild; if (s) s.style.transform = `scale(${m.clientWidth / parseFloat(s.style.width)})`; }); });
  }
  function renderOpen(){
    const row = $('#openRow'); row.innerHTML = '';
    const ob = h('label', {class: 'btn primary filepick', html: FI('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>').replace('<svg', '<svg width="18" height="18"') + 'Open PowerPoint file'});
    const oi = h('input', {type: 'file', accept: '.pptx,.ppt,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint', class: 'fileover', 'aria-label': 'Open PowerPoint file'}); oi.addEventListener('change', () => { const f = oi.files[0]; oi.value = ''; openFile(f); }); ob.append(oi);
    const pb = h('label', {class: 'btn filepick', html: FI('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>').replace('<svg', '<svg width="18" height="18"') + 'Photos → slides'});
    const pi = h('input', {type: 'file', accept: 'image/*', multiple: true, class: 'fileover', 'aria-label': 'Make slides from photos'}); pi.addEventListener('change', () => { const f = [...pi.files]; pi.value = ''; photosToDeck(f); }); pb.append(pi);
    row.append(ob, pb, h('p', {class: 'hint', style: 'flex-basis:100%'}, 'Opens .pptx files from PowerPoint, Google Slides and Keynote. Photos → slides makes one slide per photo.'));
  }
  async function renderRecent(){
    const box = $('#recent'); let list = []; try { list = await Store.list(); } catch(e){}
    if (!list.length){ box.innerHTML = '<div class="empty">Presentations you create or open appear here.</div>'; return; }
    box.innerHTML = '';
    for (const m of list.slice(0, 40)){
      const mini = h('div', {class: 'rmini'});
      const meta = h('button', {class: 'meta', type: 'button'}, h('b', {}, m.name), h('small', {}, `${m.count} slide${m.count === 1 ? '' : 's'} · ${new Date(m.updated).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}`));
      meta.addEventListener('click', async () => { const d = await Store.get(m.id); if (d) edit(d); else toast('That presentation is no longer here'); });
      const del = h('button', {class: 'ib', type: 'button', 'aria-label': `Delete ${m.name}`, title: 'Delete', html: I.trash});
      del.addEventListener('click', () => dialog('Delete presentation?', h('p', {style: 'margin:0'}, `“${m.name}” will be removed from this phone. Files you saved stay in Downloads.`), [['Cancel'], ['Delete', 'danger', async () => { await Store.del(m.id); renderRecent(); }]]));
      box.append(h('div', {class: 'rrow'}, mini, meta, del));
      if (m.first && m.first.slide){ const d = {size: m.first.size, theme: m.first.theme, themeData: m.first.themeData, media: m.first.media || {}}; requestAnimationFrame(() => miniSlide(mini, m.first.slide, d)); }
    }
  }
  function toggleTheme(){ const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('srk-slides-theme', r.dataset.theme); } catch(e){} }

  /* ---------------------------------------------------------------- init */
  try { const t = localStorage.getItem('srk-slides-theme'); if (t) document.documentElement.dataset.theme = t; } catch(e){}
  $('#homeBtn').addEventListener('click', goHome);
  $('#saveBtn').addEventListener('click', savePptx);
  $('#playBtn').addEventListener('click', () => present(Editor.cur));
  $('#docTitle').addEventListener('change', () => { if (!Editor.deck) return; Editor.deck.name = $('#docTitle').value.trim() || 'Presentation'; $('#docTitle').value = Editor.deck.name; Editor.deck.updated = Date.now(); scheduleSave(); });
  $('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  addEventListener('popstate', () => { if (show){ return; } if (!$('#editView').hidden) goHome(); });
  if (!window.SRK_NATIVE){ try { if (window.self !== window.top) $('#tipBox').hidden = false; } catch(e){ $('#tipBox').hidden = false; } }
  renderTemplates(); renderOpen(); renderRecent();
  if (window.SRK_NATIVE && window.SRKSlides && SRKSlides.pendingIncoming){ try { const n = SRKSlides.pendingIncoming(); if (n) window.srkOpenIncoming(n); } catch(e){} }

  return {imageToData, fileMenu, present, savePptx, toggleTheme, Store, makePptx, exportModel, openBytes};
})();
