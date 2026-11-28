// 彩彈大亂鬥規則測試：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENAS, WEAPONS, BRAWL, ARENA_W, ARENA_H, Match, pointBlocked, lineOfSight, weaponById } from '../js/brawl.js';
import { brawlBotInput } from '../js/brawl-ai.js';
import { existsSync, readFileSync } from 'node:fs';
import { CHARACTERS, charaById, isChara, randomChara, charaImg, charaCard } from '../js/characters.js';

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const two = (weaponA = 'blaster', weaponB = 'blaster') => [
  { id: 'a', name: 'A', color: '#f00', weapon: weaponA },
  { id: 'b', name: 'B', color: '#00f', weapon: weaponB },
];

function run(m, seconds, each) {
  for (let i = 0; i < Math.round(seconds * 60); i++) { if (each) each(); m.step(1 / 60); }
}

// 把 A 放在 B 左邊 200 的地方、中間沒有障礙物，並跳過倒數
function faceOff(m) {
  run(m, BRAWL.countdown + 0.05);
  const [a, b] = m.players;
  a.x = 400; a.y = 450; b.x = 600; b.y = 450;
  a.protectUntil = b.protectUntil = 0;
  return [a, b];
}

test('武器至少 3 種，數值合理', () => {
  assert.ok(WEAPONS.length >= 3);
  for (const w of WEAPONS) for (const k of ['rate', 'dmg', 'speed', 'pellets', 'range']) assert.ok(w[k] > 0, `${w.id}.${k}`);
  assert.equal(weaponById('nope').id, WEAPONS[0].id);
});

for (const arena of ARENAS) {
  test(`場地 ${arena.id}：復活點都是空地，障礙物都在場內`, () => {
    for (const [x, y] of arena.spawns) assert.ok(!pointBlocked(arena, x, y, BRAWL.radius + 2), `復活點 ${x},${y} 被擋住`);
    for (const o of arena.obstacles) {
      const x0 = o.r ? o.x - o.r : o.x, x1 = o.r ? o.x + o.r : o.x + o.w;
      const y0 = o.r ? o.y - o.r : o.y, y1 = o.r ? o.y + o.r : o.y + o.h;
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= ARENA_W && y1 <= ARENA_H, `${o.kind} 超出場地`);
      // 離牆不是貼齊就是留出走得過的縫，避免卡人
      for (const gap of [x0, y0, ARENA_W - x1, ARENA_H - y1]) {
        assert.ok(gap === 0 || gap >= BRAWL.radius * 2 + 4, `${o.kind} 跟邊界的縫 ${gap} 太窄`);
      }
    }
  });
}

test('倒數期間不能動也不能開槍', () => {
  const m = new Match(ARENAS[0], two(), 60);
  m.setInput('a', { mx: 1, ax: 1 });
  const x0 = m.players[0].x;
  run(m, 2.5);
  assert.equal(m.state, 'countdown');
  assert.equal(m.players[0].x, x0);
  assert.equal(m.bullets.length, 0);
});

test('射中會扣血，打倒會加分、3 秒後在別處復活並有無敵時間', () => {
  const m = new Match(ARENAS[0], two(), 60, { rand: rng(1) });
  const [a, b] = faceOff(m);
  let kos = 0;
  run(m, 3, () => {
    m.setInput('a', { ax: 1, ay: 0 });
    b.x = 600; b.y = 450; b.vx = b.vy = 0;
    for (const e of m.drainEvents()) if (e.type === 'ko') kos++;
  });
  assert.ok(kos >= 1, '應該打倒對方');
  assert.ok(a.ko >= 1);
  assert.ok(b.deaths >= 1);
  // 停火後等復活
  m.setInput('a', {});
  run(m, BRAWL.respawn + 0.1);
  assert.ok(b.alive);
  assert.equal(b.hp, BRAWL.hp);
  assert.ok(m.time < b.protectUntil, '剛復活要有無敵時間');
});

test('衝刺期間子彈打不到', () => {
  const m = new Match(ARENAS[0], two(), 60, { rand: rng(2) });
  const [a, b] = faceOff(m);
  b.dashT = 10;      // 假裝一直在衝刺
  const hp0 = b.hp;
  m.bullets.push({ x: 560, y: 450, vx: 800, vy: 0, owner: 'a', color: '#f00', dmg: 30, r: 5, left: 500 });
  run(m, 0.2);
  assert.equal(b.hp, hp0);
  assert.ok(a.alive);
});

test('衝刺：按一下衝一次，有冷卻時間', () => {
  const m = new Match(ARENAS[0], two(), 60);
  const [a] = faceOff(m);
  let dashes = 0;
  run(m, 1, () => { m.setInput('a', { mx: 1, d: 1 }); for (const e of m.drainEvents()) if (e.type === 'dash') dashes++; });
  assert.equal(dashes, 1, '按住不放只衝一次');
  assert.ok(a.dashCd > 0);
});

test('護盾先吸收傷害', () => {
  const m = new Match(ARENAS[0], two(), 60);
  const [, b] = faceOff(m);
  b.shield = 50;
  m.bullets.push({ x: 570, y: 450, vx: 800, vy: 0, owner: 'a', color: '#f00', dmg: 30, r: 5, left: 500 });
  run(m, 0.1);
  assert.equal(b.hp, BRAWL.hp);
  assert.equal(b.shield, 20);
});

test('障礙物會擋子彈和視線', () => {
  const arena = ARENAS[0];
  const box = arena.obstacles.find((o) => o.kind === 'box');
  const y = box.y + box.h / 2;
  assert.ok(!lineOfSight(arena, box.x - 60, y, box.x + box.w + 60, y));
  assert.ok(lineOfSight(arena, 400, 330, 420, 330));
  const m = new Match(arena, two(), 60);
  const [a, b] = faceOff(m);
  a.x = box.x - 40; a.y = y; b.x = box.x + box.w + 40; b.y = y;
  run(m, 1, () => { m.setInput('a', { ax: 1 }); b.x = box.x + box.w + 40; b.y = y; });
  assert.equal(b.hp, BRAWL.hp);
});

test('時間到比賽結束；名次依擊倒數、同分同名次', () => {
  const m = new Match(ARENAS[1], [
    { id: 'a', name: 'A', color: '#f00', weapon: 'blaster' },
    { id: 'b', name: 'B', color: '#0f0', weapon: 'blaster' },
    { id: 'c', name: 'C', color: '#00f', weapon: 'blaster' },
  ], 5);
  run(m, BRAWL.countdown + 5.1);
  assert.equal(m.state, 'done');
  m.players[1].ko = 3; m.players[2].ko = 3; m.players[2].deaths = 1;
  const res = m.results();
  assert.deepEqual(res.map((r) => r.id), ['b', 'c', 'a']);
  m.players[2].deaths = 0;
  assert.deepEqual(m.results().map((r) => r.place), [1, 1, 3]);
});

for (const arena of ARENAS) {
  test(`場地 ${arena.id}：8 台電腦打滿 2 分鐘，沒人卡進障礙物，三種武器實力接近`, () => {
    const kd = {};
    for (let seed = 1; seed <= 3; seed++) {
      const entries = Array.from({ length: 8 }, (_, i) => ({ id: 'b' + i, name: 'b' + i, color: '#f00', weapon: WEAPONS[i % 3].id, bot: true }));
      const m = new Match(arena, entries, 120, { rand: rng(seed), botInput: brawlBotInput });
      while (m.state !== 'done') {
        m.step(1 / 60);
        m.drainEvents();
        for (const p of m.players) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
          if (p.alive) assert.ok(!pointBlocked(arena, p.x, p.y, BRAWL.radius - 3), `${p.id} 卡在障礙物裡 ${p.x},${p.y}`);
        }
      }
      for (const r of m.results()) {
        kd[r.weapon] = kd[r.weapon] || { ko: 0, d: 0 };
        kd[r.weapon].ko += r.ko; kd[r.weapon].d += r.deaths;
      }
    }
    for (const [w, v] of Object.entries(kd)) {
      const ratio = v.ko / Math.max(1, v.d);
      assert.ok(ratio > 0.7 && ratio < 1.45, `${w} 擊倒/被擊倒比 ${ratio.toFixed(2)} 不平衡`);
      assert.ok(v.ko > 20, `${w} 擊倒太少：${v.ko}`);
    }
  });
}

test('六位角色：資料完整、圖檔都在、不合法的 id 會退回預設角色', () => {
  assert.equal(CHARACTERS.length, 6);
  assert.equal(new Set(CHARACTERS.map((c) => c.id)).size, 6, 'id 不能重複');
  for (const c of CHARACTERS) {
    assert.match(c.color, /^#[0-9a-f]{6}$/i, `${c.id} 的代表色格式`);
    assert.ok(c.name && c.desc, `${c.id} 要有名字和介紹`);
    for (const kind of ['art', 'sprite', 'face']) {
      const file = new URL('../' + c[kind], import.meta.url);
      assert.ok(existsSync(file), `${c.id} 缺少圖檔 ${c[kind]}`);
      const head = readFileSync(file).subarray(0, 12).toString('latin1');
      assert.ok(head.startsWith('RIFF') && head.endsWith('WEBP'), `${c[kind]} 要是 WebP`);
    }
    assert.ok(isChara(c.id));
    assert.ok(charaImg(c.id, 'sprite').includes(c.sprite));
    assert.ok(charaCard(c.id).includes(c.name) && charaCard(c.id).includes(c.color));
  }
  assert.equal(charaById('<script>').id, CHARACTERS[0].id);
  assert.ok(!isChara('fox') && !isChara(undefined));
  const r = rng(4);
  for (let k = 0; k < 20; k++) assert.ok(isChara(randomChara(r)));
});
