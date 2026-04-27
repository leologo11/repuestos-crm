@echo off
chcp 65001 >nul
echo ================================================
echo  LOGS EN VIVO - Repuestos CRM (Railway)
echo  Presiona Ctrl+C para salir
echo ================================================
echo.

:: Instalar Railway CLI si no existe
where railway >nul 2>nul
if %errorlevel% neq 0 (
    echo Railway CLI no encontrado. Instalando...
    npm install -g @railway/cli
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: No se pudo instalar Railway CLI.
        echo Asegurate de tener Node.js instalado: https://nodejs.org
        pause
        exit /b 1
    )
    echo [OK] Railway CLI instalado
    echo.
    echo Ahora inicia sesion en Railway:
    railway login
    echo.
    echo Vincula tu proyecto:
    railway link
    echo.
)

echo Conectando a Railway...
echo TIP: El QR aparecera aqui cuando el bot arranque.
echo      Escanealo con WhatsApp ^> Dispositivos vinculados
echo.
railway logs --tail
pause
