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
echo                      Arka POS System - Windows Manager (v1.2.0)
echo ==============================================================================
echo  Current Folder:      %CD%
echo  Detected Network IP: %DETECTED_IP% (LAN / Wi-Fi)
echo  Default Port:        %DEFAULT_PORT%
echo  Share URL:           http://%DETECTED_IP%:%DEFAULT_PORT%
echo ==============================================================================
echo.
echo   [1] Install Arka POS and Setup Local Network Sharing (.EXE / .MSI)
echo   [2] Update Arka POS from GitHub (Force Sync + Clean Build)
echo   [3] Create Full Project Backup
echo   [4] Build Tauri Windows Application (.EXE and .MSI)
echo   [5] Run Arka POS Windows App Directly (.EXE - No Setup Needed)
echo   [6] Start Local Network Server (Share to Phones / Tablets)
echo   [7] Configure Windows Firewall Rule for Mobile Sharing
echo   [8] Clean Build Artifacts & Old Installers
echo   [0] Exit
echo.
echo ==============================================================================
set "CHOICE="
set /p "CHOICE=Please enter your choice [0-8]: "

if "%CHOICE%"=="1" goto DO_INSTALL
if "%CHOICE%"=="2" goto DO_UPDATE
if "%CHOICE%"=="3" goto DO_BACKUP_MENU
if "%CHOICE%"=="4" goto DO_BUILD_TAURI
if "%CHOICE%"=="5" goto DO_RUN_DIRECT
if "%CHOICE%"=="6" goto DO_START_SERVER
if "%CHOICE%"=="7" goto DO_FIREWALL
if "%CHOICE%"=="8" goto DO_CLEAN
if "%CHOICE%"=="0" goto DO_EXIT

echo.
echo [ERROR] Invalid selection "%CHOICE%". Please enter a number between 0 and 8.
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
echo [5/6] Cleaning previous build outputs to prevent old version conflicts...
taskkill /F /IM "arka-pos.exe" >nul 2>&1
taskkill /F /IM "Arka-POS.exe" >nul 2>&1
if exist "src-tauri\target\release\bundle" rmdir /S /Q "src-tauri\target\release\bundle" 2>nul
if exist "src-tauri\target\release\arka-pos.exe" del /f /q "src-tauri\target\release\arka-pos.exe" 2>nul
if exist "dist" rmdir /S /Q "dist" 2>nul

echo.
echo [6/6] Compiling Native Windows Tauri Application (v1.2.0)...
call npx @tauri-apps/cli build
set "BUILD_CODE=%ERRORLEVEL%"

echo.
echo ==============================================================================
if %BUILD_CODE% EQU 0 (
    echo [SUCCESS] Arka POS v1.2.0 built successfully!
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

echo.
echo [4/6] Updating Network Configuration...
set "SETUP_IP=%DETECTED_IP%"
set "SETUP_PORT=3000"
call :SAVE_NET_CONFIG

echo.
echo [5/6] Updating dependencies and rebuilding web assets...
call npm install
call npm run build
call :SAVE_NET_CONFIG

echo.
echo [6/6] Compiling Fresh Native Application (v1.2.0)...
call npx @tauri-apps/cli build
set "UPDATE_BUILD_CODE=%ERRORLEVEL%"

echo.
echo ==============================================================================
if %UPDATE_BUILD_CODE% EQU 0 (
    echo [SUCCESS] Arka POS v1.2.0 updated and compiled successfully!
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
echo [1/3] Building Web assets...
call :SAVE_NET_CONFIG
call npm run build
call :SAVE_NET_CONFIG

echo.
echo [2/3] Cleaning previous installers...
if exist "src-tauri\target\release\bundle" rmdir /S /Q "src-tauri\target\release\bundle" 2>nul
if exist "src-tauri\target\release\arka-pos.exe" del /f /q "src-tauri\target\release\arka-pos.exe" 2>nul

echo.
echo [3/3] Building Native Tauri Release (v1.2.0)...
call npx @tauri-apps/cli build
set "BUILD_ONLY_CODE=%ERRORLEVEL%"

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
:: 8. CLEAN
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
