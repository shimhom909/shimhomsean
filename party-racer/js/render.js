// 繪圖：車子造型、選車展示台、起終點拱門。主機畫面與手機共用。

export const INK = '#1d1c22';   // 海報風格的黑墨線

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
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x - w / 2 + 1.5, y - h / 2 + 0.8, w - 3, Math.max(0.8, h * 0.18));
}

// 駕駛的頭像（開放式座艙）：不管車子往哪開都保持正的
function driverFace(ctx, x, r, face) {
  ctx.save();
  ctx.translate(x, 0);
  const m = ctx.getTransform();
  ctx.rotate(-Math.atan2(m.b, m.a));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  if (face && face.complete && face.naturalWidth) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(face, -r * 1.12, -r * 1.12, r * 2.24, r * 2.24);
    ctx.restore();
  }
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
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

  ctx.lineWidth = 2;
  ctx.strokeStyle = outline;

  if (shape === 'sport') {
    // 方程式賽車：露出來的輪子、前後翼、窄車鼻
    wheel(ctx, 12, -9.5, 8, 5); wheel(ctx, 12, 9.5, 8, 5);
    wheel(ctx, -11, -10, 10, 6); wheel(ctx, -11, 10, 10, 6);
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(9, -9, 6, 1.4); ctx.fillRect(9, 7.6, 6, 1.4);         // 懸吊
    ctx.fillRect(-14, -9, 6, 1.4); ctx.fillRect(-14, 7.6, 6, 1.4);
    ctx.fillStyle = dark;
    rrect(ctx, 17, -9, 3.5, 18, 1); ctx.fill(); ctx.stroke();          // 前翼
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(20, -2); ctx.lineTo(20, 2); ctx.lineTo(8, 3.4); ctx.lineTo(4, 6.5); ctx.lineTo(-10, 6);
    ctx.lineTo(-16, 3); ctx.lineTo(-16, -3); ctx.lineTo(-10, -6); ctx.lineTo(4, -6.5); ctx.lineTo(8, -3.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.moveTo(4, -5.5); ctx.lineTo(-9, -5); ctx.lineTo(-9, -2.5); ctx.lineTo(4, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(8, -0.9, 11, 1.8);                                    // 車鼻條紋
    ctx.fillStyle = dark;
    rrect(ctx, -21, -9.5, 4.5, 19, 1); ctx.fill(); ctx.stroke();       // 尾翼
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.ellipse(-1, 0, 6, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    driverFace(ctx, -1.5, 3.6, fx.face);
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
    driverFace(ctx, -3, 5, fx.face);                 // 駕駛
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

// 展示台（線稿風）：米色台面＋外圈青色網點、側面斜線陰影、粗墨線
const platformCache = new Map();
function drawPlatform(ctx, cx, cy, rx, ry, band) {
  ctx.lineJoin = 'round';
  const side = () => {
    ctx.beginPath();
    ctx.ellipse(cx, cy + band, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
  };
  const top = () => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
  // 側面：淡木色，右半邊斜線
  ctx.fillStyle = '#dcc79f';
  side(); ctx.fill();
  ctx.save();
  side(); ctx.clip();
  ctx.strokeStyle = 'rgba(27,26,31,0.6)';
  ctx.lineWidth = 1.3;
  const y0 = cy - 2, y1 = cy + ry + band + 2;
  for (let x = cx - rx * 0.25; x < cx + rx + (y1 - y0); x += 4.5) {
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x - (y1 - y0), y1); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  side(); ctx.stroke();
  // 台面：紙色，外圈網點越往外越大
  ctx.fillStyle = '#fbf1d8';
  top(); ctx.fill();
  ctx.save();
  top(); ctx.clip();
  ctx.fillStyle = 'rgba(47,179,217,0.6)';
  const step = Math.max(5, rx / 18);
  for (let y = cy - ry; y <= cy + ry; y += step * 0.8) {
    const row = Math.round((y - cy) / (step * 0.8));
    for (let x = cx - rx + (row % 2 ? step / 2 : 0); x <= cx + rx; x += step) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const t = (d - 0.58) / 0.42;
      if (t <= 0) continue;
      ctx.beginPath(); ctx.arc(x, y, step * 0.42 * Math.min(1, t), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  top(); ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.58, ry * 0.58, 0, 0, Math.PI * 2); ctx.stroke();
}

// 回傳 false 表示 canvas 目前看不到（所在畫面隱藏中），沒有畫
export function drawShowcase(canvas, shape, color, angle = -0.6, { platform = true, face = null } = {}) {
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
    // 台座畫一次存起來（手機車庫每一格都在轉車子，台座不用每格重畫）
    const key = `${canvas.width}x${canvas.height}`;
    let pc = platformCache.get(key);
    if (!pc) {
      pc = document.createElement('canvas');
      pc.width = canvas.width; pc.height = canvas.height;
      const p = pc.getContext('2d');
      p.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlatform(p, cx, cy, rx, ry, band);
      if (platformCache.size > 24) platformCache.clear();
      platformCache.set(key, pc);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(pc, 0, 0);
    ctx.restore();
  }
  const sz = CAR_SIZE[shape] || CAR_SIZE.coupe;
  const k = (rx * 1.25) / Math.max(sz.l, 30);
  ctx.save();
  ctx.translate(cx, cy - rx * 0.05);
  ctx.scale(k, k * tilt);
  ctx.rotate(angle);
  drawCar(ctx, shape, color, { face });
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

// 起終點拱門（畫在車子上面，車子會從底下穿過）：生鏽的鋼架＋START 布條＋格子旗
export function drawGantry(ctx, track) {
  const p0 = track.pts[0];
  const ang = Math.atan2(track.ty[0], track.tx[0]);
  const span = track.half + track.runoff + 4;
  const metal = '#8a7766', metalLight = '#b4a08a';
  ctx.save();
  ctx.translate(p0.x + track.tx[0] * 16, p0.y + track.ty[0] * 16);
  ctx.rotate(ang);
  ctx.lineJoin = 'round';

  // 地上的影子（斜線）
  ctx.save();
  ctx.translate(12, 14);
  ctx.fillStyle = 'rgba(29,28,34,0.25)';
  ctx.fillRect(-12, -span, 24, span * 2);
  ctx.restore();

  // 兩根鋼梁＋之字形支架
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  for (const x of [-11, 7]) {
    ctx.fillStyle = metal;
    ctx.fillRect(x, -span, 4, span * 2); ctx.strokeRect(x, -span, 4, span * 2);
    ctx.fillStyle = metalLight;
    ctx.fillRect(x + 0.8, -span + 2, 1.2, span * 2 - 4);
  }
  ctx.strokeStyle = metal;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let y = -span, k = 0; y < span; y += 12, k++) { ctx.moveTo(-8, y); ctx.lineTo(8, y + 12); ctx.moveTo(8, y); ctx.lineTo(-8, y + 12); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(29,28,34,0.6)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 鏽斑
  ctx.fillStyle = 'rgba(150,70,30,0.6)';
  for (let k = 0; k < 14; k++) {
    const y = -span + ((k * 37) % (span * 2)), x = k % 2 ? -10 : 8;
    ctx.beginPath(); ctx.ellipse(x + 1, y, 1.8, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 兩端的柱子
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  for (const y of [-span, span]) {
    ctx.fillStyle = '#6f5e50';
    ctx.fillRect(-14, y - 7, 28, 14); ctx.strokeRect(-14, y - 7, 28, 14);
    ctx.fillStyle = '#e8452c';
    ctx.beginPath(); ctx.arc(0, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // START 布條＋格子旗
  const bw = Math.min(span * 0.95, 70);
  ctx.fillStyle = '#e4d4b2';
  ctx.fillRect(-10, -bw - 10, 20, bw * 2 - 10); ctx.strokeRect(-10, -bw - 10, 20, bw * 2 - 10);
  ctx.fillStyle = 'rgba(150,70,30,0.35)';
  ctx.fillRect(-10, -bw - 10, 20, 4); ctx.fillRect(-10, bw - 24, 20, 4);
  const cy = bw - 20, cs = 5;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    ctx.fillStyle = (r + c) % 2 ? INK : '#fff';
    ctx.fillRect(-10 + c * cs, cy + r * cs, cs, cs);
  }
  ctx.strokeRect(-10, cy, 20, 20);
  ctx.save();
  ctx.rotate(Math.PI / 2);
  ctx.font = 'italic 900 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  const tx = -14;
  ctx.strokeText('START', tx, 0.5);
  ctx.fillStyle = '#f3c93e';
  ctx.fillText('START', tx, 0.5);
  ctx.restore();
  ctx.restore();
}
