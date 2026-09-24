@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0dist\index.html" (
  echo 尚未生成 dist，请先双击 build-dist.cmd。
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Root "%~dp0dist"
if errorlevel 1 pause
endlocal
