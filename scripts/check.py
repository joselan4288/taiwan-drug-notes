#!/usr/bin/env python3
"""檢查章節是否符合 AGENTS.md 第 5、6 節的格式規則。

用法：在專案根目錄執行  python3 scripts/check.py
全部通過時結束碼為 0；有錯誤時列出問題並以結束碼 1 結束。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"

CN_NUM = "一二三四五六七八九十"
REQUIRED_KEYS = {"id", "slug", "title", "short", "summary", "status", "updated"}
STATUSES = {"published", "draft", "planned"}
# 常見簡體字（出現即視為違反繁體中文規則）
SIMPLIFIED = set("这们药么为说时还发处应该经过对与从会样点种关进实现话问题请将让门见视测选简体书长头")
BANNED_WORDS = {"台灣": "臺灣"}

errors: list[str] = []
warnings: list[str] = []


def err(where: str, msg: str) -> None:
    errors.append(f"[錯誤] {where}：{msg}")


def warn(where: str, msg: str) -> None:
    warnings.append(f"[提醒] {where}：{msg}")


def cn_index(n: int) -> str:
    """1 → 一、10 → 十、11 → 十一、12 → 十二"""
    if n <= 10:
        return CN_NUM[n - 1]
    return "十" + CN_NUM[n - 11]


def check_manifest() -> list[dict]:
    path = CONTENT / "chapters.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err("chapters.json", f"無法解析 JSON：{e}")
        return []

    chapters = data.get("chapters", [])
    ids, slugs = set(), set()
    for ch in chapters:
        where = f"chapters.json#{ch.get('id', '?')}"
        missing = REQUIRED_KEYS - ch.keys()
        if missing:
            err(where, f"缺少欄位 {sorted(missing)}")
        if not re.fullmatch(r"\d{2}", str(ch.get("id", ""))):
            err(where, "id 必須是兩位數字")
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", str(ch.get("slug", ""))):
            err(where, "slug 只能用英文小寫、數字與連字號")
        if ch.get("id") in ids:
            err(where, "id 重複")
        if ch.get("slug") in slugs:
            err(where, "slug 重複")
        ids.add(ch.get("id"))
        slugs.add(ch.get("slug"))
        if ch.get("status") not in STATUSES:
            err(where, f"status 必須是 {sorted(STATUSES)} 之一")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(ch.get("updated", ""))):
            err(where, "updated 必須是 YYYY-MM-DD")
        if ch.get("status") in {"published", "draft"}:
            expected = f"chapters/{ch.get('id')}-{ch.get('slug')}.md"
            if ch.get("file") != expected:
                err(where, f"file 應為 {expected}")
            elif not (CONTENT / expected).exists():
                err(where, f"找不到檔案 content/{expected}")
    return chapters


def split_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def check_chapter(ch: dict) -> None:
    path = CONTENT / ch["file"]
    if not path.exists():
        return
    name = path.name
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    # H1
    h1 = [l for l in lines if re.match(r"^# ", l)]
    if len(h1) != 1:
        err(name, f"H1 必須剛好一個（目前 {len(h1)} 個）")
    elif h1[0][2:].strip() != ch["title"]:
        err(name, f"H1「{h1[0][2:].strip()}」與 chapters.json 的 title「{ch['title']}」不同")

    # 禁止 H4 以下
    for i, l in enumerate(lines, 1):
        if re.match(r"^#{4,} ", l):
            err(name, f"第 {i} 行使用了 H4 以下標題")

    # H2 編號與固定節
    h2 = [l[3:].strip() for l in lines if re.match(r"^## ", l)]
    if len(h2) < 3:
        err(name, "至少需要三個 H2（速覽、字尾辨識法、重點總結與臨床情境）")
    for n, title in enumerate(h2, 1):
        if not title.startswith(f"{cn_index(n)}、"):
            err(name, f"第 {n} 個 H2「{title}」應以「{cn_index(n)}、」開頭")
    if h2:
        if "速覽" not in h2[0]:
            err(name, "第一節標題必須含「速覽」")
        if len(h2) >= 2 and not h2[-2].endswith("字尾辨識法"):
            err(name, "倒數第二節必須是「字尾辨識法」")
        if not h2[-1].endswith("重點總結與臨床情境"):
            err(name, "最後一節必須是「重點總結與臨床情境」")

    # 藥物表格：第一欄為「學名」者，第二欄須為「臺灣商品名」或「類別」
    drug_tables = 0
    for i, l in enumerate(lines):
        if l.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*:?-{3,}", lines[i + 1]):
            head = split_row(l)
            if head and head[0] == "學名":
                drug_tables += 1
                if len(head) < 2 or head[1] not in {"臺灣商品名", "類別"}:
                    err(name, f"第 {i + 1} 行藥物表第二欄應為「臺灣商品名」（目前為「{head[1] if len(head) > 1 else ''}」）")
    if drug_tables == 0:
        err(name, "找不到任何第一欄為「學名」的藥物表")

    # 提示框類型
    for i, l in enumerate(lines, 1):
        m = re.match(r"^>\s*\[!(\w+)\]", l)
        if m and m.group(1) not in {"NOTE", "TIP", "WARNING"}:
            err(name, f"第 {i} 行提示框類型 {m.group(1)} 不在允許清單（NOTE／TIP／WARNING）")

    # 繁體中文
    for i, l in enumerate(lines, 1):
        bad = sorted({c for c in l if c in SIMPLIFIED})
        if bad:
            err(name, f"第 {i} 行疑似簡體字：{''.join(bad)}")
        for w, fix in BANNED_WORDS.items():
            if w in l:
                err(name, f"第 {i} 行「{w}」應改為「{fix}」")


def main() -> int:
    chapters = check_manifest()
    checked = 0
    for ch in chapters:
        if ch.get("status") in {"published", "draft"} and ch.get("file"):
            check_chapter(ch)
            checked += 1

    for w in warnings:
        print(w)
    for e in errors:
        print(e)
    if errors:
        print(f"\n檢查失敗：{len(errors)} 個錯誤。")
        return 1
    print(f"檢查通過：{len(chapters)} 個章節項目，{checked} 個章節檔案。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
