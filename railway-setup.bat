@echo off
chcp 65001 >nul
echo ================================================
echo  SETUP RAILWAY CLI - Solo correr una vez
echo ================================================
echo.

:: Verificar si Railway CLI ya esta instalado
where railway >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Railway CLI ya esta instalado
    railway --version
) else (
    echo Instalando Railway CLI...
    npm install -g @railway/cli
    if %errorlevel% neq 0 (
        echo ERROR: No se pudo instalar. Asegurate de tener Node.js instalado.
        pause
        exit /b 1
    )
    echo [OK] Railway CLI instalado
)

echo.
echo Iniciando sesion en Railway (se abrira el navegador)...
railway login

echo.
echo Vinculando con tu proyecto repuestos-crm...
railway link

echo.
echo ================================================
echo  LISTO! Ahora puedes usar ver-logs.bat
echo ================================================
pause
