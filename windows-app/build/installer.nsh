; one Start-menu and desktop shortcut per app, all opening SRK Office with --app=<name>
!macro srkShortcuts
  CreateShortCut "$SMPROGRAMS\SRK.lnk" "$INSTDIR\SRK Office.exe" "--app=pdf" "$INSTDIR\resources\icons\pdf.ico" 0
  CreateShortCut "$SMPROGRAMS\SRK Docs.lnk" "$INSTDIR\SRK Office.exe" "--app=docs" "$INSTDIR\resources\icons\docs.ico" 0
  CreateShortCut "$SMPROGRAMS\SRK Slides.lnk" "$INSTDIR\SRK Office.exe" "--app=slides" "$INSTDIR\resources\icons\slides.ico" 0
  CreateShortCut "$SMPROGRAMS\SRK Sheets.lnk" "$INSTDIR\SRK Office.exe" "--app=sheets" "$INSTDIR\resources\icons\sheets.ico" 0
  CreateShortCut "$SMPROGRAMS\SRK Notes.lnk" "$INSTDIR\SRK Office.exe" "--app=notes" "$INSTDIR\resources\icons\notes.ico" 0
  CreateShortCut "$DESKTOP\SRK.lnk" "$INSTDIR\SRK Office.exe" "--app=pdf" "$INSTDIR\resources\icons\pdf.ico" 0
  CreateShortCut "$DESKTOP\SRK Docs.lnk" "$INSTDIR\SRK Office.exe" "--app=docs" "$INSTDIR\resources\icons\docs.ico" 0
  CreateShortCut "$DESKTOP\SRK Slides.lnk" "$INSTDIR\SRK Office.exe" "--app=slides" "$INSTDIR\resources\icons\slides.ico" 0
  CreateShortCut "$DESKTOP\SRK Sheets.lnk" "$INSTDIR\SRK Office.exe" "--app=sheets" "$INSTDIR\resources\icons\sheets.ico" 0
  CreateShortCut "$DESKTOP\SRK Notes.lnk" "$INSTDIR\SRK Office.exe" "--app=notes" "$INSTDIR\resources\icons\notes.ico" 0
!macroend
!macro customInstall
  !insertmacro srkShortcuts
!macroend
!macro customUnInstall
  Delete "$SMPROGRAMS\SRK.lnk"
  Delete "$SMPROGRAMS\SRK Docs.lnk"
  Delete "$SMPROGRAMS\SRK Slides.lnk"
  Delete "$SMPROGRAMS\SRK Sheets.lnk"
  Delete "$SMPROGRAMS\SRK Notes.lnk"
  Delete "$DESKTOP\SRK.lnk"
  Delete "$DESKTOP\SRK Docs.lnk"
  Delete "$DESKTOP\SRK Slides.lnk"
  Delete "$DESKTOP\SRK Sheets.lnk"
  Delete "$DESKTOP\SRK Notes.lnk"
!macroend
