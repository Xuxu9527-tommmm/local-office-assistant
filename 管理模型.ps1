# 管理模型（Windows）—— 由 管理模型-Windows.bat 调用
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$cfg = Join-Path $PSScriptRoot 'config.txt'
$baseDir = Join-Path $PSScriptRoot '模型'

$script:Model = ''
$script:Dirs = @()

function Load-Cfg {
    $script:Model = ''
    $script:Dirs = @()
    if (Test-Path $cfg) {
        foreach ($line in [IO.File]::ReadAllLines($cfg, [Text.Encoding]::UTF8)) {
            if ($line -match '^\s*MODEL=(.*)$') { $script:Model = $Matches[1].Trim() }
            elseif ($line -match '^\s*DIR=(.*)$') { $d = $Matches[1].Trim(); if ($d) { $script:Dirs += $d } }
        }
    }
}

function Save-Cfg {
    $sb = New-Object Text.StringBuilder
    [void]$sb.AppendLine('# local office assistant - config (auto generated, editable)')
    [void]$sb.AppendLine('MODEL=' + $script:Model)
    foreach ($d in $script:Dirs) { [void]$sb.AppendLine('DIR=' + $d) }
    # manual tuned params (CTX/THREADS/KVQ) keep as-is
    if (Test-Path $cfg) {
        Get-Content $cfg | ForEach-Object {
            if ($_ -match '^(CTX|THREADS|KVQ)=') { [void]$sb.AppendLine($_) }
        }
    }
    # Write with system default (GBK on zh-CN Windows): the launcher .bat reads GBK,
    # UTF-8 Chinese paths would turn into mojibake there.
    [IO.File]::WriteAllText($cfg, $sb.ToString(), [Text.Encoding]::Default)
}

function Get-Models {
    $list = @()
    if (Test-Path $baseDir) {
        $list += @(Get-ChildItem -Path $baseDir -Filter *.gguf -Recurse -File -ErrorAction SilentlyContinue)
    }
    foreach ($d in $script:Dirs) {
        if (Test-Path $d) { $list += @(Get-ChildItem -Path $d -Filter *.gguf -Recurse -File -ErrorAction SilentlyContinue) }
    }
    return $list
}

function Show-Header {
    Clear-Host
    Write-Host ''
    Write-Host '  ==========================================' -ForegroundColor DarkGray
    Write-Host '      管理模型' -ForegroundColor White
    Write-Host '  ==========================================' -ForegroundColor DarkGray
    if ($script:Model -and (Test-Path $script:Model)) {
        Write-Host ('   当前：' + (Split-Path $script:Model -Leaf)) -ForegroundColor Green
    } else {
        Write-Host '   当前：自动（模型文件夹里的第一个）' -ForegroundColor Yellow
    }
    if ($script:Dirs.Count -gt 0) {
        Write-Host ('   额外文件夹：' + ($script:Dirs -join '；')) -ForegroundColor DarkGray
    }
    Write-Host '  ------------------------------------------'
    Write-Host '     1) 看有哪些模型'
    Write-Host '     2) 换一个模型'
    Write-Host '     3) 添加模型文件夹（模型放在别处也能用）'
    Write-Host '     4) 去掉一个模型文件夹'
    Write-Host '     5) 改回自动'
    Write-Host '     6) 下载 DeepSeek 模型（联网下一次，以后离线用）'
    Write-Host '     0) 退出'
    Write-Host ''
}

function Show-Models {
    $m = Get-Models
    Write-Host ''
    if ($m.Count -eq 0) {
        Write-Host '   还没有找到任何 .gguf 模型。' -ForegroundColor Yellow
        Write-Host '   把模型文件放进「模型」文件夹，或用第 3 项添加一个模型文件夹。'
        Write-Host ''
        return @()
    }
    Write-Host ("   找到 " + $m.Count + " 个模型：")
    Write-Host '   ------------------------------------------------------------'
    for ($i = 0; $i -lt $m.Count; $i++) {
        $mark = if ($m[$i].FullName -eq $script:Model) { '*' } else { ' ' }
        $size = [math]::Round($m[$i].Length / 1GB, 2)
        Write-Host ("   {0}{1,2}) {2}  ({3} GB)" -f $mark, ($i + 1), $m[$i].Name, $size)
        Write-Host ("        " + $m[$i].FullName) -ForegroundColor DarkGray
    }
    Write-Host '   ------------------------------------------------------------'
    Write-Host '   * 是当前使用的模型。' -ForegroundColor DarkGray
    Write-Host ''
    return $m
}

function Download-Model {
    Write-Host ''
    Write-Host '  可下载的 DeepSeek 官方开源模型（下载一次，以后完全离线用）：'
    Write-Host '  ------------------------------------------------------------'
    Write-Host '   1) DeepSeek-R1-Distill-Qwen-1.5B   约1.1GB   4GB 内存电脑可用'
    Write-Host '   2) DeepSeek-R1-0528-Qwen3-8B       约4.7GB   推荐，8GB 内存以上'
    Write-Host '   3) DeepSeek-R1-Distill-Qwen-14B    约8.4GB   16GB 内存以上'
    Write-Host '  ------------------------------------------------------------'
    Write-Host '  说明：DeepSeek 官方全量版（V3 / R1 / V3.2）是 671B 的巨型模型，'
    Write-Host '        普通电脑装不下；上面是官方蒸馏版，目前能离线跑的就是它们。'
    Write-Host ''
    $n = Read-Host '  输入编号（直接回车取消）'
    switch ($n) {
        '1' { $f = 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf'; $rp = '/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main' }
        '2' { $f = 'DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf';     $rp = '/unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF/resolve/main' }
        '3' { $f = 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf';  $rp = '/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main' }
        default { return }
    }
    $dest = Join-Path $baseDir $f
    if (Test-Path $dest) {
        Write-Host '  OK，模型文件夹里已经有它了，不用再下。' -ForegroundColor Green
        Read-Host '  按回车返回' | Out-Null
        return
    }
    if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir | Out-Null }
    $url = 'https://hf-mirror.com' + $rp + '/' + $f
    Write-Host ''
    Write-Host ('  开始下载：' + $f)
    Write-Host '  来源：hf-mirror.com（国内直连）。中途断线的话，重新运行本项会接着下。'
    Write-Host ''
    $ok = $false
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -L -C - --retry 3 -o $dest $url
        $ok = ($LASTEXITCODE -eq 0)
    } else {
        try { Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing; $ok = $true }
        catch { $ok = $false }
    }
    Write-Host ''
    if ($ok) {
        Write-Host ('  OK，下载完成：模型\' + $f) -ForegroundColor Green
        Write-Host '  下次启动后，页面顶部的模型下拉里就能选它。'
    } else {
        Write-Host '  × 下载中断了。网络恢复后重新运行本项，会从断点接着下。' -ForegroundColor Yellow
    }
    Read-Host '  按回车返回' | Out-Null
}

Load-Cfg

while ($true) {
    Show-Header
    $c = Read-Host '  输入数字后回车'

    switch ($c) {
        '1' { [void](Show-Models); Read-Host '  按回车返回' | Out-Null }
        '2' {
            $m = Show-Models
            if ($m.Count -eq 0) { Read-Host '  按回车返回' | Out-Null; continue }
            $n = Read-Host '  输入编号（直接回车取消）'
            if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $m.Count) {
                $script:Model = $m[[int]$n - 1].FullName
                Save-Cfg
                Write-Host ('  OK，已切换为：' + $m[[int]$n - 1].Name) -ForegroundColor Green
                Write-Host '  下次双击「启动-Windows.bat」就用它。'
            } else { Write-Host '  编号不对。' -ForegroundColor Yellow }
            Read-Host '  按回车返回' | Out-Null
        }
        '3' {
            $p = Read-Host '  把模型文件夹拖到这里，或输入路径（如 D:\models）'
            $p = $p.Trim('"').Trim()
            if ($p -and (Test-Path $p -PathType Container)) {
                $script:Dirs += $p
                Save-Cfg
                $cnt = @(Get-ChildItem -Path $p -Filter *.gguf -Recurse -File -ErrorAction SilentlyContinue).Count
                Write-Host ("  OK，已添加：$p（找到 $cnt 个模型）") -ForegroundColor Green
            } else {
                Write-Host '  × 这个路径不存在，或者不是文件夹。' -ForegroundColor Red
            }
            Read-Host '  按回车返回' | Out-Null
        }
        '4' {
            if ($script:Dirs.Count -eq 0) { Write-Host '  现在没有额外文件夹。' -ForegroundColor Yellow; Read-Host '  按回车返回' | Out-Null; continue }
            for ($i = 0; $i -lt $script:Dirs.Count; $i++) { Write-Host ("   " + ($i + 1) + ') ' + $script:Dirs[$i]) }
            $n = Read-Host '  输入编号（直接回车取消）'
            if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $script:Dirs.Count) {
                $new = @()
                for ($i = 0; $i -lt $script:Dirs.Count; $i++) { if ($i -ne ([int]$n - 1)) { $new += $script:Dirs[$i] } }
                $script:Dirs = $new
                Save-Cfg
                Write-Host '  OK，已去掉。' -ForegroundColor Green
            }
            Read-Host '  按回车返回' | Out-Null
        }
        '5' { $script:Model = ''; Save-Cfg; Write-Host '  OK，已改回自动。' -ForegroundColor Green; Read-Host '  按回车返回' | Out-Null }
        '6' { Download-Model }
        '0' { return }
        default { }
    }
}
