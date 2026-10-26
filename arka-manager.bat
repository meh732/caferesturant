@echo off
setlocal enabledelayedexpansion
title Arka POS System - Windows Setup & Manager
cd /d "%~dp0"

:: ==============================================================================
::                   Arka POS System - Windows Manager & Setup
:: ==============================================================================

set "DEFAULT_REPO=https://github.com/meh732/caferesturant.git"
set "BACKUP_DIR=backups"
set "DEFAULT_PORT=3000"

:DETECT_IP
:: Auto-detect Windows Network IP address connected to active Router/Gateway
set "DETECTED_IP="

:: 1. Primary Method: PowerShell Active Default Route (works on Persian & English Windows)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1 | ForEach-Object { (Get-NetIPAddress -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress } | Where-Object { $_ -notlike '169.254*' -and $_ -notlike '127.*' -and $_ -notlike '192.168.56*' } | Select-Object -First 1)" 2^>nul') do (
    set "CANDIDATE=%%i"
    if not "!CANDIDATE!"=="" set "DETECTED_IP=!CANDIDATE!"
)

:: 2. Secondary Method: Non-virtual active physical adapter IPv4
if "%DETECTED_IP%"=="" (
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '192.168.56*' -and $_.InterfaceAlias -notmatch 'VirtualBox|VMware|vEthernet|Loopback|Pseudo' } | Select-Object -First 1).IPAddress" 2^>nul') do (
        set "CANDIDATE=%%i"
        if not "!CANDIDATE!"=="" set "DETECTED_IP=!CANDIDATE!"
    )
)

:: 3. Third Method: Windows route print parsing (Default gateway route interface)
if "%DETECTED_IP%"=="" (
    for /f "tokens=4" %%a in ('route print 0.0.0.0 2^>nul ^| findstr /r "^ *0\.0\.0\.0 *0\.0\.0\.0"') do (
        set "CANDIDATE=%%a"
        if not "!CANDIDATE!"=="" (
            if not "!CANDIDATE:~0,4!"=="127." (
                if not "!CANDIDATE:~0,7!"=="169.254" (
                    if not "!CANDIDATE:~0,11!"=="192.168.56." (
                        set "DETECTED_IP=!CANDIDATE!"
                    )
                )
            )
        )
    )
)

:: 4. Fourth Method: ipconfig token extraction
if "%DETECTED_IP%"=="" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| findstr /i "IPv4 IP"') do (
        if "!DETECTED_IP!"=="" (
            for /f "tokens=1" %%b in ("%%a") do (
                set "CANDIDATE=%%b"
                if not "!CANDIDATE!"=="" (
                    if not "!CANDIDATE:~0,4!"=="127." (
                        if not "!CANDIDATE:~0,7!"=="169.254" (
                            if not "!CANDIDATE:~0,11!"=="192.168.56." (
                                set "DETECTED_IP=!CANDIDATE!"
                            )
                        )
                    )
                )
            )
        )
    )
)

if "%DETECTED_IP%"=="" set "DETECTED_IP=192.168.1.100"

:MENU
cls
echo ==============================================================================
echo                      Arka POS System - Windows Manager (v1.3.0)
echo ==============================================================================
echo  Current Folder:      %CD%
echo  Detected Network IP: %DETECTED_IP% (LAN / Wi-Fi)
echo  Default Port:        %DEFAULT_PORT%
echo  Share URL:           http://%DETECTED_IP%:%DEFAULT_PORT%
echo ==============================================================================
echo.
echo   [1] Install Arka POS and Build Web Assets (npm install + npm run build)
echo   [2] Update Arka POS from GitHub (Force Sync + Clean Build)
echo   [3] Create Full Project Backup
echo   [4] Build Tauri Windows Desktop App (.EXE and .MSI)
echo   [5] Run Arka POS Windows App Directly (.EXE)
echo   [6] Start Local Network Server (Foreground Console Window)
echo   [7] Install / Start as Background Windows Service (Autostart on Boot, No CMD)
echo   [8] Stop Background Windows Service
echo   [9] Configure Custom Port, Custom Domain & SSL Certificates (HTTPS)
echo   [10] Configure Windows Firewall Rule for Mobile & LAN Sharing
echo   [11] Clean Build Artifacts & Windows WebView2 Cache
echo   [12] Generate Offline Activation Key for Client Machine ID (Vendor Admin Tool)
echo   [0] Exit
echo.
echo ==============================================================================
set "CHOICE="
set /p "CHOICE=Please enter your choice [0-12]: "

if "%CHOICE%"=="1" goto DO_INSTALL
if "%CHOICE%"=="2" goto DO_UPDATE
if "%CHOICE%"=="3" goto DO_BACKUP_MENU
if "%CHOICE%"=="4" goto DO_BUILD_TAURI
if "%CHOICE%"=="5" goto DO_RUN_DIRECT
if "%CHOICE%"=="6" goto DO_START_SERVER
if "%CHOICE%"=="7" goto DO_INSTALL_SERVICE
if "%CHOICE%"=="8" goto DO_STOP_SERVICE
if "%CHOICE%"=="9" goto DO_CONFIG_SSL
if "%CHOICE%"=="10" goto DO_FIREWALL
if "%CHOICE%"=="11" goto DO_CLEAN
if "%CHOICE%"=="12" goto DO_GEN_KEY
if "%CHOICE%"=="0" goto DO_EXIT

echo.
echo [ERROR] Invalid selection "%CHOICE%". Please enter a number between 0 and 12.
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: SAVE NETWORK CONFIG HELPER
:: ------------------------------------------------------------------------------
:SAVE_NET_CONFIG
if "%SETUP_PORT%"=="" set "SETUP_PORT=3000"
if "%SETUP_IP%"=="" set "SETUP_IP=%DETECTED_IP%"

if not exist "public" mkdir "public" 2>nul
(
echo {
echo   "serverIp": "%SETUP_IP%",
echo   "serverPort": %SETUP_PORT%,
echo   "configuredAt": "%DATE% %TIME%"
echo }
) > "public\arka-network-config.json"

if exist "dist" (
    (
    echo {
    echo   "serverIp": "%SETUP_IP%",
    echo   "serverPort": %SETUP_PORT%,
    echo   "configuredAt": "%DATE% %TIME%"
    echo }
    ) > "dist\arka-network-config.json"
)

if exist "%LOCALAPPDATA%\com.arka.restaurantpos" (
    (
    echo {
    echo   "serverIp": "%SETUP_IP%",
    echo   "serverPort": %SETUP_PORT%,
    echo   "configuredAt": "%DATE% %TIME%"
    echo }
    ) > "%LOCALAPPDATA%\com.arka.restaurantpos\arka-network-config.json"
)
if exist "%LOCALAPPDATA%\com.arkasystem.pos" (
    (
    echo {
    echo   "serverIp": "%SETUP_IP%",
    echo   "serverPort": %SETUP_PORT%,
    echo   "configuredAt": "%DATE% %TIME%"
    echo }
    ) > "%LOCALAPPDATA%\com.arkasystem.pos\arka-network-config.json"
)

echo [INFO] Injected Network Config: http://%SETUP_IP%:%SETUP_PORT%
goto :eof

:: ------------------------------------------------------------------------------
:: FIREWALL RULE HELPER
:: ------------------------------------------------------------------------------
:DO_FIREWALL
cls
echo ==============================================================================
echo           Configure Windows Firewall for Arka POS Local Network
echo ==============================================================================
echo.
set "FW_PORT="
set /p "FW_PORT=Enter port to open in Windows Firewall (Press ENTER for %DEFAULT_PORT%): "
if "%FW_PORT%"=="" set "FW_PORT=%DEFAULT_PORT%"

echo.
echo Opening Port %FW_PORT% in Windows Firewall (Inbound TCP)...
netsh advfirewall firewall add rule name="Arka POS Server (Port %FW_PORT%)" dir=in action=allow protocol=TCP localport=%FW_PORT% profile=any >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Windows Firewall rule added successfully! Mobile devices can now connect.
) else (
    echo [WARNING] If prompted for Administrator permissions, please run as Admin.
)
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 1. INSTALL AND BUILD
:: ------------------------------------------------------------------------------
:DO_INSTALL
cls
echo ==============================================================================
echo            1. Install Arka POS and Setup Local Network Sharing
echo ==============================================================================
echo.

if exist "package.json" goto HAS_PACKAGE

echo [INFO] package.json not found in current folder. Attempting to clone from GitHub...
echo.
set "GIT_URL="
set /p "GIT_URL=Enter GitHub URL (Press ENTER for %DEFAULT_REPO%): "
if "%GIT_URL%"=="" set "GIT_URL=%DEFAULT_REPO%"

echo.
echo [1/6] Cloning from %GIT_URL%...
git clone %GIT_URL% .
if not exist "package.json" (
    echo.
    echo ==============================================================================
    echo [ERROR] Failed to obtain project files!
    echo.
    echo Reasons:
    echo   1. Git is not installed on Windows (Run in PowerShell: winget install Git.Git)
    echo   2. Or you ran this script outside the project folder.
    echo ==============================================================================
    echo.
    pause
    goto MENU
)

:HAS_PACKAGE
echo.
echo [1/6] Project files verified in %CD%
echo.

:: Network IP & Port Setup
echo ------------------------------------------------------------------------------
echo [NETWORK CONFIGURATION]
echo Detected Windows IP: %DETECTED_IP%
set "SETUP_IP="
set /p "SETUP_IP=Confirm Network IP (Press ENTER for %DETECTED_IP%): "
if "%SETUP_IP%"=="" set "SETUP_IP=%DETECTED_IP%"

set "SETUP_PORT="
set /p "SETUP_PORT=Enter Server Port to share on (Press ENTER for 3000): "
if "%SETUP_PORT%"=="" set "SETUP_PORT=3000"

call :SAVE_NET_CONFIG

echo.
echo [2/6] Configuring Windows Firewall for Port %SETUP_PORT%...
netsh advfirewall firewall add rule name="Arka POS Server (Port %SETUP_PORT%)" dir=in action=allow protocol=TCP localport=%SETUP_PORT% profile=any >nul 2>&1

echo.
echo [3/6] Cleaning previous build outputs and old caches...
taskkill /F /IM "arka-pos.exe" >nul 2>&1
taskkill /F /IM "Arka-POS.exe" >nul 2>&1
if exist "src-tauri\target\release\bundle" rmdir /S /Q "src-tauri\target\release\bundle" 2>nul
if exist "src-tauri\target\release\arka-pos.exe" del /f /q "src-tauri\target\release\arka-pos.exe" 2>nul
if exist "dist" rmdir /S /Q "dist" 2>nul
if exist "%LOCALAPPDATA%\com.arkasystem.pos\EBWebView" rmdir /S /Q "%LOCALAPPDATA%\com.arkasystem.pos\EBWebView" 2>nul

echo.
echo [4/6] Installing NPM packages (npm install)...
call npm install
call :SAVE_NET_CONFIG

echo.
echo [5/5] Compiling Native Windows Tauri Application (Auto-bumping version & building)...
call npx @tauri-apps/cli build
set "BUILD_CODE=%ERRORLEVEL%"
call :SAVE_NET_CONFIG

echo.
echo ==============================================================================
if %BUILD_CODE% EQU 0 (
    echo [SUCCESS] Arka POS compiled successfully with updated version!
    echo.
    echo Your Local Network Access URL for Phones and Tablets:
    echo   -> http://%SETUP_IP%:%SETUP_PORT%
    echo.
    if exist "src-tauri\target\release\bundle\msi" (
        echo  Installer File (MSI):
        for %%f in ("src-tauri\target\release\bundle\msi\*.msi") do echo    %%~nxf
        start "" explorer.exe "src-tauri\target\release\bundle\msi"
    )
    if exist "src-tauri\target\release\arka-pos.exe" (
        echo  Standalone Executable (Portable):
        echo    %CD%\src-tauri\target\release\arka-pos.exe
    )
) else (
    echo [ERROR] Tauri compile finished with exit code %BUILD_CODE%.
    echo Check console output above for compiler messages.
)
echo ==============================================================================
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 2. UPDATE
:: ------------------------------------------------------------------------------
:DO_UPDATE
cls
echo ==============================================================================
echo             2. Update Arka POS from GitHub (Force Sync + Rebuild)
echo ==============================================================================
echo.
echo [1/6] Creating automated pre-update safety backup...
call :CREATE_BACKUP_ACTION

echo.
echo [2/6] Fetching and synchronizing latest code from GitHub...
git fetch origin main
git reset --hard origin/main
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Reset failed, attempting standard pull...
    git pull origin main
)

echo.
echo [3/6] Cleaning previous build output to guarantee fresh files...
taskkill /F /IM "arka-pos.exe" >nul 2>&1
taskkill /F /IM "Arka-POS.exe" >nul 2>&1
if exist "src-tauri\target\release\bundle" rmdir /S /Q "src-tauri\target\release\bundle" 2>nul
if exist "src-tauri\target\release\arka-pos.exe" del /f /q "src-tauri\target\release\arka-pos.exe" 2>nul
if exist "dist" rmdir /S /Q "dist" 2>nul
if exist "%LOCALAPPDATA%\com.arkasystem.pos\EBWebView" rmdir /S /Q "%LOCALAPPDATA%\com.arkasystem.pos\EBWebView" 2>nul

echo.
echo [4/6] Updating Network Configuration...
call :DETECT_IP
set "SETUP_IP=%DETECTED_IP%"
set "SETUP_PORT=3000"
call :SAVE_NET_CONFIG

echo.
echo [5/5] Updating dependencies and compiling fresh native application...
call npm install
call :SAVE_NET_CONFIG
call npx @tauri-apps/cli build
set "UPDATE_BUILD_CODE=%ERRORLEVEL%"
call :SAVE_NET_CONFIG

echo.
echo ==============================================================================
if %UPDATE_BUILD_CODE% EQU 0 (
    echo [SUCCESS] Arka POS updated and compiled successfully with updated version!
    echo Local Network URL: http://%DETECTED_IP%:3000
    echo.
    if exist "src-tauri\target\release\bundle\msi" (
        echo  New Installer File:
        for %%f in ("src-tauri\target\release\bundle\msi\*.msi") do echo    %%~nxf
        start "" explorer.exe "src-tauri\target\release\bundle\msi"
    )
    if exist "src-tauri\target\release\arka-pos.exe" (
        echo  Standalone Executable:
        echo    %CD%\src-tauri\target\release\arka-pos.exe
    )
) else (
    echo [ERROR] Tauri build finished with exit code %UPDATE_BUILD_CODE%.
    echo If WiX / Rust is missing on Windows, you can start the server via Option [6].
)
echo ==============================================================================
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 3. BACKUP
:: ------------------------------------------------------------------------------
:DO_BACKUP_MENU
cls
echo ==============================================================================
echo                 3. Project & Database Backup
echo ==============================================================================
echo.
call :CREATE_BACKUP_ACTION
echo.
pause
goto MENU

:CREATE_BACKUP_ACTION
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set "T_STAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "T_STAMP=%T_STAMP: =0%"
set "TARGET_BKP=%BACKUP_DIR%\backup_%T_STAMP%"

echo Creating backup at: %TARGET_BKP%...
mkdir "%TARGET_BKP%"
xcopy /E /I /Y /Q "src" "%TARGET_BKP%\src" >nul 2>&1
xcopy /E /I /Y /Q "src-tauri" "%TARGET_BKP%\src-tauri" >nul 2>&1
copy /Y "package.json" "%TARGET_BKP%\" >nul 2>&1
copy /Y "vite.config.ts" "%TARGET_BKP%\" >nul 2>&1
if exist "public\arka-network-config.json" copy /Y "public\arka-network-config.json" "%TARGET_BKP%\" >nul 2>&1
echo [SUCCESS] Backup saved securely to: %TARGET_BKP%
goto :eof

:: ------------------------------------------------------------------------------
:: 4. BUILD TAURI ONLY
:: ------------------------------------------------------------------------------
:DO_BUILD_TAURI
cls
echo ==============================================================================
echo                 4. Build Tauri Windows Application Only
echo ==============================================================================
echo.
echo [1/3] Cleaning previous build outputs...
taskkill /F /IM "arka-pos.exe" >nul 2>&1
taskkill /F /IM "Arka-POS.exe" >nul 2>&1
if exist "src-tauri\target\release\bundle" rmdir /S /Q "src-tauri\target\release\bundle" 2>nul
if exist "src-tauri\target\release\arka-pos.exe" del /f /q "src-tauri\target\release\arka-pos.exe" 2>nul
if exist "dist" rmdir /S /Q "dist" 2>nul
if exist "%LOCALAPPDATA%\com.arkasystem.pos\EBWebView" rmdir /S /Q "%LOCALAPPDATA%\com.arkasystem.pos\EBWebView" 2>nul

echo.
echo [2/2] Compiling Native Tauri Release (Auto-versioning + Building Web Assets)...
call :DETECT_IP
call :SAVE_NET_CONFIG
call npx @tauri-apps/cli build
set "BUILD_ONLY_CODE=%ERRORLEVEL%"
call :SAVE_NET_CONFIG

echo.
echo ==============================================================================
if %BUILD_ONLY_CODE% EQU 0 (
    echo [SUCCESS] Build finished successfully!
    if exist "src-tauri\target\release\bundle\msi" (
        for %%f in ("src-tauri\target\release\bundle\msi\*.msi") do echo  Installer: %%~nxf
        start "" explorer.exe "src-tauri\target\release\bundle\msi"
    )
    if exist "src-tauri\target\release\arka-pos.exe" (
        echo  Executable: %CD%\src-tauri\target\release\arka-pos.exe
    )
) else (
    echo [ERROR] Build failed with code %BUILD_ONLY_CODE%.
)
echo ==============================================================================
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 5. RUN DIRECT (.EXE)
:: ------------------------------------------------------------------------------
:DO_RUN_DIRECT
cls
echo ==============================================================================
echo            5. Run Arka POS Windows App Directly (.EXE)
echo ==============================================================================
echo.
if exist "src-tauri\target\release\arka-pos.exe" (
    echo Starting %CD%\src-tauri\target\release\arka-pos.exe...
    start "" "%CD%\src-tauri\target\release\arka-pos.exe"
    echo [SUCCESS] Arka POS v1.2.0 launched!
) else if exist "src-tauri\target\debug\arka-pos.exe" (
    echo Starting %CD%\src-tauri\target\debug\arka-pos.exe...
    start "" "%CD%\src-tauri\target\debug\arka-pos.exe"
    echo [SUCCESS] Arka POS launched!
) else (
    echo [INFO] Compiled arka-pos.exe not found in target folder.
    echo Please compile it first using Option [4] or [2], or run Developer Mode.
    echo.
    set "RUN_DEV="
    set /p "RUN_DEV=Launch in Developer Mode now? (Y/N): "
    if /i "!RUN_DEV!"=="Y" (
        call npm run tauri:dev
    )
)
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 6. START SERVER
:: ------------------------------------------------------------------------------
:DO_START_SERVER
cls
echo ==============================================================================
echo                 6. Start Local Network Server
echo ==============================================================================
echo.
echo Detected Windows IP: %DETECTED_IP%
set "PORT_NUM="
set /p "PORT_NUM=Enter port number to share on (Press ENTER for %DEFAULT_PORT%): "
if "%PORT_NUM%"=="" set "PORT_NUM=%DEFAULT_PORT%"

set "SETUP_PORT=%PORT_NUM%"
set "SETUP_IP=%DETECTED_IP%"
call :SAVE_NET_CONFIG

echo.
echo Opening Firewall for Port %PORT_NUM%...
netsh advfirewall firewall add rule name="Arka POS Server (Port %PORT_NUM%)" dir=in action=allow protocol=TCP localport=%PORT_NUM% profile=any >nul 2>&1

echo.
echo ==============================================================================
echo  Arka POS Server Running on Port %PORT_NUM% (0.0.0.0)
echo.
echo  Local Network URL for Phones and Tablets:
echo    -> http://%DETECTED_IP%:%PORT_NUM%
echo.
echo  All phones, tablets, and waiter screens on Wi-Fi can now connect.
echo  Press Ctrl+C in this window to stop the server.
echo ==============================================================================
echo.

if exist "server.js" (
    if exist "dist" (
        call node server.js %PORT_NUM%
    ) else (
        echo Building web assets first...
        call npm run build
        call node server.js %PORT_NUM%
    )
) else (
    call npx vite preview --port %PORT_NUM% --host 0.0.0.0
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 7. INSTALL AS BACKGROUND SERVICE (AUTOSTART & SURVIVES CMD CLOSE)
:: ------------------------------------------------------------------------------
:DO_INSTALL_SERVICE
cls
echo ==============================================================================
echo       7. Install & Run Arka POS as Background Windows Service
echo ==============================================================================
echo  Features:
echo    - Server runs silently in the background (NO open CMD window needed!)
echo    - Closing CMD / Terminal will NOT stop the server
echo    - Automatically starts up every time Windows boots or restarts
echo ==============================================================================
echo.
set "SVC_PORT="
set /p "SVC_PORT=Enter port for background server (Press ENTER for %DEFAULT_PORT%): "
if "%SVC_PORT%"=="" set "SVC_PORT=%DEFAULT_PORT%"

if not exist "dist" (
    echo.
    echo [INFO] dist folder missing. Compiling web assets first...
    call npm run build
)

echo.
echo Choose Background Service Engine:
echo   [1] Native Windows Background Service (Zero extra installs, auto-start on boot)
echo   [2] Enterprise PM2 Service (Process monitor, auto-restart on crash, startup service)
echo   [0] Cancel
echo.
set "SVC_CHOICE="
set /p "SVC_CHOICE=Select engine [1-2, 0 to cancel]: "

if "%SVC_CHOICE%"=="1" goto DO_INSTALL_NATIVE_SVC
if "%SVC_CHOICE%"=="2" goto DO_INSTALL_PM2_SVC
goto MENU

:DO_INSTALL_NATIVE_SVC
echo.
echo [1/3] Generating silent VBS launcher...
(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%CD%"
echo WshShell.Run "node server.js %SVC_PORT%", 0, False
) > "arka-silent-runner.vbs"

echo [2/3] Registering Windows Startup task...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "arka-silent-runner.vbs" "%STARTUP_FOLDER%\ArkaPOS-Server.vbs" >nul 2>&1

schtasks /create /sc onlogon /tn "ArkaPOS_AutoStart" /tr "wscript.exe \"%CD%\arka-silent-runner.vbs\"" /f /rl highest >nul 2>&1

echo [3/3] Opening Windows Firewall for Port %SVC_PORT%...
netsh advfirewall firewall add rule name="Arka POS Server (Port %SVC_PORT%)" dir=in action=allow protocol=TCP localport=%SVC_PORT% profile=any >nul 2>&1

echo.
echo Starting background service now...
start "" wscript.exe "arka-silent-runner.vbs"

echo.
echo ==============================================================================
echo [SUCCESS] Arka POS is now running in the background!
echo.
echo   Local Address:   http://localhost:%SVC_PORT%
echo   Network Address: http://%DETECTED_IP%:%SVC_PORT%
echo.
echo You can safely CLOSE this CMD window at any time.
echo The server will continue running and will auto-start whenever Windows restarts.
echo To stop it, choose Option [8] in this menu.
echo ==============================================================================
echo.
pause
goto MENU

:DO_INSTALL_PM2_SVC
echo.
echo [1/4] Checking and installing PM2 & PM2-Windows-Startup...
call npm install -g pm2 pm2-windows-startup
echo [2/4] Registering Windows Boot Service...
call pm2-startup install
echo [3/4] Starting Arka POS under PM2...
call pm2 delete "arka-pos" >nul 2>&1
call pm2 start server.js --name "arka-pos" -- %SVC_PORT%
call pm2 save
echo [4/4] Opening Windows Firewall for Port %SVC_PORT%...
netsh advfirewall firewall add rule name="Arka POS Server (Port %SVC_PORT%)" dir=in action=allow protocol=TCP localport=%SVC_PORT% profile=any >nul 2>&1
echo.
echo ==============================================================================
echo [SUCCESS] PM2 Background Service configured and started!
echo.
echo   Local Address:   http://localhost:%SVC_PORT%
echo   Network Address: http://%DETECTED_IP%:%SVC_PORT%
echo.
echo PM2 will automatically restart Arka POS if it ever crashes and on Windows boot.
echo You can safely CLOSE this CMD window.
echo ==============================================================================
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 8. STOP BACKGROUND SERVICE
:: ------------------------------------------------------------------------------
:DO_STOP_SERVICE
cls
echo ==============================================================================
echo                     8. Stop Background Windows Service
echo ==============================================================================
echo.
echo Stopping any running PM2 background tasks...
call pm2 stop "arka-pos" >nul 2>&1
call pm2 delete "arka-pos" >nul 2>&1

echo Terminating running node server processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":80.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_FOLDER%\ArkaPOS-Server.vbs" (
    del /f /q "%STARTUP_FOLDER%\ArkaPOS-Server.vbs" >nul 2>&1
    echo [INFO] Removed from Windows Startup folder.
)
schtasks /delete /tn "ArkaPOS_AutoStart" /f >nul 2>&1

echo.
echo [SUCCESS] Arka POS background service stopped and removed from startup.
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 9. CONFIGURE CUSTOM PORT, DOMAIN & SSL CERTIFICATES
:: ------------------------------------------------------------------------------
:DO_CONFIG_SSL
cls
echo ==============================================================================
echo          9. Configure Custom Port, Custom Domain & SSL Certificates
echo ==============================================================================
echo.
echo Current Network IP: %DETECTED_IP%
set "CFG_PORT="
set /p "CFG_PORT=Enter desired Port (e.g. 80, 443, 3000, 8080 - default %DEFAULT_PORT%): "
if "%CFG_PORT%"=="" set "CFG_PORT=%DEFAULT_PORT%"

set "CFG_DOMAIN="
set /p "CFG_DOMAIN=Enter custom domain (e.g. pos.example.com - leave blank if none): "

echo.
echo SSL Certificate Options:
echo   [1] Generate Self-Signed SSL Certificate (Local LAN / Testing HTTPS)
echo   [2] Use existing SSL Certs (Place key.pem and cert.pem in 'certs/' folder)
echo   [3] Setup Free Automated Let's Encrypt via Caddy (for valid Domain)
echo   [4] HTTP only (No SSL)
echo.
set "SSL_SEL="
set /p "SSL_SEL=Select SSL mode [1-4]: "

if not exist "certs" mkdir "certs"

if "%SSL_SEL%"=="1" (
    echo.
    echo Generating Self-Signed SSL certificate using PowerShell...
    powershell -NoProfile -Command "$cert = New-SelfSignedCertificate -DnsName 'localhost', '%DETECTED_IP%', '%CFG_DOMAIN%' -CertStoreLocation 'cert:\CurrentUser\My'; $certContent = [System.Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks'); '-----BEGIN CERTIFICATE-----`n' + $certContent + '`n-----END CERTIFICATE-----' | Out-File -FilePath 'certs\cert.pem' -Encoding ascii; $key = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa, 'ArkaKey', [System.Security.Cryptography.CngKeyCreationParameters]@{ ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::AllowPlaintextExport }); $keyBytes = $key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob); $keyContent = [System.Convert]::ToBase64String($keyBytes, 'InsertLineBreaks'); '-----BEGIN PRIVATE KEY-----`n' + $keyContent + '`n-----END PRIVATE KEY-----' | Out-File -FilePath 'certs\key.pem' -Encoding ascii" 2>nul
    if not exist "certs\key.pem" (
        openssl req -x509 -newkey rsa:2048 -keyout certs\key.pem -out certs\cert.pem -days 365 -nodes -subj "/CN=arkapos" >nul 2>&1
    )
    echo [INFO] Self-Signed certificate created in certs\
)

if "%SSL_SEL%"=="2" (
    echo.
    echo Please make sure your certificate files are saved as:
    echo   - Key:  %CD%\certs\key.pem
    echo   - Cert: %CD%\certs\cert.pem
)

if "%SSL_SEL%"=="3" (
    echo.
    echo [Let's Encrypt via Caddy]
    echo 1. Download Caddy for Windows (https://caddyserver.com/download)
    echo 2. Run this command:
    echo    caddy reverse-proxy --from %CFG_DOMAIN% --to 127.0.0.1:%CFG_PORT%
    echo Caddy will automatically issue and renew a free Let's Encrypt SSL certificate!
)

:: Update network config
set "SETUP_IP=%DETECTED_IP%"
set "SETUP_PORT=%CFG_PORT%"
call :SAVE_NET_CONFIG

echo.
echo Opening Windows Firewall for Port %CFG_PORT%...
netsh advfirewall firewall add rule name="Arka POS Server (Port %CFG_PORT%)" dir=in action=allow protocol=TCP localport=%CFG_PORT% profile=any >nul 2>&1

echo.
echo ==============================================================================
echo [SUCCESS] Configuration saved!
if not "%CFG_DOMAIN%"=="" echo  Configured Domain: %CFG_DOMAIN%
echo  Configured Port:   %CFG_PORT%
echo ==============================================================================
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 11. CLEAN
:: ------------------------------------------------------------------------------

:DO_CLEAN
cls
echo ==============================================================================
echo             8. Clean Build Artifacts & Windows WebView2 Cache
echo ==============================================================================
echo.
echo [1/3] Taking safety backup...
call :CREATE_BACKUP_ACTION

echo.
echo [2/3] Cleaning build folders...
rmdir /S /Q "dist" 2>nul
rmdir /S /Q "src-tauri\target" 2>nul

echo.
echo [3/3] Clearing Windows WebView2 application cache...
if exist "%LOCALAPPDATA%\com.arka.restaurantpos" (
    rmdir /S /Q "%LOCALAPPDATA%\com.arka.restaurantpos" 2>nul
    echo [INFO] Cleared %LOCALAPPDATA%\com.arka.restaurantpos
)
if exist "%LOCALAPPDATA%\com.arkasystem.pos" (
    rmdir /S /Q "%LOCALAPPDATA%\com.arkasystem.pos" 2>nul
    echo [INFO] Cleared %LOCALAPPDATA%\com.arkasystem.pos
)

echo.
echo [SUCCESS] Clean completed. Backups preserved in: %BACKUP_DIR%
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 12. GENERATE CLIENT ACTIVATION KEY (VENDOR ADMIN)
:: ------------------------------------------------------------------------------
:DO_GEN_KEY
cls
echo ==============================================================================
echo       12. Generate Server Hardware Activation Key (Vendor Admin Tool)
echo ==============================================================================
echo.
set "TARGET_MID="
set /p "TARGET_MID=Paste Customer's Server Machine ID (e.g. ARKA-SRV-XXXX-XXXX-XXXX-XXXX): "
if "%TARGET_MID%"=="" goto MENU

echo.
call node generate-license.cjs %TARGET_MID%
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 0. EXIT
:: ------------------------------------------------------------------------------
:DO_EXIT
cls
echo.
echo Thank you for using Arka POS System.
echo Window will close now.
echo.
timeout /t 2 >nul
exit /b 0
