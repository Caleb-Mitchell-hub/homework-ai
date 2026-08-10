@echo off
chcp 65001 >nul
title 停止 Homework AI

echo.
echo   ╔══════════════════════════════════════╗
echo   ║   🛑 停止 Homework AI 服务           ║
echo   ╚══════════════════════════════════════╝
echo.

set FOUND=0

rem ── 停止端口 3000（开发环境）──
set PORT=3000
echo   [开发环境] 检查端口 %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    set PID=%%a
    set FOUND=1
    echo   找到进程 PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (echo   ✗ 无法终止) else (echo   ✓ 已终止)
)
if not defined PID echo   ⚠ 端口 %PORT% 未被占用
echo.
set PID=

rem ── 停止端口 3001（生产环境）──
set PORT=3001
echo   [生产环境] 检查端口 %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    set PID=%%a
    set FOUND=1
    echo   找到进程 PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (echo   ✗ 无法终止) else (echo   ✓ 已终止)
)
if not defined PID echo   ⚠ 端口 %PORT% 未被占用
echo.

if %FOUND%==0 (
    echo   ⚠ 未找到运行中的服务（端口 3000 / 3001）
    echo.
)

echo   ─────────────────────────────────────
echo   服务已停止，可以关闭此窗口
echo   ─────────────────────────────────────
echo.
timeout /t 3 /nobreak >nul
exit /b 0
