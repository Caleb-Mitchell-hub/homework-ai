@echo off
chcp 65001 >nul
title Homework AI - 开发环境
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════╗
echo   ║   🚀 Homework AI - 开发环境          ║
echo   ╚══════════════════════════════════════╝
echo.

rem ── 1. 检查 Node.js ──
echo   [1/5] 检查 Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo   ✗ 未找到 Node.js，请先安装 Node.js
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   ✓ Node.js %NODE_VER%
echo.

rem ── 2. 检查 .env ──
echo   [2/5] 检查 .env 配置...
if not exist ".env" (
    if exist ".env.example" (
        echo   ⚠ 未找到 .env，正在从 .env.example 复制...
        copy ".env.example" ".env" >nul
        echo   ✓ 已创建 .env，请根据实际情况修改配置
    ) else (
        echo   ✗ 未找到 .env 配置文件
        pause
        exit /b 1
    )
) else (
    echo   ✓ .env 已就绪
)
echo.

rem ── 3. 安装依赖 ──
echo   [3/5] 安装依赖...
if not exist "node_modules" (
    echo   首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo   ✗ 依赖安装失败
        pause
        exit /b 1
    )
) else (
    call npm install --silent
)
echo   ✓ 依赖已就绪
echo.

rem ── 4. 生成 Prisma 客户端 ──
echo   [4/5] 生成 Prisma 客户端...
call npx prisma generate >nul 2>&1
if errorlevel 1 (
    echo   ⚠ Prisma 生成失败，应用可能无法连接数据库
) else (
    echo   ✓ Prisma 客户端已生成
)
echo.

rem ── 5. 启动开发服务器 ──
echo   [5/5] 启动开发服务器...
echo.
echo   ─────────────────────────────────────
echo   🌐 地址: http://localhost:3000
echo   🔥 热更新已启用（修改代码即刷新）
echo   🛑 按 Ctrl+C 停止服务
echo   ─────────────────────────────────────
echo.

call npm run dev

pause
exit /b
