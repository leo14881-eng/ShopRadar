# Remove local node_modules before upload (avoid shipping Windows binaries)
$root = Split-Path -Parent $PSScriptRoot
$nm = Join-Path $root "shopradar-server\node_modules"
if (Test-Path $nm) {
  Remove-Item -Recurse -Force $nm
  Write-Host "Removed shopradar-server\node_modules"
} else {
  Write-Host "No shopradar-server\node_modules — ready to upload"
}
