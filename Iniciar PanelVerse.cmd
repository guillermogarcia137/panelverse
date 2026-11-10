@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22 o posterior desde https://nodejs.org
  pause
  exit /b 1
)
echo Abre http://localhost:4173/panelverse/ en tu navegador.
node scripts/serve.mjs
pause
