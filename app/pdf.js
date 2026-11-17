/* ============================================================
 * PDF 正文提取 —— 纯前端，零依赖，不联网
 * ------------------------------------------------------------
 * 思路：
 *   1. 全文扫描 "N M obj"，建对象表（不依赖 xref，坏文件也能读）
 *   2. 解压对象流（/Type /ObjStm），把里面的对象补进表
 *   3. 找 /Type /Page，取 /Contents 内容流
 *   4. 取页面 /Resources /Font，逐个字体读 /ToUnicode 映射表
 *   5. 解内容流里的 Tj / TJ / ' / "，按当前字体的映射还原成文字
 *
 * 只做文字，不做版面还原、不认图片、不做 OCR。
 * 扫描件（整页是图）读不出字，会明确告诉用户。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 基础 ---------- */
  function latin1(u) {
    var s = '', n = u.length, CH = 8192;
    for (var i = 0; i < n; i += CH) {
      s += String.fromCharCode.apply(null, u.subarray(i, Math.min(i + CH, n)));
    }
    return s;
  }
  function utf8(u) {
    try { return new TextDecoder('utf-8').decode(u); } catch (e) { return latin1(u); }
  }
  async function inflateRaw(data, zlib) {
    if (!data || !data.length) return null;
    try {
      var ds = new DecompressionStream(zlib ? 'deflate' : 'deflate-raw');
      var ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(ab);
    } catch (e) { return null; }
  }
  async function inflateAuto(data) {
    var r = await inflateRaw(data, true);
    if (r) return r;
    return await inflateRaw(data, false);
  }
  function bytesAt(u, str, start, end) {
    return u.subarray(start, end);
  }
  function hexToText(h) {
    h = h.replace(/[^0-9A-Fa-f]/g, '');
    if (h.length % 4 === 0 && h.length >= 4) {
      var s = '';
      for (var i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16));
      return s;
    }
    var o = '';
    for (var j = 0; j < h.length; j += 2) o += String.fromCharCode(parseInt(h.substr(j, 2), 16));
    return o;
  }

  /* ---------- 对象扫描 ---------- */
  function scanObjects(s) {
    var objs = {}, re = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g, m;
    while ((m = re.exec(s))) {
      var num = +m[1], bodyStart = m.index + m[0].length;
      var endIdx = s.indexOf('endobj', bodyStart);
      if (endIdx < 0) endIdx = s.length;
      var body = s.slice(bodyStart, endIdx);
      var o = { num: num, body: body, stream: null, dict: body };
      var sm = /stream\r\n|stream\n|stream\r/.exec(body);
      if (sm) {
        var ds = bodyStart + sm.index + sm[0].length;
        var de = s.indexOf('endstream', ds);
        if (de < 0) de = endIdx;
        o.dict = body.slice(0, sm.index);
        o.streamStart = ds;
        o.streamEnd = de;
      }
      objs[num] = o;
    }
    return objs;
  }
  function numRef(dict, key) {
    var re = new RegExp('/' + key + '\\s+(\\d+)\\s+\\d+\\s+R');
    var m = re.exec(dict);
    return m ? +m[1] : null;
  }
  function dictOf(objs, num) {
    var o = objs[num];
    return o ? o.dict : '';
  }

  /* ---------- 流数据的解码 ---------- */
  async function getStream(u, objs, num) {
    var o = objs[num];
    if (!o || o.streamStart === undefined) return null;
    var data = u.subarray(o.streamStart, o.streamEnd);
    // 去掉流末尾的 EOL
    var d = o.dict;
    /* ASCII85Decode：reportlab 等排版引擎常用 [ /ASCII85Decode /FlateDecode ]
       双重过滤，先解 A85 再进后面的 Flate 分支。 */
    if (/ASCII85Decode/.test(d)) {
      var t = latin1(data);
      var bg = t.indexOf('<~');
      if (bg >= 0) t = t.slice(bg + 2);
      var ed = t.indexOf('~>');
      if (ed >= 0) t = t.slice(0, ed);
      t = t.replace(/\s/g, '');
      var out85 = [], grp = [], i85 = 0;
      for (var a = 0; a < t.length; a++) {
        var ch = t.charCodeAt(a);
        if (ch === 122 && !grp.length) { out85.push(0, 0, 0, 0); continue; }   // 'z'
        if (ch < 33 || ch > 117) continue;
        grp.push(ch - 33);
        if (grp.length === 5) {
          var val = (grp[0]*52200625 + grp[1]*614125 + grp[2]*7225 + grp[3]*85 + grp[4]);
          out85.push((val>>>24)&255, (val>>>16)&255, (val>>>8)&255, val&255);
          grp = [];
        }
      }
      if (grp.length) {   // 不足 5 的尾巴补 'u'(84) 再按 原有字符数-1 输出字节
        var nTail = grp.length;   // 必须在补位前记下，补位后恒为 5
        while (grp.length < 5) grp.push(84);
        var val2 = (grp[0]*52200625 + grp[1]*614125 + grp[2]*7225 + grp[3]*85 + grp[4]);
        for (var b = 0; b < nTail - 1; b++) out85.push((val2>>>(24 - b*8))&255);
      }
      data = new Uint8Array(out85);
    }
    if (/\/ASCIIHexDecode/.test(d)) {
      var t = latin1(data).replace(/>[\s\S]*$/, '').replace(/\s/g, '');
      var out = new Uint8Array(Math.floor(t.length / 2));
      for (var i = 0; i < out.length; i++) out[i] = parseInt(t.substr(i * 2, 2), 16);
      return out;
    }
    if (/\/FlateDecode/.test(d)) {
      if (data.length > 1 && data[0] === 0x0a) data = data.subarray(1);
      // 去掉尾部空白：DecompressionStream 比 zlib 严格，尾随字节会直接报错
      var end = data.length;
      while (end > 0 && (data[end - 1] === 10 || data[end - 1] === 13 || data[end - 1] === 32)) end--;
      var cands = [data];
      if (end < data.length) cands.push(data.subarray(0, end));
      for (var ci = 0; ci < cands.length; ci++) {
        var r = await inflateAuto(cands[ci]);
        if (r && r.length) return r;
      }
      // 再容错：前几个字节可能是垃圾
      for (var skip = 1; skip <= 3; skip++) {
        var r2 = await inflateAuto(data.subarray(skip));
        if (r2 && r2.length) return r2;
      }
      return null;
    }
    if (/ASCII85Decode/.test(d) || /ASCIIHexDecode/.test(d)) return data;  // 已解过的直接给
    if (/\/Filter/.test(d)) return null;   // LZW / DCT 等不处理
    return data;
  }

  /* ---------- 对象流展开 ---------- */
  async function expandObjStm(u, objs, s) {
    var nums = Object.keys(objs);
    for (var i = 0; i < nums.length; i++) {
      var o = objs[nums[i]];
      if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
      var data = await getStream(u, objs, +nums[i]);
      if (!data) continue;
      var txt = latin1(data);
      var n = +(/(\/N\s+(\d+))/.exec(o.dict) || [0, 0, 0])[2];
      var first = +(/(\/First\s+(\d+))/.exec(o.dict) || [0, 0, 0])[2];
      if (!n || !first) continue;
      var head = txt.slice(0, first).trim().split(/\s+/);
      for (var k = 0; k < n; k++) {
        var onum = +head[k * 2], off = +head[k * 2 + 1];
        if (isNaN(onum) || isNaN(off)) continue;
        var nextOff = (k + 1 < n) ? +head[(k + 1) * 2 + 1] : txt.length - first;
        var body = txt.slice(first + off, first + (isNaN(nextOff) ? txt.length : nextOff));
        if (!objs[onum]) objs[onum] = { num: onum, dict: body, body: body, stream: null };
        else if (!objs[onum].dict && body) objs[onum].dict = body;
      }
    }
  }

  /* ---------- ToUnicode CMap ---------- */
  function parseCMap(txt) {
    var map = new Map(), widths = {};
    var sec = /beginbfchar([\s\S]*?)endbfchar/g, m;
    while ((m = sec.exec(txt))) {
      var body = m[1], re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g, mm;
      while ((mm = re.exec(body))) {
        map.set(parseInt(mm[1], 16), hexToText(mm[2]));
        widths[mm[1].length] = 1;
      }
    }
    sec = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = sec.exec(txt))) {
      var b = m[1];
      var re2 = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]*)>|\[([\s\S]*?)\])/g, mr;
      while ((mr = re2.exec(b))) {
        var lo = parseInt(mr[1], 16), hi = parseInt(mr[2], 16);
        widths[mr[1].length] = 1;
        if (hi - lo > 65535) continue;
        if (mr[4] !== undefined) {
          var base = mr[4], blen = base.length;
          for (var c = lo; c <= hi; c++) {
            var v = parseInt(base, 16) + (c - lo);
            var h = v.toString(16).toUpperCase();
            while (h.length < blen) h = '0' + h;
            map.set(c, hexToText(h));
          }
        } else if (mr[5] !== undefined) {
          var arr = mr[5].match(/<([0-9A-Fa-f]*)>/g) || [];
          for (var k = 0; k < arr.length && lo + k <= hi; k++) {
            map.set(lo + k, hexToText(arr[k].slice(1, -1)));
          }
        }
      }
    }
    // widths 的键是源编码的十六进制位数：2 位=1 字节（简单字体），4 位=2 字节（CID 字体）
    var bytes = 2;
    if (widths[2] && !widths[4]) bytes = 1;
    return { map: map, bytes: bytes };
  }

  /* ---------- 页面字体表 ---------- */
  async function fontsOfPage(u, objs, pageDict) {
    var resDict = pageDict;
    var rnum = numRef(pageDict, 'Resources');
    if (rnum && dictOf(objs, rnum)) resDict = dictOf(objs, rnum);
    // /Resources 可能是间接引用且只写了编号
    var fm = /\/Font\s*<<([\s\S]*?)>>/.exec(resDict);
    var fontSrc = fm ? fm[1] : '';
    if (!fm) {
      var fnum = numRef(resDict, 'Font');
      if (fnum && dictOf(objs, fnum)) {
        var fd = dictOf(objs, fnum);
        var inner = /<<([\s\S]*)>>/.exec(fd);
        fontSrc = inner ? inner[1] : fd;
      }
    }
    var table = {}, re = /\/([^\s\/<>\[\]]+)\s+(\d+)\s+\d+\s+R/g, m;
    while ((m = re.exec(fontSrc))) {
      var fname = m[1], fobj = +m[2];
      var fd2 = dictOf(objs, fobj) || '';
      var ent = { type0: /\/Subtype\s*\/Type0/.test(fd2), cmap: null, bytes: 2, ucs2: false };
      /* UniGB-UCS2-H / UCS4-H：GB 系 CID 字体（STSong、仿宋_GB2312 等）没嵌 ToUnicode 时
         用这种编码，字节本身就是 UCS-2/UCS-4 大端码点，直接按双字节/四字节解码即可。
         reportlab、部分国产排版软件生成的 PDF 就是这种形态。 */
      if (/\/Encoding\s*\/UniGB-UCS2-H/.test(fd2)) ent.ucs2 = 2;
      else if (/\/Encoding\s*\/UniGB-UCS4-H/.test(fd2)) ent.ucs2 = 4;
      else {
        // 编码也可能写在 DescendantFonts 里
        var df0 = /\/DescendantFonts\s*\[\s*(\d+)/.exec(fd2);
        if (df0) {
          var dd0 = dictOf(objs, +df0[1]) || '';
          if (/\/Encoding\s*\/UniGB-UCS2-H/.test(dd0)) ent.ucs2 = 2;
          else if (/\/Encoding\s*\/UniGB-UCS4-H/.test(dd0)) ent.ucs2 = 4;
        }
      }
      var tUn = numRef(fd2, 'ToUnicode');
      if (!tUn) {
        // 复合字体的 ToUnicode 有时挂在 DescendantFonts 上
        var df = /\/DescendantFonts\s*\[\s*(\d+)/.exec(fd2);
        if (df) { var dd = dictOf(objs, +df[1]) || ''; tUn = numRef(dd, 'ToUnicode'); }
      }
      if (tUn) {
        var cm = await getStream(u, objs, tUn);
        if (cm) {
          var parsed = parseCMap(latin1(cm));
          if (parsed.map.size) { ent.cmap = parsed.map; ent.bytes = parsed.bytes; }
        }
      }
      table[fname] = ent;
    }
    return table;
  }

  /* ---------- 内容流tokenizer ---------- */
  function decodeBytes(arr, font) {
    if (!font) { var s0 = ''; for (var i0 = 0; i0 < arr.length; i0++) s0 += String.fromCharCode(arr[i0]); return s0; }
    if (font.cmap && font.cmap.size) {
      var n = font.bytes, out = '';
      for (var i = 0; i + n <= arr.length; i += n) {
        var code = n === 2 ? ((arr[i] << 8) | arr[i + 1]) : arr[i];
        var v = font.cmap.get(code);
        if (v !== undefined) out += v;
      }
      return out;
    }
    /* UniGB-UCS2/UCS4-H：字节即 Unicode 码点，直接拼 */
    if (font.ucs2) {
      var n2 = font.ucs2, out2 = '';
      for (var j2 = 0; j2 + n2 <= arr.length; j2 += n2) {
        var cp = 0;
        for (var b2 = 0; b2 < n2; b2++) cp = (cp << 8) | arr[j2 + b2];
        if (cp >= 0x20 || cp === 10 || cp === 13) out2 += String.fromCodePoint(cp);
      }
      return out2;
    }
    if (font.type0) return '';   // Identity-H 且没有 ToUnicode：无法还原
    var s = '';
    for (var j = 0; j < arr.length; j++) {
      var c = arr[j];
      s += (c >= 32 && c < 127) || c > 159 ? String.fromCharCode(c) : (c === 10 || c === 13 ? '\n' : '');
    }
    return s;
  }

  function readLiteral(s, i) {
    // s[i] === '('
    var out = [], depth = 1, n = s.length; i++;
    while (i < n && depth > 0) {
      var c = s[i];
      if (c === '\\') {
        var d = s[i + 1];
        if (d === 'n') { out.push(10); i += 2; }
        else if (d === 'r') { out.push(13); i += 2; }
        else if (d === 't') { out.push(9); i += 2; }
        else if (d === 'b') { out.push(8); i += 2; }
        else if (d === 'f') { out.push(12); i += 2; }
        else if (d === '(' || d === ')' || d === '\\') { out.push(d.charCodeAt(0)); i += 2; }
        else if (d >= '0' && d <= '7') {
          var oct = '', k = 0;
          while (k < 3 && s[i + 1 + k] >= '0' && s[i + 1 + k] <= '7') { oct += s[i + 1 + k]; k++; }
          out.push(parseInt(oct, 8) & 0xff); i += 1 + k;
        }
        else if (d === '\n') { i += 2; }
        else { i += 2; }
      } else if (c === '(') { depth++; out.push(40); i++; }
      else if (c === ')') { depth--; if (depth > 0) out.push(41); i++; }
      else { out.push(c.charCodeAt(0)); i++; }
    }
    return { bytes: out, next: i };
  }

  function contentToText(s, fonts) {
    var out = '', i = 0, n = s.length;
    var stack = [], curFont = null, lastY = null, pendingBreak = false;

    function emit(t) {
      if (!t) return;
      if (pendingBreak && out && !/\n$/.test(out)) out += '\n';
      pendingBreak = false;
      out += t;
    }
    function flushStack() { stack = []; }

    while (i < n) {
      var c = s[i];
      if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') { i++; continue; }
      if (c === '(') { var r = readLiteral(s, i); stack.push({ k: 's', v: r.bytes }); i = r.next; continue; }
      if (c === '<' && s[i + 1] !== '<') {
        var e = s.indexOf('>', i);
        if (e < 0) { i++; continue; }
        var hx = s.slice(i + 1, e).replace(/[^0-9A-Fa-f]/g, '');
        var arr = [];
        for (var p = 0; p < hx.length; p += 2) arr.push(parseInt(hx.substr(p, 2), 16));
        stack.push({ k: 's', v: arr }); i = e + 1; continue;
      }
      if (c === '[') { stack.push({ k: 'a', v: [] }); i++; continue; }
      if (c === ']') {
        var items = [], top = stack.pop();
        while (top && top.k !== 'a') { items.unshift(top); top = stack.pop(); }
        stack.push({ k: 'a', v: items }); i++; continue;
      }
      if (c === '/' ) {
        var j = i + 1, nm = '';
        while (j < n && !/[\s\/\[\]<>\(\)\{\}\/%]/.test(s[j])) { nm += s[j]; j++; }
        stack.push({ k: 'n', v: nm }); i = j; continue;
      }
      if (c === '{' || c === '}') { i++; continue; }

      // 数字或运算符
      var k2 = i, tok = '';
      while (k2 < n && !/[\s\/\[\]<>\(\)\{\}]/.test(s[k2])) { tok += s[k2]; k2++; }
      if (!tok) { i++; continue; }
      i = k2;

      if (/^[-+]?[\d.]+$/.test(tok)) { stack.push({ k: 'd', v: parseFloat(tok) }); continue; }

      // 运算符
      var op = tok;
      if (op === 'Tf') {
        var nmEl = null, szEl = null;
        for (var q = stack.length - 1; q >= 0; q--) {
          if (!nmEl && stack[q].k === 'n') { nmEl = stack[q]; continue; }
          if (nmEl && stack[q].k === 'd') { szEl = stack[q]; break; }
        }
        curFont = nmEl ? (fonts[nmEl.v] || null) : null;
        flushStack();
      } else if (op === 'Tj') {
        var last = stack[stack.length - 1];
        if (last && last.k === 's') emit(decodeBytes(last.v, curFont));
        flushStack();
      } else if (op === 'TJ') {
        var arrEl = stack[stack.length - 1];
        if (arrEl && arrEl.k === 'a') {
          for (var a = 0; a < arrEl.v.length; a++) {
            var it = arrEl.v[a];
            if (it.k === 's') emit(decodeBytes(it.v, curFont));
            else if (it.k === 'd' && it.v < -140 && !(curFont && curFont.type0)) emit(' ');
          }
        }
        flushStack();
      } else if (op === "'" || op === '"') {
        pendingBreak = true;
        var ls = stack[stack.length - 1];
        if (ls && ls.k === 's') emit(decodeBytes(ls.v, curFont));
        flushStack();
      } else if (op === 'Td' || op === 'TD') {
        var ys = null, xs = null;
        for (var w = stack.length - 1; w >= 0; w--) {
          if (ys === null && stack[w].k === 'd') { ys = stack[w].v; continue; }
          if (ys !== null && stack[w].k === 'd') { xs = stack[w].v; break; }
        }
        if (ys !== null && Math.abs(ys) > 0.5) pendingBreak = true;
        else if (xs !== null && Math.abs(xs) > 15) emit(' ');
        flushStack();
      } else if (op === 'Tm') {
        var ym = null, xm = null;
        var ds = stack.filter(function (z) { return z.k === 'd'; });
        if (ds.length >= 6) { xm = ds[4].v; ym = ds[5].v; }
        if (ym !== null) {
          if (lastY !== null && Math.abs(ym - lastY) > 1) pendingBreak = true;
          else if (xm !== null && Math.abs(xm) > 1 && out && !/[ \n]$/.test(out)) emit(' ');
          lastY = ym;
        }
        flushStack();
      } else if (op === 'T*' || op === 'ET') {
        if (op === 'T*') pendingBreak = true;
        flushStack();
      } else if (op === 'BT') {
        lastY = null; flushStack();
      } else {
        flushStack();
      }
    }
    return out;
  }

  /* ---------- 主入口 ---------- */
  async function toText(u) {
    var s = latin1(u);
    if (!/^%PDF-/.test(s.slice(0, 1024))) throw new Error('不是 PDF 文件');
    if (/\/Encrypt\s/.test(s)) throw new Error('这个 PDF 加了密（打开要密码），读不出文字。请用阅读器另存一份不加密的再试');

    var objs = scanObjects(s);
    if (!Object.keys(objs).length) throw new Error('PDF 结构读不出来，可能文件损坏');
    await expandObjStm(u, objs, s);

    // 收集页面：优先按 /Kids 顺序，退化为顺序扫描
    var pages = [];
    var kidsRe = /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Kids\s*\[([\s\S]*?)\]/g, km;
    var order = [];
    while ((km = kidsRe.exec(s))) {
      var ids = km[1].match(/(\d+)\s+\d+\s+R/g) || [];
      ids.forEach(function (t) { order.push(+t.replace(/\s+\d+\s+R/, '')); });
    }
    var all = [];
    Object.keys(objs).forEach(function (k) {
      var d = objs[k].dict;
      if (/\/Type\s*\/Page\b(?!s)/.test(d)) all.push(+k);
    });
    all.sort(function (a, b) { return a - b; });
    var seen = {};
    order.forEach(function (n2) { if (objs[n2] && /\/Type\s*\/Page\b(?!s)/.test(objs[n2].dict) && !seen[n2]) { seen[n2] = 1; pages.push(n2); } });
    all.forEach(function (n2) { if (!seen[n2]) { seen[n2] = 1; pages.push(n2); } });

    if (!pages.length) {
      // 没有页面树：把所有看起来像内容流的都试一遍
      pages = Object.keys(objs).map(Number).filter(function (n2) {
        return objs[n2].streamStart !== undefined && /BT[\s\S]{0,4000}?T[Jj]/.test(latin1(u.subarray(objs[n2].streamStart, Math.min(objs[n2].streamEnd, objs[n2].streamStart + 4000))));
      });
    }
    if (!pages.length) throw new Error('这个 PDF 没有可提取的文字（可能是扫描件或纯图片）');

    var chunks = [], gotText = 0, failedPages = 0;
    for (var pi = 0; pi < pages.length && pi < 400; pi++) {
      var pd = objs[pages[pi]].dict;
      var fonts = {};
      try { fonts = await fontsOfPage(u, objs, pd); } catch (e) { fonts = {}; }

      var cn = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(pd);
      var cnums = [];
      if (cn) cnums = [+cn[1]];
      else {
        var ca = /\/Contents\s*\[([\s\S]{0,600}?)\]/.exec(pd);
        if (ca) {
          (ca[1].match(/(\d+)\s+\d+\s+R/g) || []).forEach(function (t) { cnums.push(+t.replace(/\s+\d+\s+R/, '')); });
        }
      }
      var buf = '';
      for (var ci = 0; ci < cnums.length; ci++) {
        var raw = await getStream(u, objs, cnums[ci]);
        if (!raw) continue;
        buf += latin1(raw) + '\n';
      }
      if (!buf) { failedPages++; continue; }
      var t = contentToText(buf, fonts);
      if (t && t.replace(/\s/g, '').length > 0) {
        gotText += t.replace(/\s/g, '').length;
        chunks.push(t);
      } else failedPages++;
    }

    var text = chunks.join('\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .trim();

    if (!text || text.replace(/\s/g, '').length < 8) {
      throw new Error('这 PDF 提不出文字。两种可能：\n① 扫描件（整页是图片）—— 需要 OCR；\n② 字体没带字符映射表 —— 文字是“画的”，也读不出来。\n判断办法：在阅读器里试着选中一段文字，选不中就是①，选得中就是②。②可以另存为 Word 或 txt 再读。');
    }
    return { text: text, pages: pages.length, failedPages: failedPages };
  }

  window.PdfReader = { toText: toText };
})();
