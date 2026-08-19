#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
類股動能雷達 — 資料抓取與動能計算
產出 data.json 供 index.html 讀取。

執行方式:  python radar.py
"""

import json
import sys
import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

HERE = Path(__file__).parent
CFG = yaml.safe_load((HERE / "themes.yaml").read_text(encoding="utf-8"))

BENCH = CFG.get("benchmark", "SPY")
LOOKBACK = int(CFG.get("lookback_days", 750))
CHART_WEEKS = int(CFG.get("chart_weeks", 14))
MACRO = CFG.get("macro_ratios", []) or []

HIST_DAYS = 250     # history.json 保留幾個交易日
SPARK_WEEKS = 30    # 大盤狀態列的迷你走勢圖顯示幾週

# 動能分數權重（相加=1）。想調整偏好就改這裡。
WEIGHTS = {
    "rs20": 0.30,      # 相對大盤 20 日超額報酬  -> 最重要
    "roc20": 0.25,     # 自身 20 日報酬
    "breadth": 0.20,   # 成分股站上 50 日線比例
    "trend": 0.15,     # 主題指數偏離 50 日線幅度
    "volratio": 0.10,  # 5日均量 / 60日均量
}

ENTER = 55      # 分數上穿此值 = 新啟動
STRONG = 70     # 以上 = 加速
WEAK = 45       # 以下 = 衰竭

log = lambda m: print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


# ------------------------------------------------------------------ 抓資料
def fetch_prices(tickers):
    """回傳 (close_df, volume_df)，欄位是 ticker，索引是日期。"""
    import yfinance as yf

    log(f"下載 {len(tickers)} 檔標的，約 {LOOKBACK} 天...")
    raw = yf.download(
        tickers=list(tickers),
        period=f"{LOOKBACK}d",
        interval="1d",
        auto_adjust=True,       # 還原除權息，避免假訊號
        group_by="column",
        progress=False,
        threads=True,
    )
    if raw.empty:
        raise RuntimeError("下載失敗：沒有取得任何資料。請檢查網路或代號。")

    close = raw["Close"].copy()
    volume = raw["Volume"].copy()
    if isinstance(close, pd.Series):          # 只有一檔時的形狀
        close = close.to_frame(tickers[0])
        volume = volume.to_frame(tickers[0])

    # 剔除全空 / 資料太少的標的
    keep = [c for c in close.columns if close[c].notna().sum() >= 120]
    dropped = sorted(set(close.columns) - set(keep))
    if dropped:
        log(f"⚠️  資料不足或代號無效，已剔除: {', '.join(dropped)}")

    close = close[keep].ffill()
    volume = volume[keep].fillna(0)
    return close, volume


# ------------------------------------------------------ 主題指數與原始指標
def build_theme_index(close, tickers):
    """等權重日報酬複合，起始 = 100。"""
    sub = close[tickers].dropna(how="all")
    rets = sub.pct_change(fill_method=None)
    # 每日對「當天有報價的成分股」取平均，避免新上市股拖累
    eq = rets.mean(axis=1, skipna=True).fillna(0.0)
    return 100.0 * (1.0 + eq).cumprod()


def raw_metrics(idx, close, volume, tickers, bench_idx):
    """回傳每日各項原始指標的 DataFrame。"""
    m = pd.DataFrame(index=idx.index)

    m["roc20"] = idx.pct_change(20)
    m["rs20"] = m["roc20"] - bench_idx.pct_change(20).reindex(idx.index)

    ma50 = idx.rolling(50).mean()
    m["trend"] = idx / ma50 - 1.0

    sub = close[tickers]
    above = sub.gt(sub.rolling(50).mean())
    m["breadth"] = above.sum(axis=1) / sub.notna().sum(axis=1)

    vol = volume[tickers].replace(0, np.nan)
    v5 = vol.rolling(5).mean()
    v60 = vol.rolling(60).mean()
    m["volratio"] = (v5 / v60).mean(axis=1, skipna=True)

    return m


# ------------------------------------------------------------ 橫斷面評分
def cross_sectional_score(panel):
    """
    panel: dict[metric] -> DataFrame(index=date, columns=theme)
    每個交易日、每項指標，在所有主題之間做百分位排名(0~100)，再加權平均。
    這一步是關鍵：用排名而非絕對值，分數才不會隨大盤整體漂移。
    """
    total = None
    for metric, w in WEIGHTS.items():
        df = panel[metric]
        # pct=True 給 0~1 的名次；至少要有 3 個主題才有意義
        rank = df.rank(axis=1, pct=True, na_option="keep") * 100.0
        contrib = rank * w
        total = contrib if total is None else total.add(contrib, fill_value=0)
    return total


def classify(score):
    if score >= STRONG:
        return "加速"
    if score >= ENTER:
        return "啟動"
    if score >= WEAK:
        return "中性"
    return "衰竭"


# ------------------------------------------------------------ 大盤絕對狀態
# 主題分數是「同日所有主題之間的排名」，平均值在數學上永遠被釘在 50 附近，
# 所以不管大盤漲跌，儀表板看起來都差不多。下面這一整層走的是絕對值，
# 專門回答「整體趨勢往哪走」——刻意跟排名分數分開，不混進去互相汙染。

def _breadth(uni, win):
    """成分股站上 N 日均線的比例(%)。均線還沒暖機完的日子留 NaN，不灌 0。"""
    ma = uni.rolling(win).mean()
    valid = ma.notna() & uni.notna()
    above = uni.gt(ma) & valid
    n = valid.sum(axis=1)
    return above.sum(axis=1) / n.replace(0, np.nan) * 100.0


def market_frame(close, theme_tickers):
    """整段期間的大盤絕對指標，index=日期。"""
    spy = close[BENCH]
    ma50 = spy.rolling(50).mean()
    ma200 = spy.rolling(200).mean()

    m = pd.DataFrame(index=close.index)
    m["px_vs_ma50"] = (spy / ma50 - 1.0) * 100
    m["px_vs_ma200"] = (spy / ma200 - 1.0) * 100
    # 200 日線自己的 20 日斜率：均線在往上還是往下彎，比單看價格站在上下方更穩
    m["ma200_slope"] = (ma200 / ma200.shift(20) - 1.0) * 100
    m["drawdown"] = (spy / spy.rolling(252, min_periods=120).max() - 1.0) * 100
    m["vol20"] = spy.pct_change(fill_method=None).rolling(20).std() * np.sqrt(252) * 100

    uni = close[theme_tickers]
    m["breadth50"] = _breadth(uni, 50)
    m["breadth200"] = _breadth(uni, 200)

    m["regime_score"] = regime_score(m)
    return m


def regime_score(m):
    """
    五個獨立條件的計票（0–5）。刻意用「數幾個成立」而不是加權模型——
    這種東西一旦調參就會過擬合，簡單計票至少誠實、看得懂、不會騙自己。
    NaN 參與比較一律得 False，暖機期自然會落在低分，不需要另外處理。
    """
    checks = [
        m["px_vs_ma200"] > 0,      # 價格在長期均線之上
        m["ma200_slope"] > 0,      # 長期均線本身往上
        m["px_vs_ma50"] > 0,       # 價格在中期均線之上
        m["breadth200"] > 50,      # 過半數成分股處於長期上升結構
        m["drawdown"] > -10,       # 距 52 週高點回檔未超過 10%
    ]
    return sum(c.astype(int) for c in checks)


def regime_label(score):
    if score >= 4:
        return "擴張"
    if score >= 2:
        return "震盪"
    return "收縮"


def macro_ratios(close):
    """風險偏好比值。方向變化通常比個別主題輪動更早反映資金態度。"""
    out = []
    for r in MACRO:
        num, den = r.get("num"), r.get("den")
        if num not in close.columns or den not in close.columns:
            log(f"⚠️  比值 {num}/{den} 缺資料，略過")
            continue
        s = (close[num] / close[den]).dropna()
        if len(s) < 21:
            continue
        out.append({
            "pair": f"{num}/{den}",
            "label": r.get("label", f"{num}/{den}"),
            "chg20": round(float(s.iloc[-1] / s.iloc[-21] - 1) * 100, 1),
            "chg60": round(float(s.iloc[-1] / s.iloc[-61] - 1) * 100, 1)
                     if len(s) >= 61 else None,
        })
    return out


# --------------------------------------------------------------- 歷史存檔
def write_history(scores, mkt):
    """
    分數與大盤狀態的歷史。

    注意跟 twrev_history.json 的差別：那邊的資料源只給最新一期快照，
    歷史非累積不可；這邊每次執行都會把整段期間重算一遍，所以這個檔案是
    「重算產出」而不是「逐日累積」——不依賴 Actions 快取（快取七天沒被
    存取就會被清掉），跑漏幾天也會自己補回來，方法論調整後全段一致。

    存成欄狀（dates 一份 + 每個主題一條數列）而不是每天一個物件，
    檔案大小差三倍以上。
    """
    tail = scores.tail(HIST_DAYS)
    mtail = mkt.reindex(tail.index)

    hist = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "dates": [d.strftime("%Y-%m-%d") for d in tail.index],
        "themes": {
            name: [None if pd.isna(v) else round(float(v), 1) for v in tail[name]]
            for name in tail.columns
        },
        "market": {
            k: [None if pd.isna(v) else round(float(v), 1) for v in mtail[k]]
            for k in ("px_vs_ma200", "breadth50", "breadth200", "vol20",
                      "drawdown", "regime_score")
        },
    }
    (HERE / "history.json").write_text(
        json.dumps(hist, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    log(f"✅ 已寫出 history.json（{len(tail)} 個交易日 × {len(tail.columns)} 個主題）")


# ------------------------------------------------------------------- 主流程
def main():
    themes = CFG["themes"]
    theme_tickers = sorted({t for v in themes.values() for t in v["tickers"]})
    macro_tk = {r[k] for r in MACRO for k in ("num", "den") if r.get(k)}
    all_tickers = sorted(set(theme_tickers) | macro_tk | {BENCH})

    close, volume = fetch_prices(all_tickers)
    if BENCH not in close.columns:
        raise RuntimeError(f"基準 {BENCH} 沒抓到資料，無法計算相對強度。")
    bench_idx = close[BENCH]

    indices, metrics, valid = {}, {}, {}

    for name, conf in themes.items():
        have = [t for t in conf["tickers"] if t in close.columns]
        if len(have) < 4:
            log(f"⚠️  「{name}」有效成分股只剩 {len(have)} 檔，跳過")
            continue
        idx = build_theme_index(close, have)
        indices[name] = idx
        metrics[name] = raw_metrics(idx, close, volume, have, bench_idx)
        valid[name] = have

    if not indices:
        raise RuntimeError("沒有任何主題算得出來。")

    # 組成 panel：每項指標一張 date x theme 的表
    panel = {
        metric: pd.DataFrame({n: metrics[n][metric] for n in indices})
        for metric in WEIGHTS
    }
    scores = cross_sectional_score(panel).dropna(how="all")

    latest_date = scores.index[-1]
    log(f"最新資料日期: {latest_date:%Y-%m-%d}，有效主題 {len(indices)} 個")

    # ---- 大盤絕對狀態（廣度只看主題成分股，不含基準與總經 ETF）----
    breadth_uni = [t for t in theme_tickers if t in close.columns]
    mkt = market_frame(close, breadth_uni)
    mrow = mkt.loc[latest_date]
    rscore = int(mrow["regime_score"])

    spark = mkt.resample("W-FRI").last().dropna(
        subset=["breadth200", "regime_score"]).tail(SPARK_WEEKS)

    market = {
        "regime": regime_label(rscore),
        "regime_score": rscore,
        "breadth_universe": len(breadth_uni),
        "ratios": macro_ratios(close),
        "spark": {
            "labels": [d.strftime("%m/%d") for d in spark.index],
            "breadth200": [round(float(v), 1) for v in spark["breadth200"]],
            "regime_score": [int(v) for v in spark["regime_score"]],
        },
    }
    for k in ("px_vs_ma50", "px_vs_ma200", "ma200_slope",
              "drawdown", "vol20", "breadth50", "breadth200"):
        v = mrow[k]
        market[k] = None if pd.isna(v) else round(float(v), 1)

    # 暖機期不足時這些值會是 None，格式化前先擋掉，不要讓 log 拖垮整支程式
    fmt = lambda v, s="": "—" if v is None else f"{v:{s}}"
    log(f"大盤狀態: {market['regime']}（{rscore}/5）· "
        f"SPY vs 200MA {fmt(market['px_vs_ma200'], '+.1f')}% · "
        f"廣度200 {fmt(market['breadth200'], '.0f')}%")

    cards = []
    for name in indices:
        s = scores[name].dropna()
        if len(s) < 6:
            continue
        cur = float(s.iloc[-1])
        prev5 = s.iloc[-6:-1]          # 前 5 個交易日

        # ---- 訊號判定 ----
        idx = indices[name]
        vr = float(metrics[name]["volratio"].iloc[-1])
        ret5 = float(idx.pct_change(5).iloc[-1])
        signal = None
        # 新啟動：分數首次上穿 ENTER，且伴隨放量
        if cur >= ENTER and prev5.max() < ENTER and vr > 1.10:
            signal = "新啟動"
        # 翻轉預警：仍在弱勢區，但已出現放量止跌
        elif cur < WEAK and ret5 > 0.02 and vr > 1.20:
            signal = "翻轉預警"

        # ---- 週線圖資料 ----
        weekly = idx.resample("W-FRI").last().dropna().tail(CHART_WEEKS)
        # 重新基準化到 100，讓每張卡片的圖可以互相比較
        weekly = weekly / weekly.iloc[0] * 100.0

        cards.append({
            "name": name,
            "group": themes[name].get("group", "growth"),
            "score": round(cur, 1),
            "score_prev": round(float(s.iloc[-2]), 1),
            "state": classify(cur),
            "signal": signal,
            "rs20": round(float(metrics[name]["rs20"].iloc[-1]) * 100, 1),
            "roc20": round(float(metrics[name]["roc20"].iloc[-1]) * 100, 1),
            "breadth": round(float(metrics[name]["breadth"].iloc[-1]) * 100),
            "volratio": round(vr, 2),
            "n": len(valid[name]),
            "tickers": valid[name],
            "series": [round(float(v), 1) for v in weekly.values],
            "labels": [d.strftime("%m/%d") for d in weekly.index],
        })

    # ---- 合併資金流向資料（flows.py 產出，沒有就跳過）----
    flows_path = HERE / "flows.json"
    if flows_path.exists():
        try:
            fl = json.loads(flows_path.read_text(encoding="utf-8"))
            ft = fl.get("themes", {})
            for c in cards:
                c["flows"] = ft.get(c["name"])
            log(f"已併入資金流向資料（{fl.get('generated_at','')[:10]}）")
        except Exception as e:
            log(f"⚠️  flows.json 讀取失敗，略過: {e}")

    cards.sort(key=lambda c: -c["score"])

    out = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "data_date": latest_date.strftime("%Y-%m-%d"),
        "benchmark": BENCH,
        "thresholds": {"enter": ENTER, "strong": STRONG, "weak": WEAK},
        "market": market,
        "themes": cards,
    }
    (HERE / "data.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    log(f"✅ 已寫出 data.json（{len(cards)} 個主題）")

    write_history(scores, mkt)

    top = [c for c in cards if c["signal"]]
    if top:
        log("本日訊號：" + "；".join(f"{c['name']}={c['signal']}" for c in top))
    else:
        log("本日無新訊號。")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ 執行失敗: {e}")
        sys.exit(1)
