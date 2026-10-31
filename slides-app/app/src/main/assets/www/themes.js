/* SRK Slides — PowerPoint-style design themes: decorated backgrounds, colour variants, background styles */
'use strict';
/* colour helpers */
const hexRgb = c => { c = String(c || '#000').replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const v = parseInt(c.slice(0, 6), 16) || 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const rgbHex = a => '#' + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const tint = (c, t) => mix(c, '#FFFFFF', t), shade = (c, t) => mix(c, '#000000', t);
const lum = c => { const [r, g, b] = hexRgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const isDark = c => lum(c) < 0.22;

/* tiny deterministic random, so star fields look the same everywhere */
const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const P = (pts, attrs) => `<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" ${attrs}/>`;

/* Each theme: fonts, colour variants, background art (SVG, drawn under the slide) and where text placeholders go.
   lay.ins = content-slide margins [left,right,top,bottom] as fractions; lay.title = title-slide boxes; lay.ct = content title colour. */
const THEMES = {
  office: {name: 'Office', head: 'Calibri Light', body: 'Calibri', variants: [
    {bg: '#FFFFFF', title: '#1F2A44', text: '#2B2B2B', accent: '#2F55D4', accent2: '#E0603F'},
    {bg: '#FFFFFF', title: '#262626', text: '#404040', accent: '#ED7D31', accent2: '#4472C4'},
    {bg: '#F2F2F2', title: '#1F1F1F', text: '#3A3A3A', accent: '#70AD47', accent2: '#FFC000'},
    {bg: '#262626', title: '#FFFFFF', text: '#E7E6E6', accent: '#5B9BD5', accent2: '#FFC000'}],
    deco: () => ''},
  prism: {name: 'Prism', head: 'Trebuchet MS', body: 'Trebuchet MS', variants: [
    {bg: '#FFFFFF', title: '#2C3E1F', text: '#3B3B3B', accent: '#7CB342', accent2: '#33691E'},
    {bg: '#FFFFFF', title: '#0D2A4A', text: '#3B3B3B', accent: '#1E88E5', accent2: '#0D47A1'},
    {bg: '#FFFFFF', title: '#4A2400', text: '#3B3B3B', accent: '#FB8C00', accent2: '#E65100'},
    {bg: '#2B2B2B', title: '#FFFFFF', text: '#E0E0E0', accent: '#9CCC65', accent2: '#558B2F'}],
    lay: {ins: [.17, .06, .05, .08], title: {x: .34, y: .2, w: .6, h: .38, sy: .62, sh: .18}},
    deco: (W, H, c, big) => { const k = big ? 1 : 0.45, X = v => v * W * k;
      return P([[0, 0], [X(.24), 0], [X(.1), H * .5], [0, H * .62]], `fill="${c.accent}"`) + P([[X(.24), 0], [X(.34), 0], [X(.1), H * .5]], `fill="${c.accent2}" fill-opacity=".85"`)
        + P([[0, H * .62], [X(.1), H * .5], [X(.17), H], [0, H]], `fill="${tint(c.accent, .35)}"`) + P([[X(.1), H * .5], [X(.34), 0], [X(.17), H]], `fill="${c.accent}" fill-opacity=".28"`)
        + P([[X(.17), H], [X(.34), 0], [X(.38), 0], [X(.23), H]], `fill="${c.accent2}" fill-opacity=".18"`); }},
  aurora: {name: 'Aurora', head: 'Century Gothic', body: 'Century Gothic', variants: [
    {bg: '#0F1B2D', title: '#FFFFFF', text: '#D6E2F0', accent: '#14B8A6', accent2: '#6366F1'},
    {bg: '#1A1033', title: '#FFFFFF', text: '#E9DDFB', accent: '#EC4899', accent2: '#8B5CF6'},
    {bg: '#0B2318', title: '#FFFFFF', text: '#D1F2E0', accent: '#22C55E', accent2: '#0EA5E9'},
    {bg: '#2A0F12', title: '#FFFFFF', text: '#F8DEDC', accent: '#F97316', accent2: '#E11D48'}],
    lay: {ins: [.07, .07, .05, .17], title: {x: .08, y: .08, w: .84, h: .36, sy: .45, sh: .14}},
    deco: (W, H, c, big, u) => { const g = u('a'), y = big ? 0.74 : 0.86, a = big ? 1 : 0.55;
      return `<defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="${c.accent}"/><stop offset="1" stop-color="${c.accent2}"/></linearGradient></defs>`
        + `<path d="M0 ${H * y} C${W * .3} ${H * (y - .14 * a)} ${W * .6} ${H * (y + .22 * a)} ${W} ${H * (y - .04 * a)} V${H} H0Z" fill="url(#${g})" fill-opacity=".9"/>`
        + `<path d="M0 ${H * (y + .08 * a)} C${W * .35} ${H * (y + .22 * a)} ${W * .65} ${H * (y - .06 * a)} ${W} ${H * (y + .12 * a)} V${H} H0Z" fill="${c.accent2}" fill-opacity=".45"/>`
        + `<path d="M0 ${H * (y - .05 * a)} C${W * .3} ${H * (y - .2 * a)} ${W * .62} ${H * (y + .16 * a)} ${W} ${H * (y - .1 * a)}" fill="none" stroke="${tint(c.accent, .4)}" stroke-opacity=".7" stroke-width="2"/>`; }},
  breeze: {name: 'Breeze', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#FFFFFF', title: '#1E3A5F', text: '#334155', accent: '#3B82F6', accent2: '#93C5FD'},
    {bg: '#FFFFFF', title: '#064E3B', text: '#334155', accent: '#10B981', accent2: '#6EE7B7'},
    {bg: '#FFFFFF', title: '#4C0519', text: '#3F3F46', accent: '#F43F5E', accent2: '#FDA4AF'},
    {bg: '#FAF7F2', title: '#422006', text: '#44403C', accent: '#A16207', accent2: '#FCD34D'}],
    lay: {ins: [.14, .06, .05, .08], title: {x: .3, y: .2, w: .64, h: .38, sy: .62, sh: .18}},
    deco: (W, H, c, big) => { const k = big ? 1 : 0.42, X = v => v * W * k;
      return `<path d="M0 0 C${X(.3)} ${H * .2} ${X(.12)} ${H * .62} ${X(.36)} ${H} H0Z" fill="${c.accent2}" fill-opacity=".35"/>`
        + `<path d="M0 0 C${X(.18)} ${H * .3} ${X(.04)} ${H * .7} ${X(.22)} ${H} H0Z" fill="${c.accent}" fill-opacity=".55"/>`
        + `<path d="M${X(.05)} 0 C${X(.34)} ${H * .25} ${X(.16)} ${H * .66} ${X(.42)} ${H}" fill="none" stroke="${c.accent}" stroke-opacity=".5" stroke-width="2"/>`
        + `<path d="M${X(.12)} 0 C${X(.4)} ${H * .3} ${X(.22)} ${H * .7} ${X(.5)} ${H}" fill="none" stroke="${c.accent2}" stroke-opacity=".7" stroke-width="1.5"/>`; }},
  banner: {name: 'Banner', head: 'Calibri Light', body: 'Calibri', variants: [
    {bg: '#FFFFFF', title: '#1F2937', text: '#374151', accent: '#2563EB', accent2: '#F59E0B'},
    {bg: '#FFFFFF', title: '#1F2937', text: '#374151', accent: '#B91C1C', accent2: '#FBBF24'},
    {bg: '#FFFFFF', title: '#1F2937', text: '#374151', accent: '#0F766E', accent2: '#F97316'},
    {bg: '#F8F5EE', title: '#2F3618', text: '#3F3F2F', accent: '#4D5B2A', accent2: '#C2410C'}],
    lay: {ins: [.06, .06, .05, .12], title: {x: .07, y: .18, w: .86, h: .42, sy: .76, sh: .16, sc: '#FFFFFF'}},
    deco: (W, H, c, big) => big ? `<rect x="0" y="${H * .72}" width="${W}" height="${H * .28}" fill="${c.accent}"/><rect x="0" y="${H * .72 - 7}" width="${W}" height="4" fill="${c.accent2}"/>`
      : `<rect x="0" y="${H - 30}" width="${W}" height="30" fill="${c.accent}"/><rect x="0" y="${H - 35}" width="${W}" height="3" fill="${c.accent2}"/>`},
  shards: {name: 'Shards', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#1F2430', title: '#FFFFFF', text: '#D1D5DB', accent: '#F59E0B', accent2: '#EF4444'},
    {bg: '#FFFFFF', title: '#111827', text: '#374151', accent: '#0EA5E9', accent2: '#6366F1'},
    {bg: '#14213D', title: '#FFFFFF', text: '#E5E5E5', accent: '#FCA311', accent2: '#E5E5E5'},
    {bg: '#FFFFFF', title: '#500724', text: '#3F3F46', accent: '#DB2777', accent2: '#F472B6'}],
    lay: {ins: [.06, .2, .05, .08], title: {x: .07, y: .2, w: .52, h: .4, sy: .64, sh: .18}},
    deco: (W, H, c, big) => { const X = v => big ? W * v : W * (1 - (1 - v) * 0.35);
      return P([[X(.64), 0], [W, 0], [W, H], [X(.82), H]], `fill="${c.accent}"`) + P([[X(.56), 0], [X(.66), 0], [X(.84), H], [X(.76), H]], `fill="${c.accent2}" fill-opacity=".85"`)
        + P([[X(.74), 0], [X(.78), 0], [X(.96), H], [X(.92), H]], `fill="#FFFFFF" fill-opacity=".22"`); }},
  column: {name: 'Column', head: 'Georgia', body: 'Calibri', variants: [
    {bg: '#FFFFFF', title: '#1E293B', text: '#334155', accent: '#1D4ED8', accent2: '#38BDF8'},
    {bg: '#FFFFFF', title: '#431407', text: '#44403C', accent: '#7C2D12', accent2: '#FB923C'},
    {bg: '#FFFFFF', title: '#022C22', text: '#334155', accent: '#065F46', accent2: '#34D399'},
    {bg: '#F1F5F9', title: '#0F172A', text: '#334155', accent: '#334155', accent2: '#F43F5E'}],
    lay: {ins: [.08, .06, .05, .08], title: {x: .41, y: .18, w: .53, h: .42, sy: .64, sh: .18}},
    deco: (W, H, c, big) => big ? `<rect width="${W * .35}" height="${H}" fill="${c.accent}"/><rect x="${W * .35}" width="6" height="${H}" fill="${c.accent2}"/><rect x="${W * .06}" y="${H * .6}" width="${W * .12}" height="4" fill="#FFFFFF" fill-opacity=".7"/>`
      : `<rect width="${W * .035}" height="${H}" fill="${c.accent}"/><rect x="${W * .035}" width="3" height="${H}" fill="${c.accent2}"/>`},
  night: {name: 'Night sky', head: 'Century Gothic', body: 'Century Gothic', variants: [
    {bg: '#0B1026', title: '#FFFFFF', text: '#C7D2FE', accent: '#6366F1', accent2: '#F0ABFC'},
    {bg: '#04131A', title: '#FFFFFF', text: '#CFFAFE', accent: '#06B6D4', accent2: '#A7F3D0'},
    {bg: '#1C0B19', title: '#FFFFFF', text: '#FCE7F3', accent: '#F472B6', accent2: '#FDE68A'}],
    lay: {ins: [.07, .07, .05, .08], title: {x: .1, y: .2, w: .8, h: .36, sy: .6, sh: .16, align: 'center'}},
    deco: (W, H, c, big, u) => { const g = u('n'), r = rnd(7); let s = `<defs><radialGradient id="${g}" cx=".8" cy=".1" r="1"><stop offset="0" stop-color="${tint(c.bg, .14)}"/><stop offset="1" stop-color="${c.bg}"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`;
      for (let i = 0; i < (big ? 90 : 55); i++){ const x = r() * W, y = r() * H, rr = r() < .12 ? 1.6 : r() * .9 + .3; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}" fill="#FFFFFF" fill-opacity="${(r() * .6 + .3).toFixed(2)}"/>`; }
      const R = H * (big ? .62 : .38); return s + `<circle cx="${W * .95}" cy="${H + R * .45}" r="${R}" fill="${c.accent}" fill-opacity=".55"/><circle cx="${W * .95}" cy="${H + R * .45}" r="${R * 1.12}" fill="none" stroke="${c.accent2}" stroke-opacity=".6" stroke-width="1.5"/>`; }},
  circuit: {name: 'Circuit', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#0A192F', title: '#E6F1FF', text: '#A8B2D1', accent: '#64FFDA', accent2: '#57CBFF'},
    {bg: '#101010', title: '#FFFFFF', text: '#CCCCCC', accent: '#39FF14', accent2: '#00E5FF'},
    {bg: '#FFFFFF', title: '#0F172A', text: '#334155', accent: '#0284C7', accent2: '#22C55E'}],
    lay: {ins: [.06, .17, .05, .08], title: {x: .07, y: .2, w: .55, h: .4, sy: .64, sh: .18}},
    deco: (W, H, c, big) => { const x0 = W * (big ? .62 : .86), r = rnd(11); let s = '';
      for (let i = 0; i < (big ? 14 : 8); i++){ const y = H * (i + .5) / (big ? 14 : 8), xa = x0 + r() * (W - x0) * .5, xb = xa + 20 + r() * 40, dy = (r() < .5 ? -1 : 1) * (12 + r() * 20);
        const col = i % 3 ? c.accent : c.accent2; s += `<path d="M${W} ${y.toFixed(1)}H${xb.toFixed(1)}L${(xb - Math.abs(dy)).toFixed(1)} ${(y + dy).toFixed(1)}H${xa.toFixed(1)}" fill="none" stroke="${col}" stroke-opacity=".55" stroke-width="1.6"/><circle cx="${xa.toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="3.2" fill="${c.bg}" stroke="${col}" stroke-width="1.6"/>`; }
      return s; }},
  frame: {name: 'Frame', head: 'Garamond', body: 'Garamond', variants: [
    {bg: '#FFFFFF', title: '#3F2A14', text: '#3B3B3B', accent: '#8B5E34', accent2: '#C9A227'},
    {bg: '#FDFBF7', title: '#1F3A5F', text: '#2F3B4A', accent: '#1F3A5F', accent2: '#B08D57'},
    {bg: '#1E1E1E', title: '#F5F0E6', text: '#DDDDDD', accent: '#C9A227', accent2: '#8B5E34'}],
    lay: {ins: [.08, .08, .08, .1], title: {x: .12, y: .2, w: .76, h: .36, sy: .62, sh: .16, align: 'center'}},
    deco: (W, H, c, big) => { const m = 18; let s = `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${c.accent}" stroke-width="2.5"/><rect x="${m + 6}" y="${m + 6}" width="${W - 2 * m - 12}" height="${H - 2 * m - 12}" fill="none" stroke="${c.accent2}" stroke-width="1"/>`;
      for (const [x, y] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) s += `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="${c.accent2}" transform="rotate(45 ${x} ${y})"/>`;
      if (big) s += `<rect x="${W * .42}" y="${H * .585}" width="${W * .16}" height="2" fill="${c.accent2}"/>`; return s; }},
  bubbles: {name: 'Bubbles', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#FFFFFF', title: '#0C4A6E', text: '#334155', accent: '#0EA5E9', accent2: '#22D3EE'},
    {bg: '#FFFFFF', title: '#3B0764', text: '#3F3F46', accent: '#8B5CF6', accent2: '#F472B6'},
    {bg: '#FFFFFF', title: '#7C2D12', text: '#44403C', accent: '#F97316', accent2: '#FACC15'},
    {bg: '#0F172A', title: '#FFFFFF', text: '#CBD5E1', accent: '#38BDF8', accent2: '#A78BFA'}],
    lay: {ins: [.06, .13, .05, .08], title: {x: .07, y: .3, w: .58, h: .34, sy: .66, sh: .16}},
    deco: (W, H, c, big) => big
      ? `<circle cx="${W * .86}" cy="${H * .2}" r="${H * .36}" fill="${c.accent}" fill-opacity=".9"/><circle cx="${W * .66}" cy="${H * .05}" r="${H * .14}" fill="${c.accent2}" fill-opacity=".85"/><circle cx="${W * .97}" cy="${H * .62}" r="${H * .13}" fill="${c.accent}" fill-opacity=".45"/><circle cx="${W * .74}" cy="${H * .5}" r="${H * .05}" fill="${c.accent2}" fill-opacity=".7"/><circle cx="${W * .9}" cy="${H * .85}" r="${H * .07}" fill="${c.accent2}" fill-opacity=".35"/>`
      : `<circle cx="${W * .985}" cy="${H * .02}" r="${H * .15}" fill="${c.accent}" fill-opacity=".9"/><circle cx="${W * .9}" cy="${H * .02}" r="${H * .06}" fill="${c.accent2}" fill-opacity=".8"/><circle cx="${W * .975}" cy="${H * .3}" r="${H * .035}" fill="${c.accent2}" fill-opacity=".6"/>`},
  gradient: {name: 'Gradient', head: 'Montserrat', body: 'Open Sans', variants: [
    {bg: '#4F46E5', title: '#FFFFFF', text: '#EEF2FF', accent: '#4F46E5', accent2: '#DB2777'},
    {bg: '#0EA5E9', title: '#FFFFFF', text: '#ECFEFF', accent: '#0EA5E9', accent2: '#10B981'},
    {bg: '#F97316', title: '#FFFFFF', text: '#FFF7ED', accent: '#F97316', accent2: '#DB2777'},
    {bg: '#1E3A8A', title: '#FFFFFF', text: '#DBEAFE', accent: '#1E3A8A', accent2: '#0F172A'}],
    lay: {ins: [.07, .07, .05, .08], title: {x: .1, y: .2, w: .8, h: .36, sy: .6, sh: .16, align: 'center'}},
    deco: (W, H, c, big, u) => { const g = u('g'); return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.accent}"/><stop offset="1" stop-color="${c.accent2}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`
      + `<circle cx="${W * .9}" cy="${H * .1}" r="${H * (big ? .45 : .3)}" fill="#FFFFFF" fill-opacity=".08"/><circle cx="${W * .05}" cy="${H * .95}" r="${H * (big ? .35 : .2)}" fill="#FFFFFF" fill-opacity=".07"/>`; }},
  neon: {name: 'Neon', head: 'Montserrat', body: 'Montserrat', variants: [
    {bg: '#0D0221', title: '#FFFFFF', text: '#E0D7FF', accent: '#FF2E97', accent2: '#00F0FF', accent3: '#FFD319'},
    {bg: '#03001C', title: '#FFFFFF', text: '#D8F3EC', accent: '#B6EADA', accent2: '#5B8FB9', accent3: '#E94560'},
    {bg: '#FFFFFF', title: '#111111', text: '#333333', accent: '#FF2E97', accent2: '#00B4D8', accent3: '#FFB703'}],
    lay: {ins: [.06, .1, .05, .12], title: {x: .07, y: .18, w: .7, h: .4, sy: .62, sh: .16}},
    deco: (W, H, c, big, u) => { const cols = [c.accent, c.accent2, c.accent3 || c.accent, c.accent2, c.accent, c.accent3 || c.accent2]; let s = '<defs>';
      cols.forEach((col, i) => s += `<linearGradient id="${u('v' + i)}" x1="0" x2="1"><stop offset="0" stop-color="${col}" stop-opacity="0"/><stop offset="1" stop-color="${col}"/></linearGradient>`); s += '</defs>';
      const n = big ? 6 : 3; for (let i = 0; i < n; i++){ const y0 = H * (big ? .62 + i * .07 : .86 + i * .05), x0 = big ? W * (.1 + i * .05) : W * (.55 + i * .06); s += `<path d="M${x0} ${H + 4} Q${W * .82} ${y0} ${W + 4} ${y0 - H * (big ? .4 : .14)}" fill="none" stroke="url(#${u('v' + i)})" stroke-width="${big ? 2.2 : 1.8}"/>`; }
      return s; }},
  blocks: {name: 'Blocks', head: 'Franklin Gothic', body: 'Franklin Gothic', variants: [
    {bg: '#FFFFFF', title: '#1F1F1F', text: '#333333', accent: '#E8590C', accent2: '#1F1F1F'},
    {bg: '#FFFFFF', title: '#1F1F1F', text: '#333333', accent: '#1971C2', accent2: '#212529'},
    {bg: '#FFFFFF', title: '#1F1F1F', text: '#333333', accent: '#2B8A3E', accent2: '#212529'},
    {bg: '#FFFFFF', title: '#1F1F1F', text: '#333333', accent: '#C2255C', accent2: '#212529'}],
    lay: {ins: [.06, .06, .02, .08], ct: '#FFFFFF', title: {x: .06, y: .2, w: .48, h: .42, sy: .66, sh: .18, tc: '#FFFFFF', sc: '#FFFFFF'}},
    deco: (W, H, c, big) => big ? `<rect width="${W * .58}" height="${H}" fill="${c.accent}"/><rect x="${W * .58}" y="${H * .78}" width="${W * .42}" height="${H * .22}" fill="${c.accent2}"/><rect x="${W * .88}" y="${H * .08}" width="${W * .06}" height="${W * .06}" fill="${c.accent}"/>`
      : `<rect width="${W}" height="${H * .19}" fill="${c.accent}"/><rect x="${W * .9}" y="${H * .19}" width="${W * .1}" height="8" fill="${c.accent2}"/>`},
  curve: {name: 'Curve', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#FFFFFF', title: '#1E1B4B', text: '#374151', accent: '#4338CA', accent2: '#A5B4FC'},
    {bg: '#FFFFFF', title: '#134E4A', text: '#374151', accent: '#0F766E', accent2: '#5EEAD4'},
    {bg: '#FFFFFF', title: '#4C0519', text: '#3F3F46', accent: '#BE123C', accent2: '#FDA4AF'},
    {bg: '#111827', title: '#FFFFFF', text: '#D1D5DB', accent: '#F59E0B', accent2: '#FCD34D'}],
    lay: {ins: [.06, .15, .05, .08], title: {x: .07, y: .2, w: .55, h: .4, sy: .64, sh: .18}},
    deco: (W, H, c, big) => { const x = big ? .62 : .87;
      return `<path d="M${W * (x + .06)} 0 C${W * (x - .04)} ${H * .35} ${W * (x + .1)} ${H * .7} ${W * (x + .02)} ${H} H${W}V0Z" fill="${c.accent2}" fill-opacity=".6"/>`
        + `<path d="M${W * (x + .12)} 0 C${W * (x + .02)} ${H * .4} ${W * (x + .16)} ${H * .7} ${W * (x + .08)} ${H} H${W}V0Z" fill="${c.accent}"/>`; }},
  clinic: {name: 'Clinic', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#FFFFFF', title: '#0B4F5C', text: '#24343A', accent: '#0F8B8D', accent2: '#F2A541'},
    {bg: '#FFFFFF', title: '#1E3A5F', text: '#25313D', accent: '#2B6CB0', accent2: '#68D391'},
    {bg: '#FFFFFF', title: '#5B1A2E', text: '#33282B', accent: '#9B2C4E', accent2: '#F6AD55'}],
    lay: {ins: [.06, .06, .06, .08], title: {x: .06, y: .16, w: .88, h: .4, sy: .68, sh: .2, sc: '#FFFFFF'}},
    deco: (W, H, c, big) => big ? `<rect y="${H * .62}" width="${W}" height="${H * .38}" fill="${c.accent}"/><rect y="${H * .62 - 6}" width="${W}" height="6" fill="${c.accent2}"/>` : `<rect width="${W}" height="10" fill="${c.accent}"/><rect y="${H - 6}" width="${W}" height="6" fill="${c.accent2}"/>`},
  slate: {name: 'Slate', head: 'Segoe UI', body: 'Segoe UI', variants: [
    {bg: '#1C2333', title: '#FFFFFF', text: '#D9DEEA', accent: '#6C8CFF', accent2: '#FFB454'},
    {bg: '#23262B', title: '#FFFFFF', text: '#DADDE2', accent: '#4FD1C5', accent2: '#F687B3'},
    {bg: '#2D2A26', title: '#FFFFFF', text: '#E8E2D8', accent: '#F6AD55', accent2: '#90CDF4'}],
    lay: {ins: [.07, .06, .05, .08], title: {x: .08, y: .2, w: .84, h: .38, sy: .62, sh: .18}},
    deco: (W, H, c, big) => big ? `<rect width="18" height="${H}" fill="${c.accent}"/><rect x="${W - 160}" y="${H - 10}" width="160" height="10" fill="${c.accent2}"/>` : `<rect width="10" height="${H}" fill="${c.accent}"/>`},
  sunset: {name: 'Sunset', head: 'Georgia', body: 'Calibri', variants: [
    {bg: '#FFF8F1', title: '#7A2E12', text: '#3D2A20', accent: '#E0603F', accent2: '#3A7D6B'},
    {bg: '#FFF8F1', title: '#5A2A50', text: '#3B2A37', accent: '#C2477A', accent2: '#F2A541'},
    {bg: '#F6F7F2', title: '#2F4A21', text: '#2E3328', accent: '#6A994E', accent2: '#BC4749'}],
    lay: {ins: [.06, .08, .05, .08], title: {x: .06, y: .2, w: .6, h: .38, sy: .62, sh: .18}},
    deco: (W, H, c, big) => big ? `<rect x="${W * .72}" width="${W * .28}" height="${H}" fill="${c.accent}"/><rect x="${W * .72 - 8}" width="8" height="${H}" fill="${c.accent2}"/>` : `<rect x="${W - 24}" width="24" height="${H}" fill="${c.accent}"/>`},
  ink: {name: 'Ink', head: 'Georgia', body: 'Georgia', variants: [
    {bg: '#FFFFFF', title: '#111111', text: '#222222', accent: '#111111', accent2: '#C8102E'},
    {bg: '#FFFFFF', title: '#0B2545', text: '#1F2A37', accent: '#0B2545', accent2: '#13A89E'},
    {bg: '#111111', title: '#FFFFFF', text: '#E5E5E5', accent: '#FFFFFF', accent2: '#E63946'}],
    deco: (W, H, c, big) => big ? `<rect x="${W * .08}" y="${H * .6}" width="${W * .18}" height="4" fill="${c.accent2}"/>` : `<rect x="${W * .06}" y="${H * .205}" width="${W * .88}" height="1.5" fill="${c.accent}"/>`},
  forest: {name: 'Forest', head: 'Trebuchet MS', body: 'Trebuchet MS', variants: [
    {bg: '#F4F7F2', title: '#1E4D2B', text: '#26332A', accent: '#2E7D4F', accent2: '#B5883E'},
    {bg: '#F3F6F9', title: '#16324F', text: '#24303C', accent: '#2A6F97', accent2: '#A9D6E5'},
    {bg: '#FAF6F0', title: '#5C3D2E', text: '#3D2F28', accent: '#8C5A3C', accent2: '#D4A373'}],
    lay: {ins: [.06, .06, .06, .08], title: {x: .06, y: .16, w: .88, h: .4, sy: .68, sh: .2, sc: '#FFFFFF'}},
    deco: (W, H, c, big) => big ? `<rect y="${H * .62}" width="${W}" height="${H * .38}" fill="${c.accent}"/><rect y="${H * .62 - 6}" width="${W}" height="6" fill="${c.accent2}"/>` : `<rect width="${W}" height="10" fill="${c.accent}"/><rect y="${H - 6}" width="${W}" height="6" fill="${c.accent2}"/>`},
  royal: {name: 'Royal', head: 'Century Gothic', body: 'Century Gothic', variants: [
    {bg: '#24123F', title: '#FFFFFF', text: '#E7DDF7', accent: '#B387FF', accent2: '#FFD166'},
    {bg: '#0F2027', title: '#FFFFFF', text: '#D9E9EE', accent: '#2C9CB8', accent2: '#FFD166'},
    {bg: '#3B0D11', title: '#FFFFFF', text: '#F5DADC', accent: '#E05263', accent2: '#FFD166'}],
    lay: {ins: [.06, .08, .05, .08], title: {x: .06, y: .2, w: .6, h: .38, sy: .62, sh: .18}},
    deco: (W, H, c, big) => big ? `<rect x="${W * .72}" width="${W * .28}" height="${H}" fill="${c.accent}"/><rect x="${W * .72 - 8}" width="8" height="${H}" fill="${c.accent2}"/>` : `<rect x="${W - 24}" width="24" height="${H}" fill="${c.accent}"/>`},
  paper: {name: 'Paper', head: 'Garamond', body: 'Garamond', variants: [
    {bg: '#FBF7EE', title: '#2C2A26', text: '#3B3833', accent: '#8C5E3C', accent2: '#3F6E8C'},
    {bg: '#F4F1EA', title: '#1F2D3D', text: '#2F3A45', accent: '#3F6E8C', accent2: '#8C5E3C'},
    {bg: '#F7F3E8', title: '#33401F', text: '#3A3F30', accent: '#6B7F3A', accent2: '#A0522D'}],
    deco: (W, H, c, big) => (big ? `<rect x="${W * .08}" y="${H * .6}" width="${W * .18}" height="4" fill="${c.accent2}"/>` : `<rect x="${W * .06}" y="${H * .205}" width="${W * .88}" height="1.5" fill="${c.accent}"/>`) + `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${c.accent}" stroke-opacity=".35" stroke-width="1"/>`},
};
const THEME_ORDER = ['office', 'prism', 'aurora', 'breeze', 'banner', 'shards', 'column', 'night', 'circuit', 'frame', 'bubbles', 'gradient', 'neon', 'blocks', 'curve', 'clinic', 'slate', 'sunset', 'ink', 'forest', 'royal', 'paper'];
const DEFAULT_LAY = {ins: [.06, .06, .05, .08], title: {x: .06, y: .2, w: .88, h: .38, sy: .62, sh: .18}};

function themeOf(deck){
  if (deck.theme === 'custom' && deck.themeData) return {lay: DEFAULT_LAY, ...deck.themeData, deco: () => '', key: 'custom'};
  const t = THEMES[deck.theme] || THEMES.office; const v = t.variants[deck.variant || 0] || t.variants[0];
  return {lay: DEFAULT_LAY, ...t, ...v, key: THEMES[deck.theme] ? deck.theme : 'office'};
}
/* colour of a slide's background (for picking readable text) */
function bgTone(bg, th){ if (!bg) return th.key === 'gradient' ? mix(th.accent, th.accent2, .5) : th.bg; if (bg.gradient) return mix(bg.gradient.a, bg.gradient.b, .5); return bg.color || '#FFFFFF'; }
/* the theme as seen on one slide: text turns light on dark backgrounds and dark on light ones, like PowerPoint */
function slideTheme(deck, slide){
  const th = themeOf(deck); if (!slide || !slide.bg || slide.bg.image) return th;
  const dark = isDark(bgTone(slide.bg, th)), tDark = isDark(th.text);
  if (dark && tDark) return {...th, title: '#FFFFFF', text: '#F2F2F2', bg: bgTone(slide.bg, th)};
  if (!dark && !tDark) return {...th, title: '#1F1F1F', text: '#333333', bg: bgTone(slide.bg, th)};
  return th;
}
let _svgN = 0;
/* the theme's background art for a slide, as an SVG string ('' when none) */
function decoSvg(deck, slide){
  if (slide.noDeco || (slide.bg && slide.bg.image)) return '';
  const th = themeOf(deck), W = deck.size.w, H = deck.size.h, big = slide.layout === 'title' || slide.layout === 'section';
  const n = ++_svgN; const u = k => `t${n}${k}`;
  const art = th.deco ? th.deco(W, H, th, big, u) : ''; if (!art) return '';
  return `<svg class="deco" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">${art}</svg>`;
}
function bgCss(bg, deck){
  if (bg.image) return `${bg.color || '#fff'} url("${mediaSrc(deck, bg.image)}") center/cover no-repeat`;
  if (bg.gradient){ const g = bg.gradient; return g.radial ? `radial-gradient(circle at 50% 45%, ${g.a}, ${g.b} 75%)` : `linear-gradient(${g.angle || 180}deg, ${g.a}, ${g.b})`; }
  return bg.color || '#FFFFFF';
}
/* PowerPoint's 12 "Background Styles", made from the theme's colours */
function bgStyles(th){
  const a = th.accent, b = th.accent2 || th.accent, L = (x, y, ang = 180) => ({gradient: {a: x, b: y, angle: ang}}), R = (x, y) => ({gradient: {a: x, b: y, radial: true}});
  return [{color: '#FFFFFF'}, {color: tint(a, .9)}, {color: shade(a, .6)}, {color: '#1E1E1E'},
    L('#FFFFFF', tint(a, .8)), L(tint(a, .85), tint(b, .8), 135), L(shade(a, .35), shade(a, .78)), L(a, b, 135),
    R('#FFFFFF', tint(a, .72)), R(tint(b, .85), tint(a, .55)), R(shade(a, .2), shade(a, .8)), R('#3A3A3A', '#0A0A0A')];
}
/* full background (fill + picture + theme art) as one SVG document, for PowerPoint export */
function backgroundSvg(deck, slide){
  const W = deck.size.w, H = deck.size.h, bg = slideBg(slide, deck); let fill = '', defs = '';
  if (bg.gradient){ const g = bg.gradient; if (g.radial) defs = `<radialGradient id="bgx" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="${g.a}"/><stop offset="1" stop-color="${g.b}"/></radialGradient>`;
    else { const r = ((g.angle || 180) - 90) * Math.PI / 180, x = Math.cos(r) / 2, y = Math.sin(r) / 2; defs = `<linearGradient id="bgx" x1="${.5 - x}" y1="${.5 - y}" x2="${.5 + x}" y2="${.5 + y}"><stop offset="0" stop-color="${g.a}"/><stop offset="1" stop-color="${g.b}"/></linearGradient>`; }
    fill = `<rect width="${W}" height="${H}" fill="url(#bgx)"/>`;
  } else fill = `<rect width="${W}" height="${H}" fill="${bg.color || '#FFFFFF'}"/>`;
  const img = bg.image ? `<image href="${mediaSrc(deck, bg.image)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : '';
  const art = decoSvg(deck, slide).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return {plain: !bg.gradient && !img && !art, color: bg.color || '#FFFFFF', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${fill}${img}${art}</svg>`};
}
