/* SRK Slides — video & audio: insert from phone, record, online video, playback options (the Playback tab) */
'use strict';
Object.assign(Features, (() => {
  const A = () => Editor.api; const h = (...a) => A().h(...a); const toast = m => A().toast(m); const dialog = (t, b, a) => App.dialog(t, b, a);
  const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IM = {
    video: S('<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>'), audio: S('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    recA: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'), recV: S('<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3z"/><circle cx="9" cy="12" r="2.5" fill="currentColor"/>'),
    online: S('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9v6l5-3z" fill="currentColor"/>'), play: S('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'), loop: S('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
    across: S('<rect x="2" y="7" width="8" height="10" rx="1"/><rect x="14" y="7" width="8" height="10" rx="1"/><path d="M8 12h8M13 9l3 3-3 3"/>'), hide: S('<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7 0 .9-.7 2.3-2 3.7M6.5 6.6C4.4 8 3 10.2 3 12c0 2 4 7 9 7 1.5 0 2.9-.4 4.1-1"/>'),
    trim: S('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'), poster: S('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'), vol: S('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
  };
  const EXT = {'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/amr': 'amr'};
  const extOf = (file) => { const e = (file.name || '').split('.').pop().toLowerCase(); return /^[a-z0-9]{2,4}$/.test(e) && e !== (file.name || '').toLowerCase() ? e : EXT[(file.type || '').split(';')[0]] || 'mp4'; };
  function blobMeta(url, mtype){ return new Promise(res => { const el = document.createElement(mtype === 'audio' ? 'audio' : 'video'); el.preload = 'metadata'; el.muted = true; el.playsInline = true; let done = false; const fin = v => { if (!done){ done = true; res(v); } };
    el.onloadedmetadata = () => { if (mtype === 'audio') return fin({dur: el.duration}); const w = el.videoWidth, hh = el.videoHeight; el.currentTime = Math.min(1, (el.duration || 2) * 0.1); el.onseeked = () => { let poster = null; try { const c = document.createElement('canvas'); const k = Math.min(1, 1280 / Math.max(w, hh)); c.width = Math.round(w * k) || 640; c.height = Math.round(hh * k) || 360; c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); poster = c.toDataURL('image/jpeg', 0.85); } catch(e){} fin({w, h: hh, dur: el.duration, poster}); }; };
    el.onerror = () => fin({}); setTimeout(() => fin({}), 8000); el.src = url; }); }
  async function insertMedia(file, mtype){
    const a = A(); if (!file) return; mtype = mtype || (/^audio\//.test(file.type) ? 'audio' : 'video');
    if (file.size > 300 * 1048576){ toast('That file is bigger than 300 MB. Choose a shorter or smaller clip.'); return; }
    if (file.size > 80 * 1048576) toast('Large video: the presentation file will be big too.');
    const id = uid(); const blob = file.slice(0, file.size, file.type || (mtype === 'audio' ? 'audio/mpeg' : 'video/mp4'));
    try { await App.Blobs.put(id, blob); } catch(e){ toast('Not enough storage space on this phone for that file.'); return; }
    MEDIA_BLOBS.set(id, blob); const d = a.E.deck; d.blobIds = [...new Set([...(d.blobIds || []), id])];
    const meta = await blobMeta(mediaUrl('b:' + id), mtype); const W = d.size.w, H = d.size.h;
    const o = {id: uid(), kind: 'media', mtype, ref: 'b:' + id, mime: blob.type, ext: extOf(file), name: file.name || (mtype === 'audio' ? 'Audio' : 'Video'), start: 'click', loop: false, vol: 1, rot: 0};
    if (mtype === 'video'){ let w = meta.w || 16, hh = meta.h || 9; const k = Math.min(W * .7 / w, H * .7 / hh); w *= k; hh *= k; Object.assign(o, {w: Math.round(w), h: Math.round(hh), x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2)}); if (meta.poster){ const pid = uid(); d.media[pid] = meta.poster; o.poster = 'm:' + pid; } if (meta.w == null) toast('This phone can’t preview that video format, but it will still be saved in the file.'); }
    else Object.assign(o, {w: 64, h: 64, x: Math.round(W / 2 - 32), y: Math.round(H / 2 - 32)});
    if (meta.dur) o.dur = Math.round(meta.dur * 10) / 10;
    a.addObj(o); a.E.tab = 'media'; a.buildTabs();
  }
  function onlineVideo(){
    const u = h('input', {class: 'inp', type: 'url', placeholder: 'https://youtu.be/…', 'aria-label': 'Video address'});
    dialog('Online video', h('div', {style: 'display:flex;flex-direction:column;gap:8px'}, h('p', {class: 'hint'}, 'Paste a YouTube link. It plays in the slide show when the phone is online.'), u),
      [['Cancel'], ['Insert', 'primary', () => { const link = u.value.trim(); const yid = youtubeId(link); if (!yid){ toast('That doesn’t look like a YouTube link'); return false; }
        const a = A(), W = a.E.deck.size.w, H = a.E.deck.size.h, w = Math.round(W * .7), hh = Math.round(w * 9 / 16);
        a.addObj({id: uid(), kind: 'media', mtype: 'online', link: `https://www.youtube.com/watch?v=${yid}`, poster: `https://img.youtube.com/vi/${yid}/hqdefault.jpg`, name: 'YouTube video', start: 'click', x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2), w, h: hh, rot: 0}); a.E.tab = 'media'; a.buildTabs(); }]]);
  }
  /* record audio with the microphone */
  async function recordAudio(){
    if (!navigator.mediaDevices || !window.MediaRecorder){ toast('Recording isn’t available here. Use the SRK Slides app or Chrome.'); return; }
    const types = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm']; const type = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    let stream = null, rec = null, chunks = [], t0 = 0, tick = null;
    const time = h('div', {class: 'rectime'}, '0:00'), dot = h('span', {class: 'recdot'}), btn = h('button', {class: 'btn primary', type: 'button'}, '● Start recording'), status = h('p', {class: 'hint'}, 'Tap Start, speak, then tap Stop. The clip goes on this slide.');
    const stop = () => { clearInterval(tick); if (rec && rec.state !== 'inactive') rec.stop(); if (stream) stream.getTracks().forEach(t => t.stop()); };
    btn.addEventListener('click', async () => {
      if (rec && rec.state === 'recording'){ btn.disabled = true; stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch(e){ status.textContent = 'Microphone permission was not given. Allow it in the phone’s settings for SRK Slides, then try again.'; return; }
      chunks = []; rec = new MediaRecorder(stream, type ? {mimeType: type} : undefined); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => { const mime = (rec.mimeType || type || 'audio/webm').split(';')[0]; const blob = new Blob(chunks, {type: mime}); const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
        document.querySelectorAll('.dlg-back').forEach(n => n.remove()); if (blob.size) insertMedia(new File([blob], `Recording ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}.${ext}`, {type: mime}), 'audio'); };
      rec.start(250); t0 = Date.now(); dot.classList.add('on'); btn.textContent = '■ Stop'; status.textContent = 'Recording…';
      tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 250);
    });
    dialog('Record audio', h('div', {style: 'display:flex;flex-direction:column;gap:12px;align-items:center'}, h('div', {class: 'recrow'}, dot, time), btn, status), [['Cancel', '', () => { stop(); rec = null; }]]);
  }
  /* playback preview, poster frame and trimming */
  function player(o, mode){
    const a = A(); if (o.mtype === 'online'){ window.open(o.link, '_blank', 'noopener'); return; }
    const el = document.createElement(o.mtype === 'audio' ? 'audio' : 'video'); el.src = mediaUrl(o.ref); el.controls = true; el.playsInline = true; el.className = 'mprev'; el.volume = o.vol ?? 1; if (o.poster) el.poster = mediaSrc(a.E.deck, o.poster);
    const body = h('div', {style: 'display:flex;flex-direction:column;gap:10px'}, el);
    const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    if (mode === 'trim'){ const tr = o.trim || {start: 0, end: 0}; const st = h('input', {class: 'inp', type: 'number', min: 0, step: 0.1, value: tr.start || 0, 'aria-label': 'Start (seconds)'}), en = h('input', {class: 'inp', type: 'number', min: 0, step: 0.1, value: tr.end || '', placeholder: 'End', 'aria-label': 'End (seconds)'});
      const setS = h('button', {class: 'btn sm', type: 'button'}, 'Start here'), setE = h('button', {class: 'btn sm', type: 'button'}, 'End here'); setS.addEventListener('click', () => st.value = el.currentTime.toFixed(1)); setE.addEventListener('click', () => en.value = el.currentTime.toFixed(1));
      el.addEventListener('loadedmetadata', () => { if (!en.value) en.placeholder = 'End (' + el.duration.toFixed(1) + ' s)'; if (tr.start) el.currentTime = tr.start; });
      body.append(h('p', {class: 'hint'}, 'Play to the moment you want, then tap Start here or End here. Times are in seconds.'), h('div', {class: 'gradrow'}, h('label', {class: 'f', style: 'flex:1'}, 'Start', st), setS), h('div', {class: 'gradrow'}, h('label', {class: 'f', style: 'flex:1'}, 'End', en), setE));
      dialog('Trim ' + (o.mtype === 'audio' ? 'audio' : 'video'), body, [['Cancel', '', () => el.pause()], ['Trim', 'primary', () => { el.pause(); const s = Math.max(0, +st.value || 0), e = +en.value || 0; if (s || e) o.trim = {start: s, end: e > s ? e : 0}; else delete o.trim; a.commit(); toast(o.trim ? `Plays ${fmt(o.trim.start)}${o.trim.end ? ' to ' + fmt(o.trim.end) : ' to the end'}` : 'Trim removed'); }]]);
      return; }
    const acts = [['Close', 'primary', () => el.pause()]];
    if (o.mtype === 'video') acts.unshift(['Use this frame as poster', '', () => { try { const c = document.createElement('canvas'); const k = Math.min(1, 1280 / Math.max(el.videoWidth, el.videoHeight)); c.width = el.videoWidth * k; c.height = el.videoHeight * k; c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); const pid = uid(); a.E.deck.media[pid] = c.toDataURL('image/jpeg', 0.85); o.poster = 'm:' + pid; el.pause(); a.updateObjEl(o); a.commit(); a.refreshThumb(); toast('Poster frame set'); } catch(e){ toast('Couldn’t take that frame'); return false; } }]);
    dialog(o.name || 'Preview', body, acts); if (o.trim && o.trim.start) el.addEventListener('loadedmetadata', () => el.currentTime = o.trim.start);
  }
  function mediaTab(o, r){
    const a = A(), I0 = a.I; const tog = (icon, label, key, title, on) => { const b = a.rb(icon, title, () => a.setProp(x => x[key] = !x[key]), {label}); if (on) b.classList.add('on'); return b; };
    const start = h('select', {class: 'rsel', 'aria-label': 'Start', title: 'Start'}); [['click', 'When clicked'], ['auto', 'Automatically']].forEach(([v, n]) => start.append(h('option', {value: v}, n))); start.value = o.start || 'click'; start.addEventListener('change', () => a.setProp(x => x.start = start.value));
    const vol = h('select', {class: 'rsel', 'aria-label': 'Volume', title: 'Volume'}); [['1', 'High'], ['0.6', 'Medium'], ['0.3', 'Low'], ['0', 'Mute']].forEach(([v, n]) => vol.append(h('option', {value: v}, n))); vol.value = String(o.vol ?? 1); vol.addEventListener('change', () => a.setProp(x => x.vol = +vol.value));
    const grpPlay = a.grp('Preview', a.rb(IM.play, 'Play', () => player(o), {label: 'Play'}));
    const opts = [h('span', {class: 'lbl'}, 'Start'), start];
    if (o.mtype !== 'online') opts.push(h('span', {class: 'lbl'}, 'Volume'), vol);
    opts.push(tog(IM.loop, 'Loop', 'loop', 'Loop until stopped', o.loop));
    if (o.mtype === 'audio') opts.push(tog(IM.across, 'Across slides', 'across', 'Play across slides', o.across), tog(IM.hide, 'Hide icon', 'hideInShow', 'Hide during show', o.hideInShow));
    r.append(grpPlay, a.grp(o.mtype === 'audio' ? 'Audio options' : 'Video options', ...opts));
    if (o.mtype !== 'online') r.append(a.grp('Editing', a.rb(IM.trim, 'Trim', () => player(o, 'trim'), {label: 'Trim'}), ...(o.mtype === 'video' ? [a.rb(IM.poster, 'Poster frame', () => player(o), {label: 'Poster Frame'})] : [])));
    r.append(a.grp('Arrange', a.rb(I0.front, 'Bring to front', () => a.order('front')), a.rb(I0.back, 'Send to back', () => a.order('back')), a.rb(I0.alignC, 'Align centre', () => a.alignMany('c')), a.rb(I0.alignM, 'Align middle', () => a.alignMany('m'))),
      a.grp('Edit', a.rb(I0.dup, 'Duplicate', a.dupSel), a.rb(I0.trash, 'Delete', a.delSel)));
    if (o.dur) r.append(h('div', {class: 'grp'}, h('div', {class: 'row', style: 'font-size:13px;color:var(--muted);padding:0 6px'}, `${o.name || ''} · ${Math.floor(o.dur / 60)}:${String(Math.round(o.dur % 60)).padStart(2, '0')}`), h('div', {class: 'gl'}, 'Clip')));
  }
  function mediaGroup(){
    const a = A();
    const fb = (icon, title, label, accept, fn, capture) => { const l = h('label', {class: 'rb filepick', title, 'aria-label': title, html: icon + `<span>${label}</span>`}); const i = h('input', {type: 'file', accept, class: 'fileover'}); if (capture) i.setAttribute('capture', capture); i.addEventListener('change', () => { const f = i.files[0]; i.value = ''; if (f) fn(f); }); l.append(i); return l; };
    return a.grp('Media', fb(IM.video, 'Video from this phone', 'Video', 'video/*', f => insertMedia(f, 'video')), fb(IM.recV, 'Record a video with the camera', 'Record Video', 'video/*', f => insertMedia(f, 'video'), 'environment'),
      a.rb(IM.online, 'Online video (YouTube)', onlineVideo, {label: 'Online Video'}), fb(IM.audio, 'Audio from this phone', 'Audio', 'audio/*', f => insertMedia(f, 'audio')), a.rb(IM.recA, 'Record audio', recordAudio, {label: 'Record Audio'}));
  }
  /* hook into the ribbon */
  const baseBuild = Features.buildTab, baseExtend = Features.extend, baseActivate = Features.activate;
  return {
    buildTab(t, o, r){ if (t === 'media' && o && o.kind === 'media'){ mediaTab(o, r); return true; } return baseBuild(t, o, r); },
    extend(t, o, r){ baseExtend(t, o, r); if (t === 'insert'){ const g = mediaGroup(); const after = [...r.children].find(x => x.querySelector('.gl') && x.querySelector('.gl').textContent === 'Graphics'); r.insertBefore(g, after ? after.nextSibling : null); } },
    activate(o){ if (o.kind === 'media') player(o); else baseActivate(o); },
    insertMedia, player, IM, extOf,
  };
})());
