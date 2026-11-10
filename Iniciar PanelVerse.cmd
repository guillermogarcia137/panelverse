@echo off
cd /d "%~dp0"
set "PANELVERSE_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "E:\Programas\nodejs\node.exe" (
    set "PANELVERSE_NODE=E:\Programas\nodejs\node.exe"
  ) else (
    echo Instala Node.js 22 o posterior desde https://nodejs.org
    pause
    exit /b 1
  )
)
echo Abre http://localhost:4173/panelverse/ en tu navegador.
"%PANELVERSE_NODE%" scripts/serve.mjs
pause