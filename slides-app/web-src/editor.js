/* SRK Slides — slide editor: stage, selection, text editing, ribbon, thumbnails, notes, undo */
'use strict';
const Editor = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)){ if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); return e; };
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    newSlide: S('<rect x="3" y="5" width="14" height="10" rx="1.5"/><path d="M20 14v6M17 17h6"/>'),
    layout: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M10 9v11"/>'),
    dup: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    bold: S('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" stroke-width="2.2"/>'),
    italic: S('<path d="M14 5h-4M14 19h-4M14 5l-4 14"/>'), underline: S('<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'), strike: S('<path d="M5 12h14M16 7c-1-1.5-2.5-2-4-2-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 3M8 17c1 1.4 2.5 2 4 2 2.5 0 4-1.3 4-3"/>'),
    color: S('<path d="M6 16L12 4l6 12M8.2 12h7.6"/>'), hl: S('<path d="M9 15l-3 3h6l1-1M14.5 4.5l5 5L12 17l-5-5z"/>'), clear: S('<path d="M5 19h7M8 15L14 4l5 3-6 10M4 4l16 16"/>'),
    ul: S('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'),
    ol: S('<path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.5c.4-.6 1-1 1.7-1 .8 0 1.3.5 1.3 1.2 0 1-3 2.3-3 3.8h3"/>'),
    al: S('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), ac: S('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'), ar: S('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'), aj: S('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
    indent: S('<path d="M11 6h9M11 12h9M11 18h9M4 9l3 3-3 3"/>'), outdent: S('<path d="M11 6h9M11 12h9M11 18h9M7 9l-3 3 3 3"/>'),
    vt: S('<path d="M4 4h16M12 8v12M8 12l4-4 4 4"/>'), vm: S('<path d="M4 12h16M12 3v5M12 16v5M9 6l3 2 3-2M9 18l3-2 3 2"/>'), vb: S('<path d="M4 20h16M12 4v12M8 12l4 4 4-4"/>'),
    grow: S('<path d="M3 18l5-12 5 12M4.8 14h6.4M17 9V3M14 6h6"/>'), shrink: S('<path d="M3 18l5-12 5 12M4.8 14h6.4M14 6h6"/>'),
    text: S('<path d="M5 5h14M12 5v14M9 19h6"/>'), image: S('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'),
    camera: S('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'), shapes: S('<circle cx="8" cy="8" r="4.5"/><path d="M13 13h8v8h-8z"/><path d="M15.5 3l4 6.5h-8z"/>'),
    table: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 15h18M9 4v16M15 4v16"/>'),
    theme: S('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/><path d="M12 21a3 3 0 0 1 0-6h2a3 3 0 0 0 3-3"/>'),
    size: S('<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 10v4M17 10v4"/>'), bg: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-5 5 5 3-3 5 5"/>'),
    play: S('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'), playCur: S('<path d="M5 5v14M9 4.5v15L21 12z"/>'),
    notes: S('<path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/>'), fit: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), zin: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8 11h6M11 8v6"/>'), zout: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8 11h6"/>'),
    moon: S('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    fillc: S('<path d="M5 11l7-7 7 7-7 7z"/><path d="M19.5 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>'), outline: S('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/>'),
    weight: S('<path d="M4 6h16" stroke-width="1"/><path d="M4 11h16" stroke-width="2.2"/><path d="M4 17h16" stroke-width="3.6"/>'),
    rot: S('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'), flipH: S('<path d="M12 3v18M9 7L3 17h6zM15 7l6 10h-6z"/>'), flipV: S('<path d="M3 12h18M7 9L17 3v6zM7 15l10 6v-6z"/>'),
    front: S('<rect x="8" y="8" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M4 16V4h12"/>'), back: S('<rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M20 8v12H8" /><rect x="8" y="8" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".12" stroke="none"/>'),
    alignL: S('<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>'), alignC: S('<path d="M12 3v18M6 7h12v4H6zM8.5 14h7v4h-7z"/>'), alignR: S('<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>'),
    alignT: S('<path d="M3 4h18M7 8v10h4V8zM14 8v6h4V8z"/>'), alignM: S('<path d="M3 12h18M7 6v12h4V6zM14 8.5v7h4v-7z"/>'), alignB: S('<path d="M3 20h18M7 6v10h4V6zM14 10v6h4v-6z"/>'),
    rowA: S('<rect x="3" y="11" width="18" height="9" rx="1"/><path d="M12 3v6M9 6h6"/>'), rowB: S('<rect x="3" y="4" width="18" height="9" rx="1"/><path d="M12 15v6M9 18h6"/>'), colL: S('<rect x="11" y="3" width="9" height="18" rx="1"/><path d="M3 12h6M6 9v6"/>'), colR: S('<rect x="4" y="3" width="9" height="18" rx="1"/><path d="M15 12h6M18 9v6"/>'),
    delRow: S('<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M9 12h6"/>'), delCol: S('<rect x="8" y="3" width="8" height="18" rx="1"/><path d="M12 9v6"/>'), header: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18" stroke-width="3"/>'), band: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18" opacity=".5"/>'),
    caret: '<svg class="caret" viewBox="0 0 10 10" fill="currentColor"><path d="M1.5 3.5L5 7l3.5-3.5z"/></svg>', none: S('<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>'),
    cut: S('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M8 15L18 3M16 15L6 3"/>'), paste: S('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>'), copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    replace: S('<path d="M4 7h11l-3-3M20 17H9l3 3"/>'), up: S('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: S('<path d="M12 5v14M6 13l6 6 6-6"/>'), bgimg: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M3 12h5"/>'),
  };
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
  const STD = ['#000000', '#404040', '#7F7F7F', '#BFBFBF', '#FFFFFF', '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0', '#E0603F', '#0F8B8D', '#2F55D4', '#F2A541', '#8C5E3C'];

  /* ---------------------------------------------------------------- state */
  const E = {deck: null, cur: 0, sel: null, editing: false, zoom: 1, tab: 'home', hist: [], hi: -1, clip: null, onChange: null, savedRange: null, notes: false};
  const slide = () => E.deck.slides[E.cur];
  const objOf = id => slide().objects.find(o => o.id === id);
  const selObj = () => E.sel ? objOf(E.sel) : null;
  const th = () => slideTheme(E.deck, slide());
  let slideEl = null, scale = 1;

  function toast(msg, ms = 2600){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
  function snapshot(){ const d = E.deck; return JSON.stringify({size: d.size, theme: d.theme, variant: d.variant || 0, themeData: d.themeData, slides: d.slides}); }
  function commit(){ const s = snapshot(); if (E.hist[E.hi] === s) return; E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(s); if (E.hist.length > 80) E.hist.shift(); E.hi = E.hist.length - 1; changed(); }
  function changed(){ E.deck.updated = Date.now(); updUndo(); if (E.onChange) E.onChange(E.deck); }
  function restoreSnap(s){ const o = JSON.parse(s); Object.assign(E.deck, o); E.cur = Math.min(E.cur, E.deck.slides.length - 1); E.sel = null; E.editing = false; renderAll(); changed(); }
  function undo(){ if (E.editing) endEdit(); if (E.hi > 0){ E.hi--; restoreSnap(E.hist[E.hi]); } }
  function redo(){ if (E.hi < E.hist.length - 1){ E.hi++; restoreSnap(E.hist[E.hi]); } }
  function updUndo(){ $('#undoBtn').disabled = E.hi <= 0; $('#redoBtn').disabled = E.hi >= E.hist.length - 1; }

  /* ---------------------------------------------------------------- stage */
  function fitScale(){ const w = $('#stagewrap'); const pad = innerWidth < 900 ? 24 : 40; const W = E.deck.size.w, H = E.deck.size.h; return Math.max(0.1, Math.min((w.clientWidth - pad) / W, (w.clientHeight - pad) / H)); }
  function layoutStage(){
    if (!slideEl) return; scale = fitScale() * E.zoom; const W = E.deck.size.w, H = E.deck.size.h, so = $('#stageouter');
    so.style.width = W * scale + 'px'; so.style.height = H * scale + 'px'; slideEl.style.transform = `scale(${scale})`;
    $('#zoomLbl').textContent = E.zoom === 1 ? 'Fit' : Math.round(scale * 100) + '%';
    drawSel();
  }
  function renderStage(){
    const so = $('#stageouter'); so.innerHTML = '';
    slideEl = renderSlide(slide(), E.deck, {edit: true}); so.appendChild(slideEl);
    // measure auto-height tables
    for (const o of slide().objects) if (o.kind === 'table'){ const n = slideEl.querySelector(`.obj[data-id="${o.id}"]`); if (n) o.h = Math.round(n.offsetHeight); }
    layoutStage(); status();
  }
  function objEl(id){ return slideEl && slideEl.querySelector(`.obj[data-id="${id}"]`); }
  function updateObjEl(o){ const n = objEl(o.id); if (!n) return; const fresh = renderObj(o, E.deck, th()); n.replaceWith(fresh); if (o.kind === 'table') o.h = Math.round(fresh.offsetHeight); }
  function placeObjEl(o){ const n = objEl(o.id); if (!n) return; n.style.left = o.x + 'px'; n.style.top = o.y + 'px'; n.style.width = o.w + 'px'; if (o.kind !== 'table') n.style.height = o.h + 'px'; n.style.transform = objTransform(o);
    const svg = n.querySelector('svg.geo'); if (svg){ svg.setAttribute('viewBox', `0 0 ${Math.max(o.w, .01)} ${Math.max(o.h, .01)}`); svg.firstChild.setAttribute('d', geomPath(o.geom, o.w, o.h)); } }

  /* selection overlay */
  const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
  function drawSel(){
    if (!slideEl) return; slideEl.querySelectorAll('.selbox,.guide').forEach(n => n.remove());
    const o = selObj(); if (!o) return;
    const hs = (matchMedia('(pointer:coarse)').matches ? 22 : 13) / scale;
    const b = h('div', {class: 'selbox' + (E.editing ? ' editing' : '')}); b.style.cssText = `left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${Math.max(o.h, 0)}px;transform:rotate(${o.rot || 0}deg);--hs:${hs}px;border-width:${1.5 / scale}px`;
    if (!E.editing){
      const list = o.kind === 'table' ? HANDLES.filter(x => x[2] === 0) : HANDLES;
      for (const [k, dx, dy] of list){ const d = h('div', {class: 'hdl', 'data-h': k}); d.style.left = (dx + 1) * 50 + '%'; d.style.top = (dy + 1) * 50 + '%'; d.style.borderWidth = 1.5 / scale + 'px'; b.appendChild(d); }
      if (o.kind !== 'table'){ const r = h('div', {class: 'hdl rot', 'data-h': 'rot'}); r.style.left = '50%'; r.style.top = (-hs * 1.7) + 'px'; r.style.borderWidth = 1.5 / scale + 'px'; b.appendChild(r); }
    }
    slideEl.appendChild(b);
  }
  function select(id){ if (E.editing && id !== E.sel) endEdit(); E.sel = id; drawSel(); buildTabs(); refreshRibbon(); }

  /* pointer interactions */
  let drag = null;
  function pt(e){ const r = slideEl.getBoundingClientRect(); return {x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale}; }
  function onDown(e){
    if (!slideEl || e.button > 0) return;
    const hd = e.target.closest('.hdl');
    const o = selObj();
    if (hd && o){ e.preventDefault(); startDrag(e, hd.dataset.h, o); return; }
    const on = e.target.closest('.obj');
    if (E.editing && on && on.dataset.id === E.sel) return; // native text editing
    if (!on || !slideEl.contains(on)){ if (E.editing) endEdit(); select(null); return; }
    const t = objOf(on.dataset.id); if (!t) return;
    const wasSel = E.sel === t.id;
    if (!wasSel) select(t.id); else if (E.editing) endEdit();
    e.preventDefault(); startDrag(e, 'move', t, wasSel);
  }
  function startDrag(e, mode, o, wasSel){
    const p = pt(e); drag = {mode, id: o.id, p0: p, o0: {...o}, moved: false, wasSel, cx: e.clientX, cy: e.clientY, pid: e.pointerId};
    try { $('#stagewrap').setPointerCapture(e.pointerId); } catch(_){}
  }
  function guidesFor(o, axis){
    const W = E.deck.size.w, H = E.deck.size.h, lines = axis === 'x' ? [0, W / 2, W] : [0, H / 2, H];
    for (const q of slide().objects){ if (q.id === o.id || q.rot) continue; if (axis === 'x') lines.push(q.x, q.x + q.w / 2, q.x + q.w); else lines.push(q.y, q.y + q.h / 2, q.y + q.h); }
    return lines;
  }
  function snap(o, axis, val, size){
    const th = 7 / scale; let best = null;
    for (const L of guidesFor(o, axis)) for (const off of [0, size / 2, size]){ const d = L - (val + off); if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, L}; }
    return best;
  }
  function showGuides(gx, gy){ slideEl.querySelectorAll('.guide').forEach(n => n.remove()); const W = E.deck.size.w, H = E.deck.size.h, t = 1 / scale;
    if (gx != null){ const g = h('div', {class: 'guide'}); g.style.cssText = `left:${gx - t / 2}px;top:0;width:${t}px;height:${H}px`; slideEl.appendChild(g); }
    if (gy != null){ const g = h('div', {class: 'guide'}); g.style.cssText = `top:${gy - t / 2}px;left:0;height:${t}px;width:${W}px`; slideEl.appendChild(g); } }
  function onMove(e){
    if (!drag) return; const o = objOf(drag.id); if (!o) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;
    drag.moved = true; const p = pt(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y, o0 = drag.o0;
    if (drag.mode === 'move'){
      let nx = o0.x + dx, ny = o0.y + dy, gx = null, gy = null;
      if (!e.altKey){ const sx = snap(o, 'x', nx, o.w); if (sx){ nx += sx.d; gx = sx.L; } const sy = snap(o, 'y', ny, o.h); if (sy){ ny += sy.d; gy = sy.L; } }
      o.x = Math.round(nx * 10) / 10; o.y = Math.round(ny * 10) / 10; placeObjEl(o); drawSel(); showGuides(gx, gy); return;
    }
    if (drag.mode === 'rot'){
      const cx = o0.x + o0.w / 2, cy = o0.y + o0.h / 2; let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
      a = ((a % 360) + 360) % 360; const s15 = Math.round(a / 15) * 15; if (e.shiftKey || Math.abs(a - s15) < 4) a = s15 % 360; o.rot = Math.round(a); placeObjEl(o); drawSel(); return;
    }
    // resize in the object's rotated frame
    const hd = HANDLES.find(x => x[0] === drag.mode); if (!hd) return; const [, hx, hy] = hd;
    const r = (o0.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    let lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
    let nw = o0.w + hx * lx, nh = o0.h + hy * ly;
    const keep = (o.kind === 'image' && hx && hy && !e.shiftKey) || (e.shiftKey && o.kind !== 'image' && hx && hy);
    if (keep && o0.w && o0.h){ const k = Math.max(nw / o0.w, nh / o0.h); nw = o0.w * k; nh = o0.h * k; }
    const min = o.geom === 'line' ? 0 : 8; nw = Math.max(nw, 8); nh = Math.max(nh, min);
    if (!hx) nw = o0.w; if (!hy) nh = o0.h;
    const dw = nw - o0.w, dh = nh - o0.h; const mx = hx * dw / 2, my = hy * dh / 2;
    const ccx = o0.x + o0.w / 2 + mx * cos - my * sin, ccy = o0.y + o0.h / 2 + mx * sin + my * cos;
    o.w = Math.round(nw * 10) / 10; o.h = Math.round(nh * 10) / 10; o.x = Math.round((ccx - nw / 2) * 10) / 10; o.y = Math.round((ccy - nh / 2) * 10) / 10;
    if (o.kind === 'table'){ updateObjEl(o); } else placeObjEl(o); drawSel();
  }
  function onUp(e){
    if (!drag) return; const d = drag; drag = null; slideEl && slideEl.querySelectorAll('.guide').forEach(n => n.remove());
    if (d.moved){ commit(); refreshThumb(); refreshRibbon(); return; }
    const o = objOf(d.id);
    if (d.mode === 'move' && d.wasSel && o && (o.kind === 'box' && o.geom !== 'line' || o.kind === 'table')) startEdit(e);
  }
  function onDbl(e){ const on = e.target.closest('.obj'); if (!on || E.editing) return; const o = objOf(on.dataset.id); if (o && (o.kind === 'box' && o.geom !== 'line' || o.kind === 'table')){ select(o.id); startEdit(e); } }

  /* ---------------------------------------------------------------- text editing */
  function editTarget(){ const n = objEl(E.sel); return n && (n.querySelector('.tc') || n.querySelector('table')); }
  function startEdit(e){
    const o = selObj(); if (!o) return; let n = objEl(o.id);
    if (o.picSlot){ o.picSlot = false; o.html = ''; o.fill = null; o.style = {}; updateObjEl(o); n = objEl(o.id); }
    if (!n.querySelector('.tc') && !n.querySelector('table')){ updateObjEl(o); n = objEl(o.id); }
    const t = n.querySelector('.tc') || n.querySelector('table'); if (!t) return;
    E.editing = true; n.classList.remove('ph-empty');
    if (t.classList.contains('tc') && !t.innerHTML.trim()) t.innerHTML = o.bullets ? '<ul><li><br></li></ul>' : '<p><br></p>';
    t.contentEditable = 'true'; t.spellcheck = true; t.focus({preventScroll: true});
    let placed = false;
    if (e && e.clientX != null && document.caretRangeFromPoint){ const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r && t.contains(r.startContainer)){ const s = getSelection(); s.removeAllRanges(); s.addRange(r); placed = true; } }
    if (!placed){ const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    t.addEventListener('input', onInput); drawSel(); buildTabs(); refreshRibbon();
  }
  function onInput(){ const o = selObj(), t = editTarget(); if (!o || !t) return; syncText(o, t); refreshThumbSoon(); if (o.kind === 'table'){ const hh = Math.round(objEl(o.id).offsetHeight); if (hh !== o.h){ o.h = hh; drawSel(); } } if (E.onChange) E.onChange(E.deck); }
  function cleanHtml(html){ return html.replace(/<font size="7">/g, '<span>').replace(/ class="[^"]*"/g, '').replace(/<(\w+)[^>]*>\s*<\/\1>/g, m => /^<(p|li|td)/.test(m) ? m : ''); }
  function syncText(o, t){
    if (o.kind === 'table'){ o.rows = [...t.rows].map(r => [...r.cells].map(c => c.innerHTML)); return; }
    let html = t.innerHTML; const plain = t.textContent.replace(/ /g, ' ').trim();
    o.html = plain ? cleanHtml(html) : '';
  }
  function endEdit(){
    if (!E.editing) return; const o = selObj(), t = editTarget(); E.editing = false;
    if (o && t){ syncText(o, t); t.contentEditable = 'false'; t.removeEventListener('input', onInput); updateObjEl(o); }
    try { getSelection().removeAllRanges(); } catch(_){}
    E.savedRange = null; commit(); drawSel(); refreshThumb(); buildTabs(); refreshRibbon();
  }
  document.addEventListener('selectionchange', () => { if (!E.editing) return; const t = editTarget(), s = getSelection(); if (t && s.rangeCount && t.contains(s.anchorNode)){ E.savedRange = s.getRangeAt(0).cloneRange(); refreshRibbonSoon(); } });
  function restoreRange(){ const t = editTarget(); if (!t) return false; const s = getSelection(); if (s.rangeCount && t.contains(s.anchorNode)) return true; t.focus({preventScroll: true}); if (E.savedRange){ s.removeAllRanges(); s.addRange(E.savedRange); } return true; }
  function exec(cmd, val, css = true){ restoreRange(); document.execCommand('styleWithCSS', false, css); document.execCommand(cmd, false, val); onInput(); }
  /* run an execCommand over a whole (non-editing) box by temporarily editing it */
  function execWhole(o, cmd, val, css = true){
    const n = objEl(o.id), t = n && (n.querySelector('.tc') || n.querySelector('table')); if (!t || !t.textContent.trim()) return;
    t.contentEditable = 'true'; t.focus({preventScroll: true}); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('styleWithCSS', false, css); document.execCommand(cmd, false, val); syncText(o, t); t.contentEditable = 'false'; s.removeAllRanges(); t.blur();
  }
  function stripProp(html, prop){ const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('[style]').forEach(n => { n.style.removeProperty(prop); if (!n.getAttribute('style')) n.removeAttribute('style'); });
    if (prop === 'font-weight') d.querySelectorAll('b,strong').forEach(b => b.replaceWith(...b.childNodes)); if (prop === 'color') d.querySelectorAll('font[color]').forEach(f => f.removeAttribute('color'));
    d.querySelectorAll('span:not([style])').forEach(sp => sp.replaceWith(...sp.childNodes)); return d.innerHTML; }
  function spanStyle(prop, value){ // apply css to the current selection while editing
    restoreRange(); const t = editTarget(); const s = getSelection(); if (!s.rangeCount) return;
    if (s.isCollapsed){ // no selection: apply to the paragraph the caret is in
      let b = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode; while (b && b !== t && !/^(P|LI|DIV|TD|H\d)$/.test(b.tagName)) b = b.parentNode;
      if (b && b !== t){ b.querySelectorAll('[style]').forEach(n => n.style.removeProperty(prop)); b.style.setProperty(prop, value); onInput(); return; }
    }
    document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7');
    t.querySelectorAll('font[size="7"]').forEach(f => { const sp = document.createElement('span'); sp.style.setProperty(prop, value); sp.append(...f.childNodes); sp.querySelectorAll('[style]').forEach(n => n.style.removeProperty(prop)); f.replaceWith(sp);
      const r = document.createRange(); r.selectNodeContents(sp); s.removeAllRanges(); s.addRange(r); });
    onInput();
  }
  /* formatting entry points (editing → selection, selected box → whole box) */
  const textual = o => o && (o.kind === 'table' || (o.kind === 'box' && o.geom !== 'line'));
  function fmt(kind, val){
    const o = selObj(); if (!textual(o)){ toast('Select a text box or shape first'); return; }
    if (o.picSlot){ o.picSlot = false; o.html = ''; o.fill = null; o.style = {}; }
    if (E.editing){
      if (kind === 'bold') exec('bold'); else if (kind === 'italic') exec('italic'); else if (kind === 'underline') exec('underline'); else if (kind === 'strike') exec('strikeThrough');
      else if (kind === 'sup') exec('superscript', null, false); else if (kind === 'color') exec('foreColor', val); else if (kind === 'hl') exec('hiliteColor', val || 'transparent');
      else if (kind === 'clear'){ exec('removeFormat'); } else if (kind === 'font') spanStyle('font-family', fontStack(val)); else if (kind === 'size') spanStyle('font-size', val + 'px');
      else if (kind === 'ul') exec('insertUnorderedList', null, false); else if (kind === 'ol') exec('insertOrderedList', null, false);
      else if (kind === 'align') exec({left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull'}[val]); else if (kind === 'indent') exec('indent', null, false); else if (kind === 'outdent') exec('outdent', null, false);
      refreshRibbon(); return;
    }
    o.style = o.style || {};
    if (kind === 'bold'){ const on = !curState().bold; o.style.bold = on; o.html = stripProp(o.html || '', 'font-weight'); if (o.kind === 'table') o.rows = o.rows.map(r => r.map(c => stripProp(c, 'font-weight'))); }
    else if (kind === 'italic'){ o.style.italic = !o.style.italic; o.html = stripProp(o.html || '', 'font-style'); }
    else if (kind === 'underline') execWhole(o, 'underline'); else if (kind === 'strike') execWhole(o, 'strikeThrough'); else if (kind === 'sup') execWhole(o, 'superscript', null, false);
    else if (kind === 'color'){ o.style.color = val; o.html = stripProp(o.html || '', 'color'); if (o.kind === 'table') o.rows = o.rows.map(r => r.map(c => stripProp(c, 'color'))); }
    else if (kind === 'hl') execWhole(o, 'hiliteColor', val || 'transparent');
    else if (kind === 'clear'){ o.style = o.ph ? {} : {}; const d = document.createElement('div'); d.innerHTML = o.html || ''; d.querySelectorAll('[style]').forEach(n => { const ta = n.style.textAlign, ml = n.style.marginLeft; n.removeAttribute('style'); if (ta) n.style.textAlign = ta; if (ml) n.style.marginLeft = ml; }); d.querySelectorAll('b,strong,i,em,u,s,strike,font,sup,sub').forEach(n => n.replaceWith(...n.childNodes)); o.html = d.innerHTML; }
    else if (kind === 'font'){ o.style.font = val; o.html = stripProp(o.html || '', 'font-family'); if (o.kind === 'table') o.rows = o.rows.map(r => r.map(c => stripProp(c, 'font-family'))); }
    else if (kind === 'size'){ if (o.kind === 'table') o.size = val; else { o.style.size = val; o.html = stripProp(o.html || '', 'font-size'); } }
    else if (kind === 'ul' || kind === 'ol') o.html = wholeList(o.html || '', kind);
    else if (kind === 'align'){ if (o.kind === 'table'){ execWhole(o, {left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull'}[val]); } else { o.align = null; const d = document.createElement('div'); d.innerHTML = o.html || '<p></p>'; [...d.querySelectorAll('p,li,div,h1,h2,h3')].forEach(b => b.style.textAlign = val === 'left' ? '' : val); if (!d.querySelector('p,li,div')) o.align = val; o.html = d.innerHTML.replace(/ style=""/g, ''); } }
    else if (kind === 'indent' || kind === 'outdent') { const d = document.createElement('div'); d.innerHTML = o.html || ''; d.querySelectorAll('li,p').forEach(b => { const ml = (parseFloat(b.style.marginLeft) || 0) + (kind === 'indent' ? 24 : -24); b.style.marginLeft = ml > 0 ? ml + 'px' : ''; }); o.html = d.innerHTML.replace(/ style=""/g, ''); }
    updateObjEl(o); drawSel(); commit(); refreshThumb(); refreshRibbon();
  }
  function wholeList(html, kind){
    const d = document.createElement('div'); d.innerHTML = html || '<p><br></p>'; const tag = kind === 'ul' ? 'UL' : 'OL';
    const lists = [...d.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL'); const blocks = [...d.children];
    const allSame = blocks.length && blocks.every(b => b.tagName === tag);
    if (allSame){ return blocks.map(l => [...l.children].map(li => `<p${li.getAttribute('style') ? ` style="${li.getAttribute('style')}"` : ''}>${li.innerHTML}</p>`).join('')).join(''); }
    const items = []; for (const b of blocks){ if (b.tagName === 'UL' || b.tagName === 'OL') items.push(...[...b.children].map(li => li.outerHTML)); else items.push(`<li${b.getAttribute('style') ? ` style="${b.getAttribute('style')}"` : ''}>${b.innerHTML}</li>`); }
    if (!blocks.length && d.textContent.trim()) items.push(`<li>${d.innerHTML}</li>`);
    return `<${tag.toLowerCase()}>${items.join('')}</${tag.toLowerCase()}>`;
  }
  function curState(){
    const o = selObj(); const st = {bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, align: 'left', font: '', size: ''};
    if (!textual(o)) return st; const rs = resolve(o, th()); st.font = rs.font; st.size = o.kind === 'table' ? o.size || 14 : rs.size;
    if (E.editing){
      try { st.bold = document.queryCommandState('bold'); st.italic = document.queryCommandState('italic'); st.underline = document.queryCommandState('underline'); st.strike = document.queryCommandState('strikeThrough'); st.ul = document.queryCommandState('insertUnorderedList'); st.ol = document.queryCommandState('insertOrderedList');
        st.align = document.queryCommandState('justifyCenter') ? 'center' : document.queryCommandState('justifyRight') ? 'right' : document.queryCommandState('justifyFull') ? 'justify' : 'left'; } catch(_){}
      const s = getSelection(); if (s.rangeCount){ let n = s.anchorNode; n = n.nodeType === 1 ? n : n.parentNode; const cs = getComputedStyle(n); st.size = Math.round(parseFloat(cs.fontSize) * 2) / 2; const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); st.font = (FONT_MAP[fam.toLowerCase()] || [])[0] || (fam && !/^(roboto|noto sans|noto serif|serif|sans-serif|cursive|monospace)$/i.test(fam) ? fam : st.font); }
    } else {
      st.bold = rs.bold; st.italic = rs.italic; const html = o.html || ''; st.underline = /<u>|underline/.test(html) && false;
      const d = document.createElement('div'); d.innerHTML = html; const bl = [...d.children]; st.ul = bl.length && bl.every(b => b.tagName === 'UL'); st.ol = bl.length && bl.every(b => b.tagName === 'OL');
      const first = d.querySelector('p,li'); st.align = (first && first.style.textAlign) || o.align || 'left';
    }
    return st;
  }

  /* ---------------------------------------------------------------- objects */
  function addObj(o, {edit = false} = {}){ slide().objects.push(o); renderStage(); select(o.id); commit(); refreshThumb(); if (edit) startEdit(); }
  function insertText(){ const W = E.deck.size.w, H = E.deck.size.h; addObj({id: uid(), kind: 'box', geom: 'rect', fill: null, line: null, html: '', x: Math.round(W * 0.3), y: Math.round(H * 0.42), w: Math.round(W * 0.4), h: 50, rot: 0, anchor: 't', style: {size: 24}}, {edit: true}); E.tab = 'home'; buildTabs(); }
  function insertShape(g){ const W = E.deck.size.w, H = E.deck.size.h, t = th(); const line = g === 'line';
    addObj({id: uid(), kind: 'box', geom: g, fill: line ? null : t.accent, line: line ? {color: t.text, width: 2} : null, html: '', x: Math.round(W / 2 - 90), y: Math.round(H / 2 - (line ? 0 : 60)), w: 180, h: line ? 0 : 120, rot: 0, anchor: 'ctr', style: {color: '#FFFFFF', size: 18}, ...(line ? {} : {align: 'center'})});
    E.tab = 'shape'; buildTabs(); }
  function insertTable(r, c){ const W = E.deck.size.w, H = E.deck.size.h; const rows = Array.from({length: r}, (_, i) => Array.from({length: c}, () => '<p><br></p>'));
    const w = Math.min(W * 0.88, c * 160); addObj({id: uid(), kind: 'table', x: Math.round((W - w) / 2), y: Math.round(H * 0.26), w: Math.round(w), h: r * 32, rot: 0, rows, header: true, band: true, size: 16}); E.tab = 'table'; buildTabs(); }
  async function insertImage(file, replace){
    let data; try { data = await App.imageToData(file); } catch(e){ toast('Couldn’t read that picture'); return; }
    const id = uid(); E.deck.media[id] = data.src; const W = E.deck.size.w, H = E.deck.size.h;
    const cur = selObj();
    if (replace && cur && cur.kind === 'image'){ cur.src = 'm:' + id; cur.h = Math.round(cur.w * data.h / data.w); updateObjEl(cur); drawSel(); commit(); refreshThumb(); return; }
    const slot = slide().objects.find(o => o.picSlot);
    let w = data.w, hh = data.h; const box = slot || {x: W * 0.15, y: H * 0.15, w: W * 0.7, h: H * 0.7};
    const k = Math.min(box.w / w, box.h / hh, slot ? 99 : 1); w = Math.round(w * k); hh = Math.round(hh * k);
    const o = {id: uid(), kind: 'image', src: 'm:' + id, x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - hh) / 2), w, h: hh, rot: 0};
    if (slot) slide().objects.splice(slide().objects.indexOf(slot), 1, o); else slide().objects.push(o);
    renderStage(); select(o.id); commit(); refreshThumb(); E.tab = 'picture'; buildTabs();
  }
  function delSel(){ const o = selObj(); if (!o) return; if (E.editing) endEdit(); slide().objects = slide().objects.filter(x => x.id !== o.id); E.sel = null; renderStage(); commit(); refreshThumb(); buildTabs(); }
  function dupSel(){ const o = selObj(); if (!o) return; const c = clone(o); c.id = uid(); c.x += 18; c.y += 18; delete c.ph; addObj(c); }
  function order(dir){ const o = selObj(); if (!o) return; const a = slide().objects, i = a.indexOf(o); a.splice(i, 1);
    const j = dir === 'front' ? a.length : dir === 'back' ? 0 : dir === 'fwd' ? Math.min(a.length, i + 1) : Math.max(0, i - 1); a.splice(j, 0, o); renderStage(); select(o.id); commit(); refreshThumb(); }
  function alignObj(k){ const o = selObj(); if (!o) return; const W = E.deck.size.w, H = E.deck.size.h;
    if (k === 'l') o.x = 0; if (k === 'c') o.x = Math.round((W - o.w) / 2); if (k === 'r') o.x = Math.round(W - o.w); if (k === 't') o.y = 0; if (k === 'm') o.y = Math.round((H - o.h) / 2); if (k === 'b') o.y = Math.round(H - o.h);
    placeObjEl(o); drawSel(); commit(); refreshThumb(); }
  function setProp(fn){ const o = selObj(); if (!o) return; if (E.editing) endEdit(); fn(o); updateObjEl(o); drawSel(); commit(); refreshThumb(); refreshRibbon(); }
  function copySel(cut){ const o = selObj(); if (!o) return; E.clip = {obj: clone(o), media: o.src && o.src.startsWith('m:') ? {[o.src.slice(2)]: E.deck.media[o.src.slice(2)]} : {}}; toast(cut ? 'Cut' : 'Copied'); if (cut) delSel(); }
  function pasteObj(){ if (!E.clip) return; Object.assign(E.deck.media, E.clip.media); const c = clone(E.clip.obj); c.id = uid(); delete c.ph; if (slide().objects.some(o => o.x === c.x && o.y === c.y)){ c.x += 18; c.y += 18; } E.clip.obj = clone(c); addObj(c); }
  function nudge(dx, dy){ const o = selObj(); if (!o) return; o.x += dx; o.y += dy; placeObjEl(o); drawSel(); clearTimeout(nudge.t); nudge.t = setTimeout(() => { commit(); refreshThumb(); }, 400); }

  /* table ops */
  function activeCell(){ const t = editTarget(); const s = getSelection(); if (!t || t.tagName !== 'TABLE' || !s.rangeCount) return null; let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentNode); const td = n && n.closest && n.closest('td'); return td && t.contains(td) ? td : null; }
  function tableOp(op){
    const o = selObj(); if (!o || o.kind !== 'table') return; const td = E.editing ? activeCell() : null;
    if (E.editing){ syncText(o, editTarget()); }
    const r = td ? td.parentNode.rowIndex : o.rows.length - 1, c = td ? td.cellIndex : o.rows[0].length - 1; const cols = o.rows[0].length;
    const blank = () => '<p><br></p>';
    if (op === 'rowA' || op === 'rowB'){ o.rows.splice(op === 'rowA' ? r : r + 1, 0, Array.from({length: cols}, blank)); if (o.fills) o.fills = null; }
    if (op === 'colL' || op === 'colR'){ const at = op === 'colL' ? c : c + 1; o.rows.forEach(row => row.splice(at, 0, blank())); if (o.fills) o.fills = null; }
    if (op === 'delRow'){ if (o.rows.length <= 1) return delSel(); o.rows.splice(r, 1); if (o.fills) o.fills.splice(r, 1); }
    if (op === 'delCol'){ if (cols <= 1) return delSel(); o.rows.forEach(row => row.splice(c, 1)); if (o.fills) o.fills.forEach(f => f && f.splice(c, 1)); }
    if (op === 'header') o.header = !o.header; if (op === 'band') o.band = !o.band;
    if (E.editing){ E.editing = false; }
    updateObjEl(o); drawSel(); commit(); refreshThumb(); refreshRibbon(); buildTabs();
  }

  /* ---------------------------------------------------------------- slides */
  function goto(i){ if (E.editing) endEdit(); E.cur = Math.max(0, Math.min(E.deck.slides.length - 1, i)); E.sel = null; renderStage(); markThumbs(); buildTabs(); refreshRibbon(); $('#notesIn').value = slide().notes || ''; const t = $('#thumbs').children[E.cur]; if (t) t.scrollIntoView({block: 'nearest', inline: 'nearest'}); }
  function addSlide(layout){
    if (E.editing) endEdit(); const cur = slide(); layout = layout || (cur.layout === 'title' || cur.layout === 'section' || !cur.layout ? 'content' : cur.layout === 'blank' ? 'blank' : cur.layout);
    const s = newSlide(layout, E.deck); s.transition = cur.transition || 'none'; E.deck.slides.splice(E.cur + 1, 0, s); E.cur++; renderAll(); commit();
  }
  function dupSlide(i = E.cur){ const s = clone(E.deck.slides[i]); s.id = uid(); s.objects.forEach(o => o.id = uid()); E.deck.slides.splice(i + 1, 0, s); E.cur = i + 1; renderAll(); commit(); }
  function delSlide(i = E.cur){ if (E.deck.slides.length === 1){ E.deck.slides[0] = newSlide('blank', E.deck); } else E.deck.slides.splice(i, 1); E.cur = Math.min(E.cur, E.deck.slides.length - 1); renderAll(); commit(); toast('Slide deleted · Undo to bring it back'); }
  function moveSlide(i, j){ if (j < 0 || j >= E.deck.slides.length || i === j) return; const [s] = E.deck.slides.splice(i, 1); E.deck.slides.splice(j, 0, s); E.cur = j; renderAll(); commit(); }
  function applyLayout(s, layout){
    const fresh = layoutObjects(layout, E.deck.size, th());
    const old = s.objects.filter(o => o.ph), keep = s.objects.filter(o => !o.ph && !o.picSlot);
    const titles = old.filter(o => o.ph === 'title'), subs = old.filter(o => o.ph === 'subtitle'), bodies = old.filter(o => o.ph === 'body');
    const take = (arr) => arr.length ? arr.shift() : null;
    for (const f of fresh){ if (!f.ph) continue; const src = f.ph === 'title' ? take(titles) : f.ph === 'subtitle' ? (take(subs) || take(bodies)) : (take(bodies) || take(subs)); if (src){ f.html = src.html; const ss = src.style || {}; for (const k of ['font', 'size', 'bold', 'italic']) if (ss[k] != null && !(k === 'size' && f.ph !== src.ph)) f.style[k] = ss[k]; if (src.align) f.align = src.align; } }
    // leftover text keeps its old box as an ordinary text box
    for (const l of [...titles, ...subs, ...bodies]) if (l.html){ delete l.ph; keep.push(l); }
    s.layout = layout; s.objects = [...fresh, ...keep];
  }
  function setLayout(layout){ if (E.editing) endEdit(); applyLayout(slide(), layout); E.sel = null; renderAll(); commit(); }
  function setTheme(key, variant = 0){
    if (E.editing) endEdit(); const was = E.deck.theme; E.deck.theme = key; E.deck.variant = variant;
    for (const s of E.deck.slides){
      if (s.layout && s.objects.some(o => o.ph)) applyLayout(s, s.layout);
      if (!s.noDeco && s.bg && !s.bg.image) s.bg = null;
      if (was === 'custom'){ s.bg = null; for (const o of s.objects) if (o.kind === 'box' && !o.fill && o.style){ delete o.style.color; delete o.style.font; } }
    }
    renderAll(); commit();
  }
  function setVariant(i){ if (E.editing) endEdit(); E.deck.variant = i; renderAll(); commit(); }
  function setSize(ratio){
    const W0 = E.deck.size.w, W = ratio === '4:3' ? 720 : 960; if (W === W0) return; const k = W / W0;
    for (const s of E.deck.slides) for (const o of s.objects){ o.x = Math.round(o.x * k); o.w = Math.round(o.w * k); }
    E.deck.size = {w: W, h: 540}; renderAll(); commit();
  }
  function setBg(bg, all){ if (all) E.deck.slides.forEach(s => s.bg = bg ? clone(bg) : null); else slide().bg = bg; renderAll(); commit(); }
  function setTransition(t, all){ if (all) E.deck.slides.forEach(s => s.transition = t); else slide().transition = t; renderThumbs(); commit(); refreshRibbon();
    if (t !== 'none' && !all){ slideEl.classList.remove('tr-fade', 'tr-push', 'tr-wipe', 'tr-zoom'); void slideEl.offsetWidth; slideEl.classList.add('tr-' + t); setTimeout(() => slideEl && slideEl.classList.remove('tr-' + t), 800); } if (all) toast(t === 'none' ? 'Transitions removed' : 'Applied to all slides'); }

  /* ---------------------------------------------------------------- thumbnails */
  function renderThumbs(){
    const box = $('#thumbs'); box.innerHTML = ''; box.style.setProperty('--ar', `${E.deck.size.w}/${E.deck.size.h}`);
    E.deck.slides.forEach((s, i) => {
      const mini = h('div', {class: 'tmini'});
      const b = h('button', {class: 'thumb', type: 'button', 'aria-label': `Slide ${i + 1}`, 'aria-current': i === E.cur ? 'true' : 'false', draggable: 'true'}, h('span', {class: 'tn'}, String(i + 1)), mini);
      if (s.transition && s.transition !== 'none') mini.appendChild(h('span', {class: 'tr'}, '★'));
      b.addEventListener('click', ev => { if (i === E.cur && !ev.detail) return; if (i === E.cur) slideMenu(b, i); else goto(i); });
      b.addEventListener('contextmenu', ev => { ev.preventDefault(); goto(i); slideMenu(b, i); });
      b.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', String(i)); ev.dataTransfer.effectAllowed = 'move'; });
      b.addEventListener('dragover', ev => { ev.preventDefault(); }); b.addEventListener('drop', ev => { ev.preventDefault(); const from = +ev.dataTransfer.getData('text/plain'); if (!isNaN(from)) moveSlide(from, i); });
      box.appendChild(b); requestAnimationFrame(() => { miniSlide(mini, s, E.deck); if (s.transition && s.transition !== 'none') mini.appendChild(h('span', {class: 'tr'}, '★')); });
    });
    box.appendChild(h('button', {class: 'addslide', type: 'button', onclick: () => addSlide(), title: 'New slide'}, '+ Slide'));
  }
  function markThumbs(){ [...$('#thumbs').querySelectorAll('.thumb')].forEach((t, i) => t.setAttribute('aria-current', i === E.cur ? 'true' : 'false')); }
  function refreshThumb(){ const t = $('#thumbs').querySelectorAll('.thumb')[E.cur]; if (t){ const m = t.querySelector('.tmini'); miniSlide(m, slide(), E.deck); if (slide().transition && slide().transition !== 'none') m.appendChild(h('span', {class: 'tr'}, '★')); } }
  function refreshThumbSoon(){ clearTimeout(refreshThumbSoon.t); refreshThumbSoon.t = setTimeout(refreshThumb, 500); }
  function slideMenu(anchor, i){
    pop(anchor, p => {
      p.append(mi(I.newSlide, 'New slide after', () => { E.cur = i; addSlide(); }), mi(I.dup, 'Duplicate slide', () => dupSlide(i)), mi(I.layout, 'Layout…', () => layoutPicker(anchor, k => setLayout(k))),
        mi(I.up, 'Move up', () => moveSlide(i, i - 1)), mi(I.down, 'Move down', () => moveSlide(i, i + 1)), h('hr'), mi(I.trash, 'Delete slide', () => delSlide(i)));
    });
  }
  function renderAll(){ $('#rtabs').dataset.sig = ''; renderThumbs(); renderStage(); buildTabs(); refreshRibbon(); $('#notesIn').value = slide().notes || ''; }
  function status(){ const s = slide(); $('#statTxt').textContent = `Slide ${E.cur + 1} of ${E.deck.slides.length}` + (s.layout ? ` · ${(LAYOUTS.find(l => l.key === s.layout) || {}).name || ''}` : '') + ` · ${E.deck.size.w === 720 ? '4:3' : '16:9'}`; }

  /* ---------------------------------------------------------------- popovers */
  function closePop(){ document.querySelectorAll('.pop').forEach(p => p.remove()); }
  function pop(anchor, build){
    closePop(); const p = h('div', {class: 'pop', role: 'menu'}); build(p); document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight; let x = Math.min(r.left, innerWidth - pw - 8), y = r.bottom + 4; if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 4);
    p.style.left = Math.max(8, x) + 'px'; p.style.top = y + 'px';
    setTimeout(() => { const off = ev => { if (!p.contains(ev.target)){ p.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
    return p;
  }
  function mi(icon, label, fn, on){ const b = h('button', {class: 'mi' + (on ? ' on' : ''), type: 'button', html: (icon || '') + `<span>${label}</span>`}); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => { closePop(); fn(); }); return b; }
  function colorPop(anchor, title, onPick, opts = {}){
    pop(anchor, p => {
      const t = th(); p.append(h('div', {class: 'ph'}, title));
      if (opts.none) p.append(mi(I.none, opts.none, () => onPick(null)));
      p.append(h('div', {class: 'ph'}, 'Theme'));
      const tg = h('div', {class: 'swatches'}); [t.bg, t.text, t.title, t.accent, t.accent2].forEach(c => tg.append(sw(c))); p.append(tg);
      p.append(h('div', {class: 'ph'}, 'Standard')); const sg = h('div', {class: 'swatches'}); STD.forEach(c => sg.append(sw(c))); p.append(sg);
      const inp = h('input', {type: 'color', value: '#2f55d4', style: 'width:100%;height:36px;border:0;background:none;margin-top:8px'}); inp.addEventListener('change', () => { closePop(); onPick(inp.value.toUpperCase()); }); p.append(h('div', {class: 'ph'}, 'Custom'), inp);
      function sw(c){ const b = h('button', {type: 'button', title: c, 'aria-label': c}); b.style.background = c; b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => { closePop(); onPick(c); }); return b; }
    });
  }
  function layoutPicker(anchor, onPick){
    pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Layout')); const g = h('div', {class: 'layoutgrid'});
      for (const L of LAYOUTS){ const m = h('div', {class: 'lm'}); const b = h('button', {type: 'button'}, m, L.name); b.addEventListener('click', () => { closePop(); onPick(L.key); }); g.append(b);
        const demo = {id: 'x', layout: L.key, bg: null, objects: layoutObjects(L.key, E.deck.size, th()).map(o => ({...o, html: o.ph ? `<p>${o.ph === 'title' ? 'Title' : o.ph === 'subtitle' ? 'Subtitle' : '• Text'}</p>` : o.html}))};
        requestAnimationFrame(() => miniSlide(m, demo, E.deck)); }
      p.append(g); });
  }
  const RECENT_FONTS = [];
  let previewsAsked = false;
  function previewFonts(){ // web: load just the letters of each font's name, so the list shows every font in its own style
    if (previewsAsked || window.SRK_FONTS_LOCAL) return; previewsAsked = true;
    const fams = [...new Set(FONT_LIB.map(f => f[1] || f[0]))]; const text = [...new Set(FONT_LIB.map(f => f[0]).join('') + 'Aa')].join('');
    for (let i = 0; i < fams.length; i += 20){ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?' + fams.slice(i, i + 20).map(f => 'family=' + encodeURIComponent(f).replace(/%20/g, '+')).join('&') + '&text=' + encodeURIComponent(text) + '&display=swap'; document.head.appendChild(l); }
  }
  function fontPicker(anchor, onPick){
    previewFonts(); const cur = curState().font;
    pop(anchor, p => {
      p.classList.add('fontpop');
      const q = h('input', {class: 'inp', type: 'search', placeholder: 'Search fonts', 'aria-label': 'Search fonts', style: 'margin-bottom:6px'});
      const list = h('div', {class: 'fontlist'});
      const item = name => { const b = mi('', name, () => { const ri = RECENT_FONTS.indexOf(name); if (ri >= 0) RECENT_FONTS.splice(ri, 1); RECENT_FONTS.unshift(name); RECENT_FONTS.length = Math.min(RECENT_FONTS.length, 5); onPick(name); }, name === cur);
        b.querySelector('span').style.fontFamily = fontStack(name); b.querySelector('span').style.fontSize = '16px'; const f = FONT_MAP[name.toLowerCase()]; if (f && f[1]) b.append(h('small', {}, 'shown as ' + f[1])); return b; };
      const draw = () => {
        list.innerHTML = ''; const s = q.value.trim().toLowerCase();
        if (s){ const hits = FONT_LIB.filter(f => f[0].toLowerCase().includes(s) || (f[1] || '').toLowerCase().includes(s) || f[2].toLowerCase().includes(s)); hits.forEach(f => list.append(item(f[0]))); if (!hits.length) list.append(h('p', {class: 'hint', style: 'padding:8px'}, 'No font with that name')); return; }
        const t = th(); list.append(h('div', {class: 'ph'}, 'Theme fonts'), item(t.head)); if (t.body !== t.head) list.append(item(t.body));
        if (RECENT_FONTS.length){ list.append(h('div', {class: 'ph'}, 'Recently used')); RECENT_FONTS.forEach(n => list.append(item(n))); }
        for (const g of ['Office', 'Sans serif', 'Serif', 'Display & handwriting', 'Tamil']){ list.append(h('div', {class: 'ph'}, g === 'Office' ? 'Office fonts' : g)); FONT_LIB.filter(f => f[2] === g).forEach(f => list.append(item(f[0]))); }
      };
      q.addEventListener('input', draw); p.append(q, list); draw();
      requestAnimationFrame(() => { const on = list.querySelector('.mi.on'); if (on) on.scrollIntoView({block: 'center'}); });
    });
  }
  function shapePicker(anchor, onPick){ pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Shapes')); const g = h('div', {class: 'shapegrid'}); for (const [k, n] of SHAPES){ const b = h('button', {type: 'button', title: n, 'aria-label': n, html: shapeIcon(k)}); b.addEventListener('click', () => { closePop(); onPick(k); }); g.append(b); } p.append(g); }); }
  function tablePicker(anchor){
    pop(anchor, p => { const lbl = h('div', {class: 'ph'}, 'Table: 3 × 3'); const g = h('div', {class: 'tgrid'}); const cells = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){ const i = h('i', {'data-r': r, 'data-c': c}); cells.push(i); g.append(i); }
      const mark = (R, C) => { cells.forEach(x => x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C)); lbl.textContent = `Table: ${R + 1} × ${C + 1}`; };
      g.addEventListener('pointermove', e => { const t = e.target.closest('i'); if (t) mark(+t.dataset.r, +t.dataset.c); });
      g.addEventListener('click', e => { const t = e.target.closest('i'); if (t){ closePop(); insertTable(+t.dataset.r + 1, +t.dataset.c + 1); } });
      mark(2, 2); p.append(lbl, g, h('p', {class: 'hint', style: 'margin-top:6px'}, 'Tap a square: rows × columns')); });
  }
  function themePicker(anchor){
    pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Themes')); const g = h('div', {class: 'themegrid'});
      for (const k of THEME_ORDER){ const t = THEMES[k]; const m = h('div', {class: 'tmm'}); const b = h('button', {type: 'button', class: E.deck.theme === k ? 'on' : ''}, m, t.name); b.addEventListener('click', () => { closePop(); setTheme(k); }); g.append(b);
        const d = {...E.deck, theme: k, variant: 0}; const th0 = themeOf(d); const demo = {id: 'x', layout: 'title', bg: null, objects: layoutObjects('title', E.deck.size, th0).map(o => ({...o, html: `<p>${o.ph === 'title' ? 'Aa' : t.name}</p>`}))};
        requestAnimationFrame(() => miniSlide(m, demo, d)); }
      p.append(g); });
  }
  function variantRow(){
    const row = h('div', {class: 'variants'}); const t = THEMES[E.deck.theme]; if (!t) return row;
    t.variants.forEach((v, i) => { const m = h('div', {style: 'position:absolute;inset:0'}); const b = h('button', {type: 'button', title: `Colour variant ${i + 1}`, 'aria-label': `Colour variant ${i + 1}`, class: (E.deck.variant || 0) === i ? 'on' : ''}, m);
      b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => setVariant(i)); row.append(b);
      const d = {...E.deck, variant: i}; const demo = {id: 'x', layout: 'title', bg: null, objects: layoutObjects('title', E.deck.size, themeOf(d)).map(o => ({...o, html: o.ph === 'title' ? '<p>Aa</p>' : ''}))};
      requestAnimationFrame(() => miniSlide(m, demo, d)); });
    return row;
  }
  function bgPicker(anchor){
    pop(anchor, p => {
      p.classList.add('bgpop'); const t = themeOf(E.deck), s = slide();
      p.append(h('div', {class: 'ph'}, 'Background styles'));
      const st = h('div', {class: 'bgstyles'}); bgStyles(t).forEach((bg, i) => { const b = h('button', {type: 'button', title: `Style ${i + 1}`, 'aria-label': `Background style ${i + 1}`}); b.style.background = bgCss(bg, E.deck); b.addEventListener('click', () => { closePop(); setBg(bg); }); st.append(b); }); p.append(st);
      p.append(h('div', {class: 'ph'}, 'Solid fill'));
      const sg = h('div', {class: 'swatches'}); [t.bg, '#FFFFFF', '#F2F2F2', '#FFF8F1', '#EEF6F4', tint(t.accent, .85), t.accent, t.accent2, '#1C2333', '#000000'].forEach(c => { const b = h('button', {type: 'button', title: c}); b.style.background = c; b.addEventListener('click', () => { closePop(); setBg({color: c}); }); sg.append(b); }); p.append(sg);
      const inp = h('input', {type: 'color', value: '#ffffff', style: 'width:100%;height:34px;border:0;background:none;margin-top:4px', 'aria-label': 'Custom colour'}); inp.addEventListener('change', () => { closePop(); setBg({color: inp.value.toUpperCase()}); }); p.append(inp);
      p.append(h('div', {class: 'ph'}, 'Gradient fill'));
      const cur = s.bg && s.bg.gradient ? s.bg.gradient : {a: tint(t.accent, .2), b: t.accent2 || shade(t.accent, .4), angle: 135};
      const ca = h('input', {type: 'color', value: cur.a.toLowerCase(), 'aria-label': 'Gradient start colour'}), cb = h('input', {type: 'color', value: cur.b.toLowerCase(), 'aria-label': 'Gradient end colour'});
      const dir = h('select', {class: 'rsel', 'aria-label': 'Gradient direction'}); [['180', 'Top to bottom'], ['90', 'Left to right'], ['135', 'Diagonal'], ['45', 'Diagonal up'], ['radial', 'From centre']].forEach(([v, n]) => dir.append(h('option', {value: v}, n)));
      dir.value = cur.radial ? 'radial' : String(cur.angle || 180);
      const apply = h('button', {class: 'btn sm primary', type: 'button'}, 'Apply');
      apply.addEventListener('click', () => { closePop(); setBg({gradient: {a: ca.value.toUpperCase(), b: cb.value.toUpperCase(), ...(dir.value === 'radial' ? {radial: true} : {angle: +dir.value})}}); });
      p.append(h('div', {class: 'gradrow'}, ca, cb, dir, apply));
      p.append(h('div', {class: 'ph'}, 'Picture fill'));
      const fp = h('label', {class: 'mi filepick', html: I.bgimg + '<span>Choose a picture…</span>'}); const fi = h('input', {type: 'file', accept: 'image/*', class: 'fileover'}); fp.append(fi);
      fi.addEventListener('change', async () => { const f = fi.files[0]; closePop(); if (!f) return; const d = await App.imageToData(f); const id = uid(); E.deck.media[id] = d.src; setBg({image: 'm:' + id, color: '#FFFFFF'}); }); p.append(fp);
      p.append(h('hr'), mi(s.noDeco ? I.bg : I.none, s.noDeco ? 'Show background graphics' : 'Hide background graphics', () => { s.noDeco = !s.noDeco; renderAll(); commit(); }),
        mi(I.dup, 'Apply to all slides', () => { const b = slide().bg, nd = !!slide().noDeco; E.deck.slides.forEach(x => { x.bg = b ? clone(b) : null; x.noDeco = nd; }); renderAll(); commit(); toast('Background applied to all slides'); }),
        mi(I.replace, 'Reset background', () => { slide().noDeco = false; setBg(null); }));
    });
  }

  /* ---------------------------------------------------------------- ribbon */
  const TABS = [['file', 'File'], ['home', 'Home'], ['insert', 'Insert'], ['design', 'Design'], ['transitions', 'Transitions'], ['show', 'Slide Show'], ['view', 'View']];
  function ctxTab(){ const o = selObj(); if (!o) return null; return o.kind === 'image' ? ['picture', 'Picture'] : o.kind === 'table' ? ['table', 'Table'] : ['shape', 'Shape']; }
  function buildTabs(){
    const tabs = [...TABS]; const c = ctxTab(); if (c) tabs.push(c);
    if (!tabs.some(t => t[0] === E.tab)) E.tab = 'home';
    const box = $('#rtabs'); const sig = tabs.map(t => t[0]).join() + '|' + E.tab; if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.innerHTML = '';
    for (const [k, n] of tabs){ const b = h('button', {class: 'rtab' + (c && k === c[0] ? ' ctx' : '') + (k === 'file' ? ' file' : ''), role: 'tab', type: 'button', 'aria-selected': k === E.tab ? 'true' : 'false'}, n);
      b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => { if (k === 'file'){ App.fileMenu(); return; } E.tab = k; buildTabs(); buildRibbon(); }); box.append(b); }
    buildRibbon();
  }
  const R = {}; // live controls for refreshRibbon
  function rb(icon, title, fn, opts = {}){
    const b = h('button', {class: 'rb', type: 'button', title, 'aria-label': title, html: icon + (opts.label ? `<span>${opts.label}</span>` : '') + (opts.caret ? I.caret : '')});
    b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => fn(b)); if (opts.key) R[opts.key] = b; if (opts.disabled) b.disabled = true; return b;
  }
  function grp(label, ...kids){ return h('div', {class: 'grp'}, h('div', {class: 'row'}, ...kids), h('div', {class: 'gl'}, label)); }
  function fileBtn(icon, title, accept, fn, opts = {}){ const l = h('label', {class: 'rb filepick', title, 'aria-label': title, html: icon + (opts.label ? `<span>${opts.label}</span>` : '')}); const i = h('input', {type: 'file', accept, class: 'fileover'}); if (opts.capture) i.setAttribute('capture', 'environment'); i.addEventListener('change', () => { const f = i.files[0]; i.value = ''; if (f) fn(f); }); l.append(i); return l; }
  function fontControls(){
    const fs = h('button', {class: 'rsel font fontbtn', type: 'button', 'aria-label': 'Font', title: 'Font'}, h('span', {}, 'Font'), h('span', {html: I.caret})); fs.addEventListener('pointerdown', e => e.preventDefault()); fs.addEventListener('click', () => fontPicker(fs, f => fmt('font', f))); R.font = fs;
    const ss = h('select', {class: 'rsel size', 'aria-label': 'Font size', title: 'Font size'}); SIZES.forEach(s => ss.append(h('option', {value: s}, String(s)))); ss.addEventListener('change', () => fmt('size', +ss.value)); R.size = ss;
    return [fs, ss];
  }
  function step(dir){ const st = curState(); const cur = +st.size || 18; const i = SIZES.findIndex(s => s >= cur); const n = dir > 0 ? SIZES[Math.min(SIZES.length - 1, SIZES[i] === cur ? i + 1 : i)] : SIZES[Math.max(0, (i < 0 ? SIZES.length : i) - 1)]; fmt('size', n); }
  function buildRibbon(){
    const r = $('#ribbon'); r.innerHTML = ''; for (const k in R) delete R[k]; const t = E.tab, o = selObj();
    if (t === 'home'){
      r.append(
        grp('Slides', rb(I.newSlide, 'New slide', b => addSlide(), {label: 'New'}), rb(I.caret, 'New slide with layout', b => layoutPicker(b, k => addSlide(k))), rb(I.layout, 'Layout', b => layoutPicker(b, k => setLayout(k))), rb(I.dup, 'Duplicate slide', () => dupSlide()), rb(I.trash, 'Delete slide', () => delSlide())),
        grp('Clipboard', rb(I.cut, 'Cut', () => copySel(true)), rb(I.copy, 'Copy', () => copySel()), rb(I.paste, 'Paste', () => pasteObj())),
        grp('Font', ...fontControls(), rb(I.grow, 'Bigger text', () => step(1)), rb(I.shrink, 'Smaller text', () => step(-1))),
        grp('Style', rb(I.bold, 'Bold', () => fmt('bold'), {key: 'bold'}), rb(I.italic, 'Italic', () => fmt('italic'), {key: 'italic'}), rb(I.underline, 'Underline', () => fmt('underline'), {key: 'underline'}), rb(I.strike, 'Strikethrough', () => fmt('strike'), {key: 'strike'}),
          rb(I.color + '<span class="sw" id="fcSw"></span>', 'Text colour', b => colorPop(b, 'Text colour', c => fmt('color', c || '#000000'))), rb(I.hl, 'Highlight', b => colorPop(b, 'Highlight', c => fmt('hl', c), {none: 'No highlight'})), rb(I.clear, 'Clear formatting', () => fmt('clear'))),
        grp('Paragraph', rb(I.ul, 'Bullets', () => fmt('ul'), {key: 'ul'}), rb(I.ol, 'Numbering', () => fmt('ol'), {key: 'ol'}), rb(I.outdent, 'Decrease indent', () => fmt('outdent')), rb(I.indent, 'Increase indent', () => fmt('indent')),
          rb(I.al, 'Align left', () => fmt('align', 'left'), {key: 'al'}), rb(I.ac, 'Centre', () => fmt('align', 'center'), {key: 'ac'}), rb(I.ar, 'Align right', () => fmt('align', 'right'), {key: 'ar'}), rb(I.aj, 'Justify', () => fmt('align', 'justify'), {key: 'aj'})),
        grp('Text position', rb(I.vt, 'Top', () => setProp(o => o.anchor = 't'), {key: 'vt'}), rb(I.vm, 'Middle', () => setProp(o => o.anchor = 'ctr'), {key: 'vm'}), rb(I.vb, 'Bottom', () => setProp(o => o.anchor = 'b'), {key: 'vb'})),
        grp('Drawing', rb(I.shapes, 'Shapes', b => shapePicker(b, insertShape), {label: 'Shapes'}), rb(I.text, 'Text box', insertText), rb(I.front, 'Bring to front', () => order('front')), rb(I.back, 'Send to back', () => order('back'))),
      );
    } else if (t === 'insert'){
      r.append(
        grp('Slides', rb(I.newSlide, 'New slide', b => layoutPicker(b, k => addSlide(k)), {label: 'New slide', caret: true})),
        grp('Text', rb(I.text, 'Text box', insertText, {label: 'Text box'})),
        grp('Images', fileBtn(I.image, 'Picture from phone', 'image/*', f => insertImage(f), {label: 'Picture'}), fileBtn(I.camera, 'Take a photo', 'image/*', f => insertImage(f), {label: 'Camera', capture: true})),
        grp('Illustrations', rb(I.shapes, 'Shapes', b => shapePicker(b, insertShape), {label: 'Shapes', caret: true}), rb(I.table, 'Table', b => tablePicker(b), {label: 'Table', caret: true})),
      );
    } else if (t === 'design'){
      r.append(
        grp('Themes', rb(I.theme, 'Themes', b => themePicker(b), {label: (THEMES[E.deck.theme] || {name: 'From file'}).name, caret: true})),
        ...(THEMES[E.deck.theme] ? [grp('Variants', variantRow())] : []),
        grp('Slide size', rb(I.size, 'Widescreen 16:9', () => setSize('16:9'), {label: '16:9', key: 'w169'}), rb(I.size, 'Standard 4:3', () => setSize('4:3'), {label: '4:3', key: 'w43'})),
        grp('Customise', rb(I.bg, 'Format background', b => bgPicker(b), {label: 'Format Background', caret: true})),
      );
      R.w169.classList.toggle('on', E.deck.size.w !== 720); R.w43.classList.toggle('on', E.deck.size.w === 720);
    } else if (t === 'transitions'){
      const tr = ['none', 'fade', 'push', 'wipe', 'zoom']; const names = {none: 'None', fade: 'Fade', push: 'Push', wipe: 'Wipe', zoom: 'Zoom'};
      r.append(grp('Transition to this slide', ...tr.map(k => rb(k === 'none' ? I.none : I.play, names[k], () => setTransition(k), {label: names[k], key: 'tr_' + k}))),
        grp('Timing', rb(I.dup, 'Apply to all slides', () => setTransition(slide().transition || 'none', true), {label: 'Apply to all'})));
    } else if (t === 'show'){
      r.append(grp('Start slide show', rb(I.play, 'From beginning', () => App.present(0), {label: 'From beginning'}), rb(I.playCur, 'From current slide', () => App.present(E.cur), {label: 'From current'})),
        grp('Monitor', rb(I.notes, 'Speaker notes', toggleNotes, {label: 'Notes', key: 'notes'})));
    } else if (t === 'view'){
      r.append(grp('Show', rb(I.notes, 'Speaker notes', toggleNotes, {label: 'Notes', key: 'notes'})),
        grp('Zoom', rb(I.fit, 'Fit to window', () => { E.zoom = 1; layoutStage(); }, {label: 'Fit'}), rb(I.zout, 'Zoom out', () => zoom(-1)), rb(I.zin, 'Zoom in', () => zoom(1))),
        grp('App', rb(I.moon, 'Dark or light app', () => App.toggleTheme(), {label: 'Dark / light'})));
    } else if (t === 'shape' && o){
      r.append(
        grp('Shape style', rb(I.fillc + '<span class="sw" id="fillSw"></span>', 'Shape fill', b => colorPop(b, 'Shape fill', c => setProp(o => { o.fill = c; if (o.picSlot){ o.picSlot = false; o.html = ''; } }), {none: 'No fill'})),
          rb(I.outline + '<span class="sw" id="lineSw"></span>', 'Shape outline', b => colorPop(b, 'Outline', c => setProp(o => o.line = c ? {color: c, width: (o.line && o.line.width) || 1.5} : null), {none: 'No outline'})),
          rb(I.weight, 'Outline weight', b => pop(b, p => { p.append(h('div', {class: 'ph'}, 'Weight')); [0.75, 1, 1.5, 2.25, 3, 4.5, 6].forEach(w => p.append(mi('', w + ' pt', () => setProp(o => o.line = {color: (o.line && o.line.color) || th().text, width: w, dash: o.line && o.line.dash}), o.line && o.line.width === w))); p.append(h('hr'), mi('', 'Dashed', () => setProp(o => { if (o.line) o.line.dash = !o.line.dash; }), o.line && o.line.dash)); }), {caret: true}),
          rb(I.shapes, 'Change shape', b => shapePicker(b, g => setProp(o => o.geom = g)), {caret: true})),
        grp('Arrange', rb(I.front, 'Bring to front', () => order('front')), rb(I.back, 'Send to back', () => order('back')), rb(I.up, 'Bring forward', () => order('fwd')), rb(I.down, 'Send backward', () => order('bwd'))),
        grp('Align to slide', rb(I.alignL, 'Align left', () => alignObj('l')), rb(I.alignC, 'Align centre', () => alignObj('c')), rb(I.alignR, 'Align right', () => alignObj('r')), rb(I.alignT, 'Align top', () => alignObj('t')), rb(I.alignM, 'Align middle', () => alignObj('m')), rb(I.alignB, 'Align bottom', () => alignObj('b'))),
        grp('Rotate', rb(I.rot, 'Rotate 90°', () => setProp(o => o.rot = ((o.rot || 0) + 90) % 360)), rb(I.flipH, 'Flip horizontal', () => setProp(o => o.flipH = !o.flipH)), rb(I.flipV, 'Flip vertical', () => setProp(o => o.flipV = !o.flipV))),
        grp('Size', sizeInputs(o)),
        grp('Edit', rb(I.dup, 'Duplicate', dupSel), rb(I.trash, 'Delete', delSel)),
      );
    } else if (t === 'picture' && o){
      r.append(
        grp('Picture', fileBtn(I.replace, 'Change picture', 'image/*', f => insertImage(f, true), {label: 'Change'}), rb(I.bgimg, 'Use as slide background', () => { const src = o.src; slide().objects = slide().objects.filter(x => x !== o); E.sel = null; setBg({image: src, color: '#FFFFFF'}); }, {label: 'As background'})),
        grp('Arrange', rb(I.front, 'Bring to front', () => order('front')), rb(I.back, 'Send to back', () => order('back')), rb(I.up, 'Bring forward', () => order('fwd')), rb(I.down, 'Send backward', () => order('bwd'))),
        grp('Align to slide', rb(I.alignL, 'Align left', () => alignObj('l')), rb(I.alignC, 'Align centre', () => alignObj('c')), rb(I.alignR, 'Align right', () => alignObj('r')), rb(I.alignT, 'Align top', () => alignObj('t')), rb(I.alignM, 'Align middle', () => alignObj('m')), rb(I.alignB, 'Align bottom', () => alignObj('b'))),
        grp('Rotate', rb(I.rot, 'Rotate 90°', () => setProp(o => o.rot = ((o.rot || 0) + 90) % 360)), rb(I.flipH, 'Flip horizontal', () => setProp(o => o.flipH = !o.flipH)), rb(I.flipV, 'Flip vertical', () => setProp(o => o.flipV = !o.flipV))),
        grp('Size', sizeInputs(o), rb(I.fit, 'Fill the slide', () => setProp(o => { const W = E.deck.size.w, H = E.deck.size.h; const k = Math.max(W / o.w, H / o.h); o.w = Math.round(o.w * k); o.h = Math.round(o.h * k); o.x = Math.round((W - o.w) / 2); o.y = Math.round((H - o.h) / 2); o.rot = 0; }))),
        grp('Edit', rb(I.dup, 'Duplicate', dupSel), rb(I.trash, 'Delete', delSel)),
      );
    } else if (t === 'table' && o){
      r.append(
        grp('Rows & columns', rb(I.rowA, 'Insert row above', () => tableOp('rowA')), rb(I.rowB, 'Insert row below', () => tableOp('rowB')), rb(I.colL, 'Insert column left', () => tableOp('colL')), rb(I.colR, 'Insert column right', () => tableOp('colR')), rb(I.delRow, 'Delete row', () => tableOp('delRow')), rb(I.delCol, 'Delete column', () => tableOp('delCol'))),
        grp('Style', rb(I.header, 'Header row', () => tableOp('header'), {key: 'header'}), rb(I.band, 'Banded rows', () => tableOp('band'), {key: 'band'})),
        grp('Text', rb(I.grow, 'Bigger text', () => step(1)), rb(I.shrink, 'Smaller text', () => step(-1)), rb(I.bold, 'Bold', () => fmt('bold'), {key: 'bold'})),
        grp('Align to slide', rb(I.alignC, 'Align centre', () => alignObj('c')), rb(I.alignM, 'Align middle', () => alignObj('m'))),
        grp('Edit', rb(I.dup, 'Duplicate', dupSel), rb(I.trash, 'Delete table', delSel)),
      );
      R.header.classList.toggle('on', !!o.header); R.band.classList.toggle('on', !!o.band);
    }
    refreshRibbon();
  }
  function sizeInputs(o){
    const mk = (k, lbl) => { const i = h('input', {class: 'rsel', type: 'number', min: 1, step: 1, value: Math.round(o[k]), 'aria-label': lbl, title: lbl + ' (pt)', style: 'width:64px'}); i.addEventListener('change', () => setProp(x => { const v = Math.max(1, +i.value || 1); if (x.kind === 'image'){ const r = x.h / x.w; if (k === 'w'){ x.w = v; x.h = Math.round(v * r); } else { x.h = v; x.w = Math.round(v / r); } } else x[k] = v; })); return i; };
    return h('span', {style: 'display:inline-flex;gap:4px;align-items:center;font-size:12px;color:var(--muted)'}, 'W', mk('w', 'Width'), 'H', mk('h', 'Height'));
  }
  function refreshRibbon(){
    const o = selObj(), tx = textual(o), st = curState();
    if (R.font){ R.font.disabled = !tx; R.size.disabled = !tx; R.font.firstChild.textContent = tx ? st.font : 'Font'; R.font.firstChild.style.fontFamily = tx ? fontStack(st.font) : ''; if (!tx) R.size.value = ''; if (tx){ const sz = String(st.size); if (![...R.size.options].some(x => x.value === sz)) R.size.append(h('option', {value: sz}, sz)); R.size.value = sz; } }
    for (const k of ['bold', 'italic', 'underline', 'strike', 'ul', 'ol']) if (R[k]) R[k].classList.toggle('on', !!st[k]);
    const al = {left: 'al', center: 'ac', right: 'ar', justify: 'aj'}; for (const k of Object.values(al)) if (R[k]) R[k].classList.toggle('on', al[st.align] === k && tx);
    for (const [k, v] of [['vt', 't'], ['vm', 'ctr'], ['vb', 'b']]) if (R[k]){ R[k].classList.toggle('on', !!(o && o.kind === 'box' && (o.anchor || 't') === v)); R[k].disabled = !(o && o.kind === 'box'); }
    const fc = $('#fcSw'); if (fc) fc.style.background = tx ? resolve(o, th()).color : 'transparent';
    const fl = $('#fillSw'); if (fl && o) fl.style.background = o.fill || 'transparent'; const ln = $('#lineSw'); if (ln && o) ln.style.background = o.line ? o.line.color : 'transparent';
    if (E.deck) for (const k of ['none', 'fade', 'push', 'wipe', 'zoom']) if (R['tr_' + k]) R['tr_' + k].classList.toggle('on', (slide().transition || 'none') === k);
    if (R.notes) R.notes.classList.toggle('on', E.notes); $('#notesToggle').classList.toggle('on', E.notes);
  }
  function refreshRibbonSoon(){ clearTimeout(refreshRibbonSoon.t); refreshRibbonSoon.t = setTimeout(refreshRibbon, 120); }
  function toggleNotes(){ E.notes = !E.notes; $('#notesBox').hidden = !E.notes; refreshRibbon(); requestAnimationFrame(layoutStage); }
  function zoom(d){ const cur = E.zoom; E.zoom = Math.max(0.5, Math.min(4, d > 0 ? cur * 1.25 : cur / 1.25)); if (Math.abs(E.zoom - 1) < 0.05) E.zoom = 1; layoutStage(); }

  /* ---------------------------------------------------------------- keys */
  function onKey(e){
    if ($('#editView').hidden || document.querySelector('.show,.dlg-back,.filemenu')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (mod && k === 's'){ e.preventDefault(); App.savePptx(); return; }
    if (e.key === 'F5'){ e.preventDefault(); App.present(e.shiftKey ? E.cur : 0); return; }
    if (inField) return;
    if (E.editing){ if (e.key === 'Escape'){ e.preventDefault(); endEdit(); } return; }
    if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y'){ e.preventDefault(); redo(); return; }
    if (mod && k === 'd'){ e.preventDefault(); if (E.sel) dupSel(); else dupSlide(); return; }
    if (mod && k === 'c'){ if (E.sel){ e.preventDefault(); copySel(); } return; }
    if (mod && k === 'x'){ if (E.sel){ e.preventDefault(); copySel(true); } return; }
    if (mod && k === 'v'){ if (E.clip){ e.preventDefault(); pasteObj(); } return; }
    if (mod && k === 'm'){ e.preventDefault(); addSlide(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace'){ if (E.sel){ e.preventDefault(); delSel(); } return; }
    if (e.key === 'Escape'){ select(null); return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel){ e.preventDefault(); startEdit(); return; }
    const st = e.shiftKey ? 10 : 1;
    if (E.sel && e.key.startsWith('Arrow')){ e.preventDefault(); nudge(e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0); return; }
    if (!E.sel && (e.key === 'PageDown' || e.key === 'ArrowDown')){ e.preventDefault(); goto(E.cur + 1); }
    if (!E.sel && (e.key === 'PageUp' || e.key === 'ArrowUp')){ e.preventDefault(); goto(E.cur - 1); }
  }
  /* paste pictures from the clipboard */
  function onPaste(e){
    if ($('#editView').hidden) return; const items = [...(e.clipboardData && e.clipboardData.items || [])]; const img = items.find(i => i.type.startsWith('image/'));
    if (img){ e.preventDefault(); insertImage(img.getAsFile()); return; }
    if (E.editing){ const t = e.clipboardData.getData('text/plain'); if (t != null && !e.clipboardData.getData('text/html').includes('<table')){ e.preventDefault(); document.execCommand('insertText', false, t); } }
  }

  /* ---------------------------------------------------------------- init */
  let wired = false;
  function wire(){
    if (wired) return; wired = true;
    const sw = $('#stagewrap');
    sw.addEventListener('pointerdown', onDown); sw.addEventListener('pointermove', onMove); sw.addEventListener('pointerup', onUp); sw.addEventListener('pointercancel', onUp); sw.addEventListener('dblclick', onDbl);
    document.addEventListener('keydown', onKey); document.addEventListener('paste', onPaste);
    addEventListener('resize', () => { if (!$('#editView').hidden) layoutStage(); });
    $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
    $('#zoomIn').addEventListener('click', () => zoom(1)); $('#zoomOut').addEventListener('click', () => zoom(-1)); $('#zoomLbl').addEventListener('click', () => { E.zoom = 1; layoutStage(); });
    $('#notesToggle').addEventListener('click', toggleNotes);
    $('#notesIn').addEventListener('input', () => { slide().notes = $('#notesIn').value; clearTimeout(wire.n); wire.n = setTimeout(commit, 700); if (E.onChange) E.onChange(E.deck); });
    $('#undoBtn').addEventListener('pointerdown', e => e.preventDefault()); $('#redoBtn').addEventListener('pointerdown', e => e.preventDefault());
  }
  function open(deck){
    wire(); E.deck = deck; deck.media = deck.media || {}; E.cur = 0; E.sel = null; E.editing = false; E.zoom = 1; E.tab = 'home'; E.hist = [snapshot()]; E.hi = 0; $('#rtabs').dataset.sig = '';
    renderAll(); updUndo(); requestAnimationFrame(layoutStage);
  }
  function flush(){ if (E.editing) endEdit(); }
  return {open, flush, toast, get deck(){ return E.deck; }, get cur(){ return E.cur; }, set onChange(f){ E.onChange = f; }, goto, layoutStage, select, insertImage, I, h, pop, mi, closePop, startEdit, fmt, setTheme, addSlide, setLayout};
})();
