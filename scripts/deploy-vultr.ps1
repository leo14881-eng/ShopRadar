# Deploy via Node+ssh2 (fallback when SFTP extension fails). Reads .vscode/sftp.json
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sftpJson = Join-Path $root ".vscode\sftp.json"
if (-not (Test-Path $sftpJson)) { throw "Missing $sftpJson" }

& (Join-Path $root "scripts\prepare-upload.ps1")

$ssh2 = "$env:USERPROFILE\.cursor\extensions\natizyskunk.sftp-*\node_modules\ssh2"
$ssh2Dir = (Get-Item $ssh2 -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $ssh2Dir) { throw "ssh2 not found (install Natizyskunk SFTP extension)" }

$nodeScript = Join-Path $root "scripts\deploy-vultr-upload.js"
node $nodeScript $sftpJson $root $ssh2Dir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Upload done. On server run:"
Write-Host "  bash /root/shopradar-backend/shopradar-server/deploy/after-upload.sh"
