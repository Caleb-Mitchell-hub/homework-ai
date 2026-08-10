@echo off
if not defined _BG_ (
    set _BG_=1
    start /min "" "%~f0" %*
    exit
)
chcp 936 >nul
title Homework AI - Dev
cd /d "%~dp0"

echo.
echo   ======================================
echo     Homework AI - Dev Server
echo   ======================================
echo.

rem --- 1. Check Node.js ---
echo   [1/5] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo   X Node.js not found. Please install Node.js first.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   V Node.js %NODE_VER%
echo.

rem --- 2. Check .env ---
echo   [2/5] Checking .env config...
if not exist ".env" (
    if exist ".env.example" (
        echo   ! .env not found, copying from .env.example...
        copy ".env.example" ".env" >nul
        echo   V .env created. Please edit if needed.
    ) else (
        echo   X .env not found and no .env.example
        pause
        exit /b 1
    )
) else (
    echo   V .env ready
)
echo.

rem --- 3. Install dependencies ---
echo   [3/5] Installing dependencies...
if not exist "node_modules" (
    echo   First run, installing...
    call npm install
    if errorlevel 1 (
        echo   X Install failed
        pause
        exit /b 1
    )
) else (
    call npm install --silent
)
echo   V Dependencies ready
echo.

rem --- 4. Generate Prisma client ---
echo   [4/5] Generating Prisma client...
call npx prisma generate >nul 2>&1
if errorlevel 1 (
    echo   ! Prisma generate failed, DB may not work
) else (
    echo   V Prisma client ready
)
echo.

rem --- 5. Start dev server ---
echo   [5/5] Starting dev server...
echo.
echo   --------------------------------------
echo   URL:  http://localhost:3000
echo   Mode: Dev (HMR enabled)
echo   Stop: Ctrl+C
echo   --------------------------------------
echo.

call npm run dev

pause
exit /b
