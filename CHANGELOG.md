# 更新日志（Changelog）

本项目的所有重要变更都记录在这里。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [1.6.0] - 2026-11-25

### 修复

- **统信 UOS / 银河麒麟启动报 `no backends are loaded`**
  根因：低版本 glibc 的系统上，启动脚本用 `glibc/` 里的加载器直接调用引擎，程序把后端库的查找目录算成了加载器所在的 `glibc/` 子目录，导致 CPU 后端加载失败。
  修法：先把加载器复制到引擎目录根部（`ld-linux-launcher.so`）再调用，x64 与 ARM64 同逻辑。已在 UOS 实测：模型加载、页面、对话接口全部正常。
- **启动判定误报「没启动起来」**
  旧脚本用 `curl` 探测 `/health` 判断引擎是否就绪；UOS 精简版常没有 curl，或系统设了 `http_proxy` 导致 127.0.0.1 的请求也走代理，明明启动成功也会被误判失败、白等 90 秒后退出。
  修法：改为 bash 内建 `/dev/tcp` 探端口 + 日志 `listening` 关键字判定，零外部依赖、不受代理影响；页面状态码检测同样零依赖，`curl` 仅作兜底并强制 `--noproxy '*'`。

### 兼容性

- **老浏览器「页面看得见、点不动」**
  页面脚本原用 ES2020 语法（可选链 17 处、正则后行断言 2 处），老版 Firefox 直接丢弃整段脚本导致按钮全部失灵。已降级改写为等价旧写法，语义完全一致，现在 **Firefox 60+ / Chromium 63+** 均可正常使用。
- **国产系统免安装运行库**：麒麟/UOS 缺的运行库已内置在包里，无需额外安装。
- **`UOS麒麟-一键启动.sh`**：自动修复 zip 解压丢失的文件执行权限，双击即可启动。

### 打包与分发

- 安装包改为**分平台三包**：Windows 版（Win10/11）、国产电脑版（统信 UOS / 银河麒麟 / Deepin，x86 与飞腾/鲲鹏 ARM 双引擎内置）、Mac 版（Intel + Apple 芯片），各包只含本平台引擎，下载量减半。
- 明确 **Windows 7 / XP 不支持**（AI 引擎依赖 Win8+ 系统 API，llama.cpp 官方最低支持 Win10）。

### 系统要求

| 平台 | 要求 |
|---|---|
| Windows | Windows 10 / 11 |
| 国产电脑 | 统信 UOS、银河麒麟 V10、深度 Deepin 等（x86_64 或 aarch64） |
| Mac | macOS（Intel 或 Apple 芯片） |
| 通用 | 4 核 CPU、8GB 内存起步，无显卡要求 |

## [1.5.0] - 2026-11

- 引擎升级、备用引擎自动降级机制
- 分卷下载支持

## [1.0.0] - 2026-11

- 首个公开版本：完全离线的本地 AI 办公助手
- 内置 [gongwen-ai](https://github.com/Xuxu9527-tommmm/gongwen-ai) 公文知识层（20 文种知识卡 + 11 类确定性核稿）
- 序列号激活（发号器算法主动公开）

[1.6.0]: https://github.com/Xuxu9527-tommmm/local-office-assistant/releases/tag/v1.6.0
[1.5.0]: https://github.com/Xuxu9527-tommmm/local-office-assistant/releases/tag/v1.5.0
[1.0.0]: https://github.com/Xuxu9527-tommmm/local-office-assistant/releases/tag/v1.0.0
