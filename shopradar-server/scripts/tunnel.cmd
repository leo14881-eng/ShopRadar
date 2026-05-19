@echo off
REM ShopRadar Quick Tunnel (local dev only) - pure CMD, no PowerShell encoding issues
cd /d "%~dp0.."
set PORT=3000
if not "%PORT_OVERRIDE%"=="" set PORT=%PORT_OVERRIDE%

if not exist "bin\cloudflared.exe" (
  echo [ERROR] bin\cloudflared.exe not found.
  echo Download: https://github.com/cloudflare/cloudflared/releases
  exit /b 1
)

echo.
echo === ShopRadar Quick Tunnel [local dev only] ===
echo Local API: http://127.0.0.1:%PORT%
echo Lemon Webhook: https://^<trycloudflare-host^>/api/webhook/lemon-squeezy
echo Press Ctrl+C to stop
echo.

bin\cloudflared.exe tunnel --url http://127.0.0.1:%PORT%
