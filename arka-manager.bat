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
:: Auto-detect Windows Network IP address
set "DETECTED_IP="
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*','Ethernet*','vEthernet*' | Where-Object {$_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127.*'} | Select-Object -First 1).IPAddress" 2^>nul') do set "DETECTED_IP=%%i"

if "%DETECTED_IP%"=="" (
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127.*'} | Select-Object -First 1).IPAddress" 2^>nul') do set "DETECTED_IP=%%i"
)

if "%DETECTED_IP%"=="" set "DETECTED_IP=192.168.1.100"

:MENU
cls
echo ==============================================================================
echo                      Arka POS System - Windows Manager
echo ==============================================================================
echo  Current Folder:      %CD%
echo  Detected Network IP: %DETECTED_IP% (LAN / Wi-Fi)
echo  Default Port:        %DEFAULT_PORT%
echo  Share URL:           http://%DETECTED_IP%:%DEFAULT_PORT%
echo ==============================================================================
echo.
echo   [1] Install Arka POS and Setup Local Network Sharing (.EXE / .MSI)
echo   [2] Update Arka POS from GitHub (With Pre-Update Backup)
echo   [3] Create Full Project Backup
echo   [4] Build Tauri Windows Application (.EXE and .MSI)
echo   [5] Start Local Network Server (Share to Phones / Tablets)
echo   [6] Configure Windows Firewall Rule for Mobile Sharing
echo   [7] Clean Build Artifacts
echo   [0] Exit
echo.
echo ==============================================================================
set "CHOICE="
set /p "CHOICE=Please enter your choice [0-7]: "

if "%CHOICE%"=="1" goto DO_INSTALL
if "%CHOICE%"=="2" goto DO_UPDATE
if "%CHOICE%"=="3" goto DO_BACKUP_MENU
if "%CHOICE%"=="4" goto DO_BUILD_TAURI
if "%CHOICE%"=="5" goto DO_START_SERVER
if "%CHOICE%"=="6" goto DO_FIREWALL
if "%CHOICE%"=="7" goto DO_CLEAN
if "%CHOICE%"=="0" goto DO_EXIT

echo.
echo [ERROR] Invalid selection "%CHOICE%". Please enter a number between 0 and 7.
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
echo [3/6] Installing NPM packages (npm install)...
call npm install

echo.
echo [4/6] Building Web production assets (npm run build)...
call npm run build
call :SAVE_NET_CONFIG

echo.
echo [5/6] Updating Rust dependencies for Tauri...
call cargo update --manifest-path src-tauri/Cargo.toml 2>nul

echo.
echo [6/6] Compiling Native Windows Tauri Application (.EXE and .MSI)...
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Arka POS installed and built successfully!
echo.
echo Your Local Network Access URL for Phones and Tablets:
echo   -> http://%SETUP_IP%:%SETUP_PORT%
echo.
echo Application Installer:
echo   %CD%\src-tauri\target\release\bundle
echo ==============================================================================
echo.
if exist "src-tauri\target\release\bundle" (
    start "" explorer.exe "src-tauri\target\release\bundle"
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 2. UPDATE
:: ------------------------------------------------------------------------------
:DO_UPDATE
cls
echo ==============================================================================
echo                 2. Update Arka POS from GitHub
echo ==============================================================================
echo.
echo [1/5] Creating automated backup before update...
call :CREATE_BACKUP_ACTION

echo.
echo [2/5] Pulling latest code from GitHub...
git pull 2>nul

echo.
echo [3/5] Updating Network Configuration...
set "SETUP_IP=%DETECTED_IP%"
set "SETUP_PORT=3000"
if exist "public\arka-network-config.json" (
    echo [INFO] Found existing network configuration.
)
call :SAVE_NET_CONFIG

echo.
echo [4/5] Updating dependencies and rebuilding web assets...
call npm install
call npm run build
call :SAVE_NET_CONFIG

echo.
echo [5/5] Rebuilding Tauri Native Application...
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Arka POS updated successfully!
echo Local Network URL: http://%DETECTED_IP%:3000
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
echo [1/3] Building Web assets...
call :SAVE_NET_CONFIG
call npm run build
call :SAVE_NET_CONFIG

echo.
echo [2/3] Updating Rust dependencies...
call cargo update --manifest-path src-tauri/Cargo.toml 2>nul

echo.
echo [3/3] Building Native Tauri Release...
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Build finished!
echo ==============================================================================
echo.
if exist "src-tauri\target\release\bundle" (
    start "" explorer.exe "src-tauri\target\release\bundle"
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 5. START SERVER
:: ------------------------------------------------------------------------------
:DO_START_SERVER
cls
echo ==============================================================================
echo                 5. Start Local Network Server
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
:: 7. CLEAN
:: ------------------------------------------------------------------------------
:DO_CLEAN
cls
echo ==============================================================================
echo                 7. Clean Build Artifacts
echo ==============================================================================
echo.
echo [1/2] Taking safety backup...
call :CREATE_BACKUP_ACTION

echo.
echo [2/2] Cleaning build folders...
rmdir /S /Q "dist" 2>nul
rmdir /S /Q "src-tauri\target" 2>nul
echo.
echo [SUCCESS] Clean completed. Backups preserved in: %BACKUP_DIR%
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
