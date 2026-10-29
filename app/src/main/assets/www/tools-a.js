/* SRK — Organize, Optimize, Convert to PDF */
'use strict';
const TOOLS = [];
const CATS = [
  ['org','Organize PDF','--c-org'], ['opt','Optimize PDF','--c-opt'], ['to','Convert to PDF','--c-to'], ['from','Convert from PDF','--c-from'],
  ['edit','Edit PDF','--c-edit'], ['sec','PDF security','--c-sec'], ['ai','PDF intelligence','--c-ai'],
];
const I = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const DOC = 'M6 3h8l4 4v14H6z';
function tool(def){ TOOLS.push(def); }
const panel = (...k) => h('div',{class:'panel'}, ...k);
const actionRow = (btn, err) => h('div',{class:'row'}, btn, err);
const errP = () => h('p',{class:'err',role:'alert'});
async function guard(btn, label, err, fn){ err.textContent=''; const b=busy(btn,label); try{ await fn(b); }catch(e){ console.error(e); err.textContent = e && e.message ? e.message : 'Something went wrong.'; } finally{ b.done(); } }

/* ---------------- Organize ---------------- */
tool({id:'merge', cat:'org', name:'Merge PDF', desc:'Join several PDFs into one, in the order you choose.', icon:I('<path d="M4 4h6v7H4zM14 13h6v7h-6z"/><path d="M10 7.5h3.5a2 2 0 0 1 2 2V13M14 16.5h-3.5a2 2 0 0 1-2-2V11"/>'),
  build({el, result}){
    const list = FileList({empty:'No PDFs added yet. Add two or more.', thumb:()=> 'PDF', meta:f=>`${pages(f.pages)} · ${fmtBytes(f.bytes.length)}`});
    const add = filePicker({label:'Add PDFs', accept:'application/pdf,.pdf', multiple:true, primary:true, icon:ICON_FOLDER, onFiles: async fs=>{
      for (const f of fs){ const bytes=await readFile(f); try{ const d=await loadPdfLib(bytes); list.add({name:f.name, bytes, pages:d.getPageCount()}); }catch(e){ toast(`“${f.name}” couldn’t be read as a PDF.`); } } }});
    const useCur = h('button',{class:'btn',type:'button',onclick:()=>{ const c=STATE.cur; if(!c) return toast('Nothing is open in Read.'); list.add({name:c.name, bytes:c.bytes, pages:c.doc.numPages}); }},'Add the PDF open in Read');
    const go = h('button',{class:'btn primary',type:'button'},'Merge'); const err=errP();
    go.onclick=()=>guard(go,'Merging…',err, async()=>{
      if (list.items.length<2) throw new Error('Add at least two PDFs to merge.');
      const out=await PDFLib.PDFDocument.create(); let n=0;
      for (const f of list.items){ if(isEncrypted(f.bytes)) throw new Error(`“${f.name}” is password-protected. Unlock it first.`); const s=await loadPdfLib(f.bytes); (await out.copyPages(s,s.getPageIndices())).forEach(p=>{ out.addPage(p); n++; }); }
      showResults(result, [{data:await out.save(), name:`Merged ${stamp()}.pdf`, pages:n}]);
    });
    el.append(panel(h('div',{class:'row'},add,useCur), list.el, actionRow(go,err)));
  }});

tool({id:'split', cat:'org', name:'Split PDF', desc:'Break a PDF into smaller files by pages, ranges or file size.', icon:I('<path d="M5 4h5v16H5zM14 4h5v16h-5z"/><path d="M12 2v20" stroke-dasharray="2 2.5"/>'),
  build({el, result}){
    const src = pdfSource(); let mode='count';
    const count = h('input',{class:'inp',inputmode:'numeric',value:'10',id:'spCount'});
    const ranges = h('input',{class:'inp',id:'spRanges',placeholder:'e.g. 1-5, 6-12, 13-'});
    const size = h('input',{class:'inp',id:'spSize',inputmode:'decimal',value:'2'}); const unit=select('spUnit',[['1024','KB'],['1048576','MB']],'1048576');
    const each = h('label',{class:'f'},'Pages in each file',count), rg=h('label',{class:'f',hidden:true},'Ranges — each becomes one file',ranges), sz=h('label',{class:'f',hidden:true},'Largest size of each file',h('span',{class:'unit'},size,unit));
    const allPages = h('label',{class:'f',hidden:true}, h('span',null,'Every page becomes its own file.'));
    const seg = segmented([['count','By pages'],['every','Every page'],['ranges','By ranges'],['size','By file size']], mode, v=>{ mode=v; each.hidden=v!=='count'; rg.hidden=v!=='ranges'; sz.hidden=v!=='size'; allPages.hidden=v!=='every'; });
    const go=h('button',{class:'btn primary',type:'button'},'Split'); const err=errP();
    go.onclick=()=>guard(go,'Splitting…',err, async b=>{
      const c=src.need(); const s=await loadPdfLib(c.bytes); const N=s.getPageCount(), all=[...Array(N).keys()]; let groups=[], note='';
      const part = async idx=>{ const o=await PDFLib.PDFDocument.create(); (await o.copyPages(s,idx)).forEach(p=>o.addPage(p)); return o.save(); };
      if (mode==='count'||mode==='every'){ const n = mode==='every'?1:parseInt(count.value,10); if(!(n>0)) throw new Error('Enter how many pages each file should have.'); if(n>=N) throw new Error(`This PDF has ${N} pages, so it stays as one file.`); for(let i=0;i<N;i+=n) groups.push(all.slice(i,i+n)); }
      else if (mode==='ranges'){ const parts=ranges.value.split(',').map(x=>x.trim()).filter(Boolean); if(!parts.length) throw new Error('Type at least one range, like 1-5.'); for(const p of parts) groups.push(parseRange(p,N)); }
      else { const limit=parseFloat(size.value)*(+unit.value); if(!(limit>0)) throw new Error('Enter the largest size each file can be.');
        let cur=[], curB=null, over=0;
        for (let i=0;i<N;i++){ b.set(`Checking page ${i+1}/${N}`); const trial=cur.concat(i), bytes=await part(trial);
          if (bytes.length<=limit || !cur.length){ cur=trial; curB=bytes; if(bytes.length>limit) over++; } else { groups.push({idx:cur,bytes:curB}); cur=[i]; curB=await part(cur); if(curB.length>limit) over++; } }
        if (cur.length) groups.push({idx:cur,bytes:curB});
        if (over) note=`${over} page${over>1?'s are':' is'} bigger than ${fmtBytes(limit)} on ${over>1?'their':'its'} own, so ${over>1?'they were':'it was'} kept as a single-page file. Compress first to make ${over>1?'them':'it'} smaller.`;
        if (groups.length===1) note=(note?note+' ':'')+`The whole PDF already fits under ${fmtBytes(limit)}.`; }
      const files=[]; const stem=baseName(c.name);
      for (let g=0; g<groups.length; g++){ b.set(`Saving part ${g+1}/${groups.length}`); const gr=groups[g], idx=gr.idx||gr; const a=idx[0]+1, z=idx[idx.length-1]+1;
        files.push({data: gr.bytes||await part(idx), name:`${stem} part ${g+1}.pdf`, pages:idx.length, label: a===z?`p. ${a}`:`pp. ${a}–${z}`}); }
      result.dataset.zipname = stem+' (split)';
      showResults(result, files, {note});
    });
    el.append(panel(src.el, seg, each, allPages, rg, sz, actionRow(go,err)));
  }});

function gridTool({id, name, desc, icon, gridOpts, intro, buildActions}){
  tool({id, cat:'org', name, desc, icon, build({el, result}){
    const src = pdfSource({onChange:()=>mount()}); const holder=h('div'); const extra=h('div',{class:'col'}); let grid=null;
    function mount(){ grid&&grid.destroy(); holder.innerHTML=''; extra.innerHTML=''; result.hidden=true; const c=src.get(); if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF to see its pages.')); return; }
      grid = PageGrid(c.doc, gridOpts); holder.append(grid.el); buildActions({extra, grid, c, result}); }
    el.append(panel(src.el, intro?h('p',{class:'hint'},intro):null, holder, extra)); mount();
    return ()=>{ grid&&grid.destroy(); src.el._cleanup(); };
  }});
}
gridTool({id:'remove', name:'Remove pages', desc:'Delete the pages you don’t need.', icon:I(`<path d="${DOC}"/><path d="M9.5 11.5l5 5M14.5 11.5l-5 5"/>`), gridOpts:{select:true}, intro:'Tap the pages you want to remove.',
  buildActions({extra, grid, c, result}){
    const rng=h('input',{class:'inp',id:'rmRange',placeholder:'or type pages, e.g. 2, 5-7'}); const err=errP();
    rng.addEventListener('change',()=>{ try{ grid.selectIdx(parseRange(rng.value, c.doc.numPages)); }catch(e){ err.textContent=e.message; } });
    const go=h('button',{class:'btn primary',type:'button'},'Remove pages');
    go.onclick=()=>guard(go,'Removing…',err, async()=>{ const del=new Set(grid.selected().map(x=>x.src)); if(!del.size) throw new Error('Select at least one page to remove.'); if(del.size===c.doc.numPages) throw new Error('You can’t remove every page.');
      grid.cells.forEach(x=>x.del=del.has(x.src)); const r=await pdfFromCells(c.bytes, grid.cells); grid.cells.forEach(x=>x.del=false);
      showResults(result,[{data:r.bytes, name:baseName(c.name)+' (pages removed).pdf', pages:r.pages}]); });
    extra.append(h('label',{class:'f'},'Pages to remove',rng), actionRow(go,err));
  }});
gridTool({id:'extract', name:'Extract pages', desc:'Take chosen pages out into a new PDF.', icon:I(`<path d="M5 3h8l4 4v6"/><path d="M5 3v18h7"/><path d="M15 17h6M18 14l3 3-3 3"/>`), gridOpts:{select:true}, intro:'Tap the pages you want to keep.',
  buildActions({extra, grid, c, result}){
    const rng=h('input',{class:'inp',id:'exRange',placeholder:'or type pages, e.g. 1-3, 8'}); const err=errP();
    rng.addEventListener('change',()=>{ try{ grid.selectIdx(parseRange(rng.value, c.doc.numPages)); }catch(e){ err.textContent=e.message; } });
    const sep=h('input',{type:'checkbox',id:'exSep'});
    const go=h('button',{class:'btn primary',type:'button'},'Extract');
    go.onclick=()=>guard(go,'Extracting…',err, async()=>{ const idx=grid.selected().map(x=>x.src); if(!idx.length) throw new Error('Select at least one page.');
      const s=await loadPdfLib(c.bytes); const mk=async ids=>{ const o=await PDFLib.PDFDocument.create(); (await o.copyPages(s,ids)).forEach(p=>o.addPage(p)); return o.save(); };
      if (sep.checked){ const files=[]; for(const i of idx) files.push({data:await mk([i]), name:`${baseName(c.name)} page ${i+1}.pdf`, pages:1}); result.dataset.zipname=baseName(c.name)+' pages'; showResults(result, files); }
      else showResults(result,[{data:await mk(idx), name:baseName(c.name)+' (extract).pdf', pages:idx.length}]); });
    extra.append(h('div',{class:'row'},h('button',{class:'btn sm',type:'button',onclick:()=>grid.setAll(true)},'Select all'),h('button',{class:'btn sm',type:'button',onclick:()=>grid.setAll(false)},'Clear')),
      h('label',{class:'f'},'Pages to keep',rng), h('label',{class:'chk'},sep,'Save each page as its own PDF'), actionRow(go,err));
  }});
gridTool({id:'organize', name:'Organize PDF', desc:'Reorder, rotate, delete or add blank pages.', icon:I('<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="13" width="7" height="7" rx="1"/><path d="M17 4v6M14 7l3-3 3 3M7 20v-6M4 17l3 3 3-3"/>'), gridOpts:{move:true, rotate:true, del:true}, intro:'Use the buttons under each page: ‹ › move it, ↺ ↻ turn it, ✕ removes it.',
  buildActions({extra, grid, c, result}){
    const err=errP(); const go=h('button',{class:'btn primary',type:'button'},'Save changes');
    go.onclick=()=>guard(go,'Saving…',err, async()=>{ if(grid.cells.every(x=>x.del)) throw new Error('Keep at least one page.'); const r=await pdfFromCells(c.bytes, grid.cells); showResults(result,[{data:r.bytes, name:baseName(c.name)+' (organized).pdf', pages:r.pages}]); });
    extra.append(h('div',{class:'row'}, h('button',{class:'btn sm',type:'button',onclick:()=>grid.addBlank()},'Add blank page'), h('button',{class:'btn sm',type:'button',onclick:()=>grid.reverse()},'Reverse order')), actionRow(go,err));
  }});

tool({id:'scan', cat:'org', name:'Scan to PDF', desc:'Photograph pages. Edges are found, straightened and cleaned.', icon:I('<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M7 7.5h10v9H7z"/>'),
  build({el, result}){
    const list = FileList({empty:'No pages yet. Take a photo to scan your first page.', thumb:p=>`url("${p.url}")`, meta:p=>`${p.w} × ${p.h} px · ${fmtBytes(p.jpeg.length)}`});
    let n=0; const sc = Scanner(p=>{ n++; list.add({...p, name:`Page ${list.items.length+1}`}); });
    let size='a4'; const sizeSeg=segmented([['a4','A4'],['letter','Letter'],['fit','Fit page']], size, v=>size=v);
    const margin = select('scMargin',[['0','None'],['14','Small'],['28','Normal'],['48','Wide']],'28');
    const go=h('button',{class:'btn primary',type:'button'},'Make PDF'); const err=errP();
    go.onclick=()=>guard(go,'Making…',err, async()=>{ if(!list.items.length) throw new Error('Scan at least one page first.');
      const pdf=await PDFLib.PDFDocument.create(), m=+margin.value;
      for (const s of list.items){ const img=await pdf.embedJpg(s.jpeg); let pw,ph;
        if(size==='fit'){ pw=(s.w<=s.h?595.28:841.89)+m*2; ph=s.h*(pw-m*2)/s.w+m*2; } else { [pw,ph]=SIZES[size]; if(s.w>s.h) [pw,ph]=[ph,pw]; }
        const k=Math.min((pw-2*m)/s.w,(ph-2*m)/s.h), dw=s.w*k, dh=s.h*k; pdf.addPage([pw,ph]).drawImage(img,{x:(pw-dw)/2,y:(ph-dh)/2,width:dw,height:dh}); }
      pdf.setTitle('Scan '+stamp()); showResults(result,[{data:await pdf.save(), name:`Scan ${stamp()}.pdf`, pages:list.items.length}]); });
    el.append(panel(sc), panel(h('p',{class:'sub'},'Scanned pages'), list.el, h('div',{class:'row'}, sizeSeg, h('label',{class:'f narrow'},'Margin',margin)), actionRow(go,err)));
  }});

/* ---------------- Optimize ---------------- */
/* Strip junk before the header, drop a half-written last object and add a trailer if the end is missing */
function patchPdfBytes(src){
  let s=new TextDecoder('latin1').decode(src); const at=s.indexOf('%PDF-'); if(at<0 && !/\d+\s+\d+\s+obj/.test(s.slice(0,1e6))) return null; if(at>0) s=s.slice(at);
  const tail=s.slice(-2048); let cut=false;
  if (!/%%EOF\s*$/.test(tail) || !/startxref/.test(tail)){
    const last=s.lastIndexOf('endobj'); if(last>0 && last+6<s.length-1){ s=s.slice(0,last+6); cut=true; }
    if (!/trailer[\s\S]*\/Root/.test(s.slice(-4096))){
      let root=null, max=0; const re=/(\d+)\s+(\d+)\s+obj\b/g; let m; const heads=[];
      while((m=re.exec(s))){ heads.push({n:+m[1], g:+m[2], at:m.index}); max=Math.max(max,+m[1]); }
      for (let i=0;i<heads.length;i++){ const body=s.slice(heads[i].at, heads[i+1]?heads[i+1].at:s.length); if(/\/Type\s*\/Catalog/.test(body)){ root=heads[i]; } }
      if (root) s+=`\ntrailer\n<< /Root ${root.n} ${root.g} R /Size ${max+1} >>\n%%EOF\n`;
    }
  }
  const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i)&255; return {bytes:out, cut};
}
/* catalog lost but pages survive: gather every page object into a fresh page list */
async function rebuildPageTree(bytes){
  const {PDFParser, PDFWriter, PDFName, PDFDict}=PDFLib;
  const ctx = await PDFParser.forBytesWithOptions(bytes, 200, false, true).parseDocument();
  const pagesL=[]; for (const [ref,obj] of ctx.enumerateIndirectObjects()) if (obj instanceof PDFDict && obj.get(PDFName.of('Type'))===PDFName.of('Page')) pagesL.push(ref);
  if (!pagesL.length) return null;
  pagesL.sort((a,b)=>a.objectNumber-b.objectNumber);
  const pagesRef = ctx.register(ctx.obj({Type:'Pages', Kids:pagesL, Count:pagesL.length}));
  for (const r of pagesL){ const p=ctx.lookup(r); p.set(PDFName.of('Parent'), pagesRef); if(!p.get(PDFName.of('MediaBox'))) p.set(PDFName.of('MediaBox'), ctx.obj([0,0,595.28,841.89])); }
  ctx.trailerInfo.Root = ctx.register(ctx.obj({Type:'Catalog', Pages:pagesRef}));
  return PDFWriter.forContext(ctx, 200).serializeToBuffer();
}
tool({id:'compress', cat:'opt', name:'Compress PDF', desc:'Make a PDF smaller, or fit it under a size limit.', icon:I('<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>'),
  build({el, result}){
    const src = pdfSource();
    const level = select('cmpLevel',[['target','Fit under a target size'],['high','High quality (larger)'],['medium','Medium (good for sharing)'],['small','Small (smallest file)']],'medium');
    const target=h('input',{class:'inp',id:'cmpTarget',inputmode:'decimal',value:'500'}), unit=select('cmpUnit',[['1024','KB'],['1048576','MB']],'1024');
    const tw=h('label',{class:'f',hidden:true},'Target size',h('span',{class:'unit'},target,unit));
    const pageSz = select('cmpPage',[['keep','Keep page size'],['a4','Change to A4'],['letter','Change to Letter']],'keep');
    const gray = h('input',{type:'checkbox',id:'cmpGray'});
    level.onchange=()=>tw.hidden=level.value!=='target';
    const go=h('button',{class:'btn primary',type:'button'},'Compress'); const err=errP();
    const LV={high:{dpi:170,q:.82}, medium:{dpi:130,q:.72}, small:{dpi:96,q:.55}}, LADDER=[{dpi:170,q:.82},{dpi:140,q:.74},{dpi:120,q:.66},{dpi:100,q:.58},{dpi:84,q:.5},{dpi:72,q:.42},{dpi:60,q:.36}];
    async function raster(c, lv, b, tag){ const out=await PDFLib.PDFDocument.create();
      for (let i=1;i<=c.doc.numPages;i++){ b.set(`${tag}page ${i}/${c.doc.numPages}`); const pg=await c.doc.getPage(i); const base=pg.getViewport({scale:1}); const cv=await renderPage(c.doc,i,lv.dpi/72);
        if (gray.checked){ const x=cv.getContext('2d'), im=x.getImageData(0,0,cv.width,cv.height), d=im.data; for(let k=0;k<d.length;k+=4){ const l=.299*d[k]+.587*d[k+1]+.114*d[k+2]; d[k]=d[k+1]=d[k+2]=l; } x.putImageData(im,0,0); }
        const img=await out.embedJpg(await canvasBytes(cv,'image/jpeg',lv.q)); let pw=base.width, ph=base.height;
        if (pageSz.value!=='keep'){ [pw,ph]=SIZES[pageSz.value]; if(base.width>base.height) [pw,ph]=[ph,pw]; }
        const k=Math.min(pw/base.width, ph/base.height), dw=base.width*k, dh=base.height*k; out.addPage([pw,ph]).drawImage(img,{x:(pw-dw)/2,y:(ph-dh)/2,width:dw,height:dh}); }
      return out.save(); }
    go.onclick=()=>guard(go,'Compressing…',err, async b=>{ const c=src.need(), orig=c.bytes.length; let bytes, note='';
      if (level.value==='target'){ const lim=parseFloat(target.value)*(+unit.value); if(!(lim>0)) throw new Error('Enter a target size, for example 500 KB.'); let best=null;
        for (let s=0;s<LADDER.length;s++){ bytes=await raster(c,LADDER[s],b,`Try ${s+1} · `); if(!best||bytes.length<best.length) best=bytes; if(bytes.length<=lim) break; }
        if (bytes.length>lim) bytes=best; note = bytes.length<=lim ? `Fits under ${fmtBytes(lim)}.` : `Couldn’t get under ${fmtBytes(lim)} while keeping it readable; this is the smallest. Try Split PDF.`; }
      else bytes = await raster(c, LV[level.value], b, '');
      if (bytes.length>=orig && pageSz.value==='keep' && !gray.checked){ showResults(result,[{data:c.bytes, name:c.name, pages:c.doc.numPages}],{title:'Already compact', note:`This PDF is ${fmtBytes(orig)}, already smaller than compressing would make it. Your original is kept unchanged.`}); return; }
      const pct=Math.round((1-bytes.length/orig)*100);
      note = `Was ${fmtBytes(orig)}, now ${fmtBytes(bytes.length)}${pct>0?` (${pct}% smaller)`:' (not smaller — the original is already compact)'}. ${note} Pages are saved as pictures, so text can’t be selected.`;
      showResults(result,[{data:bytes, name:baseName(c.name)+(pageSz.value!=='keep'?` (${pageSz.value.toUpperCase()})`:' (compressed)')+'.pdf', pages:c.doc.numPages}], {note}); });
    el.append(panel(src.el, h('div',{class:'row'}, h('label',{class:'f'},'Quality',level), tw, h('label',{class:'f'},'Page size',pageSz)), h('label',{class:'chk'},gray,'Black & white (smaller)'), actionRow(go,err)));
  }});

tool({id:'repair', cat:'opt', name:'Repair PDF', desc:'Fix a damaged PDF that won’t open properly.', icon:I('<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5L16 12l-4-4z"/>'),
  build({el, result}){
    let file=null; const info=h('span',{class:'t'},'No file chosen yet.');
    const pick=filePicker({label:'Choose PDF', accept:'application/pdf,.pdf,*/*', onFiles:async([f])=>{ file={name:f.name, bytes:await readFile(f)}; info.textContent=`${f.name} · ${fmtBytes(file.bytes.length)}`; pick.setLabel('Choose another'); }});
    const go=h('button',{class:'btn primary',type:'button'},'Repair'); const err=errP();
    go.onclick=()=>guard(go,'Repairing…',err, async b=>{ const f=file|| (STATE.cur && {name:STATE.cur.name, bytes:STATE.cur.bytes}); if(!f) throw new Error('Choose the damaged PDF first.');
      const fixed=patchPdfBytes(f.bytes); if(!fixed) throw new Error('This file doesn’t contain PDF data, so it can’t be repaired.'); const bytes=fixed.bytes;
      let out=null, how='';
      const rebuilt = async()=>{ try{ return await rebuildPageTree(bytes); }catch(e){ return null; } };
      for (const get of [()=>f.bytes, ()=>bytes, rebuilt]){ if(out) break; const cand=await get(); if(!cand) continue; try{ const d=await loadPdfLib(cand); if(d.getPageCount()>0){ out=await d.save({useObjectStreams:false}); how='The file structure was rebuilt. Text, links and pages are kept.'+(fixed.cut?' The end of the file was damaged, so anything after the last complete part was dropped.':''); } }catch(e){} }
      if (!out){ b.set('Rebuilding pages…'); let doc; try{ doc=await loadPdfJs(bytes); }catch(e){ throw new Error('This PDF is too badly damaged to recover.'); } const o=await PDFLib.PDFDocument.create();
        for(let i=1;i<=doc.numPages;i++){ b.set(`Page ${i}/${doc.numPages}`); try{ const pg=await doc.getPage(i); const v=pg.getViewport({scale:1}); const cv=await renderPage(doc,i,2); const im=await o.embedJpg(await canvasBytes(cv,'image/jpeg',.88)); o.addPage([v.width,v.height]).drawImage(im,{x:0,y:0,width:v.width,height:v.height}); }catch(e){} }
        if(!o.getPageCount()) throw new Error('No readable pages were found in this file.'); out=await o.save(); how='The pages that could be read were redrawn into a new PDF (as pictures).'; }
      showResults(result,[{data:out, name:baseName(f.name)+' (repaired).pdf'}], {note:how}); });
    el.append(panel(h('div',{class:'srcinfo'},info,pick), h('p',{class:'hint'},'If you don’t choose a file, the PDF open in Read is used.'), actionRow(go,err)));
  }});

tool({id:'ocr', cat:'opt', name:'OCR PDF', ai:true, desc:'Read text from scanned pages and photos with Claude.', icon:I('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h8M8 12h8M8 15h5"/>'),
  build({el, result}){
    const src=pdfSource(); const rng=h('input',{class:'inp',id:'ocrRange',placeholder:'All pages'});
    const go=h('button',{class:'btn primary',type:'button'},'Read text'); const stop=h('button',{class:'btn',type:'button',hidden:true},'Stop'); const err=errP(); const prog=progressBar(); prog.hidden=true;
    let ctl=null; stop.onclick=()=>ctl&&ctl.abort();
    go.onclick=()=>guard(go,'Reading…',err, async b=>{
      const c=src.need(); const sample=await getSample(); if(!sample) throw new Error(AI_UNAVAILABLE);
      const lim=await sample.limits().catch(()=>null); if(!lim||!lim.images) throw new Error('Sending page images to Claude isn’t available in this view.');
      const idx=parseRange(rng.value, c.doc.numPages); if(idx.length>40) throw new Error('Choose up to 40 pages at a time.');
      ctl=new AbortController(); stop.hidden=false; prog.hidden=false; const texts=[];
      try{
        for (let k=0;k<idx.length;k++){ const n=idx[k]+1; b.set(`Page ${k+1} of ${idx.length}…`); prog.set(k/idx.length);
          const pg=await c.doc.getPage(n); const v=pg.getViewport({scale:1}); const s=Math.min(2.2, 1600/Math.max(v.width,v.height)); const cv=await renderPage(c.doc,n,s);
          const blob=await canvasBlob(cv,'image/jpeg',.88);
          const {text}=await sample(`This image is page ${n} of a document. Transcribe ALL of the text on it exactly as written, in reading order, keeping the original language and spelling. Keep paragraph and line breaks. Write tables as rows with columns separated by " | ". Do not describe the page, translate, summarise or add anything. If there is no text, reply with exactly: [no text]`, {images:[blob], signal:ctl.signal, cache:{gcTime:86400000}});
          texts.push({n, text:text.trim()==='[no text]'?'':text.trim()}); }
      } catch(e){ if(e && e.code){ if(e.code==='cancelled' && texts.length){ toast('Stopped — showing the pages read so far.'); } else throw new Error(sampleErr(e)); } else throw e; }
      finally{ stop.hidden=true; prog.hidden=true; }
      const full = texts.map(t=>`— Page ${t.n} —\n${t.text}`).join('\n\n');
      const docx = await makeDocx(texts.flatMap((t,i)=>[ ...(i?[{type:'pagebreak'}]:[]), ...t.text.split(/\n{2,}/).map(p=>({type:'p', text:p})) ]), {title:baseName(c.name)});
      // searchable copy: invisible text layer (Latin text only)
      let files=[{data:docx, name:baseName(c.name)+' (text).docx'}, {data:new TextEncoder().encode(full), name:baseName(c.name)+' (text).txt'}];
      if (isLatin(full)){ const out=await loadPdfLib(c.bytes); const f=await out.embedFont(PDFLib.StandardFonts.Helvetica); const pl=out.getPages();
        for (const t of texts){ const page=pl[t.n-1]; const g=pageGeom(page); const lines=t.text.split('\n'); const fs=Math.max(4, Math.min(11, (g.vh-40)/Math.max(1,lines.length)/1.15));
          lines.forEach((l,i)=>{ const clean=l.replace(/[^\x20-\x7E\xA0-\xFF]/g,' '); if(clean.trim()) drawTextV(page, clean, 20, 24+fs*(i+1)*1.15, fs, f, {opacity:0}); }); }
        files.unshift({data:await out.save(), name:baseName(c.name)+' (searchable).pdf', pages:out.getPageCount()}); }
      result.dataset.zipname=baseName(c.name)+' OCR';
      showResults(result, files, {title:'Text found', text:full, note:'The searchable PDF keeps your pages and adds hidden text you can search and copy (English text only).'});
    });
    el.append(panel(src.el, h('label',{class:'f'},'Pages',rng), h('p',{class:'hint'},'Each page is sent to Claude as a picture. This uses your Claude usage and takes a few seconds per page.'), prog, h('div',{class:'row'},go,stop,err)));
  }});

/* ---------------- Convert to PDF ---------------- */
tool({id:'jpg2pdf', cat:'to', name:'JPG to PDF', desc:'Turn photos and images into one PDF.', icon:I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/>'),
  build({el, result}){
    const list = FileList({empty:'No images yet.', thumb:p=>`url("${p.url}")`, meta:p=>fmtBytes(p.file.size)});
    const add = filePicker({label:'Add images', accept:'image/*', multiple:true, primary:true, icon:ICON_FOLDER, onFiles:fs=>list.add(...fs.map(f=>({file:f, name:f.name, url:URL.createObjectURL(f)})))});
    let size='a4'; const sizeSeg=segmented([['a4','A4'],['letter','Letter'],['fit','Fit image']], size, v=>size=v);
    const orient = select('jOrient',[['auto','Match each image'],['portrait','Portrait'],['landscape','Landscape']],'auto');
    const margin = select('jMargin',[['0','None'],['14','Small'],['28','Normal'],['48','Wide']],'28');
    const go=h('button',{class:'btn primary',type:'button'},'Make PDF'); const err=errP();
    go.onclick=()=>guard(go,'Making…',err, async b=>{ if(!list.items.length) throw new Error('Add at least one image.'); const pdf=await PDFLib.PDFDocument.create(), m=+margin.value;
      for (let i=0;i<list.items.length;i++){ b.set(`Image ${i+1}/${list.items.length}`); const it=list.items[i]; let cv; try{ cv=await fileToCanvas(it.file, 2400); }catch(e){ throw new Error(`“${it.name}” isn’t an image this browser can read. Try JPG or PNG.`); }
        const img=await pdf.embedJpg(await canvasBytes(cv,'image/jpeg',.88)); let pw,ph;
        if (size==='fit'){ pw=cv.width*.75+m*2; ph=cv.height*.75+m*2; } else { [pw,ph]=SIZES[size]; const land = orient.value==='landscape' || (orient.value==='auto' && cv.width>cv.height); if(land) [pw,ph]=[ph,pw]; }
        const k=Math.min((pw-2*m)/cv.width,(ph-2*m)/cv.height), dw=cv.width*k, dh=cv.height*k; pdf.addPage([pw,ph]).drawImage(img,{x:(pw-dw)/2,y:(ph-dh)/2,width:dw,height:dh}); }
      showResults(result,[{data:await pdf.save(), name:`Images ${stamp()}.pdf`, pages:list.items.length}]); });
    el.append(panel(h('div',{class:'row'},add), list.el, h('div',{class:'row'},sizeSeg), h('div',{class:'row'},h('label',{class:'f'},'Orientation',orient),h('label',{class:'f narrow'},'Margin',margin)), actionRow(go,err)));
  }});

function officeTool({id, name, desc, icon, accept, pick, note, convert, options, needFile=true}){
  tool({id, cat:'to', name, desc, icon, build({el, result}){
    let file=null; const info=h('span',{class:'t'},'No file chosen yet.');
    const p=filePicker({label:pick, accept, primary:true, icon:ICON_FOLDER, onFiles:async([f])=>{ file=f; info.textContent=`${f.name} · ${fmtBytes(f.size)}`; p.setLabel('Choose another'); }});
    const opts=h('div',{class:'row'}); const go=h('button',{class:'btn primary',type:'button'},'Convert to PDF'); const err=errP();
    const ctx={opts};
    options && options(ctx);
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ if(!file && needFile) throw new Error('Choose a file first.'); const r=await convert(file, b, ctx); showResults(result,[{data:r.bytes, name:(r.name||baseName(file?file.name:'document'))+'.pdf', pages:r.pages}], {note:r.note||''}); });
    el.append(panel(h('div',{class:'srcinfo'},info,p), opts, note?h('p',{class:'hint'},note):null, ctx.after||null, actionRow(go,err)));
  }});
}
officeTool({id:'word2pdf', name:'Word to PDF', desc:'Convert .docx documents to PDF.', icon:I(`<path d="${DOC}"/><path d="M8.5 11l1.2 5 1.3-4 1.3 4 1.2-5"/>`), accept:'.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', pick:'Choose Word file',
  note:'Works with .docx files. Older .doc files: open and save them as .docx first. Text, headings, lists, tables and pictures are kept; complex layouts are simplified.',
  async convert(f, b){ const {html, landscape, marginPt}=await docxToHtml(await readFile(f)); const r=await htmlToPdf(html,{landscape, marginPt:clamp(marginPt,28,72), onProgress:(i,n)=>b.set(`Page ${i}/${n}`)}); return {bytes:await r.pdf.save(), pages:r.pages}; }});
officeTool({id:'ppt2pdf', name:'PowerPoint to PDF', desc:'Convert .pptx slides to PDF.', icon:I('<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M12 17v3M8 20h8M9 8h3.5a2 2 0 0 1 0 4H9V8z"/>'), accept:'.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', pick:'Choose PowerPoint file',
  note:'Works with .pptx files. Text, pictures, shapes and tables are placed as on the slide; charts, animations and special effects are left out.',
  async convert(f, b){ const p=await pptxSlides(await readFile(f)); if(!p.slides.length) throw new Error('No slides were found in this file.'); const out=await PDFLib.PDFDocument.create(); const pw=p.W/12700, ph=p.H/12700;
    for (let i=0;i<p.slides.length;i++){ b.set(`Slide ${i+1}/${p.slides.length}`); const c=await drawSlide(p.slides[i], p.W, p.H, 2); const im=await out.embedJpg(await canvasBytes(c,'image/jpeg',.9)); out.addPage([pw,ph]).drawImage(im,{x:0,y:0,width:pw,height:ph}); }
    return {bytes:await out.save(), pages:p.slides.length}; }});
officeTool({id:'excel2pdf', name:'Excel to PDF', desc:'Convert .xlsx spreadsheets to PDF.', icon:I('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>'), accept:'.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pick:'Choose Excel file',
  note:'Works with .xlsx files. Each sheet starts on a new page; wide sheets are shrunk to fit. Formulas show their last saved values.',
  options(ctx){ ctx.orient=select('xOrient',[['landscape','Landscape pages'],['portrait','Portrait pages']],'landscape'); ctx.opts.append(h('label',{class:'f'},'Orientation',ctx.orient)); },
  async convert(f, b, ctx){ const sheets=await xlsxSheets(await readFile(f)); if(!sheets.length) throw new Error('No sheets were found in this file.'); const land=ctx.orient.value==='landscape';
    const r=await htmlToPdf(sheetsToHtml(sheets),{landscape:land, marginPt:28, onProgress:(i,n)=>b.set(`Page ${i}/${n}`)}); return {bytes:await r.pdf.save(), pages:r.pages}; }});
officeTool({id:'html2pdf', name:'HTML to PDF', desc:'Turn a web page’s HTML into a PDF.', icon:I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>'), accept:'.html,.htm,text/html', pick:'Choose .html file',
  note:'Web addresses can’t be downloaded from here. Save the page as .html (in Chrome: ⋮ → Share → Download page… or Save page as) and choose it, or paste the HTML below. Pictures from other websites won’t appear.',
  needFile:false,
  options(ctx){ ctx.paste=h('textarea',{class:'inp',id:'hPaste',rows:6,placeholder:'…or paste HTML here, e.g. <h1>Hello</h1><p>World</p>'}); ctx.after=h('label',{class:'f'},'Paste HTML',ctx.paste); },
  async convert(f, b, ctx){ const pasted=ctx.paste.value.trim(); if(!f && !pasted) throw new Error('Choose an .html file or paste some HTML.');
    let html = pasted && (!f || pasted.length>0) ? pasted : await f.text(); if(f && !pasted) html=await f.text();
    if(!/<html|<body|<head/i.test(html)) html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,${FONT_STACK};font-size:12pt;line-height:1.45;color:#111}img{max-width:100%}</style></head><body>${html}</body></html>`;
    const r=await htmlToPdf(html,{marginPt:36, onProgress:(i,n)=>b.set(`Page ${i}/${n}`)}); return {bytes:await r.pdf.save(), pages:r.pages, name: f?baseName(f.name):'Web page'}; }});
tool({id:'text2pdf', cat:'to', name:'Text to PDF', desc:'Type or paste text in any language.', icon:I(`<path d="${DOC}"/><path d="M9 11h6M12 11v6"/>`),
  build({el, result}){
    const title=h('input',{class:'inp',id:'tTitle',value:''}), size=select('tSize',[['10','10'],['11','11'],['12','12'],['14','14'],['16','16'],['18','18']],'12');
    const body=h('textarea',{class:'inp',id:'tBody',rows:10,placeholder:'Type or paste your text here. Tamil and other languages work too.'});
    const go=h('button',{class:'btn primary',type:'button'},'Make PDF'); const err=errP();
    go.onclick=()=>guard(go,'Making…',err, async()=>{ if(!title.value.trim()&&!body.value.trim()) throw new Error('Type a title or some text first.'); const r=await makeTextPdf(title.value.trim(), body.value, +size.value); showResults(result,[{data:await r.doc.save(), name:cleanName(title.value.trim()||'Document'), pages:r.pages}]); });
    el.append(panel(h('div',{class:'row'},h('label',{class:'f'},'Title',title),h('label',{class:'f narrow'},'Font size',size)), h('label',{class:'f'},'Text',body), actionRow(go,err)));
  }});
