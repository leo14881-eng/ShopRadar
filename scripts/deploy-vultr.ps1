# Deploy shopradar-server + shopradar-website via OpenSSH (scp/ssh). Reads .vscode/sftp.json
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sftpJson = Join-Path $root ".vscode\sftp.json"
if (-not (Test-Path $sftpJson)) { throw "Missing $sftpJson" }

& (Join-Path $root "scripts\prepare-upload.ps1")

$cfg = Get-Content $sftpJson -Raw -Encoding UTF8 | ConvertFrom-Json
$hostName = $cfg.host
$user = $cfg.username
$remoteBase = ($cfg.remotePath -replace '/$', '')
$keyPath = $cfg.privateKeyPath
if ($keyPath -match '^~[/\\]') {
  $keyPath = Join-Path $env:USERPROFILE ($keyPath -replace '^~[/\\]', '')
}
if (-not (Test-Path $keyPath)) { throw "SSH key not found: $keyPath" }

$target = "${user}@${hostName}"
$sshArgs = @('-i', $keyPath, '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes')
$uploadDirs = @('shopradar-server', 'shopradar-website')

Write-Host "Deploy to $target ($remoteBase) ..."

foreach ($dir in $uploadDirs) {
  $localDir = Join-Path $root $dir
  if (-not (Test-Path $localDir)) {
    Write-Host "Skip (missing): $dir"
    continue
  }
  Write-Host "Upload $dir/ ..."
  & scp @sshArgs -r $localDir "${target}:${remoteBase}/"
  if ($LASTEXITCODE -ne 0) { throw "scp failed for $dir" }
}

Write-Host ""
Write-Host "Running after-upload.sh on server ..."
& ssh @sshArgs $target "bash $remoteBase/shopradar-server/deploy/after-upload.sh"
if ($LASTEXITCODE -ne 0) { throw "after-upload.sh failed" }

Write-Host ""
Write-Host "Deploy complete."
Write-Host "  Website: https://shopradar.uk"
Write-Host "  API:     https://api.shopradar.uk/api/health"
