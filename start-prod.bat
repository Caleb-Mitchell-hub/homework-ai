@echo off
if not defined _BG_ (
    set _BG_=1
    start /min "" "%~f0" %*
    exit
)
chcp 936 >nul
title Homework AI - Prod
cd /d "%~dp0"

echo.
echo   ======================================
echo     Homework AI - Prod Server
echo   ======================================
echo.

rem --- 1. Check Node.js ---
echo   [1/6] Checking Node.js...
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
echo   [2/6] Checking .env config...
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
echo   [3/6] Installing dependencies...
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
echo   [4/6] Generating Prisma client...
call npx prisma generate >nul 2>&1
if errorlevel 1 (
    echo   ! Prisma generate failed, DB may not work
) else (
    echo   V Prisma client ready
)
echo.

rem --- 5. Build ---
echo   [5/6] Building for production...
echo   Please wait...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo   X Build failed. See errors above.
    pause
    exit /b 1
)
echo.
echo   V Build complete
echo.

rem --- 6. Start prod server (port 3001) ---
echo   [6/6] Starting prod server...
echo.
echo   --------------------------------------
echo   URL:  http://localhost:3001
echo   Mode: Production (optimized, no HMR)
echo   Dev:  http://localhost:3000 (run start-dev.bat)
echo   Stop: Ctrl+C
echo   --------------------------------------
echo.

set PORT=3001
call npm run start

pause
exit /b
