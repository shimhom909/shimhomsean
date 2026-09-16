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
RATES = CFG.get("rate_watch", {}) or {}

HIST_DAYS = 250     # history.json 保留幾個交易日
SPARK_WEEKS = 30    # 大盤狀態列的迷你走勢圖顯示幾週
MIN_TICKERS = 4     # 主題有效成分股低於此數就整個略過（見 main()）

DROPPED = []        # fetch_prices 剔除掉的代號，供健康度檢查用

# ---------------------------------------------------------------- 動能因子
#
# ⚠️ 關於 rs20 與 roc20（實測結論，不是推測）
#
#   rs20 = roc20 − 同日大盤報酬。同一天所有主題減掉的是「同一個純量」，
#   而分數只吃橫斷面名次（cross_sectional_score 用 rank(axis=1, pct=True)）。
#   整排數字同減一個常數，相對名次完全不變 —— 也就是說：
#
#       rank(rs20) ≡ rank(roc20)   逐日恆等
#
#   實測 730 個交易日全數相同，最大排名差 0.00e+00。所以 legacy 這組
#   名目上是五因子，實際只有四個獨立因子，0.55 權重全押在同一個 20 日報酬。
#
#   注意：rs20 作為「顯示欄位」仍然有意義（卡片上的相對強度是真實資訊），
#   它只是作為「排名因子」不提供任何獨立資訊。所以修正方向不是刪掉 rs20，
#   而是把重複的那一份權重換成別的時間尺度。
#
# 切換 profile 會讓 history.json 的歷史分數不可比（同一天的名次會變），
# 所以預設維持 legacy；要改請在 themes.yaml 設 scoring.profile。
WEIGHT_PROFILES = {
    # 現行公式。保留原樣以維持歷史可比性。
    "legacy": {
        "rs20": 0.30,      # 相對大盤 20 日超額報酬（排名上等同 roc20）
        "roc20": 0.25,     # 自身 20 日報酬
        "breadth": 0.20,   # 成分股站上 50 日線比例
        "trend": 0.15,     # 主題指數偏離 50 日線幅度
        "volratio": 0.10,  # 5日均量 / 60日均量
    },
    # 把重複的那 0.25 換成 60 日報酬：拉開時間尺度，補上原本缺乏的
    # 中長期因子，同時不影響 rs20 的顯示用途。
    "decorrelated": {
        "rs20": 0.30,
        "roc60": 0.25,
        "breadth": 0.20,
        "trend": 0.15,
        "volratio": 0.10,
    },
}

OVERLAP_POLICY = CFG.get("overlap_policy", "none")
if OVERLAP_POLICY not in ("none", "dilute"):
    raise SystemExit(f"themes.yaml 的 overlap_policy 只能是 none/dilute，"
                     f"收到: {OVERLAP_POLICY}")

SCORING = CFG.get("scoring", {}) or {}
PROFILE = SCORING.get("profile", "legacy")
if PROFILE not in WEIGHT_PROFILES:
    raise SystemExit(f"themes.yaml 的 scoring.profile 只能是 "
                     f"{'/'.join(WEIGHT_PROFILES)}，收到: {PROFILE}")
WEIGHTS = WEIGHT_PROFILES[PROFILE]

ENTER = 55      # 分數上穿此值 = 新啟動
STRONG = 70     # 以上 = 加速
WEAK = 45       # 以下 = 衰竭

log = lambda m: print(f"[{dt.datetime.now():%H:%M:%S}] {m}", flush=True)


def num(v, dec=1, scale=1.0):
    """
    數值轉 JSON 安全的型別。

    非做不可的理由：Python 的 json.dumps 預設會把 NaN 寫成裸 NaN，那是
    Python 專屬的擴充，不是合法 JSON——瀏覽器 JSON.parse() 會直接拋錯，
    導致整個網站讀不到資料。而 NaN 很容易發生（例如某天所有成分股成交量
    為 0，volratio 整排就會變 NaN），所以每個要寫進 JSON 的數值都得過這關。
    寫檔時另外加 allow_nan=False 當第二道防線。
    """
    if v is None:
        return None
    try:
        f = float(v) * scale
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):      # NaN 與 ±inf 一律轉 null
        return None
    if dec is None:
        return f
    # dec=0 回傳 int，JSON 才不會出現 80.0 這種多餘的小數點
    return int(round(f)) if dec == 0 else round(f, dec)


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
    # 存到模組層級給健康度檢查用。刻意不改回傳值的形狀——
    # _compare_profiles.py 等呼叫端都預期兩個回傳值。
    global DROPPED
    DROPPED = dropped

    close = close[keep].ffill()
    volume = volume[keep].fillna(0)
    return close, volume


# ------------------------------------------------------ 主題指數與原始指標
def build_theme_index(close, tickers, weights=None):
    """
    等權重日報酬複合，起始 = 100。

    weights 給定時改用加權平均（overlap_policy: dilute 會用到）。
    兩種情況都只對「當天有報價的成分股」正規化，避免新上市股或
    當天缺資料的成分股把整個主題拖下來。
    """
    sub = close[tickers].dropna(how="all")
    rets = sub.pct_change(fill_method=None)

    if weights is None:
        eq = rets.mean(axis=1, skipna=True).fillna(0.0)
    else:
        w = pd.Series({t: float(weights.get(t, 1.0)) for t in tickers})
        wm = rets.notna().mul(w, axis=1)            # 當天有報價者才給權重
        denom = wm.sum(axis=1).replace(0, np.nan)   # 逐日重新正規化
        eq = (rets.fillna(0.0) * wm).sum(axis=1).div(denom).fillna(0.0)

    return 100.0 * (1.0 + eq).cumprod()


def dilution_weights(themes):
    """
    一檔股票隸屬 N 個主題時，在每個主題裡的權重降為 1/N。

    用意是避免共用成分股讓多個主題的指數天然同步、人為推高彼此相關性。
    代價是會改變所有含重疊個股的主題指數，連帶改變橫斷面名次——
    也就是 history.json 的歷史分數會全段不可比，所以預設不啟用。
    """
    cnt = {}
    for conf in themes.values():
        for t in conf["tickers"]:
            cnt[t] = cnt.get(t, 0) + 1
    return {t: 1.0 / n for t, n in cnt.items()}


def raw_metrics(idx, close, volume, tickers, bench_idx):
    """回傳每日各項原始指標的 DataFrame。"""
    m = pd.DataFrame(index=idx.index)

    m["roc20"] = idx.pct_change(20)
    m["roc60"] = idx.pct_change(60)     # decorrelated profile 用；也一併輸出供對照
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


# ------------------------------------------------------------ 債市壓力預警
# 這一層刻意把「觸發」和「曝險」分開量測：
#   觸發 = 債市現在是不是在被大量／持續拋售（rate_pressure）
#   曝險 = 每個主題對殖利率變動的實際敏感度（rate_beta，用迴歸量出來的）
# 動能指標本質是同時／落後指標，等主題分數跌下來才反應已經慢了；
# 但「曝險」是事前就知道的——殖利率真的動起來時，哪些主題會先被打到，
# 不必等它們的動能自己壞掉。這不是預測債市，是把反應時間往前挪。

def rate_beta(ret, dy, window):
    """
    主題日報酬對殖利率日變動(bps)的迴歸斜率，單位 %報酬/bp。
    負值 = 殖利率上升時該主題下跌，越負越敏感。
    同時回傳相關係數——beta 大但相關低代表雜訊多，不能只看斜率。
    """
    df = pd.concat([ret.rename("r"), dy.rename("dy")], axis=1).dropna().tail(window)
    if len(df) < max(40, window // 3) or df["dy"].var() == 0:
        return None, None
    beta = df["r"].mul(100).cov(df["dy"]) / df["dy"].var()
    return round(float(beta), 4), round(float(df["r"].corr(df["dy"])), 2)


def _pctile(s, win=250):
    """目前數值落在近 win 期的第幾百分位。"""
    t = s.tail(win).dropna()
    return None if len(t) < 30 else round(float((t <= t.iloc[-1]).mean() * 100))


def driver_slopes(close):
    """
    拆解「美債」和「聯準會」兩種不同的驅動力。

    原本只有「30Y − 13週」一條期限利差，兩種驅動力混在同一個數字裡：
      - 美債／期限溢酬：財政供給、拍賣需求弱、外國買盤縮手，壓力集中在
        最長天期。用 30Y − 10Y 量——只看長端自己有沒有比 10Y 賣得更凶，
        跟聯準會近兩年的政策路徑基本無關。
      - 聯準會／政策路徑預期：CPI/PCE、FOMC 會後聲明改變降息/升息預期，
        壓力集中在中短天期。用 5Y − 3個月期 量——這段對政策預期最敏感，
        又不像 13週期那樣幾乎被目前政策利率釘死。
    兩條斜率同一天各自的 20 日變動，絕對值較大的那個就是這段期間的
    主要驅動力。這是簡單的歸因，不是因果推論，但比只看一個混合訊號
    更能回答「這次是美債還是聯準會」。
    """
    y30t, y10t = RATES.get("y30"), RATES.get("y10")
    y5t, yst = RATES.get("y5"), RATES.get("y_short")
    out = {}

    if y30t in close.columns and y10t in close.columns:
        s = (close[y30t] - close[y10t]).dropna()
        if len(s) > 21:
            out["debt_slope"] = round(float(s.iloc[-1]), 2)
            out["debt_slope_chg20"] = round(float(s.iloc[-1] - s.iloc[-21]) * 100)

    if y5t in close.columns and yst in close.columns:
        s = (close[y5t] - close[yst]).dropna()
        if len(s) > 21:
            out["fed_slope"] = round(float(s.iloc[-1]), 2)
            out["fed_slope_chg20"] = round(float(s.iloc[-1] - s.iloc[-21]) * 100)

    dchg, fchg = out.get("debt_slope_chg20"), out.get("fed_slope_chg20")
    if dchg is not None and fchg is not None:
        if abs(dchg) < 3 and abs(fchg) < 3:
            out["driver"] = "不明顯"          # 兩邊都沒什麼動靜，別硬歸因
        elif abs(dchg) >= abs(fchg) * 1.3:
            out["driver"] = "美債主導"
        elif abs(fchg) >= abs(dchg) * 1.3:
            out["driver"] = "聯準會主導"
        else:
            out["driver"] = "混合"
    return out


def fomc_status(as_of):
    """
    離下一場 FOMC 決議公布還有幾個交易日、上一場過了幾天。

    會議前後市場波動天生偏高，不是系統的訊號變準了，是這幾天本來就
    容易雜訊大——「接近會議」本身就是該提高警覺的資訊，不必等殖利率
    真的動了才知道。日期表要每年底手動補，見 themes.yaml 的說明。
    """
    dates = sorted(RATES.get("fomc_dates", []))
    if not dates:
        return None
    ds = [dt.date.fromisoformat(d) for d in dates]
    ad = as_of.date() if hasattr(as_of, "date") else as_of

    future = [d for d in ds if d >= ad]
    past = [d for d in ds if d < ad]
    nxt = future[0] if future else None
    last = past[-1] if past else None

    return {
        "next_date": nxt.isoformat() if nxt else None,
        "days_to_next": (nxt - ad).days if nxt else None,
        "last_date": last.isoformat() if last else None,
        "days_since_last": (ad - last).days if last else None,
        # 會議日當天或前後各 2 個日曆天：決議公布前的猜測期 + 公布後的消化期
        "in_window": bool(nxt and (nxt - ad).days <= 2)
                     or bool(last and (ad - last).days <= 2),
    }


def rate_layer(close, volume, indices):
    """債市狀態 + 各主題曝險。缺任何一項資料就整層略過，不讓主流程掛掉。"""
    y10t = RATES.get("y10")
    if not y10t or y10t not in close.columns:
        log("ℹ️  無殖利率資料，略過債市壓力層")
        return None, {}

    y10 = close[y10t].dropna()
    dy = y10.diff() * 100                      # ^TNX 報價為百分比，×100 = bps
    win = int(RATES.get("beta_window", 120))

    out = {
        "y10": round(float(y10.iloc[-1]), 2),
        "y10_chg20": round(float(y10.iloc[-1] - y10.iloc[-21]) * 100) if len(y10) > 21 else None,
        "y10_chg60": round(float(y10.iloc[-1] - y10.iloc[-61]) * 100) if len(y10) > 61 else None,
        "y10_pctile": _pctile(y10),
        "y10_high250": bool(len(y10) >= 60 and y10.iloc[-1] >= y10.tail(250).max()),
    }

    # 期限利差走陡（長端賣得比短端凶）最傷長天期資產，跟單看殖利率水準不同。
    # 這條是原本的整體訊號（用於下面的五項計票），driver_slopes() 另外
    # 拆出美債／聯準會兩條子訊號，回答「這次是哪一種在動」。
    y30t, yst = RATES.get("y30"), RATES.get("y_short")
    if y30t in close.columns and yst in close.columns:
        curve = (close[y30t] - close[yst]).dropna()
        out["curve"] = round(float(curve.iloc[-1]), 2)
        out["curve_chg20"] = (round(float(curve.iloc[-1] - curve.iloc[-21]) * 100)
                              if len(curve) > 21 else None)

    out.update(driver_slopes(close))
    out["fomc"] = fomc_status(close.index[-1])

    mv = RATES.get("bondvol")
    if mv in close.columns:
        m = close[mv].dropna()
        out["move"] = round(float(m.iloc[-1]), 1)
        out["move_pctile"] = _pctile(m)

    # 「大量」拋售：殖利率指數沒有成交量，只能靠債券 ETF 的價跌＋爆量來確認
    etfs = []
    for t in RATES.get("etfs", []):
        if t not in close.columns:
            continue
        p, v = close[t].dropna(), volume[t].replace(0, np.nan).dropna()
        if len(p) < 61 or len(v) < 61:
            continue
        vr = float(v.tail(5).mean() / v.tail(60).mean())
        etfs.append({
            "t": t,
            "volratio": num(vr, 2),
            "ret20": num(p.iloc[-1] / p.iloc[-21] - 1, 1, 100),
            "heavy": bool(vr > 1.20 and p.iloc[-1] < p.iloc[-21]),   # 價跌且爆量
        })
    out["etfs"] = etfs

    # 五項計票，跟大盤環境用同一套邏輯：簡單、看得懂、不調參
    checks = [
        (out["y10_pctile"] or 0) >= 80,                    # 殖利率處於高檔區
        (out["y10_chg20"] or 0) >= 15,                     # 近一個月持續走升
        (out.get("curve_chg20") or 0) >= 10,               # 長端走陡
        (out.get("move_pctile") or 0) >= 70,               # 債市波動偏高
        any(e["heavy"] for e in etfs),                     # 出現價跌爆量的拋售
    ]
    out["stress"] = sum(1 for c in checks if c)
    out["stress_label"] = ("高壓" if out["stress"] >= 4
                           else "升壓" if out["stress"] >= 2 else "平穩")
    out["checks"] = {
        "殖利率高檔": bool(checks[0]), "持續走升": bool(checks[1]),
        "長端走陡": bool(checks[2]), "債市波動高": bool(checks[3]),
        "價跌爆量": bool(checks[4]),
    }

    # 避險端量測：算出實際 beta，才知道誰真的抵銷利率風險。
    # 這是量測不是推薦——名字像避險不代表數據上真的避得掉。
    probe = []
    for t in RATES.get("hedge_probe", []):
        if t not in close.columns:
            continue
        b, c = rate_beta(close[t].pct_change(fill_method=None), dy, win)
        if b is not None:
            probe.append({"t": t, "beta": b, "corr": c})
    out["hedge_probe"] = sorted(probe, key=lambda x: -x["beta"])

    # 各主題曝險
    betas = {}
    for name, idx in indices.items():
        b, c = rate_beta(idx.pct_change(fill_method=None), dy, win)
        if b is None:
            continue
        # 曝險 × 觸發：照近 20 日殖利率的實際變動，估這段期間的利率拖累
        drag = (round(b * out["y10_chg20"], 1)
                if out["y10_chg20"] is not None else None)
        betas[name] = {"beta": b, "corr": c, "drag20": drag}
    out["beta_window"] = win

    return out, betas


# ------------------------------------------------------------- 系統健康度
# 把「這個系統現在健不健康」變成可自動監控的指標，而不是靠人每次跑完
# 去讀 log。這裡只放能自動判定達標與否的東西——每一項都要有明確目標值，
# 沒有目標就只是數字牆，看久了會麻痺。

def check(label, value, target, direction, unit="", note="", near=0.15):
    """
    一項健康度檢查。

    direction: "gte" = 越大越好（value >= target 為達標）
               "lte" = 越小越好（value <= target 為達標）
    near: 距離目標多少比例內算「接近」，差一點點跟差很多要分得出來。
    value 為 None 代表沒資料——那不算未達，是另一種狀態，不能混為一談。
    """
    if value is None:
        status = "nodata"
        pct = 0.0
    elif direction == "gte":
        status = "ok" if value >= target else (
            "near" if target > 0 and value >= target * (1 - near) else "bad")
        pct = min(1.0, value / target) if target else 1.0
    else:
        status = "ok" if value <= target else (
            "near" if value <= target * (1 + near) else "bad")
        pct = min(1.0, target / value) if value else 1.0
    return {"label": label, "value": num(value, 2), "target": target,
            "dir": direction, "unit": unit, "status": status,
            "pct": num(pct * 100, 0), "note": note}


def _file_age_days(path):
    """檔案內 generated_at 距今幾天。抓不到就回 None（無資料，不是 0）。"""
    if not path.exists():
        return None, None
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        stamp = d.get("generated_at")
        if not stamp:
            return None, d
        gen = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if gen.tzinfo is None:
            gen = gen.replace(tzinfo=dt.timezone.utc)
        age = (dt.datetime.now(dt.timezone.utc) - gen).total_seconds() / 86400
        return age, d
    except Exception:
        return None, None


def health_report(themes, valid, cards, latest_date, hist_len):
    """系統規模 + 資料品質。每一項都對照明確目標值。"""
    sizes = sorted(len(v) for v in valid.values())
    med = sizes[len(sizes) // 2] if sizes else 0
    at_floor = [n for n, v in valid.items() if len(v) == MIN_TICKERS]

    declared = {t for c in themes.values() for t in c["tickers"]}
    used = {t for v in valid.values() for t in v}
    valid_rate = len(used) / len(declared) * 100 if declared else None

    # 資料新鮮度：交易日與今天的差。週末假日會自然拉高，所以目標放寬到 4 天。
    age_days = (dt.datetime.now(dt.timezone.utc).date()
                - latest_date.date()).days

    flows_age, fl = _file_age_days(HERE / "flows.json")
    chain_age, ch = _file_age_days(HERE / "twchain.json")

    # 覆蓋率：有多少主題真的拿得到這些欄位（不是全部主題都有）
    def cover(fn):
        if not cards:
            return None
        return sum(1 for c in cards if fn(c)) / len(cards) * 100

    ins_cov = cover(lambda c: (c.get("flows") or {}).get("insider_net") is not None)
    sh_cov = cover(lambda c: (c.get("flows") or {}).get("short_pct") is not None)
    rate_cov = cover(lambda c: c.get("rate") is not None)

    fh = HERE / "flows_history.json"
    fh_periods = None
    if fh.exists():
        try:
            fh_periods = len(json.loads(fh.read_text(encoding="utf-8")))
        except Exception:
            pass

    groups = [
        {
            "title": "資料新鮮度",
            "hint": "資料多久沒更新。過期的訊號比沒有訊號更危險——"
                    "看起來還在動，其實是舊的。",
            "checks": [
                check("行情資料落後", age_days, 4, "lte", "天",
                      f"最新交易日 {latest_date:%Y-%m-%d}"),
                check("資金流向資料年齡", flows_age, 14, "lte", "天",
                      "flows.py 每週二執行，超過兩週代表排程或快取出問題"),
                check("台廠營收資料年齡", chain_age, 45, "lte", "天",
                      "twrev.py 每月 11–15 日執行"),
            ],
        },
        {
            "title": "主題覆蓋度",
            "hint": f"成分股太少的主題不穩定：低於 {MIN_TICKERS} 檔會被整個略過，"
                    f"剛好卡在 {MIN_TICKERS} 檔的再掉一檔就會消失。",
            "checks": [
                check("成分股中位數", med, 6, "gte", "檔",
                      f"最少 {sizes[0] if sizes else 0} 檔／最多 {sizes[-1] if sizes else 0} 檔"),
                check("卡門檻主題數", len(at_floor), 0, "lte", "個",
                      "、".join(at_floor) if at_floor else "無"),
                check("代號有效率", valid_rate, 95, "gte", "%",
                      f"已剔除 {len(DROPPED)} 檔：{'、'.join(DROPPED) if DROPPED else '無'}"),
            ],
        },
        {
            "title": "欄位覆蓋率",
            "hint": "有多少主題真的拿得到這些資料。覆蓋率低的欄位，"
                    "在儀表板上看到的只是少數主題的狀況。",
            "checks": [
                check("內部人資料覆蓋", ins_cov, 80, "gte", "%"),
                check("融券資料覆蓋", sh_cov, 80, "gte", "%"),
                check("利率曝險覆蓋", rate_cov, 90, "gte", "%"),
                check("流向歷史累積", fh_periods, 30, "gte", "期",
                      "累積滿 30 期後 _test_flows_predictive.py 才能做多期檢驗"),
            ],
        },
    ]

    return {
        "scale": {
            "themes": len(valid),
            "themes_declared": len(themes),
            "tickers": len(used),
            "tickers_declared": len(declared),
            "hist_days": hist_len,
            "tw_suppliers": len((ch or {}).get("suppliers", {})) or None,
            "tw_us": len((ch or {}).get("us", {})) or None,
        },
        "groups": groups,
    }


# ------------------------------------------------------------- 週輪動摘要
ROTATION_DAYS = 5      # 一週的交易日數


def rotation_digest(scores):
    """
    這週資金往哪輪、從哪輪出。

    分數是橫斷面名次，所以「分數變化」天生就是零和的——有人上去必有人下來，
    這正好是輪動要看的東西（絕對漲跌看大盤環境列，不看這裡）。

    狀態跨越（中性→啟動、啟動→衰竭之類）比分數變化更值得看：分數動 3 分
    可能只是雜訊，但跨過門檻代表它換了一個處境。
    """
    if len(scores) < ROTATION_DAYS + 1:
        return None

    cur, prev = scores.iloc[-1], scores.iloc[-1 - ROTATION_DAYS]
    rank_cur = cur.rank(ascending=False, na_option="keep")
    rank_prev = prev.rank(ascending=False, na_option="keep")

    rows = []
    for name in scores.columns:
        if pd.isna(cur[name]) or pd.isna(prev[name]):
            continue
        s_cur, s_prev = float(cur[name]), float(prev[name])
        st_cur, st_prev = classify(s_cur), classify(s_prev)
        rows.append({
            "name": name,
            "score": round(s_cur, 1),
            "chg": round(s_cur - s_prev, 1),
            "rank": int(rank_cur[name]),
            # 名次變動取正號為「上升」，跟直覺一致（第 8 名→第 3 名 = +5）
            "rank_chg": int(rank_prev[name] - rank_cur[name]),
            "state": st_cur,
            "state_prev": st_prev,
            "crossed": st_cur != st_prev,
        })

    if not rows:
        return None

    order = {"加速": 3, "啟動": 2, "中性": 1, "衰竭": 0}
    ups = [r for r in rows if r["crossed"] and order[r["state"]] > order[r["state_prev"]]]
    downs = [r for r in rows if r["crossed"] and order[r["state"]] < order[r["state_prev"]]]

    by_chg = sorted(rows, key=lambda r: -r["chg"])
    return {
        "window_days": ROTATION_DAYS,
        "from_date": scores.index[-1 - ROTATION_DAYS].strftime("%Y-%m-%d"),
        "to_date": scores.index[-1].strftime("%Y-%m-%d"),
        "inflow": [r for r in by_chg if r["chg"] > 0][:5],
        "outflow": [r for r in reversed(by_chg) if r["chg"] < 0][:5],
        "upgrades": sorted(ups, key=lambda r: -r["chg"]),
        "downgrades": sorted(downs, key=lambda r: r["chg"]),
        "all": by_chg,
    }


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
        json.dumps(hist, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8"
    )
    log(f"✅ 已寫出 history.json（{len(tail)} 個交易日 × {len(tail.columns)} 個主題）")


# ------------------------------------------------------------------- 主流程
def main():
    themes = CFG["themes"]
    theme_tickers = sorted({t for v in themes.values() for t in v["tickers"]})
    macro_tk = {r[k] for r in MACRO for k in ("num", "den") if r.get(k)}
    rate_tk = {RATES[k] for k in ("y10", "y30", "y5", "y_short", "bondvol") if RATES.get(k)}
    rate_tk |= set(RATES.get("etfs", [])) | set(RATES.get("hedge_probe", []))
    all_tickers = sorted(set(theme_tickers) | macro_tk | rate_tk | {BENCH})

    close, volume = fetch_prices(all_tickers)
    if BENCH not in close.columns:
        raise RuntimeError(f"基準 {BENCH} 沒抓到資料，無法計算相對強度。")
    bench_idx = close[BENCH]

    indices, metrics, valid = {}, {}, {}

    # 重疊個股的權重稀釋。預設 none（每檔在每個主題都算完整一份），
    # 切換成 dilute 會改變歷史分數，詳見 _audit_overlap.py 的說明。
    dweights = dilution_weights(themes) if OVERLAP_POLICY == "dilute" else None
    if dweights:
        shared = sum(1 for w in dweights.values() if w < 1.0)
        log(f"重疊政策: dilute（{shared} 檔重疊個股權重已稀釋）")

    for name, conf in themes.items():
        have = [t for t in conf["tickers"] if t in close.columns]
        if len(have) < MIN_TICKERS:
            log(f"⚠️  「{name}」有效成分股只剩 {len(have)} 檔，跳過")
            continue
        idx = build_theme_index(close, have, dweights)
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

    # ---- 債市壓力與各主題利率曝險 ----
    rates, rbetas = rate_layer(close, volume, indices)
    if rates:
        hit = [k for k, v in rates["checks"].items() if v]
        log(f"債市壓力: {rates['stress_label']}（{rates['stress']}/5）· "
            f"10Y {rates['y10']:.2f}% 第 {rates['y10_pctile']} 百分位 · "
            f"20日 {fmt(rates['y10_chg20'], '+d')}bps"
            + (f" · 觸發: {'、'.join(hit)}" if hit else ""))

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
            "rs20": num(metrics[name]["rs20"].iloc[-1], 1, 100),
            "roc20": num(metrics[name]["roc20"].iloc[-1], 1, 100),
            "roc60": num(metrics[name]["roc60"].iloc[-1], 1, 100),
            "breadth": num(metrics[name]["breadth"].iloc[-1], 0, 100),
            "volratio": num(vr, 2),
            "n": len(valid[name]),
            "tickers": valid[name],
            "series": [round(float(v), 1) for v in weekly.values],
            "labels": [d.strftime("%m/%d") for d in weekly.index],
            "rate": rbetas.get(name),
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

    # ---- 系統健康度 ----
    health = health_report(themes, valid, cards, latest_date,
                           len(scores.tail(HIST_DAYS)))
    bad = [c["label"] for g in health["groups"] for c in g["checks"]
           if c["status"] == "bad"]
    nod = [c["label"] for g in health["groups"] for c in g["checks"]
           if c["status"] == "nodata"]
    log(f"系統健康度: 未達 {len(bad)} 項"
        + (f"（{'、'.join(bad)}）" if bad else "")
        + (f" · 無資料 {len(nod)} 項" if nod else ""))

    # ---- 週輪動摘要 ----
    rot = rotation_digest(scores)
    if rot:
        head = "；".join(f"{r['name']} {r['chg']:+.1f}" for r in rot["inflow"][:3])
        log(f"週輪動（{rot['from_date']}→{rot['to_date']}）輪入前三：{head or '無'}"
            + (f" · 狀態升級 {len(rot['upgrades'])} 個"
               f"／降級 {len(rot['downgrades'])} 個" if rot["upgrades"] or rot["downgrades"] else ""))

    out = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "data_date": latest_date.strftime("%Y-%m-%d"),
        "benchmark": BENCH,
        "scoring_profile": PROFILE,     # 哪一組權重算出來的，跨版本比對時要看這個
        "thresholds": {"enter": ENTER, "strong": STRONG, "weak": WEAK},
        "market": market,
        "rates": rates,
        "rotation": rot,
        "health": health,
        "themes": cards,
    }
    # allow_nan=False：寧可在這裡炸掉，也不要靜靜寫出瀏覽器讀不了的 JSON
    (HERE / "data.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8"
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
