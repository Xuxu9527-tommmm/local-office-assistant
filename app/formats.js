/* ============================================================
 * 多格式正文提取 —— 纯前端、零依赖、不联网
 * ------------------------------------------------------------
 * 支持：
 *   文档  .docx .doc .odt .rtf .txt .md .html .htm .xml
 *   表格  .xlsx .xls .ods .csv .tsv
 *   演示  .pptx .ppt .odp
 *   版式  .pdf
 *   代码/文本 .json .log .srt .ini .yaml .sql
 *
 * 原则：只取文字与表格结构，不还原版式、不认图片、不做 OCR。
 * 所有解压走浏览器自带的 DecompressionStream，不引入任何第三方库。
 * ============================================================ */
(function () {
  'use strict';

  /* ================= ZIP ================= */
  async function zipOpen(buf) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocd = -1;
    for (var i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('文件结构损坏（不是有效的 Office 压缩包）');
    var n = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var index = {}, names = [];
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true);
      var elen = dv.getUint16(p + 30, true);
      var clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var nm = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
      index[nm] = { method: method, csize: csize, lho: lho };
      names.push(nm);
      p += 46 + nlen + elen + clen;
    }
    var cache = {};
    async function get(nm) {
      if (cache[nm] !== undefined) return cache[nm];
      var e = index[nm];
      if (!e) { cache[nm] = null; return null; }
      var lnlen = dv.getUint16(e.lho + 26, true), lelen = dv.getUint16(e.lho + 28, true);
      var start = e.lho + 30 + lnlen + lelen;
      var data = buf.subarray(start, start + e.csize);
      var out;
      if (e.method === 0) out = data;
      else {
        try {
          var ds = new DecompressionStream('deflate-raw');
          out = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
        } catch (err) { out = null; }
      }
      cache[nm] = out;
      return out;
    }
    async function text(nm) {
      var d = await get(nm);
      return d ? new TextDecoder('utf-8').decode(d) : null;
    }
    return { names: names, get: get, text: text, has: function (nm) { return !!index[nm]; } };
  }

  /* ================= 文本工具 ================= */
  function decodeXml(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 16)); })
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }
  function tidy(t) {
    return String(t)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .trim();
  }
  function colIdx(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    var n = 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  function numSort(a, b) {
    var na = +(/(\d+)/.exec(a) || [0, 0])[1], nb = +(/(\d+)/.exec(b) || [0, 0])[1];
    return na - nb;
  }

  /* ================= Word (.docx) ================= */
  function docxXmlToText(xml) {
    var out = '', n = 0;
    // 顺序扫描段落与表格边界：单元格之间用制表符，行结束换行
    xml.replace(/<w:p\b[^>]*?\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<\/w:tc>|<\/w:tr>/g,
      function (m, body) {
        if (/^<\/w:tc>/.test(m)) {
          out = out.replace(/\n+$/, '');
          if (out && !/\t$/.test(out)) out += '\t';
          return '';
        }
        if (/^<\/w:tr>/.test(m)) {
          out = out.replace(/\t+$/, '') + '\n';
          return '';
        }
        var t = '';
        (body || '').replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g,
          function (mm, txt) {
            if (txt !== undefined) t += decodeXml(txt);
            else if (/tab/.test(mm)) t += '\t';
            else t += '\n';
            return '';
          });
        if (t.trim()) { out += t + '\n'; n++; }
        return '';
      });
    return { text: tidy(out), paras: n };
  }
  async function docxText(zip) {
    var xml = await zip.text('word/document.xml');
    if (!xml) throw new Error('这个 Word 文件里没有正文（可能是空文档）');
    var r = docxXmlToText(xml);
    // 页眉页脚不算正文，但附件说明常写在页脚，顺手带上
    return r;
  }

  /* ================= Excel (.xlsx) ================= */
  async function xlsxText(zip) {
    var ss = [];
    var sxml = await zip.text('xl/sharedStrings.xml');
    if (sxml) {
      var items = sxml.split(/<si[ >]/).slice(1);
      for (var i = 0; i < items.length; i++) {
        var body = items[i].split('</si>')[0], t = '';
        body.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, function (m, x) { t += decodeXml(x); return ''; });
        ss.push(t);
      }
    }
    var sheetNames = [];
    var wb = await zip.text('xl/workbook.xml');
    if (wb) {
      var re = /<sheet\b[^>]*name="([^"]*)"/g, m;
      while ((m = re.exec(wb))) sheetNames.push(decodeXml(m[1]));
    }
    var files = zip.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(numSort);
    if (!files.length) throw new Error('这个 Excel 文件里没有工作表');
    var out = [], totalRows = 0;

    for (var fi = 0; fi < files.length && fi < 30; fi++) {
      var xml = await zip.text(files[fi]);
      if (!xml) continue;
      var label = sheetNames[fi] || ('Sheet' + (fi + 1));
      var lines = [];
      var rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, rm;
      while ((rm = rowRe.exec(xml))) {
        var cells = [];
        var body2 = rm[2] || '';
        var cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
        var pos = 0;
        while ((cm = cRe.exec(body2))) {
          var attr = cm[1] || '', inner = cm[2] || '';
          var refM = /r="([A-Z]+\d+)"/.exec(attr);
          var ci = refM ? colIdx(refM[1]) : pos;
          if (ci < 0) ci = pos;
          pos = ci + 1;
          var tM = /\st="([^"]+)"/.exec(attr);
          var type = tM ? tM[1] : '';
          var val = '';
          if (type === 's') {
            var vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
            val = vM ? (ss[+vM[1]] || '') : '';
          } else if (type === 'inlineStr') {
            var iM = /<is>([\s\S]*?)<\/is>/.exec(inner);
            if (iM) iM[1].replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, function (m2, x) { val += decodeXml(x); return ''; });
          } else {
            var vM2 = /<v>([\s\S]*?)<\/v>/.exec(inner);
            if (vM2) val = decodeXml(vM2[1]);
            if (type === 'b') val = val === '1' ? '是' : (val === '0' ? '否' : val);
          }
          cells[ci] = String(val).replace(/\s+/g, ' ').trim();
        }
        var line = [];
        for (var c2 = 0; c2 < cells.length; c2++) line.push(cells[c2] === undefined ? '' : cells[c2]);
        while (line.length && line[line.length - 1] === '') line.pop();
        if (line.join('').trim()) { lines.push(line.join('\t')); totalRows++; }
        if (totalRows > 20000) break;
      }
      if (lines.length) out.push('【工作表：' + label + '】\n' + lines.join('\n') + (totalRows > 20000 ? '\n（行数太多，只取了前 20000 行）' : ''));
    }
    if (!out.length) throw new Error('这个 Excel 里没有文字内容（可能全是图表或图片）');
    return { text: tidy(out.join('\n\n')), sheets: files.length, rows: totalRows };
  }

  /* ================= PowerPoint (.pptx) ================= */
  async function pptxText(zip) {
    var files = zip.names.filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); }).sort(numSort);
    if (!files.length) throw new Error('这个 PPT 里没有幻灯片');
    var out = [];
    for (var i = 0; i < files.length && i < 200; i++) {
      var xml = await zip.text(files[i]);
      if (!xml) continue;
      var paras = [];
      var pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g, pm;
      while ((pm = pRe.exec(xml))) {
        var t = '';
        pm[1].replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, function (m, x) { t += decodeXml(x); return ''; });
        t = t.replace(/\s+/g, ' ').trim();
        if (t) paras.push(t);
      }
      // 表格里的文字不在 a:p 里的情况兜底
      if (!paras.length) {
        var t2 = '';
        xml.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, function (m, x) { t2 += decodeXml(x) + '\n'; return ''; });
        if (t2.trim()) paras = t2.split('\n').filter(function (x) { return x.trim(); });
      }
      if (paras.length) out.push('【第 ' + (i + 1) + ' 页】\n' + paras.join('\n'));
    }
    if (!out.length) throw new Error('这个 PPT 里没有可读的文字（可能整页都是图片）');
    return { text: tidy(out.join('\n\n')), slides: out.length };
  }

  /* ================= OpenDocument (.odt/.ods/.odp) ================= */
  function odfToText(xml, kind) {
    xml = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
             .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
    var out = '', buf = '', inCell = 0, pageNo = 0;

    function flush() { out += buf; buf = ''; }
    function nl() { flush(); if (out && !/\n$/.test(out)) out += '\n'; }
    function soft() { flush(); if (out && !/[\s]$/.test(out)) out += ' '; }

    var re = /<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(xml))) {
      if (m[5] !== undefined) { if (!/^[ \t\r\n]*$/.test(m[5])) buf += decodeXml(m[5]); continue; }
      var close = m[1] === '/', tag = m[2], attrs = ' ' + (m[3] || ''), self = m[4] === '/';

      if (tag === 'text:p' || tag === 'text:h') {
        if (inCell > 0) {
          if (!close) soft();
        } else {
          if (close || self) nl();
        }
      } else if (tag === 'text:s') {
        var cM = /text:c="(\d+)"/.exec(attrs);
        buf += new Array((cM ? +cM[1] : 1) + 1).join(' ');
      } else if (tag === 'text:tab') {
        buf += '\t';
      } else if (tag === 'text:line-break') {
        buf += '\n';
      } else if (tag === 'table:table') {
        if (!close && !self) {
          var nmM = /table:name="([^"]*)"/.exec(attrs);
          nl(); out += '【表：' + (nmM ? decodeXml(nmM[1]) : '未命名') + '】\n';
        } else nl();
      } else if (tag === 'table:table-row') {
        if (close || self) nl();
      } else if (tag === 'table:table-cell' || tag === 'table:covered-table-cell') {
        if (!close && !self) inCell++;
        else {
          flush();
          if (inCell > 0) inCell--;
          if (out && !/[\n\t]$/.test(out)) out += '\t';
          var rp = /table:number-columns-repeated="(\d+)"/.exec(attrs);
          if (close && rp && +rp[1] > 1 && +rp[1] < 60) out += new Array(+rp[1]).join('\t');
        }
      } else if (tag === 'draw:page') {
        if (!close && !self) {
          nl(); pageNo++;
          out += '【第 ' + pageNo + ' 页】\n';
        } else nl();
      } else if (tag === 'draw:frame' || tag === 'draw:text-box') {
        if (close) nl();
      }
    }
    flush();
    return tidy(out);
  }
  async function odfText(zip, kind) {
    var xml = await zip.text('content.xml');
    if (!xml) throw new Error('这个 OpenDocument 文件里找不到正文（content.xml 缺失）');
    var t = odfToText(xml, kind);
    if (!t || t.replace(/\s/g, '').length < 1) throw new Error('这个文件里没有文字');
    return { text: t };
  }

  /* ================= 纯文本 / HTML / RTF ================= */
  function decodeText(u) {
    if (u.length > 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) u = u.subarray(3);
    if (u.length > 2 && u[0] === 0xff && u[1] === 0xfe) {
      try { return new TextDecoder('utf-16le').decode(u.subarray(2)); } catch (e) { }
    }
    if (u.length > 2 && u[0] === 0xfe && u[1] === 0xff) {
      try { return new TextDecoder('utf-16be').decode(u.subarray(2)); } catch (e) { }
    }
    for (var i = 0; i < 2; i++) {
      var enc = i === 0 ? 'utf-8' : 'gbk';
      try {
        var s = new TextDecoder(enc, { fatal: enc !== 'gbk' }).decode(u);
        if (s.indexOf('\ufffd') < 0) return s;
      } catch (e) { }
    }
    return new TextDecoder('utf-8').decode(u);
  }
  function htmlToText(s) {
    s = s.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t');
    s = s.replace(/<[^>]+>/g, '');
    return tidy(decodeXml(s));
  }

  /* ================= OLE2 老格式分发 ================= */
  function oleText(u) {
    var R = window.WordReader;
    if (!R || !R.cfb) throw new Error('解析模块没加载完整');
    var cfb = R.cfb(u);
    if (!cfb) throw new Error('不是有效的 Office 97-2003 文件');
    if (cfb.names.indexOf('WordDocument') >= 0) {
      return { text: R.docToText(u).text, kind: 'Word 97-2003' };
    }
    if (cfb.names.indexOf('Workbook') >= 0 || cfb.names.indexOf('Book') >= 0) {
      if (!window.OldOffice) throw new Error('老版 Excel 解析模块没加载');
      return { text: window.OldOffice.xlsToText(cfb), kind: 'Excel 97-2003' };
    }
    if (cfb.names.indexOf('PowerPoint Document') >= 0) {
      if (!window.OldOffice) throw new Error('老版 PPT 解析模块没加载');
      return { text: window.OldOffice.pptToText(cfb), kind: 'PowerPoint 97-2003' };
    }
    throw new Error('这个老版 Office 文件类型认不出来（可能是 Visio / Publisher）');
  }

  /* ================= 入口 ================= */
  async function extract(name, u) {
    if (u.length > 80 * 1024 * 1024) throw new Error('文件超过 80 MB，太大了，读起来会卡住。请把需要的那几页另存出来再试');
    var n = (name || '').toLowerCase();
    var ext = (n.match(/\.([a-z0-9]+)$/) || [0, ''])[1];

    // 1) PDF：按魔数判断（改过扩展名也认）
    if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) {
      var pr = await window.PdfReader.toText(u);
      return { text: pr.text, kind: 'PDF', meta: '共 ' + pr.pages + ' 页' + (pr.failedPages ? '，' + pr.failedPages + ' 页无文字' : '') };
    }
    // 2) ZIP 系：OOXML / ODF / EPUB
    if (u[0] === 0x50 && u[1] === 0x4b) {
      var zip = await zipOpen(u);
      if (zip.has('word/document.xml')) {
        var d = await docxText(zip);
        return { text: d.text, kind: 'Word', meta: d.paras + ' 段' };
      }
      if (zip.has('xl/workbook.xml')) {
        var x = await xlsxText(zip);
        return { text: x.text, kind: 'Excel', meta: x.rows + ' 行' };
      }
      if (zip.has('ppt/presentation.xml')) {
        var p2 = await pptxText(zip);
        return { text: p2.text, kind: 'PowerPoint', meta: p2.slides + ' 页' };
      }
      if (zip.has('content.xml')) {
        var o = await odfText(zip);
        var sub = { odt: 'ODT', ods: 'ODS', odp: 'ODP', fodt: 'ODT', fods: 'ODS', fodp: 'ODP' }[ext] || 'OpenDocument';
        return { text: o.text, kind: sub };
      }
      if (ext === 'epub') throw new Error('电子书（epub）暂不支持，请先转成 PDF 或 txt');
      throw new Error('这个压缩包不是可识别的办公文档');
    }
    // 3) OLE2：.doc .xls .ppt
    if (u[0] === 0xd0 && u[1] === 0xcf && u[2] === 0x11 && u[3] === 0xe0) {
      var ole = oleText(u);
      return { text: tidy(ole.text), kind: ole.kind };
    }
    // 4) RTF
    if (ext === 'rtf' || (u[0] === 0x7b && u[1] === 0x5c && u[2] === 0x72 && u[3] === 0x74)) {
      return { text: tidy(window.WordReader.rtfToText(u)), kind: 'RTF' };
    }
    // 5) HTML
    if (ext === 'html' || ext === 'htm' || ext === 'mht') {
      return { text: htmlToText(decodeText(u)), kind: 'HTML' };
    }
    // 6) 纯文本兜底（txt/md/csv/tsv/json/xml/log/srt/yaml/sql/ini…）
    var t = decodeText(u);
    if (/[\u0000-\u0008]/.test(t.slice(0, 4000))) {
      throw new Error('这个文件读不出文字，多半是图片或扫描件。需要先 OCR 或另存为文字版');
    }
    var kindMap = { csv: 'CSV', tsv: 'TSV', md: 'Markdown', markdown: 'Markdown', json: 'JSON', xml: 'XML', srt: '字幕', log: '日志' };
    return { text: t, kind: kindMap[ext] || '文本' };
  }

  window.Formats = {
    extract: extract,
    decodeText: decodeText,
    accept: '.txt,.md,.markdown,.csv,.tsv,.json,.xml,.log,.srt,.rtf,.html,.htm,.doc,.docx,.docm,' +
      '.xls,.xlsx,.xlsm,.ppt,.pptx,.pptm,.odt,.ods,.odp,.pdf'
  };
})();
