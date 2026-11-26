// 主機畫面：建立房間、顯示 QR code、大廳、跑比賽、顯示結果。

import { CARS, COLORS, TRACKS, MAX_PLAYERS, WORLD, FUN_NAMES, carById, trackById } from './config.js';
import { buildTrack } from './track.js';
import { Race } from './race.js';
import { speedOf } from './physics.js';
import { createHost, passthroughQuery } from './net.js';
import { drawCar, drawCarPreview, drawTrackScene, drawTrackThumb, CAR_SIZE, isLight } from './render.js';
import { sfx, unlockAudio, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const HEARTBEAT_TIMEOUT = 7000;   // 這麼久沒收到手機訊息就當斷線
const LOBBY_KEEP = 60000;         // 大廳裡斷線的玩家保留多久（讓他重連回來）

const S = {
  code: null,
  phase: 'boot',                  // boot | lobby | race | results
  players: new Map(),             // 真人玩家 id → player
  bots: [],
  botCount: 0,
  trackId: TRACKS[0].id,
  laps: 3,
  race: null,
  track: null,
  racers: [],
  results: null,
};

const trackCache = new Map();
function getTrack(id) {
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(trackById(id)));
  return trackCache.get(id);
}

function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(t) {
  if (t == null) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// ── 連線 ─────────────────────────────────────────────

const host = createHost({
  onReady(code) {
    S.code = code;
    S.phase = 'lobby';
    setupLobby();
    show('h-lobby');
  },
  onConnect: onLink,
  onStatus(text) {
    const el = $('net-status');
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
  },
  onError(msg) {
    $('h-boot-msg').textContent = msg;
    document.querySelector('#h-boot .spinner').classList.add('hidden');
    $('h-retry').classList.remove('hidden');
    show('h-boot');
  },
});

function humans() {
  return [...S.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
}

function onLink(link) {
  let pid = null;
  link.onMessage = (m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') { pid = onHello(link, m); return; }
    const p = pid && S.players.get(pid);
    if (!p || p.link !== link) return;
    p.lastSeen = performance.now();
    if (m.t === 'prof') { applyProfile(p, m); refreshLobby(); }
    else if (m.t === 'ready') { p.ready = !!m.v; refreshLobby(); }
    else if (m.t === 'in') {
      p.input = { s: Math.max(-1, Math.min(1, +m.s || 0)), g: m.g ? 1 : 0, b: m.b ? 1 : 0, n: m.n ? 1 : 0 };
      if (S.race) S.race.setInput(pid, p.input);
    }
  };
  link.onClose = () => {
    const p = pid && S.players.get(pid);
    if (p && p.link === link) dropLink(p);
  };
}

function onHello(link, m) {
  const id = String(m.cid || link.id).slice(0, 48);
  let p = S.players.get(id);
  if (p) {
    // 同一支手機重新連線：接回原本的位置
    const old = p.link;
    p.link = link;
    if (old && old !== link) old.close();
  } else {
    if (S.players.size >= MAX_PLAYERS) {
      link.send({ t: 'reject', reason: 'full', msg: `房間已滿（最多 ${MAX_PLAYERS} 人）` });
      setTimeout(() => link.close(), 800);
      return null;
    }
    p = { id, ready: false, joinedAt: Date.now(), input: { s: 0, g: 0, b: 0, n: 0 }, link, name: '', color: null, car: CARS[0].id };
    S.players.set(id, p);
    applyProfile(p, m);
    sfx.join();
  }
  p.connected = true;
  p.lastSeen = performance.now();
  p.lostAt = null;
  if (typeof m.ready === 'boolean' && S.phase === 'lobby') p.ready = m.ready;
  link.send({ t: 'welcome', id, code: S.code });
  refreshLobby();
  if (S.phase === 'results' && S.results) link.send({ t: 'res', list: S.results });
  return id;
}

function dropLink(p) {
  p.link = null;
  p.connected = false;
  p.lostAt = performance.now();
  p.input = { s: 0, g: 0, b: 0, n: 0 };
  if (S.race) S.race.setInput(p.id, p.input);
  refreshLobby();
}

function cleanName(s) {
  const clean = String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return Array.from(clean).slice(0, 10).join('');
}

function colorTaken(hex, exceptId) {
  for (const p of S.players.values()) if (p.id !== exceptId && p.color === hex) return true;
  return false;
}

function applyProfile(p, m) {
  const name = cleanName(m.name);
  p.name = name || p.name || FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
  if (m.car && CARS.some((c) => c.id === m.car)) p.car = m.car;
  const want = COLORS.some((c) => c.hex === m.color) ? m.color : null;
  if (want && !colorTaken(want, p.id)) p.color = want;
  else if (!p.color || colorTaken(p.color, p.id)) {
    const free = COLORS.find((c) => !colorTaken(c.hex, p.id));
    p.color = free ? free.hex : COLORS[0].hex;
  }
}

// 心跳：太久沒消息的手機視為斷線；大廳中斷線太久的玩家移除
setInterval(() => {
  const now = performance.now();
  let changed = false;
  for (const p of S.players.values()) {
    if (p.connected && now - p.lastSeen > HEARTBEAT_TIMEOUT) {
      if (p.link) p.link.close();
      if (p.connected) dropLink(p);
    }
    if (!p.connected && S.phase === 'lobby' && p.lostAt && now - p.lostAt > LOBBY_KEEP) {
      S.players.delete(p.id);
      changed = true;
    }
  }
  if (changed) refreshLobby();
  broadcast({ t: 'hb' });
}, 2000);

function broadcast(msg) {
  for (const p of S.players.values()) if (p.link) p.link.send(msg);
}

function sendTo(id, msg) {
  const p = S.players.get(id);
  if (p && p.link) p.link.send(msg);
}

// ── 電腦對手 ─────────────────────────────────────────

function rebuildBots() {
  const max = MAX_PLAYERS - S.players.size;
  S.botCount = Math.max(0, Math.min(S.botCount, max));
  const used = new Set([...S.players.values()].map((p) => p.color));
  S.bots = [];
  for (let k = 0; k < S.botCount; k++) {
    const color = (COLORS.find((c) => !used.has(c.hex)) || COLORS[k % COLORS.length]).hex;
    used.add(color);
    S.bots.push({ id: 'bot-' + k, name: '電腦 ' + (k + 1), color, car: CARS[(k + 1) % CARS.length].id, bot: true, ready: true, connected: true });
  }
}

// ── 大廳 ─────────────────────────────────────────────

let qrUrl = '';

function setupLobby() {
  const url = new URL('play.html', location.href);
  const extra = passthroughQuery();
  url.search = `room=${S.code}` + (extra ? '&' + extra : '');
  qrUrl = url.toString();
  $('room-code').textContent = S.code;
  $('hud-room').textContent = S.code;
  const base = new URL('./', location.href);
  $('join-url-short').textContent = (base.host + base.pathname).replace(/\/$/, '');
  drawQR();

  const isLocalNet = new URLSearchParams(location.search).get('net') === 'local';
  if (!isLocalNet && (location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(location.hostname))) {
    const w = $('local-warn');
    w.textContent = '⚠ 目前是本機網址，其他手機掃描會連不到。請用部署後的網址（例如 GitHub Pages）或電腦的區網 IP 開啟。';
    w.classList.remove('hidden');
  }

  const list = $('track-list');
  list.innerHTML = '';
  for (const t of TRACKS) {
    const b = document.createElement('button');
    b.className = 'track-card';
    b.dataset.id = t.id;
    b.innerHTML = `<canvas></canvas><div class="track-name">${esc(t.name)}</div><div class="track-desc">${esc(t.desc)}</div>`;
    b.onclick = () => { S.trackId = t.id; refreshLobby(); };
    list.appendChild(b);
  }
  requestAnimationFrame(() => {
    for (const b of list.children) drawTrackThumb(b.querySelector('canvas'), getTrack(b.dataset.id));
  });

  $('lap-minus').onclick = () => { S.laps = Math.max(1, S.laps - 1); refreshLobby(); };
  $('lap-plus').onclick = () => { S.laps = Math.min(9, S.laps + 1); refreshLobby(); };
  $('bot-minus').onclick = () => { S.botCount = Math.max(0, S.botCount - 1); refreshLobby(); };
  $('bot-plus').onclick = () => { S.botCount += 1; refreshLobby(); };
  $('start-btn').onclick = startRace;
  $('again-btn').onclick = startRace;
  $('lobby-btn').onclick = backToLobby;
  $('end-btn').onclick = () => { if (S.race) S.race.finish(); };

  const fs = $('fs-btn');
  if (!document.documentElement.requestFullscreen) fs.classList.add('hidden');
  fs.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  $('mute-btn').onclick = () => {
    setMuted(!isMuted());
    $('mute-btn').textContent = isMuted() ? '🔇' : '🔊';
    unlockAudio();
  };
  document.addEventListener('pointerdown', () => { unlockAudio(); keepAwake(); }, { once: true });
  refreshLobby();
}

function drawQR() {
  const canvas = $('qr');
  const qr = window.qrcode(0, 'M');
  qr.addData(qrUrl);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 2;
  const size = Math.max(160, canvas.clientWidth || 240) * Math.min(2, devicePixelRatio || 1);
  const cell = Math.max(2, Math.floor(size / (n + margin * 2)));
  canvas.width = canvas.height = cell * (n + margin * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  }
  canvas.title = qrUrl;
  canvas.dataset.url = qrUrl;
}

function publicInfo(p) {
  return { id: p.id, name: p.name, color: p.color, car: p.car, ready: !!p.ready, connected: !!p.connected, bot: !!p.bot };
}

function refreshLobby() {
  rebuildBots();
  const all = [...humans(), ...S.bots];
  broadcast({
    t: 'lobby', phase: S.phase, code: S.code,
    track: S.trackId, laps: S.laps, racers: S.racers,
    players: all.map(publicInfo),
  });
  if (S.phase === 'boot') return;

  $('p-count').textContent = `${all.length}/${MAX_PLAYERS}`;
  $('bot-count').textContent = S.botCount;
  $('lap-count').textContent = S.laps;
  $('bot-plus').disabled = all.length >= MAX_PLAYERS;

  const list = $('player-list');
  if (!all.length) {
    list.innerHTML = '<div class="empty">還沒有人加入，快掃 QR code！</div>';
  } else {
    // 重用既有卡片，避免每次重畫閃爍
    const existing = new Map([...list.querySelectorAll('.player-card')].map((el) => [el.dataset.id, el]));
    list.querySelectorAll('.empty').forEach((e) => e.remove());
    all.forEach((p, i) => {
      let el = existing.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'player-card';
        el.dataset.id = p.id;
        el.innerHTML = '<canvas></canvas><div class="pc-text"><div class="pc-name"></div><div class="pc-sub"></div></div><div class="pc-status"></div>';
      }
      existing.delete(p.id);
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
      const car = carById(p.car);
      el.querySelector('.pc-name').textContent = p.name;
      el.querySelector('.pc-sub').textContent = `${car.name} · ${car.type}`;
      const st = el.querySelector('.pc-status');
      if (p.bot) { st.textContent = '電腦'; st.className = 'pc-status bot'; }
      else if (!p.connected) { st.textContent = '斷線'; st.className = 'pc-status off'; }
      else if (p.ready) { st.textContent = '準備好了'; st.className = 'pc-status ok'; }
      else { st.textContent = '設定中…'; st.className = 'pc-status wait'; }
      el.style.setProperty('--pc', p.color);
      el.classList.toggle('disconnected', !p.connected);
      const key = p.car + p.color;
      const cv = el.querySelector('canvas');
      if (cv.dataset.key !== key) {
        requestAnimationFrame(() => { if (drawCarPreview(cv, car.shape, p.color, { angle: 0 })) cv.dataset.key = key; });
      }
    });
    for (const el of existing.values()) el.remove();
  }

  for (const b of $('track-list').children) b.classList.toggle('selected', b.dataset.id === S.trackId);

  const hs = humans().filter((p) => p.connected);
  const canStart = hs.length + S.bots.length > 0;
  $('start-btn').disabled = !canStart;
  const notReady = hs.filter((p) => !p.ready).length;
  $('start-hint').textContent = !canStart ? '至少要有一位玩家或電腦對手'
    : notReady ? `還有 ${notReady} 人在設定中（主機仍可直接開始）` : '全員準備完成！';
}

function backToLobby() {
  S.phase = 'lobby';
  S.race = null;
  S.racers = [];
  S.results = null;
  for (const p of S.players.values()) p.ready = false;
  $('results').classList.add('hidden');
  show('h-lobby');
  refreshLobby();
}

// ── 比賽 ─────────────────────────────────────────────

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startRace() {
  unlockAudio();
  keepAwake();
  rebuildBots();
  const entries = shuffle([
    ...humans().filter((p) => p.connected).map((p) => ({ id: p.id, name: p.name, color: p.color, car: p.car })),
    ...S.bots.map((b) => ({ ...b })),
  ]);
  if (!entries.length) return;
  S.track = getTrack(S.trackId);
  S.race = new Race(S.track, entries, S.laps);
  S.racers = entries.filter((e) => !e.bot).map((e) => e.id);
  S.results = null;
  S.phase = 'race';
  particles.length = 0;
  toasts.innerHTML = '';
  $('results').classList.add('hidden');
  $('end-btn').classList.remove('hidden');
  $('hud-count').textContent = '';
  show('h-race');
  resize();
  refreshLobby();
}

function handleRaceEvents() {
  const race = S.race;
  for (const e of race.drainEvents()) {
    if (e.type === 'count') {
      bigText(String(e.n));
      sfx.count();
      broadcast({ t: 'fx', k: 'count', n: e.n });
    } else if (e.type === 'go') {
      bigText('GO!', true);
      sfx.go();
      broadcast({ t: 'fx', k: 'go' });
    } else if (e.type === 'lap') {
      const car = race.cars.find((c) => c.id === e.id);
      if (car && !car.bot) {
        toast(`${car.name} 進入第 ${e.lap} 圈（單圈 ${e.time.toFixed(1)} 秒）`, car.color);
        sfx.lap();
      }
      sendTo(e.id, { t: 'fx', k: 'lap', lap: e.lap });
    } else if (e.type === 'finish') {
      const car = race.cars.find((c) => c.id === e.id);
      if (car) toast(`🏁 ${car.name} 第 ${e.place} 名抵達！`, car.color);
      sfx.finish();
      sendTo(e.id, { t: 'fx', k: 'finish', place: e.place });
    } else if (e.type === 'bump') {
      const car = race.cars.find((c) => c.id === e.id);
      if (!car) continue;
      const now = performance.now();
      if (!car.lastBump || now - car.lastBump > 300) {
        car.lastBump = now;
        sendTo(e.id, { t: 'fx', k: 'bump', p: Math.round(e.power) });
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
  if (!S.race || S.phase !== 'race') return;
  S.phase = 'results';
  const list = S.race.results();
  S.results = list;
  broadcast({ t: 'res', list });
  refreshLobby();
  const medals = ['🥇', '🥈', '🥉'];
  $('results-table').innerHTML = list.map((r) => `
    <div class="res-row" style="--pc:${r.color}">
      <div class="res-place">${medals[r.place - 1] || r.place}</div>
      <div class="res-dot"></div>
      <div class="res-name">${esc(r.name)}${r.bot ? ' <span class="tag">電腦</span>' : ''}<div class="res-car">${esc(carById(r.car).name)}</div></div>
      <div class="res-time">${r.finished ? fmtTime(r.time) : `未完成（${r.laps}/${S.race.laps} 圈）`}<div class="res-best">最快單圈 ${r.best != null ? r.best.toFixed(1) + ' 秒' : '—'}</div></div>
    </div>`).join('');
  $('results').classList.remove('hidden');
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
  b.fillStyle = '#1b3d22';
  b.fillRect(0, 0, bg.width, bg.height);
  b.setTransform(...m);
  drawTrackScene(b, S.track);
  skid.getContext('2d').clearRect(0, 0, skid.width, skid.height);
}
window.addEventListener('resize', () => { if (S.phase === 'race' || S.phase === 'results') resize(); });

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

  // 名牌（螢幕座標，不跟著賽道旋轉）
  const order = race.standings();
  const pos = new Map(order.map((c, i) => [c.id, i + 1]));
  const fs = Math.max(10, Math.min(15, view.s * 18));
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = `700 ${fs}px system-ui, "PingFang TC", "Noto Sans TC", sans-serif`;
  ctx.textBaseline = 'middle';
  for (const car of race.cars) {
    const [sx, sy] = toScreen(car.x, car.y);
    const label = `${pos.get(car.id)} ${car.name}`;
    const tw = ctx.measureText(label).width;
    const y = sy - fs * 1.9;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(sx - tw / 2 - 6, y - fs * 0.7, tw + 12, fs * 1.4, fs * 0.7) : ctx.rect(sx - tw / 2 - 6, y - fs * 0.7, tw + 12, fs * 1.4);
    ctx.fill();
    ctx.fillStyle = car.color;
    ctx.fillRect(sx - tw / 2 - 6, y + fs * 0.55, tw + 12, 2);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, y);
    if (car.wrongWay && !car.finished) {
      ctx.fillStyle = '#ffeb3b';
      ctx.fillText('⚠ 逆向', sx, sy + fs * 1.9);
    }
  }
}

// ── HUD ─────────────────────────────────────────────

const toasts = $('hud-toasts');
function toast(text, color) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--pc', color || '#fff');
  el.textContent = text;
  toasts.appendChild(el);
  while (toasts.children.length > 4) toasts.firstChild.remove();
  setTimeout(() => el.remove(), 3500);
}

let bigTimer = null;
function bigText(text, go) {
  const el = $('hud-count');
  el.textContent = text;
  el.className = 'hud-count pop' + (go ? ' go' : '');
  void el.offsetWidth;
  clearTimeout(bigTimer);
  bigTimer = setTimeout(() => { el.textContent = ''; }, go ? 900 : 1000);
}

let hudAt = 0;
function updateHud(now) {
  if (now - hudAt < 150) return;
  hudAt = now;
  const race = S.race;
  const order = race.standings();
  $('hud-standings').innerHTML = order.map((c, i) => `
    <div class="st-row${c.finished ? ' done' : ''}" style="--pc:${c.color}">
      <span class="st-pos">${i + 1}</span><span class="st-dot"></span>
      <span class="st-name">${esc(c.name)}</span>
      <span class="st-lap">${c.finished ? '🏁' : `${race.lap(c)}/${race.laps}`}</span>
    </div>`).join('');
  $('hud-timer').textContent = fmtTime(Math.max(0, race.time));
  const lead = order[0];
  $('hud-lap').textContent = lead ? `第 ${race.lap(lead)} / ${race.laps} 圈` : '';
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
    sendTo(c.id, {
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
  if ((S.phase === 'race' || S.phase === 'results') && S.race && view) {
    if (S.phase === 'race') {
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

// ── 其他 ─────────────────────────────────────────────

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* 不支援就算了 */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.phase !== 'boot') keepAwake(); });

window.addEventListener('beforeunload', (e) => {
  if (S.players.size) { e.preventDefault(); e.returnValue = ''; }
});

// 測試用：讓自動化測試可以讀取主機狀態
window.__host = S;
window.__hostNet = host;
