@echo off
chcp 65001 >nul
title Skynet OS Runner
cd /d "%~dp0apps\webapp"

echo ===================================================
echo       ⚡ Skynet OS - Personal Finance System
echo ===================================================
echo.
echo [*] Starting Web Server (http://localhost:3000)...
start "Skynet Web" /min cmd /c "npm run start"

echo [*] Starting Telegram Bot Worker (@my_skynet_money_bot)...
start "Skynet Telegram Bot" /min cmd /c "node scripts/telegram_bot.js"

echo.
echo [OK] Skynet OS กำลังทำงานอยู่เบื้องหลังเรียบร้อยแล้ว!
echo      - หน้าเว็บแดชบอร์ด : http://localhost:3000
echo      - บอท Telegram      : @my_skynet_money_bot
echo.
timeout /t 3 >nul
exit
