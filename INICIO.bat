@echo off
title TikTok Game Overlay - SurLab Studio
color 0A
echo.
echo  =============================================
echo   TikTok Game Overlay  -  SurLab Studio
echo  =============================================
echo.

REM Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado.
    echo Descarga desde: https://nodejs.org
    pause
    exit /b 1
)

REM Instalar dependencias si no existen
if not exist "node_modules" (
    echo Instalando dependencias...
    npm install
    echo.
)

echo Iniciando servidor...
echo.
echo  URL overlay:  http://localhost:3000/overlay.html
echo  Panel setup:  http://localhost:3000
echo.
echo  Copia la URL del overlay como Link Source en TikTok Live Studio
echo.

REM Opcion: pasar usuario como argumento
REM  INICIO.bat @miusuario
if not "%1"=="" (
    set TIKTOK_USER=%1
    echo  Conectando como: %1
    echo.
)

node server.js
pause
