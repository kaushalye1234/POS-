@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-ClientPC.ps1" %*
exit /b %errorlevel%
