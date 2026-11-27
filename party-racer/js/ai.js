// 電腦對手：沿著中心線前方的目標點開，看到彎道就收油或踩煞車。

import { speedOf } from './physics.js';

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeBrain(rand = Math.random, skill = 0.93) {
  return {
    skill: clamp(skill + (rand() - 0.5) * 0.06, 0.8, 1.02),
    lane: (rand() - 0.5) * 0.9,
    laneTimer: 2 + rand() * 3,
    stuck: 0,
    reverseTimer: 0,
    rand,
  };
}

export function botInput(track, car, brain, dt) {
  const sp = speedOf(car);
  const n = track.n;

  // 偶爾換車道，讓電腦車不要排成一直線
  brain.laneTimer -= dt;
  if (brain.laneTimer <= 0) {
    brain.lane = (brain.rand() - 0.5) * 0.9;
    brain.laneTimer = 2 + brain.rand() * 4;
  }

  // 卡住（撞牆或被擠住）就倒車一下
  if (brain.reverseTimer > 0) {
    brain.reverseTimer -= dt;
    return { s: brain.lane > 0 ? 1 : -1, g: 0, b: 1, n: 0 };
  }
  brain.stuck = sp < 12 ? brain.stuck + dt : 0;
  if (brain.stuck > 1.2) {
    brain.stuck = 0;
    brain.reverseTimer = 0.8;
  }

  const look = Math.round((60 + sp * 0.42) / track.ds);
  const j = (car.idx + look) % n;
  const off = brain.lane * track.half;
  const tx = track.pts[j].x + track.nx[j] * off;
  const ty = track.pts[j].y + track.ny[j] * off;
  const diff = wrap(Math.atan2(ty - car.y, tx - car.x) - car.a);
  const s = clamp(diff * 3.2, -1, 1);

  // 速度規劃：前方每個點依彎道曲率算出「這台車過得去的速度」，
  // 再扣掉來得及煞車的距離，取最嚴格的那個當目標速度。
  const d = car.def;
  const h = d.handling * (0.55 + 0.45 * Math.min(1, d.grip / 8));
  const brake = 360;
  let target = d.maxSpeed * 1.3;
  let straight = true;
  const steps = Math.round(Math.min(360, 40 + (sp * sp) / (2 * brake)) / track.ds);
  for (let k = 1; k <= steps; k++) {
    const i = (car.idx + k) % n;
    const kap = track.curv[i];
    if (kap > 0.0025) straight = false;
    const vc = h / (kap + (0.3 * h) / d.maxSpeed);
    const allowed = Math.sqrt(vc * vc + 2 * brake * k * track.ds);
    if (allowed < target) target = allowed;
  }
  target *= brain.skill;
  const g = sp < target || Math.abs(diff) > 1.2 ? 1 : 0;
  const b = sp > target + 30 ? 1 : 0;
  const nos = straight && Math.abs(diff) < 0.15 && sp > 110 && car.nitro > 0.25 ? 1 : 0;
  return { s, g: b ? 0 : g, b, n: nos };
}
