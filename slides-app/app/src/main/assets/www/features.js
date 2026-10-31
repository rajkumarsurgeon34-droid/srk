/* SRK Slides — PowerPoint features: charts, icons, SmartArt, symbols, links, header & footer, reuse slides,
   draw, animations, transitions, picture tools, effects, review, slide sorter, outline */
'use strict';
const Features = (() => {
  const A = () => Editor.api; const $ = (s, r = document) => r.querySelector(s);
  const h = (...a) => A().h(...a);
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    chart: S('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), icons: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01"/>'),
    smart: S('<rect x="2" y="9" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="16" y="15" width="6" height="6" rx="1"/><path d="M8 12h4M12 6v12M12 6h4M12 18h4"/>'),
    symbol: S('<path d="M5 19h4v-2a7 7 0 1 1 6 0v2h4"/>'), link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    hf: S('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17h4M15 17h2"/>'), num: S('<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>'), date: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    reuse: S('<rect x="2" y="7" width="13" height="10" rx="1.5"/><path d="M9 4h11a1.5 1.5 0 0 1 1.5 1.5V14"/>'), find: S('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    painter: S('<rect x="4" y="3" width="14" height="6" rx="1.5"/><path d="M18 6h2v5h-8v3M11 14h2v7h-2z"/>'), selAll: S('<path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
    multi: S('<rect x="3" y="3" width="10" height="10" rx="1.5"/><rect x="11" y="11" width="10" height="10" rx="1.5" stroke-dasharray="3 2"/>'), group: S('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M1.5 1.5h3M1.5 1.5v3M22.5 22.5h-3M22.5 22.5v-3"/>'),
    ungroup: S('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'), distH: S('<path d="M3 4v16M21 4v16"/><rect x="9" y="8" width="6" height="8" rx="1"/>'), distV: S('<path d="M4 3h16M4 21h16"/><rect x="8" y="9" width="8" height="6" rx="1"/>'),
    spacing: S('<path d="M11 6h10M11 12h10M11 18h10M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2"/>'), caseI: S('<path d="M3 18l4-11 4 11M4.5 14h5M15 11.5a2.5 2.5 0 1 1 0 5h0a2.5 2.5 0 0 1 0-5zM20 11v6"/>'), tshadow: S('<path d="M5 6h10M10 6v12" opacity=".35" transform="translate(2 2)"/><path d="M5 6h10M10 6v12"/>'),
    cols: S('<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>'), autofit: S('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5M15 15l3 3M18 15v3h-3"/>'),
    alpha: S('<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" fill-opacity=".35" stroke="none"/>'), shadow: S('<rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M8 20h12V8" opacity=".5"/>'), glow: S('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="2.5" y="2.5" width="19" height="19" rx="4" opacity=".4"/>'),
    grad: S('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15L15 3M3 21L21 3M9 21L21 9" opacity=".6"/>'), crop: S('<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>'), mask: S('<circle cx="12" cy="12" r="9"/><rect x="7" y="7" width="10" height="10" rx="1" opacity=".5"/>'),
    border: S('<rect x="3" y="3" width="18" height="18" rx="2" stroke-width="3"/>'), adjust: S('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" opacity=".5"/>'), alt: S('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15l2.5-6 2.5 6M7.8 13h3.4M15 9v6h3"/>'),
    tstyle: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18" stroke-width="3.5"/><path d="M3 14h18M10 9v11" opacity=".5"/>'), cellfill: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><rect x="10" y="9.5" width="6" height="5" fill="currentColor" stroke="none"/>'),
    pen: S('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'), hiliter: S('<path d="M9 15l-3 3h6l1-1M14.5 4.5l5 5L12 17l-5-5z"/>'), eraser: S('<path d="M7 20h13M5 15l9-9 5 5-8 8H8z"/>'), cursor: S('<path d="M5 3l14 7-6 2-2 6z"/>'),
    data: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 4v16"/>'), legend: S('<rect x="3" y="5" width="4" height="4"/><rect x="3" y="15" width="4" height="4"/><path d="M10 7h11M10 17h11"/>'), labels: S('<path d="M5 20V12M12 20V6M19 20v-9"/><path d="M3.5 9h3M10.5 3h3M17.5 8h3"/>'),
    title: S('<path d="M5 5h14M12 5v14"/>'), palette: S('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/>'),
    anim: S('<path d="M4 12a8 8 0 0 1 8-8M4 12a8 8 0 0 0 8 8"/><path d="M14 8l4 4-4 4" /><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'), preview: S('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>'), pane: S('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M14 4v16M17 8h1M17 12h1M17 16h1"/>'),
    clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), hide: S('<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7 0 .9-.7 2.3-2 3.7M6.5 6.6C4.4 8 3 10.2 3 12c0 2 4 7 9 7 1.5 0 2.9-.4 4.1-1"/>'),
    loop: S('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'), presenter: S('<rect x="2" y="4" width="13" height="9" rx="1"/><path d="M17 6h5M17 10h5M17 14h5M2 17h13M2 20h9"/>'),
    sorter: S('<rect x="3" y="3" width="8" height="6" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="3" y="13" width="8" height="6" rx="1"/><rect x="13" y="13" width="8" height="6" rx="1"/>'), outline: S('<path d="M4 6h3M4 12h3M4 18h3M10 6h10M12 12h8M12 18h8"/>'),
    gridI: S('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'), normal: S('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M3 20h18"/>'), spell: S('<path d="M4 16l4-11 4 11M5.5 12h5M14 13l3 3 5-6"/>'), count: S('<path d="M4 7h16M4 12h10M4 17h7"/>'),
    morph: S('<circle cx="7" cy="12" r="4"/><rect x="13" y="8" width="8" height="8" rx="1"/><path d="M11 12h2" stroke-dasharray="1 2"/>'),
  };
  const toast = m => A().toast(m);
  const dialog = (title, body, actions) => App.dialog(title, body, actions);

  /* ================================================================ CHARTS */
  function insertChart(type){
    const a = A(), W = a.E.deck.size.w, H = a.E.deck.size.h;
    const o = {id: uid(), kind: 'chart', chart: type, data: newChartData(type), title: '', legend: true, labels: type === 'pie' || type === 'doughnut', x: Math.round(W * .12), y: Math.round(H * .22), w: Math.round(W * .76), h: Math.round(H * .66), rot: 0};
    a.addObj(o); a.E.tab = 'chart'; a.buildTabs(); chartEditor(o);
  }
  function chartPicker(anchor, onPick){
    A().pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Chart type')); const g = h('div', {class: 'chartgrid'});
      const th = A().th();
      for (const [k, n] of CHART_TYPES){ const demo = {id: 'x', kind: 'chart', chart: k, data: newChartData(k), legend: false, labels: false, w: 120, h: 72, fontSize: 7};
        const b = h('button', {type: 'button', title: n}, h('span', {class: 'cmini', html: chartSvg(demo, th)}), n); b.addEventListener('click', () => { A().closePop(); onPick(k); }); g.append(b); }
      p.append(g); });
  }
  function chartEditor(o){
    const a = A(); const d = JSON.parse(JSON.stringify(o.data));
    const wrap = h('div', {class: 'cedit'});
    const typeSel = h('select', {class: 'inp', 'aria-label': 'Chart type'}); CHART_TYPES.forEach(([k, n]) => typeSel.append(h('option', {value: k}, n))); typeSel.value = o.chart;
    const titleIn = h('input', {class: 'inp', placeholder: 'Chart title (optional)', value: o.title || '', 'aria-label': 'Chart title'});
    const lg = h('input', {type: 'checkbox'}); lg.checked = o.legend !== false; const lb = h('input', {type: 'checkbox'}); lb.checked = !!o.labels;
    const grid = h('div', {class: 'cgrid'});
    const draw = () => {
      grid.innerHTML = ''; const t = h('table'); const hr = t.insertRow(); hr.insertCell().textContent = '';
      d.series.forEach((s, si) => { const c = hr.insertCell(); const i = h('input', {value: s.name, 'aria-label': `Series ${si + 1} name`}); i.addEventListener('input', () => s.name = i.value); c.append(i); });
      d.labels.forEach((lab, li) => { const r = t.insertRow(); const c0 = r.insertCell(); const i = h('input', {value: lab, 'aria-label': `Category ${li + 1}`}); i.addEventListener('input', () => d.labels[li] = i.value); c0.append(i);
        d.series.forEach((s, si) => { const c = r.insertCell(); const v = h('input', {value: s.values[li] ?? '', inputmode: 'decimal', 'aria-label': `${s.name}, ${lab}`}); v.addEventListener('input', () => s.values[li] = v.value === '' ? 0 : +v.value || 0); c.append(v); }); });
      grid.append(t);
    };
    const btn = (label, fn) => { const b = h('button', {class: 'btn sm', type: 'button'}, label); b.addEventListener('click', () => { fn(); draw(); }); return b; };
    draw();
    wrap.append(h('label', {class: 'f'}, 'Type', typeSel), h('label', {class: 'f'}, 'Title', titleIn), h('div', {class: 'chk'}, h('label', {}, lg, ' Legend'), h('label', {}, lb, ' Data labels')),
      h('div', {class: 'f', style: 'font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)'}, 'Data'), grid,
      h('div', {class: 'gradrow'}, btn('+ Row', () => { d.labels.push('Item ' + (d.labels.length + 1)); d.series.forEach(s => s.values.push(0)); }), btn('− Row', () => { if (d.labels.length > 1){ d.labels.pop(); d.series.forEach(s => s.values.pop()); } }),
        btn('+ Series', () => d.series.push({name: 'Series ' + (d.series.length + 1), values: d.labels.map(() => 0)})), btn('− Series', () => { if (d.series.length > 1) d.series.pop(); })),
      h('p', {class: 'hint'}, 'Pie and doughnut charts use the first series.'));
    dialog('Chart data', wrap, [['Cancel'], ['Apply', 'primary', () => { o.chart = typeSel.value; o.title = titleIn.value.trim(); o.legend = lg.checked; o.labels = lb.checked; o.data = d; a.updateObjEl(o); a.drawSel(); a.commit(); a.refreshThumb(); a.buildRibbon(); }]]);
  }

  /* ================================================================ ICONS */
  const ICONS = {
    heart: '<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z"/>', pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    stethoscope: '<path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>', pill: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M9.2 9.2l5.6 5.6"/>',
    syringe: '<path d="M18 2l4 4M20 4l-9 9M7 13l4 4M3 21l3-3M9 11l4 4-5 5-4-4z"/>', cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>', hospital: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 7v6M9 10h6M9 21v-4h6v4"/>',
    microscope: '<path d="M6 21h12M8 21a6 6 0 0 1 4-11M10 6l3-3 3 3-3 3zM12 8l-2 6 2 1 2-6"/>', dna: '<path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12M8 7h8M8 17h8M10 12h4"/>',
    brain: '<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 5 3.5 3.5 0 0 0 4 5 3 3 0 0 0 4 1zM12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 5 3.5 3.5 0 0 1-4 5 3 3 0 0 1-4 1z"/>',
    lungs: '<path d="M12 4v8M12 12c-1 1-3 1-4 0M12 12c1 1 3 1 4 0M8 7C5 8 3 13 3 17c0 2 2 3 4 2l2-2V8zM16 7c3 1 5 6 5 10 0 2-2 3-4 2l-2-2V8z"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    thermometer: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>', scalpel: '<path d="M3 21l8-8M11 13l9-9c1 2 0 5-3 7l-4 3z"/>', clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/>',
    doctor: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0M15 16v4M13 18h4"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check: '<path d="M4 12l5 5L20 6"/>', checklist: '<path d="M3 6l2 2 3-3M3 13l2 2 3-3M3 20l2 2 3-3M11 7h10M11 14h10M11 21h10"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>', warning: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>', question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    barchart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', piechart: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>', trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>', money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', home: '<path d="M3 11l9-7 9 7v10H3zM9 21v-6h6v6"/>', phone: '<path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', location: '<path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>', star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
    flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>', trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>', book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v15h-7"/>',
    graduation: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6"/>', rocket: '<path d="M12 15l-3-3c1-5 5-9 11-9 0 6-4 10-9 11zM9 12l-4 1 2-4h4M12 15l-1 4 4-2v-4M6 18c-1 1-2 3-2 3s2-1 3-2"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    handshake: '<path d="M2 12l4-4 4 2 4-3 4 1 4 4M6 8v6l4 4 2-1 2 2 4-4M10 14l2 2"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', arrowR: '<path d="M4 12h16M14 6l6 6-6 6"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  };
  function iconSrc(key, color){ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`); }
  function iconPicker(anchor){
    A().pop(anchor, p => { p.classList.add('iconpop'); const q = h('input', {class: 'inp', type: 'search', placeholder: 'Search icons', 'aria-label': 'Search icons', style: 'margin-bottom:6px'}); const g = h('div', {class: 'icongrid'});
      const draw = () => { g.innerHTML = ''; const s = q.value.trim().toLowerCase(); for (const k of Object.keys(ICONS)) if (!s || k.includes(s)){ const b = h('button', {type: 'button', title: k, 'aria-label': k, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`}); b.addEventListener('click', () => { A().closePop(); insertIcon(k); }); g.append(b); } };
      q.addEventListener('input', draw); draw(); p.append(q, g); });
  }
  function insertIcon(key){ const a = A(), W = a.E.deck.size.w, H = a.E.deck.size.h, c = a.th().accent; a.addObj({id: uid(), kind: 'image', src: iconSrc(key, c), icon: key, iconColor: c, alt: key, x: Math.round(W / 2 - 50), y: Math.round(H / 2 - 50), w: 100, h: 100, rot: 0}); a.E.tab = 'picture'; a.buildTabs(); }

  /* ================================================================ SMARTART */
  const SMART = [['process', 'Basic process'], ['chevron', 'Chevron process'], ['cycle', 'Cycle'], ['list', 'Vertical list'], ['pyramid', 'Pyramid'], ['hierarchy', 'Hierarchy'], ['timeline', 'Timeline'], ['venn', 'Venn'], ['matrix', 'Matrix']];
  const SMART_SAMPLE = {process: 'Assess\nPlan\nOperate\nReview', chevron: 'Diagnose\nTreat\nFollow up', cycle: 'Plan\nDo\nCheck\nAct', list: 'History\nExamination\nInvestigations\nDiagnosis', pyramid: 'Meta-analysis\nRandomised trials\nCohort studies\nCase reports',
    hierarchy: 'Head of Department\nUnit 1\nUnit 2\nUnit 3', timeline: '2023\n2024\n2025\n2026', venn: 'Clinical\nResearch\nTeaching', matrix: 'Strengths\nWeaknesses\nOpportunities\nThreats'};
  function smartPicker(anchor){
    A().pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'SmartArt')); const g = h('div', {class: 'smartgrid'}); const th = A().th();
      for (const [k, n] of SMART){ const objs = smartObjs(k, SMART_SAMPLE[k].split('\n'), {x: 4, y: 4, w: 112, h: 60}, th, true); const prev = objs.map(o => `<g transform="translate(${o.x} ${o.y}) rotate(${o.rot || 0} ${o.w / 2} ${o.h / 2})"><path d="${geomPath(o.geom, o.w, o.h)}" fill="${o.fill || 'none'}" fill-opacity="${o.fx && o.fx.fillAlpha != null ? o.fx.fillAlpha : 1}" stroke="${o.line ? o.line.color : 'none'}"/></g>`).join('');
        const b = h('button', {type: 'button', title: n}, h('span', {class: 'smini', html: `<svg viewBox="0 0 120 68">${prev}</svg>`}), n); b.addEventListener('click', () => { A().closePop(); smartDialog(k, n); }); g.append(b); }
      p.append(g); });
  }
  function smartDialog(k, n){
    const ta = h('textarea', {class: 'inp', rows: 6, 'aria-label': 'Items, one per line', style: 'min-height:140px'}); ta.value = SMART_SAMPLE[k];
    dialog(n, h('div', {style: 'display:flex;flex-direction:column;gap:6px'}, h('p', {class: 'hint'}, k === 'hierarchy' ? 'First line is the top box; the rest go underneath.' : 'One item per line.'), ta),
      [['Cancel'], ['Insert', 'primary', () => { const items = ta.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12); if (!items.length) return false; const a = A(), W = a.E.deck.size.w, H = a.E.deck.size.h;
        const objs = smartObjs(k, items, {x: W * .08, y: H * .24, w: W * .84, h: H * .66}, a.th()); const g = uid(); objs.forEach(o => { o.group = g; o.id = uid(); });
        a.slide().objects.push(...objs); a.renderStage(); a.selectMany(objs.map(o => o.id)); a.commit(); a.refreshThumb(); }]]);
  }
  function smartObjs(k, items, box, th, preview){
    const n = items.length, pal = [th.accent, th.accent2 || th.accent, mix(th.accent, th.accent2 || th.accent, .5), shade(th.accent, .3), tint(th.accent2 || th.accent, .3)];
    const fs = preview ? 0 : Math.max(12, Math.min(22, box.h / (n + 2)));
    const B = (geom, x, y, w, hh, i, extra = {}) => ({kind: 'box', geom, fill: pal[i % pal.length], line: null, html: `<p style="text-align:center">${escA(items[i] || '')}</p>`, anchor: 'ctr', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh), rot: 0, style: {color: '#FFFFFF', size: fs, bold: true}, ...extra});
    const out = [];
    if (k === 'process'){ const gap = box.w * .04, w = (box.w - gap * (n - 1)) / n, hh = Math.min(box.h * .45, w * .7), y = box.y + (box.h - hh) / 2;
      items.forEach((_, i) => { out.push(B('roundRect', box.x + i * (w + gap), y, w, hh, i)); if (i < n - 1) out.push({kind: 'box', geom: 'rightArrow', fill: tint(th.accent, .55), line: null, html: '', x: Math.round(box.x + i * (w + gap) + w + gap * .15), y: Math.round(y + hh / 2 - gap * .35), w: Math.round(gap * .7), h: Math.round(gap * .7), rot: 0}); }); }
    else if (k === 'chevron'){ const w = box.w / n * 1.08, hh = Math.min(box.h * .4, w * .5), y = box.y + (box.h - hh) / 2; items.forEach((_, i) => out.push(B('chevron', box.x + i * w * .93, y, w, hh, i))); }
    else if (k === 'cycle'){ const cx = box.x + box.w / 2, cy = box.y + box.h / 2, R = Math.min(box.w, box.h) * .36, s = Math.min(box.w, box.h) * .3;
      items.forEach((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; out.push(B('ellipse', cx + Math.cos(a) * R - s / 2, cy + Math.sin(a) * R - s / 2, s, s, i)); });
      out.unshift({kind: 'box', geom: 'donut', fill: tint(th.accent, .75), line: null, html: '', x: Math.round(cx - R * 1.05), y: Math.round(cy - R * 1.05), w: Math.round(R * 2.1), h: Math.round(R * 2.1), rot: 0}); }
    else if (k === 'list'){ const gap = box.h * .04, hh = (box.h - gap * (n - 1)) / n; items.forEach((t, i) => { out.push(B('rect', box.x, box.y + i * (hh + gap), box.w * .1, hh, i, {html: `<p style="text-align:center">${i + 1}</p>`}));
      out.push({kind: 'box', geom: 'rect', fill: tint(pal[i % pal.length], .82), line: null, html: `<p>${escA(t)}</p>`, anchor: 'ctr', x: Math.round(box.x + box.w * .11), y: Math.round(box.y + i * (hh + gap)), w: Math.round(box.w * .89), h: Math.round(hh), rot: 0, style: {size: fs, color: shade(pal[i % pal.length], .5)}}); }); }
    else if (k === 'pyramid'){ const hh = box.h / n, cx = box.x + box.w / 2, maxW = Math.min(box.w, box.h * 1.4);
      items.forEach((_, i) => { const w0 = maxW * (i + .5) / n, w1 = maxW * (i + 1) / n; out.push(B(i === 0 ? 'triangle' : 'trapezoid', cx - w1 / 2, box.y + i * hh, w1, hh * .96, i, i === 0 ? {} : {})); }); }
    else if (k === 'hierarchy'){ const top = items[0], kids = items.slice(1), m = Math.max(1, kids.length), bw = Math.min(box.w * .3, box.w / m * .85), bh = box.h * .26, cx = box.x + box.w / 2;
      out.push(B('roundRect', cx - bw / 2, box.y, bw, bh, 0)); const gap = (box.w - bw * m) / (m + 1); const ly = box.y + bh + box.h * .12;
      out.push({kind: 'box', geom: 'line', fill: null, line: {color: th.text, width: 1.5}, html: '', x: Math.round(cx), y: Math.round(box.y + bh), w: 0.5, h: Math.round(box.h * .06), rot: 0});
      if (m > 1) out.push({kind: 'box', geom: 'line', fill: null, line: {color: th.text, width: 1.5}, html: '', x: Math.round(box.x + gap + bw / 2), y: Math.round(box.y + bh + box.h * .06), w: Math.round((m - 1) * (bw + gap)), h: 0, rot: 0});
      kids.forEach((_, i) => { const x = box.x + gap + i * (bw + gap); out.push({kind: 'box', geom: 'line', fill: null, line: {color: th.text, width: 1.5}, html: '', x: Math.round(x + bw / 2), y: Math.round(box.y + bh + box.h * .06), w: 0.5, h: Math.round(box.h * .06), rot: 0}); out.push(B('roundRect', x, ly, bw, bh, i + 1)); }); }
    else if (k === 'timeline'){ const y = box.y + box.h / 2; out.push({kind: 'box', geom: 'rect', fill: th.accent, line: null, html: '', x: Math.round(box.x), y: Math.round(y - 3), w: Math.round(box.w), h: 6, rot: 0});
      items.forEach((t, i) => { const x = box.x + box.w * (i + .5) / n, s = Math.min(box.h * .12, 28); out.push({kind: 'box', geom: 'ellipse', fill: pal[i % pal.length], line: {color: th.bg, width: 3}, html: '', x: Math.round(x - s / 2), y: Math.round(y - s / 2), w: Math.round(s), h: Math.round(s), rot: 0});
        out.push({kind: 'box', geom: 'rect', fill: null, line: null, html: `<p style="text-align:center">${escA(t)}</p>`, anchor: i % 2 ? 't' : 'b', x: Math.round(x - box.w / n / 2), y: Math.round(i % 2 ? y + s : box.y), w: Math.round(box.w / n), h: Math.round(box.h / 2 - s), rot: 0, style: {size: fs, bold: true, color: th.text}}); }); }
    else if (k === 'venn'){ const s = Math.min(box.w * .45, box.h * .62), cx = box.x + box.w / 2, cy = box.y + box.h / 2, pos = n <= 2 ? [[-.3, 0], [.3, 0]] : [[-.28, -.2], [.28, -.2], [0, .26]];
      items.slice(0, 3).forEach((_, i) => { const [dx, dy] = pos[i] || [0, 0]; out.push(B('ellipse', cx + dx * s - s / 2, cy + dy * s - s / 2, s, s, i, {fx: {fillAlpha: .6}})); }); }
    else if (k === 'matrix'){ const gap = 8, w = (box.w * .8 - gap) / 2, hh = (box.h - gap) / 2, x0 = box.x + box.w * .1; items.slice(0, 4).forEach((_, i) => out.push(B('roundRect', x0 + (i % 2) * (w + gap), box.y + Math.floor(i / 2) * (hh + gap), w, hh, i))); }
    if (preview) return out;
    return out;
  }

  /* ================================================================ SYMBOLS, LINKS, DATE, HEADER & FOOTER */
  const SYMBOLS = '± × ÷ ≈ ≠ ≤ ≥ ° µ ∞ √ ∑ ∆ π Ω α β γ δ θ λ σ ‰ → ← ↑ ↓ ↔ ⇒ ✓ ✗ • ★ ♥ © ® ™ € £ ₹ ¥ ½ ¼ ¾ ² ³ ¹ ₂ ₃ ♂ ♀ § ¶ … – —'.split(' ');
  function symbolPicker(anchor){ A().pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Symbols')); const g = h('div', {class: 'symgrid'}); for (const s of SYMBOLS){ const b = h('button', {type: 'button', title: s}, s); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('click', () => { A().closePop(); insertTextAtCaret(s); }); g.append(b); } p.append(g); }); }
  function insertTextAtCaret(txt){ const a = A(); if (a.E.editing){ a.restoreRange(); document.execCommand('insertText', false, txt); a.syncText(a.selObj(), a.editTarget()); return; }
    const W = a.E.deck.size.w, H = a.E.deck.size.h; a.addObj({id: uid(), kind: 'box', geom: 'rect', fill: null, line: null, html: `<p>${escA(txt)}</p>`, x: Math.round(W * .4), y: Math.round(H * .44), w: Math.round(W * .2), h: 50, rot: 0, anchor: 't', style: {size: 28}}); }
  function linkDialog(){
    const a = A(), o = a.selObj(); if (!o || !a.textual(o)){ toast('Select some text, or a text box, first'); return; }
    const sel = a.E.editing ? (a.restoreRange(), String(getSelection())) : ''; const url = h('input', {class: 'inp', type: 'url', placeholder: 'https://…', 'aria-label': 'Web address'}); const txt = h('input', {class: 'inp', placeholder: 'Text to show', value: sel, 'aria-label': 'Text to show'});
    const saved = a.E.savedRange;
    dialog('Insert link', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, h('label', {class: 'f'}, 'Address', url), a.E.editing && !sel ? h('label', {class: 'f'}, 'Text', txt) : null),
      [['Cancel'], ['Insert', 'primary', () => { let u = url.value.trim(); if (!u) return false; if (!/^[a-z]+:/i.test(u)) u = (u.includes('@') ? 'mailto:' : 'https://') + u;
        if (a.E.editing){ a.E.savedRange = saved; a.restoreRange(); if (sel) a.exec('createLink', u, false); else { document.execCommand('insertHTML', false, `<a href="${escA(u)}">${escA(txt.value.trim() || u)}</a>`); a.syncText(o, a.editTarget()); } }
        else { o.html = `<p><a href="${escA(u)}">${(o.html || '').replace(/<[^>]+>/g, '') || escA(u)}</a></p>`; a.updateObjEl(o); a.commit(); a.refreshThumb(); }
        toast('Link added. It opens when you tap it in the slide show.'); }]]);
  }
  function headerFooter(){
    const a = A(), d = a.E.deck, hf = d.hf || {};
    const cb = (lbl, on) => { const i = h('input', {type: 'checkbox'}); i.checked = !!on; return [i, h('label', {class: 'chkrow'}, i, ' ' + lbl)]; };
    const [num, numL] = cb('Slide number', hf.num), [dt, dtL] = cb('Date', hf.date), [ft, ftL] = cb('Footer', hf.text), [nt, ntL] = cb('Don’t show on title slide', hf.notTitle);
    const dtx = h('input', {class: 'inp', value: hf.dateText || new Date().toLocaleDateString(undefined, {day: 'numeric', month: 'long', year: 'numeric'}), 'aria-label': 'Date text'});
    const ftx = h('input', {class: 'inp', value: hf.text || '', placeholder: 'e.g. Department of Surgery', 'aria-label': 'Footer text'});
    dialog('Header & Footer', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, numL, dtL, dtx, ftL, ftx, ntL),
      [['Cancel'], ['Apply to all', 'primary', () => { d.hf = {num: num.checked, date: dt.checked, dateText: dtx.value.trim(), text: ft.checked ? (ftx.value.trim() || ' ') : '', notTitle: nt.checked}; a.renderAll(); a.commit(); }]]);
  }
  async function reuseSlides(file){
    const a = A(); let model; try { model = await readPptx(new Uint8Array(await file.arrayBuffer())); } catch(e){ toast(e.message || 'Couldn’t open that file'); return; }
    const deck = a.E.deck, kx = deck.size.w / model.size.w, ky = deck.size.h / model.size.h, k = Math.min(kx, ky);
    const tmp = {size: model.size, theme: 'custom', themeData: {name: 'x', bg: '#FFFFFF', title: '#1F1F1F', text: '#1F1F1F', accent: '#4472C4', accent2: '#ED7D31', head: model.fonts.head, body: model.fonts.body}, media: {}, slides: model.slides};
    const picks = new Set(model.slides.map((_, i) => i)); const g = h('div', {class: 'reusegrid'});
    model.slides.forEach((s, i) => { const m = h('div', {class: 'rumini'}); const b = h('button', {type: 'button', class: 'on'}, m, h('span', {}, String(i + 1))); b.addEventListener('click', () => { if (picks.has(i)) picks.delete(i); else picks.add(i); b.classList.toggle('on'); }); g.append(b); requestAnimationFrame(() => miniSlide(m, s, tmp)); });
    dialog('Reuse slides', h('div', {}, h('p', {class: 'hint', style: 'margin-bottom:8px'}, 'Tap slides to leave them out. The rest go after the current slide.'), g),
      [['Cancel'], ['Insert', 'primary', () => {
        const add = [...picks].sort((x, y) => x - y).map(i => { const s = JSON.parse(JSON.stringify(model.slides[i])); s.id = uid(); s.layout = null;
          if (s.bg && s.bg.image && s.bg.image.startsWith('data:')){ const id = uid(); deck.media[id] = s.bg.image; s.bg.image = 'm:' + id; }
          for (const o of s.objects){ o.id = uid(); o.x = Math.round(o.x * k + (deck.size.w - model.size.w * k) / 2); o.y = Math.round(o.y * k); o.w = Math.round(o.w * k); o.h = Math.round(o.h * k); if (o.style && o.style.size) o.style.size = Math.round(o.style.size * k);
            if (o.kind === 'image' && o.src && o.src.startsWith('data:')){ const id = uid(); deck.media[id] = o.src; o.src = 'm:' + id; } }
          return s; });
        deck.slides.splice(a.E.cur + 1, 0, ...add); a.renderAll(); a.goto(a.E.cur + 1); a.commit(); toast(`${add.length} slide${add.length === 1 ? '' : 's'} added`); }]]);
  }

  /* ================================================================ FIND & REPLACE */
  function findReplace(){
    const a = A(); a.endEdit && a.E.editing && a.endEdit();
    const f = h('input', {class: 'inp', placeholder: 'Find', 'aria-label': 'Find'}), r = h('input', {class: 'inp', placeholder: 'Replace with', 'aria-label': 'Replace with'}), mc = h('input', {type: 'checkbox'}), res = h('p', {class: 'hint'}, '');
    const re = () => { const s = f.value; if (!s) return null; return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), mc.checked ? 'g' : 'gi'); };
    const texts = () => { const out = []; a.E.deck.slides.forEach((s, si) => { s.objects.forEach(o => { if (o.kind === 'box' && o.html) out.push({si, o, key: 'html'}); if (o.kind === 'table') o.rows.forEach((row, ri) => row.forEach((c, ci) => out.push({si, o, row: ri, col: ci}))); }); if (s.notes) out.push({si, s, notes: true}); }); return out; };
    const textOf = t => t.notes ? t.s.notes : t.row != null ? t.o.rows[t.row][t.col] : t.o.html;
    const replIn = (html, rx, rep) => { const d = document.createElement('div'); d.innerHTML = html; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n, c = 0; while ((n = w.nextNode())){ const v = n.data.replace(rx, () => { c++; return rep; }); if (v !== n.data) n.data = v; } return [d.innerHTML, c]; };
    let last = -1;
    const findNext = () => { const rx = re(); if (!rx) return; const ts = texts(); const hits = ts.filter(t => { const d = document.createElement('div'); d.innerHTML = t.notes ? escA(t.s.notes) : textOf(t); rx.lastIndex = 0; return rx.test(d.textContent); });
      if (!hits.length){ res.textContent = 'Not found'; return; } const slides = [...new Set(hits.map(t => t.si))]; const nxt = slides.find(si => si > last) ?? slides[0]; last = nxt; a.goto(nxt); const hit = hits.find(t => t.si === nxt && t.o); if (hit) a.select(hit.o.id); res.textContent = `Found on ${slides.length} slide${slides.length === 1 ? '' : 's'} · showing slide ${nxt + 1}`; };
    const replaceAll = () => { const rx = re(); if (!rx) return; let total = 0; for (const t of texts()){ if (t.notes){ const before = t.s.notes; t.s.notes = before.replace(rx, () => { total++; return r.value; }); continue; } const [v, c] = replIn(textOf(t), rx, escA(r.value)); if (c){ total += c; if (t.row != null) t.o.rows[t.row][t.col] = v; else t.o.html = v; } }
      a.renderAll(); a.commit(); res.textContent = total ? `Replaced ${total} time${total === 1 ? '' : 's'}` : 'Not found'; };
    const fb = h('button', {class: 'btn sm', type: 'button'}, 'Find next'); fb.addEventListener('click', findNext);
    const rb = h('button', {class: 'btn sm', type: 'button'}, 'Replace all'); rb.addEventListener('click', replaceAll);
    f.addEventListener('keydown', e => { if (e.key === 'Enter') findNext(); });
    dialog('Find and replace', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, f, r, h('label', {class: 'chkrow'}, mc, ' Match case'), h('div', {class: 'gradrow'}, fb, rb), res), [['Close', 'primary']]);
  }

  return {IC, ICONS, iconSrc, insertChart, chartPicker, chartEditor, iconPicker, smartPicker, symbolPicker, insertTextAtCaret, linkDialog, headerFooter, reuseSlides, findReplace};
})();
