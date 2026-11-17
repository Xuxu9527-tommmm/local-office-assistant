@echo off
setlocal enabledelayedexpansion
title CRASH REASON READER
cd /d "%~dp0"
set "OUT=%TEMP%\crashreport.txt"
if exist "%OUT%" del "%OUT%" >nul 2>&1

set "MAIN="
set "BACK="
for /d %%d in ("*") do (
  if exist "%%d\win-x64\llama-server.exe" set "MAIN=%%d\win-x64\llama-server.exe"
  if exist "%%d\win-x64-b\llama-server.exe" set "BACK=%%d\win-x64-b\llama-server.exe"
)

echo ==========================================================
echo   CRASH REASON READER   (English only, no garbled text)
echo   Please take a photo of this screen and send it back
echo ==========================================================
echo.

echo [A] Engine paths found
if defined MAIN (echo     MAIN   engine : !MAIN!) else (echo     MAIN   engine : NOT FOUND)
if defined BACK (echo     BACKUP engine : !BACK!) else (echo     BACKUP engine : NOT FOUND)
echo.

echo [B] Exit code of each engine  (0 = healthy)
if not defined MAIN goto B2
"!MAIN!" --version
echo     MAIN   engine exit code = %ERRORLEVEL%
:B2
if not defined BACK goto B3
"!BACK!" --version
echo     BACKUP engine exit code = %ERRORLEVEL%
:B3
echo     code -1073741819 = 0xC0000005 access violation
echo     code -1073741515 = 0xC0000135 dll missing
echo     code 5 = access denied (antivirus)
echo.

echo [C] Windows crash log - look for the Faulting module name
wevtutil qe Application /q:"*[System[(EventID=1000)]]" /c:4 /rd:true /f:text > "%OUT%" 2>&1
findstr /i "llama .dll .exe" "%OUT%"
echo.
echo     full log saved to: %OUT%
echo.

echo [D] Security software running now
tasklist /fi "imagename eq 360tray.exe" 2>nul | findstr /i "360tray" >nul && echo     FOUND 360 Safe
tasklist /fi "imagename eq ZhuDongFangYu.exe" 2>nul | findstr /i "ZhuDong" >nul && echo     FOUND 360 Active Defense
tasklist /fi "imagename eq 360sd.exe" 2>nul | findstr /i "360sd" >nul && echo     FOUND 360 Antivirus
tasklist /fi "imagename eq HipsDaemon.exe" 2>nul | findstr /i "HipsDaemon" >nul && echo     FOUND Huorong
tasklist /fi "imagename eq wsctrl.exe" 2>nul | findstr /i "wsctrl" >nul && echo     FOUND Huorong new
tasklist /fi "imagename eq QQPCTray.exe" 2>nul | findstr /i "QQPCTray" >nul && echo     FOUND Tencent PC Manager
tasklist /fi "imagename eq kxetray.exe" 2>nul | findstr /i "kxetray" >nul && echo     FOUND Kingsoft
tasklist /fi "imagename eq MsMpEng.exe" 2>nul | findstr /i "MsMpEng" >nul && echo     FOUND Defender
echo.

echo [E] Memory integrity (HVCI) - 0x1 means ON and may block engines
reg query "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" /v Enabled 2>nul
echo.

echo [E2] Global injected DLLs (AppInit_DLLs) - should be EMPTY
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows" /v AppInit_DLLs 2>nul
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Windows" /v AppInit_DLLs 2>nul
echo     (if a dll name appears above, that dll is injected into EVERY program)
echo.

echo [E3] Mandatory ASLR (MoveImages) - 0x1 means forced ASLR, a known crash cause
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v MoveImages 2>nul
echo     (0xffffffff or not found = normal)
echo.

echo [F] Windows version
ver
echo.

echo ==========================================================
echo   Send this photo back. WeChat: zx6530022
echo ==========================================================
echo.
start "" notepad "%OUT%"
pause
exit /b
