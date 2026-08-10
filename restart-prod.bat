@echo off
if not defined _BG_ (
    set _BG_=1
    start /min "" "%~f0" %*
    exit
)
chcp 936 >nul
title Restart Homework AI - Prod
cd /d "%~dp0"

echo.
echo   ======================================
echo     Restart Homework AI - Prod (port 3001)
echo   ======================================
echo.
echo   Stopping service...
echo.
call "%~dp0stop.bat"
echo.
echo   Waiting for port release...
timeout /t 3 /nobreak >nul
echo.
echo   Starting prod server...
echo.
call "%~dp0start-prod.bat"
exit /b
