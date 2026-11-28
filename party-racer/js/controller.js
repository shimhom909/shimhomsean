// 手機搖桿：加入房間、角色設定、選車／選武器，比賽時當搖桿（賽車按鍵或射擊雙搖桿）。

import { CARS, COLORS, FUN_NAMES, STAT_LABELS, carById, trackById } from './config.js';
import { WEAPONS, WEAPON_STAT_LABELS, weaponById, arenaById, POWERS } from './brawl.js';
import { joinRoom, normalizeCode, passthroughQuery } from './net.js';
import { drawShowcase, drawCarPreview } from './render.js';
import { drawFighter, drawWeaponIcon } from './brawl-render.js';
import { CHARACTERS, charaById, isChara, randomChara, charaImg, charaImage } from './characters.js';

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
    weapon: WEAPONS.some((w) => w.id === saved.weapon) ? saved.weapon : WEAPONS[0].id,
    chara: isChara(saved.chara) ? saved.chara : randomChara(),
  };
})();
const placeholderName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];

function saveProfile() {
  try { localStorage.setItem('pr-profile', JSON.stringify(profile)); } catch (e) { /* ignore */ }
}

let game = 'racer';            // 主機在玩哪個遊戲：racer 或 brawl
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
let retryCount = 0;

const PADS = ['c-pad', 'c-brawl'];
const inPad = () => PADS.includes(current);

function show(id) {
  current = id;
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
  document.body.classList.toggle('playing', PADS.includes(id));
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ORD = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

// ── 連線 ─────────────────────────────────────────────

function profileMsg() {
  return { name: profile.name || placeholderName, color: profile.color, car: profile.car, weapon: profile.weapon, chara: profile.chara };
}

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
      send({ t: 'hello', cid, ready, ...profileMsg() });
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

function scheduleRetry() {
  if (!everConnected) $('conn-msg').textContent = '連線失敗，重試中…';
  else banner('連線中斷，重新連線中…');
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

function setGame(g) {
  if (g !== 'racer' && g !== 'brawl') return;
  const changed = g !== game;
  game = g;
  const brawl = g === 'brawl';
  $('game-name').textContent = brawl ? '彩彈大亂鬥' : '派對賽車';
  $('game-flag').className = brawl ? 'flag paint' : 'flag';
  $('tab-gear').textContent = brawl ? '武器庫' : '車庫';
  $('garage').classList.toggle('hidden', brawl);
  $('armory').classList.toggle('hidden', !brawl);
  if (changed && current === 'c-setup') renderGear();
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  lastMsgAt = performance.now();
  retryCount = 0;
  switch (m.t) {
    case 'welcome':
      setGame(m.game || 'racer');
      $('s-room').textContent = room;
      if (!lobby) enterSetupOrWait();
      break;
    case 'reject':
      fail(m.msg || '無法加入房間');
      break;
    case 'lobby':
      if (m.game) setGame(m.game);
      onLobby(m);
      break;
    case 'st':
      if (m.g === 'brawl') onBrawlStatus(m);
      else onRaceStatus(m);
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
    if (mine.color !== profile.color) { profile.color = mine.color; saveProfile(); if (current === 'c-setup') renderSetup(); }
    ready = mine.ready;
  }
  const playing = m.phase === 'play' && m.racers.includes(cid);
  if (playing) {
    if (!inPad()) enterPad();
  } else if (m.phase === 'results' && m.racers.includes(cid)) {
    if (results) showResult();
  } else if (m.phase === 'lobby') {
    if (prevPhase && prevPhase !== 'lobby') { results = null; showSetup(); }
    else if (current === 'c-connecting' || inPad() || current === 'c-result') enterSetupOrWait();
  } else if (current === 'c-connecting' || inPad()) {
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

// ── 設定畫面：分頁 ───────────────────────────────────

let tab = 'chara';
for (const t of document.querySelectorAll('.tab')) {
  t.onclick = () => { tab = t.dataset.tab; renderTabs(); };
}
function renderTabs() {
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('selected', t.dataset.tab === tab);
  $('pane-chara').classList.toggle('hidden', tab !== 'chara');
  $('pane-gear').classList.toggle('hidden', tab !== 'gear');
  if (tab === 'gear') renderGear();
}

function showSetup() {
  show('c-setup');
  $('name-input').value = profile.name;
  $('name-input').placeholder = placeholderName;
  renderTabs();
  renderSetup();
}

function renderSetup() {
  renderColors();
  renderChara();
  renderGear();
}

function renderGear() {
  if (game === 'brawl') renderWeapons();
  else renderCars();
}

function sendProfile() {
  send({ t: 'prof', ...profileMsg() });
}

function changed() {
  saveProfile();
  sendProfile();
}

// ── 角色設定 ─────────────────────────────────────────

// 六個角色：上方大立繪（可以左右滑或按箭頭切換），下方六格縮圖
function selectChara(id) {
  if (profile.chara === id) return;
  profile.chara = id;
  changed();
  renderChara();
  vibrate(12);
}

function stepChara(d) {
  const i = CHARACTERS.findIndex((c) => c.id === profile.chara);
  selectChara(CHARACTERS[(i + d + CHARACTERS.length) % CHARACTERS.length].id);
}

let charaShown = '';
function renderChara() {
  const list = $('chara-list');
  if (!list.children.length) {
    for (const c of CHARACTERS) {
      const b = document.createElement('button');
      b.className = 'chara-card';
      b.dataset.id = c.id;
      b.style.setProperty('--cc', c.color);
      b.innerHTML = `<span class="chara-card-name">${c.name}</span><span class="chara-thumb">${charaImg(c.id, 'sprite')}</span>`;
      b.onclick = () => selectChara(c.id);
      list.appendChild(b);
    }
  }
  for (const b of list.children) b.classList.toggle('selected', b.dataset.id === profile.chara);
  const c = charaById(profile.chara);
  if (charaShown !== c.id) {
    charaShown = c.id;
    $('chara-art').innerHTML = charaImg(c.id, 'art');
    $('chara-art').closest('.chara-stage').style.setProperty('--cc', c.color);
    $('chara-name').textContent = c.name;
    $('chara-desc').textContent = c.desc;
  }
}

$('chara-prev').onclick = () => stepChara(-1);
$('chara-next').onclick = () => stepChara(1);

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
        changed();
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

let nameTimer = null;
$('name-input').addEventListener('input', (e) => {
  profile.name = Array.from(e.target.value).slice(0, 10).join('');
  saveProfile();
  clearTimeout(nameTimer);
  nameTimer = setTimeout(sendProfile, 300);
});
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// ── 車庫（賽車） ─────────────────────────────────────

function selectCar(id) {
  if (profile.car === id) return;
  profile.car = id;
  changed();
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
  $('car-stats').innerHTML = statBars(car.stats, STAT_LABELS);
  requestAnimationFrame(() => {
    for (const b of list.children) {
      const c = carById(b.dataset.id);
      b.classList.toggle('selected', c.id === profile.car);
      drawCarPreview(b.querySelector('canvas'), c.shape, profile.color, { angle: -Math.PI / 2, scale: 0.8 });
    }
  });
}

function statBars(stats, labels) {
  return Object.entries(stats).map(([k, v]) =>
    `<div class="stat"><span>${labels[k]}</span><div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('');
}

$('car-prev').onclick = () => stepCar(-1);
$('car-next').onclick = () => stepCar(1);

// 在展示區左右滑動＝換下一個
function swipe(el, fn) {
  let sx = null;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  el.addEventListener('pointerup', (e) => {
    if (sx != null && Math.abs(e.clientX - sx) > 40) fn(e.clientX < sx ? 1 : -1);
    sx = null;
  });
  el.addEventListener('pointercancel', () => { sx = null; });
}
swipe($('showcase'), stepCar);
swipe($('chara-art'), stepChara);

// ── 武器庫（彩彈大亂鬥） ─────────────────────────────

function selectWeapon(id) {
  if (profile.weapon === id) return;
  profile.weapon = id;
  changed();
  renderWeapons();
}

function stepWeapon(d) {
  const i = WEAPONS.findIndex((w) => w.id === profile.weapon);
  selectWeapon(WEAPONS[(i + d + WEAPONS.length) % WEAPONS.length].id);
}

function renderWeapons() {
  const list = $('wpn-list');
  if (!list.children.length) {
    for (const w of WEAPONS) {
      const b = document.createElement('button');
      b.className = 'car-card';
      b.dataset.id = w.id;
      b.innerHTML = `<canvas></canvas><span>${w.name}</span>`;
      b.onclick = () => selectWeapon(w.id);
      list.appendChild(b);
    }
  }
  const w = weaponById(profile.weapon);
  $('wpn-name').textContent = w.name;
  $('wpn-type').textContent = w.type;
  $('wpn-desc').textContent = w.desc;
  $('wpn-stats').innerHTML = statBars(w.stats, WEAPON_STAT_LABELS);
  requestAnimationFrame(() => {
    for (const b of list.children) {
      b.classList.toggle('selected', b.dataset.id === profile.weapon);
      drawWeaponIcon(b.querySelector('canvas'), b.dataset.id, profile.color);
    }
  });
}

$('wpn-prev').onclick = () => stepWeapon(-1);
$('wpn-next').onclick = () => stepWeapon(1);
swipe($('wpn-showcase'), stepWeapon);

// 武器庫展示：自己的 Q 版角色拿著武器，左右瞄準、射出彩彈
function drawArmory(canvas, t) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const k = (h / 100) * dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const W = w * dpr / k;
  const wp = weaponById(profile.weapon);
  const aim = Math.sin(t * 1.3) * 0.35;
  const p = { x: W * 0.32, y: 84, aim, color: profile.color, chara: profile.chara, weapon: wp, vx: 0, vy: 0, dashT: 0, protectUntil: 0, shield: 0 };
  // 飛出去的彩彈
  const span = W * 0.62;
  for (let i = 0; i < 4; i++) {
    const age = (t * 240 / Math.max(0.6, wp.rate * 3) + i * span / 4) % span;
    for (let k2 = 0; k2 < wp.pellets; k2++) {
      const a = aim + (wp.pellets > 1 ? (k2 / (wp.pellets - 1) - 0.5) * wp.spread : 0);
      const x = p.x + Math.cos(a) * (40 + age), y = p.y - 8 + Math.sin(a) * (40 + age);
      if (x > W - 6) continue;
      ctx.fillStyle = profile.color;
      ctx.strokeStyle = '#17244a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, wp.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  drawFighter(ctx, p, t);
}

// 車庫展示台旋轉、武器庫動畫（只在設定畫面跑，比賽時不耗電）
let spin = -0.6;
let animLast = 0;
function animLoop(now) {
  const dt = Math.min(0.05, (now - animLast) / 1000 || 0);
  animLast = now;
  if (current === 'c-setup' && tab === 'gear') {
    spin += dt * 0.9;
    if (game === 'brawl') drawArmory($('wpn-showcase'), now / 1000);
    else drawShowcase($('showcase'), carById(profile.car).shape, profile.color, spin, { face: charaImage(profile.chara, 'face') });
  }
  requestAnimationFrame(animLoop);
}
requestAnimationFrame(animLoop);

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

let waitKey = '';
function renderWait() {
  const mine = me();
  const name = (mine && mine.name) || profile.name || placeholderName;
  $('wait-name').textContent = name;
  if (game === 'brawl') {
    const w = weaponById(profile.weapon);
    $('wait-car-name').textContent = `${w.name} · ${w.type}`;
  } else {
    const car = carById(profile.car);
    $('wait-car-name').textContent = `${car.name} · ${car.type}`;
  }
  if (profile.chara !== waitKey) { waitKey = profile.chara; $('wait-art').innerHTML = charaImg(profile.chara, 'art'); }
  document.documentElement.style.setProperty('--me', profile.color);
  $('w-room').textContent = room;
  const wt = $('wait-track');
  if (lobby && game === 'brawl' && lobby.arena) {
    wt.innerHTML = `下一場　<b>${escapeHtml(arenaById(lobby.arena).name)}</b>・${lobby.minutes} 分鐘`;
    wt.classList.remove('hidden');
  } else if (lobby && lobby.track) {
    wt.innerHTML = `下一場　<b>${escapeHtml(trackById(lobby.track).name)}</b>・${lobby.laps} 圈`;
    wt.classList.remove('hidden');
  }
  const racing = lobby && lobby.phase !== 'lobby' && !lobby.racers.includes(cid);
  $('ready-stamp').classList.toggle('hidden', !!racing);
  $('wait-msg').textContent = racing ? '比賽進行中，下一場就能加入！' : '等待主機開始比賽…';
  $('edit-btn').classList.toggle('hidden', !!racing);
  $('wait-players').innerHTML = lobby ? lobby.players.map((p) =>
    `<span class="mini" style="--pc:${p.color}">${escapeHtml(p.name)}${p.ready && !p.bot ? ' ✓' : ''}</span>`).join('') : '';
}

// ── 搖桿（共用） ─────────────────────────────────────

function enterPad() {
  releaseAll();
  document.documentElement.style.setProperty('--me', profile.color);
  const name = (me() && me().name) || profile.name || placeholderName;
  if (game === 'brawl') {
    for (const k of Object.keys(bin)) bin[k] = 0;
    $('b-name').textContent = name;
    $('b-face').innerHTML = charaImg(profile.chara, 'face');
    $('b-rank').textContent = '–';
    $('b-msg').textContent = '準備…';
    $('b-msg').className = 'pad-msg';
    $('b-dead').classList.add('hidden');
    show('c-brawl');
  } else {
    for (const k of Object.keys(input)) input[k] = 0;
    $('pad-pos').textContent = '–';
    $('pad-pos').className = 'pad-pos';
    $('pad-lap').textContent = 'LAP –';
    $('pad-name').textContent = name;
    $('pad-speed').textContent = '0';
    $('speedo-val').setAttribute('stroke-dasharray', '0 100');
    $('pad-msg').textContent = '準備…';
    $('pad-msg').className = 'pad-msg';
    show('c-pad');
  }
  keepAwake();
}

// 比賽中每 200ms 補送一次目前狀態（也當作心跳）；其他時候每 2 秒 ping 一下
let lastSent = 0;
setInterval(() => {
  const gap = inPad() ? 200 : 2000;
  if (connected && performance.now() - lastSent >= gap) {
    if (current === 'c-pad') flushInput();
    else if (current === 'c-brawl') flushBrawl();
    else { lastSent = performance.now(); send({ t: 'ping' }); }
  }
}, 100);

function releaseAll() {
  steerTouches.clear();
  for (const h of steerEl.children) h.classList.remove('active');
  for (const b of holdButtons) { b.touches.clear(); b.el.classList.remove('active'); }
  for (const s of sticks) s.reset();
  $('btn-dash').classList.remove('active');
}

// 長按不要跳出選單、不要選取文字
document.addEventListener('contextmenu', (e) => { if (inPad()) e.preventDefault(); });
document.addEventListener('touchmove', (e) => { if (inPad()) e.preventDefault(); }, { passive: false });
// 切到背景時放開所有按鍵，免得角色一直衝
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    releaseAll();
    for (const k of Object.keys(input)) input[k] = 0;
    for (const k of Object.keys(bin)) bin[k] = 0;
    if (current === 'c-pad') flushInput();
    if (current === 'c-brawl') flushBrawl();
  } else {
    keepAwake();
  }
});

// 跳一下就消失的訊息（GO!、圈數、擊倒）
function flashMsg(text, id = 'pad-msg') {
  const msg = $(id);
  msg.textContent = text;
  msg.className = 'pad-msg';
  void msg.offsetWidth;
  msg.className = 'pad-msg go';
}

// ── 賽車搖桿 ─────────────────────────────────────────

const input = { s: 0, g: 0, b: 0, n: 0 };

function setInput(k, v) {
  if (input[k] === v) return;
  input[k] = v;
  flushInput();
}

function flushInput() {
  lastSent = performance.now();
  send({ t: 'in', s: input.s, g: input.g, b: input.b, n: input.n });
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
  steerEl.addEventListener(ev, (e) => { if (steerTouches.delete(e.pointerId)) updateSteer(); });
}

const holdButtons = [];
function bindHold(el, onChange) {
  const touches = new Set();
  const refresh = () => {
    el.classList.toggle('active', touches.size > 0);
    onChange(touches.size > 0 ? 1 : 0);
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
bindHold($('btn-gas'), (v) => setInput('g', v));
bindHold($('btn-brake'), (v) => setInput('b', v));
bindHold($('btn-nitro'), (v) => setInput('n', v));

function onRaceStatus(m) {
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

// ── 射擊雙搖桿 ───────────────────────────────────────

const bin = { mx: 0, my: 0, ax: 0, ay: 0, d: 0 };
let brawlTimer = null;
let brawlSentAt = 0;

function flushBrawl() {
  clearTimeout(brawlTimer);
  brawlTimer = null;
  lastSent = brawlSentAt = performance.now();
  const r = (v) => Math.round(v * 100) / 100;
  send({ t: 'in', mx: r(bin.mx), my: r(bin.my), ax: r(bin.ax), ay: r(bin.ay), d: bin.d });
}

// 搖桿一直在動，最多每 40ms 送一次，最後一次一定會送到
function queueBrawl(now = false) {
  if (now || performance.now() - brawlSentAt >= 40) flushBrawl();
  else if (!brawlTimer) brawlTimer = setTimeout(flushBrawl, 40);
}

// 浮動搖桿：手指放哪裡，搖桿中心就在哪裡
const sticks = [];
function makeStick(zone, onMove) {
  const base = zone.querySelector('.stick-base');
  const knob = zone.querySelector('.stick-knob');
  let pid = null, cx = 0, cy = 0;
  const reset = () => {
    pid = null;
    zone.classList.remove('active');
    base.style.left = ''; base.style.top = '';
    knob.style.transform = '';
    onMove(0, 0, true);
  };
  const move = (e) => {
    const R = base.offsetWidth * 0.42;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / R, dy / R, false);
  };
  zone.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    try { zone.setPointerCapture(pid); } catch (err) { /* ignore */ }
    const r = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    base.style.left = `${cx - r.left}px`;
    base.style.top = `${cy - r.top}px`;
    zone.classList.add('active');
    move(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(ev, (e) => { if (e.pointerId === pid) reset(); });
  }
  const s = { reset };
  sticks.push(s);
  return s;
}
makeStick($('stick-move'), (x, y, end) => { bin.mx = x; bin.my = y; queueBrawl(end); });
makeStick($('stick-aim'), (x, y, end) => { bin.ax = x; bin.ay = y; queueBrawl(end); });
bindHold($('btn-dash'), (v) => { if (bin.d !== v) { bin.d = v; if (v) vibrate(10); queueBrawl(true); } });

function onBrawlStatus(m) {
  if (current !== 'c-brawl') return;
  const rk = $('b-rank');
  rk.innerHTML = `${m.rk}<sup>${ORD(m.rk)}</sup><small>/${m.n}</small>`;
  rk.className = 'pad-pos small' + (m.rk <= 3 ? ' p' + m.rk : '');
  $('b-hp').style.width = `${m.hp}%`;
  $('b-hp').className = m.hp > 60 ? '' : m.hp > 30 ? 'mid' : 'low';
  $('b-sh').style.width = `${Math.min(100, m.sh * 2)}%`;
  $('b-hp-num').textContent = m.hp;
  $('b-ko').textContent = m.ko;
  $('b-de').textContent = m.de;
  $('b-time').textContent = `${Math.floor(m.tl / 60)}:${String(m.tl % 60).padStart(2, '0')}`;
  $('b-time').classList.toggle('urgent', m.ph === 'run' && m.tl <= 10);
  $('btn-dash').style.setProperty('--charge', 1 - m.dash);
  $('btn-dash').classList.toggle('full', m.dash <= 0);
  $('b-buffs').innerHTML = (m.rapid ? `<span style="--pc:${POWERS.rapid.color}">連射加速</span>` : '') + (m.speed ? `<span style="--pc:${POWERS.speed.color}">加速鞋</span>` : '') +
    (m.sh > 0 ? `<span style="--pc:${POWERS.shield.color}">護盾</span>` : '');
  const dead = $('b-dead');
  dead.classList.toggle('hidden', !m.dead);
  if (m.dead) $('b-dead-num').textContent = m.dead;
  const msg = $('b-msg');
  if (m.ph === 'count') { msg.textContent = m.c > 0 ? String(m.c) : ''; msg.className = 'pad-msg count'; }
  else if (msg.classList.contains('count')) { msg.textContent = ''; msg.className = 'pad-msg'; }
}

// 電腦鍵盤也能玩（方便測試）
// 賽車：方向鍵／WASD、空白鍵＝氮氣；射擊：WASD 移動、方向鍵瞄準射擊、空白鍵衝刺
const keysDown = new Set();
function applyKeys() {
  const k = (...c) => c.some((x) => keysDown.has(x));
  if (current === 'c-pad') {
    const l = k('ArrowLeft', 'KeyA'), r = k('ArrowRight', 'KeyD');
    setInput('s', l === r ? 0 : l ? -1 : 1);
    setInput('g', k('ArrowUp', 'KeyW') ? 1 : 0);
    setInput('b', k('ArrowDown', 'KeyS') ? 1 : 0);
    setInput('n', k('Space', 'ShiftLeft') ? 1 : 0);
  } else if (current === 'c-brawl') {
    bin.mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    bin.my = (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);
    bin.ax = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0);
    bin.ay = (k('ArrowDown') ? 1 : 0) - (k('ArrowUp') ? 1 : 0);
    bin.d = k('Space') ? 1 : 0;
    queueBrawl(true);
  }
}
const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'ShiftLeft']);
addEventListener('keydown', (e) => {
  if (!inPad() || !KEYS.has(e.code)) return;
  e.preventDefault();
  keysDown.add(e.code);
  applyKeys();
});
addEventListener('keyup', (e) => {
  if (!KEYS.has(e.code)) return;
  keysDown.delete(e.code);
  if (inPad()) applyKeys();
});

// ── 震動與提示 ───────────────────────────────────────

function onFx(m) {
  const msgId = current === 'c-brawl' ? 'b-msg' : 'pad-msg';
  switch (m.k) {
    case 'count': vibrate(40); break;
    case 'go':
      vibrate(150);
      if (inPad()) flashMsg(game === 'brawl' ? '開打！' : 'GO!', msgId);
      break;
    case 'bump': vibrate(Math.min(80, 15 + (m.p || 0) / 4)); break;
    case 'lap':
      vibrate([40, 40, 40]);
      if (current === 'c-pad' && !$('pad-msg').classList.contains('warn')) flashMsg(m.final ? '最後一圈！' : `LAP ${m.lap}`);
      break;
    case 'finish': vibrate([100, 60, 100, 60, 200]); break;
    case 'hit':
      vibrate(25);
      if (current === 'c-brawl') { const bar = $('c-brawl'); bar.classList.remove('hurt'); void bar.offsetWidth; bar.classList.add('hurt'); }
      break;
    case 'ko':
      vibrate([30, 30, 60]);
      if (current === 'c-brawl') flashMsg(`擊倒 ${m.name}！`, 'b-msg');
      break;
    case 'down':
      vibrate([200, 80, 200]);
      $('b-dead-by').textContent = m.name ? `被 ${m.name} 擊倒` : '';
      break;
    case 'power':
      vibrate(30);
      if (current === 'c-brawl') flashMsg(`${POWERS[m.kind] ? POWERS[m.kind].name : ''}！`, 'b-msg');
      break;
    default: break;
  }
}

// ── 結果 ─────────────────────────────────────────────

function showResult() {
  releaseAll();
  for (const k of Object.keys(input)) input[k] = 0;
  for (const k of Object.keys(bin)) bin[k] = 0;
  const mine = results && results.find((r) => r.id === cid);
  const rp = $('r-place');
  $('r-art').innerHTML = charaImg(profile.chara, 'art');
  if (mine) {
    rp.innerHTML = `${mine.place}<sup>${ORD(mine.place)}</sup>`;
    rp.className = 'r-place' + (mine.place <= 3 ? ' p' + mine.place : '');
    if (game === 'brawl') $('r-sub').textContent = `擊倒 ${mine.ko}・被擊倒 ${mine.deaths}`;
    else $('r-sub').textContent = mine.finished ? `完成時間 ${mine.time.toFixed(2)} 秒` : '沒能在時間內完成';
  } else {
    rp.textContent = 'FINISH';
    rp.className = 'r-place';
    $('r-sub').textContent = '';
  }
  const tail = (r) => (game === 'brawl' ? `★ ${r.ko}` : r.finished ? r.time.toFixed(2) + 's' : '—');
  $('r-list').innerHTML = (results || []).map((r) =>
    `<div class="r-row${r.id === cid ? ' me' : ''}" style="--pc:${r.color}"><b>${r.place}</b><i></i><span>${escapeHtml(r.name)}</span><em>${tail(r)}</em></div>`).join('');
  show('c-result');
}

// ── 其他 ─────────────────────────────────────────────

// 手機當搖桿用，不需要縮放：iOS Safari 會無視 user-scalable=no，兩指一碰畫面就被放大、按鈕跑掉
// （連點兩下放大由 CSS 的 touch-action: manipulation 擋掉，不影響按鈕連點）
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

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

window.__pad = { get state() { return { current, connected, ready, lobby, profile, cid, game }; } };
