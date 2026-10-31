/* SRK Slides — themes, layouts, shapes, slide renderer, templates */
'use strict';
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------------------------------------------------------- layouts */
const LAYOUTS = [
  {key: 'title', name: 'Title slide'}, {key: 'content', name: 'Title and content'}, {key: 'section', name: 'Section header'},
  {key: 'two', name: 'Two content'}, {key: 'compare', name: 'Comparison'}, {key: 'titleOnly', name: 'Title only'},
  {key: 'caption', name: 'Picture with caption'}, {key: 'blank', name: 'Blank'},
];
const PROMPTS = {title: 'Tap to add title', subtitle: 'Tap to add subtitle', body: 'Tap to add text', caption: 'Tap to add caption'};
function phBox(ph, x, y, w, h, extra = {}){
  return {id: uid(), kind: 'box', geom: 'rect', fill: null, line: null, html: '', ph, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot: 0,
    anchor: ph === 'title' ? 'b' : 't', style: {}, ...extra};
}
function layoutObjects(layout, size, th){
  const W = size.w, H = size.h, L = (th && th.lay) || DEFAULT_LAY, [il, ir, it, ib] = L.ins, T = L.title;
  const l = W * il, cw = W - W * il - W * ir, top = H * it, bot = H - H * ib, ct = L.ct ? {color: L.ct} : {};
  const tTitle = (size0) => ({style: {size: size0, ...(T.tc ? {color: T.tc} : {})}, ...(T.align ? {align: T.align} : {})});
  const tSub = (size0) => ({style: {size: size0, ...(T.sc ? {color: T.sc} : {})}, ...(T.align ? {align: T.align} : {})});
  const bodyY = top + H * 0.2, bodyH = bot - bodyY;
  switch (layout){
    case 'title': return [phBox('title', W * T.x, H * T.y, W * T.w, H * T.h, tTitle(50)), phBox('subtitle', W * T.x, H * T.sy, W * T.w, H * T.sh, tSub(24))];
    case 'section': return [phBox('title', W * T.x, H * (T.y + .04), W * T.w, H * (T.h - .06), tTitle(44)), phBox('subtitle', W * T.x, H * T.sy, W * T.w, H * T.sh, tSub(20))];
    case 'content': return [phBox('title', l, top, cw, H * 0.15, {style: {...ct}}), phBox('body', l, bodyY, cw, bodyH, {bullets: true})];
    case 'two': return [phBox('title', l, top, cw, H * 0.15, {style: {...ct}}), phBox('body', l, bodyY, cw / 2 - 10, bodyH, {bullets: true}), phBox('body', l + cw / 2 + 10, bodyY, cw / 2 - 10, bodyH, {bullets: true})];
    case 'compare': return [phBox('title', l, top, cw, H * 0.15, {style: {...ct}}),
      phBox('body', l, bodyY - H * .01, cw / 2 - 10, H * 0.09, {style: {size: 22, bold: true}, prompt: 'Heading'}), phBox('body', l, bodyY + H * .09, cw / 2 - 10, bodyH - H * .09, {bullets: true}),
      phBox('body', l + cw / 2 + 10, bodyY - H * .01, cw / 2 - 10, H * 0.09, {style: {size: 22, bold: true}, prompt: 'Heading'}), phBox('body', l + cw / 2 + 10, bodyY + H * .09, cw / 2 - 10, bodyH - H * .09, {bullets: true})];
    case 'titleOnly': return [phBox('title', l, top, cw, H * 0.15, {style: {...ct}})];
    case 'caption': return [phBox('title', l, top + H * .05, cw * 0.36, H * 0.2, {style: {size: 28, ...ct}}), phBox('body', l, top + H * .29, cw * 0.36, bot - top - H * .32, {style: {size: 16}, prompt: PROMPTS.caption}),
      {id: uid(), kind: 'box', geom: 'rect', fill: '#E9ECF3', line: null, html: '<p style="text-align:center">Insert › Picture to add a photo</p>', anchor: 'ctr', x: Math.round(l + cw * 0.42), y: Math.round(top + H * .04), w: Math.round(cw * 0.58), h: Math.round(bot - top - H * .06), rot: 0, style: {size: 14, color: '#6B7390'}, picSlot: true}];
    default: return [];
  }
}
function newSlide(layout, deck){ return {id: uid(), layout, bg: null, transition: 'none', notes: '', objects: layoutObjects(layout, deck.size, themeOf(deck))}; }

/* ---------------------------------------------------------------- shapes */
const SHAPES = [
  ['rect', 'Rectangle'], ['roundRect', 'Rounded rectangle'], ['ellipse', 'Oval'], ['triangle', 'Triangle'], ['rtTriangle', 'Right triangle'], ['diamond', 'Diamond'],
  ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['star5', 'Star'], ['heart', 'Heart'],
  ['rightArrow', 'Right arrow'], ['leftArrow', 'Left arrow'], ['upArrow', 'Up arrow'], ['downArrow', 'Down arrow'], ['chevron', 'Chevron'], ['plus', 'Plus'],
  ['donut', 'Ring'], ['wedgeRoundRectCallout', 'Speech bubble'], ['cloud', 'Cloud'], ['flowChartDecision', 'Decision'], ['line', 'Line'], ['flowChartProcess', 'Process'],
];
function geomPath(g, w, h){
  const P = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  const m = Math.min(w, h);
  switch (g){
    case 'roundRect': { const r = m * 0.16; return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; }
    case 'ellipse': return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`;
    case 'triangle': return P([[w / 2, 0], [w, h], [0, h]]);
    case 'rtTriangle': return P([[0, 0], [w, h], [0, h]]);
    case 'diamond': case 'flowChartDecision': return P([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'parallelogram': { const a = m * 0.25; return P([[a, 0], [w, 0], [w - a, h], [0, h]]); }
    case 'trapezoid': { const a = m * 0.25; return P([[a, 0], [w - a, 0], [w, h], [0, h]]); }
    case 'hexagon': { const a = m * 0.25; return P([[a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h], [0, h / 2]]); }
    case 'octagon': { const a = m * 0.29; return P([[a, 0], [w - a, 0], [w, a], [w, h - a], [w - a, h], [a, h], [0, h - a], [0, a]]); }
    case 'star5': { const pts = []; for (let i = 0; i < 10; i++){ const R = i % 2 ? 0.38 : 0.5, t = -Math.PI / 2 + i * Math.PI / 5; pts.push([w / 2 + Math.cos(t) * R * w, h * 0.55 + Math.sin(t) * R * h * 1.05]); } return P(pts); }
    case 'heart': return `M${w / 2} ${h * 0.25}C${w * 0.5} ${h * 0.05} ${w * 0.05} ${-h * 0.02} ${w * 0.02} ${h * 0.32}C0 ${h * 0.55} ${w * 0.3} ${h * 0.75} ${w / 2} ${h}C${w * 0.7} ${h * 0.75} ${w} ${h * 0.55} ${w * 0.98} ${h * 0.32}C${w * 0.95} ${-h * 0.02} ${w * 0.5} ${h * 0.05} ${w / 2} ${h * 0.25}Z`;
    case 'rightArrow': { const a = Math.min(w * 0.5, h * 0.5), t = h * 0.25; return P([[0, t], [w - a, t], [w - a, 0], [w, h / 2], [w - a, h], [w - a, h - t], [0, h - t]]); }
    case 'leftArrow': { const a = Math.min(w * 0.5, h * 0.5), t = h * 0.25; return P([[w, t], [a, t], [a, 0], [0, h / 2], [a, h], [a, h - t], [w, h - t]]); }
    case 'upArrow': { const a = Math.min(h * 0.5, w * 0.5), t = w * 0.25; return P([[t, h], [t, a], [0, a], [w / 2, 0], [w, a], [w - t, a], [w - t, h]]); }
    case 'downArrow': { const a = Math.min(h * 0.5, w * 0.5), t = w * 0.25; return P([[t, 0], [t, h - a], [0, h - a], [w / 2, h], [w, h - a], [w - t, h - a], [w - t, 0]]); }
    case 'chevron': { const a = Math.min(w * 0.5, h * 0.5); return P([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h], [a, h / 2]]); }
    case 'plus': { const a = m * 0.25; return `M${a} 0H${w - a}V${a}H${w}V${h - a}H${w - a}V${h}H${a}V${h - a}H0V${a}H${a}Z`; }
    case 'donut': { const t = m * 0.25; return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}ZM${t} ${h / 2}A${w / 2 - t} ${h / 2 - t} 0 1 1 ${w - t} ${h / 2}A${w / 2 - t} ${h / 2 - t} 0 1 1 ${t} ${h / 2}Z`; }
    case 'wedgeRoundRectCallout': { const r = m * 0.12, hb = h * 0.8; return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${hb - r}A${r} ${r} 0 0 1 ${w - r} ${hb}H${w * 0.42}L${w * 0.2} ${h}L${w * 0.25} ${hb}H${r}A${r} ${r} 0 0 1 0 ${hb - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; }
    case 'cloud': { const c = (x, y) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`; return `M${c(.2, .85)}A${.17 * w} ${.17 * h} 0 0 1 ${c(.12, .45)}A${.2 * w} ${.2 * h} 0 0 1 ${c(.38, .18)}A${.2 * w} ${.22 * h} 0 0 1 ${c(.7, .15)}A${.18 * w} ${.2 * h} 0 0 1 ${c(.9, .45)}A${.16 * w} ${.2 * h} 0 0 1 ${c(.8, .88)}A${.2 * w} ${.16 * h} 0 0 1 ${c(.5, .92)}A${.18 * w} ${.14 * h} 0 0 1 ${c(.2, .85)}Z`; }
    case 'line': return `M0 0L${w} ${h}`;
    default: return `M0 0H${w}V${h}H0Z`;
  }
}
function shapeIcon(g){ return `<svg viewBox="-2 -2 28 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="${geomPath(g, 24, g === 'line' ? 16 : 16)}"/></svg>`; }

/* ---------------------------------------------------------------- resolved style */
function defSize(o){ return o.ph === 'title' ? 40 : o.ph === 'subtitle' ? 24 : o.ph === 'body' ? 24 : 18; }
function resolve(o, th){
  const s = o.style || {};
  return {font: s.font || (o.ph === 'title' ? th.head : th.body), size: s.size || defSize(o), color: s.color || (o.ph === 'title' ? th.title : th.text), bold: !!s.bold, accent: th.accent, border: isDark(th.bg) ? tint(th.accent, .2) : '#BFBFBF', italic: !!s.italic};
}
function slideBg(slide, deck){ if (slide.bg) return slide.bg; const th = themeOf(deck); return {color: th.bg}; }
function mediaSrc(deck, src){ return src && src.startsWith('m:') ? (deck.media || {})[src.slice(2)] || '' : src || ''; }

/* ---------------------------------------------------------------- renderer */
const escA = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function objTransform(o){ const t = []; if (o.rot) t.push(`rotate(${o.rot}deg)`); if (o.flipH) t.push('scaleX(-1)'); if (o.flipV) t.push('scaleY(-1)'); return t.join(' '); }
function renderObj(o, deck, th, opts = {}){
  const el = document.createElement('div'); el.className = 'obj'; el.dataset.id = o.id;
  el.style.cssText = `left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${Math.max(o.h, 0)}px;transform:${objTransform(o)}`;
  if (o.kind === 'image'){ const im = document.createElement('img'); im.src = mediaSrc(deck, o.src); im.alt = ''; im.draggable = false; el.appendChild(im); return el; }
  const st = resolve(o, th);
  const font = `font-family:${fontStack(st.font)};font-size:${st.size}px;color:${st.color};${st.bold ? 'font-weight:700;' : ''}${st.italic ? 'font-style:italic;' : ''}`;
  if (o.kind === 'table'){
    const tb = document.createElement('table'); tb.style.cssText = font + `font-size:${o.size || 14}px;--tb:${st.border}`;
    o.rows.forEach((r, ri) => { const tr = tb.insertRow(); if (o.header && ri === 0) tr.className = 'hd';
      r.forEach((c, ci) => { const td = tr.insertCell(); td.innerHTML = c || ''; ensureFontsIn(c); const f = (o.fills && o.fills[ri] && o.fills[ri][ci]) || (o.header && ri === 0 ? st.accent : (o.band && ri % 2 === 0 ? 'color-mix(in srgb,' + st.accent + ' 12%, transparent)' : null)); if (f) td.style.background = f; if (o.header && ri === 0) td.style.color = '#FFFFFF'; }); });
    el.appendChild(tb); el.style.height = 'auto'; return el;
  }
  // box
  if (o.fill || o.line || o.geom === 'line'){
    const sw = o.line ? o.line.width || 1 : 0;
    const svg = `<svg class="geo" viewBox="0 0 ${Math.max(o.w, 0.01)} ${Math.max(o.h, 0.01)}" preserveAspectRatio="none"><path d="${geomPath(o.geom, o.w, o.h)}" fill="${o.fill || 'none'}" stroke="${o.line ? o.line.color : 'none'}" stroke-width="${sw}" vector-effect="non-scaling-stroke"${o.line && o.line.dash ? ' stroke-dasharray="6 4"' : ''}/></svg>`;
    el.insertAdjacentHTML('beforeend', svg);
  }
  if (o.geom !== 'line' && !o.deco){
    const hasText = !!(o.html && o.html.replace(/<[^>]+>/g, '').replace(/ /g, ' ').trim());
    if (o.ph && !hasText) el.classList.add('ph-empty');
    const tx = document.createElement('div'); tx.className = 'tx'; tx.dataset.a = o.anchor || 't';
    if (o.vert){ tx.style.writingMode = 'vertical-rl'; }
    const tc = document.createElement('div'); tc.className = 'tc'; tc.style.cssText = font + (o.ph === 'title' || o.ph === 'subtitle' ? 'line-height:1.1;' : '');
    if (o.align) tc.style.textAlign = o.align;
    tc.innerHTML = hasText ? o.html : (o.html && !o.ph ? o.html : ''); ensureFontsIn(o.html);
    if (o.ph) tc.dataset.prompt = o.prompt || PROMPTS[o.ph] || PROMPTS.body;
    tx.appendChild(tc); el.appendChild(tx);
  }
  return el;
}
function renderSlide(slide, deck, opts = {}){
  const th = slideTheme(deck, slide); const W = deck.size.w, H = deck.size.h;
  const el = document.createElement('div'); el.className = 'slide' + (opts.edit ? '' : ' noprompt');
  el.style.width = W + 'px'; el.style.height = H + 'px';
  el.style.background = bgCss(slideBg(slide, deck), deck);
  const tone = bgTone(slide.bg && !slide.bg.image ? slide.bg : null, th); el.style.setProperty('--bullet', Math.abs(lum(th.accent) - lum(tone)) < 0.18 ? th.text : th.accent);
  const art = decoSvg(deck, slide); if (art) el.insertAdjacentHTML('beforeend', art);
  for (const o of slide.objects){ if (!opts.edit && o.picSlot) continue; el.appendChild(renderObj(o, deck, th, opts)); }
  return el;
}
/* scaled, non-interactive copy of a slide inside `host` (thumbnails, templates) */
function miniSlide(host, slide, deck){
  host.innerHTML = ''; const el = renderSlide(slide, deck, {edit: false});
  const fit = () => { const w = host.clientWidth || 160; el.style.transform = `scale(${w / deck.size.w})`; };
  host.appendChild(el); fit(); if (!host.clientWidth) requestAnimationFrame(fit);
  return el;
}

/* ---------------------------------------------------------------- templates */
const ul = items => '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
function fill(slide, ...htmls){ let k = 0; for (const o of slide.objects) if (o.ph && k < htmls.length){ const h = htmls[k++]; if (h != null) o.html = h.startsWith('<') ? h : `<p>${escA(h)}</p>`; } return slide; }
function makeDeck(name, theme, build){
  const deck = {id: uid(), name, theme, size: {w: 960, h: 540}, media: {}, slides: [], updated: Date.now()};
  const add = (layout, ...htmls) => { const s = newSlide(layout, deck); fill(s, ...htmls); deck.slides.push(s); return s; };
  if (build) build(add, deck);
  if (!deck.slides.length) add('title');
  return deck;
}
function tableObj(deck, rows, x, y, w, extra = {}){ return {id: uid(), kind: 'table', x, y, w, h: rows.length * 30, rot: 0, rows: rows.map(r => r.map(c => `<p>${escA(c)}</p>`)), header: true, band: true, size: 15, ...extra}; }
const TEMPLATES = [
  {key: 'blank', name: 'Blank presentation', sub: 'Office theme', make: () => makeDeck('Presentation', 'office')},
  {key: 'case', name: 'Case presentation', sub: 'Clinical case for rounds', make: () => makeDeck('Case presentation', 'clinic', (add, deck) => {
    add('title', 'Case Presentation', 'Department of Surgery · Unit meeting');
    add('content', 'Patient details', ul(['Age / sex:', 'Presenting complaint:', 'Duration:', 'Relevant history:']));
    add('two', 'History and examination', ul(['History of presenting illness', 'Past medical and surgical history', 'Drug and allergy history']), ul(['General examination', 'Systemic examination', 'Local examination']));
    const s = add('titleOnly', 'Investigations');
    s.objects.push(tableObj(deck, [['Test', 'Result', 'Reference'], ['Haemoglobin', '', '13–17 g/dL'], ['WBC', '', '4–11 ×10⁹/L'], ['Creatinine', '', '0.7–1.3 mg/dL'], ['Imaging', '', '']], 58, 140, 844));
    add('content', 'Diagnosis and management', ul(['Provisional diagnosis', 'Differential diagnoses', 'Plan: medical / surgical', 'Follow-up']));
    add('section', 'Discussion', 'Learning points and questions');
  })},
  {key: 'journal', name: 'Journal club', sub: 'Critical appraisal', make: () => makeDeck('Journal club', 'ink', (add) => {
    add('title', 'Journal Club', 'Article title · Authors · Journal, year');
    add('content', 'Background and question', ul(['What is already known', 'Gap in knowledge', 'Research question (PICO)']));
    add('two', 'Methods', ul(['Study design', 'Setting and participants', 'Intervention and comparison']), ul(['Primary outcome', 'Sample size', 'Statistical analysis']));
    add('content', 'Results', ul(['Baseline characteristics', 'Primary outcome', 'Secondary outcomes', 'Adverse events']));
    add('compare', 'Critical appraisal', 'Strengths', ul(['Randomised', 'Adequate follow-up']), 'Limitations', ul(['Single centre', 'Short duration']));
    add('content', 'Conclusion', ul(['Authors’ conclusion', 'Our verdict', 'Impact on our practice']));
  })},
  {key: 'lecture', name: 'Lecture', sub: 'Teaching session', make: () => makeDeck('Lecture', 'aurora', (add) => {
    add('title', 'Lecture Title', 'Speaker name · Date');
    add('content', 'Learning objectives', '<p>By the end of this session you will be able to:</p>' + ul(['Describe …', 'Explain …', 'Apply …']));
    add('section', 'Part 1', 'Introduction');
    add('content', 'Key concepts', ul(['Definition', 'Classification', 'Pathophysiology', 'Clinical features']));
    add('content', 'Summary', ul(['Take-home message 1', 'Take-home message 2', 'Take-home message 3']));
    add('title', 'Thank you', 'Questions?');
  })},
  {key: 'pitch', name: 'Business pitch', sub: 'Startup / project pitch', make: () => makeDeck('Pitch deck', 'blocks', (add) => {
    add('title', 'Company Name', 'One line that says what you do');
    add('content', 'The problem', ul(['Who has the problem', 'How they solve it today', 'Why that isn’t good enough']));
    add('content', 'Our solution', ul(['What we built', 'How it works', 'Why now']));
    add('two', 'Market and business model', ul(['Target customers', 'Market size']), ul(['Pricing', 'Revenue streams']));
    add('content', 'Traction and team', ul(['Milestones so far', 'Founders and advisors']));
    add('section', 'The ask', 'What we are raising and how we will use it');
  })},
];
