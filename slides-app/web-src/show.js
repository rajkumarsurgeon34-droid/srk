/* SRK Slides — slide show: transitions (incl. Morph), animations, pen, laser, presenter view, timings, loop */
'use strict';
const Show = (() => {
  const h = (...a) => Editor.h(...a);
  const EASE = 'cubic-bezier(.2,.7,.2,1)';
  /* -------- animation effects (Web Animations API) -------- */
  function fxFrames(fx, o, H){
    const base = objTransform(o) || 'none', b = base === 'none' ? '' : ' ' + base;
    switch (fx){
      case 'fade': return [{opacity: 0}, {opacity: 1}];
      case 'fly': return [{transform: `translateY(${H - o.y + 20}px)${b}`}, {transform: base}];
      case 'float': return [{opacity: 0, transform: `translateY(40px)${b}`}, {opacity: 1, transform: base}];
      case 'wipe': return [{clipPath: 'inset(0 100% 0 0)'}, {clipPath: 'inset(0 0 0 0)'}];
      case 'zoom': return [{opacity: 0, transform: `scale(.3)${b}`}, {opacity: 1, transform: base}];
      case 'grow': return [{opacity: 0, transform: `scale(.15) rotate(-90deg)${b}`}, {opacity: 1, transform: base}];
      case 'bounce': return [{transform: `translateY(${-o.y - o.h - 20}px)${b}`}, {transform: base, offset: .6}, {transform: `translateY(-28px)${b}`, offset: .78}, {transform: base, offset: .9}, {transform: `translateY(-8px)${b}`, offset: .95}, {transform: base}];
      case 'pulse': return [{transform: base}, {transform: `scale(1.1)${b}`}, {transform: base}];
      case 'spin': return [{transform: base}, {transform: `${b} rotate(360deg)`}];
      case 'teeter': return [{transform: base}, {transform: `${b} rotate(6deg)`}, {transform: `${b} rotate(-6deg)`}, {transform: `${b} rotate(4deg)`}, {transform: `${b} rotate(-2deg)`}, {transform: base}];
      case 'grow2': return [{transform: base}, {transform: `scale(1.25)${b}`}];
      case 'fadeout': return [{opacity: 1}, {opacity: 0}];
      case 'flyout': return [{transform: base}, {transform: `translateY(${H - o.y + 20}px)${b}`}];
      case 'zoomout': return [{opacity: 1, transform: base}, {opacity: 0, transform: `scale(.3)${b}`}];
      default: return null; // appear / disappear
    }
  }
  /* split a slide's animations into click groups with start times (ms) */
  function plan(slide){
    const list = Features.anims(slide); const groups = []; let g = null, prevEnd = 0, prevStart = 0;
    list.forEach((x, i) => {
      const dur = (x.dur || 0) * 1000, delay = (x.delay || 0) * 1000;
      if (!g || x.start === 'click'){ g = {auto: i === 0 && x.start !== 'click', items: []}; groups.push(g); prevEnd = 0; prevStart = 0; }
      const at = x.start === 'after' ? prevEnd + delay : x.start === 'with' ? prevStart + delay : delay;
      g.items.push({x, at, dur}); prevStart = at; prevEnd = Math.max(prevEnd, at + dur);
    });
    return groups;
  }
  function runItem(el, it, o, H, running){
    const cls = Features.ACLS[it.x.fx], frames = fxFrames(it.x.fx, o, H);
    return setTimeout(() => {
      if (cls === 'in') el.style.visibility = 'visible';
      if (frames && it.dur){ const an = el.animate(frames, {duration: it.dur, easing: cls === 'em' ? 'ease-in-out' : EASE, fill: it.x.fx === 'grow2' ? 'forwards' : 'none'}); running.push(an); if (cls === 'out') an.onfinish = () => el.style.visibility = 'hidden'; }
      else if (cls === 'out') el.style.visibility = 'hidden';
    }, it.at);
  }
  /* entrance-animated objects start hidden */
  function prepare(slideEl, slide, built){
    const groups = plan(slide); const firstIn = {};
    groups.forEach((g, gi) => g.items.forEach(it => { const id = it.x.obj; if (!(id in firstIn)) firstIn[id] = {cls: Features.ACLS[it.x.fx], gi}; }));
    for (const [id, f] of Object.entries(firstIn)){ const el = slideEl.querySelector(`.obj[data-id="${id}"]`); if (!el) continue; if (built){ // end state
        const last = [...groups.flatMap(g => g.items)].reverse().find(it => it.x.obj === id); el.style.visibility = Features.ACLS[last.x.fx] === 'out' ? 'hidden' : 'visible'; }
      else if (f.cls === 'in') el.style.visibility = 'hidden'; }
    return groups;
  }

  /* -------- transitions -------- */
  function transition(newL, oldL, s, W, H, k){
    const t = s.transition || 'none', dur = (s.trDur || 0.8) * 1000, dir = s.trDir;
    if (t === 'none' || !oldL){ oldL && oldL.remove(); return; }
    const done = () => oldL.remove(); const opt = {duration: dur, easing: EASE, fill: 'both'};
    const off = {u: ['0', '100%'], d: ['0', '-100%'], l: ['100%', '0'], r: ['-100%', '0']};
    let an;
    if (t === 'fade' || t === 'morph'){ an = newL.animate([{opacity: 0}, {opacity: 1}], opt); }
    else if (t === 'push'){ const m = {u: [['0', '100%'], ['0', '-100%']], d: [['0', '-100%'], ['0', '100%']], l: [['100%', '0'], ['-100%', '0']], r: [['-100%', '0'], ['100%', '0']]}[dir || 'u']; an = newL.animate([{transform: `translate(${m[0][0]},${m[0][1]})`}, {transform: 'none'}], opt); oldL.animate([{transform: 'none'}, {transform: `translate(${m[1][0]},${m[1][1]})`}], opt); }
    else if (t === 'wipe'){ const c = {r: 'inset(0 100% 0 0)', l: 'inset(0 0 0 100%)', d: 'inset(0 0 100% 0)', u: 'inset(100% 0 0 0)'}[dir || 'r']; an = newL.animate([{clipPath: c}, {clipPath: 'inset(0 0 0 0)'}], opt); }
    else if (t === 'split'){ an = newL.animate([{clipPath: 'inset(0 50% 0 50%)'}, {clipPath: 'inset(0 0 0 0)'}], opt); }
    else if (t === 'cover'){ const [x, y] = off[{l: 'l', r: 'r', u: 'u', d: 'd'}[dir || 'l']]; an = newL.animate([{transform: `translate(${x},${y})`}, {transform: 'none'}], opt); }
    else if (t === 'uncover'){ newL.parentNode.insertBefore(newL, oldL); const m = {l: 'translate(-100%,0)', r: 'translate(100%,0)', u: 'translate(0,-100%)', d: 'translate(0,100%)'}[dir || 'l']; an = oldL.animate([{transform: 'none'}, {transform: m}], opt); }
    else if (t === 'zoom'){ an = newL.animate([{opacity: 0, transform: 'scale(.3)'}, {opacity: 1, transform: 'none'}], opt); }
    else if (t === 'flip'){ newL.style.visibility = 'hidden'; const a1 = oldL.animate([{transform: 'perspective(1600px) rotateY(0)'}, {transform: 'perspective(1600px) rotateY(90deg)'}], {duration: dur / 2, easing: 'ease-in', fill: 'both'});
      a1.onfinish = () => { oldL.style.visibility = 'hidden'; newL.style.visibility = 'visible'; newL.animate([{transform: 'perspective(1600px) rotateY(-90deg)'}, {transform: 'none'}], {duration: dur / 2, easing: 'ease-out', fill: 'both'}).onfinish = done; }; return; }
    else { an = newL.animate([{opacity: 0}, {opacity: 1}], opt); }
    an.onfinish = done;
  }
  /* Morph: objects present on both slides glide from their old place, size and angle to the new one */
  function morph(newEl, oldEl, prev, s, dur){
    const key = o => o.mk || o.id; const old = new Map(prev.objects.map(o => [key(o), o]));
    for (const o of s.objects){ const p = old.get(key(o)); const el = newEl.querySelector(`.obj[data-id="${o.id}"]`); if (!el) continue;
      if (!p){ el.animate([{opacity: 0}, {opacity: 0, offset: .4}, {opacity: 1}], {duration: dur, fill: 'both'}); continue; }
      const oe = oldEl.querySelector(`.obj[data-id="${p.id}"]`); if (oe) oe.style.visibility = 'hidden';
      const dx = (p.x + p.w / 2) - (o.x + o.w / 2), dy = (p.y + p.h / 2) - (o.y + o.h / 2), sx = (p.w || 1) / (o.w || 1), sy = (p.h || 1) / (o.h || 1);
      el.animate([{transform: `translate(${dx}px,${dy}px) rotate(${p.rot || 0}deg) scale(${sx},${sy})`}, {transform: objTransform(o) || 'none'}], {duration: dur, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both'});
    }
  }

  /* -------- the show -------- */
  let S = null;
  function present(from = 0){
    Editor.flush(); const deck = Editor.deck; if (!deck) return; const cfg = deck.show || {};
    const order = deck.slides.map((s, i) => i).filter(i => !deck.slides[i].hidden || i === from); if (!order.length) return;
    const ov = h('div', {class: 'show' + (cfg.presenter ? ' presenter' : ''), role: 'dialog', 'aria-label': 'Slide show'});
    const area = h('div', {class: 'sarea'}), stage = h('div', {class: 'sstage'}); area.append(stage);
    const ink = h('canvas', {class: 'sink'}); const laser = h('div', {class: 'laser'}); const blank = h('div', {class: 'sblank'}); stage.append(ink); area.append(laser, blank);
    const cnt = h('span', {class: 'scnt'});
    const B = (label, title, fn) => { const b = h('button', {type: 'button', title, 'aria-label': title}, label); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); return b; };
    const penB = B('✎', 'Pen', () => setMode(S.mode === 'pen' ? null : 'pen')), lasB = B('◉', 'Laser pointer', () => setMode(S.mode === 'laser' ? null : 'laser'));
    const ctl = h('div', {class: 'sctl'}, cnt, B('‹', 'Previous', () => go(-1)), B('›', 'Next', () => go(1)), penB, lasB, B('▦', 'See all slides', () => navigator()), B('◐', 'Black screen', () => blackout('#000')), B('✕', 'End show', () => end()));
    const side = h('aside', {class: 'pside'}); const timer = h('div', {class: 'ptimer'}, '0:00'); const nextM = h('div', {class: 'pnext'}); const notesP = h('div', {class: 'pnotes'});
    side.append(h('div', {class: 'plbl'}, 'Elapsed'), timer, h('div', {class: 'plbl'}, 'Next slide'), nextM, h('div', {class: 'plbl'}, 'Notes'), notesP);
    ov.append(area, side, ctl); document.body.append(ov);
    S = {bg: {}, deck, order, pos: Math.max(0, order.indexOf(from)), step: 0, groups: [], running: [], timers: [], ov, stage, area, layer: null, slideEl: null, mode: null, t0: Date.now(), ended: false, adv: null};
    if (window.SRKSlides && SRKSlides.setLandscape) try { SRKSlides.setLandscape(true); } catch(e){}
    try { if (!window.SRK_NATIVE && ov.requestFullscreen) ov.requestFullscreen().catch(() => {}); } catch(e){}
    try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => S && (S.lock = l)).catch(() => {}); } catch(e){}
    if (innerHeight > innerWidth && !window.SRKSlides){ const hint = h('div', {class: 'hintrot'}, 'Turn your phone sideways for bigger slides'); ov.append(hint); setTimeout(() => hint.remove(), 3500); }
    const tick = setInterval(() => { if (!S) return; const s = Math.floor((Date.now() - S.t0) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    function geom(){ const W = deck.size.w, H = deck.size.h, r = area.getBoundingClientRect(); const k = Math.min(r.width / W, r.height / H); return {W, H, k}; }
    function clearTimers(){ S.timers.forEach(clearTimeout); S.timers = []; S.running.forEach(a => { try { a.finish(); } catch(e){} }); S.running = []; clearTimeout(S.adv); }
    function draw(anim, built){
      clearTimers(); clearInk(); const {W, H, k} = geom(); stage.style.cssText = `width:${W * k}px;height:${H * k}px;margin-left:${-W * k / 2}px;margin-top:${-H * k / 2}px`;
      ink.width = Math.round(W * k * devicePixelRatio); ink.height = Math.round(H * k * devicePixelRatio);
      if (S.ended){ stage.querySelectorAll('.slayer').forEach(n => n.remove()); stage.prepend(h('div', {class: 'slayer end'}, 'End of slide show. Tap to exit.')); cnt.textContent = ''; return; }
      const si = S.order[S.pos], s = deck.slides[si]; const el = renderSlide(s, deck, {edit: false, live: true}); el.style.transform = `scale(${k})`; setupMedia(el, s, anim);
      const L = h('div', {class: 'slayer'}); L.append(el); const old = S.layer, oldEl = S.slideEl, prev = S.prevSlide;
      stage.insertBefore(L, ink); S.layer = L; S.slideEl = el; S.prevSlide = s; stage.querySelectorAll('.slayer.end').forEach(n => n.remove());
      S.groups = prepare(el, s, built); S.step = built ? S.groups.length : 0;
      if (anim){ if (s.transition === 'morph' && old && prev) morph(el, oldEl, prev, s, (s.trDur || 1.2) * 1000); transition(L, old, s, W, H, k); } else if (old) old.remove();
      cnt.textContent = `${S.pos + 1} / ${S.order.length}`; notesP.textContent = s.notes || '—';
      const nx = S.order[S.pos + 1]; nextM.innerHTML = ''; if (nx != null){ requestAnimationFrame(() => miniSlide(nextM, deck.slides[nx], deck)); } else nextM.textContent = 'End of show';
      el.addEventListener('click', e => { const a = e.target.closest('a[href]'); if (a){ e.preventDefault(); e.stopPropagation(); const u = a.getAttribute('href'); if (window.SRK_NATIVE) location.href = u; else window.open(u, '_blank', 'noopener'); } }, true);
      if (!built && S.groups[0] && S.groups[0].auto) playGroup();
      schedule();
    }
    /* video & audio on the slide */
    function setupMedia(el, s, anim){
      const delay = anim && s.transition && s.transition !== 'none' ? (s.trDur || 0.8) * 1000 : 0;
      for (const o of s.objects.filter(q => q.kind === 'media' && q.mtype !== 'online')){
        const box = el.querySelector(`.obj[data-id="${o.id}"]`); if (!box) continue; let m = box.querySelector('video,audio');
        if (o.mtype === 'audio' && o.across){ if (!S.bg[o.id]){ const a = new Audio(mediaUrl(o.ref)); a.loop = !!o.loop; S.bg[o.id] = a; wire(a, o); if (o.start === 'auto') S.timers.push(setTimeout(() => a.play().catch(() => {}), delay)); } m = S.bg[o.id]; box.querySelector('audio') && box.querySelector('audio').remove(); }
        else wire(m, o);
        if (o.mtype === 'audio') box.addEventListener('click', e => { e.stopPropagation(); m.paused ? m.play().catch(() => {}) : m.pause(); box.classList.toggle('playing', !m.paused); });
        if (o.start === 'auto' && !(o.mtype === 'audio' && o.across)) S.timers.push(setTimeout(() => { m.play().then(() => box.classList.add('playing')).catch(() => {}); }, delay + 50));
      }
    }
    function wire(m, o){ if (!m || m.dataset && m.dataset.wired) return; if (m.dataset) m.dataset.wired = '1'; m.volume = Math.max(0, Math.min(1, o.vol ?? 1)); const tr = o.trim;
      if (tr && (tr.start || tr.end)){ const st = () => { if (tr.start && m.currentTime < tr.start - .05) m.currentTime = tr.start; }; m.addEventListener('loadedmetadata', st); m.addEventListener('play', st);
        m.addEventListener('timeupdate', () => { if (tr.end && m.currentTime >= tr.end){ if (o.loop) m.currentTime = tr.start || 0; else { m.pause(); m.currentTime = tr.start || 0; } } }); } }
    function playGroup(){ const g = S.groups[S.step]; if (!g) return false; S.step++; const {H} = geom(); const s = deck.slides[S.order[S.pos]];
      let end = 0; for (const it of g.items){ const o = s.objects.find(q => q.id === it.x.obj); const el = S.slideEl.querySelector(`.obj[data-id="${it.x.obj}"]`); if (!o || !el) continue; S.timers.push(runItem(el, it, o, H, S.running)); end = Math.max(end, it.at + it.dur); }
      const nxt = S.groups[S.step]; if (nxt && nxt.auto) S.timers.push(setTimeout(playGroup, end));
      return true; }
    function schedule(){ clearTimeout(S.adv); const s = deck.slides[S.order[S.pos]]; if (!cfg.timings || !s || !s.advance || S.ended) return; S.adv = setTimeout(function auto(){ if (!S) return; if (S.step < S.groups.length){ playGroup(); S.adv = setTimeout(auto, 1200); } else go(1); }, s.advance * 1000); }
    function go(d){
      if (!S) return; if (S.blank){ blackout(null); return; }
      if (S.ended){ if (d < 0){ S.ended = false; draw(false, true); } else end(); return; }
      if (d > 0){ S.running.forEach(a => { try { a.finish(); } catch(e){} }); if (S.step < S.groups.length && playGroup()) return;
        if (S.pos + 1 >= S.order.length){ if (cfg.loop){ S.pos = 0; draw(true); } else { S.ended = true; draw(); } return; } S.pos++; draw(true); }
      else { if (S.pos <= 0) return; S.pos--; draw(false, true); }
    }
    function goTo(p){ S.ended = false; S.pos = p; draw(true); }
    function end(){ if (!S) return; clearTimers(); Object.values(S.bg).forEach(a => { try { a.pause(); } catch(e){} }); clearInterval(tick); try { S.lock && S.lock.release(); } catch(e){} S = null; ov.remove(); document.removeEventListener('keydown', key, true); removeEventListener('resize', rs);
      if (window.SRKSlides && SRKSlides.setLandscape) try { SRKSlides.setLandscape(false); } catch(e){} try { if (document.fullscreenElement) document.exitFullscreen(); } catch(e){} Editor.layoutStage(); }
    function blackout(c){ S.blank = c; blank.style.background = c || 'transparent'; blank.style.display = c ? 'block' : 'none'; }
    function setMode(m){ S.mode = m; ov.dataset.mode = m || ''; penB.classList.toggle('on', m === 'pen'); lasB.classList.toggle('on', m === 'laser'); laser.style.display = 'none'; }
    function clearInk(){ const c = ink.getContext('2d'); c.clearRect(0, 0, ink.width, ink.height); }
    function navigator(){ const g = h('div', {class: 'snav'}); const grid = h('div', {class: 'snavgrid'}); g.append(grid);
      S.order.forEach((si, p) => { const m = h('div', {class: 'smi'}); const b = h('button', {type: 'button', class: p === S.pos ? 'cur' : ''}, m, h('span', {}, String(p + 1))); b.addEventListener('click', e => { e.stopPropagation(); g.remove(); goTo(p); }); grid.append(b); requestAnimationFrame(() => miniSlide(m, deck.slides[si], deck)); });
      g.addEventListener('click', e => { if (e.target === g) g.remove(); }); ov.append(g); }
    let num = '';
    const key = e => { if (!S) return; e.stopPropagation(); const k = e.key;
      if (/^[0-9]$/.test(k)){ num += k; return; } if (k === 'Enter' && num){ e.preventDefault(); const p = Math.min(S.order.length, Math.max(1, +num)) - 1; num = ''; goTo(p); return; } num = '';
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)){ e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)){ e.preventDefault(); go(-1); }
      else if (k === 'Escape'){ e.preventDefault(); if (ov.querySelector('.snav')) ov.querySelector('.snav').remove(); else if (S.mode) setMode(null); else end(); }
      else if (k === 'b' || k === 'B' || k === '.'){ blackout(S.blank ? null : '#000'); } else if (k === 'w' || k === 'W' || k === ','){ blackout(S.blank ? null : '#FFF'); }
      else if (k === 'Home'){ goTo(0); } else if (k === 'End'){ goTo(S.order.length - 1); } else if (k === 'g' || k === 'G'){ navigator(); } else if (k === 'e' || k === 'E'){ clearInk(); } };
    const rs = () => S && draw(false, true);
    document.addEventListener('keydown', key, true); addEventListener('resize', rs);
    document.addEventListener('fullscreenchange', function fc(){ if (!document.fullscreenElement && S && !window.SRK_NATIVE && S.fs) end(); if (document.fullscreenElement && S) S.fs = true; if (!S) document.removeEventListener('fullscreenchange', fc); });
    /* pointer: tap/swipe to move, or draw / point */
    let sx = null, sy = null, drawing = false, uiT;
    const ui = () => { ov.classList.add('ui'); clearTimeout(uiT); uiT = setTimeout(() => ov.classList.remove('ui'), 3000); };
    const inkPt = e => { const r = ink.getBoundingClientRect(); return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio]; };
    area.addEventListener('pointerdown', e => { if (e.target.closest('.sctl,.snav')) return; if (e.target.closest('video,iframe,.obj.media')){ sx = null; return; }
      if (S.mode === 'pen'){ drawing = true; const c = ink.getContext('2d'); c.strokeStyle = '#E53935'; c.lineWidth = 3 * devicePixelRatio; c.lineCap = c.lineJoin = 'round'; c.beginPath(); c.moveTo(...inkPt(e)); area.setPointerCapture(e.pointerId); return; }
      if (S.mode === 'laser'){ laser.style.display = 'block'; laser.style.left = e.clientX + 'px'; laser.style.top = e.clientY + 'px'; area.setPointerCapture(e.pointerId); return; }
      sx = e.clientX; sy = e.clientY; });
    area.addEventListener('pointermove', e => { if (S.mode === 'pen' && drawing){ const c = ink.getContext('2d'); c.lineTo(...inkPt(e)); c.stroke(); return; } if (S.mode === 'laser'){ laser.style.display = 'block'; laser.style.left = e.clientX + 'px'; laser.style.top = e.clientY + 'px'; return; } if (e.pointerType === 'mouse') ui(); });
    area.addEventListener('pointerup', e => { if (S.mode === 'pen'){ drawing = false; return; } if (S.mode === 'laser'){ if (e.pointerType !== 'mouse') laser.style.display = 'none'; return; } if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){ go(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12){ if (e.target.closest('a[href],video,iframe,.obj.media')) return; if (e.pointerType !== 'mouse' && !ov.classList.contains('ui') && e.clientY > innerHeight * 0.78){ ui(); return; } go(e.clientX < area.getBoundingClientRect().left + area.clientWidth * 0.3 ? -1 : 1); } });
    ov.addEventListener('contextmenu', e => e.preventDefault());
    draw(true); ui();
  }
  /* -------- previews inside the editor -------- */
  function previewTransition(){ const a = Editor.api, el = a.slideEl; if (!el) return; const s = a.slide(); const L = el.parentNode; const fake = document.createElement('div');
    const W = Editor.deck.size.w, H = Editor.deck.size.h; const t = s.transition || 'none'; if (t === 'none'){ a.toast('This slide has no transition'); return; }
    const dur = (s.trDur || 0.8) * 1000, opt = {duration: dur, easing: EASE};
    const frames = {fade: [{opacity: 0}, {opacity: 1}], morph: [{opacity: 0}, {opacity: 1}], push: [{translate: '0 100%'}, {translate: '0 0'}], wipe: [{clipPath: 'inset(0 100% 0 0)'}, {clipPath: 'inset(0 0 0 0)'}], split: [{clipPath: 'inset(0 50% 0 50%)'}, {clipPath: 'inset(0 0 0 0)'}],
      cover: [{translate: '100% 0'}, {translate: '0 0'}], uncover: [{opacity: 0}, {opacity: 1}], zoom: [{opacity: 0, scale: '.3'}, {opacity: 1, scale: '1'}], flip: [{transform: el.style.transform + ' perspective(1600px) rotateY(-90deg)'}, {transform: el.style.transform}]}[t];
    L.style.overflow = 'hidden'; el.animate(frames, opt).onfinish = () => { L.style.overflow = ''; }; }
  function previewAnims(only){ const a = Editor.api; a.renderStage(); const el = a.slideEl, s = a.slide(); const groups = prepare(el, s, false); const H = Editor.deck.size.h; let t = 300; const running = [];
    for (const g of groups){ let end = 0; for (const it of g.items){ const o = s.objects.find(q => q.id === it.x.obj); const oe = el.querySelector(`.obj[data-id="${it.x.obj}"]`); if (!o || !oe) continue; runItem(oe, {...it, at: t + it.at}, o, H, running); end = Math.max(end, it.at + it.dur); } t += end + 350; }
    setTimeout(() => { if (Editor.api.slideEl === el) a.renderStage(); }, t + 200); }
  return {present, previewTransition, previewAnims, plan};
})();
