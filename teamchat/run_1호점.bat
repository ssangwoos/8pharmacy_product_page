@echo off
title [1호점] Alarm Launcher
cls
echo Starting Alarm Engine...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File alarm_1.ps1

echo.
echo ---------------------------------------------------
echo  [Error] Program stopped. Check the error message above.
echo ---------------------------------------------------
pause