@echo off
chcp 65001 >nul
title 重启 Homework AI - 生产环境
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════╗
echo   ║   🔄 重启 Homework AI - 生产环境     ║
echo   ║   端口: 3001                         ║
echo   ╚══════════════════════════════════════╝
echo.
echo   正在停止服务...
echo.
call "%~dp0stop.bat"
echo.
echo   ⏳ 等待端口释放...
timeout /t 3 /nobreak >nul
echo.
echo   正在启动生产环境...
echo.
call "%~dp0start-prod.bat"
exit /b
