/* SRK — Convert from PDF, Edit */
'use strict';
const SRGB_ICC = 'AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACgAdABEAFgAuYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEoAAAXj///zKgAAB5sAAP2H///7ov///aMAAAPYAADAlFhZWiAAAAAAAABvlAAAOO4AAAOQWFlaIAAAAAAAACSdAAAPgwAAtr5YWVogAAAAAAAAYqUAALeQAAAY3nBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c';

/* ---------------- Convert from PDF ---------------- */
tool({id:'pdf2jpg', cat:'from', name:'PDF to JPG', desc:'Save every page as a picture.', icon:I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/>'),
  build({el, result}){
    const src=pdfSource(); const q=select('jq',[['96','Small (96 dpi)'],['150','Normal (150 dpi)'],['220','High (220 dpi)'],['300','Print (300 dpi)']],'150'); const fmt=select('jf',[['jpg','JPG'],['png','PNG']],'jpg'); const rng=h('input',{class:'inp',id:'jr',placeholder:'All pages'});
    const go=h('button',{class:'btn primary',type:'button'},'Convert'); const err=errP();
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ const c=src.need(); const idx=parseRange(rng.value,c.doc.numPages); const files=[]; const ext=fmt.value;
      for (let k=0;k<idx.length;k++){ b.set(`Page ${k+1}/${idx.length}`); const cv=await renderPage(c.doc, idx[k]+1, (+q.value)/72); files.push({data:await canvasBytes(cv, ext==='png'?'image/png':'image/jpeg', .9), name:`${baseName(c.name)} page ${idx[k]+1}.${ext}`, label:`${cv.width} × ${cv.height} px`}); }
      result.dataset.zipname=baseName(c.name)+' images'; showResults(result, files); });
    el.append(panel(src.el, h('div',{class:'row'},h('label',{class:'f'},'Quality',q),h('label',{class:'f narrow'},'Format',fmt)), h('label',{class:'f'},'Pages',rng), actionRow(go,err)));
  }});

tool({id:'pdf2word', cat:'from', name:'PDF to Word', desc:'Turn a PDF into an editable Word document.', icon:I(`<path d="${DOC}"/><path d="M8.5 11l1.2 5 1.3-4 1.3 4 1.2-5"/>`),
  build({el, result}){
    const src=pdfSource(); let mode='edit';
    const seg=segmented([['edit','Editable text'],['look','Exact look']], mode, v=>{ mode=v; hint.textContent = v==='edit' ? 'Text, headings and paragraphs become editable in Word. Layout is simplified. Scanned pages are added as pictures (use OCR PDF to get their text).' : 'Each page is placed in Word as a picture, so it looks exactly the same but can’t be edited.'; });
    const hint=h('p',{class:'hint'}); seg.querySelector('button').click();
    const go=h('button',{class:'btn primary',type:'button'},'Convert to Word'); const err=errP();
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ const c=src.need(); const blocks=[]; let scanned=0;
      if (mode==='look'){ for(let n=1;n<=c.doc.numPages;n++){ b.set(`Page ${n}/${c.doc.numPages}`); const cv=await renderPage(c.doc,n,150/72); if(n>1) blocks.push({type:'pagebreak'}); blocks.push({type:'img', bytes:await canvasBytes(cv,'image/jpeg',.85), w:cv.width, h:cv.height}); }
        showResults(result,[{data:await makeDocx(blocks,{marginTw:360,title:baseName(c.name)}), name:baseName(c.name)+'.docx'}]); return; }
      const all=[]; for(let n=1;n<=c.doc.numPages;n++){ b.set(`Reading page ${n}/${c.doc.numPages}`); const {items}=await pageItems(c.doc,n,{fonts:true}); all.push(groupLines(items)); }
      const body = median(all.flat().map(l=>l.size)) || 11;
      all.forEach((lines,i)=>{
        if (i) blocks.push({type:'pagebreak'});
        if (!lines.length){ scanned++; blocks.push({type:'scan', n:i+1}); return; }
        for (const p of paragraphs(lines, body)) blocks.push({type:'p', text:p.text, level:p.level, bullet:p.bullet, runs:[{text:p.text, bold:p.bold&&!p.level, size: p.level?null:Math.round(clamp(p.size,8,28))}]});
      });
      for (let i=0;i<blocks.length;i++) if (blocks[i].type==='scan'){ b.set(`Adding scanned page ${blocks[i].n}`); const cv=await renderPage(c.doc,blocks[i].n,130/72); blocks[i]={type:'img', bytes:await canvasBytes(cv,'image/jpeg',.82), w:cv.width, h:cv.height}; }
      showResults(result,[{data:await makeDocx(blocks,{title:baseName(c.name)}), name:baseName(c.name)+'.docx'}], {note: scanned? `${pages(scanned)} had no readable text (scans), so ${scanned>1?'they were':'it was'} added as pictures. Use OCR PDF to get that text.`:''}); });
    el.append(panel(src.el, seg, hint, actionRow(go,err)));
  }});

tool({id:'pdf2ppt', cat:'from', name:'PDF to PowerPoint', desc:'Make a slide deck with one page per slide.', icon:I('<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M12 17v3M8 20h8M9 8h3.5a2 2 0 0 1 0 4H9V8z"/>'),
  build({el, result}){
    const src=pdfSource(); const go=h('button',{class:'btn primary',type:'button'},'Convert to PowerPoint'); const err=errP();
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ const c=src.need(); b.set('Loading…'); await loadScript('pptx');
      const p1=(await c.doc.getPage(1)).getViewport({scale:1}); const pres=new PptxGenJS(); pres.defineLayout({name:'PD', width:p1.width/72, height:p1.height/72}); pres.layout='PD';
      for (let n=1;n<=c.doc.numPages;n++){ b.set(`Slide ${n}/${c.doc.numPages}`); const v=(await c.doc.getPage(n)).getViewport({scale:1}); const cv=await renderPage(c.doc,n,Math.min(2.5, 1920/v.width));
        const dataUrl='data:image/jpeg;base64,'+bytesToB64(await canvasBytes(cv,'image/jpeg',.85));
        const sl=pres.addSlide(); const W=p1.width/72, H=p1.height/72, k=Math.min(W/(v.width/72), H/(v.height/72)); const w=v.width/72*k, hh=v.height/72*k; sl.addImage({data:dataUrl, x:(W-w)/2, y:(H-hh)/2, w, h:hh}); }
      const bytes=await pres.write({outputType:'uint8array'}); showResults(result,[{data:bytes, name:baseName(c.name)+'.pptx'}], {note:'Each page is a picture on its own slide.'}); });
    el.append(panel(src.el, h('p',{class:'hint'},'Pages keep their exact look as full-slide pictures.'), actionRow(go,err)));
  }});

tool({id:'pdf2excel', cat:'from', name:'PDF to Excel', desc:'Pull tables out of a PDF into a spreadsheet.', icon:I('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>'),
  build({el, result}){
    const src=pdfSource(); const per=select('xPer',[['page','One sheet per page'],['one','Everything on one sheet']],'page'); const rng=h('input',{class:'inp',id:'xr',placeholder:'All pages'});
    const go=h('button',{class:'btn primary',type:'button'},'Convert to Excel'); const err=errP();
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ const c=src.need(); const idx=parseRange(rng.value,c.doc.numPages); const sheets=[]; let empty=0;
      for (const i of idx){ b.set(`Page ${i+1}`); const {items}=await pageItems(c.doc,i+1); const rows=tableRows(items); if(!rows.length) empty++; sheets.push({name:`Page ${i+1}`, rows}); }
      if (empty===idx.length) throw new Error('No text was found. This looks like a scan — run OCR PDF first.');
      const out = per.value==='one' ? [{name:'Pages', rows: sheets.flatMap((s,i)=>i? [[],...s.rows] : s.rows)}] : sheets;
      showResults(result,[{data:await makeXlsx(out), name:baseName(c.name)+'.xlsx'}], {note:'Columns are worked out from how the text lines up on each page. Check merged or wrapped cells.'}); });
    el.append(panel(src.el, h('div',{class:'row'},h('label',{class:'f'},'Layout',per),h('label',{class:'f'},'Pages',rng)), actionRow(go,err)));
  }});
function tableRows(items){
  const lines = groupLines(items); if(!lines.length) return [];
  const rowsCells = lines.map(L=>{ const cells=[]; let cur=null;
    for (const it of L.items){ if (!it.str.trim()) continue; const gap = cur ? it.x - cur.x1 : Infinity;
      if (cur && gap < Math.max(it.size*.9, 6)){ cur.text += (gap>it.size*.15?' ':'')+it.str; cur.x1=it.x+it.w; } else { cur={x:it.x, x1:it.x+it.w, text:it.str}; cells.push(cur); } }
    return cells; });
  const starts = rowsCells.flat().map(c=>c.x).sort((a,b)=>a-b); const anchors=[];
  for (const x of starts){ const a=anchors[anchors.length-1]; if (a && x-a.max < 14){ a.max=x; a.sum+=x; a.n++; } else anchors.push({min:x,max:x,sum:x,n:1}); }
  const cols = anchors.map(a=>a.sum/a.n);
  return rowsCells.map(cells=>{ const row=[]; for (const c of cells){ let bi=0,bd=Infinity; cols.forEach((x,i)=>{ const d=Math.abs(x-c.x); if(d<bd){bd=d;bi=i;} }); row[bi] = row[bi] ? row[bi]+' '+c.text.trim() : c.text.trim(); } for(let i=0;i<row.length;i++) if(row[i]==null) row[i]=''; return row; });
}

tool({id:'pdfa', cat:'from', name:'PDF to PDF/A', desc:'Make an archive copy for long-term storage.', icon:I(`<path d="${DOC}"/><path d="M9 17l2.5-6 2.5 6M9.8 15h3.4"/>`),
  build({el, result}){
    const src=pdfSource(); const go=h('button',{class:'btn primary',type:'button'},'Convert to PDF/A'); const err=errP();
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ const c=src.need(); const {PDFName, PDFString, PDFHexString}=PDFLib; const out=await PDFLib.PDFDocument.create({updateMetadata:false});
      for (let n=1;n<=c.doc.numPages;n++){ b.set(`Page ${n}/${c.doc.numPages}`); const v=(await c.doc.getPage(n)).getViewport({scale:1}); const cv=await renderPage(c.doc,n,200/72); const im=await out.embedJpg(await canvasBytes(cv,'image/jpeg',.9)); out.addPage([v.width,v.height]).drawImage(im,{x:0,y:0,width:v.width,height:v.height}); }
      const ctx=out.context, now=new Date(), title=baseName(c.name);
      out.setTitle(title); out.setProducer('SRK'); out.setCreator('SRK'); out.setCreationDate(now); out.setModificationDate(now);
      const icc=Uint8Array.from(atob(SRGB_ICC),ch=>ch.charCodeAt(0));
      const iccRef=ctx.register(ctx.flateStream(icc,{N:3}));
      const oi=ctx.obj({Type:'OutputIntent', S:'GTS_PDFA1', OutputConditionIdentifier:PDFString.of('sRGB IEC61966-2.1'), Info:PDFString.of('sRGB IEC61966-2.1'), DestOutputProfile:iccRef});
      out.catalog.set(PDFName.of('OutputIntents'), ctx.obj([oi]));
      const iso=now.toISOString().replace(/\.\d+Z$/,'Z');
      const xmp=`<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title><xmp:CreatorTool>SRK</xmp:CreatorTool><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate><xmp:MetadataDate>${iso}</xmp:MetadataDate><pdf:Producer>SRK</pdf:Producer><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
      const meta=ctx.stream(new TextEncoder().encode(xmp),{Type:'Metadata',Subtype:'XML'}); out.catalog.set(PDFName.of('Metadata'), ctx.register(meta));
      const id=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join(''); ctx.trailerInfo.ID=ctx.obj([PDFHexString.of(id),PDFHexString.of(id)]);
      showResults(result,[{data:await out.save({useObjectStreams:false}), name:title+' (PDF-A).pdf', pages:c.doc.numPages}], {note:'Made in PDF/A-2b format: pages are stored as pictures with an embedded colour profile and archive details. It hasn’t been checked by an official validator.'}); });
    el.append(panel(src.el, h('p',{class:'hint'},'PDF/A is the format offices and courts use for long-term storage. Pages are stored as pictures, so text can’t be selected.'), actionRow(go,err)));
  }});

/* ---------------- Edit ---------------- */
tool({id:'rotate', cat:'edit', name:'Rotate PDF', desc:'Turn some or all pages.', icon:I('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>'),
  build({el, result}){
    const src=pdfSource({onChange:()=>mount()}); const holder=h('div'); let grid=null; const err=errP();
    const go=h('button',{class:'btn primary',type:'button'},'Save rotated PDF');
    const tools=h('div',{class:'row'},
      h('button',{class:'btn sm',type:'button',onclick:()=>grid&&grid.rotateWhere(()=>true,-90)},'↺ All left'), h('button',{class:'btn sm',type:'button',onclick:()=>grid&&grid.rotateWhere(()=>true,90)},'↻ All right'),
      h('button',{class:'btn sm',type:'button',onclick:()=>grid&&grid.rotateWhere(c=>c.sel,-90)},'↺ Selected'), h('button',{class:'btn sm',type:'button',onclick:()=>grid&&grid.rotateWhere(c=>c.sel,90)},'↻ Selected'));
    function mount(){ grid&&grid.destroy(); holder.innerHTML=''; const c=src.get(); if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF to see its pages.')); return; } grid=PageGrid(c.doc,{select:true, rotate:true}); holder.append(grid.el); }
    go.onclick=()=>guard(go,'Saving…',err, async()=>{ const c=src.need(); if(!grid.cells.some(x=>x.rot)) throw new Error('Rotate at least one page first.'); const r=await pdfFromCells(c.bytes, grid.cells); showResults(result,[{data:r.bytes, name:baseName(c.name)+' (rotated).pdf', pages:r.pages}]); });
    el.append(panel(src.el, h('p',{class:'hint'},'Tap pages to select them, or use ↺ ↻ under each page.'), tools, holder, actionRow(go,err))); mount();
    return ()=>{ grid&&grid.destroy(); src.el._cleanup(); };
  }});

tool({id:'numbers', cat:'edit', name:'Add page numbers', desc:'Number pages, with the position and style you want.', icon:I('<rect x="4" y="3" width="7" height="8" rx="1"/><rect x="13" y="3" width="7" height="8" rx="1"/><rect x="4" y="13" width="7" height="8" rx="1"/><rect x="13" y="13" width="7" height="8" rx="1"/>'),
  build({el, result}){
    const src=pdfSource(); let pos='bc';
    const posSeg=segmented([['tl','↖ Top left'],['tc','↑ Top'],['tr','↗ Top right'],['bl','↙ Bottom left'],['bc','↓ Bottom'],['br','↘ Bottom right']], pos, v=>pos=v);
    const fmt=select('nFmt',[['n','1'],['page','Page 1'],['of','Page 1 of 9'],['slash','1 / 9'],['dash','- 1 -']],'n');
    const start=h('input',{class:'inp',id:'nStart',inputmode:'numeric',value:'1'}), from=h('input',{class:'inp',id:'nFrom',inputmode:'numeric',value:'1'});
    const size=select('nSize',[['8','8'],['10','10'],['11','11'],['12','12'],['14','14'],['18','18']],'11'), margin=select('nMargin',[['18','Small'],['30','Normal'],['48','Large']],'30'), color=h('input',{type:'color',class:'inp',id:'nCol',value:'#333333'});
    const go=h('button',{class:'btn primary',type:'button'},'Add numbers'); const err=errP();
    go.onclick=()=>guard(go,'Numbering…',err, async()=>{ const c=src.need(); const pdf=await loadPdfLib(c.bytes); if(isEncrypted(c.bytes)) throw new Error('Unlock this PDF first.'); const f=await pdf.embedFont(PDFLib.StandardFonts.Helvetica); const pl=pdf.getPages();
      const s0=parseInt(start.value,10)||1, f0=clamp(parseInt(from.value,10)||1,1,pl.length), fs=+size.value, m=+margin.value, total=s0+(pl.length-f0);
      pl.forEach((page,i)=>{ if(i+1<f0) return; const n=s0+(i+1-f0); const t=({n:`${n}`, page:`Page ${n}`, of:`Page ${n} of ${total}`, slash:`${n} / ${total}`, dash:`- ${n} -`})[fmt.value];
        const g=pageGeom(page), w=f.widthOfTextAtSize(t,fs); const x = pos[1]==='l'? m : pos[1]==='r' ? g.vw-m-w : (g.vw-w)/2; const y = pos[0]==='t' ? m+fs*.8 : g.vh-m;
        drawTextV(page, t, x, y, fs, f, {color:hexToRgb(color.value)}); });
      showResults(result,[{data:await pdf.save(), name:baseName(c.name)+' (numbered).pdf', pages:pl.length}]); });
    el.append(panel(src.el, h('p',{class:'sub'},'Position'), posSeg, h('div',{class:'row'},h('label',{class:'f'},'Style',fmt),h('label',{class:'f narrow'},'Size',size),h('label',{class:'f narrow'},'Colour',color)),
      h('div',{class:'row'},h('label',{class:'f narrow'},'First number',start),h('label',{class:'f narrow'},'Start on page',from),h('label',{class:'f narrow'},'Distance from edge',margin)), actionRow(go,err)));
  }});

tool({id:'watermark', cat:'edit', name:'Add watermark', desc:'Stamp text or a logo across pages.', icon:I('<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>'),
  build({el, result}){
    const src=pdfSource(); let kind='text', img=null, layout='center';
    const text=h('input',{class:'inp',id:'wText',value:'CONFIDENTIAL'}), color=h('input',{type:'color',class:'inp',id:'wCol',value:'#c0392b'});
    const size=h('input',{type:'range',id:'wSize',min:12,max:140,value:60}), op=h('input',{type:'range',id:'wOp',min:5,max:100,value:25}), rot=select('wRot',[['45','Diagonal ↗'],['0','Straight'],['-45','Diagonal ↘'],['90','Upright']],'45');
    const imgInfo=h('span',{class:'t'},'No picture chosen.'); const pick=filePicker({label:'Choose logo / picture', accept:'image/*', onFiles:async([f])=>{ const cv=await fileToCanvas(f,1600); img={bytes:await canvasBytes(cv,'image/png'), w:cv.width, h:cv.height}; imgInfo.textContent=f.name; }});
    const tBox=h('div',{class:'col'}, h('label',{class:'f'},'Text',text), h('div',{class:'row'},h('label',{class:'f narrow'},'Colour',color),h('label',{class:'f'},'Angle',rot)));
    const iBox=h('div',{class:'srcinfo',hidden:true}, imgInfo, pick);
    const kindSeg=segmented([['text','Text'],['image','Picture']], kind, v=>{ kind=v; tBox.hidden=v!=='text'; iBox.hidden=v!=='image'; });
    const laySeg=segmented([['center','Once, in the middle'],['tile','Repeat across page']], layout, v=>layout=v);
    const rng=h('input',{class:'inp',id:'wRange',placeholder:'All pages'});
    const go=h('button',{class:'btn primary',type:'button'},'Add watermark'); const err=errP();
    go.onclick=()=>guard(go,'Stamping…',err, async()=>{ const c=src.need(); if(isEncrypted(c.bytes)) throw new Error('Unlock this PDF first.'); const pdf=await loadPdfLib(c.bytes); const pl=pdf.getPages(); const idx=parseRange(rng.value,pl.length);
      let im, iw, ih; const sz=+size.value;
      if (kind==='text'){ if(!text.value.trim()) throw new Error('Type the watermark text.'); const cv=textCanvas(text.value.trim(),{px:sz*3,color:color.value,weight:'700',rotate:+rot.value}); im=await pdf.embedPng(await canvasBytes(cv,'image/png')); iw=cv.width/3; ih=cv.height/3; }
      else { if(!img) throw new Error('Choose a picture first.'); im=await pdf.embedPng(img.bytes); const k=(sz*4)/Math.max(img.w,img.h); iw=img.w*k; ih=img.h*k; }
      for (const i of idx){ const page=pl[i], g=pageGeom(page); const o={opacity:(+op.value)/100};
        if (layout==='center'){ const k=Math.min(1,(g.vw*.9)/iw,(g.vh*.9)/ih); drawImageV(page, im, (g.vw-iw*k)/2, (g.vh-ih*k)/2, iw*k, ih*k, o); }
        else { const sx=iw*1.4, sy=ih*1.6; for(let y=-ih*.3;y<g.vh;y+=sy) for(let x=((Math.round(y/sy))%2)*sx/2 - iw*.3; x<g.vw; x+=sx) drawImageV(page, im, x, y, iw, ih, o); } }
      showResults(result,[{data:await pdf.save(), name:baseName(c.name)+' (watermarked).pdf', pages:pl.length}]); });
    el.append(panel(src.el, kindSeg, tBox, iBox, h('div',{class:'row'},h('label',{class:'f'},'Size',size),h('label',{class:'f'},'See-through',op)), laySeg, h('label',{class:'f'},'Pages',rng), actionRow(go,err)));
  }});

tool({id:'crop', cat:'edit', name:'Crop PDF', desc:'Trim the edges of pages.', icon:I('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>'),
  build({el, result}){
    const src=pdfSource({onChange:()=>mount()}); const holder=h('div'); let cb=null; const scope=select('cScope',[['all','All pages'],['this','Only the page shown']],'all');
    const go=h('button',{class:'btn primary',type:'button'},'Crop'); const err=errP();
    function mount(){ holder.innerHTML=''; const c=src.get(); if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF to crop.')); return; } cb=CropBox(c.doc); holder.append(cb.el); }
    go.onclick=()=>guard(go,'Cropping…',err, async()=>{ const c=src.need(); if(isEncrypted(c.bytes)) throw new Error('Unlock this PDF first.'); const pdf=await loadPdfLib(c.bytes); const pl=pdf.getPages();
      (scope.value==='all'?pl:[pl[cb.page-1]]).forEach(p=>applyCrop(p, cb.rect)); showResults(result,[{data:await pdf.save(), name:baseName(c.name)+' (cropped).pdf', pages:pl.length}]); });
    el.append(panel(src.el, h('p',{class:'hint'},'Drag the corners to choose what to keep. Drag inside the box to move it.'), holder, h('label',{class:'f'},'Apply to',scope), actionRow(go,err))); mount();
    return ()=>src.el._cleanup();
  }});

tool({id:'edit', cat:'edit', name:'Edit PDF', desc:'Add text, pictures, drawings, boxes and highlights.', icon:I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  build({el, result}){
    const src=pdfSource({onChange:()=>mount()}); const holder=h('div'); let an=null;
    const imgPick=filePicker({label:'Choose picture', accept:'image/*', small:true, onFiles:async([f])=>{ const cv=await fileToCanvas(f,1600); const bytes=await canvasBytes(cv,'image/png'); if(an){ an.pendingImage={bytes, url:URL.createObjectURL(new Blob([bytes],{type:'image/png'})), w:cv.width*.5, h:cv.height*.5}; an.setTool('image'); toast('Now tap the page where the picture should go.'); } }});
    function mount(){ holder.innerHTML=''; const c=src.get(); if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF to edit.')); return; } an=Annotator(c.doc,{tools:['select','text','draw','rect','highlight','whiteout','image']}); holder.append(an.el); }
    const go=h('button',{class:'btn primary',type:'button'},'Save edited PDF'); const err=errP();
    go.onclick=()=>guard(go,'Saving…',err, async()=>{ const c=src.need(); if(!an.objs.length) throw new Error('Add something to the page first.'); if(isEncrypted(c.bytes)) throw new Error('Unlock this PDF first.'); const pdf=await loadPdfLib(c.bytes); await an.apply(pdf); showResults(result,[{data:await pdf.save(), name:baseName(c.name)+' (edited).pdf', pages:pdf.getPageCount()}]); });
    el.append(panel(src.el, h('div',{class:'row'}, h('span',{class:'hint'},'For pictures:'), imgPick), holder, h('p',{class:'hint'},'White-out covers text so it can’t be seen when printed, but it’s still in the file. To remove content for good, use Redact PDF.'), actionRow(go,err))); mount();
    return ()=>src.el._cleanup();
  }});

tool({id:'forms', cat:'edit', name:'PDF Forms', desc:'Fill in fillable form fields.', icon:I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h5M7 14h10M16 9v2"/>'),
  build({el, result}){
    const src=pdfSource({onChange:()=>mount()}); const holder=h('div',{class:'col'}); let fields=[]; let pdf=null; let mountedFor=null;
    const flat=h('input',{type:'checkbox',id:'fFlat'}); const go=h('button',{class:'btn primary',type:'button'},'Save filled form'); const err=errP();
    async function mount(){ holder.innerHTML=''; fields=[]; const c=src.get(); mountedFor=c; if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF form.')); return; }
      try{ pdf=await loadPdfLib(c.bytes); }catch(e){ holder.append(h('p',{class:'err'},'This PDF couldn’t be read.')); return; }
      const {PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList}=PDFLib; let list=[];
      try{ list=pdf.getForm().getFields(); }catch(e){}
      for (const f of list){ const name=f.getName(); const label=name.replace(/[._]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2'); const id='ff'+fields.length;
        if (f instanceof PDFTextField){ const multi=f.isMultiline(); const i=h(multi?'textarea':'input',{class:'inp',id,rows:multi?3:null}); i.value=f.getText()||''; holder.append(h('label',{class:'f'},label,i)); fields.push(F=>{ F.getTextField(name).setText(i.value); }); }
        else if (f instanceof PDFCheckBox){ const i=h('input',{type:'checkbox',id}); i.checked=f.isChecked(); holder.append(h('label',{class:'chk'},i,label)); fields.push(F=>{ const x=F.getCheckBox(name); i.checked?x.check():x.uncheck(); }); }
        else if (f instanceof PDFDropdown || f instanceof PDFOptionList){ const opts=f.getOptions(); const sel=f.getSelected(); const i=select(id,[['','—'],...opts.map(o=>[o,o])],sel[0]||''); holder.append(h('label',{class:'f'},label,i)); const isDd=f instanceof PDFDropdown; fields.push(F=>{ const x=isDd?F.getDropdown(name):F.getOptionList(name); if(i.value) x.select(i.value); else x.clear(); }); }
        else if (f instanceof PDFRadioGroup){ const opts=f.getOptions(); const i=select(id,[['','—'],...opts.map(o=>[o,o])],f.getSelected()||''); holder.append(h('label',{class:'f'},label,i)); fields.push(F=>{ const x=F.getRadioGroup(name); if(i.value) x.select(i.value); else x.clear(); }); } }
      if (!fields.length) holder.append(h('p',{class:'empty'},'This PDF has no fillable fields. Use Edit PDF to type onto it.'));
      else holder.prepend(h('p',{class:'hint'},`${fields.length} field${fields.length>1?'s':''} found.`)); }
    go.onclick=()=>guard(go,'Saving…',err, async()=>{ const c=src.need(); if(!fields.length) throw new Error('There are no fields to fill. Use Edit PDF instead.');
      const fresh=await loadPdfLib(c.bytes); const F=fresh.getForm(); fields.forEach(fn=>fn(F));
      try{ if(flat.checked) F.flatten(); const bytes=await fresh.save(); showResults(result,[{data:bytes, name:baseName(c.name)+' (filled).pdf', pages:fresh.getPageCount()}]); }
      catch(e){ if(/WinAnsi|cannot encode/i.test(e.message||'')) throw new Error('Form fields can only hold English letters here. For other languages, use Edit PDF to type on the form.'); throw e; } });
    el.append(panel(src.el, holder, h('label',{class:'chk'},flat,'Lock the answers (no further changes)'), actionRow(go,err))); mount();
    return ()=>src.el._cleanup();
  }});
