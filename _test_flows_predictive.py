#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
檢驗內部人交易（insider_net）與融券變化（short_chg）對主題未來分數
變化有沒有預測力。

背景：這兩個欄位目前只是顯示欄位，不進入評分（WEIGHTS 沒有它們）。
要判斷值不值得納入，得先有證據，而不是憑感覺加權重。

⚠️ 資料限制（很重要，看報告時務必先讀）
   flows.json 只是「當期快照」，SEC Form 4 與融券資料源都查不到任意
   過去日期，所以歷史必須靠 flows.py 每次執行累積到 flows_history.json。
   在累積足夠期數之前，這支腳本只能做「單一時點的橫斷面檢驗」：
   n = 主題數（約 20），全部來自同一天、同一個市場環境，彼此不獨立。
   那種樣本量談不上統計顯著性，只能當作方向性的初步觀察。

   累積夠期數（建議至少 30 期）後，本腳本會自動改跑合併多期的檢驗。

執行方式:  python _test_flows_predictive.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
HORIZONS = (5, 20)          # 檢驗未來幾個交易日的分數變化
MIN_PERIODS_FOR_POOLED = 30  # 幾期以上才做合併多期檢驗


def load(name):
    p = HERE / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"⚠️  {name} 讀取失敗: {e}")
        return None


def spearman(x, y):
    """等級相關。用等級而非皮爾森，避免少數極端值主導結論。"""
    s = pd.DataFrame({"x": x, "y": y}).dropna()
    if len(s) < 5 or s["x"].nunique() < 3:
        return None, len(s)
    return float(s["x"].rank().corr(s["y"].rank())), len(s)


def group_compare(x, y):
    """
    高低分組報酬差：把 x 由大到小排序，比較前三分之一與後三分之一
    的 y 平均。比相關係數直觀，也不需要假設線性關係。
    """
    s = pd.DataFrame({"x": x, "y": y}).dropna().sort_values("x", ascending=False)
    if len(s) < 6:
        return None
    k = max(2, len(s) // 3)
    hi, lo = s["y"].head(k).mean(), s["y"].tail(k).mean()
    return {"n_each": k, "high": float(hi), "low": float(lo), "spread": float(hi - lo)}


def report_block(title, x, fwd, label_x):
    print(f"\n--- {title} ---")
    for h, y in fwd.items():
        rho, n = spearman(x, y)
        g = group_compare(x, y)
        if rho is None:
            print(f"  未來 {h:>2} 日： 樣本不足（n={n}）")
            continue
        line = f"  未來 {h:>2} 日： Spearman ρ = {rho:+.3f}  (n={n})"
        if g:
            line += (f"　|　{label_x}高 {g['high']:+.2f} 分"
                     f" vs 低 {g['low']:+.2f} 分"
                     f"　價差 {g['spread']:+.2f}（每組 {g['n_each']} 個）")
        print(line)


def cross_section(flows, hist):
    """單一時點橫斷面檢驗：用 flows.json 的快照日期切一刀。"""
    stamp = (flows.get("generated_at") or "")[:10]
    dates = hist["dates"]
    if stamp not in dates:
        # 快照日不是交易日，取之後最近的一個交易日
        later = [d for d in dates if d >= stamp]
        if not later:
            print(f"❌ 快照日 {stamp} 晚於歷史資料最後一天 {dates[-1]}，無法檢驗。")
            return
        stamp = later[0]
    i = dates.index(stamp)

    themes = flows.get("themes", {})
    names = [n for n in themes if n in hist["themes"]]
    print(f"基準日: {dates[i]}　主題數: {len(names)}")

    fwd = {}
    for h in HORIZONS:
        if i + h >= len(dates):
            print(f"⚠️  未來 {h} 日超出歷史範圍（基準日後只剩 "
                  f"{len(dates) - 1 - i} 個交易日），略過此期距。")
            continue
        fwd[h] = pd.Series(
            {n: (hist["themes"][n][i + h] - hist["themes"][n][i])
             if (hist["themes"][n][i] is not None
                 and hist["themes"][n][i + h] is not None) else np.nan
             for n in names})
    if not fwd:
        print("❌ 沒有任何可用的未來期距。")
        return

    ins = pd.Series({n: themes[n].get("insider_net") for n in names}, dtype="float64")
    shc = pd.Series({n: themes[n].get("short_chg") for n in names}, dtype="float64")

    report_block("內部人淨買賣比 insider_net → 未來分數變化", ins, fwd, "內部人")
    report_block("融券月增幅 short_chg → 未來分數變化", shc, fwd, "融券增幅")


def pooled(fh, hist):
    """多期合併檢驗。有足夠期數後才會走到這裡。"""
    dates = hist["dates"]
    rows_ins, rows_shc, rows_fwd = [], [], {h: [] for h in HORIZONS}

    for stamp in sorted(fh):
        later = [d for d in dates if d >= stamp]
        if not later:
            continue
        i = dates.index(later[0])
        for name, v in fh[stamp].items():
            if name not in hist["themes"]:
                continue
            s = hist["themes"][name]
            if s[i] is None:
                continue
            ok = True
            fv = {}
            for h in HORIZONS:
                if i + h >= len(dates) or s[i + h] is None:
                    ok = False
                    break
                fv[h] = s[i + h] - s[i]
            if not ok:
                continue
            rows_ins.append(v.get("insider_net"))
            rows_shc.append(v.get("short_chg"))
            for h in HORIZONS:
                rows_fwd[h].append(fv[h])

    n = len(rows_ins)
    print(f"合併 {len(fh)} 期快照，得到 {n} 筆成對觀測")
    if n < 30:
        print("⚠️  成對觀測仍偏少，結論僅供參考。")
    ins = pd.Series(rows_ins, dtype="float64")
    shc = pd.Series(rows_shc, dtype="float64")
    fwd = {h: pd.Series(v, dtype="float64") for h, v in rows_fwd.items()}
    report_block("內部人淨買賣比 insider_net → 未來分數變化", ins, fwd, "內部人")
    report_block("融券月增幅 short_chg → 未來分數變化", shc, fwd, "融券增幅")


def main():
    hist = load("history.json")
    if not hist:
        print("❌ 找不到 history.json，請先執行 python radar.py")
        return 1

    fh = load("flows_history.json")
    flows = load("flows.json")

    print("=" * 70)
    print("內部人／融券 對未來主題分數的預測力檢驗")
    print("=" * 70)

    if fh and len(fh) >= MIN_PERIODS_FOR_POOLED:
        print(f"\n【多期合併檢驗】flows_history.json 已累積 {len(fh)} 期\n")
        pooled(fh, hist)
    else:
        have = len(fh) if fh else 0
        print(f"""
【單一時點橫斷面檢驗】

  flows_history.json 目前累積 {have} 期，未達合併檢驗門檻（{MIN_PERIODS_FOR_POOLED} 期），
  只能用最新快照做單一時點的橫斷面檢驗。

  ⚠️ 這個結果不足以支持任何納入評分的決定：
     樣本是同一天的約 20 個主題，全部處在同一個市場環境下，彼此不獨立，
     n 也太小。它只能告訴你「方向看起來像什麼」，不能告訴你「是否顯著」。
     flows.py 每次執行都會累積一期，約 {MIN_PERIODS_FOR_POOLED} 週後
     本腳本會自動改跑多期合併檢驗，屆時結論才有參考價值。
""")
        if not flows:
            print("❌ 找不到 flows.json，請先執行 python flows.py")
            return 1
        cross_section(flows, hist)

    print(f"""
{'=' * 70}
判讀說明
{'=' * 70}
  ρ 為正 = 該指標偏高時，主題未來分數傾向上升。
  分數是橫斷面名次（0–100），所以「分數變化」是相對名次的移動，
  不是絕對報酬——這裡檢驗的是「能不能預測輪動」，不是「能不能預測漲跌」。

  依交接文件要求，本腳本不改動 WEIGHTS，只輸出證據供人工判斷。
  要納入評分前，建議至少看到：多期合併、|ρ| 穩定站上 0.15 以上、
  且高低分組價差方向與 ρ 一致。
""")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"❌ 執行失敗: {e}")
        sys.exit(1)
