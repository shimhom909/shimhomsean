// 賽道場景：草原、遊樂園、埃及沙漠三種主題的地面、護欄配色與裝飾物。
// 只影響畫面，不影響操控（出界減速、護欄位置在每種主題都一樣）。

import { WORLD } from './config.js';

const INK = '#0d2a36';

// ── 主題設定 ─────────────────────────────────────────
// wall：護欄的顏色（多個顏色會輪流出現）  runoff：柏油外的緩衝區
// curb：路緣石兩色  asphalt：路面  edge：路面白邊  center：中線虛線  letterbox：畫面外圍底色
const THEMES = {
  meadow: {
    label: '森林',
    wall: ['#c9662f', '#f2ead0'], runoff: '#cfe8d2', curb: ['#2fb3a3', '#f2f6d8'],
    asphalt: '#2b4652', edge: 'rgba(225,245,235,0.85)', center: 'rgba(207,228,85,0.85)',
    letterbox: '#1d5f55',
  },
  park: {
    label: '夜之樂園',
    wall: ['#2fb3a3', '#cfe455', '#e08a3a'], runoff: '#4f9e98', curb: ['#cfe455', '#1d3550'],
    asphalt: '#30406a', edge: 'rgba(200,255,240,0.85)', center: 'rgba(207,228,85,0.7)',
    letterbox: '#0f2b40',
  },
  desert: {
    label: '沙漠',
    wall: ['#a8502a', '#e0a85a'], runoff: '#f5dfb0', curb: ['#1f8f86', '#f2c14e'],
    asphalt: '#3d4f56', edge: 'rgba(255,240,205,0.85)', center: 'rgba(242,193,78,0.85)',
    letterbox: '#b98a4a',
  },
};

export function themeOf(track) {
  return THEMES[track.def && track.def.theme] || THEMES.meadow;
}

// ── 小工具 ───────────────────────────────────────────

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function hashStr(s) {
  return s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
}

function tracePath(ctx, track) {
  const p = track.pts;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
}

function wallDist(track) {
  return track.half + track.runoff + 12;
}

function farFromTrack(track, x, y, minD) {
  for (let i = 0; i < track.n; i += 2) {
    const dx = x - track.pts[i].x, dy = y - track.pts[i].y;
    if (dx * dx + dy * dy < minD * minD) return false;
  }
  return true;
}

// 空地地圖：每 20 單位一格，記錄「離護欄、離畫面邊緣還有多遠」，用來找空曠處擺大型地標
function clearField(track) {
  if (track._field) return track._field;
  const cell = 20;
  const cols = Math.ceil(WORLD.w / cell), rows = Math.ceil(WORLD.h / cell);
  const f = new Float32Array(cols * rows);
  const wall = wallDist(track);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
      let m = Infinity;
      for (let i = 0; i < track.n; i += 2) {
        const dx = x - track.pts[i].x, dy = y - track.pts[i].y;
        const d = dx * dx + dy * dy;
        if (d < m) m = d;
      }
      const edge = Math.min(x, y, WORLD.w - x, WORLD.h - y);
      f[r * cols + c] = Math.min(Math.sqrt(m) - wall, edge + 8);
    }
  }
  track._field = { cell, cols, rows, f };
  return track._field;
}

// 主機畫面左上角（圈數）和右上角（排名）會蓋住這兩塊，地標不要擺在那裡
function underHud(x, y, r) {
  return (x - r < 300 && y - r < 210) || (x + r > WORLD.w - 330 && y - r < 330);
}

// 依序替每個地標找位置：越空曠、離其他地標越遠越好；找不到就縮小一點再找
function placeBig(track, rand, wishes) {
  const F = clearField(track);
  const placed = [];
  for (const w of wishes) {
    let r = w.r;
    let spot = null;
    while (!spot && r >= w.min) {
      let best = -Infinity;
      for (let k = 0; k < F.f.length; k++) {
        const c = F.f[k];
        if (c < r) continue;
        const x = ((k % F.cols) + 0.5) * F.cell, y = (Math.floor(k / F.cols) + 0.5) * F.cell;
        if (underHud(x, y, r)) continue;
        let gap = 400;
        for (const p of placed) gap = Math.min(gap, Math.hypot(p.x - x, p.y - y) - p.r - r - 16);
        if (gap < 0) continue;
        const score = Math.min(c - r, 160) + gap * 0.35 + rand() * 8;
        if (score > best) { best = score; spot = { x, y }; }
      }
      if (!spot) r *= 0.86;
    }
    if (spot) placed.push({ ...w, ...spot, r });
  }
  return placed;
}

// 隨機撒小型裝飾（樹、攤販、石頭…），避開賽道和已經擺好的東西
function scatter(track, rand, count, size, avoid, tries = 2500) {
  const out = [];
  const wall = wallDist(track);
  for (let k = 0; k < tries && out.length < count; k++) {
    const x = 24 + rand() * (WORLD.w - 48), y = 24 + rand() * (WORLD.h - 48);
    const r = size * (0.8 + rand() * 0.45);
    if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 10)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 8)) continue;
    if (!farFromTrack(track, x, y, wall + r)) continue;
    out.push({ x, y, r });
  }
  return out;
}

// 急彎外側的位置（擺輪胎堆／氣球／石塊）
function cornerSpots(track) {
  const spots = [];
  const wall = track.half + track.runoff;
  for (let i = 0; i < track.n; i += 9) {
    if (track.curv[i] < 0.0055) continue;
    const a = (i - 3 + track.n) % track.n, b = (i + 3) % track.n;
    let d = Math.atan2(track.ty[b], track.tx[b]) - Math.atan2(track.ty[a], track.tx[a]);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const side = d > 0 ? -1 : 1;                    // 右彎的外側在左邊
    const off = side * (wall + 22);
    const x = track.pts[i].x + track.nx[i] * off, y = track.pts[i].y + track.ny[i] * off;
    if (x < 20 || y < 20 || x > WORLD.w - 20 || y > WORLD.h - 20) continue;
    if (!farFromTrack(track, x, y, wall + 14)) continue;
    if (spots.some((t) => Math.hypot(t.x - x, t.y - y) < 40)) continue;
    spots.push({ x, y, r: 20, a: Math.atan2(track.ty[i], track.tx[i]) });
  }
  return spots;
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// 每條賽道的裝飾只算一次
function decorFor(track) {
  if (track._decor) return track._decor;
  const theme = (track.def && track.def.theme) || 'meadow';
  const rand = seeded(hashStr(track.id));
  const corners = cornerSpots(track);
  let big = [], small = [], dots = [];

  if (theme === 'park') {
    big = placeBig(track, rand, [
      { kind: 'ferris', r: 100, min: 60 },
      { kind: 'carousel', r: 62, min: 40 },
      { kind: 'tent', r: 48, min: 30, c: ['#e08a3a', '#f4ecd0'] },
      { kind: 'tent', r: 42, min: 28, c: ['#2fb3a3', '#f4ecd0'] },
      { kind: 'tent', r: 36, min: 26, c: ['#cfe455', '#1d5f86'] },
    ]);
    const avoid = [...big, ...corners];
    const stands = scatter(track, rand, 7, 15, avoid).map((s) => ({ ...s, kind: 'stand', c: pick(rand, ['#e08a3a', '#2fb3a3', '#3b6fb0', '#8cbf35']) }));
    const trees = scatter(track, rand, 34, 15, [...avoid, ...stands]).map((s) => ({ ...s, kind: 'lolly', c: pick(rand, ['pink', 'purple', 'mint']) }));
    small = [...stands, ...trees];
    for (const c of corners) c.kind = 'balloons';
    // 夜空般漂浮的光球
    const dc = ['#7fe0cf', '#cfe455', '#ffd27a', '#9ff6ff', '#a8ecd9'];
    for (let k = 0; k < 600 && dots.length < 90; k++) {
      const x = rand() * WORLD.w, y = rand() * WORLD.h;
      if (farFromTrack(track, x, y, track.half + track.runoff + 16)) dots.push({ x, y, c: dc[k % dc.length], r: 2 + rand() * 3.5, glow: true });
    }
  } else if (theme === 'desert') {
    big = placeBig(track, rand, [
      { kind: 'pyramid', r: 130, min: 70 },
      { kind: 'pyramid', r: 95, min: 55 },
      { kind: 'pyramid', r: 70, min: 42 },
      { kind: 'oasis', r: 72, min: 46 },
      { kind: 'obelisk', r: 24, min: 18 },
      { kind: 'obelisk', r: 24, min: 18 },
    ]);
    const avoid = [...big, ...corners];
    const palms = scatter(track, rand, 16, 17, avoid).map((s) => ({ ...s, kind: 'palm' }));
    const rocks = scatter(track, rand, 22, 9, [...avoid, ...palms]).map((s) => ({ ...s, kind: 'rock', seed: rand() }));
    small = [...rocks, ...palms];
    for (const c of corners) c.kind = 'blocks';
  } else {
    const trees = scatter(track, rand, 60, 20, corners).map((s) => ({ ...s, kind: 'tree' }));
    small = trees;
    for (const c of corners) c.kind = 'tires';
    // 林間的螢火
    const fc = ['#e8f08a', '#cfe455', '#a8ecd9'];
    for (let k = 0; k < 600 && dots.length < 70; k++) {
      const x = rand() * WORLD.w, y = rand() * WORLD.h;
      if (farFromTrack(track, x, y, track.half + track.runoff + 16)) dots.push({ x, y, c: fc[k % fc.length], r: 1.6 + rand() * 2.4, glow: true });
    }
  }
  // 由上往下畫，前面的東西蓋住後面的
  big.sort((a, b) => a.y - b.y);
  small.sort((a, b) => a.y - b.y);
  track._decor = { big, small, corners, dots };
  return track._decor;
}

// ── 地面 ─────────────────────────────────────────────

// 油畫筆觸：許多短而厚的筆刷，方向大致一致（像調色刀抹出來的）
function brushStrokes(ctx, rand, n, colors, { len = [14, 34], width = [6, 12], angle = -0.9, spread = 0.8, alpha = [0.35, 0.6] } = {}) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h;
    const a = angle + (rand() - 0.5) * spread;
    const l = len[0] + rand() * (len[1] - len[0]);
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ctx.lineWidth = width[0] + rand() * (width[1] - width[0]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 6, y + Math.sin(a) * l * 0.5 + (rand() - 0.5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function softBlobs(ctx, rand, n, color, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h, r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', alpha));
    g.addColorStop(1, color.replace('A', 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// 森林地面：青綠色的厚筆觸、樹冠的陰影、灑下來的黃綠光斑、幾片赭色落葉
function groundMeadow(ctx) {
  const rand = seeded(1128);
  ctx.fillStyle = '#27786a';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  softBlobs(ctx, rand, 40, 'rgba(18,70,72,A)', 110, 230, 0.55);
  softBlobs(ctx, rand, 26, 'rgba(190,225,90,A)', 70, 150, 0.32);
  brushStrokes(ctx, rand, 2600, ['#2f8f78', '#3a9d86', '#246f62', '#4fb79a', '#1f6457', '#5fc2a2']);
  brushStrokes(ctx, rand, 520, ['#cfe455', '#e8f08a', '#b4d43c'], { len: [6, 14], width: [3, 5], alpha: [0.3, 0.55] });
  for (let i = 0; i < 110; i++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h;
    ctx.fillStyle = rand() < 0.6 ? 'rgba(217,139,58,0.6)' : 'rgba(150,70,40,0.5)';
    ctx.beginPath(); ctx.ellipse(x, y, 4 + rand() * 3, 2 + rand() * 1.5, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
}

// 夜之樂園：深藍廣場地磚＋漩渦狀的流動筆觸
function groundPark(ctx) {
  ctx.fillStyle = '#12304a';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.fillStyle = '#163a56';
  const cell = 60;
  for (let y = 0; y < WORLD.h; y += cell) {
    for (let x = ((y / cell) % 2) * cell; x < WORLD.w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
  }
  ctx.strokeStyle = 'rgba(120,230,220,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= WORLD.w; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); }
  for (let y = 0; y <= WORLD.h; y += cell) { ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); }
  ctx.stroke();
  const rand = seeded(77);
  ctx.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    let x = rand() * WORLD.w, y = rand() * WORLD.h;
    ctx.strokeStyle = ['#2fb3a3', '#3b8fc4', '#7fe0cf', '#1f6f86'][i % 4];
    ctx.globalAlpha = 0.12 + rand() * 0.18;
    ctx.lineWidth = 1.5 + rand() * 3;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      const a = Math.sin(x * 0.006 + y * 0.004) * 1.6 + Math.cos(y * 0.007) * 0.8;
      x += Math.cos(a) * 7; y += Math.sin(a) * 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  softBlobs(ctx, rand, 14, 'rgba(120,230,210,A)', 80, 180, 0.12);
}

// 沙漠：暖色沙地＋沙丘波紋
function groundDesert(ctx) {
  ctx.fillStyle = '#e9c37e';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.lineCap = 'round';
  for (let y0 = 20; y0 < WORLD.h + 60; y0 += 64) {
    const wave = (shift) => {
      ctx.beginPath();
      for (let x = -20; x <= WORLD.w + 20; x += 20) {
        const y = y0 + shift + 15 * Math.sin(x / 130 + y0 * 0.05) + 6 * Math.sin(x / 47 + y0);
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(196,130,60,0.5)';
    ctx.lineWidth = 9;
    wave(0);
    ctx.strokeStyle = 'rgba(255,236,190,0.75)';
    ctx.lineWidth = 3;
    wave(-6);
  }
  brushStrokes(ctx, seeded(5), 900, ['#f3d496', '#d9a85e', '#f6e2b0'], { len: [10, 26], width: [4, 8], angle: 0.15, spread: 0.4, alpha: [0.2, 0.4] });
}

const GROUNDS = { meadow: groundMeadow, park: groundPark, desert: groundDesert };

// ── 裝飾物（俯視卡通風，深藍描邊） ───────────────────

function shadowEllipse(ctx, x, y, rx, ry, a = 0.22) {
  ctx.fillStyle = `rgba(40,20,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

function drawTree(ctx, t, base, light) {
  ctx.fillStyle = 'rgba(5,40,45,0.3)';
  ctx.beginPath(); ctx.ellipse(t.x + 6, t.y + 8, t.r, t.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base;
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 陰影面
  ctx.fillStyle = 'rgba(10,60,60,0.35)';
  ctx.beginPath(); ctx.arc(t.x + t.r * 0.25, t.y + t.r * 0.28, t.r * 0.7, 0, Math.PI * 2); ctx.fill();
  // 受光面（黃綠）
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.arc(t.x - t.r * 0.22, t.y - t.r * 0.25, t.r * 0.58, 0, Math.PI * 2); ctx.fill();
  // 葉片筆觸
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, t.r * 0.16);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3 + t.x * 0.01;
    const d = t.r * (0.25 + (k % 3) * 0.18);
    const x = t.x - t.r * 0.15 + Math.cos(a) * d, y = t.y - t.r * 0.15 + Math.sin(a) * d;
    ctx.strokeStyle = k % 2 ? 'rgba(240,248,170,0.75)' : 'rgba(20,90,80,0.45)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + t.r * 0.22, y - t.r * 0.12); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,220,0.65)';
  ctx.beginPath(); ctx.arc(t.x - t.r * 0.42, t.y - t.r * 0.45, t.r * 0.14, 0, Math.PI * 2); ctx.fill();
}

const LOLLY = { pink: ['#2fb3a3', '#9ff0dc'], purple: ['#3b6fb0', '#9cc8ee'], mint: ['#5f9e3a', '#d8ee7a'] };

function drawTires(ctx, t) {
  for (const [ox, oy] of [[-9, 0], [9, 0], [0, -11]]) {
    const x = t.x + ox * Math.cos(t.a) - oy * Math.sin(t.a), y = t.y + ox * Math.sin(t.a) + oy * Math.cos(t.a);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(x + 3, y + 4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2f3a';
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a93a8';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBalloons(ctx, t) {
  const cols = ['#e08a3a', '#cfe455', '#4fc3b5', '#6f9be0', '#f2d44a'];
  const k0 = Math.floor((t.x + t.y) % cols.length);
  const pos = [[-10, -12], [8, -15], [0, -26]];
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const [ox, oy] of pos) { ctx.moveTo(t.x, t.y + 6); ctx.lineTo(t.x + ox, t.y + oy + 8); }
  ctx.stroke();
  shadowEllipse(ctx, t.x + 6, t.y + 8, 10, 4, 0.18);
  pos.forEach(([ox, oy], i) => {
    ctx.fillStyle = cols[(k0 + i) % cols.length];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(t.x + ox, t.y + oy, 8, 9.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(t.x + ox - 3, t.y + oy - 3.5, 2.2, 0, Math.PI * 2); ctx.fill();
  });
}

function drawBlocks(ctx, t) {
  for (const [ox, oy] of [[-9, 2], [8, 2], [0, -11]]) {
    const x = t.x + ox * Math.cos(t.a) - oy * Math.sin(t.a), y = t.y + ox * Math.sin(t.a) + oy * Math.cos(t.a);
    ctx.fillStyle = 'rgba(90,50,10,0.25)';
    ctx.fillRect(x - 7 + 4, y - 7 + 4, 14, 14);
    ctx.fillStyle = '#d9a866';
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.fillRect(x - 7, y - 7, 14, 14); ctx.strokeRect(x - 7, y - 7, 14, 14);
    ctx.fillStyle = 'rgba(255,240,200,0.6)';
    ctx.fillRect(x - 5, y - 5, 10, 3);
  }
}

function drawStand(ctx, s) {
  const w = s.r * 1.8, h = s.r * 1.3;
  ctx.fillStyle = 'rgba(80,0,40,0.2)';
  ctx.fillRect(s.x - w / 2 + 4, s.y - h / 2 + 5, w, h);
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  const n = 5;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : s.c;
    ctx.fillRect(s.x - w / 2 + (w / n) * i, s.y - h / 2, w / n + 0.5, h);
  }
  ctx.strokeRect(s.x - w / 2, s.y - h / 2, w, h);
  ctx.fillStyle = '#cfe455';
  ctx.beginPath(); ctx.arc(s.x + w / 2 + 5, s.y + h / 2 - 2, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawRock(ctx, s) {
  const rnd = seeded(Math.floor(s.seed * 1e6) + 1);
  const pts = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, rr = s.r * (0.75 + rnd() * 0.4);
    pts.push([s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr * 0.8]);
  }
  shadowEllipse(ctx, s.x + 4, s.y + 5, s.r, s.r * 0.6, 0.2);
  ctx.fillStyle = '#c4a173';
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,210,0.55)';
  ctx.beginPath(); ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.3, 0, Math.PI * 2); ctx.fill();
}

function drawPalm(ctx, s) {
  const n = 7, L = s.r * 1.25;
  // 影子
  ctx.fillStyle = 'rgba(80,50,0,0.2)';
  ctx.beginPath(); ctx.arc(s.x + 7, s.y + 9, s.r * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + s.x * 0.01;
    const tx = s.x + Math.cos(a) * L, ty = s.y + Math.sin(a) * L;
    const nx = -Math.sin(a) * s.r * 0.32, ny = Math.cos(a) * s.r * 0.32;
    const mx = s.x + Math.cos(a) * L * 0.5, my = s.y + Math.sin(a) * L * 0.5;
    ctx.fillStyle = k % 2 ? '#2f9a7f' : '#58b86e';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(mx + nx, my + ny, tx, ty);
    ctx.quadraticCurveTo(mx - nx, my - ny, s.x, s.y);
    ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#8a5a2b';
  for (const [ox, oy] of [[-2.5, -1.5], [2.5, -1.5], [0, 2.5]]) {
    ctx.beginPath(); ctx.arc(s.x + ox, s.y + oy, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function drawPyramid(ctx, p) {
  const s = p.r * 0.72;
  const x0 = p.x - s, x1 = p.x + s, y0 = p.y - s, y1 = p.y + s;
  const ax = p.x, ay = p.y;
  // 影子（往右下）
  ctx.fillStyle = 'rgba(110,60,10,0.28)';
  ctx.beginPath();
  ctx.moveTo(x1, y0); ctx.lineTo(x1 + s * 0.55, y0 + s * 0.75); ctx.lineTo(x1 + s * 0.55, y1 + s * 0.55);
  ctx.lineTo(x0 + s * 0.75, y1 + s * 0.55); ctx.lineTo(x0, y1); ctx.closePath(); ctx.fill();
  const face = (pts, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  };
  face([[x0, y0], [x1, y0], [ax, ay]], '#f7d995');   // 上（受光）
  face([[x1, y0], [x1, y1], [ax, ay]], '#d9a355');   // 右
  face([[x1, y1], [x0, y1], [ax, ay]], '#bf8640');   // 下
  face([[x0, y1], [x0, y0], [ax, ay]], '#ecc073');   // 左
  // 階梯紋路
  ctx.strokeStyle = 'rgba(110,65,20,0.28)';
  ctx.lineWidth = 2;
  for (const t of [0.25, 0.5, 0.75]) {
    const k = s * t;
    ctx.strokeRect(p.x - k, p.y - k, k * 2, k * 2);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.moveTo(x1, y0); ctx.lineTo(x0, y1);
  ctx.stroke();
  ctx.strokeRect(x0, y0, s * 2, s * 2);
  // 金色塔尖
  const c = s * 0.12;
  ctx.fillStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay - c); ctx.lineTo(ax + c, ay); ctx.lineTo(ax, ay + c); ctx.lineTo(ax - c, ay); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function drawObelisk(ctx, o) {
  const a = o.r * 0.42;
  // 長長的影子
  ctx.fillStyle = 'rgba(110,60,10,0.28)';
  ctx.beginPath();
  ctx.moveTo(o.x + a, o.y - a); ctx.lineTo(o.x + a + o.r * 2.4, o.y - a + o.r * 1.6);
  ctx.lineTo(o.x - a + o.r * 2.4, o.y + a + o.r * 1.6); ctx.lineTo(o.x - a, o.y + a); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#e8bd73';
  ctx.fillRect(o.x - a, o.y - a, a * 2, a * 2); ctx.strokeRect(o.x - a, o.y - a, a * 2, a * 2);
  const b = a * 0.62;
  const tri = (pts, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  };
  tri([[o.x - b, o.y - b], [o.x + b, o.y - b], [o.x, o.y]], '#ffe27a');
  tri([[o.x + b, o.y - b], [o.x + b, o.y + b], [o.x, o.y]], '#f2b92e');
  tri([[o.x + b, o.y + b], [o.x - b, o.y + b], [o.x, o.y]], '#d99a1c');
  tri([[o.x - b, o.y + b], [o.x - b, o.y - b], [o.x, o.y]], '#ffd23f');
  ctx.lineWidth = 1.5;
  ctx.strokeRect(o.x - b, o.y - b, b * 2, b * 2);
}

function drawOasis(ctx, o) {
  const rx = o.r * 0.78, ry = o.r * 0.55;
  ctx.fillStyle = '#7fbf5a';
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(o.x, o.y, rx + 14, ry + 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2fb3a3';
  ctx.beginPath(); ctx.ellipse(o.x, o.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [ox, oy, w] of [[-0.3, -0.25, 0.35], [0.15, 0.1, 0.4], [-0.1, 0.4, 0.25]]) {
    ctx.beginPath(); ctx.moveTo(o.x + rx * ox, o.y + ry * oy); ctx.lineTo(o.x + rx * (ox + w), o.y + ry * oy); ctx.stroke();
  }
  for (const a of [-2.4, -0.5, 0.9, 2.6]) {
    drawPalm(ctx, { x: o.x + Math.cos(a) * (rx + 4), y: o.y + Math.sin(a) * (ry + 6), r: 15 });
  }
}

function drawTopTent(ctx, t, colors, wedges, scallop) {
  shadowEllipse(ctx, t.x + 8, t.y + 10, t.r, t.r * 0.95, 0.2);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  for (let k = 0; k < wedges; k++) {
    const a0 = (k / wedges) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 1) / wedges) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = colors[k % colors.length];
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    if (scallop) ctx.arc(t.x, t.y, t.r, a0, a1);
    else { ctx.lineTo(t.x + Math.cos(a0) * t.r, t.y + Math.sin(a0) * t.r); ctx.lineTo(t.x + Math.cos(a1) * t.r, t.y + Math.sin(a1) * t.r); }
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath();
  if (scallop) ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
  else for (let k = 0; k <= wedges; k++) {
    const a = (k / wedges) * Math.PI * 2 - Math.PI / 2;
    if (k) ctx.lineTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r); else ctx.moveTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r);
  }
  ctx.stroke();
  if (scallop) {
    // 旋轉木馬屋簷的金色花邊
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      ctx.fillStyle = '#f2d44a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r, t.r * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  ctx.lineWidth = 2;
  ctx.fillStyle = '#f2d44a';
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 小旗子
  ctx.fillStyle = colors[0] === '#f4ecd0' ? '#e08a3a' : colors[0];
  ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + t.r * 0.32, t.y - t.r * 0.12); ctx.lineTo(t.x, t.y - t.r * 0.24); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function drawFerris(ctx, f) {
  // 摩天輪用「正面」的地標圖示呈現，影子表示它立在地上
  const R = f.r * 0.72;
  const cx = f.x, cy = f.y - f.r * 0.18;
  const footY = f.y + f.r * 0.82;
  shadowEllipse(ctx, cx + 14, footY + 2, f.r * 0.75, f.r * 0.16, 0.22);
  // 支架
  ctx.strokeStyle = INK; ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(cx - f.r * 0.5, footY);
  ctx.moveTo(cx, cy); ctx.lineTo(cx + f.r * 0.5, footY);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5;
  ctx.stroke();
  // 輪框
  ctx.strokeStyle = INK; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.shadowColor = 'rgba(127,240,255,0.9)'; ctx.shadowBlur = 14;
  ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(23,36,74,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2); ctx.stroke();
  // 輪輻
  const n = 8;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.stroke();
  // 車廂
  const cabin = ['#e08a3a', '#cfe455', '#4fc3b5', '#f2d44a', '#6f9be0', '#7fe0cf', '#e0583c', '#2a8fb0'];
  const cw = R * 0.26, ch = R * 0.22;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    ctx.fillStyle = cabin[k];
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - cw / 2, y - ch * 0.2, cw, ch, 4); else ctx.rect(x - cw / 2, y - ch * 0.2, cw, ch);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x - cw / 2 + 3, y - ch * 0.2 + 3, cw - 6, ch * 0.3);
  }
  // 軸心
  ctx.fillStyle = '#cfe455'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 底座
  ctx.fillStyle = '#1d5f86';
  ctx.fillRect(cx - f.r * 0.62, footY - 5, f.r * 1.24, 10);
  ctx.strokeRect(cx - f.r * 0.62, footY - 5, f.r * 1.24, 10);
}

function drawItem(ctx, it, iconAngle = 0) {
  switch (it.kind) {
    case 'tree': drawTree(ctx, it, '#2f9a7f', '#c8e45a'); break;
    case 'lolly': drawTree(ctx, it, LOLLY[it.c][0], LOLLY[it.c][1]); break;
    case 'tires': drawTires(ctx, it); break;
    case 'balloons': drawBalloons(ctx, it); break;
    case 'blocks': drawBlocks(ctx, it); break;
    case 'stand': drawStand(ctx, it); break;
    case 'rock': drawRock(ctx, it); break;
    case 'palm': drawPalm(ctx, it); break;
    case 'pyramid': drawPyramid(ctx, it); break;
    case 'obelisk': drawObelisk(ctx, it); break;
    case 'oasis': drawOasis(ctx, it); break;
    case 'carousel': drawTopTent(ctx, it, ['#2fb3a3', '#f6f3c8'], 12, true); break;
    case 'tent': drawTopTent(ctx, it, it.c, 8, false); break;
    case 'ferris':
      // 正面圖示：畫面轉 90 度（直立手機當主機）時把它轉回來，才不會躺著
      ctx.save();
      ctx.translate(it.x, it.y); ctx.rotate(iconAngle); ctx.translate(-it.x, -it.y);
      drawFerris(ctx, it);
      ctx.restore();
      break;
    default: break;
  }
}

// ── 整個賽道場景 ─────────────────────────────────────

// 在 ctx 目前的「世界座標」變換下畫出整個賽道（背景層，畫一次快取起來）
// iconAngle：正面圖示（摩天輪）要轉的角度，讓它在旋轉後的畫面上仍然是正的
export function drawTrackScene(ctx, track, { detail = true, iconAngle = 0 } = {}) {
  const th = themeOf(track);
  const themeId = (track.def && track.def.theme) || 'meadow';
  (GROUNDS[themeId] || groundMeadow)(ctx);
  const deco = decorFor(track);

  if (detail) {
    for (const d of deco.dots) {
      if (d.glow) {
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 4);
        g.addColorStop(0, d.c);
        g.addColorStop(0.35, d.c + '88');
        g.addColorStop(1, d.c + '00');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = d.c;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  tracePath(ctx, track);
  const outer = track.width + track.runoff * 2;

  // 護欄：深色描邊 + 主題配色輪流出現
  ctx.lineWidth = outer + 30;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = outer + 22;
  ctx.strokeStyle = th.wall[0];
  ctx.stroke();
  const seg = 22, n = th.wall.length;
  for (let k = 1; k < n; k++) {
    ctx.setLineDash([seg, seg * (n - 1)]);
    ctx.lineDashOffset = -seg * k;
    ctx.strokeStyle = th.wall[k];
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  ctx.lineWidth = outer;
  ctx.strokeStyle = th.runoff;
  ctx.stroke();

  ctx.lineWidth = track.width + 16;
  ctx.strokeStyle = th.curb[0];
  ctx.stroke();
  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = th.curb[1];
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = track.width;
  ctx.strokeStyle = th.asphalt;
  ctx.stroke();
  if (detail) {
    ctx.lineWidth = track.width - 8;
    ctx.strokeStyle = th.edge;
    ctx.stroke();
    ctx.lineWidth = track.width - 13;
    ctx.strokeStyle = th.asphalt;
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = th.center;
    ctx.setLineDash([24, 26]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 起終點方格線
  const p0 = track.pts[0];
  ctx.save();
  ctx.translate(p0.x, p0.y);
  ctx.rotate(Math.atan2(track.ty[0], track.tx[0]));
  const cells = 10, cw = track.width / cells;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cells; c++) {
      ctx.fillStyle = (r + c) % 2 ? INK : '#fff';
      ctx.fillRect(-cw + r * cw, -track.half + c * cw, cw, cw);
    }
  }
  ctx.restore();

  if (detail) {
    // 起跑格
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    for (let slot = 0; slot < 8; slot++) {
      const back = 34 + Math.floor(slot / 2) * 44;
      const idx = (track.n - Math.round(back / track.ds) + track.n) % track.n;
      const off = (slot % 2 === 0 ? -1 : 1) * track.width * 0.22;
      const p = track.pts[idx];
      ctx.save();
      ctx.translate(p.x + track.nx[idx] * off, p.y + track.ny[idx] * off);
      ctx.rotate(Math.atan2(track.ty[idx], track.tx[idx]));
      ctx.beginPath();
      ctx.moveTo(10, -12); ctx.lineTo(22, -12); ctx.lineTo(22, 12); ctx.lineTo(10, 12);
      ctx.stroke();
      ctx.restore();
    }

    // 行進方向箭頭
    for (const at of [0.22, 0.47, 0.72]) {
      const i = Math.floor(track.n * at);
      const p = track.pts[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(track.ty[i], track.tx[i]));
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const dx of [-14, 2]) {
        ctx.beginPath();
        ctx.moveTo(dx + 12, 0); ctx.lineTo(dx - 2, -12); ctx.lineTo(dx + 2, 0); ctx.lineTo(dx - 2, 12);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    for (const c of deco.corners) drawItem(ctx, c);
    for (const s of deco.small) drawItem(ctx, s);
  }
  // 大型地標連縮圖都畫，一眼就認得是哪個場景
  ctx.lineCap = 'round';
  for (const b of deco.big) drawItem(ctx, b, iconAngle);
}

// 賽道縮圖（大廳選賽道用）
export function drawTrackThumb(canvas, track) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const s = Math.min(w / WORLD.w, h / WORLD.h) * dpr;
  ctx.setTransform(s, 0, 0, s, (canvas.width - WORLD.w * s) / 2, (canvas.height - WORLD.h * s) / 2);
  drawTrackScene(ctx, track, { detail: false });
  return true;
}

// 測試用：看看每條賽道擺了哪些大型地標
export function landmarksOf(track) {
  return decorFor(track).big.map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.r) }));
}
