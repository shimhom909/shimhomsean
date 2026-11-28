// 彩彈大亂鬥的電腦玩家：找目標、保持武器喜歡的距離、左右閃、預判射擊、低血量去撿補血。

import { BRAWL, lineOfSight, pointBlocked } from './brawl.js';

const clampAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function brainFor(match, p) {
  if (!p.brain) {
    const r = match.rand;
    p.brain = {
      strafe: r() < 0.5 ? -1 : 1,
      strafeT: 1 + r() * 2,
      err: 0.05 + r() * 0.09,     // 瞄準誤差（越大越不準）
      lead: 0.6 + r() * 0.4,      // 預判提前量
      react: 0.15 + r() * 0.2,    // 反應時間
      seen: 0,
      stuck: 0, unstickT: 0, unstickA: 0,
      lastX: p.x, lastY: p.y,
    };
  }
  return p.brain;
}

// 往想去的方向走，遇到障礙物就試試旁邊的方向
function steer(match, p, ang) {
  for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
    const a = ang + off;
    const x = p.x + Math.cos(a) * 44, y = p.y + Math.sin(a) * 44;
    if (!pointBlocked(match.arena, x, y, BRAWL.radius + 2)) return a;
  }
  return ang + Math.PI;
}

export function brawlBotInput(match, p, dt) {
  const b = brainFor(match, p);
  const r = match.rand;
  const foes = match.players.filter((q) => q !== p && q.alive);
  const none = { mx: 0, my: 0, ax: 0, ay: 0, d: 0 };
  if (!foes.length) return none;

  // 目標：近的、看得到的優先
  let target = null, best = Infinity;
  for (const q of foes) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    const los = lineOfSight(match.arena, p.x, p.y, q.x, q.y, 4);
    const score = d * (los ? 1 : 1.7) * (match.time < q.protectUntil ? 1.5 : 1);
    if (score < best) { best = score; target = q; }
  }
  const dx = target.x - p.x, dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  const toT = Math.atan2(dy, dx);
  const los = lineOfSight(match.arena, p.x, p.y, target.x, target.y, 4);
  b.seen = los ? b.seen + dt : 0;

  // 移動方向
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafe *= -1; b.strafeT = 0.8 + r() * 1.8; }
  const range = p.weapon.prefRange;
  let moveA;
  const heal = p.hp < 50 && match.powers.find((pw) => (pw.kind === 'heal' || pw.kind === 'shield') && Math.hypot(pw.x - p.x, pw.y - p.y) < 520);
  if (heal) moveA = Math.atan2(heal.y - p.y, heal.x - p.x);
  else if (!los || dist > range * 1.2) moveA = toT + b.strafe * 0.35;
  else if (dist < range * 0.6) moveA = toT + Math.PI + b.strafe * 0.5;
  else moveA = toT + b.strafe * Math.PI / 2;

  // 卡住就隨便換個方向走一下
  const movedSq = (p.x - b.lastX) ** 2 + (p.y - b.lastY) ** 2;
  b.lastX = p.x; b.lastY = p.y;
  b.stuck = movedSq < 0.6 ? b.stuck + dt : 0;
  if (b.stuck > 0.6) { b.unstickT = 0.6; b.unstickA = r() * Math.PI * 2; b.stuck = 0; }
  if (b.unstickT > 0) { b.unstickT -= dt; moveA = b.unstickA; }
  moveA = steer(match, p, moveA);

  // 瞄準：預判目標移動，再加一點誤差
  const t = dist / p.weapon.speed;
  const lx = target.x + target.vx * t * b.lead, ly = target.y + target.vy * t * b.lead;
  const aimA = Math.atan2(ly - p.y, lx - p.x) + (r() - 0.5) * 2 * b.err;
  const fire = los && b.seen > b.react && dist < p.weapon.range * 0.92 && match.time >= p.protectUntil - 1;

  // 剛被打到偶爾衝刺閃開；霰彈槍會衝刺接近
  let dash = 0;
  if (p.dashCd <= 0) {
    if (match.time - p.lastHitAt < 0.25 && r() < 0.08) dash = 1;
    else if (p.weapon.id === 'shotgun' && los && dist > 200 && dist < 380 && r() < 0.03) { dash = 1; moveA = toT; }
  }

  return {
    mx: Math.cos(moveA), my: Math.sin(moveA),
    ax: fire ? Math.cos(aimA) : 0, ay: fire ? Math.sin(aimA) : 0,
    d: dash,
  };
}
