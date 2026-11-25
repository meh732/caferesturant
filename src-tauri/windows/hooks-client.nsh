; Arka POS Windows CLIENT Edition (Lightweight - No PostgreSQL, Connects to Central Server)
; NSIS Installer Hooks for Tauri v2

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping any running Arka POS Client instances before update..."
  nsExec::Exec 'taskkill /F /IM "ArkaPOS-Client.exe" /T'
  Sleep 800
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Configuring Arka POS Client connection..."
  IfSilent client_setup_done

  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $$dir = Join-Path $$env:LOCALAPPDATA ''ArkaPOS-Client''; New-Item -ItemType Directory -Force -Path $$dir | Out-Null; $$cfgPath = Join-Path $$dir ''client-config.json''; $$defUrl = ''http://192.168.1.100:3000''; if (Test-Path $$cfgPath) { try { $$j = Get-Content $$cfgPath -Raw | ConvertFrom-Json; if ($$j.serverUrl) { $$defUrl = $$j.serverUrl } } catch {} }; $$f = New-Object System.Windows.Forms.Form; $$f.Text = ''اتصال کلاینت آرکا پوز به سرور مرکزی''; $$f.Size = New-Object System.Drawing.Size(440, 210); $$f.StartPosition = ''CenterScreen''; $$f.FormBorderStyle = ''FixedDialog''; $$f.TopMost = $$true; $$f.RightToLeft = ''Yes''; $$f.RightToLeftLayout = $$true; $$f.Font = New-Object System.Drawing.Font(''Tahoma'', 9.5); $$l = New-Object System.Windows.Forms.Label; $$l.Text = ''آدرس IP و پورت سرور مرکزی آرکا را وارد نمایید (مثال: http://192.168.1.100:3000):''; $$l.Location = New-Object System.Drawing.Point(20, 20); $$l.Size = New-Object System.Drawing.Size(390, 40); $$f.Controls.Add($$l); $$t = New-Object System.Windows.Forms.TextBox; $$t.Text = $$defUrl; $$t.Location = New-Object System.Drawing.Point(20, 70); $$t.Size = New-Object System.Drawing.Size(385, 28); $$t.RightToLeft = ''No''; $$f.Controls.Add($$t); $$b = New-Object System.Windows.Forms.Button; $$b.Text = ''ذخیره آدرس سرور و پایان نصب''; $$b.Location = New-Object System.Drawing.Point(110, 115); $$b.Size = New-Object System.Drawing.Size(210, 36); $$b.DialogResult = ''OK''; $$f.AcceptButton = $$b; $$f.Controls.Add($$b); if ($$f.ShowDialog() -eq ''OK'') { $$u = $$t.Text.Trim(); if ($$u) { $$json = (@{ edition = ''client''; serverUrl = $$u } | ConvertTo-Json); [System.IO.File]::WriteAllText($$cfgPath, $$json, (New-Object System.Text.UTF8Encoding($$false))) } }"'

  client_setup_done:
    DetailPrint "Arka POS Client successfully installed!"
!macroend
