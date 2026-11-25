; Arka POS Windows SERVER Edition (with Bundled PostgreSQL + Custom Port + LAN Share)
; NSIS Installer Hooks for Tauri v2

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping any running Arka POS Server instances before update..."
  nsExec::Exec 'taskkill /F /IM "ArkaPOS-Server.exe" /IM "ArkaCafePOS.exe" /IM "arka-pos.exe" /T'
  Sleep 1000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Launching Arka POS Server & PostgreSQL Configuration..."
  IfSilent silent_pg_setup interactive_pg_setup

  interactive_pg_setup:
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup-win-postgres.ps1" -InstallDir "$INSTDIR" -Interactive'
    Goto pg_setup_done

  silent_pg_setup:
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup-win-postgres.ps1" -InstallDir "$INSTDIR"'

  pg_setup_done:
    DetailPrint "Arka POS Server & PostgreSQL setup completed!"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping Arka POS Server & local PostgreSQL cleanly (preserving database files)..."
  nsExec::Exec 'taskkill /F /IM "ArkaPOS-Server.exe" /T'
  nsExec::Exec '"$INSTDIR\resources\postgres\bin\pg_ctl.exe" -D "$LOCALAPPDATA\ArkaPOS\pgdata" stop -m fast'
  Sleep 1000
!macroend
