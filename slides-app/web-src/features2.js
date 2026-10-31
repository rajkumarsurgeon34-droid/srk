/* SRK Slides — formatting tools, Draw, Transitions, Animations, Slide Show set-up, Review and View features, and the ribbon for them */
'use strict';
Object.assign(Features, (() => {
  const A = () => Editor.api, IC = Features.IC; const h = (...a) => A().h(...a); const toast = m => A().toast(m); const dialog = (t, b, a) => App.dialog(t, b, a);
  const I = () => A().I;

  /* ================================================================ TEXT EXTRAS */
  function lineSpacing(anchor){
    const a = A(), o = a.selObj(); if (!o || o.kind !== 'box'){ toast('Select a text box first'); return; } const sp = o.spacing || {};
    a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Line spacing'));
      [1, 1.15, 1.5, 2, 2.5, 3].forEach(v => p.append(a.mi('', v.toFixed(v % 1 ? 2 : 1).replace(/0$/, ''), () => a.setProp(o => o.spacing = {...(o.spacing || {}), line: v}), (sp.line || 1) === v)));
      p.append(h('hr'), h('div', {class: 'ph'}, 'Space after paragraph')); [0, 6, 12, 18].forEach(v => p.append(a.mi('', v + ' pt', () => a.setProp(o => o.spacing = {...(o.spacing || {}), after: v}), (sp.after || 0) === v))); });
  }
  function changeCase(anchor){
    const a = A(); const conv = {Sentence: s => s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase()), lower: s => s.toLowerCase(), UPPER: s => s.toUpperCase(), Capitalise: s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), tOGGLE: s => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')};
    a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Change case')); for (const [k, fn] of Object.entries(conv)) p.append(a.mi('', k === 'Sentence' ? 'Sentence case.' : k === 'Capitalise' ? 'Capitalise Each Word' : k, () => applyCase(fn))); });
  }
  function applyCase(fn){
    const a = A(), o = a.selObj(); if (!o || !a.textual(o)) return;
    if (a.E.editing){ a.restoreRange(); const s = getSelection(); if (s.rangeCount && !s.isCollapsed){ const txt = String(s); document.execCommand('insertText', false, fn(txt)); a.syncText(o, a.editTarget()); return; } }
    const walk = html => { const d = document.createElement('div'); d.innerHTML = html; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) n.data = fn(n.data); return d.innerHTML; };
    if (a.E.editing) a.endEdit(); if (o.kind === 'table') o.rows = o.rows.map(r => r.map(walk)); else o.html = walk(o.html || ''); a.updateObjEl(o); a.commit(); a.refreshThumb();
  }
  function setAll(fn){ const a = A(); const objs = a.selObjs(); if (!objs.length) return; if (a.E.editing) a.endEdit(); objs.forEach(o => { fn(o); a.updateObjEl(o); }); a.drawSel(); a.commit(); a.refreshThumb(); a.refreshRibbon(); }

  /* ================================================================ SHAPE EFFECTS */
  function transparency(anchor){ const a = A(); a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Transparency')); [0, 20, 40, 60, 80].forEach(v => p.append(a.mi('', v + '%', () => setAll(o => { o.fx = {...(o.fx || {})}; if (o.kind === 'box' && (o.fill || o.grad)) { o.fx.fillAlpha = 1 - v / 100; delete o.fx.opacity; } else o.fx.opacity = 1 - v / 100; if (!v){ delete o.fx.fillAlpha; delete o.fx.opacity; } })))); }); }
  function shapeGradient(anchor){ const a = A(), t = a.th();
    a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Gradient fill')); const g = h('div', {class: 'bgstyles'});
      [[t.accent, t.accent2 || shade(t.accent, .4), 135], [tint(t.accent, .3), shade(t.accent, .3), 180], [t.accent, tint(t.accent, .7), 90], [t.accent2 || t.accent, tint(t.accent2 || t.accent, .6), 180], ['#FFFFFF', tint(t.accent, .6), 180], ['#434343', '#000000', 180], ['#F6D365', '#FDA085', 135], ['#84FAB0', '#8FD3F4', 135]]
        .forEach(([x, y, ang]) => { const b = h('button', {type: 'button'}); b.style.background = `linear-gradient(${ang}deg, ${x}, ${y})`; b.addEventListener('click', () => { A().closePop(); setAll(o => { if (o.kind === 'box'){ o.grad = {a: x, b: y, angle: ang}; o.fill = o.fill || x; } }); }); g.append(b); });
      p.append(g, h('hr'), a.mi('', 'No gradient', () => setAll(o => delete o.grad))); });
  }

  /* ================================================================ PICTURE TOOLS */
  function cropDialog(){
    const a = A(), o = a.selObj(); if (!o || o.kind !== 'image') return; const c = {l: 0, t: 0, r: 0, b: 0, ...(o.crop || {})};
    const img = new Image(); img.src = mediaSrc(a.E.deck, o.src);
    const prev = h('div', {class: 'cropprev'}); const view = h('div', {class: 'cropview'}); prev.append(img, view);
    const sl = (k, lbl) => { const i = h('input', {type: 'range', min: 0, max: 45, value: Math.round(c[k] * 100), 'aria-label': lbl}); i.addEventListener('input', () => { c[k] = +i.value / 100; draw(); }); return h('label', {class: 'f'}, lbl, i); };
    const draw = () => { view.style.cssText = `left:${c.l * 100}%;top:${c.t * 100}%;right:${c.r * 100}%;bottom:${c.b * 100}%`; };
    const ratio = (rw, rh) => { const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1, want = rw / rh, have = nw / nh; c.l = c.r = c.t = c.b = 0; if (have > want){ const cut = (1 - want / have) / 2; c.l = c.r = cut; } else { const cut = (1 - have / want) / 2; c.t = c.b = cut; } draw(); sliders.forEach((s, i) => s.querySelector('input').value = Math.round(c[['l', 't', 'r', 'b'][i]] * 100)); };
    const sliders = [sl('l', 'Left'), sl('t', 'Top'), sl('r', 'Right'), sl('b', 'Bottom')]; draw();
    const resetB = h('button', {class: 'btn sm', type: 'button'}, 'Reset'); resetB.addEventListener('click', () => { c.l = c.t = c.r = c.b = 0; draw(); sliders.forEach(s => s.querySelector('input').value = 0); });
    const rbtn = (lbl, rw, rh) => { const b = h('button', {class: 'btn sm', type: 'button'}, lbl); b.addEventListener('click', () => ratio(rw, rh)); return b; };
    dialog('Crop picture', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, prev, h('div', {class: 'gradrow'}, rbtn('Square', 1, 1), rbtn('4:3', 4, 3), rbtn('16:9', 16, 9), rbtn('3:4', 3, 4), resetB), h('div', {class: 'cropsl'}, ...sliders)),
      [['Cancel'], ['Crop', 'primary', () => { const nw = img.naturalWidth || o.w, nh = img.naturalHeight || o.h; const fw = 1 - c.l - c.r, fh = 1 - c.t - c.b; const old = o.crop || {l: 0, t: 0, r: 0, b: 0}; const ofw = 1 - old.l - old.r, ofh = 1 - old.t - old.b;
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2; const scale = o.w / (nw * ofw); o.w = Math.round(nw * fw * scale); o.h = Math.round(nh * fh * scale); o.x = Math.round(cx - o.w / 2); o.y = Math.round(cy - o.h / 2);
        if (c.l || c.t || c.r || c.b) o.crop = {...c}; else delete o.crop; a.updateObjEl(o); a.drawSel(); a.commit(); a.refreshThumb(); }]]);
  }
  function picShape(anchor){ const a = A(); a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Picture shape')); [['', 'Rectangle'], ['rounded', 'Rounded corners'], ['circle', 'Circle / oval']].forEach(([k, n]) => p.append(a.mi('', n, () => setAll(o => { if (k) o.mask = k; else delete o.mask; })))); }); }
  function picBorder(anchor){ const a = A(); a.colorPop(anchor, 'Picture border', c => setAll(o => { if (c) o.border = {color: c, width: (o.border && o.border.width) || 4}; else delete o.border; }), {none: 'No border'}); }
  function picAdjust(){
    const a = A(), o = a.selObj(); if (!o || o.kind !== 'image') return; const adj = {bright: 0, contrast: 0, gray: false, sepia: false, ...(o.adjust || {})}; const op = Math.round(((o.fx && o.fx.opacity) ?? 1) * 100);
    const live = () => { const n = a.slideEl.querySelector(`.obj[data-id="${o.id}"]`); if (n){ const t = {...o, adjust: adj, fx: {...(o.fx || {}), opacity: +opI.value / 100}}; n.style.filter = objFilter(t); n.style.opacity = +opI.value / 100; } };
    const rng = (k, lbl) => { const i = h('input', {type: 'range', min: -40, max: 40, value: adj[k], 'aria-label': lbl}); i.addEventListener('input', () => { adj[k] = +i.value; live(); }); return h('label', {class: 'f'}, lbl, i); };
    const opI = h('input', {type: 'range', min: 10, max: 100, value: op, 'aria-label': 'Transparency'}); opI.addEventListener('input', live);
    const g = h('input', {type: 'checkbox'}); g.checked = adj.gray; g.addEventListener('change', () => { adj.gray = g.checked; live(); }); const sp = h('input', {type: 'checkbox'}); sp.checked = adj.sepia; sp.addEventListener('change', () => { adj.sepia = sp.checked; live(); });
    dialog('Adjust picture', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, rng('bright', 'Brightness'), rng('contrast', 'Contrast'), h('label', {class: 'f'}, 'Opacity', opI), h('label', {class: 'chkrow'}, g, ' Black and white'), h('label', {class: 'chkrow'}, sp, ' Sepia')),
      [['Cancel', '', () => { a.updateObjEl(o); }], ['Apply', 'primary', () => { if (adj.bright || adj.contrast || adj.gray || adj.sepia) o.adjust = adj; else delete o.adjust; o.fx = {...(o.fx || {})}; if (+opI.value < 100) o.fx.opacity = +opI.value / 100; else delete o.fx.opacity; a.updateObjEl(o); a.commit(); a.refreshThumb(); }]]);
  }
  function altText(){ const a = A(), o = a.selObj(); if (!o) return; const t = h('textarea', {class: 'inp', rows: 3, 'aria-label': 'Alt text'}); t.value = o.alt || '';
    dialog('Alt text', h('div', {style: 'display:flex;flex-direction:column;gap:6px'}, h('p', {class: 'hint'}, 'Describe the picture for people who use a screen reader.'), t), [['Cancel'], ['Save', 'primary', () => { o.alt = t.value.trim(); a.commit(); }]]); }
  function iconColor(anchor){ const a = A(); a.colorPop(anchor, 'Icon colour', c => setAll(o => { if (o.icon && c){ o.iconColor = c; o.src = Features.iconSrc(o.icon, c); } })); }

  /* ================================================================ TABLE TOOLS */
  function tableStyles(anchor){ const a = A(), t = a.th(); a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Table styles')); const g = h('div', {class: 'tstylegrid'});
    for (const [k, n] of [['accent', 'Accent'], ['medium', 'Medium'], ['light', 'Light'], ['dark', 'Dark'], ['grid', 'Grid'], ['plain', 'Plain']]){ const demo = {kind: 'table', tstyle: k, header: true, band: true, rows: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]]};
      const st = {accent: t.accent, border: isDark(t.bg) ? tint(t.accent, .2) : '#BFBFBF'}; const cells = demo.rows.map((r, ri) => r.map((_, ci) => { const lk = tableCellLook(demo, st, ri, ci); return `<i style="background:${lk.bg || 'transparent'};border-color:${lk.border}"></i>`; }).join('')).join('');
      const b = h('button', {type: 'button', title: n}, h('span', {class: 'tsmini', html: cells}), n); b.addEventListener('click', () => { A().closePop(); setAll(o => { if (o.kind === 'table'){ o.tstyle = k; o.fills = null; } }); }); g.append(b); }
    p.append(g); }); }
  function cellFill(anchor){ const a = A(), o = a.selObj(); if (!o || o.kind !== 'table') return;
    const td = (() => { const t = a.editTarget(); const s = getSelection(); if (!a.E.editing || !t || !s.rangeCount) return null; let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentNode); return n && n.closest ? n.closest('td') : null; })();
    if (!td){ toast('Tap inside a cell first'); return; } const r = td.parentNode.rowIndex, c = td.cellIndex;
    a.colorPop(anchor, 'Cell fill', col => { a.syncText(o, a.editTarget()); o.fills = o.fills || o.rows.map(row => row.map(() => null)); o.fills[r] = o.fills[r] || []; o.fills[r][c] = col; a.endEdit(); a.updateObjEl(o); a.commit(); a.refreshThumb(); }, {none: 'No fill'}); }

  /* ================================================================ DRAW (ink) */
  const PENS = {pen: {color: '#1F1F1F', width: 3, alpha: 1}, hiliter: {color: '#FFE600', width: 14, alpha: .45}};
  let ink = null;
  function setTool(t, opts){ const a = A(); a.E.tool = t; if (opts && t) Object.assign(PENS[t] || {}, opts); a.select(null); $stage().classList.toggle('drawing', !!t); $stage().dataset.tool = t || ''; a.buildRibbon(); }
  const $stage = () => document.getElementById('stagewrap');
  function toolDown(e){
    const a = A(), t = a.E.tool; if (!t) return false; e.preventDefault();
    if (t === 'eraser'){ const on = e.target.closest('.obj'); if (on){ const o = a.objOf(on.dataset.id); if (o && o.kind === 'ink'){ a.slide().objects = a.slide().objects.filter(x => x !== o); a.renderStage(); a.commit(); a.refreshThumb(); } } a.startToolDrag(e); ink = {erase: true}; return true; }
    const p = a.pt(e), pen = PENS[t]; ink = {pts: [[p.x, p.y]], pen}; a.startToolDrag(e);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'inklive'); svg.setAttribute('viewBox', `0 0 ${a.E.deck.size.w} ${a.E.deck.size.h}`);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', pen.color); path.setAttribute('stroke-width', pen.width); path.setAttribute('stroke-opacity', pen.alpha); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path); a.slideEl.appendChild(svg); ink.path = path; ink.svg = svg; return true;
  }
  function toolMove(e, p){ if (!ink) return; const a = A();
    if (ink.erase){ const el = document.elementFromPoint(e.clientX, e.clientY); const on = el && el.closest && el.closest('.obj'); if (on){ const o = a.objOf(on.dataset.id); if (o && o.kind === 'ink'){ a.slide().objects = a.slide().objects.filter(x => x !== o); on.remove(); ink.changed = true; } } return; }
    const last = ink.pts[ink.pts.length - 1]; if (Math.hypot(p.x - last[0], p.y - last[1]) < 1.2) return; ink.pts.push([p.x, p.y]); ink.path.setAttribute('d', smoothPath(ink.pts)); }
  function toolUp(){ const a = A(); if (!ink) return; const k = ink; ink = null; if (k.erase){ if (k.changed){ a.commit(); a.refreshThumb(); } return; }
    k.svg.remove(); if (k.pts.length < 2) k.pts.push([k.pts[0][0] + .5, k.pts[0][1] + .5]);
    const pad = k.pen.width, xs = k.pts.map(p => p[0]), ys = k.pts.map(p => p[1]); const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
    const rel = k.pts.map(p => [p[0] - x0, p[1] - y0]); const w = x1 - x0, hh = y1 - y0;
    a.slide().objects.push({id: uid(), kind: 'ink', x: Math.round(x0 * 10) / 10, y: Math.round(y0 * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(hh * 10) / 10, vw: w, vh: hh, rot: 0, paths: [{d: smoothPath(rel), color: k.pen.color, width: k.pen.width, alpha: k.pen.alpha}]});
    a.renderStage(); a.commit(); a.refreshThumb(); }
  function smoothPath(pts){ if (pts.length < 3) return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L'); let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`; for (let i = 1; i < pts.length - 1; i++){ const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`; } const l = pts[pts.length - 1]; return d + `L${l[0].toFixed(1)} ${l[1].toFixed(1)}`; }
  function penPop(anchor, t){ const a = A(); a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, t === 'hiliter' ? 'Highlighter' : 'Pen'));
    const cols = t === 'hiliter' ? ['#FFE600', '#7CFC00', '#FF69B4', '#00E5FF', '#FFA500'] : ['#1F1F1F', '#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#FFFFFF', a.th().accent];
    const g = h('div', {class: 'swatches'}); cols.forEach(c => { const b = h('button', {type: 'button', title: c}); b.style.background = c; b.addEventListener('click', () => { A().closePop(); setTool(t, {color: c}); }); g.append(b); }); p.append(g, h('div', {class: 'ph'}, 'Thickness'));
    (t === 'hiliter' ? [8, 14, 22] : [1.5, 3, 5, 8]).forEach(w => p.append(a.mi('', w + ' pt', () => setTool(t, {width: w}), PENS[t].width === w))); }); }

  /* ================================================================ TRANSITIONS */
  const TRANS = [['none', 'None'], ['morph', 'Morph'], ['fade', 'Fade'], ['push', 'Push'], ['wipe', 'Wipe'], ['split', 'Split'], ['uncover', 'Reveal'], ['cover', 'Cover'], ['zoom', 'Zoom'], ['flip', 'Flip']];
  const DIRS = {push: ['u', 'd', 'l', 'r'], wipe: ['r', 'l', 'd', 'u'], cover: ['l', 'r', 'u', 'd'], uncover: ['l', 'r', 'u', 'd']}; const DIRN = {u: 'From bottom', d: 'From top', l: 'From right', r: 'From left'};
  function transTab(r){
    const a = A(), s = a.slide(), cur = s.transition || 'none';
    const gal = h('div', {class: 'row'}); TRANS.forEach(([k, n]) => { const b = a.rb(k === 'none' ? I().none : k === 'morph' ? IC.morph : I().play, n, () => { s.transition = k; if (k === 'morph') toast('Morph moves objects that appear on both slides. Duplicate a slide, then move or resize things on the copy.'); a.setTransition(k); a.buildRibbon(); }, {label: n}); if (cur === k) b.classList.add('on'); gal.append(b); });
    const dirSel = h('select', {class: 'rsel', 'aria-label': 'Effect options', title: 'Effect options'}); const dirs = DIRS[cur]; if (dirs){ dirs.forEach(d => dirSel.append(h('option', {value: d}, DIRN[d]))); dirSel.value = s.trDir || dirs[0]; } else { dirSel.append(h('option', {}, '—')); dirSel.disabled = true; }
    dirSel.addEventListener('change', () => { s.trDir = dirSel.value; a.commit(); });
    const dur = h('select', {class: 'rsel', 'aria-label': 'Duration', title: 'Duration'}); [['0.5', '0.5 s'], ['0.8', '0.8 s'], ['1.2', '1.2 s'], ['2', '2 s']].forEach(([v, n]) => dur.append(h('option', {value: v}, n))); dur.value = String(s.trDur || 0.8); dur.addEventListener('change', () => { s.trDur = +dur.value; a.commit(); });
    const adv = h('input', {class: 'rsel', type: 'number', min: 0, step: 1, placeholder: '—', value: s.advance || '', style: 'width:64px', 'aria-label': 'Advance after seconds', title: 'Move to the next slide after this many seconds'}); adv.addEventListener('change', () => { const v = +adv.value; if (v > 0) s.advance = v; else delete s.advance; a.commit(); a.renderThumbs(); });
    r.append(h('div', {class: 'grp'}, gal, h('div', {class: 'gl'}, 'Transition to this slide')),
      a.grp('Options', dirSel, a.rb(IC.preview, 'Preview', () => App.previewTransition(), {label: 'Preview'})),
      a.grp('Timing', h('span', {class: 'lbl'}, 'Duration'), dur, h('span', {class: 'lbl'}, 'After (s)'), adv, a.rb(I().dup, 'Apply to all slides', () => { const t = {transition: s.transition, trDir: s.trDir, trDur: s.trDur, advance: s.advance}; a.E.deck.slides.forEach(x => Object.assign(x, JSON.parse(JSON.stringify(t)))); a.commit(); a.renderThumbs(); toast('Applied to all slides'); }, {label: 'Apply to all'})));
  }

  /* ================================================================ ANIMATIONS */
  const ANIMS = {in: [['appear', 'Appear'], ['fade', 'Fade'], ['fly', 'Fly In'], ['float', 'Float In'], ['wipe', 'Wipe'], ['zoom', 'Zoom'], ['grow', 'Grow & Turn'], ['bounce', 'Bounce']],
    em: [['pulse', 'Pulse'], ['spin', 'Spin'], ['teeter', 'Teeter'], ['grow2', 'Grow/Shrink']], out: [['fadeout', 'Fade Out'], ['flyout', 'Fly Out'], ['zoomout', 'Zoom Out'], ['disappear', 'Disappear']]};
  const ANAME = Object.fromEntries(Object.values(ANIMS).flat()); const ACLS = Object.fromEntries(Object.entries(ANIMS).flatMap(([c, l]) => l.map(([k]) => [k, c])));
  const anims = s => (s.anims || []).filter(x => s.objects.some(o => o.id === x.obj));
  function addAnim(fx){ const a = A(), objs = a.selObjs(); if (!objs.length){ toast('Select an object to animate'); return; } const s = a.slide(); s.anims = anims(s);
    for (const o of objs){ const ex = s.anims.find(x => x.obj === o.id && ACLS[x.fx] === ACLS[fx]); if (ex) ex.fx = fx; else s.anims.push({id: uid(), obj: o.id, fx, start: s.anims.length && objs.indexOf(o) > 0 ? 'with' : 'click', dur: fx === 'appear' || fx === 'disappear' ? 0 : 0.6, delay: 0}); }
    a.commit(); a.buildRibbon(); markAnims(); App.previewAnims(objs.map(o => o.id)); }
  function selAnim(){ const a = A(), s = a.slide(), o = a.selObj(); return o ? anims(s).filter(x => x.obj === o.id) : []; }
  function animTab(r){
    const a = A(), list = selAnim(), cur = list[list.length - 1], o = a.selObj();
    const gal = h('div', {class: 'row animgal'});
    for (const [cls, label] of [['in', 'Entrance'], ['em', 'Emphasis'], ['out', 'Exit']]){ gal.append(h('span', {class: 'lbl ' + cls}, label)); for (const [k, n] of ANIMS[cls]){ const b = a.rb(`<span class="astar ${cls}">★</span>`, n, () => addAnim(k), {label: n}); if (list.some(x => x.fx === k)) b.classList.add('on'); if (!o) b.disabled = true; gal.append(b); } }
    const start = h('select', {class: 'rsel', 'aria-label': 'Start', title: 'Start'}); [['click', 'On click'], ['with', 'With previous'], ['after', 'After previous']].forEach(([v, n]) => start.append(h('option', {value: v}, n)));
    const dur = h('input', {class: 'rsel', type: 'number', min: 0, max: 10, step: 0.1, style: 'width:64px', 'aria-label': 'Duration (seconds)', title: 'Duration (seconds)'}), delay = h('input', {class: 'rsel', type: 'number', min: 0, max: 30, step: 0.1, style: 'width:64px', 'aria-label': 'Delay (seconds)', title: 'Delay (seconds)'});
    if (cur){ start.value = cur.start; dur.value = cur.dur; delay.value = cur.delay || 0; } else { start.disabled = dur.disabled = delay.disabled = true; }
    const upd = () => { for (const x of list){ x.start = start.value; x.dur = Math.max(0, +dur.value || 0); x.delay = Math.max(0, +delay.value || 0); } a.commit(); markAnims(); };
    [start, dur, delay].forEach(i => i.addEventListener('change', upd));
    r.append(h('div', {class: 'grp'}, gal, h('div', {class: 'gl'}, o ? 'Animation' : 'Select an object to animate')),
      a.grp('Timing', h('span', {class: 'lbl'}, 'Start'), start, h('span', {class: 'lbl'}, 'Duration'), dur, h('span', {class: 'lbl'}, 'Delay'), delay),
      a.grp('Advanced', a.rb(IC.preview, 'Preview', () => App.previewAnims(), {label: 'Preview'}), a.rb(IC.pane, 'Animation pane', b => animPane(b), {label: 'Animation Pane'}), a.rb(I().trash, 'Remove animation', () => { const s = a.slide(); s.anims = anims(s).filter(x => !list.includes(x)); a.commit(); a.buildRibbon(); markAnims(); }, {label: 'Remove', disabled: !list.length})));
    markAnims();
  }
  function animPane(anchor){
    const a = A(), s = a.slide(); s.anims = anims(s);
    a.pop(anchor, p => { p.classList.add('animpane'); p.append(h('div', {class: 'ph'}, 'Animation pane'));
      if (!s.anims.length){ p.append(h('p', {class: 'hint', style: 'padding:6px'}, 'No animations on this slide yet. Select an object, then pick an effect.')); return; }
      let step = 0; s.anims.forEach((x, i) => { if (x.start === 'click' || i === 0) step++; const o = s.objects.find(q => q.id === x.obj); const name = o ? (o.kind === 'box' ? ((o.html || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 22) || (o.ph ? o.ph : 'Shape')) : o.kind[0].toUpperCase() + o.kind.slice(1)) : '?';
        const row = h('div', {class: 'arow'}, h('span', {class: 'astep'}, x.start === 'click' || i === 0 ? String(step) : ''), h('span', {class: 'astar ' + ACLS[x.fx]}, '★'), h('span', {class: 'aname'}, `${name} · ${ANAME[x.fx]}`),
          upBtn('↑', () => { if (i > 0){ [s.anims[i - 1], s.anims[i]] = [s.anims[i], s.anims[i - 1]]; a.commit(); animPane(anchor); markAnims(); } }), upBtn('↓', () => { if (i < s.anims.length - 1){ [s.anims[i + 1], s.anims[i]] = [s.anims[i], s.anims[i + 1]]; a.commit(); animPane(anchor); markAnims(); } }),
          upBtn('✕', () => { s.anims.splice(i, 1); a.commit(); animPane(anchor); markAnims(); a.buildRibbon(); }));
        row.querySelector('.aname').addEventListener('click', () => { A().closePop(); if (o) a.select(o.id); }); p.append(row); }); });
    function upBtn(t, fn){ const b = h('button', {class: 'ib', type: 'button', style: 'width:30px;height:30px'}, t); b.addEventListener('click', fn); return b; }
  }
  function markAnims(){ const a = A(); if (!a.slideEl) return; a.slideEl.querySelectorAll('.abadge').forEach(n => n.remove()); if (a.E.tab !== 'animations') return; const s = a.slide(); let step = 0;
    anims(s).forEach((x, i) => { if (x.start === 'click' || i === 0) step++; const n = a.slideEl.querySelector(`.obj[data-id="${x.obj}"]`); if (!n || n.querySelector('.abadge')) return; const b = h('span', {class: 'abadge'}, String(step)); b.style.transform = `scale(${1 / a.scale})`; n.appendChild(b); }); }

  /* ================================================================ VIEWS */
  function slideSorter(){
    const a = A(), deck = a.E.deck; const ov = h('div', {class: 'sorter', role: 'dialog', 'aria-label': 'Slide sorter'});
    const bar = h('header', {class: 'bar gut'}, h('button', {class: 'ib', type: 'button', 'aria-label': 'Close', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'}), h('b', {style: 'flex:1;font-size:17px;padding-left:4px'}, 'Slide sorter'), h('span', {class: 'hint'}, 'Drag to reorder · tap to open'));
    const grid = h('div', {class: 'sgrid gut'}); ov.append(bar, grid); document.body.append(ov);
    const close = () => { ov.remove(); a.renderAll(); }; bar.firstChild.addEventListener('click', close);
    const draw = () => { grid.innerHTML = ''; deck.slides.forEach((s, i) => { const m = h('div', {class: 'smi'}); const card = h('div', {class: 'scard' + (i === a.E.cur ? ' cur' : '') + (s.hidden ? ' hidden' : ''), 'data-i': i}, m, h('div', {class: 'scap'}, h('span', {}, String(i + 1)), s.transition && s.transition !== 'none' ? h('span', {}, '★') : null, s.hidden ? h('span', {}, 'Hidden') : null)); grid.append(card); requestAnimationFrame(() => miniSlide(m, s, deck)); }); };
    draw(); let dragI = null, ghost = null, moved = false, sx = 0, sy = 0, lp = null;
    grid.addEventListener('pointerdown', e => { const c = e.target.closest('.scard'); if (!c) return; dragI = +c.dataset.i; moved = false; sx = e.clientX; sy = e.clientY; lp = setTimeout(() => { moved = true; c.classList.add('lift'); }, e.pointerType === 'mouse' ? 0 : 350); grid.setPointerCapture(e.pointerId); });
    grid.addEventListener('pointermove', e => { if (dragI == null) return; if (!moved){ if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8){ if (e.pointerType === 'mouse'){ moved = true; } else { clearTimeout(lp); dragI = null; } } return; } e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest && el.closest('.scard'); grid.querySelectorAll('.drop').forEach(n => n.classList.remove('drop')); if (c && +c.dataset.i !== dragI) c.classList.add('drop'); });
    grid.addEventListener('pointerup', e => { clearTimeout(lp); if (dragI == null) return; const from = dragI; dragI = null; const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest && el.closest('.scard');
      if (!moved){ if (c){ a.E.cur = +c.dataset.i; close(); } return; } if (c && +c.dataset.i !== from){ const to = +c.dataset.i; const [s] = deck.slides.splice(from, 1); deck.slides.splice(to, 0, s); a.E.cur = to; a.commit(); } draw(); });
    grid.addEventListener('contextmenu', e => e.preventDefault());
  }
  function outlineView(){
    const a = A(), deck = a.E.deck; a.E.editing && a.endEdit();
    const ov = h('div', {class: 'sorter', role: 'dialog', 'aria-label': 'Outline'}); const list = h('div', {class: 'outline gut'});
    const bar = h('header', {class: 'bar gut'}, h('button', {class: 'ib', type: 'button', 'aria-label': 'Close', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'}), h('b', {style: 'flex:1;font-size:17px;padding-left:4px'}, 'Outline'), h('span', {class: 'hint'}, 'Edit titles and bullet points'));
    const txt = html => { const d = document.createElement('div'); d.innerHTML = html || ''; const items = [...d.querySelectorAll('li,p')].filter(n => !n.querySelector('li,p')); return items.length ? items.map(n => n.textContent.trim()).filter(Boolean).join('\n') : d.textContent.trim(); };
    deck.slides.forEach((s, i) => { const title = s.objects.find(o => o.ph === 'title'), body = s.objects.find(o => o.ph === 'body' || o.ph === 'subtitle');
      const ti = h('input', {class: 'inp otitle', value: title ? txt(title.html) : '', placeholder: title ? 'Title' : '(no title box)', 'aria-label': `Slide ${i + 1} title`}); if (!title) ti.disabled = true;
      const bi = h('textarea', {class: 'inp obody', rows: 3, placeholder: body ? 'One point per line' : '(no text box)', 'aria-label': `Slide ${i + 1} text`}); bi.value = body ? txt(body.html) : ''; if (!body) bi.disabled = true;
      ti.addEventListener('change', () => { title.html = ti.value.trim() ? `<p>${escA(ti.value.trim())}</p>` : ''; a.commit(); });
      bi.addEventListener('change', () => { const lines = bi.value.split('\n').map(l => l.trim()).filter(Boolean); body.html = !lines.length ? '' : body.ph === 'body' && body.bullets !== false ? `<ul>${lines.map(l => `<li>${escA(l)}</li>`).join('')}</ul>` : lines.map(l => `<p>${escA(l)}</p>`).join(''); a.commit(); });
      list.append(h('div', {class: 'orow'}, h('span', {class: 'onum'}, String(i + 1)), h('div', {class: 'obox'}, ti, bi))); });
    ov.append(bar, list); document.body.append(ov); bar.firstChild.addEventListener('click', () => { ov.remove(); a.renderAll(); });
  }
  function toggleGrid(){ const a = A(); a.E.grid = !a.E.grid; a.renderStage(); a.buildRibbon(); }

  /* ================================================================ REVIEW */
  function spellToggle(){ const a = A(); a.E.nospell = !a.E.nospell; document.querySelectorAll('.tc,.notes textarea').forEach(n => n.spellcheck = !a.E.nospell); toast(a.E.nospell ? 'Spell check off' : 'Spell check on: misspelt words get a red underline while you type. Long-press one for suggestions.'); a.buildRibbon(); }

  /* ================================================================ RIBBON */
  function buildTab(t, o, r){
    const a = A(), I0 = I();
    if (t === 'draw'){
      const tool = a.E.tool; const sel = a.rb(IC.cursor, 'Select', () => setTool(null), {label: 'Select'}); if (!tool) sel.classList.add('on');
      const pen = a.rb(IC.pen + `<span class="sw" style="background:${PENS.pen.color}"></span>`, 'Pen', () => setTool('pen'), {label: 'Pen'}); if (tool === 'pen') pen.classList.add('on');
      const hl = a.rb(IC.hiliter + `<span class="sw" style="background:${PENS.hiliter.color}"></span>`, 'Highlighter', () => setTool('hiliter'), {label: 'Highlighter'}); if (tool === 'hiliter') hl.classList.add('on');
      const er = a.rb(IC.eraser, 'Eraser', () => setTool('eraser'), {label: 'Eraser'}); if (tool === 'eraser') er.classList.add('on');
      r.append(a.grp('Tools', sel, pen, a.rb(I0.caret, 'Pen colour and thickness', b => penPop(b, 'pen')), hl, a.rb(I0.caret, 'Highlighter colour and thickness', b => penPop(b, 'hiliter')), er),
        a.grp('Edit', a.rb(I0.trash, 'Erase all drawings on this slide', () => { const s = a.slide(); const n = s.objects.filter(q => q.kind === 'ink').length; if (!n){ toast('No drawings on this slide'); return; } s.objects = s.objects.filter(q => q.kind !== 'ink'); a.renderStage(); a.commit(); a.refreshThumb(); }, {label: 'Erase all'})));
      return true;
    }
    if (t === 'transitions'){ transTab(r); return true; }
    if (t === 'animations'){ animTab(r); return true; }
    if (t === 'review'){
      const sp = a.rb(IC.spell, 'Spell check', spellToggle, {label: 'Spelling'}); if (!a.E.nospell) sp.classList.add('on');
      r.append(a.grp('Proofing', sp, a.rb(IC.count, 'Word count', () => App.info(), {label: 'Word count'})), a.grp('Find', a.rb(IC.find, 'Find and replace', () => Features.findReplace(), {label: 'Find & Replace'})),
        a.grp('Accessibility', a.rb(IC.alt, 'Alt text for the selected picture', altText, {label: 'Alt text', disabled: !o})), a.grp('Notes', a.rb(I0.notes, 'Speaker notes', a.toggleNotes, {label: 'Notes'})));
      return true;
    }
    if (t === 'chart' && o){
      r.append(a.grp('Type', a.rb(IC.chart, 'Change chart type', b => Features.chartPicker(b, k => a.setProp(o => { o.chart = k; })), {label: (CHART_TYPES.find(c => c[0] === o.chart) || [0, 'Chart'])[1], caret: true})),
        a.grp('Data', a.rb(IC.data, 'Edit data', () => Features.chartEditor(o), {label: 'Edit Data'})),
        a.grp('Elements', a.rb(IC.title, 'Chart title', () => { const i = h('input', {class: 'inp', value: o.title || ''}); dialog('Chart title', i, [['Cancel'], ['Save', 'primary', () => a.setProp(o => o.title = i.value.trim())]]); }), a.rb(IC.legend, 'Legend', () => a.setProp(o => o.legend = o.legend === false), {key: 'lg'}), a.rb(IC.labels, 'Data labels', () => a.setProp(o => o.labels = !o.labels), {key: 'dl'})),
        a.grp('Colours', a.rb(IC.palette, 'Chart colours', b => chartColors(b), {caret: true})),
        a.grp('Arrange', a.rb(I0.front, 'Bring to front', () => a.order('front')), a.rb(I0.back, 'Send to back', () => a.order('back')), a.rb(I0.alignC, 'Align centre', () => a.alignMany('c')), a.rb(I0.alignM, 'Align middle', () => a.alignMany('m'))),
        a.grp('Edit', a.rb(I0.dup, 'Duplicate', a.dupSel), a.rb(I0.trash, 'Delete', a.delSel)));
      const lg = r.querySelector('[aria-label="Legend"]'), dl = r.querySelector('[aria-label="Data labels"]'); if (o.legend !== false) lg.classList.add('on'); if (o.labels) dl.classList.add('on');
      return true;
    }
    if (t === 'ink' && o){
      r.append(a.grp('Ink', a.rb(I0.color, 'Ink colour', b => a.colorPop(b, 'Ink colour', c => a.setProp(o => o.paths.forEach(p => p.color = c || p.color))), {label: 'Colour'}), a.rb(IC.pen, 'Thickness', b => a.pop(b, p => [1.5, 3, 5, 8, 14].forEach(w => p.append(a.mi('', w + ' pt', () => a.setProp(o => o.paths.forEach(q => q.width = w)))))), {label: 'Thickness', caret: true})),
        a.grp('Arrange', a.rb(I0.front, 'Bring to front', () => a.order('front')), a.rb(I0.back, 'Send to back', () => a.order('back')), a.rb(I0.rot, 'Rotate 90°', () => a.setProp(o => o.rot = ((o.rot || 0) + 90) % 360))),
        a.grp('Edit', a.rb(I0.dup, 'Duplicate', a.dupSel), a.rb(I0.trash, 'Delete', a.delSel)));
      return true;
    }
    return false;
  }
  function chartColors(anchor){ const a = A(), t = a.th(); a.pop(anchor, p => { p.append(h('div', {class: 'ph'}, 'Colours'));
    const sets = [['Theme', null], ['Colourful', ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47']], ['Ocean', ['#03045E', '#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8']], ['Warm', ['#9D0208', '#DC2F02', '#F48C06', '#FFBA08', '#E85D04']], ['Green', ['#1B4332', '#2D6A4F', '#40916C', '#74C69D', '#B7E4C7']], ['Grey', ['#212529', '#495057', '#868E96', '#ADB5BD', '#DEE2E6']]];
    for (const [n, cols] of sets){ const c = cols || chartPalette(t); const b = a.mi('', n, () => a.setProp(o => { if (cols) o.colors = cols; else delete o.colors; })); b.insertAdjacentHTML('afterbegin', `<span class="palrow">${c.slice(0, 5).map(x => `<i style="background:${x}"></i>`).join('')}</span>`); p.append(b); } }); }
  function extend(t, o, r){
    const a = A(), I0 = I();
    const multi = a.selIds().length > 1;
    if (t === 'home'){
      const mm = a.rb(IC.multi, 'Select several objects', () => { a.E.multiMode = !a.E.multiMode; toast(a.E.multiMode ? 'Tap objects to add them to the selection' : 'Multi-select off'); a.buildRibbon(); }, {label: 'Multi-select'}); if (a.E.multiMode) mm.classList.add('on');
      const fp = a.rb(IC.painter, 'Format Painter', () => a.startPainter(), {label: 'Format Painter'}); if (a.E.painter) fp.classList.add('on');
      r.insertBefore(a.grp('Editing', fp, a.rb(IC.find, 'Find and replace', () => Features.findReplace(), {label: 'Find'}), a.rb(IC.selAll, 'Select all', a.selectAll), mm, a.rb(IC.group, 'Group', a.groupSel), a.rb(IC.ungroup, 'Ungroup', a.ungroupSel)), r.children[2]);
      const para = [...r.children].find(g => g.querySelector('.gl') && g.querySelector('.gl').textContent === 'Paragraph');
      if (para) para.querySelector('.row').append(a.rb(IC.spacing, 'Line spacing', b => lineSpacing(b), {caret: true}), a.rb(IC.cols, 'Columns', b => a.pop(b, p => [1, 2, 3].forEach(n => p.append(a.mi('', n + (n === 1 ? ' column' : ' columns'), () => a.setProp(o => { if (n > 1) o.cols = n; else delete o.cols; })))))), a.rb(IC.caseI, 'Change case', b => changeCase(b), {caret: true}));
      const st = [...r.children].find(g => g.querySelector('.gl') && g.querySelector('.gl').textContent === 'Style'); if (st){ const ts = a.rb(IC.tshadow, 'Text shadow', () => a.setProp(o => o.textShadow = !o.textShadow)); if (o && o.textShadow) ts.classList.add('on'); st.querySelector('.row').append(ts); }
    }
    if (t === 'insert'){
      const tf = h('input', {type: 'file', accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', class: 'fileover'}); tf.addEventListener('change', () => { const f = tf.files[0]; tf.value = ''; if (f) Features.reuseSlides(f); });
      const reuse = h('label', {class: 'rb filepick', title: 'Reuse slides from another presentation', 'aria-label': 'Reuse slides', html: IC.reuse + '<span>Reuse Slides</span>'}); reuse.append(tf);
      r.children[0].querySelector('.row').append(reuse);
      r.append(a.grp('Graphics', a.rb(IC.icons, 'Icons', b => Features.iconPicker(b), {label: 'Icons'}), a.rb(IC.smart, 'SmartArt', b => Features.smartPicker(b), {label: 'SmartArt'}), a.rb(IC.chart, 'Chart', b => Features.chartPicker(b, k => Features.insertChart(k)), {label: 'Chart'})),
        a.grp('Links', a.rb(IC.link, 'Link', () => Features.linkDialog(), {label: 'Link'})),
        a.grp('Text', a.rb(IC.hf, 'Header & Footer', () => Features.headerFooter(), {label: 'Header & Footer'}), a.rb(IC.date, 'Date & Time', () => Features.insertTextAtCaret(new Date().toLocaleDateString(undefined, {day: 'numeric', month: 'long', year: 'numeric'}))), a.rb(IC.num, 'Slide number', () => { const d = a.E.deck; d.hf = {...(d.hf || {}), num: true}; a.renderAll(); a.commit(); toast('Slide numbers added to every slide'); })),
        a.grp('Symbols', a.rb(IC.symbol, 'Symbol', b => Features.symbolPicker(b), {label: 'Symbol'})));
    }
    if (t === 'shape' && o){
      const fx = o.fx || {};
      const sh = a.rb(IC.shadow, 'Shadow', () => setAll(o => { o.fx = {...(o.fx || {}), shadow: !(o.fx && o.fx.shadow)}; })); if (fx.shadow) sh.classList.add('on');
      const gl = a.rb(IC.glow, 'Glow', () => setAll(o => { o.fx = {...(o.fx || {})}; o.fx.glow = o.fx.glow ? null : A().th().accent; })); if (fx.glow) gl.classList.add('on');
      const af = a.rb(IC.autofit, 'Shrink text on overflow', () => a.setProp(o => { o.autofit = !autofitOn(o); if (!o.autofit) delete o.fit; })); if (autofitOn(o)) af.classList.add('on');
      r.insertBefore(a.grp('Effects', a.rb(IC.grad, 'Gradient fill', b => shapeGradient(b), {caret: true}), a.rb(IC.alpha, 'Transparency', b => transparency(b), {caret: true}), sh, gl, af), r.children[1]);
      const ar = [...r.children].find(g => g.querySelector('.gl') && g.querySelector('.gl').textContent === 'Arrange'); if (ar) ar.querySelector('.row').append(a.rb(IC.group, 'Group', a.groupSel), a.rb(IC.ungroup, 'Ungroup', a.ungroupSel), a.rb(IC.distH, 'Distribute horizontally', () => a.distribute('h')), a.rb(IC.distV, 'Distribute vertically', () => a.distribute('v')));
      if (multi){ const al = [...r.children].find(g => g.querySelector('.gl') && g.querySelector('.gl').textContent === 'Align to slide'); if (al) al.querySelector('.gl').textContent = 'Align objects'; }
    }
    if (t === 'picture' && o){
      const sh = a.rb(IC.shadow, 'Shadow', () => setAll(o => { o.fx = {...(o.fx || {}), shadow: !(o.fx && o.fx.shadow)}; })); if (o.fx && o.fx.shadow) sh.classList.add('on');
      const tools = [a.rb(IC.crop, 'Crop', cropDialog, {label: 'Crop'}), a.rb(IC.mask, 'Picture shape', b => picShape(b), {caret: true}), a.rb(IC.border, 'Picture border', b => picBorder(b)), sh, a.rb(IC.adjust, 'Adjust: brightness, contrast, colour', picAdjust, {label: 'Adjust'}), a.rb(IC.alt, 'Alt text', altText)];
      if (o.icon) tools.unshift(a.rb(I0.color + `<span class="sw" style="background:${o.iconColor}"></span>`, 'Icon colour', b => iconColor(b), {label: 'Colour'}));
      r.insertBefore(a.grp('Picture tools', ...tools), r.children[1]);
      const ar = [...r.children].find(g => g.querySelector('.gl') && g.querySelector('.gl').textContent === 'Arrange'); if (ar) ar.querySelector('.row').append(a.rb(IC.group, 'Group', a.groupSel), a.rb(IC.ungroup, 'Ungroup', a.ungroupSel));
    }
    if (t === 'table' && o){ r.insertBefore(a.grp('Table design', a.rb(IC.tstyle, 'Table styles', b => tableStyles(b), {label: 'Styles', caret: true}), a.rb(IC.cellfill, 'Cell fill (tap a cell first)', b => cellFill(b))), r.children[1]); }
    if (t === 'show'){
      const d = a.E.deck; d.show = d.show || {}; const s = a.slide();
      const tog = (icon, label, key, title) => { const b = a.rb(icon, title, () => { d.show[key] = !d.show[key]; a.commit(); a.buildRibbon(); }, {label}); if (d.show[key]) b.classList.add('on'); return b; };
      const hide = a.rb(IC.hide, 'Hide slide in the slide show', () => { s.hidden = !s.hidden; a.commit(); a.renderThumbs(); a.buildRibbon(); }, {label: 'Hide Slide'}); if (s.hidden) hide.classList.add('on');
      r.append(a.grp('Set up', hide, tog(IC.loop, 'Loop', 'loop', 'Loop until Esc'), tog(IC.clock, 'Use Timings', 'timings', 'Use automatic slide timings'), tog(IC.presenter, 'Presenter View', 'presenter', 'Show notes, timer and next slide while presenting')));
    }
    if (t === 'view'){
      const gr = a.rb(IC.gridI, 'Gridlines', toggleGrid, {label: 'Gridlines'}); if (a.E.grid) gr.classList.add('on');
      r.insertBefore(a.grp('Presentation views', a.rb(IC.normal, 'Normal', () => {}, {label: 'Normal'}), a.rb(IC.sorter, 'Slide sorter', slideSorter, {label: 'Slide Sorter'}), a.rb(IC.outline, 'Outline view', outlineView, {label: 'Outline'})), r.children[0]);
      r.children[1].querySelector('.row').append(gr);
    }
  }
  function onSelect(){ markAnims(); }
  function activate(o){ if (o.kind === 'chart') Features.chartEditor(o); }
  return {buildTab, extend, onSelect, activate, setTool, toolDown, toolMove, toolUp, markAnims, ANIMS, ACLS, anims, TRANS};
})());
