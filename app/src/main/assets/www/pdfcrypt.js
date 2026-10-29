/* SRK — PDF password protection (Standard security handler, AES-128, R4) */
'use strict';
/* ---- MD5 (WebCrypto has none) ---- */
function md5(bytes){
  const K=new Int32Array(64), S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  for(let i=0;i<64;i++) K[i]=Math.floor(Math.abs(Math.sin(i+1))*4294967296)|0;
  const len=bytes.length, nBlocks=((len+8)>>6)+1, buf=new Uint8Array(nBlocks*64);
  buf.set(bytes); buf[len]=0x80; const bitLen=len*8; const dv=new DataView(buf.buffer);
  dv.setUint32(buf.length-8, bitLen>>>0, true); dv.setUint32(buf.length-4, Math.floor(bitLen/4294967296), true);
  let a0=0x67452301|0, b0=0xefcdab89|0, c0=0x98badcfe|0, d0=0x10325476|0; const M=new Int32Array(16);
  for(let o=0;o<buf.length;o+=64){
    for(let j=0;j<16;j++) M[j]=dv.getInt32(o+j*4,true);
    let A=a0,B=b0,C=c0,D=d0;
    for(let i=0;i<64;i++){
      let F,g;
      if(i<16){F=(B&C)|(~B&D);g=i;} else if(i<32){F=(D&B)|(~D&C);g=(5*i+1)%16;} else if(i<48){F=B^C^D;g=(3*i+5)%16;} else {F=C^(B|~D);g=(7*i)%16;}
      const t=D; D=C; C=B; const x=(A+F+K[i]+M[g])|0; B=(B+((x<<S[i])|(x>>>(32-S[i]))))|0; A=t;
    }
    a0=(a0+A)|0; b0=(b0+B)|0; c0=(c0+C)|0; d0=(d0+D)|0;
  }
  const out=new Uint8Array(16), ov=new DataView(out.buffer); ov.setInt32(0,a0,true); ov.setInt32(4,b0,true); ov.setInt32(8,c0,true); ov.setInt32(12,d0,true); return out;
}
function rc4(key, data){
  const s=new Uint8Array(256); for(let i=0;i<256;i++) s[i]=i;
  for(let i=0,j=0;i<256;i++){ j=(j+s[i]+key[i%key.length])&255; [s[i],s[j]]=[s[j],s[i]]; }
  const out=new Uint8Array(data.length);
  for(let k=0,i=0,j=0;k<data.length;k++){ i=(i+1)&255; j=(j+s[i])&255; [s[i],s[j]]=[s[j],s[i]]; out[k]=data[k]^s[(s[i]+s[j])&255]; }
  return out;
}
const PDF_PAD = new Uint8Array([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);
function padPw(pw){ const b=new Uint8Array(32); const raw=[...String(pw)].map(c=>c.charCodeAt(0)&255).slice(0,32); b.set(raw); b.set(PDF_PAD.subarray(0,32-raw.length), raw.length); return b; }
function cat(...arrs){ const n=arrs.reduce((a,x)=>a+x.length,0); const o=new Uint8Array(n); let p=0; for(const x of arrs){ o.set(x,p); p+=x.length; } return o; }
const toHex = b => [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const PERM = { print:4, modify:8, copy:16, annotate:32, fill:256, access:512, assemble:1024, printHigh:2048 };

async function protectPdf(bytes, {userPw='', ownerPw='', allow={}}={}){
  const {PDFDocument, PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream, PDFName, PDFNumber, PDFBool} = PDFLib;
  if (isEncrypted(bytes)) throw new Error('This PDF already has a password. Unlock it first, then protect it again.');
  // Normalise: re-save without object streams so every object can be encrypted on its own
  const first = await PDFDocument.load(bytes, {updateMetadata:false});
  const flat = await first.save({useObjectStreams:false, updateFieldAppearances:false});
  const doc = await PDFDocument.load(flat, {updateMetadata:false});
  const ctx = doc.context;
  const id0 = crypto.getRandomValues(new Uint8Array(16));
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(toHex(id0)), PDFHexString.of(toHex(id0))]);
  const owner = ownerPw || userPw || toHex(crypto.getRandomValues(new Uint8Array(12)));
  let P = 0xFFFFF0C0; for (const [k,v] of Object.entries(allow)) if (v && PERM[k]) P |= PERM[k]; P|=0;
  // Algorithm 3: O
  let ok = md5(padPw(owner)); for(let i=0;i<50;i++) ok = md5(ok);
  let O = rc4(ok, padPw(userPw)); for(let i=1;i<=19;i++) O = rc4(ok.map(b=>b^i), O);
  // Algorithm 2: file key
  const Pb = new Uint8Array(4); new DataView(Pb.buffer).setInt32(0, P, true);
  let key = md5(cat(padPw(userPw), O, Pb, id0)); for(let i=0;i<50;i++) key = md5(key);
  // Algorithm 5: U
  let U = rc4(key, md5(cat(PDF_PAD, id0))); for(let i=1;i<=19;i++) U = rc4(key.map(b=>b^i), U);
  U = cat(U, new Uint8Array(16));
  const aesKeys = new Map();
  async function objKey(num, gen){
    const k = num+'/'+gen; if (aesKeys.has(k)) return aesKeys.get(k);
    const raw = md5(cat(key, new Uint8Array([num&255,(num>>8)&255,(num>>16)&255,gen&255,(gen>>8)&255]), new Uint8Array([0x73,0x41,0x6C,0x54])));
    const ck = await crypto.subtle.importKey('raw', raw, {name:'AES-CBC'}, false, ['encrypt']); aesKeys.set(k, ck); return ck;
  }
  async function enc(data, ref){ const iv = crypto.getRandomValues(new Uint8Array(16)); const ck = await objKey(ref.objectNumber, ref.generationNumber); const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC', iv}, ck, data)); return cat(iv, ct); }
  async function walk(obj, ref){
    if (obj instanceof PDFString || obj instanceof PDFHexString) return PDFHexString.of(toHex(await enc(obj.asBytes(), ref)));
    if (obj instanceof PDFDict){ for (const [k,v] of obj.entries()){ const nv = await walk(v, ref); if (nv!==v) obj.set(k, nv); } return obj; }
    if (obj instanceof PDFArray){ for (let i=0;i<obj.size();i++){ const v=obj.get(i); const nv=await walk(v, ref); if(nv!==v) obj.set(i, nv); } return obj; }
    return obj;
  }
  const objs = ctx.enumerateIndirectObjects();
  for (const [ref, obj] of objs){
    if (obj instanceof PDFRawStream){
      const type = obj.dict.get(PDFName.of('Type'));
      if (type===PDFName.of('XRef') || type===PDFName.of('ObjStm')) { ctx.delete(ref); continue; }
      await walk(obj.dict, ref);
      ctx.assign(ref, PDFRawStream.of(obj.dict, await enc(obj.contents, ref)));
    } else if (obj instanceof PDFDict || obj instanceof PDFArray){
      await walk(obj, ref);
    } else if (obj instanceof PDFString || obj instanceof PDFHexString){
      ctx.assign(ref, await walk(obj, ref));
    }
  }
  const encDict = ctx.obj({
    Filter: 'Standard', V: 4, R: 4, Length: 128, P,
    O: PDFHexString.of(toHex(O)), U: PDFHexString.of(toHex(U)),
    CF: { StdCF: { AuthEvent:'DocOpen', CFM:'AESV2', Length:16 } }, StmF:'StdCF', StrF:'StdCF',
  });
  ctx.trailerInfo.Encrypt = ctx.register(encDict);
  return doc.save({useObjectStreams:false, updateFieldAppearances:false, addDefaultPage:false});
}
