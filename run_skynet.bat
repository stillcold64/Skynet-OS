@echo off
setlocal EnableExtensions
title Skynet OS - Personal Finance System

set "PROJECT_DIR=C:\Users\Win10\Desktop\UHNWI\apps\webapp"
cd /d "%PROJECT_DIR%"

:: Check if port 3000 is already running
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo ===================================================
    echo  [INFO] Skynet OS is already running on port 3000!
    echo         Opening Web Dashboard in browser...
    echo ===================================================
    start http://localhost:3000
    ping 127.0.0.1 -n 2 >nul 2>&1
    exit /b 0
)

echo ===================================================
echo       Starting Skynet OS (Web + Telegram Bot)...
echo ===================================================
start "Skynet_OS_Service" /min cmd /c "node scripts/launcher.js"
ping 127.0.0.1 -n 3 >nul 2>&1
exit /b 0
