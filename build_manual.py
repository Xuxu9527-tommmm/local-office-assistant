#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 使用说明.html（包内相对路径版）与 在线自包含版"""
import base64, os, sys

ROOT = "/workspace/本地AI助手"
IMG = os.path.join(ROOT, "说明图")

CSS = """
:root{--ink:#17324D;--ink2:#3A5269;--gray:#787E88;--line:#DBD6CC;--paper:#F7F5F0;--red:#AA3E30;--amber:#A87C26;--ok:#3F7A5A}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:15.5px;line-height:1.85}
.wrap{max-width:760px;margin:0 auto;padding:44px 24px 80px}
h1{font-size:26px;letter-spacing:.5px;margin-bottom:6px}
.lead{color:var(--gray);font-size:14px;margin-bottom:30px}
h2{font-size:18px;margin:38px 0 12px;padding-left:11px;border-left:4px solid var(--ink)}
h3{font-size:15.5px;margin:22px 0 8px;color:var(--ink2)}
p{margin:9px 0}
ul,ol{margin:9px 0 9px 22px}
li{margin:4px 0}
table{border-collapse:collapse;width:100%;margin:12px 0 16px;font-size:14px;background:#fff}
th,td{border:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top}
th{background:#F1EDE4;font-weight:700}
.box{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:14px 0}
.box.warn{border-left:4px solid var(--amber)}
.box.stop{border-left:4px solid var(--red)}
.box.ok{border-left:4px solid var(--ok)}
.box b{color:var(--ink)}
.tag{display:inline-block;font-size:12px;padding:1px 8px;border:1px solid var(--line);border-radius:20px;color:var(--gray);margin-left:8px;vertical-align:2px}
.k{font-size:13px;color:var(--gray);letter-spacing:.5px}
figure{margin:16px 0}
figure img{width:100%;border:1px solid var(--line);border-radius:10px;display:block}
figcaption{font-size:12.5px;color:var(--gray);margin-top:6px;text-align:center}
code{background:#F0EDE4;border-radius:4px;padding:1px 6px;font-size:14px}
.x{color:var(--red);font-weight:600}
.ck{color:var(--ok);font-weight:600}
.foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);font-size:12.5px;color:var(--gray)}
"""

def fig(name, cap, inline):
    if inline:
        with open(os.path.join(IMG, name), "rb") as f:
            b = base64.b64encode(f.read()).decode()
        src = "data:image/png;base64," + b
    else:
        src = "说明图/" + name
    return f'<figure><img src="{src}" alt="{cap}"><figcaption>{cap}</figcaption></figure>'

def build(inline):
    F = lambda n, c: fig(n, c, inline)
    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>使用说明 · 本地办公助手 v1.5.0</title>
<style>{CSS}</style></head><body><div class="wrap">

<h1>本地办公助手 <span class="tag">v1.5.0 千问版</span></h1>
<div class="lead">不联网，材料不出这台电脑 · 不用设置，装好就是这个样子</div>

<h2>一、解压就能用</h2>
<p>下载给的是 <b>3 个压缩包</b>：第 1 个是程序，第 2、3 个是模型（模型 2.4G，单个传不了，必须切开）。三个都要下。</p>
<ol>
<li>硬盘上先建一个文件夹，比如 <code>D:\\办公助手</code>。别放桌面，也别放 C 盘根目录。</li>
<li>右键第 1 个包 →「全部解压」，目标填 <code>D:\\办公助手</code>。</li>
<li>第 2、3 个照做，<b>目标还是这个文件夹</b>。提示「目标文件夹已存在，是否合并」点<b>是</b>，提示文件覆盖点「全部」。</li>
<li>三个都解压完，<code>D:\\办公助手\\本地办公助手_v1.5.0</code> 里就是完整程序。</li>
<li>双击对应系统的启动文件（见下表）。</li>
</ol>
<table>
<tr><th>系统</th><th>双击这个</th><th>第一次的提示</th></tr>
<tr><td>Windows 10 / 11</td><td><code>启动-Windows.bat</code></td><td>可能弹「Windows 已保护你的电脑」→ 点「更多信息」→「仍要运行」</td></tr>
<tr><td>macOS（Intel / M 芯）</td><td><code>启动-Mac.command</code></td><td>右键 →「打开」→ 再点一次「打开」</td></tr>
<tr><td>银河麒麟 / 统信 UOS</td><td><code>启动-Linux.sh</code></td><td>右键 →「属性」→ 勾上「允许作为程序执行」，再双击；或终端里 <code>bash 启动-Linux.sh</code></td></tr>
</table>
<div class="box ok"><b>第一次启动会多等 1～2 分钟</b>：它要把 3 个模型分片拼回一个完整文件，只做这一次，以后就快了。黑窗口里会写「正在把模型分片拼成完整文件」，不是卡住。</div>
<div class="box">第一次还要序列号：黑窗口里显示 8 位机器码（形如 <code>AB12-CD34</code>），发给提供软件的人，换一串 <code>BGS9-…</code> 粘回去回车，以后不再问。</div>
<div class="box warn"><b>黑窗口不要关</b>，关了就等于退出程序。用完直接关窗口。看到「地址：http://127.0.0.1:8080」，浏览器会自己打开；没打开就手动敲这个地址。</div>
<div class="box">忘了怎么操作，点页面右上角<b>「帮助」</b>，就是这一页。</div>

<h2>二、界面就三块</h2>
{F("01_打开就是这样.png", "打开就是这样：左边任务、中间对话、底部输入框和技能栏")}
<table>
<tr><th>位置</th><th>是什么</th></tr>
<tr><td>左边</td><td>任务列表。一个任务＝一段独立对话，两件事不串。点「＋ 新建任务」开新的</td></tr>
<tr><td>中间</td><td>对话。等回答时会读秒，秒数一直走说明它在干活、没卡死</td></tr>
<tr><td>底部</td><td>输入框。上面一条是「技能」，点开能换；右下角回形针是附件，可以一次选多个文件</td></tr>
</table>
<p>左下角显示「模型：通义千问 4B」，<b>没有下拉框</b>——故意的，第八节说为什么。</p>

<h2>三、公文：这一版的重点</h2>
<p>以前写公文，你得先知道该用通知还是请示，还得记得格式。现在不用。</p>

<h3>3.1 一句话就能出稿</h3>
<p>点技能，选「<b>公文专家</b>」，然后像跟同事说话一样说事：</p>
<div class="box">「下周三上午九点在三楼会议室开安全生产会，通知各科室带自查表」</div>
<p>它会自己判：这是通知。然后按通知的结构写——标题、主送机关、一、二、三、特此通知、落款，该有的都有，不该有的不瞎加。</p>
<p>判完在结尾告诉你按什么文种写的。判错了直接说「这不是通知，是对外发的函」，它重写。</p>

<h3>3.2 二十个文种都认识</h3>
<table>
<tr><th>法定十五种</th><td>通知、请示、报告、批复、函、通报、意见、决定、决议、公报、公告、通告、命令（令）、议案、纪要</td></tr>
<tr><th>常用五种</th><td>讲话稿、工作总结、工作方案、调研报告、信息简报</td></tr>
</table>
<p>写哪个文种，它只拿那一个文种的规矩（一张 300~500 字的卡），不会把二十个文种的要求混在一起。</p>

<h3>3.3 写完点「公文核稿」——不烧 token、不联网</h3>
<p>回复下面有个「公文核稿」按钮，点一下<b>几毫秒</b>出结果。查的是有标准答案的那类问题：</p>
<table>
<tr><th>查什么</th><th>例子</th></tr>
<tr><td>文种写错</td><td>标题写成「关于××的<b>请示报告</b>」——没这个文种</td></tr>
<tr><td>文种混用</td><td>请示里夹「现将有关情况<b>报告如下</b>」；报告结尾写「<b>妥否，请批示</b>」</td></tr>
<tr><td>主送机关</td><td>请示送了三个部门——请示只能送一个上级机关</td></tr>
<tr><td>结语不对</td><td>请示结尾写「<b>特此通知</b>」；通知结尾写「<b>此复</b>」</td></tr>
<tr><td>序号跳级</td><td>有「（一）」却没「一、」；「1.」和「1、」混着用</td></tr>
<tr><td>成文日期</td><td>写成「<b>二〇二六年三月一日</b>」；写成「2026年<b>03</b>月<b>05</b>日」；年份比今年早（套往年模板没改）</td></tr>
<tr><td>发文字号</td><td>用方括号「<b>[2026]</b>1号」，国标要六角括号「〔2026〕1号」</td></tr>
<tr><td>标点语气</td><td>中文里夹半角逗号；正文出现感叹号；函里出现「务必」「遵照执行」</td></tr>
<tr><td>空话密度</td><td>「高度重视」×3、「狠抓落实」×3 这种，会点出来</td></tr>
<tr><td>待补信息</td><td>稿子里还剩 2 处以上「××」，提醒你交稿前补齐</td></tr>
</table>
<p>每条都写成「问题 → 原文 → 怎么改」。改完再点一次可以复核；再点一次同一处会收起面板。</p>

<h3>3.4 点「导出公文」，出的是国标版式 Word</h3>
<ul>
<li>A4，天头 37mm、订口 28mm，版心 156×225mm</li>
<li>标题二号小标宋居中，正文三号仿宋，行距 28 磅固定</li>
<li>「一、」「（一）」「1.」自动分三级，Word 里能直接生成目录</li>
<li>落款和日期右空四字</li>
<li>页码四号宋体，单页居右、双页居左，格式「— 1 —」</li>
</ul>
<div class="box stop"><b>不生成红头。</b>红头、文号、印章涉及发文权限，机器不能替你决定。导出的是普通文稿版式，套你们单位的红头纸打印就行。</div>

<h2>四、表格：能干什么，多快，到哪儿为止</h2>
<h3>4.1 怎么让它做表</h3>
<p>不用选技能，直接把要求和材料一起发：</p>
<div class="box">「把这几个文件的数据合成一张表，加一列来源文件，导出成 Excel」</div>
<p>多个附件会当成<b>一份材料</b>处理，不是分开做。文件名它看得到，「来源文件」列会自动带上。</p>
{F("04_表格和存文件.png", "表格结果可以直接导出 Excel 或 CSV，表头加粗、首行冻结")}

<h3>4.2 实测速度（普通 8G 电脑，通义千问 4B，2026-11 重新逐项实测）</h3>
<table>
<tr><th>事项</th><th>耗时</th><th>说明</th></tr>
<tr><td>读文件（txt / Word / PDF文字版 / Excel / PPT）</td><td class="ck">0.3 秒内</td><td>5000 行 Excel（约 16 万字）也是 0.3 秒</td></tr>
<tr><td>写公文·通知（约 500 字）</td><td>30～60 秒</td><td>首字 3 秒左右，生成约 13 字/秒——<b>又快又好</b>的区间</td></tr>
<tr><td>1 千字转表</td><td>20～50 秒</td><td>11 行</td></tr>
<tr><td>5 千字抽要点</td><td>1～2 分钟</td><td>正常</td></tr>
<tr><td>1 万字抽要点</td><td>4～5 分钟</td><td>自动分 5 批逐批处理，不会漏</td></tr>
<tr><td>2.4 万字转表</td><td>9～10 分钟</td><td>139 行，12 段没漏</td></tr>
<tr><td>规整材料（本身就是分条列的台账）</td><td class="ck">1 秒</td><td>极速通道，不跑模型</td></tr>
<tr><td>20MB（约 300 万字）</td><td>6～7 分钟</td><td>抽读 10 段，142 行</td></tr>
<tr><td>导出 Word / Excel / PPT</td><td class="ck">1 秒内</td><td>本机直接生成文件，不走模型</td></tr>
</table>
<p>什么情况<b>又快又准</b>：材料本身条理清楚（分条列、有固定格式），一次给一件事，要的格式说死（列名、文种、字数）。什么情况会<b>很慢</b>：几万字挤一次发、要求一行不漏、让它在长对话里来回改（对话越长每句越慢）。</p>
<p>2 万字以上的大材料走「智能抽读」：从头、中、尾均匀读 10 段，覆盖全文结构，<b>但不是逐行全量</b>，结果里会写明「这是抽读」。</p>

<h3>4.3 最能做到的</h3>
<ul>
<li>规整材料直接成表（台账、名单、通知里的安排）</li>
<li>多个文件合成一张，自动标「来源文件」列</li>
<li>几万字材料抽要点，按类分组</li>
<li>会议记录转任务表（事项／责任人／时限／验收标准）</li>
<li>表格转 Excel、CSV，表头加粗、首行冻结</li>
<li>中途断了说「<b>接着处理</b>」，从断的那批继续，不重来</li>
</ul>

<h3>4.4 做不到的，说在前面</h3>
<table>
<tr><th>情况</th><th>结果</th><th>怎么办</th></tr>
<tr><td>扫描件、照片、盖章页</td><td class="x">读不出</td><td>没有文字层。先用别的工具转成文字。PDF 能不能读：在阅读器里能选中文字的就能读，选不中的不行</td></tr>
<tr><td>直接往输入框粘贴超长文字</td><td>8G 机器一次约 4000 字上限</td><td>超了会提示。存成文件拖进来，自动分批，不受这个限制</td></tr>
<tr><td>合并单元格、跨页表头</td><td>能读，结构可能错位</td><td>导出后自己抽查表头行</td></tr>
<tr><td>超过 3 万字</td><td>自动抽读 10 段，6～9 分钟</td><td>要全量就拆成 2 万字以内逐个发</td></tr>
<tr><td>20MB 要求「一行不漏」</td><td class="x">任何电脑都要几小时</td><td>拆块，或者接受抽读</td></tr>
<tr><td>表格算数字（求和、占比）</td><td>小的能算，多的会算错</td><td>关键数字自己对，或导出 Excel 用公式</td></tr>
</table>
<div class="box warn"><b>超过 3 万字会怎样：</b>自动改成抽读，结果里注明。真要逐字全量，在话里说「全文」「一行不漏」，但要有等几小时的准备——这是模型一个字一个字读的代价，不是软件偷懒。</div>

<h2>五、其它活</h2>
{F("02_换技能.png", "输入框上方那条「技能」，点开可以换，31 个内置")}
<ul>
<li><b>改稿润色</b>：「改得正式一点，别动结构」</li>
<li><b>精简压缩</b>：「压到 800 字，保留数字和时限」</li>
<li><b>写邮件微信</b>：「改成给客户看的邮件，客气但不谄媚」</li>
<li><b>PPT</b>：「做成 8 页，导出成 PPT」，一页一个结论</li>
</ul>
<table>
<tr><th>分组</th><th>技能</th></tr>
<tr><td>常用</td><td>自由对话／润色改稿／起草文稿／精简压缩／提取要点／整理成表格／通读挑刺／数据整理／改成邮件微信</td></tr>
<tr><td>公文（12）</td><td>公文专家／通知起草／请示报告／函／会议纪要／工作总结／领导讲话稿／信息简报／公文语言风格／公文自查／工作方案／调研报告</td></tr>
<tr><td>图表</td><td>表格设计／图表选型／流程图／对比矩阵</td></tr>
<tr><td>演示</td><td>PPT 大纲／单页重做／汇报讲稿</td></tr>
<tr><td>办公</td><td>会议记录整理／周报日报／长文摘要</td></tr>
<tr><td>我的</td><td>自己加的、从 GitHub 导入的</td></tr>
</table>
<p>每个任务记住自己用的技能，切回来不用重选。</p>

<h2>六、要文件：说一句就给你</h2>
<p>把要求说完，末尾加一句格式：</p>
<table>
<tr><td>「把这组数据导出成 Excel」</td><td>→ 直接下 <code>.xlsx</code></td></tr>
<tr><td>「写个通知，导出成 Word」</td><td>→ 直接下 <code>.docx</code>，公文版式</td></tr>
<tr><td>「做成 8 页，导出成 PPT」</td><td>→ 直接下 <code>.pptx</code></td></tr>
</table>
<p>回复下面也会多一条绿色的「已生成 Excel：文件名」，点「再存一次」可重复下载。文件在浏览器的「下载」文件夹。</p>
<p>也可以手动点回复下面那排按钮：<b>复制／公文核稿／表格转 CSV／导出 Word／导出公文／导出 Excel／导出 PPT／换个说法</b>。</p>

<h2>七、提示词模板：不会说话就照着抄</h2>
<p>包里带了一份 <code>提示词模板.html</code>，双击就能看，不用联网：</p>
<ul>
<li>二十个文种，每个一条现成话术，方括号里换成你的字</li>
<li>六类表格模板：转表／合并多文件／抽要点／会议转任务／数据清洗／继续处理</li>
<li>每条都写了「什么时候用」和「容易踩的坑」</li>
</ul>
<p>用不用都行。是给不想琢磨措辞的人准备的——你随口说也能干，只是说清楚「给谁看、要干什么、什么格式」会准得多。</p>

<h2>八、模型：只带一个 4B，为什么</h2>
<p>这个包只有<b>通义千问 4B</b>（2.4G）。8G 内存跑它正合适：一秒十几个字，占内存 4G 左右，不把模型挤到硬盘上。</p>
<div class="box stop"><b>为什么不上 8B：</b>8G 内存跑 8B，模型 6.3G ＋ 系统 3G ＋ 浏览器 1.5G ＝ 10.8G，超过物理内存。Windows 只能把模型挪到硬盘上交换，实测从 13 字/秒掉到 1.6 字/秒——一分钟出不了一段话。大而不当，不如小而快。</div>
<p>想加模型：把 <code>.gguf</code> 丢进「模型」文件夹，重启脚本就行。放两个以上，左下角会出现下拉框。升级到 16G 想上 8B，也是这么加，不用改设置。</p>
<p>线程、上下文档位、缓存压缩，启动时按你的内存和物理核数自动算好。<code>config.txt</code> 里全是空的，不用打开。</p>

<h2>九、资料库和记忆</h2>
{F("08_资料库.png", "把单位的规章、模板、常用表述存进资料库，提问时它会先翻这里")}
<p>资料库存在浏览器本地，不清缓存就一直在。建议定期点「<b>导出资料包</b>」存一份 json 到硬盘，换机器能恢复。</p>
<p>「记忆」里可以写死规矩，比如「落款统一写××市××局」，以后出稿直接用，不用每次嘱咐。</p>

<h2>十、常见问题</h2>
<h3>等了两分钟还没出正文</h3>
<p>看提示：如果写着「内存不够、模型被挤到硬盘」，关掉别的程序和浏览器标签页再试。还慢就把材料拆小一点。</p>
<h3>页面打不开，提示 404</h3>
<p>多半是黑窗口被关了，或者端口被占用。重新双击启动脚本，看窗口里写的地址（可能是 8081）。</p>
<h3>识别不了我的文件</h3>
<p>扫描件、照片、盖章页不行，没有文字层。PDF 里有文字层的可以，纯图片的不行。</p>
<h3>表格里数字算错了</h3>
<p>小的能算，多的会错。关键数字自己对，或者导出 Excel 用公式算。</p>
<h3>它编了一个单位名／日期</h3>
<p>它不该编。真发生了点「公文核稿」，会提醒你「××」没补。落款和日期最好你自己给，一句话的事。</p>
<h3>换电脑怎么办</h3>
<p>序列号按机器码算，换机器要重新申请，把新机器码发过来。模型、app、引擎整个文件夹拷过去就行。</p>

<h2>十一、五条铁律</h2>
<ol>
<li>它会编条款号和数字。涉及「依据第几条」，必须自己对原件。</li>
<li>格式细则以单位口径为准。国标是底线，单位可能有更细的规定。</li>
<li>导出的是初稿，上会前自己过一遍。</li>
<li>不能看图。扫描件、拍照件读不出。</li>
<li>全程不联网，材料不出这台电脑。但涉密材料仍按保密规定办。</li>
</ol>

<div class="foot">v1.5.0（千问版）· 作者：汤姆汤汤汤　微信：zx6530022<br>要序列号、换机器、提需求，都找这个微信。</div>

</div></body></html>
"""

# 两份都用 base64 内嵌图片：
# 根目录版会被上传到资料库在线看，外链 说明图/ 在那边是 404（图裂）；
# app 版是页面内「帮助」打开，web 根是 app 目录，外链同样 404。
# 内嵌后不依赖任何外部文件，本地双击、在线预览都正常。
body = build(True)
open(os.path.join(ROOT, "使用说明.html"), "w", encoding="utf-8").write(body)
open(os.path.join(ROOT, "app", "使用说明.html"), "w", encoding="utf-8").write(body)
open("/tmp/使用说明_online.html", "w", encoding="utf-8").write(body)

print("使用说明.html:", len(body), "字节（图片内嵌）")
print("app/使用说明.html:", len(body), "字节（同上）")
