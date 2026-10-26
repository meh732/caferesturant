; Arka POS Windows NSIS Installer Hooks
; Ensures clean update: terminates running instances and prevents duplicate installations

!macro NSIS_HOOK_PREINSTALL
  ; Terminate any running instances so files are not locked during update
  DetailPrint "Checking for running instances of Arka POS..."
  nsExec::Exec 'taskkill /F /IM "ArkaCafePOS.exe" /IM "arka-pos.exe" /IM "ArkaRestaurantPOS.exe" /T'
  Sleep 1000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Arka POS successfully updated!"
!macroend
