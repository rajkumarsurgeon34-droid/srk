#!/usr/bin/env python3
"""Turn windows-app into a single-app edition, e.g. `python make_edition.py torrent` -> SRK Torrent.exe / SRK-Torrent-Setup.exe.
Run after prepare.py, on the build machine only (it rewrites package.json and apps/ in place)."""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
EDITIONS = {
    'torrent': {
        'name': 'SRK Torrent', 'appId': 'in.shazverse.srktorrent.windows', 'pkg': 'srk-torrent',
        'description': 'SRK Torrent for Windows: a BitTorrent client by ShazVerse Technologies',
        'files': [{'ext': 'torrent', 'name': 'Torrent file', 'description': 'BitTorrent file', 'icon': 'build/icons/torrent.ico', 'role': 'Viewer'}],
        'protocols': [{'name': 'Magnet link', 'schemes': ['magnet']}],
        'extraResources': [{'from': 'build/icons', 'to': 'icons'}, {'from': 'torrent', 'to': 'torrent'}],
    },
}

key = sys.argv[1] if len(sys.argv) > 1 else 'torrent'
E = EDITIONS[key]

# keep only this app's web files
apps = os.path.join(HERE, 'apps')
for d in os.listdir(apps):
    if d != key:
        shutil.rmtree(os.path.join(apps, d))
assert os.path.isfile(os.path.join(apps, key, 'index.html')), 'run prepare.py first'

with open(os.path.join(HERE, 'edition.json'), 'w') as f:
    json.dump({'only': key, 'appId': E['appId']}, f)

p = os.path.join(HERE, 'package.json')
j = json.load(open(p))
j['name'] = E['pkg']; j['productName'] = E['name']; j['description'] = E['description']
b = j['build']
b['appId'] = E['appId']; b['productName'] = E['name']
b['files'] = ['main.js', 'preload.js', 'edition.json', 'apps/**/*', 'build/icons/*.png', 'package.json']
b['extraResources'] = E['extraResources']
b['win']['icon'] = f'build/icons/{key}.ico'
b['win']['artifactName'] = E['name'].replace(' ', '-') + '-Setup-${version}.exe'
b['nsis'] = {
    'oneClick': False, 'perMachine': False, 'allowToChangeInstallationDirectory': True,
    'createDesktopShortcut': True, 'createStartMenuShortcut': True, 'shortcutName': E['name'],
    'installerIcon': f'build/icons/{key}.ico', 'uninstallerIcon': f'build/icons/{key}.ico',
    'uninstallDisplayName': E['name'], 'deleteAppDataOnUninstall': False,
    'include': 'build/edition-installer.nsh',
}
b['fileAssociations'] = E['files']
b['protocols'] = E['protocols']
json.dump(j, open(p, 'w'), indent=2)
print(f"edition: {E['name']} ({E['appId']})")
