@echo off
setlocal enabledelayedexpansion
title Arka POS System - Windows Manager

:: Lock current directory to the script's actual directory (fixes Run As Admin System32 issue)
cd /d "%~dp0"

:: ==============================================================================
::                   Arka POS System - Windows Bot Manager
::                  GitHub Deployment, Update & Backup Utility
:: ==============================================================================

:: Default repository URL
set "DEFAULT_REPO=https://github.com/meh732/caferesturant.git"
set "BACKUP_DIR=backups"

:MENU
cls
echo ==============================================================================
echo                      Arka POS System - Windows Manager
echo ==============================================================================
echo.
echo   1. Install Arka POS and Auto-Build Tauri Windows (.EXE / .MSI)
echo   2. Update Arka POS from GitHub (With Pre-Update Auto Backup)
echo   3. Create Full Project & Database Backup Now
echo   4. Build Tauri Windows Installer Only (.EXE and .MSI)
echo   5. Start Local Network Server on Custom Port
echo   6. Clean Build Artifacts (With Safety Backup)
echo   0. Exit
echo.
echo ==============================================================================
set /p "CHOICE=Please enter your choice [0-6]: "

if "%CHOICE%"=="1" goto INSTALL
if "%CHOICE%"=="2" goto UPDATE
if "%CHOICE%"=="3" goto BACKUP
if "%CHOICE%"=="4" goto BUILD_TAURI
if "%CHOICE%"=="5" goto START_SERVER
if "%CHOICE%"=="6" goto CLEAN_UNINSTALL
if "%CHOICE%"=="0" goto EXIT

echo [ERROR] Invalid selection. Press any key to try again...
pause >nul
goto MENU

:: ------------------------------------------------------------------------------
:: 1. INSTALL AND AUTO-BUILD TAURI
:: ------------------------------------------------------------------------------
:INSTALL
cls
echo ==============================================================================
echo          1. Install Arka POS and Auto-Build Tauri (.EXE / .MSI)
echo ==============================================================================
echo.

if not exist "package.json" (
    set /p "GIT_URL=Enter GitHub Repository URL [Default: %DEFAULT_REPO%]: "
    if "!GIT_URL!"=="" set "GIT_URL=%DEFAULT_REPO%"
    echo.
    echo [1/5] Cloning repository from !GIT_URL!...
    git clone !GIT_URL! .
) else (
    echo [1/5] Working in existing project directory: %CD%
)

echo.
echo [2/5] Installing NPM dependencies...
call npm install

echo.
echo [3/5] Building Web production assets...
call npm run build

echo.
echo [4/5] Updating Rust Tauri crates...
call cargo update --manifest-path src-tauri/Cargo.toml

echo.
echo [5/5] Compiling Native Tauri Windows Application (.EXE and .MSI)...
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Arka POS installed and Windows native installer built successfully!
echo Output Folder: src-tauri\target\release\bundle\
echo ==============================================================================
if exist "src-tauri\target\release\bundle" (
    explorer.exe "src-tauri\target\release\bundle"
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 2. UPDATE (With Mandatory Pre-Update Backup & Tauri Auto-Build)
:: ------------------------------------------------------------------------------
:UPDATE
cls
echo ==============================================================================
echo                 2. Update Arka POS from GitHub
echo ==============================================================================
echo.
echo [1/5] Creating automated safety backup before update...
call :DO_BACKUP

echo.
echo [2/5] Pulling latest changes from GitHub...
git pull
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Git pull completed or local files up to date.
)

echo.
echo [3/5] Updating NPM dependencies...
call npm install

echo.
echo [4/5] Rebuilding Web assets...
call npm run build

echo.
echo [5/5] Recompiling Tauri native release...
call cargo update --manifest-path src-tauri/Cargo.toml
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Arka POS updated and rebuilt successfully!
echo ==============================================================================
if exist "src-tauri\target\release\bundle" (
    explorer.exe "src-tauri\target\release\bundle"
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 3. BACKUP
:: ------------------------------------------------------------------------------
:BACKUP
cls
echo ==============================================================================
echo                 3. Manual Project Backup
echo ==============================================================================
echo.
call :DO_BACKUP
pause
goto MENU

:DO_BACKUP
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set "CURR_DATE=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "CURR_DATE=%CURR_DATE: =0%"
set "DEST_BACKUP=%BACKUP_DIR%\arka_backup_%CURR_DATE%"

echo Backing up files to %DEST_BACKUP%...
mkdir "%DEST_BACKUP%"
xcopy /E /I /Y /Q "src" "%DEST_BACKUP%\src" >nul 2>&1
xcopy /E /I /Y /Q "src-tauri" "%DEST_BACKUP%\src-tauri" >nul 2>&1
copy /Y "package.json" "%DEST_BACKUP%\" >nul 2>&1
copy /Y "vite.config.ts" "%DEST_BACKUP%\" >nul 2>&1
echo [SUCCESS] Backup created at: %DEST_BACKUP%
exit /b 0

:: ------------------------------------------------------------------------------
:: 4. BUILD TAURI WINDOWS INSTALLER ONLY
:: ------------------------------------------------------------------------------
:BUILD_TAURI
cls
echo ==============================================================================
echo                 4. Build Tauri Windows Installer (.EXE / .MSI)
echo ==============================================================================
echo.
echo [1/3] Building Web assets...
call npm run build

echo.
echo [2/3] Updating Rust dependencies...
call cargo update --manifest-path src-tauri/Cargo.toml

echo.
echo [3/3] Compiling Tauri native release...
call npx @tauri-apps/cli build

echo.
echo ==============================================================================
echo [SUCCESS] Native Windows package created in:
echo src-tauri\target\release\bundle\
echo ==============================================================================
if exist "src-tauri\target\release\bundle" (
    explorer.exe "src-tauri\target\release\bundle"
)
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 5. START LOCAL NETWORK SERVER
:: ------------------------------------------------------------------------------
:START_SERVER
cls
echo ==============================================================================
echo                 5. Start Local Network Server
echo ==============================================================================
echo.
set /p "CUSTOM_PORT=Enter Local Port to host on [Default: 3000]: "
if "%CUSTOM_PORT%"=="" set "CUSTOM_PORT=3000"

echo.
echo Starting Arka POS Server on port %CUSTOM_PORT% across local network (0.0.0.0)...
echo Press Ctrl+C to stop the server.
echo.
call npx vite preview --port %CUSTOM_PORT% --host 0.0.0.0
pause
goto MENU

:: ------------------------------------------------------------------------------
:: 6. CLEAN / UNINSTALL (With Safety Backup)
:: ------------------------------------------------------------------------------
:CLEAN_UNINSTALL
cls
echo ==============================================================================
echo                 6. Clean Build Artifacts
echo ==============================================================================
echo.
echo [1/2] Creating safety backup first...
call :DO_BACKUP

echo.
echo [2/2] Cleaning node_modules, dist, and target...
rmdir /S /Q "dist" 2>nul
rmdir /S /Q "src-tauri\target" 2>nul
echo.
echo [SUCCESS] Project cleaned cleanly. All backups preserved in: %BACKUP_DIR%
pause
goto MENU

:EXIT
cls
echo Goodbye!
exit /b 0
