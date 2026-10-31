/* SRK Sheets — start screen, templates, storage, open/save, PDF */
'use strict';
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = UI.h, toast = UI.toast, dialog = (...a) => UI.dialog(...a);
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MIME = {xlsx: XLSX_MIME, csv: 'text/csv', pdf: 'application/pdf', ods: 'application/vnd.oasis.opendocument.spreadsheet'};
  const FI = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  /* ---------------------------------------------------------------- libraries */
  const LIBS = Object.assign({exceljs: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', sheetjs: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'}, window.SRK_LIBS || {});
  const loaded = {};
  function lib(name, test){ if (test()) return Promise.resolve(); return loaded[name] || (loaded[name] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = LIBS[name]; s.onload = () => res(); s.onerror = () => { delete loaded[name]; rej(new Error('Couldn’t load a component. Check your internet connection and try again.')); }; document.head.appendChild(s); })); }
  const needExcel = () => lib('exceljs', () => window.ExcelJS); const needSheetJS = () => lib('sheetjs', () => window.XLSX && window.XLSX.read);

  /* ---------------------------------------------------------------- storage */
  const Store = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('srk-sheets', 1); r.onupgradeneeded = () => { const d = r.result; for (const n of ['books', 'meta']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, {keyPath: 'id'}); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch(e){ rej(e); } }));
    const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const r = fn(t.objectStore(store)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
    return {
      async put(wb, preview){ const used = new Set(); wb.sheets.forEach(s => s.images.forEach(o => o.src && o.src.startsWith('m:') && used.add(o.src.slice(2)))); const media = {}; for (const k of used) if (wb.media[k]) media[k] = wb.media[k];
        const copy = JSON.parse(JSON.stringify({...wb, media})); copy.sheets.forEach(s => delete s.sel);
        await tx('books', 'readwrite', st => st.put(copy)); await tx('meta', 'readwrite', st => st.put({id: wb.id, name: wb.name, updated: wb.updated || Date.now(), sheets: wb.sheets.length, preview})); },
      get: id => tx('books', 'readonly', st => st.get(id)),
      list: async () => ((await tx('meta', 'readonly', st => st.getAll())) || []).sort((a, b) => b.updated - a.updated),
      del: async id => { await tx('books', 'readwrite', st => st.delete(id)); await tx('meta', 'readwrite', st => st.delete(id)); },
    };
  })();

  /* ---------------------------------------------------------------- saving files */
  let downloads = null;
  const dlReady = (async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch(e){ downloads = null; } })();
  const extOf = n => (n.split('.').pop() || '').toLowerCase();
  async function saveFile(data, name){
    await dlReady; const blob = data instanceof Blob ? data : new Blob([data], {type: MIME[extOf(name)] || 'application/octet-stream'});
    if (downloads){ try { await downloads.save({filename: name, data: blob}); toast(window.SRK_NATIVE ? `Saved to Downloads › SRK Sheets: ${name}` : `Saved ${name}`, 3400); return true; }
      catch(e){ if (e && e.code === 'perm'){ toast('Allow storage access for SRK Sheets, then save again.', 4200); return false; } if (window.SRK_NATIVE){ toast('Couldn’t save the file.', 3000); return false; } } }
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast(`Downloading ${name}`); return true; }
    catch(e){ toast('Saving files isn’t available here. Open SRK Sheets in Chrome or in the app.', 4200); return false; }
  }
  async function shareFile(data, name){
    const blob = data instanceof Blob ? data : new Blob([data], {type: MIME[extOf(name)] || 'application/octet-stream'});
    if (window.srkShare) return window.srkShare(blob, name);
    const f = new File([blob], name, {type: blob.type});
    if (navigator.canShare && navigator.canShare({files: [f]})){ try { await navigator.share({files: [f], title: name}); } catch(e){} return; }
    return saveFile(blob, name);
  }
  const cleanName = (n, ext) => (String(n || 'Book').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Book') + '.' + ext;
  function busy(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); }
  function unbusy(){ $('#toast').hidden = true; }

  /* ---------------------------------------------------------------- images */
  function imageToData(file){
    return new Promise((res, rej) => { const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => { const w = im.naturalWidth, hh = im.naturalHeight, k = Math.min(1, 1600 / Math.max(w, hh)); const png = /png|gif|svg/.test(file.type);
        const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k); const x = c.getContext('2d'); if (!png){ x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res({src: png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height}); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); }; im.src = url; });
  }

  /* ---------------------------------------------------------------- the open workbook */
  let wb = null, saveT = null;
  function dirty(){ if (!wb) return; wb.updated = Date.now(); $('#savedLbl').textContent = ''; clearTimeout(saveT); saveT = setTimeout(persist, 900); }
  async function persist(){ clearTimeout(saveT); if (!wb) return; try { await Store.put(wb, previewOf(wb)); $('#savedLbl').textContent = 'Saved'; } catch(e){ console.error(e); $('#savedLbl').textContent = 'Not saved'; } }
  function previewOf(w){ const s = w.sheets[w.active] || w.sheets[0]; const rows = []; try { for (let r = 0; r < 9; r++){ const row = []; for (let c = 0; c < 6; c++){ const x = cellAt(s, r, c); const st = x && x.s || {}; const ts = s.tables.length ? tableStyleAt(s, r, c) : null; row.push([x ? displayAt(s, r, c).text : '', st.fill || (ts && ts.fill) || '', st.color || (ts && ts.color) || '', st.b || (ts && ts.b) ? 1 : 0]); } rows.push(row); } } catch(e){} return rows; }
  function edit(book){ wb = book; $('#startView').hidden = true; $('#editView').hidden = false; $('#docTitle').value = wb.name; $('#savedLbl').textContent = ''; UI.open(wb); try { history.pushState({srk: 'edit'}, ''); } catch(e){} document.querySelectorAll('.secbar').forEach(x => x.remove()); for (const x of SRK_EXT) if (x.onOpen) try { x.onOpen(wb); } catch(e){ console.error(e); } if (typeof VBA !== 'undefined') VBA.onOpen(); }
  async function goHome(){ if (Grid.G.edit) Grid.commitEdit(); for (const x of SRK_EXT) if (x.onClose) try { x.onClose(); } catch(e){} if (typeof CO !== 'undefined') CO.stop(); await persist(); wb = null; $('#editView').hidden = true; $('#startView').hidden = false; document.querySelectorAll('.pop,.dlg-back,.filemenu,.notetip').forEach(e => e.remove()); renderStart(); }

  /* ---------------------------------------------------------------- templates */
  function build(name, fn){ const w = newWorkbook(name); Calc.attach(w); fn(w, w.sheets[0]); Calc.invalidate(); for (const s of w.sheets){ const {R} = Calc.lastRC(s); for (let r = 0; r <= Math.min(R, 60); r++) Grid.autoFitRowIfWrap(r, s); } return w; }
  const put = (sh, a, text, s) => { const p = parseAddr(a); inputCell(sh, p.r, p.c, String(text)); if (s) patchCell(sh, p.r, p.c, x => { x.s = {...(x.s || {}), ...s}; }); };
  const row = (sh, a, vals, s) => { const p = parseAddr(a); vals.forEach((v, i) => { if (v === '' || v == null) return; put(sh, addr(p.r, p.c + i), v, s); }); };
  const styleR = (sh, ref, s) => styleRange(sh, parseRange(ref), st => Object.assign(st, s));
  const widths = (sh, list) => list.forEach((w, i) => { if (w) sh.colW[i] = w; });
  const box = (sh, ref) => { const g = parseRange(ref); forRange(g, (r, c) => patchCell(sh, r, c, x => { const e = {style: 'thin', color: '#BFBFBF'}; x.s = {...(x.s || {}), bd: {t: e, b: e, l: e, r: e}}; })); };
  const RS = `"${CURRENCY}"#,##0`, RS2 = `"${CURRENCY}"#,##0.00`, DF = DMY ? 'dd/mm/yyyy' : 'm/d/yyyy';
  const ds = n => { const t = todaySerial() - n; return formatValue(t, DF).text; };
  const TEMPLATES = [
    ['Blank workbook', 'Start from scratch', () => build('Book', () => {})],
    ['Monthly budget', 'Income, spending and what’s left', () => build('Monthly budget', (w, s) => { s.name = 'Budget';
      put(s, 'A1', 'Monthly budget', {size: 18, b: true, color: '#1E7B47'}); put(s, 'A2', 'Change the blue numbers; everything else updates.', {color: '#7F7F7F', i: true});
      row(s, 'A4', ['Income', 'Planned', 'Actual', 'Difference'], {b: true, fill: '#1E7B47', color: '#FFFFFF'});
      [['Salary', 150000, 150000], ['Consultation fees', 60000, 72500], ['Other income', 5000, 3200]].forEach((r, i) => { row(s, 'A' + (5 + i), r); put(s, 'D' + (5 + i), `=C${5 + i}-B${5 + i}`); });
      row(s, 'A8', ['Total income', '=SUM(B5:B7)', '=SUM(C5:C7)', '=C8-B8'], {b: true});
      row(s, 'A10', ['Expenses', 'Planned', 'Actual', 'Difference'], {b: true, fill: '#C00000', color: '#FFFFFF'});
      [['Rent / EMI', 45000, 45000], ['Groceries', 18000, 21350], ['Electricity & water', 4500, 5120], ['Fuel & transport', 9000, 8400], ['School fees', 15000, 15000], ['Insurance', 6000, 6000], ['Medical', 3000, 1850], ['Eating out', 6000, 7900], ['Savings / SIP', 40000, 40000], ['Others', 5000, 3600]].forEach((r, i) => { row(s, 'A' + (11 + i), r); put(s, 'D' + (11 + i), `=B${11 + i}-C${11 + i}`); });
      row(s, 'A21', ['Total expenses', '=SUM(B11:B20)', '=SUM(C11:C20)', '=B21-C21'], {b: true});
      row(s, 'A23', ['Balance left', '=B8-B21', '=C8-C21'], {b: true, size: 13, fill: '#E2EFDA'});
      styleR(s, 'B5:D23', {nf: RS}); styleR(s, 'B5:C7', {color: '#0070C0'}); styleR(s, 'B11:C20', {color: '#0070C0'}); box(s, 'A4:D8'); box(s, 'A10:D21');
      s.cf.push({range: parseRange('D11:D20'), type: 'lt', v1: 0, style: {fill: '#FFC7CE', color: '#9C0006'}});
      widths(s, [170, 100, 100, 100]); s.charts.push({id: uid(), chart: 'bar', range: parseRange('A10:C20'), r: 3, c: 5, dx: 8, dy: 0, w: 460, h: 340, title: 'Planned vs actual spending', legend: true}); })],
    ['Expense tracker', 'Daily spends by category', () => build('Expense tracker', (w, s) => { s.name = 'Expenses';
      row(s, 'A1', ['Date', 'Description', 'Category', 'Paid by', 'Amount']);
      [[ds(9), 'Vegetables and fruits', 'Groceries', 'UPI', 640], [ds(8), 'Petrol', 'Transport', 'Card', 2500], [ds(7), 'Electricity bill', 'Bills', 'UPI', 3180], [ds(5), 'Dinner with family', 'Food', 'Card', 2240], [ds(4), 'Medicines', 'Health', 'Cash', 860], [ds(2), 'Monthly groceries', 'Groceries', 'UPI', 6450], [ds(1), 'Mobile recharge', 'Bills', 'UPI', 749]].forEach((r, i) => row(s, 'A' + (2 + i), r));
      styleR(s, 'A2:A200', {nf: DF}); styleR(s, 'E2:E200', {nf: RS2});
      s.tables.push({name: 'Expenses', range: parseRange('A1:E8'), style: 'green', header: true, banded: true}); s.filter = {range: parseRange('A1:E8'), cols: {}};
      s.dv.push({range: parseRange('C2:C500'), type: 'list', list: 'Groceries, Food, Transport, Bills, Health, Education, Shopping, Others'}, {range: parseRange('D2:D500'), type: 'list', list: 'Cash, UPI, Card, Bank transfer'});
      row(s, 'G1', ['Category', 'Total'], {b: true, fill: '#E2EFDA'}); ['Groceries', 'Food', 'Transport', 'Bills', 'Health', 'Others'].forEach((c, i) => { put(s, 'G' + (2 + i), c); put(s, 'H' + (2 + i), `=SUMIF(C:C,G${2 + i},E:E)`, {nf: RS}); });
      row(s, 'G8', ['Total', '=SUM(E2:E500)'], {b: true}); styleR(s, 'H8', {nf: RS}); widths(s, [96, 200, 110, 90, 100, 20, 110, 100]); s.freeze = {r: 1, c: 0};
      s.charts.push({id: uid(), chart: 'doughnut', range: parseRange('G1:H7'), r: 9, c: 6, dx: 0, dy: 0, w: 340, h: 260, title: 'Where the money went', legend: true, labels: true}); })],
    ['Patient register (OPD)', 'Visits, fees and follow-ups', () => build('OPD register', (w, s) => { s.name = 'OPD';
      row(s, 'A1', ['S.No', 'Date', 'Patient name', 'Age', 'Sex', 'Phone', 'Complaint / diagnosis', 'Procedure', 'Fee', 'Follow-up']);
      [[ds(3), 'Ramesh K', 54, 'M', '98400 12345', 'Inguinal hernia (R)', 'Consultation', 500], [ds(3), 'Lakshmi S', 38, 'F', '94440 55621', 'Gallstones', 'USG advised', 500], [ds(2), 'Arun P', 27, 'M', '90031 77810', 'Sebaceous cyst back', 'Excision (LA)', 3500], [ds(1), 'Fathima B', 45, 'F', '98841 20098', 'Breast lump (L)', 'FNAC', 1500], [ds(0), 'Suresh M', 61, 'M', '97890 43321', 'Post-op review', 'Dressing', 300]].forEach((r, i) => { put(s, 'A' + (2 + i), `=ROW()-1`); row(s, 'B' + (2 + i), r); put(s, 'J' + (2 + i), `=IF(B${2 + i}="","",B${2 + i}+7)`); });
      styleR(s, 'B2:B500', {nf: DF}); styleR(s, 'J2:J500', {nf: DF}); styleR(s, 'I2:I500', {nf: RS}); styleR(s, 'A2:A500', {ha: 'center'}); styleR(s, 'E2:E500', {ha: 'center'});
      s.tables.push({name: 'OPD', range: parseRange('A1:J6'), style: 'blue', header: true, banded: true}); s.filter = {range: parseRange('A1:J6'), cols: {}};
      s.dv.push({range: parseRange('E2:E1000'), type: 'list', list: 'M, F, Other'}, {range: parseRange('D2:D1000'), type: 'whole', op: 'between', min: 0, max: 120});
      widths(s, [46, 92, 150, 46, 46, 110, 190, 120, 80, 92]); s.freeze = {r: 1, c: 3};
      const t = newSheet('Summary'); w.sheets.push(t); put(t, 'A1', 'OPD summary', {size: 16, b: true, color: '#0070C0'});
      [['Total patients', '=COUNTA(OPD!C2:C1000)'], ['Male', '=COUNTIF(OPD!E2:E1000,"M")'], ['Female', '=COUNTIF(OPD!E2:E1000,"F")'], ['Average age', '=IFERROR(ROUND(AVERAGE(OPD!D2:D1000),1),0)'], ['Total fees', '=SUM(OPD!I2:I1000)'], ['Seen today', '=COUNTIF(OPD!B2:B1000,TODAY())'], ['Follow-ups due in 7 days', '=COUNTIFS(OPD!J2:J1000,">="&TODAY(),OPD!J2:J1000,"<="&TODAY()+7)']].forEach((r, i) => { put(t, 'A' + (3 + i), r[0]); put(t, 'B' + (3 + i), r[1], {b: true}); });
      styleR(t, 'B7', {nf: RS}); box(t, 'A3:B9'); widths(t, [200, 110]); })],
    ['Attendance register', 'Monthly P / A for staff or students', () => build('Attendance', (w, s) => { s.name = 'Attendance';
      put(s, 'A1', 'Attendance — ' + formatValue(todaySerial(), 'mmmm yyyy').text, {size: 15, b: true}); row(s, 'A3', ['Name'], {b: true, fill: '#DDEBF7'});
      for (let d = 1; d <= 31; d++){ put(s, addr(2, d), d, {b: true, fill: '#DDEBF7', ha: 'center'}); s.colW[d] = 30; }
      row(s, 'AF3', ['Present', 'Absent', '%'], {b: true, fill: '#DDEBF7', ha: 'center'});
      const names = ['Anitha', 'Babu', 'Charles', 'Divya', 'Elango', 'Farida', 'Gopal', 'Hema'];
      names.forEach((n, i) => { const r = 3 + i; put(s, addr(r, 0), n); for (let d = 1; d <= 20; d++) put(s, addr(r, d), (i * 7 + d * 3) % 11 === 0 ? 'A' : 'P', {ha: 'center'}); put(s, addr(r, 32), `=COUNTIF(B${r + 1}:AF${r + 1},"P")`); put(s, addr(r, 33), `=COUNTIF(B${r + 1}:AF${r + 1},"A")`); put(s, addr(r, 34), `=IFERROR(AG${r + 1}/(AG${r + 1}+AH${r + 1}),0)`, {nf: '0%'}); });
      s.colW[0] = 120; s.colW[32] = 70; s.colW[33] = 70; s.colW[34] = 60; box(s, `A3:AI${3 + names.length}`); s.freeze = {r: 3, c: 1};
      s.dv.push({range: parseRange('B4:AF200'), type: 'list', list: 'P, A, L, H'}); s.cf.push({range: parseRange('B4:AF200'), type: 'eq', v1: 'A', style: {fill: '#FFC7CE', color: '#9C0006'}}, {range: parseRange('B4:AF200'), type: 'eq', v1: 'L', style: {fill: '#FFEB9C', color: '#9C5700'}}, {range: parseRange(`AI4:AI${3 + names.length}`), type: 'databar', color: '#63C384'}); })],
    ['Marks sheet', 'Totals, percentage, grade and rank', () => build('Marks sheet', (w, s) => { s.name = 'Marks';
      row(s, 'A1', ['Roll no', 'Name', 'Tamil', 'English', 'Maths', 'Science', 'Social', 'Total', '%', 'Grade', 'Rank', 'Result']);
      const st = [['Aarav', 88, 92, 95, 90, 85], ['Bhavya', 76, 81, 68, 72, 79], ['Charan', 91, 85, 99, 96, 88], ['Deepa', 64, 70, 45, 58, 66], ['Ezhil', 82, 78, 86, 80, 84], ['Gayathri', 95, 90, 92, 94, 97], ['Harish', 55, 48, 32, 41, 50], ['Indhu', 73, 88, 79, 85, 77]];
      st.forEach((r, i) => { const n = i + 2; put(s, 'A' + n, 101 + i); row(s, 'B' + n, r); put(s, 'H' + n, `=SUM(C${n}:G${n})`); put(s, 'I' + n, `=H${n}/500`, {nf: '0.0%'}); put(s, 'J' + n, `=IFS(I${n}>=0.9,"A+",I${n}>=0.8,"A",I${n}>=0.7,"B",I${n}>=0.6,"C",I${n}>=0.35,"D",TRUE,"F")`, {ha: 'center'}); put(s, 'K' + n, `=RANK(H${n},$H$2:$H$${st.length + 1})`, {ha: 'center'}); put(s, 'L' + n, `=IF(MIN(C${n}:G${n})>=35,"Pass","Fail")`); });
      const n = st.length + 2; row(s, 'B' + n, ['Class average']); ['C', 'D', 'E', 'F', 'G', 'H'].forEach(c => put(s, c + n, `=ROUND(AVERAGE(${c}2:${c}${n - 1}),1)`)); styleR(s, `A${n}:L${n}`, {b: true, fill: '#F2F2F2'});
      s.tables.push({name: 'Marks', range: parseRange(`A1:L${n - 1}`), style: 'purple', header: true, banded: true});
      s.cf.push({range: parseRange(`C2:G${n - 1}`), type: 'lt', v1: 35, style: {fill: '#FFC7CE', color: '#9C0006'}}, {range: parseRange(`H2:H${n - 1}`), type: 'scale3', colors: ['#F8696B', '#FFEB84', '#63BE7B']}, {range: parseRange(`L2:L${n - 1}`), type: 'text', v1: 'Fail', style: {color: '#C00000', b: true}});
      widths(s, [62, 110, 64, 64, 64, 64, 64, 64, 64, 56, 50, 64]); s.freeze = {r: 1, c: 2}; })],
    ['Loan EMI calculator', 'EMI, interest and repayment schedule', () => build('Loan EMI', (w, s) => { s.name = 'EMI';
      put(s, 'A1', 'Loan EMI calculator', {size: 18, b: true, color: '#1E7B47'});
      [['Loan amount', 2500000, RS], ['Interest rate (yearly)', '8.5%', '0.00%'], ['Tenure (months)', 240, '0']].forEach((r, i) => { put(s, 'A' + (3 + i), r[0]); put(s, 'B' + (3 + i), r[1], {nf: r[2], color: '#0070C0', fill: '#FFF2CC'}); });
      [['Monthly EMI', '=IFERROR(PMT(B4/12,B5,-B3),0)'], ['Total interest', '=B7*B5-B3'], ['Total payment', '=B7*B5']].forEach((r, i) => { put(s, 'A' + (7 + i), r[0], {b: true}); put(s, 'B' + (7 + i), r[1], {nf: RS, b: true}); });
      styleR(s, 'B7', {size: 14, color: '#1E7B47'}); box(s, 'A3:B5'); box(s, 'A7:B9');
      row(s, 'D3', ['Month', 'Opening', 'EMI', 'Interest', 'Principal', 'Closing'], {b: true, fill: '#1E7B47', color: '#FFFFFF', ha: 'center'});
      for (let m = 1; m <= 360; m++){ const r = 3 + m, R = r + 1; put(s, 'D' + R, `=IF(${m}<=$B$5,${m},"")`); put(s, 'E' + R, m === 1 ? `=IF(D${R}="","",$B$3)` : `=IF(D${R}="","",I${R - 1})`); put(s, 'F' + R, `=IF(D${R}="","",$B$7)`); put(s, 'G' + R, `=IF(D${R}="","",E${R}*$B$4/12)`); put(s, 'H' + R, `=IF(D${R}="","",F${R}-G${R})`); put(s, 'I' + R, `=IF(D${R}="","",MAX(0,E${R}-H${R}))`); }
      styleR(s, 'E4:I363', {nf: RS}); styleR(s, 'D4:D363', {ha: 'center'}); widths(s, [170, 120, 20, 60, 110, 90, 90, 90, 110]); s.freeze = {r: 3, c: 0}; })],
    ['Invoice', 'Bill with GST and totals', () => build('Invoice', (w, s) => { s.name = 'Invoice';
      put(s, 'A1', 'INVOICE', {size: 22, b: true, color: '#1E7B47'}); put(s, 'E1', 'Your clinic / business name', {b: true, ha: 'right'}); put(s, 'E2', 'Address line, City – PIN', {ha: 'right', color: '#595959'}); put(s, 'E3', 'Phone · GSTIN', {ha: 'right', color: '#595959'});
      put(s, 'A5', 'Bill to', {b: true, color: '#7F7F7F'}); put(s, 'A6', 'Customer name'); put(s, 'A7', 'Address');
      put(s, 'D5', 'Invoice no', {b: true}); put(s, 'E5', 'INV-001'); put(s, 'D6', 'Date', {b: true}); put(s, 'E6', '=TODAY()', {nf: DF, ha: 'right'}); put(s, 'D7', 'Due', {b: true}); put(s, 'E7', '=E6+15', {nf: DF, ha: 'right'});
      row(s, 'A9', ['#', 'Description', 'Qty', 'Rate', 'Amount'], {b: true, fill: '#1E7B47', color: '#FFFFFF'});
      [['Consultation', 1, 800], ['Dressing', 3, 250], ['Medicines', 1, 1240]].forEach((r, i) => { const n = 10 + i; put(s, 'A' + n, i + 1); row(s, 'B' + n, r); });
      for (let n = 10; n <= 19; n++) put(s, 'E' + n, `=IF(C${n}="","",C${n}*D${n})`);
      styleR(s, 'D10:E19', {nf: RS2}); box(s, 'A9:E19');
      [['Subtotal', '=SUM(E10:E19)'], ['GST %', '18%'], ['GST', '=E21*E22'], ['Total', '=E21+E23']].forEach((r, i) => { put(s, 'D' + (21 + i), r[0], {b: true, ha: 'right'}); put(s, 'E' + (21 + i), r[1], {nf: i === 1 ? '0%' : RS2}); });
      styleR(s, 'D24:E24', {size: 13, fill: '#E2EFDA', b: true}); put(s, 'A27', 'Thank you!', {i: true, color: '#7F7F7F'});
      widths(s, [40, 260, 60, 100, 120]); s.page.fit = 'width'; s.grid = false; })],
  ];

  /* ---------------------------------------------------------------- start screen */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  function miniHTML(rows){ return '<table>' + rows.map(r => '<tr>' + r.map(([t, f, c, b]) => `<td style="${f ? 'background:' + f + ';' : ''}${c ? 'color:' + c + ';' : ''}${b ? 'font-weight:700;' : ''}">${esc(t)}</td>`).join('') + '</tr>').join('') + '</table>'; }
  let tplPreviews = null;
  function renderStart(){
    const T = $('#tpls'); T.innerHTML = ''; if (!tplPreviews) tplPreviews = TEMPLATES.map(t => { try { return previewOf(t[2]()); } catch(e){ console.error(t[0], e); return []; } });
    TEMPLATES.forEach(([n, sub, fn], i) => { const b = h('button', {class: 'tpl', type: 'button'}, h('div', {class: 'mini', html: miniHTML(tplPreviews[i])}), h('b', {}, n), h('small', {}, sub)); b.addEventListener('click', () => { const w = fn(); w.id = uid(); edit(w); dirty(); }); T.append(b); });
    const O = $('#openRow'); O.innerHTML = ''; const lab = h('label', {class: 'btn primary filepick', html: FI('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') + '<span>Open Excel or CSV file</span>'});
    const inp = h('input', {type: 'file', accept: '.xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv', class: 'fileover'}); inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) openFile(f); }); lab.append(inp); O.append(lab, h('span', {class: 'hint'}, '.xlsx and .csv files'));
    if (window.claude && !window.SRK_NATIVE) $('#tipBox').hidden = false;
    renderRecent(); if (typeof CO !== 'undefined') CO.listShared(); }
  async function renderRecent(){ const R = $('#recent'); let list = []; try { list = await Store.list(); } catch(e){} R.innerHTML = ''; if (!list.length){ R.append(h('div', {class: 'empty'}, 'Workbooks you create or open appear here.')); return; }
    for (const m of list){ const when = new Date(m.updated); const meta = h('button', {class: 'meta', type: 'button'}, h('b', {}, m.name), h('small', {}, `${m.sheets} sheet${m.sheets === 1 ? '' : 's'} · ${when.toLocaleDateString(undefined, {day: 'numeric', month: 'short'})} ${when.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})}`));
      meta.addEventListener('click', async () => { const b = await Store.get(m.id); if (b){ b.media = b.media || {}; edit(b); } else toast('Couldn’t open that workbook'); });
      const del = h('button', {class: 'ib', type: 'button', 'aria-label': 'Delete ' + m.name, title: 'Delete', html: UI.I.trash}); del.addEventListener('click', () => dialog('Delete workbook?', h('p', {style: 'margin:0'}, `“${m.name}” will be removed from this device.`), [['Cancel'], ['Delete', 'danger', async () => { await Store.del(m.id); renderRecent(); }]]));
      R.append(h('div', {class: 'rrow'}, h('span', {class: 'ricon'}, 'XLS'), meta, del)); } }

  /* ---------------------------------------------------------------- opening files */
  async function openBytes(buf, name){
    let later = ''; try { busy('Opening ' + name + '…'); let book;
      if (/\.(csv|tsv|txt)$/i.test(name)){ let text = new TextDecoder('utf-8').decode(buf); if (/\.tsv$/i.test(name) || (!text.includes(',') && text.includes('\t'))) text = text.split('\n').map(l => l.split('\t').map(v => /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join(',')).join('\n'); book = XIO.readCSV(text.replace(/^﻿/, ''), name.replace(/\.\w+$/, '')); }
      else { await needExcel(); if (/\.(xls|ods|xlsb|fods|numbers)$/i.test(name)){ await needSheetJS(); let X; try { X = XLSX.read(new Uint8Array(buf), {type: 'array', cellFormula: true, cellDates: false, cellNF: true}); } catch(e){ throw new Error('Couldn’t read that file. It may be damaged or password-protected.'); } buf = XLSX.write(X, {bookType: 'xlsx', type: 'array'}); later = 'Opened. Older file types keep values and formulas; some formatting may be simpler.'; } book = await XIO.readXlsx(buf, name.replace(/\.\w+$/, '')); }
      unbusy(); book.id = uid(); book.updated = Date.now(); edit(book); dirty(); if (later) toast(later, 4500);
    } catch(e){ unbusy(); console.error(e); toast(e.message || 'Couldn’t open that file.', 5000); } }
  async function openFile(file){ if (!file) return; if (/\.pdf$/i.test(file.name)){ toast('That’s a PDF. SRK Sheets opens Excel (.xlsx) and CSV files.', 4000); return; } openBytes(await file.arrayBuffer(), file.name); }
  window.srkOpenIncoming = async name => { try { const r = await fetch('/incoming/file'); if (!r.ok) throw 0; if (wb) await persist(); openBytes(await r.arrayBuffer(), name || 'Workbook.xlsx'); } catch(e){ toast('Couldn’t open the file you shared.', 4000); } };
  async function importCsv(file){ const text = (await file.text()).replace(/^﻿/, ''); const rows = XIO.parseCSV(text); const s = Grid.G.sh, {r, c} = Grid.G.sel; tx(s, 'Import CSV', () => rows.forEach((row, i) => row.forEach((v, j) => { if (v !== '') inputCell(s, r + i, c + j, v); }))); Grid.refresh(); UI.onSel(); dirty(); toast(`Imported ${rows.length} rows`); }

  /* ---------------------------------------------------------------- saving */
  async function makeXlsx(){ if (Grid.G.edit) Grid.commitEdit(); await needExcel(); const b = await XIO.writeXlsx(wb); const n = XIO.notes ? XIO.notes() : []; if (n.length) setTimeout(() => UI.toast(n[0] + (n.length > 1 ? ` (and ${n.length - 1} more)` : ''), 7000), 1500); return b; }
  async function saveXlsx(share){ try { busy('Preparing Excel file…'); const b = await makeXlsx(); unbusy(); const macro = !!wb.vbaBin; const blob = new Blob([b], {type: macro ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : XLSX_MIME}); const n = cleanName(wb.name, macro ? 'xlsm' : 'xlsx'); if (share) await shareFile(blob, n); else await saveFile(blob, n); } catch(e){ unbusy(); console.error(e); toast(e.message || 'Couldn’t save.', 4500); } }
  async function saveOds(share){ try { busy('Preparing OpenDocument file…'); const b = await makeXlsx(); await needSheetJS(); const X = XLSX.read(new Uint8Array(b), {type: 'array', cellFormula: true, cellStyles: true}); const out = XLSX.write(X, {bookType: 'ods', type: 'array'}); unbusy(); const blob = new Blob([out], {type: MIME.ods}); const n = cleanName(wb.name, 'ods'); if (share) await shareFile(blob, n); else await saveFile(blob, n); } catch(e){ unbusy(); console.error(e); toast(e.message || 'Couldn’t save.', 4500); } }
  async function saveCsv(share){ if (Grid.G.edit) Grid.commitEdit(); const s = Grid.G.sh; const blob = new Blob(['﻿' + XIO.writeCSV(s)], {type: 'text/csv'}); const n = cleanName(wb.sheets.length > 1 ? `${wb.name} - ${s.name}` : wb.name, 'csv'); if (share) await shareFile(blob, n); else await saveFile(blob, n); }

  /* ---------------------------------------------------------------- PDF (pages drawn on a canvas) */
  const PAGE = {A4: [595.28, 841.89], Letter: [612, 792]};
  const BW = {thin: 0.75, hair: 0.4, dotted: 0.75, dashed: 0.75, medium: 1.5, thick: 2.25, double: 2.2, mediumDashed: 1.5};
  const MARG = {normal: 54, narrow: 36, wide: 72};
  const titleRows = (s, g) => { const t = (s.page || {}).titles; const m = t && /^(\d+)(?::(\d+))?$/.exec(t); if (!m) return null; const a = +m[1] - 1, b = (+(m[2] || m[1])) - 1; return {a: Math.min(a, b), b: Math.max(a, b)}; };
  function sheetPages(s){
    const pg = s.page || {}; let g = pg.area; const {R, C} = Calc.lastRC(s);
    if (!g){ let r2 = R, c2 = C; for (const o of [...s.charts, ...s.images, ...(s.shapes || [])]){ const e = objEnd(s, o); r2 = Math.max(r2, e.r); c2 = Math.max(c2, e.c); } g = {r1: 0, c1: 0, r2, c2}; }
    if (!Object.keys(s.cells).length && !s.charts.length && !s.images.length && !(s.shapes || []).length) return [];
    const cw = c => s.hidC[c] ? 0 : (s.colW[c] ?? DEF_W), rh = r => s.hidR[r] ? 0 : (s.rowH[r] ?? DEF_H);
    const [PW0, PH0] = PAGE[pg.size] || PAGE.A4; const land = pg.orient === 'landscape'; const PW = land ? PH0 : PW0, PH = land ? PW0 : PH0; const M = MARG[pg.margins] || MARG.normal;
    const HF = (pg.header ? 14 : 0) + 14; // room for header and footer text
    let totalW = 0; for (let c = g.c1; c <= g.c2; c++) totalW += cw(c);
    const k0 = 0.75; const k = pg.fit === 'none' ? k0 : Math.min(k0, (PW - 2 * M) / Math.max(1, totalW)); const aw = (PW - 2 * M) / k, ah0 = (PH - 2 * M - HF) / k;
    const tr = titleRows(s, g); let th = 0; if (tr) for (let r = tr.a; r <= tr.b; r++) th += rh(r);
    const colChunks = []; let cur = [g.c1, g.c1], w = 0; for (let c = g.c1; c <= g.c2; c++){ if (w + cw(c) > aw + 0.5 && c > cur[0]){ colChunks.push(cur); cur = [c, c]; w = 0; } w += cw(c); cur[1] = c; } colChunks.push(cur);
    const rowChunks = []; let rc = [g.r1, g.r1], hh = 0; const room = r0 => ah0 - (tr && r0 > tr.b ? th : 0);
    for (let r = g.r1; r <= g.r2; r++){ if (hh + rh(r) > room(rc[0]) + 0.5 && r > rc[0]){ rowChunks.push(rc); rc = [r, r]; hh = 0; } hh += rh(r); rc[1] = r; } rowChunks.push(rc);
    const pages = []; for (const [c1, c2] of colChunks) for (const [r1, r2] of rowChunks) pages.push({s, g: {r1, c1, r2, c2}, PW, PH, M, k, cw, rh, tr: tr && r1 > tr.b ? tr : null, HF}); return pages; }
  function objEnd(s, o){ let c = o.c, x = (o.dx || 0) + o.w; while (c < 16000 && x > (s.colW[c] ?? DEF_W)){ x -= s.colW[c] ?? DEF_W; c++; } let r = o.r, y = (o.dy || 0) + o.h; while (r < 1e6 && y > (s.rowH[r] ?? DEF_H)){ y -= s.rowH[r] ?? DEF_H; r++; } return {r, c}; }
  const svgImg = svg => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')); });
  const srcImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  async function drawPage(p, num, total){
    const D = 2.2; const cv = document.createElement('canvas'); cv.width = Math.round(p.PW * D); cv.height = Math.round(p.PH * D); const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    const {s, g, M, k, cw} = p; const pg = s.page || {}; let W0 = 0; for (let c = g.c1; c <= g.c2; c++) W0 += cw(c);
    const offX = pg.center ? Math.max(0, (p.PW - 2 * M - W0 * k) / 2) : 0; const top = M + (pg.header ? 14 : 0);
    x.scale(D, D); x.translate(M + offX, top); x.scale(k, k);
    if (p.tr){ const th = await drawRegion(x, p, {r1: p.tr.a, c1: g.c1, r2: p.tr.b, c2: g.c2}, false); x.translate(0, th); }
    await drawRegion(x, p, g, true);
    x.setTransform(D, 0, 0, D, 0, 0); x.fillStyle = '#595959'; x.font = `8px ${fontCss()}`; x.textAlign = 'center';
    const codes = t => String(t || '').replace(/&\[Page\]/gi, num).replace(/&\[Pages\]/gi, total).replace(/&\[Date\]/gi, new Date().toLocaleDateString()).replace(/&\[Time\]/gi, new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})).replace(/&\[Sheet\]/gi, s.name).replace(/&\[File\]/gi, wb.name);
    if (pg.header) x.fillText(codes(pg.header), p.PW / 2, M - 4);
    const foot = pg.footer != null && pg.footer !== '' ? codes(pg.footer) : total > 1 ? `${s.name} — page ${num} of ${total}` : ''; if (foot) x.fillText(foot, p.PW / 2, p.PH - M / 2);
    return cv; }
  async function drawRegion(x, p, g, withObj){
    const {s, cw, rh} = p; const pg = s.page || {};
    const L = {}, T = {}; let acc = 0; for (let c = g.c1; c <= g.c2 + 1; c++){ L[c] = acc; if (c <= g.c2) acc += cw(c); } const W = acc; acc = 0; for (let r = g.r1; r <= g.r2 + 1; r++){ T[r] = acc; if (r <= g.r2) acc += rh(r); } const H = acc; if (!withObj) T.__ = 0;
    const colX = c => c < g.c1 ? L[g.c1] - [...Array(g.c1 - c)].reduce((a, _, i) => a + cw(g.c1 - 1 - i), 0) : c > g.c2 + 1 ? W + [...Array(c - g.c2 - 1)].reduce((a, _, i) => a + cw(g.c2 + 1 + i), 0) : L[c];
    const rowY = r => r < g.r1 ? T[g.r1] - [...Array(g.r1 - r)].reduce((a, _, i) => a + rh(g.r1 - 1 - i), 0) : r > g.r2 + 1 ? H + [...Array(r - g.r2 - 1)].reduce((a, _, i) => a + rh(g.r2 + 1 + i), 0) : T[r];
    x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip();
    if (pg.grid){ x.strokeStyle = '#D0D0D0'; x.lineWidth = 0.6; x.beginPath(); for (let c = g.c1; c <= g.c2 + 1; c++){ x.moveTo(L[c], 0); x.lineTo(L[c], H); } for (let r = g.r1; r <= g.r2 + 1; r++){ x.moveTo(0, T[r]); x.lineTo(W, T[r]); } x.stroke(); }
    const cfCache = {}; const done = new Set(); const texts = [], borders = [];
    for (let r = g.r1; r <= g.r2; r++){ if (!rh(r)) continue; for (let c = g.c1; c <= g.c2; c++){ if (!cw(c)) continue;
      const m = mergeAt(s, r, c); if (m){ const kk = m.r1 + ',' + m.c1; if (done.has(kk)) continue; done.add(kk); }
      const rr = m ? m.r1 : r, cc = m ? m.c1 : c; const bx = m ? {x: colX(m.c1), y: rowY(m.r1), w: colX(m.c2 + 1) - colX(m.c1), h: rowY(m.r2 + 1) - rowY(m.r1)} : {x: L[c], y: T[r], w: cw(c), h: rh(r)};
      const cell = cellAt(s, rr, cc); const st = cell && cell.s || {}; const ts = s.tables.length ? tableStyleAt(s, rr, cc) : null; const cf = s.cf.length ? cfStyleFor(s, rr, cc, cfCache) : null;
      const fill = (cf && cf.fill) || st.fill || (ts && ts.fill); if (fill){ x.fillStyle = fill; x.fillRect(bx.x, bx.y, bx.w, bx.h); }
      if (cf && cf.bar){ x.fillStyle = cf.bar.color + 'aa'; x.fillRect(bx.x + 1, bx.y + 2, (bx.w - 2) * cf.bar.pct, bx.h - 4); }
      if (st.bd) borders.push([bx, st.bd]); if (ts && ts.bdT) borders.push([bx, {t: {style: 'double', color: ts.bdT}}]);
      if (!cell && Calc.spilledValue(s, rr, cc) === undefined) continue; const d = displayAt(s, rr, cc); if (!d.text) continue; const v = valueAt(s, rr, cc);
      texts.push({bx, d, v, st, color: (cf && cf.color) || d.color || st.color || (ts && ts.color) || (s.links[key(rr, cc)] ? '#0563C1' : '#000'), b: st.b || (cf && cf.b) || (ts && ts.b), r: rr, c: cc, m, icon: cf && cf.icon}); } }
    for (const t of texts){ const {bx, st} = t; const size = (st.size || 11) * 4 / 3; x.font = `${st.i ? 'italic ' : ''}${t.b ? '700 ' : ''}${size}px ${fontCss(st.font)}`; x.fillStyle = t.color; x.textBaseline = 'alphabetic';
      let align = st.ha && st.ha !== 'general' ? st.ha : t.d.align || (typeof t.v === 'number' ? 'right' : 'left'); let text = t.d.text; const pad = 3 + (st.ind || 0) * 9;
      const lines = st.wrap ? wrapLines(x, text, bx.w - 6) : text.split('\n').slice(0, 1); if (!st.wrap && typeof t.v === 'number' && x.measureText(text).width > bx.w - 4) { text = '#'.repeat(Math.max(1, Math.floor((bx.w - 4) / x.measureText('#').width))); lines[0] = text; }
      let clipX = bx.x, clipW = bx.w; if (!st.wrap && !t.m && typeof t.v !== 'number' && align === 'left'){ const tw = x.measureText(text).width + pad + 3; let c2 = t.c + 1; while (clipW < tw && c2 <= g.c2 && !cellAt(s, t.r, c2)){ clipW += cw(c2); c2++; } }
      const lh = size * 1.22; const block = lines.length * lh; const va = st.va || 'bottom'; let y0 = va === 'top' ? bx.y + 2 + size : va === 'middle' ? bx.y + (bx.h - block) / 2 + size * 0.95 : bx.y + bx.h - block - 2 + size * 0.98;
      x.save(); x.beginPath(); x.rect(clipX, bx.y, clipW, bx.h); x.clip();
      if (t.icon){ const f0 = x.font, c0 = x.fillStyle; x.font = `${size * 0.9}px ${fontCss()}`; x.fillStyle = t.icon[1]; x.fillText(t.icon[0], bx.x + 2, y0 + (lines.length - 1) * lh); x.font = f0; x.fillStyle = c0; }
      lines.forEach((ln, i) => { const tw = x.measureText(ln).width; const tx0 = align === 'center' ? bx.x + (bx.w - tw) / 2 : align === 'right' ? bx.x + bx.w - pad - tw : bx.x + pad; const yy = y0 + i * lh; x.fillText(ln, tx0, yy);
        if (st.u || s.links[key(t.r, t.c)]){ x.fillRect(tx0, yy + 1.5, tw, 0.8); } if (st.s){ x.fillRect(tx0, yy - size * 0.3, tw, 0.8); } });
      x.restore(); }
    for (const [bx, bd] of borders) for (const [side, e] of Object.entries(bd)){ if (!e) continue; x.strokeStyle = e.color || '#000'; x.lineWidth = (BW[e.style] || 0.75) / 0.75; x.setLineDash(/dash/.test(e.style) ? [4, 3] : e.style === 'dotted' ? [1, 2] : []); x.beginPath();
      const X1 = bx.x, X2 = bx.x + bx.w, Y1 = bx.y, Y2 = bx.y + bx.h; if (side === 't'){ x.moveTo(X1, Y1); x.lineTo(X2, Y1); } if (side === 'b'){ x.moveTo(X1, Y2); x.lineTo(X2, Y2); } if (side === 'l'){ x.moveTo(X1, Y1); x.lineTo(X1, Y2); } if (side === 'r'){ x.moveTo(X2, Y1); x.lineTo(X2, Y2); } x.stroke();
      if (e.style === 'double' && (side === 't' || side === 'b')){ x.lineWidth = 0.8; x.beginPath(); const yy = side === 'b' ? Y2 - 2.5 : Y1 + 2.5; x.moveTo(X1, yy); x.lineTo(X2, yy); x.stroke(); } x.setLineDash([]); }
    for (const sp of (s.sparks || [])){ if (sp.r < g.r1 || sp.r > g.r2 || sp.c < g.c1 || sp.c > g.c2 || !rh(sp.r) || !cw(sp.c)) continue; const svg = More.sparkSvg(More.sparkVals(s, sp), sp.type, sp.color, cw(sp.c), rh(sp.r)); if (!svg) continue; const im = await svgImg(svg); if (im) x.drawImage(im, L[sp.c], T[sp.r], cw(sp.c), rh(sp.r)); }
    if (withObj) for (const o of [...s.images, ...(s.shapes || []), ...s.charts]){ const ox = colX(o.c) + (o.dx || 0), oy = rowY(o.r) + (o.dy || 0); if (ox > W || oy > H || ox + o.w < 0 || oy + o.h < 0) continue;
      const im = o.shape ? await svgImg(More.shapeSvg(o, o.w, o.h)) : o.chart ? await svgImg(chartSvg({...o, data: chartData(s, o), fontSize: 11, colors: o.colors || XL_COLORS}, CHART_TH)) : await srcImg(Objects.mediaOf(o.src)); if (im) x.drawImage(im, ox, oy, o.w, o.h); }
    x.restore(); return H; }
  function wrapLines(x, text, w){ const out = []; for (const para of text.split('\n')){ let line = ''; for (const word of para.split(/(\s+)/)){ const t = line + word; if (x.measureText(t).width > w && line.trim()){ out.push(line.trimEnd()); line = word.trimStart(); } else line = t; } out.push(line); } return out; }
  async function makePdf(which){ const sheets = which === 'all' ? wb.sheets.filter(s => !s.hiddenSheet) : [Grid.G.sh]; const pages = sheets.flatMap(sheetPages); if (!pages.length) throw new Error('There’s nothing to print on ' + (which === 'all' ? 'these sheets' : 'this sheet') + ' yet.');
    if (pages.length > 300) throw new Error(`That would be ${pages.length} pages. Set a print area (Page Layout › Print Area) first.`);
    const doc = await PDFLib.PDFDocument.create(); doc.setTitle(wb.name); doc.setCreator('SRK Sheets'); const per = new Map(); pages.forEach(p => per.set(p.s, (per.get(p.s) || 0) + 1)); const idx = new Map();
    for (const p of pages){ busy(`Making PDF… page ${doc.getPageCount() + 1} of ${pages.length}`); idx.set(p.s, (idx.get(p.s) || 0) + 1); const cv = await drawPage(p, idx.get(p.s), per.get(p.s)); const jpg = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)); const img = await doc.embedJpg(await jpg.arrayBuffer()); const page = doc.addPage([p.PW, p.PH]); page.drawImage(img, {x: 0, y: 0, width: p.PW, height: p.PH}); await new Promise(r => setTimeout(r, 0)); }
    return doc.save(); }
  function printPdf(){ if (Grid.G.edit) Grid.commitEdit(); const s = Grid.G.sh; const pg = s.page = s.page || {};
    const which = h('select', {class: 'inp'}); which.append(h('option', {value: 'active'}, 'This sheet (' + s.name + ')'), h('option', {value: 'all'}, 'All sheets')); const ori = h('select', {class: 'inp'}); ori.append(h('option', {value: 'portrait'}, 'Portrait'), h('option', {value: 'landscape'}, 'Landscape')); ori.value = pg.orient || 'portrait';
    const size = h('select', {class: 'inp'}); size.append(h('option', {value: 'A4'}, 'A4'), h('option', {value: 'Letter'}, 'Letter')); size.value = pg.size || 'A4'; const fit = h('select', {class: 'inp'}); fit.append(h('option', {value: 'width'}, 'Fit all columns on one page'), h('option', {value: 'none'}, 'Actual size')); fit.value = pg.fit || 'width';
    const grid = h('input', {type: 'checkbox'}); grid.checked = !!pg.grid;
    const apply = () => { for (const x of which.value === 'all' ? wb.sheets : [s]){ x.page = {...(x.page || {}), orient: ori.value, size: size.value, fit: fit.value, grid: grid.checked}; } dirty(); };
    const run = async share => { apply(); try { const b = await makePdf(which.value); unbusy(); const blob = new Blob([b], {type: 'application/pdf'}); const n = cleanName(wb.name, 'pdf'); if (share) await shareFile(blob, n); else await saveFile(blob, n); } catch(e){ unbusy(); console.error(e); toast(e.message || 'Couldn’t make the PDF.', 4500); } };
    dialog('Print / save as PDF', h('div', {style: 'display:flex;flex-direction:column;gap:10px'}, UI.field('Print', which), h('div', {class: 'row2'}, UI.field('Orientation', ori), UI.field('Paper', size)), UI.field('Scaling', fit), h('label', {class: 'chkrow'}, grid, ' Print gridlines'), h('p', {class: 'hint'}, pg.area ? 'Print area: ' + rangeAddr(pg.area) : 'Prints everything that has data. To print part of a sheet, select it and use Page Layout › Print Area.')),
      [['Cancel'], ['Share', '', () => run(true)], ['Save PDF', 'primary', () => run(false)]]); }

  /* ---------------------------------------------------------------- file menu, info, theme */
  function fileMenu(){ if (Grid.G.edit) Grid.commitEdit(); UI.closePop(); const close = () => m.remove();
    const item = (icon, label, sub, fn) => h('button', {class: 'fm-item', type: 'button', onclick: () => { close(); fn(); }, html: FI(icon) + `<span>${label}<small>${sub}</small></span>`});
    const openItem = h('label', {class: 'fm-item filepick', html: FI('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') + '<span>Open<small>An Excel (.xlsx) or CSV file from your phone</small></span>'});
    const oi = h('input', {type: 'file', accept: '.xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv', class: 'fileover'}); oi.addEventListener('change', async () => { const f = oi.files[0]; close(); if (f){ await persist(); openFile(f); } }); openItem.append(oi);
    const share = '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4"/>';
    const m = h('div', {class: 'filemenu', role: 'dialog', 'aria-label': 'File'},
      h('header', {class: 'bar gut'}, h('button', {class: 'ib', type: 'button', 'aria-label': 'Close', onclick: close, html: FI('<path d="M15 18l-6-6 6-6"/>')}), h('b', {style: 'font-size:17px;padding-left:4px'}, 'File')),
      h('div', {class: 'fm-scroll gut'}, h('div', {class: 'fm-wrap'},
        item('<path d="M12 5v14M5 12h14"/>', 'New', 'Blank workbook or a template', () => goHome()), openItem, h('div', {class: 'fm-sep'}),
        item('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 'Save as Excel', 'An .xlsx file that opens in Excel and Google Sheets', () => saveXlsx(false)),
        item('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>', 'Save as OpenDocument (.ods)', 'For LibreOffice and other spreadsheet apps', () => saveOds(false)),
        item('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', 'Save this sheet as CSV', 'Plain values, for other apps', () => saveCsv(false)),
        item('<path d="M6 9V3h12v6M6 17H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>', 'Print / save as PDF', 'Pages for printing or sending', printPdf), h('div', {class: 'fm-sep'}),
        item(share, 'Share as Excel', 'Send to WhatsApp, Gmail or Drive', () => saveXlsx(true)), item(share, 'Share as PDF', 'Send the sheet as PDF pages', printPdf), item(share, 'Share as CSV', 'Send this sheet’s values', () => saveCsv(true)), h('div', {class: 'fm-sep'}),
        ...SRK_EXT.flatMap(x => x.fileItems ? x.fileItems((ic, label, sub, fn) => item(ic, label, sub, fn)) : []),
        item('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 'Rename', wb.name, () => { const inp = h('input', {class: 'inp', value: wb.name}); dialog('Rename workbook', inp, [['Cancel'], ['Rename', 'primary', () => { wb.name = inp.value.trim() || 'Book'; $('#docTitle').value = wb.name; dirty(); }]]); }),
        item('<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5M12 16v.5"/>', 'Make a copy', 'Duplicate this workbook', async () => { await persist(); const c = JSON.parse(JSON.stringify(wb)); c.id = uid(); c.name = wb.name + ' (copy)'; edit(c); dirty(); toast('Copy made'); }),
        item('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', 'Info', 'Sheets, cells and formulas', info),
        item('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 'Dark / light app', 'Switch the app colours', toggleTheme),
        item('<path d="M5 5l14 14M19 5L5 19"/>', 'Close', 'Back to your workbooks', () => goHome()))));
    document.body.append(m); }
  function info(){ let cells = 0, formulas = 0, charts = 0; for (const s of wb.sheets){ for (const k in s.cells){ cells++; if (s.cells[k].f != null) formulas++; } charts += s.charts.length; } const s = Grid.G.sh; const {R, C} = Calc.lastRC(s);
    const dl = h('dl', {class: 'stats'}); for (const [a, b] of [['Sheets', wb.sheets.length], ['Cells with data', cells], ['Formulas', formulas], ['Charts', charts], ['Tables', wb.sheets.reduce((n, x) => n + x.tables.length, 0)], ['This sheet’s used range', cells ? 'A1:' + addr(R, C) : '—'], ['Last changed', new Date(wb.updated || Date.now()).toLocaleString()]]) dl.append(h('dt', {}, a), h('dd', {}, String(b)));
    dialog(wb.name, dl, [['Close', 'primary']]); }
  function toggleTheme(){ const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('srk-sheets-theme', r.dataset.theme); } catch(e){} }

  /* ---------------------------------------------------------------- boot */
  function boot(){
    try { const t = localStorage.getItem('srk-sheets-theme'); if (t) document.documentElement.dataset.theme = t; } catch(e){}
    $('#homeBtn').addEventListener('click', goHome); $('#saveBtn').addEventListener('click', () => saveXlsx(false));
    $('#docTitle').addEventListener('change', () => { if (!wb) return; wb.name = $('#docTitle').value.trim() || 'Book'; $('#docTitle').value = wb.name; dirty(); });
    $('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
    addEventListener('popstate', () => { if (document.querySelector('.filemenu')){ document.querySelector('.filemenu').remove(); try { history.pushState({srk: 'edit'}, ''); } catch(e){} return; } if (document.querySelector('.dlg-back')){ document.querySelectorAll('.dlg-back').forEach(d => d.remove()); try { history.pushState({srk: 'edit'}, ''); } catch(e){} return; } if (wb) goHome(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && wb) persist(); }); addEventListener('pagehide', () => { if (wb) persist(); });
    addEventListener('resize', () => { if (wb) Grid.refresh(false); });
    renderStart();
    if (window.SRK_NATIVE && window.SRKSheets && SRKSheets.pendingIncoming){ try { const n = SRKSheets.pendingIncoming(); if (n) window.srkOpenIncoming(n); } catch(e){} }
  }
  setTimeout(boot, 0);
  return {openBook: b => { edit(b); dirty(); }, saveFile, shareFile, needExcel, needSheetJS, dirty, fileMenu, imageToData, printPdf, importCsv, info, toggleTheme, saveXlsx, saveCsv, makeXlsx, makePdf, openBytes, Store, get wb(){ return wb; }, TEMPLATES};
})();
