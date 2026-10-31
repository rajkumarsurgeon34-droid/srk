/* SRK Sheets — .xlsx read/write (ExcelJS + charts written by hand), CSV */
'use strict';
const XIO = (() => {
  const EMU = 9525; // per pixel
  const PX_W = chars => Math.round(chars * 7 + 5), CH_W = px => Math.max(0.5, Math.round((px - 5) / 7 * 100) / 100);
  const OFFICE = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
  const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  let theme = OFFICE;
  function color(c){ if (!c) return null; if (c.argb){ const a = c.argb.length === 8 ? c.argb.slice(2) : c.argb; return '#' + a.toUpperCase(); }
    let base = null; if (c.theme != null) base = theme[c.theme] || null; else if (c.indexed != null) base = INDEXED[c.indexed] || null; if (!base) return null;
    let [r, g, b] = [0, 2, 4].map(i => parseInt(base.slice(i, i + 2), 16)); const t = c.tint || 0; if (t > 0){ r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; } else if (t < 0){ r *= 1 + t; g *= 1 + t; b *= 1 + t; }
    return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase(); }
  const argb = h => h ? 'FF' + h.replace('#', '').toUpperCase().slice(0, 6) : undefined;
  const dateSerial = d => (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  function readTheme(wb){ try { const xml = wb._themes && (wb._themes.theme1 || Object.values(wb._themes)[0]); if (!xml) return OFFICE; const doc = new DOMParser().parseFromString(xml, 'application/xml'); const cs = doc.getElementsByTagNameNS('*', 'clrScheme')[0]; if (!cs) return OFFICE;
      const get = n => { const el = [...cs.children].find(x => x.localName === n); if (!el) return null; const s = el.getElementsByTagNameNS('*', 'srgbClr')[0], y = el.getElementsByTagNameNS('*', 'sysClr')[0]; return s ? s.getAttribute('val') : y ? (y.getAttribute('lastClr') || '000000') : null; };
      return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map((n, i) => get(n) || OFFICE[i]); } catch(e){ return OFFICE; } }
  const HMAP = {left: 'left', center: 'center', right: 'right', justify: 'justify', fill: 'left', centerContinuous: 'center', distributed: 'center'}, VMAP = {top: 'top', middle: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle'};
  function styleIn(cell){
    const s = {}; const f = cell.font || {}; if (f.bold) s.b = true; if (f.italic) s.i = true; if (f.underline) s.u = true; if (f.strike) s.s = true; if (f.size && f.size !== 11) s.size = f.size; if (f.name && !/^(Calibri|Aptos Narrow)$/.test(f.name)) s.font = f.name; const fc = color(f.color); if (fc && fc !== '#000000') s.color = fc;
    const fl = cell.fill; if (fl && fl.type === 'pattern' && fl.pattern && fl.pattern !== 'none'){ const c = color(fl.fgColor) || color(fl.bgColor); if (c) s.fill = c; } else if (fl && fl.type === 'gradient' && fl.stops && fl.stops[0]) s.fill = color(fl.stops[0].color);
    const a = cell.alignment || {}; if (a.horizontal && a.horizontal !== 'general') s.ha = HMAP[a.horizontal] || 'left'; if (a.vertical && a.vertical !== 'bottom') s.va = VMAP[a.vertical] || 'bottom'; if (a.wrapText) s.wrap = true; if (a.indent) s.ind = a.indent;
    const bd = cell.border; if (bd){ const o = {}; for (const [k, sd] of [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']]){ const e = bd[k]; if (e && e.style) o[sd] = {style: e.style, color: color(e.color) || '#000000'}; } if (Object.keys(o).length) s.bd = o; }
    const nf = cell.numFmt; if (nf && nf !== 'General') s.nf = nf;
    return Object.keys(s).length ? s : null;
  }
  function styleOut(s){
    const o = {}; if (!s) return o;
    const font = {}; if (s.b) font.bold = true; if (s.i) font.italic = true; if (s.u) font.underline = true; if (s.s) font.strike = true; font.size = s.size || 11; font.name = s.font || 'Calibri'; if (s.color) font.color = {argb: argb(s.color)}; o.font = font;
    if (s.fill) o.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: argb(s.fill)}};
    const al = {}; if (s.ha) al.horizontal = s.ha; if (s.va) al.vertical = s.va; if (s.wrap) al.wrapText = true; if (s.ind) al.indent = s.ind; if (Object.keys(al).length) o.alignment = al;
    if (s.bd){ const b = {}; for (const [sd, k] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) if (s.bd[sd]) b[k] = {style: s.bd[sd].style || 'thin', color: {argb: argb(s.bd[sd].color || '#000000')}}; o.border = b; }
    if (s.nf) o.numFmt = s.nf; return o;
  }
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  /* ---------------------------------------------------------------- read .xlsx */
  /* ExcelJS reads validation one cell at a time: join equal rules back into rectangles */
  function mergeDv(list){ const groups = new Map(); for (const d of list){ const {range, ...rule} = d; const k = JSON.stringify(rule); if (!groups.has(k)) groups.set(k, {rule, gs: []}); groups.get(k).gs.push(range); }
    const out = []; for (const {rule, gs} of groups.values()){ const cells = new Set(); let big = []; for (const g of gs){ if ((g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 1) big.push(g); else cells.add(g.r1 + ',' + g.c1); }
      const byRow = new Map(); for (const k of cells){ const [r, c] = k.split(',').map(Number); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(c); }
      const runs = []; for (const [r, cs] of [...byRow].sort((a, b) => a[0] - b[0])){ cs.sort((a, b) => a - b); let s0 = cs[0], p = cs[0]; for (const c of cs.slice(1).concat([null])){ if (c === p + 1){ p = c; continue; } runs.push({r1: r, r2: r, c1: s0, c2: p}); s0 = p = c; } }
      const open = []; for (const g of runs){ const m = open.find(o => o.c1 === g.c1 && o.c2 === g.c2 && o.r2 === g.r1 - 1); if (m) m.r2 = g.r1; else open.push({...g}); }
      for (const g of [...big, ...open]) out.push({range: g, ...rule}); } return out; }
  async function readXlsx(buf, name){
    const head = new Uint8Array(buf.slice(0, 4)); if (head[0] === 0xD0 && head[1] === 0xCF) throw new Error('This is an old Excel 97–2003 (.xls) file. SRK Sheets opens .xlsx files. Open it in Excel or Google Sheets, save as .xlsx, then open that here.');
    const X = new ExcelJS.Workbook(); try { await X.xlsx.load(buf); } catch(e){ console.error(e); throw new Error('This file isn’t an Excel workbook (.xlsx), or it is damaged.'); }
    theme = readTheme(X); const wb = newWorkbook(name); wb.sheets = []; wb.media = {};
    X.eachSheet(ws => {
      const sh = newSheet(ws.name); if (ws.state && ws.state !== 'visible') sh.hiddenSheet = true; const tc = ws.properties && ws.properties.tabColor; if (tc) sh.tab = color(tc);
      const v = (ws.views || [])[0] || {}; if (v.state === 'frozen'){ sh.freeze = {r: v.ySplit || 0, c: v.xSplit || 0}; } if (v.showGridLines === false) sh.grid = false; if (v.zoomScale && v.zoomScale !== 100) sh.zoom = Math.max(.5, Math.min(2, v.zoomScale / 100));
      (ws._columns || []).forEach((col, i) => { if (!col) return; if (col.width != null && Math.abs(col.width - 8.43) > .05) sh.colW[i] = PX_W(col.width); if (col.hidden) sh.hidC[i] = 1; });
      ws.eachRow({includeEmpty: true}, (row, rn) => { const r = rn - 1; if (row.height != null && row.customHeight !== false && Math.abs(row.height - 15) > .1) sh.rowH[r] = Math.round(row.height * 4 / 3); if (row.hidden) sh.hidR[r] = 1;
        row.eachCell({includeEmpty: true}, (cell, cn) => { const c = cn - 1; if (cell.isMerged && cell.master !== cell) return; const x = {}; let val = cell.value;
          const st = styleIn(cell); if (st) x.s = st;
          if (val && typeof val === 'object' && !(val instanceof Date)){
            if (val.formula != null || val.sharedFormula != null){ let f = null; try { f = cell.formula; } catch(e){} if (!f && val.sharedFormula){ try { const m = ws.getCell(val.sharedFormula); const mf = m.formula || (m.value && m.value.formula); if (mf) f = Formula.shift(mf, r - (m.row - 1), c - (m.col - 1)); } catch(e){} } if (f) x.f = String(f).replace(/^=/, '').replace(/_xlfn\.|_xlws\./g, ''); else { const res = val.result; x.v = res instanceof Date ? dateSerial(res) : res && res.error ? err(res.error) : res ?? null; } }
            else if (val.richText) x.v = val.richText.map(t => t.text).join('');
            else if (val.hyperlink){ x.v = typeof val.text === 'object' && val.text && val.text.richText ? val.text.richText.map(t => t.text).join('') : val.text; sh.links[key(r, c)] = val.hyperlink; }
            else if (val.error) x.v = err(val.error); else if (val.text != null) x.v = String(val.text);
          } else if (val instanceof Date){ x.v = dateSerial(val); if (!x.s || !x.s.nf) x.s = {...(x.s || {}), nf: 'dd/mm/yyyy'}; }
          else if (val != null) x.v = val;
          if (x.v === undefined) delete x.v; if (x.v != null || x.f != null || x.s) sh.cells[key(r, c)] = x;
          const note = cell.note; if (note) sh.notes[key(r, c)] = typeof note === 'string' ? note : (note.texts || []).map(t => t.text).join('');
        }); });
      try { for (const m of (ws.model.merges || [])){ const g = parseRange(m); if (g) sh.merges.push(g); } } catch(e){}
      try { const dv = ws.dataValidations && ws.dataValidations.model || {}; for (const [ref, d] of Object.entries(dv)){ for (const part of ref.split(/\s+/)){ const g = parseRange(part); if (!g) continue; const f0 = (d.formulae || [])[0], f1 = (d.formulae || [])[1];
            if (d.type === 'list') sh.dv.push({range: g, type: 'list', list: /^"/.test(String(f0)) ? String(f0).slice(1, -1) : '=' + String(f0).replace(/^=/, '')});
            else if (['whole', 'decimal', 'date', 'textLength'].includes(d.type)) sh.dv.push({range: g, type: d.type === 'textLength' ? 'length' : d.type, op: ({between: 'between', greaterThanOrEqual: 'gte', lessThanOrEqual: 'lte', equal: 'eq'})[d.operator || 'between'] || 'between', min: f0 instanceof Date ? dateSerial(f0) : f0, max: f1 instanceof Date ? dateSerial(f1) : (f1 ?? f0)}); } } sh.dv = mergeDv(sh.dv); } catch(e){}
      try { for (const cf of (ws.conditionalFormattings || [])){ for (const part of String(cf.ref).split(/\s+/)){ const g = parseRange(part); if (!g) continue; for (const rule of cf.rules || []){ const r2 = cfIn(rule); if (r2) sh.cf.push({range: g, ...r2}); } } } } catch(e){}
      try { if (ws.autoFilter){ const g = parseRange(typeof ws.autoFilter === 'string' ? ws.autoFilter : ws.autoFilter.ref || ''); if (g) sh.filter = {range: g, cols: {}}; } } catch(e){}
      try { for (const t of Object.values(ws.tables || {})){ const tm = t.table || t.model || t; const g = parseRange(tm.tableRef || tm.ref || ''); if (!g) continue; const sn = ((tm.style && tm.style.theme) || '').match(/(\d+)$/); const n = sn ? +sn[1] : 2; sh.tables.push({name: tm.name || 'Table', range: g, style: (n - 1) % 7 === 0 ? 'navy' : TABLE_STYLES[(n - 1) % 7 - 1][0], header: tm.headerRow !== false, total: !!tm.totalsRow, banded: true}); } } catch(e){}
      try { for (const im of ws.getImages()){ const img = X.getImage(+im.imageId); if (!img || !img.buffer) continue; const ext = (img.extension || 'png').replace('jpg', 'jpeg'); let b = ''; const u = new Uint8Array(img.buffer); for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); const id = uid(); wb.media[id] = `data:image/${ext};base64,` + btoa(b);
          const tl = im.range.tl, br = im.range.br, ext2 = im.range.ext; const c0 = Math.floor(tl.nativeCol ?? tl.col), r0 = Math.floor(tl.nativeRow ?? tl.row); const dx = (tl.nativeColOff || 0) / EMU, dy = (tl.nativeRowOff || 0) / EMU;
          let w = ext2 && ext2.width, h = ext2 && ext2.height; if ((!w || !h) && br){ const span = (a, b2, sz) => { let s = 0; for (let i = a; i < b2; i++) s += sz(i); return s; }; w = span(c0, Math.floor(br.nativeCol ?? br.col), i => sh.colW[i] ?? DEF_W) + (br.nativeColOff || 0) / EMU - dx; h = span(r0, Math.floor(br.nativeRow ?? br.row), i => sh.rowH[i] ?? DEF_H) + (br.nativeRowOff || 0) / EMU - dy; }
          sh.images.push({id: uid(), src: 'm:' + id, r: r0, c: c0, dx, dy, w: Math.round(w || 200), h: Math.round(h || 150)}); } } catch(e){ console.warn(e); }
      try { const ps = ws.pageSetup || {}; sh.page = {orient: ps.orientation === 'landscape' ? 'landscape' : 'portrait', size: ps.paperSize === 1 ? 'Letter' : 'A4', fit: ps.fitToWidth ? 'width' : 'none', grid: !!ps.showGridLines, area: ps.printArea ? parseRange(String(ps.printArea).split(',')[0]) : null}; } catch(e){}
      wb.sheets.push(sh);
    });
    try { for (const d of (X.definedNames.model || [])){ if (!d.name || /^_xlnm/.test(d.name)) continue; wb.names[d.name] = (d.ranges || [])[0]; } } catch(e){}
    try { await readCharts(buf, wb); } catch(e){ console.warn('charts', e); }
    if (!wb.sheets.length) wb.sheets.push(newSheet('Sheet1'));
    const act = (X.views && X.views[0] && X.views[0].activeTab) || 0; wb.active = Math.min(act, wb.sheets.length - 1);
    return wb;
  }
  function cfIn(rule){
    const st = {}; const sty = rule.style || {}; const fl = sty.fill; if (fl){ const c = color(fl.bgColor) || color(fl.fgColor); if (c) st.fill = c; } if (sty.font){ const c = color(sty.font.color); if (c) st.color = c; if (sty.font.bold) st.b = true; }
    const f = rule.formulae || []; const num = x => { const n = parseFloat(x); return isNaN(n) ? String(x).replace(/^"|"$/g, '') : n; };
    switch (rule.type){
      case 'cellIs': { const op = ({greaterThan: 'gt', lessThan: 'lt', equal: 'eq', between: 'between', greaterThanOrEqual: 'gt', lessThanOrEqual: 'lt'})[rule.operator]; if (!op) return null; return {type: op, v1: num(f[0]), v2: num(f[1]), style: st}; }
      case 'containsText': return {type: 'text', v1: rule.text || '', style: st};
      case 'duplicateValues': return {type: 'dup', style: st}; case 'uniqueValues': return {type: 'unique', style: st};
      case 'top10': return {type: rule.bottom ? 'bottom' : 'top', v1: rule.rank || 10, pct: !!rule.percent, style: st};
      case 'aboveAverage': return {type: rule.aboveAverage === false ? 'below' : 'above', style: st};
      case 'dataBar': return {type: 'databar', color: color((rule.color) || {}) || '#638EC6'};
      case 'colorScale': { const cs = (rule.color || []).map(color).filter(Boolean); return {type: cs.length === 2 ? 'scale2' : 'scale3', colors: cs.length >= 2 ? cs : undefined}; }
      case 'expression': return f[0] ? {type: 'formula', f: String(f[0]).replace(/^=/, ''), style: st} : null;
      case 'containsBlanks': return {type: 'blank', style: st};
    }
    return null;
  }
  /* charts: ExcelJS skips them, so read the drawing parts ourselves */
  async function readCharts(buf, wb){
    const z = await JSZip.loadAsync(buf); const P = s => new DOMParser().parseFromString(s, 'application/xml'); const txt = async p => { const f = z.file(p); return f ? f.async('string') : null; };
    const rels = async p => { const s = await txt(p.replace(/([^\/]+)$/, '_rels/$1.rels')); const m = {}; if (s) for (const r of P(s).getElementsByTagNameNS('*', 'Relationship')) m[r.getAttribute('Id')] = {t: r.getAttribute('Target'), type: r.getAttribute('Type')}; return m; };
    const join = (base, t) => { if (t.startsWith('/')) return t.slice(1); const p = base.split('/'); p.pop(); for (const s of t.split('/')){ if (s === '..') p.pop(); else if (s !== '.') p.push(s); } return p.join('/'); };
    const wbx = P(await txt('xl/workbook.xml')); const wrels = await rels('xl/workbook.xml'); const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheetsX = [...wbx.getElementsByTagNameNS('*', 'sheet')];
    for (const s of sheetsX){ const sh = wb.sheets.find(x => x.name === s.getAttribute('name')); if (!sh) continue; const rid = s.getAttributeNS(RNS, 'id') || s.getAttribute('r:id'); const path = join('xl/workbook.xml', wrels[rid].t); const srels = await rels(path);
      for (const r of Object.values(srels)){ if (!/\/drawing$/.test(r.type)) continue; const dp = join(path, r.t); const dx = await txt(dp); if (!dx) continue; const drels = await rels(dp); const D = P(dx);
        for (const anc of [...D.documentElement.children]){ const ch = anc.getElementsByTagNameNS('*', 'chart')[0]; if (!ch) continue; const cr = drels[ch.getAttributeNS(RNS, 'id') || ch.getAttribute('r:id')]; if (!cr) continue; const cx = await txt(join(dp, cr.t)); if (!cx) continue; const C = P(cx);
          const plot = C.getElementsByTagNameNS('*', 'plotArea')[0]; if (!plot) continue; const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'scatterChart']; const ce = [...plot.children].find(e => kinds.includes(e.localName)); if (!ce) continue;
          const dir = (ce.getElementsByTagNameNS('*', 'barDir')[0] || {getAttribute: () => 'col'}).getAttribute('val'); const k = ce.localName; const type = /bar/.test(k) ? (dir === 'bar' ? 'bar' : 'column') : /line|scatter/.test(k) ? 'line' : /area/.test(k) ? 'area' : /doughnut/.test(k) ? 'doughnut' : 'pie';
          const refs = [...ce.getElementsByTagNameNS('*', 'f')].map(f => f.textContent); let g = null; let srcSheet = null;
          for (const f of refs){ const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(f.trim()); const rg = parseRange(m ? m[3].replace(/\$/g, '') : f.replace(/\$/g, '')); if (!rg) continue; if (m) srcSheet = (m[1] || m[2]).replace(/''/g, "'"); g = g ? {r1: Math.min(g.r1, rg.r1), c1: Math.min(g.c1, rg.c1), r2: Math.max(g.r2, rg.r2), c2: Math.max(g.c2, rg.c2)} : rg; }
          if (!g) continue; if (srcSheet && srcSheet !== sh.name) continue;
          const from = anc.getElementsByTagNameNS('*', 'from')[0], to = anc.getElementsByTagNameNS('*', 'to')[0], ext = anc.getElementsByTagNameNS('*', 'ext')[0];
          const gv = (el, n) => +((el && el.getElementsByTagNameNS('*', n)[0] || {}).textContent || 0);
          const c0 = gv(from, 'col'), r0 = gv(from, 'row'), dxo = gv(from, 'colOff') / EMU, dyo = gv(from, 'rowOff') / EMU; let w = 480, h = 288;
          if (to){ let W = 0; for (let i = c0; i < gv(to, 'col'); i++) W += sh.colW[i] ?? DEF_W; let H = 0; for (let i = r0; i < gv(to, 'row'); i++) H += sh.rowH[i] ?? DEF_H; w = W + gv(to, 'colOff') / EMU - dxo; h = H + gv(to, 'rowOff') / EMU - dyo; } else if (ext){ w = +ext.getAttribute('cx') / EMU; h = +ext.getAttribute('cy') / EMU; }
          const title = [...(C.getElementsByTagNameNS('*', 'title')[0] || {getElementsByTagNameNS: () => []}).getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('');
          const cols = [...ce.getElementsByTagNameNS('*', 'ser')].map(s2 => { const c = s2.getElementsByTagNameNS('*', 'spPr')[0]; const sc = c && c.getElementsByTagNameNS('*', 'srgbClr')[0]; return sc ? '#' + sc.getAttribute('val') : null; });
          // include the header row / label column next to the values when the chart refers to them
          sh.charts.push({id: uid(), chart: type, range: g, r: r0, c: c0, dx: dxo, dy: dyo, w: Math.round(Math.max(60, w)), h: Math.round(Math.max(40, h)), title, legend: !!C.getElementsByTagNameNS('*', 'legend')[0], labels: !!(ce.getElementsByTagNameNS('*', 'showVal')[0] && ce.getElementsByTagNameNS('*', 'showVal')[0].getAttribute('val') === '1'), colors: cols.every(Boolean) && cols.length ? cols : undefined});
        } } }
  }
  /* ---------------------------------------------------------------- write .xlsx */
  async function writeXlsx(wb){
    const X = new ExcelJS.Workbook(); X.creator = 'SRK Sheets'; X.created = new Date(); X.calcProperties = {fullCalcOnLoad: true};
    const imgIds = {};
    for (const sh of wb.sheets){
      const fr = sh.freeze.r, fc = sh.freeze.c;
      const ws = X.addWorksheet(sh.name, {properties: {tabColor: sh.tab ? {argb: argb(sh.tab)} : undefined}, state: sh.hiddenSheet ? 'hidden' : 'visible', views: [{state: fr || fc ? 'frozen' : 'normal', xSplit: fc || undefined, ySplit: fr || undefined, showGridLines: sh.grid !== false, zoomScale: Math.round((sh.zoom || 1) * 100)}],
        pageSetup: {paperSize: sh.page && sh.page.size === 'Letter' ? 1 : 9, orientation: sh.page && sh.page.orient || 'portrait', fitToPage: sh.page && sh.page.fit === 'width', fitToWidth: 1, fitToHeight: 0, printArea: sh.page && sh.page.area ? rangeAddr(sh.page.area) : undefined}});
      for (const c in sh.colW){ ws.getColumn(+c + 1).width = CH_W(sh.colW[c]); } for (const c in sh.hidC) ws.getColumn(+c + 1).hidden = true;
      for (const r in sh.rowH){ ws.getRow(+r + 1).height = Math.round(sh.rowH[r] * 0.75 * 100) / 100; }
      const filt = filteredRows(sh); for (const r in sh.hidR) ws.getRow(+r + 1).hidden = true; for (const r of filt) ws.getRow(r + 1).hidden = true;
      for (const k in sh.cells){ const [r, c] = unkey(k); const x = sh.cells[k]; const cell = ws.getCell(r + 1, c + 1); let st = x.s ? {...x.s} : null;
        const tst = tableStyleAt(sh, r, c); if (tst){ st = {...(tst.fill ? {fill: tst.fill} : {}), ...(tst.color ? {color: tst.color} : {}), ...(tst.b ? {b: true} : {}), ...(st || {})}; }
        if (x.f != null){ const res = Calc.get(sh, r, c); cell.value = {formula: x.f, result: isErr(res) ? {error: res.e === '#CIRC!' ? '#REF!' : res.e} : (res === null ? undefined : res)}; }
        else if (isErr(x.v)) cell.value = {error: x.v.e}; else cell.value = x.v ?? null;
        if (sh.links[k]) cell.value = {text: String(displayAt(sh, r, c).text || sh.links[k]), hyperlink: sh.links[k]};
        if (st) Object.assign(cell, styleOut(st));
        if (sh.notes[k]) cell.note = sh.notes[k]; }
      // table cells without a value still need the table look
      for (const t of sh.tables) forRange(t.range, (r, c) => { if (sh.cells[key(r, c)]) return; const tst = tableStyleAt(sh, r, c); if (tst && tst.fill) Object.assign(ws.getCell(r + 1, c + 1), styleOut({fill: tst.fill})); });
      for (const k in sh.notes) if (!sh.cells[k]){ const [r, c] = unkey(k); ws.getCell(r + 1, c + 1).note = sh.notes[k]; }
      for (const m of sh.merges) try { ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1); } catch(e){}
      for (const d of sh.dv){ const rule = d.type === 'list' ? {type: 'list', allowBlank: true, showErrorMessage: true, formulae: [/^=/.test(d.list) ? d.list.slice(1) : `"${String(d.list).replace(/"/g, '')}"`]} : {type: d.type === 'length' ? 'textLength' : d.type, operator: ({between: 'between', gte: 'greaterThanOrEqual', lte: 'lessThanOrEqual', eq: 'equal'})[d.op || 'between'], allowBlank: true, showErrorMessage: true, formulae: d.op === 'between' ? [d.min, d.max] : [d.op === 'lte' ? d.max : d.min]};
        const g = d.range; const n = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1); if (ws.dataValidations && ws.dataValidations.add) ws.dataValidations.add(rangeAddr(g), rule); else if (n < 5000) forRange(g, (r, c) => { ws.getCell(r + 1, c + 1).dataValidation = rule; }); }
      for (const rule of sh.cf){ const out = cfOut(rule); if (out) try { ws.addConditionalFormatting({ref: rangeAddr(rule.range), rules: [out]}); } catch(e){} }
      const af = sh.filter ? sh.filter.range : (sh.tables.find(t => t.filter !== false) || {}).range; if (af) ws.autoFilter = rangeAddr(af);
      for (const im of sh.images){ const src = im.src.startsWith('m:') ? wb.media[im.src.slice(2)] : im.src; if (!src) continue; let id = imgIds[src]; if (id == null){ const m = /^data:image\/(\w+);base64,(.*)$/.exec(src); if (!m) continue; id = X.addImage({base64: m[2], extension: m[1] === 'jpg' ? 'jpeg' : m[1]}); imgIds[src] = id; }
        ws.addImage(id, {tl: {col: im.c + (im.dx || 0) / (sh.colW[im.c] ?? DEF_W), row: im.r + (im.dy || 0) / (sh.rowH[im.r] ?? DEF_H)}, ext: {width: im.w, height: im.h}, editAs: 'oneCell'}); }
    }
    for (const [n, ref] of Object.entries(wb.names)){ try { X.definedNames.add(ref.replace(/^=/, ''), n); } catch(e){} }
    let buf = await X.xlsx.writeBuffer();
    if (wb.sheets.some(s => s.charts.length)) buf = await addCharts(buf, wb);
    return buf;
  }
  function cfOut(r){
    const style = {}; if (r.style && r.style.fill) style.fill = {type: 'pattern', pattern: 'solid', bgColor: {argb: argb(r.style.fill)}}; if (r.style && (r.style.color || r.style.b)) style.font = {...(r.style.color ? {color: {argb: argb(r.style.color)}} : {}), ...(r.style.b ? {bold: true} : {})};
    const q = v => typeof v === 'number' || (v !== '' && !isNaN(+v)) ? String(v) : `"${v}"`; const tl = addr(r.range.r1, r.range.c1);
    switch (r.type){
      case 'gt': return {type: 'cellIs', operator: 'greaterThan', formulae: [q(r.v1)], style}; case 'lt': return {type: 'cellIs', operator: 'lessThan', formulae: [q(r.v1)], style}; case 'eq': return {type: 'cellIs', operator: 'equal', formulae: [q(r.v1)], style};
      case 'between': return {type: 'cellIs', operator: 'between', formulae: [q(r.v1), q(r.v2)], style};
      case 'text': return {type: 'containsText', operator: 'containsText', text: r.v1, formulae: [`NOT(ISERROR(SEARCH("${r.v1}",${tl})))`], style};
      case 'dup': return {type: 'duplicateValues', style}; case 'unique': return {type: 'uniqueValues', style};
      case 'top': return {type: 'top10', rank: +r.v1 || 10, percent: !!r.pct, style}; case 'bottom': return {type: 'top10', rank: +r.v1 || 10, percent: !!r.pct, bottom: true, style};
      case 'above': return {type: 'aboveAverage', style}; case 'below': return {type: 'aboveAverage', aboveAverage: false, style};
      case 'blank': return {type: 'containsBlanks', formulae: [`LEN(TRIM(${tl}))=0`], style};
      case 'databar': return {type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{type: 'min'}, {type: 'max'}], color: {argb: argb(r.color || '#638EC6')}, gradient: true};
      case 'scale2': return {type: 'colorScale', cfvo: [{type: 'min'}, {type: 'max'}], color: (r.colors || ['#FFFFFF', '#63BE7B']).map(c => ({argb: argb(c)}))};
      case 'scale3': return {type: 'colorScale', cfvo: [{type: 'min'}, {type: 'percentile', value: 50}, {type: 'max'}], color: (r.colors || ['#F8696B', '#FFEB84', '#63BE7B']).map(c => ({argb: argb(c)}))};
      case 'formula': return {type: 'expression', formulae: [r.f], style};
    }
    return null;
  }
  /* charts written as DrawingML parts */
  async function addCharts(buf, wb){
    const z = await JSZip.loadAsync(buf); const ct = await z.file('[Content_Types].xml').async('string'); let ctx = ct; let chartN = 0;
    const wbx = await z.file('xl/workbook.xml').async('string'); const wrel = await z.file('xl/_rels/workbook.xml.rels').async('string');
    const sheetPath = name => { const m = new RegExp(`<sheet [^>]*name="${xmlA(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*r:id="([^"]+)"`).exec(wbx); if (!m) return null; const t = new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(wrel); const tg = t[1] || t[2]; return tg.startsWith('/') ? tg.slice(1) : 'xl/' + tg.replace(/^\.\//, ''); };
    let drawN = Object.keys(z.files).filter(p => /^xl\/drawings\/drawing\d+\.xml$/.test(p)).length;
    for (const sh of wb.sheets){ if (!sh.charts.length) continue; const sp = sheetPath(sh.name); if (!sp) continue; const relP = sp.replace(/([^\/]+)$/, '_rels/$1.rels');
      let srel = z.file(relP) ? await z.file(relP).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      let sx = await z.file(sp).async('string'); let dPath, dx, drel;
      const m = /<drawing r:id="([^"]+)"\/>/.exec(sx); if (m){ const t = new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(srel); dPath = 'xl/drawings/' + (t[1] || t[2]).split('/').pop(); dx = await z.file(dPath).async('string'); const drP = dPath.replace(/([^\/]+)$/, '_rels/$1.rels'); drel = z.file(drP) ? await z.file(drP).async('string') : null; }
      else { drawN++; dPath = `xl/drawings/drawing${drawN}.xml`; dx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>'; drel = null;
        const rid = 'rIdD' + drawN; srel = srel.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawN}.xml"/></Relationships>`);
        const tag = `<drawing r:id="${rid}"/>`; sx = /<legacyDrawing /.test(sx) ? sx.replace(/<legacyDrawing /, tag + '<legacyDrawing ') : /<tableParts/.test(sx) ? sx.replace(/<tableParts/, tag + '<tableParts') : /<extLst>/.test(sx) ? sx.replace(/<extLst>/, tag + '<extLst>') : sx.replace('</worksheet>', tag + '</worksheet>');
        if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
        ctx = ctx.replace('</Types>', `<Override PartName="/xl/drawings/drawing${drawN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`); }
      drel = drel || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      if (!/xmlns:r=/.test(dx)) dx = dx.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '); if (!/xmlns:c=/.test(dx)) dx = dx.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ');
      for (const o of sh.charts){ chartN++; const rid = 'rIdC' + chartN; z.file(`xl/charts/chart${chartN}.xml`, chartXml(sh, o)); drel = drel.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartN}.xml"/></Relationships>`);
        ctx = ctx.replace('</Types>', `<Override PartName="/xl/charts/chart${chartN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
        const end = endCell(sh, o); dx = dx.replace('</xdr:wsDr>', `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${o.c}</xdr:col><xdr:colOff>${Math.round((o.dx || 0) * EMU)}</xdr:colOff><xdr:row>${o.r}</xdr:row><xdr:rowOff>${Math.round((o.dy || 0) * EMU)}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${end.c}</xdr:col><xdr:colOff>${Math.round(end.dx * EMU)}</xdr:colOff><xdr:row>${end.r}</xdr:row><xdr:rowOff>${Math.round(end.dy * EMU)}</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${1000 + chartN}" name="Chart ${chartN}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`); }
      z.file(sp, sx); z.file(relP, srel); z.file(dPath, dx); z.file(dPath.replace(/([^\/]+)$/, '_rels/$1.rels'), drel);
    }
    z.file('[Content_Types].xml', ctx);
    return z.generateAsync({type: 'arraybuffer', compression: 'DEFLATE'});
  }
  function endCell(sh, o){ let c = o.c, x = (o.dx || 0) + o.w; while (x > (sh.colW[c] ?? DEF_W)){ x -= sh.colW[c] ?? DEF_W; c++; } let r = o.r, y = (o.dy || 0) + o.h; while (y > (sh.rowH[r] ?? DEF_H)){ y -= sh.rowH[r] ?? DEF_H; r++; } return {c, dx: x, r, dy: y}; }
  const xmlA = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function chartXml(sh, o){
    const d = chartData(sh, o); const g = o.range; const sn = quoteSheet(sh.name); const A = (r, c) => '$' + colName(c) + '$' + (r + 1); const pal = (o.colors || XL_COLORS).map(c => c.replace('#', ''));
    const pie = o.chart === 'pie' || o.chart === 'doughnut';
    const catRef = d.byRows ? `${sn}!${A(g.r1, g.c1 + d.c0)}:${A(g.r1, g.c2)}` : `${sn}!${A(g.r1 + d.h0, g.c1)}:${A(g.r2, g.c1)}`;
    const strCache = arr => `<c:strCache><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlA(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
    const numCache = arr => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${arr.length}"/>${arr.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
    const sers = (pie ? d.series.slice(0, 1) : d.series).map((s, i) => { const valRef = d.byRows ? `${sn}!${A(s.row, g.c1 + d.c0)}:${A(s.row, g.c2)}` : `${sn}!${A(g.r1 + d.h0, s.col)}:${A(g.r2, s.col)}`; const txRef = d.byRows ? (d.c0 ? `${sn}!${A(s.row, g.c1)}` : null) : (d.h0 ? `${sn}!${A(g.r1, s.col)}` : null);
      const fill = pie ? d.labels.map((_, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${pal[j % pal.length]}"/></a:solidFill></c:spPr></c:dPt>`).join('') : '';
      const sp = o.chart === 'line' ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${pal[i % pal.length]}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${pal[i % pal.length]}"/></a:solidFill></c:spPr></c:marker>` : pie ? '' : `<c:spPr><a:solidFill><a:srgbClr val="${pal[i % pal.length]}"/></a:solidFill></c:spPr>`;
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${txRef ? `<c:tx><c:strRef><c:f>${xmlA(txRef)}</c:f>${strCache([s.name])}</c:strRef></c:tx>` : `<c:tx><c:v>${xmlA(s.name)}</c:v></c:tx>`}${sp}${fill}${o.labels ? `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${pie ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pie ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>` : ''}${d.c0 || d.byRows ? `<c:cat><c:strRef><c:f>${xmlA(catRef)}</c:f>${strCache(d.labels)}</c:strRef></c:cat>` : ''}<c:val><c:numRef><c:f>${xmlA(valRef)}</c:f>${numCache(s.values)}</c:numRef></c:val>${o.chart === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`; }).join('');
    const axes = pie ? '' : `<c:axId val="500000001"/><c:axId val="500000002"/>`;
    const body = o.chart === 'column' || o.chart === 'bar' ? `<c:barChart><c:barDir val="${o.chart === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="150"/>${axes}</c:barChart>`
      : o.chart === 'line' ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axes}</c:lineChart>`
      : o.chart === 'area' ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${axes}</c:areaChart>`
      : o.chart === 'doughnut' ? `<c:doughnutChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>` : `<c:pieChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/></c:pieChart>`;
    const ax = pie ? '' : `<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${o.chart === 'bar' ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="500000002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${o.chart === 'bar' ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500000001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    const title = o.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="0"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="0"/><a:t>${xmlA(o.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${body}${ax}</c:plotArea>${o.legend !== false ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  }
  /* ---------------------------------------------------------------- CSV */
  function parseCSV(text){
    text = text.replace(/^﻿/, ''); const first = text.split(/\r?\n/)[0] || ''; const delim = [',', ';', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++){ const ch = text[i]; if (q){ if (ch === '"'){ if (text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"' && cur === '') q = true; else if (ch === delim){ row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r'){ if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur !== '' || row.length){ row.push(cur); rows.push(row); } return rows; }
  function readCSV(text, name){ const wb = newWorkbook(name); const sh = wb.sheets[0]; sh.name = name.slice(0, 31) || 'Sheet1'; parseCSV(text).forEach((row, r) => row.forEach((v, c) => { if (v === '') return; const p = parseInput(v); const x = {}; if (p.f != null) x.f = p.f; else x.v = p.v; if (p.nf) x.s = {nf: p.nf}; sh.cells[key(r, c)] = x; })); return wb; }
  function writeCSV(sh){ const {R, C} = Calc.lastRC(sh); const lines = []; for (let r = 0; r <= R; r++){ const row = []; for (let c = 0; c <= C; c++){ let t = displayAt(sh, r, c).text || ''; if (/[",\n\r]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"'; row.push(t); } lines.push(row.join(',')); } return '﻿' + lines.join('\r\n'); }
  return {readXlsx, writeXlsx, readCSV, writeCSV, parseCSV, PX_W, CH_W};
})();
