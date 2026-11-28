// 背景：復古海報風格——水藍底色、從上方放射出來的白色乾筆刷痕（像速度線）、
// 上緣深藍天空與奶油色積雲（墨線描邊）、紅橙／奶油色的油漆噴點。
// 開頁時畫一次（視窗寬度改變才重畫）。

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const INK = '#1d1c22';

// 一朵卡通積雲：幾個圓疊起來，底部切平，墨線描邊＋右下陰影
function cloud(ctx, x, y, s, rand) {
  const puffs = [];
  const n = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    puffs.push({ x: x + (t - 0.5) * s * 2.2, y: y - Math.sin(t * Math.PI) * s * (0.5 + rand() * 0.35), r: s * (0.42 + rand() * 0.3) });
  }
  const shape = () => {
    ctx.beginPath();
    for (const p of puffs) { ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); }
    ctx.rect(x - s * 1.2, y - s * 0.2, s * 2.4, s * 0.45);
  };
  ctx.save();
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.strokeStyle = INK;
  shape(); ctx.stroke();
  ctx.fillStyle = '#f6eedb';
  shape(); ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#b9cfd6';                    // 陰影
  for (const p of puffs) { ctx.beginPath(); ctx.arc(p.x + p.r * 0.35, p.y + p.r * 0.45, p.r * 0.85, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fffaf0';                    // 受光
  for (const p of puffs) { ctx.beginPath(); ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.45, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function paint(canvas) {
  const w = window.innerWidth, h = window.innerHeight;
  const k = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const rand = seeded(20261128);
  const big = Math.max(w, h);

  // 底色：上緣深藍，往下變成水藍
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a5fa8');
  g.addColorStop(0.22, '#4f9fc4');
  g.addColorStop(0.45, '#7cc4cc');
  g.addColorStop(1, '#5fb4c4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 放射狀的乾筆刷痕（從上方中間往外）
  const fx = w * 0.5, fy = -h * 0.08;
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const a = Math.PI * (0.08 + rand() * 0.84);
    const r0 = big * (0.18 + rand() * 0.5), r1 = r0 + big * (0.08 + rand() * 0.32);
    const wid = 2 + rand() * 9;
    ctx.strokeStyle = rand() < 0.75 ? '#f6eedb' : '#ffffff';
    ctx.globalAlpha = 0.18 + rand() * 0.45;
    // 每一筆分成幾段，粗細略不同，看起來像乾掉的刷毛
    for (let b = 0; b < 3; b++) {
      const off = (b - 1) * wid * 0.45;
      ctx.lineWidth = wid * (0.35 + rand() * 0.4);
      ctx.beginPath();
      ctx.moveTo(fx + Math.cos(a) * r0 + -Math.sin(a) * off, fy + Math.sin(a) * r0 + Math.cos(a) * off);
      const rr = r1 - rand() * (r1 - r0) * 0.4;
      ctx.lineTo(fx + Math.cos(a) * rr + -Math.sin(a) * off, fy + Math.sin(a) * rr + Math.cos(a) * off);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 深色的大塊筆刷（海報上機車後方那種藍色陰影）
  for (let i = 0; i < 26; i++) {
    const x = rand() * w, y = h * (0.35 + rand() * 0.65);
    ctx.fillStyle = rand() < 0.5 ? 'rgba(31,76,154,0.16)' : 'rgba(29,28,34,0.07)';
    ctx.beginPath();
    ctx.ellipse(x, y, 40 + rand() * 120, 8 + rand() * 18, -0.4 + rand() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 上緣的積雲
  const cs = Math.max(26, Math.min(56, w * 0.045));
  for (let x = -cs * 0.5; x < w + cs; x += cs * (2.6 + rand() * 2.4)) {
    if (rand() < 0.3) continue;
    cloud(ctx, x, cs * 0.3 + rand() * cs * 0.6, cs * (0.6 + rand() * 0.6), rand);
  }

  // 油漆噴點
  const dots = Math.round((w * h) / 5000);
  for (let i = 0; i < dots; i++) {
    const x = rand() * w, y = rand() * h;
    const r = rand() < 0.85 ? 0.8 + rand() * 2.2 : 3 + rand() * 4;
    const t = rand();
    ctx.fillStyle = t < 0.55 ? 'rgba(246,238,219,0.85)' : t < 0.8 ? 'rgba(232,69,44,0.75)' : t < 0.92 ? 'rgba(240,123,34,0.8)' : 'rgba(29,28,34,0.55)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
