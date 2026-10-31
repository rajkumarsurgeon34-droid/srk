/* SRK Sheets — formula engine: tokenizer, parser, evaluator, Excel functions, reference shifting */
'use strict';
const Formula = (() => {
  /* ---------------------------------------------------------------- tokenizer */
  const RE_ERR = /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|CIRC!|SPILL!)/i;
  const RE_CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(.])/;
  const RE_COLS = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/;
  const RE_ROWS = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![A-Za-z0-9_(])/;
  function tokenize(src){
    const out = []; let i = 0; const n = src.length;
    const push = (type, text, extra = {}) => { out.push({type, text, start: i, ...extra}); i += text.length; };
    while (i < n){
      const rest = src.slice(i), ch = src[i];
      if (/\s/.test(ch)){ let j = i; while (j < n && /\s/.test(src[j])) j++; out.push({type: 'ws', text: src.slice(i, j), start: i}); i = j; continue; }
      if (ch === '"'){ let j = i + 1, s = ''; while (j < n){ if (src[j] === '"'){ if (src[j + 1] === '"'){ s += '"'; j += 2; continue; } break; } s += src[j++]; } out.push({type: 'str', text: src.slice(i, j + 1), value: s, start: i}); i = j + 1; continue; }
      let m;
      if ((m = RE_ERR.exec(rest))){ push('err', m[0], {value: m[0].toUpperCase()}); continue; }
      // sheet prefix
      let sheet = null, plen = 0;
      if (ch === "'"){ let j = i + 1, s = ''; while (j < n){ if (src[j] === "'"){ if (src[j + 1] === "'"){ s += "'"; j += 2; continue; } break; } s += src[j++]; } if (src[j + 1] === '!'){ sheet = s; plen = j + 2 - i; } }
      else if ((m = /^([A-Za-z_\u0080-\uFFFF][\w.\u0080-\uFFFF]*)!/.exec(rest))){ sheet = m[1]; plen = m[0].length; }
      const r2 = src.slice(i + plen);
      if ((m = RE_COLS.exec(r2)) && (sheet || !/^[A-Za-z]{1,3}\(/.test(r2))){ out.push({type: 'ref', text: src.slice(i, i + plen + m[0].length), start: i, sheet, kind: 'cols', a: {c: colIndex(m[2]), ac: !!m[1]}, b: {c: colIndex(m[4]), ac: !!m[3]}, plen}); i += plen + m[0].length; continue; }
      if ((m = RE_ROWS.exec(r2))){ out.push({type: 'ref', text: src.slice(i, i + plen + m[0].length), start: i, sheet, kind: 'rows', a: {r: +m[2] - 1, ar: !!m[1]}, b: {r: +m[4] - 1, ar: !!m[3]}, plen}); i += plen + m[0].length; continue; }
      if ((m = RE_CELL.exec(r2))){ const a = {c: colIndex(m[2]), ac: !!m[1], r: +m[4] - 1, ar: !!m[3]}; let len = plen + m[0].length, b = null; const after = src.slice(i + len);
        const m2 = /^:(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/.exec(after); if (m2){ b = {c: colIndex(m2[2]), ac: !!m2[1], r: +m2[4] - 1, ar: !!m2[3]}; len += m2[0].length; }
        out.push({type: 'ref', text: src.slice(i, i + len), start: i, sheet, kind: 'cell', a, b, plen}); i += len; continue; }
      if (sheet){ out.push({type: 'err', text: src.slice(i, i + plen) + '#REF!', value: '#REF!', start: i}); i += plen; continue; }
      if ((m = /^(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/.exec(rest))){ push('num', m[0], {value: parseFloat(m[0])}); continue; }
      if ((m = /^(_xlfn\.|_xlws\.)?([A-Za-z_\\][\w.]*)\s*\(/.exec(rest))){ out.push({type: 'func', text: m[0].replace(/\s*\($/, ''), name: m[2].toUpperCase(), start: i}); i += m[0].length - 1 - (m[0].length - m[0].trimEnd().length); while (src[i] !== '(') i++; continue; }
      if ((m = /^(TRUE|FALSE)(?![\w.(])/i.exec(rest))){ push('bool', m[0], {value: m[0].toUpperCase() === 'TRUE'}); continue; }
      if ((m = /^[A-Za-z_\\\u0080-\uFFFF][\w.\u0080-\uFFFF]*/.exec(rest))){ push('name', m[0], {name: m[0]}); continue; }
      if ((m = /^(<=|>=|<>|[-+*\/^&=<>%(),;{}:])/.exec(rest))){ push('op', m[0]); continue; }
      push('bad', ch);
    }
    return out;
  }
  /* ---------------------------------------------------------------- parser */
  function parse(src){
    const toks = tokenize(src).filter(t => t.type !== 'ws'); let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (t, ...ops) => t && t.type === 'op' && ops.includes(t.text);
    const fail = m => { throw new Error(m); };
    function expr(){ return compare(); }
    function compare(){ let l = concat(); while (isOp(peek(), '=', '<>', '<', '>', '<=', '>=')){ const op = next().text; l = {t: 'bin', op, l, r: concat()}; } return l; }
    function concat(){ let l = additive(); while (isOp(peek(), '&')){ next(); l = {t: 'bin', op: '&', l, r: additive()}; } return l; }
    function additive(){ let l = mult(); while (isOp(peek(), '+', '-')){ const op = next().text; l = {t: 'bin', op, l, r: mult()}; } return l; }
    function mult(){ let l = power(); while (isOp(peek(), '*', '/')){ const op = next().text; l = {t: 'bin', op, l, r: power()}; } return l; }
    function power(){ let l = unary(); while (isOp(peek(), '^')){ next(); l = {t: 'bin', op: '^', l, r: unary()}; } return l; }
    function unary(){ if (isOp(peek(), '-', '+')){ const op = next().text; const v = unary(); return op === '-' ? {t: 'neg', v} : v; } return percent(); }
    function percent(){ let v = primary(); while (isOp(peek(), '%')){ next(); v = {t: 'pct', v}; } return v; }
    function primary(){
      const t = next(); if (!t) fail('Formula ends too early');
      if (t.type === 'num') return {t: 'lit', v: t.value}; if (t.type === 'str') return {t: 'lit', v: t.value}; if (t.type === 'bool') return {t: 'lit', v: t.value}; if (t.type === 'err') return {t: 'lit', v: err(t.value)};
      if (t.type === 'ref') return {t: 'ref', ref: t};
      if (t.type === 'name') return {t: 'name', name: t.name};
      if (t.type === 'func'){ next(); const args = []; if (!isOp(peek(), ')')){ do { if (isOp(peek(), ',', ')')) args.push({t: 'lit', v: null, missing: true}); else args.push(expr()); } while (isOp(peek(), ',') && next()); } if (!isOp(next(), ')')) fail('Missing )'); return {t: 'fn', name: t.name, args}; }
      if (isOp(t, '(')){ const e = expr(); if (!isOp(next(), ')')) fail('Missing )'); return e; }
      if (isOp(t, '{')){ const rows = [[]]; while (!isOp(peek(), '}')){ const e = unary(); rows[rows.length - 1].push(e.t === 'lit' ? e.v : e.t === 'neg' && e.v.t === 'lit' ? -e.v.v : null); if (isOp(peek(), ',')) next(); else if (isOp(peek(), ';')){ next(); rows.push([]); } else if (!isOp(peek(), '}')) fail('Bad array'); } next(); return {t: 'arr', v: rows}; }
      fail('Unexpected ' + t.text);
    }
    const ast = expr(); if (p < toks.length) fail('Unexpected ' + toks[p].text); return ast;
  }
  const astCache = new Map();
  function compile(f){ let a = astCache.get(f); if (a === undefined){ try { a = parse(f); } catch(e){ a = {t: 'lit', v: err(/\(|\)/.test(e.message) ? ERR.value : ERR.name), bad: e.message}; } if (astCache.size > 20000) astCache.clear(); astCache.set(f, a); } return a; }

  /* ---------------------------------------------------------------- values */
  class Range { constructor(sheet, r1, c1, r2, c2){ Object.assign(this, {sheet, r1, c1, r2, c2}); } get rows(){ return this.r2 - this.r1 + 1; } get cols(){ return this.c2 - this.c1 + 1; } }
  class Arr { constructor(a){ this.a = a; } get rows(){ return this.a.length; } get cols(){ return this.a[0] ? this.a[0].length : 0; } }
  const isRange = v => v instanceof Range, isArr = v => v instanceof Arr;
  let CTX = null; // {wb, get(sheet, r, c), sheetOf(name), cur, names}
  function grid(v){ // → 2-D array of values
    if (isRange(v)){ const out = []; const r2 = Math.min(v.r2, v.r1 + CTX.lastRow(v.sheet) - v.r1 + 1, v.r2), c2 = Math.min(v.c2, CTX.lastCol(v.sheet)); for (let r = v.r1; r <= Math.min(v.r2, CTX.lastRow(v.sheet)); r++){ const row = []; for (let c = v.c1; c <= Math.min(v.c2, CTX.lastCol(v.sheet)); c++) row.push(CTX.get(v.sheet, r, c)); out.push(row); } return out; }
    if (isArr(v)) return v.a; return [[v]];
  }
  function fullGrid(v){ // keeps the requested shape (for lookups with whole columns)
    if (isRange(v)){ const r2 = Math.min(v.r2, Math.max(v.r1, CTX.lastRow(v.sheet))), c2 = Math.min(v.c2, Math.max(v.c1, CTX.lastCol(v.sheet))); const out = []; for (let r = v.r1; r <= r2; r++){ const row = []; for (let c = v.c1; c <= c2; c++) row.push(CTX.get(v.sheet, r, c)); out.push(row); } return out; }
    return grid(v); }
  function scalar(v){ if (isRange(v)){ if (v.r1 === v.r2 && v.c1 === v.c2) return CTX.get(v.sheet, v.r1, v.c1); // implicit intersection
      const cr = CTX.cell; if (cr && v.c1 === v.c2 && cr.r >= v.r1 && cr.r <= v.r2) return CTX.get(v.sheet, cr.r, v.c1); if (cr && v.r1 === v.r2 && cr.c >= v.c1 && cr.c <= v.c2) return CTX.get(v.sheet, v.r1, cr.c); return err(ERR.value); }
    if (isArr(v)) return v.a[0] ? v.a[0][0] : null; return v; }
  function num(v){ v = scalar(v); if (isErr(v)) return v; if (v == null || v === '') return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0;
    const p = parseInput(v); if (typeof p.v === 'number') return p.v; return err(ERR.value); }
  function str(v){ v = scalar(v); if (isErr(v)) return v; if (v == null) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return generalNum(v); return String(v); }
  function bool(v){ v = scalar(v); if (isErr(v)) return v; if (v == null) return false; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; const u = String(v).toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return err(ERR.value); }
  /* numbers in arguments the way SUM sees them: range text/booleans are skipped, typed values are converted */
  function nums(args, opts = {}){ const out = []; for (const a of args){ if (isRange(a) || isArr(a)){ for (const row of grid(a)) for (const v of row){ if (isErr(v)) { if (!opts.skipErr) throw v; continue; } if (typeof v === 'number') out.push(v); else if (opts.countText && v != null && v !== '') out.push(typeof v === 'boolean' ? (v ? 1 : 0) : 0); } } else { if (a == null && opts.skipBlank) continue; const n = num(a); if (isErr(n)) throw n; out.push(n); } } return out; }
  function vals(args){ const out = []; for (const a of args){ if (isRange(a) || isArr(a)) for (const row of grid(a)) out.push(...row); else out.push(a); } return out; }
  /* criteria like ">5", "<>x", "a*" */
  function criterion(c){
    c = scalar(c); if (isErr(c)) return () => false;
    if (typeof c === 'number' || typeof c === 'boolean') return v => v === c || (typeof v === 'string' && v.trim() !== '' && +v === c);
    let s = String(c), op = '='; const m = /^(<=|>=|<>|=|<|>)(.*)$/.exec(s); if (m){ op = m[1]; s = m[2]; }
    const p = parseInput(s); const isNum = typeof p.v === 'number' && s.trim() !== '';
    if (isNum){ const n = p.v; return v => { const x = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : null); if (op === '<>') return x !== n; if (x == null) return false; return ({'=': x === n, '<': x < n, '>': x > n, '<=': x <= n, '>=': x >= n})[op]; }; }
    if (s === '' && op === '=') return v => v == null || v === '';
    if (s === '' && op === '<>') return v => v != null && v !== '';
    const wild = /[*?]/.test(s); const re = wild ? new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i') : null;
    const low = s.toLowerCase();
    return v => { const t = v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v).toLowerCase(); if (op === '=') return re ? re.test(t) : t === low; if (op === '<>') return re ? !re.test(t) : t !== low; if (typeof v !== 'string') return false; return ({'<': t < low, '>': t > low, '<=': t <= low, '>=': t >= low})[op]; };
  }
  /* element-wise operations for array maths (SUMPRODUCT((A1:A5>2)*(B1:B5))) */
  function lift(a, b, fn){
    const A = isRange(a) || isArr(a), B = isRange(b) || isArr(b); if (!A && !B) return fn(a, b);
    const ga = A ? fullGrid(a) : null, gb = B ? fullGrid(b) : null; const R = Math.max(ga ? ga.length : 1, gb ? gb.length : 1), C = Math.max(ga ? (ga[0] || []).length : 1, gb ? (gb[0] || []).length : 1);
    const at = (g, v, r, c) => !g ? v : (g[g.length === 1 ? 0 : r] || [])[g[0] && g[0].length === 1 ? 0 : c];
    const out = []; for (let r = 0; r < R; r++){ const row = []; for (let c = 0; c < C; c++){ const x = at(ga, a, r, c), y = at(gb, b, r, c); row.push(x === undefined || y === undefined ? err(ERR.na) : fn(x, y)); } out.push(row); } return new Arr(out);
  }
  function cmp(a, b){ // Excel comparison order: numbers < text < booleans
    const rank = v => v == null ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : 3;
    if (a == null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0; if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; if (typeof a === 'string'){ const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; } return a < b ? -1 : a > b ? 1 : 0; }
  function binop(op, a, b){
    return lift(a, b, (x, y) => {
      if (isErr(x)) return x; if (isErr(y)) return y;
      if (op === '&') return str(x) + str(y);
      if (['=', '<>', '<', '>', '<=', '>='].includes(op)){ const c = cmp(x, y); return ({'=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0})[op]; }
      const p = num(x), q = num(y); if (isErr(p)) return p; if (isErr(q)) return q;
      switch (op){ case '+': return p + q; case '-': return p - q; case '*': return p * q; case '/': return q === 0 ? err(ERR.div0) : p / q; case '^': { const r = Math.pow(p, q); return isFinite(r) ? r : err(ERR.num); } }
    });
  }
  /* ---------------------------------------------------------------- evaluation */
  function refToRange(t){
    const sh = t.sheet != null ? CTX.sheetOf(t.sheet) : CTX.cur; if (!sh) return err(ERR.ref);
    if (t.kind === 'cols') return new Range(sh, 0, Math.min(t.a.c, t.b.c), MAXR - 1, Math.max(t.a.c, t.b.c));
    if (t.kind === 'rows') return new Range(sh, Math.min(t.a.r, t.b.r), 0, Math.max(t.a.r, t.b.r), MAXC - 1);
    const b = t.b || t.a; return new Range(sh, Math.min(t.a.r, b.r), Math.min(t.a.c, b.c), Math.max(t.a.r, b.r), Math.max(t.a.c, b.c));
  }
  function ev(n){
    switch (n.t){
      case 'lit': return n.v;
      case 'ref': return refToRange(n.ref);
      case 'arr': return new Arr(n.v);
      case 'name': { const d = CTX.names(n.name); if (d == null) return err(ERR.name); return d; }
      case 'neg': { const v = ev(n.v); return lift(v, null, x => { const p = num(x); return isErr(p) ? p : -p; }); }
      case 'pct': { const v = ev(n.v); return lift(v, null, x => { const p = num(x); return isErr(p) ? p : p / 100; }); }
      case 'bin': return binop(n.op, ev(n.l), ev(n.r));
      case 'fn': { const f = FN[n.name]; if (!f) return err(ERR.name);
        if (f.lazy) return f(n.args, ev);
        const args = n.args.map(a => a.missing ? undefined : ev(a));
        try { return f(...args); } catch(e){ if (isErr(e)) return e; if (e && e.message === 'NA') return err(ERR.na); console.warn(e); return err(ERR.value); } }
    }
    return err(ERR.value);
  }
  function evaluate(f, ctx){ const prev = CTX; CTX = ctx; try { let v = ev(compile(f)); if (isRange(v) || isArr(v)) v = scalar(v); return v === undefined ? 0 : v; } finally { CTX = prev; } }

  /* ---------------------------------------------------------------- functions */
  const FN = {}; const def = (names, fn) => names.split(' ').forEach(n => FN[n] = fn);
  const need = (...xs) => { for (const x of xs) if (isErr(x)) throw x; };
  const N = v => { const n = num(v); need(n); return n; }, S = v => { const s = str(v); need(s); return s; }, B = v => { const b = bool(v); need(b); return b; };
  const opt = (v, d) => v === undefined || v === null ? d : v;
  const round = (n, d) => { const m = Math.pow(10, d); const x = Math.abs(n) * m; const r = Math.round(x + 1e-9 * Math.max(1, x)) / m; return n < 0 ? -r : r; };
  // maths
  def('SUM', (...a) => nums(a).reduce((s, x) => s + x, 0));
  def('PRODUCT', (...a) => nums(a).reduce((s, x) => s * x, 1));
  def('AVERAGE', (...a) => { const x = nums(a); if (!x.length) throw err(ERR.div0); return x.reduce((s, v) => s + v, 0) / x.length; });
  def('AVERAGEA', (...a) => { const x = nums(a, {countText: true}); if (!x.length) throw err(ERR.div0); return x.reduce((s, v) => s + v, 0) / x.length; });
  def('COUNT', (...a) => { let c = 0; for (const x of a){ if (isRange(x) || isArr(x)) { for (const row of grid(x)) for (const v of row) if (typeof v === 'number') c++; } else if (typeof x === 'number' || (typeof x === 'string' && !isNaN(parseFloat(x)) && typeof parseInput(x).v === 'number')) c++; } return c; });
  def('COUNTA', (...a) => vals(a).filter(v => v != null && v !== '').length);
  def('COUNTBLANK', r => { const nb = vals([r]).filter(v => v != null && v !== '').length; if (isRange(r) && r.rows < 200000) return r.rows * r.cols - nb; return vals([r]).length - nb; });
  def('MAX', (...a) => { const x = nums(a); return x.length ? Math.max(...x) : 0; }); def('MIN', (...a) => { const x = nums(a); return x.length ? Math.min(...x) : 0; });
  def('MAXA', (...a) => { const x = nums(a, {countText: true}); return x.length ? Math.max(...x) : 0; }); def('MINA', (...a) => { const x = nums(a, {countText: true}); return x.length ? Math.min(...x) : 0; });
  def('MEDIAN', (...a) => { const x = nums(a).sort((p, q) => p - q); if (!x.length) throw err(ERR.num); const m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; });
  def('MODE MODE.SNGL', (...a) => { const x = nums(a), m = new Map(); let best = null, bc = 1; for (const v of x){ const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc){ bc = c; best = v; } } if (best == null) throw err(ERR.na); return best; });
  const variance = (x, s) => { const n = x.length; if (n - (s ? 1 : 0) <= 0) throw err(ERR.div0); const mu = x.reduce((p, q) => p + q, 0) / n; return x.reduce((p, q) => p + (q - mu) ** 2, 0) / (n - (s ? 1 : 0)); };
  def('VAR VAR.S', (...a) => variance(nums(a), true)); def('VARP VAR.P', (...a) => variance(nums(a), false));
  def('STDEV STDEV.S', (...a) => Math.sqrt(variance(nums(a), true))); def('STDEVP STDEV.P', (...a) => Math.sqrt(variance(nums(a), false)));
  def('ROUND', (n, d) => round(N(n), N(opt(d, 0)))); def('ROUNDUP', (n, d) => { const m = 10 ** N(opt(d, 0)), x = N(n); return Math.sign(x) * Math.ceil(Math.abs(x) * m - 1e-9) / m; }); def('ROUNDDOWN', (n, d) => { const m = 10 ** N(opt(d, 0)), x = N(n); return Math.sign(x) * Math.floor(Math.abs(x) * m + 1e-9) / m; });
  def('MROUND', (n, m) => { const x = N(n), y = N(m); if (!y) return 0; if (x * y < 0) throw err(ERR.num); return round(x / y, 0) * y; });
  def('INT', n => Math.floor(N(n))); def('TRUNC', (n, d) => { const m = 10 ** N(opt(d, 0)); return Math.trunc(N(n) * m) / m; }); def('ABS', n => Math.abs(N(n))); def('SIGN', n => Math.sign(N(n)));
  def('MOD', (a, b) => { const x = N(a), y = N(b); if (y === 0) throw err(ERR.div0); return x - y * Math.floor(x / y); }); def('QUOTIENT', (a, b) => { const y = N(b); if (!y) throw err(ERR.div0); return Math.trunc(N(a) / y); });
  def('SQRT', n => { const x = N(n); if (x < 0) throw err(ERR.num); return Math.sqrt(x); }); def('POWER', (a, b) => { const r = Math.pow(N(a), N(b)); if (!isFinite(r)) throw err(ERR.num); return r; });
  def('EXP', n => Math.exp(N(n))); def('LN', n => { const x = N(n); if (x <= 0) throw err(ERR.num); return Math.log(x); }); def('LOG10', n => { const x = N(n); if (x <= 0) throw err(ERR.num); return Math.log10(x); }); def('LOG', (n, b) => { const x = N(n), y = N(opt(b, 10)); if (x <= 0 || y <= 0 || y === 1) throw err(ERR.num); return Math.log(x) / Math.log(y); });
  def('PI', () => Math.PI); def('RAND', () => Math.random()); def('RANDBETWEEN', (a, b) => { const x = Math.ceil(N(a)), y = Math.floor(N(b)); return x + Math.floor(Math.random() * (y - x + 1)); });
  def('CEILING CEILING.MATH', (n, s) => { const x = N(n), y = N(opt(s, 1)); if (!y) return 0; return Math.ceil(x / y - 1e-12) * y; }); def('FLOOR FLOOR.MATH', (n, s) => { const x = N(n), y = N(opt(s, 1)); if (!y) return 0; return Math.floor(x / y + 1e-12) * y; });
  def('EVEN', n => { const x = N(n); const r = Math.ceil(Math.abs(x) / 2) * 2; return x < 0 ? -r : r; }); def('ODD', n => { const x = N(n); let r = Math.ceil(Math.abs(x)); if (r % 2 === 0) r++; return x < 0 ? -r : r; });
  def('FACT', n => { let x = Math.floor(N(n)), r = 1; if (x < 0) throw err(ERR.num); while (x > 1) r *= x--; return r; }); def('GCD', (...a) => nums(a).reduce((p, q) => { p = Math.abs(Math.floor(p)); q = Math.abs(Math.floor(q)); while (q){ [p, q] = [q, p % q]; } return p; }, 0)); def('LCM', (...a) => nums(a).reduce((p, q) => { const g = FN.GCD(p, q); return g ? Math.abs(p * q) / g : 0; }, 1));
  def('COMBIN', (n, k) => { const a = Math.floor(N(n)), b = Math.floor(N(k)); if (b > a || b < 0) throw err(ERR.num); let r = 1; for (let i = 1; i <= b; i++) r = r * (a - b + i) / i; return Math.round(r); }); def('PERMUT', (n, k) => { const a = Math.floor(N(n)), b = Math.floor(N(k)); let r = 1; for (let i = 0; i < b; i++) r *= a - i; return r; });
  def('DEGREES', n => N(n) * 180 / Math.PI); def('RADIANS', n => N(n) * Math.PI / 180); for (const f of ['SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN']) def(f, n => { const r = Math[f.toLowerCase()](N(n)); if (isNaN(r)) throw err(ERR.num); return r; }); def('ATAN2', (x, y) => Math.atan2(N(y), N(x)));
  def('SUMSQ', (...a) => nums(a).reduce((s, x) => s + x * x, 0));
  def('SUMPRODUCT', (...a) => { const gs = a.map(fullGrid); const R = gs[0].length, C = (gs[0][0] || []).length; if (gs.some(g => g.length !== R || (g[0] || []).length !== C)) throw err(ERR.value); let s = 0; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++){ let p = 1; for (const g of gs){ const v = g[r][c]; if (isErr(v)) throw v; p *= typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; } s += p; } return s; });
  // conditional aggregates
  function pairs(rangeArgs){ const gs = rangeArgs.map(fullGrid); return gs; }
  function ifsMask(crit){ // [[range, criterion], ...]
    const gs = crit.map(([r]) => fullGrid(r)); const R = gs[0].length, C = (gs[0][0] || []).length; const fns = crit.map(([, c]) => criterion(c));
    return (r, c) => gs.every((g, i) => fns[i](g[r] ? g[r][c] : null)); }
  function condAgg(sumR, crit){ const mask = ifsMask(crit); const g = sumR ? fullGrid(sumR) : fullGrid(crit[0][0]); const out = []; const base = fullGrid(crit[0][0]); for (let r = 0; r < base.length; r++) for (let c = 0; c < (base[r] || []).length; c++) if (mask(r, c)){ const v = (g[r] || [])[c]; if (isErr(v)) throw v; if (typeof v === 'number') out.push(v); } return out; }
  const grp = a => { const out = []; for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
  def('SUMIF', (r, c, s) => condAgg(s || r, [[r, c]]).reduce((p, q) => p + q, 0)); def('SUMIFS', (s, ...a) => condAgg(s, grp(a)).reduce((p, q) => p + q, 0));
  def('COUNTIF', (r, c) => { const f = criterion(c); return vals([r]).filter(v => f(v)).length; }); def('COUNTIFS', (...a) => { const m = ifsMask(grp(a)); const g = fullGrid(a[0]); let n = 0; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (m(r, c)) n++; return n; });
  def('AVERAGEIF', (r, c, s) => { const x = condAgg(s || r, [[r, c]]); if (!x.length) throw err(ERR.div0); return x.reduce((p, q) => p + q, 0) / x.length; }); def('AVERAGEIFS', (s, ...a) => { const x = condAgg(s, grp(a)); if (!x.length) throw err(ERR.div0); return x.reduce((p, q) => p + q, 0) / x.length; });
  def('MAXIFS', (s, ...a) => { const x = condAgg(s, grp(a)); return x.length ? Math.max(...x) : 0; }); def('MINIFS', (s, ...a) => { const x = condAgg(s, grp(a)); return x.length ? Math.min(...x) : 0; });
  def('LARGE', (r, k) => { const x = nums([r]).sort((p, q) => q - p), i = Math.floor(N(k)); if (i < 1 || i > x.length) throw err(ERR.num); return x[i - 1]; }); def('SMALL', (r, k) => { const x = nums([r]).sort((p, q) => p - q), i = Math.floor(N(k)); if (i < 1 || i > x.length) throw err(ERR.num); return x[i - 1]; });
  def('RANK RANK.EQ', (v, r, o) => { const x = N(v), arr = nums([r]); if (!arr.includes(x)) throw err(ERR.na); return (N(opt(o, 0)) ? arr.filter(y => y < x) : arr.filter(y => y > x)).length + 1; });
  def('RANK.AVG', (v, r, o) => { const x = N(v), arr = nums([r]); if (!arr.includes(x)) throw err(ERR.na); const a = N(opt(o, 0)); const first = (a ? arr.filter(y => y < x) : arr.filter(y => y > x)).length + 1; const cnt = arr.filter(y => y === x).length; return first + (cnt - 1) / 2; });
  const pct = (x, p) => { x = x.sort((a, b) => a - b); if (!x.length || p < 0 || p > 1) throw err(ERR.num); const h = (x.length - 1) * p, lo = Math.floor(h); return x[lo] + (h - lo) * ((x[lo + 1] ?? x[lo]) - x[lo]); };
  def('PERCENTILE PERCENTILE.INC', (r, k) => pct(nums([r]), N(k))); def('QUARTILE QUARTILE.INC', (r, q) => pct(nums([r]), N(q) / 4));
  def('CORREL PEARSON', (a, b) => { const x = fullGrid(a).flat(), y = fullGrid(b).flat(); const P = []; x.forEach((v, i) => { if (typeof v === 'number' && typeof y[i] === 'number') P.push([v, y[i]]); }); const n = P.length; if (n < 2) throw err(ERR.div0); const mx = P.reduce((s, p) => s + p[0], 0) / n, my = P.reduce((s, p) => s + p[1], 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const [p, q] of P){ sxy += (p - mx) * (q - my); sxx += (p - mx) ** 2; syy += (q - my) ** 2; } return sxy / Math.sqrt(sxx * syy); });
  def('SUBTOTAL AGGREGATE', (k, ...a) => { const f = {1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP'}[N(k) % 100]; if (!f) throw err(ERR.value); return FN[f](...a); });
  // logic
  FN.IF = Object.assign((args, ev) => { const c = bool(ev(args[0])); if (isErr(c)) return c; const v = c ? (args[1] ? ev(args[1]) : true) : (args[2] && !args[2].missing ? ev(args[2]) : false); return v === null && args[c ? 1 : 2] && args[c ? 1 : 2].missing ? 0 : v; }, {lazy: true});
  FN.IFERROR = Object.assign((args, ev) => { const v = ev(args[0]); const s = scalar(v); return isErr(s) ? ev(args[1]) : v; }, {lazy: true});
  FN.IFNA = Object.assign((args, ev) => { const v = ev(args[0]); const s = scalar(v); return isErr(s) && s.e === ERR.na ? ev(args[1]) : v; }, {lazy: true});
  FN.IFS = Object.assign((args, ev) => { for (let i = 0; i + 1 < args.length; i += 2){ const c = bool(ev(args[i])); if (isErr(c)) return c; if (c) return ev(args[i + 1]); } return err(ERR.na); }, {lazy: true});
  FN.SWITCH = Object.assign((args, ev) => { const v = scalar(ev(args[0])); for (let i = 1; i + 1 < args.length; i += 2) if (cmp(v, scalar(ev(args[i]))) === 0) return ev(args[i + 1]); return args.length % 2 === 0 ? ev(args[args.length - 1]) : err(ERR.na); }, {lazy: true});
  FN.CHOOSE = Object.assign((args, ev) => { const i = Math.floor(num(ev(args[0]))); if (isErr(i)) return i; if (i < 1 || i >= args.length) return err(ERR.value); return ev(args[i]); }, {lazy: true});
  def('AND', (...a) => { const x = vals(a).filter(v => v != null && typeof v !== 'string'); if (!x.length) throw err(ERR.value); return x.every(v => { if (isErr(v)) throw v; return !!v; }); });
  def('OR', (...a) => { const x = vals(a).filter(v => v != null && typeof v !== 'string'); if (!x.length) throw err(ERR.value); return x.some(v => { if (isErr(v)) throw v; return !!v; }); });
  def('XOR', (...a) => vals(a).filter(v => v != null && typeof v !== 'string').reduce((p, v) => p !== !!v, false)); def('NOT', v => !B(v)); def('TRUE', () => true); def('FALSE', () => false);
  // information
  def('ISBLANK', v => { v = scalar(v); return v == null || v === ''; }); def('ISNUMBER', v => typeof scalar(v) === 'number'); def('ISTEXT', v => typeof scalar(v) === 'string'); def('ISNONTEXT', v => typeof scalar(v) !== 'string'); def('ISLOGICAL', v => typeof scalar(v) === 'boolean');
  def('ISERROR', v => isErr(scalar(v))); def('ISERR', v => { v = scalar(v); return isErr(v) && v.e !== ERR.na; }); def('ISNA', v => { v = scalar(v); return isErr(v) && v.e === ERR.na; }); def('ISEVEN', v => Math.floor(Math.abs(N(v))) % 2 === 0); def('ISODD', v => Math.floor(Math.abs(N(v))) % 2 === 1);
  def('NA', () => err(ERR.na)); def('N', v => { v = scalar(v); return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; }); def('T', v => { v = scalar(v); return typeof v === 'string' ? v : ''; });
  def('ISFORMULA', r => isRange(r) && !!CTX.formulaAt(r.sheet, r.r1, r.c1)); def('TYPE', v => { v = scalar(v); return typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : isErr(v) ? 16 : 1; });
  def('ROW', r => r === undefined ? CTX.cell.r + 1 : (need(r), r.r1 + 1)); def('COLUMN', r => r === undefined ? CTX.cell.c + 1 : r.c1 + 1); def('ROWS', r => isRange(r) || isArr(r) ? Math.min(r.rows, isRange(r) && r.r2 >= MAXR - 1 ? MAXR : r.rows) : 1); def('COLUMNS', r => isRange(r) || isArr(r) ? r.cols : 1);
  // lookup
  function findIn(list, v, mode){ // mode 0 exact (wildcards), 1 largest <=, -1 smallest >=
    v = scalar(v); if (isErr(v)) throw v;
    if (mode === 0){ if (typeof v === 'string' && /[*?]/.test(v)){ const f = criterion(v); return list.findIndex(x => typeof x === 'string' && f(x)); } return list.findIndex(x => cmp(x, v) === 0 && (x != null || v === '' || v == null)); }
    let best = -1; for (let i = 0; i < list.length; i++){ const x = list[i]; if (x == null) continue; const c = cmp(x, v); if (mode === 1){ if (c <= 0 && (typeof x === typeof v)) best = i; else if (c > 0 && typeof x === typeof v) break; } else { if (c >= 0) best = i; else break; } } return best;
  }
  def('VLOOKUP', (v, tbl, col, approx) => { const g = fullGrid(tbl), ci = Math.floor(N(col)) - 1; if (ci < 0 || (g[0] && ci >= g[0].length)) throw err(ERR.ref); const ap = approx === undefined ? true : B(approx); const i = findIn(g.map(r => r[0]), v, ap ? 1 : 0); if (i < 0) throw err(ERR.na); return g[i][ci] ?? 0; });
  def('HLOOKUP', (v, tbl, row, approx) => { const g = fullGrid(tbl), ri = Math.floor(N(row)) - 1; if (ri < 0 || ri >= g.length) throw err(ERR.ref); const ap = approx === undefined ? true : B(approx); const i = findIn(g[0], v, ap ? 1 : 0); if (i < 0) throw err(ERR.na); return g[ri][i] ?? 0; });
  def('MATCH', (v, r, t) => { const g = fullGrid(r); const list = g.length === 1 ? g[0] : g.map(x => x[0]); const i = findIn(list, v, t === undefined ? 1 : Math.sign(N(t))); if (i < 0) throw err(ERR.na); return i + 1; });
  def('XMATCH', (v, r, m) => { const g = fullGrid(r); const list = g.length === 1 ? g[0] : g.map(x => x[0]); const mm = N(opt(m, 0)); const i = findIn(list, v, mm === -1 ? 1 : mm === 1 ? -1 : 0); if (i < 0) throw err(ERR.na); return i + 1; });
  def('INDEX', (r, row, col) => { if (isRange(r)){ let ri = Math.floor(N(opt(row, 0))), ci = Math.floor(N(opt(col, 0))); if (r.rows === 1 && col === undefined){ ci = ri; ri = 1; } if (ri < 0 || ci < 0 || ri > r.rows || ci > r.cols) throw err(ERR.ref);
      if (ri === 0) return new Range(r.sheet, r.r1, r.c1 + ci - 1, r.r2, r.c1 + ci - 1); if (ci === 0 && r.cols > 1) return new Range(r.sheet, r.r1 + ri - 1, r.c1, r.r1 + ri - 1, r.c2); return new Range(r.sheet, r.r1 + ri - 1, r.c1 + Math.max(ci, 1) - 1, r.r1 + ri - 1, r.c1 + Math.max(ci, 1) - 1); }
    const g = grid(r); const ri = Math.floor(N(opt(row, 1))), ci = Math.floor(N(opt(col, 1))); const v = (g[Math.max(ri, 1) - 1] || [])[Math.max(ci, 1) - 1]; if (v === undefined) throw err(ERR.ref); return v; });
  def('XLOOKUP', (v, look, ret, nf, mm, sm) => { const lg = fullGrid(look); const horiz = lg.length === 1 && lg[0].length > 1; const list = horiz ? lg[0] : lg.map(x => x[0]); const mode = N(opt(mm, 0)); let i = findIn(N(opt(sm, 1)) < 0 ? [...list].reverse() : list, v, mode === -1 ? 1 : mode === 1 ? -1 : 0); if (i >= 0 && N(opt(sm, 1)) < 0) i = list.length - 1 - i;
    if (i < 0){ if (nf !== undefined) return nf; throw err(ERR.na); } if (isRange(ret)) return horiz ? new Range(ret.sheet, ret.r1, ret.c1 + i, ret.r2, ret.c1 + i) : new Range(ret.sheet, ret.r1 + i, ret.c1, ret.r1 + i, ret.c2); const rg = grid(ret); return horiz ? rg[0][i] : rg[i][0]; });
  def('LOOKUP', (v, look, ret) => { const lg = fullGrid(look); const horiz = lg.length === 1; const list = horiz ? lg[0] : lg.map(x => x[0]); const i = findIn(list, v, 1); if (i < 0) throw err(ERR.na); const rg = ret ? fullGrid(ret) : lg; return horiz || (rg.length === 1) ? rg[0][i] : rg[i][rg[0].length - 1]; });
  def('OFFSET', (r, dr, dc, hh, ww) => { if (!isRange(r)) throw err(ERR.value); const r1 = r.r1 + Math.floor(N(dr)), c1 = r.c1 + Math.floor(N(dc)); const H = hh === undefined ? r.rows : Math.floor(N(hh)), W = ww === undefined ? r.cols : Math.floor(N(ww)); if (r1 < 0 || c1 < 0) throw err(ERR.ref); return new Range(r.sheet, r1, c1, r1 + H - 1, c1 + W - 1); });
  def('INDIRECT', t => { const s = S(t); const toks = tokenize(s); if (toks.length !== 1 || toks[0].type !== 'ref') throw err(ERR.ref); return refToRange(toks[0]); });
  def('TRANSPOSE', r => { const g = grid(r); return new Arr(g[0].map((_, c) => g.map(row => row[c]))); });
  def('ADDRESS', (r, c, a) => { const ab = N(opt(a, 1)); const R = Math.floor(N(r)), C = Math.floor(N(c)); return (ab === 1 || ab === 3 ? '$' : '') + colName(C - 1) + (ab === 1 || ab === 2 ? '$' : '') + R; });
  // text
  def('LEN', s => S(s).length); def('LEFT', (s, n) => S(s).slice(0, Math.max(0, N(opt(n, 1))))); def('RIGHT', (s, n) => { const t = S(s), k = N(opt(n, 1)); return k <= 0 ? '' : t.slice(-k); }); def('MID', (s, a, n) => S(s).substr(Math.max(0, N(a) - 1), Math.max(0, N(n))));
  def('UPPER', s => S(s).toUpperCase()); def('LOWER', s => S(s).toLowerCase()); def('PROPER', s => S(s).toLowerCase().replace(/(^|[^a-z\u00C0-\u024F])([a-z\u00C0-\u024F])/g, (m, a, b) => a + b.toUpperCase())); def('TRIM', s => S(s).replace(/ +/g, ' ').trim()); def('CLEAN', s => S(s).replace(/[\x00-\x1F]/g, ''));
  def('CONCATENATE CONCAT', (...a) => vals(a).map(v => { if (isErr(v)) throw v; return str(v); }).join(''));
  def('TEXTJOIN', (d, ign, ...a) => { const sep = S(d), ig = B(ign); return vals(a).filter(v => !(ig && (v == null || v === ''))).map(v => { if (isErr(v)) throw v; return str(v); }).join(sep); });
  def('REPT', (s, n) => S(s).repeat(Math.max(0, Math.floor(N(n))))); def('EXACT', (a, b) => S(a) === S(b)); def('CHAR', n => String.fromCharCode(N(n))); def('CODE', s => { const t = S(s); if (!t) throw err(ERR.value); return t.charCodeAt(0); }); def('UNICHAR', n => String.fromCodePoint(N(n))); def('UNICODE', s => S(s).codePointAt(0));
  def('FIND', (f, s, st) => { const i = S(s).indexOf(S(f), N(opt(st, 1)) - 1); if (i < 0) throw err(ERR.value); return i + 1; });
  def('SEARCH', (f, s, st) => { const pat = S(f), t = S(s), from = N(opt(st, 1)) - 1; if (/[*?]/.test(pat)){ const re = new RegExp(pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i'); const m = re.exec(t.slice(from)); if (!m) throw err(ERR.value); return m.index + from + 1; } const i = t.toLowerCase().indexOf(pat.toLowerCase(), from); if (i < 0) throw err(ERR.value); return i + 1; });
  def('SUBSTITUTE', (s, o, n, k) => { const t = S(s), a = S(o), b = S(n); if (!a) return t; if (k === undefined) return t.split(a).join(b); let cnt = 0, want = N(k); return t.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), m => ++cnt === want ? b : m); });
  def('REPLACE', (s, a, n, t) => { const x = S(s), i = N(a) - 1; return x.slice(0, i) + S(t) + x.slice(i + N(n)); });
  def('TEXT', (v, f) => { const x = scalar(v); need(x); const n = typeof x === 'string' && typeof parseInput(x).v === 'number' ? parseInput(x).v : x; return formatValue(n, S(f)).text; });
  def('VALUE NUMBERVALUE', s => { const v = scalar(s); if (typeof v === 'number') return v; const p = parseInput(S(s)); if (typeof p.v !== 'number') throw err(ERR.value); return p.v; });
  def('FIXED', (n, d, nc) => formatValue(N(n), (N(opt(nc, 0)) ? '0' : '#,##0') + (N(opt(d, 2)) > 0 ? '.' + '0'.repeat(N(opt(d, 2))) : '')).text); def('DOLLAR', (n, d) => formatValue(N(n), `"${CURRENCY}"#,##0` + (N(opt(d, 2)) > 0 ? '.' + '0'.repeat(N(opt(d, 2))) : '')).text);
  def('TEXTBEFORE', (s, d) => { const t = S(s), i = t.indexOf(S(d)); if (i < 0) throw err(ERR.na); return t.slice(0, i); }); def('TEXTAFTER', (s, d) => { const t = S(s), x = S(d), i = t.indexOf(x); if (i < 0) throw err(ERR.na); return t.slice(i + x.length); });
  // dates
  const D = v => { const n = N(v); if (n < 0) throw err(ERR.num); return serialToDate(Math.floor(n)); };
  def('DATE', (y, m, d) => { let Y = Math.floor(N(y)); if (Y < 1900) Y += 1900; return dateToSerial(Y, Math.floor(N(m)) - 1, Math.floor(N(d))); });
  def('TIME', (h, m, s) => ((N(h) * 3600 + N(m) * 60 + N(s)) % 86400) / 86400);
  def('TODAY', () => todaySerial()); def('NOW', () => nowSerial());
  def('YEAR', v => D(v).getUTCFullYear()); def('MONTH', v => D(v).getUTCMonth() + 1); def('DAY', v => D(v).getUTCDate());
  def('HOUR', v => Math.floor(((N(v) % 1) * 86400 + .5) / 3600)); def('MINUTE', v => Math.floor(((N(v) % 1) * 86400 + .5) % 3600 / 60)); def('SECOND', v => Math.round((N(v) % 1) * 86400) % 60);
  def('WEEKDAY', (v, t) => { const w = D(v).getUTCDay(), k = N(opt(t, 1)); return k === 2 ? (w + 6) % 7 + 1 : k === 3 ? (w + 6) % 7 : w + 1; });
  def('WEEKNUM ISOWEEKNUM', (v, t) => { const d = D(v); const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); const off = N(opt(t, 1)) === 2 ? (jan1.getUTCDay() + 6) % 7 : jan1.getUTCDay(); return Math.floor(((d - jan1) / 86400000 + off) / 7) + 1; });
  def('EDATE', (v, m) => { const d = D(v); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + Math.trunc(N(m)), Math.min(d.getUTCDate(), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.trunc(N(m)) + 1, 0)).getUTCDate())); });
  def('EOMONTH', (v, m) => { const d = D(v); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + Math.trunc(N(m)) + 1, 0); });
  def('DAYS', (e, s) => Math.floor(N(e)) - Math.floor(N(s))); def('DAYS360', (s, e) => { const a = D(s), b = D(e); return (b.getUTCFullYear() - a.getUTCFullYear()) * 360 + (b.getUTCMonth() - a.getUTCMonth()) * 30 + Math.min(30, b.getUTCDate()) - Math.min(30, a.getUTCDate()); });
  def('DATEDIF', (s, e, u) => { const a = D(s), b = D(e); if (b < a) throw err(ERR.num); const U = S(u).toUpperCase(); let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth(); if (b.getUTCDate() < a.getUTCDate()) m--;
    if (U === 'D') return Math.floor(N(e)) - Math.floor(N(s)); if (U === 'M') return m; if (U === 'Y') return Math.floor(m / 12); if (U === 'YM') return m % 12; if (U === 'MD'){ let d = b.getUTCDate() - a.getUTCDate(); if (d < 0) d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); return d; } if (U === 'YD'){ const t = new Date(Date.UTC(b.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())); let d = (b - t) / 86400000; if (d < 0) d = (b - new Date(Date.UTC(b.getUTCFullYear() - 1, a.getUTCMonth(), a.getUTCDate()))) / 86400000; return Math.round(d); } throw err(ERR.num); });
  def('YEARFRAC', (s, e) => Math.abs(N(e) - N(s)) / 365.25);
  def('DATEVALUE', s => { const p = parseInput(S(s)); if (typeof p.v !== 'number') throw err(ERR.value); return Math.floor(p.v); }); def('TIMEVALUE', s => { const p = parseInput(S(s)); if (typeof p.v !== 'number') throw err(ERR.value); return p.v % 1; });
  const holidays = h => h === undefined ? new Set() : new Set(nums([h]).map(Math.floor));
  def('NETWORKDAYS', (s, e, hol) => { let a = Math.floor(N(s)), b = Math.floor(N(e)), sg = 1; if (a > b){ [a, b] = [b, a]; sg = -1; } const H = holidays(hol); let n = 0; for (let d = a; d <= b; d++){ const w = serialToDate(d).getUTCDay(); if (w && w !== 6 && !H.has(d)) n++; } return n * sg; });
  def('WORKDAY', (s, k, hol) => { let d = Math.floor(N(s)), n = Math.trunc(N(k)); const H = holidays(hol), st = Math.sign(n); while (n){ d += st; const w = serialToDate(d).getUTCDay(); if (w && w !== 6 && !H.has(d)) n -= st; } return d; });
  // finance
  def('PMT', (r, n, pv, fv, t) => { const R = N(r), Nn = N(n), P = N(pv), F = N(opt(fv, 0)), T = N(opt(t, 0)); if (!R) return -(P + F) / Nn; const q = Math.pow(1 + R, Nn); return -(R * (P * q + F)) / ((1 + R * T) * (q - 1)); });
  def('FV', (r, n, pmt, pv, t) => { const R = N(r), Nn = N(n), M = N(pmt), P = N(opt(pv, 0)), T = N(opt(t, 0)); if (!R) return -(P + M * Nn); const q = Math.pow(1 + R, Nn); return -(P * q + M * (1 + R * T) * (q - 1) / R); });
  def('PV', (r, n, pmt, fv, t) => { const R = N(r), Nn = N(n), M = N(pmt), F = N(opt(fv, 0)), T = N(opt(t, 0)); if (!R) return -(F + M * Nn); const q = Math.pow(1 + R, Nn); return -(F + M * (1 + R * T) * (q - 1) / R) / q; });
  def('NPER', (r, pmt, pv, fv, t) => { const R = N(r), M = N(pmt), P = N(pv), F = N(opt(fv, 0)), T = N(opt(t, 0)); if (!R) return -(P + F) / M; const z = M * (1 + R * T) / R; return Math.log((z - F) / (z + P)) / Math.log(1 + R); });
  def('PPMT', (r, per, n, pv, fv, t) => FN.PMT(r, n, pv, fv, t) - FN.IPMT(r, per, n, pv, fv, t));
  def('NPV', (r, ...a) => { const R = N(r); return nums(a).reduce((s, v, i) => s + v / Math.pow(1 + R, i + 1), 0); });
  def('IRR', (r, g) => { const x = nums([r]); let rate = g === undefined ? 0.1 : N(g); for (let i = 0; i < 100; i++){ let f = 0, df = 0; x.forEach((v, k) => { f += v / Math.pow(1 + rate, k); df -= k * v / Math.pow(1 + rate, k + 1); }); const nr = rate - f / df; if (!isFinite(nr)) break; if (Math.abs(nr - rate) < 1e-10) return nr; rate = nr; } throw err(ERR.num); });
  def('RATE', (n, pmt, pv, fv, t, g) => { const Nn = N(n), M = N(pmt), P = N(pv), F = N(opt(fv, 0)), T = N(opt(t, 0)); let r = g === undefined ? 0.1 : N(g); for (let i = 0; i < 100; i++){ const q = Math.pow(1 + r, Nn); const f = P * q + M * (1 + r * T) * (q - 1) / r + F; const h = 1e-6; const q2 = Math.pow(1 + r + h, Nn); const f2 = P * q2 + M * (1 + (r + h) * T) * (q2 - 1) / (r + h) + F; const nr = r - f / ((f2 - f) / h); if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } throw err(ERR.num); });
  def('SLN', (c, s, l) => (N(c) - N(s)) / N(l));
  // dynamic-array style helpers used inside other functions
  def('UNIQUE', r => { const seen = new Set(), out = []; for (const row of grid(r)){ const k = JSON.stringify(row); if (!seen.has(k)){ seen.add(k); out.push(row); } } return new Arr(out); });
  def('SORT', (r, i, o) => { const g = grid(r).map(x => [...x]); const k = Math.floor(N(opt(i, 1))) - 1, d = N(opt(o, 1)); g.sort((a, b) => cmp(a[k], b[k]) * d); return new Arr(g); });
  def('FILTER', (r, inc, empty) => { const g = grid(r), m = fullGrid(inc).map(x => !!x[0]); const out = g.filter((_, i) => m[i]); if (!out.length){ if (empty !== undefined) return empty; throw err('#CALC!'); } return new Arr(out); });
  def('SEQUENCE', (rows, cols, st, step) => { const R = N(rows), C = N(opt(cols, 1)), s0 = N(opt(st, 1)), k = N(opt(step, 1)); const out = []; for (let r = 0; r < R; r++){ const row = []; for (let c = 0; c < C; c++) row.push(s0 + (r * C + c) * k); out.push(row); } return new Arr(out); });
  def('HYPERLINK', (u, t) => t === undefined ? S(u) : S(t));
  // fix IPMT with a clean implementation
  FN.IPMT = (r, per, n, pv, fv, t) => { const R = N(r), p = N(per), T = N(opt(t, 0)); const M = FN.PMT(r, n, pv, fv, t); if (p === 1 && T) return 0; const bal = FN.FV(R, p - 1, M, pv, t); return (T ? bal / (1 + R) : bal) * R; };

  /* ---------------------------------------------------------------- function catalogue (Insert Function) */
  const CATS = {
    'Most used': 'SUM AVERAGE COUNT MAX MIN IF VLOOKUP XLOOKUP COUNTIF SUMIF ROUND TODAY',
    'Maths': 'SUM SUMIF SUMIFS SUMPRODUCT PRODUCT ROUND ROUNDUP ROUNDDOWN MROUND INT TRUNC ABS MOD QUOTIENT SQRT POWER EXP LN LOG LOG10 PI RAND RANDBETWEEN CEILING FLOOR EVEN ODD FACT GCD LCM COMBIN PERMUT SIGN SUBTOTAL SUMSQ DEGREES RADIANS SIN COS TAN',
    'Statistics': 'AVERAGE AVERAGEA AVERAGEIF AVERAGEIFS COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS MAX MAXIFS MIN MINIFS MEDIAN MODE STDEV.S STDEV.P VAR.S VAR.P LARGE SMALL RANK.EQ RANK.AVG PERCENTILE QUARTILE CORREL',
    'Logical': 'IF IFS IFERROR IFNA AND OR NOT XOR SWITCH CHOOSE TRUE FALSE',
    'Lookup': 'VLOOKUP HLOOKUP XLOOKUP LOOKUP INDEX MATCH XMATCH OFFSET INDIRECT ROW ROWS COLUMN COLUMNS ADDRESS TRANSPOSE UNIQUE SORT FILTER SEQUENCE HYPERLINK',
    'Text': 'LEN LEFT RIGHT MID UPPER LOWER PROPER TRIM CLEAN CONCAT CONCATENATE TEXTJOIN TEXT VALUE FIND SEARCH SUBSTITUTE REPLACE REPT EXACT CHAR CODE FIXED DOLLAR TEXTBEFORE TEXTAFTER',
    'Date & time': 'TODAY NOW DATE TIME YEAR MONTH DAY HOUR MINUTE SECOND WEEKDAY WEEKNUM EDATE EOMONTH DAYS DATEDIF NETWORKDAYS WORKDAY DATEVALUE TIMEVALUE YEARFRAC DAYS360',
    'Financial': 'PMT IPMT PPMT FV PV NPER RATE NPV IRR SLN',
    'Information': 'ISBLANK ISNUMBER ISTEXT ISLOGICAL ISERROR ISERR ISNA ISEVEN ISODD ISFORMULA NA N T TYPE',
  };
  const HELP = {SUM: 'number1, [number2], …|Adds numbers', AVERAGE: 'number1, [number2], …|Average of numbers', COUNT: 'value1, …|Counts cells with numbers', COUNTA: 'value1, …|Counts non-empty cells', MAX: 'number1, …|Largest value', MIN: 'number1, …|Smallest value',
    IF: 'logical_test, value_if_true, [value_if_false]|Chooses a value by a condition', IFS: 'test1, value1, [test2, value2], …|First true condition wins', IFERROR: 'value, value_if_error|Replaces an error', VLOOKUP: 'lookup_value, table, col_index, [approximate]|Finds a value in the first column, returns from another column',
    XLOOKUP: 'lookup_value, lookup_array, return_array, [if_not_found]|Finds a value and returns the matching item', HLOOKUP: 'lookup_value, table, row_index, [approximate]|Like VLOOKUP, across rows', INDEX: 'array, row, [column]|Value at a position', MATCH: 'lookup_value, array, [match_type]|Position of a value',
    COUNTIF: 'range, criteria|Counts cells that meet a condition, e.g. ">50"', COUNTIFS: 'range1, criteria1, …|Counts with several conditions', SUMIF: 'range, criteria, [sum_range]|Adds cells that meet a condition', SUMIFS: 'sum_range, range1, criteria1, …|Adds with several conditions',
    AVERAGEIF: 'range, criteria, [average_range]|Average with a condition', ROUND: 'number, digits|Rounds a number', TODAY: '|Today’s date', NOW: '|Date and time now', DATE: 'year, month, day|Makes a date', DATEDIF: 'start, end, unit|Difference in "Y", "M" or "D"', TEXT: 'value, format|Formats a number as text, e.g. "dd/mm/yyyy"',
    CONCAT: 'text1, [text2], …|Joins text', TEXTJOIN: 'delimiter, ignore_empty, text1, …|Joins with a separator', LEFT: 'text, [num_chars]|First characters', RIGHT: 'text, [num_chars]|Last characters', MID: 'text, start, num_chars|Characters from the middle', LEN: 'text|Number of characters', TRIM: 'text|Removes extra spaces',
    PMT: 'rate, nper, pv, [fv], [type]|Loan instalment (EMI)', FV: 'rate, nper, pmt, [pv], [type]|Future value', PV: 'rate, nper, pmt, [fv], [type]|Present value', NPV: 'rate, value1, …|Net present value', IRR: 'values, [guess]|Internal rate of return', SUMPRODUCT: 'array1, [array2], …|Sum of products', RANK: 'number, ref, [order]|Rank in a list',
    MEDIAN: 'number1, …|Middle value', 'STDEV.S': 'number1, …|Standard deviation (sample)', NETWORKDAYS: 'start, end, [holidays]|Working days between dates', EDATE: 'start, months|Date months later', EOMONTH: 'start, months|End of month', WEEKDAY: 'date, [type]|Day of the week number', AND: 'logical1, …|TRUE if all are true', OR: 'logical1, …|TRUE if any is true'};

  /* ---------------------------------------------------------------- reference shifting */
  function rebuild(f, map){ const toks = tokenize(f); let out = ''; for (const t of toks) out += t.type === 'ref' ? map(t) : t.type === 'func' ? t.text : t.text; return out; }
  const refText = (t, a, b) => { const pre = t.plen ? t.text.slice(0, t.plen) : ''; const cell = x => (x.ac ? '$' : '') + colName(x.c) + (x.ar ? '$' : '') + (x.r + 1);
    if (t.kind === 'cols') return pre + (a.ac ? '$' : '') + colName(a.c) + ':' + (b.ac ? '$' : '') + colName(b.c); if (t.kind === 'rows') return pre + (a.ar ? '$' : '') + (a.r + 1) + ':' + (b.ar ? '$' : '') + (b.r + 1); return pre + cell(a) + (b ? ':' + cell(b) : ''); };
  /* copy/fill: move relative parts by (dr, dc) */
  function shift(f, dr, dc){ return rebuild(f, t => { const mv = x => { const y = {...x}; if (y.r != null && !y.ar) y.r += dr; if (y.c != null && !y.ac) y.c += dc; return y; }; const a = mv(t.a), b = t.b ? mv(t.b) : null; if ((a.r != null && (a.r < 0 || a.r >= MAXR)) || (a.c != null && (a.c < 0 || a.c >= MAXC)) || (b && ((b.r != null && b.r < 0) || (b.c != null && b.c < 0)))) return (t.plen ? t.text.slice(0, t.plen) : '') + '#REF!'; return refText(t, a, b); }); }
  /* inserting/deleting rows or columns in a sheet: fix references that point into it */
  function adjust(f, sheetName, curSheetName, axis, at, count){
    return rebuild(f, t => { const target = t.sheet != null ? t.sheet : curSheetName; if (target.toLowerCase() !== sheetName.toLowerCase()) return t.text; const K = axis === 'r' ? 'r' : 'c';
      if ((K === 'r' && t.kind === 'cols') || (K === 'c' && t.kind === 'rows')) return t.text;
      const a = {...t.a}, b = t.b ? {...t.b} : null;
      if (count > 0){ if (a[K] >= at) a[K] += count; if (b && b[K] >= at) b[K] += count; return refText(t, a, b); }
      const n = -count, end = at + n - 1; // deleting at..end
      const fix = x => x[K] < at ? x[K] : x[K] > end ? x[K] - n : null;
      if (!b){ const v = fix(a); if (v == null) return (t.plen ? t.text.slice(0, t.plen) : '') + '#REF!'; a[K] = v; return refText(t, a, null); }
      let lo = Math.min(a[K], b[K]), hi = Math.max(a[K], b[K]); if (lo >= at && hi <= end) return (t.plen ? t.text.slice(0, t.plen) : '') + '#REF!';
      const nlo = lo < at ? lo : lo > end ? lo - n : at, nhi = hi < at ? hi : hi > end ? hi - n : at - 1; const swap = a[K] > b[K]; a[K] = swap ? nhi : nlo; b[K] = swap ? nlo : nhi; return refText(t, a, b); });
  }
  function renameSheet(f, oldN, newN){ return rebuild(f, t => t.sheet != null && t.sheet.toLowerCase() === oldN.toLowerCase() ? quoteSheet(newN) + '!' + t.text.slice(t.plen) : t.text); }
  /* references in a formula (for highlighting while editing) */
  function refsIn(f){ return tokenize(f).filter(t => t.type === 'ref'); }
  return {tokenize, parse, compile, evaluate, shift, adjust, renameSheet, refsIn, FN, CATS, HELP, Range, Arr, isRange, isArr, criterion, cmp};
})();
