// 背景：仰望森林的夜空風格——青綠到深藍的漸層、上方透下來的黃綠色陽光、
// 一圈圈流動的筆觸、發光的光球和小星星。開頁時畫一次（視窗大小改變才重畫）。

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const STROKES = ['#4fc3b5', '#2a9fb0', '#7fe0cf', '#1f6f86', '#3b8fc4', '#a8ecd9', '#1d5f86', '#62d0bf'];

function paint(canvas) {
  const w = window.innerWidth, h = window.innerHeight;
  const k = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const rand = seeded(20261128);

  // 漸層底色
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1f8a8a');
  g.addColorStop(0.45, '#155a74');
  g.addColorStop(1, '#0b2340');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 從樹梢透下來的陽光
  const sun = ctx.createRadialGradient(w * 0.62, -h * 0.05, 0, w * 0.62, -h * 0.05, Math.max(w, h) * 0.75);
  sun.addColorStop(0, 'rgba(232,240,120,0.55)');
  sun.addColorStop(0.35, 'rgba(180,220,90,0.18)');
  sun.addColorStop(1, 'rgba(180,220,90,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // 流動的筆觸：沿著一個漩渦狀的流場畫短曲線
  const cx = w * 0.3, cy = h * 0.45;
  const field = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const swirl = Math.atan2(dy, dx) + Math.PI / 2 + 0.35;
    const wave = Math.sin(x * 0.006 + y * 0.004) * 0.8 + Math.cos(y * 0.007) * 0.5;
    const near = Math.exp(-(dx * dx + dy * dy) / (Math.max(w, h) ** 2 * 0.12));
    return swirl * near + wave * (1 - near);
  };
  ctx.lineCap = 'round';
  const count = Math.round((w * h) / 2400);
  for (let i = 0; i < count; i++) {
    let x = rand() * w, y = rand() * h;
    ctx.strokeStyle = STROKES[Math.floor(rand() * STROKES.length)];
    ctx.globalAlpha = 0.18 + rand() * 0.32;
    ctx.lineWidth = 1.2 + rand() * 3.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 8 + Math.floor(rand() * 14);
    for (let s = 0; s < steps; s++) {
      const a = field(x, y);
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 發光的光球
  for (let i = 0; i < Math.round((w * h) / 60000) + 6; i++) {
    const x = rand() * w, y = rand() * h, r = 6 + rand() * 16;
    const og = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    og.addColorStop(0, 'rgba(200,255,240,0.95)');
    og.addColorStop(0.3, 'rgba(90,220,200,0.55)');
    og.addColorStop(1, 'rgba(90,220,200,0)');
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,255,245,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0.3, Math.PI * 1.6); ctx.stroke();
  }
  // 小星星
  for (let i = 0; i < Math.round((w * h) / 9000); i++) {
    const x = rand() * w, y = rand() * h * 0.8;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,150,0.9)' : 'rgba(220,255,245,0.85)';
    ctx.beginPath(); ctx.arc(x, y, 0.8 + rand() * 1.6, 0, Math.PI * 2); ctx.fill();
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
