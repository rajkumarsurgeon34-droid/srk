/* SRK — reader, tool grid, routing */
'use strict';
(function(){
/* ---------- tabs & routing ---------- */
let curTab='tools', cleanup=null;
function showTab(t){
  curTab=t; $$('.tab').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===t)));
  $('#view-read').hidden = t!=='read'; $('#view-tools').hidden = t!=='tools';
  if (t==='read') requestAnimationFrame(()=>{ if(fitMode) layout(); });
}
$$('.tab').forEach(b=>b.addEventListener('click',()=>{
  if (b.dataset.tab==='read'){ if(location.hash!=='#read') location.hash='read'; else showTab('read'); }
  else { if (location.hash && location.hash!=='#') location.hash=''; else { route(); } }
}));
function route(){
  const id = location.hash.replace(/^#/,'');
  if (id==='read'){ showTab('read'); return; }
  showTab('tools');
  const t = TOOLS.find(x=>x.id===id && !(window.SRK_NATIVE && x.ai));
  if (t) openTool(t); else closeTool();
}
addEventListener('hashchange', route);

/* ---------- tool grid ---------- */
function buildHome(){
  const home=$('#toolsHome'); home.innerHTML='';
  let dismissed=false; try{ dismissed = localStorage.getItem('pd-tip')==='1'; }catch(e){}
  if (!dismissed && !window.SRK_NATIVE){
    const close=h('button',{class:'btn icon sm',type:'button','aria-label':'Dismiss',style:'margin-left:auto;flex:none'},'✕');
    const n=h('div',{class:'notice'}, h('div',null, h('b',null,'Tip: '), 'If tapping “Choose” or the camera does nothing inside the Claude app, open this page’s link in Chrome. Files, camera and saving all work there.'), close);
    close.onclick=()=>{ n.remove(); try{ localStorage.setItem('pd-tip','1'); }catch(e){} };
    home.append(n);
  }
  for (const [cat, title, color] of CATS){
    const tiles=h('div',{class:'tiles'});
    const list = TOOLS.filter(t=>t.cat===cat && !(window.SRK_NATIVE && t.ai)); if(!list.length) continue;
    list.forEach(t=>{
      const b=h('a',{class:'tile'+(t.ai?' ai':''), href:'#'+t.id, style:`--tc:var(${color})`}, h('span',{class:'ic',html:t.icon}), h('span',null, h('b',null,t.name), t.ai?h('span',{class:'tag'},'with Claude'):null));
      tiles.append(b);
    });
    home.append(h('section',{class:'cat'}, h('h2',null,title), tiles));
  }
}
function closeTool(){
  if (cleanup){ try{ cleanup(); }catch(e){} cleanup=null; }
  $('#toolPanel').hidden=true; $('#toolPanel').innerHTML=''; $('#toolsHome').hidden=false;
}
function openTool(t){
  if (cleanup){ try{ cleanup(); }catch(e){} cleanup=null; }
  const color = CATS.find(c=>c[0]===t.cat)[2];
  const p=$('#toolPanel'); p.innerHTML=''; p.style.setProperty('--tc', `var(${color})`);
  const back=h('a',{class:'btn sm',href:'#',style:'align-self:flex-start'},'← All tools');
  const head=h('div',{class:'toolhead'}, h('span',{class:'ic',html:t.icon}), h('div',null, h('h1',null,t.name), h('p',null,t.desc)));
  const body=h('div',{class:'col'}); const result=resultSlot();
  p.append(back, head, body, result);
  $('#toolsHome').hidden=true; p.hidden=false; $('#toolsScroll').scrollTop=0;
  try{ const c=t.build({el:body, result}); if (typeof c==='function') cleanup=c; }
  catch(e){ console.error(e); body.append(h('p',{class:'err'},'This tool couldn’t start: '+(e.message||e))); }
}

/* ---------- reader ---------- */
let doc=null, sizes=[], scale=1, fitMode=true, current=1, renderGen=0, io=null;
const rendered=new Map(); const pagesEl=$('#pages'), desk=$('#desk');
async function openPdf(bytes, name, isSample){
  try{
    const d = await loadPdfJs(bytes);
    if (doc && doc!==d) { /* keep old doc alive: tools may still use it */ }
    doc=d; sizes=[];
    for (let i=1;i<=doc.numPages;i++){ const v=(await doc.getPage(i)).getViewport({scale:1}); sizes.push([v.width,v.height]); }
    const dn=$('#docname'); dn.innerHTML=''; dn.append(name); if(isSample) dn.append(h('span',{class:'badge'},'Sample'));
    $('#pageTotal').textContent='/ '+doc.numPages; current=1; $('#pageInput').value=1; fitMode=true; build(); desk.scrollTop=0; desk.scrollLeft=0;
    setCurrent({bytes, name, doc, sample:!!isSample});
    return true;
  }catch(e){ toast(pwError(e)?'This PDF is password-protected. Use Tools → Unlock PDF.':'That file couldn’t be opened as a PDF.'); return false; }
}
openInReader = async (data, name)=>{ const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data; if(await openPdf(bytes, name)) location.hash='read'; };
function fitScale(){ if(!sizes.length) return 1; const w=desk.clientWidth-24; return Math.max(.25, Math.min(w/Math.max(...sizes.map(s=>s[0])), 2.5)); }
function build(){
  pagesEl.innerHTML=''; rendered.clear(); io&&io.disconnect();
  io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) renderP(+e.target.dataset.p); }),{root:desk, rootMargin:'600px 0px'});
  sizes.forEach((s,i)=>{ const d=h('div',{class:'pg','data-p':i+1}, h('span',{class:'num'},i+1)); pagesEl.append(d); io.observe(d); });
  layout();
}
function layout(){
  if(!doc) return; if(fitMode) scale=fitScale();
  $('#zoomLbl').textContent = fitMode?'Fit':Math.round(scale*100)+'%'; $('#fitBtn').classList.toggle('on',fitMode); renderGen++;
  [...pagesEl.children].forEach((d,i)=>{ d.style.width=sizes[i][0]*scale+'px'; d.style.height=sizes[i][1]*scale+'px'; }); rendered.clear();
  const top=desk.scrollTop, bot=top+desk.clientHeight;
  [...pagesEl.children].forEach(d=>{ const y=d.offsetTop-pagesEl.offsetTop; if(y<bot+600 && y+d.offsetHeight>top-600) renderP(+d.dataset.p); });
}
async function renderP(n){
  if(!doc || rendered.get(n)===scale) return; rendered.set(n,scale); const gen=renderGen; const myDoc=doc;
  const page=await myDoc.getPage(n); const dpr=Math.min(devicePixelRatio||1,2.5); const vp=page.getViewport({scale:scale*dpr});
  const c=document.createElement('canvas'); c.width=Math.floor(vp.width); c.height=Math.floor(vp.height);
  try{ await page.render({canvasContext:c.getContext('2d'), viewport:vp}).promise; }catch(e){ rendered.delete(n); return; }
  if(gen!==renderGen || myDoc!==doc) return; const host=pagesEl.children[n-1]; if(!host) return; const old=host.querySelector('canvas'); old?old.replaceWith(c):host.prepend(c);
}
function goTo(n){ if(!doc) return; n=clamp(n|0,1,doc.numPages); const el=pagesEl.children[n-1]; if(el) desk.scrollTo({top:el.offsetTop-pagesEl.offsetTop}); current=n; $('#pageInput').value=n; }
desk.addEventListener('scroll',()=>{ if(!doc) return; const mid=desk.scrollTop+desk.clientHeight*.35; const k=pagesEl.children; let n=1; for(let i=0;i<k.length;i++){ if(k[i].offsetTop-pagesEl.offsetTop<=mid) n=i+1; else break; } if(n!==current){ current=n; if(document.activeElement!==$('#pageInput')) $('#pageInput').value=n; } },{passive:true});
$('#prevBtn').onclick=()=>goTo(current-1); $('#nextBtn').onclick=()=>goTo(current+1);
$('#pageInput').addEventListener('change',e=>goTo(parseInt(e.target.value,10)||1));
$('#pageInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ goTo(parseInt(e.target.value,10)||1); e.target.blur(); } });
function zoomBy(f){ if(!doc) return; const keep=current; scale=clamp((fitMode?fitScale():scale)*f,.25,5); fitMode=false; layout(); goTo(keep); }
$('#zoomIn').onclick=()=>zoomBy(1.2); $('#zoomOut').onclick=()=>zoomBy(1/1.2);
$('#fitBtn').onclick=()=>{ const keep=current; fitMode=true; layout(); goTo(keep); };
$('#nightBtn').onclick=()=>{ desk.classList.toggle('night'); $('#nightBtn').classList.toggle('on',desk.classList.contains('night')); try{ localStorage.setItem('pd-night',desk.classList.contains('night')?'1':'0'); }catch(e){} };
try{ if(localStorage.getItem('pd-night')==='1'){ desk.classList.add('night'); $('#nightBtn').classList.add('on'); } }catch(e){}
let rt; addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if(fitMode && curTab==='read') layout(); },150); });
document.addEventListener('keydown',e=>{ if(curTab!=='read'||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; if(e.key==='ArrowRight'||e.key==='PageDown'){ goTo(current+1); e.preventDefault(); } if(e.key==='ArrowLeft'||e.key==='PageUp'){ goTo(current-1); e.preventDefault(); } });
// Open PDF: the tap lands on the real file input
const openBtn=$('#openBtn'); const op=filePicker({label:'Open PDF', accept:'application/pdf,.pdf', primary:true, icon:ICON_FOLDER, onFiles:async([f])=>openPdf(await readFile(f), f.name)}); op.id='openBtn'; openBtn.replaceWith(op); $('#openInput').remove();
desk.addEventListener('dragover',e=>e.preventDefault());
desk.addEventListener('drop',async e=>{ e.preventDefault(); const f=[...e.dataTransfer.files].find(f=>/pdf$/i.test(f.type)||/\.pdf$/i.test(f.name)); if(f) openPdf(await readFile(f), f.name); });

/* ---------- starter guide PDF ---------- */
async function makeGuide(){
  const P=PDFLib, pdf=await P.PDFDocument.create(); const f=await pdf.embedFont(P.StandardFonts.Helvetica), fb=await pdf.embedFont(P.StandardFonts.HelveticaBold);
  const ink=P.rgb(.11,.13,.21), acc=P.rgb(.18,.31,.85), mut=P.rgb(.4,.43,.52);
  const pg1=pdf.addPage([595.28,841.89]); let y=760;
  pg1.drawRectangle({x:56,y:800,width:60,height:4,color:acc}); pg1.drawText('Welcome to SRK',{x:56,y:y,size:26,font:fb,color:ink}); y-=30;
  pg1.drawText('A sample PDF so you can try the reader and the tools right away.',{x:56,y,size:12.5,font:f,color:mut}); y-=36;
  for (const [cat,title] of CATS){ const names=TOOLS.filter(t=>t.cat===cat && !(window.SRK_NATIVE && t.ai)).map(t=>t.name); if(!names.length) continue;
    pg1.drawText(title.toUpperCase(),{x:56,y,size:10.5,font:fb,color:acc}); y-=18;
    let line=''; const lines=[]; for(const n of names){ const t=line?line+'  ·  '+n:n; if(f.widthOfTextAtSize(t,12)>480){ lines.push(line); line=n; } else line=t; } if(line) lines.push(line);
    lines.forEach(l=>{ pg1.drawText(l,{x:56,y,size:12,font:f,color:ink}); y-=17; }); y-=12; }
  pg1.drawText(window.SRK_NATIVE ? 'Everything happens on your phone. Your files are never uploaded.' : 'Everything happens on your device except the tools marked “with Claude”.',{x:56,y:70,size:10,font:f,color:mut});
  const pg2=pdf.addPage([595.28,841.89]); pg2.drawText('Page 2 of the sample',{x:56,y:760,size:22,font:fb,color:ink});
  ['Scroll or tap the arrows to move between pages.','','Try Tools > Extract pages and pick this page,','or Tools > Add page numbers, then open the result here.'].forEach((l,i)=>pg2.drawText(l,{x:56,y:720-i*20,size:12.5,font:f,color:ink}));
  pg2.drawText('2',{x:530,y:40,size:10,font:f,color:mut});
  return pdf.save();
}

/* ---------- start ---------- */
buildHome();
if (window.pdfjsLib && window.PDFLib){ makeGuide().then(b=>{ if(!STATE.cur) openPdf(b,'SRK guide.pdf',true); }).catch(e=>console.error(e)); }
else { $('#toolsHome').prepend(h('div',{class:'notice'},'The PDF engine couldn’t load. Check your internet connection and reload this page.')); }
route();
})();
