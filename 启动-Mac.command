#!/bin/bash
# 本地办公助手 · 启动器（macOS）
# 第一次用：右键 → 打开；或终端执行 bash 启动-Mac.command

cd "$(dirname "$0")" || exit 1

# ---------- 作者信息 ----------
echo "=================================================="
echo "  本地办公助手   作者：汤姆汤汤汤"
echo "  微信：zx6530022  （要序列号、换机器、提需求都找这个）"
echo "  © 2026 汤姆汤汤汤　保留所有权利"
echo "=================================================="
echo

PORT=8080
CTX_CFG=""
THREADS_CFG=""
KVQ=""

# ---------- 序列号校验（没有本机有效序列号就不启动） ----------
bash "$(dirname "$0")/授权检查.sh" || { echo; read -r -p "按回车退出…" _; exit 1; }
echo
CFG=config.txt
MODEL=""
DIRS=()
if [ -f "$CFG" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      MODEL=*) MODEL="${line#MODEL=}" ;;
      DIR=*)   d="${line#DIR=}"; [ -n "$d" ] && DIRS+=("$d") ;;
      CTX=*)   c="${line#CTX=}"; case "$c" in ''|*[!0-9]*) ;; *) CTX_CFG="$c" ;; esac ;;
      THREADS=*) t="${line#THREADS=}"; case "$t" in ''|*[!0-9]*) ;; *) THREADS_CFG="$t" ;; esac ;;
      KVQ=*)     KVQ="${line#KVQ=}" ;;
    esac
  done < "$CFG"
fi
# ---------- 模型分片：第一次启动自动拼回完整文件 ----------
# 下载下来是 3 个压缩包，解压后模型是 xxx.gguf.part1/2/3，
# 这里拼成完整 gguf 并删掉分片，只做一次。
PARTS=(模型/*.gguf.part*)
[ -e "${PARTS[0]}" ] || PARTS=()
if [ ${#PARTS[@]} -gt 0 ]; then
  if [ ${#PARTS[@]} -lt 3 ]; then
    echo "× 模型分片不全：只找到 ${#PARTS[@]} 个，应该 3 个。"
    echo "  说明还有压缩包没解压。请把另外几个压缩包也解压到"
    echo "  这个文件夹，再启动。"
    read -r -p "按回车退出…" _; exit 1
  fi
  echo "  第一次启动，正在把模型分片拼成完整文件……"
  echo "  大概 1 分钟，只做这一次。"
  for _p in 模型/*.gguf.part1; do
    _base="${_p%.part1}"
    if ! cat "$_p" "${_base}.part2" "${_base}.part3" > "${_base}"; then
      rm -f "${_base}"
      echo "× 拼装没成功，多半是硬盘空间不够：分片占 2.4G，合并还要 2.4G。"
      read -r -p "按回车退出…" _; exit 1
    fi
    rm -f "${_base}".part1 "${_base}".part2 "${_base}".part3
  done
  echo "  拼好了。"
  echo
fi

[ -n "$MODEL" ] && [ ! -f "$MODEL" ] && MODEL=""
MULTI=""
if [ -z "$MODEL" ]; then
  N=$(find 模型 -maxdepth 2 -name "*.gguf" -type f 2>/dev/null | wc -l)
  if [ "$N" -ge 2 ]; then
    MULTI=1
  else
    MODEL=$(find 模型 -name "*.gguf" -type f 2>/dev/null | sort | head -1)
  fi
fi
if [ -z "$MODEL" ] && [ -z "$MULTI" ]; then
  for d in "${DIRS[@]:-}"; do
    [ -d "$d" ] || continue
    MODEL=$(find "$d" -maxdepth 3 -name "*.gguf" -type f 2>/dev/null | sort | head -1)
    [ -n "$MODEL" ] && break
  done
fi
if [ -z "$MODEL" ] && [ -z "$MULTI" ]; then
  echo "× 没有找到模型文件（.gguf）。放进「模型」文件夹，或运行 管理模型-Mac.command 添加。"
  read -r -p "按回车退出…" _; exit 1
fi

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then DIR=macos-arm64; else DIR=macos-x64; fi
ENGINE="引擎/$DIR/llama-server"
if [ ! -f "$ENGINE" ]; then
  echo "× 缺少引擎文件：$ENGINE（压缩包没解压完整？）"
  read -r -p "按回车退出…" _; exit 1
fi
chmod +x "$ENGINE" 2>/dev/null

# macOS 会拦未签名程序，本地跑先去掉隔离标记
xattr -d com.apple.quarantine "$ENGINE" 2>/dev/null

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
if port_busy $PORT; then
  if port_busy 8081; then PORT=8082; else PORT=8081; fi
fi

# ---------- 自动适配这台电脑（用户不用做任何设置） ----------
# 1) 看内存：小内存自动降上下文 + 压缩 KV 缓存，避免卡死
RAMGB=$(( ($(sysctl -n hw.memsize 2>/dev/null || echo 8589934592) + 536870912) / 1073741824 ))
[ -z "$RAMGB" ] || [ "$RAMGB" -lt 1 ] && RAMGB=8
CTX=6144
[ "$RAMGB" -ge 16 ] && CTX=16384
[ "$RAMGB" -ge 12 ] && [ "$RAMGB" -lt 16 ] && CTX=8192
[ "$RAMGB" -ge 8 ] && [ "$RAMGB" -lt 10 ] && CTX=3072
[ "$RAMGB" -ge 10 ] && [ "$RAMGB" -lt 12 ] && CTX=4096
[ "$RAMGB" -lt 8 ] && CTX=3072
[ -n "$CTX_CFG" ] && CTX="$CTX_CFG"

KVOPT=""
[ "$RAMGB" -lt 12 ] && KVOPT="-fa on -ctk q4_0 -ctv q4_0"
[ "$RAMGB" -ge 12 ] && [ "$RAMGB" -lt 16 ] && KVOPT="-fa on -ctk q8_0 -ctv q8_0"
[ "$KVQ" = "1" ] && KVOPT="-fa on -ctk q8_0 -ctv q8_0"
[ "$KVQ" = "0" ] && KVOPT=""

CORES=$(sysctl -n hw.physicalcpu 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)   # 物理核，逻辑核会让生成变慢
THREADS=$(( CORES - 1 ))
[ "$THREADS" -lt 2 ] && THREADS=2
[ "$THREADS" -gt 12 ] && THREADS=12
[ -n "$THREADS_CFG" ] && THREADS="$THREADS_CFG"

# 2) 挑模型：按内存选「装得下且最好」的，写进 app/tuning.json，页面自动选中
PICK=""
if [ -n "$MULTI" ]; then
  PICK=$(find 模型 -name "*.gguf" -type f -size -$(( RAMGB * 409 ))M 2>/dev/null \
    | xargs -I{} du -m "{}" 2>/dev/null | sort -rn | head -1 | cut -f2-)
  [ -n "$PICK" ] && PICK=$(basename "$PICK")
fi
printf '{"ramGB":%d,"ctx":%d,"model":"%s"}\n' "$RAMGB" "$CTX" "$PICK" > app/tuning.json

if [ -n "$MULTI" ]; then
echo "============================================"
echo "  本地办公助手"
echo "============================================"
echo "  本机内存：${RAMGB}G，参数已自动调好（不用设置）"
echo "  模型：多模型模式（模型文件夹里有 $N 个）"
echo "        打开页面后，在顶部下拉里随时切换。"
echo "  地址：http://127.0.0.1:$PORT"
echo
echo "  正在启动，第一次要等 20～60 秒…这个窗口不要关。"
echo
"$ENGINE" --models-dir 模型 --models-max 1 -c $CTX -t "$THREADS" --cache-reuse 256 --parallel 1 $KVOPT --host 127.0.0.1 --port $PORT --path app --jinja > /tmp/本地助手引擎.log 2>&1 &
else
echo "============================================"
echo "  本地办公助手"
echo "============================================"
echo "  本机内存：${RAMGB}G，参数已自动调好（不用设置）"
echo "  模型：$(basename "$MODEL")"
echo "  （要换模型：运行 管理模型-Mac.command，"
echo "   或把第二个模型放进「模型」文件夹，页面里就能切换）"
echo "  地址：http://127.0.0.1:$PORT"
echo
echo "  正在加载，第一次要等 20～60 秒…这个窗口不要关。"
echo
"$ENGINE" -m "$MODEL" -c $CTX -t "$THREADS" --cache-reuse 256 --parallel 1 $KVOPT --host 127.0.0.1 --port $PORT --path app --jinja > /tmp/本地助手引擎.log 2>&1 &
fi
PID=$!

ok=0
for i in $(seq 1 90); do
  if curl -sf --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then ok=1; break; fi
  if ! kill -0 $PID 2>/dev/null; then break; fi
  sleep 1
done

if [ "$ok" != "1" ]; then
  echo "× 没启动起来，报错如下："
  tail -n 15 /tmp/本地助手引擎.log 2>/dev/null
  read -r -p "按回车退出…" _
  kill $PID 2>/dev/null
  exit 1
fi

PCODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null)
if [ "$PCODE" != "200" ]; then
  echo
  echo "× 引擎已经起来了，但页面打不开（HTTP $PCODE）。"
  echo "  基本是 app 文件夹缺失或不完整。检查："
  echo "    1) 软件根目录下要有 app 文件夹，里面有 index.html；"
  echo "    2) 别把 启动 脚本单独拷到别处运行，要和 app、模型 放在一层。"
  echo "  放好后重新双击启动。"
  echo
else
  open "http://127.0.0.1:$PORT/" >/dev/null 2>&1 &
fi
echo "  已就绪。用完关掉这个窗口即可。"
wait $PID
