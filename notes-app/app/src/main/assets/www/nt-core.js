/* SRK Notes — core: helpers, icons, storage (IndexedDB), encryption, dialogs and menus */
'use strict';
const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = o => JSON.parse(JSON.stringify(o));
function h(tag, attrs = {}, ...kids){ const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})){ if (v == null || v === false) continue; if (k === 'html') e.innerHTML = v; else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else e.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; }
const fmtDate = t => new Date(t).toLocaleDateString('en-IN', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
const fmtTime = t => new Date(t).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'});
const fmtShort = t => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? fmtTime(t) : d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric'}); };
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const fmtDur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const textOf = html => { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '$&\n'); return (d.textContent || '').replace(/ /g, ' '); };

/* ---------------------------------------------------------------- icons (24px line icons) */
const S = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  back: S('<path d="M15 5l-7 7 7 7"/>'), more: S('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'), plus: S('<path d="M12 5v14M5 12h14"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'), close: S('<path d="M6 6l12 12M18 6L6 18"/>'), menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'), undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'), redo: S('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'),
  bold: S('<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"/>'), italic: S('<path d="M14 5h-4M14 19h-4M14.5 5l-5 14"/>'), underline: S('<path d="M7 4v7a5 5 0 0010 0V4M5 20h14"/>'), strike: S('<path d="M5 12h14M16 7a4 3 0 00-4-2c-2.5 0-4 1.2-4 3M8 17a4 3 0 004 2c2.5 0 4-1.2 4-3"/>'),
  hl: S('<path d="M8 15l-3 4h6l1-1M8 15l7-9 4 3-7 9z"/>'), color: S('<path d="M7 18L12 5l5 13M8.6 14h6.8"/>'), clear: S('<path d="M5 19h8M9 5h10M14 5l-5 14M16 15l4 4M20 15l-4 4"/>'),
  ul: S('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'), ol: S('<path d="M10 6h10M10 12h10M10 18h10M4 5h1.5v3M4 8h3M4 11.5c.5-.7 2.5-.7 2.5.5S4 13.6 4 14.5h3M4 17h2.5l-1 1.2c1 0 1.5.5 1.2 1.2-.3.6-1.7.7-2.7.1"/>'),
  indent: S('<path d="M10 6h10M10 12h10M10 18h10M4 9l3 3-3 3"/>'), outdent: S('<path d="M10 6h10M10 12h10M10 18h10M7 9l-3 3 3 3"/>'), left: S('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), center: S('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'), right: S('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  todo: S('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'), tag: S('<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/>'), findtag: S('<path d="M4 4h6l6 6M4 4v6l6 6"/><circle cx="16" cy="16" r="3.5"/><path d="M21 21l-2.5-2.5"/>'),
  table: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'), image: S('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'), camera: S('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  file: S('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'), clip: S('<path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7"/>'), pdf: S('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M8.5 16v-4h1.3a1.2 1.2 0 010 2.4H8.5M12.5 12v4h1a2 2 0 000-4z"/>'),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'), video: S('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'), link: S('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
  date: S('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'), time: S('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'), symbol: S('<path d="M7 19h4v-2.5A6 6 0 1113 16.5V19h4"/>'), emoji: S('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 007 0"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/>'),
  template: S('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'), pen: S('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'), marker: S('<path d="M5 19l2-6 8-8 4 4-8 8z"/><path d="M4 21h7"/>'), eraser: S('<path d="M8 20h12M5 15l9-9 5 5-8 8H8z"/><path d="M10 10l5 5"/>'),
  type: S('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), lasso: S('<path d="M12 4c4.4 0 8 2.2 8 5s-3.6 5-8 5-8-2.2-8-5 3.6-5 8-5z" stroke-dasharray="2 2.5"/><path d="M7 13c-1 2 0 4 2 5l1 3"/>'), line: S('<path d="M5 19L19 5"/>'), arrow: S('<path d="M5 19L19 5M10 5h9v9"/>'), rect: S('<rect x="4" y="6" width="16" height="12" rx="1"/>'), ellipse: S('<ellipse cx="12" cy="12" rx="8" ry="6"/>'),
  hand: S('<path d="M8 13V6.5a1.5 1.5 0 013 0V12M11 11V4.5a1.5 1.5 0 013 0V12M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-3.5L4 13.5a1.5 1.5 0 012.3-1.9L8 13.5"/>'), space: S('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
  color2: S('<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor"/><path d="M12 20.5c-1.5 0-2-1.5-1-2.5s0-2.5-1.5-2.5"/>'), rule: S('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M4 12h16M4 16h16"/>'), zoomin: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>'), zoomout: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>'),
  full: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), moon: S('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'), read: S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>'), spell: S('<path d="M4 15l3.5-9 3.5 9M5.3 12h4.4M13 13l3 3 5-7"/>'),
  count: S('<path d="M5 7h14M5 12h14M5 17h8"/><path d="M17 15v5M15 17.5h4"/>'), lock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'), unlock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>'), history: S('<path d="M4 12a8 8 0 102.4-5.7M4 4v4h4"/><path d="M12 8v4l3 2"/>'), trash: S('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  share: S('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>'), download: S('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'), upload: S('<path d="M12 20V9M7 13l5-5 5 5M5 4h14"/>'), copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  move: S('<path d="M5 12h14M15 8l4 4-4 4M4 5h7M4 19h7"/>'), rename: S('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), page: S('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>'), subpage: S('<path d="M5 4v8h6"/><path d="M11 9h8v11h-8z"/>'), section: S('<rect x="4" y="5" width="13" height="15" rx="1.5"/><path d="M17 8h3v3h-3M17 13h3v3h-3"/>'), notebook: S('<path d="M6 3h12v18H6z"/><path d="M9 3v18M4 7h3M4 12h3M4 17h3"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>'),
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" fill="currentColor" fill-opacity=".18"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  styles: S('<path d="M4 6h10M4 11h7M4 16h10M17 4v16M14 7l3-3 3 3"/>'), quote: S('<path d="M9 7H6a2 2 0 00-2 2v3h5v5H4M20 7h-3a2 2 0 00-2 2v3h5v5h-5"/>'), code: S('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>'), sub: S('<path d="M4 6l7 9M11 6l-7 9M16 20h4l-3.5-3.5a1.5 1.5 0 012-2.3"/>'), sup: S('<path d="M4 9l7 9M11 9l-7 9M16 9h4L16.5 5.5a1.5 1.5 0 012-2.3"/>'),
  print: S('<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>'), word: S('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M8.5 11l1.3 6 1.7-4.5 1.7 4.5 1.3-6"/>'), mail: S('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'), check: S('<path d="M5 12l5 5 9-10"/>'), star: S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  pin: S('<path d="M9 4h6l-1 5 4 4H6l4-4zM12 13v8"/>'), sticky: S('<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>'), focus: S('<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/><circle cx="12" cy="12" r="2.5"/>'), translate: S('<path d="M4 6h9M8.5 4v2M6 6c.5 3 3 6 6 7M11 6c-.5 3-3 6-6 7M13 20l4-9 4 9M14.3 17h5.4"/>'),
};
/* note tags, like OneNote */
const TAGS = [
  {k: 'todo', n: 'To Do', key: '1', svg: (done) => `<svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="${done ? '#2f6fde' : '#fff'}" stroke="#2f6fde" stroke-width="1.6"/>${done ? '<path d="M6 10.3l2.7 2.7L14.2 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</svg>`},
  {k: 'important', n: 'Important', key: '2', svg: () => '<svg viewBox="0 0 20 20"><path d="M10 2l2.4 5 5.5.8-4 3.9.9 5.5L10 14.6l-4.9 2.6.9-5.5-4-3.9 5.6-.8z" fill="#f5b400" stroke="#c98a00" stroke-width=".8"/></svg>'},
  {k: 'question', n: 'Question', key: '3', svg: () => '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#7B2FB0"/><path d="M7.6 7.6a2.5 2.5 0 114 2c-1 .7-1.6 1.1-1.6 2.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.8" r="1.1" fill="#fff"/></svg>'},
  {k: 'remember', n: 'Remember for later', key: '4', hl: '#fff27a', svg: () => '<svg viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="2" fill="#fff27a" stroke="#c9b700"/><path d="M5 8h10M5 12h7" stroke="#8a7d00" stroke-width="1.4"/></svg>'},
  {k: 'definition', n: 'Definition', key: '5', hl: '#b8f5b0', svg: () => '<svg viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="2" fill="#b8f5b0" stroke="#3c9b33"/><path d="M5 8h10M5 12h7" stroke="#2c7a25" stroke-width="1.4"/></svg>'},
  {k: 'critical', n: 'Critical', key: '6', svg: () => '<svg viewBox="0 0 20 20"><path d="M10 2l8.5 15H1.5z" fill="#d93025"/><path d="M10 7.5v4.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.1" fill="#fff"/></svg>'},
  {k: 'idea', n: 'Idea', key: '7', svg: () => '<svg viewBox="0 0 20 20"><path d="M10 2.5a5.5 5.5 0 00-3.3 9.9c.6.5.8 1.1.8 1.8V15h5v-.8c0-.7.3-1.3.8-1.8A5.5 5.5 0 0010 2.5z" fill="#ffd54a" stroke="#c99a00"/><path d="M7.8 17h4.4M8.5 18.8h3" stroke="#6b5a1a" stroke-width="1.3" stroke-linecap="round"/></svg>'},
  {k: 'contact', n: 'Contact', key: '8', svg: () => '<svg viewBox="0 0 20 20"><circle cx="10" cy="7" r="3.5" fill="#2f6fde"/><path d="M3.5 17.5a6.5 6.5 0 0113 0z" fill="#2f6fde"/></svg>'},
  {k: 'phone', n: 'Phone number', key: '9', svg: () => '<svg viewBox="0 0 20 20"><path d="M5.5 2.5l3 3-1.6 2.4a9 9 0 005.2 5.2l2.4-1.6 3 3-2 2.5C9.3 17 3 10.7 3 4.5z" fill="#1e8e3e"/></svg>'},
  {k: 'address', n: 'Address', svg: () => '<svg viewBox="0 0 20 20"><path d="M10 18s6-5.4 6-10a6 6 0 00-12 0c0 4.6 6 10 6 10z" fill="#d93025"/><circle cx="10" cy="8" r="2.3" fill="#fff"/></svg>'},
  {k: 'password', n: 'Password', svg: () => '<svg viewBox="0 0 20 20"><circle cx="7" cy="10" r="4" fill="none" stroke="#5f6368" stroke-width="2"/><path d="M11 10h7M15.5 10v3M18 10v2" stroke="#5f6368" stroke-width="2" stroke-linecap="round"/></svg>'},
  {k: 'book', n: 'Book to read', svg: () => '<svg viewBox="0 0 20 20"><path d="M3 4h5a2 2 0 012 2v11a2 2 0 00-2-2H3zM17 4h-5a2 2 0 00-2 2v11a2 2 0 012-2h5z" fill="#e8710a"/></svg>'},
  {k: 'discuss', n: 'Discuss with team', svg: () => '<svg viewBox="0 0 20 20"><path d="M2.5 4h10v7h-6l-3 2.5V11h-1z" fill="#12a4af"/><path d="M14 7h3.5v7h-1v2.5l-3-2.5H9v-1.5h5z" fill="#0b7c85"/></svg>'},
  {k: 'email', n: 'Send in email', svg: () => '<svg viewBox="0 0 20 20"><rect x="2" y="4.5" width="16" height="11" rx="1.5" fill="#2f6fde"/><path d="M2.5 5.5L10 11l7.5-5.5" fill="none" stroke="#fff" stroke-width="1.4"/></svg>'},
  {k: 'meeting', n: 'Schedule meeting', svg: () => '<svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="13.5" rx="2" fill="#fff" stroke="#d93025" stroke-width="1.5"/><path d="M2.5 8h15" stroke="#d93025" stroke-width="2"/><path d="M6 2.5v3M14 2.5v3" stroke="#5f6368" stroke-width="1.5" stroke-linecap="round"/></svg>'},
  {k: 'p1', n: 'To Do priority 1', svg: (done) => `<svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="${done ? '#d93025' : '#fff'}" stroke="#d93025" stroke-width="1.6"/>${done ? '<path d="M6 10.3l2.7 2.7L14.2 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' : '<text x="10" y="14" font-size="10" font-weight="700" text-anchor="middle" fill="#d93025" font-family="sans-serif">1</text>'}</svg>`},
  {k: 'p2', n: 'To Do priority 2', svg: (done) => `<svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="${done ? '#e8710a' : '#fff'}" stroke="#e8710a" stroke-width="1.6"/>${done ? '<path d="M6 10.3l2.7 2.7L14.2 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' : '<text x="10" y="14" font-size="10" font-weight="700" text-anchor="middle" fill="#e8710a" font-family="sans-serif">2</text>'}</svg>`},
];
const TAG = Object.fromEntries(TAGS.map(t => [t.k, t]));
const CHECKABLE = new Set(['todo', 'p1', 'p2']);
const tagHTML = (k, done) => `<span class="tag${done ? ' done' : ''}" data-tag="${k}" contenteditable="false" title="${esc(TAG[k] ? TAG[k].n : k)}">${TAG[k] ? TAG[k].svg(done) : ''}</span>`;
const SECTION_COLORS = ['#8AA8E4', '#91BAAE', '#F5D33F', '#F5AE7B', '#E5A3CC', '#B49EDE', '#9BC1A1', '#F09A9A', '#79C3D0', '#C8B48A', '#B4B4B4', '#E9C46A'];
const NB_COLORS = ['#7B2FB0', '#2F6FDE', '#1E7B47', '#C2410C', '#B4235A', '#0E7490', '#6D4C41', '#4B5563'];
const PAGE_COLORS = [['', 'No colour'], ['#FFF8D6', 'Yellow'], ['#E6F4EA', 'Green'], ['#E3F0FF', 'Blue'], ['#F3E8FD', 'Purple'], ['#FDE7E9', 'Pink'], ['#FFEFE0', 'Orange'], ['#EEF0F2', 'Grey'], ['#E0F7F7', 'Teal']];

/* ---------------------------------------------------------------- storage: IndexedDB with an in-memory fallback */
const DB = (() => {
  const STORES = ['nb', 'sec', 'page', 'blob', 'ver', 'trash', 'meta']; let dbp = null; let mem = null;
  const open = () => dbp || (dbp = new Promise(res => { try { const r = indexedDB.open('srk-notes', 1); r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, {keyPath: 'id'}); }; r.onsuccess = () => res(r.result); r.onerror = () => { mem = mem || Object.fromEntries(STORES.map(s => [s, new Map()])); res(null); }; r.onblocked = () => res(null); } catch(e){ mem = mem || Object.fromEntries(STORES.map(s => [s, new Map()])); res(null); } }));
  const memStore = s => (mem = mem || Object.fromEntries(STORES.map(x => [x, new Map()])))[s];
  async function run(store, mode, fn){ const db = await open(); if (!db){ return fn(null, memStore(store)); } return new Promise((res, rej) => { try { const t = db.transaction(store, mode); const st = t.objectStore(store); let out; const r = fn(st); if (r && 'onsuccess' in r){ r.onsuccess = () => { out = r.result; }; } t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage is full or unavailable')); } catch(e){ rej(e); } }); }
  return {
    get: (s, id) => run(s, 'readonly', (st, m) => m ? m.get(id) : st.get(id)),
    put: (s, o) => run(s, 'readwrite', (st, m) => m ? (m.set(o.id, clone2(o)), undefined) : st.put(o)),
    del: (s, id) => run(s, 'readwrite', (st, m) => m ? (m.delete(id), undefined) : st.delete(id)),
    all: (s) => run(s, 'readonly', (st, m) => m ? [...m.values()] : st.getAll()),
    persistent: async () => { await open(); return !mem; },
  };
  function clone2(o){ return o instanceof Blob ? o : o; }
})();

/* ---------------------------------------------------------------- encryption for password-protected sections (AES-GCM, PBKDF2) */
const Crypt = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function key(password, saltB64){ const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']); }
  const salt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
  async function encBytes(k, bytes){ const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, bytes); return {iv: b64(iv), ct}; }
  async function decBytes(k, o){ return crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(o.iv)}, k, o.ct instanceof ArrayBuffer ? o.ct : (o.ct.buffer || unb64(o.ct))); }
  async function encJSON(k, obj){ const r = await encBytes(k, enc.encode(JSON.stringify(obj))); return {iv: r.iv, ct: b64(r.ct)}; }
  async function decJSON(k, o){ const b = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(o.iv)}, k, unb64(o.ct)); return JSON.parse(dec.decode(b)); }
  return {key, salt, encBytes, decBytes, encJSON, decJSON, b64, unb64, ok: !!(window.crypto && crypto.subtle)};
})();

/* ---------------------------------------------------------------- UI primitives */
const UI = (() => {
  let toastT = null;
  function toast(msg, ms = 2600){ $$('.toast').forEach(t => t.remove()); const t = h('div', {class: 'toast', role: 'status'}, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms); }
  function dialog(title, body, buttons = [['OK', 'primary']], opts = {}){ return new Promise(resolve => { const sc = h('div', {class: 'scrim'}); const d = h('div', {class: 'dlg' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title}); const close = v => { sc.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const df = h('div', {class: 'df'}); for (const [label, cls, fn] of buttons){ const b = h('button', {class: 'btn' + (cls ? ' ' + cls : ''), type: 'button'}, label); b.addEventListener('click', async () => { if (fn){ const r = await fn(); if (r === false) return; close(r === undefined ? label : r); } else close(label === 'Cancel' ? null : label); }); df.append(b); }
    d.append(h('h3', {}, title), h('div', {class: 'db'}, body), df); sc.append(d); sc.addEventListener('pointerdown', e => { if (e.target === sc && !opts.modal) close(null); });
    const onKey = e => { if (e.key === 'Escape'){ e.stopPropagation(); close(null); } if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !opts.noEnter){ e.preventDefault(); const p = df.querySelector('.primary'); if (p) p.click(); } }; document.addEventListener('keydown', onKey, true);
    document.body.append(sc); setTimeout(() => { const f = d.querySelector('input:not([type=checkbox]):not([type=color]),textarea,select'); if (f){ f.focus(); if (f.select) f.select(); } }, 30); }); }
  const field = (label, el) => h('label', {class: 'f'}, label, el);
  async function prompt(title, label, value = '', okLabel = 'OK'){ const i = h('input', {class: 'inp', value}); const r = await dialog(title, field(label, i), [['Cancel'], [okLabel, 'primary', () => i.value.trim() || false]]); return typeof r === 'string' ? r : null; }
  async function confirm(title, text, okLabel = 'Delete', cls = 'danger primary'){ const r = await dialog(title, h('p', {class: 'hint', style: 'font-size:15px;color:var(--ink)'}, text), [['Cancel'], [okLabel, cls]]); return r === okLabel; }
  function menu(anchor, items, opts = {}){ $$('.menu').forEach(m => m.remove()); const m = h('div', {class: 'menu', role: 'menu'});
    for (const it of items){ if (!it) continue; if (it === '-'){ m.append(h('div', {class: 'msep'})); continue; } if (it.label){ m.append(h('div', {class: 'mlab'}, it.label)); continue; } if (it.el){ m.append(it.el); continue; }
      const b = h('button', {class: 'mi' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', html: (it.icon || '') + `<span>${esc(it.text)}</span>` + (it.k ? `<span class="k">${esc(it.k)}</span>` : '')}); if (it.disabled) b.disabled = true; b.addEventListener('click', e => { e.stopPropagation(); m.remove(); it.fn && it.fn(); }); m.append(b); }
    document.body.append(m); const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : {left: opts.x || 100, bottom: opts.y || 100, top: opts.y || 100, right: opts.x || 100}; const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = opts.x != null ? opts.x : r.left, y = opts.y != null ? opts.y : r.bottom + 4; if (x + mw > innerWidth - 8) x = Math.max(8, (opts.x != null ? opts.x : r.right) - mw); if (y + mh > innerHeight - 8) y = Math.max(8, (opts.y != null ? opts.y : r.top) - mh - 4); m.style.left = x + 'px'; m.style.top = y + 'px';
    setTimeout(() => { const off = e => { if (!m.contains(e.target)){ m.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0); return m; }
  function side(title, body, opts = {}){ $$('.side').forEach(s => { if (!opts.keep) s.remove(); }); const s = h('div', {class: 'side ' + (opts.cls || ''), role: 'dialog', 'aria-label': title}); const x = h('button', {class: 'ib', 'aria-label': 'Close', html: IC.close}); x.addEventListener('click', () => { s.remove(); opts.onClose && opts.onClose(); });
    s.append(h('div', {class: 'shd'}, h('h3', {}, title), ...(opts.actions || []), x), body); document.body.append(s); return s; }
  const filePick = (accept, multiple) => new Promise(res => { const i = h('input', {type: 'file', accept, style: 'position:fixed;left:-1000px'}); if (multiple) i.multiple = true; i.addEventListener('change', () => { res([...i.files]); i.remove(); }); document.body.append(i); i.click(); setTimeout(() => { if (!i.files || !i.files.length){} }, 0); });
  return {toast, dialog, field, prompt, confirm, menu, side, filePick, h};
})();
