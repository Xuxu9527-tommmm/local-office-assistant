@echo off
chcp 936 >nul
title 管理模型
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0管理模型.ps1"
if errorlevel 1 (
  echo.
  echo   上面的报错可以截图发我。
  pause
)
