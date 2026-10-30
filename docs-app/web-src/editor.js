/* SRK Docs — editor: ribbon, formatting, tables, pictures, find, undo, layout */
'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
let _tt; function toast(msg, ms=2600){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(_tt); _tt = setTimeout(() => t.hidden = true, ms); }
const clampN = (v, a, b) => v < a ? a : v > b ? b : v;
const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  bullets: SVG('<circle cx="4.5" cy="6" r="1.3" fill="currentColor"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor"/><path d="M9 6h11M9 12h11M9 18h11"/>'),
  numbers: SVG('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5l1.5-1v5" stroke-width="1.5"/><path d="M3.6 11.2c.4-.9 2.6-.9 2.4.6-.1.8-2.4 2-2.4 2.7h2.6" stroke-width="1.5"/><path d="M3.7 16.6h2.3l-1.2 1.4c1 0 1.6.4 1.4 1.3-.2.9-1.9 1-2.5.3" stroke-width="1.5"/>'),
  outdent: SVG('<path d="M4 5h16M11 10h9M11 14h9M4 19h16"/><path d="M8 9.5L5 12l3 2.5"/>'),
  indent: SVG('<path d="M4 5h16M11 10h9M11 14h9M4 19h16"/><path d="M5 9.5L8 12l-3 2.5"/>'),
  left: SVG('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), center: SVG('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: SVG('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'), justify: SVG('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  spacing: SVG('<path d="M11 6h9M11 12h9M11 18h9"/><path d="M5 4v16M3 6.5L5 4l2 2.5M3 17.5L5 20l2-2.5"/>'),
  clear: SVG('<path d="M5 6h11M10.5 6l-3 13"/><path d="M14 14l6 6M20 14l-6 6"/>'),
  hl: SVG('<path d="M15 4l5 5-8.5 8.5H7v-4.5z"/><path d="M4 21h8"/>'),
  find: SVG('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  table: SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/>'),
  pic: SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>'),
  link: SVG('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  pb: SVG('<path d="M6 3v5h12V3M6 21v-5h12v5"/><path d="M3 12h2.5M8 12h2.5M13.5 12H16M18.5 12H21"/>'),
  hr: SVG('<path d="M3 12h18"/><path d="M7 7h10M7 17h10" opacity=".45"/>'),
  sym: SVG('<path d="M5 19h4.5v-1.6A7 7 0 1 1 14.5 17.4V19H19"/>'),
  date: SVG('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  hf: SVG('<rect x="4.5" y="3" width="15" height="18" rx="1.5"/><path d="M4.5 7.5h15M4.5 16.5h15"/>'),
  pnum: SVG('<rect x="4.5" y="3" width="15" height="18" rx="1.5"/><path d="M10.5 17l1.5-1v-3"/>'),
  size: SVG('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>'), orient: SVG('<rect x="3" y="7" width="12" height="14" rx="1"/><path d="M13 3h5a3 3 0 0 1 3 3v3"/><path d="M19 7l2 2 2-2"/>'),
  margins: SVG('<rect x="4.5" y="3" width="15" height="18" rx="1"/><path d="M8 3v18M16 3v18M4.5 7h15M4.5 17h15" stroke-dasharray="1.5 2"/>'),
  count: SVG('<path d="M4 7h4M6 7v10M4 17h4M11 9.5a2 2 0 1 1 3 1.7L11 17h4M17 8h3l-2 3a2.5 2.5 0 1 1-1.5 4.5"/>'),
  spell: SVG('<path d="M3 15l3-9 3 9M4 12.5h4M11 6h3a2 2 0 0 1 0 4h-3V6zm0 4h3.5a2.5 2.5 0 0 1 0 5H11v-5z"/><path d="M15 19l2 2 4-4"/>'),
  speak: SVG('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  stop: SVG('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  print: SVG('<path d="M7 9V3h10v6"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  mobile: SVG('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
  read: SVG('<path d="M2.5 6C5 4.5 8.5 4.5 12 6.5c3.5-2 7-2 9.5-.5v13c-2.5-1.5-6-1.5-9.5.5-3.5-2-7-2-9.5-.5z"/><path d="M12 6.5v13"/>'),
  moon: SVG('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  zoom: SVG('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>'),
  rowAbove: SVG('<rect x="3.5" y="11" width="17" height="9" rx="1"/><path d="M3.5 15.5h17M12 3v6M9 6h6"/>'), rowBelow: SVG('<rect x="3.5" y="4" width="17" height="9" rx="1"/><path d="M3.5 8.5h17M12 15v6M9 18h6"/>'),
  colLeft: SVG('<rect x="11" y="3.5" width="9" height="17" rx="1"/><path d="M15.5 3.5v17M3 12h6M6 9v6"/>'), colRight: SVG('<rect x="4" y="3.5" width="9" height="17" rx="1"/><path d="M8.5 3.5v17M15 12h6M18 9v6"/>'),
  del: SVG('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'), shade: SVG('<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>'),
  caret: '<svg class="caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};
const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Cambria', 'Georgia', 'Garamond', 'Verdana', 'Tahoma', 'Courier New'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const STYLES = [['p', 'Normal'], ['title', 'Title'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['quote', 'Quote']];
const TEXT_COLORS = ['#000000','#404040','#7f7f7f','#bfbfbf','#ffffff','#c00000','#ff0000','#ffc000','#ffff00','#92d050','#00b050','#00b0f0','#0070c0','#002060','#7030a0','#2f5496','#c55a11','#538135','#bf8f00','#843c0c'];
const HL_COLORS = ['#ffff00','#00ff00','#00ffff','#ff00ff','#0000ff','#ff0000','#000080','#008080','#008000','#800080','#800000','#808000','#808080','#c0c0c0','#000000'];
const SHADES = ['#ffffff','#f2f2f2','#d9d9d9','#bfbfbf','#deeaf6','#bdd7ee','#e2efda','#c6e0b4','#fff2cc','#ffe699','#fbe5d6','#f8cbad','#ead1f5','#d9e2f3','#fce4d6'];
const SYMBOLS = '° ± × ÷ µ ≤ ≥ ≠ ≈ ∞ → ← ↑ ↓ ⇒ • ✓ ✗ © ® ™ € £ ₹ § ¶ ½ ¼ ¾ ² ³ α β γ δ Δ θ λ π σ Σ Ω √ ∴'.split(' ');

/* ======================================================================
   Editor
   ====================================================================== */
const Editor = (() => {
  const ed = $('#ed'), sheet = $('#sheet'), desk = $('#desk');
  let D = null;            // the open document model
  let onChange = () => {}, onFile = () => {};
  let savedRange = null, selImg = null;
  let view = innerWidth < 760 ? 'mobile' : 'print', userZoom = null, reading = false, night = false;
  let currentTab = 'home';
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch(e){}

  /* ---------- document CSS (shared with PDF export and printing) ---------- */
  function docCss(m, sel='.doc'){
    const d = m.defaults || {}; const font = fontStack(d.font || 'Calibri'), size = d.size || 11, after = d.after ?? 8, line = d.line ?? 1.08;
    return `${sel}{font-family:${font};font-size:${size}pt;line-height:${line};color:#000;overflow-wrap:break-word;tab-size:4}
${sel} p{margin:0 0 ${after}pt}
${sel} h1,${sel} h2,${sel} h3,${sel} h4{font-family:${fontStack(d.font || 'Calibri')};font-weight:400;line-height:1.2;color:#2f5496}
${sel} h1{font-size:16pt;margin:12pt 0 ${after}pt}
${sel} h1.title{font-size:28pt;color:#000;margin:0 0 8pt;letter-spacing:-.3px;line-height:1.1}
${sel} h2{font-size:13pt;margin:2pt 0 ${after}pt}
${sel} h3{font-size:12pt;margin:2pt 0 ${after}pt;color:#1f3763}
${sel} h4{font-size:11pt;margin:2pt 0 ${after}pt;font-style:italic}
${sel} blockquote{margin:10pt 43pt ${after}pt;font-style:italic;color:#404040;text-align:center}
${sel} blockquote[style*="margin-left"]{font-style:normal;color:inherit;text-align:inherit}
${sel} ul,${sel} ol{margin:0 0 ${after}pt;padding-left:.5in}
${sel} li{margin:0}
${sel} li p{margin:0}
${sel} table{border-collapse:collapse;width:100%;margin:0 0 ${after}pt;table-layout:auto}
${sel} td,${sel} th{border:1px solid #000;padding:1pt 5.4pt;vertical-align:top;text-align:left;min-width:2em}
${sel} th{font-weight:700}
${sel} td p,${sel} th p{margin:0}
${sel} img{max-width:100%;height:auto}
${sel} a{color:#0563c1;text-decoration:underline}
${sel} hr{border:0;border-top:1px solid #000;margin:0 0 ${after}pt}
${sel} .tab{white-space:pre;display:inline-block;min-width:.5in}
${sel} sup,${sel} sub{font-size:.7em;line-height:0}
${sel} .pb{height:0;border-top:2px dashed #9aa3bf;margin:14px 0;position:relative;user-select:none}
${sel} .pb::after{content:"Page break";position:absolute;left:50%;top:-9px;transform:translateX(-50%);background:#fff;color:#8a93ad;font:500 10.5px system-ui,sans-serif;padding:0 6px}`;
  }
  function applyDocStyle(){ $('#docStyle').textContent = docCss(D) + `\n#ed img.selimg{outline:3px solid #2f4fd8;outline-offset:2px}`; }

  /* ---------- selection ---------- */
  const inEd = n => n && (n === ed || ed.contains(n));
  document.addEventListener('selectionchange', () => {
    const s = getSelection(); if (s.rangeCount && inEd(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
    scheduleUI();
  });
  function restore(){
    if (reading) return false;
    const s = getSelection();
    // prefer the live caret: selectionchange fires late, so the saved copy can lag behind fast typing
    const want = s.rangeCount && inEd(s.anchorNode) ? s.getRangeAt(0).cloneRange() : (savedRange && inEd(savedRange.startContainer) ? savedRange : null);
    if (document.activeElement !== ed) ed.focus({preventScroll: true});
    if (want){ const cur = s.rangeCount ? s.getRangeAt(0) : null;
      if (!cur || cur.startContainer !== want.startContainer || cur.startOffset !== want.startOffset || cur.endContainer !== want.endContainer || cur.endOffset !== want.endOffset){ s.removeAllRanges(); s.addRange(want); }
      savedRange = want.cloneRange(); }
    return true;
  }
  ed.addEventListener('keyup', () => { const s = getSelection(); if (s.rangeCount && inEd(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); });
  function selRange(){ const s = getSelection(); if (s.rangeCount && inEd(s.anchorNode)) return s.getRangeAt(0); return savedRange; }
  function anchorEl(){ const r = selRange(); if (!r) return null; let n = r.startContainer; if (n.nodeType === 3) n = n.parentNode; return inEd(n) ? n : null; }
  const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,div:not(.pb)';
  function selBlocks(){
    const r = selRange(); if (!r) return [];
    const leaf = el => !el.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div:not(.pb),table,ul,ol');
    const all = $$(BLOCK_SEL, ed).filter(el => leaf(el) && r.intersectsNode(el));
    if (!all.length){ const a = anchorEl(); const b = a && a.closest(BLOCK_SEL); if (b && b !== ed) return [b]; }
    return all;
  }

  /* ---------- history ---------- */
  let stack = [], idx = -1, typingTimer = null, dirty = false;
  function caretOffsets(){
    const r = selRange(); if (!r || !inEd(r.startContainer)) return null;
    const pre = document.createRange(); pre.selectNodeContents(ed);
    try { pre.setEnd(r.startContainer, r.startOffset); const a = pre.toString().length; pre.setEnd(r.endContainer, r.endOffset); return [a, pre.toString().length]; } catch(e){ return null; }
  }
  function placeCaret(off){
    if (!off) return; const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n, pos = 0, start = null, end = null;
    while ((n = w.nextNode())){ const L = n.data.length; if (!start && off[0] <= pos + L) start = [n, off[0] - pos]; if (off[1] <= pos + L){ end = [n, off[1] - pos]; break; } pos += L; }
    if (!start) return; const r = document.createRange(); try { r.setStart(...start); r.setEnd(...(end || start)); } catch(e){ return; }
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange();
  }
  function record(){
    clearTimeout(typingTimer); dirty = false; const html = ed.innerHTML; const sel = caretOffsets();
    if (idx >= 0 && stack[idx].html === html){ stack[idx].sel = sel; return; }
    stack = stack.slice(0, idx + 1); stack.push({html, sel}); if (stack.length > 150) stack.shift(); idx = stack.length - 1; updateUndo();
  }
  function resetHistory(){ stack = []; idx = -1; record(); }
  function undo(){ if (dirty) record(); if (idx <= 0) return; idx--; applySnap(stack[idx]); }
  function redo(){ if (idx >= stack.length - 1) return; idx++; applySnap(stack[idx]); }
  function applySnap(s){ ed.innerHTML = s.html; ed.focus({preventScroll: true}); placeCaret(s.sel); changed(false); updateUndo(); }
  function updateUndo(){ $('#undoBtn').disabled = idx <= 0 && !dirty; $('#redoBtn').disabled = idx >= stack.length - 1; }
  ed.addEventListener('input', () => { dirty = true; updateUndo(); clearTimeout(typingTimer); typingTimer = setTimeout(record, 700); changed(false); });
  ed.addEventListener('beforeinput', e => { if (e.inputType === 'historyUndo'){ e.preventDefault(); undo(); } if (e.inputType === 'historyRedo'){ e.preventDefault(); redo(); } });
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  for (const id of ['#undoBtn', '#redoBtn', '#saveBtn']) $(id).addEventListener('mousedown', e => e.preventDefault());

  let changeTimer;
  function changed(rec = true){ if (rec) record(); clearTimeout(changeTimer); changeTimer = setTimeout(() => { layout(); onChange(); }, 350); scheduleUI(); }
  /* run an editing action as one undo step */
  /* browsers sometimes leave lists or tables inside a <p>; lift them out so the document stays valid */
  const BLOCKY = /^(UL|OL|TABLE|P|H[1-6]|BLOCKQUOTE|DIV|PRE|HR)$/;
  function normalize(){
    const bad = $$('p', ed).filter(p => [...p.children].some(c => BLOCKY.test(c.tagName)));
    if (!bad.length) return;
    const off = caretOffsets(); const ls = getSelection(); const lr = ls.rangeCount ? ls.getRangeAt(0) : null;
    const keep = lr && inEd(lr.startContainer) ? [lr.startContainer, lr.startOffset, lr.endContainer, lr.endOffset] : null;
    for (const p of bad){
      const parts = []; let run = null;
      for (const n of [...p.childNodes]){
        if (n.nodeType === 1 && BLOCKY.test(n.tagName)){ run = null; parts.push(n); }
        else { if (!run){ run = document.createElement('p'); if (p.getAttribute('style')) run.setAttribute('style', p.getAttribute('style')); parts.push(run); } run.append(n); }
      }
      p.replaceWith(...parts.filter(x => x.tagName !== 'P' || x.textContent.trim() || x.querySelector('img,br')));
    }
    // the caret's own nodes were moved, not copied, so put it back on them
    if (keep && keep[0].isConnected && keep[2].isConnected && inEd(keep[0]) && !bad.includes(keep[0]) && !bad.includes(keep[2])){
      const r = document.createRange(); const len = n => n.nodeType === 3 ? n.data.length : n.childNodes.length;
      try { r.setStart(keep[0], Math.min(keep[1], len(keep[0]))); r.setEnd(keep[2], Math.min(keep[3], len(keep[2]))); ls.removeAllRanges(); ls.addRange(r); savedRange = r.cloneRange(); return; } catch(e){}
    }
    placeCaret(off);
  }
  function act(fn){ if (!restore()) return; if (dirty) record(); try { fn(); normalize(); } finally { changed(true); } }
  function exec(cmd, val){ act(() => { document.execCommand('styleWithCSS', false, !/^(bold|italic|underline|strikeThrough|superscript|subscript)$/.test(cmd)); document.execCommand(cmd, false, val); }); }

  /* ---------- formatting ---------- */
  function setFont(name){ act(() => { document.execCommand('styleWithCSS', false, true); document.execCommand('fontName', false, name);
    $$('[style*="font-family"]', ed).forEach(el => { const f = el.style.fontFamily.replace(/["']/g, '').trim(); if (f === name) el.style.fontFamily = fontStack(name); });
    $$('font[face]', ed).forEach(el => { const s = h('span', {style: `font-family:${fontStack(el.getAttribute('face'))}`}); s.append(...el.childNodes); el.replaceWith(s); }); }); }
  function setSize(pt){ act(() => { document.execCommand('styleWithCSS', false, true); document.execCommand('fontSize', false, '7');
    $$('font[size="7"]', ed).forEach(el => { const s = h('span', {style: `font-size:${pt}pt`}); s.append(...el.childNodes); el.replaceWith(s); });
    $$('[style*="font-size"]', ed).forEach(el => { if (/xxx-large|-webkit-xxx-large/.test(el.style.fontSize)) el.style.fontSize = pt + 'pt'; }); }); }
  function curSize(){ const a = anchorEl(); return a ? Math.round(parseFloat(getComputedStyle(a).fontSize) * 0.75 * 2) / 2 : (D.defaults.size || 11); }
  function grow(dir){ const c = curSize(); const n = dir > 0 ? SIZES.find(s => s > c) || 96 : [...SIZES].reverse().find(s => s < c) || 6; setSize(n); }
  function setStyle(key){
    act(() => {
      const tag = key === 'title' ? 'h1' : key === 'quote' ? 'blockquote' : key;
      // headings inside lists or tables: style the block directly
      document.execCommand('formatBlock', false, tag);
      selBlocks().forEach(b => {
        if (b.matches('h1')) b.classList.toggle('title', key === 'title'); else b.classList.remove('title');
        if (!b.matches('td,th,li')) ['fontSize', 'color', 'fontFamily', 'fontWeight', 'marginTop', 'marginBottom', 'borderBottom', 'paddingBottom'].forEach(p => b.style[p] = '');
        if (!b.getAttribute('style')) b.removeAttribute('style'); if (!b.className) b.removeAttribute('class');
      });
    });
  }
  function clearFormat(){ act(() => { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); selBlocks().forEach(b => { if (!b.matches('td,th')){ b.removeAttribute('style'); b.removeAttribute('class'); } }); }); }
  function listCmd(kind){ exec(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'); }
  function indent(dir){
    act(() => {
      const a = anchorEl(); if (a && a.closest('li')){ document.execCommand(dir > 0 ? 'indent' : 'outdent'); return; }
      selBlocks().forEach(b => { if (b.matches('td,th')) return; const cur = parseFloat(b.style.marginLeft) || 0; const unit = /pt$/.test(b.style.marginLeft) || !b.style.marginLeft ? 1 : 0.75; const v = Math.max(0, cur * unit + dir * 36); b.style.marginLeft = v ? v + 'pt' : ''; });
    });
  }
  function blockStyle(prop, val){ act(() => selBlocks().forEach(b => { b.style[prop] = val; if (!b.getAttribute('style')) b.removeAttribute('style'); })); }

  /* ---------- inserting ---------- */
  function insertHTML(html){ act(() => { document.execCommand('insertHTML', false, html); }); }
  function insertText(t){ act(() => document.execCommand('insertText', false, t)); }
  function insertTable(r, c){
    const row = '<tr>' + '<td><br></td>'.repeat(c) + '</tr>';
    insertHTML(`<table><tbody>${row.repeat(r)}</tbody></table><p><br></p>`);
    const t = [...$$('table', ed)].find(t => t.querySelector('td') && !t.textContent.trim()); if (t){ const td = t.querySelector('td'); const rr = document.createRange(); rr.setStart(td, 0); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr); savedRange = rr.cloneRange(); }
  }
  function curCell(){ const a = anchorEl(); return a && a.closest('td,th'); }
  function tableOp(op, val){
    const cell = curCell(); if (!cell && op !== 'none'){ toast('Put the cursor in a table cell first.'); return; }
    act(() => {
      const row = cell.parentElement, table = cell.closest('table'), ci = cell.cellIndex;
      const mkRow = () => { const tr = document.createElement('tr'); [...row.cells].forEach(c => { const td = document.createElement('td'); if (c.colSpan > 1) td.colSpan = c.colSpan; td.innerHTML = '<br>'; tr.append(td); }); return tr; };
      switch (op){
        case 'rowAbove': row.before(mkRow()); break;
        case 'rowBelow': row.after(mkRow()); break;
        case 'colLeft': case 'colRight': [...table.rows].forEach(tr => { const td = document.createElement(tr.cells[0] && tr.cells[0].tagName === 'TH' ? 'th' : 'td'); td.innerHTML = '<br>'; const ref = tr.cells[Math.min(ci, tr.cells.length - 1)]; if (!ref) tr.append(td); else if (op === 'colLeft') ref.before(td); else ref.after(td); }); break;
        case 'delRow': row.remove(); if (!table.rows.length) table.remove(); break;
        case 'delCol': [...table.rows].forEach(tr => { const c = tr.cells[Math.min(ci, tr.cells.length - 1)]; if (c) c.remove(); if (!tr.cells.length) tr.remove(); }); if (!table.rows.length) table.remove(); break;
        case 'delTable': { const p = h('p', null, h('br')); table.replaceWith(p); break; }
        case 'shade': (val === 'row' ? [...row.cells] : [cell]).forEach(c => { c.style.backgroundColor = val && val !== 'row' && val !== '#ffffff' ? val : ''; }); break;
        case 'headerRow': { const first = table.rows[0]; [...first.cells].forEach(c => { const n = document.createElement(c.tagName === 'TH' ? 'td' : 'th'); n.innerHTML = c.innerHTML; for (const a of c.attributes) n.setAttribute(a.name, a.value); c.replaceWith(n); }); break; }
      }
    });
  }
  async function insertImageFile(file){
    try {
      const url = URL.createObjectURL(file); const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const x = c.getContext('2d'); const png = /png|gif|webp|svg/.test(file.type); if (!png){ x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const data = c.toDataURL(png ? 'image/png' : 'image/jpeg', .88);
      const maxW = contentWidthPx(); const w = Math.round(Math.min(c.width, maxW * .9, 480));
      insertHTML(`<img src="${data}" alt="" style="width:${w}px">`);
    } catch(e){ toast('That picture couldn’t be read. Try a JPG or PNG.'); }
  }
  function contentWidthPx(){ const g = pageGeom(); return (g.w - g.ml - g.mr) * 96; }
  /* picture selection */
  ed.addEventListener('click', e => { const im = e.target.closest && e.target.closest('img'); selectImg(im && inEd(im) ? im : null); });
  function selectImg(im){ if (selImg) selImg.classList.remove('selimg'); selImg = im; if (im){ im.classList.add('selimg'); const r = document.createRange(); r.selectNode(im); getSelection().removeAllRanges(); getSelection().addRange(r); savedRange = r.cloneRange(); showTab('picture'); } else if (currentTab === 'picture') showTab('home'); renderTabs(); }
  function imgOp(op, val){
    if (!selImg){ toast('Tap a picture first.'); return; } const im = selImg;
    act(() => {
      if (op === 'size') im.style.width = Math.round(contentWidthPx() * val / 100) + 'px';
      if (op === 'align'){ const b = im.closest(BLOCK_SEL) || im.parentElement; if (b && b !== ed) b.style.textAlign = val; else { const p = h('p', {style: `text-align:${val}`}); im.replaceWith(p); p.append(im); } }
      if (op === 'del'){ im.remove(); selImg = null; }
    });
    if (op === 'del'){ showTab('home'); } else { im.classList.remove('selimg'); im.classList.add('selimg'); }
  }

  /* ---------- paste: keep formatting people expect, drop web clutter ---------- */
  const OK_TAGS = new Set(['P','H1','H2','H3','H4','UL','OL','LI','B','STRONG','I','EM','U','S','STRIKE','DEL','SUB','SUP','A','BR','TABLE','THEAD','TBODY','TR','TD','TH','IMG','SPAN','BLOCKQUOTE','HR','PRE','CODE']);
  const OK_CSS = ['font-weight','font-style','text-decoration','text-decoration-line','color','background-color','font-size','font-family','text-align','vertical-align'];
  function sanitize(html){
    const doc = new DOMParser().parseFromString(html, 'text/html'); const out = document.createElement('div');
    function walk(src, dst){
      for (const n of [...src.childNodes]){
        if (n.nodeType === 3){ dst.append(n.data); continue; }
        if (n.nodeType !== 1) continue;
        let tag = n.tagName; if (/^(SCRIPT|STYLE|META|LINK|TITLE|IFRAME|OBJECT|EMBED|svg|NOSCRIPT|BUTTON|INPUT|SELECT|TEXTAREA)$/i.test(tag)) continue;
        if (/^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|NAV|FIGURE|FIGCAPTION|ADDRESS|DT|DD)$/.test(tag)) tag = n.querySelector('p,div,h1,h2,h3,h4,ul,ol,table,section,article') ? 'FRAG' : 'P';
        if (/^H[56]$/.test(tag)) tag = 'H4';
        if (tag === 'IMG' && !/^data:image\//.test(n.getAttribute('src') || '')) continue;
        if (!OK_TAGS.has(tag)){ walk(n, dst); continue; }
        const el = document.createElement(tag);
        if (tag === 'A'){ const href = n.getAttribute('href') || ''; if (/^(https?:|mailto:|tel:)/i.test(href)) el.setAttribute('href', href); }
        if (tag === 'IMG'){ el.src = n.getAttribute('src'); if (n.style.width) el.style.width = n.style.width; }
        if (tag === 'TD' || tag === 'TH'){ if (n.colSpan > 1) el.colSpan = n.colSpan; if (n.rowSpan > 1) el.rowSpan = n.rowSpan; }
        if (tag === 'OL' && n.getAttribute('start')) el.setAttribute('start', n.getAttribute('start'));
        for (const p of OK_CSS){ const v = n.style.getPropertyValue(p); if (v && !/^(normal|initial|inherit|transparent|start|auto|none|baseline|rgb\(0, 0, 0\)|#000000|black|400)$/.test(v.trim())) el.style.setProperty(p, v); }
        if (n.style.fontWeight === '400' || n.style.fontWeight === 'normal') { if (tag === 'B' || tag === 'STRONG'){ walk(n, dst); continue; } } // Google Docs wraps everything in <b style=font-weight:normal>
        dst.append(el); walk(n, el);
      }
    }
    walk(doc.body, out);
    return out.innerHTML.replace(/<FRAG>|<\/FRAG>/gi, '');
  }
  ed.addEventListener('paste', e => {
    const cd = e.clipboardData; if (!cd) return;
    const file = [...(cd.files || [])].find(f => f.type.startsWith('image/')); if (file){ e.preventDefault(); insertImageFile(file); return; }
    const html = cd.getData('text/html'), text = cd.getData('text/plain');
    e.preventDefault();
    if (html) insertHTML(sanitize(html));
    else if (text){ const paras = text.replace(/\r/g, '').split(/\n/); if (paras.length === 1) insertText(text); else insertHTML(paras.map(p => `<p>${p ? p.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) : '<br>'}</p>`).join('')); }
  });
  ed.addEventListener('drop', e => { const f = [...(e.dataTransfer && e.dataTransfer.files || [])].find(f => f.type.startsWith('image/')); if (f){ e.preventDefault(); insertImageFile(f); } });
  ed.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z' && !e.shiftKey){ e.preventDefault(); undo(); } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))){ e.preventDefault(); redo(); }
    else if (mod && (k === 'b' || k === 'i' || k === 'u')){ e.preventDefault(); exec({b:'bold', i:'italic', u:'underline'}[k]); }
    else if (k === 'tab' && !mod){ const a = anchorEl(); if (a && a.closest('li')){ e.preventDefault(); indent(e.shiftKey ? -1 : 1); } else if (a && a.closest('td,th')){ e.preventDefault(); const cells = $$('td,th', a.closest('table')); const i = cells.indexOf(a.closest('td,th')) + (e.shiftKey ? -1 : 1); if (cells[i]){ const r = document.createRange(); r.selectNodeContents(cells[i]); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); } else if (!e.shiftKey) tableOp('rowBelow'); } else { e.preventDefault(); insertHTML('<span class="tab">\t</span>&#8203;'); } }
    else if ((k === 'backspace' || k === 'delete') && selImg){ e.preventDefault(); imgOp('del'); }
  });
  document.addEventListener('keydown', e => { const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey; if ($('#editView').hidden) return;
    if (mod && k === 's'){ e.preventDefault(); onFile('saveDocx'); } if (mod && (k === 'f' || k === 'h')){ e.preventDefault(); openFind(k === 'h'); } if (e.key === 'Escape') closePop(); });

  /* ---------- popovers and dialogs ---------- */
  let pop = null;
  function closePop(){ if (pop){ pop.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); } }
  function outside(e){ if (pop && !pop.contains(e.target) && !(pop._anchor && pop._anchor.contains(e.target))) closePop(); }
  function popover(anchor, build){
    if (pop && pop._anchor === anchor){ closePop(); return; } closePop();
    const p = h('div', {class: 'pop', role: 'menu'}); p._anchor = anchor; p.addEventListener('mousedown', e => { if (!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) e.preventDefault(); });
    build(p); document.body.append(p); pop = p;
    const r = anchor.getBoundingClientRect(); const w = p.offsetWidth, hh = p.offsetHeight;
    let left = clampN(r.left, 8, innerWidth - w - 8), top = r.bottom + 4; if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 4);
    p.style.left = left + 'px'; p.style.top = top + 'px';
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  const mi = (label, fn, opts={}) => h('button', {class: 'mi' + (opts.on ? ' on' : ''), type: 'button', role: 'menuitem', onclick: () => { closePop(); fn(); }}, opts.icon ? h('span', {html: opts.icon, style: 'display:inline-flex;width:20px'}) : null, label, opts.note ? h('small', null, opts.note) : null);
  function swatches(colors, fn, noneLabel){
    const g = h('div', {class: 'swatches'}); colors.forEach(c => g.append(h('button', {type: 'button', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => { closePop(); fn(c); }})));
    return h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, noneLabel ? mi(noneLabel, () => fn(null)) : null, g);
  }
  function dialog(title, body, actions){
    $$('.dlg-back').forEach(x => x.remove()); closePop();
    const back = h('div', {class: 'dlg-back'}); const box = h('div', {class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title}, h('h3', null, title), ...[].concat(body));
    const close = () => back.remove();
    const acts = h('div', {class: 'acts'}); actions.forEach(([label, fn, cls]) => acts.append(h('button', {class: 'btn ' + (cls || ''), type: 'button', onclick: async () => { if ((await fn()) !== false) close(); }}, label)));
    box.append(acts); back.append(box); back.addEventListener('pointerdown', e => { if (e.target === back) close(); }); back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.append(back); setTimeout(() => { const f = box.querySelector('input,textarea,select'); if (f) f.focus(); }, 30);
    return {close, box};
  }
  function linkDialog(){
    const a = anchorEl() && anchorEl().closest('a'); const r = selRange(); const selText = r ? r.toString() : '';
    const t = h('input', {class: 'inp', id: 'lkText', value: a ? a.textContent : selText}), u = h('input', {class: 'inp', id: 'lkUrl', value: a ? a.getAttribute('href') : 'https://', inputmode: 'url'});
    const acts = [['Cancel', () => {}], ['Insert link', () => { let url = u.value.trim(); if (!url || url === 'https://') return false; if (!/^(https?:|mailto:|tel:)/i.test(url)) url = (/@/.test(url) ? 'mailto:' : 'https://') + url;
      const text = t.value.trim() || url; if (a){ act(() => { a.href = url; a.textContent = text; }); } else if (selText && text === selText) exec('createLink', url); else insertHTML(`<a href="${url.replace(/"/g, '&quot;')}">${text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</a>&nbsp;`); }, 'primary']];
    if (a) acts.splice(1, 0, ['Remove link', () => act(() => { a.replaceWith(...a.childNodes); })]);
    dialog(a ? 'Edit link' : 'Insert link', [h('label', {class: 'f'}, 'Text to show', t), h('label', {class: 'f'}, 'Web address', u)], acts);
  }
  function hfDialog(){
    const hd = h('textarea', {class: 'inp', id: 'hfHead', rows: 2}, D.header || ''), ft = h('textarea', {class: 'inp', id: 'hfFoot', rows: 2}, D.footer || '');
    const pn = h('input', {type: 'checkbox', id: 'hfNum'}); pn.checked = !!D.pageNumbers;
    dialog('Header & footer', [h('label', {class: 'f'}, 'Header (top of every page)', hd), h('label', {class: 'f'}, 'Footer (bottom of every page)', ft), h('label', {class: 'chk'}, pn, 'Show page numbers in the footer (Page 1 of 3)')],
      [['Cancel', () => {}], ['Apply', () => { D.header = hd.value; D.footer = ft.value; D.pageNumbers = pn.checked; paintHF(); changed(false); onChange(); }, 'primary']]);
  }
  function countDialog(){
    const s = stats();
    dialog('Word count', [h('dl', {class: 'stats'}, h('dt', null, 'Pages'), h('dd', null, s.pages), h('dt', null, 'Words'), h('dd', null, s.words.toLocaleString('en-IN')), h('dt', null, 'Characters (no spaces)'), h('dd', null, s.charsNoSp.toLocaleString('en-IN')), h('dt', null, 'Characters (with spaces)'), h('dd', null, s.chars.toLocaleString('en-IN')), h('dt', null, 'Paragraphs'), h('dd', null, s.paras), h('dt', null, 'Lines'), h('dd', null, s.lines))], [['Close', () => {}, 'primary']]);
  }

  /* ---------- find & replace ---------- */
  let matches = [], mIdx = -1;
  function openFind(replace){ $('#findbar').hidden = false; $('#replIn').hidden = $('#replOne').hidden = $('#replAll').hidden = !replace && innerWidth < 600 && !$('#replIn').value; const r = selRange(); const t = r && r.toString(); if (t && t.length < 60) $('#findIn').value = t; $('#findIn').focus(); $('#findIn').select(); runFind(); }
  function textIndex(){ const nodes = []; const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n, s = '', pos = 0; while ((n = w.nextNode())){ nodes.push([n, pos]); s += n.data; pos += n.data.length; } return {s, nodes}; }
  function rangeAt(nodes, a, b){ const loc = off => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= off) return [nodes[i][0], Math.min(off - nodes[i][1], nodes[i][0].data.length)]; return null; }; const r = document.createRange(); const s = loc(a), e = loc(b); if (!s || !e) return null; r.setStart(...s); r.setEnd(...e); return r; }
  function runFind(keep){
    const q = $('#findIn').value; matches = []; if (CSS.highlights) { CSS.highlights.delete('srk-find'); CSS.highlights.delete('srk-cur'); }
    if (!q){ $('#findCnt').textContent = ''; return; }
    const {s, nodes} = textIndex(); const cs = $('#findCase').checked; const hay = cs ? s : s.toLowerCase(), needle = cs ? q : q.toLowerCase();
    let i = hay.indexOf(needle); while (i >= 0 && matches.length < 2000){ const r = rangeAt(nodes, i, i + q.length); if (r) matches.push(r); i = hay.indexOf(needle, i + Math.max(1, q.length)); }
    if (CSS.highlights && matches.length) CSS.highlights.set('srk-find', new Highlight(...matches));
    if (!keep) mIdx = matches.length ? 0 : -1; else mIdx = Math.min(mIdx, matches.length - 1);
    showMatch(false);
  }
  function showMatch(scroll=true){ $('#findCnt').textContent = matches.length ? `${mIdx + 1} of ${matches.length}` : 'No matches'; if (mIdx < 0) return; const r = matches[mIdx];
    if (CSS.highlights) CSS.highlights.set('srk-cur', new Highlight(r));
    if (scroll){ const el = r.startContainer.parentElement; el && el.scrollIntoView({block: 'center', behavior: 'smooth'}); } savedRange = r.cloneRange(); }
  $('#findIn').addEventListener('input', () => runFind()); $('#findCase').addEventListener('change', () => runFind());
  $('#findIn').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
  function step(d){ if (!matches.length) return; mIdx = (mIdx + d + matches.length) % matches.length; showMatch(); }
  $('#findNext').onclick = () => step(1); $('#findPrev').onclick = () => step(-1);
  $('#replOne').onclick = () => { if (mIdx < 0) return; const r = matches[mIdx]; if (dirty) record(); r.deleteContents(); r.insertNode(document.createTextNode($('#replIn').value)); ed.normalize(); changed(true); runFind(true); showMatch(); };
  $('#replAll').onclick = () => { if (!matches.length) return; if (dirty) record(); const n = matches.length; for (const r of [...matches].reverse()){ r.deleteContents(); if ($('#replIn').value) r.insertNode(document.createTextNode($('#replIn').value)); } ed.normalize(); changed(true); runFind(); toast(`Replaced ${n} match${n > 1 ? 'es' : ''}.`); };
  $('#findClose').onclick = () => { $('#findbar').hidden = true; if (CSS.highlights){ CSS.highlights.delete('srk-find'); CSS.highlights.delete('srk-cur'); } };

  /* ---------- read aloud ---------- */
  let speaking = false;
  function speakText(){
    if (speaking){ stopSpeak(); return; }
    const r = selRange(); let text = r && r.toString().trim();
    if (!text){ text = ed.innerText; const off = caretOffsets(); if (off && off[0] > 0 && off[0] < text.length - 20) text = ed.textContent.slice(off[0]); }
    text = text.replace(/\s+\n/g, '\n').trim(); if (!text){ toast('There’s no text to read.'); return; }
    const tamil = (text.match(/[஀-௿]/g) || []).length > (text.match(/[A-Za-z]/g) || []).length; // voice follows most of the text
    if (window.SRKDocs && SRKDocs.speak){ const r = SRKDocs.speak(text, tamil ? 'ta-IN' : 'en-IN');
      if (r === 'nolang'){ toast('No Tamil voice is installed. Add one in Android Settings › Text-to-speech, then try again.', 4500); return; }
      if (r !== 'ok'){ toast('Read aloud is starting up. Try again in a moment.'); return; }
      speaking = true; renderRibbon(); return; }
    if (!('speechSynthesis' in window)){ toast('Read aloud isn’t available on this device.'); return; }
    speechSynthesis.cancel(); const parts = text.match(/[^.!?।\n]+[.!?।]?\s*/g) || [text];
    parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p); u.lang = tamil ? 'ta-IN' : 'en-IN'; if (i === parts.length - 1) u.onend = () => { speaking = false; renderRibbon(); }; speechSynthesis.speak(u); });
    speaking = true; renderRibbon();
  }
  function stopSpeak(){ speaking = false; if (window.SRKDocs && SRKDocs.stopSpeaking) SRKDocs.stopSpeaking(); else if ('speechSynthesis' in window) speechSynthesis.cancel(); renderRibbon(); }
  window.srkSpeechDone = () => { speaking = false; renderRibbon(); };

  /* ---------- page geometry, view, zoom, page markers ---------- */
  function pageGeom(){ const p = (D && D.page) || {size: 'a4', orient: 'portrait', margins: {t:1, r:1, b:1, l:1}}; const [a, b] = PAGE_SIZES[p.size] || PAGE_SIZES.a4; const land = p.orient === 'landscape';
    return {w: land ? b : a, h: land ? a : b, mt: p.margins.t, mr: p.margins.r, mb: p.margins.b, ml: p.margins.l}; }
  function fitZoom(){ const g = pageGeom(); return Math.min(1.25, Math.max(.3, (desk.clientWidth - 32) / (g.w * 96))); }
  function zoomVal(){ return userZoom ?? (view === 'print' ? Math.min(1, fitZoom()) : 1); }
  function layout(){
    if (!D) return; const g = pageGeom();
    desk.classList.toggle('print', view === 'print'); desk.classList.toggle('mobile', view !== 'print'); desk.classList.toggle('night', night && reading);
    if (view === 'print'){
      Object.assign(sheet.style, {width: g.w * 96 + 'px', minHeight: g.h * 96 + 'px', padding: `${g.mt * 96}px ${g.mr * 96}px ${g.mb * 96}px ${g.ml * 96}px`});
      $('#hdrBox').style.top = Math.max(8, g.mt * 96 * .45) + 'px'; $('#ftrBox').style.bottom = Math.max(8, g.mb * 96 * .4) + 'px';
      $('#hdrBox').style.padding = `0 ${g.mr * 96}px 0 ${g.ml * 96}px`; $('#ftrBox').style.padding = $('#hdrBox').style.padding;
    } else { sheet.style.width = ''; sheet.style.minHeight = ''; sheet.style.padding = ''; }
    sheet.style.zoom = zoomVal();
    $('#zoomLbl').textContent = Math.round(zoomVal() * 100) + '%';
    $('#viewToggle').textContent = view === 'print' ? 'Print layout' : 'Mobile view';
    drawMarks(); updateStatus();
  }
  function pageSlices(root, contentH, scale, top0){
    const rel = y => (y - top0) / scale; const total = Math.max(1, root.getBoundingClientRect().height / scale);
    const forced = $$('.pb', root).map(e => rel(e.getBoundingClientRect().top)).filter(y => y > 2).sort((a, b) => a - b);
    const cands = $$('p,h1,h2,h3,h4,li,tr,img,table,hr,blockquote,pre,ul,ol', root).map(e => rel(e.getBoundingClientRect().bottom)).filter(y => y > 0).sort((a, b) => a - b);
    const out = []; let y = 0, guard = 0;
    while (y < total - 1 && guard++ < 2000){
      const limit = y + contentH; const f = forced.find(v => v > y + 1 && v <= limit); let end;
      if (f) end = f; else if (limit >= total) end = total; else { const c = cands.filter(v => v > y + contentH * .3 && v <= limit + .5); end = c.length ? c[c.length - 1] : limit; }
      out.push([y, Math.max(end, y + 1)]); y = end;
    }
    return out.length ? out : [[0, total]];
  }
  let slices = [[0, 1]];
  function scaleOf(){ return sheet.getBoundingClientRect().width / (sheet.offsetWidth || 1) || 1; }
  function drawMarks(){
    const marks = $('#marks'); marks.innerHTML = '';
    if (view !== 'print'){ slices = [[0, 1]]; return; }
    const g = pageGeom(); const sc = scaleOf(); slices = pageSlices(ed, (g.h - g.mt - g.mb) * 96, sc, ed.getBoundingClientRect().top);
    const pageH = g.h * 96; sheet.style.minHeight = (slices.length * pageH) + 'px';
    slices.slice(1).forEach(([y0], i) => { marks.append(h('div', {class: 'pmark', style: `top:${ed.offsetTop + y0}px`}, h('span', null, `Page ${i + 2}`))); });
  }
  function stats(){
    const text = ed.innerText || ''; const words = (text.match(/[^\s]+/g) || []).length;
    const paras = $$('p,h1,h2,h3,h4,li,blockquote,td,th', ed).filter(e => e.textContent.trim() && !e.querySelector('p,li')).length;
    return {pages: view === 'print' ? slices.length : Math.max(1, Math.ceil(ed.scrollHeight / ((pageGeom().h - pageGeom().mt - pageGeom().mb) * 96))), words, chars: text.replace(/\n/g, '').length, charsNoSp: text.replace(/\s/g, '').length, paras, lines: Math.round(ed.scrollHeight / (parseFloat(getComputedStyle(ed).lineHeight) || 18))};
  }
  function updateStatus(){
    const s = stats(); let page = 1;
    if (view === 'print'){ const r = selRange(); if (r){ const rr = r.getClientRects()[0] || (r.startContainer.nodeType === 1 ? r.startContainer.getBoundingClientRect() : null); if (rr){ const y = (rr.top - ed.getBoundingClientRect().top) / scaleOf(); page = Math.max(1, slices.findIndex(([a, b]) => y >= a - 1 && y < b) + 1 || 1); } } }
    $('#statTxt').textContent = `Page ${page} of ${s.pages} · ${s.words.toLocaleString('en-IN')} word${s.words === 1 ? '' : 's'}`;
  }
  function setView(v){ view = v; userZoom = null; layout(); renderRibbon(); }
  function zoomBy(f){ userZoom = clampN(Math.round((zoomVal() * f) * 20) / 20, .3, 3); layout(); }
  $('#viewToggle').onclick = () => setView(view === 'print' ? 'mobile' : 'print');
  $('#zoomIn').onclick = () => zoomBy(1.15); $('#zoomOut').onclick = () => zoomBy(1 / 1.15);
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (!$('#editView').hidden) layout(); }, 150); });
  function setReading(on){ reading = on; ed.contentEditable = String(!on); ed.classList.toggle('reading', on); if (on){ setView('mobile'); userZoom = 1.12; layout(); } else { night = false; userZoom = null; layout(); }
    $('#rtabs').hidden = on; $('#ribbon').hidden = on; renderExitRead(); }
  function renderExitRead(){ let b = $('#exitRead'); if (reading && !b){ b = h('div', {id: 'exitRead', class: 'findbar gut'}, h('b', {style: 'flex:1;font-size:14px'}, 'Read mode'), h('button', {class: 'btn sm', type: 'button', onclick: () => { night = !night; layout(); }}, 'Night'), h('button', {class: 'btn sm', type: 'button', onclick: speakText}, 'Read aloud'), h('button', {class: 'btn sm primary', type: 'button', onclick: () => setReading(false)}, 'Edit')); $('#ribbon').after(b); } else if (!reading && b) b.remove(); }
  function paintHF(){ $('#hdrBox').textContent = D.header || ''; $('#ftrBox').textContent = [D.footer || '', D.pageNumbers ? 'Page 1 of N' : ''].filter(Boolean).join('\n'); }
  $('#hdrBox').onclick = hfDialog; $('#ftrBox').onclick = hfDialog;

  /* ---------- page setup ---------- */
  const MARGINS = {normal: {t:1, r:1, b:1, l:1}, narrow: {t:.5, r:.5, b:.5, l:.5}, moderate: {t:1, r:.75, b:1, l:.75}, wide: {t:1, r:2, b:1, l:2}};
  function setPage(k, v){ D.page = {...D.page, [k]: v}; layout(); changed(false); onChange(); renderRibbon(); }
  function marginKey(){ const m = D.page.margins; return Object.keys(MARGINS).find(k => ['t','r','b','l'].every(s => Math.abs(MARGINS[k][s] - m[s]) < .01)) || 'custom'; }
  function marginsDialog(){
    const m = D.page.margins; const f = s => h('input', {class: 'inp', id: 'mg' + s, inputmode: 'decimal', value: String(Math.round(m[s] * 2.54 * 100) / 100)});
    const ins = {t: f('t'), b: f('b'), l: f('l'), r: f('r')};
    dialog('Custom margins (cm)', [h('div', {style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px'}, h('label', {class: 'f'}, 'Top', ins.t), h('label', {class: 'f'}, 'Bottom', ins.b), h('label', {class: 'f'}, 'Left', ins.l), h('label', {class: 'f'}, 'Right', ins.r))],
      [['Cancel', () => {}], ['Apply', () => { const v = {}; for (const s of ['t','r','b','l']){ const n = parseFloat(ins[s].value); if (!(n >= 0 && n < 10)) { toast('Enter margins between 0 and 10 cm.'); return false; } v[s] = Math.round(n / 2.54 * 1000) / 1000; } setPage('margins', v); }, 'primary']]);
  }

  /* ---------- ribbon ---------- */
  const TABS = [['file', 'File'], ['home', 'Home'], ['table', 'Table', 'ctx'], ['picture', 'Picture', 'ctx'], ['insert', 'Insert'], ['layout', 'Layout'], ['review', 'Review'], ['view', 'View']];
  function renderTabs(){
    const nav = $('#rtabs'); nav.innerHTML = ''; const inTable = !!curCell();
    for (const [id, label, ctx] of TABS){
      if (id === 'table' && !inTable && currentTab !== 'table') continue; if (id === 'picture' && !selImg) continue;
      nav.append(h('button', {class: 'rtab' + (ctx ? ' ctx' : '') + (id === 'file' ? ' file' : ''), role: 'tab', type: 'button', 'aria-selected': String(id === currentTab), onclick: () => id === 'file' ? onFile('menu') : showTab(id)}, label));
    }
  }
  function showTab(id){ currentTab = id; renderTabs(); renderRibbon(); }
  const R = {
    btn: (o) => { const b = h('button', {class: 'rb' + (o.cls ? ' ' + o.cls : ''), type: 'button', title: o.title || o.label, 'aria-label': o.title || o.label, 'data-id': o.id || null, onclick: e => o.run(e.currentTarget)}, o.html ? h('span', {html: o.html, style: 'display:inline-flex;align-items:center'}) : null, o.text ? h('span', null, o.text) : null, o.menu ? h('span', {html: IC.caret, style: 'display:inline-flex'}) : null);
      b.addEventListener('mousedown', e => e.preventDefault()); return b; },
    sel: (o) => { const s = h('select', {class: 'rsel ' + (o.cls || ''), id: o.id, 'aria-label': o.title}); o.options.forEach(([v, l]) => s.append(h('option', {value: v}, l))); s.addEventListener('change', () => o.run(s.value)); return s; },
    group: (label, ...items) => h('div', {class: 'grp'}, h('div', {class: 'row'}, ...items), h('div', {class: 'gl'}, label)),
  };
  function colorBtn(id, title, html, colors, fn, none){ const b = R.btn({id, title, html, menu: true, run: el => popover(el, p => p.append(swatches(colors, c => fn(c), none)))}); return b; }
  function renderRibbon(){
    const rb = $('#ribbon'); rb.innerHTML = ''; const B = R.btn, G = R.group;
    if (currentTab === 'home'){
      const font = R.sel({id: 'fontSel', cls: 'font', title: 'Font', options: FONTS.map(f => [f, f]), run: v => setFont(v)});
      const size = R.sel({id: 'sizeSel', cls: 'size', title: 'Font size', options: SIZES.map(s => [s, s]), run: v => setSize(+v)});
      rb.append(
        G('Font', font, size, B({title: 'Bigger text', text: 'A+', run: () => grow(1)}), B({title: 'Smaller text', text: 'A−', run: () => grow(-1)})),
        G('Format', B({id: 'bold', title: 'Bold (Ctrl+B)', html: '<b style="font-size:16px">B</b>', run: () => exec('bold')}), B({id: 'italic', title: 'Italic (Ctrl+I)', html: '<i style="font-size:16px;font-family:Georgia,serif">I</i>', run: () => exec('italic')}),
          B({id: 'underline', title: 'Underline (Ctrl+U)', html: '<u style="font-size:16px">U</u>', run: () => exec('underline')}), B({id: 'strikeThrough', title: 'Strikethrough', html: '<s style="font-size:16px">ab</s>', run: () => exec('strikeThrough')}),
          B({id: 'subscript', title: 'Subscript', html: '<span style="font-size:15px">x₂</span>', run: () => exec('subscript')}), B({id: 'superscript', title: 'Superscript', html: '<span style="font-size:15px">x²</span>', run: () => exec('superscript')}),
          colorBtn('fc', 'Text colour', '<span class="stack" style="display:flex;flex-direction:column;align-items:center;font-weight:700;font-size:15px;line-height:1.1">A<i class="sw" style="background:#c00000"></i></span>', TEXT_COLORS, c => exec('foreColor', c || '#000000'), 'Automatic (black)'),
          colorBtn('hc', 'Highlight', `<span style="display:flex;flex-direction:column;align-items:center">${IC.hl.replace('<svg', '<svg style="width:17px;height:17px"')}<i class="sw" style="background:#ffff00"></i></span>`, HL_COLORS, c => exec('hiliteColor', c || 'transparent'), 'No highlight'),
          B({title: 'Clear formatting', html: IC.clear, run: clearFormat})),
        G('Paragraph', B({id: 'ul', title: 'Bullets', html: IC.bullets, run: () => listCmd('ul')}), B({id: 'ol', title: 'Numbering', html: IC.numbers, run: () => listCmd('ol')}),
          B({title: 'Decrease indent', html: IC.outdent, run: () => indent(-1)}), B({title: 'Increase indent', html: IC.indent, run: () => indent(1)}),
          B({id: 'justifyLeft', title: 'Align left', html: IC.left, run: () => exec('justifyLeft')}), B({id: 'justifyCenter', title: 'Center', html: IC.center, run: () => exec('justifyCenter')}),
          B({id: 'justifyRight', title: 'Align right', html: IC.right, run: () => exec('justifyRight')}), B({id: 'justifyFull', title: 'Justify', html: IC.justify, run: () => exec('justifyFull')}),
          B({title: 'Line spacing', html: IC.spacing, menu: true, run: el => popover(el, p => { ['1.0','1.08','1.15','1.5','2.0','2.5','3.0'].forEach(v => p.append(mi(v, () => blockStyle('lineHeight', v)))); p.append(h('hr'), mi('No space after paragraph', () => blockStyle('marginBottom', '0pt')), mi('Add space after paragraph', () => blockStyle('marginBottom', '12pt'))); })})),
        G('Styles', R.sel({id: 'styleSel', cls: 'style', title: 'Style', options: STYLES, run: v => setStyle(v)})),
        G('Editing', B({title: 'Find', html: IC.find, text: 'Find', run: () => openFind(false)}), B({title: 'Replace', text: 'Replace', run: () => openFind(true)}))
      );
    }
    if (currentTab === 'insert'){
      rb.append(
        G('Tables', B({title: 'Table', html: IC.table, text: 'Table', menu: true, run: el => popover(el, p => { const lbl = h('div', {class: 'hint', style: 'margin-bottom:6px'}, 'Insert table'); const g = h('div', {class: 'tgrid'}); const cells = [];
          for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++){ const i = h('i', {role: 'button', 'aria-label': `${r} by ${c} table`}); i.addEventListener('pointerenter', () => { cells.forEach(([e, rr, cc]) => e.classList.toggle('on', rr <= r && cc <= c)); lbl.textContent = `${c} × ${r} table`; }); i.addEventListener('click', () => { closePop(); insertTable(r, c); }); cells.push([i, r, c]); g.append(i); }
          p.append(lbl, g); })})),
        G('Media', (() => { const inp = h('input', {type: 'file', accept: 'image/*', class: 'fileover', 'aria-label': 'Insert picture'}); inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f){ restore(); insertImageFile(f); } });
            const b = B({title: 'Picture', html: IC.pic, text: 'Picture', run: () => {}}); b.classList.add('filepick'); b.append(inp); return b; })(),
          B({title: 'Link', html: IC.link, text: 'Link', run: linkDialog})),
        G('Pages', B({title: 'Page break', html: IC.pb, text: 'Page break', run: () => insertHTML('<div class="pb" contenteditable="false"></div><p><br></p>')}), B({title: 'Horizontal line', html: IC.hr, text: 'Line', run: () => insertHTML('<hr><p><br></p>')})),
        G('Text', B({title: 'Symbol', html: IC.sym, text: 'Symbol', menu: true, run: el => popover(el, p => { const g = h('div', {class: 'symgrid'}); SYMBOLS.forEach(s => g.append(h('button', {type: 'button', onclick: () => { closePop(); insertText(s); }}, s))); p.append(g); })}),
          B({title: 'Date', html: IC.date, text: 'Date', menu: true, run: el => popover(el, p => { const d = new Date(); [d.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'}), d.toLocaleDateString('en-GB'), d.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}), d.toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})].forEach(t => p.append(mi(t, () => insertText(t)))); })})),
        G('Header & footer', B({title: 'Header & footer', html: IC.hf, text: 'Header & footer', run: hfDialog}), B({id: 'pnum', title: 'Page numbers', html: IC.pnum, text: 'Page numbers', run: () => { D.pageNumbers = !D.pageNumbers; paintHF(); changed(false); onChange(); renderRibbon(); toast(D.pageNumbers ? 'Page numbers added to the footer.' : 'Page numbers removed.'); }}))
      );
    }
    if (currentTab === 'layout'){
      const p = D.page;
      rb.append(
        G('Page', B({title: 'Size', html: IC.size, text: ({a4: 'A4', letter: 'Letter', legal: 'Legal'})[p.size], menu: true, run: el => popover(el, pp => [['a4', 'A4', '21 × 29.7 cm'], ['letter', 'Letter', '21.6 × 27.9 cm'], ['legal', 'Legal', '21.6 × 35.6 cm']].forEach(([k, l, n]) => pp.append(mi(l, () => setPage('size', k), {on: p.size === k, note: n}))))}),
          B({title: 'Orientation', html: IC.orient, text: p.orient === 'landscape' ? 'Landscape' : 'Portrait', menu: true, run: el => popover(el, pp => [['portrait', 'Portrait'], ['landscape', 'Landscape']].forEach(([k, l]) => pp.append(mi(l, () => setPage('orient', k), {on: p.orient === k}))))}),
          B({title: 'Margins', html: IC.margins, text: 'Margins', menu: true, run: el => popover(el, pp => { const cur = marginKey(); [['normal', 'Normal', '2.54 cm all round'], ['narrow', 'Narrow', '1.27 cm'], ['moderate', 'Moderate', '2.54 / 1.91 cm'], ['wide', 'Wide', '2.54 / 5.08 cm']].forEach(([k, l, n]) => pp.append(mi(l, () => setPage('margins', MARGINS[k]), {on: cur === k, note: n}))); pp.append(h('hr'), mi('Custom margins…', marginsDialog, {on: cur === 'custom'})); })})),
        G('Paragraph', B({title: 'Line spacing', html: IC.spacing, text: 'Spacing', menu: true, run: el => popover(el, pp => { ['1.0','1.15','1.5','2.0'].forEach(v => pp.append(mi(v + ' lines', () => blockStyle('lineHeight', v)))); pp.append(h('hr')); [['0', 'None'], ['6', '6 pt'], ['8', '8 pt'], ['12', '12 pt']].forEach(([v, l]) => pp.append(mi('Space after: ' + l, () => blockStyle('marginBottom', v + 'pt')))); })}),
          B({title: 'Decrease indent', html: IC.outdent, run: () => indent(-1)}), B({title: 'Increase indent', html: IC.indent, run: () => indent(1)})),
        G('Document', R.sel({id: 'docFont', cls: 'font', title: 'Default font for this document', options: FONTS.map(f => [f, f]), run: v => { D.defaults.font = v; applyDocStyle(); layout(); changed(false); onChange(); }}),
          R.sel({id: 'docSize', cls: 'size', title: 'Default size', options: SIZES.map(s => [s, s]), run: v => { D.defaults.size = +v; applyDocStyle(); layout(); changed(false); onChange(); }}))
      );
      $('#docFont').value = FONTS.includes(D.defaults.font) ? D.defaults.font : ''; $('#docSize').value = String(D.defaults.size);
    }
    if (currentTab === 'review'){
      rb.append(
        G('Proofing', B({id: 'spell', title: 'Check spelling as you type', html: IC.spell, text: 'Spelling', run: () => { ed.spellcheck = !ed.spellcheck; try { localStorage.setItem('srkdocs-spell', ed.spellcheck ? '1' : '0'); } catch(e){} ed.blur(); restore(); renderRibbon(); toast(ed.spellcheck ? 'Spelling check on. Misspelled words are underlined in red.' : 'Spelling check off.'); }}),
          B({title: 'Word count', html: IC.count, text: 'Word count', run: countDialog})),
        G('Speech', speaking ? B({title: 'Stop reading', html: IC.stop, text: 'Stop', run: stopSpeak}) : B({title: 'Read aloud', html: IC.speak, text: 'Read aloud', run: speakText})),
        G('Find', B({title: 'Find', html: IC.find, text: 'Find', run: () => openFind(false)}), B({title: 'Replace', text: 'Replace', run: () => openFind(true)}))
      );
    }
    if (currentTab === 'view'){
      rb.append(
        G('Views', B({id: 'vPrint', title: 'Print layout: see pages as they print', html: IC.print, text: 'Print layout', run: () => setView('print')}), B({id: 'vMobile', title: 'Mobile view: text fits your screen', html: IC.mobile, text: 'Mobile view', run: () => setView('mobile')}), B({title: 'Read mode', html: IC.read, text: 'Read mode', run: () => setReading(true)})),
        G('Zoom', B({title: 'Zoom out', text: '−', run: () => zoomBy(1 / 1.15)}), B({title: '100%', text: '100%', run: () => { userZoom = 1; layout(); }}), B({title: 'Zoom in', text: '+', run: () => zoomBy(1.15)}), B({title: 'Fit page width', text: 'Fit width', run: () => { userZoom = view === 'print' ? fitZoom() : 1; layout(); }}))
      );
    }
    if (currentTab === 'table'){
      rb.append(
        G('Rows & columns', B({title: 'Insert row above', html: IC.rowAbove, run: () => tableOp('rowAbove')}), B({title: 'Insert row below', html: IC.rowBelow, run: () => tableOp('rowBelow')}), B({title: 'Insert column left', html: IC.colLeft, run: () => tableOp('colLeft')}), B({title: 'Insert column right', html: IC.colRight, run: () => tableOp('colRight')})),
        G('Delete', B({title: 'Delete row', text: 'Row', html: IC.del, run: () => tableOp('delRow')}), B({title: 'Delete column', text: 'Column', html: IC.del, run: () => tableOp('delCol')}), B({title: 'Delete table', text: 'Table', html: IC.del, run: () => tableOp('delTable')})),
        G('Style', colorBtn('shade', 'Cell shading', IC.shade, SHADES, c => tableOp('shade', c), 'No shading'), B({title: 'Header row (bold, repeats on each page)', text: 'Header row', run: () => tableOp('headerRow')}))
      );
    }
    if (currentTab === 'picture'){
      rb.append(
        G('Size', ...[25, 50, 75, 100].map(v => B({title: `${v}% of page width`, text: v + '%', run: () => imgOp('size', v)}))),
        G('Position', B({title: 'Left', html: IC.left, run: () => imgOp('align', 'left')}), B({title: 'Center', html: IC.center, run: () => imgOp('align', 'center')}), B({title: 'Right', html: IC.right, run: () => imgOp('align', 'right')})),
        G('Picture', B({title: 'Delete picture', html: IC.del, text: 'Delete', run: () => imgOp('del')}))
      );
    }
    updateUI();
  }
  let uiRaf = 0; function scheduleUI(){ cancelAnimationFrame(uiRaf); uiRaf = requestAnimationFrame(() => { updateUI(); }); }
  let lastTable = false;
  function updateUI(){
    if (!D || $('#editView').hidden) return;
    const tbl = !!curCell(); if (tbl !== lastTable){ lastTable = tbl; if (!tbl && currentTab === 'table'){ currentTab = 'home'; renderRibbon(); } renderTabs(); }
    const q = c => { try { return document.queryCommandState(c); } catch(e){ return false; } };
    for (const id of ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull']){ const b = $(`.rb[data-id="${id}"]`); if (b) b.classList.toggle('on', q(id)); }
    const ul = $('.rb[data-id="ul"]'), ol = $('.rb[data-id="ol"]'); if (ul) ul.classList.toggle('on', q('insertUnorderedList')); if (ol) ol.classList.toggle('on', q('insertOrderedList'));
    const a = anchorEl();
    if (!a){ const ss = $('#sizeSel'), fs = $('#fontSel'); if (ss && document.activeElement !== ss) ss.value = String(D.defaults.size); if (fs && document.activeElement !== fs && FONTS.includes(D.defaults.font)) fs.value = D.defaults.font; }
    if (a){
      const cs = getComputedStyle(a); const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const fs = $('#fontSel');
      if (fs && document.activeElement !== fs){ const match = FONTS.find(f => f.toLowerCase() === fam.toLowerCase()) || (/carlito/i.test(fam) ? 'Calibri' : null); if (match) fs.value = match; else { if (!fs.querySelector(`option[value="${CSS.escape(fam)}"]`)) fs.append(h('option', {value: fam}, fam)); fs.value = fam; } }
      const ss = $('#sizeSel'); if (ss && document.activeElement !== ss){ const pt = Math.round(parseFloat(cs.fontSize) * .75 * 2) / 2; if (!ss.querySelector(`option[value="${pt}"]`)) ss.append(h('option', {value: pt}, pt)); ss.value = String(pt); }
      const st = $('#styleSel'); if (st && document.activeElement !== st){ const b = a.closest('h1,h2,h3,h4,blockquote,p,li,td,th'); st.value = !b ? 'p' : b.matches('h1.title') ? 'title' : b.matches('h1') ? 'h1' : b.matches('h2') ? 'h2' : b.matches('h3,h4') ? 'h3' : b.matches('blockquote') ? 'quote' : 'p'; }
    }
    const sp = $('.rb[data-id="spell"]'); if (sp) sp.classList.toggle('on', ed.spellcheck);
    const pn = $('.rb[data-id="pnum"]'); if (pn) pn.classList.toggle('on', !!D.pageNumbers);
    const vp = $('.rb[data-id="vPrint"]'), vm = $('.rb[data-id="vMobile"]'); if (vp) vp.classList.toggle('on', view === 'print'); if (vm) vm.classList.toggle('on', view !== 'print');
    updateUndo(); clearTimeout(statT); statT = setTimeout(updateStatus, 120);
  }
  let statT;

  /* ---------- public ---------- */
  function load(doc){
    D = doc; D.defaults = {font: 'Calibri', size: 11, after: 8, line: 1.08, ...(doc.defaults || {})}; D.page = doc.page || {size: 'a4', orient: 'portrait', margins: {t:1, r:1, b:1, l:1}};
    applyDocStyle(); ed.innerHTML = doc.html || '<p><br></p>';
    $$('.pb', ed).forEach(p => p.setAttribute('contenteditable', 'false'));
    try { ed.spellcheck = localStorage.getItem('srkdocs-spell') !== '0'; } catch(e){}
    selImg = null; savedRange = null; reading = false; ed.contentEditable = 'true'; $('#rtabs').hidden = $('#ribbon').hidden = false; renderExitRead();
    $('#findbar').hidden = true; currentTab = 'home'; userZoom = null; view = innerWidth < 760 ? 'mobile' : 'print';
    paintHF(); renderTabs(); renderRibbon(); resetHistory();
    requestAnimationFrame(() => { layout(); desk.scrollTop = 0; });
  }
  function html(){ const c = ed.cloneNode(true); $$('.selimg', c).forEach(i => i.classList.remove('selimg')); $$('[class=""]', c).forEach(e => e.removeAttribute('class')); return c.innerHTML; }
  return {
    load, html, docCss, layout, pageGeom, pageSlices, stats, toast, setReading, stopSpeak, popover, closePop, dialog, mi,
    get doc(){ return D; }, get reading(){ return reading; },
    onChange(fn){ onChange = fn; }, onFile(fn){ onFile = fn; }, focus(){ restore(); },
    flush(){ if (dirty) record(); },
  };
})();
