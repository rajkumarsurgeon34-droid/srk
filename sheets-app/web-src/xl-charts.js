/* SRK Sheets — charts and pictures floating over the grid */
'use strict';
const tint = (c, t) => mix(c, '#FFFFFF', t), shade = (c, t) => mix(c, '#000000', t), isDark = isDarkC, fontStack = fontCss;
const CHART_TYPES = [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['doughnut', 'Doughnut']];
function chartPalette(th){ const a = th.accent, b = th.accent2 || '#ED7D31'; return [a, b, mix(a, b, .5), shade(a, .35), tint(b, .35), '#A5A5A5', tint(a, .45), shade(b, .3)]; }
function newChartData(type){
  return type === 'pie' || type === 'doughnut'
    ? {labels: ['Category A', 'Category B', 'Category C', 'Category D'], series: [{name: 'Share', values: [42, 28, 18, 12]}]}
    : {labels: ['2023', '2024', '2025', '2026'], series: [{name: 'Series 1', values: [4.3, 2.5, 3.5, 4.5]}, {name: 'Series 2', values: [2.4, 4.4, 1.8, 2.8]}, {name: 'Series 3', values: [2, 2, 3, 5]}]};
}
const niceNum = (range, round) => { const exp = Math.floor(Math.log10(range || 1)), f = range / Math.pow(10, exp); let nf; if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return nf * Math.pow(10, exp); };
const fmtNum = v => Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10) + 'k' : String(Math.round(v * 100) / 100);
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
/* SVG markup for a chart object, in slide points */
function chartSvg(o, th){
  const W = Math.max(o.w, 40), H = Math.max(o.h, 30), d = o.data || newChartData(o.chart), pal = o.colors && o.colors.length ? o.colors : chartPalette(th);
  const ink = th.text, grid = isDark(th.bg) ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)', fs = o.fontSize || 12, font = fontStack(th.body);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="100%" font-family="${font.replace(/"/g, "'")}" font-size="${fs}" fill="${ink}">`;
  let top = 6, bottom = H - 6; const L = 8, R = W - 8;
  if (o.title){ s += `<text x="${W / 2}" y="${top + fs * 1.3}" text-anchor="middle" font-size="${fs * 1.4}" font-weight="600">${xmlEsc(o.title)}</text>`; top += fs * 2; }
  const pie = o.chart === 'pie' || o.chart === 'doughnut';
  const legendItems = pie ? d.labels : d.series.map(x => x.name);
  if (o.legend !== false && legendItems.length){
    let x = 0; const items = legendItems.map((n, i) => { const w = 14 + String(n).length * fs * 0.55 + 14; const it = {n, i, x, w}; x += w; return it; }); const off = Math.max(L, (W - x) / 2);
    for (const it of items) s += `<rect x="${off + it.x}" y="${bottom - fs}" width="${fs * .8}" height="${fs * .8}" fill="${pal[it.i % pal.length]}"/><text x="${off + it.x + fs * 1.1}" y="${bottom - fs * .25}">${xmlEsc(it.n)}</text>`;
    bottom -= fs * 2;
  }
  if (pie){
    const vals = (d.series[0] || {values: []}).values.map(v => Math.max(0, +v || 0)), tot = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = (top + bottom) / 2, r = Math.max(10, Math.min(W - 2 * L, bottom - top) / 2 - 4), hole = o.chart === 'doughnut' ? r * 0.55 : 0; let a0 = -Math.PI / 2;
    vals.forEach((v, i) => { const a1 = a0 + v / tot * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, c = pal[i % pal.length];
      const p = (ang, rr) => `${(cx + Math.cos(ang) * rr).toFixed(2)} ${(cy + Math.sin(ang) * rr).toFixed(2)}`;
      if (v / tot > 0.9999){ s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>` + (hole ? `<circle cx="${cx}" cy="${cy}" r="${hole}" fill="${th.bg}"/>` : ''); }
      else s += hole ? `<path d="M${p(a0, r)}A${r} ${r} 0 ${big} 1 ${p(a1, r)}L${p(a1, hole)}A${hole} ${hole} 0 ${big} 0 ${p(a0, hole)}Z" fill="${c}" stroke="${th.bg}" stroke-width="1.5"/>` : `<path d="M${cx} ${cy}L${p(a0, r)}A${r} ${r} 0 ${big} 1 ${p(a1, r)}Z" fill="${c}" stroke="${th.bg}" stroke-width="1.5"/>`;
      if (o.labels !== false && v / tot > 0.04){ const m = (a0 + a1) / 2, lr = hole ? (r + hole) / 2 : r * 0.62; s += `<text x="${(cx + Math.cos(m) * lr).toFixed(1)}" y="${(cy + Math.sin(m) * lr + fs * .35).toFixed(1)}" text-anchor="middle" fill="#FFFFFF" font-weight="600">${Math.round(v / tot * 100)}%</text>`; }
      a0 = a1; });
    return s + '</svg>';
  }
  const all = d.series.flatMap(x => x.values.map(v => +v || 0)); let mx = Math.max(0, ...all), mn = Math.min(0, ...all); if (mx === mn) mx = mn + 1;
  const step = niceNum(niceNum(mx - mn, false) / 5, true); mx = Math.ceil(mx / step) * step; mn = Math.floor(mn / step) * step;
  const horiz = o.chart === 'bar'; const labW = Math.max(...d.labels.map(l => String(l).length)) * fs * 0.55 + 6, valW = Math.max(fmtNum(mx).length, fmtNum(mn).length) * fs * 0.6 + 8;
  const pl = L + (horiz ? labW : valW), pr = R - 4, pt = top + 4, pb = bottom - fs * 1.6, n = d.labels.length || 1, ns = d.series.length || 1;
  const vy = v => pb - (v - mn) / (mx - mn) * (pb - pt), vx = v => pl + (v - mn) / (mx - mn) * (pr - pl);
  for (let v = mn; v <= mx + step / 2; v += step){
    if (horiz){ const x = vx(v); s += `<line x1="${x}" y1="${pt}" x2="${x}" y2="${pb}" stroke="${grid}"/><text x="${x}" y="${pb + fs * 1.2}" text-anchor="middle" fill-opacity=".8">${fmtNum(v)}</text>`; }
    else { const y = vy(v); s += `<line x1="${pl}" y1="${y}" x2="${pr}" y2="${y}" stroke="${grid}"/><text x="${pl - 5}" y="${y + fs * .35}" text-anchor="end" fill-opacity=".8">${fmtNum(v)}</text>`; }
  }
  const band = (horiz ? pb - pt : pr - pl) / n;
  d.labels.forEach((lab, i) => { if (horiz) s += `<text x="${pl - 5}" y="${pt + band * (i + .5) + fs * .35}" text-anchor="end">${xmlEsc(lab)}</text>`; else s += `<text x="${pl + band * (i + .5)}" y="${pb + fs * 1.2}" text-anchor="middle">${xmlEsc(lab)}</text>`; });
  if (o.chart === 'line' || o.chart === 'area'){
    d.series.forEach((ser, si) => { const c = pal[si % pal.length]; const pts = d.labels.map((_, i) => [pl + band * (i + .5), vy(+ser.values[i] || 0)]);
      if (o.chart === 'area') s += `<path d="M${pts[0][0]} ${vy(Math.max(mn, 0))}L${pts.map(p => p.join(' ')).join('L')}L${pts[pts.length - 1][0]} ${vy(Math.max(mn, 0))}Z" fill="${c}" fill-opacity=".55"/>`;
      s += `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
      if (o.chart === 'line') pts.forEach(p => s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${c}"/>`);
      if (o.labels) pts.forEach((p, i) => s += `<text x="${p[0]}" y="${p[1] - 7}" text-anchor="middle" font-size="${fs * .9}">${fmtNum(+ser.values[i] || 0)}</text>`); });
  } else {
    const gw = band * 0.72, bw = gw / ns;
    d.series.forEach((ser, si) => { const c = pal[si % pal.length]; d.labels.forEach((_, i) => { const v = +ser.values[i] || 0;
      if (horiz){ const y = pt + band * i + (band - gw) / 2 + bw * si, x0 = vx(Math.max(mn, Math.min(0, v))), x1 = vx(Math.max(0, v)); s += `<rect x="${Math.min(x0, vx(v)).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.abs(vx(v) - vx(0)).toFixed(1)}" height="${(bw * .92).toFixed(1)}" fill="${c}"/>`;
        if (o.labels) s += `<text x="${(vx(v) + 4).toFixed(1)}" y="${(y + bw * .46 + fs * .35).toFixed(1)}" font-size="${fs * .9}">${fmtNum(v)}</text>`; }
      else { const x = pl + band * i + (band - gw) / 2 + bw * si; s += `<rect x="${x.toFixed(1)}" y="${Math.min(vy(v), vy(0)).toFixed(1)}" width="${(bw * .92).toFixed(1)}" height="${Math.abs(vy(v) - vy(0)).toFixed(1)}" fill="${c}"/>`;
        if (o.labels) s += `<text x="${(x + bw * .46).toFixed(1)}" y="${(vy(v) - 4).toFixed(1)}" text-anchor="middle" font-size="${fs * .9}">${fmtNum(v)}</text>`; } }); });
  }
  s += `<line x1="${pl}" y1="${pb}" x2="${pr}" y2="${pb}" stroke="${ink}" stroke-opacity=".5"/>`;
  return s + '</svg>';
}
const XL_COLORS = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E'];
const CHART_TH = {accent: '#4472C4', accent2: '#ED7D31', text: '#404040', bg: '#FFFFFF', body: 'Calibri'};
/* chart data from its sheet range: first column = categories, first row = series names (or the other way round) */
function chartData(sh, o){
  const g = o.range; const R = g.r2 - g.r1 + 1, C = g.c2 - g.c1 + 1; const v = (r, c) => Calc.get(sh, r, c);
  const txt = x => x == null ? '' : typeof x === 'number' ? generalNum(x) : String(x);
  const firstRowText = [...Array(C).keys()].some(j => typeof v(g.r1, g.c1 + j) === 'string') || (R > 1 && [...Array(C).keys()].every(j => v(g.r1, g.c1 + j) == null || typeof v(g.r1, g.c1 + j) === 'string'));
  const firstColText = [...Array(R).keys()].slice(firstRowText ? 1 : 0).some(i => typeof v(g.r1 + i, g.c1) === 'string') || (o.chart === 'pie' || o.chart === 'doughnut') && C > 1 && typeof v(g.r1 + 1, g.c1) !== 'number';
  const byRows = o.by ? o.by === 'rows' : (C - (firstColText ? 1 : 0)) > (R - (firstRowText ? 1 : 0)) && !(o.chart === 'pie' || o.chart === 'doughnut');
  const h0 = firstRowText ? 1 : 0, c0 = firstColText ? 1 : 0; const labels = [], series = [];
  if (!byRows){ for (let i = h0; i < R; i++) labels.push(c0 ? txt(v(g.r1 + i, g.c1)) : String(i - h0 + 1)); for (let j = c0; j < C; j++) series.push({name: h0 ? txt(v(g.r1, g.c1 + j)) : 'Series ' + (j - c0 + 1), values: labels.map((_, i) => { const x = v(g.r1 + h0 + i, g.c1 + j); return typeof x === 'number' ? x : 0; }), col: g.c1 + j}); }
  else { for (let j = c0; j < C; j++) labels.push(h0 ? txt(v(g.r1, g.c1 + j)) : String(j - c0 + 1)); for (let i = h0; i < R; i++) series.push({name: c0 ? txt(v(g.r1 + i, g.c1)) : 'Series ' + (i - h0 + 1), values: labels.map((_, j) => { const x = v(g.r1 + i, g.c1 + c0 + j); return typeof x === 'number' ? x : 0; }), row: g.r1 + i}); }
  return {labels, series, h0, c0, byRows};
}
const Objects = (() => {
  const $ = s => document.querySelector(s); const G = () => Grid.G;
  function pos(o){ const z = Grid.z(); return {x: Grid.hw() + (Grid.colLeft[o.c] ?? 0) + (o.dx || 0) * z, y: Grid.hh() + (Grid.rowTop[o.r] ?? 0) + (o.dy || 0) * z, w: o.w * z, h: o.h * z}; }
  function render(){ const sh = G().sh; const main = $('#gmain'); if (!main) return; let html = '';
    for (const o of [...sh.images, ...sh.charts]){ const p = pos(o); const sel = G().objSel === o.id;
      const inner = o.chart ? chartSvg({...o, w: p.w, h: p.h, data: chartData(sh, o), fontSize: Math.max(8, 11 * Grid.z()), colors: o.colors || XL_COLORS}, CHART_TH) : `<img src="${mediaOf(o.src)}" alt="" draggable="false">`;
      html += `<div class="obj${o.chart ? ' chart' : ' pic'}${sel ? ' on' : ''}" data-oid="${o.id}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">${inner}${sel ? '<i class="oh" data-h="nw"></i><i class="oh" data-h="ne"></i><i class="oh" data-h="sw"></i><i class="oh" data-h="se"></i>' : ''}</div>`; }
    let L = main.querySelector('.objs'); if (!L){ L = document.createElement('div'); L.className = 'objs'; main.appendChild(L); } L.innerHTML = html; }
  const mediaOf = src => src && src.startsWith('m:') ? (G().wb.media || {})[src.slice(2)] || '' : src || '';
  const find = id => { const sh = G().sh; return sh.charts.find(o => o.id === id) || sh.images.find(o => o.id === id); };
  let drag = null;
  function down(e){ e.preventDefault(); e.stopPropagation(); const el = e.target.closest('.obj'); const o = find(el.dataset.oid); if (!o) return; if (Grid.G.edit) Grid.commitEdit();
    const was = G().objSel === o.id; G().objSel = o.id; const h = e.target.closest('.oh'); drag = {o, mode: h ? h.dataset.h : 'move', x: e.clientX, y: e.clientY, p0: pos(o), was, moved: false};
    try { $('#gscroll').setPointerCapture(e.pointerId); } catch(_){} document.addEventListener('pointermove', move); document.addEventListener('pointerup', up, {once: true}); render(); if (G().onObj) G().onObj(o); }
  function move(e){ if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 4) return; drag.moved = true; const o = drag.o, p = drag.p0, z = Grid.z();
    let x = p.x, y = p.y, w = p.w, hgt = p.h; if (drag.mode === 'move'){ x += dx; y += dy; } else { if (drag.mode.includes('e')) w += dx; if (drag.mode.includes('w')){ w -= dx; x += dx; } if (drag.mode.includes('s')) hgt += dy; if (drag.mode.includes('n')){ hgt -= dy; y += dy; } if (o.src && !e.shiftKey){ const k = p.h / p.w; if (Math.abs(dx) > Math.abs(dy)) hgt = w * k; else w = hgt / k; } }
    w = Math.max(30, w); hgt = Math.max(24, hgt); place(o, x, y, w / z, hgt / z); render(); }
  function place(o, x, y, w, h){ const z = Grid.z(); x = Math.max(Grid.hw(), x); y = Math.max(Grid.hh(), y); const gx = x - Grid.hw(), gy = y - Grid.hh(); const cl = Grid.colLeft, rt = Grid.rowTop;
    let c = 0; while (c + 1 < cl.length && cl[c + 1] <= gx) c++; let r = 0; while (r + 1 < rt.length && rt[r + 1] <= gy) r++; o.c = c; o.r = r; o.dx = (gx - cl[c]) / z; o.dy = (gy - rt[r]) / z; o.w = Math.round(w); o.h = Math.round(h); }
  function up(){ document.removeEventListener('pointermove', move); const d = drag; drag = null; if (!d) return; if (d.moved){ if (G().onChange) G().onChange(); } else if (d.was && d.o.chart && G().onChartTap) G().onChartTap(d.o); }
  function deselect(){ G().objSel = null; render(); }
  function add(list, o){ const sh = G().sh; const g = G().sel.g; o.id = uid(); o.r = Math.min(g.r1, Grid.NR - 1); o.c = Math.min(g.c2 + 1, Grid.NC - 1); o.dx = 8; o.dy = 0; sh[list].push(o); G().objSel = o.id; render(); if (G().onObj) G().onObj(o); if (G().onChange) G().onChange(); }
  function remove(id){ const sh = G().sh; sh.charts = sh.charts.filter(o => o.id !== id); sh.images = sh.images.filter(o => o.id !== id); G().objSel = null; render(); if (G().onChange) G().onChange(); }
  return {render, down, deselect, add, remove, find, pos, mediaOf};
})();
