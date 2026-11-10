# 臺灣常用藥物講義

依「藥物類別」整理的臺灣臨床常用藥物複習網站。每一章都使用同一套格式：機轉速覽 → 各類藥物表（學名／臺灣商品名／用途與重點）→ 字尾辨識法 → 重點總結與臨床情境。

- **網站**：https://joselan4288.github.io/taiwan-drug-notes/
- **AI 撰寫規則**：[`AGENTS.md`](AGENTS.md)（`CLAUDE.md` 指向同一份規則）

## 功能

- 章節以 Markdown 撰寫，瀏覽器端自動套版，不需要建置步驟
- 首頁與側欄由 `content/chapters.json` 自動產生，章節可標示「已發布／草稿／規劃中」
- 藥名速查：輸入學名或商品名，跨章節找到該藥物並跳到所在表格列
- 提示框（說明、記憶法、警示）、每章目錄、深淺色模式、手機版面

## 本機預覽

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

直接雙擊 `index.html` 會因瀏覽器的檔案存取限制而無法載入章節，請使用本機伺服器。

## 新增章節

1. 複製 `templates/chapter-template.md` 到 `content/chapters/<id>-<slug>.md`
2. 在 `content/chapters.json` 登記該章
3. 執行 `python3 scripts/check.py` 確認格式

詳細規則見 `AGENTS.md`。

## 聲明

本網站內容僅供學習與複習，不構成醫療建議；實際用藥以醫師處方與最新仿單為準。
