/* SRK Sheets — the grid: virtual rendering, frozen panes, selection, in-cell editing, fill handle, touch handles */
'use strict';
const Grid = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const G = {wb: null, sh: null, sel: {r: 0, c: 0, g: {r1: 0, c1: 0, r2: 0, c2: 0}}, edit: null, z: 1, showF: false, clip: null, fill: false, painter: null, onSel: null, onChange: null, ptRef: null, objSel: null};
  const HW = 46, HH = 24; // header sizes (px, unscaled)
  let NR = 200, NC = 30, rowTop = [], colLeft = [], filt = new Set(), geoDirty = true;
  const sc = () => $('#gscroll');
  /* ---------------------------------------------------------------- geometry */
  const z = () => G.z;
  const hw = () => Math.round(HW * Math.min(1.2, Math.max(.8, z()))), hh = () => Math.round(HH * Math.min(1.2, Math.max(.8, z())));
  function cw(c){ const s = G.sh; if (s.hidC[c]) return 0; return Math.round((s.colW[c] ?? DEF_W) * z()); }
  function rh(r){ const s = G.sh; if (s.hidR[r] || filt.has(r)) return 0; return Math.round((s.rowH[r] ?? DEF_H) * z()); }
  function geometry(){
    const s = G.sh; const {R, C} = Calc.lastRC(s); const v = sc();
    NR = Math.max(NR, R + 80, s.freeze.r + 60, Math.ceil((v.scrollTop + v.clientHeight * 2) / (DEF_H * z())) + 20);
    NC = Math.max(NC, C + 12, s.freeze.c + 12, Math.ceil((v.scrollLeft + v.clientWidth * 2) / (DEF_W * z())) + 4);
    NR = Math.min(NR, MAXR); NC = Math.min(NC, MAXC);
    filt = filteredRows(s);
    rowTop = new Array(NR + 1); rowTop[0] = 0; for (let r = 0; r < NR; r++) rowTop[r + 1] = rowTop[r] + rh(r);
    colLeft = new Array(NC + 1); colLeft[0] = 0; for (let c = 0; c < NC; c++) colLeft[c + 1] = colLeft[c] + cw(c);
    const W = hw() + colLeft[NC], H = hh() + rowTop[NR]; const sp = $('#gspace'); sp.style.width = W + 'px'; sp.style.height = H + 'px';
    const fr = s.freeze.r, fc = s.freeze.c, FH = hh() + rowTop[fr], FW = hw() + colLeft[fc];
    const top = $('#stkTop'), left = $('#stkLeft'), cor = $('#stkCorner');
    top.style.cssText = `height:${FH}px;margin-bottom:${-FH}px;width:${W}px`; left.style.cssText = `width:${FW}px;height:${H}px;margin-bottom:${-H}px`; cor.style.cssText = `width:${FW}px;height:${FH}px;margin-bottom:${-FH}px`;
    top.classList.toggle('frz', fr > 0); left.classList.toggle('frz', fc > 0);
    geoDirty = false;
  }
  const find = (arr, n, x) => { let lo = 0, hi = n; while (lo < hi){ const m = (lo + hi) >> 1; if (arr[m + 1] <= x) lo = m + 1; else hi = m; } return Math.min(lo, n - 1); };
  const rowAt = y => find(rowTop, NR, y), colAt = x => find(colLeft, NC, x);
  /* point in gspace coords → cell (respecting frozen panes) */
  function cellFromClient(cx, cy){
    const v = sc(), b = v.getBoundingClientRect(); const s = G.sh; const x = cx - b.left, y = cy - b.top; const fr = s.freeze.r, fc = s.freeze.c;
    const FH = hh() + rowTop[fr], FW = hw() + colLeft[fc];
    const gy = y < FH ? y - hh() : y + v.scrollTop - hh(), gx = x < FW ? x - hw() : x + v.scrollLeft - hw();
    return {r: Math.max(0, rowAt(Math.max(0, gy))), c: Math.max(0, colAt(Math.max(0, gx))), inHdrR: x < hw(), inHdrC: y < hh(), gx, gy};
  }
  /* ---------------------------------------------------------------- rendering */
  const measure = (() => { const c = document.createElement('canvas').getContext('2d'); return (t, font) => { c.font = font; return c.measureText(t).width; }; })();
  let raf = 0; function draw(){ if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  function cellBox(r, c){ const m = mergeAt(G.sh, r, c); if (m) return {x: colLeft[m.c1], y: rowTop[m.r1], w: colLeft[Math.min(m.c2 + 1, NC)] - colLeft[m.c1], h: rowTop[Math.min(m.r2 + 1, NR)] - rowTop[m.r1], m}; return {x: colLeft[c], y: rowTop[r], w: colLeft[c + 1] - colLeft[c], h: rowTop[r + 1] - rowTop[r]}; }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
  const BORDER = {thin: '1px solid', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double', hair: '1px dotted', mediumDashed: '2px dashed'};
  function cellsHTML(r0, r1, c0, c1, opaque){
    const s = G.sh; const out = [], over = [], borders = []; const ox = hw(), oy = hh(); const cfCache = {}; const done = new Set();
    const selDV = G.sel && dvAt(G.sel.r, G.sel.c);
    for (let r = r0; r <= r1; r++){ const H = rowTop[r + 1] - rowTop[r]; if (!H && !mergeHere(r, null)) continue;
      for (let c = c0; c <= c1; c++){
        let m = null; for (const mm of s.merges) if (inRange(mm, r, c)){ m = mm; break; }
        if (m){ const k = m.r1 + ',' + m.c1; if (done.has(k)) continue; done.add(k); }
        const rr = m ? m.r1 : r, cc = m ? m.c1 : c; const bx = cellBox(rr, cc); if (!bx.w || !bx.h) continue;
        const x = cellAt(s, rr, cc); const st = x && x.s || {}; const tst = s.tables.length ? tableStyleAt(s, rr, cc) : null; const cf = s.cf.length ? cfStyleFor(s, rr, cc, cfCache) : null;
        const d = displayAt(s, rr, cc, G.showF);
        let fill = (cf && cf.fill) || st.fill || (tst && tst.fill) || (opaque ? 'var(--cellbg)' : null); let color = (cf && cf.color) || d.color || st.color || (tst && tst.color) || null;
        const bold = (cf && cf.b) || st.b || (tst && tst.b), ital = st.i || (cf && cf.i);
        const size = (st.size || 11) * 4 / 3 * z(); const font = `${ital ? 'italic ' : ''}${bold ? '700 ' : ''}${size.toFixed(1)}px ${fontCss(st.font)}`;
        let text = d.text; let align = st.ha || d.align || 'left'; if (st.ha === 'general' || !st.ha) align = d.align || (typeof Calc.get(s, rr, cc) === 'number' ? 'right' : 'left');
        if (text && typeof Calc.get(s, rr, cc) === 'number' && !st.wrap && !G.showF){ const tw = measure(text, font); if (tw > bx.w - 4) text = '#'.repeat(Math.max(1, Math.floor((bx.w - 4) / measure('#', font)))); }
        let w = bx.w, left = bx.x, spill = false;
        if (text && !st.wrap && !m && typeof Calc.get(s, rr, cc) !== 'number' && align !== 'center'){ const tw = measure(text, font) + 6; if (tw > w){ if (align === 'left' || align === 'justify'){ let cc2 = cc + 1; while (w < tw && cc2 < NC && !cellAt(s, rr, cc2) && !mergeAt(s, rr, cc2)){ w += colLeft[cc2 + 1] - colLeft[cc2]; cc2++; } } else { let cc2 = cc - 1; while (w < tw && cc2 >= 0 && !cellAt(s, rr, cc2)){ const ww = colLeft[cc2 + 1] - colLeft[cc2]; w += ww; left -= ww; cc2--; } } spill = w > bx.w; } }
        const css = [`left:${ox + bx.x}px;top:${oy + bx.y}px;width:${bx.w}px;height:${bx.h}px`];
        if (fill) css.push(`background:${fill}`);
        if (cf && cf.bar) css.push(`background:linear-gradient(90deg,${cf.bar.color}aa ${Math.round(cf.bar.pct * 100)}%,${fill || 'transparent'} ${Math.round(cf.bar.pct * 100)}%)`);
        out.push(`<div class="c${st.wrap ? ' wr' : ''}" data-r="${rr}" data-c="${cc}" style="${css.join(';')}"></div>`);
        const cmt = s.comments && s.comments[key(rr, cc)]; if (text || s.notes[key(rr, cc)] || cmt){
          const tcss = [`left:${ox + left}px;top:${oy + bx.y}px;width:${w}px;height:${bx.h}px;font:${font};text-align:${align};justify-content:${({top: 'flex-start', middle: 'center', center: 'center', bottom: 'flex-end'})[st.va || 'bottom']}`];
          if (color) tcss.push(`color:${color}`); if (st.u || s.links[key(rr, cc)]) tcss.push('text-decoration:underline'); if (st.s) tcss.push('text-decoration:line-through'); if (s.links[key(rr, cc)] && !color) tcss.push('color:#0563C1');
          if (st.ind) tcss.push(`padding-${align === 'right' ? 'right' : 'left'}:${3 + st.ind * 9 * z()}px`); if (spill) tcss.push('z-index:1');
          over.push(`<div class="t${st.wrap ? ' wr' : ''}" style="${tcss.join(';')}">${cf && cf.icon ? `<b class="cfi" style="color:${cf.icon[1]}">${cf.icon[0]}</b>` : ''}<span>${esc(text)}</span>${s.notes[key(rr, cc)] ? '<i class="note"></i>' : ''}${cmt ? '<i class="cmt"></i>' : ''}</div>`);
        }
        const bd = st.bd; const tb = tst && tst.bdT;
        if (bd || tb){ const b = []; for (const [side, prop] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]){ const e = bd && bd[side]; if (e) b.push(`border-${prop}:${BORDER[e.style] || BORDER.thin} ${e.color || '#000'}`); } if (tb) b.push(`border-top:2px double ${tb}`); borders.push(`<div class="bd" style="left:${ox + bx.x - 1}px;top:${oy + bx.y - 1}px;width:${bx.w + 1}px;height:${bx.h + 1}px;${b.join(';')}"></div>`); }
      }
    }
    // filter buttons & validation arrow
    const btns = []; const f = s.filter; if (f && f.range.r1 >= r0 && f.range.r1 <= r1) for (let c = Math.max(c0, f.range.c1); c <= Math.min(c1, f.range.c2); c++){ const bx = cellBox(f.range.r1, c); const on = f.cols && f.cols[c]; btns.push(`<button class="fbtn${on ? ' on' : ''}" data-fc="${c}" style="left:${ox + bx.x + bx.w - 20 * z()}px;top:${oy + bx.y + bx.h - 20 * z()}px;width:${18 * z()}px;height:${18 * z()}px" aria-label="Filter ${colName(c)}">${on ? '⧩' : '▾'}</button>`); }
    if (selDV && selDV.type === 'list' && G.sel.r >= r0 && G.sel.r <= r1 && G.sel.c >= c0 && G.sel.c <= c1){ const bx = cellBox(G.sel.r, G.sel.c); btns.push(`<button class="dvbtn" style="left:${ox + bx.x + bx.w + 1}px;top:${oy + bx.y}px;height:${bx.h}px" aria-label="Choose from list">▾</button>`); }
    return out.join('') + over.join('') + borders.join('') + btns.join('');
    function mergeHere(r){ return s.merges.some(m => r >= m.r1 && r <= m.r2); }
  }
  function olHTML(o, hid, i, rows){ if (!o) return ''; let h = ''; if (o[i]) h += `<i class="ol" style="--lv:${o[i]}"></i>`; if (o[i - 1] && !o[i]){ let a = i - 1; while (a > 0 && o[a - 1]) a--; const shut = !!hid[i - 1]; h += `<b class="olb" data-ol="${rows ? 'r' : 'c'}:${i - 1}" title="${shut ? 'Show' : 'Hide'} detail">${shut ? '+' : '−'}</b>`; } return h; }
  function headersHTML(r0, r1, c0, c1, which){
    const s = G.sh; const g = G.sel.g; const out = [];
    if (which !== 'rows') for (let c = c0; c <= c1; c++){ const w = colLeft[c + 1] - colLeft[c]; if (!w) { if (c > 0 && s.hidC[c]) out.push(`<div class="hid-c" style="left:${hw() + colLeft[c] - 2}px"></div>`); continue; } const on = c >= g.c1 && c <= g.c2, full = on && g.r1 === 0 && g.r2 >= MAXR - 1;
      out.push(`<div class="ch${on ? ' on' : ''}${full ? ' full' : ''}" data-c="${c}" style="left:${hw() + colLeft[c]}px;width:${w}px;height:${hh()}px">${colName(c)}<i class="rs" data-rc="${c}"></i>${olHTML(s.outC, s.hidC, c)}</div>`); }
    if (which !== 'cols') for (let r = r0; r <= r1; r++){ const H = rowTop[r + 1] - rowTop[r]; if (!H) continue; const on = r >= g.r1 && r <= g.r2, full = on && g.c1 === 0 && g.c2 >= MAXC - 1;
      out.push(`<div class="rh${on ? ' on' : ''}${full ? ' full' : ''}" data-r="${r}" style="top:${hh() + rowTop[r]}px;height:${H}px;width:${hw()}px">${r + 1}<i class="rs" data-rr="${r}"></i>${olHTML(s.outR, s.hidR, r, true)}</div>`); }
    return out.join('');
  }
  function selHTML(lim){ // selection rectangle + active cell, clipped to a layer's rows/cols
    const s = G.sh, g = G.sel.g; const ox = hw(), oy = hh(); const r2 = Math.min(g.r2, NR - 1), c2 = Math.min(g.c2, NC - 1);
    const x1 = colLeft[g.c1], y1 = rowTop[g.r1], x2 = colLeft[c2 + 1], y2 = rowTop[r2 + 1]; const ab = cellBox(G.sel.r, G.sel.c);
    let h = `<div class="selr" style="left:${ox + x1}px;top:${oy + y1}px;width:${x2 - x1}px;height:${y2 - y1}px"></div><div class="selc" style="left:${ox + ab.x}px;top:${oy + ab.y}px;width:${ab.w}px;height:${ab.h}px"></div>`;
    const sp = Calc.spillInfo(s, G.sel.r, G.sel.c); if (sp){ const sx = colLeft[sp.c], sy = rowTop[sp.r], ex = colLeft[Math.min(sp.c + sp.cols, NC)], ey = rowTop[Math.min(sp.r + sp.rows, NR)]; if (ex != null && ey != null) h += `<div class="spillb" style="left:${ox + sx}px;top:${oy + sy}px;width:${ex - sx}px;height:${ey - sy}px"></div>`; }
    if (!G.edit){ const touch = matchMedia('(pointer:coarse)').matches;
      if (touch){ h += `<div class="hdlT" data-h="tl" style="left:${ox + x1}px;top:${oy + y1}px"></div><div class="hdlT${G.fill ? ' fill' : ''}" data-h="br" style="left:${ox + x2}px;top:${oy + y2}px"></div>`; }
      else h += `<div class="fillh" style="left:${ox + x2 - 4}px;top:${oy + y2 - 4}px"></div>`; }
    if (G.drag && G.drag.fillTo){ const t = G.drag.fillTo; h += `<div class="fillr" style="left:${ox + colLeft[t.c1]}px;top:${oy + rowTop[t.r1]}px;width:${colLeft[Math.min(t.c2 + 1, NC)] - colLeft[t.c1]}px;height:${rowTop[Math.min(t.r2 + 1, NR)] - rowTop[t.r1]}px"></div>`; }
    if (G.clip && G.clip.sheetId === s.id && G.clip.show){ const c = G.clip.g; h += `<div class="ants" style="left:${ox + colLeft[c.c1]}px;top:${oy + rowTop[c.r1]}px;width:${colLeft[Math.min(c.c2 + 1, NC)] - colLeft[c.c1]}px;height:${rowTop[Math.min(c.r2 + 1, NR)] - rowTop[c.r1]}px"></div>`; }
    if (G.edit && G.edit.refs) G.edit.refs.forEach((rf, i) => { if (rf.sheet && rf.sheet !== s.id) return; h += `<div class="refbox" style="--rc:${REFC[i % REFC.length]};left:${ox + colLeft[rf.g.c1]}px;top:${oy + rowTop[rf.g.r1]}px;width:${colLeft[Math.min(rf.g.c2 + 1, NC)] - colLeft[rf.g.c1]}px;height:${rowTop[Math.min(rf.g.r2 + 1, NR)] - rowTop[rf.g.r1]}px"></div>`; });
    return h;
  }
  const REFC = ['#2F6FDE', '#D9480F', '#7B2FBE', '#1E8A4C', '#C2255C', '#0B7285'];
  function render(){
    if (!G.sh) return; if (geoDirty) geometry(); const v = sc(); const s = G.sh; const fr = s.freeze.r, fc = s.freeze.c;
    const FH = rowTop[fr], FW = colLeft[fc];
    const top = v.scrollTop, left = v.scrollLeft, Hh = v.clientHeight, Ww = v.clientWidth;
    if (top + Hh * 1.5 > hh() + rowTop[NR] && NR < MAXR){ NR += 300; geoDirty = true; return draw(); }
    if (left + Ww * 1.5 > hw() + colLeft[NC] && NC < MAXC){ NC += 20; geoDirty = true; return draw(); }
    const r0 = Math.max(fr, rowAt(Math.max(0, top + FH))), r1 = rowAt(top + Hh), c0 = Math.max(fc, colAt(Math.max(0, left + FW))), c1 = colAt(left + Ww);
    const main = $('#gmain'); main.innerHTML = cellsHTML(r0, r1, c0, c1, false) + `<div class="sel">${selHTML()}</div>`;
    $('#stkTop').innerHTML = (fr ? cellsHTML(0, fr - 1, c0, c1, true) + `<div class="sel">${selHTML()}</div>` : '') + headersHTML(0, -1, c0, c1, 'cols');
    $('#stkLeft').innerHTML = (fc ? cellsHTML(r0, r1, 0, fc - 1, true) + `<div class="sel">${selHTML()}</div>` : '') + headersHTML(r0, r1, 0, -1, 'rows');
    $('#stkCorner').innerHTML = (fr && fc ? cellsHTML(0, fr - 1, 0, fc - 1, true) + `<div class="sel">${selHTML()}</div>` : '') + headersHTML(0, fr - 1, 0, fc - 1) + `<div class="corner" style="width:${hw()}px;height:${hh()}px" title="Select all"></div>`;
    $('#stkTop').querySelectorAll('.sel').forEach(n => n.style.cssText = `position:absolute;left:0;top:0;clip-path:inset(${hh()}px 0 0 0)`);
    if (!s.grid) $('#gspace').classList.add('nogrid'); else $('#gspace').classList.remove('nogrid');
    $('#gspace').classList.toggle('noheads', s.headings === false);
    Objects.render(); placeEditor(); if (G.onRender) G.onRender(); for (const f of (G.renderHooks || [])) try { f(); } catch(e){ console.error(e); }
  }
  /* ---------------------------------------------------------------- selection */
  function select(r, c, g, keepEdit){ if (G.edit && !keepEdit) commitEdit(); r = Math.max(0, Math.min(MAXR - 1, r)); c = Math.max(0, Math.min(MAXC - 1, c)); const m = mergeAt(G.sh, r, c); let gg = g ? norm(g) : m ? {...m} : {r1: r, c1: c, r2: r, c2: c};
    gg = expandMerges(gg); G.sel = {r, c, g: gg}; G.objSel = null; draw(); if (G.onSel) G.onSel(); }
  function expandMerges(g){ let changed = true; while (changed){ changed = false; for (const m of G.sh.merges){ if (m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1 && (m.r1 < g.r1 || m.r2 > g.r2 || m.c1 < g.c1 || m.c2 > g.c2)){ g = {r1: Math.min(g.r1, m.r1), c1: Math.min(g.c1, m.c1), r2: Math.max(g.r2, m.r2), c2: Math.max(g.c2, m.c2)}; changed = true; } } } return g; }
  function scrollTo(r, c){ const v = sc(); const s = G.sh; const FH = hh() + rowTop[s.freeze.r], FW = hw() + colLeft[s.freeze.c]; if (r >= NR || c >= NC){ NR = Math.max(NR, r + 50); NC = Math.max(NC, c + 10); geometry(); }
    if (r >= s.freeze.r){ const y = hh() + rowTop[r], y2 = hh() + rowTop[r + 1]; if (y - v.scrollTop < FH) v.scrollTop = y - FH; else if (y2 - v.scrollTop > v.clientHeight) v.scrollTop = y2 - v.clientHeight; }
    if (c >= s.freeze.c){ const x = hw() + colLeft[c], x2 = hw() + colLeft[c + 1]; if (x - v.scrollLeft < FW) v.scrollLeft = x - FW; else if (x2 - v.scrollLeft > v.clientWidth) v.scrollLeft = Math.min(x, x2 - v.clientWidth); } }
  function move(dr, dc, extend, jump){
    const s = G.sh; let {r, c} = G.sel; let tr = extend ? (G.sel.ext ? G.sel.ext.r : r) : r, tc = extend ? (G.sel.ext ? G.sel.ext.c : c) : c;
    if (jump){ const has = (rr, cc) => { const v = cellAt(s, rr, cc); return v && (v.v != null || v.f != null); }; const {R, C} = Calc.lastRC(s);
      const step = () => { tr += dr; tc += dc; }; const inb = () => tr >= 0 && tc >= 0 && tr <= Math.max(R, tr) && tr < MAXR && tc < MAXC;
      if (has(tr, tc) && has(tr + dr, tc + dc)){ while (inb() && has(tr + dr, tc + dc) && tr + dr >= 0 && tc + dc >= 0) step(); }
      else { step(); while (inb() && !has(tr, tc) && tr >= 0 && tc >= 0 && tr <= R && tc <= C) step(); if (tr > R || tc > C || tr < 0 || tc < 0){ tr = Math.max(0, Math.min(tr, dr > 0 ? R : tr)); tc = Math.max(0, Math.min(tc, dc > 0 ? C : tc)); if (dr > 0 && !has(tr, tc)) tr = MAXR - 1 > R ? Math.max(R, G.sel.r) : tr; } }
      tr = Math.max(0, tr); tc = Math.max(0, tc); }
    else { do { tr += dr; } while (dr && tr > 0 && tr < MAXR && rh(tr) === 0 && tr < NR); do { tc += dc; } while (dc && tc > 0 && cw(tc) === 0 && tc < NC); }
    tr = Math.max(0, Math.min(MAXR - 1, tr)); tc = Math.max(0, Math.min(MAXC - 1, tc));
    if (extend){ const g = expandMerges(norm({r1: G.sel.r, c1: G.sel.c, r2: tr, c2: tc})); G.sel = {r: G.sel.r, c: G.sel.c, g, ext: {r: tr, c: tc}}; draw(); if (G.onSel) G.onSel(); }
    else { const m = mergeAt(s, tr, tc); if (m && !(dr === 0 && dc === 0)){ if (dr > 0) tr = m.r2 >= G.sel.r && G.sel.r >= m.r1 ? m.r2 + 1 : m.r1; if (dc > 0) tc = m.c2 >= G.sel.c && G.sel.c >= m.c1 ? m.c2 + 1 : m.c1; if (dr < 0) tr = m.r1; if (dc < 0) tc = m.c1; } select(tr, tc); }
    scrollTo(tr, tc);
  }
  /* ---------------------------------------------------------------- editing */
  function startEdit(initial, mode){
    if (G.edit) return; const {r, c} = G.sel; const s = G.sh;
    const ed = $('#cellEd'); const own = cellAt(s, r, c); const spilled = !(own && (own.f != null || own.v != null)) && Calc.spillInfo(s, r, c); const txt = initial != null ? initial : spilled ? '' : editText(s, r, c);
    G.edit = {r, c, sheetId: s.id, mode: mode || (initial != null ? 'enter' : 'edit'), orig: spilled ? '' : editText(s, r, c)};
    ed.value = txt; ed.hidden = false; const st = styleAt(s, r, c) || {}; ed.style.font = `${st.i ? 'italic ' : ''}${st.b ? '700 ' : ''}${((st.size || 11) * 4 / 3 * z()).toFixed(1)}px ${fontCss(st.font)}`; ed.style.textAlign = st.ha === 'center' ? 'center' : st.ha === 'right' ? 'right' : 'left';
    placeEditor(); ed.focus({preventScroll: true}); const L = ed.value.length; ed.setSelectionRange(L, L); $('#fbar').value = ed.value; syncRefs(); draw(); if (G.onEdit) G.onEdit(true);
  }
  function placeEditor(){ const ed = $('#cellEd'); if (!G.edit){ ed.hidden = true; return; } const s = G.sh; const v = sc(), wrap = $('#gridwrap'); const {r, c} = G.edit; const bx = cellBox(r, c);
    const FH = hh() + rowTop[s.freeze.r], FW = hw() + colLeft[s.freeze.c]; let x = hw() + bx.x - (c >= s.freeze.c ? v.scrollLeft : 0), y = hh() + bx.y - (r >= s.freeze.r ? v.scrollTop : 0);
    ed.style.left = x + 'px'; ed.style.top = y + 'px'; ed.style.minWidth = bx.w + 'px'; ed.style.minHeight = bx.h + 'px'; ed.style.height = bx.h + 'px';
    const meas = measure(ed.value || ' ', ed.style.font) + 16; ed.style.width = Math.min(Math.max(bx.w, meas), v.clientWidth - x + v.getBoundingClientRect().left - wrap.getBoundingClientRect().left - 4) + 'px';
    ed.style.height = 'auto'; ed.style.height = Math.max(bx.h, ed.scrollHeight) + 'px'; }
  function commitEdit(move){
    if (!G.edit) return; const ed = $('#cellEd'); const val = (document.activeElement === $('#fbar') ? $('#fbar').value : ed.value); const {r, c, orig} = G.edit; const s = G.sh;
    G.edit = null; ed.hidden = true; ed.blur(); if (G.onEdit) G.onEdit(false);
    if (val !== orig){
      const dv = dvAt(r, c); if (dv && !dvValid(dv, val)){ G.edit = null; draw(); if (G.onInvalid) G.onInvalid(dv, r, c, val); return; }
      tx(s, 'Typing', () => { inputCell(s, r, c, val); autoFitRowIfWrap(r); });
      if (G.onChange) G.onChange();
    }
    hideAuto(); draw();
  }
  function cancelEdit(){ if (!G.edit) return; G.edit = null; const ed = $('#cellEd'); ed.hidden = true; ed.blur(); $('#fbar').value = editText(G.sh, G.sel.r, G.sel.c); hideAuto(); if (G.onEdit) G.onEdit(false); draw(); }
  function autoFitRowIfWrap(r, sh0){ const s = sh0 || G.sh; let need = 0; for (let c = 0, n = sh0 ? Calc.lastRC(s).C + 1 : NC; c < n; c++){ const st = styleAt(s, r, c); if (!st || !(st.wrap || st.size > 11)) continue; const d = displayAt(s, r, c); if (!d.text) continue; if (!st.wrap){ need = Math.max(need, st.size * 4 / 3 * 1.32 + 5); continue; } const w = (s.colW[c] ?? DEF_W) - 6; const font = `${st.b ? '700 ' : ''}${((st.size || 11) * 4 / 3).toFixed(1)}px ${fontCss(st.font)}`; const lines = d.text.split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(measure(ln, font) / w)), 0); need = Math.max(need, lines * (st.size || 11) * 4 / 3 * 1.25 + 6); }
    if (need > (s.rowH[r] ?? DEF_H)) s.rowH[r] = Math.ceil(need); geoDirty = true; }
  /* formula editing: highlight referenced ranges, point-and-click references, function suggestions */
  function syncRefs(){ if (!G.edit) return; const t = $('#cellEd').value; if (!t.startsWith('=')){ G.edit.refs = null; hideAuto(); return; }
    G.edit.refs = Formula.refsIn(t.slice(1)).map(rf => { const sh = rf.sheet ? Calc.sheetOf(rf.sheet) : G.sh; if (!sh) return null; const b = rf.b || rf.a; if (rf.kind !== 'cell') return null; return {sheet: sh.id, g: norm({r1: rf.a.r, c1: rf.a.c, r2: b.r, c2: b.c})}; }).filter(Boolean); suggest(); }
  function canPoint(){ if (!G.edit) return false; const ed = document.activeElement === $('#fbar') ? $('#fbar') : $('#cellEd'); const t = ed.value; if (!t.startsWith('=')) return false; const i = ed.selectionStart; const before = t.slice(0, i).trimEnd(); return /[=(,+\-*\/^&<>:;]$/.test(before) || (G.ptRef && G.ptRef.end === i); }
  function insertRef(g, sheet){ const ed = document.activeElement === $('#fbar') ? $('#fbar') : $('#cellEd'); const t = ed.value; let i = ed.selectionStart, j = ed.selectionEnd;
    if (G.ptRef && G.ptRef.end === i){ i = G.ptRef.start; } const pre = sheet && G.edit.sheetId && sheet.id !== G.edit.sheetId ? quoteSheet(sheet.name) + '!' : '';
    const ref = pre + rangeAddr(g); ed.value = t.slice(0, i) + ref + t.slice(j); const e = i + ref.length; ed.setSelectionRange(e, e); G.ptRef = {start: i, end: e}; $('#cellEd').value = ed.value; $('#fbar').value = ed.value; syncRefs(); draw(); }
  function toggleAbs(){ const ed = document.activeElement === $('#fbar') ? $('#fbar') : $('#cellEd'); const t = ed.value; const i = ed.selectionStart; const toks = Formula.tokenize(t.slice(1)); for (const k of toks){ if (k.type !== 'ref' || k.kind !== 'cell') continue; const s = k.start + 1, e = s + k.text.length; if (i < s || i > e) continue;
      const cyc = x => { const st = (x.ar ? 1 : 0) + (x.ac ? 2 : 0); const n = {0: 3, 3: 1, 1: 2, 2: 0}[st]; return {...x, ar: !!(n & 1), ac: !!(n & 2)}; }; const cell = x => (x.ac ? '$' : '') + colName(x.c) + (x.ar ? '$' : '') + (x.r + 1);
      const a = cyc(k.a), b = k.b ? cyc(k.b) : null; const nt = k.text.slice(0, k.plen || 0) + cell(a) + (b ? ':' + cell(b) : ''); ed.value = t.slice(0, s) + nt + t.slice(e); ed.setSelectionRange(s + nt.length, s + nt.length); $('#cellEd').value = ed.value; $('#fbar').value = ed.value; syncRefs(); draw(); return; } }
  function suggest(){ const ed = document.activeElement === $('#fbar') ? $('#fbar') : $('#cellEd'); const t = ed.value.slice(0, ed.selectionStart); const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(t); const box = $('#autoBox');
    if (!t.startsWith('=') || !m || /[A-Za-z]\d+$/.test(m[1]) && !/^[A-Za-z]+\.$/.test(m[1])){ const fm = /([A-Z][A-Z0-9.]*)\(([^()]*)$/i.exec(t); if (fm && Formula.HELP[fm[1].toUpperCase()]){ const [args, desc] = Formula.HELP[fm[1].toUpperCase()].split('|'); const k = (fm[2].match(/,/g) || []).length; const parts = args.split(', '); box.innerHTML = `<div class="hint"><b>${fm[1].toUpperCase()}</b>(${parts.map((p, i) => i === Math.min(k, parts.length - 1) ? `<u>${esc(p)}</u>` : esc(p)).join(', ')})<br><small>${esc(desc)}</small></div>`; box.hidden = false; posAuto(ed); } else hideAuto(); return; }
    const pre = m[1].toUpperCase(); const list = Object.keys(Formula.FN).filter(n => n.startsWith(pre) && !['TRUE', 'FALSE'].includes(n)).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 8);
    if (!list.length){ hideAuto(); return; } box.innerHTML = list.map((n, i) => `<button type="button" class="ai${i === 0 ? ' on' : ''}" data-fn="${n}"><b>${n}</b><small>${esc((Formula.HELP[n] || '|').split('|')[1] || '')}</small></button>`).join(''); box.hidden = false; posAuto(ed); G.auto = {list, start: ed.selectionStart - m[1].length, ed}; }
  function posAuto(ed){ const box = $('#autoBox'); const r = ed.getBoundingClientRect(); const wr = $('#editView').getBoundingClientRect(); box.style.left = Math.max(4, Math.min(r.left - wr.left, wr.width - 290)) + 'px'; box.style.top = (r.bottom - wr.top + 2) + 'px'; }
  function hideAuto(){ $('#autoBox').hidden = true; G.auto = null; }
  function pickAuto(n){ const a = G.auto; if (!a) return; const ed = a.ed; const t = ed.value; const end = ed.selectionStart; ed.value = t.slice(0, a.start) + n + '(' + t.slice(end); const p = a.start + n.length + 1; ed.setSelectionRange(p, p); $('#cellEd').value = ed.value; $('#fbar').value = ed.value; ed.focus(); hideAuto(); syncRefs(); suggest(); placeEditor(); draw(); }

  /* ---------------------------------------------------------------- data validation */
  function dvAt(r, c){ return G.sh.dv.find(d => inRange(d.range, r, c)) || null; }
  function dvList(d){ if (d.list && /^=/.test(d.list)){ const v = Calc.evalIn(G.sh, d.list.slice(1)); return Formula.isRange(v) ? Formula.isRange(v) && [...Array(v.rows).keys()].flatMap(i => [...Array(v.cols).keys()].map(j => Calc.get(v.sheet, v.r1 + i, v.c1 + j))).filter(x => x != null && x !== '').map(String) : [String(v)]; } return String(d.list || '').split(',').map(s => s.trim()).filter(Boolean); }
  function dvValid(d, text){ if (text === '' ) return true; const p = parseInput(text); if (p.f != null) return true;
    if (d.type === 'list') return dvList(d).some(x => x.toLowerCase() === String(text).toLowerCase());
    if (d.type === 'whole' || d.type === 'decimal'){ if (typeof p.v !== 'number' || (d.type === 'whole' && p.v % 1)) return false; }
    if (d.type === 'date' && typeof p.v !== 'number') return false; if (d.type === 'length'){ const L = String(text).length; return d.op === 'between' ? L >= +d.min && L <= +d.max : L <= +d.max; }
    if (['whole', 'decimal', 'date'].includes(d.type)){ const n = p.v, a = parseInput(String(d.min)).v, b = parseInput(String(d.max)).v; return ({between: n >= a && n <= b, gte: n >= a, lte: n <= b, eq: n === a})[d.op || 'between']; }
    return true; }

  /* ---------------------------------------------------------------- pointer */
  let drag = null;
  function onDown(e){
    if (e.button > 0) return; const t = e.target;
    if (t.closest('.slb')){ e.preventDefault(); e.stopPropagation(); if (G.onSlicer) G.onSlicer(t.closest('.slb')); return; }
    if (t.closest('.olb')){ e.preventDefault(); e.stopPropagation(); const [ax, i] = t.closest('.olb').dataset.ol.split(':'); if (G.onOutline) G.onOutline(ax, +i); return; }
    if (t.closest('.fbtn')){ e.preventDefault(); if (G.onFilterBtn) G.onFilterBtn(+t.closest('.fbtn').dataset.fc, t.closest('.fbtn')); return; }
    if (t.closest('.dvbtn')){ e.preventDefault(); if (G.onDvBtn) G.onDvBtn(t.closest('.dvbtn')); return; }
    if (t.closest('.obj')){ Objects.down(e); return; }
    if (t.classList.contains('corner')){ e.preventDefault(); select(0, 0, {r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1}); return; }
    const touch = e.pointerType !== 'mouse';
    if (t.classList.contains('rs')){ e.preventDefault(); const isCol = t.dataset.rc != null; const i = +(isCol ? t.dataset.rc : t.dataset.rr); drag = {mode: isCol ? 'colsize' : 'rowsize', i, start: isCol ? e.clientX : e.clientY, size: isCol ? (G.sh.colW[i] ?? DEF_W) : (G.sh.rowH[i] ?? DEF_H), multi: isCol ? (G.sel.g.c1 <= i && i <= G.sel.g.c2 && G.sel.g.r2 >= MAXR - 1) : (G.sel.g.r1 <= i && i <= G.sel.g.r2 && G.sel.g.c2 >= MAXC - 1)}; capture(e); return; }
    if (t.classList.contains('hdlT') || t.classList.contains('fillh')){ e.preventDefault(); e.stopPropagation(); const fill = t.classList.contains('fillh') || G.fill; drag = {mode: fill ? 'fill' : (t.dataset.h === 'tl' ? 'hdlTL' : 'hdlBR'), anchor: {...G.sel.g}}; capture(e); return; }
    const p = cellFromClient(e.clientX, e.clientY);
    if (p.inHdrC && !p.inHdrR){ e.preventDefault(); if (G.edit && canPoint()){ insertRef({r1: 0, c1: p.c, r2: MAXR - 1, c2: p.c}); return; } const c0 = e.shiftKey ? G.sel.c : p.c; select(0, c0, {r1: 0, c1: Math.min(c0, p.c), r2: MAXR - 1, c2: Math.max(c0, p.c)}); G.sel.r = G.sh.freeze.r ? 0 : 0; drag = {mode: 'cols', a: c0}; capture(e); if (G.onHeader) G.onHeader('col', e); return; }
    if (p.inHdrR && !p.inHdrC){ e.preventDefault(); if (G.edit && canPoint()){ insertRef({r1: p.r, c1: 0, r2: p.r, c2: MAXC - 1}); return; } const r0 = e.shiftKey ? G.sel.r : p.r; select(r0, 0, {r1: Math.min(r0, p.r), c1: 0, r2: Math.max(r0, p.r), c2: MAXC - 1}); drag = {mode: 'rows', a: r0}; capture(e); if (G.onHeader) G.onHeader('row', e); return; }
    if (G.edit && canPoint()){ e.preventDefault(); insertRef({r1: p.r, c1: p.c, r2: p.r, c2: p.c}, G.sh); drag = {mode: 'point', a: p}; capture(e); return; }
    if (G.painter){ e.preventDefault(); drag = {mode: 'paint', a: p}; select(p.r, p.c); capture(e); return; }
    if (touch){ drag = {mode: 'tap', p, x: e.clientX, y: e.clientY, t: Date.now(), wasSel: G.sel.r === p.r && G.sel.c === p.c && !G.edit && G.sel.g.r1 === G.sel.g.r2 && G.sel.g.c1 === G.sel.g.c2 || (mergeAt(G.sh, p.r, p.c) && G.sel.g.r1 === (mergeAt(G.sh, p.r, p.c) || {}).r1 && G.sel.g.c1 === (mergeAt(G.sh, p.r, p.c) || {}).c1)}; drag.lp = setTimeout(() => { if (drag && drag.mode === 'tap'){ const inSel = inRange(G.sel.g, p.r, p.c); if (!inSel) select(p.r, p.c); drag = null; if (G.onContext) G.onContext(e.clientX, e.clientY); } }, 550); return; }
    e.preventDefault(); if (G.edit) commitEdit();
    if (e.shiftKey){ select(G.sel.r, G.sel.c, {r1: G.sel.r, c1: G.sel.c, r2: p.r, c2: p.c}); }
    else { const was = G.sel.r === p.r && G.sel.c === p.c; select(p.r, p.c); drag = {mode: 'sel', a: {r: p.r, c: p.c}, was}; capture(e); }
  }
  function capture(e){ try { sc().setPointerCapture(e.pointerId); } catch(_){} }
  let auto = null;
  function edgeScroll(e){ const v = sc(), b = v.getBoundingClientRect(); let dx = 0, dy = 0; if (e.clientY > b.bottom - 24) dy = 18; else if (e.clientY < b.top + hh() + 10) dy = -18; if (e.clientX > b.right - 24) dx = 18; else if (e.clientX < b.left + hw() + 10) dx = -18; clearInterval(auto); if (dx || dy){ auto = setInterval(() => { v.scrollTop += dy; v.scrollLeft += dx; }, 40); } }
  function onMove(e){
    if (!drag) return; const p = () => cellFromClient(e.clientX, e.clientY);
    if (drag.mode === 'tap'){ if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10){ clearTimeout(drag.lp); drag = null; } return; }
    if (drag.mode === 'colsize' || drag.mode === 'rowsize'){ const d = ((drag.mode === 'colsize' ? e.clientX : e.clientY) - drag.start) / z(); const n = Math.max(drag.mode === 'colsize' ? 4 : 6, Math.round(drag.size + d)); drag.n = n; const s = G.sh;
      if (drag.mode === 'colsize') s.colW[drag.i] = n; else s.rowH[drag.i] = n; geoDirty = true; draw(); return; }
    edgeScroll(e); const q = p();
    if (drag.mode === 'sel' || drag.mode === 'paint'){ const g = expandMerges(norm({r1: drag.a.r, c1: drag.a.c, r2: q.r, c2: q.c})); G.sel = {r: drag.a.r, c: drag.a.c, g}; draw(); if (G.onSel) G.onSel(); }
    else if (drag.mode === 'cols'){ G.sel.g = {r1: 0, r2: MAXR - 1, c1: Math.min(drag.a, q.c), c2: Math.max(drag.a, q.c)}; draw(); if (G.onSel) G.onSel(); }
    else if (drag.mode === 'rows'){ G.sel.g = {c1: 0, c2: MAXC - 1, r1: Math.min(drag.a, q.r), r2: Math.max(drag.a, q.r)}; draw(); if (G.onSel) G.onSel(); }
    else if (drag.mode === 'hdlBR'){ const a = drag.anchor; G.sel.g = expandMerges(norm({r1: a.r1, c1: a.c1, r2: q.r, c2: q.c})); draw(); if (G.onSel) G.onSel(); }
    else if (drag.mode === 'hdlTL'){ const a = drag.anchor; G.sel.g = expandMerges(norm({r1: q.r, c1: q.c, r2: a.r2, c2: a.c2})); G.sel.r = G.sel.g.r1; G.sel.c = G.sel.g.c1; draw(); if (G.onSel) G.onSel(); }
    else if (drag.mode === 'fill'){ const a = drag.anchor; const dr = q.r > a.r2 ? q.r - a.r2 : q.r < a.r1 ? q.r - a.r1 : 0, dc = q.c > a.c2 ? q.c - a.c2 : q.c < a.c1 ? q.c - a.c1 : 0; let t = {...a};
      if (Math.abs(dr) >= Math.abs(dc) && dr){ if (dr > 0) t.r2 = q.r; else t.r1 = q.r; } else if (dc){ if (dc > 0) t.c2 = q.c; else t.c1 = q.c; } G.drag = {fillTo: t}; drag.to = t; draw(); }
    else if (drag.mode === 'point'){ const g = norm({r1: drag.a.r, c1: drag.a.c, r2: q.r, c2: q.c}); insertRef(g, G.sh); }
  }
  function onUp(e){
    clearInterval(auto); if (!drag) return; const d = drag; drag = null; G.drag = null;
    if (d.mode === 'tap'){ clearTimeout(d.lp); const q = cellFromClient(e.clientX, e.clientY); if (G.edit && canPoint()){ insertRef({r1: q.r, c1: q.c, r2: q.r, c2: q.c}, G.sh); return; }
      if (d.wasSel && Date.now() - d.t < 450){ if (G.onTapSelected) G.onTapSelected(e.clientX, e.clientY); else Grid.startEdit(); return; } if (G.edit) commitEdit(); select(q.r, q.c); if (G.onTapCell) G.onTapCell(q.r, q.c); return; }
    if (d.mode === 'colsize' || d.mode === 'rowsize'){ const s = G.sh; if (d.n == null) return; tx(s, 'Size', () => { const idx = d.multi ? (d.mode === 'colsize' ? range(G.sel.g.c1, G.sel.g.c2) : range(G.sel.g.r1, G.sel.g.r2)) : [d.i]; for (const i of idx){ if (d.mode === 'colsize') s.colW[i] = d.n; else s.rowH[i] = d.n; } }, true); geoDirty = true; draw(); if (G.onChange) G.onChange(); return; }
    if (d.mode === 'fill' && d.to){ const s = G.sh; const a = d.anchor, t = d.to; if (t.r1 < a.r1 || t.r2 > a.r2 || t.c1 < a.c1 || t.c2 > a.c2){ tx(s, 'Fill', () => fillSeries(s, a, t)); G.sel.g = t; G.fill = false; geoDirty = true; draw(); if (G.onChange) G.onChange(); } else if (t.r2 < a.r2 || t.c2 < a.c2){ tx(s, 'Clear', () => clearRange(s, t.r2 < a.r2 ? {r1: t.r2 + 1, c1: a.c1, r2: a.r2, c2: a.c2} : {r1: a.r1, c1: t.c2 + 1, r2: a.r2, c2: a.c2}, 'contents')); G.sel.g = t; draw(); if (G.onChange) G.onChange(); } return; }
    if (d.mode === 'paint'){ if (G.onPaint) G.onPaint(G.sel.g); return; }
    if (d.mode === 'sel' && d.was && e.pointerType === 'mouse' && G.sel.g.r1 === G.sel.g.r2 && G.sel.g.c1 === G.sel.g.c2 && e.detail >= 2) Grid.startEdit();
    if (d.mode === 'point'){ G.ptRef = G.ptRef; return; }
  }
  const range = (a, b) => Array.from({length: b - a + 1}, (_, i) => a + i);
  function onDbl(e){ const t = e.target; if (t.classList.contains('rs')){ const isCol = t.dataset.rc != null; const i = +(isCol ? t.dataset.rc : t.dataset.rr); if (isCol) autoFitCols(G.sel.g.c1 <= i && i <= G.sel.g.c2 && G.sel.g.r2 >= MAXR - 1 ? range(G.sel.g.c1, G.sel.g.c2) : [i]); else autoFitRows([i]); return; }
    if (t.closest('.obj') || G.edit) return; const p = cellFromClient(e.clientX, e.clientY); if (p.inHdrC || p.inHdrR) return; select(p.r, p.c); Grid.startEdit(); }
  function autoFitCols(cols){ const s = G.sh; tx(s, 'AutoFit', () => { const {R} = Calc.lastRC(s); for (const c of cols){ let w = 20; for (let r = 0; r <= R; r++){ const x = cellAt(s, r, c); if (!x || mergeAt(s, r, c)) continue; const st = x.s || {}; const t = displayAt(s, r, c, G.showF).text; if (!t) continue; w = Math.max(w, measure(t, `${st.b ? '700 ' : ''}${((st.size || 11) * 4 / 3).toFixed(1)}px ${fontCss(st.font)}`) + 12); } s.colW[c] = Math.min(600, Math.ceil(w)); } }, true); geoDirty = true; draw(); if (G.onChange) G.onChange(); }
  function autoFitRows(rows){ const s = G.sh; tx(s, 'AutoFit', () => { for (const r of rows){ delete s.rowH[r]; autoFitRowIfWrap(r); } }, true); geoDirty = true; draw(); if (G.onChange) G.onChange(); }

  /* ---------------------------------------------------------------- open */
  let wired = false;
  function wire(){ if (wired) return; wired = true; const v = sc();
    v.addEventListener('scroll', () => { draw(); }, {passive: true});
    v.addEventListener('pointerdown', onDown); v.addEventListener('pointermove', onMove); v.addEventListener('pointerup', onUp); v.addEventListener('pointercancel', e => { if (drag && drag.lp) clearTimeout(drag.lp); drag = null; clearInterval(auto); });
    v.addEventListener('dblclick', onDbl); v.addEventListener('contextmenu', e => { e.preventDefault(); const p = cellFromClient(e.clientX, e.clientY); if (!inRange(G.sel.g, p.r, p.c) && !p.inHdrC && !p.inHdrR) select(p.r, p.c); if (G.onContext) G.onContext(e.clientX, e.clientY); });
    const ed = $('#cellEd'); ed.addEventListener('input', () => { $('#fbar').value = ed.value; G.ptRef = null; syncRefs(); placeEditor(); draw(); });
    ed.addEventListener('keyup', () => { if (G.edit) suggest(); }); ed.addEventListener('click', () => { G.ptRef = null; if (G.edit) suggest(); });
    $('#autoBox').addEventListener('pointerdown', e => { const b = e.target.closest('.ai'); if (b){ e.preventDefault(); pickAuto(b.dataset.fn); } });
    addEventListener('resize', () => { geoDirty = true; draw(); });
  }
  function open(wb){ wire(); G.wb = wb; G.sh = wb.sheets[wb.active] || wb.sheets[0]; Calc.attach(wb); NR = 200; NC = 30; geoDirty = true; const v = sc(); v.scrollTop = 0; v.scrollLeft = 0; G.sel = G.sh.sel || {r: 0, c: 0, g: {r1: 0, c1: 0, r2: 0, c2: 0}}; render(); if (G.onSel) G.onSel(); }
  function showSheet(i){ if (G.edit) commitEdit(); G.sh.sel = G.sel; G.wb.active = i; G.sh = G.wb.sheets[i]; NR = 200; NC = 30; geoDirty = true; const v = sc(); v.scrollTop = 0; v.scrollLeft = 0; G.sel = G.sh.sel || {r: 0, c: 0, g: {r1: 0, c1: 0, r2: 0, c2: 0}}; Objects.deselect(); render(); if (G.onSel) G.onSel(); }
  function refresh(geo){ if (geo !== false) geoDirty = true; draw(); }
  return {G, open, showSheet, refresh, render, select, move, startEdit, commitEdit, cancelEdit, placeEditor, scrollTo, toggleAbs, pickAuto, hideAuto, syncRefs, suggest, dvAt, dvList, autoFitCols, autoFitRows, autoFitRowIfWrap, cellBox, hw, hh, get rowTop(){ return rowTop; }, get colLeft(){ return colLeft; }, get NR(){ return NR; }, get NC(){ return NC; }, cellFromClient, measure, z};
})();
const FONT_CSS = {'Calibri': "Calibri, Carlito, 'Segoe UI', Roboto, sans-serif", 'Arial': "Arial, Arimo, Roboto, sans-serif", 'Times New Roman': "'Times New Roman', Tinos, 'Noto Serif', serif", 'Cambria': "Cambria, Caladea, 'Noto Serif', serif", 'Courier New': "'Courier New', Cousine, monospace", 'Georgia': "Georgia, Gelasio, serif", 'Verdana': "Verdana, 'Noto Sans', sans-serif", 'Segoe UI': "'Segoe UI', 'Open Sans', Roboto, sans-serif", 'Aptos': "Aptos, 'Segoe UI', Roboto, sans-serif", 'Aptos Narrow': "'Aptos Narrow', 'Arial Narrow', 'Archivo Narrow', Roboto, sans-serif", 'Tahoma': "Tahoma, 'PT Sans', sans-serif", 'Trebuchet MS': "'Trebuchet MS', 'Fira Sans', sans-serif", 'Garamond': "Garamond, 'EB Garamond', serif", 'Century Gothic': "'Century Gothic', 'Didact Gothic', sans-serif", 'Noto Sans Tamil': "'Noto Sans Tamil', sans-serif"};
const fontCss = n => FONT_CSS[n || 'Calibri'] || `'${String(n).replace(/'/g, '')}', Roboto, sans-serif`;
