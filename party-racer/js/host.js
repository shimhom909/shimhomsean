// 主機畫面：建立房間、顯示 QR code、大廳、跑比賽、顯示結果。

import { CARS, COLORS, TRACKS, MAX_PLAYERS, WORLD, FUN_NAMES, carById, trackById } from './config.js';
import { buildTrack } from './track.js';
import { Race } from './race.js';
import { speedOf } from './physics.js';
import { createHost, passthroughQuery } from './net.js';
import { drawCar, drawShowcase, drawTrackScene, drawTrackThumb, drawGantry, CAR_SIZE, INK } from './render.js';
import { sfx, unlockAudio, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const HEARTBEAT_TIMEOUT = 7000;   // 這麼久沒收到手機訊息就當斷線
const LOBBY_KEEP = 60000;         // 大廳裡斷線的玩家保留多久（讓他重連回來）

// 主機上次的設定（電腦玩家數、圈數、賽道）存在這台裝置上，下次開房直接沿用
const saved = (() => {
  try { return JSON.parse(localStorage.getItem('pr-host') || '{}'); } catch (e) { return {}; }
})();

const S = {
  code: null,
  phase: 'boot',                  // boot | lobby | race | results
  players: new Map(),             // 真人玩家 id → player
  bots: [],
  botWanted: Number.isInteger(saved.bots) ? Math.max(0, Math.min(MAX_PLAYERS, saved.bots)) : 0,  // 主機想要幾台電腦
  botCount: 0,                    // 實際幾台（真人太多時會自動讓位）
  trackId: TRACKS.some((t) => t.id === saved.track) ? saved.track : TRACKS[0].id,
  laps: Number.isInteger(saved.laps) ? Math.max(1, Math.min(9, saved.laps)) : 3,
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
  const cs = Math.floor(t * 100);
  const m = Math.floor(cs / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
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

function saveSettings() {
  try { localStorage.setItem('pr-host', JSON.stringify({ bots: S.botWanted, laps: S.laps, track: S.trackId })); } catch (e) { /* ignore */ }
}

// 設定想要的電腦玩家數（會被剩餘空位限制）
function setBots(n) {
  S.botWanted = Math.max(0, Math.min(MAX_PLAYERS - S.players.size, n));
  saveSettings();
  refreshLobby();
}

function rebuildBots() {
  // 真人優先：空位不夠時電腦先讓位，有人離開再補回來
  const max = MAX_PLAYERS - S.players.size;
  S.botCount = Math.max(0, Math.min(S.botWanted, max));
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
    b.onclick = () => { S.trackId = t.id; saveSettings(); refreshLobby(); };
    list.appendChild(b);
  }
  requestAnimationFrame(() => {
    for (const b of list.children) drawTrackThumb(b.querySelector('canvas'), getTrack(b.dataset.id));
  });

  $('lap-minus').onclick = () => { S.laps = Math.max(1, S.laps - 1); saveSettings(); refreshLobby(); };
  $('lap-plus').onclick = () => { S.laps = Math.min(9, S.laps + 1); saveSettings(); refreshLobby(); };

  const chips = $('bot-chips');
  chips.innerHTML = '';
  for (let n = 0; n < MAX_PLAYERS; n++) {
    const c = document.createElement('button');
    c.className = 'chip';
    c.dataset.bots = n;
    c.textContent = n;
    c.setAttribute('role', 'radio');
    c.setAttribute('aria-label', `${n} 台電腦玩家`);
    c.onclick = () => setBots(n);
    chips.appendChild(c);
  }
  // 點空位＝加一台電腦；點電腦的 ✕＝少一台
  $('player-list').addEventListener('click', (e) => {
    if (e.target.closest('.slot.empty')) setBots(S.botCount + 1);
    else if (e.target.closest('.slot-badge.bot')) setBots(S.botCount - 1);
  });
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
  $('lap-count').textContent = S.laps;
  const free = MAX_PLAYERS - S.players.size;
  for (const c of $('bot-chips').children) {
    const n = +c.dataset.bots;
    c.disabled = n > free;
    c.classList.toggle('selected', n === S.botCount);
    c.setAttribute('aria-checked', n === S.botCount ? 'true' : 'false');
  }
  $('slots-sum').textContent = `真人 ${S.players.size}・電腦 ${S.botCount}` + (all.length < MAX_PLAYERS ? '　點空位可加電腦玩家' : '');

  // 等候室：固定 8 個位置，有人的顯示車子，沒人的顯示「等待加入」
  const list = $('player-list');
  const existing = new Map([...list.querySelectorAll('.player-card')].map((el) => [el.dataset.id, el]));
  const nodes = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = all[i];
    if (!p) {
      const el = document.createElement('div');
      el.className = 'slot empty';
      el.title = '點一下加入電腦玩家';
      el.innerHTML = `<div class="slot-no">P${i + 1}</div><div class="slot-plus">+</div><div class="slot-wait">等待加入</div><div class="slot-addbot">點我加電腦</div>`;
      nodes.push(el);
      continue;
    }
    let el = existing.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'slot player-card';
      el.dataset.id = p.id;
      el.innerHTML = '<div class="slot-no"></div><div class="slot-badge"></div><canvas></canvas><div class="slot-name"></div><div class="slot-car"></div>';
    }
    const car = carById(p.car);
    el.querySelector('.slot-no').textContent = 'P' + (i + 1);
    el.querySelector('.slot-name').textContent = p.name;
    el.querySelector('.slot-car').textContent = `${car.name} · ${car.type}`;
    const st = el.querySelector('.slot-badge');
    if (p.bot) { st.textContent = '電腦 ✕'; st.className = 'slot-badge bot'; st.title = '移除這台電腦玩家'; }
    else if (!p.connected) { st.textContent = '斷線'; st.className = 'slot-badge off'; }
    else if (p.ready) { st.textContent = 'READY'; st.className = 'slot-badge ok'; }
    else { st.textContent = '設定中'; st.className = 'slot-badge wait'; }
    el.style.setProperty('--pc', p.color);
    el.classList.toggle('disconnected', !p.connected);
    const key = p.car + p.color;
    const cv = el.querySelector('canvas');
    if (cv.dataset.key !== key) {
      requestAnimationFrame(() => { if (drawShowcase(cv, car.shape, p.color, -0.55)) cv.dataset.key = key; });
    }
    nodes.push(el);
  }
  list.replaceChildren(...nodes);

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
  stopConfetti();
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
  finalLapShown = false;
  $('hud-banner').className = 'hud-banner';
  stopConfetti();
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
      bigText(String(e.n), 'c' + e.n);
      sfx.count();
      broadcast({ t: 'fx', k: 'count', n: e.n });
    } else if (e.type === 'go') {
      bigText('GO!', 'go');
      sfx.go();
      broadcast({ t: 'fx', k: 'go' });
    } else if (e.type === 'lap') {
      const car = race.cars.find((c) => c.id === e.id);
      if (car && !car.bot) {
        toast(`${car.name} 進入第 ${e.lap} 圈（單圈 ${e.time.toFixed(2)} 秒）`, car.color);
        sfx.lap();
      }
      sendTo(e.id, { t: 'fx', k: 'lap', lap: e.lap, final: e.lap === race.laps });
      if (e.lap === race.laps && !finalLapShown) {
        finalLapShown = true;
        banner('最後一圈！');
      }
    } else if (e.type === 'finish') {
      const car = race.cars.find((c) => c.id === e.id);
      if (car) toast(`🏁 ${car.name} 第 ${e.place} 名抵達！`, car.color);
      if (e.place === 1 && car) banner(`FINISH! ${car.name}`, 'finish');
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
  const sub = (r) => (r.finished ? fmtTime(r.time) : `未完成 ${r.laps}/${S.race.laps} 圈`);
  const pod = $('podium');
  pod.innerHTML = '';
  for (const place of [2, 1, 3]) {
    const r = list[place - 1];
    if (!r) continue;
    const el = document.createElement('div');
    el.className = 'pod p' + place;
    el.style.setProperty('--pc', r.color);
    el.innerHTML = `<canvas></canvas><div class="pod-name">${esc(r.name)}</div><div class="pod-time">${sub(r)}</div><div class="pod-block"><span class="pod-no">${place}</span></div>`;
    pod.appendChild(el);
  }
  $('results-table').innerHTML = list.slice(3).map((r) => `
    <div class="res-row" style="--pc:${r.color}">
      <div class="res-place">${r.place}</div>
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

// ── 彩帶 ──
let confettiRaf = null;
function startConfetti() {
  const cv = $('confetti');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  const g = cv.getContext('2d');
  const colors = ['#ffd23f', '#ff4f5e', '#2fcf72', '#ffffff', '#8f5bff', '#ff9a1f'];
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
function stopConfetti() {
  if (confettiRaf) cancelAnimationFrame(confettiRaf);
  confettiRaf = null;
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
  b.fillStyle = '#3f9b4a';
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
function bigText(text, cls) {
  const el = $('hud-count');
  el.textContent = text;
  el.className = 'hud-count';
  void el.offsetWidth;                       // 重新觸發動畫
  el.className = 'hud-count pop ' + cls;
  clearTimeout(bigTimer);
  bigTimer = setTimeout(() => { el.textContent = ''; el.className = 'hud-count'; }, 1000);
}

let finalLapShown = false;
function banner(text, cls = '') {
  const el = $('hud-banner');
  el.querySelector('span').textContent = text;
  el.className = 'hud-banner';
  void el.offsetWidth;
  el.className = 'hud-banner show ' + cls;
}

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
