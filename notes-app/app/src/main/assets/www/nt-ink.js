/* SRK Notes — ink: pen, highlighter, eraser, shapes, lasso select/move, two-finger scroll */
'use strict';
const Ink = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let svg = null, page = null, scroller = null, onCommit = () => {};
  const tool = {t: 'pen', c: '#1b1b1b', w: 2.5, finger: true};
  let penSeen = false; const ptrs = new Map(); let cur = null, curEl = null, pan = null, lassoSel = null, drag = null;
  const PEN_COLORS = ['#1b1b1b', '#2f6fde', '#d93025', '#1e8e3e', '#7B2FB0', '#e8710a', '#00897b', '#ffffff'], HL_COLORS = ['#fff200', '#7cfc00', '#00e5ff', '#ff4fd8', '#ffa500'];
  const WIDTHS = {pen: [1.2, 2.5, 4, 7], hl: [10, 16, 24]};

  function smooth(p){ if (p.length < 2) return p.length ? `M${p[0][0]} ${p[0][1]}l.01 0` : ''; let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`; for (let i = 1; i < p.length - 1; i++){ const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; d += `Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`; } const l = p[p.length - 1]; return d + `L${l[0].toFixed(1)} ${l[1].toFixed(1)}`; }
  function shapeD(s){ const [[x1, y1], [x2, y2]] = s.p.length >= 2 ? s.p : [s.p[0], s.p[0]];
    if (s.t === 'line') return `M${x1} ${y1}L${x2} ${y2}`;
    if (s.t === 'arrow'){ const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(10, s.w * 4); return `M${x1} ${y1}L${x2} ${y2}M${x2 - L * Math.cos(a - .45)} ${y2 - L * Math.sin(a - .45)}L${x2} ${y2}L${x2 - L * Math.cos(a + .45)} ${y2 - L * Math.sin(a + .45)}`; }
    if (s.t === 'rect') return `M${x1} ${y1}H${x2}V${y2}H${x1}Z`;
    if (s.t === 'ellipse'){ const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2 || .5, ry = Math.abs(y2 - y1) / 2 || .5; return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`; }
    return smooth(s.p); }
  const dOf = s => ['pen', 'hl'].includes(s.t) ? smooth(s.p) : shapeD(s);
  function el(s){ const e = document.createElementNS(NS, 'path'); e.setAttribute('d', dOf(s)); e.setAttribute('fill', 'none'); e.setAttribute('stroke', s.c); e.setAttribute('stroke-width', s.w); e.setAttribute('stroke-linecap', s.t === 'hl' ? 'square' : 'round'); e.setAttribute('stroke-linejoin', 'round'); if (s.t === 'hl'){ e.setAttribute('stroke-opacity', '.42'); e.style.mixBlendMode = 'multiply'; } e.dataset.id = s.id; return e; }
  function render(){ if (!svg || !page) return; svg.innerHTML = ''; for (const s of page.ink || []) svg.append(el(s)); size(); if (lassoSel) markSel(); }
  function size(){ if (!svg || !svg.parentElement) return; const pc = svg.parentElement; svg.setAttribute('width', pc.scrollWidth); svg.setAttribute('height', pc.scrollHeight); }
  function bounds(){ let r = 0, b = 0; for (const s of (page && page.ink) || []) for (const p of s.p){ r = Math.max(r, p[0] + s.w); b = Math.max(b, p[1] + s.w); } return {r, b}; }
  const pt = e => { const r = svg.getBoundingClientRect(); const z = Page.zoom(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z, e.pressure || .5]; };

  function mount(svgEl, pg, scrollEl, commit){ svg = svgEl; page = pg; scroller = scrollEl; onCommit = commit; lassoSel = null; render();
    svg.addEventListener('pointerdown', down); svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up); }
  function hit(s, x, y, r){ for (let i = 0; i < s.p.length; i++){ const a = s.p[i], b = s.p[i + 1] || a; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = clamp(t, 0, 1); const px = a[0] + t * dx, py = a[1] + t * dy; if ((px - x) ** 2 + (py - y) ** 2 <= (r + s.w / 2) ** 2) return true; }
    if (['rect', 'ellipse'].includes(s.t) && s.p.length >= 2){ const [[x1, y1], [x2, y2]] = s.p; const pts = s.t === 'rect' ? [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]] : Array.from({length: 25}, (_, k) => [(x1 + x2) / 2 + Math.cos(k / 24 * 6.283) * Math.abs(x2 - x1) / 2, (y1 + y2) / 2 + Math.sin(k / 24 * 6.283) * Math.abs(y2 - y1) / 2]); return hit({p: pts, w: s.w, t: 'pen'}, x, y, r); } return false; }
  function inPoly(x, y, poly){ let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
  function markSel(){ if (!svg) return; $$('path', svg).forEach(p => p.classList.toggle('selk', !!lassoSel && lassoSel.has(p.dataset.id))); }
  function down(e){ if (e.pointerType === 'pen') penSeen = true; ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY, type: e.pointerType});
    const touches = [...ptrs.values()].filter(p => p.type === 'touch');
    if (touches.length >= 2 || tool.t === 'pan' || (e.pointerType === 'touch' && (!tool.finger || penSeen))){ if (cur){ curEl && curEl.remove(); cur = null; curEl = null; } pan = {x: mid().x, y: mid().y, sl: scroller.scrollLeft, st: scroller.scrollTop}; try { svg.setPointerCapture(e.pointerId); } catch(_){} return; }
    e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch(_){} const p = pt(e);
    if (tool.t === 'lasso'){ if (lassoSel && lassoSel.size && selBox() && inBox(p, selBox())){ drag = {x: p[0], y: p[1], orig: page.ink.filter(s => lassoSel.has(s.id)).map(s => [s, clone(s.p)])}; return; } lassoSel = null; markSel(); cur = {t: 'lasso', p: [p]}; curEl = document.createElementNS(NS, 'path'); curEl.setAttribute('fill', 'rgb(123 47 176 / .08)'); curEl.setAttribute('stroke', '#7B2FB0'); curEl.setAttribute('stroke-dasharray', '4 4'); svg.append(curEl); return; }
    if (tool.t === 'eraser'){ cur = {t: 'eraser', removed: 0}; erase(p); return; }
    cur = {id: uid(), t: tool.t, c: tool.c, w: tool.w, p: [p.slice(0, 2).map(v => +v.toFixed(1))]}; if (['line', 'arrow', 'rect', 'ellipse'].includes(tool.t)) cur.p.push(cur.p[0].slice()); curEl = el(cur); svg.append(curEl); }
  const mid = () => { const v = [...ptrs.values()]; return {x: v.reduce((a, p) => a + p.x, 0) / v.length, y: v.reduce((a, p) => a + p.y, 0) / v.length}; };
  function move(e){ if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, {...ptrs.get(e.pointerId), x: e.clientX, y: e.clientY});
    if (pan){ const m = mid(); scroller.scrollLeft = pan.sl - (m.x - pan.x); scroller.scrollTop = pan.st - (m.y - pan.y); return; }
    if (drag){ const p = pt(e); const dx = p[0] - drag.x, dy = p[1] - drag.y; for (const [s, o] of drag.orig){ s.p = o.map(q => [q[0] + dx, q[1] + dy, ...q.slice(2)]); const pe = svg.querySelector(`path[data-id="${s.id}"]`); if (pe) pe.setAttribute('d', dOf(s)); } return; }
    if (!cur) return; e.preventDefault(); let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs = [e];
    if (cur.t === 'eraser'){ for (const ev of evs) erase(pt(ev)); return; }
    if (cur.t === 'lasso'){ for (const ev of evs) cur.p.push(pt(ev)); curEl.setAttribute('d', smooth(cur.p) + 'Z'); return; }
    if (['line', 'arrow', 'rect', 'ellipse'].includes(cur.t)){ let p = pt(e); if (e.shiftKey && cur.t !== 'line' && cur.t !== 'arrow'){ const [x0, y0] = cur.p[0]; const d = Math.max(Math.abs(p[0] - x0), Math.abs(p[1] - y0)); p = [x0 + Math.sign(p[0] - x0) * d, y0 + Math.sign(p[1] - y0) * d]; } cur.p[1] = [+p[0].toFixed(1), +p[1].toFixed(1)]; curEl.setAttribute('d', shapeD(cur)); return; }
    for (const ev of evs){ const p = pt(ev); const l = cur.p[cur.p.length - 1]; if ((p[0] - l[0]) ** 2 + (p[1] - l[1]) ** 2 < .8) continue; cur.p.push([+p[0].toFixed(1), +p[1].toFixed(1)]); } curEl.setAttribute('d', smooth(cur.p)); }
  function up(e){ ptrs.delete(e.pointerId); if (pan){ if (!ptrs.size) pan = null; return; }
    if (drag){ drag = null; onCommit('Move ink'); return; }
    if (!cur) return; const c = cur; cur = null;
    if (c.t === 'eraser'){ if (c.removed) onCommit('Erase'); return; }
    if (c.t === 'lasso'){ curEl.remove(); curEl = null; const poly = c.p; lassoSel = new Set(page.ink.filter(s => s.p.some(q => inPoly(q[0], q[1], poly)) && s.p.filter(q => inPoly(q[0], q[1], poly)).length >= Math.ceil(s.p.length * .6)).map(s => s.id)); if (!lassoSel.size) lassoSel = null; markSel(); if (lassoSel) Page.inkSelBar(); return; }
    if (c.p.length === 1) c.p.push([c.p[0][0] + .1, c.p[0][1] + .1]);
    if (['line', 'arrow', 'rect', 'ellipse'].includes(c.t)){ const [[a, b], [x, y]] = c.p; if (Math.hypot(x - a, y - b) < 3){ curEl.remove(); curEl = null; return; } }
    page.ink = page.ink || []; page.ink.push(c); curEl = null; onCommit('Ink'); }
  function erase(p){ const r = 8 / Page.zoom(); const before = page.ink.length; page.ink = page.ink.filter(s => { if (hit(s, p[0], p[1], r)){ const pe = svg.querySelector(`path[data-id="${s.id}"]`); pe && pe.remove(); return false; } return true; }); if (cur) cur.removed += before - page.ink.length; }
  function selBox(){ if (!lassoSel) return null; let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9; for (const s of page.ink) if (lassoSel.has(s.id)) for (const q of s.p){ x1 = Math.min(x1, q[0]); y1 = Math.min(y1, q[1]); x2 = Math.max(x2, q[0]); y2 = Math.max(y2, q[1]); } return x1 > x2 ? null : {x1: x1 - 12, y1: y1 - 12, x2: x2 + 12, y2: y2 + 12}; }
  const inBox = (p, b) => p[0] >= b.x1 && p[0] <= b.x2 && p[1] >= b.y1 && p[1] <= b.y2;
  function deleteSel(){ if (!lassoSel) return; page.ink = page.ink.filter(s => !lassoSel.has(s.id)); lassoSel = null; render(); onCommit('Delete ink'); }
  function recolorSel(c){ if (!lassoSel) return; for (const s of page.ink) if (lassoSel.has(s.id) && s.t !== 'hl') s.c = c; render(); onCommit('Ink colour'); }
  function copySel(){ if (!lassoSel) return; const add = page.ink.filter(s => lassoSel.has(s.id)).map(s => ({...clone(s), id: uid(), p: s.p.map(q => [q[0] + 20, q[1] + 20])})); page.ink.push(...add); lassoSel = new Set(add.map(s => s.id)); render(); onCommit('Duplicate ink'); }
  function clearSel(){ lassoSel = null; markSel(); }
  return {mount, render, size, bounds, tool, setTool: o => { Object.assign(tool, o); if (tool.t !== 'lasso') clearSel(); }, PEN_COLORS, HL_COLORS, WIDTHS, deleteSel, recolorSel, copySel, clearSel, hasSel: () => !!lassoSel, svgFor: (pg, w, hgt) => `<svg xmlns="${NS}" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" style="position:absolute;left:0;top:0;pointer-events:none">${(pg.ink || []).map(s => `<path d="${dOf(s)}" fill="none" stroke="${s.c}" stroke-width="${s.w}" stroke-linecap="${s.t === 'hl' ? 'square' : 'round'}" stroke-linejoin="round"${s.t === 'hl' ? ' stroke-opacity=".42"' : ''}/>`).join('')}</svg>`, penSeen: () => penSeen};
})();
