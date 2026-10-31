#!/usr/bin/env python3
"""Download the SRK Sheets fonts from Google Fonts into the app (runs on GitHub Actions, which has internet).
Keeps only the Latin and Tamil character sets, regular/bold/italic, as woff2."""
import os, re, sys, time, hashlib, urllib.request, urllib.error, urllib.parse

OUT = 'app/src/main/assets/www/fonts'
UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
KEEP = {'latin', 'tamil'}
# metric-compatible stand-ins for Office fonts, plus the app's own UI fonts
families = ['Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'Gelasio', 'Open Sans', 'Noto Sans', 'Noto Serif', 'Noto Sans Tamil', 'IBM Plex Sans', 'IBM Plex Mono', 'Bricolage Grotesque']
print(len(families), 'families')

def get(url, binary=False):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                return data if binary else data.decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code == 400: return None  # that style combination doesn't exist for this family
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f'ERROR: could not download {url}')

os.makedirs(OUT, exist_ok=True)
css_out, missing, total = [], [], 0
for fam in families:
    q = urllib.parse.quote(fam).replace('%20', '+')
    css = None
    for spec in (':ital,wght@0,400;0,700;1,400;1,700', ':wght@400;700', ''):
        css = get(f'https://fonts.googleapis.com/css2?family={q}{spec}&display=swap')
        if css: break
    if not css:
        missing.append(fam); continue
    for subset, face in re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})', css):
        if subset not in KEEP: continue
        url = re.search(r'url\((https://[^)]+)\)', face).group(1)
        fn = hashlib.sha1(url.encode()).hexdigest()[:16] + '.woff2'
        path = os.path.join(OUT, fn)
        if not os.path.exists(path):
            data = get(url, binary=True); open(path, 'wb').write(data); total += len(data)
        css_out.append(face.replace(url, fn))
open(os.path.join(OUT, 'fonts.css'), 'w', encoding='utf-8').write('\n'.join(css_out) + '\n')
print(f'{len(css_out)} font faces, {total // 1024} KB downloaded')
if missing: print('::warning::Not on Google Fonts: ' + ', '.join(missing))
if len(missing) > len(families) // 3: sys.exit('ERROR: too many fonts missing')
