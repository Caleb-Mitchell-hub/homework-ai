@echo off
chcp 65001 >nul
title Stop Online Quiz System

echo ================================
echo  Stopping Online Quiz System
echo ================================

set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "3000" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo Killing process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

if %FOUND%==0 (
    echo Service not running
) else (
    timeout /t 2 >nul
    echo.
    echo ================================
    echo  Service stopped
    echo ================================
)

pause
