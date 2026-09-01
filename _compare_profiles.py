#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
比較 legacy 與 decorrelated 兩組動能因子權重的實際差異。

用途：切換 themes.yaml 的 scoring.profile 之前，先看清楚會改變多少東西。
純分析，不寫任何檔案。

執行方式:  python _compare_profiles.py
"""
import sys
import warnings
import itertools

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

import radar


def build_panels():
    """抓一次價格，算出所有主題的原始因子。"""
    themes = radar.CFG["themes"]
    theme_tk = sorted({t for v in themes.values() for t in v["tickers"]})
    close, volume = radar.fetch_prices(sorted(set(theme_tk) | {radar.BENCH}))
    bench = close[radar.BENCH]

    metrics = {}
    for name, conf in themes.items():
        have = [t for t in conf["tickers"] if t in close.columns]
        if len(have) < 4:
            continue
        idx = radar.build_theme_index(close, have)
        metrics[name] = radar.raw_metrics(idx, close, volume, have, bench)
    return metrics


def score_with(metrics, weights):
    """照指定權重算橫斷面分數。與 radar.cross_sectional_score 同邏輯。"""
    total = None
    for metric, w in weights.items():
        df = pd.DataFrame({n: metrics[n][metric] for n in metrics})
        rank = df.rank(axis=1, pct=True, na_option="keep") * 100.0
        contrib = rank * w
        total = contrib if total is None else total.add(contrib, fill_value=0)
    return total.dropna(how="all")


def flips(scores):
    """狀態（加速/啟動/中性/衰竭）翻轉次數。"""
    st = scores.apply(lambda col: col.map(
        lambda v: None if pd.isna(v) else radar.classify(v)))
    return int((st != st.shift()).iloc[1:].sum().sum())


def main():
    print("抓資料並計算兩組公式…")
    metrics = build_panels()

    legacy = score_with(metrics, radar.WEIGHT_PROFILES["legacy"])
    deco = score_with(metrics, radar.WEIGHT_PROFILES["decorrelated"])

    common = legacy.index.intersection(deco.index)
    legacy, deco = legacy.loc[common], deco.loc[common]
    diff = (deco - legacy).abs()

    print()
    print("=" * 68)
    print("一、因子共線性（排名後，這才是真正進入分數的東西）")
    print("=" * 68)
    allw = {}
    for w in radar.WEIGHT_PROFILES.values():
        allw.update(w)
    ranks = {}
    for m in allw:
        df = pd.DataFrame({n: metrics[n][m] for n in metrics})
        ranks[m] = df.rank(axis=1, pct=True, na_option="keep").stack()
    print(pd.DataFrame(ranks).dropna().corr().round(3).to_string())

    print()
    print("=" * 68)
    print("二、新舊分數差異")
    print("=" * 68)
    print(f"  比較期間        : {common[0]:%Y-%m-%d} ~ {common[-1]:%Y-%m-%d}"
          f"（{len(common)} 個交易日 × {legacy.shape[1]} 主題）")
    print(f"  平均絕對差      : {diff.stack().mean():.2f} 分")
    print(f"  中位數絕對差    : {diff.stack().median():.2f} 分")
    print(f"  95 百分位差     : {diff.stack().quantile(0.95):.2f} 分")
    print(f"  最大差          : {diff.stack().max():.2f} 分")

    print()
    print("  各主題平均絕對差（前 8 名，差最多的排前面）:")
    for name, v in diff.mean().sort_values(ascending=False).head(8).items():
        print(f"    {name:<16} {v:5.2f} 分")

    print()
    print("=" * 68)
    print("三、狀態翻轉次數（加速／啟動／中性／衰竭）")
    print("=" * 68)
    fl, fd = flips(legacy), flips(deco)
    print(f"  legacy       : {fl} 次")
    print(f"  decorrelated : {fd} 次   ({fd - fl:+d}, {(fd/fl - 1) * 100:+.1f}%)")
    print("  翻轉越多代表訊號越不穩定、越容易來回進出。")

    print()
    print("=" * 68)
    print("四、最新一日排名變動")
    print("=" * 68)
    last = common[-1]
    cmp = pd.DataFrame({
        "legacy分數": legacy.loc[last].round(1),
        "deco分數": deco.loc[last].round(1),
    })
    cmp["legacy名次"] = cmp["legacy分數"].rank(ascending=False).astype(int)
    cmp["deco名次"] = cmp["deco分數"].rank(ascending=False).astype(int)
    cmp["名次變動"] = cmp["legacy名次"] - cmp["deco名次"]
    cmp = cmp.sort_values("legacy名次")
    print(f"  資料日: {last:%Y-%m-%d}（名次變動為正 = 新公式下排名上升）")
    print(cmp.to_string())

    print()
    print("目前生效的 profile:", radar.PROFILE)
    print("要切換請改 themes.yaml 的 scoring.profile。")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 執行失敗: {e}")
        sys.exit(1)
