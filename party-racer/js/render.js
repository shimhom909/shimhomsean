// 繪圖：車子造型、賽道場景。主機畫面與手機選車預覽共用。

import { WORLD } from './config.js';

export const INK = '#17244a';   // 卡通風格的深藍描邊色

// ── 顏色工具 ──
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function shade(hex, amt) {
  // amt > 0 變亮、< 0 變暗
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function isLight(hex) {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wheel(ctx, x, y, w, h) {
  ctx.fillStyle = '#16161a';
  rrect(ctx, x - w / 2, y - h / 2, w, h, 1.5);
  ctx.fill();
}

// 車頭朝 +x，原點在車身中心，單位 = 世界座標
export const CAR_SIZE = {
  coupe: { l: 34, w: 18 },
  sport: { l: 38, w: 17 },
  kart: { l: 28, w: 18 },
  truck: { l: 38, w: 22 },
};

export function drawCar(ctx, shape, color, fx = {}) {
  const dark = shade(color, -0.35);
  const light = shade(color, 0.35);
  const glass = '#1d2b44';
  const outline = INK;
  ctx.lineJoin = 'round';

  // 陰影
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  const sz = CAR_SIZE[shape] || CAR_SIZE.coupe;
  rrect(ctx, -sz.l / 2 + 2, -sz.w / 2 + 3, sz.l, sz.w, 6);
  ctx.fill();
  ctx.restore();

  // 氮氣火焰
  if (fx.boost) {
    const fl = 10 + Math.random() * 8;
    const gx = -sz.l / 2;
    const grad = ctx.createLinearGradient(gx, 0, gx - fl, 0);
    grad.addColorStop(0, 'rgba(120,200,255,0.95)');
    grad.addColorStop(0.4, 'rgba(255,200,60,0.9)');
    grad.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = grad;
    for (const oy of [-sz.w * 0.22, sz.w * 0.22]) {
      ctx.beginPath();
      ctx.moveTo(gx, oy - 3);
      ctx.lineTo(gx - fl, oy);
      ctx.lineTo(gx, oy + 3);
      ctx.fill();
    }
  }

  ctx.lineWidth = 1.8;
  ctx.strokeStyle = outline;

  if (shape === 'sport') {
    wheel(ctx, 11, -8.5, 9, 4); wheel(ctx, 11, 8.5, 9, 4);
    wheel(ctx, -11, -8.5, 10, 4.5); wheel(ctx, -11, 8.5, 10, 4.5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(19, -4); ctx.quadraticCurveTo(21, 0, 19, 4);
    ctx.lineTo(4, 8.5); ctx.lineTo(-17, 8.5); ctx.lineTo(-18, -8.5); ctx.lineTo(4, -8.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-17, -1.6, 36, 3.2);              // 賽車條紋
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.ellipse(-1, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-20, -10, 4, 20);                  // 尾翼
    ctx.strokeRect(-20, -10, 4, 20);
  } else if (shape === 'kart') {
    wheel(ctx, 9, -9, 8, 5); wheel(ctx, 9, 9, 8, 5);
    wheel(ctx, -9, -9.5, 9, 6); wheel(ctx, -9, 9.5, 9, 6);
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(-10, -1.5, 20, 3);                  // 車架
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(14, -5); ctx.lineTo(14, 5); ctx.lineTo(4, 7); ctx.lineTo(-12, 7);
    ctx.lineTo(-13, -7); ctx.lineTo(4, -7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = dark;
    ctx.fillRect(12, -7, 3, 14);                     // 前保險桿
    ctx.fillStyle = '#fafafa';                       // 安全帽
    ctx.beginPath(); ctx.arc(-3, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.arc(-1.5, 0, 3.2, -1.1, 1.1); ctx.lineTo(-1.5, 0); ctx.fill();
  } else if (shape === 'truck') {
    wheel(ctx, 11, -11, 11, 5); wheel(ctx, 11, 11, 11, 5);
    wheel(ctx, -11, -11, 11, 5); wheel(ctx, -11, 11, 11, 5);
    ctx.fillStyle = color;
    rrect(ctx, -19, -10, 38, 20, 3.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = dark;
    rrect(ctx, -17, -7.5, 15, 15, 2); ctx.fill();    // 貨斗
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    for (const yy of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(-16, yy); ctx.lineTo(-3, yy); ctx.stroke(); }
    ctx.strokeStyle = outline;
    ctx.fillStyle = light;
    rrect(ctx, 0, -8, 11, 16, 2); ctx.fill();        // 車頂
    ctx.fillStyle = glass;
    ctx.fillRect(9, -7.5, 4, 15);                    // 擋風玻璃
    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(2, -6, 2, 12);                      // 車頂燈條
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(19, -9, 2.5, 18);                   // 防撞桿
  } else {
    // coupe
    wheel(ctx, 10, -8.5, 8, 4); wheel(ctx, 10, 8.5, 8, 4);
    wheel(ctx, -10, -8.5, 8, 4); wheel(ctx, -10, 8.5, 8, 4);
    ctx.fillStyle = color;
    rrect(ctx, -17, -9, 34, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = light;
    rrect(ctx, -8, -6.5, 14, 13, 3); ctx.fill();     // 車頂
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.moveTo(6, -6.5); ctx.lineTo(10.5, -7.5); ctx.lineTo(10.5, 7.5); ctx.lineTo(6, 6.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-11.5, -6.5); ctx.lineTo(-11.5, 6.5); ctx.lineTo(-8, 6); ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-17.5, -8, 2.5, 16);                // 小尾翼
  }

  // 頭燈、煞車燈
  const hl = sz.l / 2 - 1.5;
  ctx.fillStyle = '#fff6c2';
  ctx.fillRect(hl - 1, -sz.w / 2 + 2, 2.5, 3);
  ctx.fillRect(hl - 1, sz.w / 2 - 5, 2.5, 3);
  ctx.fillStyle = fx.brake ? '#ff2a2a' : '#8a1c1c';
  ctx.fillRect(-sz.l / 2 - 0.5, -sz.w / 2 + 2, 2, 3);
  ctx.fillRect(-sz.l / 2 - 0.5, sz.w / 2 - 5, 2, 3);
}

// ── 車款展示（選車畫面、大廳）：車子停在一個圓形展示台上，稍微斜看 ──

function fitCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return { dpr, w, h };
}

// 回傳 false 表示 canvas 目前看不到（所在畫面隱藏中），沒有畫
export function drawShowcase(canvas, shape, color, angle = -0.6, { platform = true } = {}) {
  const fit = fitCanvas(canvas);
  if (!fit) return false;
  const { dpr, w, h } = fit;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = w / 2;
  const tilt = 0.55;                                  // 斜看的壓扁比例
  // 展示台貼齊畫布底部，台面＋側面高度 = rx × (2×tilt + 0.12)
  const rx = Math.min(w * 0.46, (h - 8) / (2 * tilt + 0.14));
  const ry = rx * tilt;
  const band = rx * 0.12;
  const cy = h - 5 - band - ry;
  if (platform) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    // 台座側面
    ctx.fillStyle = '#5b6b9a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + band, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 台面
    const g = ctx.createRadialGradient(cx, cy - ry * 0.3, rx * 0.1, cx, cy, rx);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#cfe3ff');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(23,36,74,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const sz = CAR_SIZE[shape] || CAR_SIZE.coupe;
  const k = (rx * 1.25) / Math.max(sz.l, 30);
  ctx.save();
  ctx.translate(cx, cy - rx * 0.05);
  ctx.scale(k, k * tilt);
  ctx.rotate(angle);
  drawCar(ctx, shape, color);
  ctx.restore();
  return true;
}

// 舊名稱保留：純俯視的小圖
export function drawCarPreview(canvas, shape, color, { angle = -Math.PI / 2, scale } = {}) {
  const fit = fitCanvas(canvas);
  if (!fit) return false;
  const { dpr, w, h } = fit;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = scale || (Math.min(w, h) / 46);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, (w * dpr) / 2, (h * dpr) / 2);
  ctx.rotate(angle);
  drawCar(ctx, shape, color);
  return true;
}

// ── 賽道場景 ──

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function tracePath(ctx, track) {
  const p = track.pts;
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
}

function farFromTrack(track, x, y, minD) {
  for (let i = 0; i < track.n; i += 2) {
    const dx = x - track.pts[i].x, dy = y - track.pts[i].y;
    if (dx * dx + dy * dy < minD * minD) return false;
  }
  return true;
}

// 場景裝飾（樹、輪胎堆、小花）：隨機但固定，每條賽道算一次
function decorFor(track) {
  if (track._decor) return track._decor;
  const rand = seeded(track.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const wall = track.half + track.runoff;
  const tires = [];
  // 急彎外側擺輪胎堆
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
    if (tires.some((t) => Math.hypot(t.x - x, t.y - y) < 40)) continue;
    tires.push({ x, y, a: Math.atan2(track.ty[i], track.tx[i]) });
  }
  const trees = [];
  for (let k = 0; k < 1200 && trees.length < 60; k++) {
    const x = 30 + rand() * (WORLD.w - 60), y = 30 + rand() * (WORLD.h - 60);
    if (!farFromTrack(track, x, y, wall + 34)) continue;
    if (tires.some((t) => Math.hypot(t.x - x, t.y - y) < 40)) continue;
    if (trees.every((t) => Math.hypot(t.x - x, t.y - y) > 50)) trees.push({ x, y, r: 15 + rand() * 11 });
  }
  const flowers = [];
  const fc = ['#ffffff', '#ffd23f', '#ff7eb6', '#ffffff', '#7fd3ff'];
  for (let k = 0; k < 600 && flowers.length < 140; k++) {
    const x = rand() * WORLD.w, y = rand() * WORLD.h;
    if (farFromTrack(track, x, y, wall + 16)) flowers.push({ x, y, c: fc[k % fc.length] });
  }
  track._decor = { tires, trees, flowers };
  return track._decor;
}

// 在 ctx 目前的「世界座標」變換下畫出整個賽道（背景層，畫一次快取起來）
export function drawTrackScene(ctx, track, { detail = true } = {}) {
  const W = WORLD.w, H = WORLD.h;
  // 卡通草皮：兩種綠色的大格子
  ctx.fillStyle = '#5ccb58';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#69d664';
  const cell = 100;
  for (let y = 0; y < H; y += cell) {
    for (let x = ((y / cell) % 2) * cell; x < W; x += cell * 2) ctx.fillRect(x, y, cell, cell);
  }

  const deco = decorFor(track);
  if (detail) {
    for (const f of deco.flowers) {
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  tracePath(ctx, track);
  const outer = track.width + track.runoff * 2;

  // 護欄：深色描邊 + 紅白相間
  ctx.lineWidth = outer + 30;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = outer + 22;
  ctx.strokeStyle = '#ff4f5e';
  ctx.stroke();
  ctx.setLineDash([22, 22]);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.setLineDash([]);

  // 砂石緩衝區
  ctx.lineWidth = outer;
  ctx.strokeStyle = '#f4d98f';
  ctx.stroke();

  // 路緣石
  ctx.lineWidth = track.width + 16;
  ctx.strokeStyle = '#ff4f5e';
  ctx.stroke();
  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.setLineDash([]);

  // 柏油＋內側白邊線
  ctx.lineWidth = track.width;
  ctx.strokeStyle = '#5a6278';
  ctx.stroke();
  if (detail) {
    ctx.lineWidth = track.width - 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.lineWidth = track.width - 13;
    ctx.strokeStyle = '#5a6278';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,210,63,0.75)';
    ctx.setLineDash([24, 26]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 起終點方格線
  const p0 = track.pts[0];
  const ang = Math.atan2(track.ty[0], track.tx[0]);
  ctx.save();
  ctx.translate(p0.x, p0.y);
  ctx.rotate(ang);
  const cells = 10, cw = track.width / cells;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cells; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#17244a' : '#fff';
      ctx.fillRect(-cw + r * cw, -track.half + c * cw, cw, cw);
    }
  }
  ctx.restore();

  if (!detail) return;

  // 起跑格
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  for (let slot = 0; slot < 8; slot++) {
    const back = 34 + Math.floor(slot / 2) * 44;
    const idx = (track.n - Math.round(back / track.ds) + track.n) % track.n;
    const side = slot % 2 === 0 ? -1 : 1;
    const off = side * track.width * 0.22;
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

  // 輪胎堆
  for (const t of deco.tires) {
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

  // 卡通樹
  for (const t of deco.trees) {
    ctx.fillStyle = 'rgba(0,40,0,0.22)';
    ctx.beginPath(); ctx.ellipse(t.x + 6, t.y + 8, t.r, t.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2fae4e';
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#55cf6a';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.28, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.42, t.y - t.r * 0.45, t.r * 0.16, 0, Math.PI * 2); ctx.fill();
  }
}

// 起終點拱門（畫在車子上面，車子會從底下穿過）
export function drawGantry(ctx, track) {
  const p0 = track.pts[0];
  const ang = Math.atan2(track.ty[0], track.tx[0]);
  const span = track.half + track.runoff * 0.6;
  ctx.save();
  ctx.translate(p0.x + track.tx[0] * 16, p0.y + track.ty[0] * 16);
  ctx.rotate(ang);
  ctx.globalAlpha = 0.95;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(-6 + 8, -span + 10, 14, span * 2);
  // 橫桿
  ctx.fillStyle = '#2f8cff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.rect(-7, -span, 14, span * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-5, -span + 2, 4, span * 2 - 4);
  // 柱子
  for (const y of [-span, span]) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(0, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // 字
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#fff';
  ctx.font = '900 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START · FINISH', 0, 0.5);
  ctx.restore();
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
