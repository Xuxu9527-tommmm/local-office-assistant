#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 提示词模板.html（根目录与 app/ 各一份）。

交互版：左侧分类菜单 + 每条模板一键复制 + 可编辑 + 可自增删。
用户改动存在浏览器 localStorage，清缓存也不影响软件本体。
"""
import io, json, os

ROOT = os.path.dirname(os.path.abspath(__file__))

# ---------------- 模板数据（与内置技能、文种卡一一对应） ----------------
CATS = [
    ("gw", "公文 20 文种"),
    ("bg", "表格 6 类"),
    ("pp", "演示与图表"),
    ("bg2", "办公杂活"),
]

GW = [
 ("notice","通知","布置工作、传达事项、转发文件","帮我写一份通知：【××局】定于【3月10日】对【各科室】开展【安全生产大检查】，要求：【3月5日前完成自查并报自查表】【问题立查立改】。落款【××局】，日期【2026年3月1日】。导出成 Word。","事项一条一件事，时限写死到日期。「特此通知」它自己会带，不用嘱咐。"),
 ("qingshi","请示","向上级要批准、要钱、要人","向【××局】写一份请示：因【设备老化】，需购置【电脑10台】，预算【5万元】，资金从【办公经费】列支。附上【设备询价单】。落款【××科】，日期【2026年3月1日】。","一文一事：两件事拆成两个请示。主送只能写一个机关，写两个它核稿时会揪出来。"),
 ("baogao","报告","向上级汇报情况，不要批复","向【××局】写一份2025年度工作报告。材料在附件里，按「基本情况、主要做法、存在问题、下一步打算」四段写，问题写【2~3】条不要藏，下一步要有时限。落款【××局】。","报告结尾不能写「妥否，请批示」——那是请示的结语。要批的东西另写请示。"),
 ("pifu","批复","答复下级的请示","给【××科】写一份批复：你科《关于购置办公设备的请示》（〔2026〕5号）收悉，经研究，同意购置电脑10台，预算5万元，要求【按政府采购程序办理】。落款【××局】，日期【2026年3月5日】。","批复必须对着一份请示来，引语里带上对方文号。"),
 ("han","函","平级单位、不相隶属机关之间","给【××县水利局】写一份商洽函：我局拟于【4月】联合开展【河道整治调研】，商请贵局【派员参加并提供近三年整治台账】，【3月20日】前函复为盼。落款【××市水利局】。","对平级和不相隶属的用函，口气是「商请」，不能出现「务必」「遵照执行」。"),
 ("tongbao","通报","表彰先进、批评错误、传达重要情况","写一份批评性通报：【3月2日】【××科】未按规定【上报数据】，造成【全县报表迟报一天】。按「情况、分析、决定、要求」四段写，决定部分给【通报批评+责令书面检查】。落款【××局】。","批评要落到具体人和事，不写「有关科室」。"),
 ("yijian","意见","对重要问题提出见解和处理办法","写一份《关于【加强乡镇档案管理】的意见》：总体要求、主要任务（【4】条，每条带措施）、保障措施三段。任务要能考核，别写「加强领导」。落款【××局】。",""),
 ("jueding","决定","对重要事项作出安排、奖惩","写一份《关于【表彰2025年度先进集体】的决定》：缘由一段，决定事项逐条列【5】个集体和奖励，最后号召一段。落款【××局】。",""),
 ("jueyi","决议","经会议表决通过的事项","写一份《【××局】第【X】次党组会关于【通过年度预算】的决议》：简述会议审议情况，决议事项逐条用「会议决定/会议同意」。","决议是会议通过才用的，个人发的用决定。"),
 ("gongbao","公报","公开发布重要决定或统计数据","写一份《【2025年国民经济和社会发展统计公报》框架》：按【综合、农业、工业、投资、贸易、民生】分节，每节列【3~5】项指标，数据用我给的表（附件）。",""),
 ("gonggao","公告","向国内外宣布重要事项（无主送机关）","写一份公告：【××工程】于【3月15日】起【封闭施工】，范围【××路段】，绕行方案见附件。不写主送机关，落款【××交通局】。",""),
 ("tonggao","通告","在一定范围内应当遵守的事项","写一份通告：【××水域】【3月1日至6月30日】禁渔，禁止【捕捞、垂钓】，违者依据【《渔业法》第X条】处理。落款【××农业农村局】。",""),
 ("mingling","命令（令）","发布行政法规、宣布施行重大强制措施","写一份令：《【××市××管理办法】已经【2026年第X次政府常务会】通过，现予公布，自【2026年5月1日】起施行》。落款【市长××】。","命令的签发人必须是法定负责人，一般单位用不上。"),
 ("yian","议案","向人大提请审议事项","写一份议案：提请【市人大】审议《【××市湿地保护条例（草案）】》。写明缘由、草案形成过程、提请审议事项。落款【市人民政府】。",""),
 ("jiyao","会议纪要","记载会议议定事项","把附件这份会议记录整理成纪要：第一段一句话概括会议；然后逐条写议定事项，每条带【责任单位】和【完成时限】；没写责任人的填「待定」，不要编。","纪要不写「谁说了什么原话」，只写定了什么。"),
 ("jianghua","讲话稿","按场合和身份写，能念出口","写一篇【安全生产动员会】领导讲话稿：局长身份，【8】分钟（约2000字），结构：为什么开这个会、今年抓【3】件事、提【2】点要求。口语一点，能念，别堆排比。",""),
 ("zongjie","工作总结","成绩有数、问题不藏","写【××科2025年度工作总结】：成绩部分每条带数字（材料在附件），问题写【2~3】条，明年打算【3】条有时限。别用「扎实推进」「全面提升」开头。",""),
 ("fangan","工作方案","目标 / 任务 / 步骤 / 分工 / 保障","写《【××专项整治】工作方案》：目标要能考核（写死数字），任务分【3】块，步骤分【动员/实施/验收】三个阶段带时间，分工不许写「相关部门」，保障写【组织、经费、督查】。",""),
 ("diaoyan","调研报告","情况 / 问题 / 原因 / 建议","把附件调研材料写成调研报告：现状一段，问题【3】条每条带数据，原因【2】条，建议【3】条且一条建议对一个问题。别写「建议加强领导」。",""),
 ("jianbao","信息简报","一事一报，300 字内","把这件事写成信息简报：【3月5日××局开展××活动，××人参加，主要做了××，成效××】。标题写成观点句（比如「××局三招破解××难题」），300 字内。",""),
]

BG = [
 ("guizheng","A. 规整材料转表","材料本身条理清楚（名单、台账、通知里的安排）","把下面材料整理成表格，列：【名称 / 数量 / 时间 / 负责人】。一行一条，不要把两条挤一行，最后加一列「行号」。导出成 Excel。","材料规整（本身就是分条列的）走极速通道，1 秒出表。列名写得越死，它越不会自由发挥。"),
 ("duowenjian","B. 多文件合成一张表","几个文件的数据要拼到一起","把这几个文件的数据合成一张表。不同文件的列名可能不一样，用第一份的做表头，缺的列写空。加一列「来源文件」，标明每行来自哪个文件。重复的行合一条，标注「重复来自×文件」。导出成 Excel。","「来源文件」列是自动带的，不嘱咐也会加。合成完最好抽查几行。"),
 ("changwen","C. 长文抽要点","几千到几万字的材料要提纲挈领","从下面材料里提炼要点，每条格式：序号 + 一句话 + 原文在第几段。数字保留原样不要约算，【】类的占位符保留。分【4】类组织：问题、措施、时限、责任。","1 万字约 3 分钟，2.4 万字约 9 分钟。超大材料自动抽读，要逐字全量就说「全文」，但先留出几小时。"),
 ("renwu","D. 会议记录转任务表","散会了要把活分下去","把这份会议记录转成任务表，列：【事项 / 责任人 / 时限 / 验收标准】。一条任务一行；没写责任人的填「待定」，没写时限的填「未明确」——不要替他们编。",""),
 ("qingxi","E. 数据清洗","表是有的，就是乱","把这份表洗干净：① 日期统一成【2026-03-05】格式 ② 数字去掉千分位和单位 ③ 空值统一写「—」 ④ 重复行合并并在备注标注。改完先列出你改了哪几类、各几处，再给表。导出成 Excel。","让它先报改了什么再给结果，能一眼看出有没有改过头。"),
 ("jixu","F. 接着处理 / 批量改格式","中途断了、或者想换个样式","接着处理。","断了直接说这四个字，它从断的那批继续。想改样式：「这张表按【时间】倒序排，加一列「合计」放最后」。"),
]

PP = [
 ("ppt-outline","PPT 大纲","给局务会、专项会做汇报","给【局务会】做一份汇报大纲，主题【档案数字化进展】，【10】页：封面、汇报逻辑一页图、每部分一页要点、最后一页请求事项。每页给标题和 3 条要点。导出成 PPT。","页数和听众写死，它不会东拉西扯。"),
 ("ppt-page","单页重做","这一页内容太散，想重写","把这一页的内容重做成能讲的：要点不超过 3 条，每条一句话，标题写成结论句。内容如下：【粘贴本页内容】。导出成 PPT。",""),
 ("ppt-script","汇报讲稿","拿着大纲写逐字稿","根据这份 PPT 大纲写逐字稿：【粘贴大纲】。每页 1 分钟的量，口语、能念，页与页之间有过渡句。导出成 Word。",""),
 ("flow-map","流程图 / 结构图","讲流程、讲结构","画一张【文件从收文到归档】的流程图（Markdown 流程图语法）：节点【收文登记→拟办→批办→承办→催办→归档】，含【退回】分支。导出成 Mermaid 图。",""),
 ("matrix-2x2","对比 / 矩阵分析","几个方案要选型","把【三个方案】按【成本 / 见效速度】做成对比矩阵，给出我的情况下的推荐和理由。材料：【粘贴方案要点】。导出成 Excel。",""),
 ("chart-pick","图表选型","有一组数据不知道怎么画","这组数据该画什么图：【粘贴数据】。给出图型、坐标轴安排和一句话理由，不要先画。",""),
]

BG2 = [
 ("mtg","会议记录整理","会上记得乱","把会上记的零散内容整理成会议纪要：【粘贴记录】。只写定了什么，不写谁说了什么原话。没写责任人的填「待定」。导出成 Word。",""),
 ("week","周报 / 日报","把这周干的事说一遍","把这周干的几件事列一下，我整理成周报：①…②…③…。格式：本周完成（带数字）、下周计划、需协调事项。导出成 Word。",""),
 ("digest","长文摘要","万字材料要压成几段","粘一篇长文，我压成三层：一句话结论、5 条要点、每条 1 句展开。数字保留原样。",""),
 ("mail","改成邮件 / 微信","公文腔的通知要发人","把要通知的事写清楚，我出两个版本：邮件版（正式、带称呼落款）和微信版（三句话内）。事项：【粘贴内容】。",""),
 ("polish","润色改稿","稿子能看但别扭","把这段稿子润色一下，改通顺、去口水话，别改意思：【粘贴稿子】。改完用三行说明改了什么。导出成 Word。",""),
]

def tpl_blocks():
    s = ""
    for cat_id, items in (("gw", GW), ("bg", BG), ("pp", PP), ("bg2", BG2)):
        s += "T[%s]=[" % json.dumps(cat_id)
        for tid, name, tag, text, note in items:
            s += "{id:%s,t:%s,tag:%s,x:%s,n:%s}," % (
                json.dumps(tid), json.dumps(name), json.dumps(tag),
                json.dumps(text), json.dumps(note))
        s += "];\n"
    return s

PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>提示词模板 · 本地办公助手</title>
<style>
:root{--ink:#17324D;--ink2:#3A5269;--gray:#787E88;--line:#DBD6CC;--paper:#F7F5F0;--red:#AA3E30;--amber:#A87C26;--ok:#3F7A5A;--card:#FFFFFF}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:15.5px;line-height:1.85}
.wrap{max-width:860px;margin:0 auto;padding:44px 24px 90px}
h1{font-size:26px;letter-spacing:.5px;margin-bottom:6px}
.lead{color:var(--gray);font-size:14px;margin-bottom:26px}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:12px 0}
.box.warn{border-left:4px solid var(--amber)}
.box.ok{border-left:4px solid var(--ok)}
.dim{color:var(--gray);font-size:13.5px}
/* 分类菜单 */
.menu{display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;background:var(--paper);padding:10px 0 12px;z-index:9;border-bottom:1px solid var(--line);margin-bottom:6px}
.menu button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:7px 16px;font-size:14.5px;cursor:pointer;color:var(--ink2);font-family:inherit}
.menu button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.menu button .ct{opacity:.65;font-size:12.5px;margin-left:4px}
/* 卡片 */
.tpl{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.tpl .hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.tpl .hd b{font-size:16px}
.tpl .tag{font-size:12.5px;color:var(--gray)}
.tpl .acts{margin-left:auto;display:flex;gap:8px}
.tpl button{border:1px solid var(--line);background:#F6F3EC;border-radius:7px;padding:4px 12px;font-size:13px;cursor:pointer;font-family:inherit;color:var(--ink2)}
.tpl button:hover{border-color:var(--ink2)}
.tpl button.copy{color:var(--ok);font-weight:600}
.tpl button.del{color:var(--red)}
.tpl .t{background:#F3F0E8;border-radius:7px;padding:10px 12px;margin:8px 0 4px;font-size:15px;white-space:pre-wrap;word-break:break-word}
.tpl textarea{width:100%;min-height:120px;background:#F3F0E8;border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:15px;font-family:inherit;line-height:1.7;resize:vertical;margin:8px 0 4px}
.tpl .note{font-size:13.5px;color:var(--ink2);margin-top:6px}
.tpl .note b{color:var(--red)}
.tpl .edited{font-size:12px;color:var(--amber)}
.copied{color:var(--ok)!important;font-weight:700}
/* 边界表 */
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14.5px}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:#F0EDE4;font-weight:600}
.x{color:var(--red);font-weight:600}
/* 新建模板 */
.fab{position:fixed;right:22px;bottom:22px;border:none;background:var(--ink);color:#fff;border-radius:999px;padding:12px 22px;font-size:15px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);font-family:inherit}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:99}
.modal.on{display:flex}
.modal .box{width:min(92vw,560px);padding:20px}
.modal input,.modal select,.modal textarea{width:100%;border:1px solid var(--line);border-radius:7px;padding:9px 12px;font-family:inherit;font-size:15px;margin:6px 0 14px}
.modal textarea{min-height:140px;resize:vertical}
.modal .row{text-align:right}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--ink);color:#fff;border-radius:8px;padding:9px 20px;font-size:14px;display:none;z-index:100}
@media(max-width:600px){body{font-size:15px}.menu{padding:8px 0 10px}}
</style>
</head>
<body>
<div class="wrap">
<h1>提示词模板</h1>
<div class="lead">本地办公助手 v1.5.0 · 点分类，挑一条，【复制】粘进软件改掉【】里的字就能用。<br>每条都能<b>编辑</b>，也能<b>自建模板</b>——改动存在这台电脑的浏览器里，随改随用。</div>

<div class="box ok">
<b>三步：</b>① 选好分类点【复制】；② 粘进软件输入框，改掉【】里的字；③ 要文件就在末尾加「导出成 Word / Excel」。
</div>
<div class="box warn">
<b>两条铁律：</b>① 数字、单位名、日期没写的，它会填「××」让你自己补——<b>这是对的</b>，它不编。② 材料超过 3 万字会自动抽读（结果里会写明），要一行不漏就说「全文」，但要有等几小时的准备。
</div>

<div class="menu" id="menu"></div>
<div id="content"></div>

<h2 style="margin-top:40px" id="bound">表格的边界</h2>
<table>
<tr><th>情况</th><th>结果</th><th>怎么办</th></tr>
<tr><td>扫描件、照片、盖章页</td><td class="x">读不出</td><td>没有文字层。PDF 判断法：阅读器里能选中文字的就能读</td></tr>
<tr><td>直接粘贴超长文字</td><td>8G 机器一次约 4000 字</td><td>存成文件拖进来，自动分批，不受限制</td></tr>
<tr><td>合并单元格、跨页表头</td><td>能读，但结构可能错位</td><td>让「导出成 Excel」后自己抽查表头行</td></tr>
<tr><td>超过 3 万字</td><td>自动抽读 10 段（约 6~9 分钟）</td><td>结果里写明抽读。要全量拆成 2 万字以内的块逐个发</td></tr>
<tr><td>要求「一行不漏」的 20MB 文件</td><td class="x">任何电脑都要几个小时</td><td>拆块，或者接受抽读</td></tr>
<tr><td>表格算数字（求和、占比）</td><td>小的能算，多的会算错</td><td>关键数字自己对，或导出 Excel 用公式算</td></tr>
</table>

<div class="box ok" style="margin-top:16px">
<b>一个偷懒诀窍：</b>不管什么活，第一句先说清楚「给谁看、要干什么」，第二句说清楚「要什么格式（表？文稿？Word？Excel？）」，第三句把数字和时间点给它。剩下的它自己补位。改话术不用客气，它不怕你啰嗦，就怕你不说清楚。
</div>
</div>

<button class="fab" onclick="openNew()">＋ 新建模板</button>

<div class="modal" id="modal">
  <div class="box">
    <b>新建模板</b>
    <div>分类</div><select id="nCat"></select>
    <div>名称</div><input id="nName" placeholder="比如：年度考核通知">
    <div>场景说明（可空）</div><input id="nTag" placeholder="什么时候用">
    <div>模板内容</div><textarea id="nText" placeholder="【】里的字换成你自己的"></textarea>
    <div class="row">
      <button onclick="closeNew()">取消</button>
      <button onclick="saveNew()" style="background:var(--ink);color:#fff">保存</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
/* ---------- 数据 ---------- */
var T = {};
%%DATA%%

var CATS = %%CATS%%;

/* ---------- 本地存储 ---------- */
function ls(k, v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'null'); localStorage.setItem(k, JSON.stringify(v)); }catch(e){ return null; } }
var edits = ls('tpt_edits') || {};        /* 内置模板的改写：id -> 文本 */
var custom = ls('tpt_custom') || [];      /* 自建模板 */
var curCat = (location.hash||'#gw').slice(1);
if(!CATS.some(function(c){return c[0]===curCat;})) curCat='gw';

function textOf(t){ return (edits[t.id]!==undefined && edits[t.id]!=='') ? edits[t.id] : t.x; }

/* ---------- 渲染 ---------- */
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function card(t, isCustom){
  var has = edits[t.id]!==undefined && edits[t.id]!=='';
  return '<div class="tpl" id="c_'+t.id+'">'
    + '<div class="hd"><b>'+esc(t.t)+'</b><span class="tag">'+esc(t.tag||'')+'</span>'
    + (has ? '<span class="edited">已编辑</span>' : '')
    + '<span class="acts">'
    + '<button class="copy" onclick="copyTxt(this,\\''+t.id+'\\')">复制</button>'
    + '<button onclick="editCard(\\''+t.id+'\\')">'+(has?'继续编辑':'编辑')+'</button>'
    + (has ? '<button onclick="resetCard(\\''+t.id+'\\')">还原</button>' : '')
    + (isCustom ? '<button class="del" onclick="delCustom(\\''+t.id+'\\')">删除</button>' : '')
    + '</span></div>'
    + '<div class="t" id="txt_'+t.id+'" style="display:none">'+esc(textOf(t))+'</div>'
    + '<textarea id="ed_'+t.id+'" style="display:none">'+esc(textOf(t))+'</textarea>'
    + '<div class="note">'+(t.n||'')+'</div>'
    + '</div>';
}

function render(){
  var m = document.getElementById('menu');
  m.innerHTML = CATS.map(function(c){
    var n = (T[c[0]]||[]).length + custom.filter(function(x){return x.cat===c[0];}).length;
    return '<button data-c="'+c[0]+'" class="'+(c[0]===curCat?'on':'')+'" onclick="pick(\\''+c[0]+'\\')">'+esc(c[1])+'<span class="ct">'+n+'</span></button>';
  }).join('');
  var items = (T[curCat]||[]).map(function(t){return card(t,false);}).join('');
  var cust  = custom.filter(function(x){return x.cat===curCat;}).map(function(t){return card(t,true);}).join('');
  document.getElementById('content').innerHTML = items + cust;
  location.hash = curCat;
}
function pick(c){ curCat=c; render(); }

/* ---------- 复制（离线环境不依赖 https，加 execCommand 兜底） ---------- */
function doCopy(s, cb){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(s).then(cb, function(){ fallbackCopy(s, cb); });
  } else fallbackCopy(s, cb);
}
function fallbackCopy(s, cb){
  var ta = document.createElement('textarea');
  ta.value = s; ta.style.cssText='position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta); cb();
}
function copyTxt(btn, id){
  var t = findById(id);
  var s = t ? textOf(t) : '';
  if(t && t.cat && document.getElementById('ed_'+id)) s = document.getElementById('ed_'+id).style.display!=='none' ? document.getElementById('ed_'+id).value : s;
  doCopy(s, function(){
    var old = btn.textContent; btn.textContent='已复制 ✓'; btn.classList.add('copied');
    setTimeout(function(){ btn.textContent=old; btn.classList.remove('copied'); }, 1400);
  });
}
function findById(id){
  for(var c in T) for(var i=0;i<T[c].length;i++) if(T[c][i].id===id) return T[c][i];
  for(var i=0;i<custom.length;i++) if(custom[i].id===id) return custom[i];
  return null;
}

/* ---------- 编辑 / 还原 ---------- */
function editCard(id){
  var box = document.getElementById('ed_'+id), show = document.getElementById('txt_'+id);
  if(box.style.display==='none'){
    show.style.display='none'; box.style.display='block';
    /* 进入编辑态时按钮文字变化 */
    var b = document.getElementById('c_'+id).querySelector('[onclick^="editCard"]');
    b.textContent='保存'; b.onclick=function(){ saveEdit(id); };
  }
}
function saveEdit(id){
  var box = document.getElementById('ed_'+id);
  edits[id] = box.value.trim();
  ls('tpt_edits', edits); render(); toast('已保存，下次打开还是这个');
}
function resetCard(id){ delete edits[id]; ls('tpt_edits', edits); render(); toast('已还原成内置话术'); }

/* ---------- 自建模板 ---------- */
function openNew(){
  var sel = document.getElementById('nCat');
  sel.innerHTML = CATS.map(function(c){ return '<option value="'+c[0]+'">'+esc(c[1])+'</option>'; }).join('');
  sel.value = curCat;
  ['nName','nTag','nText'].forEach(function(x){ document.getElementById(x).value=''; });
  document.getElementById('modal').classList.add('on');
}
function closeNew(){ document.getElementById('modal').classList.remove('on'); }
function saveNew(){
  var name = document.getElementById('nName').value.trim();
  var text = document.getElementById('nText').value.trim();
  if(!name || !text){ toast('名称和内容都要填'); return; }
  custom.push({ id:'u'+Date.now(), cat:document.getElementById('nCat').value, t:name,
                tag:document.getElementById('nTag').value.trim(), x:text, n:'' });
  ls('tpt_custom', custom);
  closeNew(); curCat = custom[custom.length-1].cat; render(); toast('已存进「我的模板」所在分类');
}
function delCustom(id){
  custom = custom.filter(function(x){ return x.id!==id; });
  ls('tpt_custom', custom); render(); toast('已删除');
}

/* ---------- 其余 ---------- */
var toastTimer=null;
function toast(s){
  var el=document.getElementById('toast'); el.textContent=s; el.style.display='block';
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.style.display='none'; }, 1800);
}
render();
</script>
</body>
</html>
"""

data = tpl_blocks()
page = PAGE.replace("%%DATA%%", data).replace("%%CATS%%", json.dumps(CATS, ensure_ascii=False))
assert "%%" not in page

for p in [os.path.join(ROOT, "提示词模板.html"), os.path.join(ROOT, "app", "提示词模板.html")]:
    io.open(p, "w", encoding="utf-8").write(page)
    print("已生成", p, len(page.encode()), "字节")
