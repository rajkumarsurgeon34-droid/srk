/* SRK — shared helpers */
'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v==null || v===false) continue;
    if (k==='class') el.className = v;
    else if (k==='style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k==='html') el.innerHTML = v;
    else if (v===true) el.setAttribute(k,'');
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c!=null && c!==false) el.append(c.nodeType ? c : String(c));
  return el;
}
let _toastT;
function toast(msg, ms=2800){ const s=$('#status'); s.textContent=msg; s.hidden=false; clearTimeout(_toastT); _toastT=setTimeout(()=>s.hidden=true, ms); }
const fmtBytes = n => n<1024 ? n+' B' : n<1048576 ? (n/1024).toFixed(0)+' KB' : (n/1048576).toFixed(1)+' MB';
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const tick = () => new Promise(r=>setTimeout(r,0));
function stamp(){ return new Date().toISOString().slice(0,10); }
function baseName(n){ return String(n||'document').replace(/\.[^.]+$/,''); }
function cleanName(n, ext='.pdf'){ n=String(n||'document').trim().replace(/[\\/:*?"<>|]+/g,'-').slice(0,120)||'document'; if(!n.toLowerCase().endsWith(ext)) n+=ext; return n; }
const SIZES = { a4:[595.28,841.89], letter:[612,792], legal:[612,1008] };
const MIME = { pdf:'application/pdf', jpg:'image/jpeg', png:'image/png', zip:'application/zip', txt:'text/plain', md:'text/markdown',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', html:'text/html' };
const extOf = n => (String(n).match(/\.([a-z0-9]+)$/i)||[])[1]?.toLowerCase() || '';
function pages(n){ return `${n} page${n===1?'':'s'}`; }

/* ---------- lazy libraries ---------- */
const LIBS = window.SRK_LIBS || {
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  pptx: 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js',
};
const _scripts = {};
function loadScript(key){
  const url = LIBS[key]||key;
  if (!_scripts[url]) _scripts[url] = new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=url; s.onload=res; s.onerror=()=>{ delete _scripts[url]; rej(new Error('A needed part of the app could not load. Check your internet connection and try again.')); }; document.head.appendChild(s); });
  return _scripts[url];
}

/* ---------- PDF loading ---------- */
async function loadPdfJs(bytes, password){
  if (!window.pdfjsLib) throw new Error('The PDF engine could not load. Check your connection and reload.');
  const task = pdfjsLib.getDocument({data: bytes.slice(0), password: password||undefined, isEvalSupported:false});
  return task.promise;
}
async function loadPdfLib(bytes, opts={}){
  return PDFLib.PDFDocument.load(bytes, {ignoreEncryption:true, throwOnInvalidObject:false, updateMetadata:false, ...opts});
}
function isEncrypted(bytes){
  // cheap check of the trailer area for /Encrypt
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length-4096)));
  if (/\/Encrypt\s/.test(tail)) return true;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)));
  return /\/Encrypt\s*\d+\s+\d+\s+R/.test(head);
}
function pwError(e){ return e && (e.name==='PasswordException' || /password/i.test(e.message||'')); }

/* The document open in Read is the default input for every tool */
const STATE = { cur: null }; // {bytes, name, doc}
function setCurrent(c){ STATE.cur = c; document.dispatchEvent(new CustomEvent('pd:doc')); }

async function readFile(f){ return new Uint8Array(await f.arrayBuffer()); }

/* ---------- file pickers: the tap lands on the real input ---------- */
function filePicker({label, accept, multiple=false, primary=false, small=false, capture=null, onFiles, icon=null}){
  const inp = h('input', {type:'file', class:'fileover', accept, multiple: multiple||null, capture, 'aria-label':label});
  const lbl = h('span', {class:'lbl'}, label);
  const el = h('span', {class:`btn filepick${primary?' primary':''}${small?' sm':''}`}, icon? h('span',{html:icon,style:'display:inline-flex'}):null, lbl, inp);
  inp.addEventListener('change', async ()=>{ const files=[...inp.files]; inp.value=''; if(files.length) await onFiles(files); });
  el.setLabel = t => lbl.textContent = t;
  return el;
}
const ICON_FOLDER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
const ICON_CAMERA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/></svg>';

/* A "which PDF" box. Defaults to the PDF open in Read; the person can pick another. */
function pdfSource({allowLocked=false, onChange}={}){
  let mine = null;
  const t = h('span',{class:'t'});
  const pick = filePicker({label:'Choose PDF', accept:'application/pdf,.pdf', small:false, onFiles: async ([f])=>{
    const bytes = await readFile(f);
    try { const doc = await loadPdfJs(bytes); mine = {bytes, name:f.name, doc}; }
    catch(e){
      if (pwError(e) && allowLocked){ mine = {bytes, name:f.name, doc:null, locked:true}; }
      else if (pwError(e)) { toast('This PDF is password-protected. Use Unlock PDF first.'); return; }
      else { toast(`“${f.name}” couldn’t be opened as a PDF.`); return; }
    }
    paint(); onChange && onChange(get());
  }});
  const el = h('div',{class:'srcinfo'}, t, pick);
  function get(){ return mine || STATE.cur; }
  function paint(){
    const c = get(); t.innerHTML='';
    if (!c){ t.textContent='No PDF chosen yet.'; pick.setLabel('Choose PDF'); return; }
    t.append(h('b',null,c.name), c.locked ? ' · password-protected' : ` · ${pages(c.doc.numPages)} · ${fmtBytes(c.bytes.length)}`);
    pick.setLabel('Choose another PDF');
  }
  const onDoc = ()=>{ if(!mine){ paint(); onChange && onChange(get()); } };
  document.addEventListener('pd:doc', onDoc);
  el._cleanup = ()=>document.removeEventListener('pd:doc', onDoc);
  paint();
  return {el, get, need(){ const c=get(); if(!c) throw new Error('Choose a PDF first.'); return c; }};
}

/* ---------- rendering ---------- */
async function renderPage(doc, n, scale=1, {bg='#fff'}={}){
  const page = await doc.getPage(n);
  const vp = page.getViewport({scale});
  const c = document.createElement('canvas'); c.width = Math.max(1,Math.floor(vp.width)); c.height = Math.max(1,Math.floor(vp.height));
  const x = c.getContext('2d'); x.fillStyle=bg; x.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:x, viewport:vp}).promise;
  return c;
}
function canvasBlob(c, type='image/jpeg', q=.85){ return new Promise(r=>c.toBlob(r, type, q)); }
async function canvasBytes(c, type='image/jpeg', q=.85){ return new Uint8Array(await (await canvasBlob(c,type,q)).arrayBuffer()); }
function loadImg(url){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('That image couldn’t be read.')); im.src=url; }); }
async function fileToCanvas(file, max=2400){
  const url = URL.createObjectURL(file);
  try{ const im = await loadImg(url); const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
    const c=document.createElement('canvas'); c.width=Math.round(im.naturalWidth*k); c.height=Math.round(im.naturalHeight*k);
    const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(im,0,0,c.width,c.height); return c; }
  finally{ URL.revokeObjectURL(url); }
}

/* ---------- page geometry: draw "as the reader sees it", whatever the page rotation ---------- */
function pageGeom(page){
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const cb = page.getCropBox ? page.getCropBox() : {x:0,y:0,...page.getSize()};
  const w = cb.width, hgt = cb.height;
  const vw = (rot===90||rot===270) ? hgt : w, vh = (rot===90||rot===270) ? w : hgt;
  return {rot, cx:cb.x, cy:cb.y, w, h:hgt, vw, vh};
}
function v2p(g, vx, vy){
  switch(g.rot){
    case 90:  return {x:g.cx+vy,       y:g.cy+vx};
    case 180: return {x:g.cx+g.w-vx,   y:g.cy+vy};
    case 270: return {x:g.cx+g.w-vy,   y:g.cy+g.h-vx};
    default:  return {x:g.cx+vx,       y:g.cy+g.h-vy};
  }
}
/* place a box given in visual top-left coordinates */
function boxAnchor(g, vx, vy, vw, vh){ const p=v2p(g, vx, vy+vh); return {x:p.x, y:p.y, rotate:PDFLib.degrees(g.rot)}; }
function drawImageV(page, img, vx, vy, vw, vh, extra={}){ const g=pageGeom(page); page.drawImage(img, {...boxAnchor(g,vx,vy,vw,vh), width:vw, height:vh, ...extra}); }
function drawRectV(page, vx, vy, vw, vh, extra={}){ const g=pageGeom(page); page.drawRectangle({...boxAnchor(g,vx,vy,vw,vh), width:vw, height:vh, ...extra}); }
function drawTextV(page, text, vx, vyBaseline, size, font, extra={}){ const g=pageGeom(page); const p=v2p(g, vx, vyBaseline); page.drawText(text, {x:p.x, y:p.y, size, font, rotate:PDFLib.degrees(g.rot), ...extra}); }
function drawLineV(page, a, b, extra={}){ const g=pageGeom(page); page.drawLine({start:v2p(g,a.x,a.y), end:v2p(g,b.x,b.y), ...extra}); }

/* Helvetica (WinAnsi) can only draw Latin text */
function isLatin(s){ return !/[^\x00-\xFF–—‘’“”•…€]/.test(s); }
function hexToRgb(hex){ const m=hex.replace('#',''); const n=parseInt(m.length===3?m.split('').map(c=>c+c).join(''):m,16); return PDFLib.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255); }
const FONT_STACK = '"Noto Sans","Noto Sans Tamil","Noto Sans Devanagari","Latha","Nirmala UI",system-ui,sans-serif';
/* Render any-script text to a transparent PNG (for watermarks, typed text in other languages) */
function textCanvas(text, {px=64, color='#000', weight='600', family=FONT_STACK, rotate=0, pad=8}={}){
  const lines = String(text).split('\n');
  const m = document.createElement('canvas').getContext('2d'); m.font = `${weight} ${px}px ${family}`;
  const tw = Math.max(1, ...lines.map(l=>m.measureText(l).width)), th = px*1.25*lines.length;
  const r = rotate*Math.PI/180, bw = Math.abs(tw*Math.cos(r))+Math.abs(th*Math.sin(r)), bh = Math.abs(tw*Math.sin(r))+Math.abs(th*Math.cos(r));
  const c = document.createElement('canvas'); c.width=Math.ceil(bw+pad*2); c.height=Math.ceil(bh+pad*2);
  const x = c.getContext('2d'); x.translate(c.width/2, c.height/2); x.rotate(-r);
  x.font = `${weight} ${px}px ${family}`; x.fillStyle=color; x.textBaseline='middle'; x.textAlign='center';
  lines.forEach((l,i)=> x.fillText(l, 0, (i-(lines.length-1)/2)*px*1.25));
  return c;
}

/* Text -> PDF. Latin uses real (selectable) text; other scripts are drawn with the device's fonts. */
function wrapLines(text, measure, maxW){
  const out=[];
  String(text).replace(/\r/g,'').split('\n').forEach(par=>{
    if(!par.trim()){ out.push(''); return; }
    const words=par.split(/(\s+)/); let line='';
    for(const w of words){
      const test=line+w;
      if(measure(test.trimEnd())<=maxW){ line=test; continue; }
      if(!line.trim()){ let chunk=''; for(const ch of w){ if(measure(chunk+ch)>maxW && chunk){ out.push(chunk); chunk=ch; } else chunk+=ch; } line=chunk; continue; }
      out.push(line.trimEnd()); line=w.trimStart();
      if(measure(line)>maxW){ let chunk=''; for(const ch of line){ if(measure(chunk+ch)>maxW && chunk){ out.push(chunk); chunk=ch; } else chunk+=ch; } line=chunk; }
    }
    out.push(line.trimEnd());
  });
  return out;
}
async function makeTextPdf(title, body, fs=12, {pdf=null}={}){
  const doc = pdf || await PDFLib.PDFDocument.create();
  const [W,H]=SIZES.a4, M=56; let count=0;
  if (isLatin(title+body)){
    const f=await doc.embedFont(PDFLib.StandardFonts.Helvetica), fb=await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const lh=fs*1.45; let page=doc.addPage([W,H]); count=1; let y=H-M;
    if(title){ wrapLines(title,t=>fb.widthOfTextAtSize(t,fs*1.6),W-2*M).forEach(l=>{ y-=fs*1.6*1.25; page.drawText(l,{x:M,y,size:fs*1.6,font:fb,color:PDFLib.rgb(.1,.13,.21)}); }); y-=fs*1.2; }
    wrapLines(body,t=>f.widthOfTextAtSize(t,fs),W-2*M).forEach(l=>{
      if(y-lh<M){ page=doc.addPage([W,H]); count++; y=H-M; }
      y-=lh; if(l) page.drawText(l,{x:M,y,size:fs,font:f,color:PDFLib.rgb(.1,.1,.12)});
    });
  } else {
    const S=2.5, cw=Math.round(W*S), ch=Math.round(H*S), m=M*S;
    const c=document.createElement('canvas'); c.width=cw; c.height=ch; const x=c.getContext('2d');
    const bodyF=`${fs*S}px ${FONT_STACK}`, titleF=`600 ${fs*1.6*S}px ${FONT_STACK}`, lh=fs*1.65*S;
    const fresh=()=>{ x.fillStyle='#fff'; x.fillRect(0,0,cw,ch); x.fillStyle='#1a1d26'; x.textBaseline='alphabetic'; };
    const flush=async()=>{ const img=await doc.embedJpg(await canvasBytes(c,'image/jpeg',.9)); doc.addPage([W,H]).drawImage(img,{x:0,y:0,width:W,height:H}); count++; };
    fresh(); let y=m;
    if(title){ x.font=titleF; wrapLines(title,t=>x.measureText(t).width,cw-2*m).forEach(l=>{ y+=fs*1.6*S*1.3; x.fillText(l,m,y); }); y+=fs*S*1.2; }
    x.font=bodyF;
    for(const l of wrapLines(body,t=>x.measureText(t).width,cw-2*m)){ if(y+lh>ch-m){ await flush(); fresh(); x.font=bodyF; y=m; } y+=lh; if(l) x.fillText(l,m,y); }
    await flush();
  }
  return {doc, pages:count};
}

/* ---------- text extraction ---------- */
async function pageItems(doc, n, {fonts=false, visual=false}={}){
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  /* For reading text, turn the page so most text runs left-to-right (sideways pages); `visual` keeps what the reader shows */
  let vp = page.getViewport({scale:1});
  if (!visual){
    let best=-1;
    for (const r of [0,90,180,270]){ const v=page.getViewport({scale:1, rotation:(page.rotate+r)%360}); let score=0;
      for (const it of tc.items){ if(!it.str||!it.str.trim()) continue; const t=pdfjsLib.Util.transform(v.transform, it.transform); if (t[0]>0 && Math.abs(t[1])<=Math.abs(t[0])*.2) score+=it.str.length; }
      if (score>best){ best=score; vp=v; } }
  }
  let fontNames = {};
  if (fonts){ try{ await page.getOperatorList(); for (const it of tc.items){ if(it.fontName && !(it.fontName in fontNames)){ try{ fontNames[it.fontName]=(page.commonObjs.get(it.fontName)||{}).name||''; }catch(e){ fontNames[it.fontName]=''; } } } }catch(e){} }
  const items = [];
  for (const it of tc.items){
    if (!('str' in it)) continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform);
    const size = Math.hypot(t[2], t[3]) || Math.abs(it.transform[3]) || 10;
    const fn = fontNames[it.fontName]||'';
    const nx=Math.hypot(t[0],t[1])||1, ny=Math.hypot(t[2],t[3])||1;
    items.push({str:it.str, x:t[4], y:t[5], size, w: it.width * (nx/Math.max(1e-6,Math.hypot(it.transform[0],it.transform[1]))), eol:it.hasEOL,
      ux:t[0]/nx, uy:t[1]/nx, vx:-t[2]/ny, vy:-t[3]/ny,
      bold:/bold|black|heavy|semibold|demi/i.test(fn), italic:/italic|oblique/i.test(fn)});
  }
  return {items, width:vp.width, height:vp.height};
}
function groupLines(items){
  const its = items.filter(i=>i.str.trim()).sort((a,b)=> a.y-b.y || a.x-b.x);
  const lines=[];
  for (const it of its){
    const L = lines.find(l=> Math.abs(l.y-it.y) < Math.max(2, Math.min(l.size,it.size)*.5));
    if (L){ L.items.push(it); L.size=Math.max(L.size,it.size); } else lines.push({y:it.y, size:it.size, items:[it]});
  }
  lines.sort((a,b)=>a.y-b.y);
  for (const L of lines){
    L.items.sort((a,b)=>a.x-b.x);
    let s='', prevEnd=null;
    for (const it of L.items){ if (prevEnd!=null){ const gap=it.x-prevEnd; if (gap > it.size*.18 && !s.endsWith(' ') && !it.str.startsWith(' ')) s+=' '; } s+=it.str; prevEnd=it.x+it.w; }
    L.text=s.replace(/\s+/g,' ').trim(); L.x0=L.items[0].x; L.x1=prevEnd;
    L.bold = L.items.every(i=>i.bold||!i.str.trim());
  }
  return lines;
}
function median(a){ if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); return s[s.length>>1]; }
/* lines -> paragraphs with heading levels */
function paragraphs(lines, bodySize){
  const out=[]; let cur=null;
  for (let i=0;i<lines.length;i++){
    const L=lines[i], prev=lines[i-1];
    const ratio=L.size/bodySize;
    const level = ratio>=1.6?1: ratio>=1.3?2: (ratio>=1.12 && L.bold)?3: 0;
    const gap = prev ? (L.y-prev.y) : 0;
    const bullet = /^([•▪◦●\-–*]|\d{1,3}[.)])\s+/.test(L.text);
    const newPara = !cur || level || cur.level || bullet || gap > Math.max(L.size,prev?.size||0)*1.75 || Math.abs(L.size-(prev?.size||L.size))>1 || (prev && /[.:!?]$/.test(prev.text) && L.x0 > prev.x0 + L.size*1.5);
    if (newPara){ cur={level, text:L.text, bold:L.bold && !level, size:L.size, bullet}; out.push(cur); }
    else { cur.text = cur.text.endsWith('-') ? cur.text.slice(0,-1)+L.text : cur.text+' '+L.text; cur.bold = cur.bold && L.bold; }
  }
  return out;
}
async function docText(doc, {onPage}={}){
  const pagesText=[];
  for (let n=1;n<=doc.numPages;n++){ onPage&&onPage(n); const {items}=await pageItems(doc,n); pagesText.push(groupLines(items).map(l=>l.text).join('\n')); }
  return pagesText;
}

/* ---------- busy / progress ---------- */
function busy(btn, label){ const old=btn.innerHTML, dis=btn.disabled; btn.disabled=true; btn.textContent=label; return { set:t=>btn.textContent=t, done:()=>{ btn.disabled=dis; btn.innerHTML=old; } }; }
function progressBar(){ const i=h('i'); const el=h('div',{class:'progress',role:'progressbar','aria-valuemin':0,'aria-valuemax':100},i); el.set=p=>{ i.style.width=Math.round(clamp(p,0,1)*100)+'%'; el.setAttribute('aria-valuenow',Math.round(p*100)); }; return el; }

/* ---------- saving ---------- */
let _downloads;
const downloadsReady = (async()=>{ try{ _downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; }catch(e){ _downloads=null; } return _downloads; })();
async function saveFile(data, name, msgEl){
  const set=(cls,t)=>{ if(msgEl){ msgEl.className=cls; msgEl.textContent=t; } else toast(t); };
  await Promise.race([downloadsReady, sleep(1500)]);
  if(!_downloads){ set('err','Saving isn’t available in this view. Open SRK in Chrome (or claude.ai in a browser) to save files.'); return false; }
  try{
    const blob = data instanceof Blob ? data : new Blob([data], {type: MIME[extOf(name)]||'application/octet-stream'});
    await _downloads.save({filename:name, data:blob}); set('okmsg', window.SRK_NATIVE ? `Saved to Downloads › SRK: ${name}` : 'Saved '+name+'.'); return true;
  }catch(err){
    const c = err && err.code;
    set('err', c==='perm' ? 'Allow SRK to save files when asked, then tap Save again.' : c==='declined' ? 'Save cancelled.' : c==='rate_limited' ? 'A save prompt is already open. Finish that one first.' : c==='too_large' ? 'This file is too large to save here.' : c==='rejected_extension'||c==='extension_not_enabled' ? 'This file type can’t be saved here.' : 'Saving isn’t available here right now.');
    return false;
  }
}

/* ---------- results panel ---------- */
function resultSlot(){ return h('div',{class:'panel result', hidden:true}); }
function showResults(slot, files, {note='', title='', text=null}={}){
  slot.innerHTML=''; slot.hidden=false;
  const msg = h('p',{class:'hint'});
  const total = files.reduce((a,f)=>a+(f.data.size??f.data.length),0);
  const single = files.length===1;
  slot.append(h('h2',null, title || (single ? 'Your file is ready' : `${files.length} files are ready`)));
  const pageCount = files.reduce((a,f)=>a+(f.pages||0),0);
  slot.append(h('p',{class:'stats'}, (pageCount? pages(pageCount)+' · ' : '') + (single?'':`${files.length} files · `) + fmtBytes(total)));
  if (note) slot.append(h('p',{class:'hint'}, note));
  if (text!=null){
    const pre = h('pre',{class:'textout'}, text);
    const copy = h('button',{class:'btn sm',type:'button',onclick:async()=>{ try{ await navigator.clipboard.writeText(pre.textContent); toast('Copied'); }catch(e){ const r=document.createRange(); r.selectNodeContents(pre); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('Text selected — copy it from the menu'); } }},'Copy text');
    slot.append(pre, h('div',{class:'row'},copy));
    slot._pre = pre;
  }
  if (single){
    const f=files[0], ext='.'+extOf(f.name);
    const name = h('input',{class:'inp', value:f.name, 'aria-label':'File name'});
    const row = h('div',{class:'row'},
      h('button',{class:'btn primary',type:'button',onclick:()=>saveFile(f.data, cleanName(name.value, ext), msg)}, 'Save '+(ext.slice(1).toUpperCase())),
      window.srkShare ? h('button',{class:'btn',type:'button',onclick:()=>window.srkShare(f.data, cleanName(name.value, ext))},'Share') : null,
      extOf(f.name)==='pdf' ? h('button',{class:'btn',type:'button',onclick:()=>openInReader(f.data, cleanName(name.value,'.pdf'))},'Open in Read') : null);
    slot.append(h('label',{class:'f'},'File name',name), row);
  } else {
    const ul = h('ul',{class:'list'});
    files.forEach((f,i)=>{
      ul.append(h('li',{class:'item'},
        h('span',{class:'ord'},i+1),
        h('span',{class:'meta'}, h('b',null,f.name), h('small',null, `${f.label?f.label+' · ':''}${f.pages?pages(f.pages)+' · ':''}${fmtBytes(f.data.size??f.data.length)}`)),
        extOf(f.name)==='pdf' ? h('button',{class:'btn sm',type:'button',onclick:()=>openInReader(f.data,f.name)},'Open') : null,
        window.srkShare ? h('button',{class:'btn sm',type:'button',onclick:()=>window.srkShare(f.data,f.name)},'Share') : null,
        h('button',{class:'btn sm primary',type:'button',onclick:()=>saveFile(f.data,f.name,msg)},'Save')));
    });
    const zipBtn = h('button',{class:'btn primary',type:'button'},'Save all as ZIP');
    zipBtn.onclick = async()=>{ const b=busy(zipBtn,'Packing…'); try{ const z=new JSZip(); const used={}; files.forEach(f=>{ let n=f.name; while(used[n]) n=baseName(n)+' (2).'+extOf(n); used[n]=1; z.file(n, f.data); }); const data=await z.generateAsync({type:'uint8array',compression:'STORE'}); await saveFile(data, cleanName(slot.dataset.zipname||'SRK files','.zip'), msg); } finally{ b.done(); } };
    slot.append(ul, h('div',{class:'row'},zipBtn));
  }
  slot.append(msg);
  requestAnimationFrame(()=>slot.scrollIntoView({behavior:'smooth',block:'start'}));
}
let openInReader = ()=>{};  // set by app.js

/* ---------- Claude (AI) ---------- */
let _sample;
const sampleReady = (async()=>{ try{ _sample = window.claude && window.claude.use ? await window.claude.use('sample') : null; }catch(e){ _sample=null; } return _sample; })();
async function getSample(){ await Promise.race([sampleReady, sleep(2500)]); return _sample; }
function sampleErr(e){
  const c = e && e.code;
  return ({
    not_granted:'Claude wasn’t allowed for this page. Allow it when asked, or turn it on from this page’s permissions.',
    sampling_disabled:'Claude isn’t available for this account.',
    rate_limited:'Claude is busy or your usage limit was reached. Try again in a little while.',
    session_expired:'Please sign in to claude.ai again, then retry.',
    prompt_too_large:'This document is too long to send in one go. Try fewer pages.',
    image_rejected:'One of the page images couldn’t be sent.',
    images_unavailable:'Sending page images to Claude isn’t available in this view.',
    refused:'Claude declined this request.',
    cancelled:'Stopped.',
  })[c] || 'Claude couldn’t finish this. Try again.';
}
const AI_UNAVAILABLE = 'This tool uses Claude, which works when SRK is opened from claude.ai while you’re signed in.';

/* ---------- misc ---------- */
function xmlEsc(s){ return String(s).replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''); }
function htmlEsc(s){ return String(s).replace(/[<>&"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
function parseRange(s, max){
  s = String(s||'').trim(); if(!s) return [...Array(max).keys()];
  const out=[];
  for (const part of s.split(/[,\s]+/).filter(Boolean)){
    const m=part.match(/^(\d+)(?:-(\d*))?$/); if(!m) throw new Error(`“${part}” isn’t a page or range. Use forms like 2 or 4-7.`);
    const a=+m[1], b = m[2]===undefined ? a : (m[2]===''? max : +m[2]);
    if(a<1||b<1||a>max||b>max) throw new Error(`This PDF has ${max} pages, so “${part}” is out of range.`);
    const st=a<=b?1:-1; for(let i=a;i!==b+st;i+=st) out.push(i-1);
  }
  return out;
}
function segmented(options, value, onChange){
  const el = h('div',{class:'seg',role:'group'});
  options.forEach(([v,label])=>{ const b=h('button',{type:'button','aria-pressed':String(v===value)},label); b.onclick=()=>{ $$('button',el).forEach(x=>x.setAttribute('aria-pressed', String(x===b))); el.value=v; onChange&&onChange(v); }; el.append(b); });
  el.value=value; return el;
}
function select(id, options, value){ return h('select',{class:'inp',id}, options.map(([v,l])=>h('option',{value:v, selected: v===value||null},l))); }
