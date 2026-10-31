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
/* look of a table cell for the table style */
function tableCellLook(o, st, ri, ci){
  const s = o.tstyle || 'accent', head = o.header && ri === 0, alt = o.band && (o.header ? ri % 2 === 0 : ri % 2 === 1);
  const own = o.fills && o.fills[ri] && o.fills[ri][ci];
  let bg = null, fg = null, bold = head;
  if (s === 'accent' || s === 'medium'){ if (head){ bg = st.accent; fg = '#FFFFFF'; } else if (alt) bg = s === 'medium' ? tint(st.accent, .7) : tint(st.accent, .88); else if (s === 'medium') bg = tint(st.accent, .85); }
  else if (s === 'dark'){ if (head){ bg = shade(st.accent, .45); fg = '#FFFFFF'; } else { bg = alt ? shade(st.accent, .15) : st.accent; fg = '#FFFFFF'; } }
  else if (s === 'light'){ if (alt) bg = tint(st.accent, .9); }
  else if (s === 'grid'){ if (head) fg = st.accent; }
  if (own){ bg = own; fg = isDark(own) ? '#FFFFFF' : fg && isDark(fg) ? fg : (isDark(own) ? '#FFFFFF' : null); }
  return {bg, fg, bold, border: s === 'grid' ? st.accent : s === 'light' ? (head ? st.accent : 'transparent') : st.border};
}
function objFilter(o){ const fx = o.fx || {}, a = o.adjust || {}; const f = [];
  if (a.bright) f.push(`brightness(${1 + a.bright / 100})`); if (a.contrast) f.push(`contrast(${1 + a.contrast / 100})`); if (a.gray) f.push('grayscale(1)'); if (a.sepia) f.push('sepia(.8)');
  if (fx.shadow) f.push('drop-shadow(3px 4px 5px rgba(0,0,0,.35))'); if (fx.glow) f.push(`drop-shadow(0 0 6px ${fx.glow})`); return f.join(' '); }
function renderObj(o, deck, th, opts = {}){
  const el = document.createElement('div'); el.className = 'obj'; el.dataset.id = o.id;
  el.style.cssText = `left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${Math.max(o.h, 0)}px;transform:${objTransform(o)}`;
  const fx = o.fx || {}; if (fx.opacity != null && fx.opacity < 1) el.style.opacity = fx.opacity; const flt = objFilter(o); if (flt) el.style.filter = flt;
  if (o.kind === 'image'){
    const im = document.createElement('img'); im.src = mediaSrc(deck, o.src); im.alt = o.alt || ''; im.draggable = false;
    const c = o.crop; if (c && (c.l || c.t || c.r || c.b)){ const fw = 1 - c.l - c.r, fh = 1 - c.t - c.b; im.style.cssText = `inset:auto;width:${100 / fw}%;height:${100 / fh}%;left:${-c.l / fw * 100}%;top:${-c.t / fh * 100}%`; }
    const wrap = document.createElement('div'); wrap.className = 'imgwrap'; wrap.appendChild(im);
    if (o.mask === 'circle') wrap.style.borderRadius = '50%'; else if (o.mask === 'rounded') wrap.style.borderRadius = Math.min(o.w, o.h) * 0.12 + 'px';
    if (o.border){ const bd = document.createElement('div'); bd.className = 'imgborder'; bd.style.cssText = `border:${o.border.width}px solid ${o.border.color};border-radius:${wrap.style.borderRadius || 0}`; wrap.appendChild(bd); }
    el.appendChild(wrap); return el;
  }
  if (o.kind === 'chart'){ el.innerHTML = chartSvg(o, th); return el; }
  if (o.kind === 'ink'){ el.innerHTML = `<svg class="ink" viewBox="0 0 ${o.vw || o.w} ${o.vh || o.h}" preserveAspectRatio="none" width="100%" height="100%">${(o.paths || []).map(p => `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-opacity="${p.alpha || 1}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`; return el; }
  const st = resolve(o, th);
  const font = `font-family:${fontStack(st.font)};font-size:${st.size}px;color:${st.color};${st.bold ? 'font-weight:700;' : ''}${st.italic ? 'font-style:italic;' : ''}`;
  if (o.kind === 'table'){
    const tb = document.createElement('table'); tb.style.cssText = font + `font-size:${o.size || 14}px;--tb:${st.border}`;
    o.rows.forEach((r, ri) => { const tr = tb.insertRow(); if (o.header && ri === 0) tr.className = 'hd';
      r.forEach((c, ci) => { const td = tr.insertCell(); td.innerHTML = c || ''; ensureFontsIn(c); const lk = tableCellLook(o, st, ri, ci); if (lk.bg) td.style.background = lk.bg; if (lk.fg) td.style.color = lk.fg; td.style.borderColor = lk.border; if (!lk.bold) td.style.fontWeight = 'inherit'; }); });
    el.appendChild(tb); el.style.height = 'auto'; return el;
  }
  // box
  if (o.fill || o.line || o.geom === 'line'){
    const sw = o.line ? o.line.width || 1 : 0; const fo = fx.fillAlpha != null ? ` fill-opacity="${fx.fillAlpha}"` : '';
    let fill = o.fill || 'none', defs = '';
    if (o.grad){ const gid = 'sg' + o.id; defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="${o.grad.angle === 90 ? 1 : o.grad.angle === 135 ? 1 : 0}" y2="${o.grad.angle === 90 ? 0 : 1}"><stop offset="0" stop-color="${o.grad.a}"/><stop offset="1" stop-color="${o.grad.b}"/></linearGradient></defs>`; fill = `url(#${gid})`; }
    const svg = `<svg class="geo" viewBox="0 0 ${Math.max(o.w, 0.01)} ${Math.max(o.h, 0.01)}" preserveAspectRatio="none">${defs}<path d="${geomPath(o.geom, o.w, o.h)}" fill="${fill}"${fo} stroke="${o.line ? o.line.color : 'none'}" stroke-width="${sw}" vector-effect="non-scaling-stroke"${o.line && o.line.dash ? ' stroke-dasharray="6 4"' : ''}/></svg>`;
    el.insertAdjacentHTML('beforeend', svg);
  }
  if (o.geom !== 'line' && !o.deco){
    const hasText = !!(o.html && o.html.replace(/<[^>]+>/g, '').replace(/ /g, ' ').trim());
    if (o.ph && !hasText) el.classList.add('ph-empty');
    const tx = document.createElement('div'); tx.className = 'tx'; tx.dataset.a = o.anchor || 't';
    if (o.vert){ tx.style.writingMode = 'vertical-rl'; }
    const sp = o.spacing || {};
    const tc = document.createElement('div'); tc.className = 'tc'; tc.style.cssText = font + (sp.line ? `line-height:${1.15 * sp.line};` : o.ph === 'title' || o.ph === 'subtitle' ? 'line-height:1.1;' : '') + (sp.after != null ? `--pa:${sp.after}px;` : '') + (o.textShadow ? 'text-shadow:2px 2px 4px rgba(0,0,0,.45);' : '') + (o.caps ? 'text-transform:uppercase;' : '') + (o.letter ? `letter-spacing:${o.letter}px;` : '');
    if (o.align) tc.style.textAlign = o.align;
    if (o.cols > 1) tc.style.columns = o.cols;
    tc.innerHTML = hasText ? o.html : (o.html && !o.ph ? o.html : ''); ensureFontsIn(o.html);
    if (o.ph) tc.dataset.prompt = o.prompt || PROMPTS[o.ph] || PROMPTS.body;
    if (o.fit && o.fit < 1 && autofitOn(o)){ tc.style.zoom = o.fit; tc.style.width = (100 / o.fit) + '%'; }
    tx.appendChild(tc); el.appendChild(tx);
  }
  return el;
}
const autofitOn = o => o.kind === 'box' && o.autofit !== false && (o.ph || o.autofit);
/* shrink text that overflows its box (PowerPoint's "Shrink text on overflow"); measures the live element */
function fitTextIn(el, o){
  if (!autofitOn(o)) return false; const tc = el.querySelector('.tc'); if (!tc || !tc.textContent.trim()) { if (o.fit){ delete o.fit; return true; } return false; }
  tc.style.zoom = ''; tc.style.width = ''; const box = o.h - 7.2; let k = 1;
  if (tc.scrollHeight > box + 1){ k = Math.max(0.4, box / tc.scrollHeight); for (let i = 0; i < 6; i++){ tc.style.zoom = k; tc.style.width = (100 / k) + '%'; if (tc.scrollHeight * k <= box + 1) break; k = Math.max(0.4, k * 0.94); } }
  k = Math.round(k * 100) / 100; if (k >= 1){ tc.style.zoom = ''; tc.style.width = ''; }
  const prev = o.fit || 1; if (Math.abs(prev - k) > 0.005){ if (k >= 1) delete o.fit; else o.fit = k; return true; } return false;
}
function renderSlide(slide, deck, opts = {}){
  const th = slideTheme(deck, slide); const W = deck.size.w, H = deck.size.h;
  const el = document.createElement('div'); el.className = 'slide' + (opts.edit ? '' : ' noprompt');
  el.style.width = W + 'px'; el.style.height = H + 'px';
  el.style.background = bgCss(slideBg(slide, deck), deck);
  const tone = bgTone(slide.bg && !slide.bg.image ? slide.bg : null, th); el.style.setProperty('--bullet', Math.abs(lum(th.accent) - lum(tone)) < 0.18 ? th.text : th.accent);
  const art = decoSvg(deck, slide); if (art) el.insertAdjacentHTML('beforeend', art);
  for (const o of slide.objects){ if (!opts.edit && o.picSlot) continue; el.appendChild(renderObj(o, deck, th, opts)); }
  for (const o of footerObjs(deck, slide)){ const n = renderObj(o, deck, th); n.classList.add('hf'); el.appendChild(n); }
  return el;
}
/* Header & footer (Insert › Header & Footer): slide number, date and footer text */
function footerObjs(deck, slide){
  const hf = deck.hf; if (!hf || (!hf.num && !hf.date && !hf.text)) return []; if (hf.notTitle && slide.layout === 'title') return [];
  const W = deck.size.w, H = deck.size.h, y = H - 34, mk = (id, x, w, html, align) => ({id: 'hf-' + id, kind: 'box', geom: 'rect', fill: null, line: null, html: `<p style="text-align:${align}">${html}</p>`, x, y, w, h: 26, rot: 0, anchor: 'ctr', style: {size: 11}, hfKind: id});
  const out = [], idx = deck.slides.indexOf(slide) + 1;
  if (hf.date) out.push(mk('date', W * .05, W * .25, escA(hf.dateText || new Date().toLocaleDateString()), 'left'));
  if (hf.text) out.push(mk('text', W * .33, W * .34, escA(hf.text), 'center'));
  if (hf.num) out.push(mk('num', W * .7, W * .25, String(idx), 'right'));
  return out;
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
