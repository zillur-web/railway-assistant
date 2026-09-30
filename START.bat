@echo off
title Railway Ticket Assistant
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm install
  if errorlevel 1 pause & exit /b 1
  echo Installing Chromium...
  call npx playwright install chromium
  if errorlevel 1 pause & exit /b 1
)
start http://localhost:3000
npm start
pause
