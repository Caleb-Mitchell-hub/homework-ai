@echo off
chcp 936 >nul
title Stop Homework AI

echo.
echo   ======================================
echo     Stop Homework AI Service
echo   ======================================
echo.

set FOUND=0

rem --- Stop port 3000 (Dev) ---
set CHECK_PORT=3000
echo   [Dev] Checking port %CHECK_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%CHECK_PORT% " ^| findstr "LISTENING"') do (
    set PID=%%a
    set FOUND=1
    echo   Found PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo   X Failed to kill
    ) else (
        echo   V Killed
    )
)
if "%PID%"=="" echo   ! Port %CHECK_PORT% not in use
echo.
set PID=

rem --- Stop port 3001 (Prod) ---
set CHECK_PORT=3001
echo   [Prod] Checking port %CHECK_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%CHECK_PORT% " ^| findstr "LISTENING"') do (
    set PID=%%a
    set FOUND=1
    echo   Found PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo   X Failed to kill
    ) else (
        echo   V Killed
    )
)
if "%PID%"=="" echo   ! Port %CHECK_PORT% not in use
echo.

if %FOUND%==0 (
    echo   ! No service found on port 3000 or 3001
    echo.
)

echo   --------------------------------------
echo   Service stopped. You may close this window.
echo   --------------------------------------
echo.
timeout /t 3 /nobreak >nul
exit /b 0
