// 彩彈大亂鬥的繪圖：場地（學園頂樓、櫻花神社）、障礙物、角色、子彈、道具、彩漆。

import { ARENA_W, ARENA_H, BRAWL, POWERS } from './brawl.js';
import { avatarImage } from './avatar.js';

const INK = '#0d2a36';

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

function floorRooftop(ctx) {
  ctx.fillStyle = '#5c9f97';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.fillStyle = '#67aaa1';
  for (let y = 0; y < ARENA_H; y += 80) for (let x = ((y / 80) % 2) * 80; x < ARENA_W; x += 160) ctx.fillRect(x, y, 80, 80);
  const rand = seeded(9);
  strokes(ctx, rand, 1500, ['#4f938b', '#74b7ad', '#3f8580', '#86c4b8'], [12, 30], [5, 10], [0.25, 0.45]);
  glowPatches(ctx, rand, 14, '207,228,85', 90, 180, 0.22);
  ctx.strokeStyle = 'rgba(13,42,54,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= ARENA_W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); }
  for (let y = 0; y <= ARENA_H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); }
  ctx.stroke();
  // 地上的場地線
  ctx.strokeStyle = 'rgba(230,250,235,0.7)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(ARENA_W / 2, ARENA_H / 2, 150, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ARENA_W / 2, 30); ctx.lineTo(ARENA_W / 2, 300); ctx.moveTo(ARENA_W / 2, 600); ctx.lineTo(ARENA_W / 2, ARENA_H - 30); ctx.stroke();
}

function floorShrine(ctx) {
  ctx.fillStyle = '#c4dbbd';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  const rand = seeded(42);
  strokes(ctx, rand, 1300, ['#a9c9a6', '#d6e8cf', '#8fbf95', '#b8d6b0'], [10, 24], [4, 9], [0.3, 0.55]);
  glowPatches(ctx, rand, 12, '207,228,85', 80, 160, 0.25);
  for (let k = 0; k < 2200; k++) {
    ctx.fillStyle = k % 3 ? 'rgba(70,110,90,0.3)' : 'rgba(255,255,240,0.55)';
    ctx.fillRect(rand() * ARENA_W, rand() * ARENA_H, 3, 3);
  }
  // 石板參道：中間一條直的、一條橫的
  const slab = (x, y, w, h) => {
    ctx.fillStyle = '#b4c9bb'; ctx.strokeStyle = 'rgba(13,42,54,0.35)'; ctx.lineWidth = 2;
    rrect(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
  };
  for (let y = 170; y < ARENA_H - 160; y += 52) { slab(ARENA_W / 2 - 46, y, 44, 44); slab(ARENA_W / 2 + 2, y, 44, 44); }
  for (let x = 40; x < ARENA_W - 40; x += 52) {
    if (Math.abs(x + 22 - ARENA_W / 2) < 120) continue;
    slab(x, ARENA_H / 2 - 22, 44, 44);
  }
}

function fence(ctx, theme) {
  const t = 14;
  if (theme === 'shrine') {
    ctx.fillStyle = '#d0583a';
    ctx.fillRect(0, 0, ARENA_W, t); ctx.fillRect(0, ARENA_H - t, ARENA_W, t);
    ctx.fillRect(0, 0, t, ARENA_H); ctx.fillRect(ARENA_W - t, 0, t, ARENA_H);
    ctx.fillStyle = '#1d2a30';
    for (let x = 0; x < ARENA_W; x += 60) { ctx.fillRect(x, 0, 8, t); ctx.fillRect(x, ARENA_H - t, 8, t); }
    for (let y = 0; y < ARENA_H; y += 60) { ctx.fillRect(0, y, t, 8); ctx.fillRect(ARENA_W - t, y, t, 8); }
  } else {
    ctx.fillStyle = '#1d6f6a';
    ctx.fillRect(0, 0, ARENA_W, t); ctx.fillRect(0, ARENA_H - t, ARENA_W, t);
    ctx.fillRect(0, 0, t, ARENA_H); ctx.fillRect(ARENA_W - t, 0, t, ARENA_H);
    ctx.strokeStyle = 'rgba(200,245,230,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < ARENA_W; x += 16) { ctx.moveTo(x, 0); ctx.lineTo(x + 14, t); ctx.moveTo(x, ARENA_H - t); ctx.lineTo(x + 14, ARENA_H); }
    for (let y = 0; y < ARENA_H; y += 16) { ctx.moveTo(0, y); ctx.lineTo(t, y + 14); ctx.moveTo(ARENA_W - t, y); ctx.lineTo(ARENA_W, y + 14); }
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(t, t, ARENA_W - 2 * t, ARENA_H - 2 * t);
}

// ── 障礙物（俯視，前側畫一條深色當作高度） ────────────

function block(ctx, o, top, side, h = 14) {
  ctx.fillStyle = 'rgba(5,30,40,0.22)';
  rrect(ctx, o.x + 8, o.y + 10, o.w, o.h, 6); ctx.fill();
  ctx.fillStyle = side;
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  rrect(ctx, o.x, o.y, o.w, o.h, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = top;
  rrect(ctx, o.x + 2, o.y + 2, o.w - 4, o.h - h, 5); ctx.fill();
}

function drawObstacle(ctx, o) {
  switch (o.kind) {
    case 'stairs': {
      block(ctx, o, '#e9f1df', '#9fbfb0', 22);
      ctx.fillStyle = '#a8502a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      const dx = o.flip ? o.x + 18 : o.x + o.w - 52;
      ctx.fillRect(dx, o.y + o.h - 22, 34, 22); ctx.strokeRect(dx, o.y + o.h - 22, 34, 22);
      ctx.fillStyle = '#cfe455'; ctx.beginPath(); ctx.arc(dx + 28, o.y + o.h - 11, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7fc8d6'; ctx.fillRect(o.x + 16, o.y + 16, 30, 22); ctx.strokeRect(o.x + 16, o.y + 16, 30, 22);
      break;
    }
    case 'tank': {
      ctx.fillStyle = 'rgba(5,30,40,0.22)'; ctx.beginPath(); ctx.arc(o.x + 8, o.y + 10, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4fc3b5'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(13,42,54,0.35)'; ctx.lineWidth = 2;
      for (const k of [0.75, 0.5]) { ctx.beginPath(); ctx.arc(o.x, o.y, o.r * k, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#e6fff7'; ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cfe455'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(o.x - 8, o.y - 8, 16, 16); ctx.strokeRect(o.x - 8, o.y - 8, 16, 16);
      break;
    }
    case 'bench':
      block(ctx, o, '#c98b53', '#8a5a33', 10);
      ctx.strokeStyle = 'rgba(80,40,10,0.5)'; ctx.lineWidth = 2;
      for (let x = o.x + 20; x < o.x + o.w - 4; x += 24) { ctx.beginPath(); ctx.moveTo(x, o.y + 3); ctx.lineTo(x, o.y + o.h - 11); ctx.stroke(); }
      break;
    case 'wall':
      block(ctx, o, '#dcebe4', '#88aaa0', 12);
      break;
    case 'vent':
      block(ctx, o, '#cfe0da', '#7f9e98', 12);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + (o.h - 12) / 2 + 1, o.w * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        ctx.moveTo(o.x + o.w / 2, o.y + (o.h - 12) / 2 + 1);
        ctx.lineTo(o.x + o.w / 2 + Math.cos(a) * o.w * 0.26, o.y + (o.h - 12) / 2 + 1 + Math.sin(a) * o.w * 0.26);
      }
      ctx.stroke();
      break;
    case 'plant': {
      ctx.fillStyle = 'rgba(5,30,40,0.22)'; ctx.beginPath(); ctx.arc(o.x + 6, o.y + 8, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d07a3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8cbf35';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(o.x + Math.cos(a) * o.r * 0.4, o.y + Math.sin(a) * o.r * 0.4, o.r * 0.42, o.r * 0.22, a, 0, Math.PI * 2);
        ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      }
      break;
    }
    case 'box':
      block(ctx, o, '#e09a4a', '#a8602c', 14);
      ctx.strokeStyle = 'rgba(90,50,10,0.6)'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(o.x + 8, o.y + 8); ctx.lineTo(o.x + o.w - 8, o.y + o.h - 20);
      ctx.moveTo(o.x + o.w - 8, o.y + 8); ctx.lineTo(o.x + 8, o.y + o.h - 20);
      ctx.stroke();
      break;
    case 'shrine': {
      // 屋頂（俯視）＋朱紅柱子
      ctx.fillStyle = 'rgba(5,30,40,0.25)'; rrect(ctx, o.x + 10, o.y + 12, o.w, o.h, 8); ctx.fill();
      ctx.fillStyle = '#c9533a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      rrect(ctx, o.x, o.y, o.w, o.h, 8); ctx.fill(); ctx.stroke();
      const roof = o.flip ? '#2b5a8e' : '#2a7f7a';   // 銅綠色屋頂
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(o.x - 10, o.y + 8); ctx.lineTo(o.x + o.w + 10, o.y + 8); ctx.lineTo(o.x + o.w - 20, o.y + o.h / 2);
      ctx.lineTo(o.x + o.w + 10, o.y + o.h - 8); ctx.lineTo(o.x - 10, o.y + o.h - 8); ctx.lineTo(o.x + 20, o.y + o.h / 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      for (let x = o.x + 20; x < o.x + o.w - 10; x += 16) { ctx.beginPath(); ctx.moveTo(x, o.y + 12); ctx.lineTo(x, o.y + o.h - 12); ctx.stroke(); }
      ctx.strokeStyle = '#e6c34a'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(o.x + 20, o.y + o.h / 2); ctx.lineTo(o.x + o.w - 20, o.y + o.h / 2); ctx.stroke();
      ctx.fillStyle = '#e6c34a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      for (const x of [o.x + 20, o.x + o.w - 20]) { ctx.beginPath(); ctx.arc(x, o.y + o.h / 2, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'sakura': {
      ctx.fillStyle = 'rgba(120,40,80,0.2)'; ctx.beginPath(); ctx.arc(o.x + 8, o.y + 10, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      const puffs = [[0, 0, 1], [-0.45, -0.3, 0.62], [0.45, -0.3, 0.62], [-0.4, 0.38, 0.6], [0.42, 0.36, 0.6]];
      for (const [dx, dy, k] of puffs) { ctx.fillStyle = '#ffb3cf'; ctx.beginPath(); ctx.arc(o.x + dx * o.r, o.y + dy * o.r, o.r * k * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#ffb3cf';
      for (const [dx, dy, k] of puffs) { ctx.beginPath(); ctx.arc(o.x + dx * o.r, o.y + dy * o.r, o.r * k * 0.72 - 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffe1ec';
      for (const [dx, dy] of [[-0.25, -0.35], [0.3, -0.1], [-0.1, 0.3]]) { ctx.beginPath(); ctx.arc(o.x + dx * o.r, o.y + dy * o.r, o.r * 0.16, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'lantern': {
      block(ctx, o, '#c9cfc3', '#8a948a', 10);
      ctx.fillStyle = '#f6e27a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(o.x + o.w / 2 - 6, o.y + (o.h - 10) / 2 - 5, 12, 10); ctx.strokeRect(o.x + o.w / 2 - 6, o.y + (o.h - 10) / 2 - 5, 12, 10);
      break;
    }
    case 'torii':
      ctx.fillStyle = 'rgba(5,30,40,0.22)'; ctx.beginPath(); ctx.arc(o.x + 5, o.y + 6, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d0583a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'pond': {
      ctx.fillStyle = '#8cbf8a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2fb3a3';
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8cbf35'; ctx.lineWidth = 1.5;
      for (const [dx, dy] of [[-0.45, -0.3], [0.35, 0.4], [0.5, -0.35]]) {
        ctx.beginPath(); ctx.moveTo(o.x + dx * o.r, o.y + dy * o.r);
        ctx.arc(o.x + dx * o.r, o.y + dy * o.r, 11, 0.4, Math.PI * 2 - 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#e08a3a';
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
      ctx.fillStyle = '#1d2a30'; rrect(ctx, minX - 13, minY - 30, 26, maxY - minY + 60, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d0583a'; rrect(ctx, minX - 7, minY - 22, 14, maxY - minY + 44, 4); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#1d2a30'; rrect(ctx, minX - 30, minY - 13, maxX - minX + 60, 26, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d0583a'; rrect(ctx, minX - 22, minY - 7, maxX - minX + 44, 14, 4); ctx.fill(); ctx.stroke();
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
  ctx.fillStyle = '#24485a';
  rrect(ctx, 6, -thick / 2, len, thick, 3); ctx.fill(); ctx.stroke();
  // 彩漆罐（玩家顏色）
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(14, -thick / 2 - 4, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (w === 'sniper') { ctx.fillStyle = '#7fc8c0'; rrect(ctx, 16, thick / 2 - 1, 14, 5, 2); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = p.color;
  ctx.fillRect(6 + len - 4, -thick / 2 + 1, 4, thick - 2);
  ctx.restore();
}

export function drawFighter(ctx, p, time, { hitFlash = 0 } = {}) {
  const img = avatarImage('chibi', p.avatar, p.color);
  const H = 76, W = H * 0.75;
  const facingLeft = Math.cos(p.aim) < -0.05;
  const protectedNow = time < p.protectUntil;
  const blink = protectedNow && Math.floor(time * 10) % 2 === 0;

  // 衝刺殘影
  if (p.dashT > 0 && img.complete) {
    for (let k = 1; k <= 2; k++) {
      ctx.globalAlpha = 0.25 / k;
      ctx.drawImage(img, p.x - p.vx * 0.03 * k - W / 2, p.y - p.vy * 0.03 * k - H + 16, W, H);
    }
    ctx.globalAlpha = 1;
  }
  const behind = Math.sin(p.aim) < -0.3;      // 槍往上指時畫在身體後面
  if (behind) drawGun(ctx, p);
  if (img.complete && img.naturalWidth) {
    ctx.save();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.translate(p.x, 0);
    if (facingLeft) ctx.scale(-1, 1);
    ctx.drawImage(img, -W / 2, p.y - H + 16, W, H);
    ctx.restore();
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, BRAWL.radius, 0, Math.PI * 2); ctx.fill();
  }
  if (!behind) drawGun(ctx, p);
  if (hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.6, hitFlash * 4);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 22, W * 0.42, H * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (protectedNow) {
    ctx.strokeStyle = 'rgba(127,240,230,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 22, W * 0.55, H * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (p.shield > 0) {
    ctx.strokeStyle = 'rgba(127,240,230,0.75)'; ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y - 18, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// 血條＋名牌（世界座標）
export function drawFighterTag(ctx, p, rank) {
  const y = p.y - 70;
  const bw = 48;
  ctx.fillStyle = INK;
  rrect(ctx, p.x - bw / 2 - 2, y - 2, bw + 4, 10, 4); ctx.fill();
  const hp = Math.max(0, p.hp) / BRAWL.hp;
  ctx.fillStyle = hp > 0.6 ? '#8cd46a' : hp > 0.3 ? '#f2c14e' : '#e0583c';
  rrect(ctx, p.x - bw / 2, y, bw * hp, 6, 3); ctx.fill();
  if (p.shield > 0) {
    ctx.fillStyle = '#7ff0ff';
    rrect(ctx, p.x - bw / 2, y, bw * Math.min(1, p.shield / 50), 3, 2); ctx.fill();
  }
  ctx.font = '900 13px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const label = `${rank} ${p.name}`;
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.strokeText(label, p.x, y - 11);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, p.x, y - 11);
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x - ctx.measureText(label).width / 2, y - 3.5, ctx.measureText(label).width, 2);
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
  ctx.fillStyle = 'rgba(5,30,40,0.2)';
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
