"""離線測試：用合成價格驗證計算邏輯（不需要網路）。"""
import sys, types, json, shutil, tempfile, numpy as np, pandas as pd, yaml
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

# 測試必須寫到暫存目錄，不能碰專案根目錄的真實輸出。
# radar.main() 用模組層級的 HERE 決定寫檔位置，改掉它就能隔離；
# CFG 在 import 時已從真實 themes.yaml 讀完，所以主題定義仍是實際設定。
# （沒有這層隔離的話，跑一次測試就會把 data.json / history.json
#   蓋成隨機合成資料，得重跑 radar.py 才能還原。）
tmp = Path(tempfile.mkdtemp(prefix="radar_test_"))
radar.HERE = tmp
try:
    radar.main()

    d = json.loads((tmp / "data.json").read_text(encoding="utf-8"))
    print("\n主題數:", len(d["themes"]), "| 資料日:", d["data_date"])
    for c in d["themes"][:4]:
        print(f"  {c['name']:<12} {c['score']:>5} {c['state']:<3} "
              f"RS20={c['rs20']:+.1f}% 廣度={c['breadth']}% 量比={c['volratio']} "
              f"點數={len(c['series'])} 訊號={c['signal']}")
    assert all(0 <= c["score"] <= 100 for c in d["themes"]), "分數超出範圍"
    assert all(len(c["series"]) == len(c["labels"]) for c in d["themes"]), "圖表資料不齊"

    # 絕對報酬欄位要跟著分數一起輸出（A3：百分位分數需要絕對值對照）
    assert all("roc20" in c for c in d["themes"]), "缺少 roc20 絕對報酬欄位"

    h = json.loads((tmp / "history.json").read_text(encoding="utf-8"))
    assert len(h["dates"]) == len(next(iter(h["themes"].values()))), "歷史長度不一致"

    # 確認真的沒有汙染專案目錄
    assert radar.HERE == tmp, "寫檔路徑被改回專案目錄"
    print(f"\n輸出寫到暫存目錄: {tmp}")
    print("✅ 計算邏輯測試通過")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
