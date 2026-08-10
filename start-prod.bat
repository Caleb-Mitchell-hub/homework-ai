@echo off
chcp 65001 >nul
title Homework AI - 生产环境
cd /d "%~dp0"

set PORT=3001

echo.
echo   ╔══════════════════════════════════════╗
echo   ║   🏭 Homework AI - 生产环境          ║
echo   ╚══════════════════════════════════════╝
echo.

rem ── 1. 检查 Node.js ──
echo   [1/6] 检查 Node.js...
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
echo   [2/6] 检查 .env 配置...
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
echo   [3/6] 安装依赖...
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
echo   [4/6] 生成 Prisma 客户端...
call npx prisma generate >nul 2>&1
if errorlevel 1 (
    echo   ⚠ Prisma 生成失败，应用可能无法连接数据库
) else (
    echo   ✓ Prisma 客户端已生成
)
echo.

rem ── 5. 构建生产包 ──
echo   [5/6] 构建生产包...
echo   正在构建，请耐心等待...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo   ✗ 构建失败，请检查错误信息
    pause
    exit /b 1
)
echo.
echo   ✓ 构建完成
echo.

rem ── 6. 启动生产服务器 ──
echo   [6/6] 启动生产服务器...
echo.
echo   ─────────────────────────────────────────────────
echo   🌐 地址: http://localhost:%PORT%
echo   ⚡ 生产模式（性能优化，无热更新）
echo   💡 开发环境端口 3000，生产环境端口 %PORT%，可同时运行
echo   🛑 按 Ctrl+C 停止服务
echo   ─────────────────────────────────────────────────
echo.

call npm run start -- -p %PORT%

pause
exit /b
