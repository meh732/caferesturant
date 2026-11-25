; Arka POS Electron Windows SERVER Edition (Bundled PostgreSQL + 24/7 Background Server + Custom Port)
; Included by electron-builder NSIS

!macro customInit
  ; Stop any running GUI / background server instances cleanly before upgrading files (preserving all PostgreSQL data!)
  nsExec::Exec 'taskkill /F /IM "ArkaPOS-Server.exe" /T'
  Sleep 800
!macroend

!macro customInstall
  DetailPrint "Configuring Arka POS Server Port, PostgreSQL & 24/7 Background Service..."
  IfSilent silent_electron_pg_setup interactive_electron_pg_setup

  interactive_electron_pg_setup:
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup-win-postgres.ps1" -InstallDir "$INSTDIR" -Interactive'
    Goto electron_bg_service_setup

  silent_electron_pg_setup:
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup-win-postgres.ps1" -InstallDir "$INSTDIR"'

  electron_bg_service_setup:
    DetailPrint "Installing 24/7 Arka POS Background Server service (stays active even when GUI is closed)..."
    nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup-win-background-service.ps1" -InstallDir "$INSTDIR"'
    DetailPrint "Arka POS Electron Server + PostgreSQL installed successfully!"
!macroend

!macro customUnInstall
  DetailPrint "Stopping Arka POS Server & local PostgreSQL cleanly (database files in LocalAppData are preserved)..."
  nsExec::Exec 'schtasks /Delete /TN "ArkaPOS_Background_Server" /F'
  nsExec::Exec 'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "ArkaPOSBackgroundServer" /f'
  nsExec::Exec 'taskkill /F /IM "ArkaPOS-Server.exe" /T'
  nsExec::Exec '"$INSTDIR\resources\postgres\bin\pg_ctl.exe" -D "$LOCALAPPDATA\ArkaPOS\pgdata" stop -m fast'
  Sleep 1000
!macroend
