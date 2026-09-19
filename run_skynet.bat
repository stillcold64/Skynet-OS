@echo off
setlocal EnableExtensions
title Skynet OS - Personal Finance System
color 0b

echo ===================================================
echo       ? Skynet OS - Personal Finance System
echo ===================================================

:: Check if port 3000 is already running
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Skynet OS is already running!
    echo Opening Web Dashboard in browser...
    start http://localhost:3000
    timeout /t 2 >nul
    exit /b 0
)

echo Starting Skynet OS background services (Web + Telegram Bot)...
wscript.exe "C:\Users\Win10\Desktop\UHNWI\run_skynet_silent.vbs"

echo Waiting for services to initialize...
:wait_loop
timeout /t 1 >nul
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% neq 0 goto wait_loop

echo [OK] Skynet OS is online!
start http://localhost:3000
exit /b 0
