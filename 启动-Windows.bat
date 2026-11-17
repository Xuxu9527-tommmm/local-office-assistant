@echo off
setlocal
title 本地办公助手
cd /d "%~dp0"

set "PORT=8080"
set "CTX=16384"
set "THREADS_CFG="
set "KVQ="

rem ---------- 作者信息 ----------
echo ==================================================
echo   本地办公助手    作者：汤姆汤汤汤
echo   微信：zx6530022  （要序列号、换机器、提需求都找这个）
echo   版权所有 2026 汤姆汤汤汤
echo ==================================================
echo.

rem ---------- 序列号校验（没有本机有效序列号就不启动） ----------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0授权检查.ps1"
if errorlevel 1 (
  echo.
  echo   如果上面没有出现「本机机器码」，而是报了一段红字，
  echo   多半是杀毒软件或单位组策略禁止运行脚本。
  echo   把这段红字截图发给提供软件的人。
  echo.
  pause
  exit /b
)

rem ---------- 读配置：当前模型 + 额外模型文件夹 ----------
rem 说明：所有参数都有「自动档」，小白什么都不用改。
rem config.txt 里写的值只是强制覆盖，不写就按电脑配置自动来。
set "MODEL="
set "CTX_CFG="
set "DIRFILE=%TEMP%\ladirs.txt"
if exist "%DIRFILE%" del "%DIRFILE%" >nul 2>&1
if exist "config.txt" (
  for /f "usebackq tokens=1,* delims==" %%a in ("config.txt") do (
    if /i "%%a"=="MODEL" set "MODEL=%%b"
    if /i "%%a"=="DIR" if not "%%b"=="" >"%DIRFILE%" echo %%b
    if /i "%%a"=="CTX" set "CTX_CFG=%%b"
    if /i "%%a"=="THREADS" set "THREADS_CFG=%%b"
    if /i "%%a"=="KVQ" set "KVQ=%%b"
  )
)
if defined MODEL if not exist "%MODEL%" set "MODEL="
set "ROUTER="
set "MCOUNT=0"

rem ---------- 模型分片：第一次启动自动拼回完整文件 ----------
rem 下载的是 3 个压缩包，解压后模型是 xxx.gguf.part1/2/3。
rem 这里逐个把 part1+part2+part3 拼回完整 gguf，只做一次。
rem 全用 goto 不用括号块：括号块里的中文行容易把 cmd 解析搞乱。
set "FOUND=0"
for %%f in ("模型\*.gguf.part1") do set /a FOUND+=1
if %FOUND%==0 goto MODELREADY
echo.
echo   第一次启动，正在把模型分片拼成完整文件……
echo   大概一两分钟，只做这一次，以后不用等。
echo.
set "FAILED=0"
for %%f in ("模型\*.gguf.part1") do call :MERGEONE "%%~ff"
if not "%FAILED%"=="0" goto MERGEBAD
echo   拼好了，继续启动。
echo.
goto MODELREADY

:MERGEONE
set "MBASE=%~dpn1"
if not exist "%MBASE%.part2" goto M1BAD
if not exist "%MBASE%.part3" goto M1BAD
copy /b "%MBASE%.part1"+"%MBASE%.part2"+"%MBASE%.part3" "%MBASE%" >nul
if errorlevel 1 goto M1BAD
if not exist "%MBASE%" goto M1BAD
del "%MBASE%.part1" "%MBASE%.part2" "%MBASE%.part3" >nul 2>&1
goto :eof

:M1BAD
echo   × 这个模型的分片拼不起来：%MBASE%
set "FAILED=1"
goto :eof

:PARTMISS
echo.
echo   模型分片数量不对（找得到 part1 却找不到 part2/3）。
echo   还有压缩包没解压。请把下载的另外几个压缩包也解压到
echo   这个文件夹，提示「目标文件夹已存在」点「是」，
echo   提示文件覆盖点「全部」，然后再双击启动。
echo.
pause
exit /b

:MERGEBAD
echo.
echo   拼装没成功。多半是硬盘空间不够：分片本身占 2.4G，
echo   合并后还要再占 2.4G，先腾出 3G 空间再试。
echo.
pause
exit /b

rem ---------- 开始找模型 ----------
:MODELREADY
rem ---------- 找模型：模型文件夹 → 额外文件夹 ----------
rem 模型文件夹里有 2 个以上模型且没固定单模型 → 路由模式，页面里可随时切换
if not defined MODEL for /r "模型" %%f in (*.gguf) do set /a MCOUNT+=1
if not defined MODEL if %MCOUNT% GEQ 2 set "ROUTER=1"
if not defined MODEL if not defined ROUTER for /r "模型" %%f in (*.gguf) do if not defined MODEL set "MODEL=%%f"
if not defined MODEL if not defined ROUTER if exist "%DIRFILE%" (
  for /f "usebackq delims=" %%d in ("%DIRFILE%") do (
    if not defined MODEL if exist "%%d" (
      for /r "%%d" %%f in (*.gguf) do if not defined MODEL set "MODEL=%%f"
    )
  )
)
if not defined MODEL if not defined ROUTER (
  echo.
  echo   没有找到模型文件（.gguf）。
  echo   把模型放进「模型」文件夹，或双击「管理模型-Windows.bat」
  echo   添加一个放着模型的新文件夹。
  echo.
  pause
  exit /b
)

rem ---------- 按 CPU 架构选引擎 ----------
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" (set "DIR=win-arm64") else (set "DIR=win-x64")
set "ENGINE=引擎\%DIR%\llama-server.exe"
rem 备用引擎：包内自带的老版本（单文件、兼容性最好），新引擎起不来时自动切换
set "ENGINE_B=引擎\%DIR%-b\llama-server.exe"
if not exist "%ENGINE%" (
  echo.
  echo   缺少引擎文件：引擎\%DIR%\llama-server.exe
  echo   说明压缩包没有解压完整，请整包重新解压。
  echo.
  pause
  exit /b
)

rem ---------- 端口被占用就换一个 ----------
netstat -an | findstr /C:":8080 " | findstr LISTENING >nul && (
  netstat -an | findstr /C:":8081 " | findstr LISTENING >nul && (set "PORT=8082") || (set "PORT=8081")
)

rem ---------- 自动适配这台电脑（用户不用做任何设置） ----------
rem 1) 看内存：8G 电脑用大上下文会卡死，自动降上下文 + 压缩缓存
set "RAMGB="
for /f %%g in ('powershell -NoProfile -Command "[int]((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB+0.5)"') do set "RAMGB=%%g"
if not defined RAMGB set "RAMGB=8"

set "CTX=6144"
if %RAMGB% GEQ 16 set "CTX=16384"
if %RAMGB% GEQ 12 if %RAMGB% LSS 16 set "CTX=8192"
if %RAMGB% GEQ 8 if %RAMGB% LSS 10 set "CTX=3072"
if %RAMGB% GEQ 10 if %RAMGB% LSS 12 set "CTX=4096"
if %RAMGB% LSS 8 set "CTX=3072"
if defined CTX_CFG set "CTX=%CTX_CFG%"

rem KV 缓存压缩：16G 以下自动打开，少占四成内存，不容易卡死
set "KVOPT="
if %RAMGB% LSS 12 set "KVOPT=-fa on -ctk q4_0 -ctv q4_0"
if %RAMGB% GEQ 12 if %RAMGB% LSS 16 set "KVOPT=-fa on -ctk q8_0 -ctv q8_0"
if "%KVQ%"=="1" set "KVOPT=-fa on -ctk q8_0 -ctv q8_0"
if "%KVQ%"=="0" set "KVOPT="

rem 2) 挑模型：按内存自动选「装得下且最好」的那个，结果写进 app\tuning.json，
rem    页面打开就自动选中，用户什么都不用管（想换随时在页面左下角换）
set "PICK="
if defined ROUTER (
  powershell -NoProfile -Command "$t=%RAMGB%*0.4; $m=Get-ChildItem '模型' -Filter *.gguf -Recurse | Sort-Object Length -Descending | Where-Object { $_.Length/1GB -le $t } | Select-Object -First 1; $o=@{ramGB=%RAMGB%;ctx=%CTX%;model=($(if($m){$m.Name}else{''}))} | ConvertTo-Json -Compress; [IO.File]::WriteAllText((Join-Path $PWD 'app\tuning.json'),$o,(New-Object Text.UTF8Encoding($false)))"
)
if not exist "app\tuning.json" > "app\tuning.json" echo {"ramGB":%RAMGB%,"ctx":%CTX%,"model":""}

rem ---------- 线程：用物理核数（超线程的逻辑核会让生成速度暴跌） ----------
set "THREADS="
for /f %%c in ('powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).NumberOfCores"') do set /a THREADS=%%c-1
if not defined THREADS set /a THREADS=%NUMBER_OF_PROCESSORS%-1
if %THREADS% LSS 2 set "THREADS=2"
if %THREADS% GTR 12 set "THREADS=12"
if defined THREADS_CFG set "THREADS=%THREADS_CFG%"

echo.
echo   ==========================================
echo      本地办公助手
echo   ==========================================
echo      电脑内存：%RAMGB%G，参数已自动调好（不用设置）
if defined ROUTER (
  echo      模型：多模型模式（模型文件夹里有 %MCOUNT% 个）
  echo      打开页面后，在顶部下拉里随时切换。
) else (
  echo      模型：%MODEL%
  echo      （要换模型：双击 管理模型-Windows.bat，
  echo       或把第二个模型放进「模型」文件夹，页面里就能切换）
)
echo      地址：http://127.0.0.1:%PORT%
echo.
echo      正在加载模型，第一次要等 20～60 秒（内存小的电脑慢一些）。
echo      会弹出一个叫「本地办公助手引擎」的黑窗口，
echo      那个是引擎，不要关；关掉就等于退出程序。
echo.

if defined ROUTER (
  start "本地办公助手引擎" cmd /k ""%ENGINE%" --models-dir 模型 --models-max 1 -c %CTX% -t %THREADS% --cache-reuse 256 --parallel 1 %KVOPT% --host 127.0.0.1 --port %PORT% --path app --jinja "
) else (
  start "本地办公助手引擎" cmd /k ""%ENGINE%" -m "%MODEL%" -c %CTX% -t %THREADS% --cache-reuse 256 --parallel 1 %KVOPT% --host 127.0.0.1 --port %PORT% --path app --jinja "
)

rem ---------- 引擎秒退检测 + 自动降级重试 ----------
rem start 开的是独立窗口，引擎一崩窗口就关、报错跟着消失。
rem 现在用 cmd /k 让窗口停住，同时在这里判断进程还在不在。
rem 降级顺序：新引擎正常参数 → 新引擎保守参数 → 备用引擎正常 → 备用引擎保守
timeout /t 6 >nul
tasklist /fi "imagename eq llama-server.exe" 2>nul | findstr /i "llama-server.exe" >nul
if not errorlevel 1 goto ENGINEALIVE

echo.
echo   引擎启动后几秒就退出了。先用最保守的参数重试一次……
echo   （上下文砍到 2048、线程 4、关掉缓存压缩，排除参数不兼容）
if defined ROUTER (
  start "本地办公助手引擎" cmd /k ""%ENGINE%" --models-dir 模型 --models-max 1 -c 2048 -t 4 --parallel 1 --host 127.0.0.1 --port %PORT% --path app "
) else (
  start "本地办公助手引擎" cmd /k ""%ENGINE%" -m "%MODEL%" -c 2048 -t 4 --parallel 1 --host 127.0.0.1 --port %PORT% --path app "
)
timeout /t 8 >nul
tasklist /fi "imagename eq llama-server.exe" 2>nul | findstr /i "llama-server.exe" >nul
if not errorlevel 1 goto ENGINEALIVE

rem ---------- 换包内备用引擎（老版单文件）再试 ----------
if not exist "%ENGINE_B%" goto NOBACKUP
echo.
echo   换用包内备用引擎（老版本，单文件）再试……
if defined ROUTER (
  start "本地办公助手引擎" cmd /k ""%ENGINE_B%" --models-dir 模型 --models-max 1 -c %CTX% -t %THREADS% --cache-reuse 256 --parallel 1 %KVOPT% --host 127.0.0.1 --port %PORT% --path app --jinja "
) else (
  start "本地办公助手引擎" cmd /k ""%ENGINE_B%" -m "%MODEL%" -c %CTX% -t %THREADS% --cache-reuse 256 --parallel 1 %KVOPT% --host 127.0.0.1 --port %PORT% --path app --jinja "
)
timeout /t 10 >nul
tasklist /fi "imagename eq llama-server.exe" 2>nul | findstr /i "llama-server.exe" >nul
if not errorlevel 1 goto BACKUPOK

if defined ROUTER (
  start "本地办公助手引擎" cmd /k ""%ENGINE_B%" --models-dir 模型 --models-max 1 -c 2048 -t 4 --parallel 1 --host 127.0.0.1 --port %PORT% --path app "
) else (
  start "本地办公助手引擎" cmd /k ""%ENGINE_B%" -m "%MODEL%" -c 2048 -t 4 --parallel 1 --host 127.0.0.1 --port %PORT% --path app "
)
timeout /t 8 >nul
tasklist /fi "imagename eq llama-server.exe" 2>nul | findstr /i "llama-server.exe" >nul
if not errorlevel 1 goto BACKUPOK

:NOBACKUP
echo.
echo   四次尝试都没成功（新引擎两种参数 + 备用引擎两种参数）。
echo   最常见的四个原因，按这个顺序排：
echo     1^) 杀毒软件拦了 llama-server.exe（360 / 火绒 / 电脑管家）
echo        把整个文件夹加进白名单，或先退出杀软再双击启动
echo     2^) Windows 11 的「智能应用控制」会拦没签名的引擎（点启动没反应就闪退）
echo        设置 → 隐私和安全性 → Windows 安全中心 → 应用和浏览器控制
echo        → 智能应用控制设置，关掉它再启动
echo     3^) 缺 VC++ 运行库：双击 诊断-Windows.bat，它会直接告诉你缺哪个
echo     4^) 路径里中文太多或太深：把整个文件夹挪到 D:\AI 这种纯英文短路径
echo.
echo   双击 诊断-Windows.bat 跑一遍，把那一屏截图发我（微信 zx6530022），
echo   里面的「退出码」能直接定位原因。
echo.
pause
exit /b

:BACKUPOK
echo.
echo   备用引擎启动成功，后面都用它（功能完全一样）。
echo.

:ENGINEALIVE

where curl >nul 2>&1
if errorlevel 1 (
  echo      检测不到 curl，等 25 秒后直接打开页面…
  timeout /t 25 >nul
  goto open
)

for /l %%i in (1,1,90) do (
  curl -s -o nul --max-time 2 http://127.0.0.1:%PORT%/health && goto open
  timeout /t 1 >nul
)
goto fail

:open
set "PCODE="
curl -s -o nul -w "%%{http_code}" --max-time 3 http://127.0.0.1:%PORT%/ > "%TEMP%\lacode.txt" 2>nul
if exist "%TEMP%\lacode.txt" set /p PCODE=<"%TEMP%\lacode.txt"
if defined PCODE if not "%PCODE%"=="200" (
  echo.
  echo      引擎已经起来了，但页面打不开（HTTP %PCODE%）。
  echo      基本是 app 文件夹缺失或不完整，检查：
  echo        1^) 软件根目录下要有 app 文件夹，里面有 index.html；
  echo        2^) 别把 启动 脚本单独拷到别处运行，要和 app、模型 放在一层。
  echo      放好后关掉窗口重新双击启动。
  echo.
)
start "" http://127.0.0.1:%PORT%/
echo.
echo      已经打开浏览器，可以开始用了。
echo      用完把两个窗口都关掉即可（浏览器页面关掉不影响）。
echo.
timeout /t 6 >nul
exit /b

:fail
echo.
echo   没有启动成功。最常见的原因：
echo     1. 内存不够：低于 8G 的电脑别开 DeepSeek 8B，换成通义千问 4B 或 DeepSeek 1.5B
echo     2. 模型文件没拷完整：重新拷一遍
echo     3. 杀毒软件拦了 llama-server.exe：在弹窗里选「允许」
echo     4. 端口被占用：关掉浏览器里其它本地服务再试
echo.
echo   看一眼「本地办公助手引擎」窗口里的报错，截图发我。
pause
