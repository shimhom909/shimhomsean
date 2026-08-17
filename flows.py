#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
機構／內部人資金流向模組
  1. 內部人交易 — SEC EDGAR Form 4（公司高層買賣自家股票）
  2. 融券餘額   — 空頭部位與月變化

產出 flows.json，供 radar.py 合併進主資料。
這支程式獨立執行，失敗不會影響主系統的動能計算。

執行方式:  python flows.py
"""

import json
import re
import sys
import time
import datetime as dt
from pathlib import Path
from xml.etree import ElementTree as ET

import yaml

HERE = Path(__file__).parent
CFG = yaml.safe_load((HERE / "themes.yaml").read_text(encoding="utf-8"))
OUT = HERE / "flows.json"

# SEC 規定必須表明身分，請在 themes.yaml 填自己的 email
UA = CFG.get("sec_user_agent", "Personal Research your-email@example.com")
INSIDER_DAYS = int(CFG.get("insider_lookback_days", 90))
MAX_FORM4_PER_TICKER = 25      # 每檔最多解析幾份 Form 4，避免跑太久

SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"

log = lambda m: print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


# --------------------------------------------------------------- HTTP 工具
_last_call = [0.0]

def _ssl_context():
    """優先用 certifi 憑證庫，修正 Windows 上常見的憑證驗證失敗。"""
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


_SSL_CTX = None


def get(url, as_json=False, tries=3):
    """SEC 限制每秒 10 次，這裡保守設 8 次/秒。失敗回 None 不拋錯。"""
    import urllib.request, urllib.error
    global _SSL_CTX
    if _SSL_CTX is None:
        _SSL_CTX = _ssl_context()

    for attempt in range(tries):
        gap = time.time() - _last_call[0]
        if gap < 0.13:
            time.sleep(0.13 - gap)
        _last_call[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip, deflate",
                "Host": url.split("/")[2],
            })
            with urllib.request.urlopen(req, timeout=25, context=_SSL_CTX) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
                return json.loads(raw) if as_json else raw.decode("utf-8", "ignore")
        except Exception as e:
            if attempt == tries - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


# ------------------------------------------------------ 1. 內部人交易
def ticker_to_cik():
    """SEC 官方的代號 → CIK 對照表。"""
    data = get(SEC_TICKERS, as_json=True)
    if not data:
        return {}
    return {v["ticker"].upper(): int(v["cik_str"]) for v in data.values()}


def parse_form4(xml_text):
    """
    解析一份 Form 4，回傳公開市場買賣清單。
    交易代碼只取 P（公開market買進）與 S（賣出）——
    A（配股）、M（選擇權行使）、F（扣稅）不是主動決策，沒有訊號價值。
    """
    try:
        # 完整申報檔裡可能包在 SGML 標籤中，先抽出 XML 主體
        m = re.search(r"<ownershipDocument>.*?</ownershipDocument>", xml_text, re.S)
        root = ET.fromstring(m.group(0) if m else xml_text)
    except Exception:
        return []

    def val(node, path):
        el = node.find(path)
        if el is None:
            return None
        v = el.find("value")
        return (v.text if v is not None else el.text or "").strip()

    owner = root.find("reportingOwner")
    is_exec = False
    if owner is not None:
        rel = owner.find("reportingOwnerRelationship")
        if rel is not None:
            is_exec = any(
                (rel.findtext(t) or "").strip() in ("1", "true")
                for t in ("isDirector", "isOfficer", "isTenPercentOwner")
            )

    out = []
    for tbl in ("nonDerivativeTable/nonDerivativeTransaction",):
        for tx in root.findall(tbl):
            code = val(tx, "transactionCoding/transactionCode")
            if code not in ("P", "S"):
                continue
            try:
                sh = float(val(tx, "transactionAmounts/transactionShares") or 0)
                px = float(val(tx, "transactionAmounts/transactionPricePerShare") or 0)
            except ValueError:
                continue
            if sh <= 0 or px <= 0:
                continue
            date = val(tx, "transactionDate") or ""
            out.append({
                "date": date[:10],
                "code": code,
                "usd": sh * px,
                "exec": is_exec,
            })
    return out


def insider_for(cik, cutoff):
    """回傳某公司近期的公開市場買賣紀錄。"""
    sub = get(SEC_SUBMISSIONS.format(cik=cik), as_json=True)
    if not sub:
        return []

    recent = sub.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accs = recent.get("accessionNumber", [])
    docs = recent.get("primaryDocument", [])
    if not forms:
        return []

    jobs = []
    for i, f in enumerate(forms):
        if f != "4" or i >= len(dates) or dates[i] < cutoff:
            continue
        acc = accs[i].replace("-", "")
        doc = docs[i] if i < len(docs) else ""
        # primaryDocument 有時是 XSL 轉譯版，要還原成原始 XML 路徑
        doc = doc.split("/")[-1] if doc.startswith("xsl") else doc
        if not doc.endswith(".xml"):
            doc = f"{accs[i]}.txt"
        jobs.append(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}")
        if len(jobs) >= MAX_FORM4_PER_TICKER:
            break

    txs = []
    for url in jobs:
        body = get(url)
        if body:
            txs.extend(parse_form4(body))
    return [t for t in txs if t["date"] >= cutoff]


# ------------------------------------------------------ 2. 融券餘額
def short_interest(tickers):
    """
    用 yfinance 取得空單張數與上月數字，算出月變化。
    這是快照資料、不保證每檔都有，抓不到就略過。
    """
    import yfinance as yf

    res = {}
    for i, t in enumerate(tickers, 1):
        try:
            info = yf.Ticker(t).get_info()
            cur = info.get("sharesShort")
            prior = info.get("sharesShortPriorMonth")
            float_sh = info.get("floatShares") or info.get("sharesOutstanding")
            if not cur or not float_sh:
                continue
            res[t] = {
                "pct_float": round(cur / float_sh * 100, 2),
                "chg_pct": round((cur - prior) / prior * 100, 1) if prior else None,
            }
        except Exception:
            continue
        if i % 25 == 0:
            log(f"  融券進度 {i}/{len(tickers)}")
    return res


# ---------------------------------------------------------------- 主流程
def main():
    themes = CFG["themes"]
    tickers = sorted({t for v in themes.values() for t in v["tickers"]})
    cutoff = (dt.date.today() - dt.timedelta(days=INSIDER_DAYS)).isoformat()

    # ---- 內部人 ----
    log("取得 SEC 代號對照表…")
    cikmap = ticker_to_cik()
    log(f"對照表 {len(cikmap)} 筆。開始掃描 Form 4（近 {INSIDER_DAYS} 天）…")

    insider = {}
    missing = []
    for i, t in enumerate(tickers, 1):
        cik = cikmap.get(t)
        if not cik:
            missing.append(t)
            continue
        txs = insider_for(cik, cutoff)
        buys = [x for x in txs if x["code"] == "P"]
        sells = [x for x in txs if x["code"] == "S"]
        insider[t] = {
            "buy_usd": round(sum(x["usd"] for x in buys)),
            "sell_usd": round(sum(x["usd"] for x in sells)),
            "n_buy": len(buys),
            "n_sell": len(sells),
        }
        if i % 20 == 0:
            log(f"  內部人進度 {i}/{len(tickers)}")

    if missing:
        log(f"⚠️  SEC 查無 CIK（多為 ADR 或已下市）: {', '.join(missing)}")

    # ---- 融券 ----
    log("取得融券餘額…")
    shorts = short_interest(tickers)
    log(f"融券取得 {len(shorts)}/{len(tickers)} 檔")

    # ---- 匯總到主題層級 ----
    out_themes = {}
    for name, conf in themes.items():
        tks = conf["tickers"]
        buy = sum(insider.get(t, {}).get("buy_usd", 0) for t in tks)
        sell = sum(insider.get(t, {}).get("sell_usd", 0) for t in tks)
        nb = sum(insider.get(t, {}).get("n_buy", 0) for t in tks)
        ns = sum(insider.get(t, {}).get("n_sell", 0) for t in tks)

        # 淨買賣比：+100 = 全是買，-100 = 全是賣，0 = 平衡
        net = round((buy - sell) / (buy + sell) * 100) if (buy + sell) else None

        sv = [shorts[t] for t in tks if t in shorts]
        pf = [s["pct_float"] for s in sv if s["pct_float"] is not None]
        cg = [s["chg_pct"] for s in sv if s.get("chg_pct") is not None]

        out_themes[name] = {
            "insider_net": net,
            "insider_buy_usd": buy,
            "insider_sell_usd": sell,
            "insider_n_buy": nb,
            "insider_n_sell": ns,
            "short_pct": round(sum(pf) / len(pf), 1) if pf else None,
            "short_chg": round(sum(cg) / len(cg), 1) if cg else None,
            "short_cover": len(pf),
            "n": len(tks),
        }

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "insider_window_days": INSIDER_DAYS,
        "themes": out_themes,
        "by_ticker": {"insider": insider, "short": shorts},
    }

    # 有舊檔就保留備援：新資料明顯殘缺時不覆蓋
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            got = sum(1 for v in out_themes.values() if v["insider_net"] is not None)
            had = sum(1 for v in old.get("themes", {}).values()
                      if v.get("insider_net") is not None)
            if had >= 5 and got < had * 0.4:
                log(f"⚠️  本次只取得 {got} 個主題（上次 {had}），疑似抓取失敗，保留舊資料")
                return
        except Exception:
            pass

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for v in out_themes.values() if v["insider_net"] is not None)
    log(f"✅ 已寫出 flows.json（內部人 {ok} 個主題、融券 {len(shorts)} 檔）")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ 資金流向模組失敗: {e}")
        log("   主系統不受影響，儀表板會照常顯示動能資料。")
        sys.exit(0)      # 故意不回傳錯誤碼，避免中斷每日排程
