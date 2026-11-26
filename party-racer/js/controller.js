// 手機搖桿：加入房間、設定名稱/顏色/車款、比賽時當搖桿。

import { CARS, COLORS, FUN_NAMES, STAT_LABELS, carById } from './config.js';
import { joinRoom, normalizeCode, passthroughQuery } from './net.js';
import { drawShowcase, drawCarPreview } from './render.js';

const $ = (id) => document.getElementById(id);

// ── 狀態 ─────────────────────────────────────────────

const params = new URLSearchParams(location.search);
let room = normalizeCode(params.get('room'));

// cid 存在 sessionStorage：重新整理還是同一個人（可以接回位置），不同分頁則是不同玩家
let cid = sessionStorage.getItem('pr-cid');
if (!cid) {
  cid = 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  sessionStorage.setItem('pr-cid', cid);
}

const profile = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('pr-profile') || '{}'); } catch (e) { /* ignore */ }
  return {
    name: typeof saved.name === 'string' ? saved.name : '',
    color: COLORS.some((c) => c.hex === saved.color) ? saved.color : COLORS[Math.floor(Math.random() * COLORS.length)].hex,
    car: CARS.some((c) => c.id === saved.car) ? saved.car : CARS[0].id,
  };
})();
const placeholderName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];

function saveProfile() {
  try { localStorage.setItem('pr-profile', JSON.stringify(profile)); } catch (e) { /* ignore */ }
}

let net = null;
let connected = false;
let everConnected = false;
let lastMsgAt = 0;
let lobby = null;
let ready = false;
let current = null;
let results = null;
let retryTimer = null;
let retryDelay = 1000;

function show(id) {
  current = id;
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
  document.body.classList.toggle('playing', id === 'c-pad');
}

function banner(text) {
  const b = $('c-banner');
  b.textContent = text || '';
  b.classList.toggle('hidden', !text);
}

function send(msg) {
  if (net && connected) net.send(msg);
}

function vibrate(p) {
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ }
}

// ── 連線 ─────────────────────────────────────────────

function connect() {
  clearTimeout(retryTimer);
  if (!everConnected) {
    $('conn-msg').textContent = `連線到房間 ${room}…`;
    show('c-connecting');
  }
  if (net) net.close();
  net = joinRoom(room, {
    onOpen() {
      connected = true;
      everConnected = true;
      retryDelay = 1000;
      lastMsgAt = performance.now();
      banner(null);
      send({ t: 'hello', cid, name: profile.name || placeholderName, color: profile.color, car: profile.car, ready });
    },
    onMessage,
    onClose() {
      connected = false;
      scheduleRetry();
    },
    onError(kind, msg) {
      connected = false;
      if (kind === 'fatal') return fail(msg);
      if (kind === 'notfound' && !everConnected) {
        showJoin(`找不到房間「${room}」，請確認代碼是否正確`);
        return;
      }
      if (kind === 'notfound' && everConnected) {
        // 主機重新整理後會換一個新代碼，舊房間就不存在了
        retryCount++;
        if (retryCount > 6) return fail('主機的房間已關閉。如果主機重新整理過，代碼會改變，請重新掃描 QR code。');
      }
      scheduleRetry();
    },
  });
}
let retryCount = 0;

function scheduleRetry() {
  if (!everConnected) {
    $('conn-msg').textContent = '連線失敗，重試中…';
  } else {
    banner('連線中斷，重新連線中…');
  }
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(8000, retryDelay * 1.6);
}

function fail(msg) {
  clearTimeout(retryTimer);
  if (net) net.close();
  net = null;
  connected = false;
  banner(null);
  $('err-msg').textContent = msg;
  show('c-error');
}

// 主機每 2 秒會送心跳；太久沒收到就重連
setInterval(() => {
  if (connected && performance.now() - lastMsgAt > 7000) {
    connected = false;
    if (net) net.close();
    scheduleRetry();
  }
}, 1000);

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  lastMsgAt = performance.now();
  retryCount = 0;
  switch (m.t) {
    case 'welcome':
      $('s-room').textContent = room;
      if (!lobby) enterSetupOrWait();
      break;
    case 'reject':
      fail(m.msg || '無法加入房間');
      break;
    case 'lobby':
      onLobby(m);
      break;
    case 'st':
      onStatus(m);
      break;
    case 'fx':
      onFx(m);
      break;
    case 'res':
      results = m.list;
      if (lobby && lobby.phase === 'results') showResult();
      break;
    default:
      break;
  }
}

function me() {
  return lobby && lobby.players.find((p) => p.id === cid);
}

function enterSetupOrWait() {
  if (ready) showWait();
  else showSetup();
}

function onLobby(m) {
  const prevPhase = lobby && lobby.phase;
  lobby = m;
  const mine = me();
  if (mine) {
    // 主機可能因為撞色幫你換了顏色
    if (mine.color !== profile.color) { profile.color = mine.color; saveProfile(); renderSetup(); }
    ready = mine.ready;
  }
  const inRace = m.phase === 'race' && m.racers.includes(cid);
  if (inRace) {
    if (current !== 'c-pad') enterPad();
  } else if (m.phase === 'results' && m.racers.includes(cid)) {
    if (results) showResult();
  } else if (m.phase === 'lobby') {
    if (prevPhase && prevPhase !== 'lobby') { results = null; showSetup(); }
    else if (current === 'c-connecting' || current === 'c-pad' || current === 'c-result') enterSetupOrWait();
  } else if (current === 'c-connecting' || current === 'c-pad') {
    showWait();
  }
  if (current === 'c-setup') renderColors();
  if (current === 'c-wait') renderWait();
}

// ── 加入畫面 ─────────────────────────────────────────

function showJoin(err) {
  clearTimeout(retryTimer);
  if (net) net.close();
  net = null;
  everConnected = false;
  $('join-err').textContent = err || '';
  $('join-err').classList.toggle('hidden', !err);
  $('code-input').value = room || '';
  show('c-join');
  setTimeout(() => $('code-input').focus(), 50);
}

$('code-btn').onclick = () => {
  const code = normalizeCode($('code-input').value);
  if (code.length < 4) { $('join-err').textContent = '代碼是 4 個字'; $('join-err').classList.remove('hidden'); return; }
  room = code;
  const extra = passthroughQuery();
  history.replaceState(null, '', `?room=${code}` + (extra ? '&' + extra : ''));
  connect();
};
$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('code-btn').click(); });
$('code-input').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('err-btn').onclick = () => showJoin('');

// ── 設定畫面 ─────────────────────────────────────────

function showSetup() {
  show('c-setup');
  $('name-input').value = profile.name;
  $('name-input').placeholder = placeholderName;
  renderSetup();
}

function renderSetup() {
  renderColors();
  renderCars();
}

function takenColors() {
  const set = new Set();
  if (lobby) for (const p of lobby.players) if (p.id !== cid && !p.bot) set.add(p.color);
  return set;
}

function renderColors() {
  const list = $('color-list');
  const taken = takenColors();
  if (!list.children.length) {
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.className = 'color-dot';
      b.dataset.hex = c.hex;
      b.style.setProperty('--c', c.hex);
      b.setAttribute('aria-label', c.name);
      b.onclick = () => {
        if (b.disabled) return;
        profile.color = c.hex;
        saveProfile();
        sendProfile();
        renderSetup();
      };
      list.appendChild(b);
    }
  }
  for (const b of list.children) {
    const t = taken.has(b.dataset.hex);
    b.disabled = t;
    b.classList.toggle('taken', t);
    b.classList.toggle('selected', b.dataset.hex === profile.color);
  }
  document.documentElement.style.setProperty('--me', profile.color);
}

// 車庫：大展示台 + 左右切換（也可以左右滑）+ 下方縮圖
function selectCar(id) {
  if (profile.car === id) return;
  profile.car = id;
  saveProfile();
  sendProfile();
  renderCars();
}

function stepCar(d) {
  const i = CARS.findIndex((c) => c.id === profile.car);
  selectCar(CARS[(i + d + CARS.length) % CARS.length].id);
  spin = -0.6;
}

function renderCars() {
  const list = $('car-list');
  if (!list.children.length) {
    for (const car of CARS) {
      const b = document.createElement('button');
      b.className = 'car-card';
      b.dataset.id = car.id;
      b.innerHTML = `<canvas></canvas><span>${car.name}</span>`;
      b.onclick = () => { selectCar(car.id); spin = -0.6; };
      list.appendChild(b);
    }
  }
  const car = carById(profile.car);
  $('car-name').textContent = car.name;
  $('car-type').textContent = car.type;
  $('car-desc').textContent = car.desc;
  $('car-stats').innerHTML = Object.entries(car.stats).map(([k, v]) =>
    `<div class="stat"><span>${STAT_LABELS[k]}</span><div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('');
  requestAnimationFrame(() => {
    for (const b of list.children) {
      const c = carById(b.dataset.id);
      b.classList.toggle('selected', c.id === profile.car);
      drawCarPreview(b.querySelector('canvas'), c.shape, profile.color, { angle: -Math.PI / 2, scale: 0.8 });
    }
  });
}

$('car-prev').onclick = () => stepCar(-1);
$('car-next').onclick = () => stepCar(1);
{
  let sx = null;
  const sc = $('showcase');
  sc.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  sc.addEventListener('pointerup', (e) => {
    if (sx != null && Math.abs(e.clientX - sx) > 40) stepCar(e.clientX < sx ? 1 : -1);
    sx = null;
  });
  sc.addEventListener('pointercancel', () => { sx = null; });
}

// 展示台慢慢旋轉（只在車庫和等待畫面跑，比賽時不耗電）
let spin = -0.6;
let spinLast = 0;
function spinLoop(now) {
  const dt = Math.min(0.05, (now - spinLast) / 1000 || 0);
  spinLast = now;
  if (current === 'c-setup' || current === 'c-wait') {
    spin += dt * 0.9;
    const car = carById(profile.car);
    if (current === 'c-setup') drawShowcase($('showcase'), car.shape, profile.color, spin);
    else drawShowcase($('wait-car'), car.shape, profile.color, spin);
  }
  requestAnimationFrame(spinLoop);
}
requestAnimationFrame(spinLoop);

let nameTimer = null;
$('name-input').addEventListener('input', (e) => {
  profile.name = Array.from(e.target.value).slice(0, 10).join('');
  saveProfile();
  clearTimeout(nameTimer);
  nameTimer = setTimeout(sendProfile, 300);
});
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

function sendProfile() {
  send({ t: 'prof', name: profile.name || placeholderName, color: profile.color, car: profile.car });
}

$('ready-btn').onclick = () => {
  if (!profile.name.trim()) { profile.name = placeholderName; saveProfile(); }
  sendProfile();
  ready = true;
  send({ t: 'ready', v: true });
  goFullscreen();
  keepAwake();
  showWait();
};

$('edit-btn').onclick = () => {
  ready = false;
  send({ t: 'ready', v: false });
  showSetup();
};

// ── 等待畫面 ─────────────────────────────────────────

function showWait() {
  show('c-wait');
  renderWait();
}

function renderWait() {
  const mine = me();
  const name = (mine && mine.name) || profile.name || placeholderName;
  const car = carById(profile.car);
  $('wait-name').textContent = name;
  $('wait-car-name').textContent = `${car.name} · ${car.type}`;
  document.documentElement.style.setProperty('--me', profile.color);
  $('w-room').textContent = room;
  const racing = lobby && lobby.phase !== 'lobby' && !lobby.racers.includes(cid);
  $('ready-stamp').classList.toggle('hidden', !!racing);
  $('wait-msg').textContent = racing ? '比賽進行中，下一場就能加入！' : '等待主機開始比賽…';
  $('edit-btn').classList.toggle('hidden', !!racing);
  $('wait-players').innerHTML = lobby ? lobby.players.map((p) =>
    `<span class="mini" style="--pc:${p.color}" title="${p.bot ? '電腦' : ''}">${escapeHtml(p.name)}${p.ready && !p.bot ? ' ✓' : ''}</span>`).join('') : '';
}

const ORD = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 搖桿 ─────────────────────────────────────────────

const input = { s: 0, g: 0, b: 0, n: 0 };
let lastSent = 0;

function setInput(k, v) {
  if (input[k] === v) return;
  input[k] = v;
  flushInput();
}

function flushInput() {
  lastSent = performance.now();
  send({ t: 'in', s: input.s, g: input.g, b: input.b, n: input.n });
}

// 比賽中每 200ms 補送一次目前狀態（也當作心跳）；其他時候每 2 秒 ping 一下
setInterval(() => {
  const gap = current === 'c-pad' ? 200 : 2000;
  if (connected && performance.now() - lastSent >= gap) {
    if (current === 'c-pad') flushInput();
    else { lastSent = performance.now(); send({ t: 'ping' }); }
  }
}, 100);

function enterPad() {
  for (const k of Object.keys(input)) input[k] = 0;
  releaseAll();
  $('pad-pos').textContent = '–';
  $('pad-pos').className = 'pad-pos';
  $('pad-lap').textContent = 'LAP –';
  $('pad-name').textContent = (me() && me().name) || profile.name || placeholderName;
  $('pad-speed').textContent = '0';
  $('speedo-val').setAttribute('stroke-dasharray', '0 100');
  $('pad-msg').textContent = '準備…';
  $('pad-msg').className = 'pad-msg';
  document.documentElement.style.setProperty('--me', profile.color);
  show('c-pad');
  keepAwake();
}

// 方向區：手指在左半邊=左轉、右半邊=右轉，可以直接滑過去換邊
const steerEl = $('steer');
const steerTouches = new Map();
function steerDir(x) {
  const r = steerEl.getBoundingClientRect();
  return x < r.left + r.width / 2 ? -1 : 1;
}
function updateSteer() {
  const vals = [...steerTouches.values()];
  const s = vals.length ? vals[vals.length - 1] : 0;
  for (const h of steerEl.children) h.classList.toggle('active', +h.dataset.dir === s);
  if (s !== input.s && s !== 0) vibrate(8);
  setInput('s', s);
}
steerEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { steerEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  steerTouches.delete(e.pointerId);
  steerTouches.set(e.pointerId, steerDir(e.clientX));
  updateSteer();
});
steerEl.addEventListener('pointermove', (e) => {
  if (!steerTouches.has(e.pointerId)) return;
  const d = steerDir(e.clientX);
  if (steerTouches.get(e.pointerId) !== d) { steerTouches.set(e.pointerId, d); updateSteer(); }
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  steerEl.addEventListener(ev, (e) => {
    if (steerTouches.delete(e.pointerId)) updateSteer();
  });
}

const holdButtons = [];
function bindHold(el, key) {
  const touches = new Set();
  const refresh = () => {
    el.classList.toggle('active', touches.size > 0);
    setInput(key, touches.size > 0 ? 1 : 0);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    touches.add(e.pointerId);
    refresh();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.addEventListener(ev, (e) => { if (touches.delete(e.pointerId)) refresh(); });
  }
  holdButtons.push({ el, touches, refresh });
}
bindHold($('btn-gas'), 'g');
bindHold($('btn-brake'), 'b');
bindHold($('btn-nitro'), 'n');

function releaseAll() {
  steerTouches.clear();
  for (const h of steerEl.children) h.classList.remove('active');
  for (const b of holdButtons) { b.touches.clear(); b.el.classList.remove('active'); }
}

// 長按不要跳出選單、不要選取文字
document.addEventListener('contextmenu', (e) => { if (current === 'c-pad') e.preventDefault(); });
document.addEventListener('touchmove', (e) => { if (current === 'c-pad') e.preventDefault(); }, { passive: false });
// 切到背景時放開所有按鍵，免得車子一直衝
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    releaseAll();
    for (const k of Object.keys(input)) input[k] = 0;
    flushInput();
  } else {
    keepAwake();
  }
});

// 電腦鍵盤也能玩（方便測試）：方向鍵/WASD、空白鍵=氮氣
const keyMap = { ArrowLeft: 's-', KeyA: 's-', ArrowRight: 's+', KeyD: 's+', ArrowUp: 'g', KeyW: 'g', ArrowDown: 'b', KeyS: 'b', Space: 'n', ShiftLeft: 'n' };
const keysDown = new Set();
function applyKeys() {
  const l = [...keysDown].some((k) => keyMap[k] === 's-');
  const r = [...keysDown].some((k) => keyMap[k] === 's+');
  setInput('s', l === r ? 0 : l ? -1 : 1);
  for (const k of ['g', 'b', 'n']) setInput(k, [...keysDown].some((c) => keyMap[c] === k) ? 1 : 0);
}
addEventListener('keydown', (e) => {
  if (current !== 'c-pad' || !keyMap[e.code]) return;
  e.preventDefault();
  keysDown.add(e.code);
  applyKeys();
});
addEventListener('keyup', (e) => {
  if (!keyMap[e.code]) return;
  keysDown.delete(e.code);
  if (current === 'c-pad') applyKeys();
});

function onStatus(m) {
  if (current !== 'c-pad') return;
  const pos = $('pad-pos');
  pos.innerHTML = `${m.p}<sup>${ORD(m.p)}</sup><small>/${m.n}</small>`;
  pos.className = 'pad-pos' + (m.p <= 3 ? ' p' + m.p : '');
  $('pad-lap').textContent = m.f ? 'GOAL!' : `LAP ${m.l}/${m.L}`;
  const kmh = Math.round((m.sp || 0) * 0.72);
  $('pad-speed').textContent = kmh;
  $('speedo-val').setAttribute('stroke-dasharray', `${Math.min(100, (kmh / 260) * 100).toFixed(1)} 100`);
  const nb = $('btn-nitro');
  nb.style.setProperty('--charge', m.ni);
  nb.classList.toggle('full', m.ni >= 0.99 && !m.bo);
  nb.classList.toggle('boosting', !!m.bo);
  const msg = $('pad-msg');
  if (m.ph === 'count') { msg.textContent = m.c > 0 ? String(m.c) : ''; msg.className = 'pad-msg count'; }
  else if (m.f) { msg.textContent = `🏁 第 ${m.f} 名`; msg.className = 'pad-msg done'; }
  else if (m.w) { msg.textContent = '⚠ 逆向了！回頭'; msg.className = 'pad-msg warn'; }
  else if (msg.classList.contains('count') || msg.classList.contains('warn')) { msg.textContent = ''; msg.className = 'pad-msg'; }
}

// 跳一下就消失的訊息（GO!、圈數）
function flashMsg(text) {
  const msg = $('pad-msg');
  msg.textContent = text;
  msg.className = 'pad-msg';
  void msg.offsetWidth;
  msg.className = 'pad-msg go';
}

function onFx(m) {
  if (m.k === 'count') vibrate(40);
  else if (m.k === 'go') {
    vibrate(150);
    if (current === 'c-pad') flashMsg('GO!');
  } else if (m.k === 'bump') vibrate(Math.min(80, 15 + (m.p || 0) / 4));
  else if (m.k === 'lap') {
    vibrate([40, 40, 40]);
    if (current === 'c-pad' && !$('pad-msg').classList.contains('warn')) flashMsg(m.final ? '最後一圈！' : `LAP ${m.lap}`);
  }
  else if (m.k === 'finish') vibrate([100, 60, 100, 60, 200]);
}

// ── 結果 ─────────────────────────────────────────────

function showResult() {
  releaseAll();
  for (const k of Object.keys(input)) input[k] = 0;
  const mine = results && results.find((r) => r.id === cid);
  const rp = $('r-place');
  if (mine) {
    rp.innerHTML = `${mine.place}<sup>${ORD(mine.place)}</sup>`;
    rp.className = 'r-place' + (mine.place <= 3 ? ' p' + mine.place : '');
    $('r-sub').textContent = mine.finished ? `完成時間 ${mine.time.toFixed(2)} 秒` : '沒能在時間內完成';
  } else {
    rp.textContent = 'FINISH';
    rp.className = 'r-place';
    $('r-sub').textContent = '';
  }
  $('r-list').innerHTML = (results || []).map((r) =>
    `<div class="r-row${r.id === cid ? ' me' : ''}" style="--pc:${r.color}"><b>${r.place}</b><i></i><span>${escapeHtml(r.name)}</span><em>${r.finished ? r.time.toFixed(2) + 's' : '—'}</em></div>`).join('');
  show('c-result');
}

// ── 其他 ─────────────────────────────────────────────

function goFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* ignore */ }
}

// ── 開始 ─────────────────────────────────────────────

if (room.length === 4) connect();
else showJoin('');

window.__pad = { get state() { return { current, connected, ready, lobby, profile, cid }; } };
