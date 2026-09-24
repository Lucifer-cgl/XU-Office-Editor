@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-dist.ps1"
if errorlevel 1 (
  echo 构建失败。
  pause
  exit /b 1
)
echo 构建完成，dist 已更新。
pause
endlocal
