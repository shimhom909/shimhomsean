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
LOOKBACK = int(CFG.get("lookback_days", 400))
CHART_WEEKS = int(CFG.get("chart_weeks", 14))

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


# ------------------------------------------------------------------- 主流程
def main():
    themes = CFG["themes"]
    all_tickers = sorted({t for v in themes.values() for t in v["tickers"]} | {BENCH})

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
        "themes": cards,
    }
    (HERE / "data.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    log(f"✅ 已寫出 data.json（{len(cards)} 個主題）")

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
