@echo off
title Arka POS System - Windows Manager
cd /d "%~dp0"

:: ==============================================================================
::                   Arka POS System - Windows Bot Manager
:: ==============================================================================

set "DEFAULT_REPO=https://github.com/meh732/caferesturant.git"
set "BACKUP_DIR=backups"

:MENU
cls
echo ==============================================================================
echo                      Arka POS System - Windows Manager
echo ==============================================================================
echo  Current Folder: %CD%
echo ==============================================================================
echo.
echo   [1] Install Arka POS and Build Windows App (.EXE / .MSI)
echo   [2] Update Arka POS from GitHub (With Pre-Update Backup)
echo   [3] Create Full Project Backup
echo   [4] Build Tauri Installer Only (.EXE and .MSI)
echo   [5] Start Local Network Server
echo   [6] Clean Build Artifacts
echo   [0] Exit
echo.
echo ==============================================================================
set "CHOICE="
set /p "CHOICE=Please enter your choice [0-6]: "

if "%CHOICE%"=="1" goto DO_INSTALL
if "%CHOICE%"=="2" goto DO_UPDATE
if "%CHOICE%"=="3" goto DO_BACKUP_MENU
if "%CHOICE%"=="4" goto DO_BUILD_TAURI
if "%CHOICE%"=="5" goto DO_START_SERVER
if "%CHOICE%"=="6" goto DO_CLEAN
if "%CHOICE%"=="0" goto DO_EXIT

echo.
echo [ERROR] Invalid selection "%CHOICE%". Please enter a number between 0 and 6.
echo.
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 1. INSTALL AND BUILD
:: ------------------------------------------------------------------------------
:DO_INSTALL
cls
echo ==============================================================================
echo            1. Install Arka POS and Build Windows Application
echo ==============================================================================
echo.

if exist "package.json" goto HAS_PACKAGE

echo [INFO] package.json not found in current folder. Attempting to clone from GitHub...
echo.
set "GIT_URL="
set /p "GIT_URL=Enter GitHub URL (Press ENTER for %DEFAULT_REPO%): "
if "%GIT_URL%"=="" set "GIT_URL=%DEFAULT_REPO%"

echo.
echo [1/5] Cloning from %GIT_URL%...
git clone %GIT_URL% .
if not exist "package.json" (
    echo.
    echo ==============================================================================
    echo [ERROR] Failed to obtain project files!
    echo.
    echo Reasons:
    echo   1. Git is not installed on Windows (Run in PowerShell: winget install Git.Git)
    echo   2. Or you ran this script outside the project folder.
    echo.
    echo SOLUTION:
    echo   Make sure this 'arka-manager.bat' file is inside the extracted project folder
    echo   where 'package.json' and 'src' folders are located.
    echo ==============================================================================
    echo.
    pause
    goto MENU
)

:HAS_PACKAGE
echo.
echo [1/5] Project files verified in %CD%
echo.

echo [2/5] Installing NPM packages (npm install)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] npm install encountered an issue, trying to proceed...
)

echo.
echo [3/5] Building Web production assets (npm run build)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Web build failed! Check errors above.
    pause
    goto MENU
)

echo.
echo [4/5] Checking Rust & Tauri build tools...
call cargo update --manifest-path src-tauri/Cargo.toml 2>nul

echo.
echo [5/5] Compiling Native Windows Tauri Application (.EXE and .MSI)...
call npx @tauri-apps/cli build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Direct Tauri build ended. Checking output bundle...
)

echo.
echo ==============================================================================
echo [SUCCESS] Build process completed!
echo.
echo Output directory:
echo %CD%\src-tauri\target\release\bundle
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
echo [1/4] Creating automated backup before update...
call :CREATE_BACKUP_ACTION

echo.
echo [2/4] Pulling latest code from GitHub...
git pull 2>nul

echo.
echo [3/4] Updating dependencies and rebuilding web assets...
call npm install
call npm run build

echo.
echo [4/4] Rebuilding Windows native app...
call cargo update --manifest-path src-tauri/Cargo.toml 2>nul
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Arka POS updated and rebuilt successfully!
echo ==============================================================================
echo.
if exist "src-tauri\target\release\bundle" (
    start "" explorer.exe "src-tauri\target\release\bundle"
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 3. BACKUP
:: ------------------------------------------------------------------------------
:DO_BACKUP_MENU
cls
echo ==============================================================================
echo                 3. Create Full Project Backup
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
call npm run build

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
set "PORT_NUM="
set /p "PORT_NUM=Enter port number to share on (Press ENTER for 3000): "
if "%PORT_NUM%"=="" set "PORT_NUM=3000"

echo.
echo ==============================================================================
echo Starting Arka POS Server on port %PORT_NUM% (0.0.0.0)...
echo All phones, tablets, and computers on Wi-Fi can now connect.
echo Press Ctrl+C in this window to stop the server.
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
:: 6. CLEAN
:: ------------------------------------------------------------------------------
:DO_CLEAN
cls
echo ==============================================================================
echo                 6. Clean Build Artifacts
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
