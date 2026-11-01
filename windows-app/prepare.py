#!/usr/bin/env python3
"""Copy the five SRK web apps (the same offline files the Android apps ship) into windows-app/apps/<name>."""
import os, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SRC = {'pdf': 'app', 'docs': 'docs-app/app', 'slides': 'slides-app/app', 'sheets': 'sheets-app/app', 'notes': 'notes-app/app', 'share': 'share-app/app'}
out = os.path.join(HERE, 'apps'); shutil.rmtree(out, ignore_errors=True)
for k, d in SRC.items():
    src = os.path.join(ROOT, d, 'src', 'main', 'assets', 'www')
    assert os.path.isfile(os.path.join(src, 'index.html')), 'missing ' + src
    shutil.copytree(src, os.path.join(out, k))
    fonts = os.path.isdir(os.path.join(out, k, 'fonts'))
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(out, k)) for f in fs)
    print(f'{k:7s} {size // 1024:6d} KB' + ('  (with fonts)' if fonts else ''))
shutil.copy(os.path.join(ROOT, 'share-app', 'share-engine.js'), os.path.join(HERE, 'share-engine.js'))
print('share engine copied')
