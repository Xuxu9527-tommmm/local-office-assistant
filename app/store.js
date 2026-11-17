/* 本地记忆与资料库：IndexedDB 存储 + 纯本地检索（无模型、无网络）
   存在浏览器为本机地址分配的存储里，关掉页面不丢，清缓存会丢，所以提供导出/导入。*/
(function () {
  const DB_NAME = '本机资料库';
  const DB_VER = 2;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('mem')) db.createObjectStore('mem', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  function tx(store, mode) {
    return open().then(db => db.transaction(store, mode).objectStore(store));
  }

  function all(store) {
    return tx(store, 'readonly').then(s => new Promise((res, rej) => {
      const r = s.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }));
  }

  function put(store, val) {
    return tx(store, 'readwrite').then(s => new Promise((res, rej) => {
      const r = s.put(val);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }

  function del(store, id) {
    return tx(store, 'readwrite').then(s => new Promise((res, rej) => {
      const r = s.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    }));
  }

  /* ---------- 中文友好检索：二字组倒排，纯字面匹配，不依赖分词与模型 ---------- */
  function gramSet(text) {
    const out = new Set();
    const s = String(text || '');
    // 汉字连续串按 2 字切；英文/数字按词
    const re = /[\u4e00-\u9fa5]+|[A-Za-z0-9]+/g;
    let m;
    while ((m = re.exec(s))) {
      const w = m[0];
      if (/^[\u4e00-\u9fa5]+$/.test(w)) {
        if (w.length === 1) out.add(w);
        for (let i = 0; i + 2 <= w.length; i++) out.add(w.slice(i, i + 2));
      } else if (w.length > 1) out.add(w.toLowerCase());
    }
    return out;
  }

  /* 把长文切成互相重叠的小块，便于检索到最相关的一段 */
  function chunk(text, size = 420, overlap = 90) {
    const s = String(text || '').replace(/\r/g, '');
    if (s.length <= size) return [s];
    const parts = [];
    for (let i = 0; i < s.length; i += size - overlap) {
      parts.push(s.slice(i, i + size));
      if (i + size >= s.length) break;
    }
    return parts;
  }

  /* ---------- 任务：一个个独立对话，互不串味 ---------- */
  function addTask(title) {
    return put('tasks', {
      title: title || '新任务',
      skillId: 'free',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      msgs: []
    });
  }
  function getTask(id) {
    return tx('tasks', 'readonly').then(s => new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  function saveTask(t) { t.updatedAt = Date.now(); return put('tasks', t); }

  const API = {
    /* 新增一份资料，自动切块建索引 */
    async addDoc(title, text) {
      const pieces = chunk(text).filter(p => p.trim().length > 40);
      const doc = {
        title: title || ('资料 ' + new Date().toLocaleString('zh-CN')),
        addedAt: Date.now(),
        size: text.length,
        chunks: pieces.map(t => ({ t: t, g: Array.from(gramSet(t)) }))
      };
      const id = await put('docs', doc);
      return id;
    },
    listDocs() { return all('docs'); },
    deleteDoc(id) { return del('docs', id); },

    async addMem(text) {
      return put('mem', { text: text.trim(), addedAt: Date.now() });
    },
    listMem() { return all('mem'); },
    deleteMem(id) { return del('mem', id); },

    /* 任务：一个个独立对话，互不串味 */
    addTask: addTask,
    getTask: getTask,
    saveTask: saveTask,
    listTasks: function(){ return all('tasks'); },
    deleteTask: function(id){ return del('tasks', id); },

    /* 检索：返回最相关的若干段，score 用「命中的二字组数 / √块长」做粗排 */
    async search(query, topK = 3) {
      const q = gramSet(query);
      if (!q.size) return [];
      const docs = await all('docs');
      const hits = [];
      for (const d of docs) {
        for (const c of d.chunks) {
          let hit = 0;
          for (const g of c.g) if (q.has(g)) hit++;
          if (hit >= 3) hits.push({ title: d.title, text: c.t, score: hit / Math.sqrt(c.g.length || 1) });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      // 同一份资料最多取两段，避免一份文件把上下文占满
      const used = {}, out = [];
      for (const h of hits) {
        used[h.title] = (used[h.title] || 0) + 1;
        if (used[h.title] > 2) continue;
        out.push(h);
        if (out.length >= topK) break;
      }
      return out;
    },

    /* 记忆全量（条目少，直接全带） */
    async memText(limit = 24, maxLen = 1400) {
      const list = await all('mem');
      let s = '';
      for (const m of list.slice(-limit)) {
        if (s.length + m.text.length > maxLen) break;
        s += '- ' + m.text + '\n';
      }
      return s.trim();
    },

    /* 导出/导入：一个 json 文件，换机器时可带走 */
    async exportAll() {
      const docs = await all('docs');
      const mem = await all('mem');
      return JSON.stringify({
        kind: '本地办公助手-资料包', ver: 1,
        exportedAt: new Date().toISOString(),
        mem: mem.map(m => ({ text: m.text, addedAt: m.addedAt })),
        docs: docs.map(d => ({ title: d.title, size: d.size, addedAt: d.addedAt,
          text: d.chunks.map(c => c.t).join('') }))
      }, null, 1);
    },
    async importAll(json) {
      const o = JSON.parse(json);
      if (!o || !Array.isArray(o.docs)) throw new Error('不是本工具导出的资料包');
      for (const m of (o.mem || [])) if (m && m.text) await API.addMem(m.text);
      for (const d of o.docs) if (d && d.text) await API.addDoc(d.title, d.text);
      return { docs: (o.docs || []).length, mem: (o.mem || []).length };
    },
    /* 统计，给界面显示用 */
    async stats() {
      const [docs, mem] = await Promise.all([all('docs'), all('mem')]);
      return {
        docs: docs.length,
        mem: mem.length,
        chars: docs.reduce((a, d) => a + (d.size || 0), 0)
      };
    }
  };

  window.Store = API;
  window.StoreTools = { gramSet, chunk };
})();
