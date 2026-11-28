// 背景：復古美漫的報紙內頁——泛黃新聞紙、從中間放射的普普風光芒、
// 兩個角落的 Ben-Day 網點（紅、青，越靠角落網點越大）、邊緣的墨線速度線、
// 紙張纖維與幾滴墨水。開頁時畫一次（視窗寬度改變才重畫）。

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const INK = '#1b1a1f';

// 一片網點：從角落 (ox, oy) 往外，網點越來越小；網格轉 angle 度（印刷的網角）
function halftone(ctx, w, h, { ox, oy, reach, color, step, angle, alpha }) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const span = Math.hypot(w, h);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let gy = -span; gy < span; gy += step) {
    for (let gx = -span; gx < span; gx += step) {
      const x = ox + gx * ca - gy * sa, y = oy + gx * sa + gy * ca;
      if (x < -step || y < -step || x > w + step || y > h + step) continue;
      const t = 1 - Math.hypot(x - ox, y - oy) / reach;
      if (t <= 0.04) continue;
      const r = step * 0.5 * Math.min(1, t * 1.15);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// 一條尖頭的墨線（速度線）：起點粗、尾端尖
function streak(ctx, x0, y0, x1, y1, wid) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a) * wid / 2, ny = Math.cos(a) * wid / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + nx, y0 + ny);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0 - nx, y0 - ny);
  ctx.closePath();
  ctx.fill();
}

function paint(canvas) {
  const w = window.innerWidth, h = window.innerHeight;
  const k = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const rand = seeded(19620815);
  const big = Math.max(w, h);
  const unit = Math.max(0.7, Math.min(1.3, Math.min(w, h) / 700));

  // 新聞紙底色
  ctx.fillStyle = '#f2e2bb';
  ctx.fillRect(0, 0, w, h);

  // 普普風放射光芒（淡黃、淡橘交錯）
  const cx = w * 0.5, cy = h * 0.4;
  const rays = 36;
  for (let i = 0; i < rays; i++) {
    if (i % 2) continue;
    const a0 = (i / rays) * Math.PI * 2 + 0.05, a1 = ((i + 1) / rays) * Math.PI * 2 + 0.05;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255, 205, 70, 0.38)' : 'rgba(245, 150, 60, 0.2)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * big * 1.5, cy + Math.sin(a0) * big * 1.5);
    ctx.lineTo(cx + Math.cos(a1) * big * 1.5, cy + Math.sin(a1) * big * 1.5);
    ctx.closePath();
    ctx.fill();
  }
  // 中間淡一點，文字比較好讀
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, big * 0.55);
  glow.addColorStop(0, 'rgba(250, 240, 214, 0.75)');
  glow.addColorStop(1, 'rgba(250, 240, 214, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Ben-Day 網點：左上紅、右下青
  const step = 13 * unit;
  halftone(ctx, w, h, { ox: 0, oy: 0, reach: big * 0.62, color: '#e23a2c', step, angle: 0.26, alpha: 0.55 });
  halftone(ctx, w, h, { ox: w, oy: h, reach: big * 0.62, color: '#2a9fd0', step, angle: 1.31, alpha: 0.5 });

  // 四邊的墨線速度線（朝中間）
  ctx.fillStyle = INK;
  const n = Math.round(90 * Math.max(1, big / 1200));
  for (let i = 0; i < n; i++) {
    const side = Math.floor(rand() * 4);
    const t = rand();
    let x0, y0;
    if (side === 0) { x0 = t * w; y0 = -4; }
    else if (side === 1) { x0 = w + 4; y0 = t * h; }
    else if (side === 2) { x0 = t * w; y0 = h + 4; }
    else { x0 = -4; y0 = t * h; }
    const len = big * (0.05 + rand() * 0.12);
    const a = Math.atan2(cy - y0, cx - x0);
    ctx.globalAlpha = 0.18 + rand() * 0.3;
    streak(ctx, x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, (1.5 + rand() * 4) * unit);
  }
  ctx.globalAlpha = 1;

  // 舊紙的邊緣發黃
  const age = ctx.createRadialGradient(cx, h * 0.5, Math.min(w, h) * 0.35, cx, h * 0.5, big * 0.8);
  age.addColorStop(0, 'rgba(160, 110, 40, 0)');
  age.addColorStop(1, 'rgba(150, 100, 35, 0.22)');
  ctx.fillStyle = age;
  ctx.fillRect(0, 0, w, h);

  // 紙張纖維、雜點
  const specks = Math.round((w * h) / 2600);
  for (let i = 0; i < specks; i++) {
    const x = rand() * w, y = rand() * h;
    ctx.fillStyle = rand() < 0.7 ? 'rgba(120, 85, 40, 0.18)' : 'rgba(27, 26, 31, 0.22)';
    ctx.fillRect(x, y, 1 + rand() * 1.6, 0.6 + rand() * 0.8);
  }

  // 幾滴墨水
  for (let i = 0; i < 7; i++) {
    const x = rand() * w, y = rand() * h, r = (2 + rand() * 4) * unit;
    ctx.fillStyle = 'rgba(27, 26, 31, 0.55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    for (let j = 0; j < 5; j++) {
      const a = rand() * Math.PI * 2, d = r * (1.6 + rand() * 2.2);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.15 + rand() * 0.3), 0, Math.PI * 2); ctx.fill();
    }
  }
}

const canvas = document.createElement('canvas');
canvas.className = 'backdrop';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
paint(canvas);
let timer = null;
let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  // 手機捲動時網址列伸縮也會觸發 resize，只有寬度變了才重畫
  if (window.innerWidth === lastW) return;
  lastW = window.innerWidth;
  clearTimeout(timer);
  timer = setTimeout(() => paint(canvas), 150);
});
