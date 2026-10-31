/* SRK Sheets — Power Pivot: Data Model (tables, relationships, DAX measures), Data Model PivotTables, and Slicers */
'use strict';
const PP = (() => {
  const $ = (s, r = document) => r.querySelector(s); const G = Grid.G;
  const h = UI.h, toast = (...a) => UI.toast(...a), dialog = (...a) => UI.dialog(...a), pop = (...a) => UI.pop(...a), mi = (...a) => UI.mi(...a), field = (...a) => UI.field(...a);
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {model: S('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><path d="M10 6.5h4M17.5 10v4"/>'), rel: S('<rect x="2" y="8" width="7" height="8" rx="1"/><rect x="15" y="8" width="7" height="8" rx="1"/><path d="M9 12h6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'), measure: S('<path d="M5 4h14M8 4l-3 16M16 4l3 16M7 12h10"/>'), pivot: S('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M13 13h5M15.5 10.5L18 13l-2.5 2.5"/>'), slicer: S('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/><path d="M16 15l2 2"/>')};
  const wb = () => G.wb; const M = () => (wb().model = wb().model || {tables: [], rels: [], measures: []});
  const txt = v => v == null ? '' : typeof v === 'number' ? generalNum(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
  const num = v => typeof v === 'number' ? v : typeof v === 'boolean' ? +v : (v == null || v === '' || isNaN(+v)) ? null : +v;
  const lc = s => String(s).toLowerCase();

  /* ================================================================ model tables (live data) */
  let cache = null; // {tableName: {cols, rows, idx: Map(col→Map(value→[rows]))}}
  function touched(){ cache = null; }
  async function tableData(t){
    if (t.kind === 'query' && typeof PQ !== 'undefined'){ const q = PQ.list().find(x => x.id === t.queryId); if (!q) throw new Error(`Query for “${t.name}” was deleted`); return PQ.run(q); }
    const s = wb().sheets.find(x => x.id === t.sheetId); if (!s) throw new Error(`Sheet for “${t.name}” was deleted`); const tb = s.tables.find(x => x.name === t.table); const g = tb ? {...tb.range, r2: tb.range.r2 - (tb.total ? 1 : 0)} : t.range; if (!g) throw new Error(`Table “${t.table}” was deleted`); return PQ.fromGrid(s, g, true); }
  async function load(){ if (cache) return cache; const out = {}; for (const t of M().tables){ const d = await tableData(t); out[lc(t.name)] = {name: t.name, cols: d.cols, rows: d.rows}; } cache = out; return out; }
  const colIx = (T, c) => { const i = T.cols.findIndex(x => lc(x) === lc(c)); if (i < 0) throw new Error(`Column ${T.name}[${c}] wasn’t found`); return i; };

  /* ================================================================ relationships: many → one lookups */
  function path(data, from, to){ // BFS over many→one relationships, returns list of rels
    if (lc(from) === lc(to)) return []; const seen = new Set([lc(from)]); const q = [[lc(from), []]];
    while (q.length){ const [t, p] = q.shift(); for (const r of M().rels){ if (r.active === false || lc(r.ft) !== t) continue; const n = lc(r.tt); if (seen.has(n)) continue; const np = [...p, r]; if (n === lc(to)) return np; seen.add(n); q.push([n, np]); } } return null; }
  const oneIndex = new Map();
  function lookup(data, rel, key){ const k = rel.tt + '|' + rel.tc; let m = oneIndex.get(k); if (!m || m.data !== data){ const T = data[lc(rel.tt)]; const i = colIx(T, rel.tc); m = {data, map: new Map()}; for (const row of T.rows){ const kk = lc(txt(row[i])); if (!m.map.has(kk)) m.map.set(kk, row); } oneIndex.set(k, m); } return m.map.get(lc(txt(key))) || null; }
  function valueVia(data, tname, row, ft, fc){ // the value of ft[fc] for a row of tname, following relationships
    if (lc(tname) === lc(ft)) return row[colIx(data[lc(tname)], fc)]; const p = path(data, tname, ft); if (!p) return undefined; let cur = row, curT = tname;
    for (const r of p){ const key = cur[colIx(data[lc(curT)], r.fc)]; cur = lookup(data, r, key); curT = r.tt; if (!cur) return null; } return cur[colIx(data[lc(ft)], fc)]; }

  /* ================================================================ DAX-lite */
  function tokenize(src){ const out = []; let i = 0; const s = String(src);
    while (i < s.length){ const ch = s[i];
      if (/\s/.test(ch)){ i++; continue; }
      if (ch === '"'){ let j = i + 1, v = ''; while (j < s.length){ if (s[j] === '"'){ if (s[j + 1] === '"'){ v += '"'; j += 2; continue; } break; } v += s[j++]; } out.push({k: 'str', v}); i = j + 1; continue; }
      if (ch === '['){ const j = s.indexOf(']', i); out.push({k: 'br', v: s.slice(i + 1, j)}); i = j + 1; continue; }
      if (ch === "'"){ const j = s.indexOf("'", i + 1); out.push({k: 'id', v: s.slice(i + 1, j), q: true}); i = j + 1; continue; }
      if (/[0-9.]/.test(ch)){ const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i)); out.push({k: 'num', v: +m[0]}); i += m[0].length; continue; }
      if (/[A-Za-z_À-￿]/.test(ch)){ const m = /^[A-Za-z_À-￿][\w.À-￿]*/.exec(s.slice(i)); out.push({k: 'id', v: m[0]}); i += m[0].length; continue; }
      const two = s.slice(i, i + 2); if (['<=', '>=', '<>', '&&', '||', '=='].includes(two)){ out.push({k: 'op', v: two === '==' ? '=' : two}); i += 2; continue; }
      if ('+-*/^&=<>(),'.includes(ch)){ out.push({k: 'op', v: ch}); i++; continue; }
      throw new Error('Unexpected “' + ch + '” in the formula'); }
    return out; }
  function parse(src){ const t = tokenize(src); let p = 0; const peek = () => t[p], eat = v => { const x = t[p]; if (!x || (v && (x.v !== v || x.k === 'str'))) throw new Error('Expected ' + (v || 'more') + ' in the formula'); p++; return x; };
    const PREC = {'||': 1, '&&': 2, '=': 3, '<>': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '&': 4, '+': 5, '-': 5, '*': 6, '/': 6, '^': 7};
    function expr(min = 0){ let left = unary(); for (;;){ const x = peek(); if (!x || x.k !== 'op' || !PREC[x.v] || PREC[x.v] < min) break; p++; const right = expr(PREC[x.v] + (x.v === '^' ? 0 : 1)); left = {k: 'bin', op: x.v, a: left, b: right}; } return left; }
    function unary(){ const x = peek(); if (x && x.k === 'op' && (x.v === '-' || x.v === '+')){ p++; const v = unary(); return x.v === '-' ? {k: 'neg', v} : v; } if (x && x.k === 'id' && x.v.toUpperCase() === 'NOT' && t[p + 1] && t[p + 1].k === 'op' && t[p + 1].v === '('){ p++; eat('('); const v = expr(); eat(')'); return {k: 'not', v}; } return prim(); }
    function prim(){ const x = eat(); if (x.k === 'num') return {k: 'lit', v: x.v}; if (x.k === 'str') return {k: 'lit', v: x.v}; if (x.k === 'br') return {k: 'meas', name: x.v};
      if (x.k === 'op' && x.v === '('){ const v = expr(); eat(')'); return v; }
      if (x.k === 'id'){ const nx = peek(); if (nx && nx.k === 'br'){ p++; return {k: 'col', t: x.v, c: nx.v}; }
        if (nx && nx.k === 'op' && nx.v === '(' && !x.q){ p++; const args = []; if (peek() && !(peek().k === 'op' && peek().v === ')')){ for (;;){ args.push(expr()); if (peek() && peek().k === 'op' && peek().v === ','){ p++; continue; } break; } } eat(')'); return {k: 'fn', name: x.v.toUpperCase(), args}; }
        const U = x.v.toUpperCase(); if (U === 'TRUE' || U === 'FALSE') return {k: 'lit', v: U === 'TRUE'}; if (U === 'BLANK') return {k: 'lit', v: null}; return {k: 'tbl', t: x.v}; }
      throw new Error('Unexpected “' + x.v + '” in the formula'); }
    const ast = expr(); if (p < t.length) throw new Error('Unexpected “' + t[p].v + '” in the formula'); return ast; }
  const astCache = new Map(); const ast = f => { if (!astCache.has(f)) astCache.set(f, parse(f)); return astCache.get(f); };
  /* context: {data, filters: [{t, c, test}], row: {t, row} | null} */
  function rowsOf(ctx, tname){ const T = ctx.data[lc(tname)]; if (!T) throw new Error(`Table “${tname}” isn’t in the Data Model`); const fs = ctx.filters.filter(f => f.t !== '*');
    if (!fs.length) return T.rows; return T.rows.filter(row => fs.every(f => { if (f.rows) return lc(f.t) !== lc(tname) || f.rows.has(row); const v = valueVia(ctx.data, tname, row, f.t, f.c); return v === undefined ? true : f.test(v); })); }
  function colValues(ctx, n){ if (n.k !== 'col') throw new Error('Expected a column like Table[Column]'); const T = ctx.data[lc(n.t)]; if (!T) throw new Error(`Table “${n.t}” isn’t in the Data Model`); const i = colIx(T, n.c); return rowsOf(ctx, n.t).map(r => r[i]); }
  const nums = a => a.map(num).filter(x => x != null);
  function evalA(n, ctx){
    switch (n.k){
      case 'lit': return n.v;
      case 'neg': { const v = num(evalA(n.v, ctx)); return v == null ? null : -v; }
      case 'not': return !evalA(n.v, ctx);
      case 'meas': { const m = M().measures.find(x => lc(x.name) === lc(n.name)); if (m) return measure(m, ctx);
        if (ctx.row){ const T = ctx.data[lc(ctx.row.t)]; return ctx.row.row[colIx(T, n.name)]; } throw new Error(`Measure [${n.name}] wasn’t found`); }
      case 'col': { if (ctx.row){ if (lc(ctx.row.t) === lc(n.t)) return ctx.row.row[colIx(ctx.data[lc(n.t)], n.c)]; const v = valueVia(ctx.data, ctx.row.t, ctx.row.row, n.t, n.c); if (v !== undefined) return v; }
        throw new Error(`${n.t}[${n.c}] needs an aggregation like SUM(${n.t}[${n.c}])`); }
      case 'bin': { if (n.op === '&&') return !!evalA(n.a, ctx) && !!evalA(n.b, ctx); if (n.op === '||') return !!evalA(n.a, ctx) || !!evalA(n.b, ctx);
        const a = evalA(n.a, ctx), b = evalA(n.b, ctx); if (n.op === '&') return txt(a) + txt(b);
        if ('=<><=>='.includes(n.op) && n.op.length <= 2 && !'+-*/^'.includes(n.op)){ const x = num(a), y = num(b); const c = x != null && y != null ? x - y : txt(a).localeCompare(txt(b), undefined, {sensitivity: 'base'}); return {'=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0}[n.op]; }
        const x = num(a), y = num(b); if (x == null && y == null) return null; const X = x || 0, Y = y || 0; switch (n.op){ case '+': return X + Y; case '-': return X - Y; case '*': return X * Y; case '/': if (!Y) throw new Error('Division by zero (use DIVIDE)'); return X / Y; case '^': return Math.pow(X, Y); } return null; }
      case 'fn': return FN(n, ctx);
      case 'tbl': throw new Error(`“${n.t}” needs to be used inside a function`);
    } return null; }
  function filterArg(a, ctx){ // CALCULATE filters → filter objects (or a removal marker)
    if (a.k === 'fn' && (a.name === 'ALL' || a.name === 'REMOVEFILTERS')){ const x = a.args[0]; if (!x) return {remove: '*'}; if (x.k === 'tbl') return {remove: lc(x.t)}; if (x.k === 'col') return {remove: lc(x.t) + '|' + lc(x.c)}; }
    if (a.k === 'fn' && a.name === 'KEEPFILTERS') return filterArg(a.args[0], ctx);
    if (a.k === 'bin' && (a.op === '&&' || a.op === '||')){ const A = filterArg(a.a, ctx), B = filterArg(a.b, ctx); if (A.t === B.t && A.c === B.c) return {t: A.t, c: A.c, test: v => a.op === '&&' ? A.test(v) && B.test(v) : A.test(v) || B.test(v)}; throw new Error('Combine conditions on the same column only'); }
    if (a.k === 'bin' && ['=', '<>', '<', '>', '<=', '>='].includes(a.op)){ const colN = a.a.k === 'col' ? a.a : a.b.k === 'col' ? a.b : null; if (!colN) throw new Error('A CALCULATE filter needs a column, like Sales[Region]="North"'); const other = colN === a.a ? a.b : a.a; const val = evalA(other, ctx); const op = colN === a.a ? a.op : ({'<': '>', '>': '<', '<=': '>=', '>=': '<='}[a.op] || a.op);
      return {t: colN.t, c: colN.c, test: v => { const x = num(v), y = num(val); const c = x != null && y != null ? x - y : txt(v).localeCompare(txt(val), undefined, {sensitivity: 'base'}); return {'=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0}[op]; }}; }
    if (a.k === 'fn' && a.name === 'FILTER'){ const T = a.args[0]; if (!T || T.k !== 'tbl') throw new Error('FILTER needs a table'); const keep = new Set(rowsOf(ctx, T.t).filter(row => evalA(a.args[1], {...ctx, row: {t: T.t, row}}))); return {t: T.t, rowSet: keep}; }
    throw new Error('CALCULATE filters look like Table[Column]="value"'); }
  function withFilters(ctx, args){ let fs = [...ctx.filters];
    for (const a of args){ const f = filterArg(a, ctx); if (f.remove){ fs = f.remove === '*' ? [] : fs.filter(x => !(f.remove === lc(x.t) || f.remove === lc(x.t) + '|' + lc(x.c))); continue; }
      if (f.rowSet){ fs.push({t: f.t, c: null, test: null, rows: f.rowSet}); continue; } fs = fs.filter(x => !(lc(x.t) === lc(f.t) && lc(x.c || '') === lc(f.c))); fs.push(f); }
    // row-set filters
    return {...ctx, filters: fs.map(f => f.rows ? {t: f.t, c: '__row', test: () => true, rows: f.rows} : f), row: null}; }
  function FN(n, ctx){ const A = n.args; const e = i => evalA(A[i], ctx);
    const agg = fn => { const v = colValues(ctx, A[0]); return fn(v); };
    const iter = (fn) => { const T = A[0]; if (!T || T.k !== 'tbl') throw new Error(n.name + ' needs a table first, like SUMX(Sales, Sales[Qty]*Sales[Price])'); const vals = rowsOf(ctx, T.t).map(row => evalA(A[1], {...ctx, row: {t: T.t, row}})); return fn(vals); };
    const sum = a => { const x = nums(a); return x.length ? x.reduce((p, q) => p + q, 0) : null; }, avg = a => { const x = nums(a); return x.length ? x.reduce((p, q) => p + q, 0) / x.length : null; }, mn = a => { const x = nums(a); return x.length ? Math.min(...x) : null; }, mx = a => { const x = nums(a); return x.length ? Math.max(...x) : null; };
    switch (n.name){
      case 'SUM': return agg(sum); case 'AVERAGE': return agg(avg); case 'MIN': return agg(mn); case 'MAX': return agg(mx);
      case 'COUNT': return agg(a => nums(a).length || null); case 'COUNTA': return agg(a => a.filter(v => v != null && v !== '').length || null); case 'COUNTBLANK': return agg(a => a.filter(v => v == null || v === '').length);
      case 'DISTINCTCOUNT': return agg(a => new Set(a.filter(v => v != null && v !== '').map(v => lc(txt(v)))).size || null);
      case 'MEDIAN': return agg(a => { const x = nums(a).sort((p, q) => p - q); if (!x.length) return null; const m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; });
      case 'COUNTROWS': { const T = A[0]; if (T.k === 'fn' && T.name === 'FILTER'){ return rowsOf(withFilters(ctx, [T]), T.args[0].t).length || null; } if (T.k !== 'tbl') throw new Error('COUNTROWS needs a table'); return rowsOf(ctx, T.t).length || null; }
      case 'SUMX': return iter(sum); case 'AVERAGEX': return iter(avg); case 'MINX': return iter(mn); case 'MAXX': return iter(mx); case 'COUNTX': return iter(a => nums(a).length || null);
      case 'CALCULATE': return evalA(A[0], withFilters(ctx, A.slice(1)));
      case 'DIVIDE': { const a = num(e(0)), b = num(e(1)); if (a == null) return null; if (!b) return A[2] ? e(2) : null; return a / b; }
      case 'IF': return e(0) ? e(1) : A[2] ? e(2) : null;
      case 'AND': return !!e(0) && !!e(1); case 'OR': return !!e(0) || !!e(1);
      case 'ABS': { const v = num(e(0)); return v == null ? null : Math.abs(v); } case 'ROUND': { const v = num(e(0)); const k = Math.pow(10, num(e(1)) || 0); return v == null ? null : Math.round(v * k) / k; }
      case 'ISBLANK': { const v = e(0); return v == null || v === ''; } case 'COALESCE': { for (let i = 0; i < A.length; i++){ const v = e(i); if (v != null && v !== '') return v; } return null; }
      case 'RELATED': { if (!ctx.row) throw new Error('RELATED works inside SUMX and similar'); const c = A[0]; const v = valueVia(ctx.data, ctx.row.t, ctx.row.row, c.t, c.c); if (v === undefined) throw new Error(`No relationship from ${ctx.row.t} to ${c.t}`); return v; }
      case 'SELECTEDVALUE': { const v = [...new Set(colValues(ctx, A[0]).map(txt))]; return v.length === 1 ? v[0] : A[1] ? e(1) : null; }
      case 'HASONEVALUE': return new Set(colValues(ctx, A[0]).map(txt)).size === 1;
      case 'FORMAT': return formatValue(num(e(0)) ?? e(0), String(e(1))).text;
      case 'BLANK': return null; case 'TRUE': return true; case 'FALSE': return false;
      case 'SWITCH': { const v = e(0); for (let i = 1; i + 1 < A.length; i += 2) if (txt(e(i)) === txt(v)) return e(i + 1); return A.length % 2 === 0 ? e(A.length - 1) : null; }
      case 'YEAR': case 'MONTH': case 'DAY': { const v = num(e(0)); if (v == null) return null; const d = serialToDate(v); return n.name === 'YEAR' ? d.getUTCFullYear() : n.name === 'MONTH' ? d.getUTCMonth() + 1 : d.getUTCDate(); }
      case 'ALL': case 'FILTER': case 'VALUES': throw new Error(n.name + ' is used inside CALCULATE or COUNTROWS');
    }
    throw new Error('DAX function ' + n.name + ' isn’t supported'); }
  function measure(m, ctx){ const d = (ctx.depth || 0) + 1; if (d > 30) throw new Error('Measures refer to each other in a loop'); return evalA(ast(m.expr), {...ctx, depth: d, row: null}); }

  /* ================================================================ Data Model PivotTable */
  const fieldLabel = f => `${f.t}[${f.c}]`;
  async function compute(cfg){ const data = await load(); oneIndex.clear();
    const base = {data, filters: (cfg.filters || []).filter(f => f.vals && f.vals.length).map(f => ({t: f.t, c: f.c, test: v => f.vals.includes(txt(v))})), row: null};
    const vals = cfg.values.map(v => v.measure ? M().measures.find(m => lc(m.name) === lc(v.measure)) : {name: `${v.fn} of ${v.c}`, expr: `${v.fn}('${v.t}'[${v.c}])`, implicit: true}).filter(Boolean);
    if (!vals.length) throw new Error('Choose at least one value or measure');
    const distinct = f => { const T = data[lc(f.t)]; if (!T) throw new Error(`Table “${f.t}” isn’t in the Data Model`); const i = colIx(T, f.c); const s = [...new Set(T.rows.map(r => txt(r[i])))].filter(x => x !== ''); const numeric = s.every(x => !isNaN(+x)); return s.sort((a, b) => numeric ? a - b : a.localeCompare(b, undefined, {numeric: true})); };
    const fc = (f, v) => ({t: f.t, c: f.c, test: x => txt(x) === v});
    const ev = (fs) => vals.map(m => { try { const r = measure(m, {...base, filters: [...base.filters, ...fs]}); return r; } catch(e){ return '#' + e.message; } });
    const rows = cfg.rows || [], col = cfg.cols && cfg.cols[0];
    const colItems = col ? distinct(col) : [null];
    const lines = []; // {label: [..], level, total, cells: [[vals per measure] per col item + total]}
    const cellsFor = fs => [...colItems.map(ci => ci == null ? ev(fs) : ev([...fs, fc(col, ci)])), ...(col ? [ev(fs)] : [])];
    const empty = cells => cells.every(c => c.every(v => v == null || v === ''));
    if (!rows.length) lines.push({label: ['Total'], cells: cellsFor([]), total: true});
    else { for (const a of distinct(rows[0])){ const fa = [fc(rows[0], a)]; const cells = cellsFor(fa); if (empty(cells)) continue;
        if (rows[1]){ const sub = []; for (const b of distinct(rows[1])){ const cb = cellsFor([...fa, fc(rows[1], b)]); if (!empty(cb)) sub.push({label: ['', b], cells: cb}); } if (!sub.length) continue; lines.push({label: [a, ''], cells, sub: true}); lines.push(...sub); }
        else lines.push({label: [a], cells}); }
      lines.push({label: ['Grand total', ...(rows[1] ? [''] : [])], cells: cellsFor([]), total: true}); }
    return {vals, rows, col, colItems, lines}; }
  function writeOut(s, p, res){ const at = p.at; const nRowF = Math.max(1, res.rows.length); const per = res.vals.length; const colsN = res.col ? res.colItems.length + 1 : 1;
    const R = (r, c, v, st) => { const x = {}; if (typeof v === 'string' && v.startsWith('#')){ x.v = new XErr('#VALUE!'); } else if (v != null && v !== '') x.v = v; if (st) x.s = st; setCell(s, at.r + r, at.c + c, x); };
    const hdr = {b: true, fill: '#1E7B47', color: '#FFFFFF'}; let r = 0;
    if (res.col){ R(r, 0, fieldLabel(res.col).replace(/^.*\[|\]$/g, '') + ' →', {i: true, color: '#7F7F7F'}); r++; }
    for (let i = 0; i < nRowF; i++) R(r, i, res.rows[i] ? res.rows[i].c : '', hdr);
    for (let j = 0; j < colsN; j++) for (let k = 0; k < per; k++){ const label = res.col ? (j < res.colItems.length ? res.colItems[j] : 'Total') + (per > 1 ? ' · ' + res.vals[k].name : '') : res.vals[k].name; R(r, nRowF + j * per + k, label, hdr); }
    r++; const nf = k => res.vals[k].nf || null;
    for (const ln of res.lines){ const st = ln.total ? {b: true, fill: '#E2EFDA', bd: {t: {style: 'thin', color: '#1E7B47'}}} : ln.sub ? {b: true} : null; for (let i = 0; i < nRowF; i++) R(r, i, ln.label[i] ?? '', st);
      ln.cells.forEach((cv, j) => cv.forEach((v, k) => R(r, nRowF + j * per + k, v, {...(st || {}), ...(nf(k) ? {nf: nf(k)} : {})}))); r++; }
    for (let c = 0; c < nRowF + colsN * per; c++) s.colW[at.c + c] = Math.max(s.colW[at.c + c] || 0, c < nRowF ? 140 : 110);
    return {r1: at.r, c1: at.c, r2: at.r + r - 1, c2: at.c + nRowF + colsN * per - 1}; }
  async function build(s, p){ const res = await compute(p.cfg); tx(s, 'Data Model PivotTable', () => { if (p.out) clearRange(s, p.out, 'all'); p.out = writeOut(s, p, res); }, true); }
  async function refreshAll(quiet){ cache = null; let n = 0; for (const s of wb().sheets) for (const p of s.dmPivots || []){ try { await build(s, p); n++; } catch(e){ if (!quiet) toast(e.message, 5000); } } if (!quiet){ Calc.invalidate(); Grid.refresh(); App.dirty(); toast(n ? `Refreshed ${n} Data Model PivotTable${n === 1 ? '' : 's'}` : 'No Data Model PivotTables yet'); } return n; }
  const dmAt = (s, r, c) => (s.dmPivots || []).find(p => p.out && inRange(p.out, r, c));
  async function pivotDialog(ex){ if (!M().tables.length) return manage('tables', 'Add your tables to the Data Model first, then link them with relationships.'); let data; try { cache = null; data = await load(); } catch(e){ return toast(e.message, 5000); }
    const allF = []; for (const t of M().tables){ const T = data[lc(t.name)]; T.cols.forEach(c => allF.push({t: t.name, c})); }
    const fsel = (val, none) => { const s = h('select', {class: 'inp'}); if (none) s.append(h('option', {value: ''}, none)); allF.forEach(f => s.append(h('option', {value: f.t + '\u0001' + f.c}, `${f.t} › ${f.c}`))); if (val) s.value = val.t + '\u0001' + val.c; return s; };
    const parseF = v => { if (!v) return null; const [t, c] = v.split('\u0001'); return {t, c}; };
    const cfg = ex ? clone(ex.cfg) : {rows: [], cols: [], values: [], filters: []};
    const r1 = fsel(cfg.rows[0], '(none)'), r2 = fsel(cfg.rows[1], '(none)'), c1 = fsel(cfg.cols[0], '(none)');
    const valBox = h('div', {style: 'display:flex;flex-direction:column;gap:6px'}); const addVal = v => { const s = h('select', {class: 'inp'}); M().measures.forEach(m => s.append(h('option', {value: 'm:' + m.name}, '∑ ' + m.name))); for (const fn of ['SUM', 'AVERAGE', 'COUNT', 'DISTINCTCOUNT', 'MIN', 'MAX']) allF.forEach(f => s.append(h('option', {value: `f:${fn}\u0001${f.t}\u0001${f.c}`}, `${fn} of ${f.t} › ${f.c}`)));
      if (v) s.value = v.measure ? 'm:' + v.measure : `f:${v.fn}\u0001${v.t}\u0001${v.c}`; const x = h('button', {class: 'btn sm', type: 'button'}, '✕'); x.addEventListener('click', () => row.remove()); const row = h('div', {style: 'display:grid;grid-template-columns:1fr auto;gap:6px'}, s, x); valBox.append(row); };
    (cfg.values.length ? cfg.values : [M().measures[0] ? {measure: M().measures[0].name} : null]).forEach(addVal); const more = h('button', {class: 'btn sm', type: 'button'}, '+ Add value'); more.addEventListener('click', () => addVal());
    const ff = fsel(cfg.filters[0], '(no filter)'); const fv = h('input', {class: 'inp', placeholder: 'Values to include, comma separated (blank = all)', value: cfg.filters[0] ? cfg.filters[0].vals.join(', ') : ''});
    dialog(ex ? 'Change Data Model PivotTable' : 'PivotTable from Data Model', h('div', {style: 'display:flex;flex-direction:column;gap:10px'}, h('p', {class: 'hint'}, 'Fields can come from any related table. Measures are defined in Data › Manage Data Model.'), h('div', {class: 'pvfields'}, field('Rows', r1), field('Then by', r2), field('Columns', c1)), field('Values', valBox), more, h('div', {class: 'pvfields'}, field('Filter', ff), field('Include', fv))),
      [['Cancel'], [ex ? 'Update' : 'Create', 'primary', async () => { cfg.rows = [parseF(r1.value), parseF(r2.value)].filter(Boolean); cfg.cols = [parseF(c1.value)].filter(Boolean); cfg.values = [...valBox.children].map(rw => { const v = rw.children[0].value; if (v.startsWith('m:')) return {measure: v.slice(2)}; const [fn, t, c] = v.slice(2).split('\u0001'); return {fn, t, c}; }); const f = parseF(ff.value); cfg.filters = f ? [{...f, vals: fv.value.split(',').map(x => x.trim()).filter(Boolean)}] : [];
        if (!cfg.values.length) return toast('Add a value'), false; try { await compute(cfg); } catch(e){ toast(e.message, 5000); return false; }
        let s, p; if (ex){ s = wb().sheets.find(x => (x.dmPivots || []).includes(ex)); p = ex; p.cfg = cfg; } else { History.wbChange(() => { let n = 1; while (wb().sheets.some(x => x.name === 'Model Pivot ' + n)) n++; s = newSheet('Model Pivot ' + n); wb().sheets.splice(wb().active + 1, 0, s); }, 'New sheet'); p = {id: uid(), cfg, at: {r: 2, c: 0}}; s.dmPivots = [p]; }
        await build(s, p); Grid.showSheet(wb().sheets.indexOf(s)); UI.tabs(); Calc.invalidate(); Grid.refresh(); UI.onSel(); App.dirty(); toast('Data Model PivotTable ready'); }]]); }

  /* ================================================================ export to a regular Excel PivotTable (flattened data) */
  const AGG_X = {SUM: 'Sum', AVERAGE: 'Average', MIN: 'Min', MAX: 'Max', COUNT: 'Count', COUNTA: 'Count'};
  async function flatten(p, extra = []){ const cfg = p.cfg; cache = null; const data = await load(); oneIndex.clear();
    const need = []; const addF = (t, c) => { const T = data[lc(t)]; if (!T) throw new Error(`Table “${t}” isn’t in the Data Model`); const real = T.cols[colIx(T, c)]; let i = need.findIndex(x => lc(x.t) === lc(t) && lc(x.c) === lc(real)); if (i < 0){ need.push({t: T.name, c: real}); i = need.length - 1; } return i; };
    const rowF = (cfg.rows || []).map(f => addF(f.t, f.c)); const colF = cfg.cols && cfg.cols[0] ? addF(cfg.cols[0].t, cfg.cols[0].c) : null;
    const filters = (cfg.filters || []).filter(f => f.vals && f.vals.length).map(f => ({f: addF(f.t, f.c), vals: [...f.vals]}));
    const extraIx = extra.map(f => addF(f.t, f.c)); const facts = new Set();
    const tr = (n, depth = 0) => { if (depth > 30) throw new Error('measures refer to each other in a loop');
      if (n.k === 'meas'){ const m = M().measures.find(x => lc(x.name) === lc(n.name)); if (!m) throw new Error(`measure [${n.name}] wasn’t found`); return tr(ast(m.expr), depth + 1); }
      if (n.k === 'lit' && typeof n.v === 'number') return {e: String(n.v)};
      if (n.k === 'fn'){ if (AGG_X[n.name] && n.args.length === 1 && n.args[0].k === 'col'){ facts.add(lc(n.args[0].t)); return {agg: AGG_X[n.name], f: addF(n.args[0].t, n.args[0].c)}; }
        if (n.name === 'COUNTROWS' && n.args[0] && n.args[0].k === 'tbl'){ const T = data[lc(n.args[0].t)]; if (!T) throw new Error(`table ${n.args[0].t} isn’t in the model`); facts.add(lc(T.name)); return {agg: 'Count', f: addF(T.name, T.cols[0])}; }
        if (n.name === 'DIVIDE' && n.args.length >= 2) return {e: `(${ex(n.args[0], depth)})/(${ex(n.args[1], depth)})`};
        throw new Error(n.name === 'DISTINCTCOUNT' ? 'it uses DISTINCTCOUNT' : `it uses ${n.name}`); }
      if (n.k === 'bin' && ['+', '-', '*', '/'].includes(n.op)) return {e: `(${ex(n.a, depth)})${n.op}(${ex(n.b, depth)})`};
      if (n.k === 'neg') return {e: `-(${ex(n.v, depth)})`};
      throw new Error('it uses a formula Excel PivotTables can’t do'); };
    const ex = (n, depth) => { const r = tr(n, depth + 1); if (r.e != null) return r.e; if (r.agg !== 'Sum') throw new Error(`it uses ${r.agg.toUpperCase()} inside a calculation`); return `\u0001${r.f}\u0001`; };
    const vals = cfg.values.map(v => { if (v.measure){ const m = M().measures.find(x => lc(x.name) === lc(v.measure)); if (!m) throw new Error(`measure ${v.measure} wasn’t found`); let r; try { r = tr(ast(m.expr)); } catch(e){ throw new Error(`Measure “${m.name}” can’t be a regular Excel PivotTable value: ${e.message}`); } return r.e != null ? {calc: r.e, name: m.name} : {f: r.f, agg: r.agg, name: m.name}; }
      if (!AGG_X[v.fn]) throw new Error(`${v.fn} of ${v.c} can’t be a regular Excel PivotTable value`); facts.add(lc(v.t)); return {f: addF(v.t, v.c), agg: AGG_X[v.fn]}; });
    if (facts.size > 1) throw new Error('its values add up rows of more than one table');
    const used = new Set(need.map(n => lc(n.t))); const cands = facts.size ? [...facts] : M().tables.map(t => lc(t.name));
    const fact = cands.find(t => [...used].every(u => path(data, t, u) != null)); if (!fact) throw new Error('its fields aren’t all linked to one table');
    const names = []; need.forEach(n => { let nm = need.some(o => o !== n && lc(o.c) === lc(n.c)) ? `${n.t} ${n.c}` : n.c; const base = nm; let k = 2; while (names.some(x => lc(x) === lc(nm))) nm = base + ' ' + k++; names.push(nm); });
    const T = data[fact]; const rows = T.rows.map(row => need.map(n => { const v = valueVia(data, T.name, row, n.t, n.c); return v === undefined ? null : v; }));
    const q = s => "'" + s.replace(/'/g, "''") + "'";
    return {names, rows, rowF, colF, filters, extra: extraIx, vals: vals.map(v => v.calc != null ? {...v, calc: v.calc.replace(/\u0001(\d+)\u0001/g, (_, i) => q(names[+i]))} : v)}; }
  /* ================================================================ Manage Data Model */
  function sources(){ const out = []; for (const s of wb().sheets) for (const t of s.tables) out.push({kind: 'table', name: t.name, sheetId: s.id, table: t.name, label: `Table ${t.name} (${s.name})`}); if (typeof PQ !== 'undefined') for (const q of PQ.list()) out.push({kind: 'query', name: q.name.replace(/[^\w ]/g, '').trim() || 'Query', queryId: q.id, label: `Query ${q.name}`}); return out; }
  async function manage(tab = 'tables', note){ document.querySelectorAll('.ppm').forEach(e => e.remove()); const wrap = h('div', {class: 'ppm xpanel', role: 'dialog', 'aria-label': 'Data Model'}); document.body.append(wrap); let cur = tab;
    const close = () => { wrap.remove(); cache = null; App.dirty(); UI.buildRibbon(); };
    const draw = async () => { cache = null; let data = {}; let err = null; try { data = await load(); } catch(e){ err = e.message; }
      const tabs = h('div', {class: 'qtabs', style: 'margin:8px 0'}, ...[['tables', 'Tables'], ['rels', 'Relationships'], ['measures', 'Measures'], ['diagram', 'Diagram']].map(([k, n]) => { const b = h('button', {type: 'button', class: k === cur ? 'on' : ''}, n); b.addEventListener('click', () => { cur = k; draw(); }); return b; }));
      const body = h('div', {class: 'ppbody'}); if (note) body.append(h('p', {class: 'notice'}, note)); if (err) body.append(h('p', {class: 'notice'}, '⚠ ' + err));
      if (cur === 'tables'){ const srcs = sources(); const used = new Set(M().tables.map(t => t.queryId || t.table));
        for (const t of M().tables){ const T = data[lc(t.name)]; const x = h('button', {class: 'btn sm danger', type: 'button'}, 'Remove'); x.addEventListener('click', () => { M().tables = M().tables.filter(y => y !== t); M().rels = M().rels.filter(r => lc(r.ft) !== lc(t.name) && lc(r.tt) !== lc(t.name)); draw(); });
          body.append(h('div', {class: 'ppcard'}, h('div', {style: 'display:flex;gap:8px;align-items:center'}, h('b', {style: 'flex:1'}, t.name), h('small', {class: 'hint'}, T ? `${T.rows.length} rows` : ''), x), T ? h('div', {class: 'ppcols'}, ...T.cols.map(c => h('span', {}, c))) : null)); }
        const free = srcs.filter(s => !used.has(s.queryId || s.table)); const sel = h('select', {class: 'inp'}); free.forEach((s, i) => sel.append(h('option', {value: i}, s.label))); const add = h('button', {class: 'btn primary sm', type: 'button'}, 'Add to Data Model');
        add.addEventListener('click', () => { const s = free[+sel.value]; if (!s) return; let n = s.name.replace(/^Q_/, ''), k = 2; while (M().tables.some(t => lc(t.name) === lc(n))) n = s.name + k++; M().tables.push({name: n, kind: s.kind, sheetId: s.sheetId, table: s.table, queryId: s.queryId}); draw(); });
        body.append(h('div', {class: 'ppcard'}, h('b', {}, 'Add a table'), free.length ? h('div', {style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px'}, sel, add) : h('p', {class: 'hint'}, 'Format your data as tables first (Home › Format as Table), or load queries (Data › Get Data). Then add them here.'))); }
      if (cur === 'rels'){ for (const r of M().rels){ const x = h('button', {class: 'btn sm danger', type: 'button'}, 'Delete'); x.addEventListener('click', () => { M().rels = M().rels.filter(y => y !== r); draw(); }); const tg = h('button', {class: 'btn sm', type: 'button'}, r.active === false ? 'Turn on' : 'Turn off'); tg.addEventListener('click', () => { r.active = r.active === false; draw(); });
          body.append(h('div', {class: 'ppcard', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'}, h('span', {style: 'flex:1'}, h('b', {}, `${r.ft}[${r.fc}]`), ' many → one ', h('b', {}, `${r.tt}[${r.tc}]`), r.active === false ? h('small', {class: 'hint'}, ' (off)') : null), tg, x)); }
        const cols = []; for (const t of M().tables){ const T = data[lc(t.name)]; if (T) T.cols.forEach(c => cols.push([t.name, c])); } const mk = () => { const s = h('select', {class: 'inp'}); cols.forEach(([t, c]) => s.append(h('option', {value: t + '\u0001' + c}, `${t} › ${c}`))); return s; };
        const a = mk(), b = mk(); const add = h('button', {class: 'btn primary sm', type: 'button'}, 'Add relationship');
        add.addEventListener('click', () => { const [ft, fc] = a.value.split('\u0001'), [tt, tc] = b.value.split('\u0001'); if (lc(ft) === lc(tt)) return toast('Pick columns from two different tables'); const T = data[lc(tt)]; const i = colIx(T, tc); const keys = T.rows.map(r => lc(txt(r[i]))).filter(Boolean); if (new Set(keys).size !== keys.length){ const F = data[lc(ft)]; const j = colIx(F, fc); const k2 = F.rows.map(r => lc(txt(r[j]))).filter(Boolean); if (new Set(k2).size === k2.length){ M().rels.push({ft: tt, fc: tc, tt: ft, tc: fc}); toast('Linked (the “one” side was the first table, so I swapped them)'); return draw(); } return toast(`${tt}[${tc}] has repeated values, so it can’t be the “one” side. Pick a column with unique values (like an ID).`, 5000); } M().rels.push({ft, fc, tt, tc}); draw(); });
        const auto = h('button', {class: 'btn sm', type: 'button'}, 'Detect relationships'); auto.addEventListener('click', () => { let n = 0; for (const [t1, c1] of cols) for (const [t2, c2] of cols){ if (lc(t1) === lc(t2) || lc(c1) !== lc(c2)) continue; if (M().rels.some(r => (lc(r.ft) === lc(t1) && lc(r.tt) === lc(t2)) || (lc(r.ft) === lc(t2) && lc(r.tt) === lc(t1)))) continue; const T2 = data[lc(t2)], T1 = data[lc(t1)]; const u = T => { const i = colIx(T, c1); const k = T.rows.map(r => lc(txt(r[i]))).filter(Boolean); return k.length && new Set(k).size === k.length; }; if (u(T2) && !u(T1)){ M().rels.push({ft: t1, fc: c1, tt: t2, tc: c2}); n++; } } toast(n ? `Found ${n} relationship${n === 1 ? '' : 's'}` : 'No new relationships found (columns need the same name, one side with unique values)', 4000); draw(); });
        body.append(h('div', {class: 'ppcard'}, h('b', {}, 'New relationship'), h('p', {class: 'hint'}, 'Pick the column in the detail table (many rows, e.g. Visits › PatientID), then the matching column in the lookup table (one row each, e.g. Patients › PatientID).'), field('Many side', a), field('One side', b), h('div', {style: 'display:flex;gap:8px;margin-top:8px'}, add, auto))); }
      if (cur === 'measures'){ for (const m of M().measures){ let val = ''; try { val = txt(measure(m, {data, filters: [], row: null})); if (m.nf) val = formatValue(+val, m.nf).text; } catch(e){ val = '⚠ ' + e.message; }
          const ed = h('button', {class: 'btn sm', type: 'button'}, 'Edit'); ed.addEventListener('click', () => measureDlg(m, draw)); const x = h('button', {class: 'btn sm danger', type: 'button'}, 'Delete'); x.addEventListener('click', () => { M().measures = M().measures.filter(y => y !== m); draw(); });
          body.append(h('div', {class: 'ppcard'}, h('div', {style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'}, h('b', {style: 'flex:1'}, m.name), h('small', {class: 'hint'}, 'Total: ' + val), ed, x), h('code', {class: 'ppcode'}, m.expr))); }
        const add = h('button', {class: 'btn primary sm', type: 'button'}, '+ New measure'); add.addEventListener('click', () => measureDlg(null, draw)); body.append(add); }
      if (cur === 'diagram') body.append(diagram(data));
      wrap.innerHTML = ''; wrap.append(h('header', {class: 'bar gut'}, h('button', {class: 'ib', type: 'button', 'aria-label': 'Close', onclick: close, html: S('<path d="M15 18l-6-6 6-6"/>')}), h('b', {style: 'font-size:17px;flex:1'}, 'Data Model (Power Pivot)'), h('button', {class: 'btn primary sm', type: 'button', onclick: () => { close(); pivotDialog(); }}, 'PivotTable')), h('div', {class: 'gut', style: 'flex:1;overflow:auto;padding-bottom:30px'}, tabs, body)); note = null; };
    draw(); }
  function diagram(data){ const ts = M().tables; if (!ts.length) return h('p', {class: 'hint'}, 'No tables yet'); const W = 760, n = ts.length; const pos = {}; ts.forEach((t, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; pos[lc(t.name)] = {x: W / 2 + Math.cos(a) * (n > 1 ? 250 : 0) - 80, y: 230 + Math.sin(a) * (n > 1 ? 160 : 0) - 60}; });
    let svg = `<svg viewBox="0 0 ${W} 470" style="width:100%;max-width:${W}px;background:var(--surface);border-radius:12px;border:1px solid var(--line)" font-family="var(--f-ui)" font-size="12">`;
    for (const r of M().rels){ const a = pos[lc(r.ft)], b = pos[lc(r.tt)]; if (!a || !b) continue; svg += `<line x1="${a.x + 80}" y1="${a.y + 60}" x2="${b.x + 80}" y2="${b.y + 60}" stroke="#1E7B47" stroke-width="2" ${r.active === false ? 'stroke-dasharray="5 4"' : ''}/><text x="${(a.x + b.x) / 2 + 80}" y="${(a.y + b.y) / 2 + 56}" text-anchor="middle" fill="#1E7B47">${xmlEsc(r.fc)} → ${xmlEsc(r.tc)}</text>`; }
    for (const t of ts){ const p = pos[lc(t.name)]; const T = data[lc(t.name)] || {cols: []}; const cols = T.cols.slice(0, 6); svg += `<g><rect x="${p.x}" y="${p.y}" width="160" height="${30 + cols.length * 16 + (T.cols.length > 6 ? 14 : 0)}" rx="8" fill="var(--bg)" stroke="#1E7B47"/><rect x="${p.x}" y="${p.y}" width="160" height="24" rx="8" fill="#1E7B47"/><text x="${p.x + 10}" y="${p.y + 16}" fill="#fff" font-weight="600">${xmlEsc(t.name)}</text>${cols.map((c, i) => `<text x="${p.x + 10}" y="${p.y + 40 + i * 16}" fill="currentColor">${xmlEsc(c)}</text>`).join('')}${T.cols.length > 6 ? `<text x="${p.x + 10}" y="${p.y + 40 + 6 * 16}" fill="gray">+${T.cols.length - 6} more</text>` : ''}</g>`; }
    return h('div', {html: svg + '</svg>', style: 'color:var(--ink)'}); }
  function measureDlg(m, done){ const name = h('input', {class: 'inp', value: m ? m.name : ''}), expr = h('textarea', {class: 'inp', rows: 4, style: 'font-family:var(--f-mono);font-size:14px'}); expr.value = m ? m.expr : '';
    const nf = h('select', {class: 'inp'}); [['', 'General'], [`"${CURRENCY}"#,##0`, 'Currency'], ['#,##0', 'Whole number'], ['#,##0.00', 'Decimal'], ['0.0%', 'Percent']].forEach(([v, n]) => nf.append(h('option', {value: v}, n))); nf.value = m && m.nf || '';
    const out = h('p', {class: 'hint'}); const test = async () => { try { const data = await load(); const v = measure({name: name.value, expr: expr.value}, {data, filters: [], row: null}); out.textContent = 'Result for everything: ' + (nf.value ? formatValue(+v, nf.value).text : txt(v)); out.style.color = ''; } catch(e){ out.textContent = '⚠ ' + e.message; out.style.color = 'var(--warn)'; } };
    expr.addEventListener('input', () => { clearTimeout(test.t); test.t = setTimeout(test, 300); });
    const tables = M().tables.map(t => t.name); const hint = h('p', {class: 'hint'}, 'Examples: SUM(Visits[Fee]) · DISTINCTCOUNT(Visits[PatientID]) · DIVIDE([Total fees], [Patients]) · CALCULATE(SUM(Visits[Fee]), Patients[Sex]="F") · SUMX(Sales, Sales[Qty]*RELATED(Products[Price])). Tables: ' + tables.join(', '));
    dialog(m ? 'Edit measure' : 'New measure', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, field('Name', name), field('Formula (DAX)', expr), hint, field('Format', nf), out), [['Cancel'], ['Save', 'primary', async () => { const n = name.value.trim(); if (!n) return toast('Give the measure a name'), false; if (M().measures.some(x => x !== m && lc(x.name) === lc(n))) return toast('Another measure has that name'), false; try { parse(expr.value); } catch(e){ toast(e.message, 4000); return false; }
      if (m) Object.assign(m, {name: n, expr: expr.value.trim().replace(/^=/, ''), nf: nf.value}); else M().measures.push({name: n, expr: expr.value.trim().replace(/^=/, ''), nf: nf.value}); astCache.clear(); done(); }]]); if (m) test(); }
  function addCurrent(){ const s = G.sh; const tb = tableAt(s, G.sel.r, G.sel.c); if (!tb) return toast('Select a cell in a table (Home › Format as Table) first'); if (M().tables.some(t => t.sheetId === s.id && t.table === tb.name)) return manage('tables', `“${tb.name}” is already in the Data Model`); M().tables.push({name: tb.name, kind: 'table', sheetId: s.id, table: tb.name}); App.dirty(); manage('tables', `Added “${tb.name}” to the Data Model`); }

  /* ================================================================ Slicers */
  const slicers = s => (s.slicers = s.slicers || []);
  function targetOf(o){ const s = wb().sheets.find(x => x.id === o.target.sheetId); if (!s) return null; if (o.target.kind === 'table') return {s, t: s.tables.find(x => x.name === o.target.table)}; if (o.target.kind === 'pivot') return {s, p: (s.pivots || []).find(x => x.id === o.target.pid)}; if (o.target.kind === 'dm') return {s, p: (s.dmPivots || []).find(x => x.id === o.target.pid)}; return null; }
  async function itemsOf(o){ const tg = targetOf(o); if (!tg) return [];
    if (tg.t){ const g = tg.t.range; const c = g.c1 + o.col; const v = new Set(); for (let r = g.r1 + 1; r <= g.r2 - (tg.t.total ? 1 : 0); r++) v.add(displayAt(tg.s, r, c).text); return [...v]; }
    if (o.target.kind === 'pivot' && tg.p){ const src = wb().sheets.find(x => x.id === tg.p.src.sheetId); const g = tg.p.src.g; const v = new Set(); for (let r = g.r1 + 1; r <= g.r2; r++) v.add(displayAt(src, r, o.col).text); return [...v]; }
    if (o.target.kind === 'dm'){ const data = await load(); const T = data[lc(o.field.t)]; if (!T) return []; const i = colIx(T, o.field.c); return [...new Set(T.rows.map(r => txt(r[i])))]; } return []; }
  const sortItems = a => a.sort((x, y) => (x === '') - (y === '') || x.localeCompare(y, undefined, {numeric: true}));
  const itemCache = new Map();
  function slicerHTML(o, p){ const items = itemCache.get(o.id) || []; if (!itemCache.has(o.id)) itemsOf(o).then(v => { itemCache.set(o.id, sortItems(v)); Objects.render(); }).catch(() => {});
    const z = Grid.z(); const sel = new Set(o.sel || []); const all = !sel.size;
    return `<div class="slc" style="font-size:${Math.round(13 * z)}px"><div class="slh"><span>${xmlEsc(o.title)}</span><button class="slb slx" data-sl="${o.id}" data-v="\u0000clear" title="Clear filter" aria-label="Clear filter"${all ? ' disabled' : ''}>⊘</button></div><div class="slbody">${items.map(v => `<button class="slb${all || sel.has(v) ? ' on' : ''}" data-sl="${o.id}" data-v="${xmlEsc(v)}">${xmlEsc(v === '' ? '(blank)' : v)}</button>`).join('')}</div></div>`; }
  async function applySlicer(o){ const tg = targetOf(o); if (!tg) return; const sel = o.sel || [];
    if (tg.t){ tx(tg.s, 'Slicer', () => { const f = tg.s.filter && tg.s.filter.range.r1 === tg.t.range.r1 ? tg.s.filter : (tg.s.filter = {range: {...tg.t.range}, cols: {}}); const c = tg.t.range.c1 + o.col; if (sel.length) f.cols[c] = {values: [...sel]}; else delete f.cols[c]; }, true); }
    else if (o.target.kind === 'pivot' && tg.p){ tx(tg.s, 'Slicer', () => { tg.p.filter = sel.length ? {f: o.col, vals: [...sel]} : null; if (tg.p.out) clearRange(tg.s, tg.p.out, 'all'); tg.p.out = More.buildPivot(tg.s, tg.p); }, true); }
    else if (o.target.kind === 'dm' && tg.p){ tg.p.cfg.filters = (tg.p.cfg.filters || []).filter(f => !(lc(f.t) === lc(o.field.t) && lc(f.c) === lc(o.field.c))); if (sel.length) tg.p.cfg.filters.push({t: o.field.t, c: o.field.c, vals: [...sel]}); await build(tg.s, tg.p); }
    for (const s of wb().sheets) for (const x of slicers(s)) if (x !== o && x.target.sheetId === o.target.sheetId) itemCache.delete(x.id);
    Calc.invalidate(); Grid.refresh(); UI.status(); App.dirty(); }
  async function onSlicer(btn){ const o = slicers(G.sh).find(x => x.id === btn.dataset.sl); if (!o) return; const v = btn.dataset.v; const items = itemCache.get(o.id) || [];
    if (v === '\u0000clear') o.sel = []; else { const sel = new Set(o.sel && o.sel.length ? o.sel : []); if (!sel.size){ sel.add(v); } else if (sel.has(v)){ sel.delete(v); } else sel.add(v); o.sel = sel.size === items.length ? [] : [...sel]; }
    await applySlicer(o); }
  async function insertSlicer(){ const s = G.sh; const tb = tableAt(s, G.sel.r, G.sel.c); const pv = typeof More !== 'undefined' ? (s.pivots || []).find(p => p.out && inRange(p.out, G.sel.r, G.sel.c)) : null; const dm = dmAt(s, G.sel.r, G.sel.c);
    let target, fields; if (dm){ target = {kind: 'dm', sheetId: s.id, pid: dm.id}; const data = await load(); fields = []; for (const t of M().tables){ const T = data[lc(t.name)]; if (T) T.cols.forEach(c => fields.push({label: `${t.name} › ${c}`, field: {t: t.name, c}})); } }
    else if (pv){ target = {kind: 'pivot', sheetId: s.id, pid: pv.id}; const src = wb().sheets.find(x => x.id === pv.src.sheetId); const g = pv.src.g; fields = []; for (let c = g.c1; c <= g.c2; c++) fields.push({label: displayAt(src, g.r1, c).text || colName(c), col: c}); }
    else if (tb){ target = {kind: 'table', sheetId: s.id, table: tb.name}; fields = []; for (let c = tb.range.c1; c <= tb.range.c2; c++) fields.push({label: displayAt(s, tb.range.r1, c).text || colName(c), col: c - tb.range.c1}); }
    else return toast('Select a cell in a table or PivotTable first, then insert a slicer');
    const box = h('div', {class: 'flist'}); const boxes = fields.map(f => { const cb = h('input', {type: 'checkbox'}); box.append(h('label', {class: 'chkrow'}, cb, ' ' + f.label)); return [f, cb]; });
    dialog('Insert slicers', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, h('p', {class: 'hint'}, 'Tick the fields to filter by. Each one gets a panel of buttons.'), box), [['Cancel'], ['OK', 'primary', () => { const pick = boxes.filter(x => x[1].checked).map(x => x[0]); if (!pick.length) return toast('Tick a field'), false;
      if (G.edit) Grid.commitEdit(); const area = dm ? dm.out : pv ? pv.out : tb.range; pick.forEach((f, i) => { const o = {slicer: true, target, title: f.label.split(' › ').pop(), col: f.col, field: f.field, sel: [], w: 170, h: 220}; Objects.add('slicers', o); o.r = area.r1; o.c = area.c2 + 1; o.dx = 12 + i * 180; o.dy = 0; }); Objects.render(); App.dirty(); }]]); }

  /* ================================================================ wiring */
  const ext = {
    ribbon(tab, r, {grp, rb, o}){
      if (tab === 'data') r.append(grp('Data Model', rb(IC.model, 'Manage Data Model (Power Pivot)', () => manage(), {label: 'Manage Model'}), rb(IC.model, 'Add table to Data Model', addCurrent, {label: 'Add to Model'}), rb(IC.rel, 'Relationships', () => manage('rels'), {label: 'Relationships'}), rb(IC.measure, 'Measures', () => manage('measures'), {label: 'Measures'}), rb(IC.pivot, 'PivotTable from Data Model', () => pivotDialog(), {label: 'Model PivotTable'})));
      if (tab === 'insert'){ const g = r.firstChild && r.firstChild.querySelector('.row'); if (g) g.append(rb(IC.slicer, 'Slicer', insertSlicer, {label: 'Slicer'}), rb(IC.pivot, 'PivotTable from Data Model', () => pivotDialog(), {label: 'Model Pivot'})); }
      if (tab === 'dmpivot'){ const p = dmAt(G.sh, G.sel.r, G.sel.c); if (p) r.append(grp('Data Model PivotTable', rb(IC.pivot, 'Change fields', () => pivotDialog(p), {label: 'Fields'}), rb(S('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'), 'Refresh', async () => { cache = null; await build(G.sh, p); Calc.invalidate(); Grid.refresh(); App.dirty(); }, {label: 'Refresh'}), rb(IC.slicer, 'Insert slicer', insertSlicer, {label: 'Slicer'}), rb(IC.model, 'Manage Data Model', () => manage(), {label: 'Model'}))); }
      if (tab === 'slicer' && o && o.slicer) r.append(grp('Slicer', rb(S('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), 'Caption', () => { const i = h('input', {class: 'inp', value: o.title}); dialog('Slicer caption', i, [['Cancel'], ['OK', 'primary', () => { o.title = i.value || o.title; Objects.render(); App.dirty(); }]]); }, {label: 'Caption'}), rb(S('<path d="M5 5l14 14M19 5L5 19"/>'), 'Clear filter', () => { o.sel = []; applySlicer(o); }, {label: 'Clear'}), rb(S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'), 'Delete slicer', () => { Objects.remove(o.id); UI.buildTabs(); }, {label: 'Delete'})));
    },
    ctxTab(){ const o = G.objSel && Objects.find(G.objSel); if (o && o.slicer) return ['slicer', 'Slicer']; if (dmAt(G.sh, G.sel.r, G.sel.c)) return ['dmpivot', 'PivotTable']; return null; },
    context(p){ const d = dmAt(G.sh, G.sel.r, G.sel.c); if (d) p.append(mi('', 'Refresh Data Model PivotTable', async () => { cache = null; await build(G.sh, d); Calc.invalidate(); Grid.refresh(); App.dirty(); }), mi('', 'PivotTable fields…', () => pivotDialog(d))); },
  };
  SRK_EXT.push(ext);
  setTimeout(() => { G.onSlicer = onSlicer; }, 0);
  return {manage, pivotDialog, refreshAll, touched: () => { cache = null; }, slicerHTML, insertSlicer, measure: (m, data) => measure(m, {data, filters: [], row: null}), load, parse, compute, M, flatten};
})();
