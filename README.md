# SRK

PDF reader and toolkit for Android by ShazVerse Technologies.

Read PDFs, scan documents with the camera, merge, split, compress, convert to and from Word, Excel and PowerPoint, edit, sign, protect, unlock and redact. Everything runs on the phone; files are never uploaded.

## Get the app
Open **Releases** on this repository and download the latest `SRK.apk`. On the phone, open the file and allow installing from this source when asked.

## How it is built
- The app pages live in `app/src/main/assets/www` (made from the SRK web app with `build_assets.py`, which bundles PDF.js 3.11.174, pdf-lib 1.17.1, JSZip 3.10.1, html2canvas 1.4.1 and PptxGenJS 4.0.1 so it works offline).
- `MainActivity.java` hosts them in a WebView and adds the camera and file picker, saving to Downloads/SRK, sharing, and "Open with SRK" for PDFs.
- Every push to `main` builds a signed APK with GitHub Actions and publishes it as a release.
- `app/srk.keystore` signs every build with the same key so updates install over the old app. Keep this repository private.
