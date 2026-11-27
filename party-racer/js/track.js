// 賽道幾何：把控制點變成平滑的封閉曲線，並提供「車子在賽道哪裡」的查詢。
// 純計算、不碰 DOM，主機畫面與 Node 測試都會用到。

export const SAMPLE_STEP = 8;      // 中心線取樣間距（世界單位）
export const RUNOFF = 34;          // 柏油外側的砂石緩衝區寬度，再外面是護欄

// 向心 Catmull-Rom（alpha=0.5）：通過每個控制點且不會打結
function catmullRomClosed(points, perSeg) {
  const n = points.length;
  const out = [];
  const P = (i) => points[(i + n) % n];
  const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5);
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / perSeg;
      const lerp = (a, b, ta, tb) => {
        const w = tb - ta || 1e-6;
        return [a[0] * (tb - t) / w + b[0] * (t - ta) / w, a[1] * (tb - t) / w + b[1] * (t - ta) / w];
      };
      const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
      const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
      out.push(lerp(B1, B2, t1, t2));
    }
  }
  return out;
}

// 依弧長重新等距取樣
function resampleClosed(raw, step) {
  const n = raw.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = raw[i - 1], b = raw[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[n];
  const count = Math.max(16, Math.round(total / step));
  const ds = total / count;
  const pts = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = k * ds;
    while (cum[j + 1] < target) j++;
    const a = raw[j], b = raw[(j + 1) % n];
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f });
  }
  return { pts, ds, total };
}

export function buildTrack(def) {
  const raw = catmullRomClosed(def.points, 40);
  const { pts, ds, total } = resampleClosed(raw, SAMPLE_STEP);
  const n = pts.length;
  const tx = new Float32Array(n), ty = new Float32Array(n);
  const nx = new Float32Array(n), ny = new Float32Array(n);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    tx[i] = (b.x - a.x) / len;
    ty[i] = (b.y - a.y) / len;
    nx[i] = -ty[i];           // 法向量指向行進方向的右手邊（畫面座標 y 朝下）
    ny[i] = tx[i];
    s[i] = i * ds;
  }
  // 曲率（1/轉彎半徑），電腦對手用來判斷過彎速度
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 3 + n) % n, b = (i + 3) % n;
    let d = Math.atan2(ty[b], tx[b]) - Math.atan2(ty[a], tx[a]);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    curv[i] = Math.abs(d) / (6 * ds);
  }
  return {
    id: def.id, name: def.name, def,
    width: def.width, half: def.width / 2, runoff: RUNOFF,
    pts, tx, ty, nx, ny, s, curv, n, ds, length: total,
  };
}

function closestIn(track, x, y, from, to) {
  let best = -1, bestD = Infinity;
  const { pts, n } = track;
  for (let k = from; k <= to; k++) {
    const i = ((k % n) + n) % n;
    const dx = x - pts[i].x, dy = y - pts[i].y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { i: best, d2: bestD };
}

// 查詢座標在賽道上的位置。hint 是上一次的索引，可大幅加速並避免跳到賽道另一段。
// 回傳 i：最近取樣點、lat：帶正負號的橫向偏移（右正左負）、along：沿中心線的距離
export function locate(track, x, y, hint = -1) {
  let r;
  if (hint >= 0) {
    r = closestIn(track, x, y, hint - 14, hint + 14);
    if (r.d2 > (track.half + track.runoff + 40) ** 2) r = closestIn(track, x, y, 0, track.n - 1);
  } else {
    r = closestIn(track, x, y, 0, track.n - 1);
  }
  const i = r.i;
  const p = track.pts[i];
  const dx = x - p.x, dy = y - p.y;
  const lat = dx * track.nx[i] + dy * track.ny[i];
  let along = track.s[i] + dx * track.tx[i] + dy * track.ty[i];
  if (along < 0) along += track.length;
  if (along >= track.length) along -= track.length;
  return { i, lat, along };
}

// 起跑格：兩排交錯，排在起終點線後方
export function gridPose(track, slot) {
  const back = 34 + Math.floor(slot / 2) * 44;
  const idx = (track.n - Math.round(back / track.ds) + track.n) % track.n;
  const side = slot % 2 === 0 ? -1 : 1;
  const off = side * track.width * 0.22;
  const p = track.pts[idx];
  return {
    x: p.x + track.nx[idx] * off,
    y: p.y + track.ny[idx] * off,
    a: Math.atan2(track.ty[idx], track.tx[idx]),
  };
}

// 檢查賽道設計：不同路段的中心線至少要隔多遠，才不會讓緩衝區互相重疊（可以穿越捷徑）
export function minSeparation(track) {
  const { pts, n } = track;
  // 髮夾彎兩側本來就靠很近，所以只比較沿賽道距離超過「半圈」的點
  const skip = Math.ceil((1.6 * (track.width + 2 * track.runoff)) / track.ds);
  let best = Infinity, at = null;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + skip; j < n; j += 2) {
      const gap = Math.min(j - i, n - (j - i));
      if (gap < skip) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < best) { best = d; at = [i, j]; }
    }
  }
  return { dist: best, at };
}

export function bounds(track) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of track.pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}
