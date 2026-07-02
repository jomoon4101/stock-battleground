@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
set "GAME_ARGS="
if "%STOCK_SURVIVAL_NO_BROWSER%"=="1" set "GAME_ARGS=-NoBrowser"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1" %GAME_ARGS%
set "GAME_EXIT=%ERRORLEVEL%"
popd
if not "%GAME_EXIT%"=="0" pause
exit /b %GAME_EXIT%
