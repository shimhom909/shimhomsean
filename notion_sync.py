#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「潛力股量化評分表」跟本專案的雷達訊號交叉比對，寫回 Notion 一份週摘要。

⚠️ 定位：這是資料交叉比對，不是投資建議。
   輸出只描述「兩邊的量化訊號有沒有同時指向同一檔標的」，
   不產生任何「買進／加碼／減碼」這類指示性語言。跟本專案其他部分
   （radar.py 的頁尾聲明）站在同一個立場。

讀：
  - Notion 來源頁面裡的表格（股票代號、動能/投入/客戶/估值/護城河/總分）
  - 本機 data.json（radar.py 算出來的主題分數、狀態、利率曝險、週輪動）
寫：
  - Notion 目的資料庫，一週一批列，每列一檔「兩邊都有覆蓋」的標的

環境變數：
  NOTION_TOKEN          必要。Notion internal integration token。
  NOTION_SOURCE_PAGE    必要。「潛力股量化評分表」的 page id
                        （themes.yaml 的 notion.source_page 也可以設，
                        環境變數優先，方便在 GitHub Actions 用 secret 覆蓋）。
  NOTION_DEST_DATABASE  必要。輸出資料庫的 id（同上，可用 themes.yaml 設）。

執行方式:  python notion_sync.py
"""
import json
import os
import re
import sys
import urllib.request
import datetime as dt
from pathlib import Path

import yaml

HERE = Path(__file__).parent
CFG = yaml.safe_load((HERE / "themes.yaml").read_text(encoding="utf-8"))
NOTION_CFG = CFG.get("notion", {}) or {}

API = "https://api.notion.com/v1"
VERSION = "2022-06-28"

log = lambda m: print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


# --------------------------------------------------------------- Notion API
def _token():
    t = os.environ.get("NOTION_TOKEN")
    if not t:
        raise SystemExit("缺少環境變數 NOTION_TOKEN。"
                         "本機執行請先 export NOTION_TOKEN=你的token，"
                         "GitHub Actions 請在 repo secrets 設定。")
    return t


def notion(method, path, body=None):
    """
    最小的 Notion API 呼叫封裝，用標準庫 urllib，不額外依賴 notion-sdk——
    跟 flows.py／twrev.py 對 SEC/TWSE 的呼叫方式一致風格。
    """
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {_token()}",
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Notion API {method} {path} 失敗 "
                           f"({e.code}): {detail[:300]}") from None


def rich_text(s):
    return [{"type": "text", "text": {"content": s[:2000]}}] if s else []


# ------------------------------------------------------------- 讀取來源表格
def find_table_block(page_id):
    """
    來源頁面用的是頁面內的表格區塊（table block），不是正式的 Notion
    Database——所以不能用 database query，要遞迴找頁面內容裡的 table。
    只往下找一層子區塊，這份評分表本身沒有更深的巢狀結構。
    """
    children = notion("GET", f"/blocks/{page_id}/children?page_size=100")["results"]
    for b in children:
        if b["type"] == "table":
            return b["id"]
    raise RuntimeError(f"在頁面 {page_id} 裡找不到表格區塊，"
                       "來源評分表的結構可能改變了，需要重新檢查。")


TICKER_RE = re.compile(r"[（(]([^）)]+)[）)]")


def parse_tickers(name_cell):
    """
    從「股票（代號）」欄位解析出代號。已知格式：
      'ARM Holdings（ARM）'                    -> ['ARM']
      'Synopsys／Cadence（SNPS/CDNS）'          -> ['SNPS', 'CDNS']
      'AMD'（沒有括號，代號就是名字本身）        -> ['AMD']
    非美股代號（含 '.'，如 005930.KS）原樣保留，後面比對雷達資料時
    自然對不上、會被跳過——不需要另外過濾。
    """
    m = TICKER_RE.search(name_cell)
    if not m:
        # 沒有括號：多半是代號本身就是公司名（如 AMD），或非美股（如台股）
        return [name_cell.strip().upper()] if name_cell.strip().isupper() else []
    return [t.strip().upper() for t in re.split(r"[/／,、]", m.group(1)) if t.strip()]


def load_scoresheet(page_id):
    """回傳 {ticker: {行原始資料}}，一檔多代號時每個代號都指到同一列。"""
    table_id = find_table_block(page_id)
    rows = notion("GET", f"/blocks/{table_id}/children?page_size=100")["results"]
    if not rows:
        raise RuntimeError("來源表格是空的。")

    header = [rich_text_plain(c) for c in rows[0]["table_row"]["cells"]]
    log(f"來源表格欄位: {header}")

    out = {}
    for row in rows[1:]:
        cells = [rich_text_plain(c) for c in row["table_row"]["cells"]]
        if len(cells) < 9:
            continue
        name, cat, mom, inp, cust, val, moat, total, note = cells[:9]
        rec = {
            "name": name, "category": cat, "note": note,
            "momentum": _f(mom), "input": _f(inp), "customer": _f(cust),
            "valuation": _f(val), "moat": _f(moat), "total": _f(total),
        }
        for t in parse_tickers(name):
            out[t] = rec
    return out


def rich_text_plain(cell):
    return "".join(x.get("plain_text", "") for x in cell)


def _f(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


# -------------------------------------------------------------- 交叉比對
def crossref(scoresheet, data):
    """
    每個 Notion 有評分、雷達也有覆蓋到的代號產出一列摘要。

    刻意不產出任何「買進/加碼」語言——只描述兩邊訊號的客觀狀態：
    量化總分、雷達動能狀態、本週輪動方向、利率曝險。訊號重疊度是
    機械式計數（三個條件各自成立就 +1），不是主觀判斷。
    """
    tk2themes = {}
    for c in data["themes"]:
        for t in c["tickers"]:
            tk2themes.setdefault(t, []).append(c)

    rot_by_name = {}
    if data.get("rotation"):
        rot_by_name = {r["name"]: r for r in data["rotation"].get("all", [])}

    rows = []
    for ticker, sc in scoresheet.items():
        cards = tk2themes.get(ticker)
        if not cards:
            continue   # 雷達沒覆蓋到（非美股、或不在任何主題裡），跳過

        theme_names = [c["name"] for c in cards]
        avg_score = sum(c["score"] for c in cards) / len(cards)
        # 狀態取「最積極」的那個主題——多主題重疊時，看它在最強的地方表現如何
        order = {"加速": 3, "啟動": 2, "中性": 1, "衰竭": 0}
        best = max(cards, key=lambda c: order[c["state"]])

        rot_dir, rot_chg = "無資料", None
        rots = [rot_by_name[n] for n in theme_names if n in rot_by_name]
        if rots:
            rot_chg = sum(r["chg"] for r in rots) / len(rots)
            rot_dir = "輪入" if rot_chg > 1 else "輪出" if rot_chg < -1 else "持平"

        betas = [c["rate"]["beta"] for c in cards if c.get("rate")]
        beta = sum(betas) / len(betas) if betas else None

        overlap = sum([
            (sc["total"] or 0) >= 3.5,
            best["state"] in ("加速", "啟動"),
            rot_dir == "輪入",
        ])

        # 逐段組字串，每段各自判斷是否有值——原本寫成一整條加號串接＋
        # 尾端一個 if/else，Python 三元運算優先權低到會把前面全部吃掉，
        # 只要 Notion 總分缺值，連主題名稱、狀態都會一起消失。
        parts = [f"{'、'.join(theme_names)}：本週{rot_dir}"]
        if rot_chg is not None:
            parts.append(f"{rot_chg:+.1f}分")
        parts.append(f"，{best['state']}")
        if beta is not None:
            parts.append(f"，利率beta {beta:+.3f}")
        if sc["total"] is not None:
            parts.append(f" ｜ Notion量化 {sc['total']:.2f}/5")
        note = "".join(parts)

        rows.append({
            "ticker": ticker, "themes": theme_names, "avg_score": round(avg_score, 1),
            "state": best["state"], "rotation": rot_dir, "rot_chg": rot_chg,
            "beta": beta, "notion_total": sc["total"], "overlap": overlap,
            "note": note[:2000],
        })

    rows.sort(key=lambda r: (-r["overlap"], -(r["notion_total"] or 0)))
    return rows


# ------------------------------------------------------------- 寫回 Notion
def write_digest(dest_db, rows, week_label):
    log(f"寫入 {len(rows)} 列到 Notion 資料庫 {dest_db}…")
    for r in rows:
        props = {
            "標的": {"title": rich_text(r["ticker"])},
            "週別": {"date": {"start": week_label}},
            "所屬雷達主題": {"rich_text": rich_text("、".join(r["themes"]))},
            "雷達動能分數": {"number": r["avg_score"]},
            "主題狀態": {"select": {"name": r["state"]}},
            "本週輪動": {"select": {"name": r["rotation"]}},
            "重疊備註": {"rich_text": rich_text(r["note"])},
        }
        if r["beta"] is not None:
            props["利率敏感度beta"] = {"number": round(r["beta"], 4)}
        if r["notion_total"] is not None:
            props["Notion量化總分"] = {"number": r["notion_total"]}

        notion("POST", "/pages", {
            "parent": {"database_id": dest_db},
            "properties": props,
        })
    log(f"✅ 已寫入 {len(rows)} 列")


def main():
    source_page = os.environ.get("NOTION_SOURCE_PAGE") or NOTION_CFG.get("source_page")
    dest_db = os.environ.get("NOTION_DEST_DATABASE") or NOTION_CFG.get("dest_database")
    if not source_page or not dest_db:
        raise SystemExit("缺少來源頁面或目的資料庫 id。"
                         "在環境變數 NOTION_SOURCE_PAGE/NOTION_DEST_DATABASE，"
                         "或 themes.yaml 的 notion.source_page/dest_database 設定。")

    data_path = HERE / "data.json"
    if not data_path.exists():
        raise SystemExit("找不到 data.json，請先執行 python radar.py。")
    data = json.loads(data_path.read_text(encoding="utf-8"))

    log("讀取 Notion 潛力股量化評分表…")
    scoresheet = load_scoresheet(source_page)
    log(f"解析出 {len(scoresheet)} 個代號的量化評分")

    rows = crossref(scoresheet, data)
    log(f"兩邊都覆蓋到的標的共 {len(rows)} 檔")
    for r in rows[:5]:
        log(f"  重疊度{r['overlap']} {r['ticker']:<6} "
            f"雷達{r['avg_score']:.1f}分({r['state']}) "
            f"本週{r['rotation']} Notion{r['notion_total']}")

    write_digest(dest_db, rows, data["data_date"])


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ 執行失敗: {e}")
        sys.exit(1)
