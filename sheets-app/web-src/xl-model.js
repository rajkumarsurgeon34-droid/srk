/* SRK Sheets — workbook model: sheets, calculation, editing operations, undo */
'use strict';
function newSheet(name){ return {id: uid(), name, cells: {}, colW: {}, rowH: {}, hidR: {}, hidC: {}, merges: [], freeze: {r: 0, c: 0}, cf: [], dv: [], filter: null, tables: [], charts: [], images: [], notes: {}, links: {}, tab: null, grid: true, headings: true, zoom: 1, page: {orient: 'portrait', size: 'A4', fit: 'width', grid: false, area: null}}; }
function newWorkbook(name){ return {id: uid(), name: name || 'Book', sheets: [newSheet('Sheet1')], active: 0, names: {}, media: {}, updated: Date.now()}; }
const DEF_W = 72, DEF_H = 22;

/* ---------------------------------------------------------------- calculation */
const Calc = (() => {
  let wb = null; const cache = new Map(); const busy = new Set(); const bounds = new Map();
  /* dynamic arrays: anchors that spill and the cells they cover */
  const spillOf = new Map(); // 'sheetId:r,c' (covered cell) -> {anchor: 'r,c', v}
  const anchors = new Map(); // 'sheetId:r,c' -> {r, c, rows, cols}
  const prepared = new Set(); let preparing = null;
  const ARRAY_HINT = /:|#|\{|\b(FILTER|SORT|SORTBY|UNIQUE|SEQUENCE|RANDARRAY|TRANSPOSE|VSTACK|HSTACK|TAKE|DROP|CHOOSECOLS|CHOOSEROWS|TOCOL|TOROW|WRAPROWS|WRAPCOLS|EXPAND|TEXTSPLIT|MAKEARRAY|MAP|SCAN|BYROW|BYCOL|LET|MMULT|MINVERSE|MUNIT|FREQUENCY|TREND|GROWTH|MODE\.MULT|GROUPBY|REGEXEXTRACT|INDEX|OFFSET|INDIRECT|IF|IFS|XLOOKUP)\s*\(/i;
  function attach(w){ wb = w; invalidate(); }
  function invalidate(){ cache.clear(); bounds.clear(); spillOf.clear(); anchors.clear(); prepared.clear(); }
  const sheetOf = name => wb.sheets.find(s => s.name.toLowerCase() === String(name).toLowerCase()) || null;
  function prepare(sh){ if (prepared.has(sh.id) || preparing === sh.id) return; prepared.add(sh.id); const prev = preparing; preparing = sh.id;
    try { for (const k in sh.cells){ const x = sh.cells[k]; if (x.f != null && ARRAY_HINT.test(x.f)){ const [r, c] = unkey(k); get(sh, r, c); } } } finally { preparing = prev; bounds.delete(sh.id); } }
  function lastRC(sh){ let b = bounds.get(sh.id); if (!b){ let R = 0, C = 0; for (const k in sh.cells){ const [r, c] = unkey(k); if (r > R) R = r; if (c > C) C = c; }
      if (preparing !== sh.id && (prepared.has(sh.id) || !busy.size)){ prepare(sh); for (const [id, a] of anchors) if (id.startsWith(sh.id + ':')){ R = Math.max(R, a.r + a.rows - 1); C = Math.max(C, a.c + a.cols - 1); } b = {R, C}; bounds.set(sh.id, b); } else { for (const [id, a] of anchors) if (id.startsWith(sh.id + ':')){ R = Math.max(R, a.r + a.rows - 1); C = Math.max(C, a.c + a.cols - 1); } b = {R, C}; } }
    return b; }
  function nameRange(n){ const d = wb.names[n.toUpperCase()] ?? Object.entries(wb.names).find(([k]) => k.toUpperCase() === n.toUpperCase())?.[1]; if (d == null) return null;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)$/.exec(d);
    if (m){ const sh = sheetOf((m[1] || m[2]).replace(/''/g, "'")); const g = parseRange(m[3].replace(/\$/g, '')); if (!sh || !g) return err(ERR.ref); return new Formula.Range(sh, g.r1, g.c1, g.r2, g.c2); }
    const g = parseRange(String(d).replace(/\$/g, '')); if (g) return new Formula.Range(wb.sheets[0], g.r1, g.c1, g.r2, g.c2);
    // a formula or LAMBDA kept as a name
    const id = 'name:' + n.toUpperCase(); if (busy.has(id)) return err(ERR.circ); busy.add(id); try { return Formula.evaluateNamed(String(d).replace(/^=/, ''), ctxFor(wb.sheets[0], 0, 0)); } finally { busy.delete(id); } }
  function spillRange(sh, r, c){ get(sh, r, c); const a = anchors.get(sh.id + ':' + r + ',' + c); if (a) return new Formula.Range(sh, r, c, r + a.rows - 1, c + a.cols - 1); const x = sh.cells[key(r, c)]; if (x && x.f != null) return new Formula.Range(sh, r, c, r, c); return null; }
  function ctxFor(sh, r, c){ return {cur: sh, cell: {r, c}, get, sheetOf, names: nameRange, spillRange, sheets: () => wb.sheets, lastRow: s => lastRC(s).R, lastCol: s => lastRC(s).C, formulaAt: (s, r, c) => { const x = s.cells[key(r, c)]; return x && x.f; }}; }
  function spilledValue(sh, r, c){ if (!prepared.has(sh.id)) prepare(sh); const e = spillOf.get(sh.id + ':' + r + ',' + c); return e ? e.v : undefined; }
  function get(sh, r, c){
    const cell = sh.cells[key(r, c)];
    if (!cell || (cell.f == null && cell.v == null)){ const sv = spilledValue(sh, r, c); return sv === undefined ? (cell ? cell.v ?? null : null) : sv; }
    if (cell.f == null) return cell.v ?? null;
    const id = sh.id + ':' + r + ',' + c; if (cache.has(id)) return cache.get(id);
    if (!busy.size && !prepared.has(sh.id) && preparing !== sh.id){ prepare(sh); if (cache.has(id)) return cache.get(id); }
    if (busy.has(id)) return err(ERR.circ);
    busy.add(id); let v; try { v = Formula.evaluateRaw(cell.f, ctxFor(sh, r, c)); } catch(e){ v = err(ERR.value); } busy.delete(id);
    if (v instanceof Formula.Arr){ const R = v.rows, C = v.cols; let blocked = r + R > MAXR || c + C > MAXC;
      for (let i = 0; i < R && !blocked; i++) for (let j = 0; j < C; j++){ if (!i && !j) continue; const x = sh.cells[key(r + i, c + j)]; const other = spillOf.get(sh.id + ':' + (r + i) + ',' + (c + j)); if ((x && (x.v != null || x.f != null)) || (other && other.anchor !== r + ',' + c)){ blocked = true; break; } }
      if (blocked) v = err(ERR.spill);
      else { anchors.set(id, {r, c, rows: R, cols: C}); bounds.delete(sh.id); for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (i || j){ let w = v.a[i][j]; if (w == null) w = 0; spillOf.set(sh.id + ':' + (r + i) + ',' + (c + j), {anchor: r + ',' + c, v: w}); } v = v.a[0][0]; if (v == null) v = 0; } }
    if (typeof v === 'number' && !isFinite(v)) v = err(ERR.num);
    cache.set(id, v); return v;
  }
  function spillInfo(sh, r, c){ // the spill block that covers (r, c), if any
    if (!prepared.has(sh.id)) prepare(sh); const own = anchors.get(sh.id + ':' + r + ',' + c); if (own) return own; const e = spillOf.get(sh.id + ':' + r + ',' + c); if (!e) return null; return anchors.get(sh.id + ':' + e.anchor) || null; }
  function evalIn(sh, f, r = 0, c = 0){ try { return Formula.evaluate(f, ctxFor(sh, r, c)); } catch(e){ return err(ERR.value); } }
  return {attach, invalidate, get, evalIn, lastRC, sheetOf, spillInfo, spilledValue, get wb(){ return wb; }};
})();

/* ---------------------------------------------------------------- cell helpers */
const cellAt = (sh, r, c) => sh.cells[key(r, c)];
const valueAt = (sh, r, c) => Calc.get(sh, r, c);
function styleAt(sh, r, c){ const x = cellAt(sh, r, c); return (x && x.s) || null; }
function displayAt(sh, r, c, showFormulas){
  const x = cellAt(sh, r, c);
  if (!x || (x.f == null && x.v == null)){ const sv = Calc.spilledValue(sh, r, c); if (sv === undefined) return {text: ''}; if (showFormulas) return {text: ''}; const d = formatValue(sv, x && x.s && x.s.nf); if (typeof sv === 'string' && !d.align) d.align = 'left'; return d; }
  if (showFormulas && x.f != null) return {text: '=' + x.f, align: 'left'};
  const v = Calc.get(sh, r, c), s = x.s || {};
  const d = formatValue(v, s.nf); if (typeof v === 'string' && !d.align) d.align = 'left'; return d;
}
/* text shown in the formula bar / editor */
function editText(sh, r, c){ const x = cellAt(sh, r, c); if (!x || (x.f == null && x.v == null)){ const sp = Calc.spillInfo(sh, r, c); if (sp && (sp.r !== r || sp.c !== c)){ const a = cellAt(sh, sp.r, sp.c); return a && a.f != null ? '=' + a.f : ''; } if (!x) return ''; } if (x.f != null) return '=' + x.f; const v = x.v; if (v == null) return ''; if (isErr(v)) return v.e; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number'){ const nf = x.s && x.s.nf; if (nf && isDateFmt(nf)){ const hasTime = v % 1 !== 0, hasDate = v >= 1; return formatValue(v, (hasDate ? (DMY ? 'dd/mm/yyyy' : 'm/d/yyyy') : '') + (hasDate && hasTime ? ' ' : '') + (hasTime ? 'h:mm:ss' : '')).text.trim(); } if (nf && /%/.test(nf)) return generalNum(v * 100) + '%'; return generalNum(v); }
  return (x.s && x.s.nf === '@') || (typeof v === 'string' && typeof parseInput(v).v !== 'string') ? (typeof v === 'string' && x.text ? "'" : '') + v : v; }
function mergeAt(sh, r, c){ for (const m of sh.merges) if (inRange(m, r, c)) return m; return null; }

/* ---------------------------------------------------------------- undo / transactions */
const History = (() => {
  let stack = [], pos = 0; let cur = null; let onChange = null;
  function begin(sh, structural){ cur = {sheetId: sh.id, patches: new Map(), structural: structural ? JSON.stringify(sh) : null}; }
  function touch(sh, k){ if (!cur || cur.structural || cur.sheetId !== sh.id) return; if (!cur.patches.has(k)) cur.patches.set(k, sh.cells[k] ? JSON.stringify(sh.cells[k]) : null); }
  function commit(sh, label){ if (!cur) return; const t = cur; cur = null;
    if (t.structural){ const after = JSON.stringify(sh); if (after === t.structural) return; push({sheetId: sh.id, before: t.structural, after, label}); }
    else { const p = []; for (const [k, b] of t.patches){ const a = sh.cells[k] ? JSON.stringify(sh.cells[k]) : null; if (a !== b) p.push([k, b, a]); } if (!p.length) return; push({sheetId: sh.id, patches: p, label}); }
    Calc.invalidate(); if (onChange) onChange(); }
  function push(e){ stack = stack.slice(0, pos); stack.push(e); if (stack.length > 100) stack.shift(); pos = stack.length; }
  function apply(e, dir){ const wb = Calc.wb; let i = wb.sheets.findIndex(s => s.id === e.sheetId); if (i < 0 && e.wbBefore == null) return null;
    if (e.wb){ const snap = JSON.parse(dir < 0 ? e.wbBefore : e.wbAfter); wb.sheets = snap.sheets; wb.names = snap.names; wb.active = Math.min(snap.active, wb.sheets.length - 1); return wb.sheets[wb.active]; }
    const sh = wb.sheets[i];
    if (e.before != null){ const snap = JSON.parse(dir < 0 ? e.before : e.after); Object.keys(sh).forEach(k => delete sh[k]); Object.assign(sh, snap); }
    else for (const [k, b, a] of e.patches){ const v = dir < 0 ? b : a; if (v == null) delete sh.cells[k]; else sh.cells[k] = JSON.parse(v); }
    wb.active = i; return sh; }
  /* workbook-level changes (add/delete/rename sheets) */
  function wbChange(fn, label){ const wb = Calc.wb; const before = JSON.stringify({sheets: wb.sheets, names: wb.names, active: wb.active}); fn(); const after = JSON.stringify({sheets: wb.sheets, names: wb.names, active: wb.active}); if (before !== after){ push({wb: true, wbBefore: before, wbAfter: after, label}); Calc.invalidate(); if (onChange) onChange(); } }
  return {begin, touch, commit, wbChange, undo(){ if (pos <= 0) return null; pos--; const sh = apply(stack[pos], -1); Calc.invalidate(); return sh; }, redo(){ if (pos >= stack.length) return null; const sh = apply(stack[pos], 1); pos++; Calc.invalidate(); return sh; },
    canUndo: () => pos > 0, canRedo: () => pos < stack.length, reset(){ stack = []; pos = 0; cur = null; }, set onChange(f){ onChange = f; }, get active(){ return !!cur; }};
})();
/* run fn as one undoable step; structural=true snapshots the whole sheet */
function tx(sh, label, fn, structural){ const nested = History.active; if (!nested) History.begin(sh, structural); try { fn(); } finally { if (!nested) History.commit(sh, label); } }
function setCell(sh, r, c, cell){ const k = key(r, c); History.touch(sh, k); if (!cell || (cell.v == null && cell.f == null && (!cell.s || !Object.keys(cell.s).length))) delete sh.cells[k]; else sh.cells[k] = cell; }
function patchCell(sh, r, c, fn){ const k = key(r, c); History.touch(sh, k); const cur = sh.cells[k] ? {...sh.cells[k], s: sh.cells[k].s ? {...sh.cells[k].s} : undefined} : {}; fn(cur); setCell(sh, r, c, cur); }
/* put typed text into a cell (keeps its formatting, may pick a number format) */
function inputCell(sh, r, c, text){
  patchCell(sh, r, c, x => {
    const p = parseInput(text); const s = x.s || {};
    if (s.nf === '@' && !String(text).startsWith('=')){ x.v = text === '' ? null : String(text); delete x.f; x.s = s; return; }
    delete x.f; delete x.text; x.v = null;
    if (p.f != null){ x.f = normalizeFormula(p.f); }
    else { x.v = p.v; if (p.text) x.text = true; if (p.nf && (!s.nf || s.nf === 'General' || (isDateFmt(p.nf) !== isDateFmt(s.nf)))) s.nf = p.nf; }
    if (Object.keys(s).length) x.s = s; else delete x.s;
  });
}
function normalizeFormula(f){ // upper-case function names & refs, close open brackets
  let out = ''; for (const t of Formula.tokenize(f)){ if (t.type === 'func') out += t.text.toUpperCase(); else if (t.type === 'ref') out += t.text.slice(0, t.plen || 0) + t.text.slice(t.plen || 0).toUpperCase(); else if (t.type === 'bool') out += t.text.toUpperCase(); else out += t.text; }
  let open = 0, q = false; for (const ch of out){ if (ch === '"') q = !q; else if (!q && ch === '(') open++; else if (!q && ch === ')') open--; } if (open > 0) out += ')'.repeat(open); return out; }

/* ---------------------------------------------------------------- range operations */
function forRange(g, fn){ for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) fn(r, c); }
function usedCellsIn(sh, g){ const out = []; for (const k in sh.cells){ const [r, c] = unkey(k); if (inRange(g, r, c)) out.push([r, c, k]); } return out; }
function clampToUsed(sh, g){ const {R, C} = Calc.lastRC(sh); return {r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(R, g.r1)), c2: Math.min(g.c2, Math.max(C, g.c1))}; }
function styleRange(sh, g, fn){ const big = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 200000; const gg = big ? clampToUsed(sh, g) : g; forRange(gg, (r, c) => patchCell(sh, r, c, x => { x.s = x.s || {}; fn(x.s, r, c); for (const k in x.s) if (x.s[k] == null || x.s[k] === false && k !== 'b') delete x.s[k]; if (!Object.keys(x.s).length) delete x.s; })); }
function clearRange(sh, g, what = 'all'){ const cells = usedCellsIn(sh, g); for (const [r, c] of cells) patchCell(sh, r, c, x => { if (what !== 'formats'){ delete x.v; delete x.f; delete x.text; } if (what !== 'contents') delete x.s; });
  if (what === 'all'){ for (const k of Object.keys(sh.notes)){ const [r, c] = unkey(k); if (inRange(g, r, c)) delete sh.notes[k]; } for (const k of Object.keys(sh.links)){ const [r, c] = unkey(k); if (inRange(g, r, c)) delete sh.links[k]; } } }

/* insert/delete rows or columns, fixing formulas everywhere */
function shiftKeys(obj, axis, at, n){ const out = {}; for (const k in obj){ const [r, c] = unkey(k); let rr = r, cc = c; if (axis === 'r'){ if (r >= at){ if (n < 0 && r < at - n) continue; rr = r + n; } } else { if (c >= at){ if (n < 0 && c < at - n) continue; cc = c + n; } } out[key(rr, cc)] = obj[k]; } return out; }
function shiftIdx(obj, at, n){ const out = {}; for (const k in obj){ const i = +k; if (i >= at){ if (n < 0 && i < at - n) continue; out[i + n] = obj[k]; } else out[i] = obj[k]; } return out; }
function shiftG(g, axis, at, n){ const A = axis === 'r' ? ['r1', 'r2'] : ['c1', 'c2']; const x = {...g}; if (n > 0){ if (x[A[0]] >= at) x[A[0]] += n; if (x[A[1]] >= at) x[A[1]] += n; return x; }
  const end = at - n - 1; if (x[A[0]] >= at && x[A[1]] <= end) return null; if (x[A[0]] > end) x[A[0]] += n; else if (x[A[0]] >= at) x[A[0]] = at; if (x[A[1]] > end) x[A[1]] += n; else if (x[A[1]] >= at) x[A[1]] = at - 1; return x[A[1]] < x[A[0]] ? null : x; }
function insertDelete(wb, sh, axis, at, n){
  // formulas on every sheet
  for (const s of wb.sheets) for (const k in s.cells){ const x = s.cells[k]; if (x.f != null){ const nf = Formula.adjust(x.f, sh.name, s.name, axis, at, n); if (nf !== x.f) x.f = nf; } }
  sh.cells = shiftKeys(sh.cells, axis, at, n); sh.notes = shiftKeys(sh.notes, axis, at, n); sh.links = shiftKeys(sh.links, axis, at, n);
  if (axis === 'r'){ sh.rowH = shiftIdx(sh.rowH, at, n); sh.hidR = shiftIdx(sh.hidR, at, n); } else { sh.colW = shiftIdx(sh.colW, at, n); sh.hidC = shiftIdx(sh.hidC, at, n); }
  sh.merges = sh.merges.map(m => shiftG(m, axis, at, n)).filter(m => m && (m.r1 !== m.r2 || m.c1 !== m.c2));
  for (const list of [sh.cf, sh.dv, sh.tables]) for (let i = list.length - 1; i >= 0; i--){ const g = shiftG(list[i].range, axis, at, n); if (g) list[i].range = g; else list.splice(i, 1); }
  if (sh.filter){ const g = shiftG(sh.filter.range, axis, at, n); if (!g) sh.filter = null; else { if (axis === 'c' && sh.filter.cols){ const nc = {}; for (const c in sh.filter.cols){ const i = +c; if (i >= at){ if (n < 0 && i < at - n) continue; nc[i + n] = sh.filter.cols[c]; } else nc[i] = sh.filter.cols[c]; } sh.filter.cols = nc; } sh.filter.range = g; } }
  for (const o of [...sh.charts, ...sh.images]){ if (axis === 'r' && o.r >= at) o.r = Math.max(at, o.r + n); if (axis === 'c' && o.c >= at) o.c = Math.max(at, o.c + n); if (o.range){ const g = shiftG(o.range, axis, at, n); if (g) o.range = g; } }
  for (const nm in wb.names){ const d = wb.names[nm]; const f = Formula.adjust(d.replace(/^=/, ''), sh.name, wb.sheets[0].name, axis, at, n); wb.names[nm] = f; }
}
/* copy cells (with formulas shifted) */
function copyBlock(sh, g){ const cells = []; forRange(g, (r, c) => { const x = cellAt(sh, r, c); cells.push(x ? clone(x) : null); }); const notes = {}, links = {}; forRange(g, (r, c) => { const k = key(r, c); if (sh.notes[k]) notes[key(r - g.r1, c - g.c1)] = sh.notes[k]; if (sh.links[k]) links[key(r - g.r1, c - g.c1)] = sh.links[k]; });
  return {rows: g.r2 - g.r1 + 1, cols: g.c2 - g.c1 + 1, cells, src: {...g}, notes, links, merges: sh.merges.filter(m => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2).map(m => ({r1: m.r1 - g.r1, c1: m.c1 - g.c1, r2: m.r2 - g.r1, c2: m.c2 - g.c1})), colW: Array.from({length: g.c2 - g.c1 + 1}, (_, i) => sh.colW[g.c1 + i])}; }
function pasteBlock(sh, blk, r0, c0, mode = 'all'){ // mode: all | values | formats | formulas
  const R = blk.rows, C = blk.cols;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++){ const src = blk.cells[i * C + j]; const r = r0 + i, c = c0 + j;
    patchCell(sh, r, c, x => {
      if (mode === 'formats'){ if (src && src.s) x.s = clone(src.s); else delete x.s; return; }
      delete x.v; delete x.f; delete x.text;
      if (src){ if (src.f != null && mode !== 'values') x.f = Formula.shift(src.f, r - (blk.src.r1 + i), c - (blk.src.c1 + j)); else if (src.f != null) x.v = blk.vals ? blk.vals[i * C + j] : null; else { x.v = src.v; if (src.text) x.text = true; }
        if (mode === 'all') { if (src.s) x.s = clone(src.s); else delete x.s; } }
      else if (mode === 'all') delete x.s;
    }); }
  if (mode === 'all'){ for (const k in blk.notes){ const [i, j] = unkey(k); sh.notes[key(r0 + i, c0 + j)] = blk.notes[k]; } for (const k in blk.links){ const [i, j] = unkey(k); sh.links[key(r0 + i, c0 + j)] = blk.links[k]; }
    for (const m of blk.merges) addMerge(sh, {r1: m.r1 + r0, c1: m.c1 + c0, r2: m.r2 + r0, c2: m.c2 + c0}); }
  return {r1: r0, c1: c0, r2: r0 + R - 1, c2: c0 + C - 1};
}
function addMerge(sh, g){ sh.merges = sh.merges.filter(m => !(m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1)); if (g.r1 !== g.r2 || g.c1 !== g.c2) sh.merges.push({...g}); }

/* ---------------------------------------------------------------- fill (drag the fill handle) */
function fillSeries(sh, src, dst){ // dst extends src in one direction
  const down = dst.r2 > src.r2, up = dst.r1 < src.r1, right = dst.c2 > src.c2, left = dst.c1 < src.c1; const vertical = down || up;
  const lines = vertical ? [...Array(src.c2 - src.c1 + 1).keys()].map(i => src.c1 + i) : [...Array(src.r2 - src.r1 + 1).keys()].map(i => src.r1 + i);
  for (const ln of lines){
    const seq = []; const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1;
    for (let i = 0; i < len; i++){ const r = vertical ? src.r1 + i : ln, c = vertical ? ln : src.c1 + i; seq.push({r, c, x: cellAt(sh, r, c)}); }
    const nums = seq.map(s => s.x && s.x.f == null && typeof s.x.v === 'number' ? s.x.v : null);
    const allNum = nums.every(v => v != null); let step = null;
    if (allNum){ if (len === 1) step = (seq[0].x.s && isDateFmt(seq[0].x.s.nf)) ? 1 : 0; else { const d = (nums[len - 1] - nums[0]) / (len - 1); step = d; } }
    const textNum = seq.map(s => s.x && typeof s.x.v === 'string' ? /^(.*?)(\d+)(\D*)$/.exec(s.x.v) : null);
    const lists = [MONTHS, MONTHS.map(m => m.slice(0, 3)), DAYS, DAYS.map(d => d.slice(0, 3))];
    const listOf = v => { if (typeof v !== 'string') return null; for (const L of lists){ const i = L.findIndex(x => x.toLowerCase() === v.toLowerCase()); if (i >= 0) return {L, i, upper: v === v.toUpperCase() && v.length > 1}; } return null; };
    const count = vertical ? (down ? dst.r2 - src.r2 : src.r1 - dst.r1) : (right ? dst.c2 - src.c2 : src.c1 - dst.c1);
    for (let k = 1; k <= count; k++){
      const idx = down || right ? (k - 1) % len : (len - (k % len || len)); const s = seq[idx]; const n = down || right ? len - 1 + k : -k; // position relative to first
      const r = vertical ? (down ? src.r2 + k : src.r1 - k) : ln, c = vertical ? ln : (right ? src.c2 + k : src.c1 - k);
      patchCell(sh, r, c, x => { delete x.v; delete x.f; delete x.text; const sx = s.x; if (!sx){ delete x.s; return; } if (sx.s) x.s = clone(sx.s); else delete x.s;
        if (sx.f != null){ x.f = Formula.shift(sx.f, r - s.r, c - s.c); return; }
        if (allNum && step != null){ x.v = nums[0] + step * n; return; }
        const L = listOf(sx.v); if (L){ const L0 = (len > 1 && listOf(seq[0].x && seq[0].x.v)) || L; const base = len > 1 ? L0.i : L.i; const off = len > 1 ? n : (down || right ? k : -k); const t = L.L[((base + off) % L.L.length + L.L.length) % L.L.length]; x.v = L.upper ? t.toUpperCase() : t; return; }
        const tn = textNum[idx]; if (tn && len === 1){ const w = tn[2].length; x.v = tn[1] + String(+tn[2] + (down || right ? k : -k)).padStart(w, '0') + tn[3]; return; }
        x.v = sx.v; if (sx.text) x.text = true; });
    }
  }
}

/* ---------------------------------------------------------------- sort & filter */
function sortRange(sh, g, keys, header){ // keys: [{c, desc}]
  const r1 = g.r1 + (header ? 1 : 0); if (r1 > g.r2) return; const rows = [];
  for (let r = r1; r <= g.r2; r++){ const vals = keys.map(k => Calc.get(sh, r, k.c)); const cells = []; for (let c = g.c1; c <= g.c2; c++) cells.push(cellAt(sh, r, c) ? clone(cellAt(sh, r, c)) : null); rows.push({r, vals, cells}); }
  rows.sort((a, b) => { for (let i = 0; i < keys.length; i++){ const x = a.vals[i], y = b.vals[i]; const ex = x == null || x === '', ey = y == null || y === ''; if (ex !== ey) return ex ? 1 : -1; const c = Formula.cmp(x, y); if (c) return keys[i].desc ? -c : c; } return a.r - b.r; });
  rows.forEach((row, i) => { const r = r1 + i; row.cells.forEach((x, j) => { const c = g.c1 + j; if (x && x.f != null) x.f = Formula.shift(x.f, r - row.r, 0); setCell(sh, r, c, x); }); });
}
function filteredRows(sh){ const f = sh.filter; const out = new Set(); if (!f || !f.cols) return out; const r1 = f.range.r1 + 1;
  for (let r = r1; r <= f.range.r2; r++) for (const c in f.cols){ const crit = f.cols[c]; if (!crit) continue; const v = Calc.get(sh, r, +c); const t = formatValue(v, (styleAt(sh, r, +c) || {}).nf).text;
    if (crit.values && !crit.values.includes(t)){ out.add(r); break; } if (crit.cond){ const fn = Formula.criterion(crit.cond); if (!fn(v)){ out.add(r); break; } } }
  return out; }
function removeDuplicates(sh, g, cols, header){ const seen = new Set(); const keep = []; const r1 = g.r1 + (header ? 1 : 0); let removed = 0;
  for (let r = r1; r <= g.r2; r++){ const k = cols.map(c => { const v = Calc.get(sh, r, c); return typeof v === 'string' ? v.toLowerCase() : String(v); }).join('\u0001'); if (seen.has(k)){ removed++; continue; } seen.add(k); const row = []; for (let c = g.c1; c <= g.c2; c++) row.push(cellAt(sh, r, c) ? clone(cellAt(sh, r, c)) : null); keep.push(row); }
  for (let r = r1; r <= g.r2; r++){ const row = keep[r - r1]; for (let c = g.c1; c <= g.c2; c++) setCell(sh, r, c, row ? row[c - g.c1] : null); }
  return removed; }

/* ---------------------------------------------------------------- conditional formatting */
const ICON_SETS = {arrows: [['▲', '#00B050'], ['▶', '#FFC000'], ['▼', '#C00000']], traffic: [['●', '#00B050'], ['●', '#FFC000'], ['●', '#C00000']], flags: [['⚑', '#00B050'], ['⚑', '#FFC000'], ['⚑', '#C00000']], stars: [['★', '#FFC000'], ['⯪', '#FFC000'], ['☆', '#A5A5A5']], checks: [['✔', '#00B050'], ['!', '#FFC000'], ['✖', '#C00000']], quarters: [['●', '#404040'], ['◕', '#404040'], ['◑', '#404040'], ['◔', '#404040']]};
function cfStyleFor(sh, r, c, cache){
  let out = null;
  for (const rule of sh.cf){ if (!inRange(rule.range, r, c)) continue; const v = Calc.get(sh, r, c); let hit = false;
    const st = rule.style || {fill: '#FFC7CE', color: '#9C0006'};
    switch (rule.type){
      case 'gt': hit = typeof v === 'number' && v > +rule.v1; break; case 'lt': hit = typeof v === 'number' && v < +rule.v1; break; case 'eq': hit = Formula.cmp(v, typeof v === 'number' ? +rule.v1 : rule.v1) === 0 && v != null; break;
      case 'between': hit = typeof v === 'number' && v >= Math.min(+rule.v1, +rule.v2) && v <= Math.max(+rule.v1, +rule.v2); break;
      case 'text': hit = typeof v === 'string' && v.toLowerCase().includes(String(rule.v1).toLowerCase()); break;
      case 'blank': hit = v == null || v === ''; break;
      case 'dup': case 'unique': { const k = 'dup' + sh.cf.indexOf(rule); let m = cache[k]; if (!m){ m = new Map(); forRange(clampToUsed(sh, rule.range), (rr, cc) => { const x = Calc.get(sh, rr, cc); if (x == null || x === '') return; const kk = typeof x === 'string' ? x.toLowerCase() : String(x); m.set(kk, (m.get(kk) || 0) + 1); }); cache[k] = m; } if (v != null && v !== ''){ const n = m.get(typeof v === 'string' ? v.toLowerCase() : String(v)); hit = rule.type === 'dup' ? n > 1 : n === 1; } break; }
      case 'top': case 'bottom': case 'above': case 'below': case 'databar': case 'scale2': case 'scale3': case 'icons': {
        const k = 'n' + sh.cf.indexOf(rule); let ns = cache[k]; if (!ns){ ns = []; forRange(clampToUsed(sh, rule.range), (rr, cc) => { const x = Calc.get(sh, rr, cc); if (typeof x === 'number') ns.push(x); }); ns.sort((a, b) => a - b); cache[k] = ns; }
        if (typeof v !== 'number' || !ns.length) break; const mn = ns[0], mx = ns[ns.length - 1];
        if (rule.type === 'top'){ const n = rule.pct ? Math.max(1, Math.round(ns.length * (+rule.v1 || 10) / 100)) : (+rule.v1 || 10); hit = v >= ns[Math.max(0, ns.length - n)]; }
        else if (rule.type === 'bottom'){ const n = rule.pct ? Math.max(1, Math.round(ns.length * (+rule.v1 || 10) / 100)) : (+rule.v1 || 10); hit = v <= ns[Math.min(ns.length - 1, n - 1)]; }
        else if (rule.type === 'above' || rule.type === 'below'){ const avg = ns.reduce((a, b) => a + b, 0) / ns.length; hit = rule.type === 'above' ? v > avg : v < avg; }
        else if (rule.type === 'icons'){ const t = mx === mn ? 1 : (v - mn) / (mx - mn); const set = ICON_SETS[rule.set || 'arrows'] || ICON_SETS.arrows; const i = set.length === 4 ? (t >= .75 ? 0 : t >= .5 ? 1 : t >= .25 ? 2 : 3) : (t >= 2 / 3 ? 0 : t >= 1 / 3 ? 1 : 2); out = {...(out || {}), icon: set[i]}; continue; }
        else if (rule.type === 'databar'){ out = {...(out || {}), bar: {pct: mx === mn ? 1 : Math.max(0.03, (v - Math.min(0, mn)) / (mx - Math.min(0, mn))), color: rule.color || '#638EC6'}}; continue; }
        else { const t = mx === mn ? 0.5 : (v - mn) / (mx - mn); const cs = rule.colors || (rule.type === 'scale2' ? ['#FFFFFF', '#63BE7B'] : ['#F8696B', '#FFEB84', '#63BE7B']); const col = cs.length === 2 ? mix(cs[0], cs[1], t) : t < .5 ? mix(cs[0], cs[1], t * 2) : mix(cs[1], cs[2], (t - .5) * 2); out = {...(out || {}), fill: col}; continue; }
        break; }
      case 'formula': { const sh2 = sh; const f = Formula.shift(rule.f, r - rule.range.r1, c - rule.range.c1); const res = Calc.evalIn(sh2, f, r, c); hit = res === true || (typeof res === 'number' && res !== 0); break; }
    }
    if (hit) out = {...(out || {}), ...st};
  }
  return out;
}
/* colour helpers shared with themes */
const hexRgb = c => { c = String(c || '#000').replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const v = parseInt(c.slice(-6), 16) || 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const rgbHex = a => '#' + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const isDarkC = c => { const [r, g, b] = hexRgb(c); return (r * 299 + g * 587 + b * 114) / 1000 < 128; };

/* ---------------------------------------------------------------- tables (Format as Table) */
const TABLE_STYLES = [['blue', '#4472C4'], ['orange', '#ED7D31'], ['grey', '#A5A5A5'], ['gold', '#FFC000'], ['sky', '#5B9BD5'], ['green', '#70AD47'], ['navy', '#264478'], ['teal', '#0F8B8D'], ['purple', '#7030A0'], ['red', '#C00000']];
function tableStyleAt(sh, r, c){ for (const t of sh.tables){ const g = t.range; if (!inRange(g, r, c)) continue; const col = (TABLE_STYLES.find(s => s[0] === t.style) || TABLE_STYLES[0])[1];
    if (t.header !== false && r === g.r1) return {fill: col, color: '#FFFFFF', b: true}; if (t.total && r === g.r2) return {b: true, bdT: col};
    const i = r - g.r1 - (t.header !== false ? 1 : 0); if (t.banded !== false && i % 2 === 0) return {fill: mix(col, '#FFFFFF', .8)}; return {}; } return null; }
function tableAt(sh, r, c){ return sh.tables.find(t => inRange(t.range, r, c)) || null; }
