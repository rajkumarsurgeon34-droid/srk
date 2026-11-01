/* SRK Notes — start-up and files opened from other apps */
'use strict';
(async () => {
  try { await M.load(); } catch(e){ console.error(e); UI.toast('Couldn’t open your notes: ' + e.message, 6000); }
  Page.init(); await UIX.init();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
  // the Android app passes files shared with it ("Open with SRK Notes", Share → SRK Notes)
  window.srkOpenIncoming = async name => { try { const r = await fetch('/incoming/file?ts=' + Date.now()); if (!r.ok) throw new Error('not readable'); const b = await r.blob(); const f = new File([b], name || 'file', {type: b.type}); await IO.importFile(f); } catch(e){ UI.toast('Couldn’t open that file: ' + e.message); } };
  window.srkSharedText = async (text, subject) => { const s = M.section(UIX.st.sec) || M.sectionsOf((M.notebooks()[0] || {}).id)[0]; if (!s) return; if (M.isLocked(s.id)) return UI.toast('Unlock the section first'); const urlRx = /(https?:\/\/[^\s]+)/g; const html = String(text || '').split(/\n/).map(l => `<p>${esc(l).replace(urlRx, '<a href="$1" target="_blank" rel="noopener">$1</a>') || '<br>'}</p>`).join(''); const p = await M.addPage(s.id, {title: subject || String(text || '').split('\n')[0].slice(0, 60) || 'Shared note', items: [{id: uid(), x: 28, y: 110, w: 620, html}]}); await UIX.openPage(p.id); UI.toast('Saved as a new page'); };
  if (window.SRKAndroid && window.SRKAndroid.ready) window.SRKAndroid.ready();
})();
