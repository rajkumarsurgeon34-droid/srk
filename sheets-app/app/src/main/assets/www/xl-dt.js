/* SRK Sheets — data types (Geography, Stocks) with cards and FIELDVALUE / STOCKHISTORY, and the spelling checker */
'use strict';
const DT = (() => {
  const $ = (s, r = document) => r.querySelector(s); const G = Grid.G;
  const h = UI.h, toast = (...a) => UI.toast(...a), dialog = (...a) => UI.dialog(...a), pop = (...a) => UI.pop(...a), mi = (...a) => UI.mi(...a), field = (...a) => UI.field(...a);
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {geo: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'), stock: S('<path d="M4 4v16h16"/><path d="M7 15l4-4 3 3 5-6"/>'), card: S('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h6M7 14h10"/>'), spell: S('<path d="M4 15l3-9 3 9M5 12h4M13 10h3a2 2 0 0 1 0 4h-3V7h2.5a1.5 1.5 0 0 1 0 3"/><path d="M14 19l2 2 4-4"/>')};
  const lc = s => String(s).toLowerCase(); const plain = s => lc(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ICON = {geo: '🌐', stock: '📈'};

  /* ================================================================ Geography (bundled data) */
  let GEO = null, geoP = null;
  function geo(){ return geoP || (geoP = fetch('geo.json').then(r => { if (!r.ok) throw new Error('missing'); return r.json(); }).then(d => { GEO = d; const idx = new Map(); for (const c of d){ for (const n of [c.Name, c['Official name'], ...(c['Alt names'] || [])]) if (n && !idx.has(plain(n))) idx.set(plain(n), c); } GEO.idx = idx; return GEO; }).catch(e => { geoP = null; throw new Error('Country data couldn’t be loaded.'); })); }
  const GEO_SKIP = new Set(['Alt names', 'Population year', 'GDP (USD) year', 'Life expectancy year', 'GDP per capita (USD) year']);
  const geoFields = c => Object.keys(c).filter(k => !GEO_SKIP.has(k) && c[k] != null && c[k] !== '');
  const findGeo = t => { if (!GEO) return null; const k = plain(String(t).trim()); return GEO.idx.get(k) || GEO.find(c => plain(c.Name).startsWith(k) && k.length > 3) || null; };

  /* ================================================================ Stocks (live, through the app) */
  async function getJSON(url){ if (window.srkFetch){ const r = await window.srkFetch(url); if (r.status !== 200) throw new Error('The stock service answered ' + (r.status || 'nothing')); return JSON.parse(r.text); }
    let res; try { res = await fetch(url); } catch(e){ throw new Error('Live stock prices need the SRK Sheets app (the web version can’t reach the stock service).'); } if (!res.ok) throw new Error('The stock service answered ' + res.status); return res.json(); }
  async function findStock(q){ q = String(q).trim(); const d = await getJSON(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`); const qs = (d.quotes || []).filter(x => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CURRENCY', 'CRYPTOCURRENCY'].includes(x.quoteType));
    if (!qs.length) return null; const up = q.toUpperCase(); return qs.find(x => x.symbol === up) || qs.find(x => x.symbol === up + '.NS') || qs.find(x => /\.NS$/.test(x.symbol)) || qs.find(x => /\.BO$/.test(x.symbol)) || qs[0]; }
  async function quote(sym){ const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`); const m = d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta; if (!m) throw new Error('No price for ' + sym); const prev = m.chartPreviousClose ?? m.previousClose; const p = m.regularMarketPrice;
    return {'Name': m.longName || m.shortName || sym, 'Ticker symbol': sym, 'Price': p, 'Change': p != null && prev != null ? Math.round((p - prev) * 100) / 100 : null, 'Change (%)': p != null && prev ? (p - prev) / prev : null, 'Previous close': prev, 'High': m.regularMarketDayHigh, 'Low': m.regularMarketDayLow, 'Volume': m.regularMarketVolume, '52 week high': m.fiftyTwoWeekHigh, '52 week low': m.fiftyTwoWeekLow, 'Currency': m.currency, 'Exchange': m.fullExchangeName || m.exchangeName, 'Instrument type': m.instrumentType, 'Last trade time': m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toLocaleString() : null}; }
  const STOCK_NF = {'Price': '#,##0.00', 'Change': '#,##0.00', 'Change (%)': '0.00%', 'Previous close': '#,##0.00', 'High': '#,##0.00', 'Low': '#,##0.00', '52 week high': '#,##0.00', '52 week low': '#,##0.00', 'Volume': '#,##0'};
  const GEO_NF = {'Population': '#,##0', 'Area (km²)': '#,##0', 'GDP (USD)': '$#,##0', 'GDP per capita (USD)': '$#,##0', 'Life expectancy': '0.0', 'Population density (per km²)': '#,##0.0'};

  /* ================================================================ cells */
  const dtOf = (s, r, c) => { const x = cellAt(s, r, c); return x && x.dt || null; };
  function fieldsOf(dt){ if (dt.k === 'geo'){ const c = GEO && GEO.find(x => x['ISO 3'] === dt.id); return c ? Object.fromEntries(geoFields(c).map(k => [k, c[k]])) : dt.f || {}; } return dt.f || {}; }
  // the cell shows an icon before the name
  const _display = displayAt;
  let noIcon = false; const _csv = XIO.writeCSV; XIO.writeCSV = sh => { noIcon = true; try { return _csv(sh); } finally { noIcon = false; } };
  displayAt = function(s, r, c, showF){ const d = _display(s, r, c, showF); if (!showF && !noIcon){ const x = cellAt(s, r, c); if (x && x.dt && d.text) return {...d, text: ICON[x.dt.k] + ' ' + d.text, align: 'left'}; } return d; };
  async function convert(kind){ const s = G.sh; const g = UI.clampSel(); const cells = []; forRange(g, (r, c) => { const v = Calc.get(s, r, c); const x = cellAt(s, r, c); if (typeof v === 'string' && v.trim() && x && x.f == null) cells.push([r, c, v]); });
    if (!cells.length) return toast('Select cells with names of countries or companies first');
    if (kind === 'geo'){ try { await geo(); } catch(e){ return toast(e.message); } let ok = 0; const miss = []; tx(s, 'Geography', () => { for (const [r, c, v] of cells){ const m = findGeo(v); if (!m){ miss.push(v); continue; } patchCell(s, r, c, x => { x.v = m.Name; x.dt = {k: 'geo', id: m['ISO 3']}; }); ok++; } }); done(); toast(ok ? `${ok} cell${ok === 1 ? '' : 's'} linked to country data${miss.length ? `; not found: ${miss.slice(0, 3).join(', ')}` : ''}. Tap a cell, then Data › Card to add fields.` : 'No countries recognised'); return; }
    toast('Looking up stocks…', 20000); let ok = 0; const miss = []; const found = [];
    for (const [r, c, v] of cells){ try { const q = await findStock(v); if (!q){ miss.push(v); continue; } const f = await quote(q.symbol); found.push([r, c, {k: 'stock', id: q.symbol, f, t: Date.now()}]); ok++; } catch(e){ toast(e.message, 6000); return; } }
    tx(s, 'Stocks', () => { for (const [r, c, dt] of found) patchCell(s, r, c, x => { x.v = dt.f.Name; x.dt = dt; }); }); done(); toast(ok ? `${ok} stock${ok === 1 ? '' : 's'} linked${miss.length ? `; not found: ${miss.slice(0, 3).join(', ')}` : ''}. Use Data › Card to add Price and more.` : 'No stocks recognised', 5000); }
  async function refreshStocks(quiet){ let n = 0; for (const s of G.wb.sheets) for (const k in s.cells){ const x = s.cells[k]; if (!x.dt || x.dt.k !== 'stock') continue; try { x.dt.f = await quote(x.dt.id); x.dt.t = Date.now(); n++; } catch(e){ if (!quiet) toast(e.message, 5000); return n; } }
    if (n){ Calc.invalidate(); Grid.refresh(); App.dirty(); } if (!quiet) toast(n ? `Updated ${n} stock${n === 1 ? '' : 's'}` : 'No stocks in this workbook'); return n; }
  const done = () => { Calc.invalidate(); Grid.refresh(); UI.onSel(); App.dirty(); };
  async function card(){ const s = G.sh; const r = G.sel.r, c = G.sel.c; const dt = dtOf(s, r, c); if (!dt) return toast('Select a cell linked to Stocks or Geography first'); if (dt.k === 'geo'){ try { await geo(); } catch(e){} }
    const f = fieldsOf(dt); const body = h('div', {class: 'dtcard'}); const title = (dt.k === 'geo' ? (f.Flag || '') + ' ' : '📈 ') + (f.Name || Calc.get(s, r, c));
    for (const [k, v] of Object.entries(f)){ if (k === 'Name' || k === 'Flag') continue; const shown = typeof v === 'number' ? formatValue(v, (dt.k === 'geo' ? GEO_NF : STOCK_NF)[k] || 'General').text : String(v); const add = h('button', {class: 'btn sm', type: 'button', title: 'Add this field as a column'}, '+'); add.addEventListener('click', () => { document.querySelectorAll('.dlg-back').forEach(d => d.remove()); insertField(k); });
      body.append(h('div', {class: 'dtrow'}, h('span', {}, k), h('b', {}, shown), add)); }
    if (dt.k === 'stock') body.append(h('p', {class: 'hint'}, `Prices from Yahoo Finance, may be delayed. Updated ${new Date(dt.t).toLocaleString()}.`)); if (dt.k === 'geo') body.append(h('p', {class: 'hint'}, 'Country facts and World Bank figures (latest year available).'));
    dialog(title, body, [['Close', 'primary']]); }
  function insertField(name){ const s = G.sh; const c0 = G.sel.c; const has = r => { const x = cellAt(s, r, c0); return !!x && (x.v != null || x.f != null); }; let r1 = G.sel.r, r2 = G.sel.r; while (r1 > 0 && has(r1 - 1) && (dtOf(s, r1 - 1, c0) || has(r1 - 2))) r1--; while (has(r2 + 1)) r2++; while (r1 < r2 && !dtOf(s, r1, c0)) r1++; let tc = c0 + 1; for (;;){ let free = true; for (let r = r1; r <= r2; r++) if (cellAt(s, r, tc) && (cellAt(s, r, tc).v != null || cellAt(s, r, tc).f != null)) free = false; if (free) break; tc++; }
    const dt = dtOf(s, G.sel.r, c0); const nf = (dt.k === 'geo' ? GEO_NF : STOCK_NF)[name];
    tx(s, 'Insert data', () => { if (r1 > 0 && cellAt(s, r1 - 1, c0) && typeof Calc.get(s, r1 - 1, c0) === 'string' && !dtOf(s, r1 - 1, c0) && !cellAt(s, r1 - 1, tc)) inputCell(s, r1 - 1, tc, name); for (let r = r1; r <= r2; r++){ if (!dtOf(s, r, c0)) continue; inputCell(s, r, tc, `=FIELDVALUE(${addr(r, c0)},"${name}")`); if (nf) patchCell(s, r, tc, x => { x.s = {...(x.s || {}), nf}; }); } }); done(); }

  /* ================================================================ formulas: FIELDVALUE, A2.Field, STOCKHISTORY */
  const FN = Formula.FN, Arr = Formula.Arr;
  const fv = (sheet, r, c, name) => { const x = cellAt(sheet, r, c); if (!x || !x.dt) return err(ERR.value); const f = fieldsOf(x.dt); const k = Object.keys(f).find(k => lc(k) === lc(name)); if (!k) return x.dt.k === 'geo' && !GEO ? (geo().then(() => { Calc.invalidate(); Grid.refresh(); }).catch(() => {}), new XErr('#BUSY!')) : new XErr('#FIELD!'); const v = f[k]; return v == null ? err(ERR.na) : v; };
  FN.FIELDVALUE = (ref, name) => { if (!ref || !ref.sheet) return err(ERR.value); const nm = String(name); if (ref.r1 === ref.r2 && ref.c1 === ref.c2) return fv(ref.sheet, ref.r1, ref.c1, nm); const out = []; for (let r = ref.r1; r <= ref.r2; r++){ const row = []; for (let c = ref.c1; c <= ref.c2; c++) row.push(fv(ref.sheet, r, c, nm)); out.push(row); } return new Arr(out); };
  if (Formula.HELP) Formula.HELP.FIELDVALUE = 'value, field_name|A field from a Stocks or Geography cell, e.g. "Population"'; if (Formula.CATS && Formula.CATS.Lookup && !Formula.CATS.Lookup.includes('FIELDVALUE')) Formula.CATS.Lookup += ' FIELDVALUE STOCKHISTORY';
  // A2.Population  →  FIELDVALUE(A2,"Population")
  const _norm = normalizeFormula; normalizeFormula = function(f){ let out = String(f).replace(/(^|[^\w.$!:'"])(\$?[A-Za-z]{1,3}\$?\d+)\.(\[[^\]]+\]|[A-Za-z_][\w]*)/g, (m, pre, ref, fld) => `${pre}FIELDVALUE(${ref},"${fld.replace(/^\[|\]$/g, '')}")`); return _norm(out); };
  const histCache = new Map();
  FN.STOCKHISTORY = (stock, start, end, interval, headers, ...props) => { let sym = stock; if (stock && stock.sheet){ const x = cellAt(stock.sheet, stock.r1, stock.c1); sym = x && x.dt && x.dt.k === 'stock' ? x.dt.id : Calc.get(stock.sheet, stock.r1, stock.c1); } sym = String(sym || '').trim(); if (!sym) return err(ERR.value);
    const sd = typeof start === 'number' ? start : start && start.sheet ? Calc.get(start.sheet, start.r1, start.c1) : null; if (typeof sd !== 'number') return err(ERR.value); const ed = end == null ? sd : end && end.sheet ? Calc.get(end.sheet, end.r1, end.c1) : end; const iv = ['1d', '1wk', '1mo'][+(interval || 0)] || '1d'; const hd = headers == null ? 1 : +headers; const P = props.length ? props.map(Number) : [0, 1];
    const key = [sym, sd, ed, iv].join('|'); const got = histCache.get(key); if (!got){ histCache.set(key, 'busy'); const toTs = s => Math.round((s - 25569) * 86400);
      getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${toTs(sd)}&period2=${toTs(ed + 1)}&interval=${iv}`).then(d => { const res = d.chart.result[0]; const q = res.indicators.quote[0]; const rows = (res.timestamp || []).map((t, i) => [Math.floor(t / 86400 + 25569), q.close[i], q.open[i], q.high[i], q.low[i], q.volume[i]]).filter(r => r[1] != null); histCache.set(key, rows); Calc.invalidate(); Grid.refresh(); }).catch(e => { histCache.set(key, {err: e.message}); Calc.invalidate(); Grid.refresh(); }); return new XErr('#BUSY!'); }
    if (got === 'busy') return new XErr('#BUSY!'); if (got.err) return new XErr('#CONNECT!');
    const names = ['Date', 'Close', 'Open', 'High', 'Low', 'Volume']; const out = []; if (hd) out.push(P.map(p => names[p])); for (const r of got) out.push(P.map(p => r[p])); if (!out.length) return err(ERR.na); return new Arr(out); };
  if (Formula.HELP) Formula.HELP.STOCKHISTORY = 'stock, start_date, [end_date], [interval], [headers], [property0]…|Price history (needs the app for live data)';

  /* ================================================================ spelling */
  let WORDS = null, wordsP = null; const userDict = () => { try { return new Set(JSON.parse(localStorage.getItem('srk-dict') || '[]')); } catch(e){ return new Set(); } };
  const saveUser = set => { try { localStorage.setItem('srk-dict', JSON.stringify([...set])); } catch(e){} };
  function words(){ return wordsP || (wordsP = fetch('words.txt').then(r => { if (!r.ok) throw 0; return r.text(); }).then(t => { WORDS = new Set(t.split('\n')); return WORDS; }).catch(() => { wordsP = null; throw new Error('The dictionary couldn’t be loaded.'); })); }
  const known = (w, user) => { const l = lc(w); if (WORDS.has(l) || user.has(l)) return true; if (/^[A-Z0-9]{2,}$/.test(w)) return true; if (/\d/.test(w)) return true; const base = l.replace(/'s$/, '').replace(/(ies)$/, 'y'); if (WORDS.has(base)) return true; if (/s$/.test(l) && WORDS.has(l.slice(0, -1))) return true; if (/(ed|ing|ly|es)$/.test(l) && (WORDS.has(l.replace(/(ed|ing|ly|es)$/, '')) || WORDS.has(l.replace(/(ed|ing)$/, 'e')))) return true; return false; };
  function suggest(w){ const l = lc(w); const AB = 'abcdefghijklmnopqrstuvwxyz'; const e1 = new Set(); for (let i = 0; i <= l.length; i++){ if (i < l.length) e1.add(l.slice(0, i) + l.slice(i + 1)); if (i < l.length - 1) e1.add(l.slice(0, i) + l[i + 1] + l[i] + l.slice(i + 2)); for (const ch of AB){ if (i < l.length) e1.add(l.slice(0, i) + ch + l.slice(i + 1)); e1.add(l.slice(0, i) + ch + l.slice(i)); } }
    let out = [...e1].filter(x => WORDS.has(x)); if (out.length < 3 && l.length > 4){ const e2 = new Set(); for (const x of e1){ if (e2.size > 60000) break; for (let i = 0; i < x.length; i++){ const a = x.slice(0, i) + x.slice(i + 1); if (WORDS.has(a)) e2.add(a); for (const ch of AB){ const b = x.slice(0, i) + ch + x.slice(i + 1); if (WORDS.has(b)) e2.add(b); } } } out = [...new Set([...out, ...e2])]; }
    const cap = w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase(); const up = w === w.toUpperCase() && w.length > 1;
    const pre = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; }, suf = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; };
    const swap = x => { if (x.length !== l.length) return false; const d = []; for (let i = 0; i < l.length; i++) if (x[i] !== l[i]) d.push(i); return d.length === 2 && d[1] === d[0] + 1 && x[d[0]] === l[d[1]] && x[d[1]] === l[d[0]]; };
    const score = x => (e1.has(x) ? 0 : 10) - Math.min(pre(x, l), l.length) - Math.min(suf(x, l), l.length) - (swap(x) ? 6 : 0) - (x[0] === l[0] ? 2 : 0) + Math.abs(x.length - l.length) * .5;
    return out.sort((a, b) => score(a) - score(b)).slice(0, 6).map(x => up ? x.toUpperCase() : cap ? x[0].toUpperCase() + x.slice(1) : x); }
  async function spelling(){ try { toast('Loading dictionary…', 10000); await words(); toast('', 1); } catch(e){ return toast(e.message); } const s = G.sh; const user = userDict(); const ignored = new Set();
    const cells = Object.keys(s.cells).map(unkey).filter(([r, c]) => { const x = cellAt(s, r, c); return x && typeof x.v === 'string' && x.f == null && !x.dt; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const start = cells.findIndex(([r, c]) => r > G.sel.r || (r === G.sel.r && c >= G.sel.c)); const order = start > 0 ? [...cells.slice(start), ...cells.slice(0, start)] : cells; let qi = 0, wi = 0, fixed = 0;
    const next = () => { for (; qi < order.length; qi++, wi = 0){ const [r, c] = order[qi]; const v = String(Calc.get(s, r, c) ?? ''); const ws = [...v.matchAll(/[A-Za-z][A-Za-z']*[A-Za-z]|[A-Za-z]/g)]; for (; wi < ws.length; wi++){ const w = ws[wi][0]; if (w.length < 2 || ignored.has(lc(w)) || known(w, user)) continue; return {r, c, w, at: ws[wi].index, v}; } } return null; };
    const step = () => { const hit = next(); document.querySelectorAll('.dlg-back').forEach(d => d.remove()); if (!hit){ toast(fixed ? `Spelling check complete. ${fixed} change${fixed === 1 ? '' : 's'} made.` : 'Spelling check complete. No mistakes found.', 3500); return; }
      Grid.select(hit.r, hit.c); Grid.scrollTo(hit.r, hit.c); const sug = suggest(hit.w); const pick = h('select', {class: 'inp', size: Math.max(2, Math.min(6, sug.length || 2))}); sug.forEach((x, i) => { const o = h('option', {value: x}, x); if (!i) o.selected = true; pick.append(o); }); const custom = h('input', {class: 'inp', value: sug[0] || hit.w});
      pick.addEventListener('change', () => custom.value = pick.value);
      const ctx = h('p', {style: 'margin:0'}, hit.v.slice(Math.max(0, hit.at - 30), hit.at), h('mark', {}, hit.w), hit.v.slice(hit.at + hit.w.length, hit.at + hit.w.length + 30));
      const replace = all => { const to = custom.value; const re = new RegExp(`\\b${hit.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, all ? 'g' : ''); const targets = all ? order : [order[qi]]; tx(s, 'Spelling', () => { for (const [r, c] of targets){ const v = String(Calc.get(s, r, c) ?? ''); if (re.test(v)){ re.lastIndex = 0; const nv = v.replace(re, to); patchCell(s, r, c, x => { x.v = nv; }); fixed++; } } }); done(); if (!all) wi++; step(); };
      dialog('Spelling: ' + addr(hit.r, hit.c), h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, h('small', {class: 'hint'}, 'Not in dictionary:'), ctx, field('Suggestions', sug.length ? pick : h('p', {class: 'hint', style: 'margin:0'}, '(no suggestions)')), field('Change to', custom)),
        [['Ignore', '', () => { wi++; setTimeout(step, 0); }], ['Ignore all', '', () => { ignored.add(lc(hit.w)); setTimeout(step, 0); }], ['Add to dictionary', '', () => { user.add(lc(hit.w)); saveUser(user); setTimeout(step, 0); }], ['Change all', '', () => { setTimeout(() => replace(true), 0); }], ['Change', 'primary', () => { setTimeout(() => replace(false), 0); }]]); };
    step(); }
  let asYouType = false; try { asYouType = localStorage.getItem('srk-spell-live') === '1'; } catch(e){}
  const applyLive = () => { const ed = $('#cellEd'), fb = $('#fbar'); if (ed) ed.spellcheck = asYouType; if (fb) fb.spellcheck = asYouType; };
  setTimeout(applyLive, 0);

  /* ================================================================ wiring */
  const ext = {
    ribbon(tab, r, {grp, rb}){
      if (tab === 'data') r.append(grp('Data Types', rb(IC.stock, 'Stocks (live prices)', () => convert('stock'), {label: 'Stocks'}), rb(IC.geo, 'Geography (countries)', () => convert('geo'), {label: 'Geography'}), rb(IC.card, 'Show data card / insert field', card, {label: 'Card'}), rb(S('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'), 'Refresh stock prices', () => refreshStocks(false), {label: 'Refresh'})));
      if (tab === 'review'){ const g = grp('Proofing', rb(IC.spell, 'Spelling (F7)', spelling, {label: 'Spelling'}), rb(IC.spell, 'Check spelling as you type', () => { asYouType = !asYouType; try { localStorage.setItem('srk-spell-live', asYouType ? '1' : '0'); } catch(e){} applyLive(); UI.buildRibbon(); toast(asYouType ? 'Spelling is underlined while you type' : 'Live spelling off'); }, {label: asYouType ? 'Live: on' : 'Live: off', key: 'spl'})); r.insertBefore(g, r.firstChild); }
    },
    context(p){ const dt = dtOf(G.sh, G.sel.r, G.sel.c); if (dt) p.append(mi(IC.card, 'Show card / add field', card)); },
    key(e){ if (e.key === 'F7'){ e.preventDefault(); spelling(); return true; } if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F5')){ e.preventDefault(); card(); return true; } return false; },
    onOpen(wb){ if (Object.values(wb.sheets).some(s => Object.values(s.cells).some(x => x.dt && x.dt.k === 'geo'))) geo().then(() => { Calc.invalidate(); Grid.refresh(); }).catch(() => {}); },
  };
  SRK_EXT.push(ext);
  return {convert, card, refreshStocks, spelling, geo, findGeo, suggest: w => WORDS ? suggest(w) : [], words, insertField};
})();
