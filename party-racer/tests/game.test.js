// 遊戲邏輯測試：node --test tests/   （不需要安裝任何套件）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, CARS, WORLD, COLORS, MAX_PLAYERS } from '../js/config.js';
import { buildTrack, minSeparation, bounds, locate } from '../js/track.js';
import { Race } from '../js/race.js';
import { makeCar, stepCar, collideCars, speedOf } from '../js/physics.js';
import { botInput } from '../js/ai.js';

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function runToEnd(race, limit = 400) {
  while (race.state !== 'done' && race.time < limit) race.step(1 / 60);
}

test('設定：至少 3 款車、顏色數量夠 8 人用', () => {
  assert.ok(CARS.length >= 3);
  assert.ok(COLORS.length >= MAX_PLAYERS);
  assert.equal(new Set(CARS.map((c) => c.id)).size, CARS.length);
  for (const c of CARS) for (const k of ['maxSpeed', 'accel', 'handling', 'grip', 'mass', 'offroad']) assert.ok(c[k] > 0, `${c.id}.${k}`);
});

for (const def of TRACKS) {
  const tr = buildTrack(def);

  test(`賽道 ${def.id}：不同路段距離夠遠，不能穿越捷徑`, () => {
    const need = tr.width + 2 * tr.runoff + 10;
    const sep = minSeparation(tr);
    assert.ok(sep.dist >= need, `最近距離 ${sep.dist.toFixed(0)} < ${need}`);
  });

  test(`賽道 ${def.id}：護欄完整落在畫面內`, () => {
    const b = bounds(tr);
    const m = tr.half + tr.runoff;
    assert.ok(b.x0 - m >= 0 && b.y0 - m >= 0, JSON.stringify(b));
    assert.ok(b.x1 + m <= WORLD.w && b.y1 + m <= WORLD.h, JSON.stringify(b));
  });

  test(`賽道 ${def.id}：起跑線後方至少 200 單位是直線（8 台車的起跑格）`, () => {
    for (let k = 0; k < Math.round(200 / tr.ds); k++) {
      const i = (tr.n - k) % tr.n;
      assert.ok(tr.curv[i] < 0.004, `起跑格附近彎度太大 i=${i} curv=${tr.curv[i]}`);
    }
  });

  test(`賽道 ${def.id}：每款車的電腦都能跑完，而且差距不會太大`, () => {
    const times = {};
    for (const car of CARS) {
      const race = new Race(tr, [{ id: 'a', name: 'a', color: '#fff', car: car.id, bot: true, skill: 0.95 }], 2, { rand: rng(3) });
      runToEnd(race);
      assert.ok(race.cars[0].finished, `${car.id} 沒跑完`);
      times[car.id] = race.cars[0].finishTime;
    }
    const v = Object.values(times);
    const spread = Math.max(...v) / Math.min(...v) - 1;
    assert.ok(spread < 0.12, `車款差距 ${(spread * 100).toFixed(1)}% 太大：${JSON.stringify(times)}`);
  });
}

test('8 台車完整比賽：名次 1~8 不重複、狀態結束', () => {
  const tr = buildTrack(TRACKS[1]);
  const entries = Array.from({ length: 8 }, (_, i) => ({ id: 'b' + i, name: 'b' + i, color: COLORS[i].hex, car: CARS[i % CARS.length].id, bot: true }));
  const race = new Race(tr, entries, 2, { rand: rng(11) });
  runToEnd(race);
  assert.equal(race.state, 'done');
  const res = race.results();
  assert.deepEqual(res.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(res.every((r) => r.finished));
  for (let i = 1; i < res.length; i++) assert.ok(res[i].time >= res[i - 1].time);
});

test('倒數 3 秒期間車子不能動', () => {
  const tr = buildTrack(TRACKS[0]);
  const race = new Race(tr, [{ id: 'p', name: 'p', color: '#fff', car: 'comet' }], 1);
  race.setInput('p', { s: 0, g: 1, b: 0, n: 1 });
  const x0 = race.cars[0].x;
  for (let i = 0; i < 170; i++) race.step(1 / 60);
  assert.equal(race.state, 'countdown');
  assert.equal(race.cars[0].x, x0);
  const kinds = race.drainEvents().map((e) => e.type + (e.n || ''));
  assert.deepEqual(kinds, ['count3', 'count2', 'count1']);
  for (let i = 0; i < 20; i++) race.step(1 / 60);
  assert.equal(race.state, 'running');
  assert.ok(race.cars[0].x !== x0);
});

test('倒車來回穿越終點線不會被算成一圈', () => {
  const tr = buildTrack(TRACKS[0]);
  const race = new Race(tr, [{ id: 'p', name: 'p', color: '#fff', car: 'comet' }], 3);
  for (let i = 0; i < 200; i++) race.step(1 / 60);         // 倒數結束
  const car = race.cars[0];
  let crossings = 0;
  for (let round = 0; round < 3; round++) {
    race.setInput('p', { g: 1 });
    for (let i = 0; i < 600 && car.prog < 15; i++) race.step(1 / 60);   // 往前過線
    if (car.prog >= 15) crossings++;
    race.setInput('p', { b: 1 });
    for (let i = 0; i < 600 && car.prog > -15; i++) race.step(1 / 60);  // 煞停再倒車退回線後
    assert.ok(car.prog <= -15, '有倒車退回線後');
  }
  assert.equal(crossings, 3, '確實往前穿越終點線 3 次');
  assert.equal(car.lapsDone, 0);
  assert.equal(race.lap(car), 1);
});

test('逆向行駛會被偵測', () => {
  const tr = buildTrack(TRACKS[0]);
  const race = new Race(tr, [{ id: 'p', name: 'p', color: '#fff', car: 'comet' }], 3);
  for (let i = 0; i < 200; i++) race.step(1 / 60);
  const car = race.cars[0];
  car.a += Math.PI;                                          // 掉頭
  race.setInput('p', { g: 1 });
  for (let i = 0; i < 120; i++) race.step(1 / 60);
  assert.ok(car.wrongWay);
  assert.ok(car.prog < 0);
});

test('一直打方向盤也衝不出護欄', () => {
  const tr = buildTrack(TRACKS[2]);
  const race = new Race(tr, [{ id: 'p', name: 'p', color: '#fff', car: 'bolt' }], 3);
  for (let i = 0; i < 200; i++) race.step(1 / 60);
  race.setInput('p', { g: 1, n: 1, s: 0.15 });
  let worst = 0;
  for (let i = 0; i < 60 * 20; i++) {
    race.step(1 / 60);
    const c = race.cars[0];
    worst = Math.max(worst, Math.abs(locate(tr, c.x, c.y, c.idx).lat));
  }
  assert.ok(worst <= tr.half + tr.runoff + 2, `最遠偏離 ${worst.toFixed(1)}`);
});

test('草地上會減速，重量型車減得比較少', () => {
  const top = {};
  for (const id of ['bolt', 'bull']) {
    const def = CARS.find((c) => c.id === id);
    const car = makeCar(def, { x: 0, y: 0, a: 0 });
    car.offroad = true;
    for (let i = 0; i < 600; i++) stepCar(car, { g: 1 }, 1 / 60);
    top[id] = speedOf(car) / def.maxSpeed;
  }
  assert.ok(top.bolt < 0.6);
  assert.ok(top.bull > top.bolt + 0.25);
});

test('碰撞：重的車把輕的車推得比較遠', () => {
  const bull = makeCar(CARS.find((c) => c.id === 'bull'), { x: 0, y: 0, a: 0 });
  const pixie = makeCar(CARS.find((c) => c.id === 'pixie'), { x: 20, y: 0, a: Math.PI });
  bull.vx = 150; pixie.vx = -150;
  const hits = collideCars([bull, pixie]);
  assert.equal(hits.length, 1);
  assert.ok(pixie.vx > 0, '輕的車被反彈');
  assert.ok(Math.abs(bull.vx) < Math.abs(pixie.vx));
});

test('真人都到終點就結束，不用等電腦', () => {
  const tr = buildTrack(TRACKS[0]);
  const race = new Race(tr, [
    { id: 'p', name: 'p', color: '#fff', car: 'comet' },
    { id: 'b', name: 'b', color: '#000', car: 'comet', bot: true, skill: 0.5 },
  ], 1, { rand: rng(5) });
  // 讓真人用電腦的邏輯開（模擬一位很會開的玩家）
  race.cars[0].bot = true;
  race.cars[0].brain = { ...race.cars[1].brain, skill: 1, rand: rng(9) };
  race.step(1 / 60);
  race.cars[0].bot = false;
  while (race.state !== 'done' && race.time < 120) {
    race.setInput('p', botInput(tr, race.cars[0], race.cars[0].brain, 1 / 60));
    race.step(1 / 60);
  }
  assert.equal(race.state, 'done');
  assert.ok(race.cars[0].finished);
  assert.ok(!race.cars[1].finished, '慢的電腦還沒到也結束了');
});
