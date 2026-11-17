/* ============================================================
 * 老版 Office 97-2003 正文提取（.xls / .ppt）
 * ------------------------------------------------------------
 * .xls：BIFF8 记录流，读 SST（共享字符串表）+ 单元格记录，还原行列
 * .ppt：记录树，取 TextCharsAtom / TextBytesAtom / CString
 * 依赖 word.js 暴露的 CFB 读取器，全部本地字节运算。
 * ============================================================ */
(function () {
  'use strict';

  function u16(u, p) { return u[p] | (u[p + 1] << 8); }
  function u32(u, p) { return (u[p] | (u[p + 1] << 8) | (u[p + 2] << 16) | (u[p + 3] << 24)) >>> 0; }
  function f64(u, p) {
    var dv = new DataView(u.buffer, u.byteOffset + p, 8);
    return dv.getFloat64(0, true);
  }
  function ansi(u) {
    var R = window.WordReader;
    try { return R && R.ansi ? R.ansi(u) : new TextDecoder('gbk').decode(u); }
    catch (e) { return new TextDecoder('utf-8').decode(u); }
  }
  function utf16(u) {
    try { return new TextDecoder('utf-16le').decode(u); } catch (e) { return ''; }
  }
  function tidy(t) {
    return String(t).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n').replace(/\u0000/g, '').trim();
  }

  /* ================= XLUnicodeRichExtendedString 读取器 =================
   * 难点：一条字符串可能被 CONTINUE 记录切断，切点处第一个字节是新的
   * grbit（0=单字节 1=双字节），必须在中途重新判断编码。
   */
  function ChunkReader(chunks) {
    this.chunks = chunks;
    this.ci = 0;
    this.off = 0;
    // 第一个 chunk 是 SST 记录本体，前 8 字节是计数，从 8 开始
    this.off = 8;
  }
  ChunkReader.prototype.cur = function () { return this.chunks[this.ci]; };
  ChunkReader.prototype.next = function () {
    if (this.ci + 1 >= this.chunks.length) return false;
    this.ci++;
    this.off = 1;            // 跳过 CONTINUE 的 grbit 字节
    return true;
  };
  ChunkReader.prototype.eof = function () {
    while (this.ci < this.chunks.length && this.off >= this.chunks[this.ci].length) {
      if (!this.next()) return true;
    }
    return false;
  };
  ChunkReader.prototype.u8 = function () {
    if (this.eof()) return 0;
    return this.cur()[this.off++];
  };
  ChunkReader.prototype.u16 = function () {
    var a = this.u8(), b = this.u8();
    return a | (b << 8);
  };
  ChunkReader.prototype.u32 = function () {
    var a = this.u16(), b = this.u16();
    return (a | (b << 16)) >>> 0;
  };
  ChunkReader.prototype.skip = function (n) {
    var left = n;
    while (left > 0 && !this.eof()) {
      var avail = this.cur().length - this.off;
      if (avail <= 0) { if (!this.next()) break; continue; }
      var take = Math.min(avail, left);
      this.off += take;
      left -= take;
    }
  };
  ChunkReader.prototype.readStr = function () {
    if (this.eof()) return '';
    var cch = this.u16();
    var flags = this.u8();
    var rich = flags & 0x08, ext = flags & 0x04;
    var cRun = rich ? this.u16() : 0;
    var cbExt = ext ? this.u32() : 0;
    var wide = !!(flags & 0x01);   // bit0 fHighByte：1=UTF-16，0=压缩单字节
    var s = '', i = 0;
    while (i < cch) {
      if (this.eof()) break;
      var buf = this.cur();
      if (this.off >= buf.length) {
        if (!this.next()) break;
        wide = (this.u8() === 1);     // 切点后重新读 grbit
        continue;
      }
      if (wide) {
        if (this.off + 1 >= buf.length) {   // 双字节字符跨边界：极少见，补读
          var lo = buf[this.off]; this.off++;
          if (!this.next()) break;
          wide = (this.u8() === 1);
          var hi = this.cur()[this.off++];
          s += String.fromCharCode(lo | (hi << 8));
        } else {
          s += String.fromCharCode(buf[this.off] | (buf[this.off + 1] << 8));
          this.off += 2;
        }
      } else {
        s += String.fromCharCode(buf[this.off]); this.off++;
      }
      i++;
    }
    if (cRun) this.skip(cRun * 4);
    if (cbExt) this.skip(cbExt);
    return s;
  };

  /* ================= .xls ================= */
  function xlsToText(cfb) {
    var wb = cfb.read('Workbook') || cfb.read('Book');
    if (!wb || !wb.length) throw new Error('这个 Excel 文件里读不到工作簿内容');

    // 第一遍：把所有记录切成 (type, data) 数组
    var recs = [], p = 0, guard = 0;
    while (p + 4 <= wb.length && guard++ < 400000) {
      var type = u16(wb, p), len = u16(wb, p + 2);
      if (p + 4 + len > wb.length) break;
      recs.push({ t: type, d: wb.subarray(p + 4, p + 4 + len) });
      p += 4 + len;
    }
    if (!recs.length) throw new Error('这个 Excel 文件结构异常，读不出来');

    // 共享字符串表（含后续 CONTINUE）
    var strs = [];
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].t !== 0x00FC) continue;
      var chunks = [recs[i].d];
      for (var j = i + 1; j < recs.length && recs[j].t === 0x003C; j++) chunks.push(recs[j].d);
      try {
        var rd = new ChunkReader(chunks);
        var total = u32(recs[i].d, 0);
        var uniq = u32(recs[i].d, 4);
        var want = Math.min(uniq || total, 500000);
        for (var k = 0; k < want; k++) {
          if (rd.eof()) break;
          strs.push(rd.readStr());
        }
      } catch (e) { /* 字符串表坏了就跳过，后面还有 LABEL 兜底 */ }
      break;
    }

    // 工作表名
    var sheetNames = [];
    recs.forEach(function (r) {
      if (r.t === 0x0085 && r.d.length > 8) {      // BOUNDSHEET
        var cch = r.d[6], flags = r.d[7];
        var nm = flags & 0x01
          ? utf16(r.d.subarray(8, 8 + cch * 2))
          : ansi(r.d.subarray(8, 8 + cch));
        sheetNames.push(nm);
      }
    });

    // 单元格：按 BOF 切分工作表
    var sheets = [], cur = null, inSheet = false;
    function newSheet() {
      cur = { rows: {}, cells: 0 };
      sheets.push(cur);
      inSheet = true;
    }
    recs.forEach(function (r) {
      if (r.t === 0x0809) {                        // BOF
        var dt = r.d.length >= 4 ? u16(r.d, 2) : 0;
        if (dt === 0x0010 || dt === 0x0020) newSheet();
        else inSheet = false;
        return;
      }
      if (!inSheet || !cur) return;
      function put(row, col, val) {
        if (val === '' || val === null || val === undefined) return;
        if (!cur.rows[row]) cur.rows[row] = {};
        cur.rows[row][col] = String(val).replace(/\s+/g, ' ').trim();
        cur.cells++;
      }
      try {
        if (r.t === 0x00FD && r.d.length >= 10) {              // LABELSST
          put(u16(r.d, 0), u16(r.d, 2), strs[u32(r.d, 6)]);
        } else if (r.t === 0x0204 && r.d.length >= 8) {        // LABEL
          var cch2 = u16(r.d, 6), fl = r.d[8] || 0;
          var sv = (fl & 0x01)
            ? utf16(r.d.subarray(9, 9 + cch2 * 2))
            : ansi(r.d.subarray(9, 9 + cch2));
          put(u16(r.d, 0), u16(r.d, 2), sv);
        } else if (r.t === 0x0203 && r.d.length >= 14) {       // NUMBER
          put(u16(r.d, 0), u16(r.d, 2), fmtNum(f64(r.d, 6)));
        } else if (r.t === 0x027E && r.d.length >= 10) {       // RK
          put(u16(r.d, 0), u16(r.d, 2), fmtNum(rkVal(u32(r.d, 6))));
        } else if (r.t === 0x00BD && r.d.length >= 6) {        // MULRK
          var row = u16(r.d, 0), c0 = u16(r.d, 2);
          var n2 = Math.floor((r.d.length - 6) / 6);
          for (var q = 0; q < n2; q++) put(row, c0 + q, fmtNum(rkVal(u32(r.d, 4 + q * 6 + 2))));
        }
      } catch (e) { }
    });

    var out = [];
    for (var s = 0; s < sheets.length; s++) {
      var sh = sheets[s];
      var rowKeys = Object.keys(sh.rows).map(Number).sort(function (a, b) { return a - b; });
      if (!rowKeys.length) continue;
      var lines = [];
      rowKeys.forEach(function (rk) {
        var cols = sh.rows[rk];
        var maxc = -1;
        Object.keys(cols).forEach(function (c3) { maxc = Math.max(maxc, +c3); });
        var arr = [];
        for (var c4 = 0; c4 <= maxc; c4++) arr.push(cols[c4] === undefined ? '' : cols[c4]);
        while (arr.length && arr[arr.length - 1] === '') arr.pop();
        if (arr.join('').trim()) lines.push(arr.join('\t'));
      });
      if (lines.length) out.push('【工作表：' + (sheetNames[s] || ('Sheet' + (s + 1))) + '】\n' + lines.join('\n'));
    }

    if (!out.length) {
      // 兜底：结构没读出来时，把字符串表整段给出
      var flat = strs.filter(function (x) { return x && x.trim(); });
      if (flat.length) return '【工作表内容（未还原行列）】\n' + flat.join('\n');
      throw new Error('这个 Excel 里没有文字内容');
    }
    return tidy(out.join('\n\n'));
  }
  function rkVal(rk) {
    var v;
    if (rk & 0x02) v = rk >> 2;
    else {
      var dv = new DataView(new ArrayBuffer(8));
      dv.setUint32(4, (rk & 0xfffffffc) >>> 0, true);
      dv.setUint32(0, 0, true);
      v = dv.getFloat64(0, true);
    }
    if (rk & 0x01) v = v / 100;
    return v;
  }
  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return '';
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e6) / 1e6);
  }

  /* ================= .ppt ================= */
  function pptToText(cfb) {
    var st = cfb.read('PowerPoint Document');
    if (!st || !st.length) throw new Error('这个 PPT 文件里读不到正文流');
    var out = [], seen = {}, guard = 0;

    function push(s) {
      s = String(s).replace(/\r/g, '\n').replace(/\u000b/g, '\n').replace(/\u0000/g, '').trim();
      if (!s) return;
      if (seen[s]) return;
      seen[s] = 1;
      out.push(s);
    }
    function walk(start, end, depth) {
      if (depth > 12) return;
      var p = start;
      while (p + 8 <= end && guard++ < 300000) {
        var ver = u16(st, p), type = u16(st, p + 2), len = u32(st, p + 4);
        var ds = p + 8, de = Math.min(ds + len, end);
        if (de < ds) break;
        if (ver === 0x0F) {
          walk(ds, de, depth + 1);
        } else if (type === 0x0FA0) {            // TextCharsAtom（UTF-16LE）
          push(utf16(st.subarray(ds, de)));
        } else if (type === 0x0FA8) {            // TextBytesAtom（ANSI/GBK）
          push(ansi(st.subarray(ds, de)));
        } else if (type === 0x0FBA) {            // CString
          push(ansi(st.subarray(ds, de)));
        }
        p = de;
      }
    }
    walk(0, st.length, 0);

    if (!out.length) {
      // 兜底：整个流里扫连续的 UTF-16 中文/ASCII 片段
      var best = [];
      var s = utf16(st);
      var m = s.match(/[\u4e00-\u9fa5A-Za-z0-9，。、；：（）《》“”\s]{8,}/g) || [];
      m.forEach(function (x) {
        var t = x.trim();
        if (t.length >= 8 && /[\u4e00-\u9fa5]{2,}/.test(t)) best.push(t);
      });
      if (best.length) return tidy('【幻灯片文字（未分页）】\n' + best.join('\n'));
      throw new Error('这个 PPT 里没有可读文字（可能整页都是图片）');
    }
    return tidy('【幻灯片文字】\n' + out.join('\n\n'));
  }

  window.OldOffice = { xlsToText: xlsToText, pptToText: pptToText };
})();
