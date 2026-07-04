# 生产环境启动脚本
# 用途：远程访问，无 HMR（不依赖 WebSocket），需要先 build

param(
    [switch]$SkipBuild = $false
)

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  生产环境启动 (Production Mode)" -ForegroundColor Magenta
Write-Host "  无 HMR，适合远程访问" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# 切换到脚本所在目录
Set-Location $PSScriptRoot

# 停止占用 3000 端口的旧进程
$portProcess = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portProcess) {
    $pid3000 = $portProcess.OwningProcess | Select-Object -Unique
    Write-Host "[1/4] 停止占用 3000 端口的进程 (PID: $pid3000)..." -ForegroundColor Yellow
    foreach ($p in $pid3000) {
        try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {}
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "[1/4] 3000 端口空闲" -ForegroundColor Green
}

# 检查 build 产物
if ($SkipBuild) {
    Write-Host "[2/4] 跳过构建 (--SkipBuild)" -ForegroundColor Yellow
} elseif (Test-Path ".next/BUILD_ID") {
    Write-Host "[2/4] 检测到现有构建产物，跳过 build" -ForegroundColor Green
    Write-Host "      (如需强制重新构建，请先删除 .next 目录)" -ForegroundColor Gray
} else {
    Write-Host "[2/4] 没有构建产物，开始 build..." -ForegroundColor Yellow
    Write-Host "      (这可能需要 30-60 秒)" -ForegroundColor Gray
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "❌ 构建失败，请检查错误信息" -ForegroundColor Red
        pause
        exit 1
    }
    Write-Host ""
    Write-Host "[2/4] ✅ 构建完成" -ForegroundColor Green
}

# 确保 Windows 防火墙规则存在
Write-Host "[3/4] 检查防火墙规则..." -ForegroundColor Yellow
$firewallRule = Get-NetFirewallRule -DisplayName "Next.js Server" -ErrorAction SilentlyContinue
if (-not $firewallRule) {
    New-NetFirewallRule -DisplayName "Next.js Server" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
    Write-Host "      ✅ 已添加防火墙入站规则" -ForegroundColor Green
} else {
    Write-Host "      ✅ 防火墙规则已存在" -ForegroundColor Green
}

# 启动生产服务器
Write-Host "[4/4] 启动生产服务器..." -ForegroundColor Yellow
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Green
Write-Host "  本地:    http://localhost:3000" -ForegroundColor White
Write-Host "  局域网:  http://192.168.36.242:3000" -ForegroundColor White
Write-Host "  公网:    http://112.74.98.147:3000 (需 frp)" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

npm run start
