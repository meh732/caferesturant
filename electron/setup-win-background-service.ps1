param(
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Continue"

$localApp = $env:LOCALAPPDATA
if (-not $localApp) { $localApp = [Environment]::GetFolderPath("LocalApplicationData") }

$arkaDir = Join-Path $localApp "ArkaPOS"
$dataDir = Join-Path $arkaDir "data"
$logsDir = Join-Path $arkaDir "logs"
New-Item -ItemType Directory -Force -Path $arkaDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$logFile = Join-Path $logsDir "background-service-setup.log"
function Write-Log($msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Add-Content -Path $logFile -Value "[$ts] $msg" -Encoding UTF8
}

Write-Log "=== Arka POS 24/7 Windows Background Service Setup Started (InstallDir=$InstallDir) ==="

if (-not $InstallDir -or -not (Test-Path $InstallDir)) {
  $InstallDir = Split-Path -Parent $PSScriptRoot
}

$exePath = Join-Path $InstallDir "ArkaPOS-Server.exe"
$serverJsPath = Join-Path $InstallDir "resources\app\server.js"
$pgBinDir = Join-Path $InstallDir "resources\postgres\bin"
$pgDataDir = Join-Path $arkaDir "pgdata"
$pgConfigPath = Join-Path $arkaDir "pg_config.json"
$installerCfgPath = Join-Path $arkaDir "installer-config.json"

if (-not (Test-Path $exePath)) {
  Write-Log "WARNING: ArkaPOS-Server.exe not found at $exePath"
  exit 0
}
if (-not (Test-Path $serverJsPath)) {
  Write-Log "WARNING: server.js not found at $serverJsPath"
  exit 0
}

# Create persistent background launcher script that starts PostgreSQL + detached Arka API Server
# without opening any GUI window — runs automatically at Windows logon/startup and stays running 24/7
$launcherPs1 = Join-Path $arkaDir "start-arka-server-bg.ps1"
$launcherScript = @"
`$ErrorActionPreference = 'Continue'
`$arkaDir = '$arkaDir'
`$dataDir = '$dataDir'
`$logsDir = '$logsDir'
`$pgDataDir = '$pgDataDir'
`$pgBinDir = '$pgBinDir'
`$exePath = '$exePath'
`$serverJsPath = '$serverJsPath'
`$installerCfgPath = '$installerCfgPath'
`$pgConfigPath = '$pgConfigPath'

New-Item -ItemType Directory -Force -Path `$dataDir | Out-Null
New-Item -ItemType Directory -Force -Path `$logsDir | Out-Null

# 1. Resolve configured server port
`$port = 3000
`$netCfgPath = Join-Path `$dataDir 'arka-network-config.json'
if (Test-Path `$netCfgPath) {
  try {
    `$nc = Get-Content `$netCfgPath -Raw | ConvertFrom-Json
    if (`$nc.port) { `$port = [int]`$nc.port }
  } catch {}
} elseif (Test-Path `$installerCfgPath) {
  try {
    `$ic = Get-Content `$installerCfgPath -Raw | ConvertFrom-Json
    if (`$ic.serverPort) { `$port = [int]`$ic.serverPort }
  } catch {}
}

# 2. Ensure bundled PostgreSQL is running
`$pgCtl = Join-Path `$pgBinDir 'pg_ctl.exe'
if ((Test-Path `$pgCtl) -and (Test-Path (Join-Path `$pgDataDir 'PG_VERSION'))) {
  & `$pgCtl -D `$pgDataDir status *>`$null
  if (`$LASTEXITCODE -ne 0) {
    `$pgLog = Join-Path `$pgDataDir 'postgres.log'
    & `$pgCtl -D `$pgDataDir -l `$pgLog -w -t 15 start *>`$null
  }
}

# 3. Check if Arka POS API server is already healthy on `$port
`$alreadyHealthy = `$false
try {
  `$resp = Invoke-WebRequest -Uri "http://127.0.0.1:`$port/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
  if (`$resp.StatusCode -eq 200) { `$alreadyHealthy = `$true }
} catch {}

if (-not `$alreadyHealthy) {
  `$env:ELECTRON_RUN_AS_NODE = '1'
  `$env:NODE_ENV = 'production'
  `$env:PORT = "`$port"
  `$env:ARKA_DATA_DIR = `$dataDir
  `$env:ARKA_PG_CONFIG_PATH = `$pgConfigPath

  if (Test-Path `$pgConfigPath) {
    try {
      `$pgc = Get-Content `$pgConfigPath -Raw | ConvertFrom-Json
      if (`$pgc.host) { `$env:PGHOST = [string]`$pgc.host }
      if (`$pgc.port) { `$env:PGPORT = [string]`$pgc.port }
      if (`$pgc.user) { `$env:PGUSER = [string]`$pgc.user }
      if (`$pgc.password) { `$env:PGPASSWORD = [string]`$pgc.password }
      if (`$pgc.database) { `$env:PGDATABASE = [string]`$pgc.database }
    } catch {}
  }

  `$outLog = Join-Path `$logsDir 'server-bg.log'
  `$errLog = Join-Path `$logsDir 'server-bg-err.log'
  `$proc = Start-Process -FilePath `$exePath -ArgumentList "`"`$serverJsPath`" `$port" -WorkingDirectory (Split-Path -Parent `$serverJsPath) -WindowStyle Hidden -RedirectStandardOutput `$outLog -RedirectStandardError `$errLog -PassThru
  if (`$proc -and `$proc.Id) {
    [System.IO.File]::WriteAllText((Join-Path `$arkaDir 'arka-bg-server.pid'), "`$(`$proc.Id)", (New-Object System.Text.UTF8Encoding(`$false)))
  }
}
"@

[System.IO.File]::WriteAllText($launcherPs1, $launcherScript, (New-Object System.Text.UTF8Encoding($false)))
Write-Log "Wrote background launcher script to $launcherPs1"

# Register silent Windows startup entry (Scheduled Task + Run key fallback so it works even without admin UAC)
$taskName = "ArkaPOS_Background_Server"
$taskCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPs1`""

try {
  schtasks /Delete /TN "$taskName" /F *>$null
  $createOut = schtasks /Create /TN "$taskName" /TR $taskCmd /SC ONLOGON /RL LIMITED /F 2>&1
  Write-Log "Scheduled Task ($taskName) registered: $createOut"
} catch {
  Write-Log "Scheduled Task registration fallback: $_"
}

# Also add CurrentUser Run registry entry so PostgreSQL + Arka Server start immediately at Windows login
try {
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $vbsPath = Join-Path $arkaDir "start-arka-server-bg.vbs"
  $vbsContent = "Set WshShell = CreateObject(""WScript.Shell"")`r`nWshShell.Run ""powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """"$launcherPs1"""""", 0, False`r`n"
  [System.IO.File]::WriteAllText($vbsPath, $vbsContent, (New-Object System.Text.UTF8Encoding($false)))
  Set-ItemProperty -Path $runKey -Name "ArkaPOSBackgroundServer" -Value "wscript.exe `"$vbsPath`""
  Write-Log "Registered HKCU Run autostart for 24/7 background server."
} catch {
  Write-Log "HKCU Run registration warning: $_"
}

# Launch the 24/7 background server immediately right after install!
try {
  Write-Log "Starting Arka POS 24/7 background server now..."
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPs1`"" -WindowStyle Hidden -Wait
  Write-Log "Background server started successfully."
} catch {
  Write-Log "Immediate background server launch warning: $_"
}

Write-Log "=== Arka POS 24/7 Background Service Setup Completed ==="
