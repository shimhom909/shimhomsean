// 一場比賽的完整邏輯：倒數、物理、圈數、名次、終點。純計算，不碰 DOM。

import { carById } from './config.js';
import { locate, gridPose } from './track.js';
import { makeCar, stepCar, collideCars, speedOf } from './physics.js';
import { botInput, makeBrain } from './ai.js';

export const COUNTDOWN = 3;       // 秒
export const FINISH_GRACE = 25;   // 第一名到終點後，其他人還有幾秒可以完成

export class Race {
  // entries: [{ id, name, color, car, bot }]
  constructor(track, entries, laps, { rand = Math.random } = {}) {
    this.track = track;
    this.laps = laps;
    this.time = -COUNTDOWN;
    this.state = 'countdown';     // countdown → running → done
    this.events = [];
    this.finishOrder = [];
    this.graceEnd = Infinity;
    this.lastCount = COUNTDOWN + 1;
    this.cars = entries.map((e, slot) => {
      const car = makeCar(carById(e.car), gridPose(track, slot));
      const loc = locate(track, car.x, car.y);
      return Object.assign(car, {
        id: e.id, name: e.name, color: e.color, carId: e.car, bot: !!e.bot,
        brain: e.bot ? makeBrain(rand, e.skill) : null,
        input: { s: 0, g: 0, b: 0, n: 0 },
        idx: loc.i, lastAlong: loc.along,
        prog: loc.along > track.length / 2 ? loc.along - track.length : loc.along,
        lapsDone: 0, lapStart: 0, lapTimes: [], best: null,
        finished: false, finishTime: null, place: null,
        wrongTimer: 0, wrongWay: false,
      });
    });
  }

  setInput(id, inp) {
    const car = this.cars.find((c) => c.id === id);
    if (car) car.input = { s: +inp.s || 0, g: inp.g ? 1 : 0, b: inp.b ? 1 : 0, n: inp.n ? 1 : 0 };
  }

  removeCar(id) {
    this.cars = this.cars.filter((c) => c.id !== id);
    this.checkDone();
  }

  step(dt) {
    if (this.state === 'done') return;
    this.time += dt;

    if (this.state === 'countdown') {
      const c = Math.ceil(-this.time);
      if (c < this.lastCount && c > 0) { this.lastCount = c; this.events.push({ type: 'count', n: c }); }
      if (this.time >= 0) {
        this.state = 'running';
        this.time = 0;
        this.events.push({ type: 'go' });
      }
      return;
    }

    const tr = this.track;
    for (const car of this.cars) {
      const inp = car.bot ? botInput(tr, car, car.brain, dt) : car.input;
      if (car.bot) car.input = inp;
      stepCar(car, inp, dt);
      this.keepOnTrack(car);
    }

    for (const hit of collideCars(this.cars)) {
      if (hit.power > 70) {
        this.events.push({ type: 'bump', id: hit.a.id, power: hit.power });
        this.events.push({ type: 'bump', id: hit.b.id, power: hit.power });
      }
    }

    for (const car of this.cars) this.updateProgress(car, dt);
    this.checkDone();
  }

  // 出界：草地減速；撞到護欄就彈回來
  keepOnTrack(car) {
    const tr = this.track;
    const loc = locate(tr, car.x, car.y, car.idx);
    const absLat = Math.abs(loc.lat);
    car.offroad = absLat > tr.half;
    const limit = tr.half + tr.runoff;
    if (absLat > limit) {
      const sgn = Math.sign(loc.lat);
      const nx = tr.nx[loc.i] * sgn, ny = tr.ny[loc.i] * sgn;
      const excess = absLat - limit;
      car.x -= nx * excess; car.y -= ny * excess;
      const vn = car.vx * nx + car.vy * ny;
      if (vn > 0) {
        car.vx -= nx * vn * 1.4; car.vy -= ny * vn * 1.4;
        car.vx *= 0.85; car.vy *= 0.85;
        if (vn > 60) this.events.push({ type: 'bump', id: car.id, power: vn, wall: true });
      }
    }
  }

  updateProgress(car, dt) {
    const tr = this.track;
    const loc = locate(tr, car.x, car.y, car.idx);
    let d = loc.along - car.lastAlong;
    if (d > tr.length / 2) d -= tr.length;
    else if (d < -tr.length / 2) d += tr.length;
    if (Math.abs(d) < 60) car.prog += d;      // 異常跳躍（不該發生）就不計
    car.lastAlong = loc.along;
    car.idx = loc.i;

    // 逆向偵測：車頭跟賽道方向相反並且在移動
    const fwd = Math.cos(car.a) * tr.tx[loc.i] + Math.sin(car.a) * tr.ty[loc.i];
    car.wrongTimer = fwd < -0.3 && speedOf(car) > 30 ? car.wrongTimer + dt : Math.max(0, car.wrongTimer - dt * 2);
    car.wrongWay = car.wrongTimer > 1;

    if (car.finished) return;
    const done = Math.floor(car.prog / tr.length);
    if (done > car.lapsDone) {
      car.lapsDone = done;
      const lt = this.time - car.lapStart;
      car.lapTimes.push(lt);
      car.lapStart = this.time;
      if (car.best === null || lt < car.best) car.best = lt;
      if (done >= this.laps) {
        car.finished = true;
        car.finishTime = this.time;
        this.finishOrder.push(car.id);
        car.place = this.finishOrder.length;
        this.events.push({ type: 'finish', id: car.id, place: car.place, time: this.time });
        if (this.graceEnd === Infinity) this.graceEnd = this.time + FINISH_GRACE;
      } else {
        this.events.push({ type: 'lap', id: car.id, lap: done + 1, time: lt });
      }
    }
  }

  checkDone() {
    if (this.state !== 'running') return;
    // 真人都到終點就結束（不用等電腦車）；全是電腦車時等全部到
    const humans = this.cars.filter((c) => !c.bot);
    const pool = humans.length ? humans : this.cars;
    if (pool.every((c) => c.finished) || this.time >= this.graceEnd) this.finish();
  }

  finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.events.push({ type: 'done' });
  }

  lap(car) {
    return Math.min(this.laps, Math.max(1, Math.floor(car.prog / this.track.length) + 1));
  }

  // 目前名次：已完成的依完成時間，其他依賽道進度
  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
  }

  results() {
    return this.standings().map((c, k) => ({
      id: c.id, name: c.name, color: c.color, car: c.carId, bot: c.bot,
      place: k + 1, finished: c.finished, time: c.finishTime, best: c.best,
      laps: Math.min(this.laps, c.lapsDone),
    }));
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
