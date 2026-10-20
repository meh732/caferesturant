; ==============================================================================
; Arka Restaurant POS - Windows NSIS Upgrade & Clean Replacement Hook
; Automatically terminates running instances, checks Windows Registry for previous
; installations, uninstalls old versions cleanly, and seamlessly updates to new version.
; ==============================================================================

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Checking and closing running instances of Arka System..."
  
  ; 1. Close any running previous instances to unlock files
  ExecWait 'taskkill /F /IM "ArkaRestaurantPOS.exe" /T'
  ExecWait 'taskkill /F /IM "ArkaSystem.exe" /T'
  ExecWait 'taskkill /F /IM "Arka-POS.exe" /T'
  ExecWait 'taskkill /F /IM "arka-pos.exe" /T'
  ExecWait 'taskkill /F /IM "Arka System.exe" /T'
  ExecWait 'taskkill /F /IM "Arka.exe" /T'
  ExecWait 'taskkill /F /IM "Hami-POS.exe" /T'
  Sleep 600

  ; 2. Check for Previous Installations in Windows Registry
  ; Check Current User registry
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arkasystem.pos" "UninstallString"
  StrCmp $R0 "" check_hkcu_rest run_uninstall

check_hkcu_rest:
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArkaRestaurantPOS" "UninstallString"
  StrCmp $R0 "" check_hkcu_sys run_uninstall

check_hkcu_sys:
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArkaSystem" "UninstallString"
  StrCmp $R0 "" check_hkcu_pos run_uninstall

check_hkcu_pos:
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Arka-POS" "UninstallString"
  StrCmp $R0 "" check_hkcu_guid run_uninstall

check_hkcu_guid:
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\7d9e66b5-b2eb-411f-9c11-a2633154575b" "UninstallString"
  StrCmp $R0 "" check_hklm_64 run_uninstall

check_hklm_64:
  ; Check System-Wide (All Users) registry (64-bit view)
  SetRegView 64
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arkasystem.pos" "UninstallString"
  StrCmp $R0 "" check_hklm_rest_64 run_uninstall

check_hklm_rest_64:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArkaRestaurantPOS" "UninstallString"
  StrCmp $R0 "" check_hklm_sys_64 run_uninstall

check_hklm_sys_64:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArkaSystem" "UninstallString"
  StrCmp $R0 "" check_hklm_pos_64 run_uninstall

check_hklm_pos_64:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Arka-POS" "UninstallString"
  StrCmp $R0 "" check_hklm_guid_64 run_uninstall

check_hklm_guid_64:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\7d9e66b5-b2eb-411f-9c11-a2633154575b" "UninstallString"
  StrCmp $R0 "" check_hklm_32 run_uninstall

check_hklm_32:
  ; Check System-Wide registry (32-bit view)
  SetRegView 32
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arkasystem.pos" "UninstallString"
  StrCmp $R0 "" check_hklm_rest_32 run_uninstall

check_hklm_rest_32:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArkaRestaurantPOS" "UninstallString"
  StrCmp $R0 "" check_hklm_sys_32 run_uninstall

check_hklm_sys_32:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ArkaSystem" "UninstallString"
  StrCmp $R0 "" check_hklm_pos_32 run_uninstall

check_hklm_pos_32:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Arka-POS" "UninstallString"
  StrCmp $R0 "" check_hklm_guid_32 run_uninstall

check_hklm_guid_32:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\7d9e66b5-b2eb-411f-9c11-a2633154575b" "UninstallString"
  StrCmp $R0 "" check_old_install_folders run_uninstall

run_uninstall:
  DetailPrint "Previous installation detected ($R0). Removing old version cleanly..."
  ; Execute previous uninstaller silently
  ExecWait '$R0 /S _?=$INSTDIR'
  Sleep 1200
  Goto check_old_install_folders

check_old_install_folders:
  ; Check common AppData program directories
  IfFileExists "$LOCALAPPDATA\Programs\ArkaRestaurantPOS\uninstall.exe" 0 check_old_sys
  ExecWait '"$LOCALAPPDATA\Programs\ArkaRestaurantPOS\uninstall.exe" /S _?=$LOCALAPPDATA\Programs\ArkaRestaurantPOS'
  Sleep 800

check_old_sys:
  IfFileExists "$LOCALAPPDATA\Programs\ArkaSystem\uninstall.exe" 0 check_old_pos
  ExecWait '"$LOCALAPPDATA\Programs\ArkaSystem\uninstall.exe" /S _?=$LOCALAPPDATA\Programs\ArkaSystem'
  Sleep 800

check_old_pos:
  IfFileExists "$LOCALAPPDATA\Programs\Arka-POS\uninstall.exe" 0 check_pf_rest
  ExecWait '"$LOCALAPPDATA\Programs\Arka-POS\uninstall.exe" /S _?=$LOCALAPPDATA\Programs\Arka-POS'
  Sleep 800

check_pf_rest:
  IfFileExists "$PROGRAMFILES\ArkaRestaurantPOS\uninstall.exe" 0 check_pf_sys
  ExecWait '"$PROGRAMFILES\ArkaRestaurantPOS\uninstall.exe" /S _?=$PROGRAMFILES\ArkaRestaurantPOS'
  Sleep 800

check_pf_sys:
  IfFileExists "$PROGRAMFILES\ArkaSystem\uninstall.exe" 0 check_pf_pos
  ExecWait '"$PROGRAMFILES\ArkaSystem\uninstall.exe" /S _?=$PROGRAMFILES\ArkaSystem'
  Sleep 800

check_pf_pos:
  IfFileExists "$PROGRAMFILES\Arka-POS\uninstall.exe" 0 done
  ExecWait '"$PROGRAMFILES\Arka-POS\uninstall.exe" /S _?=$PROGRAMFILES\Arka-POS'
  Sleep 800

done:
  DetailPrint "Ready to install Arka Restaurant POS."
!macroend
