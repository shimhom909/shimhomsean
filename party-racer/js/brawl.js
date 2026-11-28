// 彩彈大亂鬥：俯視射擊的完整規則（移動、射擊、衝刺、道具、擊倒與復活、計分）。
// 純計算、不碰 DOM，主機畫面與 Node 測試共用。

export const ARENA_W = 1600;
export const ARENA_H = 900;

export const BRAWL = {
  radius: 18,          // 角色碰撞半徑
  speed: 235,          // 移動速度
  hp: 100,
  respawn: 3,          // 被擊倒後幾秒復活
  protect: 1.6,        // 復活後無敵幾秒
  dashSpeed: 780,
  dashTime: 0.17,      // 衝刺時間（期間子彈打不到）
  dashCd: 2.4,         // 衝刺冷卻
  powerEvery: 7,       // 幾秒冒一個道具
  powerMax: 3,
  countdown: 3,
};

// ── 武器 ─────────────────────────────────────────────
// rate：兩發之間的秒數  dmg：每顆傷害  pellets：一次幾顆  spread：散布角度
// range：射程  prefRange：電腦玩家喜歡保持的距離  moveMul：拿著它的移動速度倍率
export const WEAPONS = [
  {
    id: 'blaster', name: '連射槍', type: '連射型', desc: '射速快、好上手，中距離最穩',
    rate: 0.12, dmg: 9, speed: 800, spread: 0.07, pellets: 1, range: 640, radius: 5, moveMul: 1.0, prefRange: 360,
    stats: { power: 2, rate: 5, range: 3, mobility: 4 },
  },
  {
    id: 'shotgun', name: '霰彈槍', type: '近戰型', desc: '一次噴 5 顆，貼身超痛，衝刺接近是關鍵',
    rate: 0.62, dmg: 10, speed: 680, spread: 0.34, pellets: 5, range: 340, radius: 5, moveMul: 1.08, prefRange: 170,
    stats: { power: 5, rate: 2, range: 1, mobility: 5 },
  },
  {
    id: 'sniper', name: '狙擊槍', type: '遠距型', desc: '又快又痛，三發擊倒，但射得慢',
    rate: 0.95, dmg: 36, speed: 1500, spread: 0, pellets: 1, range: 1400, radius: 6, moveMul: 0.92, prefRange: 620,
    stats: { power: 5, rate: 1, range: 5, mobility: 2 },
  },
];
export const WEAPON_STAT_LABELS = { power: '威力', rate: '射速', range: '射程', mobility: '機動' };
export function weaponById(id) { return WEAPONS.find((w) => w.id === id) || WEAPONS[0]; }

// ── 道具 ─────────────────────────────────────────────
export const POWERS = {
  heal: { name: '補血', color: '#5fbf5a' },
  shield: { name: '護盾', color: '#2ec4d0' },
  rapid: { name: '連射加速', color: '#f07b22' },
  speed: { name: '加速鞋', color: '#1f5fae' },
};

// ── 場地 ─────────────────────────────────────────────
// 障礙物以場地中心點對稱擺放，兩邊公平。r：圓形、w/h：方形

function mirrorPlace(list) {
  const out = [];
  for (const o of list) {
    out.push(o);
    if (o.single) continue;
    if (o.r) out.push({ ...o, x: ARENA_W - o.x, y: ARENA_H - o.y, flip: true });
    else out.push({ ...o, x: ARENA_W - o.x - o.w, y: ARENA_H - o.y - o.h, flip: true });
  }
  return out;
}

export const ARENAS = [
  {
    id: 'rooftop', name: '學園頂樓', desc: '水塔、樓梯間、長椅，掩護多', theme: 'rooftop',
    spawns: [[90, 450], [1510, 450], [400, 820], [1200, 80], [80, 820], [1520, 80], [1000, 830], [600, 70]],
    obstacles: mirrorPlace([
      { x: 130, y: 100, w: 180, h: 120, kind: 'stairs' },
      { x: 520, y: 250, r: 56, kind: 'tank' },
      { x: 420, y: 560, w: 160, h: 34, kind: 'bench' },
      { x: 880, y: 110, w: 44, h: 170, kind: 'wall' },
      { x: 250, y: 410, w: 58, h: 58, kind: 'vent' },
      { x: 1210, y: 190, r: 30, kind: 'plant' },
      { x: 760, y: 402, w: 80, h: 96, kind: 'box', single: true },
    ]),
  },
  {
    id: 'shrine', name: '櫻花神社', desc: '櫻花樹與石燈籠，中間是水池', theme: 'shrine',
    spawns: [[90, 450], [1510, 450], [400, 820], [1200, 80], [80, 820], [1520, 80], [1040, 710], [560, 190]],
    obstacles: mirrorPlace([
      { x: 620, y: 64, w: 360, h: 100, kind: 'shrine' },
      { x: 330, y: 260, r: 48, kind: 'sakura' },
      { x: 560, y: 600, r: 42, kind: 'sakura' },
      { x: 150, y: 640, r: 40, kind: 'sakura' },
      { x: 470, y: 120, w: 34, h: 34, kind: 'lantern' },
      { x: 1150, y: 330, w: 34, h: 34, kind: 'lantern' },
      { x: 250, y: 410, r: 14, kind: 'torii' },
      { x: 250, y: 490, r: 14, kind: 'torii' },
      { x: 800, y: 450, r: 66, kind: 'pond', single: true },
    ]),
  },
];
export function arenaById(id) { return ARENAS.find((a) => a.id === id) || ARENAS[0]; }


// ── 幾何 ─────────────────────────────────────────────

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 圓形（角色）被障礙物推開
function pushOut(o, p, r) {
  if (o.r) {
    const dx = p.x - o.x, dy = p.y - o.y;
    const d = Math.hypot(dx, dy), min = o.r + r;
    if (d < min && d > 0.0001) { p.x = o.x + (dx / d) * min; p.y = o.y + (dy / d) * min; return true; }
    return false;
  }
  const cx = clamp(p.x, o.x, o.x + o.w), cy = clamp(p.y, o.y, o.y + o.h);
  const dx = p.x - cx, dy = p.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= r) return false;
  if (d > 0.0001) { p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; return true; }
  // 圓心整個在方塊裡：往最近的邊推出去
  const left = p.x - o.x, right = o.x + o.w - p.x, top = p.y - o.y, bottom = o.y + o.h - p.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = o.x - r; else if (m === right) p.x = o.x + o.w + r; else if (m === top) p.y = o.y - r; else p.y = o.y + o.h + r;
  return true;
}

export function pointBlocked(arena, x, y, r = 0) {
  if (x < r || y < r || x > ARENA_W - r || y > ARENA_H - r) return true;
  for (const o of arena.obstacles) {
    if (o.r) { if (Math.hypot(x - o.x, y - o.y) < o.r + r) return true; }
    else if (x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r) {
      const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
      if (Math.hypot(x - cx, y - cy) < r || (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)) return true;
    }
  }
  return false;
}

// 兩點之間有沒有被障礙物擋住（視線）
function segHitsRect(x1, y1, x2, y2, o, pad) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - (o.x - pad), o.x + o.w + pad - x1, y1 - (o.y - pad), o.y + o.h + pad - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
function segHitsCircle(x1, y1, x2, y2, o, pad) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((o.x - x1) * dx + (o.y - y1) * dy) / l2, 0, 1);
  return Math.hypot(x1 + dx * t - o.x, y1 + dy * t - o.y) < o.r + pad;
}
export function lineOfSight(arena, x1, y1, x2, y2, pad = 0) {
  for (const o of arena.obstacles) {
    if (o.r ? segHitsCircle(x1, y1, x2, y2, o, pad) : segHitsRect(x1, y1, x2, y2, o, pad)) return false;
  }
  return true;
}

// ── 一場比賽 ─────────────────────────────────────────

export class Match {
  // entries: [{ id, name, color, chara, weapon, bot }]   chara：角色 id（characters.js）
  constructor(arena, entries, duration, { rand = Math.random, botInput = null } = {}) {
    this.arena = arena;
    this.duration = duration;
    this.rand = rand;
    this.botInput = botInput;
    this.time = -BRAWL.countdown;
    this.state = 'countdown';
    this.lastCount = BRAWL.countdown + 1;
    this.events = [];
    this.bullets = [];
    this.powers = [];
    this.nextPower = 4;
    this.powerSeq = 0;
    this.players = entries.map((e, i) => {
      const [x, y] = arena.spawns[i % arena.spawns.length];
      return {
        id: e.id, name: e.name, color: e.color, chara: e.chara, bot: !!e.bot,
        weapon: weaponById(e.weapon), brain: null,
        x, y, vx: 0, vy: 0, aim: Math.atan2(ARENA_H / 2 - y, ARENA_W / 2 - x),
        hp: BRAWL.hp, shield: 0, alive: true, respawnAt: 0, protectUntil: 0,
        ko: 0, deaths: 0, lastHitBy: null, lastHitAt: -99, cd: 0,
        dashT: 0, dashCd: 0, dashX: 1, dashY: 0, dashHeld: false,
        rapidUntil: 0, speedUntil: 0, firing: false,
        input: { mx: 0, my: 0, ax: 0, ay: 0, d: 0 },
      };
    });
  }

  setInput(id, inp) {
    const p = this.players.find((q) => q.id === id);
    if (!p) return;
    const n = (v) => clamp(+v || 0, -1, 1);
    p.input = { mx: n(inp.mx), my: n(inp.my), ax: n(inp.ax), ay: n(inp.ay), d: inp.d ? 1 : 0 };
  }

  timeLeft() {
    return Math.max(0, this.duration - Math.max(0, this.time));
  }

  step(dt) {
    if (this.state === 'done') return;
    this.time += dt;
    if (this.state === 'countdown') {
      const c = Math.ceil(-this.time);
      if (c < this.lastCount && c > 0) { this.lastCount = c; this.events.push({ type: 'count', n: c }); }
      if (this.time >= 0) { this.state = 'running'; this.time = 0; this.events.push({ type: 'go' }); }
      return;
    }

    for (const p of this.players) {
      if (!p.alive) {
        if (this.time >= p.respawnAt) this.respawn(p);
        continue;
      }
      const inp = p.bot && this.botInput ? this.botInput(this, p, dt) : p.input;
      if (p.bot) p.input = inp;
      this.movePlayer(p, inp, dt);
      this.aimAndFire(p, inp, dt);
    }
    this.separatePlayers();
    this.updateBullets(dt);
    this.updatePowers(dt);

    if (this.time >= this.duration) {
      this.state = 'done';
      this.events.push({ type: 'done' });
    }
  }

  movePlayer(p, inp, dt) {
    let mx = inp.mx, my = inp.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.dashCd = Math.max(0, p.dashCd - dt);
    // 衝刺：按下的那一下觸發（按住不會連發）
    if (inp.d && !p.dashHeld && p.dashCd <= 0 && p.dashT <= 0) {
      const l = Math.hypot(mx, my);
      if (l > 0.2) { p.dashX = mx / l; p.dashY = my / l; }
      else { p.dashX = Math.cos(p.aim); p.dashY = Math.sin(p.aim); }
      p.dashT = BRAWL.dashTime;
      p.dashCd = BRAWL.dashCd;
      this.events.push({ type: 'dash', id: p.id });
    }
    p.dashHeld = !!inp.d;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashX * BRAWL.dashSpeed;
      p.vy = p.dashY * BRAWL.dashSpeed;
    } else {
      const sp = BRAWL.speed * p.weapon.moveMul * (this.time < p.speedUntil ? 1.32 : 1);
      const k = Math.min(1, dt * 14);
      p.vx += (mx * sp - p.vx) * k;
      p.vy += (my * sp - p.vy) * k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const r = BRAWL.radius;
    for (let pass = 0; pass < 2; pass++) for (const o of this.arena.obstacles) pushOut(o, p, r);
    p.x = clamp(p.x, r, ARENA_W - r);
    p.y = clamp(p.y, r, ARENA_H - r);
  }

  aimAndFire(p, inp, dt) {
    const al = Math.hypot(inp.ax, inp.ay);
    p.firing = al > 0.35;
    if (p.firing) p.aim = Math.atan2(inp.ay, inp.ax);
    else if (Math.hypot(inp.mx, inp.my) > 0.25) p.aim = Math.atan2(inp.my, inp.mx);
    p.cd -= dt;
    if (!p.firing || p.cd > 0 || p.dashT > 0) return;
    const w = p.weapon;
    p.cd = w.rate * (this.time < p.rapidUntil ? 0.55 : 1);
    const muzzle = BRAWL.radius + 10;
    for (let k = 0; k < w.pellets; k++) {
      const spreadPos = w.pellets > 1 ? (k / (w.pellets - 1) - 0.5) * w.spread : 0;
      const a = p.aim + spreadPos + (this.rand() - 0.5) * (w.pellets > 1 ? 0.06 : w.spread);
      const spd = w.speed * (w.pellets > 1 ? 0.9 + this.rand() * 0.2 : 1);
      this.bullets.push({
        x: p.x + Math.cos(p.aim) * muzzle, y: p.y + Math.sin(p.aim) * muzzle,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        owner: p.id, color: p.color, dmg: w.dmg, r: w.radius, left: w.range, weapon: w.id,
      });
    }
    this.events.push({ type: 'shot', id: p.id, weapon: w.id });
  }

  separatePlayers() {
    const ps = this.players.filter((p) => p.alive);
    const R = BRAWL.radius * 2;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < R && d > 0.001) {
          const push = (R - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
    // 互推之後可能被擠進障礙物，再推出來一次
    const r = BRAWL.radius;
    for (const p of ps) {
      for (const o of this.arena.obstacles) pushOut(o, p, r);
      p.x = clamp(p.x, r, ARENA_W - r);
      p.y = clamp(p.y, r, ARENA_H - r);
    }
  }

  updateBullets(dt) {
    const keep = [];
    for (const b of this.bullets) {
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 12));
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        const sx = (b.vx * dt) / steps, sy = (b.vy * dt) / steps;
        b.x += sx; b.y += sy;
        b.left -= Math.hypot(sx, sy);
        if (b.left <= 0) { dead = true; this.events.push({ type: 'splat', x: b.x, y: b.y, color: b.color, size: 0.6 }); break; }
        if (pointBlocked(this.arena, b.x, b.y, 0) ) {
          dead = true;
          this.events.push({ type: 'splat', x: b.x, y: b.y, color: b.color, size: 0.8, wall: true });
          break;
        }
        for (const p of this.players) {
          if (!p.alive || p.id === b.owner) continue;
          if (Math.hypot(p.x - b.x, p.y - b.y) > BRAWL.radius + b.r) continue;
          dead = true;
          this.hit(p, b);
          break;
        }
      }
      if (!dead) keep.push(b);
    }
    this.bullets = keep;
  }

  isProtected(p) {
    return this.time < p.protectUntil || p.dashT > 0;
  }

  hit(p, b) {
    this.events.push({ type: 'splat', x: b.x, y: b.y, color: b.color, size: 1 });
    if (this.isProtected(p)) { this.events.push({ type: 'block', id: p.id }); return; }
    let dmg = b.dmg;
    if (p.shield > 0) {
      const s = Math.min(p.shield, dmg);
      p.shield -= s;
      dmg -= s;
    }
    p.hp -= dmg;
    p.lastHitBy = b.owner;
    p.lastHitAt = this.time;
    this.events.push({ type: 'hit', id: p.id, by: b.owner, dmg: b.dmg });
    if (p.hp <= 0) this.knockOut(p, b.owner);
  }

  knockOut(p, killerId) {
    p.alive = false;
    p.hp = 0;
    p.shield = 0;
    p.deaths += 1;
    p.respawnAt = this.time + BRAWL.respawn;
    p.vx = p.vy = 0;
    p.dashT = 0;
    const killer = this.players.find((q) => q.id === killerId);
    if (killer && killer !== p) killer.ko += 1;
    this.events.push({ type: 'ko', id: p.id, by: killerId, x: p.x, y: p.y, color: killer ? killer.color : p.color });
  }

  // 復活點：選離所有對手最遠的
  respawn(p) {
    let best = null, bestD = -1;
    for (const [x, y] of this.arena.spawns) {
      let d = Infinity;
      for (const q of this.players) if (q !== p && q.alive) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    p.x = best[0]; p.y = best[1];
    p.alive = true;
    p.hp = BRAWL.hp;
    p.shield = 0;
    p.protectUntil = this.time + BRAWL.protect;
    p.cd = 0.3;
    this.events.push({ type: 'respawn', id: p.id });
  }

  updatePowers() {
    if (this.time >= this.nextPower) {
      this.nextPower = this.time + BRAWL.powerEvery;
      if (this.powers.length < BRAWL.powerMax) {
        for (let tries = 0; tries < 40; tries++) {
          const x = 80 + this.rand() * (ARENA_W - 160), y = 80 + this.rand() * (ARENA_H - 160);
          if (pointBlocked(this.arena, x, y, 34)) continue;
          if (this.players.some((p) => p.alive && Math.hypot(p.x - x, p.y - y) < 120)) continue;
          if (this.powers.some((q) => Math.hypot(q.x - x, q.y - y) < 200)) continue;
          const kinds = Object.keys(POWERS);
          this.powers.push({ id: ++this.powerSeq, kind: kinds[Math.floor(this.rand() * kinds.length)], x, y, born: this.time });
          break;
        }
      }
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const pw of this.powers) {
        if (pw.taken || Math.hypot(p.x - pw.x, p.y - pw.y) > BRAWL.radius + 18) continue;
        pw.taken = true;
        if (pw.kind === 'heal') p.hp = Math.min(BRAWL.hp, p.hp + 45);
        else if (pw.kind === 'shield') p.shield = 50;
        else if (pw.kind === 'rapid') p.rapidUntil = this.time + 7;
        else if (pw.kind === 'speed') p.speedUntil = this.time + 7;
        this.events.push({ type: 'power', id: p.id, kind: pw.kind, x: pw.x, y: pw.y });
      }
    }
    this.powers = this.powers.filter((q) => !q.taken);
  }

  // 名次：擊倒數多的在前；一樣的話被擊倒少的在前
  standings() {
    return [...this.players].sort((a, b) => b.ko - a.ko || a.deaths - b.deaths);
  }

  results() {
    let place = 0, prev = null;
    return this.standings().map((p, i) => {
      if (!prev || p.ko !== prev.ko || p.deaths !== prev.deaths) place = i + 1;
      prev = p;
      return { id: p.id, name: p.name, color: p.color, chara: p.chara, weapon: p.weapon.id, bot: p.bot, ko: p.ko, deaths: p.deaths, place };
    });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.events.push({ type: 'done' });
  }
}
