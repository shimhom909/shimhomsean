"""離線測試 twrev.py：mock TWSE 回應，驗證民國年轉換、欄位解析、匯總。"""
import sys, json, yaml, os
from pathlib import Path

for f in ("twrev_history.json", "twchain.json"):
    if os.path.exists(f):
        os.remove(f)

chain = yaml.safe_load(Path("supply_chain.yaml").read_text(encoding="utf-8"))
codes = list(chain["suppliers"])

import twrev

# ---- 單元測試：民國年與數值解析 ----
assert twrev.roc_to_ym("11506") == "2026-06", twrev.roc_to_ym("11506")
assert twrev.roc_to_ym("1150710") == "2026-07"
assert twrev.roc_to_ym("11513") is None, "月份 13 應視為無效"
assert twrev.roc_to_ym("") is None
assert twrev.num("1,234,567") == 1234567.0
assert twrev.num("－") is None and twrev.num("") is None and twrev.num("N/A") is None
print("✓ 民國年轉換與數值解析正確")

r = {"營業收入-當月營收": "100", "累計營業收入-當月累計營收": "999",
     "營業收入-去年同月增減(%)": "12.5"}
assert twrev.pick(r, "當月營收") == "100"
assert twrev.pick(r, "去年同月增減") == "12.5"
print("✓ 中文欄位模糊比對正確")

# ---- mock 全市場快照 ----
YOY = {"2330": 35.0, "2382": 88.0, "6669": 120.0, "3231": 45.0, "2317": 12.0,
       "2308": 28.0, "2345": 66.0, "3661": 95.0, "2383": 70.0, "3037": 22.0}

def make_rows(period="11506", scale=1.0):
    rows = []
    for c in codes:
        if chain["suppliers"][c].get("market") == "tpex":
            continue          # 模擬上櫃不在此端點
        rows.append({
            "公司代號": c,
            "公司名稱": chain["suppliers"][c]["name"],
            "資料年月": period,
            "出表日期": "1150810",
            "營業收入-當月營收": f"{int(1_000_000 * scale):,}",
            "營業收入-上月營收": "950,000",
            "營業收入-去年當月營收": "800,000",
            "營業收入-上月比較增減(%)": "5.3",
            "營業收入-去年同月增減(%)": str(YOY.get(c, 8.0)),
            "累計營業收入-當月累計營收": "6,000,000",
        })
    # 加入一堆不相關公司，模擬全市場
    for i in range(900):
        rows.append({"公司代號": f"9{i:03d}", "公司名稱": "其他",
                     "資料年月": period, "營業收入-當月營收": "1,000",
                     "營業收入-去年同月增減(%)": "1.0"})
    return rows

twrev.fetch = lambda url, tries=3: make_rows()
twrev.main()

d = json.load(open("twchain.json", encoding="utf-8"))
print(f"\n資料年月: {d['period']} | 供應商 {len(d['suppliers'])} | 美股 {len(d['us'])}")
for us, v in sorted(d["us"].items(), key=lambda x: -x[1]["reading"])[:5]:
    names = "、".join(s["name"] for s in v["suppliers"][:3])
    print(f"  {us:<5} 讀數{v['reading']:+6.1f}%  {v['direction']:<4} "
          f"一致{v['agreement']}% 信心{v['confidence']:<3} ← {names}")

assert d["period"] == "2026-06"
assert "NVDA" in d["us"], "NVDA 應有推估"
nv = d["us"]["NVDA"]
assert nv["n_suppliers"] >= 5, nv["n_suppliers"]
assert nv["reading"] > 30, f"高成長供應商應推出強勁讀數，實得 {nv['reading']}"
assert d["us"]["NVDA"]["confidence"] <= 100
# 上櫃應被排除且不炸掉
assert "5274" not in d["suppliers"], "上櫃不該出現在此端點"
print("✓ 上櫃缺資料時安全降級")

# ---- 測試歷史累積 ----
for p, sc in [("11507", 1.1), ("11508", 1.25)]:
    twrev.fetch = lambda url, tries=3, _p=p, _s=sc: make_rows(_p, _s)
    twrev.main()
h = json.load(open("twrev_history.json", encoding="utf-8"))
print(f"\n歷史累積: {len(h)} 家公司，2330 有 {len(h['2330'])} 期 → {sorted(h['2330'])}")
assert len(h["2330"]) == 3, "應累積三期"
print("\n✅ twrev.py 測試通過")
