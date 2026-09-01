#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
主題成分股重疊稽核。

為什麼要看：同一檔股票掛在多個主題底下，那些主題的指數會因為共同持股
而天然同步，人為推高彼此的相關性。影響程度取決於重疊比例——只共用
一兩檔、且主題本身有六七檔時，影響通常有限；但重疊比例一高就會讓
「主題輪動」的訊號失真。

執行方式:  python _audit_overlap.py
"""
import itertools
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent


def main():
    cfg = yaml.safe_load((HERE / "themes.yaml").read_text(encoding="utf-8"))
    themes = cfg["themes"]
    policy = cfg.get("overlap_policy", "none")

    # ---- (a) 跨主題重疊個股清單 ----
    tk2th = {}
    for name, conf in themes.items():
        for t in conf["tickers"]:
            tk2th.setdefault(t, []).append(name)
    dup = {t: th for t, th in tk2th.items() if len(th) > 1}

    print("=" * 72)
    print("(a) 跨主題重疊個股")
    print("=" * 72)
    print(f"  主題數 {len(themes)}　不重複個股 {len(tk2th)} 檔"
          f"　其中重疊 {len(dup)} 檔\n")
    if not dup:
        print("  無重疊。")
    for t, th in sorted(dup.items(), key=lambda x: (-len(x[1]), x[0])):
        print(f"  {t:<6} 隸屬 {len(th)} 個主題： {'、'.join(th)}")

    # ---- (b) 主題對 Jaccard 重疊度 ----
    print()
    print("=" * 72)
    print("(b) 主題對 Jaccard 重疊度（|交集| / |聯集|），由高至低")
    print("=" * 72)
    pairs = []
    for a, b in itertools.combinations(themes, 2):
        sa = set(themes[a]["tickers"])
        sb = set(themes[b]["tickers"])
        inter = sa & sb
        if inter:
            pairs.append((len(inter) / len(sa | sb), a, b, sorted(inter)))
    if not pairs:
        print("  所有主題兩兩之間皆無共用成分股。")
    for j, a, b, sh in sorted(pairs, reverse=True):
        flag = "  ⚠️ 偏高" if j >= 0.20 else ""
        print(f"  {j:.3f}  {a} ↔ {b}"
              f"　共用 {len(sh)} 檔: {'、'.join(sh)}{flag}")

    worst = max((p[0] for p in pairs), default=0.0)

    # ---- 影響評估與政策選項 ----
    print()
    print("=" * 72)
    print("重疊處理政策")
    print("=" * 72)
    print(f"  目前設定: overlap_policy = {policy}"
          f"　（最高 Jaccard {worst:.3f}）\n")

    print("""  none（預設，目前行為）
    每檔股票在所屬的每個主題裡都算完整一份權重。
    歷史可比性：不變，history.json 全段一致。
    適用：重疊比例低的時候。共用一兩檔、主題各有六七檔的情況下，
          單一個股對主題指數的影響本來就只有 1/n，推高的相關性有限。

  dilute（權重稀釋）
    一檔股票若隸屬 N 個主題，在每個主題裡的權重降為 1/N。
    每日只對「當天有報價的成分股」重新正規化權重，
    避免某天缺資料時整個主題被連帶稀釋。
    歷史可比性：⚠️ 會改變所有含重疊個股的主題指數，連帶改變橫斷面
          名次與 history.json 全段分數。切換後新舊分數不可直接比較。
    適用：重疊比例高、或要做主題間相關性／輪動分析時。

  擇一歸屬（未實作）
    每檔股票只留在最相關的一個主題。需要一套明確的歸屬規則
    （例如按營收占比或產業分類），而那是人工判斷，不適合程式自動決定。
    真要做的話直接改 themes.yaml 最乾淨，不需要程式開關。""")

    print(f"""
{'=' * 72}
本次結論
{'=' * 72}""")
    if worst < 0.20:
        print(f"""  最高 Jaccard 僅 {worst:.3f}，重疊程度輕微。
  維持 overlap_policy: none 是合理的——切換到 dilute 會讓
  history.json 的歷史分數全段不可比，代價大於收益。
  若之後要做主題間的相關性或領先落後分析，再重新評估。""")
    else:
        print(f"""  最高 Jaccard 達 {worst:.3f}，已有主題對共用相當比例的成分股。
  建議評估切換 overlap_policy: dilute，但要留意歷史可比性的代價。""")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"❌ 執行失敗: {e}")
        sys.exit(1)
