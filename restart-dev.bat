@echo off
chcp 936 >nul
title Restart Homework AI - Dev
cd /d "%~dp0"

echo.
echo   ======================================
echo     Restart Homework AI - Dev (port 3000)
echo   ======================================
echo.
echo   Stopping service...
echo.
call "%~dp0stop.bat"
echo.
echo   Waiting for port release...
timeout /t 3 /nobreak >nul
echo.
echo   Starting dev server...
echo.
call "%~dp0start-dev.bat"
exit /b
