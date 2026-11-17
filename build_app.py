#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 app/index.src.html + 8 个 js 脚本压成单文件 app/index.html。

为什么这么做：实际交付中遇到过 app 目录里几个 .js 没被解压出来（或被杀软
清掉、被浏览器缓存成旧版），结果页面能打开，但“技能 0”、拖文件报
"Cannot read properties of undefined (reading 'extract')"。
全部内联后，只要 index.html 这一个文件在，功能就是完整的。
"""
import io, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, "app")
FILES = ["word.js", "pdf.js", "oldoffice.js", "formats.js",
         "store.js", "skills.js", "gongwen.js", "office.js"]

src = io.open(os.path.join(APP, "index.src.html"), encoding="utf-8").read()

def repl(m):
    name = m.group(1)
    body = io.open(os.path.join(APP, name), encoding="utf-8").read()
    body = body.replace("</script", "<\\/script")   # 理论上不会有，防一手
    return '<script>\n/* ================= %s ================= */\n%s\n</script>' % (name, body)

pat = re.compile(r'<script src="([\w.\-]+\.js)(?:\?v=\d+)?"></script>')
out, n = pat.subn(repl, src)
assert n == len(FILES), "应内联 %d 个脚本，实际 %d 个" % (len(FILES), n)

io.open(os.path.join(APP, "index.html"), "w", encoding="utf-8").write(out)
print("index.html 已生成：%d 字节，内联 %d 个脚本" % (len(out.encode()), n))
print("剩余外部脚本引用：", len(re.findall(r'<script src=', out)))
