[Console]::OutputEncoding = [Text.Encoding]::GetEncoding(936)
$ErrorActionPreference = 'SilentlyContinue'

$v = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy').VerifiedAndReputablePolicyState
if ($null -eq $v) { '    智能应用控制：未启用（这项没问题）' }
elseif ($v -eq 0) { '    智能应用控制：关闭（这项没问题）' }
elseif ($v -eq 1) { '    智能应用控制：★评估模式 —— 可能拦截未签名引擎' }
else { '    智能应用控制：★★★已开启 —— 会拦截未签名引擎，这就是闪退原因' }

$p = Get-MpComputerStatus
if ($p -ne $null) {
    if ($p.RealTimeProtectionEnabled) { '    Windows Defender 实时保护：开' }
    else { '    Windows Defender 实时保护：关' }
}

$d = Get-ChildItem "$env:LOCALAPPDATA\CrashDumps" -Filter 'llama*'
if ($d -ne $null) {
    $d | Sort-Object LastWriteTime -Descending | Select-Object -First 2 | ForEach-Object { '    崩溃转储：' + $_.Name + '  ' + $_.LastWriteTime }
} else { '    崩溃转储目录里没有 llama 的记录' }

$e = Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000} -MaxEvents 50 | Where-Object { $_.Message -match 'llama' } | Select-Object -First 1
if ($e -ne $null) {
    '    ---- 系统崩溃日志（最后一条）----'
    ($e.Message -split "`r?`n" | Select-Object -First 6) | ForEach-Object { '    ' + $_ }
} else { '    应用日志里没有 llama 的崩溃记录' }
exit 0
