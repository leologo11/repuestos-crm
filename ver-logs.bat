@echo off
chcp 65001 >nul
echo ================================================
echo  LOGS EN VIVO - Repuestos CRM (Railway)
echo  Presiona Ctrl+C para salir
echo ================================================
echo.
echo TIP: El codigo QR aparecera automaticamente cuando
echo      el bot arranque. Escanea con tu WhatsApp.
echo.
railway logs --tail
pause
