@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 LTS from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Build the app first: npm ci --ignore-scripts ^&^& npm run setup:engine ^&^& npm run build
  pause
  exit /b 1
)
if not exist "node_modules\zod\package.json" (
  echo Install dependencies first: npm ci --ignore-scripts
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4318"
node server\serve.mjs
pause
