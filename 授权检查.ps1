# =============================================================
#  本地办公助手 · 序列号校验（Windows）
#  由「启动-Windows.bat」自动调用，不需要手动运行。
#  校验不通过就不会启动引擎，页面也就打不开。
#
#  序列号规则：BGS9-XXXX-XXXX-XXXX-XX
#  每个序列号都是按本机机器码算出来的，换一台电脑用不了。
# =============================================================

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LicDir = Join-Path $Root '授权'
$LicFile = Join-Path $LicDir '序列号.txt'
$RecFile = Join-Path $LicDir '授权记录.txt'
$AppDir = Join-Path $Root 'app'
$StateFile = Join-Path $AppDir '授权状态.json'

$script:ALPHA = '23456789ABCDEFGHJKLMNPQRTUVWXY'

function GW-Hash {
  param([string]$Text, [uint64]$Seed)
  [uint64]$h = $Seed
  for ($i = 0; $i -lt $Text.Length; $i++) {
    $c = [int][char]$Text[$i]
    $h = ($h * 33 + [uint64]$c) % 4294967296
  }
  return $h
}

function GW-Enc {
  param([uint64]$Num, [int]$Width)
  $s = ''
  for ($i = 0; $i -lt $Width; $i++) {
    $idx = [int]($Num % 30)
    $s = $s + $script:ALPHA[$idx]
    $Num = [uint64][math]::Floor($Num / 30)
  }
  return $s
}

function GW-MachineCode {
  param([string]$Fingerprint)
  $f2 = ($Fingerprint.ToUpper() -replace '[^A-Z0-9]', '')
  $h1 = GW-Hash -Text ("BGS9|M|" + $f2 + "|v1") -Seed 5381
  $h2 = GW-Hash -Text ("BGS9|M|" + $f2 + "|v2") -Seed 52711
  $a = (GW-Enc -Num $h1 -Width 4) + (GW-Enc -Num $h2 -Width 4)
  return $a.Substring(0, 4) + '-' + $a.Substring(4, 4)
}

function GW-SerialOf {
  param([string]$MachineCode)
  $m = ($MachineCode.ToUpper() -replace '[^A-Z0-9]', '')
  [uint64]$st = GW-Hash -Text ("BGS9|T|" + $m + "|2026") -Seed 2166136261
  $s = ''
  for ($i = 0; $i -lt 12; $i++) {
    $st = GW-Hash -Text (([string]$st) + ':' + $i) -Seed $st
    $s = $s + $script:ALPHA[[int]($st % 30)]
  }
  $c1 = GW-Hash -Text ("BGS9|C|" + $s + "|a") -Seed 7919
  $c2 = GW-Hash -Text ("BGS9|C|" + $s + "|b") -Seed 104729
  return "BGS9-" + $s.Substring(0, 4) + '-' + $s.Substring(4, 4) + '-' + $s.Substring(8, 4) + '-' + $script:ALPHA[[int]($c1 % 30)] + $script:ALPHA[[int]($c2 % 30)]
}

# ---------- 取本机指纹：注册表 MachineGuid 为主，取不到再用主板 UUID ----------
function GW-Fingerprint {
  $mg = ''
  $k = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid
  if ($k) { $mg = [string]$k.MachineGuid }

  if (-not $mg) {
    $u = ''
    try { $u = [string](Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID } catch { $u = '' }
    if (-not $u) {
      try { $u = [string](Get-WmiObject -Class Win32_ComputerSystemProduct).UUID } catch { $u = '' }
    }
    $b = ''
    try { $b = [string](Get-CimInstance -ClassName Win32_BaseBoard).SerialNumber } catch { $b = '' }
    $mg = $u + $b
  }

  if (-not $mg) { $mg = 'NOID-' + $env:COMPUTERNAME }
  return $mg + '|' + $env:COMPUTERNAME
}

function GW-Normalize {
  param([string]$Code)
  $s = ($Code.ToUpper() -replace '[\s\u3000]', '')
  $s = $s -replace '—', '-'
  $s = $s -replace '－', '-'
  return $s
}

# 返回 @{ ok = $true/$false; reason = '...' }
function GW-Check {
  param([string]$Code, [string]$MachineCode)
  $s = GW-Normalize $Code
  if (-not $s) { return @{ ok = $false; reason = 'empty' } }
  $p = $s.Split('-')
  if ($p[0] -ne 'BGS9') {
    if ($p[0] -like 'GW2A*') { return @{ ok = $false; reason = 'old' } }
    return @{ ok = $false; reason = 'prefix' }
  }
  if ($p.Count -ne 5 -or $p[1].Length -ne 4 -or $p[2].Length -ne 4 -or $p[3].Length -ne 4 -or $p[4].Length -ne 2) {
    return @{ ok = $false; reason = 'format' }
  }
  $body = $p[1] + $p[2] + $p[3] + $p[4]
  foreach ($ch in $body.ToCharArray()) {
    if ($script:ALPHA.IndexOf($ch) -lt 0) { return @{ ok = $false; reason = 'chars' } }
  }
  $want = (GW-SerialOf -MachineCode $MachineCode).Replace('-', '')
  if ($s.Replace('-', '') -ne $want) { return @{ ok = $false; reason = 'mismatch' } }
  return @{ ok = $true; reason = ''; code = $s }
}

function GW-SaveState {
  param([string]$Code, [string]$MachineCode)
  if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir | Out-Null }
  $json = '{"code":"' + $Code + '","machine":"' + $MachineCode + '","at":"' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + '"}'
  [System.IO.File]::WriteAllText($StateFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function GW-SaveLicense {
  param([string]$Code, [string]$MachineCode)
  if (-not (Test-Path $LicDir)) { New-Item -ItemType Directory -Path $LicDir | Out-Null }
  [System.IO.File]::WriteAllText($LicFile, $Code + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($RecFile,
    "机器码：" + $MachineCode + "`r`n序列号：" + $Code + "`r`n激活时间：" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "`r`n",
    (New-Object System.Text.UTF8Encoding($false)))
}

# ============================ 主流程 ============================
$mc = GW-MachineCode -Fingerprint (GW-Fingerprint)

$code = ''
if (Test-Path $LicFile) {
  $code = (Get-Content -Path $LicFile -Encoding UTF8 -TotalCount 1)
}

$r = GW-Check -Code $code -MachineCode $mc
if ($r.ok) {
  GW-SaveState -Code $r.code -MachineCode $mc
  exit 0
}

# ---------- 没通过，走提示与手工输入 ----------
Write-Host ''
Write-Host '  ==========================================' -ForegroundColor DarkGray
Write-Host '   本机还没有可用的序列号' -ForegroundColor Yellow
Write-Host '  ==========================================' -ForegroundColor DarkGray
Write-Host ''
Write-Host '   本机机器码：' -NoNewline
Write-Host $mc -ForegroundColor Cyan
Write-Host ''
Write-Host '   把上面这行机器码发给提供软件的人（微信 zx6530022），换一个序列号。' -ForegroundColor Gray
Write-Host '   作者：汤姆汤汤汤   微信 zx6530022' -ForegroundColor DarkGray
Write-Host '   序列号只在这台电脑上有效，换机器要重新申请。' -ForegroundColor Gray
Write-Host ''

if ($r.reason -eq 'mismatch') {
  Write-Host '   （「授权\序列号.txt」里的号不是这台电脑的，或者抄错了）' -ForegroundColor DarkYellow
}
elseif ($r.reason -eq 'old') {
  Write-Host '   （这是另一套系统（GW2A 开头）的号，本工具用不了）' -ForegroundColor DarkYellow
}
elseif ($r.reason -eq 'format' -or $r.reason -eq 'chars') {
  Write-Host '   （格式不对：应为 BGS9-XXXX-XXXX-XXXX-XX，共 4 段，最后一段 2 位）' -ForegroundColor DarkYellow
}

$input_code = Read-Host '  粘贴序列号后按回车（直接回车退出）'
if (-not $input_code) {
  Write-Host ''
  Write-Host '   没有输入序列号，程序不启动。' -ForegroundColor Red
  exit 1
}

$r2 = GW-Check -Code $input_code -MachineCode $mc
if (-not $r2.ok) {
  Write-Host ''
  if ($r2.reason -eq 'mismatch') {
    Write-Host '   这个序列号和本机机器码对不上。' -ForegroundColor Red
    Write-Host '   可能是给另一台电脑的号，或者中间抄错了字符。' -ForegroundColor Gray
  }
  elseif ($r2.reason -eq 'old') {
    Write-Host '   这是另一套系统的序列号（GW2A 开头），本工具不能用。' -ForegroundColor Red
  }
  else {
    Write-Host '   序列号格式不对，请对照 BGS9-XXXX-XXXX-XXXX-XX 再试。' -ForegroundColor Red
  }
  Write-Host ''
  Write-Host '   本机机器码（重新核对用）：' -NoNewline
  Write-Host $mc -ForegroundColor Cyan
  exit 1
}

GW-SaveLicense -Code $r2.code -MachineCode $mc
GW-SaveState -Code $r2.code -MachineCode $mc

Write-Host ''
Write-Host '   序列号已保存，下次启动不用再输入。' -ForegroundColor Green
Write-Host ''
exit 0
