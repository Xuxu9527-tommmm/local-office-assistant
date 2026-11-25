#!/bin/bash
# 本地办公助手 · 启动器（Windows 用不到这个文件）
# 双击运行，或在终端执行：bash 启动-Linux.sh

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

# ---------- 读配置：当前模型 + 额外模型文件夹 ----------
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

# ---------- 找模型：配置 > 模型文件夹 > 额外文件夹 ----------
[ -n "$MODEL" ] && [ ! -f "$MODEL" ] && MODEL=""
MULTI=""
if [ -z "$MODEL" ]; then
  N=$(find 模型 -maxdepth 2 -name "*.gguf" -type f 2>/dev/null | wc -l)
  if [ "$N" -ge 2 ]; then
    # 模型文件夹里有多个模型 → 路由模式，可在页面上随对话切换
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
  echo "× 没有找到模型文件（.gguf）。"
  echo "  把模型放进「模型」文件夹，或双击「管理模型-Linux.sh」添加一个模型文件夹。"
  read -r -p "按回车退出…" _; exit 1
fi

# ---------- 按架构选引擎 ----------
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)  DIR=linux-x64 ;;
  aarch64|arm64) DIR=linux-arm64 ;;
  *) echo "× 不认识的 CPU 架构：$ARCH"; read -r -p "按回车退出…" _; exit 1 ;;
esac
ENGINE="引擎/$DIR/llama-server"
if [ ! -f "$ENGINE" ]; then
  echo "× 缺少引擎文件：$ENGINE"
  echo "  说明压缩包没解压完整，请整包重新解压（不要只挑几个文件拷出来）。"
  read -r -p "按回车退出…" _; exit 1
fi
chmod +x "$ENGINE" 2>/dev/null
[ -f "引擎/$DIR/glibc/ld-linux-x86-64.so.2" ] && chmod +x "引擎/$DIR/glibc/ld-linux-x86-64.so.2" 2>/dev/null
[ -f "引擎/$DIR/glibc/ld-linux-aarch64.so.1" ] && chmod +x "引擎/$DIR/glibc/ld-linux-aarch64.so.1" 2>/dev/null

# ---------- 用包里自带的运行库启动 ----------
# 麒麟 V10 / UOS 的 glibc 是 2.28，引擎要 2.34 以上，直接用会报
# "GLIBC_2.34 not found"。这里用包里自带的动态链接器启动，
# 不碰系统那一套，老系统也能跑。
GLIBC_DIR="$PWD/引擎/$DIR/glibc"
if [ "$DIR" = "linux-arm64" ]; then
  LDSO_SRC="$GLIBC_DIR/ld-linux-aarch64.so.1"
else
  LDSO_SRC="$GLIBC_DIR/ld-linux-x86-64.so.2"
fi
# 关键：加载器必须放在"引擎目录"里再调用。
# 直接调 glibc/ld-linux-*.so 时，程序按 /proc/self/exe 认为自己位于 glibc/ 子目录，
# 就去那里找 libggml-cpu-*.so，找不到 → "no backends are loaded" → 模型加载失败。
# 把加载器复制到引擎目录根部再调用，路径就算对了。
LDSO="$PWD/引擎/$DIR/ld-linux-launcher.so"
if [ -f "$LDSO_SRC" ]; then
  [ -f "$LDSO" ] || cp -f "$LDSO_SRC" "$LDSO" 2>/dev/null
  chmod +x "$LDSO" 2>/dev/null
fi
if [ -x "$LDSO" ]; then
  ENGINE_CMD=("$LDSO" --library-path "$GLIBC_DIR:$PWD/引擎/$DIR" "$PWD/$ENGINE")
elif [ -x "$LDSO_SRC" ]; then
  ENGINE_CMD=("$LDSO_SRC" --library-path "$GLIBC_DIR:$PWD/引擎/$DIR" "$PWD/$ENGINE")
else
  ENGINE_CMD=("$PWD/$ENGINE")
fi

# ---------- 端口被占用就换一个 ----------
port_busy() { (command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":$1 ") || (command -v netstat >/dev/null && netstat -ltn 2>/dev/null | grep -q ":$1 "); }
if port_busy $PORT; then
  if port_busy 8081; then PORT=8082; else PORT=8081; fi
fi

# ---------- 自动适配这台电脑（用户不用做任何设置） ----------
# 1) 看内存：小内存自动降上下文 + 压缩 KV 缓存，避免卡死
RAMKB=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 8388608)
# 容器/WSL 里 /proc/meminfo 显示的是宿主机内存（可能 100G+），必须再跟 cgroup 限额取小的，
# 否则 8G 的机器会被误判成大内存，选上 8B 模型直接卡死
CGLIM=""
if [ -r /sys/fs/cgroup/memory.max ]; then
  _v=$(cat /sys/fs/cgroup/memory.max 2>/dev/null)
  case "$_v" in ''|max|*[!0-9]*) ;; *) CGLIM=$(( _v / 1024 )) ;; esac
elif [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
  _v=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)
  case "$_v" in ''|*[!0-9]*) ;; *) [ "$_v" -lt 4611686018427387904 ] && CGLIM=$(( _v / 1024 )) ;; esac
fi
if [ -n "$CGLIM" ] && [ "$CGLIM" -gt 524288 ] && [ "$CGLIM" -lt "$RAMKB" ]; then RAMKB=$CGLIM; fi
RAMGB=$(( (${RAMKB:-8388608} + 524288) / 1048576 ))
[ "$RAMGB" -lt 1 ] && RAMGB=8
CTX=6144
[ "$RAMGB" -ge 16 ] && CTX=16384
[ "$RAMGB" -ge 12 ] && [ "$RAMGB" -lt 16 ] && CTX=8192
[ "$RAMGB" -ge 8 ] && [ "$RAMGB" -lt 10 ] && CTX=3072
[ "$RAMGB" -ge 10 ] && [ "$RAMGB" -lt 12 ] && CTX=4096
[ "$RAMGB" -lt 8 ] && CTX=3072
[ -n "$CTX_CFG" ] && CTX="$CTX_CFG"

KVOPT=""
# 缓存也吃内存：12G 以下用 q4_0（再省一半，几乎看不出质量差别），12~16G 用 q8_0
[ "$RAMGB" -lt 12 ] && KVOPT="-fa on -ctk q4_0 -ctv q4_0"
[ "$RAMGB" -ge 12 ] && [ "$RAMGB" -lt 16 ] && KVOPT="-fa on -ctk q8_0 -ctv q8_0"
[ "$KVQ" = "1" ] && KVOPT="-fa on -ctk q8_0 -ctv q8_0"
[ "$KVQ" = "0" ] && KVOPT=""

# 2) 挑模型：按内存选「装得下且最好」的，写进 app/tuning.json，页面自动选中
PICK=""
if [ -n "$MULTI" ]; then
  PICK=$(find 模型 -name "*.gguf" -type f 2>/dev/null | xargs -I{} du -m "{}" 2>/dev/null | awk -v lim=$((RAMGB*409)) '$1<=lim' | sort -rn | head -1 | cut -f2-)
  [ -n "$PICK" ] && PICK=$(basename "$PICK")
fi
printf '{"ramGB":%d,"ctx":%d,"model":"%s"}\n' "$RAMGB" "$CTX" "$PICK" > app/tuning.json

# ---------- 线程数：不占满，留一点给别的程序 ----------
# 用物理核：超线程的逻辑核会让生成速度暴跌（实测差 20 倍以上）
CORES=$(nproc 2>/dev/null || echo 4)
PHYS=$(awk -F: '/^physical id/{p=$2} /^core id/{print p"-"$2}' /proc/cpuinfo 2>/dev/null | sort -u | wc -l)
[ "${PHYS:-0}" -ge 2 ] && CORES=$PHYS
THREADS=$(( CORES - 1 ))
[ "$THREADS" -lt 2 ] && THREADS=2
[ "$THREADS" -gt 12 ] && THREADS=12
[ -n "$THREADS_CFG" ] && THREADS="$THREADS_CFG"

if [ -n "$MULTI" ]; then
  echo "============================================"
  echo "  本地办公助手"
  echo "============================================"
  echo "  本机内存：${RAMGB}G，参数已自动调好（不用设置）"
  echo "  模型：多模型模式（模型文件夹里有 $N 个）"
  echo "        打开页面后，在顶部下拉里随时切换。"
  echo "  地址：http://127.0.0.1:$PORT"
  echo
  echo "  正在启动，第一次要等 20～60 秒…"
  echo "  这个窗口不要关；关掉就等于退出程序。"
  echo
  "${ENGINE_CMD[@]}" --models-dir 模型 --models-max 1 -c $CTX -t "$THREADS" --cache-reuse 256 --parallel 1 $KVOPT --host 127.0.0.1 --port $PORT --path app --jinja > /tmp/本地助手引擎.log 2>&1 &
else
echo "============================================"
echo "  本地办公助手"
echo "============================================"
echo "  本机内存：${RAMGB}G，参数已自动调好（不用设置）"
echo "  模型：$(basename "$MODEL")"
echo "  （要换模型：双击 管理模型-Linux.sh，"
echo "   或把第二个模型放进「模型」文件夹，页面里就能切换）"
echo "  线程：$THREADS"
echo "  地址：http://127.0.0.1:$PORT"
echo
echo "  正在加载模型，第一次要等 20～60 秒…"
echo "  这个窗口不要关；关掉就等于退出程序。"
echo

"${ENGINE_CMD[@]}" -m "$MODEL" -c $CTX -t "$THREADS" --cache-reuse 256 --parallel 1 $KVOPT --host 127.0.0.1 --port $PORT --path app --jinja > /tmp/本地助手引擎.log 2>&1 &
fi
PID=$!

# 判断"起来了没有"，不依赖 curl：
# UOS / 麒麟的精简系统经常没装 curl；就算装了，系统若设了 http_proxy，
# curl 会把 127.0.0.1 的请求也发给代理，明明起来了也判成失败。
# 这里用 bash 自带的 /dev/tcp 探端口 + 看日志里的 listening 关键字，零依赖。
LOG=/tmp/本地助手引擎.log
port_open() { (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; }

ok=0
for i in $(seq 1 150); do
  if ! kill -0 $PID 2>/dev/null; then break; fi
  if grep -q "listening on" "$LOG" 2>/dev/null || port_open "$PORT"; then ok=1; break; fi
  sleep 1
done

if [ "$ok" != "1" ]; then
  echo
  echo "× 没启动起来。下面这段报错能说明原因："
  echo "--------------------------------------------------"
  tail -n 20 "$LOG" 2>/dev/null
  echo "--------------------------------------------------"
  if grep -q "listening on" "$LOG" 2>/dev/null; then
    echo "注意：上面日志里已经有 listening on，说明引擎其实是好的，"
    echo "      只是启动器没探到。直接用浏览器打开 http://127.0.0.1:$PORT/ 试试。"
    read -r -p "按回车退出…" _
    exit 0
  fi
  echo "常见原因："
  echo "  1) 内存不够（低于 8G 别开 DeepSeek 8B，换通义千问 4B 或 DeepSeek 1.5B）"
  echo "  2) 模型文件没下完整（重新拷一遍）"
  echo "  3) 缺少系统库（把上面报错发我，微信 zx6530022）"
  read -r -p "按回车退出…" _
  kill $PID 2>/dev/null
  exit 1
fi

# ---------- 引擎起来了，再确认页面能不能打开 ----------
# app 文件夹缺失或不完整会 404。取状态码同样不走 curl。
http_status() {
  ( exec 3<>/dev/tcp/127.0.0.1/"$1" 2>/dev/null || exit 1
    printf 'GET %s HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' "$2" >&3 2>/dev/null
    IFS= read -r -t 5 _line <&3
    printf '%s' "$_line" ) 2>/dev/null
}
SLINE=$(http_status "$PORT" "/")
PCODE=""
if [ -n "$SLINE" ]; then
  read -r _proto PCODE _rest <<< "$SLINE"
fi
if [ -z "$PCODE" ] && command -v curl >/dev/null 2>&1; then
  PCODE=$(curl -s -o /dev/null --noproxy '*' -w "%{http_code}" --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null)
fi

if [ "$PCODE" = "404" ] || [ "$PCODE" = "403" ]; then
  echo
  echo "× 引擎已经起来了，但页面打不开（HTTP $PCODE）。"
  echo "  基本是 app 文件夹缺失或不完整。检查："
  echo "    1) 软件根目录下要有 app 文件夹，里面有 index.html；"
  echo "    2) 别把 启动 脚本单独拷到别处运行，要和 app、模型 放在一层。"
  echo "  放好后关掉窗口重新双击启动。"
  echo
fi

( xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1 || sensible-browser "http://127.0.0.1:$PORT/" >/dev/null 2>&1 || gio open "http://127.0.0.1:$PORT/" >/dev/null 2>&1 ) &

echo "  已就绪，浏览器应该自动打开了。"
echo "  没打开就手动访问：http://127.0.0.1:$PORT/"
echo "  用完关掉这个窗口即可。"
echo
wait $PID
