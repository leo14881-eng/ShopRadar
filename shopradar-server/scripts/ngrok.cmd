@echo off
REM ShopRadar local dev: ngrok tunnel to port 3000 (not for production)
cd /d "%~dp0.."
set PORT=3000

where ngrok >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ngrok not found. Install: winget install Ngrok.Ngrok
  echo Then close and reopen CMD.
  exit /b 1
)

echo.
echo === ShopRadar ngrok [local dev only] ===
echo Local API: http://127.0.0.1:%PORT%
echo.
echo Checking API...
curl -s -o nul -w "health HTTP %%{http_code}\n" http://127.0.0.1:%PORT%/api/health 2>nul
echo.
echo Starting ngrok... Copy "Forwarding" https URL below.
echo Lemon Webhook: https://YOUR-NGROK-HOST/api/webhook/lemon-squeezy
echo Web UI (request log): http://127.0.0.1:4040
echo Press Ctrl+C to stop
echo.

ngrok http %PORT% --log=stdout
