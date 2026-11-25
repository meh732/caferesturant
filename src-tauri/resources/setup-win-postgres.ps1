param(
  [string]$InstallDir = "",
  [int]$ServerPort = 3000,
  [int]$PgPort = 5432,
  [switch]$Interactive,
  [switch]$ShareLan = $true
)

$ErrorActionPreference = "Continue"

$localApp = $env:LOCALAPPDATA
if (-not $localApp) { $localApp = [Environment]::GetFolderPath("LocalApplicationData") }

$arkaDir = Join-Path $localApp "ArkaPOS"
$arkaLegacyData = Join-Path $localApp "com.arka.restaurantpos\data"
New-Item -ItemType Directory -Force -Path $arkaDir | Out-Null
New-Item -ItemType Directory -Force -Path $arkaLegacyData | Out-Null

$installerCfgPath = Join-Path $arkaDir "installer-config.json"
$pgConfigPath = Join-Path $arkaDir "pg_config.json"
$pgDataDir = Join-Path $arkaDir "pgdata"
$logFile = Join-Path $arkaDir "setup-postgres.log"

function Write-Log($msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Add-Content -Path $logFile -Value "[$ts] $msg" -Encoding UTF8
}

Write-Log "=== Arka POS Server + PostgreSQL Setup Started (InstallDir=$InstallDir) ==="

# Load previous saved ports on upgrade so user sees their existing configuration
if (Test-Path $installerCfgPath) {
  try {
    $prev = Get-Content $installerCfgPath -Raw | ConvertFrom-Json
    if ($prev.serverPort) { $ServerPort = [int]$prev.serverPort }
    if ($prev.pgPort) { $PgPort = [int]$prev.pgPort }
    if ($null -ne $prev.shareLan) { $ShareLan = [bool]$prev.shareLan }
  } catch {}
}

# Detect primary LAN IPv4 to display live connection preview in setup wizard
$detectedLanIp = "192.168.1.10"
try {
  $ipObj = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.IPAddress -ne "0.0.0.0" -and
      $_.InterfaceAlias -notlike "*Loopback*" -and
      $_.InterfaceAlias -notlike "*VirtualBox*"
    } | Select-Object -First 1
  if ($ipObj -and $ipObj.IPAddress) { $detectedLanIp = $ipObj.IPAddress }
} catch {}

# Interactive Windows Setup Wizard Dialog (shown during ArkaPOS-Server.exe installation)
$EnableLanPg = $false
if ($Interactive) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "تنظیم پورت سرور مرکزی آرکا پوز + PostgreSQL"
    $form.Size = New-Object System.Drawing.Size(490, 415)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.RightToLeft = [System.Windows.Forms.RightToLeft]::Yes
    $form.RightToLeftLayout = $true
    $form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
    $form.Font = New-Object System.Drawing.Font("Tahoma", 9.5)

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text = "انتخاب پورت نصب سرور مرکزی و دیتابیس PostgreSQL"
    $lblTitle.Font = New-Object System.Drawing.Font("Tahoma", 11, [System.Drawing.FontStyle]::Bold)
    $lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $lblTitle.Location = New-Object System.Drawing.Point(20, 16)
    $lblTitle.Size = New-Object System.Drawing.Size(440, 28)
    $form.Controls.Add($lblTitle)

    $lblSub = New-Object System.Windows.Forms.Label
    $lblSub.Text = "پورت دلخواه اجرای نرم‌افزار سرور را وارد کنید (بعداً از داخل بخش تنظیمات نرم‌افزار نیز قابل تغییر است). دیتابیس PostgreSQL به صورت خودکار نصب و روی شبکه فعال می‌شود."
    $lblSub.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
    $lblSub.Location = New-Object System.Drawing.Point(20, 46)
    $lblSub.Size = New-Object System.Drawing.Size(440, 46)
    $form.Controls.Add($lblSub)

    $lblPort = New-Object System.Windows.Forms.Label
    $lblPort.Text = "پورت سرور مرکزی آرکا (80 تا 65535):"
    $lblPort.Font = New-Object System.Drawing.Font("Tahoma", 9.5, [System.Drawing.FontStyle]::Bold)
    $lblPort.Location = New-Object System.Drawing.Point(20, 106)
    $lblPort.Size = New-Object System.Drawing.Size(310, 24)
    $form.Controls.Add($lblPort)

    $txtPort = New-Object System.Windows.Forms.TextBox
    $txtPort.Text = "$ServerPort"
    $txtPort.Location = New-Object System.Drawing.Point(340, 103)
    $txtPort.Size = New-Object System.Drawing.Size(110, 28)
    $txtPort.Font = New-Object System.Drawing.Font("Consolas", 11, [System.Drawing.FontStyle]::Bold)
    $txtPort.RightToLeft = [System.Windows.Forms.RightToLeft]::No
    $form.Controls.Add($txtPort)

    $lblPreview = New-Object System.Windows.Forms.Label
    $lblPreview.Text = "آدرس اتصال کلاینت‌ها در شبکه:  http://$($detectedLanIp):$ServerPort"
    $lblPreview.ForeColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
    $lblPreview.Font = New-Object System.Drawing.Font("Tahoma", 8.5, [System.Drawing.FontStyle]::Bold)
    $lblPreview.Location = New-Object System.Drawing.Point(20, 134)
    $lblPreview.Size = New-Object System.Drawing.Size(440, 22)
    $form.Controls.Add($lblPreview)

    $txtPort.Add_TextChanged({
      $p = $txtPort.Text.Trim()
      if ($p) {
        $lblPreview.Text = "آدرس اتصال کلاینت‌ها در شبکه:  http://$($detectedLanIp):$p"
      }
    })

    $lblPgPort = New-Object System.Windows.Forms.Label
    $lblPgPort.Text = "پورت پایگاه داده PostgreSQL (پیش‌فرض 5432):"
    $lblPgPort.Location = New-Object System.Drawing.Point(20, 170)
    $lblPgPort.Size = New-Object System.Drawing.Size(310, 24)
    $form.Controls.Add($lblPgPort)

    $txtPgPort = New-Object System.Windows.Forms.TextBox
    $txtPgPort.Text = "$PgPort"
    $txtPgPort.Location = New-Object System.Drawing.Point(340, 167)
    $txtPgPort.Size = New-Object System.Drawing.Size(110, 26)
    $txtPgPort.Font = New-Object System.Drawing.Font("Consolas", 10.5)
    $txtPgPort.RightToLeft = [System.Windows.Forms.RightToLeft]::No
    $form.Controls.Add($txtPgPort)

    $chkLan = New-Object System.Windows.Forms.CheckBox
    $chkLan.Text = "اشتراک‌گذاری سرور آرکا روی شبکه محلی (LAN) و باز کردن فایروال ویندوز"
    $chkLan.Checked = $ShareLan
    $chkLan.Location = New-Object System.Drawing.Point(20, 212)
    $chkLan.Size = New-Object System.Drawing.Size(440, 26)
    $form.Controls.Add($chkLan)

    $chkLanPg = New-Object System.Windows.Forms.CheckBox
    $chkLanPg.Text = "امکان اتصال مدیریتی به پورت PostgreSQL در شبکه محلی (اختیاری)"
    $chkLanPg.Checked = $false
    $chkLanPg.Location = New-Object System.Drawing.Point(20, 244)
    $chkLanPg.Size = New-Object System.Drawing.Size(440, 26)
    $form.Controls.Add($chkLanPg)

    $lblNote = New-Object System.Windows.Forms.Label
    $lblNote.Text = "نکته: در صورت نصب مجدد یا آپدیت، اطلاعات قبلی پایگاه‌داده حفظ می‌شود."
    $lblNote.ForeColor = [System.Drawing.Color]::FromArgb(5, 150, 105)
    $lblNote.Font = New-Object System.Drawing.Font("Tahoma", 8.5)
    $lblNote.Location = New-Object System.Drawing.Point(20, 278)
    $lblNote.Size = New-Object System.Drawing.Size(440, 22)
    $form.Controls.Add($lblNote)

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.Text = "تأیید پورت و نصب سرور + PostgreSQL"
    $btnOk.Location = New-Object System.Drawing.Point(105, 315)
    $btnOk.Size = New-Object System.Drawing.Size(270, 42)
    $btnOk.BackColor = [System.Drawing.Color]::FromArgb(79, 70, 229)
    $btnOk.ForeColor = [System.Drawing.Color]::White
    $btnOk.FlatStyle = "Flat"
    $btnOk.Font = New-Object System.Drawing.Font("Tahoma", 9.5, [System.Drawing.FontStyle]::Bold)
    $btnOk.Add_Click({
      $parsedPort = 0
      $parsedPg = 0
      if (-not ([int]::TryParse($txtPort.Text.Trim(), [ref]$parsedPort) -and $parsedPort -ge 80 -and $parsedPort -le 65535)) {
        [System.Windows.Forms.MessageBox]::Show("لطفاً یک شماره پورت معتبر بین 80 تا 65535 برای سرور وارد کنید.", "پورت نامعتبر", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        $txtPort.Focus()
        $txtPort.SelectAll()
        return
      }
      if (-not ([int]::TryParse($txtPgPort.Text.Trim(), [ref]$parsedPg) -and $parsedPg -ge 1024 -and $parsedPg -le 65535)) {
        [System.Windows.Forms.MessageBox]::Show("لطفاً یک شماره پورت معتبر بین 1024 تا 65535 برای PostgreSQL وارد کنید.", "پورت نامعتبر", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        $txtPgPort.Focus()
        $txtPgPort.SelectAll()
        return
      }
      if ($parsedPort -eq $parsedPg) {
        [System.Windows.Forms.MessageBox]::Show("پورت سرور و پورت PostgreSQL نمی‌توانند یکسان باشند.", "تداخل پورت", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        $txtPort.Focus()
        return
      }
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    })
    $form.AcceptButton = $btnOk
    $form.Controls.Add($btnOk)

    $form.Add_Shown({
      $form.Activate()
      $txtPort.Focus()
      $txtPort.SelectAll()
    })

    $res = $form.ShowDialog()
    if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
      $parsedPort = 0
      if ([int]::TryParse($txtPort.Text.Trim(), [ref]$parsedPort) -and $parsedPort -ge 80 -and $parsedPort -le 65535) {
        $ServerPort = $parsedPort
      }
      $parsedPg = 0
      if ([int]::TryParse($txtPgPort.Text.Trim(), [ref]$parsedPg) -and $parsedPg -ge 1024 -and $parsedPg -le 65535) {
        $PgPort = $parsedPg
      }
      $ShareLan = $chkLan.Checked
      $EnableLanPg = $chkLanPg.Checked
    }
  } catch {
    Write-Log "Interactive dialog fallback: $_"
  }
}

# Save installer configuration & legacy port file so Rust Server binds to chosen port immediately
$installerCfg = @{
  edition    = "server"
  serverPort = $ServerPort
  pgPort     = $PgPort
  shareLan   = $ShareLan
  updatedAt  = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($installerCfgPath, $installerCfg, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $arkaLegacyData "arka-network-config.json"), "{`"port`": $ServerPort}", (New-Object System.Text.UTF8Encoding($false)))
Write-Log "Saved installer-config.json (ServerPort=$ServerPort, PgPort=$PgPort, ShareLan=$ShareLan)"

# Locate bundled PostgreSQL bin directory (or fallback to existing system PostgreSQL)
$pgBinDir = $null
$candidates = @(
  (Join-Path $InstallDir "resources\postgres\bin"),
  (Join-Path $InstallDir "postgres\bin"),
  (Join-Path $PSScriptRoot "postgres\bin"),
  "C:\Program Files\PostgreSQL\16\bin",
  "C:\Program Files\PostgreSQL\15\bin",
  "C:\Program Files\PostgreSQL\17\bin"
)
foreach ($c in $candidates) {
  if ($c -and (Test-Path (Join-Path $c "initdb.exe")) -and (Test-Path (Join-Path $c "pg_ctl.exe"))) {
    $pgBinDir = $c
    break
  }
}

# Generate or preserve cryptographically random password
$pgUser = "arka_user"
$pgDb = "arka_pos"
$pgPass = ""
if (Test-Path $pgConfigPath) {
  try {
    $existingPg = Get-Content $pgConfigPath -Raw | ConvertFrom-Json
    if ($existingPg.password) { $pgPass = [string]$existingPg.password }
    if ($existingPg.user) { $pgUser = [string]$existingPg.user }
    if ($existingPg.database) { $pgDb = [string]$existingPg.database }
  } catch {}
}
if (-not $pgPass) {
  $bytes = New-Object byte[] 18
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $pgPass = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

if ($pgBinDir) {
  Write-Log "Found PostgreSQL binaries at: $pgBinDir"
  $initdb = Join-Path $pgBinDir "initdb.exe"
  $pgctl = Join-Path $pgBinDir "pg_ctl.exe"
  $psql = Join-Path $pgBinDir "psql.exe"

  # 1. Initialize PG data cluster ONLY if PG_VERSION doesn't already exist (preserves data on upgrades!)
  if (-not (Test-Path (Join-Path $pgDataDir "PG_VERSION"))) {
    Write-Log "Initializing new PostgreSQL data cluster at $pgDataDir..."
    New-Item -ItemType Directory -Force -Path $pgDataDir | Out-Null
    $pwFile = Join-Path $arkaDir "pg_init_pw.tmp"
    [System.IO.File]::WriteAllText($pwFile, $pgPass, (New-Object System.Text.UTF8Encoding($false)))
    try {
      $initArgs = @("-D", $pgDataDir, "-U", "postgres", "--pwfile=$pwFile", "-E", "UTF8", "--auth=scram-sha-256", "--no-locale")
      & $initdb @initArgs *>> $logFile
    } finally {
      Remove-Item -Force -ErrorAction SilentlyContinue $pwFile
    }
  } else {
    Write-Log "Existing PostgreSQL cluster detected at $pgDataDir - preserving all existing data."
  }

  # 2. Configure postgresql.conf & pg_hba.conf
  $pgConfPath = Join-Path $pgDataDir "postgresql.conf"
  if (Test-Path $pgConfPath) {
    $listenAddr = if ($EnableLanPg) { "*" } else { "localhost" }
    $confContent = Get-Content $pgConfPath -Raw
    $confContent = $confContent -replace "(?m)^#?\s*port\s*=.*$", "port = $PgPort"
    $confContent = $confContent -replace "(?m)^#?\s*listen_addresses\s*=.*$", "listen_addresses = '$listenAddr'"
    Set-Content -Path $pgConfPath -Value $confContent -Encoding UTF8
  }

  $pgHbaPath = Join-Path $pgDataDir "pg_hba.conf"
  if ($EnableLanPg -and (Test-Path $pgHbaPath)) {
    $hba = Get-Content $pgHbaPath -Raw
    if ($hba -notmatch "ArkaPOS LAN Access") {
      Add-Content -Path $pgHbaPath -Value "`n# ArkaPOS LAN Access`nhost    all             all             0.0.0.0/0               scram-sha-256"
    }
  }

  # 3. Start PostgreSQL daemon cleanly
  $pgLog = Join-Path $pgDataDir "postgres.log"
  & $pgctl -D $pgDataDir status *>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Log "Starting bundled PostgreSQL server on port $PgPort..."
    & $pgctl -D $pgDataDir -l $pgLog -w -t 15 start *>> $logFile
  } else {
    Write-Log "PostgreSQL is already running; reloading configuration..."
    & $pgctl -D $pgDataDir reload *>> $logFile
  }

  # 4. Ensure arka_user & arka_pos database exist
  $env:PGPASSWORD = $pgPass
  $roleCheck = (& $psql -h 127.0.0.1 -p $PgPort -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$pgUser'" 2>$null)
  if ("$roleCheck".Trim() -ne "1") {
    & $psql -h 127.0.0.1 -p $PgPort -U postgres -d postgres -c "CREATE USER $pgUser WITH PASSWORD '$pgPass';" *>> $logFile
  }
  $dbCheck = (& $psql -h 127.0.0.1 -p $PgPort -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$pgDb'" 2>$null)
  if ("$dbCheck".Trim() -ne "1") {
    & $psql -h 127.0.0.1 -p $PgPort -U postgres -d postgres -c "CREATE DATABASE $pgDb OWNER $pgUser ENCODING 'UTF8';" *>> $logFile
  }
  & $psql -h 127.0.0.1 -p $PgPort -U postgres -d $pgDb -c "GRANT ALL PRIVILEGES ON DATABASE $pgDb TO $pgUser; GRANT ALL ON SCHEMA public TO $pgUser;" *>> $logFile
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

  # 5. Write pg_config.json for ArkaPOS-Server Rust engine
  $pgCfg = @{
    host     = "127.0.0.1"
    port     = $PgPort
    user     = $pgUser
    password = $pgPass
    database = $pgDb
    data_dir = $pgDataDir
    bin_dir  = $pgBinDir
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($pgConfigPath, $pgCfg, (New-Object System.Text.UTF8Encoding($false)))
  Write-Log "PostgreSQL configured and active. Saved pg_config.json."
} else {
  Write-Log "WARNING: Bundled PostgreSQL binaries were not found in resources\postgres\bin."
}

# 6. Open Windows Firewall for LAN Sharing if requested
if ($ShareLan) {
  Write-Log "Configuring Windows Firewall rule for Arka Server TCP port $ServerPort..."
  $fwCmd = "netsh advfirewall firewall delete rule name=`"ArkaPOS_Server_TCP`" >nul 2>&1 & netsh advfirewall firewall add rule name=`"ArkaPOS_Server_TCP`" dir=in action=allow protocol=TCP localport=$ServerPort"
  if ($EnableLanPg) {
    $fwCmd += " & netsh advfirewall firewall delete rule name=`"ArkaPOS_PostgreSQL_TCP`" >nul 2>&1 & netsh advfirewall firewall add rule name=`"ArkaPOS_PostgreSQL_TCP`" dir=in action=allow protocol=TCP localport=$PgPort"
  }
  try {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
      Start-Process -FilePath "cmd.exe" -ArgumentList "/c $fwCmd" -WindowStyle Hidden -Wait
    } else {
      Start-Process -FilePath "cmd.exe" -ArgumentList "/c $fwCmd" -Verb RunAs -WindowStyle Hidden -Wait
    }
    Write-Log "Firewall rule applied successfully."
  } catch {
    Write-Log "Firewall elevation skipped or declined by user: $_"
  }
}

Write-Log "=== Arka POS Server + PostgreSQL Setup Finished ==="
