# Local Office Assistant (local-office-assistant)

**English** ｜ [中文](README.md)

> An AI office assistant that runs **entirely offline** on your own computer. Drafting official documents, weekly reports, spreadsheets — everything stays on this machine.
>
> Built for people in government agencies and state-owned enterprises who can't or shouldn't be online.

---

## What it is

- **Fully offline**: the LLM runs on your own CPU. No network calls, no cloud APIs.
- **No GPU needed**: a regular office laptop works — 4 CPU cores + 8GB RAM to start.
- **Zero setup**: double-click the launcher. No Python, no command line.
- **Gongwen built-in**: ships with 20 official-document genre cards and 11 deterministic proofreading rules from the [gongwen-ai](https://github.com/Xuxu9527-tommmm/gongwen-ai) project (*gongwen* = formal documents used by Chinese government agencies and institutions).
- **Chinese domestic OS support**: Kylin OS and UnionTech UOS run out of the box.

## Repository layout

```
local-office-assistant/
├── 启动-Windows.bat / 启动-Linux.sh / 启动-Mac.command   ← launcher (double-click)
├── app/                  chat UI (pure front-end)
├── 引擎/                 llama.cpp inference engine, 8 platform dirs
│   ├── win-x64 / win-x64-b          (-b = fallback engine, auto-degrades)
│   ├── win-arm64 / win-arm64-b
│   ├── linux-x64 / linux-arm64
│   └── macos-x64 / macos-arm64
├── 模型/                 ← put GGUF models here (NOT included, see below)
├── 发号器/               serial-number generator (see "Activation")
├── 授权/                 activation files
├── 授权检查.ps1 / .sh    license check before launch
├── 管理模型-*            model management helpers
├── 诊断-Windows.bat etc. self-diagnosis scripts
├── 使用说明.html         full illustrated manual (Chinese)
├── 使用说明视频.mp4      walkthrough video
├── 提示词模板.html       prompt templates
├── 说明图/               screenshots
└── build_*.py            build scripts
```

> Documentation and code comments are currently in Chinese — contributions improving English coverage are welcome.

---

## Platform support

| Platform | Status |
|---|---|
| Windows x64 (Win10+) | ✅ Verified |
| Windows ARM64 | ✅ Statically verified |
| Kylin OS V10 (银河麒麟) x64 / arm64 | ✅ Verified |
| UnionTech UOS 20 (统信 UOS) x64 / arm64 | ✅ Verified (arm64 via qemu) |
| macOS Intel / Apple Silicon | ✅ Statically verified |
| Deepin / openKylin | ⚠️ Should work, unverified |
| LoongArch / SW64 | ❌ No prebuilt engine |

**No discrete GPU required.** RAM requirements depend on the model, see below.

---

## Models: NOT included in this repository

Why: a single model is 1–5GB and each ships under its own license. The program accepts **any GGUF model** — nothing is hard-wired.

### Recommended

| Model | Size | RAM | Best for |
|---|---|---|---|
| **Qwen3-4B-Instruct-2507** (Q4_K_M) | ~2.4GB | 8GB | Everyday documents — the sweet spot, **start here** |
| DeepSeek-R1-Distill-Qwen-1.5B (Q4_K_M) | ~1.1GB | 4GB | Older machines, quick drafts |
| DeepSeek-R1-0528-Qwen3-8B (Q4_K_M) | ~4.7GB | 12GB+ | Quality over speed |

### Where to download

Grab the `Q4_K_M` GGUF from a HuggingFace mirror:

- Qwen3-4B: `hf-mirror.com/Qwen/Qwen3-4B-Instruct-2507-GGUF`
- DeepSeek 1.5B: `hf-mirror.com/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF`
- DeepSeek 8B: `hf-mirror.com/unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF`

(or `ollama pull qwen3:4b` and take the gguf file.)

### Where to put it

Drop the `.gguf` file into the **`模型/`** folder (create it if missing, the folder name must be exactly `模型`).

- Multiple models are fine — the program auto-picks the best one that fits your RAM
- To keep models elsewhere: edit `config.txt`, set `DIR=D:\models` (or any path)
- No launch parameters to memorize — every option in `config.txt` has Chinese comments; leaving them empty enables auto mode

Then double-click `启动-Windows.bat` (or run `启动-Linux.sh` / `启动-Mac.command`) and the UI opens in your browser.

---

## Activation (one code per machine)

On first launch, the launcher window shows an 8-digit **machine code** (e.g. `CG7E-PNL4`).

**The serial-number generator is included in this repository** (`发号器/序列号生成器.html`, opens in any browser):

1. Paste your machine code into the generator
2. Click generate → you get a serial (e.g. `BGS9-8YJA-3HF9-U6RP-WX`)
3. Paste it back into the launcher window. Done.

One machine code maps to one serial; re-generate after changing machines or reinstalling the OS. Delete the files in `授权/` to re-activate.

> **Note**: the generator's algorithm is identical to the in-app check, published here **intentionally by the author** — activation in this project is a usage record, not a technical barrier. Do not use this project for commercial license sales.

---

## Troubleshooting

| Symptom | Use |
|---|---|
| Launcher crashes | `诊断-Windows.bat`, then `查崩溃原因.bat` |
| Switch/remove models | `管理模型-Windows.bat` (or per-OS script) |
| Engine fails to start | Auto-degrades to the `-b` fallback engine |
| Anything else | `使用说明.html`, or open an Issue |

## Capability boundaries (please read)

- **Reliable**: genre detection, document skeleton, format violations, tone, layout — handled by deterministic rules, not the model
- **Weak spots**: structure drift in long documents; the model **will** invent numbers, names and dates — always verify; no policy citations; regional conventions incomplete
- **Explicitly not done**: classification levels, approval workflows, policy currency, fact-checking

**Security boundary**: offline means "content doesn't leak out", not "safe to install anywhere". Do **not** install on classified or air-gapped machines — installing unapproved software there is a violation in itself. On ordinary office machines, follow your organization's rules.

## Related project

- [gongwen-ai](https://github.com/Xuxu9527-tommmm/gongwen-ai) — the gongwen knowledge layer embedded in this assistant (genre cards, proofreading rules)

## License

Apache-2.0. Forks and modifications welcome.
