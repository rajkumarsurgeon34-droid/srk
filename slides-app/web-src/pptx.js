/* SRK Slides — .pptx reader (PowerPoint → editable slides) and writer (slides → PowerPoint) */
'use strict';
const EMU = 12700; // EMU per point
/* Inside slides, CSS px are points: a 16:9 slide is 960 × 540 */
/* Font library: [name shown and saved in .pptx, free look-alike from Google Fonts (null = the name itself), group, generic fallback] */
const FONT_LIB = [
  ['Calibri', 'Carlito', 'Office', 'sans-serif'], ['Calibri Light', 'Carlito', 'Office', 'sans-serif'], ['Cambria', 'Caladea', 'Office', 'serif'],
  ['Arial', 'Arimo', 'Office', 'sans-serif'], ['Arial Black', 'Archivo Black', 'Office', 'sans-serif'], ['Arial Narrow', 'Archivo Narrow', 'Office', 'sans-serif'],
  ['Times New Roman', 'Tinos', 'Office', 'serif'], ['Georgia', 'Gelasio', 'Office', 'serif'], ['Garamond', 'EB Garamond', 'Office', 'serif'],
  ['Book Antiqua', 'Libre Baskerville', 'Office', 'serif'], ['Palatino Linotype', 'Libre Baskerville', 'Office', 'serif'], ['Constantia', 'Source Serif 4', 'Office', 'serif'],
  ['Century Gothic', 'Didact Gothic', 'Office', 'sans-serif'], ['Segoe UI', 'Open Sans', 'Office', 'sans-serif'], ['Verdana', 'Noto Sans', 'Office', 'sans-serif'],
  ['Tahoma', 'PT Sans', 'Office', 'sans-serif'], ['Trebuchet MS', 'Fira Sans', 'Office', 'sans-serif'], ['Franklin Gothic', 'Libre Franklin', 'Office', 'sans-serif'],
  ['Gill Sans', 'Cabin', 'Office', 'sans-serif'], ['Candara', 'Mulish', 'Office', 'sans-serif'], ['Corbel', 'Nunito Sans', 'Office', 'sans-serif'], ['Lucida Sans', 'Source Sans 3', 'Office', 'sans-serif'],
  ['Rockwell', 'Arvo', 'Office', 'serif'], ['Impact', 'Anton', 'Office', 'sans-serif'], ['Comic Sans MS', 'Comic Neue', 'Office', 'cursive'],
  ['Courier New', 'Cousine', 'Office', 'monospace'], ['Consolas', 'Inconsolata', 'Office', 'monospace'],
  ['Roboto', null, 'Sans serif', 'sans-serif'], ['Open Sans', null, 'Sans serif', 'sans-serif'], ['Lato', null, 'Sans serif', 'sans-serif'], ['Montserrat', null, 'Sans serif', 'sans-serif'],
  ['Poppins', null, 'Sans serif', 'sans-serif'], ['Inter', null, 'Sans serif', 'sans-serif'], ['Raleway', null, 'Sans serif', 'sans-serif'], ['Nunito', null, 'Sans serif', 'sans-serif'],
  ['Ubuntu', null, 'Sans serif', 'sans-serif'], ['Work Sans', null, 'Sans serif', 'sans-serif'], ['Rubik', null, 'Sans serif', 'sans-serif'], ['Quicksand', null, 'Sans serif', 'sans-serif'],
  ['Barlow', null, 'Sans serif', 'sans-serif'], ['Josefin Sans', null, 'Sans serif', 'sans-serif'], ['Oswald', null, 'Sans serif', 'sans-serif'], ['Source Sans 3', null, 'Sans serif', 'sans-serif'],
  ['Merriweather', null, 'Serif', 'serif'], ['Playfair Display', null, 'Serif', 'serif'], ['Lora', null, 'Serif', 'serif'], ['PT Serif', null, 'Serif', 'serif'],
  ['Noto Serif', null, 'Serif', 'serif'], ['Roboto Slab', null, 'Serif', 'serif'], ['Crimson Text', null, 'Serif', 'serif'], ['Cormorant Garamond', null, 'Serif', 'serif'], ['Libre Baskerville', null, 'Serif', 'serif'],
  ['Bebas Neue', null, 'Display & handwriting', 'sans-serif'], ['Abril Fatface', null, 'Display & handwriting', 'serif'], ['Lobster', null, 'Display & handwriting', 'cursive'],
  ['Pacifico', null, 'Display & handwriting', 'cursive'], ['Dancing Script', null, 'Display & handwriting', 'cursive'], ['Great Vibes', null, 'Display & handwriting', 'cursive'],
  ['Satisfy', null, 'Display & handwriting', 'cursive'], ['Caveat', null, 'Display & handwriting', 'cursive'], ['Kalam', null, 'Display & handwriting', 'cursive'],
  ['Noto Sans Tamil', null, 'Tamil', 'sans-serif'], ['Noto Serif Tamil', null, 'Tamil', 'serif'], ['Mukta Malar', null, 'Tamil', 'sans-serif'], ['Catamaran', null, 'Tamil', 'sans-serif'],
  ['Hind Madurai', null, 'Tamil', 'sans-serif'], ['Baloo Thambi 2', null, 'Tamil', 'sans-serif'], ['Pavanam', null, 'Tamil', 'sans-serif'], ['Meera Inimai', null, 'Tamil', 'sans-serif'],
];
const FONT_MAP = Object.fromEntries(FONT_LIB.map(f => [f[0].toLowerCase(), f]));
const fontWeb = name => { const f = FONT_MAP[String(name).toLowerCase()]; return f ? (f[1] || f[0]) : null; };
/* Google Fonts families to fetch; the app loads its own copies (window.SRK_FONTS_LOCAL), the web page loads them on first use */
const _fontLoaded = {};
function ensureFont(name){
  const fam = fontWeb(name); if (!fam || _fontLoaded[fam] || window.SRK_FONTS_LOCAL || typeof document === 'undefined') return; _fontLoaded[fam] = true;
  const specs = [':ital,wght@0,400;0,700;1,400;1,700', ':wght@400;700', ''];
  const tryN = i => { if (i >= specs.length) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}${specs[i]}&display=swap`; l.onerror = () => { l.remove(); tryN(i + 1); }; document.head.appendChild(l); };
  tryN(0);
}
function fontStack(name){
  name = String(name || 'Calibri').replace(/["']/g, '').split(',')[0].trim(); const f = FONT_MAP[name.toLowerCase()]; ensureFont(name);
  if (f) return `'${f[0]}'${f[1] ? `, '${f[1]}'` : ''}, ${f[3] === 'serif' ? "'Noto Serif', serif" : f[3] === 'monospace' ? 'monospace' : f[3] === 'cursive' ? 'cursive' : "Roboto, 'Noto Sans', sans-serif"}`;
  return `'${name.replace(/'/g, '')}', ${/serif|roman|times|georgia|garamond|cambria|book/i.test(name) && !/sans/i.test(name) ? "'Noto Serif', serif" : "Roboto, 'Noto Sans', sans-serif"}`;
}
/* make sure fonts named inside stored text (spans) are loaded too */
function ensureFontsIn(html){ if (!html || window.SRK_FONTS_LOCAL) return; const re = /font-family:\s*['"]?([^'",;]+)/g; let m; while ((m = re.exec(html))) ensureFont(m[1].trim()); }
const PNS = { r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' };
const px = s => new DOMParser().parseFromString(s, 'application/xml');
const lname = el => el && el.localName;
const kidsN = (el, n) => el ? [...el.children].filter(c => lname(c) === n) : [];
const kidN = (el, n) => el ? [...el.children].find(c => lname(c) === n) || null : null;
const descN = (el, n) => el ? [...el.getElementsByTagNameNS('*', n)] : [];
const at = (el, n) => el ? el.getAttribute(n) : null;
const rid = el => el ? (el.getAttributeNS(PNS.r, 'embed') || el.getAttribute('r:embed') || el.getAttributeNS(PNS.r, 'id') || el.getAttribute('r:id')) : null;
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function relsOf(xmlStr){ const m = {}; if (!xmlStr) return m; for (const r of descN(px(xmlStr).documentElement, 'Relationship')) m[r.getAttribute('Id')] = {target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', mode: r.getAttribute('TargetMode')}; return m; }
function jp(base, t){ if (!t) return ''; if (t.startsWith('/')) return t.slice(1); const p = base.split('/'); p.pop(); for (const s of t.split('/')){ if (s === '..') p.pop(); else if (s !== '.') p.push(s); } return p.join('/'); }
const uidS = () => Math.random().toString(36).slice(2, 10);
const SUPPORTED_GEOMS = ['rect','roundRect','ellipse','triangle','rtTriangle','diamond','hexagon','octagon','parallelogram','trapezoid','rightArrow','leftArrow','upArrow','downArrow','chevron','star5','heart','line','plus','donut','flowChartProcess','flowChartDecision','wedgeRoundRectCallout','cloud'];

/* ================================================================ READER */
async function readPptx(bytes){
  const head = bytes.subarray ? bytes.subarray(0, 4) : new Uint8Array(bytes, 0, 4);
  if (head[0] === 0xD0 && head[1] === 0xCF) throw new Error('This is an old PowerPoint 97–2003 (.ppt) file. SRK Slides opens .pptx files. Open it in PowerPoint or Google Slides, use Save as → .pptx, then open that here.');
  let zip; try { zip = await JSZip.loadAsync(bytes); } catch(e){ throw new Error('This file isn’t a PowerPoint presentation (.pptx), or it is damaged.'); }
  const txt = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
  const presXml = await txt('ppt/presentation.xml'); if (!presXml) throw new Error('This file isn’t a PowerPoint presentation (.pptx).');
  const pd = px(presXml).documentElement; const sz = descN(pd, 'sldSz')[0];
  const W = (+at(sz, 'cx') || 12192000) / EMU, H = (+at(sz, 'cy') || 6858000) / EMU;
  const prels = relsOf(await txt('ppt/_rels/presentation.xml.rels'));
  const slidePaths = descN(descN(pd, 'sldIdLst')[0], 'sldId').map(s => jp('ppt/presentation.xml', (prels[rid(s)] || {}).target));

  /* theme */
  const theme = {colors: {}, major: 'Calibri Light', minor: 'Calibri'};
  const themeRel = Object.values(prels).find(r => /theme/.test(r.type));
  const themePath = themeRel ? jp('ppt/presentation.xml', themeRel.target) : Object.keys(zip.files).find(p => /^ppt\/theme\/theme\d+\.xml$/.test(p));
  if (themePath && zip.file(themePath)){
    const td = px(await txt(themePath)).documentElement; const cs = descN(td, 'clrScheme')[0];
    if (cs) for (const c of [...cs.children]){ const v = descN(c, 'srgbClr')[0], sy = descN(c, 'sysClr')[0]; theme.colors[lname(c)] = v ? at(v, 'val') : sy ? (at(sy, 'lastClr') || '000000') : null; }
    const mj = kidN(descN(td, 'majorFont')[0], 'latin'), mn = kidN(descN(td, 'minorFont')[0], 'latin');
    if (mj && at(mj, 'typeface')) theme.major = at(mj, 'typeface'); if (mn && at(mn, 'typeface')) theme.minor = at(mn, 'typeface');
  }
  const SCHEME = {tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2'};
  function colorOf(el){
    if (!el) return null; let base = null, node = null;
    const s = kidN(el, 'srgbClr') || (lname(el) === 'srgbClr' ? el : null); const sc = kidN(el, 'schemeClr') || (lname(el) === 'schemeClr' ? el : null); const sy = kidN(el, 'sysClr'); const pr = kidN(el, 'prstClr');
    if (s){ base = at(s, 'val'); node = s; } else if (sc){ const k = at(sc, 'val'); base = theme.colors[SCHEME[k] || k] || (k === 'phClr' ? null : null); node = sc; } else if (sy){ base = at(sy, 'lastClr') || '000000'; node = sy; } else if (pr){ base = ({black:'000000', white:'FFFFFF', red:'FF0000', blue:'0000FF', green:'008000', yellow:'FFFF00', gray:'808080'})[at(pr, 'val')] || '000000'; node = pr; }
    if (!base) return null;
    let [r, g, b] = [0, 2, 4].map(i => parseInt(base.slice(i, i + 2), 16));
    for (const m of node ? [...node.children] : []){ const v = (+at(m, 'val')) / 100000;
      if (lname(m) === 'lumMod'){ r *= v; g *= v; b *= v; } else if (lname(m) === 'lumOff'){ r += 255 * v; g += 255 * v; b += 255 * v; }
      else if (lname(m) === 'tint'){ r = r * v + 255 * (1 - v); g = g * v + 255 * (1 - v); b = b * v + 255 * (1 - v); } else if (lname(m) === 'shade'){ r *= v; g *= v; b *= v; } }
    const hx = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + hx(r) + hx(g) + hx(b);
  }
  function fillOf(spPr){ if (!spPr) return undefined; if (kidN(spPr, 'noFill')) return null; const sf = kidN(spPr, 'solidFill'); if (sf) return colorOf(sf); const gf = kidN(spPr, 'gradFill'); if (gf){ const gs = descN(gf, 'gs'); if (gs.length) return colorOf(gs[0]); } return undefined; }
  function lineOf(spPr){ const ln = spPr && kidN(spPr, 'ln'); if (!ln) return undefined; if (kidN(ln, 'noFill')) return null; const c = colorOf(kidN(ln, 'solidFill')); const w = (+at(ln, 'w') || 12700) / EMU; return c ? {color: c, width: Math.round(w * 4) / 4} : undefined; }

  const imgCache = {};
  async function media(path){
    if (!path) return null; if (path in imgCache) return imgCache[path];
    const f = zip.file(path); const ext = (path.split('.').pop() || '').toLowerCase();
    const mime = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml'}[ext];
    return imgCache[path] = (f && mime) ? `data:${mime};base64,` + await f.async('base64') : null;
  }
  async function part(path){ const x = await txt(path); if (!x) return null; return {doc: px(x).documentElement, rels: relsOf(await txt(path.replace(/([^/]+)$/, '_rels/$1.rels'))), path}; }
  function phMap(p){ const map = {}; if (!p) return map;
    for (const sp of descN(p.doc, 'sp')){ const ph = descN(kidN(sp, 'nvSpPr'), 'ph')[0]; if (!ph) continue; const xf = descN(kidN(sp, 'spPr'), 'xfrm')[0];
      const box = xf && kidN(xf, 'off') ? {x: +at(kidN(xf, 'off'), 'x') / EMU, y: +at(kidN(xf, 'off'), 'y') / EMU, w: +at(kidN(xf, 'ext'), 'cx') / EMU, h: +at(kidN(xf, 'ext'), 'cy') / EMU} : null;
      const type = at(ph, 'type') || 'body', idx = at(ph, 'idx'); const lvl1 = descN(kidN(sp, 'txBody'), 'lvl1pPr')[0]; const defR = descN(lvl1, 'defRPr')[0];
      const info = {box, size: defR && at(defR, 'sz') ? +at(defR, 'sz') / 100 : null, color: defR ? colorOf(kidN(defR, 'solidFill')) : null, anchor: at(descN(kidN(sp, 'txBody'), 'bodyPr')[0], 'anchor')};
      if (idx != null) map['i' + idx] = info; if (!map['t' + type]) map['t' + type] = info; }
    return map; }
  const masterStyles = {};
  async function masterInfo(mp){
    if (masterStyles[mp.path]) return masterStyles[mp.path];
    const ts = descN(mp.doc, 'txStyles')[0]; const get = (n, lvl = 'lvl1pPr') => { const st = descN(ts, n)[0]; const l = descN(st, lvl)[0]; const d = descN(l, 'defRPr')[0]; return {size: d && at(d, 'sz') ? +at(d, 'sz') / 100 : null, color: d ? colorOf(kidN(d, 'solidFill')) : null}; };
    return masterStyles[mp.path] = {title: get('titleStyle'), body: get('bodyStyle'), body2: get('bodyStyle', 'lvl2pPr'), other: get('otherStyle')};
  }

  /* text body → html */
  function txHtml(tx, defs){
    const paras = kidsN(tx, 'p'); let html = ''; let list = null; const close = () => { if (list){ html += `</${list}>`; list = null; } };
    for (const p of paras){
      const pPr = kidN(p, 'pPr'); const lvl = +(at(pPr, 'lvl') || 0); const algn = at(pPr, 'algn');
      const buNone = kidN(pPr, 'buNone'), buChar = kidN(pPr, 'buChar'), buNum = kidN(pPr, 'buAutoNum');
      const bullet = buNum ? 'ol' : buChar ? 'ul' : (!buNone && defs.bullets) ? 'ul' : null;
      let inner = '';
      for (const r of [...p.children]){
        if (lname(r) === 'br'){ inner += '<br>'; continue; }
        if (lname(r) !== 'r' && lname(r) !== 'fld') continue;
        const t = descN(r, 't').map(x => x.textContent).join(''); if (!t) continue;
        const rp = kidN(r, 'rPr'); const css = [];
        const sz = at(rp, 'sz'); if (sz) css.push(`font-size:${+sz / 100}px`);
        const c = colorOf(kidN(rp, 'solidFill')); if (c) css.push(`color:${c}`);
        const latin = kidN(rp, 'latin'); if (latin && at(latin, 'typeface') && !/^\+m/.test(at(latin, 'typeface'))) css.push(`font-family:${fontStack(at(latin, 'typeface'))}`);
        const hl = kidN(rp, 'highlight'); if (hl){ const hc = colorOf(hl); if (hc) css.push(`background-color:${hc}`); }
        let s = escHtml(t); if (css.length) s = `<span style="${css.join(';')}">${s}</span>`;
        if (at(rp, 'b') === '1') s = `<b>${s}</b>`; if (at(rp, 'i') === '1') s = `<i>${s}</i>`;
        if (at(rp, 'u') && at(rp, 'u') !== 'none') s = `<u>${s}</u>`; if (at(rp, 'strike') && at(rp, 'strike') !== 'noStrike') s = `<s>${s}</s>`;
        const bl = +(at(rp, 'baseline') || 0); if (bl > 0) s = `<sup>${s}</sup>`; if (bl < 0) s = `<sub>${s}</sub>`;
        inner += s;
      }
      if (!inner){ const er = kidN(p, 'endParaRPr'); inner = '<br>'; }
      const style = []; if (algn === 'ctr') style.push('text-align:center'); if (algn === 'r') style.push('text-align:right'); if (algn === 'just') style.push('text-align:justify');
      if (bullet && inner !== '<br>'){
        if (list !== bullet){ close(); html += `<${bullet}>`; list = bullet; }
        if (lvl) style.push(`margin-left:${lvl * 24}px`);
        html += `<li${style.length ? ` style="${style.join(';')}"` : ''}>${inner}</li>`;
      } else { close(); html += `<p${style.length ? ` style="${style.join(';')}"` : ''}>${inner}</p>`; }
    }
    close();
    return html.replace(/(<p><br><\/p>)+$/, '');
  }

  const slides = []; const notesOut = [];
  for (const sp of slidePaths){
    const slide = await part(sp); if (!slide) continue;
    const layoutPath = Object.values(slide.rels).map(r => jp(sp, r.target)).find(p => /slideLayout/.test(p));
    const layout = layoutPath ? await part(layoutPath) : null;
    const masterPath = layout ? Object.values(layout.rels).map(r => jp(layoutPath, r.target)).find(p => /slideMaster/.test(p)) : null;
    const master = masterPath ? await part(masterPath) : null;
    const mi = master ? await masterInfo(master) : {title: {}, body: {}, other: {}};
    const phL = phMap(layout), phM = phMap(master);
    /* background */
    let bg = null;
    for (const p of [slide, layout, master]){ if (!p) continue; const b = descN(p.doc, 'bg')[0]; if (!b) continue;
      const blip = descN(b, 'blip')[0]; if (blip){ const src = await media(jp(p.path, (p.rels[rid(blip)] || {}).target)); if (src){ bg = {image: src}; break; } }
      const bgPr = kidN(b, 'bgPr'); const c = bgPr ? fillOf(bgPr) : colorOf(kidN(b, 'bgRef')); if (c){ bg = {color: c}; break; } }
    /* transition */
    let transition = 'none'; const tr = descN(slide.doc, 'transition')[0];
    if (tr){ const k = [...tr.children].map(lname).find(n => n && n !== 'sndAc' && n !== 'extLst'); transition = ['fade','push','wipe','zoom','cover','split'].includes(k) ? (k === 'cover' ? 'push' : k === 'split' ? 'wipe' : k) : 'fade'; }
    const objects = [];
    async function walk(tree, tf){
      for (const el of [...tree.children]){
        const t = lname(el);
        if (t === 'grpSp'){ const xf = descN(kidN(el, 'grpSpPr'), 'xfrm')[0]; let t2 = tf;
          if (xf && kidN(xf, 'off')){ const o = kidN(xf, 'off'), e = kidN(xf, 'ext'), co = kidN(xf, 'chOff'), ce = kidN(xf, 'chExt'); const ox = +at(o,'x'), oy = +at(o,'y'), ex = +at(e,'cx') || 1, ey = +at(e,'cy') || 1, cx = +(at(co,'x') || 0), cy = +(at(co,'y') || 0), cex = +(at(ce,'cx') || ex), cey = +(at(ce,'cy') || ey);
            t2 = b => tf({x: (ox + (b.x * EMU - cx) * ex / cex) / EMU, y: (oy + (b.y * EMU - cy) * ey / cey) / EMU, w: b.w * ex / cex, h: b.h * ey / cey}); }
          await walk(el, t2); continue; }
        if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(t)) continue;
        const spPr = kidN(el, 'spPr'); const xf = t === 'graphicFrame' ? kidN(el, 'xfrm') : descN(spPr, 'xfrm')[0];
        let box = xf && kidN(xf, 'off') ? {x: +at(kidN(xf, 'off'), 'x') / EMU, y: +at(kidN(xf, 'off'), 'y') / EMU, w: +at(kidN(xf, 'ext'), 'cx') / EMU, h: +at(kidN(xf, 'ext'), 'cy') / EMU} : null;
        const ph = descN(el, 'ph')[0]; const phType = ph ? (at(ph, 'type') || 'body') : null; const phIdx = ph ? at(ph, 'idx') : null;
        const lay = ph ? (phL['i' + phIdx] || phL['t' + phType] || phM['t' + phType] || phM['i' + phIdx] || {}) : {};
        if (!box && ph) box = lay.box || (phM['t' + phType] || {}).box || null;
        if (!box) continue; box = tf(box);
        const rot = xf && at(xf, 'rot') ? (+at(xf, 'rot')) / 60000 : 0; const flipH = xf && at(xf, 'flipH') === '1', flipV = xf && at(xf, 'flipV') === '1';
        const base = {id: uidS(), x: r1(box.x), y: r1(box.y), w: r1(Math.max(box.w, 1)), h: r1(Math.max(box.h, t === 'cxnSp' ? 0 : 1)), rot: Math.round(rot)};
        if (t === 'pic' && (descN(el, 'videoFile')[0] || descN(el, 'audioFile')[0])){
          const vf = descN(el, 'videoFile')[0] || descN(el, 'audioFile')[0]; const audio = lname(vf) === 'audioFile'; const blip = descN(el, 'blip')[0]; const poster = blip ? await media(jp(sp, (slide.rels[rid(blip)] || {}).target)) : null;
          const link = slide.rels[vf.getAttributeNS(PNS.r, 'link') || vf.getAttribute('r:link') || rid(vf)] || {}; const p14 = descN(el, 'media').find(m => rid(m)); const emb = p14 ? slide.rels[rid(p14)] : (link.mode !== 'External' ? link : null);
          if (emb && emb.target){ const mp = jp(sp, emb.target); const f = zip.file(mp); if (f){ const bytes = await f.async('uint8array'); const ext = mp.split('.').pop().toLowerCase(); const mime = (audio ? {mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', wma: 'audio/x-ms-wma', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac'} : {mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', wmv: 'video/x-ms-wmv', avi: 'video/x-msvideo'})[ext] || (audio ? 'audio/mpeg' : 'video/mp4');
            objects.push({...base, kind: 'media', mtype: audio ? 'audio' : 'video', bytes, mime, ext, poster, name: mp.split('/').pop(), start: 'click', vol: 1}); continue; } }
          if (link.mode === 'External' && link.target){ objects.push({...base, kind: 'media', mtype: 'online', link: link.target, poster, name: 'Online video', start: 'click'}); continue; }
        }
        if (t === 'pic'){ const blip = descN(el, 'blip')[0]; const src = blip ? await media(jp(sp, (slide.rels[rid(blip)] || {}).target)) : null; if (src){ const sr = descN(el, 'srcRect')[0]; const cr = sr ? {l: (+at(sr, 'l') || 0) / 1e5, t: (+at(sr, 't') || 0) / 1e5, r: (+at(sr, 'r') || 0) / 1e5, b: (+at(sr, 'b') || 0) / 1e5} : null; objects.push({...base, kind: 'image', src, ...(cr && (cr.l || cr.t || cr.r || cr.b) ? {crop: cr} : {})}); } continue; }
        if (t === 'graphicFrame'){
          const tbl = descN(el, 'tbl')[0];
          if (tbl){ const rows = descN(tbl, 'tr').map(tr => kidsN(tr, 'tc').map(tc => { const body = kidN(tc, 'txBody'); return {html: body ? txHtml(body, {}) : '', fill: fillOf(kidN(tc, 'tcPr')) || null}; }));
            const fs = descN(tbl, 'rPr').map(r => at(r, 'sz')).find(Boolean);
            objects.push({...base, kind: 'table', rows: rows.map(r => r.map(c => c.html)), fills: rows.map(r => r.map(c => c.fill)), header: at(descN(tbl, 'tblPr')[0], 'firstRow') === '1', size: fs ? +fs / 100 : 14}); }
          else { const ch = await readChart(el); if (ch) objects.push({...base, ...ch}); else objects.push({...base, kind: 'box', geom: 'rect', fill: '#f2f3f7', line: {color: '#b8bfd0', width: 1}, html: '<p style="text-align:center">Diagram (shown as a placeholder)</p>', anchor: 'ctr', style: {size: 14, color: '#5b6380'}}); }
          continue;
        }
        const geomEl = descN(spPr, 'prstGeom')[0]; let geom = t === 'cxnSp' ? 'line' : (at(geomEl, 'prst') || 'rect'); if (descN(spPr, 'custGeom')[0]) geom = 'rect';
        if (!SUPPORTED_GEOMS.includes(geom)) geom = /arrow/i.test(geom) ? 'rightArrow' : /ellipse|oval|circle/i.test(geom) ? 'ellipse' : /round/i.test(geom) ? 'roundRect' : 'rect';
        let fill = fillOf(spPr), line = lineOf(spPr);
        const style = descN(el, 'style')[0];
        if (fill === undefined && style){ const fr = kidN(style, 'fillRef'); if (fr && at(fr, 'idx') !== '0') fill = colorOf(fr); }
        if (line === undefined && style){ const lr = kidN(style, 'lnRef'); if (lr && at(lr, 'idx') !== '0'){ const c = colorOf(lr); if (c) line = {color: c, width: 1}; } }
        if (geom === 'line' && !line) line = {color: '#000000', width: 1};
        const tx = kidN(el, 'txBody'); const bodyPr = tx && kidN(tx, 'bodyPr');
        const role = phType === 'title' || phType === 'ctrTitle' ? 'title' : phType === 'subTitle' ? 'subtitle' : phType === 'body' || phType === 'obj' ? 'body' : null;
        const ms = role === 'title' ? mi.title : role ? mi.body : mi.other || {};
        const size = lay.size || ms.size || (role === 'title' ? (phType === 'ctrTitle' ? 44 : 36) : role === 'subtitle' ? 24 : role === 'body' ? 24 : 18);
        const fontRefC = !ph && style ? colorOf(kidN(style, 'fontRef')) : null; const color = fontRefC || lay.color || ms.color || theme.colors.dk1 && '#' + theme.colors.dk1 || '#000000';
        const html = tx ? txHtml(tx, {bullets: role === 'body'}) : '';
        const hasText = html && html.replace(/<[^>]+>/g, '').trim();
        if (ph && !hasText) continue; // empty placeholders only show in PowerPoint's editor
        const obj = {...base, kind: 'box', geom, fill: fill === undefined ? null : fill, line: line === undefined ? null : line, html: hasText ? html : '', anchor: at(bodyPr, 'anchor') || lay.anchor || (role === 'title' && phType === 'title' ? 'ctr' : role === 'title' ? 'b' : 't'),
          style: {size, color, font: role === 'title' ? theme.major : theme.minor, bold: false}, ...(role ? {ph: role} : {})};
        if (flipH) obj.flipH = true; if (flipV) obj.flipV = true;
        if (bodyPr && at(bodyPr, 'vert') && at(bodyPr, 'vert') !== 'horz') obj.vert = true;
        objects.push(obj);
      }
    }
    async function readChart(gf){
      try { const cEl = descN(gf, 'chart')[0]; if (!cEl) return null; const rel = slide.rels[rid(cEl)]; if (!rel) return null; const cx = await txt(jp(sp, rel.target)); if (!cx) return null; const cd = px(cx).documentElement;
        const plot = descN(cd, 'plotArea')[0]; if (!plot) return null; const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'pieChart', 'pie3DChart', 'doughnutChart']; const ce = [...plot.children].find(c => kinds.includes(lname(c))); if (!ce) return null;
        const k = lname(ce); const dir = at(descN(ce, 'barDir')[0], 'val'); const chart = /bar/.test(k) ? (dir === 'bar' ? 'bar' : 'column') : /line/.test(k) ? 'line' : /area/.test(k) ? 'area' : /doughnut/.test(k) ? 'doughnut' : 'pie';
        const pts = el => { if (!el) return []; const out = []; for (const pt of descN(el, 'pt')) out[+at(pt, 'idx')] = (descN(pt, 'v')[0] || {}).textContent; return out; };
        const sers = kidsN(ce, 'ser'); if (!sers.length) return null; let labels = [];
        const series = sers.map((s, i) => { const name = (descN(kidN(s, 'tx'), 'v')[0] || {}).textContent || `Series ${i + 1}`; const cat = pts(kidN(s, 'cat')); if (cat.length > labels.length) labels = cat; return {name, values: pts(kidN(s, 'val')).map(v => +v || 0)}; });
        if (!labels.length) labels = series[0].values.map((_, i) => String(i + 1)); labels = labels.map(l => l == null ? '' : String(l)); series.forEach(s => { while (s.values.length < labels.length) s.values.push(0); });
        const title = descN(descN(cd, 'title')[0], 't').map(t => t.textContent).join('') || '';
        return {kind: 'chart', chart, data: {labels, series}, title, legend: !!descN(cd, 'legend')[0], labels: chart === 'pie' || chart === 'doughnut'};
      } catch(e){ return null; }
    }
    const tree = descN(slide.doc, 'spTree')[0]; if (tree) await walk(tree, b => b);
    /* speaker notes */
    let notes = '';
    const nRel = Object.values(slide.rels).find(r => /notesSlide/.test(r.type));
    if (nRel){ const nx = await txt(jp(sp, nRel.target)); if (nx){ const nd = px(nx).documentElement;
      for (const s of descN(nd, 'sp')){ const ph = descN(s, 'ph')[0]; if (ph && (at(ph, 'type') || 'body') === 'body'){ notes = descN(s, 'p').map(p => descN(p, 't').map(t => t.textContent).join('')).join('\n').trim(); break; } } } }
    const hidden = at(slide.doc.documentElement, 'show') === '0';
    slides.push({id: uidS(), bg, transition, notes, objects, ...(hidden ? {hidden: true} : {})});
  }
  return {size: {w: r1(W), h: r1(H)}, slides, fonts: {head: theme.major, body: theme.minor}};
}
const r1 = n => Math.round(n * 10) / 10;

/* ================================================================ WRITER */
/* html of a text box → PptxGenJS text runs */
function htmlRuns(html, base, opt = {}){
  const holder = document.createElement('div'); holder.innerHTML = html || '';
  const paras = []; // {runs:[], align, bullet, indent}
  function para(el, extra){ const p = {runs: [], align: null, bullet: null, indent: 0, ...extra}; const ta = el && el.style && el.style.textAlign; if (ta) p.align = ta === 'justify' ? 'justify' : ta; const ml = el && el.style && parseFloat(el.style.marginLeft); if (ml) p.indent = Math.min(8, Math.round(ml / 24)); paras.push(p); return p; }
  function fmt(el, f){
    f = {...f}; const t = el.tagName;
    if (t === 'B' || t === 'STRONG') f.bold = true; if (t === 'I' || t === 'EM') f.italic = true; if (t === 'U') f.underline = true; if (t === 'S' || t === 'STRIKE' || t === 'DEL') f.strike = true;
    if (t === 'A' && el.getAttribute('href')) f.link = el.getAttribute('href');
    if (t === 'SUP') f.superscript = true; if (t === 'SUB') f.subscript = true;
    if (t === 'FONT'){ if (el.getAttribute('color')) f.color = el.getAttribute('color'); if (el.getAttribute('face')) f.fontFace = el.getAttribute('face'); }
    const st = el.style; if (st){
      if (st.fontWeight) f.bold = st.fontWeight === 'bold' || +st.fontWeight >= 600; if (st.fontStyle) f.italic = st.fontStyle === 'italic';
      const td = st.textDecorationLine || st.textDecoration || ''; if (td.includes('underline')) f.underline = true; if (td.includes('line-through')) f.strike = true;
      if (st.color) f.color = st.color; if (st.backgroundColor && !/transparent|rgba\(0, 0, 0, 0\)/.test(st.backgroundColor)) f.highlight = st.backgroundColor;
      if (st.fontSize){ const v = parseFloat(st.fontSize); f.fontSize = /pt$/.test(st.fontSize) ? v : /px$/.test(st.fontSize) ? v : f.fontSize; }
      if (st.fontFamily) f.fontFace = st.fontFamily.split(',')[0].replace(/["']/g, '').trim(); }
    return f;
  }
  function inline(node, f, p){
    for (const n of [...node.childNodes]){
      if (n.nodeType === 3){ const t = n.data.replace(/[\n\r\t ]+/g, ' ').replace(/ /g, ' '); if (t) p.runs.push({text: t, f}); continue; }
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'BR'){ p.runs.push({br: true}); continue; }
      if (/^(P|DIV|LI|UL|OL|H\d)$/.test(n.tagName)){ walkBlocks(n, f); p = paras[paras.length - 1] && paras[paras.length - 1].open ? paras[paras.length - 1] : para(null); p.open = true; continue; }
      inline(n, fmt(n, f), p);
    }
  }
  function walkBlocks(node, f, listType, level = 0){
    let loose = null;
    for (const n of [...node.childNodes]){
      if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')){ loose = null; walkBlocks(n, f, n.tagName, listType ? level + 1 : 0); continue; }
      if (n.nodeType === 1 && /^(P|DIV|LI|H\d|BLOCKQUOTE)$/.test(n.tagName)){
        loose = null; const p = para(n, n.tagName === 'LI' ? {bullet: listType === 'OL' ? 'num' : 'dot', indent: level + (parseFloat(n.style.marginLeft) ? Math.round(parseFloat(n.style.marginLeft) / 24) : 0)} : {});
        // nested lists inside li
        const kids = [...n.childNodes]; const nested = kids.filter(k => k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL'));
        const tmp = document.createElement('div'); kids.filter(k => !nested.includes(k)).forEach(k => tmp.appendChild(k.cloneNode(true)));
        inline(tmp, fmt(n, f), p);
        nested.forEach(nl => walkBlocks(nl, f, nl.tagName, level + 1));
        continue;
      }
      if (!loose){ loose = para(null); } inline({childNodes: [n]}, f, loose);
    }
  }
  walkBlocks(holder, {});
  const out = [];
  const hex = c => { if (!c) return undefined; const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (m) return [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); return c.replace('#', '').toUpperCase(); };
  paras.forEach((p, i) => {
    const po = {}; if (p.align) po.align = p.align; if (p.bullet) po.bullet = p.bullet === 'num' ? {type: 'number'} : true; if (p.indent) po.indentLevel = p.indent;
    const runs = p.runs.length ? p.runs : [{text: '', f: {}}];
    runs.forEach((r, k) => {
      const last = k === runs.length - 1 && i < paras.length - 1;
      if (r.br){ out.push({text: '', options: {...po, softBreakBefore: false, breakLine: true}}); return; }
      const o = {...po}; const f = r.f;
      if (f.bold) o.bold = true; if (f.italic) o.italic = true; if (f.underline) o.underline = {style: 'sng'}; if (f.strike) o.strike = 'sngStrike';
      if (f.superscript) o.superscript = true; if (f.subscript) o.subscript = true; if (f.color) o.color = hex(f.color); if (f.highlight) o.highlight = hex(f.highlight);
      if (f.fontSize) o.fontSize = Math.round(f.fontSize * (opt.k || 1) * 2) / 2; if (f.fontFace) o.fontFace = f.fontFace; if (f.link) o.hyperlink = {url: f.link};
      if (opt.line) o.lineSpacingMultiple = opt.line; if (opt.after != null) o.paraSpaceAfter = opt.after;
      if (last) o.breakLine = true;
      out.push({text: r.text, options: o});
    });
  });
  return out;
}
/* transitions and animations PptxGenJS doesn't write: injected into each slide's XML */
function transitionXml(s){
  const t = s.transition || 'none'; if (t === 'none' && !s.advance) return '';
  const ms = (s.trDur || 0.8) * 1000, spd = ms <= 600 ? 'fast' : ms <= 1000 ? 'med' : 'slow', adv = s.advance ? ` advTm="${Math.round(s.advance * 1000)}"` : '';
  const d = s.trDir; const inner = {fade: '<p:fade/>', morph: '<p:fade/>', flip: '<p:fade/>', push: `<p:push dir="${d || 'u'}"/>`, wipe: `<p:wipe dir="${({r: 'r', l: 'l', d: 'd', u: 'u'})[d] || 'r'}"/>`, split: '<p:split orient="vert" dir="out"/>', cover: `<p:cover dir="${d || 'l'}"/>`, uncover: `<p:pull dir="${d || 'l'}"/>`, zoom: '<p:zoom/>', none: ''}[t] || '<p:fade/>';
  return `<p:transition spd="${spd}"${adv}>${inner}</p:transition>`;
}
const ANIM_PRESET = {appear: [1, 'entr', 0], fade: [10, 'entr', 0], fly: [2, 'entr', 4], float: [42, 'entr', 0], wipe: [22, 'entr', 8], zoom: [53, 'entr', 16], grow: [31, 'entr', 0], bounce: [26, 'entr', 0],
  pulse: [26, 'emph', 0], spin: [8, 'emph', 0], teeter: [32, 'emph', 0], grow2: [6, 'emph', 0], fadeout: [10, 'exit', 0], flyout: [2, 'exit', 4], zoomout: [53, 'exit', 16], disappear: [1, 'exit', 0]};
function timingXml(anims, spid, media = []){
  const list = (anims || []).filter(x => spid[x.obj]); media = media.filter(m => spid[m.id]); if (!list.length && !media.length) return {xml: '', bld: ''};
  let id = 3; const nid = () => id++;
  const tgt = sp => `<p:tgtEl><p:spTgt spid="${sp}"/></p:tgtEl>`;
  const vis = (sp, val, delay = 0) => `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${tgt(sp)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${val}"/></p:to></p:set>`;
  const prop = (sp, attr, from, to, dur) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nid()}" dur="${dur}" fill="hold"/>${tgt(sp)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
  const effect = (x, sp, dur) => { const f = x.fx; const D = Math.max(1, dur);
    switch (f){
      case 'appear': return vis(sp, 'visible');
      case 'fade': return vis(sp, 'visible') + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${D}"/>${tgt(sp)}</p:cBhvr></p:animEffect>`;
      case 'fly': case 'bounce': return vis(sp, 'visible') + prop(sp, 'ppt_x', '#ppt_x', '#ppt_x', D) + prop(sp, 'ppt_y', f === 'bounce' ? '0-#ppt_h/2' : '1+#ppt_h/2', '#ppt_y', D);
      case 'float': return vis(sp, 'visible') + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${D}"/>${tgt(sp)}</p:cBhvr></p:animEffect>` + prop(sp, 'ppt_y', '#ppt_y+.1', '#ppt_y', D);
      case 'wipe': return vis(sp, 'visible') + `<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="${nid()}" dur="${D}"/>${tgt(sp)}</p:cBhvr></p:animEffect>`;
      case 'zoom': case 'grow': return vis(sp, 'visible') + prop(sp, 'ppt_w', '0', '#ppt_w', D) + prop(sp, 'ppt_h', '0', '#ppt_h', D) + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${D}"/>${tgt(sp)}</p:cBhvr></p:animEffect>`;
      case 'spin': return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${nid()}" dur="${D}" fill="hold"/>${tgt(sp)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
      case 'pulse': case 'teeter': case 'grow2': return `<p:animScale><p:cBhvr><p:cTn id="${nid()}" dur="${D}" fill="hold"${f === 'grow2' ? '' : ' autoRev="1"'}/>${tgt(sp)}</p:cBhvr><p:by x="${f === 'grow2' ? 125000 : 110000}" y="${f === 'grow2' ? 125000 : 110000}"/></p:animScale>`;
      case 'fadeout': return `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${D}"/>${tgt(sp)}</p:cBhvr></p:animEffect>` + vis(sp, 'hidden', D - 1);
      case 'flyout': return prop(sp, 'ppt_x', '#ppt_x', '#ppt_x', D) + prop(sp, 'ppt_y', '#ppt_y', '1+#ppt_h/2', D) + vis(sp, 'hidden', D - 1);
      case 'zoomout': return prop(sp, 'ppt_w', '#ppt_w', '0', D) + prop(sp, 'ppt_h', '#ppt_h', '0', D) + vis(sp, 'hidden', D - 1);
      default: return vis(sp, 'hidden');
    } };
  // click groups → inner sequences
  const groups = []; let g = null;
  list.forEach((x, i) => { if (!g || x.start === 'click'){ g = {first: i === 0 ? x.start : 'click', seqs: []}; groups.push(g); g.seqs.push({delay: 0, items: []}); }
    const cur = g.seqs[g.seqs.length - 1]; if (x.start === 'after' && cur.items.length){ const end = Math.max(...cur.items.map(it => (it.delay || 0) + it.dur)) + cur.delay; g.seqs.push({delay: end, items: []}); }
    g.seqs[g.seqs.length - 1].items.push({x, dur: Math.round((x.dur || 0) * 1000), delay: Math.round((x.delay || 0) * 1000)}); });
  let body = '';
  for (const gr of groups){
    const outerCond = gr.first === 'click' ? '<p:cond delay="indefinite"/>' : '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>';
    let seqs = '';
    for (const sq of gr.seqs){ let items = '';
      for (const it of sq.items){ const [pid, cls, sub] = ANIM_PRESET[it.x.fx] || ANIM_PRESET.fade; const nt = it === gr.seqs[0].items[0] && sq === gr.seqs[0] ? (gr.first === 'click' ? 'clickEffect' : gr.first === 'after' ? 'afterEffect' : 'withEffect') : it.x.start === 'after' ? 'afterEffect' : 'withEffect';
        const cid = nid(); items += `<p:par><p:cTn id="${cid}" presetID="${pid}" presetClass="${cls}" presetSubtype="${sub}" fill="hold" grpId="0" nodeType="${nt}"><p:stCondLst><p:cond delay="${it.delay}"/></p:stCondLst><p:childTnLst>${effect(it.x, spid[it.x.obj], it.dur)}</p:childTnLst></p:cTn></p:par>`; }
      seqs += `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst><p:cond delay="${sq.delay}"/></p:stCondLst><p:childTnLst>${items}</p:childTnLst></p:cTn></p:par>`; }
    body += `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst>${outerCond}</p:stCondLst><p:childTnLst>${seqs}</p:childTnLst></p:cTn></p:par>`;
  }
  const autos = media.filter(m => m.auto);
  if (autos.length){ const calls = autos.map(m => `<p:par><p:cTn id="${nid()}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="${list.length ? 'withEffect' : 'afterEffect'}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="playFrom(${(m.start || 0).toFixed(1)})"><p:cBhvr><p:cTn id="${nid()}" dur="${m.dur ? Math.round(m.dur * 1000) : 'indefinite'}" fill="hold"/><p:tgtEl><p:spTgt spid="${spid[m.id]}"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>`).join('');
    body = `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${calls}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>` + body; }
  const nodes = media.map(m => { const tag = m.audio ? 'audio' : 'video'; return `<p:${tag}><p:cMediaNode vol="${Math.round((m.vol ?? 1) * 100000)}"${m.hide ? ' showWhenStopped="0"' : ''}><p:cTn id="${nid()}" fill="hold"${m.audio ? '' : ' display="0"'}${m.loop ? ' repeatCount="indefinite"' : ''}><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid[m.id]}"/></p:tgtEl></p:cMediaNode></p:${tag}>`; }).join('');
  const seq = body ? `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${body}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` : '';
  const xml = `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${seq}${nodes}</p:childTnLst></p:cTn></p:par></p:tnLst>`;
  const bld = [...new Set(list.map(x => spid[x.obj]))].filter(sp => spid._text && spid._text.has(sp)).map(sp => `<p:bldP spid="${sp}" grpId="0" animBg="1"/>`).join('');
  let n = 0; const fixed = xml.replace(/<p:cTn id="\d+"/g, () => `<p:cTn id="${++n}"`); // ids in document order
  return {xml: fixed + (bld ? `<p:bldLst>${bld}</p:bldLst>` : '') + '</p:timing>'};
}
async function writePptx(deck, {resolveBg}){
  const pres = new PptxGenJS();
  pres.defineLayout({name: 'SRK', width: deck.size.w / 72, height: deck.size.h / 72}); pres.layout = 'SRK';
  pres.title = deck.name || 'Presentation'; pres.author = 'SRK Slides'; pres.company = 'SRK Slides';
  const I = v => Math.round(v / 72 * 1000) / 1000; const H = c => c ? c.replace('#', '').toUpperCase().slice(0, 6) : undefined;
  const SHADOW = {type: 'outer', blur: 5, offset: 3, angle: 45, color: '000000', opacity: 0.35};
  for (const s of deck.slides){
    const sl = pres.addSlide(); if (s.hidden) sl.hidden = true;
    const bg = await resolveBg(s); if (bg.image) sl.background = {data: bg.image}; else if (bg.color) sl.background = {color: H(bg.color)};
    for (const o of s.objects){
      const name = 'srk-' + o.id; const fx = o.fx || {};
      const pos = {x: I(o.x), y: I(o.y), w: I(Math.max(o.w, 1)), h: I(Math.max(o.h, o.kind === 'box' && o.geom === 'line' ? 0 : 1))}; if (o.rot) pos.rotate = o.rot;
      if (o.kind === 'image'){ sl.addImage({data: o.src, ...pos, objectName: name, altText: o.alt || '', ...(fx.opacity != null && fx.opacity < 1 ? {transparency: Math.round((1 - fx.opacity) * 100)} : {}), ...(o.flipH ? {flipH: true} : {}), ...(o.flipV ? {flipV: true} : {})}); continue; }
      if (o.kind === 'media'){ const {rotate, ...mpos} = pos; sl.addMedia({...mpos, objectName: name, cover: o.coverB64, ...(o.mtype === 'online' ? {type: 'online', link: o.link} : {type: o.mtype, data: o.dataB64, extn: o.ext})}); continue; }
      if (o.kind === 'chart'){
        const types = {column: 'bar', bar: 'bar', line: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut'}; const pie = o.chart === 'pie' || o.chart === 'doughnut';
        const d = o.data || {labels: [], series: []}; const data = (pie ? d.series.slice(0, 1) : d.series).map(se => ({name: se.name, labels: d.labels.map(String), values: d.labels.map((_, i) => +se.values[i] || 0)}));
        const pal = (o.palette || []).map(H), ink = H(o.ink || '#333333');
        sl.addChart(pres.ChartType[types[o.chart] || 'bar'], data, {...pos, objectName: name, barDir: o.chart === 'bar' ? 'bar' : 'col', chartColors: pal, showLegend: o.legend !== false, legendPos: 'b', legendColor: ink, legendFontSize: o.fontSize || 12,
          showTitle: !!o.title, title: o.title || undefined, titleColor: ink, titleFontSize: (o.fontSize || 12) * 1.4, showValue: !!o.labels, showPercent: pie && o.labels !== false, dataLabelColor: pie ? 'FFFFFF' : ink, dataLabelFontSize: (o.fontSize || 12) * .9,
          catAxisLabelColor: ink, valAxisLabelColor: ink, catAxisLabelFontSize: o.fontSize || 12, valAxisLabelFontSize: o.fontSize || 12, valGridLine: {color: 'D9D9D9', size: 0.5}, holeSize: 55, fontFace: o.font, lineSize: 2.5, lineDataSymbolSize: 7});
        continue;
      }
      if (o.kind === 'table'){
        const st = o.resolved || {};
        const rows = o.rows.map((r, ri) => r.map((cell, ci) => { const runs = htmlRuns(cell); const lk = typeof tableCellLook === 'function' ? tableCellLook(o, st, ri, ci) : {bg: o.header && ri === 0 ? st.accent : null, fg: o.header && ri === 0 ? '#FFFFFF' : null, bold: o.header && ri === 0, border: st.border};
          return {text: runs.length ? runs : '', options: {fontSize: o.size || 14, fontFace: st.font, color: H(lk.fg || st.color), bold: lk.bold, fill: lk.bg ? {color: H(lk.bg)} : undefined, valign: 'middle', margin: [3, 5, 3, 5], border: lk.border === 'transparent' ? [{type: 'none'}, {type: 'none'}, {type: 'none'}, {type: 'none'}] : {type: 'solid', pt: 0.75, color: H(lk.border || '#7f7f7f')}}}; }));
        sl.addTable(rows, {x: pos.x, y: pos.y, w: pos.w, colW: Array(o.rows[0].length).fill(pos.w / o.rows[0].length), autoPage: false, objectName: name});
        continue;
      }
      const st = o.resolved || {}; const k = o.fit && o.fit < 1 && (o.ph || o.autofit) && o.autofit !== false ? o.fit : 1;
      const fillC = o.grad ? o.grad.a : o.fill;
      const shapeOpts = {...pos, objectName: name, fill: fillC ? {color: H(fillC), ...(fx.fillAlpha != null && fx.fillAlpha < 1 ? {transparency: Math.round((1 - fx.fillAlpha) * 100)} : fx.opacity != null && fx.opacity < 1 ? {transparency: Math.round((1 - fx.opacity) * 100)} : {})} : undefined,
        line: o.line ? {color: H(o.line.color), width: o.line.width, ...(o.line.dash ? {dashType: 'dash'} : {})} : undefined, ...(fx.shadow ? {shadow: SHADOW} : {})};
      if (o.flipH) shapeOpts.flipH = true; if (o.flipV) shapeOpts.flipV = true;
      if (o.geom === 'roundRect') shapeOpts.rectRadius = Math.min(pos.w, pos.h) * 0.16;
      const sp = o.spacing || {};
      const runs = o.html && o.html.replace(/<[^>]+>/g, '').trim() ? htmlRuns(o.html, null, {k, line: sp.line, after: sp.after}) : null;
      if (runs){
        sl.addText(runs, {...shapeOpts, shape: o.geom === 'rect' ? undefined : (pres.ShapeType[o.geom] || o.geom), fontFace: st.font, fontSize: Math.round(st.size * k * 2) / 2, color: H(st.color), bold: !!st.bold, italic: !!st.italic, align: o.align || undefined, valign: ({t: 'top', ctr: 'middle', b: 'bottom'})[o.anchor || 't'], margin: [3.6, 7.2, 3.6, 7.2], vert: o.vert ? 'vert' : undefined, paraSpaceAfter: sp.after || 0, ...(sp.line ? {lineSpacingMultiple: sp.line} : {}), ...(o.cols > 1 ? {columns: o.cols} : {}), ...(o.textShadow ? {shadow: SHADOW} : {})});
      } else if (fillC || o.line){
        sl.addShape(pres.ShapeType[o.geom] || o.geom, shapeOpts);
      }
    }
    if (s.notes) sl.addNotes(s.notes);
  }
  const bytes = await pres.write({outputType: 'uint8array'});
  const need = deck.slides.some(s => (s.transition && s.transition !== 'none') || s.advance || (s.anims && s.anims.length) || s.objects.some(o => o.kind === 'media' && o.mtype !== 'online'));
  if (!need) return bytes;
  const z = await JSZip.loadAsync(bytes);
  for (let i = 0; i < deck.slides.length; i++){
    const s = deck.slides[i]; const p = `ppt/slides/slide${i + 1}.xml`; const f = z.file(p); if (!f) continue;
    let x = await f.async('string'); let add = '';
    const tr = transitionXml(s); if (tr && !x.includes('<p:transition')) add += tr;
    const media = s.objects.filter(o => o.kind === 'media' && o.mtype !== 'online').map(o => ({id: o.id, audio: o.mtype === 'audio', auto: o.start === 'auto', loop: !!o.loop, vol: o.vol, hide: !!o.hideInShow, dur: o.trim && o.trim.end ? o.trim.end - (o.trim.start || 0) : o.dur, start: o.trim ? o.trim.start : 0}));
    for (const m of media.filter(m => m.audio)){ const i = x.indexOf(`name="srk-${m.id}"`); if (i > 0){ const j = x.indexOf('<a:videoFile', i); if (j > 0 && j - i < 600) x = x.slice(0, j) + '<a:audioFile' + x.slice(j + 12); } }
    if (((s.anims && s.anims.length) || media.length) && !x.includes('<p:timing')){
      const spid = {}; spid._text = new Set(); const re = /<p:(sp|pic|graphicFrame)>\s*<p:nv\w+Pr>\s*<p:cNvPr id="(\d+)" name="srk-([^"]+)"/g; let m; while ((m = re.exec(x))){ spid[m[3]] = m[2]; if (m[1] === 'sp') spid._text.add(m[2]); }
      add += timingXml(s.anims, spid, media).xml;
    }
    if (!add) continue;
    x = x.includes('<p:extLst>') && x.lastIndexOf('<p:extLst>') > x.lastIndexOf('</p:cSld>') ? x.slice(0, x.lastIndexOf('<p:extLst>')) + add + x.slice(x.lastIndexOf('<p:extLst>')) : x.replace('</p:sld>', add + '</p:sld>');
    z.file(p, x);
  }
  return z.generateAsync({type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
}
