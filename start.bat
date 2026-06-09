@echo off
chcp 65001 >nul
title Start Online Quiz System

echo ================================
echo  Starting Online Quiz System
echo ================================

cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr "3000" ^| findstr "LISTENING"') do (
    echo Port 3000 is in use, killing old process...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 2 >nul
)

if exist app.log del app.log

echo Starting service in background...

if not exist "%~dp0node_modules" (
    echo Installing dependencies...
    call npm install
)

start "Online Quiz System" /MIN cmd /c "npm run dev > app.log 2>&1"

timeout /t 8 >nul

echo.
echo ================================
echo  Service started in background!
echo  URL: http://localhost:3000
echo  Log: app.log
echo  You can close this window now.
echo ================================

echo.
echo Press any key to close (service will keep running)...
pause >nul
