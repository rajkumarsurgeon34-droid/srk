/* SRK — Security, Intelligence */
'use strict';
function bytesToB64(u8){ let s=''; for (let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null, u8.subarray(i,i+0x8000)); return btoa(s); }

/* ---------------- Security ---------------- */
tool({id:'unlock', cat:'sec', name:'Unlock PDF', desc:'Remove the password from a PDF you can open.', icon:I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  build({el, result}){
    const src=pdfSource({allowLocked:true, onChange:()=>paint()}); const pw=h('input',{class:'inp',id:'uPw',type:'password',autocomplete:'off'}); const pwL=h('label',{class:'f'},'Password',pw);
    const state=h('p',{class:'hint'});
    function paint(){ const c=src.get(); pwL.hidden = !(c&&c.locked); state.textContent = !c ? '' : c.locked ? 'This PDF needs a password to open. Type it to unlock.' : isEncrypted(c.bytes) ? 'This PDF opens without a password but has restrictions (like no copying or printing). Unlocking removes them.' : 'This PDF has no password or restrictions.'; }
    const go=h('button',{class:'btn primary',type:'button'},'Unlock'); const err=errP();
    go.onclick=()=>guard(go,'Unlocking…',err, async b=>{ const c=src.need(); let doc=c.doc;
      if (c.locked){ if(!pw.value) throw new Error('Type the password.'); try{ doc=await loadPdfJs(c.bytes, pw.value); }catch(e){ throw new Error(pwError(e)?'That password is wrong.':'This PDF couldn’t be opened.'); } }
      else if (!isEncrypted(c.bytes)) throw new Error('This PDF isn’t locked, so there’s nothing to remove.');
      const out=await PDFLib.PDFDocument.create(); const f=await out.embedFont(PDFLib.StandardFonts.Helvetica);
      for (let n=1;n<=doc.numPages;n++){ b.set(`Page ${n}/${doc.numPages}`); const v=(await doc.getPage(n)).getViewport({scale:1}); const cv=await renderPage(doc,n,200/72); const im=await out.embedJpg(await canvasBytes(cv,'image/jpeg',.88));
        const page=out.addPage([v.width,v.height]); page.drawImage(im,{x:0,y:0,width:v.width,height:v.height});
        const {items}=await pageItems(doc,n,{visual:true}); for (const it of items){ const s=it.str.replace(/[^\x20-\x7E\xA0-\xFF]/g,''); if(!s.trim()) continue; try{ page.drawText(s,{x:it.x, y:v.height-it.y, size:Math.max(1,it.size), font:f, opacity:0}); }catch(e){} } }
      showResults(result,[{data:await out.save(), name:baseName(c.name)+' (unlocked).pdf', pages:doc.numPages}], {note:'The unlocked copy has no password. Pages are redrawn as pictures with hidden text, so you can still search and copy English text.'}); });
    el.append(panel(src.el, state, pwL, actionRow(go,err))); paint();
    return ()=>src.el._cleanup();
  }});

tool({id:'protect', cat:'sec', name:'Protect PDF', desc:'Lock a PDF with a password (AES encryption).', icon:I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  build({el, result}){
    const src=pdfSource(); const p1=h('input',{class:'inp',id:'pPw',type:'password',autocomplete:'new-password'}), p2=h('input',{class:'inp',id:'pPw2',type:'password',autocomplete:'new-password'});
    const show=h('input',{type:'checkbox',id:'pShow'}); show.onchange=()=>{ p1.type=p2.type=show.checked?'text':'password'; };
    const restrict=h('input',{type:'checkbox',id:'pRes'}); const ow=h('input',{class:'inp',id:'pOwner',type:'password',autocomplete:'new-password'});
    const cPrint=h('input',{type:'checkbox',checked:true}), cCopy=h('input',{type:'checkbox'}), cEdit=h('input',{type:'checkbox'});
    const resBox=h('div',{class:'col',hidden:true}, h('label',{class:'f'},'Owner password (to change these limits later)',ow), h('label',{class:'chk'},cPrint,'Allow printing'), h('label',{class:'chk'},cCopy,'Allow copying text'), h('label',{class:'chk'},cEdit,'Allow editing and filling forms'));
    restrict.onchange=()=>resBox.hidden=!restrict.checked;
    const go=h('button',{class:'btn primary',type:'button'},'Protect PDF'); const err=errP();
    go.onclick=()=>guard(go,'Encrypting…',err, async()=>{ const c=src.need(); if(!p1.value) throw new Error('Type a password.'); if(p1.value!==p2.value) throw new Error('The two passwords don’t match.');
      if (/[^\x20-\x7E]/.test(p1.value+ow.value)) throw new Error('Use only English letters, numbers and symbols in the password.');
      const allow = restrict.checked ? {print:cPrint.checked, printHigh:cPrint.checked, copy:cCopy.checked, access:true, modify:cEdit.checked, annotate:cEdit.checked, fill:cEdit.checked, assemble:cEdit.checked} : {print:1,printHigh:1,copy:1,access:1,modify:1,annotate:1,fill:1,assemble:1};
      const bytes=await protectPdf(c.bytes,{userPw:p1.value, ownerPw: restrict.checked ? (ow.value||'') : p1.value, allow});
      showResults(result,[{data:bytes, name:baseName(c.name)+' (protected).pdf', pages:c.doc.numPages}], {note:'Keep the password safe — it can’t be recovered if you forget it.'}); });
    el.append(panel(src.el, h('div',{class:'row'},h('label',{class:'f'},'Password',p1),h('label',{class:'f'},'Type it again',p2)), h('label',{class:'chk'},show,'Show passwords'), h('label',{class:'chk'},restrict,'Also limit printing, copying or editing'), resBox, actionRow(go,err)));
  }});

tool({id:'sign', cat:'sec', name:'Sign PDF', desc:'Draw, type or upload your signature and place it.', icon:I('<path d="M3 17c3 0 4-8 6-8s0 8 3 8 3-4 5-4 2 3 4 3"/><path d="M3 21h18"/>'),
  build({el, result}){
    const src=pdfSource({onChange:()=>mount()}); const holder=h('div'); let an=null, sig=null;
    const maker=SignatureMaker(s=>{ sig=s; if(an){ an.pendingImage=s; an.setTool('sig'); } toast('Now tap the page where you want to sign.'); });
    const dateB=h('button',{class:'btn sm',type:'button',onclick:()=>{ if(!an) return; const d=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); an.el.querySelector('textarea').value=d; an.el.querySelector('textarea').dispatchEvent(new Event('input')); an.setTool('text'); toast('Tap the page to place the date.'); }},'Add today’s date');
    function mount(){ holder.innerHTML=''; const c=src.get(); if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF to sign.')); return; } an=Annotator(c.doc,{tools:['select','sig','text'], pendingImage:sig}); if(sig) an.pendingImage=sig; holder.append(an.el); }
    const go=h('button',{class:'btn primary',type:'button'},'Save signed PDF'); const err=errP();
    go.onclick=()=>guard(go,'Saving…',err, async()=>{ const c=src.need(); if(!an.objs.some(o=>o.type==='sig')) throw new Error('Place your signature on a page first.'); if(isEncrypted(c.bytes)) throw new Error('Unlock this PDF first.'); const pdf=await loadPdfLib(c.bytes); await an.apply(pdf); showResults(result,[{data:await pdf.save(), name:baseName(c.name)+' (signed).pdf', pages:pdf.getPageCount()}], {note:'This adds a picture of your signature. It isn’t a certificate-based digital signature.'}); });
    el.append(panel(h('p',{class:'sub'},'1 · Your signature'), maker), panel(h('p',{class:'sub'},'2 · Place it'), src.el, h('div',{class:'row'},dateB), holder, actionRow(go,err))); mount();
    return ()=>src.el._cleanup();
  }});

tool({id:'redact', cat:'sec', name:'Redact PDF', desc:'Black out private details for good.', icon:I(`<path d="${DOC}"/><rect x="8" y="11" width="8" height="3" fill="currentColor"/><path d="M8 17h5"/>`),
  build({el, result}){
    const src=pdfSource({onChange:()=>mount()}); const holder=h('div'); let an=null;
    const q=h('input',{class:'inp',id:'rFind',placeholder:'e.g. a name, phone or account number'}); const found=h('p',{class:'hint'});
    const findB=h('button',{class:'btn',type:'button'},'Black out all matches');
    findB.onclick=async()=>{ const c=src.get(); if(!c||!an) return; const term=q.value.trim().toLowerCase(); if(!term){ found.textContent='Type something to search for.'; return; } let n=0;
      for (let p=1;p<=c.doc.numPages;p++){ const {items}=await pageItems(c.doc,p,{visual:true}); for (const it of items){ const s=it.str.toLowerCase(); let i=s.indexOf(term); while(i>=0){ const L=it.str.length||1, a=it.w*(i/L), z=it.w*((i+term.length)/L);
            /* corners along the word's own direction (u) and its "up" (v), so sideways and upside-down text is covered too */
            const pts=[[a,-.28],[z,-.28],[z,.92],[a,.92]].map(([d,e])=>({x:it.x+it.ux*d-it.vx*e*it.size, y:it.y+it.uy*d-it.vy*e*it.size}));
            const xs=pts.map(q=>q.x), ys=pts.map(q=>q.y), x0=Math.min(...xs)-1, y0=Math.min(...ys)-1;
            an.objs.push({id:Date.now()+Math.random(), page:p, type:'redact', x:x0, y:y0, w:Math.max(...xs)+1-x0, h:Math.max(...ys)+1-y0}); n++; i=s.indexOf(term,i+term.length); } } }
      an.renderObjs(); found.textContent = n ? `${n} match${n>1?'es':''} covered. Check each page, then save.` : 'No matches found. Scanned pages can’t be searched — draw boxes by hand.'; };
    function mount(){ holder.innerHTML=''; const c=src.get(); if(!c){ holder.append(h('p',{class:'empty'},'Choose a PDF to redact.')); return; } an=Annotator(c.doc,{tools:['select','redact'], defaultTool:'redact'}); holder.append(an.el); }
    const go=h('button',{class:'btn primary',type:'button'},'Redact and save'); const err=errP();
    go.onclick=()=>guard(go,'Redacting…',err, async()=>{ const c=src.need(); const boxes=an.objs.filter(o=>o.type==='redact'); if(!boxes.length) throw new Error('Draw at least one black box.');
      const bytes=await redactPdf(c.doc, c.bytes, boxes); const pgs=new Set(boxes.map(b=>b.page)).size;
      showResults(result,[{data:bytes, name:baseName(c.name)+' (redacted).pdf', pages:c.doc.numPages}], {note:`${pages(pgs)} with black boxes ${pgs>1?'were':'was'} turned into pictures, so the hidden text is gone for good. Other pages are unchanged.`}); });
    el.append(panel(src.el, h('div',{class:'row'},h('label',{class:'f'},'Find text to hide',q),findB), found, holder, actionRow(go,err))); mount();
    return ()=>src.el._cleanup();
  }});

tool({id:'compare', cat:'sec', name:'Compare PDF', desc:'Spot the differences between two versions.', icon:I('<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M12 2v20"/>'),
  build({el, result}){
    const a=pdfSource(); let b=null; const bInfo=h('span',{class:'t'},'No second PDF chosen.');
    const bPick=filePicker({label:'Choose second PDF', accept:'application/pdf,.pdf', primary:true, onFiles:async([f])=>{ const bytes=await readFile(f); try{ b={name:f.name, bytes, doc:await loadPdfJs(bytes)}; bInfo.innerHTML=''; bInfo.append(h('b',null,f.name),` · ${pages(b.doc.numPages)}`); bPick.setLabel('Choose another'); }catch(e){ toast(pwError(e)?'That PDF is password-protected. Unlock it first.':'That file couldn’t be opened as a PDF.'); } }});
    let mode='text'; const pageI=h('input',{class:'inp',id:'cmpPage',inputmode:'numeric',value:'1'}); const pageL=h('label',{class:'f narrow',hidden:true},'Page',pageI);
    const seg=segmented([['text','Text changes'],['visual','Visual overlay']], mode, v=>{ mode=v; pageL.hidden=v!=='visual'; });
    const out=h('div',{class:'col'}); const go=h('button',{class:'btn primary',type:'button'},'Compare'); const err=errP();
    go.onclick=()=>guard(go,'Comparing…',err, async bz=>{ const A=a.need(); if(!b) throw new Error('Choose the second PDF to compare with.'); out.innerHTML=''; result.hidden=true;
      if (mode==='text'){ const ta=(await docText(A.doc,{onPage:n=>bz.set(`Reading first ${n}`)})).join('\n\n'), tb=(await docText(b.doc,{onPage:n=>bz.set(`Reading second ${n}`)})).join('\n\n');
        if(!ta.trim()&&!tb.trim()) throw new Error('Neither PDF has readable text. Try Visual overlay.');
        bz.set('Comparing…'); await tick(); const ops=wordDiff(ta, tb); const pre=h('pre',{class:'difftext'}); let ins=0, del=0;
        for (const [t,s] of ops){ if(t===0) pre.append(s); else if(t<0){ del++; pre.append(h('del',null,s)); } else { ins++; pre.append(h('ins',null,s)); } }
        out.append(h('p',{class:ins||del?'hint':'okmsg'}, ins||del ? `${del} removed and ${ins} added passage${ins+del>1?'s':''}. Removed text is struck through in red; added text is green.` : 'No text differences found.'), pre); }
      else { const n=clamp(parseInt(pageI.value,10)||1,1,Math.min(A.doc.numPages,b.doc.numPages));
        const ca=await renderPage(A.doc,n,1.5), cb=await renderPage(b.doc,n,1.5); const W=Math.max(ca.width,cb.width), H=Math.max(ca.height,cb.height);
        const d=document.createElement('canvas'); d.width=W; d.height=H; const x=d.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,W,H);
        const ga=ca.getContext('2d').getImageData(0,0,ca.width,ca.height), gb=cb.getContext('2d').getImageData(0,0,cb.width,cb.height); const o=x.getImageData(0,0,W,H); let diff=0;
        for (let y=0;y<H;y++) for (let X=0;X<W;X++){ const i=(y*W+X)*4; const pa=(X<ca.width&&y<ca.height)?(y*ca.width+X)*4:-1, pb=(X<cb.width&&y<cb.height)?(y*cb.width+X)*4:-1;
          const la=pa<0?255:(ga.data[pa]+ga.data[pa+1]+ga.data[pa+2])/3, lb=pb<0?255:(gb.data[pb]+gb.data[pb+1]+gb.data[pb+2])/3;
          if (Math.abs(la-lb)>48){ diff++; if(la<lb){ o.data[i]=220;o.data[i+1]=40;o.data[i+2]=40; } else { o.data[i]=20;o.data[i+1]=150;o.data[i+2]=70; } } else { const v=235+la*.08; o.data[i]=o.data[i+1]=o.data[i+2]=Math.min(255,v); } o.data[i+3]=255; }
        x.putImageData(o,0,0);
        out.append(h('p',{class:'hint'}, diff ? `Page ${n}: red shows what was only in the first PDF, green what is only in the second.` : `Page ${n} looks the same in both.`), h('div',{class:'twocol stack'}, h('div',null,h('p',{class:'sub'},'Differences'), d), h('div',{class:'col'}, h('div',null,h('p',{class:'sub'},'First'),ca), h('div',null,h('p',{class:'sub'},'Second'),cb)))); } });
    el.append(panel(h('p',{class:'sub'},'First PDF'), a.el, h('p',{class:'sub'},'Second PDF'), h('div',{class:'srcinfo'},bInfo,bPick), h('div',{class:'row'},seg,pageL), actionRow(go,err)), out);
    return ()=>a.el._cleanup();
  }});
/* word-level diff (Myers-style LCS on tokens) */
function wordDiff(a, b){
  const ta=a.match(/\s+|[^\s]+/g)||[], tb=b.match(/\s+|[^\s]+/g)||[];
  let s=0; while(s<ta.length&&s<tb.length&&ta[s]===tb[s]) s++;
  let e=0; while(e<ta.length-s&&e<tb.length-s&&ta[ta.length-1-e]===tb[tb.length-1-e]) e++;
  const A=ta.slice(s,ta.length-e), B=tb.slice(s,tb.length-e); const n=A.length, m=B.length; const ops=[];
  if (n*m > 25e6){ ops.push([-1,A.join('')],[1,B.join('')]); }
  else { const W=m+1; const L=new Uint32Array((n+1)*W); for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) L[i*W+j] = A[i]===B[j] ? L[(i+1)*W+j+1]+1 : Math.max(L[(i+1)*W+j], L[i*W+j+1]);
    let i=0,j=0; while(i<n&&j<m){ if(A[i]===B[j]){ ops.push([0,A[i]]); i++; j++; } else if(L[(i+1)*W+j]>=L[i*W+j+1]){ ops.push([-1,A[i]]); i++; } else { ops.push([1,B[j]]); j++; } } while(i<n) ops.push([-1,A[i++]]); while(j<m) ops.push([1,B[j++]]); }
  const res=[]; if(s) res.push([0,ta.slice(0,s).join('')]);
  for (const [t,x] of ops){ const last=res[res.length-1]; if(last&&last[0]===t) last[1]+=x; else if(last && t!==0 && /^\s+$/.test(x)) { last[1]+=x; } else res.push([t,x]); }
  if(e) res.push([0,ta.slice(ta.length-e).join('')]);
  return res;
}

/* ---------------- Intelligence ---------------- */
const LANGS = ['English','Tamil','Hindi','Telugu','Malayalam','Kannada','Bengali','Marathi','Gujarati','Punjabi','Urdu','Arabic','French','German','Spanish','Portuguese','Italian','Russian','Chinese (Simplified)','Japanese','Korean','Indonesian','Malay','Sinhala'];
async function needText(c, b){ const pagesT=await docText(c.doc,{onPage:n=>b&&b.set(`Reading page ${n}/${c.doc.numPages}`)}); const all=pagesT.join('\n\n'); if(all.replace(/\s/g,'').length<80) throw new Error('This PDF has almost no readable text (it may be a scan). Run OCR PDF first, then try again.'); return pagesT; }
function chunkPages(pagesT, max){ const chunks=[]; let cur='', from=1; pagesT.forEach((t,i)=>{ const add=`[Page ${i+1}]\n${t}\n\n`; if(cur && (cur.length+add.length)>max){ chunks.push({text:cur,from,to:i}); cur=''; from=i+1; } if(add.length>max){ for(let k=0;k<add.length;k+=max) chunks.push({text:add.slice(k,k+max),from:i+1,to:i+1}); from=i+2; } else cur+=add; }); if(cur) chunks.push({text:cur,from,to:pagesT.length}); return chunks; }
function aiShell(el, extra){
  const out=h('pre',{class:'textout',hidden:true,'aria-live':'polite'}); const stop=h('button',{class:'btn',type:'button',hidden:true},'Stop'); let ctl=null; stop.onclick=()=>ctl&&ctl.abort();
  return {out, stop, start(){ ctl=new AbortController(); stop.hidden=false; out.hidden=false; out.textContent='Thinking…'; return ctl.signal; }, end(){ stop.hidden=true; }};
}

tool({id:'summarize', cat:'ai', ai:true, name:'AI Summarizer', desc:'Get the key points of a long PDF.', icon:I('<path d="M5 6h9M5 10h14M5 14h9M5 18h6"/><path d="M18 3l.8 1.7L20.5 5.5l-1.7.8L18 8l-.8-1.7-1.7-.8 1.7-.8z"/>'),
  build({el, result}){
    const src=pdfSource(); const len=select('sLen',[['short','Short (5–7 points)'],['medium','Medium'],['long','Detailed']],'medium'); const style=select('sStyle',[['bullets','Bullet points'],['para','Paragraphs'],['study','Study notes (exam style)']],'bullets');
    const lang=select('sLang',[['same','Same as the document'],...LANGS.map(l=>[l,l])],'same'); const focus=h('input',{class:'inp',id:'sFocus',placeholder:'Optional: what to focus on, e.g. treatment and outcomes'});
    const ui=aiShell(); const go=h('button',{class:'btn primary',type:'button'},'Summarize'); const err=errP();
    go.onclick=()=>guard(go,'Working…',err, async b=>{ const c=src.need(); const sample=await getSample(); if(!sample) throw new Error(AI_UNAVAILABLE); const pagesT=await needText(c,b); result.hidden=true;
      const want = `${({short:'a short summary (5–7 key points)',medium:'a clear summary of moderate length',long:'a detailed, section-by-section summary'})[len.value]}, written as ${({bullets:'bullet points',para:'short paragraphs',study:'concise study notes with headings, key facts, numbers and definitions highlighted, suitable for exam revision'})[style.value]}`;
      const langLine = lang.value==='same' ? 'Write in the same language as the document.' : `Write in ${lang.value}.`;
      const focusLine = focus.value.trim() ? `Pay special attention to: ${focus.value.trim()}.` : '';
      const signal=ui.start(); let final='';
      try{
        const chunks=chunkPages(pagesT, 90000);
        if (chunks.length===1){ b.set('Summarizing…'); final=(await sample(`Summarize the document below. Produce ${want}. ${langLine} ${focusLine} Use Markdown (## headings, - bullets, **bold**). Do not invent facts that are not in the document.\n\n<document title="${c.name}">\n${chunks[0].text}\n</document>`, {signal, onText:({text})=>ui.out.textContent=text})).text; }
        else { const parts=[]; for (let i=0;i<chunks.length;i++){ b.set(`Reading part ${i+1} of ${chunks.length}…`); ui.out.textContent=`Reading part ${i+1} of ${chunks.length}…`; const r=await sample(`Write thorough notes on the key points, facts and numbers in this part (pages ${chunks[i].from}–${chunks[i].to}) of a longer document. ${langLine}\n\n${chunks[i].text}`, {signal}); parts.push(`Pages ${chunks[i].from}–${chunks[i].to}:\n${r.text}`); }
          b.set('Combining…'); final=(await sample(`These are notes on consecutive parts of one document titled "${c.name}". Combine them into ${want}. ${langLine} ${focusLine} Use Markdown (## headings, - bullets, **bold**). Do not invent facts.\n\n${parts.join('\n\n')}`, {signal, onText:({text})=>ui.out.textContent=text})).text; }
      } catch(e){ if(e&&e.code){ throw new Error(sampleErr(e)); } throw e; } finally{ ui.end(); }
      ui.out.hidden=true;
      const docx=await makeDocx(mdBlocks(final),{title:'Summary of '+baseName(c.name)});
      showResults(result,[{data:docx, name:'Summary of '+baseName(c.name)+'.docx'},{data:new TextEncoder().encode(final), name:'Summary of '+baseName(c.name)+'.md'}], {title:'Summary', text:final}); });
    el.append(panel(src.el, h('div',{class:'row'},h('label',{class:'f'},'Length',len),h('label',{class:'f'},'Style',style),h('label',{class:'f'},'Language',lang)), h('label',{class:'f'},'Focus',focus), h('p',{class:'hint'},'The text of the PDF is sent to Claude. This uses your Claude usage.'), h('div',{class:'row'},go,ui.stop,err), ui.out));
  }});
function mdBlocks(md){ return md.replace(/\r/g,'').split(/\n/).reduce((acc,line)=>{ const t=line.trim(); if(!t) return acc; const hm=t.match(/^(#{1,4})\s+(.*)/); const bm=t.match(/^[-*•]\s+(.*)/)||t.match(/^\d+[.)]\s+(.*)/);
  const strip=s=>s.replace(/\*\*(.+?)\*\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/`([^`]+)`/g,'$1');
  if (hm) acc.push({type:'p', text:strip(hm[2]), level:Math.min(3,hm[1].length)});
  else if (bm) acc.push({type:'p', text:'• '+strip(bm[1]), bullet:true, runs:mdRuns('• '+bm[1])});
  else acc.push({type:'p', text:strip(t), runs:mdRuns(t)});
  return acc; },[]); }
function mdRuns(s){ const runs=[]; s.split(/(\*\*[^*]+\*\*)/).forEach(p=>{ if(!p) return; const m=p.match(/^\*\*([^*]+)\*\*$/); runs.push(m?{text:m[1],bold:true}:{text:p.replace(/`([^`]+)`/g,'$1')}); }); return runs; }

tool({id:'translate', cat:'ai', ai:true, name:'Translate PDF', desc:'Translate a PDF into another language.', icon:I('<path d="M4 5h8M8 3v2M10 5c-.5 3.5-3 6-6 7M6 8c1 2 3 3.5 5 4"/><path d="M13 21l4-9 4 9M14.5 18h5"/>'),
  build({el, result}){
    const src=pdfSource(); const lang=select('tLang', LANGS.map(l=>[l,l]),'Tamil'); const other=h('input',{class:'inp',id:'tOther',placeholder:'Or type another language'}); const rng=h('input',{class:'inp',id:'tRange',placeholder:'All pages'});
    const ui=aiShell(); const prog=progressBar(); prog.hidden=true; const go=h('button',{class:'btn primary',type:'button'},'Translate'); const err=errP();
    go.onclick=()=>guard(go,'Translating…',err, async b=>{ const c=src.need(); const sample=await getSample(); if(!sample) throw new Error(AI_UNAVAILABLE); const target=other.value.trim()||lang.value;
      const idx=parseRange(rng.value,c.doc.numPages); const all=await needText(c,b); const pagesT=idx.map(i=>all[i]); result.hidden=true;
      const chunks=chunkPages(pagesT, 12000).map(ch=>({...ch, from:idx[ch.from-1]+1, to:idx[Math.min(ch.to,idx.length)-1]+1, text:ch.text.replace(/\[Page (\d+)\]/g,(m,n)=>`[Page ${idx[n-1]+1}]`)}));
      const signal=ui.start(); prog.hidden=false; const outParts=[];
      try{ for (let i=0;i<chunks.length;i++){ b.set(`Part ${i+1} of ${chunks.length}…`); prog.set(i/chunks.length); const before=outParts.join('\n\n');
          const r=await sample(`Translate the text below into ${target}. Keep the meaning exact and the tone natural. Keep the [Page N] markers, paragraph breaks, lists, numbers, names and units as they are. Medical, legal and technical terms: use the standard term in ${target} and keep the original term in brackets the first time if it helps. Output only the translation.\n\n${chunks[i].text}`, {signal, cache:{gcTime:86400000}, onText:({text})=>{ ui.out.textContent=(before?before+'\n\n':'')+text; ui.out.scrollTop=ui.out.scrollHeight; }});
          outParts.push(r.text.trim()); } }
      catch(e){ if(e&&e.code){ if(e.code==='cancelled'&&outParts.length) toast('Stopped — keeping what was translated.'); else throw new Error(sampleErr(e)); } else throw e; }
      finally{ ui.end(); prog.hidden=true; }
      const text=outParts.join('\n\n'); ui.out.hidden=true; const stem=`${baseName(c.name)} (${target})`;
      const docBlocks=[]; text.split(/\n(?=\[Page \d+\])/).forEach((pg,i)=>{ if(i) docBlocks.push({type:'pagebreak'}); pg.replace(/^\[Page \d+\]\s*/,'').split(/\n{2,}/).forEach(p=>p.trim()&&docBlocks.push({type:'p',text:p.trim()})); });
      const pdf=await makeTextPdf('', text.replace(/\[Page (\d+)\]\n?/g,'— $1 —\n'), 12);
      showResults(result,[{data:await makeDocx(docBlocks,{title:stem}), name:stem+'.docx'},{data:await pdf.doc.save(), name:stem+'.pdf', pages:pdf.pages},{data:new TextEncoder().encode(text), name:stem+'.txt'}], {title:`Translated into ${target}`, text, note:'Check important documents with a fluent speaker. Layout and pictures from the original are not kept.'}); });
    el.append(panel(src.el, h('div',{class:'row'},h('label',{class:'f'},'Translate into',lang),h('label',{class:'f'},'Other language',other)), h('label',{class:'f'},'Pages',rng), h('p',{class:'hint'},'The text is sent to Claude. Long documents take a while and use your Claude usage. Scanned PDFs need OCR PDF first.'), prog, h('div',{class:'row'},go,ui.stop,err), ui.out));
  }});

tool({id:'markdown', cat:'ai', ai:true, name:'PDF to Markdown', desc:'Clean, structured text for notes apps and AI tools.', icon:I('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 15V9l2.5 3L11 9v6M15 9v6M13 13l2 2 2-2"/>'),
  build({el, result}){
    const src=pdfSource(); const tidy=h('input',{type:'checkbox',id:'mTidy'}); const ui=aiShell(); const go=h('button',{class:'btn primary',type:'button'},'Convert'); const err=errP();
    go.onclick=()=>guard(go,'Converting…',err, async b=>{ const c=src.need(); result.hidden=true; const pagesMd=[]; const allLines=[];
      for (let n=1;n<=c.doc.numPages;n++){ b.set(`Page ${n}/${c.doc.numPages}`); const {items}=await pageItems(c.doc,n,{fonts:true}); allLines.push(groupLines(items)); }
      const body=median(allLines.flat().map(l=>l.size))||11;
      allLines.forEach(lines=>{ pagesMd.push(paragraphs(lines,body).map(p=> p.level ? `${'#'.repeat(p.level)} ${p.text}` : p.bullet ? `- ${p.text.replace(/^([•▪◦●\-–*]|\d{1,3}[.)])\s+/,(m)=>/\d/.test(m)?m:'')}` : p.bold ? `**${p.text}**` : p.text).join('\n\n')); });
      let md=pagesMd.join('\n\n---\n\n').trim(); if(md.replace(/\s/g,'').length<40) throw new Error('This PDF has almost no readable text (it may be a scan). Run OCR PDF first.');
      if (tidy.checked){ const sample=await getSample(); if(!sample) throw new Error(AI_UNAVAILABLE); const signal=ui.start(); const parts=[];
        try{ const chunks=[]; for(let i=0;i<md.length;i+=40000) chunks.push(md.slice(i,i+40000));
          for (let i=0;i<chunks.length;i++){ b.set(`Tidying ${i+1}/${chunks.length}`); const before=parts.join('\n\n'); const r=await sample(`Clean up this Markdown that was extracted from a PDF. Fix broken line wraps and hyphenation, rebuild tables as Markdown tables, make heading levels consistent, turn lists into proper Markdown lists, and remove repeated page headers/footers and page numbers. Do NOT change, add or remove any wording. Output only the Markdown.\n\n${chunks[i]}`, {signal, onText:({text})=>ui.out.textContent=(before?before+'\n\n':'')+text}); parts.push(r.text.trim()); }
          md=parts.join('\n\n'); } catch(e){ if(e&&e.code) throw new Error(sampleErr(e)); throw e; } finally{ ui.end(); ui.out.hidden=true; } }
      showResults(result,[{data:new TextEncoder().encode(md), name:baseName(c.name)+'.md'}], {title:'Markdown', text:md}); });
    el.append(panel(src.el, h('label',{class:'chk'},tidy,'Tidy up with Claude (tables, lists, broken lines)'), h('p',{class:'hint'},'Without tidying, everything happens on your device.'), h('div',{class:'row'},go,ui.stop,err), ui.out));
  }});
