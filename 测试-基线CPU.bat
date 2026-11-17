@echo off
setlocal enabledelayedexpansion
title DISABLE CPU VARIANTS - TEST
cd /d "%~dp0"
set "N=0"

echo ==========================================================
echo   TEST: use only the most compatible CPU code path
echo   This renames the AVX-optimized dlls to .off
echo   Nothing is deleted. Run RESTORE later to undo.
echo ==========================================================
echo.

echo [1] Engines found
for /d %%d in ("*") do (
  if exist "%%d\win-x64\llama-server.exe" echo     %%d\win-x64
  if exist "%%d\win-x64-b\llama-server.exe" echo     %%d\win-x64-b
)
echo.

echo [2] Renaming optimized cpu variants ...
for /d %%d in ("*") do (
  if exist "%%d\win-x64\llama-server.exe" call :HIDE "%%d\win-x64"
  if exist "%%d\win-x64-b\llama-server.exe" call :HIDE "%%d\win-x64-b"
)
echo     renamed files: %N%
echo.

echo [3] Now testing the engine again ...
set "MAIN="
for /d %%d in ("*") do (
  if exist "%%d\win-x64\llama-server.exe" set "MAIN=%%d\win-x64\llama-server.exe"
)
if not defined MAIN goto DONE
"!MAIN!" --version
echo.
echo     MAIN engine exit code = %ERRORLEVEL%
echo     (0 = good news! -1073741819 = same crash)
echo.

:DONE
echo ==========================================================
echo   Photo this screen. Then double-click the start script.
echo   If it still crashes, run  UNDO-CPU.bat  to restore.
echo ==========================================================
pause
exit /b

:HIDE
if not exist "%~1" goto :eof
for %%f in ("%~1\ggml-cpu-*.dll") do call :ONE "%%f"
goto :eof

:ONE
if /i "%~nx1"=="ggml-cpu-x64.dll" goto :eof
if /i "%~x1"==".off" goto :eof
ren "%~1" "%~nx1.off" 2>nul
if errorlevel 1 goto :eof
set /a N+=1
goto :eof
