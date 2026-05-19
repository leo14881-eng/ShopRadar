@echo off
REM One-time ngrok setup: link your ngrok.com account
REM 1. Register: https://dashboard.ngrok.com/signup
REM 2. Copy authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
REM 3. Run:  ngrok-setup.cmd YOUR_TOKEN_HERE

set "TOKEN=%~1"
if "%TOKEN%"=="" (
  echo.
  echo Usage: ngrok-setup.cmd YOUR_NGROK_AUTHTOKEN
  echo.
  echo Get token: https://dashboard.ngrok.com/get-started/your-authtoken
  echo.
  exit /b 1
)

where ngrok >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ngrok not in PATH. Close CMD and reopen, or reinstall: winget install Ngrok.Ngrok
  exit /b 1
)

ngrok config add-authtoken %TOKEN%
if errorlevel 1 exit /b 1

echo.
echo [OK] ngrok authtoken saved.
echo Next: npm start  ^(terminal 1^)  then  npm run ngrok  ^(terminal 2^)
echo.
