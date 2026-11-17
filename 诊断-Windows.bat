@echo off
title 本地办公助手 · 诊断
cd /d "%~dp0"
setlocal enabledelayedexpansion
set "REPORT=诊断报告.txt"
if exist "%REPORT%" del "%REPORT%" >nul 2>&1

echo ==================================================
echo   本地办公助手 · 诊断
echo   只检查、不修改。跑完把这一屏拍照发我
echo ==================================================
echo.

echo [1] 这台电脑
echo     架构：%PROCESSOR_ARCHITECTURE%
echo     核数：%NUMBER_OF_PROCESSORS%
echo     目录：%CD%
echo.

set "DIR=win-x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "DIR=win-arm64"
set "ENGINE=引擎\%DIR%\llama-server.exe"
set "ENGINE_B=引擎\%DIR%-b\llama-server.exe"

echo [2] 文件齐全情况
call :CHK "%ENGINE%" "主引擎 llama-server.exe"
call :CHK "引擎\%DIR%\llama-server-impl.dll" "主引擎核心 impl.dll"
call :CHK "引擎\%DIR%\vcruntime140.dll" "VC运行库 vcruntime140.dll"
call :CHK "引擎\%DIR%\msvcp140.dll" "VC运行库 msvcp140.dll"
call :CHK "%ENGINE_B%" "★备用引擎(老版单文件)"
echo.

echo [3] 模型文件
set "MCOUNT=0"
for /r "模型" %%f in (*.gguf) do set /a MCOUNT+=1
echo     找到 !MCOUNT! 个 .gguf
echo.

echo [4] 主引擎能不能起来
echo ------------------------------------------------
if not exist "%ENGINE%" goto SKIP_MAIN
"%ENGINE%" --version
set "ECODE=!ERRORLEVEL!"
echo ------------------------------------------------
echo     主引擎退出码 = !ECODE!
call :WHY "!ECODE!"
echo.
goto T_B

:SKIP_MAIN
echo     主引擎文件不存在，跳过
echo.

:T_B
echo [5] 备用引擎能不能起来（老版单文件，兼容性最好）
echo ------------------------------------------------
if not exist "%ENGINE_B%" goto SKIP_B
"%ENGINE_B%" --version
set "BCODE=!ERRORLEVEL!"
echo ------------------------------------------------
echo     备用引擎退出码 = !BCODE!
call :WHY "!BCODE!"
echo.
goto SYS

:SKIP_B
echo     备用引擎没有。需要另外下载「备用引擎包」解压到这个文件夹，
echo     解压后本目录下会多出一个「引擎\win-x64-b」文件夹。
echo.

:SYS
echo [6] 常见杀毒软件
set "AVFOUND=0"
call :AV 360tray.exe "360安全卫士"
call :AV ZhuDongFangYu.exe "360主动防御"
call :AV 360sd.exe "360杀毒"
call :AV HipsDaemon.exe "火绒"
call :AV wsctrl.exe "火绒(新)"
call :AV QQPCTray.exe "腾讯电脑管家"
call :AV QQPCMgr.exe "腾讯电脑管家"
call :AV kxetray.exe "金山毒霸"
if "!AVFOUND!"=="0" echo     没有发现常见杀软进程（也可能是服务级拦截）
echo.

echo [7] 详细检查（智能应用控制 / 崩溃记录）
if not exist "%~dp0诊断-详细.ps1" goto NOPS
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0诊断-详细.ps1"
goto TAIL

:NOPS
echo     缺少 诊断-详细.ps1，跳过

:TAIL
echo.
echo ==================================================
echo   看上面 [4] 和 [5] 两处「退出码」：
echo     都是 0 且有 version 字样   = 引擎没问题，问题在参数或拦截
echo     负数（-1073741515 之类）    = 看右边那句中文解释
echo     5                           = 杀毒软件直接拒绝运行
echo   把这一屏拍照发我：微信 zx6530022
echo ==================================================
echo.
echo   （同时会在本目录生成 诊断报告.txt）
call :RP 诊断报告 %DATE% %TIME%
call :RP 架构 %PROCESSOR_ARCHITECTURE% / 目录 %CD%
call :RP 模型数 !MCOUNT!
call :RP 主引擎退出码 !ECODE!
call :RP 备用引擎退出码 !BCODE!
pause
exit /b

rem ============ 子过程 ============
:CHK
if exist %1 goto CHK_Y
echo     %~2：缺失
goto :eof
:CHK_Y
echo     %~2：在
goto :eof

:AV
tasklist /fi "imagename eq %~1" 2>nul | findstr /i "%~1" >nul
if errorlevel 1 goto :eof
echo     发现：%~2
set "AVFOUND=1"
goto :eof

:RP
echo %* >> "%REPORT%"
goto :eof

:WHY
if "%~1"=="0" echo       -- 正常（上面有 version 号就是好的）
if "%~1"=="1" echo       -- 引擎自己报错，看它上面打印的文字
if "%~1"=="5" echo       -- 拒绝访问：杀毒软件或系统权限拦截
if "%~1"=="9009" echo       -- 程序找不到（文件被删或被隔离）
if "%~1"=="-1073741515" echo       -- 0xC0000135：找不到运行库 DLL
if "%~1"=="3221225786" echo       -- 0xC0000135：找不到运行库 DLL
if "%~1"=="-1073741701" echo       -- 0xC000007B：位数不对或文件损坏
if "%~1"=="3221225595" echo       -- 0xC000007B：位数不对或文件损坏
if "%~1"=="-1073741819" echo       -- 0xC0000005：内存访问冲突
if "%~1"=="3221225477" echo       -- 0xC0000005：内存访问冲突
if "%~1"=="-1073741795" echo       -- 0xC000001D：CPU 不支持这条指令
if "%~1"=="3221225501" echo       -- 0xC000001D：CPU 不支持这条指令
if "%~1"=="-1073740791" echo       -- 0xC0000409：栈溢出/安全校验失败
if "%~1"=="-1073741571" echo       -- 0xC00000FD：栈溢出
if "%~1"=="-1058529278" echo       -- 0xC0E90002：被 Windows 智能应用控制拦截
if "%~1"=="3236438018" echo       -- 0xC0E90002：被 Windows 智能应用控制拦截
goto :eof
