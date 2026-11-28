// 繪圖：車子造型、選車展示台、起終點拱門。主機畫面與手機共用。

export const INK = '#0d2a36';   // 卡通風格的深青藍描邊色

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
    ctx.fillStyle = '#2f6670';
    ctx.beginPath();
    ctx.ellipse(cx, cy + band, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 台面
    const g = ctx.createRadialGradient(cx, cy - ry * 0.3, rx * 0.1, cx, cy, rx);
    g.addColorStop(0, '#f6fbd6');
    g.addColorStop(1, '#bfe6d8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(13,42,54,0.18)';
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

// 賽道場景（地面、護欄、裝飾）在 scenery.js

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
  ctx.fillStyle = '#1f8f86';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.rect(-7, -span, 14, span * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-5, -span + 2, 4, span * 2 - 4);
  // 柱子
  for (const y of [-span, span]) {
    ctx.fillStyle = '#cfe455';
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
