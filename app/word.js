/* 文档正文提取：.docx / .doc（Word 97-2003）/ RTF / 伪 .doc —— 纯前端，无第三方库 */
(function(){
function u16(u, p) { return u[p] | (u[p + 1] << 8); }
function u32(u, p) { return (u[p] | (u[p + 1] << 8) | (u[p + 2] << 16) | (u[p + 3] << 24)) >>> 0; }
function utf8(u) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u);
  var s = '', i = 0;
  while (i < u.length) {
    var c = u[i++];
    if (c < 128) s += String.fromCharCode(c);
    else if (c < 224) { s += String.fromCharCode(((c & 31) << 6) | (u[i++] & 63)); }
    else if (c < 240) { s += String.fromCharCode(((c & 15) << 12) | ((u[i++] & 63) << 6) | (u[i++] & 63)); }
    else { var cp = ((c & 7) << 18) | ((u[i++] & 63) << 12) | ((u[i++] & 63) << 6) | (u[i++] & 63); cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); }
  }
  return s;
}
/* ============ .doc（Word 97-2003 / OLE2 复合文档）纯 JS 正文抽取 ============
 * 只取正文文字供合规校正，不还原字体、表格、图片、版式。
 * 主路径：[MS-CFB] 解析复合文档 → WordDocument 流 → FIB → 0Table/1Table 流
 *         → CLX 里的 PlcPcd 分片表 → 逐片按 UTF-16LE / ANSI 解码。
 * 兜底：扩展名标错的 .docx / RTF / HTML、结构损坏时的连续文本扫描。
 * 依据：[MS-DOC] 2.4.1 Retrieving Text（压缩分片偏移为 fc/2，每字符 1 字节）。
 * 全部为本地字节运算，不联网、不依赖任何外部库。
 */
function catBytes(list) {
  var n = 0, i;
  for (i = 0; i < list.length; i++) n += list[i].length;
  var out = new Uint8Array(n), p = 0;
  for (i = 0; i < list.length; i++) { out.set(list[i], p); p += list[i].length; }
  return out;
}
function parseCFB(u) {
  var FREE = 0xffffffff, EOC = 0xfffffffe, i, j;
  if (u.length < 512 || u[0] !== 0xd0 || u[1] !== 0xcf || u[2] !== 0x11 || u[3] !== 0xe0 ||
      u[4] !== 0xa1 || u[5] !== 0xb1 || u[6] !== 0x1a || u[7] !== 0xe1) return null;
  var ssz = 1 << u16(u, 0x1e);
  if (ssz !== 512 && ssz !== 4096) return null;
  var mssz = 1 << u16(u, 0x20);
  var nFat = u32(u, 0x2c), dirStart = u32(u, 0x30), cutoff = u32(u, 0x38) || 4096;
  var miniFatStart = u32(u, 0x3c), nMiniFat = u32(u, 0x40), difatStart = u32(u, 0x44);
  // DIFAT：头部 109 项 + 链式 DIFAT 扇区
  var fatIds = [];
  for (i = 0; i < 109 && fatIds.length < nFat; i++) {
    var v = u32(u, 0x4c + i * 4);
    if (v < EOC) fatIds.push(v);
  }
  var ds = difatStart, dg = 0;
  while (ds < EOC && fatIds.length < nFat && dg++ < 4096) {
    var dOff = (ds + 1) * ssz;
    if (dOff + ssz > u.length) break;
    var dsec = u.subarray(dOff, dOff + ssz);
    for (j = 0; j < ssz / 4 - 1 && fatIds.length < nFat; j++) {
      var q = u32(dsec, j * 4); if (q < EOC) fatIds.push(q);
    }
    ds = u32(dsec, ssz - 4);
  }
  // FAT 表
  var fat = [];
  for (i = 0; i < fatIds.length; i++) {
    var fOff = (fatIds[i] + 1) * ssz;
    if (fOff + ssz > u.length) continue;
    var fs = u.subarray(fOff, fOff + ssz);
    for (j = 0; j < ssz / 4; j++) fat.push(u32(fs, j * 4));
  }
  if (!fat.length) return null;
  function chain(start, maxSectors) {
    var parts = [], cur = start, g = 0, lim = maxSectors || 100000;
    while (cur < EOC && g++ < lim) {
      var o = (cur + 1) * ssz;
      if (o + ssz > u.length) break;
      parts.push(u.subarray(o, o + ssz));
      var nx = fat[cur];
      if (nx === undefined || nx >= EOC || nx === cur) break;
      cur = nx;
    }
    return catBytes(parts);
  }
  // 目录项：128 字节一项，取名称、类型、起始扇区、大小
  var dirBytes = chain(dirStart), entries = {}, rootName = '';
  for (var p = 0; p + 128 <= dirBytes.length; p += 128) {
    var d = dirBytes.subarray(p, p + 128), type = d[0x42];
    if (type !== 2 && type !== 5) continue;
    var nlen = u16(d, 0x40), nm = '';
    for (var k = 0; k + 1 < Math.min(nlen, 64); k += 2) {
      var cu = u16(d, k); if (cu) nm += String.fromCharCode(cu);
    }
    nm = nm.replace(/\x00+$/, '');
    if (!nm) continue;
    if (type === 5) rootName = nm;
    entries[nm] = { start: u32(d, 0x74), size: u32(d, 0x78) };
  }
  // 小流（<4096 字节）走 MiniFAT + 根条目指向的迷你流
  var miniFat = [];
  if (miniFatStart < EOC && nMiniFat) {
    var mf = chain(miniFatStart, nMiniFat + 2);
    for (var m = 0; m + 4 <= mf.length; m += 4) miniFat.push(u32(mf, m));
  }
  var root = entries[rootName];
  var miniStream = (root && root.start < EOC && root.size)
    ? chain(root.start, Math.ceil(root.size / ssz) + 2) : new Uint8Array(0);
  function read(name) {
    var e = entries[name];
    if (!e || !e.size) return null;
    var need = Math.min(e.size, 64 * 1024 * 1024), data;
    if (e.size < cutoff && miniStream.length) {
      var parts = [], cur = e.start, g2 = 0;
      while (cur < EOC && g2++ < 200000) {
        var mo = cur * mssz;
        if (mo + mssz > miniStream.length) break;
        parts.push(miniStream.subarray(mo, mo + mssz));
        var nx2 = miniFat[cur];
        if (nx2 === undefined || nx2 >= EOC || nx2 === cur) break;
        cur = nx2;
      }
      data = catBytes(parts);
    } else {
      data = chain(e.start, Math.ceil(need / ssz) + 2);
    }
    return data.subarray(0, Math.min(need, data.length));
  }
  return { read: read, names: Object.keys(entries) };
}
function decodeUtf16le(b) {
  if (typeof TextDecoder !== 'undefined') {
    try { return new TextDecoder('utf-16le').decode(b); } catch (e) { }
  }
  var s = '';
  for (var i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
  return s;
}
var CP1252_HIGH = {
  0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160',
  0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019',
  0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a', 0x9c: '\u0153',
  0x9e: '\u017e', 0x9f: '\u0178'
};
function decodeAnsi(b) {
  var i, ascii = true;
  for (i = 0; i < b.length; i++) if (b[i] > 0x7f) { ascii = false; break; }
  if (ascii) {
    var s = '';
    for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  if (typeof TextDecoder !== 'undefined') {
    try { var g = new TextDecoder('gbk').decode(b); if (g.length && g.indexOf('\ufffd') < 0) return g; } catch (e) { }
    try { return new TextDecoder('windows-1252').decode(b); } catch (e) { }
  }
  var out = '';
  for (i = 0; i < b.length; i++) out += CP1252_HIGH[b[i]] || String.fromCharCode(b[i]);
  return out;
}
/* Word 正文里的控制字符：段落/单元格/软换行/分页归并为换行，域指令与图片占位丢掉 */
function cleanDocText(s) {
  var out = '', inField = false, i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c === 0x13) { inField = true; continue; }
    if (c === 0x14) { inField = false; continue; }
    if (c === 0x15 || inField) continue;
    if (c === 0x0d || c === 0x07 || c === 0x0b || c === 0x0c) { out += '\n'; continue; }
    if (c === 0x09) { out += '\t'; continue; }
    if (c < 0x20 && c !== 0x0a) continue;
    out += s.charAt(i);
  }
  return out.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '').replace(/[ \t\n]+$/, '');
}
/* 有些「.doc」其实是 RTF 或 Word 另存的 HTML，这里做文字级兜底 */
function rtfToText(u) {
  var lim = Math.min(u.length, 8 * 1024 * 1024), src = '', z;
  for (z = 0; z < lim; z++) src += String.fromCharCode(u[z]);
  var out = '', ansi = [], skipDepth = -1, depth = 0, i = 0;
  var SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|footnote|annot|listtable|listoverridetable|generator|xmlnstbl|filetbl|revtbl|rsidtbl|themedata|colorschememapping|latentstyles|datastore|mmathPr|fldinst|shppict|nonshppict)$/;
  function flush() { if (ansi.length) { out += decodeAnsi(Uint8Array.from(ansi)); ansi.length = 0; } }
  while (i < src.length) {
    var ch = src.charAt(i);
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { flush(); depth--; if (skipDepth >= 0 && depth < skipDepth) skipDepth = -1; i++; continue; }
    if (ch === '\\') {
      var nx = src.charAt(i + 1);
      if (nx === "'") { if (skipDepth < 0) ansi.push(parseInt(src.substr(i + 2, 2), 16) || 0); i += 4; continue; }
      if (nx === '*') { i += 2; continue; }
      var m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i));
      if (m) {
        var w = m[1], num = m[2] === undefined ? null : parseInt(m[2], 10), adv = m[0].length;
        if (skipDepth < 0) {
          if (w === 'u' && num !== null) {
            flush(); out += String.fromCharCode(num < 0 ? num + 65536 : num);
            if (src.charAt(i + adv) === '?') adv++;
          } else if (/^(par|line|row|cell|page|sect)$/.test(w)) { flush(); out += '\n'; }
          else if (w === 'tab') { flush(); out += '\t'; }
          else if (SKIP.test(w)) skipDepth = depth;
        }
        i += adv; continue;
      }
      if (nx === '\\' || nx === '{' || nx === '}') { if (skipDepth < 0) { flush(); out += nx; } i += 2; continue; }
      i += 2; continue;
    }
    if (ch === '\r' || ch === '\n') { i++; continue; }
    if (skipDepth < 0) {
      // 非 ASCII 字节按文档 ANSI（中文多为 GBK）累积解码，避免把双字节汉字拆成乱码
      if (ch.charCodeAt(0) >= 0x80) ansi.push(ch.charCodeAt(0) & 0xff);
      else { flush(); out += ch; }
    }
    i++;
  }
  flush();
  return cleanDocText(out);
}
function htmlToText(u) {
  var s = '';
  try { s = new TextDecoder('utf-8').decode(u); } catch (e) { s = utf8(u); }
  if (s.indexOf('\ufffd') >= 0 && typeof TextDecoder !== 'undefined') {
    try { var g = new TextDecoder('gbk').decode(u); if (g.indexOf('\ufffd') < 0) s = g; } catch (e) { }
  }
  s = s.replace(/<(script|style|head|xml)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+/g, ' ');
  return cleanDocText(decodeXml(s));
}
/* 结构损坏 / 更老的 Word 6/95：扫描连续可打印的 UTF-16LE 片段，尽力而为 */
function scanDocText(u) {
  function good(c) {
    return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ||
      (c >= 0x2000 && c <= 0x206f) || (c >= 0x3000 && c <= 0x303f) ||
      (c >= 0x3400 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) ||
      c === 0x0d || c === 0x09;
  }
  function score(s) { return (s.match(/[\u3400-\u9fff]/g) || []).length + s.length * 0.05; }
  function from(start) {
    var runs = [], run = '', i, c;
    for (i = start; i + 1 < u.length; i += 2) {
      c = u[i] | (u[i + 1] << 8);
      if (good(c)) run += String.fromCharCode(c);
      else { if (run.length >= 16) runs.push(run); run = ''; }
    }
    if (run.length >= 16) runs.push(run);
    return cleanDocText(runs.join('\n'));
  }
  var a = from(0), b = from(1);
  return score(a) >= score(b) ? a : b;
}
function approxDoc(text) {
  return { text: text, meta: { hasDocx: false, docFormat: 'doc', approx: true }, entries: 0 };
}
function docToText(u) {
  // 扩展名被标错：其实是 .docx（ZIP）、RTF、HTML
  if (u.length > 4 && u[0] === 0x50 && u[1] === 0x4b) return docxToText(u);
  if (u.length > 5 && u[0] === 0x7b && u[1] === 0x5c && u[2] === 0x72 && u[3] === 0x74 && u[4] === 0x66) {
    return { text: rtfToText(u), meta: { hasDocx: false, docFormat: 'rtf' }, entries: 0 };
  }
  if (u[0] === 0x3c) {
    return { text: htmlToText(u), meta: { hasDocx: false, docFormat: 'html' }, entries: 0 };
  }
  var cfb = parseCFB(u), ap;
  if (!cfb) {
    ap = scanDocText(u);
    if (ap.length >= 20) return approxDoc(ap);
    throw new Error('不是有效的 Word 97-2003（.doc）文件；若为加密文档、WPS 专有格式或扫描件，请另存为 .docx / .txt 再导入');
  }
  var w = cfb.read('WordDocument');
  if (!w || w.length < 154 || u16(w, 0) !== 0xa5ec) {
    ap = scanDocText(u);
    if (ap.length >= 20) return approxDoc(ap);
    throw new Error('.doc 里没找到可读的正文流，请另存为 .docx / .txt 再导入');
  }
  var flags = u16(w, 10);
  if (flags & 0x0100) throw new Error('这份 .doc 设了打开密码，请先去掉密码并另存为 .docx 或 .txt');
  var tbl = (flags & 0x0200) ? '1Table' : '0Table';
  var t = cfb.read(tbl) || cfb.read((flags & 0x0200) ? '0Table' : '1Table');
  var csw = u16(w, 32), p = 34 + csw * 2;
  var cslw = u16(w, p), p2 = p + 2 + cslw * 4, rg = p2 + 2;
  if (!t || rg + 272 > w.length) {
    ap = scanDocText(u);
    if (ap.length >= 20) return approxDoc(ap);
    throw new Error('.doc 的分片表读取失败，请另存为 .docx / .txt 再导入');
  }
  // FibRgFcLcb97 里 fcClx / lcbClx 固定在第 66 / 67 个 DWORD（后续版本向后兼容）
  var fcClx = u32(w, rg + 66 * 4), lcbClx = u32(w, rg + 67 * 4);
  var clx = t.subarray(fcClx, Math.min(t.length, fcClx + lcbClx)), q = 0;
  while (q < clx.length && clx[q] === 0x01) q += 3 + u16(clx, q + 1);   // 跳过 Prc
  if (q >= clx.length || clx[q] !== 0x02) {
    ap = scanDocText(u);
    if (ap.length >= 20) return approxDoc(ap);
    throw new Error('.doc 分片表格式异常，请另存为 .docx / .txt 再导入');
  }
  var lcbPlc = u32(clx, q + 1);
  var plc = clx.subarray(q + 5, Math.min(clx.length, q + 5 + lcbPlc));
  var n = Math.floor((lcbPlc - 4) / 12), k, cps = [];
  if (n < 1 || n > 200000) {
    ap = scanDocText(u);
    if (ap.length >= 20) return approxDoc(ap);
    throw new Error('.doc 分片表长度异常，请另存为 .docx / .txt 再导入');
  }
  for (k = 0; k <= n; k++) cps.push(u32(plc, k * 4));
  var chunks = [], pcdOff = (n + 1) * 4;
  for (k = 0; k < n; k++) {
    var fc = u32(plc, pcdOff + k * 8 + 2);
    var comp = !!(fc & 0x40000000), v = fc & 0x3fffffff;
    var off = comp ? Math.floor(v / 2) : v;      // 压缩分片：实际偏移 = fc / 2
    var len = cps[k + 1] - cps[k];
    if (len <= 0 || off >= w.length) continue;
    var bytes = comp ? len : len * 2;
    if (off + bytes > w.length) bytes = w.length - off;
    var raw = w.subarray(off, off + bytes);
    chunks.push(comp ? decodeAnsi(raw) : decodeUtf16le(raw));
  }
  var text = cleanDocText(chunks.join(''));
  if (!text) {
    ap = scanDocText(u);
    if (ap.length >= 20) return approxDoc(ap);
    throw new Error('.doc 正文为空或无法解码，请另存为 .docx / .txt 再导入');
  }
  return { text: text, meta: { hasDocx: false, docFormat: 'doc', pieces: n }, entries: n };
}
window.WordReader = {
  /* .doc（Word 97-2003）与 RTF：供多格式模块调用 */
  docToText: docToText, rtfToText: rtfToText,
  /* 复用件：OLE2 复合文档读取器 / 编码解码 */
  cfb: parseCFB, ansi: decodeAnsi, utf16: decodeUtf16le
};
})();
