/* SRK Slides — charts: drawn as SVG on slides, saved as real (editable) PowerPoint charts */
'use strict';
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
