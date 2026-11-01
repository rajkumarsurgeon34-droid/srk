#!/usr/bin/env python3
"""Copy the SRK VPN screen into the Android project."""
import os, shutil, sys
WEB = sys.argv[1] if len(sys.argv) > 1 else 'web'
OUT = 'app/src/main/assets/www'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
for f in ('index.html', 'vpn.js'): shutil.copy(os.path.join(WEB, f), OUT)
print('assets ready:', sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) // 1024, 'KB')
