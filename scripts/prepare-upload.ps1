# 上传前在 Windows 运行，避免把本机 node_modules 带进 SFTP
$root = Split-Path -Parent $PSScriptRoot
$nm = Join-Path $root "shopradar-server\node_modules"
if (Test-Path $nm) {
  Remove-Item -Recurse -Force $nm
  Write-Host "已删除 shopradar-server\node_modules"
} else {
  Write-Host "无 shopradar-server\node_modules，可直接 Upload Project"
}
