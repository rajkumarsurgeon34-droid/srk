/* SRK Notes — the page: free-form note containers, rich text, tags, tables, pictures, files, recordings, links, ink, zoom, undo, find */
'use strict';
const Page = (() => {
  let p = null, pc = null, pz = null, scroller = null, inkEl = null; let z = 1, mode = 'type'; let lastNc = null, savedRange = null; let undo = [], redo = [], snapT = null; let readOnly = false;
  const RULES = {'': null, narrow: {k: 'lines', s: 22}, college: {k: 'lines', s: 26}, wide: {k: 'lines', s: 32}, gsmall: {k: 'grid', s: 16}, gmed: {k: 'grid', s: 24}, glarge: {k: 'grid', s: 36}};
  const PAD = 28, TOPY = 110;
  const cur = () => p, zoom = () => z;

  /* ---------- sanitising pasted / generated HTML ---------- */
  const OK_TAGS = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'SPAN', 'FONT', 'MARK', 'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'HR']);
  const OK_STYLE = /^(color|background-color|font-weight|font-style|text-decoration(-line)?|font-size|font-family|text-align|width|margin-left|padding-left|vertical-align)$/;
  function sanitize(html){ const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
    (function walk(n){ for (const c of [...n.childNodes]){ if (c.nodeType === 3) continue; if (c.nodeType !== 1){ c.remove(); continue; } const t = c.tagName;
      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'svg', 'SVG'].includes(t) && !(c.classList && c.classList.contains('tag'))){ if (!(c.closest && c.closest('.tag'))) { c.remove(); continue; } }
      if (c.classList && (c.classList.contains('tag') || c.classList.contains('att') || c.classList.contains('media'))) continue;
      if (!OK_TAGS.has(t)){ walk(c); c.replaceWith(...c.childNodes); continue; }
      for (const a of [...c.attributes]){ const n = a.name.toLowerCase(); if (n === 'style'){ const keep = String(a.value).split(';').map(x => x.trim()).filter(x => { const k = x.split(':')[0].trim().toLowerCase(); return OK_STYLE.test(k) && !/url\(|expression/i.test(x); }).join(';'); if (keep) c.setAttribute('style', keep); else c.removeAttribute('style'); continue; }
        if ((t === 'A' && n === 'href' && /^(https?:|mailto:|tel:|#)/i.test(a.value)) || (t === 'IMG' && (n === 'src' && /^(https?:|data:image\/)/i.test(a.value) || n === 'data-blob' || n === 'alt')) || ((t === 'TD' || t === 'TH') && (n === 'colspan' || n === 'rowspan')) || n === 'data-page' || (n === 'class' && /^(nt|pl)$/.test(a.value)) || (t === 'FONT' && (n === 'color' || n === 'face'))) continue; c.removeAttribute(a.name); }
      if (t === 'A' && c.getAttribute('href')){ c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
      if (t === 'TABLE') c.className = 'nt'; walk(c); } })(d); return d.innerHTML; }

  /* ---------- serialising a container ---------- */
  function serialize(body){ const c = body.cloneNode(true); c.querySelectorAll('mark.found').forEach(m => m.replaceWith(...m.childNodes)); c.querySelectorAll('img[data-blob]').forEach(i => { i.removeAttribute('src'); i.classList.remove('sel'); if (!i.className) i.removeAttribute('class'); }); c.querySelectorAll('.media,.att').forEach(m => { m.innerHTML = ''; }); return c.innerHTML; }
  async function hydrate(root){ for (const i of root.querySelectorAll('img[data-blob]')){ if (!i.getAttribute('src')){ const u = await M.blobURL(i.dataset.blob); if (u) i.src = u; else i.alt = '[picture unavailable]'; } }
    for (const m of root.querySelectorAll('.media')){ if (m.firstChild) continue; const u = await M.blobURL(m.dataset.blob); const kind = m.dataset.kind; const label = `${kind === 'video' ? '🎬' : '🎙'} ${m.dataset.name || (kind === 'video' ? 'Video' : 'Recording')}${m.dataset.dur ? ' · ' + fmtDur(+m.dataset.dur) : ''}${m.dataset.t ? ' · ' + fmtTime(+m.dataset.t) : ''}`;
      m.innerHTML = kind === 'video' ? `<video controls playsinline preload="metadata" src="${u}"></video><small>${esc(label)}</small>` : `<audio controls preload="metadata" src="${u}"></audio><small>${esc(label)}</small>`; }
    for (const a of root.querySelectorAll('.att')){ if (a.firstChild) continue; a.innerHTML = `${/pdf/.test(a.dataset.type || '') ? IC.pdf : IC.file}<span>${esc(a.dataset.name || 'file')}</span><small>${a.dataset.size ? fmtSize(+a.dataset.size) : ''}</small>`; }
    for (const t of root.querySelectorAll('.tag')) if (!t.firstChild && TAG[t.dataset.tag]) t.innerHTML = TAG[t.dataset.tag].svg(t.classList.contains('done')); }

  /* ---------- open / render ---------- */
  function mountShell(){ scroller = $('#cscroll'); pc = $('#pagec'); if (!pz){ pz = h('div', {class: 'pagez', style: 'position:relative'}); scroller.insertBefore(pz, pc); pz.append(pc); } }
  async function open(page){ mountShell(); await flushNow(); p = page; undo = []; redo = []; lastNc = null; Ink.clearSel(); readOnly = false; $$('.imgbar').forEach(x => x.remove()); render(); lastState = p ? state() : null; scroller.scrollTop = 0; scroller.scrollLeft = 0; UIX.syncUndo(); }
  function close(){ p = null; if (pc) pc.innerHTML = ''; }
  function layoutW(){ const vw = scroller.clientWidth / z; return Math.max(vw, ...((p && p.items) || []).map(it => it.x + it.w + 40), Ink.bounds().r + 40); }
  function render(){ if (!pc) mountShell(); pc.innerHTML = ''; pc.className = 'pagec'; if (!p) return;
    const rule = RULES[p.rule || '']; if (rule){ pc.classList.add(rule.k === 'lines' ? 'rule-lines' : 'rule-grid'); if (rule.k === 'lines') pc.classList.add('margin'); pc.style.setProperty('--rs', rule.s + 'px'); pc.style.setProperty('--ro', '6px'); } pc.style.background = ''; pc.style.backgroundColor = p.color || '';
    const t = h('input', {placeholder: 'Page title', value: p.title || '', 'aria-label': 'Page title', spellcheck: 'true'}); t.addEventListener('input', () => { p.title = t.value; M.touch(p); snap(); }); t.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); const it = p.items[0]; if (it){ const b = pc.querySelector(`.nc[data-id="${it.id}"] .ncb`); b && b.focus(); } else addContainer(PAD, TOPY, true); } });
    pc.append(h('div', {class: 'ptitle'}, t, h('div', {class: 'pdate'}, h('span', {}, fmtDate(p.created)), h('span', {}, fmtTime(p.created)))));
    for (const it of p.items || []) pc.append(ncEl(it));
    inkEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); inkEl.setAttribute('class', 'inkl'); pc.append(inkEl);
    pc.classList.toggle('draw', mode === 'draw'); Ink.mount(inkEl, p, scroller, what => { commit(what); sizePage(); }); sizePage();
    hydrate(pc).then(sizePage); }
  function sizePage(){ if (!p || !pc || !scroller.clientWidth) return; const vw = scroller.clientWidth / z, vh = scroller.clientHeight / z; let b = TOPY + 40; for (const n of $$('.nc', pc)) b = Math.max(b, n.offsetTop + n.offsetHeight); b = Math.max(b, Ink.bounds().b); const W = Math.ceil(layoutW()), H = Math.ceil(Math.max(vh, b + vh * .6));
    pc.style.width = W + 'px'; pc.style.minHeight = H + 'px'; pc.style.height = H + 'px'; pc.style.transform = z === 1 ? '' : `scale(${z})`; pz.style.width = W * z + 'px'; pz.style.height = H * z + 'px'; Ink.size(); }
  function ncEl(it){ const body = h('div', {class: 'ncb', contenteditable: readOnly ? 'false' : 'true', spellcheck: String(UIX.spell()), html: it.html || ''}); const n = h('div', {class: 'nc', 'data-id': it.id, style: `left:${it.x}px;top:${it.y}px;width:${it.w}px`}, h('div', {class: 'ncbar', title: 'Drag to move'}), body, h('div', {class: 'ncw', title: 'Drag to change the width'}));
    body.addEventListener('focus', () => { $$('.nc.focus', pc).forEach(x => x !== n && x.classList.remove('focus')); n.classList.add('focus'); lastNc = n; });
    body.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== body && !n.contains(document.activeElement)){ n.classList.remove('focus'); if (isEmpty(body)) removeContainer(it.id, true); } }, 150));
    body.addEventListener('input', e => { if (e.inputType === 'insertParagraph') carryTag(); changed(n); if (e.inputType === 'insertText' && (e.data === ']' || e.data === ' ')) wikiLinks(body); if (e.inputType === 'insertText' && e.data === ' ') autoFormat(body); });
    body.addEventListener('paste', e => onPaste(e, body));
    body.addEventListener('keydown', e => onKey(e, body));
    const bar = n.querySelector('.ncbar'); bar.addEventListener('pointerdown', e => dragStart(e, n, 'move')); n.querySelector('.ncw').addEventListener('pointerdown', e => dragStart(e, n, 'width'));
    return n; }
  const isEmpty = b => !b.textContent.trim() && !b.querySelector('img,.att,.media,table,.tag,hr');
  function changed(n){ const it = p.items.find(x => x.id === n.dataset.id); if (!it) return; it.html = serialize(n.querySelector('.ncb')); M.touch(p); snapSoon(); sizeSoon(); clearFind(false); }
  let sizeT = null; const sizeSoon = () => { clearTimeout(sizeT); sizeT = setTimeout(sizePage, 120); };
  function addContainer(x, y, focus, html = '', w){ if (!p) return null; const vw = scroller.clientWidth / z; const width = w || Math.max(160, Math.min(620, vw - x - 16)); const it = {id: uid(), x: Math.round(x), y: Math.round(y), w: Math.round(width), html}; p.items.push(it); const n = ncEl(it); pc.insertBefore(n, inkEl); if (html) hydrate(n); if (focus){ const b = n.querySelector('.ncb'); b.focus(); placeCaretEnd(b); } M.touch(p); sizePage(); if (html) commit('Add'); return n; }
  function removeContainer(id, quiet){ if (!p) return; const i = p.items.findIndex(x => x.id === id); if (i < 0) return; p.items.splice(i, 1); const n = pc.querySelector(`.nc[data-id="${id}"]`); n && n.remove(); if (lastNc === n) lastNc = null; M.touch(p); if (!quiet) commit('Delete'); sizePage(); }
  function placeCaretEnd(el){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function dragStart(e, n, kind){ e.preventDefault(); e.stopPropagation(); const it = p.items.find(x => x.id === n.dataset.id); const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y, ow = it.w; const tgt = e.currentTarget; try { tgt.setPointerCapture(e.pointerId); } catch(_){} n.classList.add('focus');
    const mv = ev => { const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; if (kind === 'move'){ it.x = Math.max(0, Math.round(ox + dx)); it.y = Math.max(60, Math.round(oy + dy)); n.style.left = it.x + 'px'; n.style.top = it.y + 'px'; } else { it.w = Math.max(80, Math.round(ow + dx)); n.style.width = it.w + 'px'; } };
    const upf = () => { tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', upf); tgt.removeEventListener('pointercancel', upf); if (it.x !== ox || it.y !== oy || it.w !== ow){ M.touch(p); commit(kind === 'move' ? 'Move' : 'Resize'); sizePage(); } };
    tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', upf); tgt.addEventListener('pointercancel', upf); }

  /* ---------- clicks on the page ---------- */
  function onPageClick(e){ if (!p || mode !== 'type' || readOnly) return; const t = e.target;
    const tag = t.closest('.tag'); if (tag && pc.contains(tag)){ e.preventDefault(); toggleTag(tag); return; }
    const img = t.closest('.ncb img'); if (img){ e.preventDefault(); imgBar(img); return; }
    const att = t.closest('.att'); if (att){ e.preventDefault(); attMenu(att, e); return; }
    const a = t.closest('.ncb a'); if (a){ e.preventDefault(); linkMenu(a, e); return; }
    $$('.imgbar').forEach(x => x.remove()); $$('img.sel', pc).forEach(i => i.classList.remove('sel'));
    if (t === pc || t === inkEl || t.classList.contains('pagez')){ const r = pc.getBoundingClientRect(); const x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z; if (y < TOPY - 30) return; const hitNc = $$('.nc', pc).find(n => x >= n.offsetLeft - 6 && x <= n.offsetLeft + n.offsetWidth + 6 && y >= n.offsetTop - 6 && y <= n.offsetTop + n.offsetHeight + 6); if (hitNc){ const b = hitNc.querySelector('.ncb'); b.focus(); placeCaretEnd(b); return; } addContainer(x, y - 10, true); } }
  function toggleTag(t){ const k = t.dataset.tag; if (!CHECKABLE.has(k)) return; const done = !t.classList.contains('done'); t.classList.toggle('done', done); t.innerHTML = TAG[k].svg(done); const n = t.closest('.nc'); if (n) changed(n); commit('Tick'); }
  function imgBar(img){ $$('.imgbar').forEach(x => x.remove()); $$('img.sel', pc).forEach(i => i.classList.remove('sel')); img.classList.add('sel'); const bar = h('div', {class: 'imgbar'}); const n = img.closest('.nc');
    const set = w => { img.style.width = w; changed(n); commit('Picture size'); bar.remove(); img.classList.remove('sel'); };
    const b = (label, fn) => { const x = h('button', {class: 'btn sm', type: 'button'}, label); x.addEventListener('click', fn); bar.append(x); };
    b('Small', () => set('160px')); b('Medium', () => set('320px')); b('Large', () => set('520px')); b('Full', () => set('100%'));
    b('⋯', e => UI.menu(e.currentTarget, [{text: 'Open picture', icon: IC.image, fn: () => window.open(img.src, '_blank')}, img.dataset.blob ? {text: 'Save picture', icon: IC.download, fn: () => IO.saveBlob(img.dataset.blob)} : null, {text: 'Rotate', icon: IC.redo, fn: () => rotateImg(img)}, {text: 'Text in picture (Copilot)', icon: IC.spark, fn: () => AI.ocr(img)}, '-', {text: 'Delete picture', icon: IC.trash, danger: true, fn: () => { img.remove(); changed(n); commit('Delete picture'); bar.remove(); }}]));
    document.body.append(bar); const r = img.getBoundingClientRect(); bar.style.left = clamp(r.left, 8, innerWidth - bar.offsetWidth - 8) + 'px'; bar.style.top = clamp(r.top - bar.offsetHeight - 6, 60, innerHeight - 60) + 'px'; }
  async function rotateImg(img){ const c = document.createElement('canvas'); const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = img.src; }); c.width = im.naturalHeight; c.height = im.naturalWidth; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2); g.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2); const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9)); const id = await M.putBlob(blob, p.sec, 'picture.jpg'); img.dataset.blob = id; img.src = await M.blobURL(id); changed(img.closest('.nc')); commit('Rotate'); }
  function attMenu(att, e){ UI.menu(null, [{text: 'Open', icon: IC.file, fn: () => IO.openBlob(att.dataset.blob, att.dataset.name)}, {text: 'Save to device', icon: IC.download, fn: () => IO.saveBlob(att.dataset.blob)}, /pdf/.test(att.dataset.type || '') ? {text: 'Insert as printout', icon: IC.pdf, fn: async () => { const r = await M.getBlob(att.dataset.blob); if (r) insertPDF(new File([r.blob], att.dataset.name, {type: 'application/pdf'}), false); }} : null, '-', {text: 'Delete', icon: IC.trash, danger: true, fn: () => { const n = att.closest('.nc'); att.remove(); changed(n); commit('Delete file'); }}], {x: e.clientX, y: e.clientY}); }
  function linkMenu(a, e){ if (a.classList.contains('pl')){ UIX.goPageLink(a.dataset.page, a.textContent); return; } UI.menu(null, [{text: 'Open link', icon: IC.link, fn: () => window.open(a.href, '_blank', 'noopener')}, {text: 'Edit link', icon: IC.rename, fn: () => linkDialog(a)}, {text: 'Remove link', icon: IC.close, fn: () => { const n = a.closest('.nc'); a.replaceWith(...a.childNodes); changed(n); }}], {x: e.clientX, y: e.clientY}); }

  /* ---------- typing helpers ---------- */
  function wikiLinks(body){ const s = getSelection(); if (!s.rangeCount) return; const node = s.anchorNode; if (!node || node.nodeType !== 3 || !body.contains(node)) return; const m = /\[\[([^\[\]]{1,120})\]\]/.exec(node.data); if (!m) return;
    const name = m[1].trim(); const target = UIX.findOrCreatePage(name); const a = h('a', {class: 'pl', 'data-page': target.id, href: '#'}, name); const after = node.splitText(m.index); after.data = after.data.slice(m[0].length); node.parentNode.insertBefore(a, after); const r = document.createRange(); r.setStart(after, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r); changed(body.closest('.nc')); }
  function autoFormat(body){ const s = getSelection(); const node = s.anchorNode; if (!node || node.nodeType !== 3) return; const blk = node.parentElement && node.parentElement.closest('p,div,li'); const txt = node.data.slice(0, s.anchorOffset);
    if (!blk || blk.classList.contains('ncb') || blk.textContent.replace(/[\u00a0\u200b]/g, ' ').trimStart() !== txt.replace(/[\u00a0\u200b]/g, ' ').trimStart()) return; const t = txt.replace(/[\u00a0\u200b]/g, ' ').trim();
    const strip = () => { const rest = node.data.slice(s.anchorOffset); const r = document.createRange(); if (!rest.replace(/[\u00a0\u200b\s]/g, '') && blk.textContent.replace(/[\u00a0\u200b\s]/g, '') === t.replace(/\s/g, '')){ const keep = [...blk.querySelectorAll(':scope > .tag')]; blk.innerHTML = ''; keep.forEach(k => blk.append(k)); const br = document.createElement('br'); blk.append(br); r.setStartBefore(br); } else { node.data = rest; r.setStart(node, 0); } r.collapse(true); s.removeAllRanges(); s.addRange(r); };
    if (t === '*' || t === '-'){ strip(); document.execCommand('insertUnorderedList'); changed(body.closest('.nc')); }
    else if (/^1[.)]$/.test(t)){ strip(); document.execCommand('insertOrderedList'); changed(body.closest('.nc')); }
    else if (t === '[]' || t === '[ ]'){ strip(); insertTag('todo'); } }
  function carryTag(){ const nb = closestBlock(); if (!nb || nb.querySelector('.tag') || nb.textContent.replace(/[\u200b\s]/g, '')) return; const prev = nb.previousElementSibling; const t = prev && prev.querySelector(':scope > .tag'); if (!t || !CHECKABLE.has(t.dataset.tag) || !prev.textContent.replace(/[\u200b\s]/g, '')) return; const tag = h('span', {html: tagHTML(t.dataset.tag, false)}).firstChild; nb.insertBefore(tag, nb.firstChild); const r = document.createRange(); r.setStartAfter(tag); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
  function onKey(e, body){ const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)){ const t = TAGS.find(x => x.key === e.key); if (t){ e.preventDefault(); insertTag(t.k); } return; }
    if (mod && e.altKey && /^[1-4]$/.test(e.key)){ e.preventDefault(); block('h' + e.key); return; }
    if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')){ e.preventDefault(); block('p'); exec('removeFormat'); return; }
    if (mod && e.key === '.'){ e.preventDefault(); exec('insertUnorderedList'); return; } if (mod && e.key === '/'){ e.preventDefault(); exec('insertOrderedList'); return; }
    if (mod && (e.key === 'k' || e.key === 'K')){ e.preventDefault(); linkDialog(); return; }
    if (e.altKey && e.shiftKey && /^[dDtTfF]$/.test(e.key)){ e.preventDefault(); stamp(e.key.toLowerCase()); return; }
    if (e.key === 'Tab'){ const td = getSelection().anchorNode && (getSelection().anchorNode.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode.parentElement).closest('td,th'); if (td){ e.preventDefault(); const cells = $$('td,th', td.closest('table')); let i = cells.indexOf(td) + (e.shiftKey ? -1 : 1); if (i >= cells.length){ tableOp('rowBelow', td); i = cells.length; } const next = $$('td,th', td.closest('table'))[Math.max(0, i)]; if (next){ const r = document.createRange(); r.selectNodeContents(next); getSelection().removeAllRanges(); getSelection().addRange(r); } return; } e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); return; }
    if (e.key === 'Enter' && !e.shiftKey){ const tg = closestBlock(); if (tg && tg.querySelector('.tag') && !tg.textContent.replace(/[\u200b\s]/g, '')){ e.preventDefault(); tg.querySelector('.tag').remove(); changed(body.closest('.nc')); return; } } }
  async function onPaste(e, body){ const cd = e.clipboardData; if (!cd) return; const files = [...cd.files || []].filter(f => /^image\//.test(f.type)); if (files.length){ e.preventDefault(); for (const f of files) await insertImage(f); return; }
    const html = cd.getData('text/html'); if (html){ e.preventDefault(); document.execCommand('insertHTML', false, sanitize(html)); hydrate(body); changed(body.closest('.nc')); } }

  /* ---------- selection & formatting ---------- */
  function rememberSel(){ const s = getSelection(); if (s.rangeCount && pc && pc.contains(s.anchorNode) && s.anchorNode.parentElement && s.anchorNode.parentElement.closest('.ncb') || (s.anchorNode && s.anchorNode.classList && s.anchorNode.classList.contains('ncb'))) savedRange = s.getRangeAt(0).cloneRange(); }
  document.addEventListener('selectionchange', rememberSel);
  function activeBody(create = true){ const s = getSelection(); const n = s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); let b = el && el.closest && el.closest('.ncb'); if (b && pc.contains(b)) return b;
    if (savedRange){ const se = savedRange.startContainer; const sel = se.nodeType === 1 ? se : se.parentElement; b = sel && sel.closest && sel.closest('.ncb'); if (b && pc.contains(b)){ b.focus({preventScroll: true}); s.removeAllRanges(); s.addRange(savedRange); return b; } }
    if (lastNc && pc.contains(lastNc)){ b = lastNc.querySelector('.ncb'); b.focus({preventScroll: true}); placeCaretEnd(b); return b; }
    if (!create) return null; const n2 = addContainer(PAD, nextY(), true); return n2 && n2.querySelector('.ncb'); }
  function nextY(){ let b = TOPY; for (const n of $$('.nc', pc)) b = Math.max(b, n.offsetTop + n.offsetHeight + 24); return b; }
  function exec(cmd, val){ if (!p || readOnly) return; const b = activeBody(); if (!b) return; document.execCommand('styleWithCSS', false, !['bold', 'italic', 'underline', 'strikeThrough'].includes(cmd)); document.execCommand(cmd, false, val); changed(b.closest('.nc')); }
  function block(tag){ exec('formatBlock', '<' + tag + '>'); }
  function closestBlock(){ const s = getSelection(); const n = s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); if (!el) return null; const b = el.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,div'); return b && !b.classList.contains('ncb') && b.closest('.ncb') ? b : null; }
  function insertHTML(html){ const b = activeBody(); if (!b) return; document.execCommand('insertHTML', false, html); hydrate(b); changed(b.closest('.nc')); return b; }
  function insertTag(k){ const b = activeBody(); if (!b) return; let blk = closestBlock();
    if (!blk){ // wrap loose text of the current line in a paragraph
      document.execCommand('formatBlock', false, '<p>'); blk = closestBlock(); }
    if (!blk){ insertHTML(tagHTML(k, false) + '&#8203;'); return; }
    const ex = blk.querySelector(':scope > .tag'); if (ex){ if (ex.dataset.tag === k){ ex.remove(); } else { ex.outerHTML = tagHTML(k, false); } }
    else { const t = h('span', {html: tagHTML(k, false)}).firstChild; blk.insertBefore(t, blk.firstChild); if (!blk.textContent.trim()){ blk.append(document.createTextNode('​')); } }
    const s = getSelection(); const r = document.createRange(); r.selectNodeContents(blk); r.collapse(false); s.removeAllRanges(); s.addRange(r);
    const kk = TAG[k]; if (kk && kk.hl){ /* highlight tags tint the line */ blk.style.backgroundColor = ex && ex.dataset.tag === k ? '' : kk.hl; }
    changed(b.closest('.nc')); commit('Tag'); }
  function stamp(kind){ const t = Date.now(); insertHTML(esc(kind === 'd' ? new Date(t).toLocaleDateString('en-IN') : kind === 't' ? fmtTime(t) : new Date(t).toLocaleDateString('en-IN') + ' ' + fmtTime(t)) + ' '); }
  async function linkDialog(a){ const s = getSelection(); const txt = a ? a.textContent : s.toString(); const keep = savedRange && savedRange.cloneRange(); const url = h('input', {class: 'inp', value: a ? a.getAttribute('href') : '', placeholder: 'https://… or a page name'}), label = h('input', {class: 'inp', value: txt});
    const r = await UI.dialog(a ? 'Edit link' : 'Insert link', h('div', {style: 'display:flex;flex-direction:column;gap:10px'}, UI.field('Text to show', label), UI.field('Address or page name', url), h('p', {class: 'hint'}, 'Type the name of one of your pages to link to it.')), [['Cancel'], ['OK', 'primary']]); if (r !== 'OK') return;
    let href = url.value.trim(); if (!href) return; const pageTarget = !/^(https?:|mailto:|tel:|www\.)/i.test(href) && !/\.[a-z]{2,}(\/|$)/i.test(href) ? UIX.findOrCreatePage(href) : null; if (!pageTarget && /^www\./i.test(href)) href = 'https://' + href; else if (!pageTarget && !/^(https?:|mailto:|tel:)/i.test(href)) href = 'https://' + href;
    const html = pageTarget ? `<a class="pl" data-page="${pageTarget.id}" href="#">${esc(label.value || href)}</a>` : `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label.value || href)}</a>`;
    if (a){ const n = a.closest('.nc'); a.outerHTML = html; changed(n); return; } if (keep){ savedRange = keep; } insertHTML(html + '&nbsp;'); }

  /* ---------- tables ---------- */
  function insertTable(rows, cols){ let html = '<table class="nt"><tbody>'; for (let r = 0; r < rows; r++){ html += '<tr>'; for (let c = 0; c < cols; c++) html += r === 0 ? '<th><br></th>' : '<td><br></td>'; html += '</tr>'; } html += '</tbody></table><p><br></p>'; const mark = 'tb' + uid(); const b = insertHTML(html.replace('<table class="nt">', `<table class="nt" data-new="${mark}">`)); const t = b && b.querySelector(`table[data-new="${mark}"]`); if (t){ t.removeAttribute('data-new'); const cell = t.querySelector('th,td'); const r = document.createRange(); r.selectNodeContents(cell); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); changed(b.closest('.nc')); } commit('Table'); UIX.buildRibbon(); }
  function tableOp(op, cell){ cell = cell || (() => { const s = getSelection(); const n = s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return el && el.closest('td,th'); })(); if (!cell) return UI.toast('Put the cursor in a table first'); const tr = cell.parentElement, table = cell.closest('table'); const ci = [...tr.children].indexOf(cell); const n = table.closest('.nc');
    if (op === 'rowAbove' || op === 'rowBelow'){ const nr = tr.cloneNode(true); [...nr.children].forEach(c => { const td = document.createElement(c.tagName === 'TH' && op === 'rowAbove' && tr === table.rows[0] ? 'TH' : 'TD'); td.innerHTML = '<br>'; c.replaceWith(td); }); tr.parentElement.insertBefore(nr, op === 'rowAbove' ? tr : tr.nextSibling); }
    if (op === 'colLeft' || op === 'colRight'){ for (const row of table.rows){ const ref = row.children[ci]; const td = document.createElement(ref && ref.tagName === 'TH' ? 'TH' : 'TD'); td.innerHTML = '<br>'; row.insertBefore(td, op === 'colLeft' ? ref : ref ? ref.nextSibling : null); } }
    if (op === 'delRow'){ if (table.rows.length <= 1) table.remove(); else tr.remove(); }
    if (op === 'delCol'){ if (tr.children.length <= 1) table.remove(); else for (const row of table.rows) row.children[ci] && row.children[ci].remove(); }
    if (op === 'delTable') table.remove();
    if (op === 'header'){ const first = table.rows[0]; const toTh = first.children[0].tagName !== 'TH'; [...first.children].forEach(c => { const x = document.createElement(toTh ? 'TH' : 'TD'); x.innerHTML = c.innerHTML; c.replaceWith(x); }); }
    if (op === 'shade'){ cell.style.backgroundColor = cell.style.backgroundColor ? '' : '#E3F0FF'; }
    if (n) changed(n); commit('Table'); }
  const inTable = () => { const s = getSelection(); const n = s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return !!(el && el.closest && el.closest('.ncb td,.ncb th')); };

  /* ---------- pictures, files, recordings, PDF printouts ---------- */
  async function shrink(file, max = 2000){ if (!/^image\/(jpeg|png|webp)/.test(file.type) || file.size < 600e3) return file; try { const bmp = await createImageBitmap(file); const s = Math.min(1, max / Math.max(bmp.width, bmp.height)); if (s === 1 && file.size < 2.5e6) return file; const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .86)); return b && b.size < file.size ? new File([b], (file.name || 'picture').replace(/\.\w+$/, '') + '.jpg', {type: 'image/jpeg'}) : file; } catch(e){ return file; } }
  async function insertImage(file, width){ if (!p) return; const f = await shrink(file); const id = await M.putBlob(f, p.sec, f.name || 'picture'); const u = await M.blobURL(id); const vw = scroller.clientWidth / z; const w = width || Math.min(480, Math.round(vw - 80));
    insertHTML(`<img data-blob="${id}" src="${u}" style="width:${w}px" alt="${esc(file.name || 'picture')}"><br>`); commit('Picture'); }
  async function insertFile(file){ if (!p) return; const id = await M.putBlob(file, p.sec, file.name); insertHTML(`<span class="att" contenteditable="false" data-blob="${id}" data-name="${esc(file.name)}" data-size="${file.size}" data-type="${esc(file.type || '')}"></span>&nbsp;<br>`); commit('File'); }
  async function insertMedia(blob, kind, dur, name){ if (!p) return; const id = await M.putBlob(blob, p.sec, name || (kind + '.webm')); insertHTML(`<div class="media" contenteditable="false" data-blob="${id}" data-kind="${kind}" data-dur="${Math.round(dur || 0)}" data-t="${Date.now()}" data-name="${esc(name || (kind === 'video' ? 'Video' : 'Recording'))}"></div><p><br></p>`); commit(kind === 'video' ? 'Video' : 'Recording'); }
  async function insertPDF(file, attach = true){ if (!p) return; UI.toast('Reading the PDF…', 20000); try { const lib = await IO.needPdf(); const doc = await lib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise; const n = Math.min(doc.numPages, 60); const b = activeBody(); if (!b) return;
      let html = ''; if (attach){ const id = await M.putBlob(file, p.sec, file.name); html += `<span class="att" contenteditable="false" data-blob="${id}" data-name="${esc(file.name)}" data-size="${file.size}" data-type="application/pdf"></span><br>`; }
      const vw = scroller.clientWidth / z; const w = Math.min(720, Math.round(vw - 70));
      for (let i = 1; i <= n; i++){ UI.toast(`Adding page ${i} of ${n}…`, 20000); const pg = await doc.getPage(i); const vp = pg.getViewport({scale: 1.6}); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await pg.render({canvasContext: g, viewport: vp}).promise; const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .82)); const id = await M.putBlob(blob, p.sec, `${file.name} p${i}.jpg`); html += `<img data-blob="${id}" style="width:${w}px;border:1px solid #c9ccd8" alt="${esc(file.name)} page ${i}"><br>`; }
      insertHTML(html); commit('PDF printout'); UI.toast(n < doc.numPages ? `Added the first ${n} of ${doc.numPages} pages` : `Added ${n} page${n === 1 ? '' : 's'}`); } catch(e){ console.error(e); UI.toast('Couldn’t read that PDF: ' + e.message, 5000); } }

  /* ---------- page settings ---------- */
  function setColor(c){ if (!p) return; p.color = c; M.touch(p); render(); commit('Page colour'); }
  function setRule(r){ if (!p) return; p.rule = r; M.touch(p); render(); commit('Rule lines'); }
  function setZoom(v){ z = clamp(Math.round(v * 100) / 100, .5, 2.5); sizePage(); UIX.zoomLabel && UIX.zoomLabel(z); }
  function setMode(m){ mode = m; if (pc) pc.classList.toggle('draw', m === 'draw'); if (m === 'draw'){ document.activeElement && document.activeElement.blur && document.activeElement.blur(); } else Ink.clearSel(); }
  function setReadOnly(v){ readOnly = v; $$('.ncb', pc).forEach(b => b.setAttribute('contenteditable', v ? 'false' : 'true')); }

  /* ---------- undo (page snapshots) ---------- */
  const state = () => JSON.stringify({title: p.title, items: p.items, ink: p.ink, color: p.color, rule: p.rule});
  let lastState = null;
  function snap(){ if (!p) return; const s = state(); if (s === lastState) return; if (lastState !== null){ undo.push(lastState); if (undo.length > 60) undo.shift(); redo = []; } lastState = s; UIX.syncUndo(); }
  function snapSoon(){ clearTimeout(snapT); snapT = setTimeout(snap, 700); }
  function commit(){ clearTimeout(snapT); snap(); if (p) M.touch(p); }
  function restoreState(s){ const o = JSON.parse(s); Object.assign(p, o); lastState = s; M.touch(p); render(); UIX.syncUndo(); UIX.refreshPages && UIX.refreshPages(); }
  function doUndo(){ if (!p) return; snap(); if (!undo.length) return; redo.push(lastState); restoreState(undo.pop()); }
  function doRedo(){ if (!p || !redo.length) return; undo.push(lastState); restoreState(redo.pop()); }
  const canUndo = () => undo.length > 0 || (p && lastState !== null && state() !== lastState), canRedo = () => redo.length > 0;
  async function flushNow(){ if (p){ for (const n of $$('.nc', pc || document)){ const it = p.items.find(x => x.id === n.dataset.id); if (it) it.html = serialize(n.querySelector('.ncb')); } } await M.flush(); }
  const startSnap = () => { lastState = p ? state() : null; };

  /* ---------- find on page ---------- */
  function clearFind(rerender){ if (!pc) return; const ms = $$('mark.found', pc); if (!ms.length) return; ms.forEach(m => { const par = m.parentNode; m.replaceWith(...m.childNodes); par.normalize(); }); }
  function find(q){ clearFind(); if (!q || !pc) return 0; const low = q.toLowerCase(); let n = 0; const first = [];
    for (const b of $$('.ncb', pc)){ const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); const nodes = []; while (tw.nextNode()) nodes.push(tw.currentNode);
      for (const t of nodes){ let i; let node = t; while (node && (i = node.data.toLowerCase().indexOf(low)) >= 0){ const m = node.splitText(i); const rest = m.splitText(q.length); const mk = h('mark', {class: 'found'}); m.replaceWith(mk); mk.append(m); n++; if (!first.length) first.push(mk); node = rest; } } }
    if (first[0]) first[0].scrollIntoView({block: 'center'}); return n; }

  /* ---------- text for reading aloud, AI and export ---------- */
  const plain = () => p ? [p.title, ...$$('.ncb', pc).map(b => b.innerText)].join('\n\n') : '';
  function appendHTML(html, where = 'append'){ if (!p) return; const clean = sanitize(html); if (where === 'replace'){ p.items = []; render(); } const last = $$('.nc', pc).sort((a, b) => (b.offsetTop + b.offsetHeight) - (a.offsetTop + a.offsetHeight))[0];
    if (last && where !== 'new'){ const b = last.querySelector('.ncb'); b.insertAdjacentHTML('beforeend', clean); hydrate(b); changed(last); } else addContainer(PAD, nextY(), false, clean); commit('Copilot'); sizePage(); }

  function init(){ mountShell(); try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch(e){} pc.addEventListener('click', onPageClick); window.addEventListener('resize', () => sizePage()); try { let lw = 0, lh = 0; new ResizeObserver(() => { const w = scroller.clientWidth, hh = scroller.clientHeight; if (w && (w !== lw || hh !== lh)){ lw = w; lh = hh; sizePage(); } }).observe(scroller); } catch(e){} }
  return {init, open, close, cur, render, sizePage, zoom, setZoom, setMode, mode: () => mode, exec, block, insertHTML, insertTag, stamp, linkDialog, insertTable, tableOp, inTable, insertImage, insertFile, insertMedia, insertPDF, setColor, setRule, RULES, doUndo, doRedo, canUndo, canRedo, commit, flushNow, startSnap,
    find, clearFind, plain, appendHTML, sanitize, serialize, hydrate, addContainer, activeBody, setReadOnly, inkSelBar: () => UIX.inkSelBar(), removeContainer, nextY: () => pc ? nextY() : TOPY, PAD, TOPY};
})();
