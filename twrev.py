#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股供應鏈月營收 → 美股推估模組

原理：台灣上市櫃公司依規定每月 10 日前公布上月營收，
      美股是季報，中間有 3 週到 2 個月的資訊時間差。

產出 twchain.json（供 radar.py 併入）與 twrev_history.json（歷史累積）。

注意：TWSE OpenAPI 只回傳「最新一期」快照，沒有查詢歷史的參數，
      所以歷史必須靠每月執行累積。第一次跑就能算年增率／月增率
      （快照本身含當月、上月、去年同月），三個月後才有滾動與加速度指標。

執行方式:  python twrev.py
"""

import json
import sys
import time
import datetime as dt
from pathlib import Path

import yaml

HERE = Path(__file__).parent
CHAIN = yaml.safe_load((HERE / "supply_chain.yaml").read_text(encoding="utf-8"))
HIST = HERE / "twrev_history.json"
OUT = HERE / "twchain.json"

TWSE_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"

log = lambda m: print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


# --------------------------------------------------------------- 工具
def _ssl_context():
    """
    優先用 certifi 的憑證庫建立 SSL context。
    Windows 上 Python 有時候讀不到正確的系統憑證（常見錯誤:
    Missing Subject Key Identifier），改用 certifi 通常可以解決，
    且不會犧牲驗證安全性。certifi 沒裝的話退回系統預設。
    """
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def fetch(url, tries=3):
    import urllib.request
    ctx = _ssl_context()
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (personal research)",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
                return json.loads(r.read().decode("utf-8", "ignore"))
        except Exception as e:
            if a == tries - 1:
                log(f"⚠️  下載失敗: {e}")
                return None
            time.sleep(2 * (a + 1))
    return None


def roc_to_ym(s):
    """民國年月 11506 -> '2026-06'。也接受 1150710 這種年月日。"""
    s = str(s).strip()
    if len(s) < 5:
        return None
    y = int(s[:3]) + 1911
    m = int(s[3:5])
    if not 1 <= m <= 12:
        return None
    return f"{y}-{m:02d}"


def num(v):
    """'1,234' / '－' / '' -> float or None。單位為新台幣千元。"""
    if v is None:
        return None
    s = str(v).replace(",", "").replace("－", "").replace("　", "").strip()
    if s in ("", "-", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def pick(row, *keywords):
    """欄位名稱是中文且偶有變動，用關鍵字模糊比對比寫死安全。"""
    for k in row:
        if all(w in k for w in keywords):
            return row[k]
    return None


# ------------------------------------------------------- 抓取與存檔
def fetch_snapshot():
    rows = fetch(TWSE_URL)
    if not rows:
        return None, {}

    period = None
    out = {}
    for r in rows:
        code = str(r.get("公司代號") or r.get("Code") or "").strip()
        if not code:
            continue
        ym = roc_to_ym(pick(r, "資料年月") or "")
        if ym and not period:
            period = ym
        cur = num(pick(r, "當月營收")) 
        # 排除累計欄位誤抓
        if cur is None:
            cur = num(pick(r, "營業收入", "當月"))
        out[code] = {
            "rev": cur,
            "yoy": num(pick(r, "去年同月增減")),
            "mom": num(pick(r, "上月比較增減")),
            "name": str(r.get("公司名稱", "")).strip(),
        }
    return period, out


def load_history():
    if HIST.exists():
        try:
            return json.loads(HIST.read_text(encoding="utf-8"))
        except Exception:
            log("⚠️  歷史檔毀損，重新建立")
    return {}


def save_history(hist, period, snap):
    """歷史結構: {公司代號: {年月: 營收}}。只存需要的公司，檔案才不會爆掉。"""
    watch = set(CHAIN["suppliers"])
    for code in watch:
        if code in snap and snap[code]["rev"] is not None:
            hist.setdefault(code, {})[period] = snap[code]["rev"]
    # 只留最近 36 期
    for code in hist:
        keys = sorted(hist[code])[-36:]
        hist[code] = {k: hist[code][k] for k in keys}
    HIST.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")


# --------------------------------------------------------- 指標計算
def supplier_metrics(code, snap, hist):
    """回傳該供應商的營收動能指標。歷史不足時相關欄位為 None。"""
    s = snap.get(code, {})
    h = hist.get(code, {})
    months = sorted(h)

    m = {
        "yoy": s.get("yoy"),
        "mom": s.get("mom"),
        "rev": s.get("rev"),
        "yoy_3m": None,
        "accel": None,
        "history_months": len(months),
    }

    # 3 個月滾動年增率：需要當期 3 個月 + 去年同期 3 個月
    def roll_yoy(end_idx):
        if end_idx < 2:
            return None
        cur_ms = months[end_idx - 2: end_idx + 1]
        cur = sum(h[x] for x in cur_ms)
        prior = []
        for x in cur_ms:
            y, mo = x.split("-")
            key = f"{int(y)-1}-{mo}"
            if key not in h:
                return None
            prior.append(h[key])
        base = sum(prior)
        return (cur / base - 1) * 100 if base else None

    if len(months) >= 3:
        cur3 = roll_yoy(len(months) - 1)
        m["yoy_3m"] = round(cur3, 1) if cur3 is not None else None
        prev3 = roll_yoy(len(months) - 2)
        if cur3 is not None and prev3 is not None:
            # 加速度：這一期的 3M 年增率比上一期高多少百分點
            m["accel"] = round(cur3 - prev3, 1)

    return m


def direction(score):
    if score is None:
        return "無資料"
    if score >= 30:
        return "強勁擴張"
    if score >= 10:
        return "溫和成長"
    if score >= -5:
        return "持平"
    if score >= -20:
        return "轉弱"
    return "明顯收縮"


def rollup(sup_metrics):
    """
    把台廠營收動能匯總到美股層級。
    加權方式: weight（相關性）× purity（純度）。
    另外算出「一致性」——供應商之間有沒有講同一件事。
    """
    buckets = {}
    for code, conf in CHAIN["suppliers"].items():
        m = sup_metrics.get(code)
        if not m or m["yoy"] is None:
            continue
        purity = float(conf.get("purity", 0.5))
        for us, w in conf.get("maps_to", {}).items():
            buckets.setdefault(us, []).append({
                "code": code,
                "name": conf.get("name", code),
                "yoy": m["yoy"],
                "accel": m["accel"],
                "w": float(w) * purity,
            })

    out = {}
    for us, items in buckets.items():
        tw = sum(i["w"] for i in items)
        if tw <= 0:
            continue
        reading = sum(i["yoy"] * i["w"] for i in items) / tw

        # 一致性：正負方向一致的權重占比
        pos = sum(i["w"] for i in items if i["yoy"] > 0)
        agree = max(pos, tw - pos) / tw

        acc_items = [i for i in items if i["accel"] is not None]
        accel = (sum(i["accel"] * i["w"] for i in acc_items)
                 / sum(i["w"] for i in acc_items)) if acc_items else None

        # 信心度：供應商數量、意見一致度、加權總純度 三者的綜合
        n = len(items)
        conf_score = min(1.0, n / 4) * agree * min(1.0, tw / 3.0)

        out[us] = {
            "reading": round(reading, 1),
            "direction": direction(reading),
            "accel": round(accel, 1) if accel is not None else None,
            "agreement": round(agree * 100),
            "confidence": round(conf_score * 100),
            "n_suppliers": n,
            "suppliers": sorted(
                [{"name": i["name"], "code": i["code"], "yoy": i["yoy"]} for i in items],
                key=lambda x: -abs(x["yoy"])
            )[:6],
        }
    return out


# ---------------------------------------------------------------- 主流程
def main():
    log("抓取 TWSE 上市公司月營收快照…")
    period, snap = fetch_snapshot()
    if not period or not snap:
        log("❌ 抓不到資料，保留既有 twchain.json（若有）")
        return
    log(f"資料年月: {period}，全市場 {len(snap)} 家")

    hist = load_history()
    save_history(hist, period, snap)
    hist = load_history()

    watch = CHAIN["suppliers"]
    sup = {}
    missing_tpex, missing_other = [], []
    for code, conf in watch.items():
        if code not in snap or snap[code].get("rev") is None:
            (missing_tpex if conf.get("market") == "tpex" else missing_other).append(
                f"{code} {conf.get('name','')}")
            continue
        sup[code] = supplier_metrics(code, snap, hist)
        sup[code]["name"] = conf.get("name", code)
        sup[code]["market"] = conf.get("market", "twse")

    log(f"取得 {len(sup)}/{len(watch)} 家供應商")
    if missing_tpex:
        log(f"ℹ️  上櫃無月營收端點（已知限制）: {', '.join(missing_tpex)}")
    if missing_other:
        log(f"⚠️  上市但查無資料（可能尚未公告或代號有誤）: {', '.join(missing_other)}")

    us = rollup(sup)
    depth = max((v["history_months"] for v in sup.values()), default=0)

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "period": period,
        "history_months": depth,
        "suppliers": sup,
        "us": us,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"✅ 已寫出 twchain.json（{len(us)} 檔美股推估、歷史深度 {depth} 期）")

    if depth < 15:
        log(f"ℹ️  歷史僅 {depth} 期，滾動與加速度指標要累積約 15 期才會完整。")

    rank = sorted(us.items(), key=lambda x: -x[1]["reading"])[:5]
    log("供應鏈讀數前五：" + "；".join(
        f"{k} {v['reading']:+.1f}% ({v['direction']}, 信心{v['confidence']})"
        for k, v in rank))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ 台股供應鏈模組失敗: {e}")
        log("   主系統不受影響。")
        sys.exit(0)
