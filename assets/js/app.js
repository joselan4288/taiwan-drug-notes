/* ============================================================
   臺灣常用藥物講義 — 前端程式
   - 讀 content/chapters.json 產生首頁、側欄
   - 讀 content/chapters/*.md 以 marked 渲染
   - 轉換 > [!NOTE|TIP|WARNING] 提示框、包裝表格、產生目錄
   - 藥名速查：掃描所有「第一欄為『學名』」的表格（AGENTS.md §5.2）
   路由：#/  ·  #/ch/<slug>?s=<節>&d=<藥名>  ·  #/search?q=<詞>  ·  #/rules
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = $("#view");

  const state = {
    site: null,
    chapters: [],
    mdCache: new Map(),     // file → markdown 文字
    index: null,            // 速查索引
    currentSlug: null,
    tocObserver: null,
  };

  const CALLOUT = {
    NOTE:    { cls: "note",    label: "說明", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>' },
    TIP:     { cls: "tip",     label: "記憶法", icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.2.9 2V16h5.4v-.2c0-.8.3-1.5.9-2A6 6 0 0 0 12 3z"/>' },
    WARNING: { cls: "warning", label: "警示", icon: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>' },
  };

  /* ---------- 小工具 ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stripMd = (s) => String(s).replace(/\*\*|__|\*|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
  const isReadable = (ch) => ch.status === "published" || ch.status === "draft";
  const STATUS_LABEL = { published: "已發布", draft: "草稿", planned: "規劃中" };

  function storage(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (_) { /* 私密模式或被封鎖時忽略 */ }
    return null;
  }

  async function fetchText(path) {
    if (state.mdCache.has(path)) return state.mdCache.get(path);
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path} 載入失敗（${res.status}）`);
    const text = await res.text();
    state.mdCache.set(path, text);
    return text;
  }

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = raw.split("?");
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean);
    return { parts, params };
  }

  /* ---------- 主題 ---------- */
  function initTheme() {
    const saved = storage("theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
    $("#themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme
        || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      storage("theme", next);
    });
  }

  /* ---------- 側欄 ---------- */
  function renderSidebar() {
    const list = $("#chapterList");
    const readable = state.chapters.filter(isReadable);
    const planned = state.chapters.filter((c) => c.status === "planned");
    const item = (c) => isReadable(c)
      ? `<li><a href="#/ch/${c.slug}" data-slug="${c.slug}"><span class="num">${c.id}</span>${esc(c.short)}${c.status === "draft" ? '<span class="tag">草稿</span>' : ""}</a></li>`
      : `<li><span title="規劃中"><span class="num">${c.id}</span>${esc(c.short)}<span class="tag">規劃中</span></span></li>`;
    list.innerHTML =
      `<li><a href="#/" data-slug="__home"><span class="num">··</span>首頁</a></li>` +
      readable.map(item).join("") +
      (planned.length ? `<li class="sep" aria-hidden="true"></li>` + planned.map(item).join("") : "") +
      `<li class="sep" aria-hidden="true"></li><li><a href="#/rules" data-slug="__rules"><span class="num">§</span>撰寫規則 AGENTS.md</a></li>`;
  }

  function markSidebar(slug) {
    $$("#chapterList a").forEach((a) => {
      if (a.dataset.slug === slug) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function initMenu() {
    const sb = $("#sidebar"), scrim = $("#scrim"), btn = $("#menuBtn");
    const set = (open) => {
      sb.classList.toggle("open", open);
      scrim.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", () => set(!sb.classList.contains("open")));
    scrim.addEventListener("click", () => set(false));
    $("#chapterList").addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  }

  /* ---------- Markdown 後處理 ---------- */
  function enhance(root, { drugTables = true } = {}) {
    // 提示框
    $$("blockquote", root).forEach((bq) => {
      const p = bq.firstElementChild;
      if (!p || p.tagName !== "P") return;
      const m = p.innerHTML.match(/^\s*\[!(NOTE|TIP|WARNING)\][ \t]*([^\n<]*)(?:\n|<br>)?/);
      if (!m) return;
      const type = CALLOUT[m[1]];
      const title = m[2].trim() || type.label;
      p.innerHTML = p.innerHTML.slice(m[0].length);
      if (!p.textContent.trim()) p.remove();
      const box = document.createElement("aside");
      box.className = `callout ${type.cls}`;
      box.innerHTML = `<div class="callout-title"><svg viewBox="0 0 24 24" aria-hidden="true">${type.icon}</svg>${title}</div>`;
      while (bq.firstChild) box.appendChild(bq.firstChild);
      bq.replaceWith(box);
    });
    // 表格包裝、藥物表標記
    $$("table", root).forEach((t) => {
      const first = t.querySelector("th");
      if (drugTables && first && first.textContent.trim() === "學名") t.classList.add("drug");
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
    // 標題 id：h2 → s1, s2…；h3 → s1-1…（與速查索引的編號一致）
    let h2n = 0, h3n = 0;
    $$("h2, h3", root).forEach((h) => {
      if (h.tagName === "H2") { h2n += 1; h3n = 0; h.id = `s${h2n}`; }
      else { h3n += 1; h.id = `s${h2n}-${h3n}`; }
    });
  }

  function buildToc(root, slug) {
    const heads = $$("h2", root);
    if (!heads.length) return "";
    return `<nav class="toc" aria-label="本章目錄"><div class="toc-title">本章目錄</div><ol>` +
      heads.map((h) => `<li><a href="#/ch/${slug}?s=${h.id}" data-target="${h.id}">${esc(h.textContent)}</a></li>`).join("") +
      `</ol></nav>`;
  }

  function updateToc() {
    const links = $$(".toc a");
    if (!links.length) return;
    let current = null;
    for (const h of $$(".prose h2")) {
      if (h.getBoundingClientRect().top < 140) current = h.id; else break;
    }
    links.forEach((a) => a.classList.toggle("active", a.dataset.target === current));
  }

  function watchToc() {
    if (!state.tocObserver) {
      let ticking = false;
      state.tocObserver = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { updateToc(); ticking = false; });
      };
      window.addEventListener("scroll", state.tocObserver, { passive: true });
    }
    updateToc();
  }

  function scrollToTarget(params) {
    const s = params.get("s"), d = params.get("d");
    if (d) {
      const row = $$(".prose table.drug tbody tr").find((tr) => stripMd(tr.cells[0]?.textContent || "") === d);
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
        return;
      }
    }
    if (s) {
      const el = document.getElementById(s);
      if (el) { el.scrollIntoView({ behavior: "smooth" }); return; }
    }
    window.scrollTo(0, 0);
  }

  /* ---------- 頁面：首頁 ---------- */
  function renderHome() {
    document.title = state.site.title;
    state.currentSlug = null;
    markSidebar("__home");
    const pub = state.chapters.filter(isReadable);
    const card = (c) => isReadable(c)
      ? `<a class="card" href="#/ch/${c.slug}">
           <div class="card-top"><span class="num">CH ${c.id}</span><span class="badge ${c.status}">${STATUS_LABEL[c.status]}</span></div>
           <h3>${esc(c.short)}</h3><p>${esc(c.summary)}</p>
           <div class="meta">更新於 ${c.updated}</div></a>`
      : `<div class="card is-planned" aria-disabled="true">
           <div class="card-top"><span class="num">CH ${c.id}</span><span class="badge">規劃中</span></div>
           <h3>${esc(c.short)}</h3><p>${esc(c.summary)}</p></div>`;

    view.innerHTML = `
      <section class="hero">
        <div class="eyebrow">PHARMACOLOGY NOTES · TAIWAN</div>
        <h1>${esc(state.site.title)}</h1>
        <p>${esc(state.site.subtitle)}。每一章使用相同格式：先看機轉速覽，再依類別列出學名、臺灣商品名與臨床重點，最後以字尾辨識法和臨床情境收尾。</p>
        <div class="stats">
          <div class="stat"><b>${pub.length}</b><span>已發布章節</span></div>
          <div class="stat"><b>${state.chapters.length}</b><span>規劃章節</span></div>
          <div class="stat"><b id="drugCount">—</b><span>可速查藥物</span></div>
        </div>
      </section>
      <div class="section-label">章節</div>
      <div class="grid">${state.chapters.map(card).join("")}</div>`;
    window.scrollTo(0, 0);
    ensureIndex().then((idx) => { const el = $("#drugCount"); if (el) el.textContent = idx.length; }).catch(() => {});
  }

  /* ---------- 頁面：章節 ---------- */
  async function renderChapter(slug, params) {
    const i = state.chapters.findIndex((c) => c.slug === slug && isReadable(c));
    if (i < 0) return renderNotFound("找不到這個章節，或它還在規劃中。");
    const ch = state.chapters[i];
    markSidebar(slug);

    if (state.currentSlug === slug && $(".prose")) { scrollToTarget(params); return; }

    view.innerHTML = `<p class="loading">載入中…</p>`;
    let md;
    try { md = await fetchText(`content/${ch.file}`); }
    catch (e) { return renderNotFound(e.message); }

    const article = document.createElement("article");
    article.className = "prose";
    article.innerHTML = marked.parse(md);
    enhance(article);

    // 在 H1 後插入麵包屑與章節資訊
    const h1 = $("h1", article);
    const meta = document.createElement("div");
    meta.className = "chapter-meta";
    meta.innerHTML = `<span class="badge ${ch.status}">${STATUS_LABEL[ch.status]}</span><span>第 ${ch.id} 章</span><span>更新於 ${ch.updated}</span>`;
    if (h1) {
      h1.insertAdjacentElement("afterend", meta);
      h1.insertAdjacentHTML("beforebegin", `<div class="crumb"><a href="#/">首頁</a> ／ 第 ${ch.id} 章</div>`);
    }

    // 上下章
    const readable = state.chapters.filter(isReadable);
    const r = readable.findIndex((c) => c.slug === slug);
    const prev = readable[r - 1], next = readable[r + 1];
    article.insertAdjacentHTML("beforeend", `<nav class="pager" aria-label="章節導覽">
      ${prev ? `<a class="prev" href="#/ch/${prev.slug}"><small>上一章</small>${esc(prev.short)}</a>` : "<span></span>"}
      ${next ? `<a class="next" href="#/ch/${next.slug}"><small>下一章</small>${esc(next.short)}</a>` : ""}
    </nav>`);

    view.innerHTML = `<div class="chapter-wrap"></div>`;
    const wrap = $(".chapter-wrap", view);
    wrap.appendChild(article);
    wrap.insertAdjacentHTML("beforeend", buildToc(article, slug));

    document.title = `${ch.short}｜${state.site.title}`;
    state.currentSlug = slug;
    watchToc();
    requestAnimationFrame(() => scrollToTarget(params));
  }

  /* ---------- 頁面：AGENTS.md ---------- */
  async function renderRules() {
    markSidebar("__rules");
    state.currentSlug = null;
    view.innerHTML = `<p class="loading">載入中…</p>`;
    try {
      const md = await fetchText("AGENTS.md");
      view.innerHTML = `<article class="prose"><div class="crumb"><a href="#/">首頁</a> ／ 專案規則</div>${marked.parse(md)}</article>`;
      enhance($(".prose", view), { drugTables: false });
      document.title = `AGENTS.md｜${state.site.title}`;
      window.scrollTo(0, 0);
    } catch (e) { renderNotFound(e.message); }
  }

  /* ---------- 藥名速查 ---------- */
  async function ensureIndex() {
    if (state.index) return state.index;
    const rows = [];
    for (const ch of state.chapters.filter(isReadable)) {
      let md;
      try { md = await fetchText(`content/${ch.file}`); } catch (_) { continue; }
      let h2n = 0, h3n = 0, section = "", sectionId = "";
      for (const tok of marked.lexer(md)) {
        if (tok.type === "heading" && tok.depth === 2) { h2n += 1; h3n = 0; section = stripMd(tok.text); sectionId = `s${h2n}`; }
        else if (tok.type === "heading" && tok.depth === 3) { h3n += 1; sectionId = `s${h2n}-${h3n}`; }
        else if (tok.type === "table" && stripMd(tok.header[0]?.text) === "學名") {
          const heads = tok.header.map((h) => stripMd(h.text));
          for (const row of tok.rows) {
            const cells = row.map((c) => stripMd(c.text));
            rows.push({
              generic: cells[0],
              brand: heads[1] === "臺灣商品名" ? cells[1] : "",
              note: cells.slice(heads[1] === "臺灣商品名" ? 2 : 1).join("；"),
              ch, section, sectionId,
            });
          }
        }
      }
    }
    state.index = rows;
    return rows;
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }

  async function renderSearch(q) {
    markSidebar(null);
    state.currentSlug = null;
    $("#searchInput").value = q;
    document.title = `速查：${q}｜${state.site.title}`;
    view.innerHTML = `<div class="search-head"><h1>藥名速查</h1><p>搜尋所有已發布章節中的學名與臺灣商品名。</p></div><p class="loading">建立索引中…</p>`;
    const idx = await ensureIndex();
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? idx.filter((r) => r.generic.toLowerCase().includes(needle) || r.brand.toLowerCase().includes(needle))
      : [];
    const body = !needle
      ? `<div class="empty">輸入學名或商品名，例如「Atropine」「泛得林」「Spiriva」。</div>`
      : !hits.length
        ? `<div class="empty">找不到「${esc(q)}」。目前收錄 ${idx.length} 筆藥物，可能還在規劃中的章節裡。</div>`
        : `<div class="result-count">共 ${hits.length} 筆結果</div>
           <div class="table-wrap"><table class="results"><thead><tr><th>學名</th><th>臺灣商品名</th><th>章節</th><th>重點</th></tr></thead><tbody>
           ${hits.map((r) => `<tr>
               <td><a href="#/ch/${r.ch.slug}?d=${encodeURIComponent(r.generic)}">${highlight(r.generic, q.trim())}</a></td>
               <td>${highlight(r.brand || "—", q.trim())}</td>
               <td><a href="#/ch/${r.ch.slug}?s=${r.sectionId}">${esc(r.ch.short)}</a><br><small>${esc(r.section)}</small></td>
               <td>${esc(r.note)}</td></tr>`).join("")}
           </tbody></table></div>`;
    view.innerHTML = `<div class="prose search-page"><div class="search-head"><h1>藥名速查</h1><p>搜尋所有已發布章節中的學名與臺灣商品名。</p></div>${body}</div>`;
    window.scrollTo(0, 0);
  }

  function initSearch() {
    const form = $("#searchForm"), input = $("#searchInput");
    let timer;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      location.hash = `#/search?q=${encodeURIComponent(input.value.trim())}`;
    });
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const v = input.value.trim();
        if (v) history.replaceState(null, "", `#/search?q=${encodeURIComponent(v)}`), route();
      }, 250);
    });
  }

  function renderNotFound(msg) {
    view.innerHTML = `<div class="prose"><h1>找不到頁面</h1><p>${esc(msg)}</p><p><a href="#/">回到首頁</a></p></div>`;
  }

  /* ---------- 路由 ---------- */
  function route() {
    const { parts, params } = parseHash();
    if (parts[0] !== "search") $("#searchInput").value = "";
    if (!parts.length) return renderHome();
    if (parts[0] === "ch" && parts[1]) return renderChapter(parts[1], params);
    if (parts[0] === "search") return renderSearch(params.get("q") || "");
    if (parts[0] === "rules") return renderRules();
    renderNotFound("網址不正確。");
  }

  async function init() {
    initTheme();
    initMenu();
    initSearch();
    try {
      const data = JSON.parse(await fetchText("content/chapters.json"));
      state.site = data.site;
      state.chapters = [...data.chapters].sort((a, b) => a.id.localeCompare(b.id));
    } catch (e) {
      view.innerHTML = `<div class="empty">無法載入章節清單：${esc(e.message)}<br>若是直接開啟 index.html，請改用本機伺服器（python3 -m http.server）。</div>`;
      return;
    }
    marked.setOptions({ gfm: true, breaks: false });
    renderSidebar();
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
