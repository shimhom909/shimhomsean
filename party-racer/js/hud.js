// 主機畫面共用的 HUD 小元件：提示訊息、大倒數字、橫幅、彩帶、時間格式。

const $ = (id) => document.getElementById(id);

export function fmtTime(t) {
  if (t == null) return '—';
  const cs = Math.floor(t * 100);
  const m = Math.floor(cs / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export function fmtClock(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toast(text, color) {
  const box = $('hud-toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--pc', color || '#fff');
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}

let bigTimer = null;
export function bigText(text, cls) {
  const el = $('hud-count');
  el.textContent = text;
  el.className = 'hud-count';
  void el.offsetWidth;                       // 重新觸發動畫
  el.className = 'hud-count pop ' + cls;
  clearTimeout(bigTimer);
  bigTimer = setTimeout(() => { el.textContent = ''; el.className = 'hud-count'; }, 1000);
}

export function banner(text, cls = '') {
  const el = $('hud-banner');
  el.querySelector('span').textContent = text;
  el.className = 'hud-banner';
  void el.offsetWidth;
  el.className = 'hud-banner show ' + cls;
}

export function resetHud() {
  $('hud-toasts').innerHTML = '';
  $('hud-banner').className = 'hud-banner';
  $('hud-count').textContent = '';
  $('results').classList.add('hidden');
  stopConfetti();
}

let confettiRaf = null;
export function startConfetti() {
  const cv = $('confetti');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  const g = cv.getContext('2d');
  const colors = ['#e8452c', '#f07b22', '#f3c93e', '#2ec4d0', '#1f5fae', '#f6efdf', '#ffffff'];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.8,
    vx: (Math.random() - 0.5) * 60 * dpr, vy: (80 + Math.random() * 120) * dpr,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 8,
    w: (6 + Math.random() * 6) * dpr, h: (3 + Math.random() * 4) * dpr, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let lastT = performance.now();
  const t0 = lastT;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    g.clearRect(0, 0, cv.width, cv.height);
    for (const b of bits) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
      b.vx += Math.sin(now / 300 + b.r) * 20 * dt;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r);
      g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (now - t0 < 6000) confettiRaf = requestAnimationFrame(tick);
    else g.clearRect(0, 0, cv.width, cv.height);
  };
  stopConfetti();
  confettiRaf = requestAnimationFrame(tick);
}

export function stopConfetti() {
  if (confettiRaf) cancelAnimationFrame(confettiRaf);
  confettiRaf = null;
}
