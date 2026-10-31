#!/usr/bin/env python3
"""Copy the SRK Slides web app into the Android project, swapping CDN libraries for bundled copies (works offline)."""
import os, re, shutil, sys
WEB = sys.argv[1] if len(sys.argv) > 1 else 'web-src'
LIBS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/libs'
OUT = 'app/src/main/assets/www'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT + '/libs')
for name, src in {'jszip.min.js': f'{LIBS}/jszip.min.js', 'pdf-lib.min.js': f'{LIBS}/pdf-lib.min.js', 'html2canvas.min.js': f'{LIBS}/html2canvas.min.js', 'pptxgen.bundle.js': f'{LIBS}/pptxgen.bundle.js'}.items():
    shutil.copy(src, f'{OUT}/libs/{name}')
for f in ('pptx.js', 'model.js', 'editor.js', 'app.js'): shutil.copy(os.path.join(WEB, f), OUT)
shutil.copy('web/native.js', OUT)
body = open(os.path.join(WEB, 'index.html')).read()
body = re.sub(r'<script src="https://cdnjs[^"]+/jszip\.min\.js"></script>', '<script src="libs/jszip.min.js"></script>', body)
body = re.sub(r'<script src="https://cdnjs[^"]+/pdf-lib\.min\.js"></script>', '<script src="libs/pdf-lib.min.js"></script>\n<script src="native.js"></script>', body)
body = re.sub(r'<link rel="(preconnect|stylesheet)" href="https://fonts[^"]+">\n?', '', body)
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
assert 'cdnjs' not in body and 'native.js' in body, 'library swap failed'
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>')
open(f'{OUT}/index.html', 'w').write(head + body + '</body></html>')
print('assets ready:', sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs) // 1024, 'KB')
