; Single-app edition (e.g. SRK Torrent): always (re)point the shortcuts at this app's own exe.
; An earlier SRK Office install may have left same-named shortcuts that open "SRK Office.exe --app=...".
!macro customInstall
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0
  WinShell::SetLnkAUMI "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "${APP_ID}"
  WinShell::SetLnkAUMI "$DESKTOP\${PRODUCT_NAME}.lnk" "${APP_ID}"
!macroend
