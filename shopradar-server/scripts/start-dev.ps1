# Local dev only: API + Quick Tunnel (two PowerShell windows)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Split-Path -Parent $root

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$serverDir'; Write-Host '=== ShopRadar API (port 3000) ===' -ForegroundColor Cyan; npm start"
)

Start-Sleep -Seconds 2

Start-Process cmd -ArgumentList @('/k', "cd /d `"$serverDir`" && npm run tunnel")

Write-Host 'Opened: API window + tunnel window (local dev only)' -ForegroundColor Green
Write-Host 'Local  Lemon webhook: https://<trycloudflare-host>/api/webhook/lemon-squeezy'
Write-Host 'Prod   Lemon webhook: https://<your-domain>/api/webhook/lemon-squeezy'
