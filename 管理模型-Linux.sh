#!/bin/bash
# 管理模型（麒麟 / 统信 / Ubuntu）
cd "$(dirname "$0")" || exit 1
CFG=config.txt

declare -a DIRS MODELS
MODEL=""

load_cfg() {
  DIRS=(); MODEL=""
  [ -f "$CFG" ] || return 0
  while IFS= read -r l || [ -n "$l" ]; do
    l="${l%$'\r'}"
    case "$l" in
      MODEL=*) MODEL="${l#MODEL=}" ;;
      DIR=*) d="${l#DIR=}"; [ -n "$d" ] && DIRS+=("$d") ;;
    esac
  done < "$CFG"
}

save_cfg() {
  {
    echo "# 本地办公助手 · 配置文件（「管理模型」脚本会自动改写这里，也可以手动编辑）"
    echo "MODEL=$MODEL"
    for d in "${DIRS[@]:-}"; do [ -n "$d" ] && echo "DIR=$d"; done
    # 手动调过的参数原样保留，别抹掉
    if [ -f "$CFG" ]; then
      while IFS= read -r l || [ -n "$l" ]; do
        case "$l" in
          CTX=*|THREADS=*|KVQ=*) echo "$l" ;;
        esac
      done < "$CFG"
    fi
  } > "$CFG"
}

scan_models() {
  MODELS=()
  while IFS= read -r f; do [ -n "$f" ] && MODELS+=("$f"); done \
    < <(find 模型 -maxdepth 3 -name "*.gguf" -type f 2>/dev/null | sort)
  for d in "${DIRS[@]:-}"; do
    [ -d "$d" ] || continue
    while IFS= read -r f; do [ -n "$f" ] && MODELS+=("$f"); done \
      < <(find "$d" -maxdepth 3 -name "*.gguf" -type f 2>/dev/null | sort)
  done
}

show_models() {
  scan_models
  echo
  if [ ${#MODELS[@]} -eq 0 ]; then
    echo "  还没有找到任何 .gguf 模型。"
    echo "  把模型文件放进「模型」文件夹，或用下面第 3 项添加一个模型文件夹。"
    echo
    return
  fi
  echo "  找到 ${#MODELS[@]} 个模型："
  echo "  ------------------------------------------------------------"
  local i=1
  for m in "${MODELS[@]}"; do
    local mark="  "
    [ "$m" = "$MODEL" ] && mark="✔ "
    printf "  %s%2d) %-46s %s\n" "$mark" "$i" "$(basename "$m")" "$(du -h "$m" 2>/dev/null | cut -f1)"
    echo "       $m"
    i=$((i+1))
  done
  echo "  ------------------------------------------------------------"
  echo "  ✔ 是当前使用的模型。没有 ✔ 表示「自动挑第一个」。"
  echo
}

DL_BASE="https://hf-mirror.com"

download_model() {
  echo
  echo "  可下载的 DeepSeek 官方开源模型（下载一次，以后完全离线用）："
  echo "  ------------------------------------------------------------"
  echo "   1) DeepSeek-R1-Distill-Qwen-1.5B   约1.1GB   4GB 内存电脑可用"
  echo "   2) DeepSeek-R1-0528-Qwen3-8B       约4.7GB   推荐，8GB 内存以上"
  echo "   3) DeepSeek-R1-Distill-Qwen-14B    约8.4GB   16GB 内存以上"
  echo "  ------------------------------------------------------------"
  echo "  说明：DeepSeek 官方全量版（V3 / R1 / V3.2）是 671B 的巨型模型，"
  echo "        普通电脑装不下；上面是官方蒸馏版，目前能离线跑的就是它们。"
  echo
  read -r -p "  输入编号（直接回车取消）：" n
  F=""
  case "$n" in
    1) F="DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf"; P="/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main" ;;
    2) F="DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf";     P="/unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF/resolve/main" ;;
    3) F="DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf";  P="/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main" ;;
    *) return ;;
  esac
  if [ -f "模型/$F" ]; then
    echo "  ✔ 模型文件夹里已经有它了，不用再下。"
    return
  fi
  echo
  echo "  开始下载：$F"
  echo "  来源：hf-mirror.com（国内直连）。中途断线的话，重新运行本项会接着下。"
  echo
  mkdir -p 模型
  if curl -L -C - --retry 3 -o "模型/$F" "$DL_BASE$P/$F"; then
    echo
    echo "  ✔ 下载完成：模型/$F"
    echo "    下次启动后，页面顶部的模型下拉里就能选它。"
  else
    echo
    echo "  × 下载中断了。网络恢复后重新运行本项，会从断点接着下。"
  fi
}

while true; do
  load_cfg
  echo
  echo "============================================"
  echo "   管理模型"
  echo "============================================"
  if [ -n "$MODEL" ] && [ -f "$MODEL" ]; then
    echo "  当前：$(basename "$MODEL")"
  else
    echo "  当前：自动（模型文件夹里的第一个）"
  fi
  [ ${#DIRS[@]} -gt 0 ] && echo "  额外文件夹：${DIRS[*]}"
  echo "--------------------------------------------"
  echo "  1) 看有哪些模型"
  echo "  2) 换一个模型"
  echo "  3) 添加模型文件夹（模型放在别处也能用）"
  echo "  4) 去掉一个模型文件夹"
  echo "  5) 改回自动"
  echo "  6) 下载 DeepSeek 模型（联网下一次，以后离线用）"
  echo "  0) 退出"
  echo
  read -r -p "输入数字后回车：" c

  case "$c" in
    1) show_models ;;
    2)
      show_models
      [ ${#MODELS[@]} -eq 0 ] && continue
      read -r -p "  输入编号（直接回车取消）：" n
      [[ "$n" =~ ^[0-9]+$ ]] || continue
      if [ "$n" -ge 1 ] && [ "$n" -le ${#MODELS[@]} ]; then
        MODEL="${MODELS[$((n-1))]}"
        save_cfg
        echo "  ✔ 已切换为：$(basename "$MODEL")"
        echo "    下次双击「启动-Linux.sh」就用它。"
      else
        echo "  编号不对。"
      fi
      ;;
    3)
      read -r -p "  输入模型文件夹路径（例如 /data/models）：" p
      p="${p%\"}"; p="${p#\"}"
      if [ -d "$p" ]; then
        DIRS+=("$p"); save_cfg; echo "  ✔ 已添加：$p"
      else
        echo "  × 这个路径不存在，或者不是文件夹。"
      fi
      ;;
    4)
      if [ ${#DIRS[@]} -eq 0 ]; then echo "  现在没有额外文件夹。"; continue; fi
      i=1; for d in "${DIRS[@]}"; do echo "   $i) $d"; i=$((i+1)); done
      read -r -p "  输入编号（直接回车取消）：" n
      [[ "$n" =~ ^[0-9]+$ ]] || continue
      if [ "$n" -ge 1 ] && [ "$n" -le ${#DIRS[@]} ]; then
        unset 'DIRS[$((n-1))]'
        DIRS=("${DIRS[@]}")
        save_cfg; echo "  ✔ 已去掉。"
      fi
      ;;
    5)
      MODEL=""; save_cfg; echo "  ✔ 已改回自动。"
      ;;
    6) download_model ;;
    0) exit 0 ;;
    *) echo "  输入 0 到 6。" ;;
  esac
done
