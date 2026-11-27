// 派對賽車的主機畫面：等候室（共用的 room.js）、跑比賽、顯示結果。

import { TRACKS, WORLD, carById, trackById } from './config.js';
import { buildTrack } from './track.js';
import { Race } from './race.js';
import { speedOf } from './physics.js';
import { drawCar, drawShowcase, drawGantry, CAR_SIZE, INK } from './render.js';
import { drawTrackScene, drawTrackThumb, themeOf } from './scenery.js';
import { faceSVG } from './avatar.js';
import { sfx } from './audio.js';
import { createRoom, esc, show } from './room.js';
import { toast, bigText, banner, resetHud, startConfetti, fmtTime } from './hud.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;

const trackCache = new Map();
function getTrack(id) {
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(trackById(id)));
  return trackCache.get(id);
}

const G = { trackId: TRACKS[0].id, laps: 3 };

const room = createRoom({
  game: 'racer',
  storageKey: 'pr-host',
  loadSettings(saved) {
    if (TRACKS.some((t) => t.id === saved.track)) G.trackId = saved.track;
    if (Number.isInteger(saved.laps)) G.laps = Math.max(1, Math.min(9, saved.laps));
  },
  saveSettings: () => ({ laps: G.laps, track: G.trackId }),
  lobbyInfo: () => ({ track: G.trackId, laps: G.laps }),
  slotSub: (p) => { const c = carById(p.car); return `${c.name} · ${c.type}`; },
  slotArt(el, p) {
    let cv = el.querySelector('canvas');
    if (!cv) { cv = document.createElement('canvas'); el.appendChild(cv); }
    const key = p.car + p.color;
    if (cv.dataset.key !== key) {
      requestAnimationFrame(() => { if (drawShowcase(cv, carById(p.car).shape, p.color, -0.55)) cv.dataset.key = key; });
    }
  },
  onInput(p, m) {
    p.input = { s: Math.max(-1, Math.min(1, +m.s || 0)), g: m.g ? 1 : 0, b: m.b ? 1 : 0, n: m.n ? 1 : 0 };
    if (S.race) S.race.setInput(p.id, p.input);
  },
  onDrop(p) {
    p.input = { s: 0, g: 0, b: 0, n: 0 };
    if (S.race) S.race.setInput(p.id, p.input);
  },
  onReady: setupLobbyExtras,
  afterRefresh: refreshTrackUI,
  start: startRace,
});
const S = room.S;
S.race = null;
S.track = null;

// ── 等候室：賽道與圈數 ───────────────────────────────

function setupLobbyExtras() {
  const list = $('track-list');
  list.innerHTML = '';
  for (const t of TRACKS) {
    const b = document.createElement('button');
    b.className = 'track-card';
    b.dataset.id = t.id;
    b.title = t.desc;
    b.innerHTML = `<canvas></canvas><div class="track-name">${esc(t.name)}</div>`;
    b.onclick = () => { G.trackId = t.id; room.saveSettings(); room.refreshLobby(); };
    list.appendChild(b);
  }
  requestAnimationFrame(() => {
    for (const b of list.children) drawTrackThumb(b.querySelector('canvas'), getTrack(b.dataset.id));
  });
  $('lap-minus').onclick = () => { G.laps = Math.max(1, G.laps - 1); room.saveSettings(); room.refreshLobby(); };
  $('lap-plus').onclick = () => { G.laps = Math.min(9, G.laps + 1); room.saveSettings(); room.refreshLobby(); };
  $('again-btn').onclick = startRace;
  $('lobby-btn').onclick = () => { S.race = null; resetHud(); room.backToLobby(); };
  $('end-btn').onclick = () => { if (S.race) S.race.finish(); };
}

function refreshTrackUI() {
  $('lap-count').textContent = G.laps;
  for (const b of $('track-list').children) b.classList.toggle('selected', b.dataset.id === G.trackId);
  const tdef = trackById(G.trackId);
  $('track-info').innerHTML = `<span class="theme-tag">${themeOf(getTrack(G.trackId)).label}</span><b>${esc(tdef.name)}</b>　${esc(tdef.desc)}`;
}

// ── 比賽 ─────────────────────────────────────────────

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const avatars = new Map();

function startRace() {
  room.keepAwake();
  const entries = shuffle(room.entries());
  if (!entries.length) return;
  for (const e of entries) avatars.set(e.id, e.avatar);
  S.track = getTrack(G.trackId);
  S.race = new Race(S.track, entries, G.laps);
  S.racers = entries.filter((e) => !e.bot).map((e) => e.id);
  S.results = null;
  S.phase = 'play';
  particles.length = 0;
  finalLapShown = false;
  resetHud();
  $('end-btn').classList.remove('hidden');
  $('h-race').style.background = themeOf(S.track).letterbox;
  show('h-race');
  resize();
  room.refreshLobby();
}

let finalLapShown = false;

function handleRaceEvents() {
  const race = S.race;
  for (const e of race.drainEvents()) {
    if (e.type === 'count') {
      bigText(String(e.n), 'c' + e.n);
      sfx.count();
      room.broadcast({ t: 'fx', k: 'count', n: e.n });
    } else if (e.type === 'go') {
      bigText('GO!', 'go');
      sfx.go();
      room.broadcast({ t: 'fx', k: 'go' });
    } else if (e.type === 'lap') {
      const car = race.cars.find((c) => c.id === e.id);
      if (car && !car.bot) {
        toast(`${car.name} 進入第 ${e.lap} 圈（單圈 ${e.time.toFixed(2)} 秒）`, car.color);
        sfx.lap();
      }
      room.sendTo(e.id, { t: 'fx', k: 'lap', lap: e.lap, final: e.lap === race.laps });
      if (e.lap === race.laps && !finalLapShown) {
        finalLapShown = true;
        banner('最後一圈！');
      }
    } else if (e.type === 'finish') {
      const car = race.cars.find((c) => c.id === e.id);
      if (car) toast(`🏁 ${car.name} 第 ${e.place} 名抵達！`, car.color);
      if (e.place === 1 && car) banner(`FINISH! ${car.name}`, 'finish');
      sfx.finish();
      room.sendTo(e.id, { t: 'fx', k: 'finish', place: e.place });
    } else if (e.type === 'bump') {
      const car = race.cars.find((c) => c.id === e.id);
      if (!car) continue;
      const now = performance.now();
      if (!car.lastBump || now - car.lastBump > 300) {
        car.lastBump = now;
        room.sendTo(e.id, { t: 'fx', k: 'bump', p: Math.round(e.power) });
        if (!car.bot) sfx.bump();
        if (e.wall) sparks(car.x, car.y);
      }
    } else if (e.type === 'done') {
      $('end-btn').classList.add('hidden');
      setTimeout(showResults, 1200);
    }
  }
}

function showResults() {
  if (!S.race || S.phase !== 'play') return;
  S.phase = 'results';
  const list = S.race.results().map((r) => ({ ...r, avatar: avatars.get(r.id) }));
  S.results = list;
  room.broadcast({ t: 'res', list });
  room.refreshLobby();
  const sub = (r) => (r.finished ? fmtTime(r.time) : `未完成 ${r.laps}/${S.race.laps} 圈`);
  const pod = $('podium');
  pod.innerHTML = '';
  for (const place of [2, 1, 3]) {
    const r = list[place - 1];
    if (!r) continue;
    const el = document.createElement('div');
    el.className = 'pod p' + place;
    el.style.setProperty('--pc', r.color);
    el.innerHTML = `<canvas></canvas><div class="pod-name"><span class="pod-face">${faceSVG(r.avatar, r.color)}</span>${esc(r.name)}</div><div class="pod-time">${sub(r)}</div><div class="pod-block"><span class="pod-no">${place}</span></div>`;
    pod.appendChild(el);
  }
  $('results-table').innerHTML = list.slice(3).map((r) => `
    <div class="res-row" style="--pc:${r.color}">
      <div class="res-place">${r.place}</div>
      <div class="res-face">${faceSVG(r.avatar, r.color)}</div>
      <div class="res-name">${esc(r.name)}${r.bot ? ' <span class="tag">電腦</span>' : ''}<div class="res-sub">${esc(carById(r.car).name)} · 最快單圈 ${r.best != null ? r.best.toFixed(2) + ' 秒' : '—'}</div></div>
      <div class="res-time">${sub(r)}</div>
    </div>`).join('');
  $('results').classList.remove('hidden');
  requestAnimationFrame(() => {
    for (const el of pod.children) {
      const r = list[+el.className.match(/p(\d)/)[1] - 1];
      drawShowcase(el.querySelector('canvas'), carById(r.car).shape, r.color, -0.5);
    }
    startConfetti();
  });
}

// ── 畫面 ─────────────────────────────────────────────

const canvas = $('game');
const ctx = canvas.getContext('2d');
const bg = document.createElement('canvas');
const skid = document.createElement('canvas');
let view = null;

function resize() {
  if (!S.track) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = bg.width = skid.width = Math.round(w * dpr);
  canvas.height = bg.height = skid.height = Math.round(h * dpr);
  // 直立的手機就把賽道轉 90 度，畫面才不會太小
  const rot = h > w * 1.15;
  const ww = rot ? WORLD.h : WORLD.w, wh = rot ? WORLD.w : WORLD.h;
  const s = Math.min(w / ww, h / wh);
  const ox = (w - ww * s) / 2, oy = (h - wh * s) / 2;
  const k = s * dpr;
  const m = rot ? [0, k, -k, 0, (ox + WORLD.h * s) * dpr, oy * dpr] : [k, 0, 0, k, ox * dpr, oy * dpr];
  view = { dpr, s, ox, oy, rot, w, h, m };

  const b = bg.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.fillStyle = themeOf(S.track).letterbox;
  b.fillRect(0, 0, bg.width, bg.height);
  b.setTransform(...m);
  drawTrackScene(b, S.track, { iconAngle: rot ? -Math.PI / 2 : 0 });
  skid.getContext('2d').clearRect(0, 0, skid.width, skid.height);
}
window.addEventListener('resize', () => { if (S.phase === 'play' || S.phase === 'results') resize(); });

function toScreen(x, y) {
  return view.rot ? [view.ox + (WORLD.h - y) * view.s, view.oy + x * view.s] : [view.ox + x * view.s, view.oy + y * view.s];
}

const particles = [];
function sparks(x, y) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, max: 0.35, c: '#ffd54f', r: 2 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
  }
}

function drawSkids(race) {
  const g = skid.getContext('2d');
  g.setTransform(...view.m);
  g.lineCap = 'round';
  for (const car of race.cars) {
    const sz = CAR_SIZE[car.def.shape];
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    const rx = car.x - ca * sz.l * 0.32, ry = car.y - sa * sz.l * 0.32;
    const wl = sz.w * 0.36;
    const wheels = [[rx - sa * wl, ry + ca * wl], [rx + sa * wl, ry - ca * wl]];
    const spd = speedOf(car);
    const marking = !car.offroad && (car.slip > 55 || (car.input.b && spd > 110 && car.vx * ca + car.vy * sa > 0));
    if (marking && car.prevWheels) {
      g.strokeStyle = 'rgba(20,20,24,0.22)';
      g.lineWidth = 3.2;
      g.beginPath();
      for (let k = 0; k < 2; k++) { g.moveTo(...car.prevWheels[k]); g.lineTo(...wheels[k]); }
      g.stroke();
    }
    car.prevWheels = wheels;
    if (car.offroad && spd > 60 && Math.random() < 0.5) {
      particles.push({ x: rx, y: ry, vx: -car.vx * 0.2 + (Math.random() - 0.5) * 40, vy: -car.vy * 0.2 + (Math.random() - 0.5) * 40, life: 0.5, max: 0.5, c: '#bfa36a', r: 4 + Math.random() * 3 });
    }
  }
}

function render() {
  const race = S.race;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  drawSkids(race);
  ctx.drawImage(skid, 0, 0);

  ctx.setTransform(...view.m);
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.8;
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const car of race.cars) {
    ctx.save();
    ctx.setTransform(...view.m);
    ctx.translate(car.x, car.y);
    ctx.rotate(car.a);
    drawCar(ctx, car.def.shape, car.color, { boost: car.boosting, brake: car.input.b });
    ctx.restore();
  }

  ctx.setTransform(...view.m);
  drawGantry(ctx, S.track);

  // 名牌（螢幕座標，不跟著賽道旋轉）：玩家顏色的膠囊＋名次徽章
  const order = race.standings();
  const pos = new Map(order.map((c, i) => [c.id, i + 1]));
  const fs = Math.max(10, Math.min(15, view.s * 18));
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = `900 ${fs}px system-ui, "PingFang TC", "Noto Sans TC", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const medal = ['#ffcf33', '#d3deee', '#f3a66c'];
  for (const car of race.cars) {
    const [sx, sy] = toScreen(car.x, car.y);
    const rank = pos.get(car.id);
    const tw = ctx.measureText(car.name).width;
    const h = fs * 1.5, br = h * 0.5;
    const wTot = tw + 12 + h;
    const x0 = sx - wTot / 2, y = sy - fs * 2.2;
    // 小三角指向車子
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(sx - 5, y + h / 2 - 1); ctx.lineTo(sx + 5, y + h / 2 - 1); ctx.lineTo(sx, y + h / 2 + 6); ctx.fill();
    ctx.fillStyle = car.color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y - h / 2, wTot, h, br); else ctx.rect(x0, y - h / 2, wTot, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = medal[rank - 1] || '#ffffff';
    ctx.beginPath(); ctx.arc(x0 + br, y, br - 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.fillText(String(rank), x0 + br, y + 0.5);
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeText(car.name, x0 + h + 3, y + 0.5);
    ctx.fillStyle = '#fff';
    ctx.fillText(car.name, x0 + h + 3, y + 0.5);
    if (car.wrongWay && !car.finished) {
      ctx.textAlign = 'center';
      ctx.strokeText('⚠ 逆向！', sx, sy + fs * 2);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('⚠ 逆向！', sx, sy + fs * 2);
    }
  }
}

// ── HUD ─────────────────────────────────────────────

let hudAt = 0;
function updateHud(now) {
  if (now - hudAt < 150) return;
  hudAt = now;
  const race = S.race;
  const order = race.standings();
  $('hud-standings').innerHTML = order.map((c, i) => `
    <div class="rk-row rk-${i + 1}${c.finished ? ' done' : ''}" style="--pc:${c.color}">
      <span class="rk-pos">${i + 1}</span>
      <span class="rk-name">${esc(c.name)}</span>
      <span class="rk-lap">${c.finished ? 'GOAL' : `${race.lap(c)}/${race.laps}`}</span>
    </div>`).join('');
  $('hud-timer').textContent = fmtTime(Math.max(0, race.time));
  const lead = order[0];
  $('hud-lap').innerHTML = lead ? `${race.lap(lead)}<small>/${race.laps}</small>` : '';
}

let statusAt = 0;
function sendStatus(now) {
  if (now - statusAt < 100) return;
  statusAt = now;
  const race = S.race;
  const order = race.standings();
  const st = race.state === 'countdown' ? 'count' : race.state === 'running' ? 'run' : 'done';
  order.forEach((c, i) => {
    if (c.bot) return;
    room.sendTo(c.id, {
      t: 'st', ph: st, c: st === 'count' ? Math.ceil(-race.time) : 0,
      p: i + 1, n: order.length, l: race.lap(c), L: race.laps,
      ni: Math.round(c.nitro * 100) / 100, bo: c.boosting ? 1 : 0,
      w: c.wrongWay && !c.finished ? 1 : 0, f: c.finished ? c.place : 0,
      sp: Math.round(speedOf(c)),
    });
  });
}

// ── 主迴圈 ───────────────────────────────────────────

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if ((S.phase === 'play' || S.phase === 'results') && S.race && view) {
    if (S.phase === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 6) { S.race.step(STEP); acc -= STEP; n++; }
      if (n === 6) acc = 0;
      handleRaceEvents();
      sendStatus(now);
    }
    updateParticles(dt);
    render();
    updateHud(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
