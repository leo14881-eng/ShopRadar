# ShopRadar local dev only: Cloudflare Quick Tunnel (not for production)
# Usage: npm start (terminal 1), then npm run tunnel (terminal 2)
# Production webhook: https://YOUR-DOMAIN/api/webhook/lemon-squeezy

$ErrorActionPreference = 'Stop'
$port = if ($env:PORT) { $env:PORT } else { 3000 }
$localUrl = "http://127.0.0.1:$port"
$webhookPath = '/api/webhook/lemon-squeezy'

function Find-Cloudflared {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $projectBin = Join-Path (Split-Path -Parent $scriptDir) 'bin\cloudflared.exe'
  if (Test-Path $projectBin) { return $projectBin }

  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "${env:ProgramFiles}\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  throw 'cloudflared not found. Run: winget install Cloudflare.cloudflared'
}

Write-Host ''
Write-Host '=== ShopRadar Quick Tunnel [local dev only] ===' -ForegroundColor Cyan
Write-Host 'Do NOT use trycloudflare in production.' -ForegroundColor DarkYellow
Write-Host "Local API: $localUrl"
Write-Host 'Checking local API...'

try {
  $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 3
  Write-Host ('  [OK] ' + ($health | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
  Write-Host '  [WARN] API not running. Start in another terminal:' -ForegroundColor Yellow
  Write-Host '         cd shopradar-server' -ForegroundColor Yellow
  Write-Host '         npm start' -ForegroundColor Yellow
  Write-Host ''
}

$cf = Find-Cloudflared
Write-Host ''
Write-Host "Starting cloudflared -> $localUrl" -ForegroundColor Cyan
Write-Host 'Public URL will appear below (https://xxxx.trycloudflare.com)'
Write-Host ''
Write-Host 'Lemon Squeezy Webhook URL:' -ForegroundColor Green
Write-Host "  https://<host-from-log>$webhookPath"
Write-Host ''
Write-Host 'Press Ctrl+C to stop' -ForegroundColor DarkGray
Write-Host ''

$serverDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$urlFile = Join-Path $serverDir 'tunnel-url.txt'
$urlWritten = $false

& $cf tunnel --url $localUrl 2>&1 | ForEach-Object {
  $line = $_.ToString()
  Write-Host $line

  if (-not $urlWritten -and $line -match '(https://[a-z0-9-]+\.trycloudflare\.com)') {
    $publicBase = $Matches[1]
    $webhookUrl = $publicBase + $webhookPath
    @(
      "public=$publicBase"
      "webhook=$webhookUrl"
      "updated=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    ) | Set-Content -Path $urlFile -Encoding UTF8

    Write-Host ''
    Write-Host '>>> Saved to tunnel-url.txt' -ForegroundColor Green
    Write-Host ">>> Lemon Webhook: $webhookUrl" -ForegroundColor Green
    Write-Host ''
    $urlWritten = $true
  }
}
