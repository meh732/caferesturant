; ==============================================================================
; Arka System - Windows NSIS Upgrade & Clean Replacement Hook
; Automatically terminates running instances, checks Windows Registry for previous
; installations, uninstalls old versions cleanly, and seamlessly updates to new version.
; ==============================================================================

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Checking and closing running instances of Arka System..."
  
  ; 1. Close any running previous instances to unlock files
  ExecWait 'taskkill /F /IM "Arka-POS.exe" /T'
  ExecWait 'taskkill /F /IM "ArkaSystem.exe" /T'
  ExecWait 'taskkill /F /IM "arka-pos.exe" /T'
  ExecWait 'taskkill /F /IM "Arka System.exe" /T'
  Sleep 500

  ; 2. Check for Previous Installations in Windows Registry
  ; Check Current User registry
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arkasystem.pos" "UninstallString"
  StrCmp $R0 "" check_hkcu_guid run_uninstall

check_hkcu_guid:
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\7d9e66b5-b2eb-411f-9c11-a2633154575b" "UninstallString"
  StrCmp $R0 "" check_hklm run_uninstall

check_hklm:
  ; Check System-Wide (All Users) registry (both 64-bit & 32-bit views)
  SetRegView 64
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arkasystem.pos" "UninstallString"
  StrCmp $R0 "" check_hklm_guid run_uninstall

check_hklm_guid:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\7d9e66b5-b2eb-411f-9c11-a2633154575b" "UninstallString"
  StrCmp $R0 "" check_hklm_name run_uninstall

check_hklm_name:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Arka-POS" "UninstallString"
  StrCmp $R0 "" check_hklm_32 run_uninstall

check_hklm_32:
  SetRegView 32
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arkasystem.pos" "UninstallString"
  StrCmp $R0 "" check_hklm_32_guid run_uninstall

check_hklm_32_guid:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\7d9e66b5-b2eb-411f-9c11-a2633154575b" "UninstallString"
  StrCmp $R0 "" check_old_install_folder run_uninstall

run_uninstall:
  DetailPrint "Previous version detected. Removing old installation cleanly..."
  ; Execute previous uninstaller silently
  ExecWait '$R0 /S _?=$INSTDIR'
  Sleep 1000
  Goto done

check_old_install_folder:
  ; Check if default folder has old uninstall.exe
  IfFileExists "$LOCALAPPDATA\Programs\Arka-POS\uninstall.exe" 0 check_pf
  ExecWait '"$LOCALAPPDATA\Programs\Arka-POS\uninstall.exe" /S _?=$LOCALAPPDATA\Programs\Arka-POS'
  Sleep 1000
  Goto done

check_pf:
  IfFileExists "$PROGRAMFILES\Arka-POS\uninstall.exe" 0 done
  ExecWait '"$PROGRAMFILES\Arka-POS\uninstall.exe" /S _?=$PROGRAMFILES\Arka-POS'
  Sleep 1000

done:
  DetailPrint "Ready to install the new version of Arka System."
!macroend
