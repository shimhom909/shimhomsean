// 賽道場景：草原、遊樂園、埃及沙漠三種主題的地面、護欄配色與裝飾物。
// 只影響畫面，不影響操控（出界減速、護欄位置在每種主題都一樣）。

import { WORLD } from './config.js';

const INK = '#1d1c22';

// ── 主題設定 ─────────────────────────────────────────
// wall：護欄的顏色（多個顏色會輪流出現）  runoff：柏油外的緩衝區
// curb：路緣石兩色  asphalt：路面  edge：路面白邊  center：中線虛線  letterbox：畫面外圍底色
const THEMES = {
  meadow: {
    label: '海岸草原',
    wall: ['#c8372a', '#f4efe4'], runoff: '#ebe0c4', curb: ['#c8372a', '#f4efe4'],
    asphalt: '#5d5e63', edge: 'rgba(246,239,223,0.9)', center: 'rgba(246,239,223,0.92)',
    letterbox: '#7f9e45',
  },
  park: {
    label: '彩繪樂園',
    wall: ['#e8452c', '#2ec4d0', '#f3c93e'], runoff: '#f6efdf', curb: ['#f07b22', '#f6efdf'],
    asphalt: '#57555c', edge: 'rgba(246,239,223,0.9)', center: 'rgba(243,201,62,0.85)',
    letterbox: '#4fb6c6',
  },
  desert: {
    label: '沙漠',
    wall: ['#c0502a', '#f0c27a'], runoff: '#f5dfb0', curb: ['#1f5fae', '#f3c93e'],
    asphalt: '#6a6058', edge: 'rgba(255,240,205,0.85)', center: 'rgba(243,201,62,0.85)',
    letterbox: '#d9ad62',
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

// 柏油路面：碎石顆粒、磨亮的路面、彎道上的胎痕
function asphaltTexture(ctx, track) {
  const rand = seeded(hashStr(track.id) + 11);
  const at = (i, d) => [track.pts[i].x + track.nx[i] * d, track.pts[i].y + track.ny[i] * d];
  for (let k = 0; k < 2600; k++) {
    const i = Math.floor(rand() * track.n);
    const [x, y] = at(i, (rand() - 0.5) * (track.width - 16));
    ctx.fillStyle = k % 3 ? 'rgba(20,20,24,0.35)' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.lineCap = 'round';
  // 彎道上的胎痕：兩條平行線
  const curvy = [];
  for (let i = 0; i < track.n; i += 4) if (Math.abs(track.curv[i]) > 0.004) curvy.push(i);
  for (let m = 0; m < Math.min(10, curvy.length); m++) {
    const i0 = curvy[Math.floor(rand() * curvy.length)];
    const len = 20 + Math.floor(rand() * 30);
    const off0 = (rand() - 0.5) * track.width * 0.5, drift = (rand() - 0.5) * track.width * 0.4;
    ctx.strokeStyle = `rgba(20,20,24,${0.18 + rand() * 0.12})`;
    ctx.lineWidth = 3;
    for (const w of [-7, 7]) {
      ctx.beginPath();
      for (let k = 0; k <= len; k++) {
        const i = (i0 + k) % track.n;
        const [x, y] = at(i, off0 + drift * Math.sin((k / len) * Math.PI) + w);
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
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
      { kind: 'tent', r: 48, min: 30, c: ['#e8452c', '#f4ecd0'] },
      { kind: 'tent', r: 42, min: 28, c: ['#2ec4d0', '#f4ecd0'] },
      { kind: 'tent', r: 36, min: 26, c: ['#f3c93e', '#1f5fae'] },
    ]);
    const avoid = [...big, ...corners];
    const stands = scatter(track, rand, 7, 15, avoid).map((s) => ({ ...s, kind: 'stand', c: pick(rand, ['#e8452c', '#2ec4d0', '#1f5fae', '#f07b22']) }));
    const trees = scatter(track, rand, 34, 15, [...avoid, ...stands]).map((s) => ({ ...s, kind: 'lolly', c: pick(rand, ['pink', 'purple', 'mint']) }));
    small = [...stands, ...trees];
    for (const c of corners) c.kind = 'balloons';
    // 油漆噴點
    const dc = ['#e8452c', '#f3c93e', '#1f5fae', '#f6efdf', '#f07b22'];
    for (let k = 0; k < 900 && dots.length < 160; k++) {
      const x = rand() * WORLD.w, y = rand() * WORLD.h;
      if (farFromTrack(track, x, y, track.half + track.runoff + 16)) dots.push({ x, y, c: dc[k % dc.length], r: 1.5 + rand() * 3 });
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
    // 草地上的小花
    const fc = ['#f6efdf', '#f3c93e', '#f6efdf', '#e8452c'];
    for (let k = 0; k < 600 && dots.length < 120; k++) {
      const x = rand() * WORLD.w, y = rand() * WORLD.h;
      if (farFromTrack(track, x, y, track.half + track.runoff + 16)) dots.push({ x, y, c: fc[k % fc.length], r: 2.2 + rand() * 1.2 });
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

// 海岸草原：橄欖綠草地＋深淺不一的色塊（漫畫上色）＋草的排線
function groundMeadow(ctx) {
  const rand = seeded(1128);
  ctx.fillStyle = '#86a447';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  softBlobs(ctx, rand, 16, 'rgba(176,168,78,A)', 110, 230, 0.55);
  // 深色的雲影：大塊、邊緣清楚
  ctx.fillStyle = 'rgba(60,90,30,0.2)';
  for (let i = 0; i < 10; i++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) ctx.ellipse(x + (k - 1.5) * 55, y + Math.sin(k * 2) * 22, 80 + rand() * 40, 44 + rand() * 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  brushStrokes(ctx, rand, 1900, ['#7c9a40', '#93ad52', '#6c8a36', '#a5b45a'], { len: [10, 24], width: [4, 8], angle: -1.3, spread: 0.5, alpha: [0.35, 0.6] });
  // 草的排線
  ctx.strokeStyle = 'rgba(45,60,20,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 1100; i++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h;
    ctx.moveTo(x, y); ctx.lineTo(x + 1.5, y - 6 - rand() * 5);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 6.5, y - 4 - rand() * 4);
  }
  ctx.stroke();
}

// 彩繪樂園：土耳其藍與奶油色交錯的木地板，到處是剝落的油漆
function groundPark(ctx) {
  const rand = seeded(77);
  const plank = 46;
  for (let y = 0, r = 0; y < WORLD.h; y += plank, r++) {
    let x = -rand() * 200;
    while (x < WORLD.w) {
      const len = 160 + rand() * 220;
      const c = (r + Math.floor(x / 97)) % 3;
      ctx.fillStyle = c === 0 ? '#4cc3cf' : c === 1 ? '#f2e6cc' : '#3fb0c0';
      ctx.fillRect(x, y, len, plank);
      ctx.strokeStyle = 'rgba(29,28,34,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, len, plank);
      x += len;
    }
  }
  // 木紋
  ctx.strokeStyle = 'rgba(29,28,34,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 500; i++) {
    const x = rand() * WORLD.w, y = Math.floor(rand() * (WORLD.h / plank)) * plank + 8 + rand() * (plank - 16);
    ctx.moveTo(x, y); ctx.lineTo(x + 30 + rand() * 60, y + (rand() - 0.5) * 3);
  }
  ctx.stroke();
  // 剝落的油漆：露出底下的木頭或另一層顏色
  for (let i = 0; i < 160; i++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h, r = 4 + rand() * 12;
    ctx.fillStyle = rand() < 0.5 ? '#9a6a44' : rand() < 0.5 ? '#e8452c' : '#f6efdf';
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, rr = r * (0.5 + rand() * 0.7);
      if (k) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
    }
    ctx.closePath(); ctx.fill();
  }
  // 斜斜的日照陰影
  ctx.fillStyle = 'rgba(29,40,60,0.14)';
  for (let i = 0; i < 6; i++) {
    const x = rand() * WORLD.w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 120, 0); ctx.lineTo(x - 260, WORLD.h); ctx.lineTo(x - 380, WORLD.h); ctx.closePath(); ctx.fill();
  }
}

// 沙漠：暖色沙地＋沙丘波紋
function groundDesert(ctx) {
  ctx.fillStyle = '#efc985';
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

function drawDots(ctx, dots) {
  for (const d of dots) {
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

// ── 裝飾物（俯視卡通風，深藍描邊） ───────────────────

function shadowEllipse(ctx, x, y, rx, ry, a = 0.22) {
  ctx.fillStyle = `rgba(40,20,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

function drawTree(ctx, t, base, light) {
  const rand = seeded(Math.round(t.x * 13 + t.y * 7));
  const n = 7 + Math.floor(rand() * 3);
  const lumps = [[0, 0, t.r * 0.78]];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.4;
    lumps.push([Math.cos(a) * t.r * 0.62, Math.sin(a) * t.r * 0.62, t.r * (0.36 + rand() * 0.12)]);
  }
  const each = (fn) => { for (const [dx, dy, r] of lumps) { ctx.beginPath(); ctx.arc(t.x + dx, t.y + dy, r, 0, Math.PI * 2); fn(); } };
  // 地上的斜線影子
  ctx.save();
  ctx.translate(t.r * 0.28, t.r * 0.34);
  ctx.fillStyle = 'rgba(30,45,15,0.3)';
  each(() => ctx.fill());
  ctx.restore();
  // 外圈墨線（先畫粗線，再用底色蓋掉裡面）
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, t.r * 0.14);
  each(() => ctx.stroke());
  ctx.fillStyle = base;
  each(() => ctx.fill());
  // 背光面（右下）
  ctx.save();
  ctx.beginPath();
  for (const [dx, dy, r] of lumps) { ctx.moveTo(t.x + dx + r, t.y + dy); ctx.arc(t.x + dx, t.y + dy, r, 0, Math.PI * 2); }
  ctx.clip();
  ctx.fillStyle = 'rgba(20,40,15,0.32)';
  ctx.beginPath(); ctx.arc(t.x + t.r * 0.42, t.y + t.r * 0.48, t.r * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 受光的小團（左上）
  ctx.fillStyle = light;
  for (const [dx, dy, r] of lumps) {
    if (dx + dy > t.r * 0.2) continue;
    ctx.beginPath(); ctx.arc(t.x + dx - r * 0.18, t.y + dy - r * 0.2, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // 葉子的小捲線
  ctx.strokeStyle = 'rgba(29,28,34,0.55)'; ctx.lineWidth = Math.max(1.2, t.r * 0.06); ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const a = rand() * Math.PI * 2, d = rand() * t.r * 0.6;
    const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
    ctx.beginPath(); ctx.arc(x, y, t.r * 0.16, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  }
}

const LOLLY = { pink: ['#2ec4d0', '#bff2f4'], purple: ['#e8452c', '#ffb59a'], mint: ['#5f9e3a', '#c8e47a'] };

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
  const cols = ['#e8452c', '#f3c93e', '#2ec4d0', '#1f5fae', '#f07b22'];
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
  ctx.fillStyle = '#f3c93e';
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
    ctx.fillStyle = k % 2 ? '#3f8f4a' : '#6fb85a';
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
  ctx.fillStyle = '#8cc25e';
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(o.x, o.y, rx + 14, ry + 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2ec4d0';
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
      ctx.fillStyle = '#f3c93e';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r, t.r * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  ctx.lineWidth = 2;
  ctx.fillStyle = '#f3c93e';
  ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 小旗子
  ctx.fillStyle = colors[0] === '#f4ecd0' ? '#e8452c' : colors[0];
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
  ctx.strokeStyle = '#e8452c'; ctx.lineWidth = 3.5;
  ctx.stroke();
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
  const cabin = ['#e8452c', '#f3c93e', '#2ec4d0', '#f07b22', '#1f5fae', '#f6efdf', '#e8452c', '#2ec4d0'];
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
  ctx.fillStyle = '#f3c93e'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // 底座
  ctx.fillStyle = '#1f5fae';
  ctx.fillRect(cx - f.r * 0.62, footY - 5, f.r * 1.24, 10);
  ctx.strokeRect(cx - f.r * 0.62, footY - 5, f.r * 1.24, 10);
}

function drawItem(ctx, it, iconAngle = 0) {
  switch (it.kind) {
    case 'tree': drawTree(ctx, it, '#557d2e', '#86a83f'); break;
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
    case 'carousel': drawTopTent(ctx, it, ['#e8452c', '#f6efdf'], 12, true); break;
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
  const deco = decorFor(track);
  const paintGround = () => {
    (GROUNDS[themeId] || groundMeadow)(ctx);
    if (detail) drawDots(ctx, deco.dots);
  };
  paintGround();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outer = track.width + track.runoff * 2;

  // 紅白路緣石（墨線框起來，一格一格）
  tracePath(ctx, track);
  ctx.lineWidth = outer + 40;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = outer + 32;
  ctx.strokeStyle = th.wall[0];
  ctx.stroke();
  const seg = 20, n = th.wall.length;
  ctx.lineCap = 'butt';
  for (let k = 1; k < n; k++) {
    ctx.setLineDash([seg, seg * (n - 1)]);
    ctx.lineDashOffset = -seg * k;
    ctx.strokeStyle = th.wall[k];
    ctx.stroke();
  }
  ctx.setLineDash([2, seg - 2]);
  ctx.lineDashOffset = 0;
  ctx.strokeStyle = 'rgba(29,28,34,0.7)';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  // 只有外圈有路緣石：把賽道圍起來的內側重畫一次地面蓋掉
  ctx.save();
  tracePath(ctx, track);
  ctx.clip();
  paintGround();
  ctx.restore();

  // 路肩外緣的墨線
  tracePath(ctx, track);
  ctx.lineWidth = outer + 8;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // 路肩
  tracePath(ctx, track);
  ctx.lineWidth = outer;
  ctx.strokeStyle = th.runoff;
  ctx.stroke();
  if (detail) {
    // 路肩上的髒污
    const rand = seeded(hashStr(track.id) + 3);
    for (let k = 0; k < 500; k++) {
      const i = Math.floor(rand() * track.n), sgn = rand() < 0.5 ? -1 : 1;
      const d = sgn * (track.half + 6 + rand() * (track.runoff - 10));
      ctx.fillStyle = k % 3 ? 'rgba(140,120,80,0.28)' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(track.pts[i].x + track.nx[i] * d, track.pts[i].y + track.ny[i] * d, 2.5, 2.5);
    }
  }

  // 柏油（墨線邊）
  tracePath(ctx, track);
  ctx.lineWidth = track.width + 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = track.width;
  ctx.strokeStyle = th.asphalt;
  ctx.stroke();
  if (detail) {
    ctx.lineWidth = track.width - 10;
    ctx.strokeStyle = th.edge;
    ctx.stroke();
    ctx.lineWidth = track.width - 15;
    ctx.strokeStyle = th.asphalt;
    ctx.stroke();
    asphaltTexture(ctx, track);
    tracePath(ctx, track);
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
