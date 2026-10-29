/* SRK — Word / Excel / PowerPoint readers and writers, HTML → PDF */
'use strict';
const NS = {
  w:'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a:'http://schemas.openxmlformats.org/drawingml/2006/main',
  p:'http://schemas.openxmlformats.org/presentationml/2006/main',
};
const parseXml = s => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, name) => el ? [...el.children].filter(c=>c.localName===name) : [];
const kid = (el, name) => el ? [...el.children].find(c=>c.localName===name) : null;
const desc = (el, name) => el ? [...el.getElementsByTagNameNS('*', name)] : [];
const attr = (el, name) => el ? (el.getAttribute(name) ?? el.getAttribute(name.split(':').pop())) : null;
function relsMap(xmlStr){ const m={}; if(!xmlStr) return m; desc(parseXml(xmlStr).documentElement,'Relationship').forEach(r=>m[r.getAttribute('Id')]=r.getAttribute('Target')); return m; }
function joinPath(base, target){ if(target.startsWith('/')) return target.slice(1); const parts=base.split('/'); parts.pop(); for(const seg of target.split('/')){ if(seg==='..') parts.pop(); else if(seg!=='.') parts.push(seg); } return parts.join('/'); }
async function zipText(zip, path){ const f=zip.file(path); return f ? f.async('string') : null; }
async function zipDataUrl(zip, path){ const f=zip.file(path); if(!f) return null; const ext=extOf(path); const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',svg:'image/svg+xml'}[ext]; if(!mime) return null; return `data:${mime};base64,`+await f.async('base64'); }

/* ================= DOCX writer ================= */
async function makeDocx(blocks, {marginTw=1134, title='Document'}={}){
  const z = new JSZip(); const rels=[]; let imgN=0; const body=[];
  const pageWtw=11906, pageHtw=16838, contentWemu=(pageWtw-2*marginTw)*635, contentHemu=(pageHtw-2*marginTw)*635 - 200000;
  for (const b of blocks){
    if (b.type==='pagebreak'){ body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); continue; }
    if (b.type==='img'){
      imgN++; const id='rIdImg'+imgN, ext=b.png?'png':'jpeg';
      z.file(`word/media/image${imgN}.${ext==='png'?'png':'jpg'}`, b.bytes);
      rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imgN}.${ext==='png'?'png':'jpg'}"/>`);
      let cx=b.w*9525, cy=b.h*9525; const k=Math.min(1, contentWemu/cx, contentHemu/cy); cx=Math.round(cx*k); cy=Math.round(cy*k);
      body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imgN}" name="Picture ${imgN}"/><a:graphic xmlns:a="${NS.a}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imgN}" name="image${imgN}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      continue;
    }
    const runs = b.runs || [{text:b.text||'', bold:b.bold, italic:b.italic}];
    const ppr = [];
    if (b.level) ppr.push(`<w:pStyle w:val="Heading${b.level}"/>`);
    if (b.bullet) ppr.push('<w:ind w:left="360" w:hanging="360"/>');
    if (b.align) ppr.push(`<w:jc w:val="${b.align}"/>`);
    const rx = runs.map(r=>{
      const rp=[]; if(r.bold) rp.push('<w:b/>'); if(r.italic) rp.push('<w:i/>'); if(r.size) rp.push(`<w:sz w:val="${Math.round(r.size*2)}"/>`);
      const parts = String(r.text).split('\n').map(t=>`<w:t xml:space="preserve">${xmlEsc(t)}</w:t>`).join('<w:br/>');
      return `<w:r>${rp.length?`<w:rPr>${rp.join('')}</w:rPr>`:''}${parts}</w:r>`;
    }).join('');
    body.push(`<w:p>${ppr.length?`<w:pPr>${ppr.join('')}</w:pPr>`:''}${rx}</w:p>`);
  }
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>SRK</dc:creator></cp:coreProperties>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`);
  const hs = (n,sz)=>`<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
  z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Nirmala UI"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${hs(1,36)}${hs(2,30)}${hs(3,26)}</w:styles>`);
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="${NS.a}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="${pageWtw}" w:h="${pageHtw}"/><w:pgMar w:top="${marginTw}" w:right="${marginTw}" w:bottom="${marginTw}" w:left="${marginTw}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({type:'uint8array', compression:'DEFLATE'});
}

/* ================= DOCX reader → HTML ================= */
async function docxToHtml(bytes){
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zipText(zip,'word/document.xml'); if(!docXml) throw new Error('This doesn’t look like a Word (.docx) file.');
  const rels = relsMap(await zipText(zip,'word/_rels/document.xml.rels'));
  const stylesXml = await zipText(zip,'word/styles.xml');
  const headingOf = {}, listStyle = {}; let baseSize = 11;
  if (stylesXml){
    const sd = parseXml(stylesXml);
    desc(sd.documentElement,'style').forEach(s=>{ const id=attr(s,'w:styleId'); const nm=(attr(kid(s,'name'),'w:val')||'').toLowerCase(); const m=nm.match(/^heading (\d)/); if(m) headingOf[id]=+m[1]; else if(nm==='title') headingOf[id]=1; else if(nm==='subtitle') headingOf[id]=2;
      if (/^list (bullet|number)/.test(nm) || desc(kid(s,'pPr'),'numPr').length) listStyle[id] = /number/.test(nm) ? 'ol' : 'ul'; });
    const dsz = desc(desc(sd.documentElement,'rPrDefault')[0],'sz')[0]; if(dsz) baseSize = (+attr(dsz,'w:val'))/2 || 11;
  }
  const numFmt = {}; const numXml = await zipText(zip,'word/numbering.xml');
  if (numXml){ const nd=parseXml(numXml).documentElement; const abs={}; desc(nd,'abstractNum').forEach(a=>{ const l0=kids(a,'lvl')[0]; abs[attr(a,'w:abstractNumId')] = attr(kid(l0,'numFmt'),'w:val')||'bullet'; }); kids(nd,'num').forEach(n=>{ numFmt[attr(n,'w:numId')] = abs[attr(kid(n,'abstractNumId'),'w:val')]; }); }
  const d = parseXml(docXml), bodyEl = desc(d.documentElement,'body')[0];
  let pageCss = 'A4'; const sect = desc(bodyEl,'sectPr').pop(); let margins=null, landscape=false;
  if (sect){ const pgSz=kid(sect,'pgSz'), pgMar=kid(sect,'pgMar'); if(pgSz){ const w=+attr(pgSz,'w:w'), hh=+attr(pgSz,'w:h'); landscape = w>hh; } if(pgMar) margins = (+attr(pgMar,'w:left')||1440)/20; }
  const imgCache = {};
  async function img(rid, cx, cy){ const tgt=rels[rid]; if(!tgt) return ''; const path=joinPath('word/document.xml', tgt); if(!(path in imgCache)) imgCache[path]=await zipDataUrl(zip,path); const src=imgCache[path]; if(!src) return ''; const w=cx?Math.round(cx/9525):null; return `<img src="${src}" style="max-width:100%;${w?`width:${w}px;`:''}height:auto" alt="">`; }
  async function runsHtml(p){
    let out='';
    for (const r of [...p.children]){
      if (r.localName==='hyperlink' || r.localName==='ins' || r.localName==='smartTag'){ out += await runsHtml(r); continue; }
      if (r.localName!=='r') continue;
      const rp = kid(r,'rPr'); const css=[];
      const on = n => { const e=kid(rp,n); return e && attr(e,'w:val')!=='false' && attr(e,'w:val')!=='0'; };
      if (on('b')) css.push('font-weight:700'); if (on('i')) css.push('font-style:italic'); if (kid(rp,'u') && attr(kid(rp,'u'),'w:val')!=='none') css.push('text-decoration:underline'); if (on('strike')) css.push('text-decoration:line-through');
      const sz = kid(rp,'sz'); if (sz) css.push(`font-size:${(+attr(sz,'w:val'))/2}pt`);
      const col = kid(rp,'color'); if (col && /^[0-9A-Fa-f]{6}$/.test(attr(col,'w:val')||'')) css.push(`color:#${attr(col,'w:val')}`);
      const hl = kid(rp,'highlight'); if (hl) css.push(`background:${({yellow:'#ff0',green:'#0f0',cyan:'#0ff',magenta:'#f0f',lightGray:'#ddd'})[attr(hl,'w:val')]||'#ff0'}`);
      const va = kid(rp,'vertAlign'); const sup = va && attr(va,'w:val')==='superscript', sub = va && attr(va,'w:val')==='subscript';
      let inner='';
      for (const c of [...r.children]){
        if (c.localName==='t') inner += htmlEsc(c.textContent);
        else if (c.localName==='tab') inner += '&emsp;';
        else if (c.localName==='br') inner += attr(c,'w:type')==='page' ? '</span><span data-pagebreak="1"></span><span>' : '<br>';
        else if (c.localName==='drawing'){ const bl=desc(c,'blip')[0]; const ext=desc(c,'extent')[0]; if(bl) inner += await img(bl.getAttributeNS(NS.r,'embed')||attr(bl,'r:embed'), +attr(ext,'cx'), +attr(ext,'cy')); }
        else if (c.localName==='pict'){ const im=desc(c,'imagedata')[0]; if(im) inner += await img(im.getAttributeNS(NS.r,'id')||attr(im,'r:id')); }
      }
      if (sup) inner=`<sup>${inner}</sup>`; if (sub) inner=`<sub>${inner}</sub>`;
      out += css.length ? `<span style="${css.join(';')}">${inner}</span>` : `<span>${inner}</span>`;
    }
    return out;
  }
  async function para(p){
    const pp = kid(p,'pPr'); const st = attr(kid(pp,'pStyle'),'w:val'); const lvl = headingOf[st];
    const jc = attr(kid(pp,'jc'),'w:val'); const align = ({center:'center',right:'right',end:'right',both:'justify',distribute:'justify'})[jc]||'';
    const np = kid(pp,'numPr'); const fmt = np ? numFmt[attr(kid(np,'numId'),'w:val')] : null;
    const listKind = np ? (fmt && fmt!=='bullet' && fmt!=='none' ? 'ol' : 'ul') : (listStyle[st]||null); const isList = !!listKind; const pageBefore = !!kid(pp,'pageBreakBefore');
    let inner = await runsHtml(p); if (!inner.replace(/<[^>]+>/g,'').trim() && !/<img/.test(inner)) inner = inner || '&nbsp;';
    const style = align ? ` style="text-align:${align}"` : '';
    const tag = lvl ? `h${Math.min(lvl,4)}` : isList ? 'li' : 'p';
    return (pageBefore?'<div data-pagebreak="1"></div>':'') + `<${tag}${style}${isList?` data-list="${listKind}"`:''}>${inner}</${tag}>`;
  }
  async function table(t){
    let s='<table>';
    for (const tr of kids(t,'tr')){ s+='<tr>'; for (const tc of kids(tr,'tc')){ const tcp=kid(tc,'tcPr'); const span=attr(kid(tcp,'gridSpan'),'w:val'); const vm=kid(tcp,'vMerge'); if(vm && attr(vm,'w:val')!=='restart'){ s+='<td style="border-top:0"></td>'; continue; } s+=`<td${span?` colspan="${span}"`:''}>`; for (const c of [...tc.children]){ if(c.localName==='p') s+=await para(c); else if(c.localName==='tbl') s+=await table(c); } s+='</td>'; } s+='</tr>'; }
    return s+'</table>';
  }
  let html=''; let inList=false;
  for (const el of [...bodyEl.children]){
    if (el.localName==='p'){ const ph = await para(el); const lk = (ph.match(/^<li[^>]*data-list="(\w+)"/)||[])[1];
      if (inList && lk!==inList){ html+=`</${inList}>`; inList=false; } if (lk && !inList){ html+=`<${lk}>`; inList=lk; } html+=ph; }
    else if (el.localName==='tbl'){ if(inList){ html+=`</${inList}>`; inList=false; } html+=await table(el); }
    else if (el.localName==='sdt'){ const c=kid(el,'sdtContent'); if(c) for(const p of kids(c,'p')) html+=await para(p); }
  }
  if (inList) html+=`</${inList}>`;
  const css = `body{margin:0;font-family:Calibri,Carlito,"Segoe UI",Arial,${FONT_STACK};font-size:${baseSize}pt;line-height:1.35;color:#111}p{margin:0 0 8pt}h1{font-size:20pt;margin:12pt 0 6pt}h2{font-size:16pt;margin:10pt 0 6pt}h3{font-size:13pt;margin:8pt 0 4pt}h4{font-size:12pt;margin:8pt 0 4pt}ul,ol{margin:0 0 8pt;padding-left:22pt}li{margin:0 0 4pt}table{border-collapse:collapse;width:100%;margin:0 0 10pt}td{border:1px solid #999;padding:3pt 5pt;vertical-align:top}td p{margin:0}img{display:inline-block}`;
  return {html:`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`, landscape, marginPt: margins||54};
}

/* ================= XLSX reader ================= */
function colIndex(ref){ const m=ref.match(/^([A-Z]+)/); let n=0; for(const ch of m[1]) n=n*26+(ch.charCodeAt(0)-64); return n-1; }
function excelDate(serial){ const ms = Math.round((serial-25569)*86400*1000); const d=new Date(ms); if(isNaN(d)) return String(serial); const iso=d.toISOString(); return (serial%1) ? iso.slice(0,16).replace('T',' ') : iso.slice(0,10); }
async function xlsxSheets(bytes){
  const zip = await JSZip.loadAsync(bytes);
  const wb = await zipText(zip,'xl/workbook.xml'); if(!wb) throw new Error('This doesn’t look like an Excel (.xlsx) file.');
  const rels = relsMap(await zipText(zip,'xl/_rels/workbook.xml.rels'));
  const ssXml = await zipText(zip,'xl/sharedStrings.xml');
  const shared = ssXml ? desc(parseXml(ssXml).documentElement,'si').map(si=>desc(si,'t').map(t=>t.textContent).join('')) : [];
  const stXml = await zipText(zip,'xl/styles.xml'); const dateStyle = [];
  if (stXml){
    const sd = parseXml(stXml).documentElement; const custom={};
    desc(sd,'numFmt').forEach(n=>custom[attr(n,'numFmtId')]=attr(n,'formatCode')||'');
    const xfs = kids(desc(sd,'cellXfs')[0],'xf');
    xfs.forEach((x,i)=>{ const id=+attr(x,'numFmtId'); const code=(custom[id]||'').replace(/"[^"]*"|\[[^\]]*\]/g,''); dateStyle[i] = (id>=14&&id<=22)||(id>=45&&id<=47)||/[dmy]/i.test(code)&&!/0/.test(code.replace(/[dmyhs]/gi,'')); });
  }
  const out=[];
  for (const s of desc(parseXml(wb).documentElement,'sheet')){
    const rid = s.getAttributeNS(NS.r,'id')||attr(s,'r:id'); const path=joinPath('xl/workbook.xml', rels[rid]||'');
    const sx = await zipText(zip,path); if(!sx) continue;
    const sh = parseXml(sx).documentElement; const rows=[]; let maxC=0;
    for (const row of desc(sh,'row')){
      const ri = (+attr(row,'r')||rows.length+1)-1; const arr = rows[ri] = rows[ri]||[];
      for (const c of kids(row,'c')){
        const ref=attr(c,'r'); const ci = ref ? colIndex(ref) : arr.length; const t=attr(c,'t'); const v=kid(c,'v');
        let val='';
        if (t==='s') val = shared[+v?.textContent]??'';
        else if (t==='inlineStr') val = desc(c,'t').map(x=>x.textContent).join('');
        else if (t==='b') val = v?.textContent==='1'?'TRUE':'FALSE';
        else if (t==='str'||t==='e') val = v?.textContent??'';
        else if (v){ const num=+v.textContent; const st=+attr(c,'s'); val = dateStyle[st] ? excelDate(num) : (Number.isInteger(num)? String(num) : String(+num.toPrecision(12))); }
        arr[ci]=val; maxC=Math.max(maxC,ci+1);
      }
    }
    const merges = desc(sh,'mergeCell').map(m=>{ const [a,b]=attr(m,'ref').split(':'); const rc=x=>({r:+x.match(/\d+/)[0]-1,c:colIndex(x)}); return {s:rc(a),e:rc(b||a)}; });
    for (let i=0;i<rows.length;i++) rows[i]=rows[i]||[];
    while (rows.length && !rows[rows.length-1].some(x=>x!==''&&x!=null)) rows.pop();
    out.push({name:attr(s,'name')||'Sheet', rows, cols:maxC, merges});
  }
  return out;
}
function sheetsToHtml(sheets){
  let html='';
  sheets.forEach((s,si)=>{
    if (si) html+='<div data-pagebreak="1"></div>';
    html+=`<h3>${htmlEsc(s.name)}</h3>`;
    if (!s.rows.length){ html+='<p><i>Empty sheet</i></p>'; return; }
    let cols=0; s.rows.forEach(r=>{ for(let c=r.length-1;c>=0;c--){ if(r[c]!==''&&r[c]!=null){ cols=Math.max(cols,c+1); break; } } });
    const skip=new Set(), span={};
    s.merges.forEach(m=>{ span[m.s.r+','+m.s.c]={rs:m.e.r-m.s.r+1, cs:m.e.c-m.s.c+1}; for(let r=m.s.r;r<=m.e.r;r++) for(let c=m.s.c;c<=m.e.c;c++) if(r!==m.s.r||c!==m.s.c) skip.add(r+','+c); });
    html+='<table>';
    s.rows.forEach((r,ri)=>{ html+='<tr>'; for(let c=0;c<cols;c++){ if(skip.has(ri+','+c)) continue; const v=r[c]??''; const sp=span[ri+','+c]; const num=/^-?[\d.,]+%?$/.test(v); html+=`<td${sp?` rowspan="${sp.rs}" colspan="${sp.cs}"`:''}${num?' class="n"':''}>${htmlEsc(v)}</td>`; } html+='</tr>'; });
    html+='</table>';
  });
  const css=`body{margin:0;font-family:Calibri,Carlito,Arial,${FONT_STACK};font-size:9.5pt;color:#111}h3{font-size:12pt;margin:0 0 6pt}table{border-collapse:collapse}td{border:1px solid #b9b9b9;padding:2pt 4pt;white-space:nowrap;vertical-align:top}td.n{text-align:right}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`;
}

/* ================= XLSX writer ================= */
async function makeXlsx(sheets){
  const z=new JSZip(); const used=new Set();
  const names = sheets.map((s,i)=>{ let n=String(s.name||`Sheet${i+1}`).replace(/[\[\]:*?\/\\]/g,' ').slice(0,31).trim()||`Sheet${i+1}`; let k=n,j=2; while(used.has(k.toLowerCase())) k=(n.slice(0,28)+' '+j++); used.add(k.toLowerCase()); return k; });
  const colName = i=>{ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26);} return s; };
  sheets.forEach((s,si)=>{
    const rowsXml = s.rows.map((r,ri)=>`<row r="${ri+1}">`+r.map((v,ci)=>{ if(v==null||v==='') return ''; const ref=colName(ci)+(ri+1); const num = typeof v==='number' ? v : (/^-?\d{1,15}(\.\d+)?$/.test(String(v).replace(/,/g,'')) && !/^0\d/.test(String(v)) ? +String(v).replace(/,/g,'') : null);
      return num!=null && isFinite(num) ? `<c r="${ref}"><v>${num}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; }).join('')+'</row>').join('');
    const widths = []; s.rows.forEach(r=>r.forEach((v,ci)=>{ widths[ci]=Math.max(widths[ci]||8, Math.min(60, String(v??'').length+2)); }));
    const colsXml = widths.length ? '<cols>'+widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols>' : '';
    z.file(`xl/worksheets/sheet${si+1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS.r}">${colsXml}<sheetData>${rowsXml}</sheetData></worksheet>`);
  });
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS.r}"><sheets>${names.map((n,i)=>`<sheet name="${xmlEsc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  return z.generateAsync({type:'uint8array', compression:'DEFLATE'});
}

/* ================= PPTX reader → slide pictures ================= */
async function pptxSlides(bytes){
  const zip = await JSZip.loadAsync(bytes);
  const pres = await zipText(zip,'ppt/presentation.xml'); if(!pres) throw new Error('This doesn’t look like a PowerPoint (.pptx) file.');
  const pd = parseXml(pres).documentElement; const sz = desc(pd,'sldSz')[0];
  const W = +attr(sz,'cx')||12192000, H = +attr(sz,'cy')||6858000;
  const prels = relsMap(await zipText(zip,'ppt/_rels/presentation.xml.rels'));
  const slidePaths = desc(desc(pd,'sldIdLst')[0],'sldId').map(s=>joinPath('ppt/presentation.xml', prels[s.getAttributeNS(NS.r,'id')||attr(s,'r:id')]));
  // theme colours
  const theme = {}; const masterRelsAll = {};
  const themePath = Object.keys(zip.files).find(p=>/^ppt\/theme\/theme\d+\.xml$/.test(p));
  if (themePath){ const td=parseXml(await zipText(zip,themePath)).documentElement; const cs=desc(td,'clrScheme')[0]; if(cs) for(const c of [...cs.children]){ const v=desc(c,'srgbClr')[0]; const s=desc(c,'sysClr')[0]; theme[c.localName] = v? attr(v,'val') : s ? (attr(s,'lastClr')||'000000') : null; } }
  const schemeMap = {tx1:'dk1', bg1:'lt1', tx2:'dk2', bg2:'lt2'};
  function color(el){ if(!el) return null; const s=desc(el,'srgbClr')[0]; if(s) return '#'+attr(s,'val'); const sc=desc(el,'schemeClr')[0]; if(sc){ const v=theme[schemeMap[attr(sc,'val')]||attr(sc,'val')]; return v?'#'+v:null; } const sy=desc(el,'sysClr')[0]; if(sy) return '#'+(attr(sy,'lastClr')||'000000'); return null; }
  async function loadPart(path){ const xml=await zipText(zip,path); if(!xml) return null; const relsPath = path.replace(/([^/]+)$/,'_rels/$1.rels'); return {doc:parseXml(xml).documentElement, rels:relsMap(await zipText(zip,relsPath)), path}; }
  function placeholders(part){ const map={}; if(!part) return map; for(const sp of desc(part.doc,'sp')){ const ph=desc(sp,'ph')[0]; if(!ph) continue; const xf=desc(kid(sp,'spPr'),'xfrm')[0]; if(!xf) continue; const off=kid(xf,'off'), ext=kid(xf,'ext'); const box={x:+attr(off,'x'),y:+attr(off,'y'),w:+attr(ext,'cx'),h:+attr(ext,'cy')}; const type=attr(ph,'type')||'body'; const idx=attr(ph,'idx'); if(idx!=null) map['i'+idx]=box; if(!map['t'+type]) map['t'+type]=box; } return map; }
  const slides=[];
  for (const sp of slidePaths){
    const slide = await loadPart(sp); if(!slide) continue;
    const layoutPath = Object.values(slide.rels).map(t=>joinPath(sp,t)).find(p=>/slideLayout/.test(p));
    const layout = layoutPath ? await loadPart(layoutPath) : null;
    const masterPath = layout ? Object.values(layout.rels).map(t=>joinPath(layoutPath,t)).find(p=>/slideMaster/.test(p)) : null;
    const master = masterPath ? (masterRelsAll[masterPath] ||= await loadPart(masterPath)) : null;
    const phL = placeholders(layout), phM = placeholders(master);
    let bg = null, bgImg = null;
    for (const part of [slide, layout, master]){ if(!part) continue; const b=desc(part.doc,'bg')[0]; if(!b) continue; const blip=desc(b,'blip')[0]; if(blip){ bgImg = await zipDataUrl(zip, joinPath(part.path, part.rels[blip.getAttributeNS(NS.r,'embed')||attr(blip,'r:embed')]||'')); } bg = color(kid(b,'bgPr')) || color(b); if(bg||bgImg) break; }
    const items=[];
    async function walk(tree, tf){
      for (const el of [...tree.children]){
        if (el.localName==='grpSp'){
          const xf=desc(kid(el,'grpSpPr'),'xfrm')[0]; let t=tf;
          if (xf){ const off=kid(xf,'off'),ext=kid(xf,'ext'),co=kid(xf,'chOff'),ce=kid(xf,'chExt'); const ox=+attr(off,'x'),oy=+attr(off,'y'),ex=+attr(ext,'cx')||1,ey=+attr(ext,'cy')||1,cx=+attr(co,'x')||0,cy=+attr(co,'y')||0,cex=+attr(ce,'cx')||ex,cey=+attr(ce,'cy')||ey;
            t = b=>tf({x:ox+(b.x-cx)*ex/cex, y:oy+(b.y-cy)*ey/cey, w:b.w*ex/cex, h:b.h*ey/cey}); }
          await walk(el, t); continue;
        }
        const isSp = el.localName==='sp', isPic = el.localName==='pic', isFrame = el.localName==='graphicFrame';
        if (!isSp && !isPic && !isFrame) continue;
        const spPr = kid(el,'spPr'); let xf = isFrame ? kid(el,'xfrm') : desc(spPr,'xfrm')[0];
        let box=null;
        if (xf && kid(xf,'off')){ const off=kid(xf,'off'),ext=kid(xf,'ext'); box={x:+attr(off,'x'),y:+attr(off,'y'),w:+attr(ext,'cx'),h:+attr(ext,'cy')}; }
        const ph = desc(el,'ph')[0]; const phType = ph ? (attr(ph,'type')||'body') : null;
        if (!box && ph){ const idx=attr(ph,'idx'); box = phL['i'+idx]||phL['t'+phType]||phM['t'+phType]||phM['i'+idx]||null; }
        if (!box) continue; box = tf(box);
        if (isPic){ const blip=desc(el,'blip')[0]; if(blip){ const url=await zipDataUrl(zip, joinPath(sp, slide.rels[blip.getAttributeNS(NS.r,'embed')||attr(blip,'r:embed')]||'')); if(url) items.push({type:'img', ...box, url}); } continue; }
        if (isFrame){ const tbl=desc(el,'tbl')[0]; if(tbl){ const rows=desc(tbl,'tr').map(tr=>desc(tr,'tc').map(tc=>desc(tc,'p').map(p=>desc(p,'t').map(t=>t.textContent).join('')).join('\n'))); items.push({type:'table', ...box, rows}); } continue; }
        const fill = spPr && kid(spPr,'solidFill') ? color(kid(spPr,'solidFill')) : null;
        const ln = spPr && kid(spPr,'ln'); const lnCol = ln && kid(ln,'solidFill') ? color(kid(ln,'solidFill')) : null;
        const geom = attr(desc(spPr,'prstGeom')[0],'prst');
        if (fill || lnCol) items.push({type:'shape', ...box, fill, line:lnCol, geom});
        const tx = kid(el,'txBody');
        if (tx){
          const bp = kid(tx,'bodyPr'); const anchor = attr(bp,'anchor') || (phType==='title'||phType==='ctrTitle' ? 'ctr' : 't');
          const defSize = phType==='title'||phType==='ctrTitle' ? 40 : phType==='subTitle' ? 24 : ph ? 24 : 18;
          const paras = desc(tx,'p').map(p=>{ const ppr=kid(p,'pPr'); const lvl=+attr(ppr,'lvl')||0; const algn=attr(ppr,'algn');
            const bullet = ph && phType==='body' && !kid(ppr,'buNone') ? true : !!kid(ppr,'buChar');
            const runs=[...p.children].filter(c=>c.localName==='r'||c.localName==='br'||c.localName==='fld').map(r=>{ if(r.localName==='br') return {text:'\n'}; const rp=kid(r,'rPr'); return {text:desc(r,'t').map(t=>t.textContent).join(''), size:(+attr(rp,'sz')||0)/100||null, bold:attr(rp,'b')==='1', italic:attr(rp,'i')==='1', color: rp && kid(rp,'solidFill') ? color(kid(rp,'solidFill')) : null}; });
            const endSz = (+attr(kid(p,'endParaRPr'),'sz')||0)/100||null;
            return {runs, align:algn, lvl, bullet: bullet && runs.some(r=>r.text.trim()), endSz}; });
          if (paras.some(p=>p.runs.some(r=>r.text.trim()))) items.push({type:'text', ...box, paras, anchor, defSize, phType});
        }
      }
    }
    const tree = desc(slide.doc,'spTree')[0]; if (tree) await walk(tree, b=>b);
    slides.push({bg, bgImg, items});
  }
  return {W, H, slides, theme};
}
async function drawSlide(sl, W, H, scale=1.5){
  const pxPerEmu = 96/914400*scale; const c=document.createElement('canvas'); c.width=Math.round(W*pxPerEmu); c.height=Math.round(H*pxPerEmu);
  const x=c.getContext('2d'); x.fillStyle=sl.bg||'#ffffff'; x.fillRect(0,0,c.width,c.height);
  if (sl.bgImg){ try{ const im=await loadImg(sl.bgImg); x.drawImage(im,0,0,c.width,c.height); }catch(e){} }
  const E = v=>v*pxPerEmu; const ptPx = pt=>pt*96/72*scale;
  for (const it of sl.items){
    const bx=E(it.x), by=E(it.y), bw=E(it.w), bh=E(it.h);
    if (it.type==='img'){ try{ const im=await loadImg(it.url); x.drawImage(im,bx,by,bw,bh); }catch(e){} continue; }
    if (it.type==='shape'){ x.beginPath(); if(it.geom==='ellipse') x.ellipse(bx+bw/2,by+bh/2,bw/2,bh/2,0,0,Math.PI*2); else if(it.geom==='roundRect'&&x.roundRect) x.roundRect(bx,by,bw,bh,Math.min(bw,bh)*.16); else x.rect(bx,by,bw,bh); if(it.fill){ x.fillStyle=it.fill; x.fill(); } if(it.line){ x.strokeStyle=it.line; x.lineWidth=Math.max(1,scale); x.stroke(); } continue; }
    if (it.type==='table'){ const rows=it.rows, nr=rows.length, nc=Math.max(1,...rows.map(r=>r.length)); const rh=bh/nr, cw=bw/nc; x.strokeStyle='#888'; x.lineWidth=1; x.font=`${ptPx(12)}px ${FONT_STACK}`; x.fillStyle='#111'; x.textBaseline='top';
      rows.forEach((r,ri)=>r.forEach((t,ci)=>{ x.strokeRect(bx+ci*cw,by+ri*rh,cw,rh); wrapLines(t,s=>x.measureText(s).width,cw-8).slice(0,Math.max(1,Math.floor(rh/(ptPx(12)*1.25)))).forEach((l,li)=>x.fillText(l,bx+ci*cw+4,by+ri*rh+4+li*ptPx(12)*1.25)); })); continue; }
    if (it.type==='text'){
      const insX=E(91440), insY=E(45720); const maxW=Math.max(10,bw-2*insX);
      // lay out lines, shrinking if it overflows the box
      let k=1, lines=[];
      for (let attempt=0; attempt<6; attempt++){
        lines=[];
        for (const p of it.paras){
          const sz0 = (p.runs.find(r=>r.size)?.size || p.endSz || it.defSize - p.lvl*2)*k; const px=ptPx(sz0);
          const bold = p.runs.some(r=>r.bold), italic=p.runs.some(r=>r.italic); const col = p.runs.find(r=>r.color)?.color || '#1a1a1a';
          const font = `${italic?'italic ':''}${bold?'700 ':''}${px}px ${FONT_STACK}`; x.font=font;
          const text = p.runs.map(r=>r.text).join(''); const indent = p.lvl*ptPx(18)*k + (p.bullet?ptPx(14)*k:0);
          const wl = text.trim() ? wrapLines(text, s=>x.measureText(s).width, maxW-indent) : [''];
          wl.forEach((l,i)=>lines.push({text:l, font, px, col, align:p.align, indent, bullet: p.bullet && i===0}));
        }
        const total = lines.reduce((a,l)=>a+l.px*1.2,0);
        if (total <= bh-2*insY || k<0.45) break; k*=0.85;
      }
      const total = lines.reduce((a,l)=>a+l.px*1.2,0);
      let y = by+insY + (it.anchor==='ctr' ? Math.max(0,(bh-2*insY-total)/2) : it.anchor==='b' ? Math.max(0,bh-2*insY-total) : 0);
      x.textBaseline='top';
      for (const l of lines){ x.font=l.font; x.fillStyle=l.col; const tw=x.measureText(l.text).width; let lx=bx+insX+l.indent;
        if (l.align==='ctr') lx = bx+(bw-tw)/2; else if (l.align==='r') lx = bx+bw-insX-tw;
        if (l.bullet) x.fillText('•', lx-ptPx(12)*(l.px/ptPx(18)), y);
        x.fillText(l.text, lx, y); y += l.px*1.2; }
    }
  }
  return c;
}

/* ================= HTML → PDF (rendered page by page) ================= */
async function htmlToPdf(html, {page='a4', landscape=false, marginPt=40, onProgress, pdf=null}={}){
  await loadScript('html2canvas');
  const [a,b]=SIZES[page]||SIZES.a4; const [pw,ph] = landscape?[b,a]:[a,b];
  const k=96/72, cw=(pw-2*marginPt)*k, chh=(ph-2*marginPt)*k;
  const clean = new DOMParser().parseFromString(html, 'text/html');
  clean.querySelectorAll('script,noscript,iframe,frame,frameset,object,embed,applet,base,link:not([rel~="stylesheet"]),meta[http-equiv]').forEach(e=>e.remove());
  clean.querySelectorAll('*').forEach(e=>{ for (const a of [...e.attributes]){ if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) e.removeAttribute(a.name); } });
  const fr = h('iframe',{class:'offscreen', 'aria-hidden':'true', tabindex:'-1', sandbox:'allow-same-origin'}); fr.style.width=cw+'px'; fr.style.height='200px';
  document.body.append(fr);
  try{
    const d = fr.contentDocument; d.open(); d.write('<!doctype html>'+clean.documentElement.outerHTML); d.close();
    await Promise.all([...d.images].map(im=>im.complete?0:new Promise(r=>{ im.onload=im.onerror=r; setTimeout(r,4000); })));
    try{ await d.fonts.ready; }catch(e){}
    d.body.style.margin='0'; d.body.style.background='#fff'; d.documentElement.style.background='#fff';
    // wide content (tables) is scaled down to fit the page width
    const sw = d.documentElement.scrollWidth; if (sw > cw+2){ d.body.style.zoom = String(cw/sw); }
    await tick();
    const total = Math.max(1, Math.ceil(d.documentElement.scrollHeight)); fr.style.height = total+'px'; await tick();
    const top = el => el.getBoundingClientRect().top + d.defaultView.scrollY;
    const z = parseFloat(d.body.style.zoom)||1;
    const forced = [...d.querySelectorAll('[data-pagebreak]')].map(e=>top(e)*(d.body.style.zoom?1:1)).filter(y=>y>2).sort((p,q)=>p-q);
    const cands = [...d.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,tr,img,pre,blockquote,table,ul,ol,hr,section,article,div')].map(e=>{ const r=e.getBoundingClientRect(); return r.bottom + d.defaultView.scrollY; }).filter(y=>y>0).sort((p,q)=>p-q);
    const slices=[]; let y=0;
    while (y < total-1){
      const limit = y+chh;
      const f = forced.find(v=>v>y+1 && v<=limit);
      let end;
      if (f) end=f;
      else if (limit>=total) end=total;
      else { const c=cands.filter(v=>v>y+chh*.3 && v<=limit+.5); end = c.length? c[c.length-1] : limit; }
      slices.push([y, Math.max(end, y+1)]); y=end;
    }
    const out = pdf || await PDFLib.PDFDocument.create();
    for (let i=0;i<slices.length;i++){
      onProgress && onProgress(i+1, slices.length);
      const [y0,y1]=slices[i];
      const canvas = await html2canvas(d.body, {scale:2, x:0, y:Math.floor(y0), width:Math.ceil(cw), height:Math.ceil(y1-y0), windowWidth:Math.ceil(cw), windowHeight:total, scrollX:0, scrollY:0, backgroundColor:'#ffffff', logging:false, useCORS:false});
      const img = await out.embedJpg(await canvasBytes(canvas,'image/jpeg',.9));
      const pg = out.addPage([pw,ph]); const hpt=(y1-y0)/k;
      pg.drawImage(img,{x:marginPt, y:ph-marginPt-hpt, width:cw/k, height:hpt});
    }
    return {pdf:out, pages:slices.length};
  } finally { fr.remove(); }
}
