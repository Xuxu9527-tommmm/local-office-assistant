@echo off
setlocal enabledelayedexpansion
title RESTORE CPU VARIANTS
cd /d "%~dp0"
set "N=0"
echo Restoring optimized cpu variant dlls ...
for /d %%d in ("*") do (
  if exist "%%d\win-x64\llama-server.exe" call :SHOW "%%d\win-x64"
  if exist "%%d\win-x64-b\llama-server.exe" call :SHOW "%%d\win-x64-b"
)
echo     restored files: %N%
echo Done.
pause
exit /b

:SHOW
if not exist "%~1" goto :eof
for %%f in ("%~1\ggml-cpu-*.dll.off") do call :ONE "%%f"
goto :eof

:ONE
set "FN=%~nx1"
set "FN=!FN:.off=!"
ren "%~1" "!FN!" 2>nul
if errorlevel 1 goto :eof
set /a N+=1
goto :eof
