// 繪圖：車子造型、賽道場景。主機畫面與手機選車預覽共用。

import { WORLD } from './config.js';

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
  const outline = 'rgba(0,0,0,0.55)';
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

  ctx.lineWidth = 1.4;
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

// 在一個 canvas 上畫車款預覽（選車畫面、大廳）
// 回傳 false 表示 canvas 目前看不到（所在畫面隱藏中），沒有畫
export function drawCarPreview(canvas, shape, color, { angle = -Math.PI / 2, scale } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
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

// 隨機但固定的樹木位置（離賽道夠遠才種）
function treesFor(track) {
  if (track._trees) return track._trees;
  const rand = seeded(track.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const trees = [];
  const minD = track.half + track.runoff + 26;
  for (let k = 0; k < 900 && trees.length < 70; k++) {
    const x = 30 + rand() * (WORLD.w - 60), y = 30 + rand() * (WORLD.h - 60);
    let ok = true;
    for (let i = 0; i < track.n; i += 2) {
      const dx = x - track.pts[i].x, dy = y - track.pts[i].y;
      if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
    }
    if (ok && trees.every((t) => Math.hypot(t.x - x, t.y - y) > 46)) trees.push({ x, y, r: 14 + rand() * 12 });
  }
  track._trees = trees;
  return trees;
}

// 在 ctx 目前的「世界座標」變換下畫出整個賽道（背景層，畫一次快取起來）
export function drawTrackScene(ctx, track, { detail = true } = {}) {
  const W = WORLD.w, H = WORLD.h;
  // 草地＋割草條紋
  ctx.fillStyle = '#3f9b4a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#46a852';
  for (let x = 0; x < W; x += 120) ctx.fillRect(x, 0, 60, H);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 護欄（紅白輪胎牆）→ 砂石緩衝區 → 路緣石 → 柏油
  tracePath(ctx, track);
  ctx.lineWidth = track.width + track.runoff * 2 + 22;
  ctx.strokeStyle = '#d32f2f';
  ctx.stroke();
  ctx.setLineDash([18, 18]);
  ctx.strokeStyle = '#f5f5f5';
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = track.width + track.runoff * 2;
  ctx.strokeStyle = '#d9c48c';
  ctx.stroke();

  ctx.lineWidth = track.width + 12;
  ctx.strokeStyle = '#e53935';
  ctx.stroke();
  ctx.setLineDash([12, 12]);
  ctx.strokeStyle = '#fafafa';
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = track.width;
  ctx.strokeStyle = '#50535c';
  ctx.stroke();

  if (detail) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([20, 24]);
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
      ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
      ctx.fillRect(-cw + r * cw, -track.half + c * cw, cw, cw);
    }
  }
  ctx.restore();

  if (detail) {
    // 起跑格
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
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
      ctx.moveTo(22, -12); ctx.lineTo(22, 12);
      ctx.moveTo(22, -12); ctx.lineTo(10, -12);
      ctx.moveTo(22, 12); ctx.lineTo(10, 12);
      ctx.stroke();
      ctx.restore();
    }

    // 行進方向箭頭（起點後方一點）
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const at of [0.25, 0.5, 0.75]) {
      const i = Math.floor(track.n * at);
      const p = track.pts[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(track.ty[i], track.tx[i]));
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // 樹
    for (const t of treesFor(track)) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.arc(t.x + 5, t.y + 6, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#43a047';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// 賽道縮圖（大廳選賽道用）
export function drawTrackThumb(canvas, track) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const s = Math.min(w / WORLD.w, h / WORLD.h) * dpr;
  ctx.setTransform(s, 0, 0, s, (canvas.width - WORLD.w * s) / 2, (canvas.height - WORLD.h * s) / 2);
  drawTrackScene(ctx, track, { detail: false });
}
