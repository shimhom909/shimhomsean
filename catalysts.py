#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
週輪動的「相關新聞」：替這週變動最大的主題，抓帶動個股的近期新聞標題。

讀 data.json 的 rotation（radar.py 已算好每個主題的帶動個股），
對每個重點主題的前兩檔帶動個股查 Google News RSS，寫出 catalysts.json
給前端在週輪動頁顯示。

⚠️ 定位：這是「同一段時間出現的新聞」，不是因果歸因。
   標題跟股價變動時間相近，不代表就是那則新聞造成的——前端會明白標示。
   真正可靠的歸因是 radar.py 算的價格歸因（哪幾檔帶動、漲跌多少），
   這裡只是給人一個去查證的起點。

資料源用 Google News RSS：公開、不需要金鑰。yfinance 的新聞端點實測
回傳 0 則，所以沒用。外部服務隨時可能失敗，所以這支在 workflow 裡是
continue-on-error，失敗不影響網站其他部分。

執行方式:  python catalysts.py
"""
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
import datetime as dt
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "catalysts.json"

FEATURE_EACH = 3      # 輪入、輪出各取前幾名主題
DRIVERS_EACH = 2      # 每個主題查前幾檔帶動個股
HEADLINES_EACH = 3    # 每個主題最多顯示幾則

log = lambda m: print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)

# 沒有內容的報價頁、行情頁，標題長得像新聞但什麼都沒說
JUNK = re.compile(r"Stock Price,|Stock Price and Chart|Stock Price & Chart|"
                  r"Stock Price Today|Stock Quote|Quote & History|Quote, News|"
                  r"Price, News|options chain|interactive stock chart", re.I)
NAME_SUFFIX = re.compile(r"[,\s]+(Inc\.?|Incorporated|Corporation|Corp\.?|Holdings?|"
                         r"Ltd\.?|Limited|plc|N\.V\.|S\.A\.|Co\.?|Company|Group|"
                         r"Technologies|Enterprises)$", re.I)


def _ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


CTX = _ctx()


def company_name(ticker):
    """
    用公司名查新聞比用代號準——ON、S、NET、NOW 這類代號本身是常用英文字，
    單用代號會抓到一堆無關結果。查不到名字就退回代號。
    """
    try:
        import yfinance as yf
        n = (yf.Ticker(ticker).info.get("shortName") or "").strip()
    except Exception:
        n = ""
    for _ in range(3):                      # 「Holdings, Inc.」這種要剝兩層
        n = NAME_SUFFIX.sub("", n).strip()
    return n or ticker


def headlines(ticker, name, limit=6):
    q = f'"{name}" {ticker} when:7d' if name != ticker else f"{ticker} stock when:7d"
    url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q)
           + "&hl=en-US&gl=US&ceid=US:en")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (personal research)"})
    with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
        root = ET.fromstring(r.read())

    out = []
    for it in root.iter("item"):
        title = it.findtext("title") or ""
        src = it.find("source")
        source = src.text if src is not None else ""
        # Google 會在標題尾巴接「 - 來源」，跟 source 欄位重複，拿掉
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        if JUNK.search(title):
            continue
        # 標題裡要真的提到這家公司，避免抓到只是順帶一提的文章
        if not (re.search(rf"\b{re.escape(ticker)}\b", title)
                or name.lower() in title.lower()):
            continue
        try:
            date = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
        except Exception:
            date = None
        out.append({"t": ticker, "title": title.strip(), "source": source,
                    "date": date, "url": it.findtext("link")})
        if len(out) >= limit:
            break
    return out


def featured(rot):
    """這週最值得解釋的主題：輪入、輪出各前幾名，加上所有狀態跨越的。"""
    picked, seen = [], set()
    groups = (rot.get("inflow", [])[:FEATURE_EACH] + rot.get("outflow", [])[:FEATURE_EACH]
              + rot.get("upgrades", []) + rot.get("downgrades", []))
    for row in groups:
        if row["name"] not in seen and row.get("drivers"):
            seen.add(row["name"])
            picked.append(row)
    return picked


def main():
    data = json.loads((HERE / "data.json").read_text(encoding="utf-8"))
    rot = data.get("rotation")
    if not rot:
        log("data.json 沒有週輪動資料，略過")
        return

    themes, names, fails = {}, {}, 0
    for row in featured(rot):
        items, seen_titles = [], set()
        for d in row["drivers"][:DRIVERS_EACH]:
            t = d["t"]
            if t not in names:
                names[t] = company_name(t)
            try:
                for h in headlines(t, names[t]):
                    key = h["title"].lower()
                    if key not in seen_titles:      # 同一則新聞常同時提到兩檔
                        seen_titles.add(key)
                        items.append(h)
            except Exception as e:
                fails += 1
                log(f"⚠️  {t} 新聞抓取失敗: {e}")
            time.sleep(0.5)                          # 別對 Google 連發
        items.sort(key=lambda h: h["date"] or "", reverse=True)
        themes[row["name"]] = items[:HEADLINES_EACH]

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "from_date": rot["from_date"],
        "to_date": rot["to_date"],
        "themes": themes,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1, allow_nan=False),
                   encoding="utf-8")
    n = sum(len(v) for v in themes.values())
    log(f"✅ 已寫出 catalysts.json（{len(themes)} 個主題、{n} 則標題"
        + (f"、{fails} 檔抓取失敗" if fails else "") + "）")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ 執行失敗: {e}")
        sys.exit(1)
