"""離線測試 flows.py：用假的 SEC 回應驗證解析與匯總邏輯。"""
import sys, types, json, yaml
from pathlib import Path

cfg = yaml.safe_load(Path("themes.yaml").read_text(encoding="utf-8"))
tks = sorted({t for v in cfg["themes"].values() for t in v["tickers"]})

FORM4 = """<?xml version="1.0"?>
<ownershipDocument>
 <periodOfReport>2026-08-05</periodOfReport>
 <issuer><issuerTradingSymbol>TEST</issuerTradingSymbol></issuer>
 <reportingOwner><reportingOwnerRelationship>
   <isDirector>1</isDirector><isOfficer>1</isOfficer>
 </reportingOwnerRelationship></reportingOwner>
 <nonDerivativeTable>
  <nonDerivativeTransaction>
   <transactionDate><value>2026-08-05</value></transactionDate>
   <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
   <transactionAmounts>
    <transactionShares><value>1000</value></transactionShares>
    <transactionPricePerShare><value>50.0</value></transactionPricePerShare>
   </transactionAmounts>
  </nonDerivativeTransaction>
  <nonDerivativeTransaction>
   <transactionDate><value>2026-08-04</value></transactionDate>
   <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
   <transactionAmounts>
    <transactionShares><value>400</value></transactionShares>
    <transactionPricePerShare><value>50.0</value></transactionPricePerShare>
   </transactionAmounts>
  </nonDerivativeTransaction>
  <nonDerivativeTransaction>
   <transactionDate><value>2026-08-03</value></transactionDate>
   <transactionCoding><transactionCode>A</transactionCode></transactionCoding>
   <transactionAmounts>
    <transactionShares><value>9999</value></transactionShares>
    <transactionPricePerShare><value>50.0</value></transactionPricePerShare>
   </transactionAmounts>
  </nonDerivativeTransaction>
 </nonDerivativeTable>
</ownershipDocument>"""

import flows

# ---- 驗證 Form 4 解析 ----
txs = flows.parse_form4(FORM4)
assert len(txs) == 2, f"應只取 P/S 兩筆，實際 {len(txs)}"
assert {t['code'] for t in txs} == {"P", "S"}, "配股 A 應被排除"
assert txs[0]["usd"] == 50000, txs[0]
print("✓ Form 4 解析正確：排除配股/選擇權，只留公開市場買賣")

# 畸形輸入不應炸掉
assert flows.parse_form4("<garbage>") == []
assert flows.parse_form4("") == []
print("✓ 畸形輸入安全處理")

# ---- mock 網路層 ----
def fake_get(url, as_json=False, tries=3):
    if "company_tickers" in url:
        return {str(i): {"ticker": t, "cik_str": 1000 + i} for i, t in enumerate(tks)}
    if "submissions" in url:
        return {"filings": {"recent": {
            "form": ["4", "4", "8-K"],
            "filingDate": ["2026-08-06", "2026-08-05", "2026-08-01"],
            "accessionNumber": ["0001-26-000001", "0001-26-000002", "0001-26-000003"],
            "primaryDocument": ["wf-form4_1.xml", "xslF345X05/wf-form4_2.xml", "x.htm"],
        }}}
    return FORM4
flows.get = fake_get

fake_yf = types.ModuleType("yfinance")
class T:
    def __init__(self, t): self.t = t
    def get_info(self):
        return {"sharesShort": 5_000_000, "sharesShortPriorMonth": 4_000_000,
                "floatShares": 100_000_000}
fake_yf.Ticker = T
sys.modules["yfinance"] = fake_yf

flows.main()

d = json.load(open("flows.json", encoding="utf-8"))
print(f"\n主題數: {len(d['themes'])}")
for n in list(d["themes"])[:3]:
    v = d["themes"][n]
    print(f"  {n:<12} 內部人淨={v['insider_net']:+d} "
          f"買${v['insider_buy_usd']:,} 賣${v['insider_sell_usd']:,} "
          f"融券={v['short_pct']}% ({v['short_chg']:+}%)")

v = d["themes"][list(d["themes"])[0]]
assert v["insider_net"] == 43, f"淨買賣比計算錯誤: {v['insider_net']}"
assert v["short_pct"] == 5.0, v["short_pct"]
assert v["short_chg"] == 25.0, v["short_chg"]
print("\n✅ flows.py 邏輯測試通過")
