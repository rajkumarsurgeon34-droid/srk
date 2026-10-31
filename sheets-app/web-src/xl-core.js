/* SRK Sheets — core: cell addresses, dates, input parsing, Excel number formats */
'use strict';
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const MAXR = 1048576, MAXC = 16384;
const key = (r, c) => r + ',' + c;
const unkey = k => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; };
function colName(c){ let s = ''; c++; while (c > 0){ const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
function colIndex(s){ let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
const addr = (r, c) => colName(c) + (r + 1);
function rangeAddr(g){ return g.r1 === g.r2 && g.c1 === g.c2 ? addr(g.r1, g.c1) : addr(g.r1, g.c1) + ':' + addr(g.r2, g.c2); }
function parseAddr(s){ const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s.trim()); if (!m) return null; return {r: +m[2] - 1, c: colIndex(m[1])}; }
function parseRange(s){ s = s.trim().replace(/^.*!/, ''); const [a, b] = s.split(':'); const p = parseAddr(a), q = b ? parseAddr(b) : p; if (!p || !q) return null; return norm({r1: p.r, c1: p.c, r2: q.r, c2: q.c}); }
const norm = g => ({r1: Math.min(g.r1, g.r2), c1: Math.min(g.c1, g.c2), r2: Math.max(g.r1, g.r2), c2: Math.max(g.c1, g.c2)});
const inRange = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
const quoteSheet = n => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;

/* ---------------------------------------------------------------- errors & values */
const ERR = {div0: '#DIV/0!', na: '#N/A', name: '#NAME?', nul: '#NULL!', num: '#NUM!', ref: '#REF!', value: '#VALUE!', circ: '#CIRC!', spill: '#SPILL!', calc: '#CALC!'};
class XErr { constructor(e){ this.e = e; } toString(){ return this.e; } }
const err = e => new XErr(e); const isErr = v => v instanceof XErr;
const ERR_NAMES = new Set(Object.values(ERR).concat(['#GETTING_DATA']));

/* ---------------------------------------------------------------- dates (1900 system) */
const EPOCH = Date.UTC(1899, 11, 30);
const dateToSerial = (y, m, d) => (Date.UTC(y, m, d) - EPOCH) / 86400000;
function serialToDate(s){ const ms = Math.round((s) * 86400000) + EPOCH; return new Date(ms); }
const todaySerial = () => { const d = new Date(); return dateToSerial(d.getFullYear(), d.getMonth(), d.getDate()); };
const nowSerial = () => { const d = new Date(); return dateToSerial(d.getFullYear(), d.getMonth(), d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IN_TZ = (() => { try { return /Kolkata|Calcutta/.test(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch(e){ return false; } })();
const DMY = (() => { try { const l = (navigator.language || 'en-IN').toLowerCase(); return IN_TZ || !/^en-us|^en-ph/.test(l); } catch(e){ return true; } })();
const CURRENCY = (() => { try { const l = (navigator.language || 'en-IN'); return IN_TZ || /-IN$/i.test(l) || /^(hi|ta|te|ml|kn|mr|bn|gu|pa)/.test(l) ? '₹' : /-US$/i.test(l) ? '$' : /-GB$/i.test(l) ? '£' : '₹'; } catch(e){ return '₹'; } })();

/* text typed into a cell → value (+ a number format when Excel would pick one) */
function parseInput(t){
  if (t == null) return {v: null}; const s = String(t); const x = s.trim();
  if (x === '') return {v: null};
  if (s.startsWith("'")) return {v: s.slice(1), text: true};
  if (/^=/.test(x) && x.length > 1) return {f: x.slice(1)};
  if (/^(true|false)$/i.test(x)) return {v: /^true$/i.test(x)};
  if (ERR_NAMES.has(x.toUpperCase())) return {v: err(x.toUpperCase())};
  let m;
  if ((m = /^([-+]?)([₹$£€]?)\s*([\d,]*\.?\d+(?:[eE][-+]?\d+)?)\s*(%?)$/.exec(x)) && !/,,/.test(m[3]) && (/^\d{1,3}(,\d{2,3})*(\.\d+)?$/.test(m[3]) || !m[3].includes(','))){
    let n = parseFloat(m[3].replace(/,/g, '')); if (m[1] === '-') n = -n; if (m[4]) return {v: n / 100, nf: (m[3].includes('.') ? '0.00%' : '0%')};
    if (m[2]) return {v: n, nf: currencyFmt(m[2])}; if (m[3].includes(',')) return {v: n, nf: m[2] === '₹' || /\d,\d\d,/.test(m[3]) ? '#,##,##0' + (m[3].includes('.') ? '.00' : '') : '#,##0' + (m[3].includes('.') ? '.00' : '')}; return {v: n};
  }
  if ((m = /^\((\d[\d,]*\.?\d*)\)$/.exec(x))) return {v: -parseFloat(m[1].replace(/,/g, ''))};
  // dates: d/m/y or m/d/y, d-mmm-y, y-m-d
  if ((m = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/.exec(x))){
    let a = +m[1], b = +m[2], c = +m[3], y, mo, d;
    if (m[1].length === 4){ y = a; mo = b; d = c; } else { y = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c; if (DMY){ d = a; mo = b; } else { mo = a; d = b; } }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return {v: dateToSerial(y, mo - 1, d), nf: DMY ? 'dd/mm/yyyy' : 'm/d/yyyy'};
  }
  if ((m = /^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]*(\d{2,4})?$/.exec(x))){ const mi = MONTHS.findIndex(n => n.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3))); if (mi >= 0){ let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000; return {v: dateToSerial(y, mi, +m[1]), nf: m[3] ? 'd-mmm-yy' : 'd-mmm'}; } }
  if ((m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(x))){ const mi = MONTHS.findIndex(n => n.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3))); if (mi >= 0) return {v: dateToSerial(+m[3], mi, +m[2]), nf: 'd-mmm-yy'}; }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(x))){ let hh = +m[1]; const ap = m[4] && m[4].toLowerCase(); if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0; if (hh < 24 && +m[2] < 60) return {v: (hh * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400, nf: ap ? 'h:mm AM/PM' : m[3] ? 'h:mm:ss' : 'h:mm'}; }
  return {v: s};
}
const currencyFmt = sym => `"${sym}"#,##0.00`;

/* ---------------------------------------------------------------- number formats */
const FMT_PRESETS = [
  ['General', 'General'], ['Number', '0.00'], ['Currency', `"${CURRENCY}"#,##0.00`], ['Accounting', `_("${CURRENCY}"* #,##0.00_);_("${CURRENCY}"* (#,##0.00);_("${CURRENCY}"* "-"??_);_(@_)`],
  ['Short date', DMY ? 'dd/mm/yyyy' : 'm/d/yyyy'], ['Long date', 'dddd, d mmmm yyyy'], ['Time', 'h:mm:ss AM/PM'], ['Percentage', '0.00%'], ['Fraction', '# ?/?'], ['Scientific', '0.00E+00'], ['Text', '@'],
  ['Indian number (lakh)', '#,##,##0.00'], ['Thousands', '#,##0'], ['Date (d-mmm-yy)', 'd-mmm-yy'], ['Month-year', 'mmm-yy'], ['ISO date', 'yyyy-mm-dd'], ['24-hour time', 'hh:mm'], ['Duration [h]:mm', '[h]:mm'],
];
const BUILTIN_FMT = {0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@'};
const FMT_COLORS = {red: '#E00000', blue: '#0000FF', green: '#008000', black: '#000000', white: '#FFFFFF', yellow: '#C0A000', magenta: '#C000C0', cyan: '#00A0A0'};
const fmtCache = new Map();
function splitSections(f){ const out = []; let cur = '', q = false; for (let i = 0; i < f.length; i++){ const ch = f[i]; if (ch === '"') q = !q; if (ch === '\\' && !q){ cur += ch + (f[i + 1] || ''); i++; continue; } if (ch === ';' && !q){ out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; }
function compileSection(sec){
  let color = null, cond = null; sec = sec.replace(/\[(Red|Blue|Green|Black|White|Yellow|Magenta|Cyan|Color\d+)\]/gi, (m, c) => { color = FMT_COLORS[c.toLowerCase()] || null; return ''; });
  sec = sec.replace(/\[([<>=]+)(-?[\d.]+)\]/, (m, op, n) => { cond = {op, n: +n}; return ''; }).replace(/\[\$([^\]-]*)(-[^\]]*)?\]/g, (m, s) => s ? `"${s}"` : '');
  const plain = sec.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/_./g, '').replace(/\*./g, '');
  const isDate = /[yYdD]|(^|[^0#?.])[mM]|[hH]|[sS]|AM\/PM|A\/P/i.test(plain.replace(/\[[hms]+\]/gi, 'h')) && !/[0#?]/.test(plain.replace(/\[[hms]+\]/gi, '').replace(/s+\.0+/i, '')) || /\[[hms]+\]/i.test(plain);
  const isText = plain.includes('@');
  const pct = (plain.match(/%/g) || []).length;
  return {raw: sec, color, cond, isDate, isText, pct, plain};
}
function getFmt(nf){ if (fmtCache.has(nf)) return fmtCache.get(nf); const secs = splitSections(nf || 'General').map(compileSection); fmtCache.set(nf, secs); return secs; }
const isDateFmt = nf => { if (!nf || nf === 'General') return false; const s = getFmt(nf)[0]; return s.isDate; };
function fmtLiteral(tok){ return tok.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_./g, ' ').replace(/\*./g, ''); }
function groupDigits(int, indian){ if (indian){ const last3 = int.slice(-3), rest = int.slice(0, -3); return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3; } return int.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtNumberSection(n, sec){
  let s = sec.raw; const neg = n < 0; n = Math.abs(n) * Math.pow(100, sec.pct);
  if (/E[+-]/i.test(sec.plain)){ const m = /(0[0#.,]*)E([+-])(0+)/i.exec(fmtLiteral(s)); const dec = m && m[1].includes('.') ? m[1].split('.')[1].length : 0; let [mant, ex] = n.toExponential(dec).split('e'); ex = +ex; const es = (ex < 0 ? '-' : (m && m[2] === '+' ? '+' : '')) + String(Math.abs(ex)).padStart(m ? m[3].length : 2, '0'); return {neg, text: fmtLiteral(s).replace(/[0#.,]+E[+-]0+/i, mant + 'E' + es)}; }
  if (/\?\/\?|#\s*\?+\/\?+|\d\/\d/.test(sec.plain) && /\//.test(sec.plain)){ const den = (sec.plain.match(/\/(\?+|\d+)/) || [0, '?'])[1]; const maxD = /^\d+$/.test(den) ? +den : Math.pow(10, den.length) - 1; const whole = Math.floor(n); let f = n - whole, bestN = 0, bestD = 1, bestE = f;
    if (/^\d+$/.test(den)){ bestD = maxD; bestN = Math.round(f * maxD); } else for (let d = 1; d <= maxD; d++){ const nn = Math.round(f * d); const e = Math.abs(f - nn / d); if (e < bestE - 1e-12){ bestE = e; bestN = nn; bestD = d; } }
    const hasWhole = /#|0/.test(sec.plain.split('/')[0].replace(/\?+\s*$/, '').replace(/\?+$/, '')) && /\s/.test(sec.plain);
    const text = bestN === 0 ? String(whole) : hasWhole ? (whole ? whole + ' ' : '') + bestN + '/' + bestD : (whole * bestD + bestN) + '/' + bestD; return {neg, text}; }
  // locate the numeric pattern
  const lit = []; let pat = ''; let i = 0, q = false, buf = '', before = '', after = '', seen = false;
  const tokens = []; while (i < s.length){ const ch = s[i]; if (ch === '"'){ const j = s.indexOf('"', i + 1); tokens.push({lit: s.slice(i + 1, j < 0 ? s.length : j)}); i = j < 0 ? s.length : j + 1; continue; } if (ch === '\\'){ tokens.push({lit: s[i + 1] || ''}); i += 2; continue; } if (ch === '_'){ tokens.push({lit: ' '}); i += 2; continue; } if (ch === '*'){ i += 2; continue; }
    if (/[0#?,.]/.test(ch)){ let j = i; while (j < s.length && /[0#?,.]/.test(s[j])) j++; tokens.push({num: s.slice(i, j)}); i = j; continue; } tokens.push({lit: ch === '%' ? '%' : ch}); i++; }
  const numTok = tokens.find(t => t.num); if (!numTok) return {neg, text: tokens.map(t => t.lit || '').join('')};
  let p = numTok.num; let scale = 0; while (p.endsWith(',')){ scale++; p = p.slice(0, -1); } n = n / Math.pow(1000, scale);
  const [ip, dp = ''] = p.split('.'); const decs = dp.replace(/[^0#?]/g, ''), minDec = (decs.match(/0/g) || []).length, maxDec = decs.length;
  let str = n.toFixed(maxDec); if (maxDec > minDec){ str = str.replace(/0+$/, m => m.slice(0, Math.max(0, m.length - (maxDec - minDec)))).replace(/\.$/, maxDec > 0 && minDec === 0 && p.includes('.') ? '.' : ''); }
  let [ii, dd] = str.split('.'); const minInt = (ip.replace(/,/g, '').match(/0/g) || []).length; if (ii === '0' && minInt === 0) ii = ''; ii = ii.padStart(minInt, '0');
  if (ip.includes(',')) ii = groupDigits(ii, /#,##,##0/.test(ip));
  const numText = ii + (dd !== undefined ? '.' + dd : (p.includes('.') && maxDec === 0 ? '' : ''));
  return {neg, text: tokens.map(t => t.num ? (t === numTok ? numText : '') : t.lit).join('')};
}
function fmtDateSection(v, sec){
  const s = sec.raw; const d = serialToDate(Math.floor(v + 1e-9)); const frac = v - Math.floor(v); let secs = Math.round(frac * 86400); if (secs >= 86400) secs = 0;
  const H = Math.floor(secs / 3600), Mi = Math.floor(secs % 3600 / 60), Se = secs % 60; const ampm = /AM\/PM|A\/P/i.test(s);
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), D = d.getUTCDate(), W = d.getUTCDay();
  const toks = s.match(/"[^"]*"|\\.|\[h+\]|\[m+\]|\[s+\]|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|am\/pm|A\/P|\.0+|_.|\*.|./gi) || [];
  let out = '', lastH = false;
  toks.forEach((t, i) => { const L = t.toLowerCase();
    if (t[0] === '"') out += t.slice(1, -1); else if (t[0] === '\\') out += t[1]; else if (t[0] === '_') out += ' '; else if (t[0] === '*') {}
    else if (/^\[h+\]$/.test(L)) { out += Math.floor(v * 24); lastH = true; } else if (/^\[m+\]$/.test(L)) out += Math.floor(v * 1440); else if (/^\[s+\]$/.test(L)) out += Math.round(v * 86400);
    else if (L === 'yyyy') out += Y; else if (L === 'yy') out += String(Y).slice(-2);
    else if (/^m+$/.test(L)){ const minute = lastH || /^:?s/i.test((toks[i + 1] || '') + (toks[i + 2] || '')) && toks[i + 1] === ':'; if (minute && L.length <= 2) out += L === 'mm' ? String(Mi).padStart(2, '0') : Mi; else out += L === 'mmmmm' ? MONTHS[Mo][0] : L === 'mmmm' ? MONTHS[Mo] : L === 'mmm' ? MONTHS[Mo].slice(0, 3) : L === 'mm' ? String(Mo + 1).padStart(2, '0') : Mo + 1; }
    else if (L === 'dddd') out += DAYS[W]; else if (L === 'ddd') out += DAYS[W].slice(0, 3); else if (L === 'dd') out += String(D).padStart(2, '0'); else if (L === 'd') out += D;
    else if (L === 'hh' || L === 'h'){ let hh = ampm ? (H % 12 || 12) : H; out += L === 'hh' ? String(hh).padStart(2, '0') : hh; lastH = true; return; }
    else if (L === 'ss' || L === 's') out += L === 'ss' ? String(Se).padStart(2, '0') : Se; else if (/^\.0+$/.test(L)) out += (frac * 86400 % 1).toFixed(L.length - 1).slice(1);
    else if (L === 'am/pm') out += H < 12 ? (t === 'am/pm' ? 'am' : 'AM') : (t === 'am/pm' ? 'pm' : 'PM'); else if (L === 'a/p') out += H < 12 ? 'A' : 'P';
    else out += t;
    if (!/^(:|\s)$/.test(t)) lastH = false; });
  return out;
}
function generalNum(n){
  if (!isFinite(n)) return '#NUM!'; if (n === 0) return '0'; const a = Math.abs(n);
  if (a >= 1e11 || a < 1e-9){ let s = n.toExponential(5).replace(/\.?0+e/, 'e'); return s.replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2'); }
  let s = String(+n.toPrecision(11)); if (s.includes('e')) s = n.toFixed(10).replace(/\.?0+$/, '');
  if (s.replace(/[-.]/g, '').length > 11){ const intLen = String(Math.floor(a)).length; s = n.toFixed(Math.max(0, 10 - intLen)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
  return s;
}
/* value + number format → {text, color, align} */
function formatValue(v, nf){
  if (v == null || v === '') return {text: ''};
  if (isErr(v)) return {text: v.e, align: 'center'};
  if (typeof v === 'boolean') return {text: v ? 'TRUE' : 'FALSE', align: 'center'};
  const secs = getFmt(nf || 'General');
  if (typeof v === 'string'){ const ts = secs.find(s => s.isText) || (secs.length === 4 ? secs[3] : null); if (ts) return {text: fmtLiteral(ts.raw.replace(/@/g, '\u0001')).replace('\u0001', v), color: ts.color}; return {text: v}; }
  if (typeof v !== 'number') return {text: String(v)};
  if (!nf || nf === 'General') return {text: generalNum(v), align: 'right'};
  let sec = secs[0], n = v;
  if (secs.some(s => s.cond)){ const pick = secs.find(s => s.cond && ({'<': n < s.cond.n, '>': n > s.cond.n, '=': n === s.cond.n, '<=': n <= s.cond.n, '>=': n >= s.cond.n, '<>': n !== s.cond.n})[s.cond.op]); sec = pick || secs.find(s => !s.cond && !s.isText) || secs[0]; }
  else if (v < 0 && secs.length >= 2 && !secs[1].isText){ sec = secs[1]; n = -v; } else if (v === 0 && secs.length >= 3 && !secs[2].isText) sec = secs[2];
  if (sec.isText && !sec.plain.replace('@', '').trim() && secs.length === 1) return {text: generalNum(v), align: 'left'};
  if (sec.isDate){ if (v < 0) return {text: '#'.repeat(8), align: 'right'}; return {text: fmtDateSection(n, sec), color: sec.color, align: 'right'}; }
  const r = fmtNumberSection(n, sec); let text = r.text; if (r.neg && sec === secs[0]) text = '-' + text;
  if (/General/i.test(sec.raw)) text = fmtLiteral(sec.raw).replace(/General/i, generalNum(Math.abs(n)));
  return {text, color: sec.color, align: 'right'};
}
/* change the decimals of a number format (Increase / Decrease Decimal) */
function bumpDecimals(nf, d, sample){
  if (!nf || nf === 'General'){ const s = generalNum(typeof sample === 'number' ? sample : 0); const cur = s.includes('.') ? s.split('.')[1].length : 0; const n = Math.max(0, cur + d); return n ? '0.' + '0'.repeat(n) : '0'; }
  return splitSections(nf).map(sec => sec.replace(/(\d|#)(\.0+)?(?=[^0-9]|$)/, (m, a, dec) => { const n = Math.max(0, (dec ? dec.length - 1 : 0) + d); return a + (n ? '.' + '0'.repeat(n) : ''); })).join(';');
}
