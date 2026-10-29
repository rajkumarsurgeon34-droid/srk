/* SRK — reusable widgets: page grid, on-page editor, scanner, crop box */
'use strict';

/* ================= Page grid ================= */
/* opts: select (tap toggles selection), move, rotate, del, blank (allow inserting blank pages) */
function PageGrid(doc, {select=false, move=false, rotate=false, del=false, blank=false, preselect=false, onChange}={}){
  const cells = []; // {src (0-based or -1 for blank), rot, sel, del, el, cv}
  const grid = h('div',{class:'pgrid'});
  const root = $('#toolsScroll');
  const io = new IntersectionObserver(es=>es.forEach(async e=>{ if(!e.isIntersecting) return; const c=e.target._cell; io.unobserve(e.target); if(c.src<0) return;
    try{ const pg=await doc.getPage(c.src+1); const v=pg.getViewport({scale:1}); const k=Math.min(130/v.width, 170/v.height); const cv=await renderPage(doc, c.src+1, k*Math.min(2,devicePixelRatio||1)); cv.style.width=Math.round(v.width*k)+'px'; cv.style.height='auto'; c.cv.replaceWith(cv); c.cv=cv; applyRot(c); }catch(err){} }), {root, rootMargin:'400px 0px'});
  function applyRot(c){ c.cv.style.transform = `rotate(${c.rot}deg)`; }
  function mkCell(src){
    const c = {src, rot:0, sel:preselect, del:false};
    const ph = h('canvas',{width:10,height:13}); ph.style.width='80px'; ph.style.height='104px'; ph.style.background='#fff';
    if (src<0){ ph.style.outline='1px dashed var(--line)'; }
    c.cv = ph;
    const num = h('span',{class:'pn'});
    const acts = h('div',{class:'acts'});
    const B = (label, title, fn)=>h('button',{class:'btn',type:'button',title,'aria-label':title,onclick:e=>{ e.stopPropagation(); fn(); }},label);
    if (move){ acts.append(B('‹','Move earlier',()=>shift(c,-1)), B('›','Move later',()=>shift(c,1))); }
    if (rotate){ acts.append(B('↺','Rotate left',()=>{ c.rot=(c.rot+270)%360; applyRot(c); changed(); }), B('↻','Rotate right',()=>{ c.rot=(c.rot+90)%360; applyRot(c); changed(); })); }
    if (del){ acts.append(B('✕','Delete page',()=>{ c.del=!c.del; c.el.classList.toggle('del',c.del); changed(); })); }
    c.el = h('div',{class:'pcell'+(c.sel?' sel':''), role: select?'checkbox':null, 'aria-checked': select?String(c.sel):null, tabindex: select?0:null},
      h('div',{class:'pth'},c.cv), num, (move||rotate||del)?acts:null, h('span',{class:'tick','aria-hidden':'true'},'✓'));
    c.el._cell = c; c.num = num;
    if (select){ const t=()=>{ c.sel=!c.sel; c.el.classList.toggle('sel',c.sel); c.el.setAttribute('aria-checked',String(c.sel)); changed(); }; c.el.addEventListener('click',t); c.el.addEventListener('keydown',e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); t(); } }); }
    return c;
  }
  function shift(c, d){ const i=cells.indexOf(c), j=i+d; if(j<0||j>=cells.length) return; [cells[i],cells[j]]=[cells[j],cells[i]]; paint(); changed(); }
  function paint(){ cells.forEach((c,i)=>{ grid.append(c.el); c.num.textContent = c.src<0 ? `Blank · ${i+1}` : (c.src+1===i+1 ? `${i+1}` : `${c.src+1} → ${i+1}`); }); }
  function changed(){ onChange && onChange(api); }
  for (let i=0;i<doc.numPages;i++){ const c=mkCell(i); cells.push(c); io.observe(c.el); }
  paint();
  const api = {
    el: grid, cells,
    selected(){ return cells.filter(c=>c.sel); },
    setAll(v){ cells.forEach(c=>{ c.sel=v; c.el.classList.toggle('sel',v); c.el.setAttribute('aria-checked',String(v)); }); changed(); },
    selectIdx(idx){ const s=new Set(idx); cells.forEach(c=>{ c.sel=s.has(c.src); c.el.classList.toggle('sel',c.sel); c.el.setAttribute('aria-checked',String(c.sel)); }); changed(); },
    rotateWhere(pred, d){ cells.forEach(c=>{ if(pred(c)){ c.rot=(c.rot+d+360)%360; applyRot(c); } }); changed(); },
    addBlank(){ const c=mkCell(-1); cells.push(c); paint(); changed(); c.el.scrollIntoView({behavior:'smooth',block:'nearest'}); },
    reverse(){ cells.reverse(); paint(); changed(); },
    destroy(){ io.disconnect(); },
  };
  return api;
}
/* build a new PDF from grid cells */
async function pdfFromCells(srcBytes, cells){
  const src = await loadPdfLib(srcBytes); const out = await PDFLib.PDFDocument.create();
  const keep = cells.filter(c=>!c.del);
  const idx = keep.filter(c=>c.src>=0).map(c=>c.src);
  const copied = idx.length ? await out.copyPages(src, idx) : [];
  let k=0; let lastSize = src.getPageCount() ? src.getPage(0).getSize() : {width:595.28,height:841.89};
  for (const c of keep){
    if (c.src<0){ out.addPage([lastSize.width, lastSize.height]); continue; }
    const p = copied[k++]; lastSize = p.getSize();
    if (c.rot) p.setRotation(PDFLib.degrees((p.getRotation().angle + c.rot) % 360));
    out.addPage(p);
  }
  return {bytes: await out.save(), pages: keep.length};
}

/* ================= On-page editor (Edit, Sign, Redact) ================= */
function Annotator(doc, {tools=['select','text','draw','rect','highlight','whiteout','image'], defaultTool='select', pendingImage=null, onChange}={}){
  const objs = []; let pageN = 1, scale = 1, tool = defaultTool, selId = null, vw = 0, vh = 0, idSeq = 1;
  const props = { color:'#1b2236', size:16, stroke:3, text:'Type here' };
  const TOOL_INFO = { select:['Select','Move or resize'], text:['Text','Tap the page to add text'], draw:['Draw','Draw with your finger'], rect:['Box','Drag to draw a box'],
    highlight:['Highlight','Drag over text to highlight'], whiteout:['White-out','Drag to cover something with white'], image:['Picture','Tap the page to place the picture'],
    sig:['Signature','Tap the page to place your signature'], redact:['Black box','Drag over what to hide'] };
  const tb = h('div',{class:'toolbar',role:'toolbar'});
  const toolBtns = {};
  tools.forEach(t=>{ const b=h('button',{class:'btn sm'+(t===tool?' on':''),type:'button','aria-pressed':String(t===tool),title:TOOL_INFO[t][1]},TOOL_INFO[t][0]); b.onclick=()=>setTool(t); toolBtns[t]=b; tb.append(b); });
  const hint = h('p',{class:'hint'});
  const prevB = h('button',{class:'btn icon sm',type:'button','aria-label':'Previous page'},'‹'), nextB = h('button',{class:'btn icon sm',type:'button','aria-label':'Next page'},'›');
  const pageLbl = h('span',{class:'pager'});
  const delB = h('button',{class:'btn sm danger',type:'button',disabled:true},'Delete selected');
  const nav = h('div',{class:'row'}, prevB, pageLbl, nextB, h('div',{class:'spacer'}), delB);
  const cv = h('canvas',{class:'main'}); const layer = h('div',{class:'annlayer'});
  const stage = h('div',{class:'scanstage'}, cv, layer);
  const wrap = h('div',{class:'stagewrap'}, stage);
  // properties
  const colorI = h('input',{type:'color',class:'inp',value:props.color,'aria-label':'Colour'});
  const sizeI = h('input',{type:'number',class:'inp',min:6,max:120,value:props.size,'aria-label':'Text size'});
  const textI = h('textarea',{class:'inp',rows:2,style:'min-height:60px','aria-label':'Text'}, props.text);
  const strokeI = h('input',{type:'range',min:1,max:12,value:props.stroke,'aria-label':'Pen thickness'});
  const propRow = h('div',{class:'row'},
    h('label',{class:'f narrow'},'Colour',colorI), h('label',{class:'f narrow'},'Text size',sizeI), h('label',{class:'f narrow'},'Pen',strokeI));
  const textRow = h('label',{class:'f'},'Text', textI);
  const el = h('div',{class:'col'}, tb, hint, nav, wrap, propRow, textRow);

  function setTool(t){ tool=t; Object.entries(toolBtns).forEach(([k,b])=>{ b.classList.toggle('on',k===t); b.setAttribute('aria-pressed',String(k===t)); }); hint.textContent=TOOL_INFO[t][1]+'.'; layer.style.cursor = t==='select'?'default':'crosshair'; syncProps(); }
  function sel(){ return objs.find(o=>o.id===selId); }
  function select(id){ selId=id; delB.disabled=!id; renderObjs(); syncProps(); }
  function syncProps(){ const o=sel(); const showText = (o&&o.type==='text') || (!o&&tool==='text'); textRow.hidden=!showText; if(o&&o.type==='text') textI.value=o.text; if(o&&o.color) colorI.value=o.color; if(o&&o.size) sizeI.value=o.size; }
  colorI.oninput=()=>{ props.color=colorI.value; const o=sel(); if(o&&('color' in o)){ o.color=colorI.value; renderObjs(); } };
  sizeI.oninput=()=>{ props.size=+sizeI.value||16; const o=sel(); if(o&&o.type==='text'){ o.size=props.size; measureText(o); renderObjs(); } };
  strokeI.oninput=()=>{ props.stroke=+strokeI.value; };
  textI.oninput=()=>{ props.text=textI.value; const o=sel(); if(o&&o.type==='text'){ o.text=textI.value||' '; measureText(o); renderObjs(); } };
  delB.onclick=()=>{ const i=objs.findIndex(o=>o.id===selId); if(i>=0) objs.splice(i,1); select(null); onChange&&onChange(); };
  prevB.onclick=()=>show(pageN-1); nextB.onclick=()=>show(pageN+1);
  const mctx = document.createElement('canvas').getContext('2d');
  function measureText(o){ mctx.font=`${o.size}px Helvetica, Arial, ${FONT_STACK}`; const lines=String(o.text).split('\n'); o.w=Math.max(10,...lines.map(l=>mctx.measureText(l).width))+2; o.h=o.size*1.2*lines.length; }

  async function show(n){
    n = clamp(n,1,doc.numPages); pageN=n; select(null);
    pageLbl.textContent = `Page ${n} / ${doc.numPages}`; prevB.disabled=n<=1; nextB.disabled=n>=doc.numPages;
    const page = await doc.getPage(n); const v=page.getViewport({scale:1}); vw=v.width; vh=v.height;
    const avail = Math.max(240, (wrap.clientWidth||340)-28); scale = Math.min(avail/vw, 900/vw);
    const dpr = Math.min(devicePixelRatio||1,2);
    const c = await renderPage(doc, n, scale*dpr);
    cv.width=c.width; cv.height=c.height; cv.getContext('2d').drawImage(c,0,0);
    cv.style.width=(vw*scale)+'px'; cv.style.height=(vh*scale)+'px'; stage.style.width=(vw*scale)+'px'; stage.style.height=(vh*scale)+'px';
    renderObjs();
  }
  function renderObjs(){
    layer.innerHTML='';
    for (const o of objs.filter(o=>o.page===pageN)){
      const d = h('div',{class:'aobj'+(o.id===selId?' sel':'')}); d.style.left=o.x*scale+'px'; d.style.top=o.y*scale+'px'; d.style.width=o.w*scale+'px'; d.style.height=o.h*scale+'px';
      if (o.type==='text'){ const t=h('div',{class:'txt'},o.text); t.style.fontSize=o.size*scale+'px'; t.style.color=o.color; d.append(t); }
      else if (o.type==='image'||o.type==='sig'){ d.append(h('img',{src:o.url,alt:''})); }
      else if (o.type==='rect'){ d.style.border=`${Math.max(1,o.stroke*scale)}px solid ${o.color}`; }
      else if (o.type==='highlight'){ d.style.background='rgba(255,222,0,.4)'; }
      else if (o.type==='whiteout'){ d.style.background='#fff'; d.style.boxShadow='0 0 0 1px rgba(0,0,0,.15)'; }
      else if (o.type==='redact'){ d.style.background='#000'; }
      else if (o.type==='ink'){ const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox',`${o.x} ${o.y} ${o.w} ${o.h}`); svg.setAttribute('preserveAspectRatio','none'); svg.style.cssText='width:100%;height:100%;overflow:visible;pointer-events:none';
        const pl=document.createElementNS('http://www.w3.org/2000/svg','polyline'); pl.setAttribute('points',o.points.map(p=>`${p.x},${p.y}`).join(' ')); pl.setAttribute('fill','none'); pl.setAttribute('stroke',o.color); pl.setAttribute('stroke-width',o.stroke); pl.setAttribute('stroke-linecap','round'); pl.setAttribute('stroke-linejoin','round'); pl.setAttribute('vector-effect','non-scaling-stroke'); pl.style.strokeWidth=(o.stroke*scale)+'px'; svg.append(pl); d.append(svg); }
      const rz = h('div',{class:'rz','aria-hidden':'true'}); d.append(rz);
      d.addEventListener('pointerdown', e=>{ if(tool!=='select' && !(e.target===rz)){ /* let page handler run */ if(tool!=='select') return; } e.stopPropagation(); select(o.id); dragObj(e, o, e.target===rz?'resize':'move'); });
      layer.append(d);
    }
  }
  function local(e){ const r=stage.getBoundingClientRect(); return {x:clamp((e.clientX-r.left)/scale,0,vw), y:clamp((e.clientY-r.top)/scale,0,vh)}; }
  function dragObj(e, o, mode){
    const start=local(e), o0={...o, points:o.points?o.points.map(p=>({...p})):null}; const target=e.target; try{ target.setPointerCapture(e.pointerId); }catch(_){}
    const mv = ev=>{ const p=local(ev); const dx=p.x-start.x, dy=p.y-start.y;
      if (mode==='move'){ o.x=clamp(o0.x+dx,-o.w*.5,vw-o.w*.5); o.y=clamp(o0.y+dy,-o.h*.5,vh-o.h*.5); if(o.points) o.points=o0.points.map(q=>({x:q.x+(o.x-o0.x), y:q.y+(o.y-o0.y)})); }
      else { let nw=Math.max(8,o0.w+dx), nh=Math.max(8,o0.h+dy); if(o.type==='image'||o.type==='sig'||o.type==='text'){ const k=Math.max(nw/o0.w, nh/o0.h); nw=o0.w*k; nh=o0.h*k; if(o.type==='text'){ o.size=Math.max(4,o0.size*k); } }
        if(o.points){ o.points=o0.points.map(q=>({x:o0.x+(q.x-o0.x)*nw/o0.w, y:o0.y+(q.y-o0.y)*nh/o0.h})); } o.w=nw; o.h=nh; }
      renderLive(o); };
    const up = ()=>{ removeEventListener('pointermove',mv); removeEventListener('pointerup',up); removeEventListener('pointercancel',up); renderObjs(); syncProps(); onChange&&onChange(); };
    addEventListener('pointermove',mv); addEventListener('pointerup',up); addEventListener('pointercancel',up);
  }
  let liveRaf=0; function renderLive(){ cancelAnimationFrame(liveRaf); liveRaf=requestAnimationFrame(renderObjs); }
  layer.addEventListener('pointerdown', e=>{
    if (e.target!==layer) return;
    const p = local(e);
    if (tool==='select'){ select(null); return; }
    if (tool==='text'){ const o={id:idSeq++, page:pageN, type:'text', x:p.x, y:p.y, text:props.text||'Type here', size:props.size, color:props.color}; measureText(o); o.y=Math.max(0,o.y-o.h/2); objs.push(o); setTool('select'); select(o.id); onChange&&onChange(); textI.focus(); textI.select(); return; }
    if ((tool==='image'||tool==='sig')){ const im = api.pendingImage; if(!im){ toast(tool==='sig'?'Create your signature first.':'Choose a picture first.'); return; }
      const w = Math.min(vw*.4, im.w), hh = w*im.h/im.w; const o={id:idSeq++, page:pageN, type:tool, x:clamp(p.x-w/2,0,vw-w), y:clamp(p.y-hh/2,0,vh-hh), w, h:hh, url:im.url, bytes:im.bytes}; objs.push(o); setTool('select'); select(o.id); onChange&&onChange(); return; }
    if (tool==='draw'){
      const o={id:idSeq++, page:pageN, type:'ink', points:[p], color:props.color, stroke:props.stroke, x:p.x,y:p.y,w:1,h:1}; objs.push(o);
      try{ layer.setPointerCapture(e.pointerId); }catch(_){}
      const mv=ev=>{ o.points.push(local(ev)); bbox(o); renderLive(o); };
      const up=()=>{ layer.removeEventListener('pointermove',mv); layer.removeEventListener('pointerup',up); layer.removeEventListener('pointercancel',up); if(o.points.length<2){ o.points.push({x:o.points[0].x+.5,y:o.points[0].y+.5}); } bbox(o); renderObjs(); onChange&&onChange(); };
      layer.addEventListener('pointermove',mv); layer.addEventListener('pointerup',up); layer.addEventListener('pointercancel',up); return;
    }
    if (['rect','highlight','whiteout','redact'].includes(tool)){
      const o={id:idSeq++, page:pageN, type:tool, x:p.x, y:p.y, w:1, h:1, color:props.color, stroke:props.stroke}; objs.push(o);
      try{ layer.setPointerCapture(e.pointerId); }catch(_){}
      const mv=ev=>{ const q=local(ev); o.x=Math.min(p.x,q.x); o.y=Math.min(p.y,q.y); o.w=Math.abs(q.x-p.x); o.h=Math.abs(q.y-p.y); renderLive(o); };
      const up=()=>{ layer.removeEventListener('pointermove',mv); layer.removeEventListener('pointerup',up); layer.removeEventListener('pointercancel',up); if(o.w<4||o.h<4){ o.w=Math.max(o.w, tool==='highlight'?120:80); o.h=Math.max(o.h, tool==='highlight'?16:40); } renderObjs(); onChange&&onChange(); };
      layer.addEventListener('pointermove',mv); layer.addEventListener('pointerup',up); layer.addEventListener('pointercancel',up);
    }
  });
  function bbox(o){ const xs=o.points.map(p=>p.x), ys=o.points.map(p=>p.y); o.x=Math.min(...xs); o.y=Math.min(...ys); o.w=Math.max(1,Math.max(...xs)-o.x); o.h=Math.max(1,Math.max(...ys)-o.y); }
  document.addEventListener('keydown', e=>{ if(!el.isConnected) return; if((e.key==='Delete'||e.key==='Backspace') && selId && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){ delB.click(); } });
  let rt; const onResize=()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if(el.isConnected) show(pageN); },200); }; addEventListener('resize',onResize);

  /* stamp everything except black boxes onto a pdf-lib document (same page order as doc) */
  async function apply(pdf){
    const pagesL = pdf.getPages(); const fonts={};
    const font = async()=> fonts.h ||= await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const imgCache = new Map();
    for (const o of objs){
      const page = pagesL[o.page-1]; if(!page) continue;
      if (o.type==='text'){
        if (isLatin(o.text)){ const f=await font(); String(o.text).split('\n').forEach((l,i)=>{ if(l) drawTextV(page, l, o.x+1, o.y+o.size*(0.95+i*1.2), o.size, f, {color:hexToRgb(o.color)}); }); }
        else { const c=textCanvas(o.text,{px:o.size*4,color:o.color,weight:'400',pad:0}); const im=await pdf.embedPng(await canvasBytes(c,'image/png')); drawImageV(page, im, o.x, o.y, o.w, o.h); }
      } else if (o.type==='image'||o.type==='sig'){
        let im = imgCache.get(o.bytes); if(!im){ im = await pdf.embedPng(o.bytes); imgCache.set(o.bytes, im); }
        drawImageV(page, im, o.x, o.y, o.w, o.h);
      } else if (o.type==='rect'){ drawRectV(page, o.x, o.y, o.w, o.h, {borderColor:hexToRgb(o.color), borderWidth:o.stroke}); }
      else if (o.type==='highlight'){ drawRectV(page, o.x, o.y, o.w, o.h, {color:PDFLib.rgb(1,.87,0), opacity:.4, blendMode:PDFLib.BlendMode.Multiply}); }
      else if (o.type==='whiteout'){ drawRectV(page, o.x, o.y, o.w, o.h, {color:PDFLib.rgb(1,1,1)}); }
      else if (o.type==='ink'){ for(let i=1;i<o.points.length;i++) drawLineV(page, o.points[i-1], o.points[i], {thickness:o.stroke, color:hexToRgb(o.color), lineCap:PDFLib.LineCapStyle.Round}); }
    }
  }
  const api = { el, objs, show, apply, setTool, get page(){ return pageN; }, pendingImage, select, renderObjs };
  setTool(defaultTool);
  requestAnimationFrame(()=>show(1));
  return api;
}
/* flatten pages that carry black boxes into pictures, so the hidden content is really gone */
async function redactPdf(doc, srcBytes, boxes, {dpi=150}={}){
  const src = await loadPdfLib(srcBytes); const out = await PDFLib.PDFDocument.create();
  const byPage = {}; boxes.forEach(b=>(byPage[b.page] ||= []).push(b));
  for (let n=1;n<=doc.numPages;n++){
    if (!byPage[n]){ const [p]=await out.copyPages(src,[n-1]); out.addPage(p); continue; }
    const k=dpi/72; const c=await renderPage(doc, n, k); const x=c.getContext('2d'); x.fillStyle='#000';
    byPage[n].forEach(b=>x.fillRect(Math.floor(b.x*k)-1, Math.floor(b.y*k)-1, Math.ceil(b.w*k)+2, Math.ceil(b.h*k)+2));
    const im = await out.embedJpg(await canvasBytes(c,'image/jpeg',.9));
    const w=c.width/k, hh=c.height/k; out.addPage([w,hh]).drawImage(im,{x:0,y:0,width:w,height:hh});
  }
  return out.save();
}

/* ================= Signature maker ================= */
function SignatureMaker(onReady){
  let mode='draw', color='#1b2236';
  const pad = h('canvas',{class:'sigpad'});
  const typed = h('div',{class:'sigtyped'});
  const nameI = h('input',{class:'inp',placeholder:'Your name',value:'',maxlength:60,'aria-label':'Your name'});
  const fonts = [['Dancing Script','Dancing Script'],['Great Vibes','Great Vibes'],['Caveat','Caveat']];
  let fontF = fonts[0][0];
  const fontSeg = segmented(fonts, fontF, v=>{ fontF=v; paintTyped(); });
  const colorSeg = segmented([['#1b2236','Black'],['#1d3fb8','Blue'],['#b3261e','Red']], color, v=>{ color=v; paintTyped(); repaintPad(); });
  const clearB = h('button',{class:'btn sm',type:'button'},'Clear');
  const upMsg = h('p',{class:'hint'},'Use a photo of your signature on plain white paper.');
  let upCanvas = null;
  const up = filePicker({label:'Choose picture', accept:'image/*', onFiles: async([f])=>{ try{ upCanvas = await fileToCanvas(f, 1200); upMsg.textContent='Picture ready. The white background will be removed.'; }catch(e){ upMsg.textContent=e.message; } }});
  const drawBox = h('div',{class:'col'}, pad, h('div',{class:'row'}, clearB, h('span',{class:'hint'},'Sign with your finger or mouse.')));
  const typeBox = h('div',{class:'col',hidden:true}, nameI, fontSeg, typed);
  const upBox = h('div',{class:'col',hidden:true}, h('div',{class:'row'},up), upMsg);
  const modeSeg = segmented([['draw','Draw'],['type','Type'],['upload','Upload']], mode, v=>{ mode=v; drawBox.hidden=v!=='draw'; typeBox.hidden=v!=='type'; upBox.hidden=v!=='upload'; if(v==='draw') sizePad(); });
  const useB = h('button',{class:'btn primary',type:'button'},'Use this signature');
  const el = h('div',{class:'col'}, modeSeg, drawBox, typeBox, upBox, h('div',{class:'row'}, h('span',{class:'hint'},'Colour'), colorSeg), h('div',{class:'row'},useB));
  let strokes=[], cur=null;
  function sizePad(){ const r=pad.getBoundingClientRect(); if(!r.width) return; const d=Math.min(devicePixelRatio||1,2); pad.width=r.width*d; pad.height=r.height*d; repaintPad(); }
  function repaintPad(){ const x=pad.getContext('2d'); const d=pad.width/(pad.getBoundingClientRect().width||1); x.clearRect(0,0,pad.width,pad.height); x.lineCap='round'; x.lineJoin='round'; x.strokeStyle=color; x.lineWidth=3*d;
    for(const s of strokes){ x.beginPath(); s.forEach((p,i)=>i?x.lineTo(p.x*d,p.y*d):x.moveTo(p.x*d,p.y*d)); x.stroke(); } }
  pad.addEventListener('pointerdown',e=>{ e.preventDefault(); try{ pad.setPointerCapture(e.pointerId); }catch(_){} const r=pad.getBoundingClientRect(); cur=[{x:e.clientX-r.left,y:e.clientY-r.top}]; strokes.push(cur); });
  pad.addEventListener('pointermove',e=>{ if(!cur) return; const r=pad.getBoundingClientRect(); cur.push({x:e.clientX-r.left,y:e.clientY-r.top}); repaintPad(); });
  const end=()=>{ cur=null; }; pad.addEventListener('pointerup',end); pad.addEventListener('pointercancel',end);
  clearB.onclick=()=>{ strokes=[]; repaintPad(); };
  function paintTyped(){ typed.textContent = nameI.value || 'Your name'; typed.style.fontFamily=`"${fontF}", cursive`; typed.style.color=color; }
  nameI.oninput=paintTyped; paintTyped();
  function trim(c){ const x=c.getContext('2d'), d=x.getImageData(0,0,c.width,c.height).data; let x0=c.width,y0=c.height,x1=-1,y1=-1;
    for(let y=0;y<c.height;y++) for(let X=0;X<c.width;X++){ if(d[(y*c.width+X)*4+3]>10){ if(X<x0)x0=X; if(X>x1)x1=X; if(y<y0)y0=y; if(y>y1)y1=y; } }
    if(x1<0) return null; const p=6; const o=document.createElement('canvas'); o.width=x1-x0+1+p*2; o.height=y1-y0+1+p*2; o.getContext('2d').drawImage(c,x0-p,y0-p,o.width,o.height,0,0,o.width,o.height); return o; }
  useB.onclick = async()=>{
    let c;
    if (mode==='draw'){ if(!strokes.length){ toast('Sign in the box first.'); return; } c = trim(pad); }
    else if (mode==='type'){ if(!nameI.value.trim()){ toast('Type your name first.'); return; } try{ await document.fonts.load(`64px "${fontF}"`); }catch(e){} c = trim(textCanvas(nameI.value.trim(),{px:120,color,weight:'400',family:`"${fontF}", cursive`,pad:20})); }
    else { if(!upCanvas){ toast('Choose a picture of your signature first.'); return; }
      const o=document.createElement('canvas'); o.width=upCanvas.width; o.height=upCanvas.height; const x=o.getContext('2d'); x.drawImage(upCanvas,0,0); const im=x.getImageData(0,0,o.width,o.height), d=im.data;
      for(let i=0;i<d.length;i+=4){ const l=.299*d[i]+.587*d[i+1]+.114*d[i+2]; const a = clamp((200-l)*255/90,0,255); d[i+3]=a; } x.putImageData(im,0,0); c=trim(o); }
    if (!c){ toast('Nothing to use yet.'); return; }
    const bytes = await canvasBytes(c,'image/png'); onReady({bytes, url:URL.createObjectURL(new Blob([bytes],{type:'image/png'})), w:c.width/4, h:c.height/4});
  };
  requestAnimationFrame(sizePad); addEventListener('resize',()=>{ if(el.isConnected && mode==='draw') sizePad(); });
  return el;
}

/* ================= Crop box ================= */
function CropBox(doc){
  let pageN=1, scale=1, vw=0, vh=0; const r={x:0.06,y:0.06,w:0.88,h:0.88}; // fractions of the visible page
  const cv=h('canvas',{class:'main'}); const box=h('div',{style:'position:absolute;border:2px solid #4d6bff;box-shadow:0 0 0 9999px rgba(8,12,30,.45);touch-action:none;cursor:move'});
  const hd=[0,1,2,3].map(i=>h('div',{class:'hdl','aria-label':['Top-left','Top-right','Bottom-right','Bottom-left'][i]+' corner'}));
  const stage=h('div',{class:'scanstage',style:'overflow:hidden'},cv,box,...hd); const wrap=h('div',{class:'stagewrap'},stage);
  const info=h('p',{class:'hint'});
  const prevB=h('button',{class:'btn icon sm',type:'button','aria-label':'Previous page'},'‹'), nextB=h('button',{class:'btn icon sm',type:'button','aria-label':'Next page'},'›'), lbl=h('span',{class:'pager'});
  const el=h('div',{class:'col'}, h('div',{class:'row'},prevB,lbl,nextB), wrap, info);
  prevB.onclick=()=>show(pageN-1); nextB.onclick=()=>show(pageN+1);
  function paint(){ const X=r.x*vw*scale, Y=r.y*vh*scale, W=r.w*vw*scale, H=r.h*vh*scale; Object.assign(box.style,{left:X+'px',top:Y+'px',width:W+'px',height:H+'px'});
    [[X,Y],[X+W,Y],[X+W,Y+H],[X,Y+H]].forEach(([a,b],i)=>{ hd[i].style.left=a+'px'; hd[i].style.top=b+'px'; });
    const mm=v=>Math.round(v*25.4/72); info.textContent=`Keeps ${mm(r.w*vw)} × ${mm(r.h*vh)} mm of a ${mm(vw)} × ${mm(vh)} mm page.`; }
  async function show(n){ n=clamp(n,1,doc.numPages); pageN=n; lbl.textContent=`Page ${n} / ${doc.numPages}`; prevB.disabled=n<=1; nextB.disabled=n>=doc.numPages;
    const v=(await doc.getPage(n)).getViewport({scale:1}); vw=v.width; vh=v.height; scale=Math.min(Math.max(240,(wrap.clientWidth||340)-28)/vw, 520/vh);
    const c=await renderPage(doc,n,scale*Math.min(devicePixelRatio||1,2)); cv.width=c.width; cv.height=c.height; cv.getContext('2d').drawImage(c,0,0); cv.style.width=vw*scale+'px'; cv.style.height=vh*scale+'px'; stage.style.width=vw*scale+'px'; stage.style.height=vh*scale+'px'; paint(); }
  function drag(e, fn){ e.preventDefault(); e.stopPropagation(); const t=e.target; try{ t.setPointerCapture(e.pointerId); }catch(_){} const s={x:e.clientX,y:e.clientY}, r0={...r};
    const mv=ev=>{ fn((ev.clientX-s.x)/(vw*scale), (ev.clientY-s.y)/(vh*scale), r0); paint(); }; const up=()=>{ t.removeEventListener('pointermove',mv); t.removeEventListener('pointerup',up); t.removeEventListener('pointercancel',up); };
    t.addEventListener('pointermove',mv); t.addEventListener('pointerup',up); t.addEventListener('pointercancel',up); }
  box.addEventListener('pointerdown',e=>drag(e,(dx,dy,r0)=>{ r.x=clamp(r0.x+dx,0,1-r.w); r.y=clamp(r0.y+dy,0,1-r.h); }));
  hd.forEach((d,i)=>d.addEventListener('pointerdown',e=>drag(e,(dx,dy,r0)=>{ const min=.05;
    let x0=r0.x, y0=r0.y, x1=r0.x+r0.w, y1=r0.y+r0.h;
    if(i===0||i===3) x0=clamp(r0.x+dx,0,x1-min); else x1=clamp(x1+dx,x0+min,1);
    if(i===0||i===1) y0=clamp(r0.y+dy,0,y1-min); else y1=clamp(y1+dy,y0+min,1);
    Object.assign(r,{x:x0,y:y0,w:x1-x0,h:y1-y0}); })));
  requestAnimationFrame(()=>show(1));
  addEventListener('resize',()=>{ if(el.isConnected) show(pageN); });
  return {el, rect:r, get page(){ return pageN; }, setRect(v){ Object.assign(r,v); paint(); }};
}
function applyCrop(page, fr){
  const g = pageGeom(page);
  const a = v2p(g, fr.x*g.vw, fr.y*g.vh), b = v2p(g, (fr.x+fr.w)*g.vw, (fr.y+fr.h)*g.vh);
  const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y), w=Math.abs(a.x-b.x), hh=Math.abs(a.y-b.y);
  page.setCropBox(x,y,w,hh); page.setMediaBox(x,y,w,hh); try{ page.setTrimBox(x,y,w,hh); page.setBleedBox(x,y,w,hh); page.setArtBox(x,y,w,hh); }catch(e){}
}

/* ================= Document scanner ================= */
function Scanner(onAdd){
  let queue=[], src=null, quad=null, warped=null, filt='enhanced', disp=1, dragI=-1;
  const pickRow = h('div',{class:'row'},
    filePicker({label:'Take or choose photo', accept:'image/*', multiple:true, primary:true, icon:ICON_CAMERA, onFiles:fs=>{ queue.push(...fs); upQ(); if(!src) next(); }}),
    filePicker({label:'Camera only', accept:'image/*', capture:'environment', onFiles:fs=>{ queue.push(...fs); upQ(); if(!src) next(); }}));
  const pick = h('div',{class:'col'}, h('p',{class:'hint'},'Put the page on a darker surface with good light and photograph it from straight above. Pick “Camera” in the menu that opens to take a new photo.'), pickRow);
  const cv = h('canvas',{class:'main'}); const hd=[0,1,2,3].map(i=>h('div',{class:'hdl',tabindex:0,'aria-label':['Top-left','Top-right','Bottom-right','Bottom-left'][i]+' corner'}));
  const loupe = h('canvas',{class:'loupe',width:220,height:220,hidden:true});
  const stage = h('div',{class:'scanstage'}, cv, ...hd, loupe); const wrap=h('div',{class:'stagewrap'},stage);
  const B=(t,fn,cls='btn')=>h('button',{class:cls,type:'button',onclick:fn},t);
  const edit = h('div',{class:'col',hidden:true}, h('p',{class:'hint'},'Drag the four corners onto the corners of the page.'), wrap,
    h('div',{class:'row'}, B('Find edges',()=>{ quad=detectQuad(src); paint(); }), B('Whole photo',()=>{ quad=inset(src.width,src.height,0); paint(); }), B('↻',()=>rotate(),'btn icon'), h('div',{class:'spacer'}), B('Discard',()=>next()), B('Crop',()=>crop(),'btn primary')));
  const fixCv = h('canvas'); const filtSeg = segmented([['enhanced','Clean colour'],['gray','Grey'],['bw','Black & white'],['original','Original']], filt, v=>{ filt=v; setTimeout(showFix,10); });
  const fix = h('div',{class:'col',hidden:true}, h('div',{class:'fixwrap'},fixCv), filtSeg, h('div',{class:'row'}, B('Back to corners',()=>{ stageShow('edit'); drawStage(); }), h('div',{class:'spacer'}), B('Add page',()=>add(),'btn primary')));
  const qMsg = h('p',{class:'hint'});
  const el = h('div',{class:'col'}, pick, edit, fix, qMsg);
  function stageShow(w){ pick.hidden=w!=='pick'; edit.hidden=w!=='edit'; fix.hidden=w!=='fix'; }
  function upQ(){ qMsg.textContent = queue.length ? `${queue.length} more photo${queue.length>1?'s':''} waiting.` : ''; }
  async function next(){ const f=queue.shift(); upQ(); if(!f){ src=null; warped=null; stageShow('pick'); return; }
    try{ src = await fileToCanvas(f, 3000); }catch(e){ toast(`“${f.name}” isn’t a photo this browser can read.`); return next(); }
    quad = detectQuad(src); stageShow('edit'); drawStage(); }
  function inset(W,H,m){ return [{x:W*m,y:H*m},{x:W*(1-m),y:H*m},{x:W*(1-m),y:H*(1-m)},{x:W*m,y:H*(1-m)}]; }
  function order(p){ const s=p.map(q=>q.x+q.y), d=p.map(q=>q.x-q.y); const pk=(a,f)=>p[a.indexOf(f(...a))]; return [pk(s,Math.min),pk(d,Math.max),pk(s,Math.max),pk(d,Math.min)].map(q=>({x:q.x,y:q.y})); }
  function detectQuad(c){
    const W=c.width,H=c.height;
    try{
      const s=Math.min(1,320/Math.max(W,H)), w=Math.max(8,Math.round(W*s)), hh=Math.max(8,Math.round(H*s));
      const t=document.createElement('canvas'); t.width=w; t.height=hh; const tx=t.getContext('2d'); tx.drawImage(c,0,0,w,hh);
      const d=tx.getImageData(0,0,w,hh).data, N=w*hh; let g=new Float32Array(N); for(let i=0;i<N;i++) g[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];
      for(let pass=0;pass<2;pass++){ const o=new Float32Array(N); for(let y=0;y<hh;y++) for(let x=0;x<w;x++){ let sm=0,n=0; for(let dy=-2;dy<=2;dy++){ const yy=y+dy; if(yy<0||yy>=hh) continue; for(let dx=-2;dx<=2;dx++){ const xx=x+dx; if(xx<0||xx>=w) continue; sm+=g[yy*w+xx]; n++; } } o[y*w+x]=sm/n; } g=o; }
      const hist=new Array(256).fill(0); for(let i=0;i<N;i++) hist[g[i]|0]++; let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i];
      let sB=0,wB=0,best=0,th=128; for(let i=0;i<256;i++){ wB+=hist[i]; if(!wB) continue; const wF=N-wB; if(!wF) break; sB+=i*hist[i]; const mB=sB/wB, mF=(sum-sB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>best){best=v;th=i;} }
      const tryPol=bright=>{ const lab=new Int32Array(N).fill(-1); let bestC=null; const st=new Int32Array(N);
        for(let i=0;i<N;i++){ if(lab[i]!==-1) continue; if(!(bright?g[i]>th:g[i]<=th)){ lab[i]=-2; continue; }
          let sp=0; st[sp++]=i; lab[i]=i; let area=0, tl=[1e9,0,0], tr=[-1e9,0,0], br=[-1e9,0,0], bl=[1e9,0,0];
          while(sp){ const p=st[--sp]; area++; const x=p%w, y=(p/w)|0; if(x+y<tl[0]) tl=[x+y,x,y]; if(x+y>br[0]) br=[x+y,x,y]; if(x-y>tr[0]) tr=[x-y,x,y]; if(x-y<bl[0]) bl=[x-y,x,y];
            for(const q of [x>0?p-1:-1, x<w-1?p+1:-1, y>0?p-w:-1, y<hh-1?p+w:-1]){ if(q<0||lab[q]!==-1) continue; if(bright?g[q]>th:g[q]<=th){ lab[q]=i; st[sp++]=q; } } }
          if(!bestC||area>bestC.area) bestC={area,pts:[tl,tr,br,bl].map(a=>({x:a[1],y:a[2]}))}; }
        return bestC; };
      const pa=q=>Math.abs(q.reduce((a,p,i)=>{const n=q[(i+1)%4]; return a+p.x*n.y-n.x*p.y;},0))/2;
      for(const pol of [true,false]){ const cC=tryPol(pol); if(!cC) continue; const fr=cC.area/N, qa=pa(cC.pts)/N; if(fr>.12&&fr<.97&&qa>.12&&qa<.985) return order(cC.pts.map(p=>({x:clamp((p.x+.5)/s,0,W),y:clamp((p.y+.5)/s,0,H)}))); }
    }catch(e){}
    return inset(W,H,.06);
  }
  function drawStage(){ if(!src) return; const avail=Math.max(200,(wrap.clientWidth||340)-28), maxH=Math.max(260,innerHeight*.55); disp=Math.min(avail/src.width, maxH/src.height);
    const cw=Math.round(src.width*disp), ch=Math.round(src.height*disp), dpr=Math.min(devicePixelRatio||1,2); stage.style.width=cw+'px'; stage.style.height=ch+'px'; cv.width=cw*dpr; cv.height=ch*dpr; cv.style.width=cw+'px'; cv.style.height=ch+'px'; paint(); }
  function paint(){ const x=cv.getContext('2d'), k=cv.width/src.width; x.setTransform(1,0,0,1,0,0); x.drawImage(src,0,0,cv.width,cv.height); x.setTransform(k,0,0,k,0,0);
    x.beginPath(); x.rect(0,0,src.width,src.height); x.moveTo(quad[0].x,quad[0].y); for(let i=1;i<4;i++) x.lineTo(quad[i].x,quad[i].y); x.closePath(); x.fillStyle='rgba(8,12,30,.5)'; x.fill('evenodd');
    x.beginPath(); x.moveTo(quad[0].x,quad[0].y); for(let i=1;i<4;i++) x.lineTo(quad[i].x,quad[i].y); x.closePath(); x.lineWidth=2.5/disp; x.strokeStyle='#4d6bff'; x.stroke();
    hd.forEach((d,i)=>{ d.style.left=quad[i].x*disp+'px'; d.style.top=quad[i].y*disp+'px'; }); }
  function showLoupe(i){ const p=quad[i], lx=loupe.getContext('2d'), S=110/(disp*2.5); loupe.hidden=false; const left=p.x*disp<parseFloat(stage.style.width)/2; loupe.style.left=left?'':'8px'; loupe.style.right=left?'8px':'';
    lx.fillStyle='#222'; lx.fillRect(0,0,220,220); lx.drawImage(src,p.x-S/2,p.y-S/2,S,S,0,0,220,220); const k=220/S;
    lx.beginPath(); lx.moveTo((quad[(i+3)%4].x-p.x)*k+110,(quad[(i+3)%4].y-p.y)*k+110); lx.lineTo(110,110); lx.lineTo((quad[(i+1)%4].x-p.x)*k+110,(quad[(i+1)%4].y-p.y)*k+110); lx.strokeStyle='#4d6bff'; lx.lineWidth=3; lx.stroke();
    lx.strokeStyle='#fff'; lx.lineWidth=2; lx.beginPath(); lx.moveTo(110,92); lx.lineTo(110,128); lx.moveTo(92,110); lx.lineTo(128,110); lx.stroke(); }
  hd.forEach((d,i)=>{
    d.addEventListener('pointerdown',e=>{ e.preventDefault(); try{ d.setPointerCapture(e.pointerId); }catch(_){} dragI=i; showLoupe(i); });
    d.addEventListener('pointermove',e=>{ if(dragI!==i) return; const r=stage.getBoundingClientRect(); quad[i]={x:clamp((e.clientX-r.left)/disp,0,src.width),y:clamp((e.clientY-r.top)/disp,0,src.height)}; paint(); showLoupe(i); });
    const end=()=>{ if(dragI===i){ dragI=-1; loupe.hidden=true; } }; d.addEventListener('pointerup',end); d.addEventListener('pointercancel',end);
    d.addEventListener('keydown',e=>{ const st=e.shiftKey?10:2; const m={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key]; if(!m) return; e.preventDefault(); quad[i]={x:clamp(quad[i].x+m[0]/disp,0,src.width),y:clamp(quad[i].y+m[1]/disp,0,src.height)}; paint(); });
  });
  function rotate(){ const c=document.createElement('canvas'); c.width=src.height; c.height=src.width; const x=c.getContext('2d'); x.translate(c.width,0); x.rotate(Math.PI/2); x.drawImage(src,0,0); const H=src.height; quad=order(quad.map(p=>({x:H-p.y,y:p.x}))); src=c; drawStage(); }
  function solve(A,b){ const n=b.length; for(let i=0;i<n;i++){ let mx=i; for(let r=i+1;r<n;r++) if(Math.abs(A[r][i])>Math.abs(A[mx][i])) mx=r; [A[i],A[mx]]=[A[mx],A[i]]; [b[i],b[mx]]=[b[mx],b[i]]; for(let r=i+1;r<n;r++){ const f=A[r][i]/A[i][i]; for(let c=i;c<n;c++) A[r][c]-=f*A[i][c]; b[r]-=f*b[i]; } }
    const x=new Array(n); for(let i=n-1;i>=0;i--){ let s=b[i]; for(let c=i+1;c<n;c++) s-=A[i][c]*x[c]; x[i]=s/A[i][i]; } return x; }
  function warp(c,q){ const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y); let W=Math.max(dist(q[0],q[1]),dist(q[3],q[2])), H=Math.max(dist(q[0],q[3]),dist(q[1],q[2])); const k=Math.min(1,2400/Math.max(W,H)); W=Math.max(1,Math.round(W*k)); H=Math.max(1,Math.round(H*k));
    const dst=[[0,0],[W,0],[W,H],[0,H]], A=[], b=[]; for(let i=0;i<4;i++){ const [X,Y]=dst[i], x=q[i].x, y=q[i].y; A.push([X,Y,1,0,0,0,-x*X,-x*Y]); b.push(x); A.push([0,0,0,X,Y,1,-y*X,-y*Y]); b.push(y); }
    const hm=solve(A,b), sw=c.width, sh=c.height, sd=c.getContext('2d').getImageData(0,0,sw,sh).data, out=new ImageData(W,H), od=out.data;
    for(let Y=0;Y<H;Y++){ const yy=Y+.5; for(let X=0;X<W;X++){ const xx=X+.5, den=hm[6]*xx+hm[7]*yy+1; let sx=(hm[0]*xx+hm[1]*yy+hm[2])/den-.5, sy=(hm[3]*xx+hm[4]*yy+hm[5])/den-.5; sx=sx<0?0:sx>sw-1.001?sw-1.001:sx; sy=sy<0?0:sy>sh-1.001?sh-1.001:sy;
      const x0=sx|0,y0=sy|0,fx=sx-x0,fy=sy-y0,i00=(y0*sw+x0)*4,i10=i00+4,i01=i00+sw*4,i11=i01+4,o=(Y*W+X)*4; for(let ch=0;ch<3;ch++){ const a=sd[i00+ch]+(sd[i10+ch]-sd[i00+ch])*fx, bb=sd[i01+ch]+(sd[i11+ch]-sd[i01+ch])*fx; od[o+ch]=a+(bb-a)*fy; } od[o+3]=255; } }
    const r=document.createElement('canvas'); r.width=W; r.height=H; r.getContext('2d').putImageData(out,0,0); return r; }
  function filter(c,mode){ const W=c.width,H=c.height, o=document.createElement('canvas'); o.width=W; o.height=H; const x=o.getContext('2d'); x.drawImage(c,0,0); if(mode==='original') return o;
    const img=x.getImageData(0,0,W,H), d=img.data, f=4, sw=Math.ceil(W/f), sh=Math.ceil(H/f); let s=new Float32Array(sw*sh);
    for(let y=0;y<H;y++) for(let X=0;X<W;X++){ const i=(y*W+X)*4, l=.299*d[i]+.587*d[i+1]+.114*d[i+2], j=((y/f)|0)*sw+((X/f)|0); if(l>s[j]) s[j]=l; }
    const pass=(arr,r,mx)=>{ const o1=new Float32Array(arr.length); for(let y=0;y<sh;y++) for(let X=0;X<sw;X++){ let v=0,n=0; for(let k=-r;k<=r;k++){ const xx=X+k; if(xx<0||xx>=sw) continue; const a=arr[y*sw+xx]; if(mx){ if(a>v) v=a; } else { v+=a; n++; } } o1[y*sw+X]=mx?v:v/n; }
      const o2=new Float32Array(arr.length); for(let y=0;y<sh;y++) for(let X=0;X<sw;X++){ let v=0,n=0; for(let k=-r;k<=r;k++){ const yy=y+k; if(yy<0||yy>=sh) continue; const a=o1[yy*sw+X]; if(mx){ if(a>v) v=a; } else { v+=a; n++; } } o2[y*sw+X]=mx?v:v/n; } return o2; };
    s=pass(s,3,true); const r=Math.max(3,Math.round(Math.max(sw,sh)/40)); s=pass(s,r,false); s=pass(s,r,false);
    for(let y=0;y<H;y++){ const row=((y/f)|0)*sw; for(let X=0;X<W;X++){ const i=(y*W+X)*4, bg=Math.max(s[row+((X/f)|0)],40), r0=d[i],g0=d[i+1],b0=d[i+2], l=.299*r0+.587*g0+.114*b0;
      if(mode==='enhanced'){ const k=248/bg; d[i]=clamp((r0*k-22)*1.1,0,255); d[i+1]=clamp((g0*k-22)*1.1,0,255); d[i+2]=clamp((b0*k-22)*1.1,0,255); }
      else { const n=l*255/bg; const v=mode==='gray'?clamp((n-35)*1.18,0,255):clamp((n-150)*255/72,0,255); d[i]=d[i+1]=d[i+2]=v; } } }
    x.putImageData(img,0,0); return o; }
  function showFix(){ const o=filter(warped,filt); fixCv.width=o.width; fixCv.height=o.height; fixCv.getContext('2d').drawImage(o,0,0); }
  function crop(){ toast('Straightening…',1200); setTimeout(()=>{ try{ warped=warp(src,quad); stageShow('fix'); showFix(); }catch(e){ toast('That shape couldn’t be straightened. Check the corners.'); } },30); }
  async function add(){ const blob=await canvasBlob(fixCv,'image/jpeg',.88); onAdd({url:URL.createObjectURL(blob), jpeg:new Uint8Array(await blob.arrayBuffer()), w:fixCv.width, h:fixCv.height}); toast('Page added'); next(); }
  addEventListener('resize',()=>{ if(el.isConnected && src && !edit.hidden) drawStage(); });
  return el;
}

/* ================= Ordered file list (merge, photos) ================= */
function FileList({empty, thumb, meta, onChange}){
  const items=[]; const ul=h('ul',{class:'list'});
  function paint(){ ul.innerHTML=''; if(!items.length){ ul.append(h('li',{class:'empty'},empty)); return; }
    items.forEach((it,i)=>{ const th=h('span',{class:'th'}); const t=thumb(it); if(t&&t.startsWith('url(')) th.style.backgroundImage=t; else th.textContent=t||'';
      const B=(l,a,fn,dis)=>h('button',{class:'btn icon sm',type:'button','aria-label':a,disabled:dis||null,onclick:fn},l);
      ul.append(h('li',{class:'item'}, h('span',{class:'ord'},i+1), th, h('span',{class:'meta'},h('b',null,it.name),h('small',null,meta(it))),
        B('↑','Move up',()=>{ [items[i-1],items[i]]=[items[i],items[i-1]]; paint(); onChange&&onChange(); }, i===0),
        B('↓','Move down',()=>{ [items[i+1],items[i]]=[items[i],items[i+1]]; paint(); onChange&&onChange(); }, i===items.length-1),
        B('✕','Remove',()=>{ items.splice(i,1); paint(); onChange&&onChange(); }))); }); }
  paint();
  return {el:ul, items, add(...xs){ items.push(...xs); paint(); onChange&&onChange(); }, paint};
}
