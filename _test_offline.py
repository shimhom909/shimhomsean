"""離線測試：用合成價格驗證計算邏輯（不需要網路）。"""
import sys, types, numpy as np, pandas as pd, yaml
from pathlib import Path

cfg = yaml.safe_load(Path("themes.yaml").read_text(encoding="utf-8"))
tk = sorted({t for v in cfg["themes"].values() for t in v["tickers"]} | {"SPY"})
dates = pd.bdate_range(end="2026-08-07", periods=400)
rng = np.random.default_rng(7)

close = pd.DataFrame(
    {t: 50 * np.exp(np.cumsum(rng.normal(0.0004, 0.022, len(dates)))) for t in tk},
    index=dates)
vol = pd.DataFrame(
    {t: rng.lognormal(14, 0.4, len(dates)) for t in tk}, index=dates)

# 模擬兩檔資料不足的無效代號
close["POET"] = np.nan
vol["POET"] = np.nan

fake = types.ModuleType("yfinance")
fake.download = lambda **kw: pd.concat({"Close": close, "Volume": vol}, axis=1)
sys.modules["yfinance"] = fake

import radar
radar.main()

import json
d = json.load(open("data.json", encoding="utf-8"))
print("\n主題數:", len(d["themes"]), "| 資料日:", d["data_date"])
for c in d["themes"][:4]:
    print(f"  {c['name']:<12} {c['score']:>5} {c['state']:<3} "
          f"RS20={c['rs20']:+.1f}% 廣度={c['breadth']}% 量比={c['volratio']} "
          f"點數={len(c['series'])} 訊號={c['signal']}")
assert all(0 <= c["score"] <= 100 for c in d["themes"]), "分數超出範圍"
assert all(len(c["series"]) == len(c["labels"]) for c in d["themes"]), "圖表資料不齊"
print("\n✅ 計算邏輯測試通過")
