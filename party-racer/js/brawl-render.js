// 彩彈大亂鬥的繪圖：場地（學園頂樓、櫻花神社）、障礙物、角色、子彈、道具、彩漆。

import { ARENA_W, ARENA_H, BRAWL, POWERS } from './brawl.js';
import { charaImage } from './characters.js';

const INK = '#1d1c22';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// ── 漫畫筆觸小工具 ───────────────────────────────────

// 斜線網點（漫畫陰影）：每個 context 建一次
const hatchCache = new WeakMap();
function hatch(ctx, color = 'rgba(29,28,34,0.55)', gap = 7) {
  const key = color + gap;
  let m = hatchCache.get(ctx);
  if (!m) { m = new Map(); hatchCache.set(ctx, m); }
  if (m.has(key)) return m.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = gap * 4;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 1.6;
  g.beginPath();
  for (let k = -4; k <= 8; k++) { g.moveTo(k * gap, 0); g.lineTo(k * gap - gap * 4, gap * 4); }
  g.stroke();
  const pat = ctx.createPattern(c, 'repeat');
  m.set(key, pat);
  return pat;
}

// 物件投下的影子：淡色底＋斜線
function hatchShadow(ctx, path, dx = 9, dy = 11) {
  ctx.save();
  ctx.translate(dx, dy);
  path();
  ctx.fillStyle = 'rgba(29,28,34,0.16)';
  ctx.fill();
  ctx.fillStyle = hatch(ctx);
  ctx.fill();
  ctx.restore();
}

// 手繪感的線：每段加一點抖動
function wobblyLine(ctx, x0, y0, x1, y1, rand, amp = 1.2) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40));
  ctx.moveTo(x0 + (rand() - 0.5) * amp, y0 + (rand() - 0.5) * amp);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    ctx.lineTo(x0 + (x1 - x0) * t + (rand() - 0.5) * amp, y0 + (y1 - y0) * t + (rand() - 0.5) * amp);
  }
}

// 墨點噴濺
function inkSplatter(ctx, rand, x, y, size) {
  ctx.fillStyle = 'rgba(29,28,34,0.8)';
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2, d = rand() * size, r = 0.8 + rand() * (k < 3 ? size * 0.12 : 2.4);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, Math.PI * 2); ctx.fill();
  }
}

// ── 地面 ─────────────────────────────────────────────

// 油畫筆觸（地面質感）
function strokes(ctx, rand, n, colors, len, width, alpha) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rand() * ARENA_W, y = rand() * ARENA_H, a = -0.8 + (rand() - 0.5) * 0.8, l = len[0] + rand() * (len[1] - len[0]);
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
    ctx.lineWidth = width[0] + rand() * (width[1] - width[0]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function glowPatches(ctx, rand, n, rgb, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rand() * ARENA_W, y = rand() * ARENA_H, r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// 斜射的光束：亮帶與灰帶交錯
function lightShafts(ctx, rand) {
  for (let i = 0; i < 7; i++) {
    const x = -200 + i * 330 + rand() * 60, w = 90 + rand() * 70;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.32)' : 'rgba(110,112,122,0.2)';
    ctx.beginPath(); ctx.moveTo(x + 420, 0); ctx.lineTo(x + 420 + w, 0); ctx.lineTo(x + w, ARENA_H); ctx.lineTo(x, ARENA_H); ctx.closePath(); ctx.fill();
  }
}

// 學園頂樓：米色方格磁磚、斜光、手繪格線、紅色中圈
function floorRooftop(ctx) {
  const rand = seeded(9);
  const T = 80;
  for (let y = 0; y < ARENA_H; y += T) {
    for (let x = 0; x < ARENA_W; x += T) {
      const dark = ((x + y) / T) % 2 === 1;
      const v = Math.round((rand() - 0.5) * 10);
      ctx.fillStyle = dark ? `rgb(${214 + v},${206 + v},${190 + v})` : `rgb(${236 + v},${228 + v},${210 + v})`;
      ctx.fillRect(x, y, T, T);
    }
  }
  strokes(ctx, rand, 900, ['#d6cdb8', '#efe8d6', '#cfc5ae'], [10, 26], [4, 8], [0.18, 0.35]);
  // 磨損的小點
  for (let k = 0; k < 1600; k++) {
    ctx.fillStyle = k % 4 ? 'rgba(90,80,60,0.22)' : 'rgba(255,255,250,0.6)';
    ctx.fillRect(rand() * ARENA_W, rand() * ARENA_H, 2, 2);
  }
  lightShafts(ctx, rand);
  ctx.strokeStyle = 'rgba(29,28,34,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= ARENA_W; x += T) wobblyLine(ctx, x, 0, x, ARENA_H, rand);
  for (let y = 0; y <= ARENA_H; y += T) wobblyLine(ctx, 0, y, ARENA_W, y, rand);
  ctx.stroke();
  // 紅色中圈：手繪的好幾圈
  const cx = ARENA_W / 2, cy = ARENA_H / 2;
  ctx.strokeStyle = 'rgba(200,52,40,0.85)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.lineWidth = 3 - k * 0.6;
    ctx.beginPath();
    const r = 160 + (rand() - 0.5) * 10, a0 = rand() * 6;
    ctx.ellipse(cx + (rand() - 0.5) * 6, cy + (rand() - 0.5) * 6, r, r * (0.97 + rand() * 0.05), rand() * 0.3, a0, a0 + Math.PI * (1.85 + rand() * 0.3));
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.beginPath();
  wobblyLine(ctx, cx, 16, cx, cy - 160, rand, 1.5);
  wobblyLine(ctx, cx, cy + 160, cx, ARENA_H - 16, rand, 1.5);
  ctx.stroke();
  for (const [x, y] of [[40, 860], [1560, 40], [30, 330], [1570, 600], [700, 870]]) inkSplatter(ctx, rand, x, y, 26);
}

function floorShrine(ctx) {
  ctx.fillStyle = '#ece2cc';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  const rand = seeded(42);
  strokes(ctx, rand, 1300, ['#e2d6bc', '#f6efdf', '#d6c8aa', '#cfe6e2'], [10, 24], [4, 9], [0.3, 0.55]);
  glowPatches(ctx, rand, 10, '246,184,196', 80, 160, 0.22);
  for (let k = 0; k < 2200; k++) {
    ctx.fillStyle = k % 3 ? 'rgba(120,100,70,0.3)' : 'rgba(255,255,240,0.6)';
    ctx.fillRect(rand() * ARENA_W, rand() * ARENA_H, 3, 3);
  }
  lightShafts(ctx, rand);
  // 石板參道：中間一條直的、一條橫的
  const slab = (x, y, w, h) => {
    ctx.fillStyle = '#d3c8b1'; ctx.strokeStyle = 'rgba(29,28,34,0.6)'; ctx.lineWidth = 2;
    rrect(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(29,28,34,0.12)';
    ctx.fillRect(x + 2, y + h - 7, w - 4, 5);
  };
  for (let y = 170; y < ARENA_H - 160; y += 52) { slab(ARENA_W / 2 - 46, y, 44, 44); slab(ARENA_W / 2 + 2, y, 44, 44); }
  for (let x = 40; x < ARENA_W - 40; x += 52) {
    if (Math.abs(x + 22 - ARENA_W / 2) < 120) continue;
    slab(x, ARENA_H / 2 - 22, 44, 44);
  }
  for (const [x, y] of [[40, 860], [1560, 40], [1570, 600]]) inkSplatter(ctx, rand, x, y, 22);
}

function fence(ctx, theme) {
  const t = 16;
  const base = theme === 'shrine' ? '#e8452c' : '#4fb0bb';
  const line = theme === 'shrine' ? 'rgba(29,28,34,0.55)' : 'rgba(29,70,80,0.55)';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, ARENA_W, t); ctx.fillRect(0, ARENA_H - t, ARENA_W, t);
  ctx.fillRect(0, 0, t, ARENA_H); ctx.fillRect(ARENA_W - t, 0, t, ARENA_H);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x < ARENA_W; x += 14) { ctx.moveTo(x, 0); ctx.lineTo(x + 14, t); ctx.moveTo(x, ARENA_H - t); ctx.lineTo(x + 14, ARENA_H); }
  for (let y = 0; y < ARENA_H; y += 14) { ctx.moveTo(0, y); ctx.lineTo(t, y + 14); ctx.moveTo(ARENA_W - t, y); ctx.lineTo(ARENA_W, y + 14); }
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(t, t, ARENA_W - 2 * t, ARENA_H - 2 * t);
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, ARENA_W - 3, ARENA_H - 3);
}

// ── 障礙物（俯視，前側畫一條深色當作高度，影子用斜線） ──

function block(ctx, o, top, side, h = 14) {
  hatchShadow(ctx, () => rrect(ctx, o.x, o.y, o.w, o.h, 6));
  ctx.fillStyle = side;
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  rrect(ctx, o.x, o.y, o.w, o.h, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = top;
  rrect(ctx, o.x + 2, o.y + 2, o.w - 4, o.h - h, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(29,28,34,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(o.x + 4, o.y + o.h - h + 1); ctx.lineTo(o.x + o.w - 4, o.y + o.h - h + 1); ctx.stroke();
  // 側面的排線
  ctx.save();
  rrect(ctx, o.x, o.y + o.h - h, o.w, h, 4); ctx.clip();
  ctx.fillStyle = hatch(ctx, 'rgba(29,28,34,0.35)', 6);
  ctx.fillRect(o.x, o.y + o.h - h, o.w, h);
  ctx.restore();
}

function circleShadow(ctx, o, d = 9) {
  hatchShadow(ctx, () => { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); }, d, d + 2);
}

// 鏽斑
function rust(ctx, rand, x, y, w, h, n) {
  for (let k = 0; k < n; k++) {
    const rx = x + rand() * w, ry = y + rand() * h, r = 2 + rand() * 6;
    ctx.fillStyle = k % 3 ? 'rgba(150,70,30,0.55)' : 'rgba(90,40,20,0.6)';
    ctx.beginPath(); ctx.ellipse(rx, ry, r * 1.4, r, rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
}

// 鋪桌布的桌子（左上）／沙發（右下，鏡像）
function drawDesk(ctx, o) {
  block(ctx, o, '#f1e5c8', '#d5c39c', 22);
  const rand = seeded(o.x * 7 + o.y);
  ctx.strokeStyle = 'rgba(29,28,34,0.4)'; ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const x = o.x + 14 + rand() * (o.w - 28), y = o.y + 10 + rand() * (o.h - 44);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y + 6 * (rand() - 0.5), x + 30 + rand() * 30, y + 4);
  }
  ctx.stroke();
  // 抽屜
  ctx.fillStyle = '#a8743e'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  const dx = o.x + o.w - 56;
  ctx.fillRect(dx, o.y + o.h - 20, 36, 16); ctx.strokeRect(dx, o.y + o.h - 20, 36, 16);
  ctx.fillStyle = '#f3c93e'; ctx.beginPath(); ctx.arc(dx + 18, o.y + o.h - 12, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawSofa(ctx, o) {
  hatchShadow(ctx, () => rrect(ctx, o.x, o.y, o.w, o.h, 14));
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fillStyle = '#8f7642';
  rrect(ctx, o.x, o.y, o.w, o.h, 14); ctx.fill(); ctx.stroke();
  // 椅背在右側、扶手在上下
  ctx.fillStyle = '#a88d55';
  rrect(ctx, o.x + o.w - 34, o.y + 4, 30, o.h - 8, 10); ctx.fill(); ctx.stroke();
  rrect(ctx, o.x + 4, o.y + 4, o.w - 40, 24, 10); ctx.fill(); ctx.stroke();
  rrect(ctx, o.x + 4, o.y + o.h - 28, o.w - 40, 24, 10); ctx.fill(); ctx.stroke();
  // 兩個坐墊
  ctx.fillStyle = '#b89c62';
  const ch = (o.h - 60) / 2;
  for (let k = 0; k < 2; k++) { rrect(ctx, o.x + 10, o.y + 30 + k * (ch + 2), o.w - 48, ch - 2, 8); ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(29,28,34,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
  for (let k = 0; k < 2; k++) { rrect(ctx, o.x + 16, o.y + 36 + k * (ch + 2), o.w - 60, ch - 14, 5); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.save(); rrect(ctx, o.x + o.w - 34, o.y + 4, 30, o.h - 8, 10); ctx.clip();
  ctx.fillStyle = hatch(ctx, 'rgba(29,28,34,0.3)', 6); ctx.fillRect(o.x + o.w - 34, o.y, 30, o.h);
  ctx.restore();
}

// 藍色鐵桶（俯視）
function drawBarrel(ctx, o) {
  circleShadow(ctx, o);
  const rand = seeded(Math.round(o.x * 3 + o.y));
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fillStyle = '#3f6f96';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5b8db5';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.84, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#4a7aa2';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(29,28,34,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.5, 0, Math.PI * 2); ctx.stroke();
  rust(ctx, rand, o.x - o.r * 0.9, o.y - o.r * 0.9, o.r * 1.8, o.r * 1.8, 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.73, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
  // 蓋子
  ctx.fillStyle = '#2f5878'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(o.x + o.r * 0.3, o.y - o.r * 0.25, o.r * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// 生鏽的紅白路障
function drawBarrier(ctx, o) {
  hatchShadow(ctx, () => rrect(ctx, o.x, o.y, o.w, o.h, 5));
  const rand = seeded(Math.round(o.x + o.y * 5));
  ctx.save();
  rrect(ctx, o.x, o.y, o.w, o.h, 5); ctx.clip();
  ctx.fillStyle = '#ece3d0'; ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = '#c8372a';
  for (let x = o.x - o.h; x < o.x + o.w; x += 34) {
    ctx.beginPath(); ctx.moveTo(x, o.y + o.h); ctx.lineTo(x + 16, o.y + o.h); ctx.lineTo(x + 16 + o.h, o.y); ctx.lineTo(x + o.h, o.y); ctx.closePath(); ctx.fill();
  }
  rust(ctx, rand, o.x, o.y, o.w, o.h, Math.round(o.w / 10));
  ctx.fillStyle = 'rgba(29,28,34,0.28)'; ctx.fillRect(o.x, o.y + o.h - 9, o.w, 9);
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  rrect(ctx, o.x, o.y, o.w, o.h, 5); ctx.stroke();
}

// 白色水泥牆
function drawWall(ctx, o) {
  block(ctx, o, '#f6f3ec', '#c9c5bb', 12);
  const rand = seeded(Math.round(o.x * 11 + o.y));
  ctx.strokeStyle = 'rgba(29,28,34,0.22)'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const x = o.x + 6 + rand() * (o.w - 12), y = o.y + 6 + rand() * (o.h - 30);
    ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 8, y + 10 + rand() * 18);
  }
  ctx.stroke();
}

// 方形抽風扇
function drawFan(ctx, o) {
  hatchShadow(ctx, () => rrect(ctx, o.x, o.y, o.w, o.h, 6));
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fillStyle = '#7a6656';
  rrect(ctx, o.x, o.y, o.w, o.h, 6); ctx.fill(); ctx.stroke();
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = Math.min(o.w, o.h) * 0.38;
  ctx.fillStyle = '#3a3330';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#a8957f';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48, r * 0.46, r * 0.2, a + 0.5, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.fillStyle = '#5a4a3e'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c9b8a2';
  for (const [dx, dy] of [[6, 6], [o.w - 6, 6], [6, o.h - 6], [o.w - 6, o.h - 6]]) { ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, 2.2, 0, Math.PI * 2); ctx.fill(); }
}

// 陶土盆栽
function drawPlantPot(ctx, o) {
  circleShadow(ctx, o, 7);
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fillStyle = '#d9692e';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a3a22';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.76, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#5f9e48';
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.quadraticCurveTo(o.x + Math.cos(a - 0.5) * o.r * 0.6, o.y + Math.sin(a - 0.5) * o.r * 0.6, o.x + Math.cos(a) * o.r * 0.95, o.y + Math.sin(a) * o.r * 0.95);
    ctx.quadraticCurveTo(o.x + Math.cos(a + 0.5) * o.r * 0.6, o.y + Math.sin(a + 0.5) * o.r * 0.6, o.x, o.y);
    ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();
  }
  ctx.fillStyle = '#8cc25e';
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// 木箱
function drawCrate(ctx, o) {
  hatchShadow(ctx, () => ctx.rect(o.x, o.y, o.w, o.h), 10, 12);
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fillStyle = '#c9965a';
  ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h);
  ctx.strokeStyle = 'rgba(90,50,10,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let y = o.y + 16; y < o.y + o.h; y += 16) { ctx.moveTo(o.x + 2, y); ctx.lineTo(o.x + o.w - 2, y); }
  ctx.stroke();
  const f = 9;
  ctx.fillStyle = '#a8743e'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.fillRect(o.x, o.y, o.w, f); ctx.strokeRect(o.x, o.y, o.w, f);
  ctx.fillRect(o.x, o.y + o.h - f, o.w, f); ctx.strokeRect(o.x, o.y + o.h - f, o.w, f);
  ctx.fillRect(o.x, o.y, f, o.h); ctx.strokeRect(o.x, o.y, f, o.h);
  ctx.fillRect(o.x + o.w - f, o.y, f, o.h); ctx.strokeRect(o.x + o.w - f, o.y, f, o.h);
  // X 形支架
  for (const [x0, y0, x1, y1] of [[o.x + f, o.y + f, o.x + o.w - f, o.y + o.h - f], [o.x + o.w - f, o.y + f, o.x + f, o.y + o.h - f]]) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
    ctx.fillStyle = '#b8834a'; ctx.fillRect(0, -4.5, L, 9); ctx.strokeRect(0, -4.5, L, 9);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  for (const [dx, dy] of [[4.5, 4.5], [o.w - 4.5, 4.5], [4.5, o.h - 4.5], [o.w - 4.5, o.h - 4.5]]) { ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, 1.8, 0, Math.PI * 2); ctx.fill(); }
  // 中間沾到的紅漆
  ctx.fillStyle = 'rgba(232,69,44,0.75)';
  ctx.beginPath(); ctx.ellipse(o.x + o.w * 0.78, o.y + o.h * 0.45, 9, 14, 0.3, 0, Math.PI * 2); ctx.fill();
}

function drawObstacle(ctx, o) {
  switch (o.kind) {
    case 'stairs': if (o.flip) drawSofa(ctx, o); else drawDesk(ctx, o); break;
    case 'tank': drawBarrel(ctx, o); break;
    case 'bench': drawBarrier(ctx, o); break;
    case 'wall': drawWall(ctx, o); break;
    case 'vent': drawFan(ctx, o); break;
    case 'plant': drawPlantPot(ctx, o); break;
    case 'box': drawCrate(ctx, o); break;
    case 'shrine': {
      // 屋頂（俯視）＋朱紅柱子
      hatchShadow(ctx, () => rrect(ctx, o.x, o.y, o.w, o.h, 8), 10, 12);
      ctx.fillStyle = '#e8452c'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      rrect(ctx, o.x, o.y, o.w, o.h, 8); ctx.fill(); ctx.stroke();
      const roof = o.flip ? '#1f4c9a' : '#2ea6b6';   // 深藍／土耳其藍屋頂
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(o.x - 10, o.y + 8); ctx.lineTo(o.x + o.w + 10, o.y + 8); ctx.lineTo(o.x + o.w - 20, o.y + o.h / 2);
      ctx.lineTo(o.x + o.w + 10, o.y + o.h - 8); ctx.lineTo(o.x - 10, o.y + o.h - 8); ctx.lineTo(o.x + 20, o.y + o.h / 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(29,28,34,0.3)'; ctx.lineWidth = 2;
      for (let x = o.x + 20; x < o.x + o.w - 10; x += 14) { ctx.beginPath(); ctx.moveTo(x, o.y + 12); ctx.lineTo(x, o.y + o.h - 12); ctx.stroke(); }
      ctx.strokeStyle = '#f3c93e'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(o.x + 20, o.y + o.h / 2); ctx.lineTo(o.x + o.w - 20, o.y + o.h / 2); ctx.stroke();
      ctx.fillStyle = '#f3c93e'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      for (const x of [o.x + 20, o.x + o.w - 20]) { ctx.beginPath(); ctx.arc(x, o.y + o.h / 2, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'sakura': {
      circleShadow(ctx, o, 10);
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      const puffs = [[0, 0, 1], [-0.45, -0.3, 0.62], [0.45, -0.3, 0.62], [-0.4, 0.38, 0.6], [0.42, 0.36, 0.6]];
      for (const [dx, dy, k] of puffs) { ctx.fillStyle = '#f7a8b8'; ctx.beginPath(); ctx.arc(o.x + dx * o.r, o.y + dy * o.r, o.r * k * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#f7a8b8';
      for (const [dx, dy, k] of puffs) { ctx.beginPath(); ctx.arc(o.x + dx * o.r, o.y + dy * o.r, o.r * k * 0.72 - 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = hatch(ctx, 'rgba(150,40,80,0.35)', 6);
      ctx.beginPath(); ctx.arc(o.x + o.r * 0.25, o.y + o.r * 0.3, o.r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff0f2';
      for (const [dx, dy] of [[-0.25, -0.35], [0.3, -0.1], [-0.1, 0.3]]) { ctx.beginPath(); ctx.arc(o.x + dx * o.r, o.y + dy * o.r, o.r * 0.16, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'lantern': {
      block(ctx, o, '#dcd6c6', '#9a9284', 10);
      ctx.fillStyle = '#f6e27a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(o.x + o.w / 2 - 6, o.y + (o.h - 10) / 2 - 5, 12, 10); ctx.strokeRect(o.x + o.w / 2 - 6, o.y + (o.h - 10) / 2 - 5, 12, 10);
      break;
    }
    case 'torii':
      circleShadow(ctx, o, 5);
      ctx.fillStyle = '#e8452c'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'pond': {
      ctx.fillStyle = '#8cc25e'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2ec4d0';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      for (const k of [0.55, 0.8]) { ctx.beginPath(); ctx.arc(o.x, o.y, o.r * k, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke(); }
      ctx.fillStyle = '#5f9e48'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      for (const [dx, dy] of [[-0.45, -0.3], [0.35, 0.4], [0.5, -0.35]]) {
        ctx.beginPath(); ctx.moveTo(o.x + dx * o.r, o.y + dy * o.r);
        ctx.arc(o.x + dx * o.r, o.y + dy * o.r, 11, 0.4, Math.PI * 2 - 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#f07b22';
      for (const [dx, dy, a] of [[-0.1, 0.25, 0.4], [0.15, -0.2, 2.6]]) {
        ctx.beginPath(); ctx.ellipse(o.x + dx * o.r, o.y + dy * o.r, 9, 4.5, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      break;
    }
    default:
      block(ctx, o, '#ddd', '#999');
  }
}

// 鳥居的橫梁畫在角色上面（角色從底下穿過）
function drawToriiBeams(ctx, arena) {
  // 兩根柱子一組：找最近的另一根配對
  const pillars = arena.obstacles.filter((o) => o.kind === 'torii');
  const used = new Set();
  const pairs = [];
  for (const a of pillars) {
    if (used.has(a)) continue;
    let best = null, bd = Infinity;
    for (const b of pillars) {
      if (b === a || used.has(b)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best && bd < 160) { used.add(a); used.add(best); pairs.push([a, best]); }
  }
  for (const [a, b] of pairs) {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    if (maxY - minY > maxX - minX) {
      ctx.fillStyle = '#1d1c22'; rrect(ctx, minX - 13, minY - 30, 26, maxY - minY + 60, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8452c'; rrect(ctx, minX - 7, minY - 22, 14, maxY - minY + 44, 4); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#1d1c22'; rrect(ctx, minX - 30, minY - 13, maxX - minX + 60, 26, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8452c'; rrect(ctx, minX - 22, minY - 7, maxX - minX + 44, 14, 4); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawArena(ctx, arena, { detail = true } = {}) {
  if (arena.theme === 'shrine') floorShrine(ctx); else floorRooftop(ctx);
  fence(ctx, arena.theme);
  for (const o of arena.obstacles) drawObstacle(ctx, o);
  if (!detail) drawToriiBeams(ctx, arena);
}

export function drawArenaOverlay(ctx, arena) {
  drawToriiBeams(ctx, arena);
}

export function drawArenaThumb(canvas, arena) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const s = Math.min(w / ARENA_W, h / ARENA_H) * dpr;
  ctx.setTransform(s, 0, 0, s, (canvas.width - ARENA_W * s) / 2, (canvas.height - ARENA_H * s) / 2);
  drawArena(ctx, arena, { detail: false });
  return true;
}

// ── 彩漆 ─────────────────────────────────────────────

export function splat(ctx, x, y, color, size = 1, rand = Math.random) {
  const r = 9 * size + rand() * 4;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.62;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const drops = 3 + Math.floor(rand() * 4 * size);
  for (let k = 0; k < drops; k++) {
    const a = rand() * Math.PI * 2, d = r * (0.9 + rand() * 1.2), rr = r * (0.18 + rand() * 0.3);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── 角色與武器 ───────────────────────────────────────

function drawGun(ctx, p) {
  const w = p.weapon.id;
  ctx.save();
  ctx.translate(p.x, p.y - 8);
  ctx.rotate(p.aim);
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  const len = w === 'sniper' ? 40 : w === 'shotgun' ? 28 : 26;
  const thick = w === 'shotgun' ? 11 : 8;
  ctx.fillStyle = '#4a4f5c';
  rrect(ctx, 6, -thick / 2, len, thick, 3); ctx.fill(); ctx.stroke();
  // 彩漆罐（玩家顏色）
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(14, -thick / 2 - 4, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (w === 'sniper') { ctx.fillStyle = '#c9d2d8'; rrect(ctx, 16, thick / 2 - 1, 14, 5, 2); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = p.color;
  ctx.fillRect(6 + len - 4, -thick / 2 + 1, 4, thick - 2);
  ctx.restore();
}

// Q 版角色圖：每張圖的像素比例一樣（耳朵、光環比較高的角色圖也比較高），腳底對齊角色位置下方
export const SPRITE_SCALE = 0.19;     // 世界單位／圖片像素
const FOOT = 15;                       // 腳底在角色中心下方多少

export function drawFighter(ctx, p, time, { hitFlash = 0 } = {}) {
  const img = charaImage(p.chara, 'sprite');
  const ready = img && img.complete && img.naturalWidth;
  const H = ready ? img.naturalHeight * SPRITE_SCALE : 76;
  const W = ready ? img.naturalWidth * SPRITE_SCALE : 50;
  const top = p.y + FOOT - H;
  const facingLeft = Math.cos(p.aim) < -0.05;
  const protectedNow = time < p.protectUntil;
  const blink = protectedNow && Math.floor(time * 10) % 2 === 0;
  // 走路時輕輕上下彈
  const moving = Math.hypot(p.vx || 0, p.vy || 0) > 20;
  const bob = moving ? Math.abs(Math.sin(time * 14 + (p.x + p.y) * 0.01)) * 3 : 0;

  // 腳下：影子＋玩家顏色的圈（同一個角色也分得出是誰）
  ctx.fillStyle = 'rgba(29,28,34,0.28)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + FOOT - 1, 21, 7.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(p.x, p.y + FOOT - 1, 23, 8.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = p.color; ctx.lineWidth = 3;
  ctx.stroke();

  // 衝刺殘影
  if (p.dashT > 0 && ready) {
    for (let k = 1; k <= 2; k++) {
      ctx.globalAlpha = 0.25 / k;
      ctx.drawImage(img, p.x - p.vx * 0.03 * k - W / 2, top - p.vy * 0.03 * k, W, H);
    }
    ctx.globalAlpha = 1;
  }
  const behind = Math.sin(p.aim) < -0.3;      // 槍往上指時畫在身體後面
  if (behind) drawGun(ctx, p);
  if (ready) {
    ctx.save();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.translate(p.x, 0);
    if (facingLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, -W / 2, top - bob, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle = p.color; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y - 10, BRAWL.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (!behind) drawGun(ctx, p);
  if (hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.6, hitFlash * 4);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(p.x, top + H * 0.5, W * 0.42, H * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (protectedNow) {
    ctx.strokeStyle = 'rgba(46,196,208,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, top + H * 0.52, Math.max(W, 44) * 0.6, H * 0.56, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (p.shield > 0) {
    ctx.strokeStyle = 'rgba(46,196,208,0.75)'; ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y - 18, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// 名牌＋血條（世界座標）：名次圓章（玩家顏色）＋名字，底下是血條
export function drawFighterTag(ctx, p, rank) {
  const y = p.y - 78;
  const bw = 46;
  ctx.fillStyle = INK;
  rrect(ctx, p.x - bw / 2 - 2, y - 2, bw + 4, 10, 4); ctx.fill();
  const hp = Math.max(0, p.hp) / BRAWL.hp;
  ctx.fillStyle = hp > 0.6 ? '#5fbf5a' : hp > 0.3 ? '#f3c93e' : '#e8452c';
  rrect(ctx, p.x - bw / 2, y, bw * hp, 6, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  rrect(ctx, p.x - bw / 2 + 2, y + 0.5, Math.max(0, bw * hp - 4), 2, 1); ctx.fill();
  if (p.shield > 0) {
    ctx.fillStyle = '#2ec4d0';
    rrect(ctx, p.x - bw / 2, y, bw * Math.min(1, p.shield / 50), 3, 2); ctx.fill();
  }
  ctx.font = '900 13px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const nameW = ctx.measureText(p.name).width;
  const total = 16 + 3 + nameW;
  const x0 = p.x - total / 2, ly = y - 12;
  // 名次圓章
  ctx.fillStyle = p.color; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x0 + 8, ly, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = 'italic 900 11px system-ui, sans-serif';
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  ctx.strokeText(String(rank), x0 + 8, ly + 0.5);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(rank), x0 + 8, ly + 0.5);
  // 名字
  ctx.font = '900 13px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.strokeText(p.name, x0 + 19, ly);
  ctx.fillStyle = '#fff';
  ctx.fillText(p.name, x0 + 19, ly);
}

export function drawBullet(ctx, b) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  ctx.strokeStyle = b.color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = b.r * 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - (b.vx / sp) * 18, b.y - (b.vy / sp) * 18); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = b.color;
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
}

export function drawPower(ctx, pw, time) {
  const bob = Math.sin(time * 4 + pw.id) * 4;
  const x = pw.x, y = pw.y + bob;
  const def = POWERS[pw.kind];
  ctx.fillStyle = 'rgba(20,20,30,0.2)';
  ctx.beginPath(); ctx.ellipse(pw.x, pw.y + 18, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = def.color;
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (pw.kind === 'heal') {
    ctx.rect(x - 3.5, y - 10, 7, 20); ctx.rect(x - 10, y - 3.5, 20, 7);
  } else if (pw.kind === 'shield') {
    ctx.moveTo(x, y - 11); ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 8, y + 3); ctx.lineTo(x, y + 11); ctx.lineTo(x - 8, y + 3); ctx.lineTo(x - 9, y - 7); ctx.closePath();
  } else if (pw.kind === 'rapid') {
    for (const dx of [-7, 0, 7]) { ctx.moveTo(x + dx + 3.5, y); ctx.arc(x + dx, y, 3.5, 0, Math.PI * 2); }
  } else {
    ctx.moveTo(x + 3, y - 12); ctx.lineTo(x - 7, y + 2); ctx.lineTo(x, y + 2); ctx.lineTo(x - 3, y + 12); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x, y - 2); ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
}

// 武器小圖（手機武器庫的縮圖）
export function drawWeaponIcon(canvas, weaponId, color) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const k = (h / 26) * dpr;
  ctx.setTransform(k, 0, 0, k, canvas.width / 2 - 26 * k, canvas.height / 2 + 4 * k);
  drawGun(ctx, { x: 0, y: 8, aim: 0, color, weapon: { id: weaponId } });
  return true;
}
