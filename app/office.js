/* 本地办公助手 · 文件导出
   纯前端生成 .docx / .xlsx / .pptx / .md，不联网、不依赖任何库。
   原理：Office 文件本质是 ZIP 包，这里用「存储模式（不压缩）」写 ZIP，
   Word / Excel / PowerPoint 都能正常打开。 */
(function () {
  'use strict';

  /* ================= CRC32 + ZIP ================= */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function zip(files) {
    var parts = [], central = [], offset = 0, i;
    var enc = utf8;
    for (i = 0; i < files.length; i++) {
      var name = enc(files[i].name);
      var data = files[i].data;
      var crc = crc32(data);
      var lh = new Uint8Array(30 + name.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);          // version needed
      dv.setUint16(6, 0x0800, true);      // UTF-8 flag
      dv.setUint16(8, 0, true);           // store
      dv.setUint16(10, 0, true);          // time
      dv.setUint16(12, 0x21, true);       // date 1980-01-01
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true);
      lh.set(name, 30);
      parts.push(lh, data);

      var ch = new Uint8Array(46 + name.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    }

    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, csize, true);
    ev.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), { type: 'application/octet-stream' });
  }

  /* ================= 文本工具 ================= */
  function xesc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  /* 去掉 markdown 行内标记，保留文字 */
  function plain(s) {
    return String(s)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\\([\\`*_{}\[\]()#+.!|-])/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim();
  }

  function cells(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return plain(c); });
  }
  function isDivider(line) {
    return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.indexOf('-') >= 0;
  }

  /* Markdown → 结构块 */
  function parse(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { i++; continue; }

      /* 代码块 */
      if (/^\s*```/.test(l)) {
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push({ t: 'code', text: buf.join('\n') });
        continue;
      }

      /* 表格 */
      if (/^\s*\|/.test(l) && i + 1 < lines.length && isDivider(lines[i + 1])) {
        var head = cells(l), rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push({ t: 'table', head: head, rows: rows });
        continue;
      }

      var m;
      if ((m = l.match(/^\s{0,3}#{1,6}\s+(.*)$/))) { out.push({ t: 'h', lv: Math.min(3, m[1] ? l.match(/#/g).length : 1), text: plain(m[1]) }); i++; continue; }
      if ((m = l.match(/^\s*>\s?(.*)$/))) { out.push({ t: 'quote', text: plain(m[1]) }); i++; continue; }
      if ((m = l.match(/^\s*[-*+]\s+(.*)$/))) { out.push({ t: 'li', text: plain(m[1]) }); i++; continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { out.push({ t: 'oli', text: plain(m[1]) }); i++; continue; }

      /* 普通段落：连续的普通行合并 */
      var para = [plain(l)];
      i++;
      while (i < lines.length && lines[i].trim()
             && !/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```)/.test(lines[i])
             && !/[。！？；：…)）"」』]$/.test(para[para.length - 1])
             && !isDateLine(para[para.length - 1]) && !isSignLine(para[para.length - 1])
             && !isDateLine(lines[i]) && !isSignLine(lines[i])
             /* 「一、xx」「（一）xx」单独成段，别和后面的正文黏在一起 */
             && !cnHeading(lines[i])
             && !(para.length === 1 && cnHeading(para[0]))
             /* 标题后面紧跟「各科室：」时，标题要单独成段 */
             && !isAddressee(lines[i])
             && !(para.length === 1 && isDocTitle(para[0]))) {
        para.push(plain(lines[i]));
        i++;
      }
      out.push({ t: 'p', text: para.join('') });
    }
    return out;
  }

  /* 取第一个（或最大的）表格 */
  function biggestTable(blocks) {
    var best = null;
    blocks.forEach(function (b) {
      if (b.t !== 'table') return;
      if (!best || b.rows.length > best.rows.length) best = b;
    });
    return best;
  }

  /* 从文本里找所有表格，合并成一张（表头相同才合并） */
  function allTables(text) {
    var bs = parse(text);
    var t = biggestTable(bs);
    return t;
  }

  /* ================= DOCX ================= */
  var DOC_CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '</Types>';

  /* ---- 公文页码：GB/T 9704 规定用 4 号宋体阿拉伯数字，数字左右各一条一字线，
          单页码居右空一字、双页码居左空一字 ---- */
  function footerXml(odd) {
    var pr = '<w:pPr><w:jc w:val="' + (odd ? 'right' : 'left') + '"/>' +
      (odd ? '<w:ind w:right="160"/>' : '<w:ind w:left="160"/>') + '</w:pPr>';
    var rpr = '<w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:p>' + pr +
      '<w:r>' + rpr + '<w:t xml:space="preserve">— </w:t></w:r>' +
      '<w:fldSimple w:instr=" PAGE "><w:r>' + rpr + '<w:t>1</w:t></w:r></w:fldSimple>' +
      '<w:r>' + rpr + '<w:t xml:space="preserve"> —</w:t></w:r>' +
      '</w:p></w:ftr>';
  }
  var DOC_SETTINGS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:evenAndOddHeaders/><w:compat/></w:settings>';

  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  function docProps(title) {
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return {
      core: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + xesc(title || '') + '</dc:title><dc:creator>本地办公助手</dc:creator>' +
        '<cp:lastModifiedBy>本地办公助手</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
        '</cp:coreProperties>',
      app: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>本地办公助手</Application></Properties>'
    };
  }

  var DOC_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="仿宋_GB2312" w:cs="Times New Roman"/>' +
    '<w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>' +
    '</w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:line="560" w:lineRule="exact"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    '<w:pPr><w:ind w:firstLineChars="200" w:firstLine="640"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/><w:spacing w:before="240" w:after="240" w:line="560" w:lineRule="exact"/></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="方正小标宋简体" w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="44"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:firstLineChars="200" w:firstLine="640"/><w:spacing w:before="120" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="黑体"/><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:firstLineChars="200" w:firstLine="640"/><w:spacing w:before="80" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="楷体_GB2312"/><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="60" w:after="30"/><w:outlineLvl w:val="2"/></w:pPr>' +
    '<w:rPr><w:rFonts w:eastAsia="仿宋_GB2312"/><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="640" w:firstLine="0" w:firstLineChars="0"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="640" w:firstLine="0" w:firstLineChars="0"/></w:pPr>' +
    '<w:rPr><w:color w:val="555555"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="480" w:firstLine="0" w:firstLineChars="0"/><w:shd w:val="clear" w:fill="F1EDE4"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/><w:sz w:val="22"/></w:rPr></w:style>' +
    '</w:styles>';

  /* 中文层级序号 → 标题级别；不是层级标题返回 0 */
  function cnHeading(t) {
    var s = String(t || '').trim();
    /* 带逗号分号的是一句话，不是小标题 */
    if (/[，；。]/.test(s)) return 0;
    if (/^[一二三四五六七八九十]{1,3}、/.test(s) && s.length <= 40) return 1;
    if (/^（[一二三四五六七八九十]{1,3}）/.test(s) && s.length <= 40) return 2;
    if (/^\d{1,2}[.、]\s*\S/.test(s) && s.length <= 40) return 3;
    if (/^（\d{1,2}）\S/.test(s) && s.length <= 40) return 3;
    return 0;
  }

  /* 公文标题：以「关于」开头，或以文种收尾，不带句号 */
  function isDocTitle(t) {
    var s = String(t || '').trim();
    if (s.length < 6 || s.length > 44) return false;
    if (/[，。；：！？]$/.test(s)) return false;
    if (/^[一二三四五六七八九十]{1,3}、|^（[一二三四五六七八九十]{1,3}）/.test(s)) return false;
    return /^关于/.test(s) || /(通知|通报|报告|请示|批复|函|纪要|方案|意见|决定|办法|规定|总结|讲话|说明)$/.test(s);
  }

  /* 主送机关：短、以冒号结尾 */
  function isAddressee(t) {
    var s = String(t || '').trim();
    return s.length <= 30 && /[：:]$/.test(s) && !/^[一二三四五六七八九十]{1,3}、/.test(s);
  }

  /* 落款行：短、无标点、以机关后缀结尾 */
  function isSignLine(t) {
    var s = String(t || '').trim();
    if (/^[×xX＊*]{2,12}$/.test(s)) return true;
    if (s.length < 3 || s.length > 24) return false;
    if (/[，。；：、！？,;:!?]/.test(s)) return false;
    return /(局|委|办|办公室|公司|中心|部|厅|院|校|处|科|会|站|所|集团|政府)$/.test(s);
  }

  function isDateLine(t) {
    var s = String(t || '').trim();
    return /^[×xX＊*\d\s]{2,6}年[×xX＊*\d\s]{1,4}月[×xX＊*\d\s]{1,4}日$/.test(s);
  }

  function wRun(text, bold) {
    return '<w:r>' + (bold ? '<w:rPr><w:b/></w:rPr>' : '') +
      '<w:t xml:space="preserve">' + xesc(text) + '</w:t></w:r>';
  }

  function wP(text, style, opts) {
    opts = opts || {};
    var ppr = '<w:pPr>';
    if (style) ppr += '<w:pStyle w:val="' + style + '"/>';
    if (opts.center) ppr += '<w:jc w:val="center"/>';
    if (opts.right) {
      ppr += '<w:jc w:val="right"/>';
      /* 公文落款：成文日期右空四字（三号字每字 320 twips，4 字 = 1280） */
      ppr += '<w:ind w:firstLine="0" w:firstLineChars="0"' + (opts.rightInd ? ' w:right="' + opts.rightInd + '"' : '') + '/>';
    }
    if (opts.noIndent && !opts.right) ppr += '<w:ind w:firstLine="0" w:firstLineChars="0"/>';
    ppr += '</w:pPr>';
    return '<w:p>' + ppr + (text ? wRun(text) : '') + '</w:p>';
  }

  function wTable(head, rows, pageWidthTwips) {
    var cols = Math.max(head.length, rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0));
    var cw = Math.floor((pageWidthTwips || 8000) / cols);
    var grid = '<w:tblGrid>' + new Array(cols + 1).join('<w:gridCol w:w="' + cw + '"/>') + '</w:tblGrid>';
    var borders = '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) {
        return '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>';
      }).join('') + '</w:tblBorders>';
    var pr = '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + borders +
      '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>';

    function row(cellsArr, header) {
      var t = '<w:tr>';
      for (var i = 0; i < cols; i++) {
        var v = cellsArr[i] == null ? '' : cellsArr[i];
        t += '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/>' +
          (header ? '<w:shd w:val="clear" w:fill="F1EDE4"/>' : '') + '</w:tcPr>' +
          '<w:p><w:pPr><w:ind w:firstLine="0" w:firstLineChars="0"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>' +
          wRun(v, header) + '</w:p></w:tc>';
      }
      return t + '</w:tr>';
    }
    var body = row(head, true) + rows.map(function (r) { return row(r, false); }).join('');
    return '<w:tbl>' + pr + grid + body + '</w:tbl>';
  }

  function toDocx(text, opts) {
    opts = opts || {};
    var bs = parse(text);
    var body = '';
    if (opts.title) body += wP(opts.title, 'Title');

    bs.forEach(function (b, idx) {
      if (b.t === 'h') {
        if (b.lv === 1 && idx === 0 && !opts.title) body += wP(b.text, 'Title');
        else body += wP(b.text, 'Heading' + b.lv);
      } else if (b.t === 'p' && idx === 0 && isDocTitle(b.text) && !opts.title) {
        body += wP(b.text, 'Title');
      } else if (b.t === 'p') {
        /* 公文式层级：一、 （一） 1. （1） 自动套标题样式 */
        var lv = cnHeading(b.text);
        if (lv === 1) body += wP(b.text, 'Heading1');
        else if (lv === 2) body += wP(b.text, 'Heading2');
        else if (lv === 3) body += wP(b.text, 'Heading3', { noIndent: true });
        else if ((isDateLine(b.text) || isSignLine(b.text)) && idx >= bs.length - 4) body += wP(b.text, 'Normal', { right: true, rightInd: 1280 });
        else if (isAddressee(b.text) && idx <= 2) body += wP(b.text, 'Normal', { noIndent: true });
        else body += wP(b.text, 'Normal');
      } else if (b.t === 'li') {
        body += wP('· ' + b.text, 'ListBullet');
      } else if (b.t === 'oli') {
        body += wP(b.text, 'ListBullet');
      } else if (b.t === 'quote') {
        body += wP(b.text, 'Quote');
      } else if (b.t === 'code') {
        b.text.split('\n').forEach(function (ln) { body += wP(ln, 'Code'); });
      } else if (b.t === 'table') {
        body += wTable(b.head, b.rows, 8000);
        body += wP('', 'Normal', { noIndent: true });
      }
    });

    /* 公文模式：加页码（奇偶分侧），并挂上 settings 让奇偶页生效 */
    var gw = !!opts.gongwen;
    var sect = '<w:sectPr>' +
      (gw ? '<w:footerReference w:type="default" r:id="rId2"/><w:footerReference w:type="even" r:id="rId3"/>' : '') +
      '<w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="2098" w:right="1474" w:bottom="1985" w:left="1588" w:header="851" w:footer="992" w:gutter="0"/>' +
      '<w:docGrid w:linePitch="312"/></w:sectPr>';

    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' + body + sect + '</w:body></w:document>';

    var props = docProps(opts.title || '文稿');
    var files = [
      { name: '[Content_Types].xml', data: utf8(DOC_CT) },
      { name: '_rels/.rels', data: utf8(RELS) },
      { name: 'word/document.xml', data: utf8(doc) },
      { name: 'word/styles.xml', data: utf8(DOC_STYLES) },
      { name: 'word/_rels/document.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        (gw ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
              '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>' : '') +
        '</Relationships>') },
      { name: 'docProps/core.xml', data: utf8(props.core) },
      { name: 'docProps/app.xml', data: utf8(props.app) }
    ];
    if (gw) {
      files.push({ name: 'word/footer1.xml', data: utf8(footerXml(true)) });
      files.push({ name: 'word/footer2.xml', data: utf8(footerXml(false)) });
      files.push({ name: 'word/settings.xml', data: utf8(DOC_SETTINGS) });
    }
    return zip(files);
  }

  /* ================= XLSX ================= */
  function colName(i) {
    var s = '';
    i = i + 1;
    while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function xlsx(text, opts) {
    opts = opts || {};
    var t = opts.table || allTables(text);
    if (!t) throw new Error('这段内容里没有找到表格（需要 Markdown 表格，第一行表头、第二行分隔线）');
    var rows = [t.head].concat(t.rows);
    var cols = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 1);
    var widths = [];
    for (var c = 0; c < cols; c++) {
      var w = 8;
      rows.forEach(function (r) {
        var v = r[c] == null ? '' : String(r[c]);
        var n = 0;
        for (var i = 0; i < v.length; i++) n += v.charCodeAt(i) > 255 ? 2 : 1;
        if (n > w) w = n;
      });
      widths.push(Math.min(60, w + 2));
    }

    var sheetRows = rows.map(function (r, ri) {
      var cellsXml = '';
      for (var ci = 0; ci < cols; ci++) {
        var v = r[ci] == null ? '' : String(r[ci]);
        if (v === '') continue;
        var ref = colName(ci) + (ri + 1);
        var num = /^-?\d+(\.\d+)?$/.test(v) && v.length < 16;
        cellsXml += '<c r="' + ref + '"' + (ri === 0 ? ' s="1"' : '') + (num ? '' : ' t="inlineStr"') + '>' +
          (num ? '<v>' + v + '</v>' : '<is><t xml:space="preserve">' + xesc(v) + '</t></is>') + '</c>';
      }
      return '<row r="' + (ri + 1) + '"' + (ri === 0 ? ' ht="22" customHeight="1"' : '') + '>' + cellsXml + '</row>';
    }).join('');

    var colsXml = '<cols>' + widths.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('') + '</cols>';

    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + colName(cols - 1) + rows.length + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      colsXml +
      '<sheetData>' + sheetRows + '</sheetData>' +
      '<autoFilter ref="A1:' + colName(cols - 1) + rows.length + '"/>' +
      '</worksheet>';

    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="宋体"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF17324D"/><name val="宋体"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF1EDE4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border/><border><left style="thin"><color rgb="FFD0C9BB"/></left>' +
      '<right style="thin"><color rgb="FFD0C9BB"/></right><top style="thin"><color rgb="FFD0C9BB"/></top>' +
      '<bottom style="thin"><color rgb="FFD0C9BB"/></bottom></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + xesc((opts.sheetName || '表格').slice(0, 28)) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>';

    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    var wbrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var p = docProps(opts.title || '表格');
    return zip([
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(RELS.replace('word/document.xml', 'xl/workbook.xml')) },
      { name: 'xl/workbook.xml', data: utf8(wb) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(wbrels) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheet) },
      { name: 'xl/styles.xml', data: utf8(styles) },
      { name: 'docProps/core.xml', data: utf8(p.core) },
      { name: 'docProps/app.xml', data: utf8(p.app) }
    ]);
  }

  /* ================= 下载 ================= */
  function save(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ================= PPTX ================= */
  var EMU = 914400;           // 1 英寸
  var SLIDE_W = 12192000, SLIDE_H = 6858000;   // 16:9
  var FONT = '微软雅黑';

  function e(v) { return Math.round(v); }

  function aRun(text, o) {
    o = o || {};
    var rpr = '<a:rPr lang="zh-CN" altLang="en-US" sz="' + (o.sz || 1800) + '"' +
      (o.b ? ' b="1"' : '') + ' dirty="0">' +
      '<a:solidFill><a:srgbClr val="' + (o.color || '17324D') + '"/></a:solidFill>' +
      '<a:latin typeface="' + (o.font || FONT) + '"/><a:ea typeface="' + (o.font || FONT) + '"/>' +
      (o.spc ? '<a:spc>' + o.spc + '</a:spc>' : '') +
      '</a:rPr>';
    return '<a:r>' + rpr + '<a:t>' + xesc(text) + '</a:t></a:r>';
  }

  function aPara(text, o) {
    o = o || {};
    var ppr = '<a:pPr' + (o.algn ? ' algn="' + o.algn + '"' : '') +
      ' marL="' + (o.marL || 0) + '" indent="' + (o.indent || 0) + '">' +
      '<a:lnSpc><a:spcPct val="' + (o.lnSpc || 130000) + '"/></a:lnSpc>' +
      '<a:spcBef><a:spcPts val="' + (o.spcBef || 600) + '"/></a:spcBef>' +
      (o.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>') +
      '</a:pPr>';
    return '<a:p>' + ppr + (text ? aRun(text, o) : '<a:endParaRPr lang="zh-CN" sz="' + (o.sz || 1800) + '"/>') + '</a:p>';
  }

  function textBox(id, name, x, y, w, h, paras, o) {
    o = o || {};
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/>' +
      '<p:cNvSpPr txBox="1"/>' + (o.ph ? '<p:nvPr><p:ph type="title"/></p:nvPr>' : '<p:nvPr/>') + '</p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + e(x) + '" y="' + e(y) + '"/><a:ext cx="' + e(w) + '" cy="' + e(h) + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square"' + (o.anchor ? ' anchor="' + o.anchor + '"' : '') +
      ' lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
      paras + '</p:txBody></p:sp>';
  }

  function rect(id, x, y, w, h, color) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="色块 ' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + e(x) + '" y="' + e(y) + '"/><a:ext cx="' + e(w) + '" cy="' + e(h) + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
      '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>';
  }

  function slideXml(shapes, bg) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + (bg || 'FFFFFF') + '"/></a:solidFill>' +
      '<a:effectLst/></p:bgPr></p:bg><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  /* 封面页 */
  function coverSlide(s, page, total) {
    var shapes = rect(2, 0, 0, 176000, SLIDE_H, 'AA3E30');
    shapes += textBox(3, '标题', 900000, 2050000, 10200000, 1500000,
      aPara(s.title, { sz: 4400, b: 1, color: '17324D', lnSpc: 115000, spcBef: 0 }), { ph: true, anchor: 'b' });
    shapes += rect(4, 920000, 3720000, 900000, 46000, 'AA3E30');
    var sub = s.bullets[0] || '';
    shapes += textBox(5, '副标题', 920000, 3920000, 10000000, 700000,
      aPara(sub, { sz: 1800, color: '5B6B7B', lnSpc: 140000, spcBef: 0 }));
    shapes += textBox(6, '页脚', 920000, 6000000, 8000000, 400000,
      aPara('本地办公助手 · 离线生成', { sz: 1100, color: '9A958A', spcBef: 0 }));
    shapes += textBox(7, '页码', 10700000, 6000000, 900000, 400000,
      aPara(String(page), { sz: 1100, color: '9A958A', algn: 'r', spcBef: 0 }));
    return slideXml(shapes, 'F7F5F0');
  }

  /* 内容页 */
  function bodySlide(s, page, total) {
    var shapes = '';
    shapes += textBox(2, '标题', 760000, 520000, 10600000, 820000,
      aPara(s.title, { sz: 2800, b: 1, color: '17324D', lnSpc: 120000, spcBef: 0 }), { ph: true, anchor: 'b' });
    shapes += rect(3, 770000, 1390000, 560000, 52000, 'AA3E30');

    var n = s.bullets.length;
    var sz = n <= 3 ? 2000 : (n <= 5 ? 1800 : 1600);
    var body = s.bullets.map(function (b) {
      return aPara(b, { sz: sz, color: '2E4459', bullet: true, marL: 285750, indent: -285750, spcBef: 900, lnSpc: 140000 });
    }).join('');
    if (!body) body = aPara('（这页没有要点）', { sz: sz, color: '9A958A', spcBef: 0 });
    shapes += textBox(4, '正文', 800000, 1720000, 10500000, 4400000, body, { anchor: 't' });

    shapes += rect(5, 760000, 6260000, 10560000, 8000, 'DBD6CC');
    shapes += textBox(6, '页码', 10300000, 6330000, 1300000, 380000,
      aPara(page + ' / ' + total, { sz: 1100, color: '9A958A', algn: 'r', spcBef: 0 }));
    return slideXml(shapes, 'FFFFFF');
  }

  /* 把模型输出拆成「页」 */
  function splitDeck(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var slides = [], cur = null;
    lines.forEach(function (l) {
      var m = l.match(/^\s*#{1,4}\s*(.+?)\s*$/);
      if (m) {
        var t = m[1];
        var cover = /^封面\s*[：:｜|]/.test(t);
        t = t.replace(/^第\s*\d+\s*页\s*[｜|：:\-—]\s*/, '').replace(/^封面\s*[：:｜|]\s*/, '');
        cur = { title: t, bullets: [], cover: cover };
        slides.push(cur);
        return;
      }
      if (!cur) { cur = { title: '', bullets: [], cover: true }; slides.push(cur); }
      var b = l.match(/^\s*[-*+·]\s+(.+?)\s*$/);
      if (b) { cur.bullets.push(b[1]); return; }
      if (/^\s*>\s*/.test(l)) { return; }                      // 讲稿不进正文
      if (!l.trim()) return;
      if (/^\s*\|/.test(l)) {                                   // 表格行 → 一行文字
        var cellsTxt = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
          .map(function (c) { return c.trim(); }).filter(Boolean).join(' · ');
        if (cellsTxt && !/^[-: ]+$/.test(cellsTxt)) cur.bullets.push(cellsTxt);
        return;
      }
      cur.bullets.push(l.trim().replace(/^\*+|\*+$/g, ''));
    });
    slides = slides.filter(function (s) { return (s.title && s.title.length) || s.bullets.length; });
    /* 第一页如果没有标题，用文档第一行非空文字兜底 */
    if (slides.length && !slides[0].title) {
      slides[0].title = slides[0].bullets.shift() || '汇报';
    }
    /* 首页有实际内容就别硬当封面，否则其余要点会被丢掉 */
    if (slides.length && !slides[0].bullets.length) slides[0].cover = true;
    return slides;
  }

  var THEME = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="本地办公助手">' +
    '<a:themeElements>' +
    '<a:clrScheme name="纸张">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="17324D"/></a:dk2><a:lt2><a:srgbClr val="F7F5F0"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="17324D"/></a:accent1><a:accent2><a:srgbClr val="AA3E30"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="A87C26"/></a:accent3><a:accent4><a:srgbClr val="3F7A5A"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="5B6B7B"/></a:accent5><a:accent6><a:srgbClr val="787E88"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="17324D"/></a:hlink><a:folHlink><a:srgbClr val="5B6B7B"/></a:folHlink>' +
    '</a:clrScheme>' +
    '<a:fontScheme name="本地字体">' +
    '<a:majorFont><a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/><a:cs typeface=""/></a:minorFont>' +
    '</a:fontScheme>' +
    '<a:fmtScheme name="纸面">' +
    '<a:fillStyleLst>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill>' +
    '</a:fillStyleLst>' +
    '<a:lnStyleLst>' +
    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
    '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
    '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
    '</a:lnStyleLst>' +
    '<a:effectStyleLst>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle>' +
    '</a:effectStyleLst>' +
    '<a:bgFillStyleLst>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill>' +
    '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';

  var EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

  var SLIDE_MASTER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
    '<p:spTree>' + EMPTY_TREE +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="标题占位符"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>' +
    '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/>' +
    '<a:p><a:pPr algn="l"/><a:r><a:rPr lang="zh-CN" sz="2800" b="1"><a:solidFill><a:srgbClr val="17324D"/></a:solidFill>' +
    '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:rPr><a:t>标题</a:t></a:r></a:p></p:txBody></p:sp>' +
    '</p:spTree></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
    'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles>' +
    '<p:titleStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:titleStyle>' +
    '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle>' +
    '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>' +
    '</p:txStyles></p:sldMaster>';

  var SLIDE_LAYOUT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleOnly" preserve="1">' +
    '<p:cSld name="标题 Only"><p:spTree>' + EMPTY_TREE +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="标题占位符"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="760000" y="520000"/><a:ext cx="10600000" cy="820000"/></a:xfrm></p:spPr>' +
    '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/>' +
    '<a:p><a:pPr algn="l"/><a:r><a:rPr lang="zh-CN" sz="2800" b="1"><a:solidFill><a:srgbClr val="17324D"/></a:solidFill>' +
    '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:rPr><a:t>单击此处编辑标题</a:t></a:r></a:p></p:txBody></p:sp>' +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

  function toPptx(text, opts) {
    opts = opts || {};
    var slides = splitDeck(text);
    if (!slides.length) throw new Error('没有识别出页面结构。PPT 技能会按「## 第N页｜标题」分页，请让它重新生成一次。');
    if (slides.length > 40) slides = slides.slice(0, 40);

    var files = [];
    var total = slides.length;
    var sldIds = '', rels = '', overrides = '';

    slides.forEach(function (s, i) {
      var n = i + 1;
      var xml = s.cover ? coverSlide(s, n, total) : bodySlide(s, n, total);
      files.push({ name: 'ppt/slides/slide' + n + '.xml', data: utf8(xml) });
      files.push({
        name: 'ppt/slides/_rels/slide' + n + '.xml.rels',
        data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
          '</Relationships>')
      });
      sldIds += '<p:sldId id="' + (255 + n) + '" r:id="rId' + (n + 1) + '"/>';
      rels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + n + '.xml"/>';
      overrides += '<Override PartName="/ppt/slides/slide' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    });

    var themeRid = 'rId' + (total + 2);
    var pres = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + sldIds + '</p:sldIdLst>' +
      '<p:sldSz cx="' + SLIDE_W + '" cy="' + SLIDE_H + '"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      '</p:presentation>';

    var presRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      rels +
      '<Relationship Id="' + themeRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
      '</Relationships>';

    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      overrides +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';

    var masterRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
      '</Relationships>';

    var layoutRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      '</Relationships>';

    var p = docProps(opts.title || '汇报');
    files.push({ name: '[Content_Types].xml', data: utf8(ct) });
    files.push({ name: '_rels/.rels', data: utf8(RELS.replace('word/document.xml', 'ppt/presentation.xml')) });
    files.push({ name: 'ppt/presentation.xml', data: utf8(pres) });
    files.push({ name: 'ppt/_rels/presentation.xml.rels', data: utf8(presRels) });
    files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: utf8(SLIDE_MASTER) });
    files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: utf8(masterRels) });
    files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: utf8(SLIDE_LAYOUT) });
    files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: utf8(layoutRels) });
    files.push({ name: 'ppt/theme/theme1.xml', data: utf8(THEME) });
    files.push({ name: 'docProps/core.xml', data: utf8(p.core) });
    files.push({ name: 'docProps/app.xml', data: utf8(p.app) });

    return zip(files);
  }

  window.Office = {
    parse: parse,
    toDocx: toDocx,
    xlsx: xlsx,
    zip: zip,
    save: save,
    stamp: stamp,
    hasTable: function (text) { return !!allTables(text); },
    saveDocx: function (text, name, title, gongwen) {
      save(toDocx(text, { title: title, gongwen: !!gongwen }), (name || '文稿_' + stamp()) + '.docx');
    },
    saveXlsx: function (text, name) {
      save(xlsx(text, { title: name }), (name || '表格_' + stamp()) + '.xlsx');
    },
    toPptx: toPptx,
    savePptx: function (text, name) {
      save(toPptx(text, { title: name }), (name || '演示_' + stamp()) + '.pptx');
    },
    saveMd: function (text, name) {
      save(new Blob([text], { type: 'text/markdown;charset=utf-8' }), (name || '文稿_' + stamp()) + '.md');
    }
  };
})();
