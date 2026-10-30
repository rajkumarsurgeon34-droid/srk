/* SRK Docs — .docx reader (Word → editor HTML) and writer (editor HTML → Word) */
'use strict';
const OX = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
};
const PAGE_SIZES = { a4: [8.27, 11.69], letter: [8.5, 11], legal: [8.5, 14] }; // inches, portrait
const FONT_STACKS = {
  'Calibri': "Calibri, Carlito, 'Segoe UI', Roboto, 'Noto Sans', sans-serif",
  'Calibri Light': "'Calibri Light', Calibri, Carlito, Roboto, sans-serif",
  'Arial': "Arial, 'Liberation Sans', Roboto, 'Noto Sans', sans-serif",
  'Times New Roman': "'Times New Roman', 'Liberation Serif', 'Noto Serif', Georgia, serif",
  'Cambria': "Cambria, Caladea, 'Noto Serif', Georgia, serif",
  'Georgia': "Georgia, 'Noto Serif', serif",
  'Garamond': "Garamond, 'EB Garamond', 'Noto Serif', serif",
  'Verdana': "Verdana, 'DejaVu Sans', Roboto, sans-serif",
  'Tahoma': "Tahoma, 'DejaVu Sans', Roboto, sans-serif",
  'Courier New': "'Courier New', 'Liberation Mono', 'Droid Sans Mono', monospace",
};
function fontStack(name){ name = String(name||'Calibri').replace(/["']/g,'').trim(); return FONT_STACKS[name] || `'${name.replace(/'/g, '')}', ${/serif|roman|times|georgia|garamond|cambria|book/i.test(name) && !/sans/i.test(name) ? "'Noto Serif', serif" : "Roboto, 'Noto Sans', sans-serif"}`; }
const HIGHLIGHT = { yellow:'#ffff00', green:'#00ff00', cyan:'#00ffff', magenta:'#ff00ff', blue:'#0000ff', red:'#ff0000', darkBlue:'#000080', darkCyan:'#008080', darkGreen:'#008000', darkMagenta:'#800080', darkRed:'#800000', darkYellow:'#808000', darkGray:'#808080', lightGray:'#c0c0c0', black:'#000000', white:'#ffffff' };
const escX = s => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '');
const escH = s => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

/* ---------------- XML helpers ---------------- */
const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const ln = el => el && el.localName;
const kidsOf = (el, name) => el ? [...el.children].filter(c => ln(c) === name) : [];
const kidOf = (el, name) => el ? [...el.children].find(c => ln(c) === name) || null : null;
const descOf = (el, name) => el ? [...el.getElementsByTagNameNS('*', name)] : [];
function wat(el, name){ if (!el) return null; return el.getAttributeNS(OX.w, name) ?? el.getAttribute('w:' + name) ?? el.getAttribute(name); }
function rat(el, name){ if (!el) return null; return el.getAttributeNS(OX.r, name) ?? el.getAttribute('r:' + name); }
const onOff = el => !!el && !/^(0|false|off|none)$/i.test(wat(el, 'val') || '');
async function zText(zip, p){ const f = zip.file(p); return f ? f.async('string') : null; }
function relMap(s){ const m = {}; if (!s) return m; for (const r of descOf(xml(s).documentElement, 'Relationship')) m[r.getAttribute('Id')] = {target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode'), type: r.getAttribute('Type')||''}; return m; }
function joinPath(base, t){ if (t.startsWith('/')) return t.slice(1); const p = base.split('/'); p.pop(); for (const s of t.split('/')){ if (s === '..') p.pop(); else if (s !== '.') p.push(s); } return p.join('/'); }

/* ================================================================
   READER
   ================================================================ */
async function readDocx(bytes){
  const head = bytes.subarray ? bytes.subarray(0, 8) : new Uint8Array(bytes, 0, 8);
  if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) throw new Error('This is an old Word 97–2003 (.doc) file. SRK Docs opens .docx files. Open it in Word or Google Docs, use Save as → .docx, then open that here.');
  let zip; try { zip = await JSZip.loadAsync(bytes); } catch(e){ throw new Error('This file isn’t a Word document (.docx), or it is damaged.'); }
  const docXml = await zText(zip, 'word/document.xml'); if (!docXml) throw new Error('This file isn’t a Word document (.docx).');
  const rels = relMap(await zText(zip, 'word/_rels/document.xml.rels'));

  /* defaults + styles */
  const defaults = { font: 'Calibri', size: 11, after: 8, line: 1.08, before: 0 };
  const styles = {};
  const stylesXml = await zText(zip, 'word/styles.xml');
  let themeMinor = null, themeMajor = null;
  const themePath = Object.keys(zip.files).find(p => /^word\/theme\/theme\d*\.xml$/.test(p));
  if (themePath){ const td = xml(await zText(zip, themePath)).documentElement; const mn = descOf(td,'minorFont')[0], mj = descOf(td,'majorFont')[0];
    themeMinor = kidOf(mn,'latin')?.getAttribute('typeface') || null; themeMajor = kidOf(mj,'latin')?.getAttribute('typeface') || null; }
  if (stylesXml){
    const sd = xml(stylesXml).documentElement;
    const dr = kidOf(descOf(sd,'rPrDefault')[0], 'rPr'), dp = kidOf(descOf(sd,'pPrDefault')[0], 'pPr');
    if (dr){ const f = fontOf(kidOf(dr,'rFonts')); if (f) defaults.font = f; const sz = kidOf(dr,'sz'); if (sz) defaults.size = (+wat(sz,'val'))/2 || 11; }
    else { defaults.after = 0; defaults.line = 1; } // Word 2003-era defaults
    if (dp){ const sp = kidOf(dp,'spacing'); if (sp){ if (wat(sp,'after') != null) defaults.after = (+wat(sp,'after'))/20; if (wat(sp,'before') != null) defaults.before = (+wat(sp,'before'))/20; if (wat(sp,'line') != null && (wat(sp,'lineRule')||'auto') === 'auto') defaults.line = (+wat(sp,'line'))/240; } }
    else if (dr) { defaults.after = 0; defaults.line = 1; }
    for (const s of kidsOf(sd, 'style')){
      const id = wat(s, 'styleId'); if (!id) continue;
      styles[id] = { type: wat(s,'type'), name: (wat(kidOf(s,'name'),'val')||'').toLowerCase(), basedOn: wat(kidOf(s,'basedOn'),'val'), pPr: kidOf(s,'pPr'), rPr: kidOf(s,'rPr'), isDefault: wat(s,'default') === '1' };
    }
    const normal = Object.entries(styles).find(([k,v]) => v.type === 'paragraph' && v.isDefault);
    if (normal){ const r = runProps(normal[1].rPr); if (r.font) defaults.font = r.font; if (r.size) defaults.size = r.size; const p = paraProps(normal[1].pPr); if (p.after != null) defaults.after = p.after; if (p.line != null) defaults.line = p.line; if (p.before != null) defaults.before = p.before; }
  }
  function fontOf(rf){ if (!rf) return null; const f = rf.getAttribute('w:ascii') || rf.getAttribute('w:hAnsi') || wat(rf,'ascii') || wat(rf,'hAnsi'); if (f) return f;
    const th = wat(rf,'asciiTheme') || wat(rf,'hAnsiTheme'); if (th) return /major/i.test(th) ? themeMajor : themeMinor; return null; }
  if (/^\+m/.test(defaults.font)) defaults.font = themeMinor || 'Calibri';

  function runProps(rp){
    const o = {}; if (!rp) return o;
    for (const c of rp.children){
      switch (ln(c)){
        case 'b': o.bold = onOff(c); break;
        case 'i': o.italic = onOff(c); break;
        case 'u': o.underline = (wat(c,'val')||'single') !== 'none'; break;
        case 'strike': case 'dstrike': o.strike = onOff(c); break;
        case 'color': { const v = wat(c,'val'); if (v && /^[0-9a-f]{6}$/i.test(v)) o.color = '#' + v.toLowerCase(); break; }
        case 'highlight': { const v = HIGHLIGHT[wat(c,'val')]; if (v) o.bg = v; break; }
        case 'shd': { const f = wat(c,'fill'); if (f && /^[0-9a-f]{6}$/i.test(f) && f.toLowerCase() !== 'ffffff') o.bg = '#' + f.toLowerCase(); break; }
        case 'sz': o.size = (+wat(c,'val'))/2 || undefined; break;
        case 'rFonts': { const f = fontOf(c); if (f) o.font = f; break; }
        case 'vertAlign': { const v = wat(c,'val'); if (v === 'superscript') o.va = 'sup'; else if (v === 'subscript') o.va = 'sub'; break; }
        case 'caps': if (onOff(c)) o.caps = true; break;
        case 'vanish': if (onOff(c)) o.hidden = true; break;
      }
    }
    return o;
  }
  function paraProps(pp){
    const o = {}; if (!pp) return o;
    const jc = wat(kidOf(pp,'jc'),'val'); if (jc) o.align = ({center:'center', right:'right', end:'right', both:'justify', distribute:'justify', left:'left', start:'left'})[jc];
    const ind = kidOf(pp,'ind');
    if (ind){ const l = wat(ind,'left') ?? wat(ind,'start'); if (l != null) o.left = (+l)/20; const fl = wat(ind,'firstLine'); if (fl != null) o.first = (+fl)/20; const hg = wat(ind,'hanging'); if (hg != null) o.first = -(+hg)/20; }
    const sp = kidOf(pp,'spacing');
    if (sp){ if (wat(sp,'after') != null) o.after = (+wat(sp,'after'))/20; if (wat(sp,'before') != null) o.before = (+wat(sp,'before'))/20;
      const line = wat(sp,'line'); if (line != null){ const rule = wat(sp,'lineRule') || 'auto'; if (rule === 'auto') o.line = (+line)/240; else o.linePt = (+line)/20; } }
    const sh = kidOf(pp,'shd'); if (sh){ const f = wat(sh,'fill'); if (f && /^[0-9a-f]{6}$/i.test(f) && f.toLowerCase()!=='ffffff') o.bg = '#'+f.toLowerCase(); }
    const bdr = kidOf(pp,'pBdr'); if (bdr && kidOf(bdr,'bottom') && wat(kidOf(bdr,'bottom'),'val') !== 'none') o.rule = true;
    if (kidOf(pp,'pageBreakBefore') && onOff(kidOf(pp,'pageBreakBefore'))) o.pageBefore = true;
    const np = kidOf(pp,'numPr'); if (np){ o.numId = wat(kidOf(np,'numId'),'val'); o.ilvl = +(wat(kidOf(np,'ilvl'),'val') || 0); }
    const ps = wat(kidOf(pp,'pStyle'),'val'); if (ps) o.style = ps;
    return o;
  }
  /* resolve style chains */
  const styleCache = {};
  function styleChain(id){
    if (styleCache[id]) return styleCache[id];
    let p = {}, r = {}, seen = new Set(), cur = id, chain = [];
    while (cur && styles[cur] && !seen.has(cur)){ seen.add(cur); chain.unshift(styles[cur]); cur = styles[cur].basedOn; }
    for (const s of chain){ Object.assign(p, paraProps(s.pPr)); Object.assign(r, runProps(s.rPr)); }
    delete p.style;
    return styleCache[id] = {p, r, name: styles[id] ? styles[id].name : '', names: chain.map(s=>s.name)};
  }
  function headingOf(styleId){
    if (!styleId) return null; const st = styleChain(styleId);
    for (const n of [st.name, ...st.names.slice().reverse()]){
      let m = n.match(/^heading (\d)$/); if (m) return {tag: 'h' + Math.min(+m[1], 4)};
      if (n === 'title') return {tag:'h1', cls:'title'};
      if (n === 'quote' || n === 'intense quote') return {tag:'blockquote'};
    }
    return null;
  }

  /* numbering */
  const numbering = {};
  const numXml = await zText(zip, 'word/numbering.xml');
  if (numXml){
    const nd = xml(numXml).documentElement, abs = {};
    for (const a of kidsOf(nd,'abstractNum')){ const lv = {}; for (const l of kidsOf(a,'lvl')) { const ind = descOf(kidOf(l,'pPr'),'ind')[0]; lv[+wat(l,'ilvl')] = {fmt: wat(kidOf(l,'numFmt'),'val') || 'bullet', start: +(wat(kidOf(l,'start'),'val') || 1), left: ind ? +(wat(ind,'left') ?? wat(ind,'start') ?? 0) : 0}; } abs[wat(a,'abstractNumId')] = lv; }
    for (const n of kidsOf(nd,'num')){ const lv = JSON.parse(JSON.stringify(abs[wat(kidOf(n,'abstractNumId'),'val')] || {}));
      for (const o of kidsOf(n,'lvlOverride')){ const so = kidOf(o,'startOverride'); const il = +wat(o,'ilvl'); if (so){ lv[il] = lv[il] || {fmt:'decimal'}; lv[il].start = +wat(so,'val'); } }
      numbering[wat(n,'numId')] = lv; }
  }
  const LIST_TYPE = {decimal:'decimal', lowerLetter:'lower-alpha', upperLetter:'upper-alpha', lowerRoman:'lower-roman', upperRoman:'upper-roman', decimalZero:'decimal-leading-zero'};

  /* images */
  const imgCache = {};
  async function imageData(rid){
    const rel = rels[rid]; if (!rel || rel.mode === 'External') return null;
    const path = joinPath('word/document.xml', rel.target); if (path in imgCache) return imgCache[path];
    const f = zip.file(path); const ext = (path.split('.').pop()||'').toLowerCase();
    const mime = {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', bmp:'image/bmp', webp:'image/webp', svg:'image/svg+xml'}[ext];
    return imgCache[path] = (f && mime) ? `data:${mime};base64,` + await f.async('base64') : null;
  }

  /* -------- runs -------- */
  const PB = '\u0000PB\u0000';
  async function runsHtml(parent, inherit){
    let out = '';
    let fieldDepth = 0, inResult = false; // skip field instruction text; show results
    for (const n of [...parent.children]){
      const t = ln(n);
      if (t === 'r'){
        const fc = kidOf(n,'fldChar');
        if (fc){ const ty = wat(fc,'fldCharType'); if (ty === 'begin'){ fieldDepth++; inResult = false; } else if (ty === 'separate') inResult = true; else if (ty === 'end'){ fieldDepth = Math.max(0, fieldDepth-1); inResult = false; } continue; }
        if (fieldDepth && !inResult) continue;
        out += await runHtml(n, inherit);
      }
      else if (t === 'hyperlink'){
        const rid = rat(n,'id'); const rel = rid && rels[rid]; const href = rel && rel.mode === 'External' ? rel.target : null;
        const inner = await runsHtml(n, inherit);
        out += href && /^(https?:|mailto:|tel:)/i.test(href) ? `<a href="${escH(href)}">${inner}</a>` : inner;
      }
      else if (t === 'ins' || t === 'smartTag' || t === 'customXml' || t === 'fldSimple' || t === 'sdtContent') out += await runsHtml(n, inherit);
      else if (t === 'sdt') out += await runsHtml(kidOf(n,'sdtContent') || n, inherit);
      else if (t === 'oMath' || t === 'oMathPara') out += escH(descOf(n,'t').map(x=>x.textContent).join(''));
    }
    return out;
  }
  async function runHtml(r, inherit){
    const rp = kidOf(r,'rPr'); let f = {...inherit};
    const rs = wat(kidOf(rp,'rStyle'),'val'); if (rs) Object.assign(f, styleChain(rs).r);
    Object.assign(f, runProps(rp));
    if (f.hidden) return '';
    let inner = '';
    for (const c of [...r.children]){
      switch (ln(c)){
        case 't': inner += escH(f.caps ? c.textContent.toUpperCase() : c.textContent); break;
        case 'tab': case 'ptab': inner += '<span class="tab">\t</span>'; break;
        case 'br': inner += wat(c,'type') === 'page' ? PB : '<br>'; break;
        case 'cr': inner += '<br>'; break;
        case 'noBreakHyphen': inner += '‑'; break;
        case 'sym': { const ch = wat(c,'char'); if (ch){ let code = parseInt(ch,16); if (code >= 0xF000) code -= 0xF000; inner += code === 0xB7 ? '•' : String.fromCharCode(code); } break; }
        case 'drawing': {
          const blip = descOf(c,'blip')[0]; const ext = descOf(c,'extent')[0];
          if (blip){ const src = await imageData(blip.getAttributeNS(OX.r,'embed') || blip.getAttribute('r:embed')); if (src){ const w = ext ? Math.round(+ext.getAttribute('cx')/9525) : 0; inner += `<img src="${src}" alt=""${w?` style="width:${w}px"`:''}>`; } }
          break; }
        case 'pict': { const im = descOf(c,'imagedata')[0]; if (im){ const src = await imageData(im.getAttributeNS(OX.r,'id') || im.getAttribute('r:id')); if (src) inner += `<img src="${src}" alt="">`; } break; }
      }
    }
    if (!inner) return '';
    return wrapFmt(inner, f);
  }
  function wrapFmt(inner, f){
    // split around page-break tokens so formatting tags never straddle a break
    if (inner.includes(PB)) return inner.split(PB).map(x => x ? wrapFmt(x, f) : '').join(PB);
    const css = [];
    if (f.font && f.font !== defaults.font) css.push(`font-family:${fontStack(f.font)}`);
    if (f.size && f.size !== defaults.size) css.push(`font-size:${f.size}pt`);
    if (f.color && f.color !== '#000000') css.push(`color:${f.color}`);
    if (f.bg) css.push(`background-color:${f.bg}`);
    let s = css.length ? `<span style="${css.join(';')}">${inner}</span>` : inner;
    if (f.bold) s = `<b>${s}</b>`; if (f.italic) s = `<i>${s}</i>`; if (f.underline) s = `<u>${s}</u>`; if (f.strike) s = `<s>${s}</s>`;
    if (f.va) s = `<${f.va}>${s}</${f.va}>`;
    return s;
  }

  /* -------- blocks -------- */
  function blockStyle(p, opts={}){
    const css = [];
    if (p.align && p.align !== 'left') css.push(`text-align:${p.align}`);
    if (p.left) css.push(`margin-left:${+p.left.toFixed(1)}pt`);
    if (p.first) css.push(`text-indent:${+p.first.toFixed(1)}pt`);
    if (!opts.list){
      if (p.before != null && p.before !== (opts.defBefore ?? defaults.before)) css.push(`margin-top:${+p.before.toFixed(1)}pt`);
      if (p.after != null && p.after !== (opts.defAfter ?? defaults.after)) css.push(`margin-bottom:${+p.after.toFixed(1)}pt`);
    }
    if (p.line != null && Math.abs(p.line - defaults.line) > .01) css.push(`line-height:${+p.line.toFixed(2)}`);
    else if (p.linePt) css.push(`line-height:${+p.linePt.toFixed(1)}pt`);
    if (p.bg) css.push(`background-color:${p.bg}`);
    if (p.rule) css.push('border-bottom:1px solid #000;padding-bottom:1pt');
    return css.length ? ` style="${css.join(';')}"` : '';
  }
  function runCss(r){ const css = []; if (r.font && r.font !== defaults.font) css.push(`font-family:${fontStack(r.font)}`); if (r.size && r.size !== defaults.size) css.push(`font-size:${r.size}pt`); if (r.color && r.color !== '#000000') css.push(`color:${r.color}`); if (r.bold) css.push('font-weight:700'); if (r.italic) css.push('font-style:italic'); return css; }

  async function renderBody(container){
    const out = []; let list = null; // {stack:[{tag,type,start,items:[]}]}
    const flushList = () => { if (!list) return; out.push(serializeList(list.root)); list = null; };
    function serializeList(L){
      const attrs = L.tag === 'ol' ? `${L.type && L.type !== 'decimal' ? ` style="list-style-type:${L.type}"` : ''}${L.start > 1 ? ` start="${L.start}"` : ''}` : '';
      return `<${L.tag}${attrs}>` + L.items.map(it => `<li${it.style||''}>${it.html || '<br>'}${it.children.map(serializeList).join('')}</li>`).join('') + `</${L.tag}>`;
    }
    for (const el of [...container.children]){
      const t = ln(el);
      if (t === 'p'){
        const pp = kidOf(el,'pPr'); const direct = paraProps(pp);
        const sty = direct.style || Object.keys(styles).find(k => styles[k].type === 'paragraph' && styles[k].isDefault);
        const st = sty ? styleChain(sty) : {p:{}, r:{}};
        const p = {...st.p, ...direct};
        const mark = kidOf(pp,'rPr'); // paragraph mark formatting is not text formatting
        const hd = headingOf(direct.style);
        const inheritRun = hd ? {} : {...st.r};
        let html = await runsHtml(el, inheritRun);
        const numId = p.numId && p.numId !== '0' ? p.numId : null;
        // split on page breaks
        const parts = html.split(PB);
        const hasText = s => s.replace(/<(?!img)[^>]+>/g,'').replace(/&nbsp;|\s/g,'').length > 0 || /<img/.test(s);
        if (p.pageBefore){ flushList(); out.push('<div class="pb"></div>'); }
        for (let k = 0; k < parts.length; k++){
          if (k > 0){ flushList(); out.push('<div class="pb"></div>'); if (!hasText(parts[k]) && k === parts.length - 1) continue; }
          const part = parts[k];
          if (k === 0 && parts.length > 1 && !hasText(part)) continue;
          if (numId && numbering[numId]){
            const lv = numbering[numId][p.ilvl || 0] || {fmt:'bullet', start:1}; const tag = lv.fmt === 'bullet' || lv.fmt === 'none' ? 'ul' : 'ol';
            // nesting comes from the level; a different list that is indented further ("List Bullet 2") nests under the lists it sits inside
            let level = Math.min(p.ilvl || 0, 8);
            if (list && list.stack.length && list.root && list.root.numId !== numId && lv.left) level = Math.min(list.stack.filter(L => L.left != null && L.left < lv.left - 90).length, 8);
            if (!list){ list = {root: null, stack: []}; }
            while (list.stack.length > level + 1) list.stack.pop();
            let top = list.stack[list.stack.length - 1];
            if (list.stack.length === level + 1 && (top.tag !== tag || top.numId !== numId)){
              if (level === 0){ flushList(); list = {root:null, stack:[]}; } else { list.stack.pop(); }
            }
            while (list.stack.length < level + 1){
              const L = {tag, type: LIST_TYPE[lv.fmt] || 'decimal', start: lv.start || 1, items: [], numId, left: list.stack.length === level ? lv.left : null};
              if (!list.stack.length){ list.root = L; }
              else { const parent = list.stack[list.stack.length-1]; if (!parent.items.length) parent.items.push({html:'', children:[]}); parent.items[parent.items.length-1].children.push(L); }
              list.stack.push(L);
            }
            const lst = {...p}; delete lst.left; delete lst.first;
            list.stack[level].items.push({html: part, children: [], style: blockStyle(lst, {list:true})});
            continue;
          }
          flushList();
          if (hd){ // keep the document's own heading look (font, colour, size, bold, rule under the title)
            let hs = blockStyle({...direct, rule: st.p.rule || direct.rule}, {defBefore: direct.before, defAfter: direct.after});
            const hc = runCss(st.r); if (!st.r.bold) hc.push('font-weight:400');
            if (hc.length) hs = hs ? hs.replace(/"$/, ';' + hc.join(';') + '"') : ` style="${hc.join(';')}"`;
            out.push(`<${hd.tag}${hd.cls ? ` class="${hd.cls}"` : ''}${hs}>${part || '<br>'}</${hd.tag}>`); continue; }
          let style = blockStyle(p);
          const rc = runCss(st.r); if (rc.length){ style = style ? style.replace(/"$/, ';' + rc.join(';') + '"') : ` style="${rc.join(';')}"`; }
          out.push(`<p${style}>${part || '<br>'}</p>`);
        }
      }
      else if (t === 'tbl'){ flushList(); out.push(await renderTable(el)); }
      else if (t === 'sdt'){ flushList(); out.push(await renderBody(kidOf(el,'sdtContent') || el)); }
      else if (t === 'customXml'){ flushList(); out.push(await renderBody(el)); }
    }
    flushList();
    return out.join('');
  }
  async function renderTable(tbl){
    const rows = kidsOf(tbl,'tr'); const origin = {}; // col -> td record for rowspans
    const grid = rows.map(() => []);
    let html = '<table><tbody>';
    const rowHtml = [];
    for (let ri = 0; ri < rows.length; ri++){
      let col = 0; const cells = [];
      const header = !!descOf(kidOf(rows[ri],'trPr'),'tblHeader')[0];
      for (const tc of kidsOf(rows[ri],'tc')){
        const pr = kidOf(tc,'tcPr'); const span = +(wat(kidOf(pr,'gridSpan'),'val') || 1); const vm = kidOf(pr,'vMerge');
        if (vm && wat(vm,'val') !== 'restart'){ if (origin[col]) origin[col].rows++; col += span; continue; }
        const fill = wat(kidOf(pr,'shd'),'fill'); const va = wat(kidOf(pr,'vAlign'),'val');
        const cell = {span, rows: 1, html: await renderBody(tc), bg: fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase()!=='ffffff' ? '#'+fill.toLowerCase() : null, va, header};
        if (vm) origin[col] = cell; else delete origin[col];
        cells.push(cell); col += span;
      }
      rowHtml.push(cells);
    }
    for (const cells of rowHtml){
      html += '<tr>' + cells.map(c => { const tag = c.header ? 'th' : 'td'; const css = []; if (c.bg) css.push(`background-color:${c.bg}`); if (c.va === 'center') css.push('vertical-align:middle'); if (c.va === 'bottom') css.push('vertical-align:bottom');
        return `<${tag}${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rows > 1 ? ` rowspan="${c.rows}"` : ''}${css.length?` style="${css.join(';')}"`:''}>${c.html || '<p><br></p>'}</${tag}>`; }).join('') + '</tr>';
    }
    return html + '</tbody></table>';
  }

  const docEl = xml(docXml).documentElement; const body = descOf(docEl,'body')[0];
  let html = await renderBody(body);
  html = html.replace(/(<div class="pb"><\/div>)+/g, '<div class="pb"></div>').replace(/^<div class="pb"><\/div>/, '');
  if (!html.trim()) html = '<p><br></p>';

  /* page setup */
  const page = { size: 'a4', orient: 'portrait', margins: {t:1, r:1, b:1, l:1} };
  const sect = kidsOf(body,'sectPr').pop() || descOf(body,'sectPr').pop();
  let headerText = '', footerText = '', pageNumbers = false;
  if (sect){
    const sz = kidOf(sect,'pgSz'), mg = kidOf(sect,'pgMar');
    if (sz){ let w = (+wat(sz,'w'))/1440, hh = (+wat(sz,'h'))/1440; const land = wat(sz,'orient') === 'landscape' || w > hh; if (land) [w, hh] = [hh, w]; page.orient = land ? 'landscape' : 'portrait';
      let best = 'a4', bd = 9; for (const [k,[a,b]] of Object.entries(PAGE_SIZES)){ const d = Math.abs(a-w) + Math.abs(b-hh); if (d < bd){ bd = d; best = k; } } page.size = best; }
    if (mg){ const g = n => Math.max(0, (+wat(mg,n) || 0)/1440); page.margins = {t: +g('top').toFixed(2), r: +g('right').toFixed(2), b: +g('bottom').toFixed(2), l: +g('left').toFixed(2)}; }
    async function hfText(kind){
      const refs = kidsOf(sect, kind + 'Reference'); const ref = refs.find(r => wat(r,'type') === 'default') || refs[0]; if (!ref) return {text:'', page:false};
      const rel = rels[rat(ref,'id')]; if (!rel) return {text:'', page:false};
      const x = await zText(zip, joinPath('word/document.xml', rel.target)); if (!x) return {text:'', page:false};
      const d = xml(x).documentElement; let pg = /\bPAGE\b/.test(descOf(d,'instrText').map(n=>n.textContent).join(' ') + ' ' + descOf(d,'fldSimple').map(n=>wat(n,'instr')).join(' '));
      const lines = [];
      for (const p of descOf(d,'p')){
        let s = '', depth = 0, res = false;
        const walk = n => { for (const c of [...n.children]){ const t = ln(c);
          if (t === 'fldChar'){ const ty = wat(c,'fldCharType'); if (ty==='begin'){ depth++; res=false; } else if (ty==='separate') res = true; else if (ty==='end'){ depth=Math.max(0,depth-1); res=false; } }
          else if (t === 'fldSimple') continue;
          else if (t === 't'){ if (!depth) s += c.textContent; }
          else if (t === 'tab'){ if (!depth) s += '  '; }
          else if (t !== 'instrText') walk(c); } };
        walk(p); if (s.trim()) lines.push(s.trim());
      }
      let text = lines.join('\n');
      if (pg) text = text.replace(/^\s*(page)?\s*(of)?\s*$/i, '').replace(/\bpage\s*(of)?\s*$/i, '').trim();
      return {text, page: pg};
    }
    const hd = await hfText('header'), ft = await hfText('footer');
    headerText = hd.text; footerText = ft.text; pageNumbers = hd.page || ft.page;
  }
  let title = '';
  const core = await zText(zip, 'docProps/core.xml'); if (core){ const t = descOf(xml(core).documentElement,'title')[0]; if (t) title = t.textContent.trim(); }
  return { html, page, header: headerText, footer: footerText, pageNumbers, defaults: {font: defaults.font, size: defaults.size, after: defaults.after, line: defaults.line}, title };
}

/* ================================================================
   WRITER
   ================================================================ */
const BLOCK_TAGS = new Set(['P','DIV','H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','BLOCKQUOTE','PRE','HR','SECTION','ARTICLE','HEADER','FOOTER','ADDRESS','FIGURE','DL','DT','DD','TBODY','THEAD','TFOOT','TR','TD','TH','CENTER','MAIN','ASIDE','NAV']);
function cssPt(v, base=11){
  if (v == null || v === '') return null; v = String(v).trim();
  const m = v.match(/^(-?[\d.]+)(px|pt|in|cm|mm|em|rem|%)?$/); if (!m) return null; const n = parseFloat(m[1]);
  switch (m[2]){ case 'pt': return n; case 'in': return n*72; case 'cm': return n*28.3465; case 'mm': return n*2.83465; case 'em': case 'rem': return n*base; case '%': return n/100*base; default: return n*0.75; }
}
function cssColor(v){
  if (!v) return null; v = v.trim().toLowerCase(); if (v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor') return null;
  let m = v.match(/^#([0-9a-f]{3})$/); if (m) return m[1].split('').map(c=>c+c).join('').toUpperCase();
  m = v.match(/^#([0-9a-f]{6})$/); if (m) return m[1].toUpperCase();
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m){ if (m[4] != null && parseFloat(m[4]) === 0) return null; return [m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,'0')).join('').toUpperCase(); }
  const named = {black:'000000', white:'FFFFFF', red:'FF0000', green:'008000', blue:'0000FF', yellow:'FFFF00', gray:'808080', grey:'808080', orange:'FFA500', purple:'800080', navy:'000080', maroon:'800000', teal:'008080', silver:'C0C0C0', lime:'00FF00', aqua:'00FFFF', fuchsia:'FF00FF', olive:'808000'};
  return named[v] || null;
}
function firstFont(v){ if (!v) return null; const f = v.split(',')[0].replace(/["']/g,'').trim(); if (!f || /^(serif|sans-serif|monospace|system-ui|inherit|initial|cursive|fantasy|-apple-system)$/i.test(f)) return null; if (/^carlito$/i.test(f)) return 'Calibri'; if (/^caladea$/i.test(f)) return 'Cambria'; if (/^liberation serif$/i.test(f)) return 'Times New Roman'; if (/^liberation sans$/i.test(f)) return 'Arial'; return f; }

async function writeDocx(model){
  const {html, page, header='', footer='', pageNumbers=false, defaults={font:'Calibri', size:11}, title='Document'} = model;
  const holder = document.createElement('div'); holder.innerHTML = html;
  const [pw, ph] = PAGE_SIZES[page.size] || PAGE_SIZES.a4; const land = page.orient === 'landscape';
  const pageW = land ? ph : pw, pageH = land ? pw : ph; const m = page.margins;
  const contentTw = Math.round((pageW - m.l - m.r) * 1440);
  const z = new JSZip(); const rels = []; let relN = 0, imgN = 0, docPr = 0;
  const abstracts = {}; const nums = []; // nums: {id, abs, start}
  let bulletNum = null;
  const absFor = type => { if (!(type in abstracts)) abstracts[type] = Object.keys(abstracts).length; return abstracts[type]; };
  function bulletNumId(){ if (!bulletNum){ bulletNum = nums.length + 1; nums.push({id: bulletNum, abs: absFor('bullet'), start: 1}); } return bulletNum; }
  function newOlNum(type, start){ const id = nums.length + 1; nums.push({id, abs: absFor(type || 'decimal'), start: start || 1}); return id; }
  function rel(type, target, external){ const id = 'rId' + (100 + (++relN)); rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${escX(target)}"${external?' TargetMode="External"':''}/>`); return id; }

  /* ---- images ---- */
  async function imageBytes(img){
    const src = img.getAttribute('src') || ''; let mime = (src.match(/^data:(image\/[a-z+.-]+);base64,/i)||[])[1];
    if (!mime) return null;
    let b64 = src.slice(src.indexOf(',') + 1);
    let bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    let natW = img.naturalWidth, natH = img.naturalHeight;
    if (!natW){ try { const bm = await createImageBitmap(new Blob([bytes], {type: mime})); natW = bm.width; natH = bm.height; bm.close && bm.close(); } catch(e){ natW = 400; natH = 300; } }
    if (!/^image\/(png|jpe?g|gif|bmp)$/i.test(mime)){
      try { const bm = await createImageBitmap(new Blob([bytes], {type: mime})); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm,0,0);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); bytes = new Uint8Array(await blob.arrayBuffer()); mime = 'image/png'; } catch(e){ return null; } }
    return {bytes, ext: mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : mime.includes('bmp') ? 'bmp' : 'jpeg', natW, natH};
  }
  async function drawing(img){
    const d = await imageBytes(img); if (!d) return '';
    imgN++; const name = `image${imgN}.${d.ext === 'jpeg' ? 'jpg' : d.ext}`; z.file('word/media/' + name, d.bytes);
    const id = rel('image', 'media/' + name);
    let wpx = null; const sw = img.style.width, aw = img.getAttribute('width');
    if (sw && sw.endsWith('%')) wpx = contentTw / 15 * parseFloat(sw) / 100;
    else if (sw) wpx = (cssPt(sw) || 0) / 0.75;
    else if (aw) wpx = parseFloat(aw);
    if (!wpx) wpx = d.natW;
    let hpx = d.natW ? wpx * d.natH / d.natW : wpx * .75;
    const maxW = contentTw / 15; if (wpx > maxW){ hpx *= maxW / wpx; wpx = maxW; }
    const cx = Math.round(wpx * 9525), cy = Math.round(hpx * 9525); docPr++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPr}" name="Picture ${docPr}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${OX.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${OX.a}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPr}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  /* ---- runs ---- */
  function fmtFromEl(el, f){
    f = {...f}; const tag = el.tagName;
    if (tag === 'B' || tag === 'STRONG') f.bold = true;
    if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR') f.italic = true;
    if (tag === 'U' || tag === 'INS') f.underline = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') f.strike = true;
    if (tag === 'SUP') f.va = 'superscript'; if (tag === 'SUB') f.va = 'subscript';
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') f.font = 'Courier New';
    if (tag === 'MARK') f.bg = 'FFFF00';
    if (tag === 'FONT'){ const c = cssColor(el.getAttribute('color')); if (c) f.color = c; const fc = firstFont(el.getAttribute('face')); if (fc) f.font = fc; const s = el.getAttribute('size'); if (s) f.size = ({1:8,2:10,3:12,4:14,5:18,6:24,7:36})[s] || f.size; }
    if (/^H[1-6]$/.test(tag) || tag === 'TH') { /* heading styles carry their own look */ }
    const st = el.style;
    if (st){
      if (st.fontWeight){ const w = st.fontWeight; f.bold = w === 'bold' || w === 'bolder' || (+w >= 600); }
      if (st.fontStyle) f.italic = st.fontStyle === 'italic' || st.fontStyle === 'oblique';
      const td = st.textDecorationLine || st.textDecoration || '';
      if (td){ if (td.includes('underline')) f.underline = true; if (td.includes('line-through')) f.strike = true; if (td === 'none'){ f.underline = false; f.strike = false; } }
      const c = cssColor(st.color); if (c) f.color = c;
      const bg = cssColor(st.backgroundColor); if (bg && !BLOCK_TAGS.has(tag)) f.bg = bg;
      const fs = cssPt(st.fontSize, f.size || defaults.size); if (fs) f.size = Math.round(fs * 2) / 2;
      const ff = firstFont(st.fontFamily); if (ff) f.font = ff;
      if (st.verticalAlign === 'super') f.va = 'superscript'; if (st.verticalAlign === 'sub') f.va = 'subscript';
      if (st.textTransform === 'uppercase') f.caps = true;
    }
    return f;
  }
  function rPr(f, extraStyle){
    const x = [];
    if (extraStyle) x.push(`<w:rStyle w:val="${extraStyle}"/>`);
    if (f.font) x.push(`<w:rFonts w:ascii="${escX(f.font)}" w:hAnsi="${escX(f.font)}" w:cs="${escX(f.font)}"/>`);
    if (f.bold) x.push('<w:b/><w:bCs/>'); if (f.bold === false) x.push('<w:b w:val="0"/>');
    if (f.italic) x.push('<w:i/><w:iCs/>');
    if (f.caps) x.push('<w:caps/>');
    if (f.strike) x.push('<w:strike/>');
    if (f.color) x.push(`<w:color w:val="${f.color}"/>`);
    if (f.size) x.push(`<w:sz w:val="${Math.round(f.size*2)}"/><w:szCs w:val="${Math.round(f.size*2)}"/>`);
    if (f.underline) x.push('<w:u w:val="single"/>');
    if (f.bg) x.push(`<w:shd w:val="clear" w:color="auto" w:fill="${f.bg}"/>`);
    if (f.va) x.push(`<w:vertAlign w:val="${f.va}"/>`);
    return x.length ? `<w:rPr>${x.join('')}</w:rPr>` : '';
  }
  function textRuns(text, f, styleId){
    const out = []; const parts = text.split('\t');
    parts.forEach((p, i) => { if (i) out.push(`<w:r>${rPr(f, styleId)}<w:tab/></w:r>`); if (p) out.push(`<w:r>${rPr(f, styleId)}<w:t xml:space="preserve">${escX(p)}</w:t></w:r>`); });
    return out.join('');
  }
  async function inlineRuns(nodes, f, state){
    let out = '';
    for (const n of nodes){
      if (n.nodeType === 3){
        let t = n.data; const pre = state.pre || (n.parentElement && n.parentElement.closest && n.parentElement.closest('.tab'));
        if (!pre){ t = t.replace(/[ \n\r\f]+/g, ' '); if (state.atStart) t = t.replace(/^ +/, ''); if (state.lastSpace) t = t.replace(/^ /, ''); }
        t = t.replace(/ /g, ' ').replace(/​/g, '');
        if (!t) continue;
        state.atStart = false; state.lastSpace = / $/.test(t);
        out += textRuns(t, f, state.linkStyle);
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'BR'){ out += '<w:r><w:br/></w:r>'; state.atStart = true; state.lastSpace = false; continue; }
      if (tag === 'IMG'){ out += await drawing(n); state.atStart = false; continue; }
      if (tag === 'SCRIPT' || tag === 'STYLE' || n.classList.contains('pb')) continue;
      if (n.classList.contains('tab')){ out += `<w:r>${rPr(f)}<w:tab/></w:r>`; state.lastSpace = false; continue; }
      if (tag === 'A' && /^(https?:|mailto:|tel:)/i.test(n.getAttribute('href') || '')){
        const id = rel('hyperlink', n.getAttribute('href'), true);
        const inner = await inlineRuns([...n.childNodes], fmtFromEl(n, f), {...state, linkStyle: 'Hyperlink'});
        out += `<w:hyperlink r:id="${id}" w:history="1">${inner}</w:hyperlink>`; state.atStart = false; continue;
      }
      if (BLOCK_TAGS.has(tag)) { out += await inlineRuns([...n.childNodes], fmtFromEl(n, f), state); continue; }
      out += await inlineRuns([...n.childNodes], fmtFromEl(n, f), state);
    }
    return out;
  }

  /* ---- paragraphs ---- */
  function pPr(o){
    const x = [];
    if (o.style) x.push(`<w:pStyle w:val="${o.style}"/>`);
    if (o.keepNext) x.push('<w:keepNext/>');
    if (o.num) x.push(`<w:numPr><w:ilvl w:val="${o.num.ilvl}"/><w:numId w:val="${o.num.id}"/></w:numPr>`);
    if (o.rule) x.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>');
    if (o.bg) x.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.bg}"/>`);
    const sp = []; if (o.before != null) sp.push(`w:before="${Math.round(o.before*20)}"`); if (o.after != null) sp.push(`w:after="${Math.round(o.after*20)}"`);
    if (o.line != null) sp.push(`w:line="${Math.round(o.line*240)}" w:lineRule="auto"`); else if (o.linePt != null) sp.push(`w:line="${Math.round(o.linePt*20)}" w:lineRule="atLeast"`);
    if (sp.length) x.push(`<w:spacing ${sp.join(' ')}/>`);
    const ind = []; if (o.left) ind.push(`w:left="${Math.round(o.left*20)}"`); if (o.first > 0) ind.push(`w:firstLine="${Math.round(o.first*20)}"`); if (o.first < 0) ind.push(`w:hanging="${Math.round(-o.first*20)}"`);
    if (ind.length) x.push(`<w:ind ${ind.join(' ')}/>`);
    if (o.align) x.push(`<w:jc w:val="${({left:'left', center:'center', right:'right', justify:'both', start:'left', end:'right'})[o.align] || 'left'}"/>`);
    return x.length ? `<w:pPr>${x.join('')}</w:pPr>` : '';
  }
  function blockOpts(el, inherited){
    const o = {...inherited}; const tag = el.tagName; const st = el.style;
    if (tag === 'H1') o.style = el.classList.contains('title') ? 'Title' : 'Heading1';
    if (tag === 'H2') o.style = 'Heading2'; if (tag === 'H3') o.style = 'Heading3'; if (/^H[4-6]$/.test(tag)) o.style = 'Heading4';
    if (tag === 'BLOCKQUOTE' && !st.marginLeft) o.style = 'Quote';
    if (tag === 'PRE') o.pre = true;
    if (tag === 'CENTER') o.align = 'center';
    const align = st.textAlign || el.getAttribute('align'); if (align && /^(left|center|right|justify|start|end)$/.test(align)) o.align = align;
    const ml = cssPt(st.marginLeft) || cssPt(st.paddingLeft); if (ml) o.left = (o.left || 0) + ml;
    const ti = cssPt(st.textIndent); if (ti) o.first = ti;
    const mb = cssPt(st.marginBottom); if (mb != null && st.marginBottom) o.after = Math.max(0, mb);
    const mt = cssPt(st.marginTop); if (mt != null && st.marginTop) o.before = Math.max(0, mt);
    const lh = st.lineHeight; if (lh){ if (/^[\d.]+$/.test(lh)) o.line = parseFloat(lh); else if (/%$/.test(lh)) o.line = parseFloat(lh)/100; else { const p = cssPt(lh); if (p) o.linePt = p; } }
    const bg = cssColor(st.backgroundColor); if (bg && tag !== 'TABLE') o.bg = bg;
    if (st.borderBottomStyle && st.borderBottomStyle !== 'none') o.rule = true;
    return o;
  }
  function blockRunFmt(el, f){ // run formatting set on the block element itself (font, colour, size)
    const g = {...f}; const st = el.style; if (!st) return g;
    const c = cssColor(st.color); if (c) g.color = c; const fs = cssPt(st.fontSize, defaults.size); if (fs) g.size = Math.round(fs*2)/2;
    const ff = firstFont(st.fontFamily); if (ff) g.font = ff; if (st.fontWeight) g.bold = st.fontWeight === 'bold' || +st.fontWeight >= 600; if (st.fontStyle === 'italic') g.italic = true;
    return g;
  }
  async function paragraph(nodes, o, f){
    const state = {atStart: true, lastSpace: false, pre: !!o.pre};
    let runs = await inlineRuns(nodes, f, state);
    runs = runs.replace(/<w:r><w:br\/><\/w:r>$/, ''); // a trailing <br> only keeps an HTML line open
    return `<w:p>${pPr(o)}${runs}</w:p>`;
  }
  const isBlockNode = n => n.nodeType === 1 && (BLOCK_TAGS.has(n.tagName) || n.classList.contains('pb'));
  async function blocks(parent, o, f, out){
    let buf = [];
    const flush = async () => { if (!buf.length) return; const hasContent = buf.some(n => n.nodeType === 1 || n.data.replace(/\s+/g,'').length); if (hasContent) out.push(await paragraph(buf, o, f)); buf = []; };
    for (const n of [...parent.childNodes]){
      if (!isBlockNode(n)){ buf.push(n); continue; }
      await flush();
      const tag = n.tagName;
      if (n.classList.contains('pb')){ out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); continue; }
      if (tag === 'HR'){ out.push(`<w:p>${pPr({rule: true, after: 8})}</w:p>`); continue; }
      if (tag === 'UL' || tag === 'OL'){ await list(n, 0, o, f, out); continue; }
      if (tag === 'TABLE'){ await table(n, out); continue; }
      if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT' || tag === 'TR'){ continue; }
      const bo = blockOpts(n, {left: o.left, align: o.align}); const bf = blockRunFmt(n, f);
      if ([...n.childNodes].some(isBlockNode)) await blocks(n, bo, bf, out);
      else out.push(await paragraph([...n.childNodes], bo, bf));
    }
    await flush();
  }
  async function list(el, level, o, f, out){
    const ol = el.tagName === 'OL'; const type = ol ? ({'lower-alpha':'lowerLetter','lower-latin':'lowerLetter','upper-alpha':'upperLetter','upper-latin':'upperLetter','lower-roman':'lowerRoman','upper-roman':'upperRoman'})[el.style.listStyleType] || ({a:'lowerLetter',A:'upperLetter',i:'lowerRoman',I:'upperRoman'})[el.getAttribute('type')] || 'decimal' : 'bullet';
    const id = ol ? newOlNum(type, +(el.getAttribute('start') || 1)) : bulletNumId();
    for (const li of [...el.children]){
      if (li.tagName !== 'LI'){ if (li.tagName === 'UL' || li.tagName === 'OL') await list(li, level + 1, o, f, out); continue; }
      const own = [], nested = [];
      for (const c of [...li.childNodes]){ if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c); else own.push(c); }
      const lo = {...blockOpts(li, {}), num: {id, ilvl: Math.min(level, 8)}}; delete lo.left;
      const lf = blockRunFmt(li, f);
      // segments: each block child is its own paragraph, loose inline nodes are grouped
      const segs = []; let cur = [];
      for (const c of own){ if (isBlockNode(c)){ if (cur.length) segs.push({nodes: cur}); cur = []; segs.push({el: c}); } else cur.push(c); }
      if (cur.length) segs.push({nodes: cur});
      const real = segs.filter(sg => sg.el || sg.nodes.some(nn => nn.nodeType === 1 || nn.data.trim()));
      if (!real.length) real.push({nodes: []});
      for (let k = 0; k < real.length; k++){
        const sg = real[k]; const extra = k === 0 ? lo : {left: 36 * (level + 1)};
        if (sg.el && (sg.el.tagName === 'TABLE')){ await table(sg.el, out); continue; }
        if (sg.el && (sg.el.tagName === 'UL' || sg.el.tagName === 'OL')){ await list(sg.el, level + 1, o, f, out); continue; }
        const nodes = sg.el ? [...sg.el.childNodes] : sg.nodes; const bo = sg.el ? {...blockOpts(sg.el, {}), ...extra} : extra;
        out.push(await paragraph(nodes, bo, sg.el ? blockRunFmt(sg.el, lf) : lf));
      }
      for (const nl of nested) await list(nl, level + 1, o, f, out);
    }
  }
  async function table(tbl, out){
    const rows = [...tbl.rows]; if (!rows.length) return;
    // grid with rowspans
    const pending = []; // col -> remaining rows {left, span}
    const matrix = [];
    let ncols = 0;
    for (const tr of rows){
      const cells = []; let col = 0; const tds = [...tr.cells]; let i = 0;
      for (let guard = 0; guard < 200; guard++){
        const p = pending[col];
        if (p && p.left > 0){ cells.push({cont: true, span: p.span}); p.left--; col += p.span; continue; }
        if (i < tds.length){ const td = tds[i++]; const span = Math.max(1, +td.colSpan || 1), rs = Math.max(1, +td.rowSpan || 1);
          cells.push({td, span, restart: rs > 1}); pending[col] = rs > 1 ? {left: rs - 1, span} : null; col += span; continue; }
        const next = pending.findIndex((q, c) => c > col && q && q.left > 0); if (next < 0) break;
        while (col < next){ cells.push({span: 1}); col++; }
      }
      ncols = Math.max(ncols, col); matrix.push({tr, cells});
    }
    const colW = Math.floor(contentTw / Math.max(1, ncols));
    let x = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>`;
    for (let c = 0; c < ncols; c++) x += `<w:gridCol w:w="${colW}"/>`;
    x += '</w:tblGrid>';
    for (const {tr, cells} of matrix){
      const isHead = tr.parentElement && tr.parentElement.tagName === 'THEAD' || [...tr.cells].every(c => c.tagName === 'TH');
      x += `<w:tr>${isHead ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
      for (const c of cells){
        const pr = [`<w:tcW w:w="${colW * c.span}" w:type="dxa"/>`]; if (c.span > 1) pr.push(`<w:gridSpan w:val="${c.span}"/>`);
        if (c.cont) pr.push('<w:vMerge/>'); else if (c.restart) pr.push('<w:vMerge w:val="restart"/>');
        if (c.td){ const bg = cssColor(c.td.style.backgroundColor); if (bg) pr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`);
          const va = c.td.style.verticalAlign; if (va === 'middle') pr.push('<w:vAlign w:val="center"/>'); if (va === 'bottom') pr.push('<w:vAlign w:val="bottom"/>'); }
        let inner = [];
        if (c.td){ const f0 = c.td.tagName === 'TH' ? {bold: true} : {}; await blocks(c.td, blockOpts(c.td, {after: 0}), f0, inner); }
        inner = inner.map(px => px.includes('<w:pPr>') ? px : px.replace(/^<w:p>/, '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>'));
        x += `<w:tc><w:tcPr>${pr.join('')}</w:tcPr>${inner.join('') || '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>'}</w:tc>`;
      }
      x += '</w:tr>';
    }
    out.push(x + '</w:tbl>');
  }

  const body = []; await blocks(holder, {}, {}, body);
  // Word needs a paragraph after a table at the very end
  if (!body.length || body[body.length - 1].startsWith('<w:tbl>')) body.push('<w:p/>');

  /* ---- header / footer ---- */
  const hfPara = (text, align='center') => String(text).split('\n').map(l => `<w:p><w:pPr><w:pStyle w:val="${align === 'hdr' ? 'Header' : 'Footer'}"/><w:jc w:val="center"/></w:pPr>${l ? textRuns(l, {}) : ''}</w:p>`).join('');
  const NS_DECL = `xmlns:w="${OX.w}" xmlns:r="${OX.r}"`;
  let hdrRef = '', ftrRef = '';
  if (header.trim()){ z.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS_DECL}>${hfPara(header, 'hdr')}</w:hdr>`); hdrRef = `<w:headerReference w:type="default" r:id="${rel('header', 'header1.xml')}"/>`; }
  if (footer.trim() || pageNumbers){
    let x = footer.trim() ? hfPara(footer) : '';
    if (pageNumbers) x += `<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>`;
    z.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS_DECL}>${x}</w:ftr>`); ftrRef = `<w:footerReference w:type="default" r:id="${rel('footer', 'footer1.xml')}"/>`;
  }

  /* ---- numbering ---- */
  const BUL = ['•', 'o', '▪'];
  const absXml = Object.entries(abstracts).map(([type, id]) => {
    let lv = '';
    for (let i = 0; i < 9; i++){
      const left = 720 * (i + 1);
      if (type === 'bullet'){ const ch = BUL[i % 3]; lv += `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${ch}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>${ch === 'o' ? '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:hint="default"/></w:rPr>' : ch === '▪' ? '<w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:hint="default"/></w:rPr>' : '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>'}</w:lvl>`.replace('<w:lvlText w:val="•"/>', '<w:lvlText w:val=""/>').replace('<w:lvlText w:val="▪"/>', '<w:lvlText w:val=""/>'); }
      else { const cycle = [type, 'lowerLetter', 'lowerRoman']; const fmt = i === 0 ? type : cycle[i % 3]; lv += `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="%${i+1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`; }
    }
    return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${lv}</w:abstractNum>`;
  }).join('');
  const numXmlOut = nums.map(n => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abs}"/>${n.start !== 1 || nums.filter(k=>k.abs===n.abs).length > 1 ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.start}"/></w:lvlOverride>` : ''}</w:num>`).join('');
  const hasNum = nums.length > 0;
  if (hasNum) z.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS_DECL}>${absXml}${numXmlOut}</w:numbering>`);

  /* ---- page ---- */
  const tw = v => Math.round(v * 1440);
  const sect = `<w:sectPr>${hdrRef}${ftrRef}<w:pgSz w:w="${tw(pageW)}" w:h="${tw(pageH)}"${land ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${tw(m.t)}" w:right="${tw(m.r)}" w:bottom="${tw(m.b)}" w:left="${tw(m.l)}" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

  /* ---- styles ---- */
  const font = escX(defaults.font || 'Calibri'), sz = Math.round((defaults.size || 11) * 2);
  const after = Math.round((defaults.after ?? 8) * 20), line = Math.round((defaults.line ?? 1.08) * 240);
  const H = (id, name, size, color, extra='') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${id==='Heading1'?240:40}" w:after="0"/><w:outlineLvl w:val="${+id.slice(-1)-1}"/></w:pPr><w:rPr>${extra}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS_DECL}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-IN" w:eastAsia="en-US" w:bidi="ta-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${after}" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    + `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>`
    + `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    + H('Heading1', 'heading 1', 32, '2F5496') + H('Heading2', 'heading 2', 26, '2F5496') + H('Heading3', 'heading 3', 24, '1F3763') + H('Heading4', 'heading 4', 22, '2F5496', '<w:i/><w:iCs/>')
    + `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr><w:rPr><w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="404040"/></w:rPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>`
    + `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>`
    + `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>`
    + `</w:styles>`;

  /* list paragraphs pick up List Paragraph so Word indents them like its own */
  const docBody = body.join('').replace(/<w:pPr><w:numPr>/g, '<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr>');
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS_DECL} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="${OX.a}" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${docBody}${sect}</w:body></w:document>`);
  z.file('word/styles.xml', stylesXml);
  z.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS_DECL}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`);
  const ov = p => `<Override PartName="/word/${p}"`;
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="bmp" ContentType="image/bmp"/>`
    + `${ov('document.xml')} ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${ov('styles.xml')} ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${ov('settings.xml')} ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`
    + `${hasNum ? ov('numbering.xml') + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ''}${hdrRef ? ov('header1.xml') + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${ftrRef ? ov('footer1.xml') + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${OX.rel}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${OX.rel}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${hasNum ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : ''}${rels.join('')}</Relationships>`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escX(title)}</dc:title><dc:creator>SRK Docs</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  z.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SRK Docs</Application></Properties>`);
  return z.generateAsync({type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
