#!/bin/bash
# =============================================================
#  本地办公助手 · 序列号校验（Linux / macOS 共用）
#  由「启动-Linux.sh」「启动-Mac.command」自动调用。
#  序列号规则：BGS9-XXXX-XXXX-XXXX-XX
#  号是按本机机器码算出来的，换一台电脑用不了。
# =============================================================

export LC_ALL=C
ALPHA="23456789ABCDEFGHJKLMNPQRTUVWXY"
ROOT="$(cd "$(dirname "$0")" && pwd)"
LICDIR="$ROOT/授权"
LICFILE="$LICDIR/序列号.txt"
RECFILE="$LICDIR/授权记录.txt"
STATEFILE="$ROOT/app/授权状态.json"

GW_H() {
  local s="$1" h="$2" i c
  for ((i=0;i<${#s};i++)); do
    c=$(printf '%d' "'${s:i:1}")
    h=$(( (h * 33 + c) & 0xFFFFFFFF ))
  done
  echo "$h"
}

GW_ENC() {
  local n="$1" w="$2" i s=""
  for ((i=0;i<w;i++)); do
    s="${s}${ALPHA:$((n % 30)):1}"
    n=$((n / 30))
  done
  echo "$s"
}

gw_machine_code() {
  local f h1 h2 a
  f=$(printf '%s' "$1" | tr 'a-z' 'A-Z' | tr -cd 'A-Z0-9')
  h1=$(GW_H "BGS9|M|${f}|v1" 5381)
  h2=$(GW_H "BGS9|M|${f}|v2" 52711)
  a="$(GW_ENC "$h1" 4)$(GW_ENC "$h2" 4)"
  echo "${a:0:4}-${a:4:4}"
}

gw_serial_of() {
  local m st i t s c1 c2
  m=$(printf '%s' "$1" | tr -cd 'A-Z0-9')
  st=$(GW_H "BGS9|T|${m}|2026" 2166136261)
  s=""
  for ((i=0;i<12;i++)); do
    st=$(GW_H "${st}:${i}" "$st")
    s="${s}${ALPHA:$((st % 30)):1}"
  done
  c1=$(GW_H "BGS9|C|${s}|a" 7919)
  c2=$(GW_H "BGS9|C|${s}|b" 104729)
  echo "BGS9-${s:0:4}-${s:4:4}-${s:8:4}-${ALPHA:$((c1 % 30)):1}${ALPHA:$((c2 % 30)):1}"
}

gw_fingerprint() {
  local f=""
  [ -r /etc/machine-id ] && f="$(tr -d ' \r\n' < /etc/machine-id)"
  [ -z "$f" ] && [ -r /var/lib/dbus/machine-id ] && f="$(tr -d ' \r\n' < /var/lib/dbus/machine-id)"
  if [ -z "$f" ] && [ -r /sys/class/dmi/id/product_uuid ]; then
    f="$(tr -d ' \r\n' < /sys/class/dmi/id/product_uuid)"
  fi
  if [ -z "$f" ] && command -v ioreg >/dev/null 2>&1; then
    f=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}' | head -1)
  fi
  [ -z "$f" ] && f="NOID-$(hostname 2>/dev/null)"
  printf '%s|%s' "$f" "$(hostname 2>/dev/null)"
}

gw_norm() {
  printf '%s' "$1" | tr 'a-z' 'A-Z' | tr -d ' \t\r\n' | sed 's/　//g; s/—/-/g; s/－/-/g'
}

# 返回 0 通过；否则 echo 原因码
gw_check() {
  local code want
  code=$(gw_norm "$1")
  [ -z "$code" ] && { echo "empty"; return 1; }
  case "$code" in
    GW2A*) echo "old"; return 1 ;;
    BGS9*) ;;
    *) echo "prefix"; return 1 ;;
  esac
  if ! printf '%s' "$code" | grep -Eq '^BGS9-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$'; then
    echo "format"; return 1
  fi
  want=$(gw_serial_of "$2")
  if [ "$code" != "$want" ]; then echo "mismatch"; return 1; fi
  return 0
}

gw_save() {
  mkdir -p "$LICDIR" "$ROOT/app" 2>/dev/null
  printf '%s\n' "$1" > "$LICFILE"
  {
    printf '机器码：%s\n' "$2"
    printf '序列号：%s\n' "$1"
    printf '激活时间：%s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  } > "$RECFILE"
  printf '{"code":"%s","machine":"%s","at":"%s"}\n' "$1" "$2" "$(date '+%Y-%m-%d %H:%M')" > "$STATEFILE"
}

# ============================ 主流程 ============================
MC=$(gw_machine_code "$(gw_fingerprint)")
CODE=""
[ -f "$LICFILE" ] && CODE=$(head -n 1 "$LICFILE" | tr -d '\r')

if gw_check "$CODE" "$MC" >/dev/null 2>&1; then
  gw_save "$(gw_norm "$CODE")" "$MC"
  exit 0
fi

REASON=$(gw_check "$CODE" "$MC" 2>/dev/null)

echo
echo "  =========================================="
echo "   本机还没有可用的序列号"
echo "  =========================================="
echo
echo "   本机机器码：$MC"
echo
echo "   把上面这行机器码发给提供软件的人（微信 zx6530022），换一个序列号。"
echo "   序列号只在这台电脑上有效，换机器要重新申请。"
echo "   作者：汤姆汤汤汤  微信 zx6530022"
echo
case "$REASON" in
  mismatch) echo "   （「授权/序列号.txt」里的号不是这台电脑的，或者抄错了）" ;;
  old)      echo "   （这是另一套系统（GW2A 开头）的号，本工具用不了）" ;;
  format|prefix) echo "   （格式不对：应为 BGS9-XXXX-XXXX-XXXX-XX，共 4 段，最后一段 2 位）" ;;
esac

read -r -p "  粘贴序列号后按回车（直接回车退出）：" INPUT || INPUT=""
if [ -z "$INPUT" ]; then
  echo
  echo "   没有输入序列号，程序不启动。"
  exit 1
fi

R2=$(gw_check "$INPUT" "$MC" 2>/dev/null); RC=$?
if [ "$RC" -ne 0 ]; then
  echo
  case "$R2" in
    mismatch) echo "   这个序列号和本机机器码对不上。"
              echo "   可能是给另一台电脑的号，或者中间抄错了字符。" ;;
    old)      echo "   这是另一套系统的序列号（GW2A 开头），本工具不能用。" ;;
    *)        echo "   序列号格式不对，请对照 BGS9-XXXX-XXXX-XXXX-XX 再试。" ;;
  esac
  echo
  echo "   本机机器码（重新核对用）：$MC"
  exit 1
fi

gw_save "$(gw_norm "$INPUT")" "$MC"
echo
echo "   序列号已保存，下次启动不用再输入。"
echo
exit 0
