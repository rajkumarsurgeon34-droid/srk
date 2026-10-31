/* SRK Sheets — formula engine: tokenizer, parser, evaluator, Excel functions, reference shifting */
'use strict';
const Formula = (() => {
  /* ---------------------------------------------------------------- tokenizer */
  const RE_ERR = /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|CIRC!|SPILL!|CALC!)/i;
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
        let spill = false; if (!b && src[i + len] === '#' && !RE_ERR.test(src.slice(i + len))){ spill = true; len++; }
        out.push({type: 'ref', text: src.slice(i, i + len), start: i, sheet, kind: 'cell', a, b, plen, spill}); i += len; continue; }
      if (sheet){ out.push({type: 'err', text: src.slice(i, i + plen) + '#REF!', value: '#REF!', start: i}); i += plen; continue; }
      if ((m = /^(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/.exec(rest))){ push('num', m[0], {value: parseFloat(m[0])}); continue; }
      if ((m = /^(_xlfn\.|_xlws\.|_xlpm\.)?([A-Za-z_\\][\w.]*)\s*\(/.exec(rest))){ out.push({type: 'func', text: m[0].replace(/\s*\($/, ''), name: m[2].toUpperCase(), start: i}); i += m[0].length - 1 - (m[0].length - m[0].trimEnd().length); while (src[i] !== '(') i++; continue; }
      if ((m = /^(TRUE|FALSE)(?![\w.(])/i.exec(rest))){ push('bool', m[0], {value: m[0].toUpperCase() === 'TRUE'}); continue; }
      if ((m = /^(?:_xlpm\.)?[A-Za-z_\\\u0080-\uFFFF][\w.\u0080-\uFFFF]*/.exec(rest))){ push('name', m[0], {name: m[0].replace(/^_xlpm\./, '')}); continue; }
      if ((m = /^(<=|>=|<>|[-+*\/^&=<>%(),;{}:@])/.exec(rest))){ push('op', m[0]); continue; }
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
    function unary(){ if (isOp(peek(), '@')){ next(); return {t: 'at', v: unary()}; } if (isOp(peek(), '-', '+')){ const op = next().text; const v = unary(); return op === '-' ? {t: 'neg', v} : v; } return percent(); }
    function percent(){ let v = primary(); while (isOp(peek(), '%')){ next(); v = {t: 'pct', v}; } return v; }
    function primary(){ let node = primary0(); while ((node.t === 'fn' && node.name === 'LAMBDA' || node.paren) && isOp(peek(), '(')){ next(); const args = []; if (!isOp(peek(), ')')){ do { args.push(expr()); } while (isOp(peek(), ',') && next()); } if (!isOp(next(), ')')) fail('Missing )'); node = {t: 'call', f: node, args}; } return node; }
    function primary0(){
      const t = next(); if (!t) fail('Formula ends too early');
      if (t.type === 'num') return {t: 'lit', v: t.value}; if (t.type === 'str') return {t: 'lit', v: t.value}; if (t.type === 'bool') return {t: 'lit', v: t.value}; if (t.type === 'err') return {t: 'lit', v: err(t.value)};
      if (t.type === 'ref') return {t: 'ref', ref: t};
      if (t.type === 'name') return {t: 'name', name: t.name};
      if (t.type === 'func'){ next(); const args = []; if (!isOp(peek(), ')')){ do { if (isOp(peek(), ',', ')')) args.push({t: 'lit', v: null, missing: true}); else args.push(expr()); } while (isOp(peek(), ',') && next()); } if (!isOp(next(), ')')) fail('Missing )'); return {t: 'fn', name: t.name, args}; }
      if (isOp(t, '(')){ const e = expr(); if (!isOp(next(), ')')) fail('Missing )'); return {...e, paren: true}; }
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
      case 'ref': { if (n.ref.spill){ const sh = n.ref.sheet != null ? CTX.sheetOf(n.ref.sheet) : CTX.cur; if (!sh || !CTX.spillRange) return err(ERR.ref); return CTX.spillRange(sh, n.ref.a.r, n.ref.a.c) || err(ERR.ref); } return refToRange(n.ref); }
      case 'at': { const v = ev(n.v); return isRange(v) || isArr(v) ? scalar(v) : v; }
      case 'call': { const f = ev(n.f); if (!(f instanceof Lambda)) return err(ERR.value); return invoke(f, n.args.map(a => ev(a))); }
      case 'arr': return new Arr(n.v);
      case 'name': { const lv = lookupScope(n.name); if (lv !== undefined) return lv; const d = CTX.names(n.name); if (d == null){ const fn = FN[n.name.toUpperCase()]; if (fn && !fn.lazy) return new Lambda(null, null, [], fn); return err(ERR.name); } return d; }
      case 'neg': { const v = ev(n.v); return lift(v, null, x => { const p = num(x); return isErr(p) ? p : -p; }); }
      case 'pct': { const v = ev(n.v); return lift(v, null, x => { const p = num(x); return isErr(p) ? p : p / 100; }); }
      case 'bin': return binop(n.op, ev(n.l), ev(n.r));
      case 'fn': { const sv = lookupScope(n.name); if (sv instanceof Lambda) return invoke(sv, n.args.map(a => a.missing ? undefined : ev(a)));
        const f = FN[n.name]; if (!f){ const d = CTX.names(n.name); if (d instanceof Lambda) return invoke(d, n.args.map(a => a.missing ? undefined : ev(a))); return err(ERR.name); }
        if (f.lazy) return f(n.args, ev);
        const args = n.args.map(a => a.missing ? undefined : ev(a));
        try { return f(...args); } catch(e){ if (isErr(e)) return e; if (e && e.message === 'NA') return err(ERR.na); console.warn(e); return err(ERR.value); } }
    }
    return err(ERR.value);
  }
  function evaluate(f, ctx){ const prev = CTX, ps = SCOPE; CTX = ctx; SCOPE = []; try { let v = ev(compile(f)); if (isRange(v) || isArr(v)) v = scalar(v); if (v instanceof Lambda) v = err(ERR.calc); return v === undefined ? 0 : v; } finally { CTX = prev; SCOPE = ps; } }
  /* like evaluate, but keeps arrays (dynamic-array formulas spill them) */
  function evaluateRaw(f, ctx){ const prev = CTX, ps = SCOPE; CTX = ctx; SCOPE = []; try { let v = ev(compile(f)); if (isRange(v)){ if (v.r1 === v.r2 && v.c1 === v.c2) v = CTX.get(v.sheet, v.r1, v.c1); else v = new Arr(fullGrid(v).map(r => r.map(x => x == null ? 0 : x))); } if (v instanceof Lambda) v = err(ERR.calc); if (isArr(v) && v.rows === 1 && v.cols === 1) v = v.a[0][0]; return v === undefined || v === null ? 0 : v; } finally { CTX = prev; SCOPE = ps; } }
  /* names defined as a formula or LAMBDA (Name Manager) */
  function evaluateNamed(f, ctx){ const prev = CTX, ps = SCOPE; CTX = ctx; SCOPE = []; try { return ev(compile(f)); } finally { CTX = prev; SCOPE = ps; } }
  /* LET / LAMBDA */
  class Lambda { constructor(params, body, scope, native){ this.params = params; this.body = body; this.scope = scope; this.native = native; } }
  const OMIT = {omitted: true}; let SCOPE = [];
  function lookupScope(name){ const k = String(name).toUpperCase(); for (let i = SCOPE.length - 1; i >= 0; i--) if (SCOPE[i].has(k)) return SCOPE[i].get(k); return undefined; }
  function invoke(L, args){ if (L.native){ try { return L.native(...args); } catch(e){ if (isErr(e)) return e; return err(ERR.value); } }
    if (args.length > L.params.length) return err(ERR.value); const m = new Map(); L.params.forEach((p, i) => m.set(p, i < args.length && args[i] !== undefined ? args[i] : OMIT));
    const prev = SCOPE; SCOPE = [...L.scope, m]; try { return ev(L.body); } finally { SCOPE = prev; } }

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

  /* ================================================================ Excel 365 additions */
  const G2 = v => (isRange(v) || isArr(v)) ? fullGrid(v) : [[scalar(v)]];
  const flat = v => G2(v).flat();
  const A2 = g => new Arr(g.length ? g : [[err(ERR.calc)]]);
  const NA = () => err(ERR.na);
  const lazyDef = (name, fn) => { fn.lazy = true; FN[name] = fn; };
  const asLambda = v => { if (v instanceof Lambda) return v; throw err(ERR.value); };
  const call = (L, ...a) => { const r = invoke(L, a); if (isErr(r)) throw r; return r; };
  // LET & LAMBDA
  lazyDef('LET', (args, evx) => { if (args.length < 3 || args.length % 2 === 0) return err(ERR.value); const m = new Map(); const prev = SCOPE; SCOPE = [...SCOPE, m];
    try { for (let i = 0; i < args.length - 1; i += 2){ const nm = args[i]; if (nm.t !== 'name') return err(ERR.value); m.set(nm.name.toUpperCase(), evx(args[i + 1])); } return evx(args[args.length - 1]); } finally { SCOPE = prev; } });
  lazyDef('LAMBDA', (args) => { if (!args.length) return err(ERR.value); const ps = args.slice(0, -1); if (ps.some(p => p.t !== 'name')) return err(ERR.value); return new Lambda(ps.map(p => p.name.toUpperCase()), args[args.length - 1], [...SCOPE]); });
  lazyDef('ISOMITTED', (args, evx) => { const n = args[0]; if (n && n.t === 'name') return lookupScope(n.name) === OMIT; return false; });
  def('MAP', (...a) => { const L = asLambda(a.pop()); const gs = a.map(G2); const R = gs[0].length, C = gs[0][0].length; const out = []; for (let r = 0; r < R; r++){ const row = []; for (let c = 0; c < C; c++) row.push(scalar(call(L, ...gs.map(g => (g[r] || [])[c])))); out.push(row); } return A2(out); });
  def('REDUCE', (init, arr, f) => { const L = asLambda(f); let acc = init === undefined ? 0 : scalar(init); for (const v of flat(arr)) acc = scalar(call(L, acc, v)); return acc; });
  def('SCAN', (init, arr, f) => { const L = asLambda(f); let acc = init === undefined ? 0 : scalar(init); const g = G2(arr); return A2(g.map(row => row.map(v => (acc = scalar(call(L, acc, v)))))); });
  def('BYROW', (arr, f) => { const L = asLambda(f); return A2(G2(arr).map(row => [scalar(call(L, new Arr([row])))])); });
  def('BYCOL', (arr, f) => { const L = asLambda(f); const g = G2(arr); return A2([g[0].map((_, c) => scalar(call(L, new Arr(g.map(r => [r[c]])))))]); });
  def('MAKEARRAY', (r, c, f) => { const L = asLambda(f); const R = N(r), C = N(c); if (R < 1 || C < 1) throw err(ERR.value); const out = []; for (let i = 1; i <= R; i++){ const row = []; for (let j = 1; j <= C; j++) row.push(scalar(call(L, i, j))); out.push(row); } return A2(out); });
  // dynamic arrays
  def('SORTBY', (arr, ...by) => { const g = G2(arr).map((row, i) => ({row, i})); const keys = []; for (let i = 0; i < by.length; i += 2) keys.push({k: flat(by[i]), d: by[i + 1] === undefined ? 1 : N(by[i + 1])}); g.sort((x, y) => { for (const {k, d} of keys){ const c = cmp(k[x.i], k[y.i]); if (c) return c * d; } return x.i - y.i; }); return A2(g.map(x => x.row)); });
  FN.SORT = (r, i, o, byCol) => { let g = G2(r).map(x => [...x]); const k = Math.floor(N(opt(i, 1))) - 1, d = N(opt(o, 1)); if (byCol !== undefined && B(byCol)){ const t = g[0].map((_, c) => g.map(row => row[c])); t.sort((a, b) => cmp(a[k], b[k]) * d); return A2(t[0].map((_, c) => t.map(row => row[c]))); } g.sort((a, b) => cmp(a[k], b[k]) * d); return A2(g); };
  FN.UNIQUE = (r, byCol, once) => { let g = G2(r); const col = byCol !== undefined && B(byCol); if (col) g = g[0].map((_, c) => g.map(row => row[c])); const cnt = new Map(); for (const row of g){ const k = JSON.stringify(row).toLowerCase(); cnt.set(k, (cnt.get(k) || 0) + 1); } const seen = new Set(); let out = []; for (const row of g){ const k = JSON.stringify(row).toLowerCase(); if (seen.has(k)) continue; seen.add(k); if (once !== undefined && B(once) && cnt.get(k) > 1) continue; out.push(row); } if (col) out = out[0] ? out[0].map((_, c) => out.map(row => row[c])) : out; return A2(out); };
  FN.FILTER = (r, inc, empty) => { const g = G2(r), m = G2(inc); let out; const ok = v => { if (isErr(v)) throw v; return !!v && v !== ''; };
    if (m.length === 1 && m[0].length > 1){ if (m[0].length !== g[0].length) throw err(ERR.value); const keep = m[0].map(ok); out = g.map(row => row.filter((_, i) => keep[i])); if (!out[0].length) out = []; }
    else { if (m.length !== g.length) throw err(ERR.value); out = g.filter((_, i) => ok(m[i][0])); }
    if (!out.length){ if (empty !== undefined) return empty; throw err(ERR.calc); } return A2(out); };
  def('RANDARRAY', (r, c, mn, mx, whole) => { const R = N(opt(r, 1)), C = N(opt(c, 1)), lo = N(opt(mn, 0)), hi = N(opt(mx, 1)), w = whole !== undefined && B(whole); const out = []; for (let i = 0; i < R; i++){ const row = []; for (let j = 0; j < C; j++) row.push(w ? Math.floor(lo + Math.random() * (hi - lo + 1)) : lo + Math.random() * (hi - lo)); out.push(row); } return A2(out); });
  const pad = (g, C, p) => g.map(r => r.length < C ? [...r, ...Array(C - r.length).fill(p)] : r);
  def('VSTACK', (...a) => { const gs = a.filter(x => x !== undefined).map(G2); const C = Math.max(...gs.map(g => g[0].length)); return A2(gs.flatMap(g => pad(g, C, NA()))); });
  def('HSTACK', (...a) => { const gs = a.filter(x => x !== undefined).map(G2); const R = Math.max(...gs.map(g => g.length)); const out = []; for (let r = 0; r < R; r++) out.push(gs.flatMap(g => g[r] || Array(g[0].length).fill(NA()))); return A2(out); });
  const takeN = (list, n) => n >= 0 ? list.slice(0, n) : list.slice(n);
  def('TAKE', (a, r, c) => { let g = G2(a); if (r !== undefined && r !== null) g = takeN(g, Math.trunc(N(r))); if (c !== undefined && c !== null) g = g.map(row => takeN(row, Math.trunc(N(c)))); return A2(g); });
  def('DROP', (a, r, c) => { let g = G2(a); if (r !== undefined && r !== null){ const n = Math.trunc(N(r)); g = n >= 0 ? g.slice(n) : g.slice(0, n); } if (c !== undefined && c !== null){ const n = Math.trunc(N(c)); g = g.map(row => n >= 0 ? row.slice(n) : row.slice(0, n)); } return A2(g); });
  const pick = (len, i) => { i = Math.trunc(N(i)); const k = i < 0 ? len + i : i - 1; if (k < 0 || k >= len || i === 0) throw err(ERR.value); return k; };
  def('CHOOSECOLS', (a, ...ix) => { const g = G2(a); const ks = ix.flatMap(flat).map(i => pick(g[0].length, i)); return A2(g.map(row => ks.map(k => row[k]))); });
  def('CHOOSEROWS', (a, ...ix) => { const g = G2(a); const ks = ix.flatMap(flat).map(i => pick(g.length, i)); return A2(ks.map(k => g[k])); });
  const ignoreF = (ig) => { const m = Math.trunc(N(opt(ig, 0))); return v => (m === 1 || m === 3) && (v == null || v === '') || (m === 2 || m === 3) && isErr(v); };
  def('TOCOL', (a, ig, sc) => { const g = G2(a), skip = ignoreF(ig); const out = []; if (sc !== undefined && B(sc)){ for (let c = 0; c < g[0].length; c++) for (const row of g) if (!skip(row[c])) out.push([row[c]]); } else for (const row of g) for (const v of row) if (!skip(v)) out.push([v]); return A2(out); });
  def('TOROW', (a, ig, sc) => { const t = FN.TOCOL(a, ig, sc); return A2([t.a.map(r => r[0])]); });
  def('WRAPROWS', (v, w, p) => { const list = flat(v), n = Math.trunc(N(w)); if (n < 1) throw err(ERR.num); const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return A2(pad(out, n, p === undefined ? NA() : scalar(p))); });
  def('WRAPCOLS', (v, w, p) => { const t = FN.WRAPROWS(v, w, p).a; return A2(t[0].map((_, c) => t.map(r => r[c]))); });
  def('EXPAND', (a, r, c, p) => { const g = G2(a); const R = r == null ? g.length : N(r), C = c == null ? g[0].length : N(c); if (R < g.length || C < g[0].length) throw err(ERR.value); const fill = p === undefined ? NA() : scalar(p); const out = pad(g, C, fill); while (out.length < R) out.push(Array(C).fill(fill)); return A2(out); });
  def('TEXTSPLIT', (t, cd, rd, ig, mm, p) => { const s = S(t); const mk = d => { if (d === undefined || d === null) return null; const ds = flat(d).map(x => str(x)).filter(x => x !== ''); if (!ds.length) return null; return new RegExp(ds.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), mm !== undefined && N(mm) === 1 ? 'i' : ''); };
    const C = mk(cd), R = mk(rd), skip = ig !== undefined && B(ig); let rows = R ? s.split(R) : [s]; if (skip) rows = rows.filter(x => x !== ''); let g = rows.map(r => { let cs = C ? r.split(C) : [r]; if (skip) cs = cs.filter(x => x !== ''); return cs; }); const W = Math.max(...g.map(r => r.length)); return A2(pad(g, W, p === undefined ? NA() : scalar(p))); });
  FN.TEXTBEFORE = (t, d, n, mm, me, nf) => { const s = S(t), ds = S(d), k = Math.trunc(N(opt(n, 1))); const ci = mm !== undefined && N(mm) === 1; const hay = ci ? s.toLowerCase() : s, nd = ci ? ds.toLowerCase() : ds; let idx = -1; if (k > 0){ let from = 0; for (let i = 0; i < k; i++){ idx = hay.indexOf(nd, from); if (idx < 0) break; from = idx + Math.max(1, nd.length); } } else { let from = hay.length; for (let i = 0; i < -k; i++){ idx = hay.lastIndexOf(nd, from); if (idx < 0) break; from = idx - 1; } } if (idx < 0){ if (me !== undefined && B(me)) return k > 0 ? s : ''; if (nf !== undefined) return nf; throw err(ERR.na); } return s.slice(0, idx); };
  FN.TEXTAFTER = (t, d, n, mm, me, nf) => { const s = S(t), ds = S(d), k = Math.trunc(N(opt(n, 1))); const ci = mm !== undefined && N(mm) === 1; const hay = ci ? s.toLowerCase() : s, nd = ci ? ds.toLowerCase() : ds; let idx = -1; if (k > 0){ let from = 0; for (let i = 0; i < k; i++){ idx = hay.indexOf(nd, from); if (idx < 0) break; from = idx + Math.max(1, nd.length); } } else { let from = hay.length; for (let i = 0; i < -k; i++){ idx = hay.lastIndexOf(nd, from); if (idx < 0) break; from = idx - 1; } } if (idx < 0){ if (me !== undefined && B(me)) return k > 0 ? '' : s; if (nf !== undefined) return nf; throw err(ERR.na); } return s.slice(idx + ds.length); };
  const v2t = (v, strict) => isErr(v) ? v.e : typeof v === 'string' ? (strict ? '"' + v.replace(/"/g, '""') + '"' : v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v == null ? '' : generalNum(v);
  def('VALUETOTEXT', (v, f) => v2t(scalar(v), f !== undefined && N(f) === 1));
  def('ARRAYTOTEXT', (a, f) => { const st = f !== undefined && N(f) === 1; const g = G2(a); return st ? '{' + g.map(r => r.map(v => v2t(v, true)).join(',')).join(';') + '}' : g.flat().map(v => v2t(v)).join(', '); });
  def('TRIMRANGE', (r) => { if (!isRange(r)) return r; const g = fullGrid(r); let r1 = 0, r2 = g.length - 1, c1 = 0, c2 = (g[0] || []).length - 1; const e = v => v == null || v === ''; while (r1 <= r2 && g[r1].every(e)) r1++; while (r2 >= r1 && g[r2].every(e)) r2--; if (r1 > r2) throw err(ERR.ref); while (c1 <= c2 && g.slice(r1, r2 + 1).every(row => e(row[c1]))) c1++; while (c2 >= c1 && g.slice(r1, r2 + 1).every(row => e(row[c2]))) c2--; return new Range(r.sheet, r.r1 + r1, r.c1 + c1, r.r1 + r2, r.c1 + c2); });
  def('PERCENTOF', (a, b) => { const x = nums([a]).reduce((s, v) => s + v, 0), y = nums([b]).reduce((s, v) => s + v, 0); if (!y) throw err(ERR.div0); return x / y; });
  def('GROUPBY', (rf, vals_, fn, hdr, tot, so) => { const L = asLambda(fn); const keys = G2(rf), vs = G2(vals_); const hasH = hdr !== undefined && N(hdr) > 0; const kk = hasH ? keys.slice(1) : keys, vv = hasH ? vs.slice(1) : vs; const groups = new Map();
    kk.forEach((row, i) => { const k = JSON.stringify(row); if (!groups.has(k)) groups.set(k, {key: row, rows: []}); groups.get(k).rows.push(vv[i] || []); });
    let out = [...groups.values()].map(gp => [...gp.key, ...vv[0].map((_, c) => scalar(call(L, new Arr(gp.rows.map(r => [r[c]])))))]);
    const s = so === undefined ? 1 : N(so); out.sort((a, b) => { const k = Math.abs(s) - 1; return cmp(a[k], b[k]) * Math.sign(s); });
    if (tot === undefined || N(tot) !== 0) out.push(['Total', ...Array(kk[0].length - 1).fill(''), ...vv[0].map((_, c) => scalar(call(L, new Arr(vv.map(r => [r[c]])))))]);
    if (hasH) out.unshift([...keys[0], ...vs[0]]); return A2(out); });
  // matrices
  def('MMULT', (a, b) => { const x = G2(a), y = G2(b); if (x[0].length !== y.length) throw err(ERR.value); return A2(x.map(r => y[0].map((_, j) => r.reduce((s, v, k) => s + N(v) * N(y[k][j]), 0)))); });
  const det = m => { const n = m.length; const a = m.map(r => r.map(N)); let d = 1; for (let i = 0; i < n; i++){ let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r; if (!a[p][i]) return 0; if (p !== i){ [a[p], a[i]] = [a[i], a[p]]; d = -d; } d *= a[i][i]; for (let r = i + 1; r < n; r++){ const f = a[r][i] / a[i][i]; for (let c = i; c < n; c++) a[r][c] -= f * a[i][c]; } } return d; };
  def('MDETERM', a => { const m = G2(a); if (m.length !== m[0].length) throw err(ERR.value); return det(m); });
  def('MINVERSE', a => { const m = G2(a).map(r => r.map(N)); const n = m.length; if (n !== m[0].length) throw err(ERR.value); const A = m.map((r, i) => [...r, ...Array.from({length: n}, (_, j) => i === j ? 1 : 0)]); for (let i = 0; i < n; i++){ let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; if (Math.abs(A[p][i]) < 1e-12) throw err(ERR.num); [A[p], A[i]] = [A[i], A[p]]; const d = A[i][i]; for (let c = 0; c < 2 * n; c++) A[i][c] /= d; for (let r = 0; r < n; r++) if (r !== i){ const f = A[r][i]; for (let c = 0; c < 2 * n; c++) A[r][c] -= f * A[i][c]; } } return A2(A.map(r => r.slice(n))); });
  def('MUNIT', n => { const k = N(n); return A2(Array.from({length: k}, (_, i) => Array.from({length: k}, (_, j) => i === j ? 1 : 0))); });
  def('FREQUENCY', (d, b) => { const x = nums([d], {skipErr: false}), bins = nums([b]).sort((p, q) => p - q); const out = Array(bins.length + 1).fill(0); for (const v of x){ let i = bins.findIndex(t => v <= t); if (i < 0) i = bins.length; out[i]++; } return A2(out.map(v => [v])); });
  // statistics
  const xyPairs = (ys, xs) => { const a = flat(ys), b = flat(xs); if (a.length !== b.length) throw err(ERR.na); const out = []; a.forEach((y, i) => { if (typeof y === 'number' && typeof b[i] === 'number') out.push([b[i], y]); }); return out; };
  const meanOf = a => a.reduce((s, v) => s + v, 0) / a.length;
  const linfit = (ys, xs) => { const p = xyPairs(ys, xs); if (p.length < 2) throw err(ERR.div0); const mx = meanOf(p.map(q => q[0])), my = meanOf(p.map(q => q[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of p){ sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } if (!sxx) throw err(ERR.div0); const b = sxy / sxx; return {b, a: my - b * mx, sxy, sxx, syy, n: p.length}; };
  def('SLOPE', (y, x) => linfit(y, x).b); def('INTERCEPT', (y, x) => linfit(y, x).a); def('RSQ', (y, x) => { const f = linfit(y, x); return f.sxy * f.sxy / (f.sxx * f.syy); });
  def('STEYX', (y, x) => { const f = linfit(y, x); return Math.sqrt((f.syy - f.sxy * f.sxy / f.sxx) / (f.n - 2)); });
  def('FORECAST FORECAST.LINEAR', (x, y, xs) => { const f = linfit(y, xs); return f.a + f.b * N(x); });
  def('TREND', (y, xs, nx) => { const f = linfit(y, xs === undefined ? new Arr(flat(y).map((_, i) => [i + 1])) : xs); const g = nx === undefined ? (xs === undefined ? flat(y).map((_, i) => [i + 1]) : G2(xs)) : G2(nx); return A2(g.map(r => r.map(v => f.a + f.b * N(v)))); });
  def('GROWTH', (y, xs, nx) => { const ly = new Arr(flat(y).map(v => [Math.log(N(v))])); const xx = xs === undefined ? new Arr(flat(y).map((_, i) => [i + 1])) : xs; const f = linfit(ly, xx); const g = nx === undefined ? G2(xx) : G2(nx); return A2(g.map(r => r.map(v => Math.exp(f.a + f.b * N(v))))); });
  def('COVARIANCE.P COVAR', (a, b) => { const p = xyPairs(a, b); const mx = meanOf(p.map(q => q[0])), my = meanOf(p.map(q => q[1])); return p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / p.length; });
  def('COVARIANCE.S', (a, b) => { const p = xyPairs(a, b); const mx = meanOf(p.map(q => q[0])), my = meanOf(p.map(q => q[1])); return p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / (p.length - 1); });
  def('GEOMEAN', (...a) => { const x = nums(a); if (!x.length || x.some(v => v <= 0)) throw err(ERR.num); return Math.exp(x.reduce((s, v) => s + Math.log(v), 0) / x.length); });
  def('HARMEAN', (...a) => { const x = nums(a); if (!x.length || x.some(v => v <= 0)) throw err(ERR.num); return x.length / x.reduce((s, v) => s + 1 / v, 0); });
  def('AVEDEV', (...a) => { const x = nums(a), m = meanOf(x); return x.reduce((s, v) => s + Math.abs(v - m), 0) / x.length; });
  def('DEVSQ', (...a) => { const x = nums(a), m = meanOf(x); return x.reduce((s, v) => s + (v - m) ** 2, 0); });
  const sdS = x => { const m = meanOf(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };
  def('SKEW', (...a) => { const x = nums(a), n = x.length; if (n < 3) throw err(ERR.div0); const m = meanOf(x), s = sdS(x); return n / ((n - 1) * (n - 2)) * x.reduce((t, v) => t + ((v - m) / s) ** 3, 0); });
  def('KURT', (...a) => { const x = nums(a), n = x.length; if (n < 4) throw err(ERR.div0); const m = meanOf(x), s = sdS(x); return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * x.reduce((t, v) => t + ((v - m) / s) ** 4, 0) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)); });
  def('STANDARDIZE', (x, m, s) => (N(x) - N(m)) / N(s));
  def('TRIMMEAN', (a, p) => { const x = nums([a]).sort((q, r) => q - r); const k = Math.floor(x.length * N(p) / 2); const y = x.slice(k, x.length - k); return meanOf(y); });
  def('PERCENTRANK PERCENTRANK.INC', (a, v, sig) => { const x = nums([a]).sort((p, q) => p - q), t = N(v), n = x.length; if (t < x[0] || t > x[n - 1]) throw err(ERR.na); let i = x.findIndex(q => q >= t); let r; if (x[i] === t) r = x.filter(q => q < t).length / (n - 1); else r = (i - 1 + (t - x[i - 1]) / (x[i] - x[i - 1])) / (n - 1); const d = sig === undefined ? 3 : N(sig); return Math.floor(r * 10 ** d) / 10 ** d; });
  def('PERCENTILE.EXC', (a, k) => { const x = nums([a]).sort((p, q) => p - q), n = x.length, p = N(k); const h = (n + 1) * p; if (h < 1 || h > n) throw err(ERR.num); const lo = Math.floor(h); return x[lo - 1] + (h - lo) * ((x[lo] ?? x[lo - 1]) - x[lo - 1]); });
  def('QUARTILE.EXC', (a, q) => FN['PERCENTILE.EXC'](a, N(q) / 4));
  def('MODE.MULT', (...a) => { const x = nums(a), c = new Map(); x.forEach(v => c.set(v, (c.get(v) || 0) + 1)); const mx = Math.max(...c.values()); if (mx < 2) throw err(ERR.na); return A2([...c].filter(([, n]) => n === mx).map(([v]) => [v])); });
  // distributions
  const SQ2PI = Math.sqrt(2 * Math.PI);
  function erf(x){ const t = 1 / (1 + 0.5 * Math.abs(x)); const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : -y; }
  const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  function phiInv(p){ if (p <= 0 || p >= 1) throw err(ERR.num); const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00], b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01], c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00], d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r, x; if (p < pl){ q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); } else if (p <= 1 - pl){ q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); } else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    for (let i = 0; i < 2; i++){ const e = phi(x) - p; const u = e * SQ2PI * Math.exp(x * x / 2); x = x - u / (1 + x * u / 2); } return x; }
  // gamma & incomplete beta / gamma (Numerical Recipes)
  function gammaln(x){ const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function betacf(a, b, x){ let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d; for (let m = 1; m <= 300; m++){ const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break; } return h; }
  function ibeta(x, a, b){ if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  function gammp(a, x){ if (x <= 0) return 0; if (x < a + 1){ let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++){ ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 3e-15) break; } return sum * Math.exp(-x + a * Math.log(x) - gammaln(a)); } let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i <= 500; i++){ const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-15) break; } return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h; }
  const tcdf = (t, df) => { const x = df / (df + t * t); const p = 0.5 * ibeta(x, df / 2, 0.5); return t >= 0 ? 1 - p : p; };
  const tpdf = (t, df) => Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + t * t / df, -(df + 1) / 2);
  const chicdf = (x, k) => gammp(k / 2, x / 2);
  const fcdf = (x, d1, d2) => x <= 0 ? 0 : ibeta(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2);
  const invert = (cdf, p, lo, hi) => { if (p <= 0 || p >= 1) throw err(ERR.num); while (cdf(hi) < p) hi *= 2; for (let i = 0; i < 200; i++){ const m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; if (hi - lo < 1e-12 * Math.max(1, Math.abs(m))) break; } return (lo + hi) / 2; };
  def('NORM.DIST NORMDIST', (x, m, s, c) => { const z = (N(x) - N(m)) / N(s); if (N(s) <= 0) throw err(ERR.num); return B(c) ? phi(z) : Math.exp(-z * z / 2) / (N(s) * SQ2PI); });
  def('NORM.S.DIST', (z, c) => { const v = N(z); return B(c) ? phi(v) : Math.exp(-v * v / 2) / SQ2PI; }); def('NORMSDIST', z => phi(N(z)));
  def('NORM.INV NORMINV', (p, m, s) => N(m) + N(s) * phiInv(N(p))); def('NORM.S.INV NORMSINV', p => phiInv(N(p)));
  def('GAMMALN GAMMALN.PRECISE', x => gammaln(N(x))); def('GAMMA', x => { const v = N(x); if (v <= 0 && Number.isInteger(v)) throw err(ERR.num); return v > 0 ? Math.exp(gammaln(v)) : Math.PI / (Math.sin(Math.PI * v) * Math.exp(gammaln(1 - v))); });
  def('T.DIST', (x, df, c) => B(c) ? tcdf(N(x), N(df)) : tpdf(N(x), N(df)));
  def('T.DIST.2T', (x, df) => { if (N(x) < 0) throw err(ERR.num); return 2 * (1 - tcdf(N(x), N(df))); }); def('T.DIST.RT', (x, df) => 1 - tcdf(N(x), N(df)));
  def('TDIST', (x, df, t) => (N(t) === 2 ? 2 : 1) * (1 - tcdf(N(x), N(df))));
  def('T.INV', (p, df) => { const P = N(p), d = N(df); return P < 0.5 ? -invert(t => tcdf(t, d), 1 - P, 0, 10) : invert(t => tcdf(t, d), P, 0, 10); });
  def('T.INV.2T TINV', (p, df) => { const d = N(df); return invert(t => tcdf(t, d), 1 - N(p) / 2, 0, 10); });
  def('T.TEST TTEST', (a1, a2, tails, type) => { const x = nums([a1]), y = nums([a2]), T = N(tails), ty = N(type); let t, df;
    if (ty === 1){ if (x.length !== y.length) throw err(ERR.na); const d = x.map((v, i) => v - y[i]); const m = meanOf(d), s = sdS(d); t = m / (s / Math.sqrt(d.length)); df = d.length - 1; }
    else { const mx = meanOf(x), my = meanOf(y), vx = sdS(x) ** 2, vy = sdS(y) ** 2, n1 = x.length, n2 = y.length;
      if (ty === 2){ const sp = ((n1 - 1) * vx + (n2 - 1) * vy) / (n1 + n2 - 2); t = (mx - my) / Math.sqrt(sp * (1 / n1 + 1 / n2)); df = n1 + n2 - 2; }
      else { t = (mx - my) / Math.sqrt(vx / n1 + vy / n2); df = (vx / n1 + vy / n2) ** 2 / ((vx / n1) ** 2 / (n1 - 1) + (vy / n2) ** 2 / (n2 - 1)); } }
    const p1 = 1 - tcdf(Math.abs(t), df); return T === 1 ? p1 : 2 * p1; });
  def('CHISQ.DIST', (x, k, c) => { const X = N(x), K = N(k); return B(c) ? chicdf(X, K) : X <= 0 ? 0 : Math.exp((K / 2 - 1) * Math.log(X) - X / 2 - (K / 2) * Math.log(2) - gammaln(K / 2)); });
  def('CHISQ.DIST.RT CHIDIST', (x, k) => 1 - chicdf(N(x), N(k)));
  def('CHISQ.INV', (p, k) => { const K = N(k); return invert(x => chicdf(x, K), N(p), 0, Math.max(10, K * 3)); }); def('CHISQ.INV.RT CHIINV', (p, k) => { const K = N(k); return invert(x => chicdf(x, K), 1 - N(p), 0, Math.max(10, K * 3)); });
  def('CHISQ.TEST CHITEST', (o, e) => { const O = G2(o), E = G2(e); let chi = 0; for (let r = 0; r < O.length; r++) for (let c = 0; c < O[0].length; c++){ const ev_ = N(E[r][c]); chi += (N(O[r][c]) - ev_) ** 2 / ev_; } const R = O.length, C = O[0].length; const df = R > 1 && C > 1 ? (R - 1) * (C - 1) : R * C - 1; return 1 - chicdf(chi, df); });
  def('F.DIST', (x, a, b, c) => { const X = N(x), d1 = N(a), d2 = N(b); if (B(c)) return fcdf(X, d1, d2); return Math.exp(0.5 * (d1 * Math.log(d1 * X) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * X + d2)) - Math.log(X) - (gammaln(d1 / 2) + gammaln(d2 / 2) - gammaln((d1 + d2) / 2))); });
  def('F.DIST.RT FDIST', (x, a, b) => 1 - fcdf(N(x), N(a), N(b)));
  def('F.INV', (p, a, b) => { const d1 = N(a), d2 = N(b); return invert(x => fcdf(x, d1, d2), N(p), 0, 10); }); def('F.INV.RT FINV', (p, a, b) => { const d1 = N(a), d2 = N(b); return invert(x => fcdf(x, d1, d2), 1 - N(p), 0, 10); });
  def('F.TEST FTEST', (a, b) => { const x = nums([a]), y = nums([b]); const v1 = sdS(x) ** 2, v2 = sdS(y) ** 2; const f = v1 / v2, d1 = x.length - 1, d2 = y.length - 1; const p = fcdf(f, d1, d2); return 2 * Math.min(p, 1 - p); });
  def('Z.TEST ZTEST', (a, x, s) => { const v = nums([a]); const sd = s === undefined ? sdS(v) : N(s); return 1 - phi((meanOf(v) - N(x)) / (sd / Math.sqrt(v.length))); });
  def('CONFIDENCE.NORM CONFIDENCE', (al, s, n) => phiInv(1 - N(al) / 2) * N(s) / Math.sqrt(N(n)));
  def('CONFIDENCE.T', (al, s, n) => { const d = N(n) - 1; return invert(t => tcdf(t, d), 1 - N(al) / 2, 0, 10) * N(s) / Math.sqrt(N(n)); });
  const comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  def('BINOM.DIST BINOMDIST', (k, n, p, c) => { const K = Math.floor(N(k)), Nn = Math.floor(N(n)), P = N(p); const pmf = i => comb(Nn, i) * P ** i * (1 - P) ** (Nn - i); if (!B(c)) return pmf(K); let s = 0; for (let i = 0; i <= K; i++) s += pmf(i); return s; });
  def('POISSON.DIST POISSON', (x, m, c) => { const X = Math.floor(N(x)), M = N(m); const pmf = i => Math.exp(-M + i * Math.log(M) - gammaln(i + 1)); if (!B(c)) return pmf(X); let s = 0; for (let i = 0; i <= X; i++) s += pmf(i); return s; });
  def('EXPON.DIST EXPONDIST', (x, l, c) => { const X = N(x), L = N(l); return B(c) ? 1 - Math.exp(-L * X) : L * Math.exp(-L * X); });
  def('FISHER', x => 0.5 * Math.log((1 + N(x)) / (1 - N(x)))); def('FISHERINV', y => { const e = Math.exp(2 * N(y)); return (e - 1) / (e + 1); });
  // maths
  def('SINH', x => Math.sinh(N(x))); def('COSH', x => Math.cosh(N(x))); def('TANH', x => Math.tanh(N(x))); def('ASINH', x => Math.asinh(N(x))); def('ACOSH', x => Math.acosh(N(x))); def('ATANH', x => Math.atanh(N(x)));
  def('COT', x => 1 / Math.tan(N(x))); def('CSC', x => 1 / Math.sin(N(x))); def('SEC', x => 1 / Math.cos(N(x))); def('ACOT', x => Math.PI / 2 - Math.atan(N(x)));
  def('SQRTPI', x => Math.sqrt(N(x) * Math.PI)); def('FACTDOUBLE', x => { let n = Math.floor(N(x)), r = 1; for (; n > 1; n -= 2) r *= n; return r; });
  def('MULTINOMIAL', (...a) => { const x = nums(a).map(Math.floor); const f = n => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }; return f(x.reduce((s, v) => s + v, 0)) / x.reduce((s, v) => s * f(v), 1); });
  def('COMBINA', (n, k) => comb(N(n) + N(k) - 1, N(k)));
  def('SUMX2MY2', (a, b) => { const x = flat(a), y = flat(b); return x.reduce((s, v, i) => s + N(v) ** 2 - N(y[i]) ** 2, 0); }); def('SUMX2PY2', (a, b) => { const x = flat(a), y = flat(b); return x.reduce((s, v, i) => s + N(v) ** 2 + N(y[i]) ** 2, 0); }); def('SUMXMY2', (a, b) => { const x = flat(a), y = flat(b); return x.reduce((s, v, i) => s + (N(v) - N(y[i])) ** 2, 0); });
  def('BASE', (n, r, l) => { const s = Math.floor(N(n)).toString(N(r)).toUpperCase(); return s.padStart(l === undefined ? 0 : N(l), '0'); }); def('DECIMAL', (t, r) => { const v = parseInt(S(t), N(r)); if (isNaN(v)) throw err(ERR.num); return v; });
  const radix = (from, to) => (v, places) => { const n = from === 10 ? Math.trunc(N(v)) : parseInt(S(v), from); if (isNaN(n)) throw err(ERR.num); if (to === 10) return n; let s = (n < 0 ? (2 ** 40 + n) : n).toString(to).toUpperCase(); if (places !== undefined) s = s.padStart(N(places), '0'); return s; };
  def('DEC2BIN', radix(10, 2)); def('DEC2HEX', radix(10, 16)); def('DEC2OCT', radix(10, 8)); def('BIN2DEC', radix(2, 10)); def('HEX2DEC', radix(16, 10)); def('OCT2DEC', radix(8, 10)); def('BIN2HEX', radix(2, 16)); def('HEX2BIN', radix(16, 2));
  def('BITAND', (a, b) => Number(BigInt(N(a)) & BigInt(N(b)))); def('BITOR', (a, b) => Number(BigInt(N(a)) | BigInt(N(b)))); def('BITXOR', (a, b) => Number(BigInt(N(a)) ^ BigInt(N(b))));
  def('ROMAN', n => { let x = Math.floor(N(n)); if (x < 0 || x > 3999) throw err(ERR.value); const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (x >= v){ s += r; x -= v; } return s; });
  def('ARABIC', t => { const s = S(t).toUpperCase().trim(), V = {I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000}; let n = 0; for (let i = 0; i < s.length; i++){ const v = V[s[i]], w = V[s[i + 1]] || 0; if (!v) throw err(ERR.value); n += v < w ? -v : v; } return n; });
  def('DELTA', (a, b) => N(a) === N(opt(b, 0)) ? 1 : 0); def('GESTEP', (a, b) => N(a) >= N(opt(b, 0)) ? 1 : 0);
  const UNITS = {m: ['len', 1], km: ['len', 1000], cm: ['len', .01], mm: ['len', .001], in: ['len', .0254], ft: ['len', .3048], yd: ['len', .9144], mi: ['len', 1609.344], g: ['mass', 1], kg: ['mass', 1000], mg: ['mass', .001], lbm: ['mass', 453.59237], ozm: ['mass', 28.349523125], l: ['vol', 1], L: ['vol', 1], ml: ['vol', .001], mL: ['vol', .001], gal: ['vol', 3.785411784], sec: ['time', 1], s: ['time', 1], mn: ['time', 60], min: ['time', 60], hr: ['time', 3600], day: ['time', 86400], d: ['time', 86400], yr: ['time', 31557600], km2: ['area', 1e6], m2: ['area', 1], ha: ['area', 1e4], ft2: ['area', .09290304], J: ['en', 1], cal: ['en', 4.1868], kcal: ['en', 4186.8], W: ['pow', 1], kW: ['pow', 1000], HP: ['pow', 745.6998715822702], Pa: ['pr', 1], atm: ['pr', 101325], mmHg: ['pr', 133.322], bar: ['pr', 1e5]};
  def('CONVERT', (v, f, t) => { const x = N(v), a = S(f), b = S(t); const T = {C: [1, 0], F: [5 / 9, -32], K: [1, -273.15]}; if (T[a] && T[b]){ const c = a === 'C' ? x : a === 'F' ? (x - 32) * 5 / 9 : x - 273.15; return b === 'C' ? c : b === 'F' ? c * 9 / 5 + 32 : c + 273.15; } const ua = UNITS[a], ub = UNITS[b]; if (!ua || !ub || ua[0] !== ub[0]) throw err(ERR.na); return x * ua[1] / ub[1]; });
  // financial
  def('EFFECT', (r, n) => (1 + N(r) / N(n)) ** N(n) - 1); def('NOMINAL', (r, n) => N(n) * ((1 + N(r)) ** (1 / N(n)) - 1));
  def('PDURATION', (r, pv, fv) => (Math.log(N(fv)) - Math.log(N(pv))) / Math.log(1 + N(r))); def('RRI', (n, pv, fv) => (N(fv) / N(pv)) ** (1 / N(n)) - 1);
  def('FVSCHEDULE', (p, s) => nums([s]).reduce((a, r) => a * (1 + r), N(p)));
  def('CUMIPMT', (r, n, pv, s, e, t) => { let tot = 0; for (let k = N(s); k <= N(e); k++) tot += FN.IPMT(r, k, n, pv, 0, t); return tot; });
  def('CUMPRINC', (r, n, pv, s, e, t) => { let tot = 0; for (let k = N(s); k <= N(e); k++) tot += FN.PPMT(r, k, n, pv, 0, t); return tot; });
  def('SYD', (c, s, l, p) => (N(c) - N(s)) * (N(l) - N(p) + 1) * 2 / (N(l) * (N(l) + 1)));
  def('DDB', (c, s, l, p, f) => { const C = N(c), S_ = N(s), L = N(l), P = N(p), F = N(opt(f, 2)); let book = C, dep = 0; for (let i = 1; i <= P; i++){ dep = Math.min(book * F / L, Math.max(0, book - S_)); book -= dep; } return dep; });
  def('DB', (c, s, l, p, m) => { const C = N(c), S_ = N(s), L = N(l), P = N(p), M = N(opt(m, 12)); const rate = Math.round((1 - (S_ / C) ** (1 / L)) * 1000) / 1000; let tot = 0, dep = 0; for (let i = 1; i <= P; i++){ dep = i === 1 ? C * rate * M / 12 : i === L + 1 ? (C - tot) * rate * (12 - M) / 12 : (C - tot) * rate; tot += dep; } return dep; });
  def('XNPV', (r, v, d) => { const R = N(r), x = flat(v).map(N), t = flat(d).map(N); return x.reduce((s, val, i) => s + val / (1 + R) ** ((t[i] - t[0]) / 365), 0); });
  def('XIRR', (v, d, g) => { const x = flat(v).map(N), t = flat(d).map(N); let r = g === undefined ? 0.1 : N(g); for (let i = 0; i < 100; i++){ let f = 0, df = 0; x.forEach((val, k) => { const e = (t[k] - t[0]) / 365; f += val / (1 + r) ** e; df -= e * val / (1 + r) ** (e + 1); }); const nr = r - f / df; if (!isFinite(nr)) break; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } throw err(ERR.num); });
  def('MIRR', (v, fr, rr) => { const x = flat(v).map(N), n = x.length, F = N(fr), R = N(rr); let pvn = 0, fvp = 0; x.forEach((val, i) => { if (val < 0) pvn += val / (1 + F) ** i; else fvp += val * (1 + R) ** (n - 1 - i); }); return (fvp / -pvn) ** (1 / (n - 1)) - 1; });
  // text (regex)
  const rx = (p, cs, g) => { try { return new RegExp(S(p), (cs !== undefined && N(cs) === 1 ? 'i' : '') + (g ? 'g' : '')); } catch(e){ throw err(ERR.value); } };
  def('REGEXTEST', (t, p, cs) => rx(p, cs).test(S(t)));
  def('REGEXEXTRACT', (t, p, mode, cs) => { const s = S(t), m = Math.trunc(N(opt(mode, 0))); if (m === 1){ const all = [...s.matchAll(rx(p, cs, true))].map(x => [x[0]]); if (!all.length) throw err(ERR.na); return A2(all); } const r = rx(p, cs).exec(s); if (!r) throw err(ERR.na); if (m === 2) return r.length > 1 ? A2([r.slice(1).map(x => x ?? '')]) : r[0]; return r[0]; });
  def('REGEXREPLACE', (t, p, rep, occ, cs) => { const s = S(t), o = Math.trunc(N(opt(occ, 0))); const R = S(rep); if (!o) return s.replace(rx(p, cs, true), R); let i = 0; const all = [...s.matchAll(rx(p, cs, true))]; const target = o > 0 ? o - 1 : all.length + o; return s.replace(rx(p, cs, true), (...m) => i++ === target ? m[0].replace(rx(p, cs), R) : m[0]); });
  // date
  const weekendSet = w => { if (w === undefined) return new Set([0, 6]); const v = scalar(w); if (typeof v === 'string' && /^[01]{7}$/.test(v)) return new Set([...v].map((ch, i) => ch === '1' ? (i + 1) % 7 : -1).filter(x => x >= 0)); const k = N(v); const m = {1: [6, 0], 2: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [4, 5], 7: [5, 6], 11: [0], 12: [1], 13: [2], 14: [3], 15: [4], 16: [5], 17: [6]}[k]; if (!m) throw err(ERR.num); return new Set(m); };
  def('NETWORKDAYS.INTL', (s, e, w, hol) => { let a = Math.floor(N(s)), b = Math.floor(N(e)), sg = 1; if (a > b){ [a, b] = [b, a]; sg = -1; } const H = holidays(hol), W = weekendSet(w); let n = 0; for (let d = a; d <= b; d++) if (!W.has(serialToDate(d).getUTCDay()) && !H.has(d)) n++; return n * sg; });
  def('WORKDAY.INTL', (s, k, w, hol) => { let d = Math.floor(N(s)), n = Math.trunc(N(k)); const H = holidays(hol), W = weekendSet(w), st = Math.sign(n); if (W.size >= 7) throw err(ERR.value); while (n){ d += st; if (!W.has(serialToDate(d).getUTCDay()) && !H.has(d)) n -= st; } return d; });
  // information
  def('SHEET', r => { const sheets = CTX.sheets ? CTX.sheets() : [CTX.cur]; const s = r === undefined ? CTX.cur : isRange(r) ? r.sheet : CTX.sheetOf(S(r)); const i = sheets.indexOf(s); if (i < 0) throw err(ERR.na); return i + 1; });
  def('SHEETS', r => r === undefined ? (CTX.sheets ? CTX.sheets().length : 1) : 1);
  def('FORMULATEXT', r => { if (!isRange(r)) throw err(ERR.na); const f = CTX.formulaAt(r.sheet, r.r1, r.c1); if (f == null) throw err(ERR.na); return '=' + f; });
  lazyDef('ERROR.TYPE', (args, evx) => { const v = scalar(evx(args[0])); if (!isErr(v)) return err(ERR.na); return {'#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CALC!': 14}[v.e] || 8; });
  lazyDef('ISREF', (args, evx) => isRange(evx(args[0])));
  def('AREAS', r => isRange(r) ? 1 : (() => { throw err(ERR.value); })());
  def('CELL', (what, r) => { const k = S(what).toLowerCase(); const rg = r === undefined ? new Range(CTX.cur, CTX.cell.r, CTX.cell.c, CTX.cell.r, CTX.cell.c) : r; if (!isRange(rg)) throw err(ERR.value);
    switch (k){ case 'address': return '$' + colName(rg.c1) + '$' + (rg.r1 + 1); case 'row': return rg.r1 + 1; case 'col': return rg.c1 + 1; case 'contents': return CTX.get(rg.sheet, rg.r1, rg.c1) ?? 0; case 'type': { const v = CTX.get(rg.sheet, rg.r1, rg.c1); return v == null ? 'b' : typeof v === 'string' ? 'l' : 'v'; } case 'filename': return rg.sheet.name; default: throw err(ERR.value); } });

  /* ---------------------------------------------------------------- function catalogue (Insert Function) */
  const CATS = {
    'Most used': 'SUM AVERAGE COUNT MAX MIN IF VLOOKUP XLOOKUP COUNTIF SUMIF ROUND TODAY',
    'Maths': 'SUM SUMIF SUMIFS SUMPRODUCT PRODUCT ROUND ROUNDUP ROUNDDOWN MROUND INT TRUNC ABS MOD QUOTIENT SQRT POWER EXP LN LOG LOG10 PI RAND RANDBETWEEN CEILING FLOOR EVEN ODD FACT GCD LCM COMBIN PERMUT SIGN SUBTOTAL SUMSQ DEGREES RADIANS SIN COS TAN SINH COSH TANH COT CSC SEC SQRTPI FACTDOUBLE MULTINOMIAL COMBINA PERCENTOF',
    'Statistics': 'AVERAGE AVERAGEA AVERAGEIF AVERAGEIFS COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS MAX MAXIFS MIN MINIFS MEDIAN MODE STDEV.S STDEV.P VAR.S VAR.P LARGE SMALL RANK.EQ RANK.AVG PERCENTILE QUARTILE CORREL SLOPE INTERCEPT RSQ STEYX FORECAST.LINEAR TREND GROWTH COVARIANCE.S COVARIANCE.P GEOMEAN HARMEAN AVEDEV DEVSQ SKEW KURT STANDARDIZE TRIMMEAN PERCENTRANK.INC PERCENTILE.EXC QUARTILE.EXC MODE.MULT',
    'Logical': 'IF IFS IFERROR IFNA AND OR NOT XOR SWITCH CHOOSE TRUE FALSE',
    'Lookup': 'VLOOKUP HLOOKUP XLOOKUP LOOKUP INDEX MATCH XMATCH OFFSET INDIRECT ROW ROWS COLUMN COLUMNS ADDRESS TRANSPOSE UNIQUE SORT FILTER SEQUENCE HYPERLINK',
    'Text': 'LEN LEFT RIGHT MID UPPER LOWER PROPER TRIM CLEAN CONCAT CONCATENATE TEXTJOIN TEXT VALUE FIND SEARCH SUBSTITUTE REPLACE REPT EXACT CHAR CODE FIXED DOLLAR TEXTBEFORE TEXTAFTER TEXTSPLIT REGEXTEST REGEXEXTRACT REGEXREPLACE ARRAYTOTEXT VALUETOTEXT',
    'Date & time': 'TODAY NOW DATE TIME YEAR MONTH DAY HOUR MINUTE SECOND WEEKDAY WEEKNUM EDATE EOMONTH DAYS DATEDIF NETWORKDAYS WORKDAY DATEVALUE TIMEVALUE YEARFRAC DAYS360 NETWORKDAYS.INTL WORKDAY.INTL',
    'Financial': 'PMT IPMT PPMT FV PV NPER RATE NPV IRR XNPV XIRR MIRR CUMIPMT CUMPRINC EFFECT NOMINAL PDURATION RRI FVSCHEDULE SLN SYD DB DDB',
    'Information': 'ISBLANK ISNUMBER ISTEXT ISLOGICAL ISERROR ISERR ISNA ISEVEN ISODD ISFORMULA NA N T TYPE ISREF ISOMITTED ERROR.TYPE SHEET SHEETS FORMULATEXT CELL',
    'Dynamic arrays': 'FILTER SORT SORTBY UNIQUE SEQUENCE RANDARRAY VSTACK HSTACK TAKE DROP CHOOSECOLS CHOOSEROWS TOCOL TOROW WRAPROWS WRAPCOLS EXPAND TRANSPOSE GROUPBY TRIMRANGE',
    'LAMBDA & LET': 'LET LAMBDA MAP REDUCE SCAN BYROW BYCOL MAKEARRAY ISOMITTED',
    'Statistical tests': 'T.TEST T.DIST T.DIST.2T T.INV T.INV.2T CHISQ.TEST CHISQ.DIST CHISQ.DIST.RT CHISQ.INV.RT F.TEST F.DIST Z.TEST NORM.DIST NORM.S.DIST NORM.INV NORM.S.INV CONFIDENCE.NORM CONFIDENCE.T BINOM.DIST POISSON.DIST EXPON.DIST FISHER',
    'Engineering': 'CONVERT DEC2BIN BIN2DEC DEC2HEX HEX2DEC DEC2OCT OCT2DEC BASE DECIMAL BITAND BITOR BITXOR DELTA GESTEP ROMAN ARABIC',
    'Matrix': 'MMULT MDETERM MINVERSE MUNIT FREQUENCY SUMX2MY2 SUMX2PY2 SUMXMY2',
  };
  const HELP = {SUM: 'number1, [number2], …|Adds numbers', AVERAGE: 'number1, [number2], …|Average of numbers', COUNT: 'value1, …|Counts cells with numbers', COUNTA: 'value1, …|Counts non-empty cells', MAX: 'number1, …|Largest value', MIN: 'number1, …|Smallest value',
    IF: 'logical_test, value_if_true, [value_if_false]|Chooses a value by a condition', IFS: 'test1, value1, [test2, value2], …|First true condition wins', IFERROR: 'value, value_if_error|Replaces an error', VLOOKUP: 'lookup_value, table, col_index, [approximate]|Finds a value in the first column, returns from another column',
    XLOOKUP: 'lookup_value, lookup_array, return_array, [if_not_found]|Finds a value and returns the matching item', HLOOKUP: 'lookup_value, table, row_index, [approximate]|Like VLOOKUP, across rows', INDEX: 'array, row, [column]|Value at a position', MATCH: 'lookup_value, array, [match_type]|Position of a value',
    COUNTIF: 'range, criteria|Counts cells that meet a condition, e.g. ">50"', COUNTIFS: 'range1, criteria1, …|Counts with several conditions', SUMIF: 'range, criteria, [sum_range]|Adds cells that meet a condition', SUMIFS: 'sum_range, range1, criteria1, …|Adds with several conditions',
    AVERAGEIF: 'range, criteria, [average_range]|Average with a condition', ROUND: 'number, digits|Rounds a number', TODAY: '|Today’s date', NOW: '|Date and time now', DATE: 'year, month, day|Makes a date', DATEDIF: 'start, end, unit|Difference in "Y", "M" or "D"', TEXT: 'value, format|Formats a number as text, e.g. "dd/mm/yyyy"',
    CONCAT: 'text1, [text2], …|Joins text', TEXTJOIN: 'delimiter, ignore_empty, text1, …|Joins with a separator', LEFT: 'text, [num_chars]|First characters', RIGHT: 'text, [num_chars]|Last characters', MID: 'text, start, num_chars|Characters from the middle', LEN: 'text|Number of characters', TRIM: 'text|Removes extra spaces',
    PMT: 'rate, nper, pv, [fv], [type]|Loan instalment (EMI)', FV: 'rate, nper, pmt, [pv], [type]|Future value', PV: 'rate, nper, pmt, [fv], [type]|Present value', NPV: 'rate, value1, …|Net present value', IRR: 'values, [guess]|Internal rate of return', SUMPRODUCT: 'array1, [array2], …|Sum of products', RANK: 'number, ref, [order]|Rank in a list',
    MEDIAN: 'number1, …|Middle value', 'STDEV.S': 'number1, …|Standard deviation (sample)', NETWORKDAYS: 'start, end, [holidays]|Working days between dates', EDATE: 'start, months|Date months later', EOMONTH: 'start, months|End of month', WEEKDAY: 'date, [type]|Day of the week number', AND: 'logical1, …|TRUE if all are true', OR: 'logical1, …|TRUE if any is true', "LET": "name1, value1, …, calculation|Names values to reuse inside one formula", "LAMBDA": "param1, …, calculation|Makes your own function (save it in Name Manager)", "MAP": "array, LAMBDA|Applies a LAMBDA to each value", "REDUCE": "initial, array, LAMBDA(acc, value)|Reduces an array to one value", "SCAN": "initial, array, LAMBDA(acc, value)|Running results", "BYROW": "array, LAMBDA(row)|One result per row", "BYCOL": "array, LAMBDA(col)|One result per column", "MAKEARRAY": "rows, cols, LAMBDA(r, c)|Builds an array", "FILTER": "array, include, [if_empty]|Rows that meet a condition (spills)", "SORT": "array, [sort_index], [order], [by_col]|Sorted copy (spills)", "SORTBY": "array, by_array1, [order1], …|Sorts by other columns", "UNIQUE": "array, [by_col], [exactly_once]|Distinct values (spills)", "SEQUENCE": "rows, [cols], [start], [step]|List of numbers", "RANDARRAY": "[rows], [cols], [min], [max], [whole]|Random numbers", "VSTACK": "array1, [array2], …|Stacks arrays vertically", "HSTACK": "array1, [array2], …|Stacks arrays side by side", "TAKE": "array, rows, [cols]|First/last rows or columns", "DROP": "array, rows, [cols]|Removes first/last rows or columns", "CHOOSECOLS": "array, col1, …|Picks columns", "CHOOSEROWS": "array, row1, …|Picks rows", "TOCOL": "array, [ignore], [by_col]|Array into one column", "TOROW": "array, [ignore], [by_col]|Array into one row", "WRAPROWS": "vector, wrap_count, [pad]|Wraps a list into rows", "WRAPCOLS": "vector, wrap_count, [pad]|Wraps a list into columns", "EXPAND": "array, rows, [cols], [pad]|Enlarges an array", "TEXTSPLIT": "text, col_delimiter, [row_delimiter], [ignore_empty]|Splits text into cells", "GROUPBY": "row_fields, values, function, [headers], [total], [sort]|Summary like a pivot table, e.g. GROUPBY(A2:A20,C2:C20,SUM)", "T.TEST": "array1, array2, tails, type|p-value of Student’s t-test (type 1 paired, 2 equal var, 3 unequal)", "CHISQ.TEST": "observed, expected|p-value of chi-square test", "F.TEST": "array1, array2|p-value of F-test", "NORM.DIST": "x, mean, sd, cumulative|Normal distribution", "NORM.INV": "probability, mean, sd|Inverse normal", "T.INV.2T": "probability, df|Two-tailed t critical value", "CONFIDENCE.T": "alpha, sd, n|Confidence interval half-width (t)", "SLOPE": "known_ys, known_xs|Slope of regression line", "INTERCEPT": "known_ys, known_xs|Intercept of regression line", "RSQ": "known_ys, known_xs|R squared", "FORECAST.LINEAR": "x, known_ys, known_xs|Linear prediction", "XIRR": "values, dates, [guess]|IRR for irregular dates", "XNPV": "rate, values, dates|NPV for irregular dates", "REGEXTEST": "text, pattern, [case]|TRUE if text matches a pattern", "REGEXEXTRACT": "text, pattern, [mode], [case]|Text matching a pattern", "REGEXREPLACE": "text, pattern, replacement, [occurrence], [case]|Replaces by pattern", "CONVERT": "number, from_unit, to_unit|Converts units, e.g. \"kg\",\"lbm\"", "NETWORKDAYS.INTL": "start, end, [weekend], [holidays]|Working days with custom weekends", "WORKDAY.INTL": "start, days, [weekend], [holidays]|Working day with custom weekends", "MMULT": "array1, array2|Matrix product", "FREQUENCY": "data, bins|Counts in each bin", "GEOMEAN": "number1, …|Geometric mean", "TRIMRANGE": "range|Range without empty outer rows/columns", "PERCENTOF": "subset, total|Share of the total"};

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
  /* a range or array of criteria spills one answer per criterion, as in Excel 365 */
  for (const [n, ci] of [['COUNTIF', 1], ['SUMIF', 1], ['AVERAGEIF', 1], ['COUNTIFS', 1], ['SUMIFS', 2], ['AVERAGEIFS', 2], ['MAXIFS', 2], ['MINIFS', 2]]){ const f0 = FN[n]; if (!f0 || f0.lazy) continue;
    FN[n] = (...a) => { const c = a[ci]; if ((isRange(c) || isArr(c))){ const g = grid(c); if (g.length * (g[0] || []).length > 1) return new Arr(g.map(row => row.map(v => { const b = a.slice(); b[ci] = v; try { return f0(...b); } catch(e){ return isErr(e) ? e : err(ERR.value); } }))); } return f0(...a); }; }
  return {tokenize, parse, compile, evaluate, evaluateRaw, evaluateNamed, Lambda, invoke, shift, adjust, renameSheet, refsIn, FN, CATS, HELP, Range, Arr, isRange, isArr, criterion, cmp};
})();
