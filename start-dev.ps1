# 开发环境启动脚本
# 用途：本地开发，支持热更新 (HMR)，绑定 0.0.0.0 允许局域网/远程访问

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  开发环境启动 (Development Mode)" -ForegroundColor Cyan
Write-Host "  HMR 热更新已启用" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 切换到脚本所在目录
Set-Location $PSScriptRoot

# 停止占用 3000 端口的旧进程
$portProcess = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portProcess) {
    $pid3000 = $portProcess.OwningProcess | Select-Object -Unique
    Write-Host "[1/3] 停止占用 3000 端口的进程 (PID: $pid3000)..." -ForegroundColor Yellow
    foreach ($p in $pid3000) {
        try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {}
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "[1/3] 3000 端口空闲" -ForegroundColor Green
}

# 检查 .next 目录（dev 模式不需要 build，但清理一下更稳）
Write-Host "[2/3] 启动开发服务器..." -ForegroundColor Yellow
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Green
Write-Host "  本地:    http://localhost:3000" -ForegroundColor White
Write-Host "  局域网:  http://192.168.36.242:3000" -ForegroundColor White
Write-Host "  公网:    http://112.74.98.147:3000 (需 frp)" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

# 启动 dev server
npm run dev
