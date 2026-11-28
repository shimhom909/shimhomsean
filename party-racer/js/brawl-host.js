// 彩彈大亂鬥的主機畫面：等候室（共用的 room.js）、比賽畫面、結果頒獎台。

import { ARENAS, ARENA_W, ARENA_H, Match, arenaById, weaponById, POWERS } from './brawl.js';
import { brawlBotInput } from './brawl-ai.js';
import { drawArena, drawArenaOverlay, drawArenaThumb, splat, drawFighter, drawFighterTag, drawBullet, drawPower } from './brawl-render.js';
import { portraitSVG, faceSVG } from './avatar.js';
import { sfx } from './audio.js';
import { createRoom, esc, show } from './room.js';
import { toast, bigText, banner, resetHud, startConfetti, fmtClock } from './hud.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const TIMES = [1, 2, 3, 5];          // 比賽時間選項（分鐘）

const G = { arenaId: ARENAS[0].id, minutes: 2 };

const coverTop = (svg) => svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMin slice" ');

const room = createRoom({
  game: 'brawl',
  storageKey: 'pr-brawl',
  loadSettings(saved) {
    if (ARENAS.some((a) => a.id === saved.arena)) G.arenaId = saved.arena;
    if (TIMES.includes(saved.minutes)) G.minutes = saved.minutes;
  },
  saveSettings: () => ({ arena: G.arenaId, minutes: G.minutes }),
  lobbyInfo: () => ({ arena: G.arenaId, minutes: G.minutes }),
  slotSub: (p) => { const w = weaponById(p.weapon); return `${w.name} · ${w.type}`; },
  slotArt(el, p) {
    const key = JSON.stringify(p.avatar) + p.color;
    if (el.dataset.key !== key) { el.dataset.key = key; el.innerHTML = portraitSVG(p.avatar, p.color, { crop: 'bust' }); }
  },
  onInput(p, m) {
    p.input = { mx: m.mx, my: m.my, ax: m.ax, ay: m.ay, d: m.d };
    if (S.match) S.match.setInput(p.id, p.input);
  },
  onDrop(p) {
    p.input = { mx: 0, my: 0, ax: 0, ay: 0, d: 0 };
    if (S.match) S.match.setInput(p.id, p.input);
  },
  onReady: setupLobbyExtras,
  afterRefresh: refreshSettingsUI,
  start: startMatch,
});
const S = room.S;
S.match = null;

// ── 等候室：場地與時間 ───────────────────────────────

function setupLobbyExtras() {
  const list = $('track-list');
  list.innerHTML = '';
  for (const a of ARENAS) {
    const b = document.createElement('button');
    b.className = 'track-card';
    b.dataset.id = a.id;
    b.title = a.desc;
    b.innerHTML = `<canvas></canvas><div class="track-name">${esc(a.name)}</div>`;
    b.onclick = () => { G.arenaId = a.id; room.saveSettings(); room.refreshLobby(); };
    list.appendChild(b);
  }
  requestAnimationFrame(() => {
    for (const b of list.children) drawArenaThumb(b.querySelector('canvas'), arenaById(b.dataset.id));
  });
  const tc = $('time-chips');
  tc.innerHTML = '';
  for (const m of TIMES) {
    const c = document.createElement('button');
    c.className = 'chip wide';
    c.dataset.min = m;
    c.textContent = `${m} 分`;
    c.setAttribute('role', 'radio');
    c.onclick = () => { G.minutes = m; room.saveSettings(); room.refreshLobby(); };
    tc.appendChild(c);
  }
  $('again-btn').onclick = startMatch;
  $('lobby-btn').onclick = () => { S.match = null; resetHud(); room.backToLobby(); };
  $('end-btn').onclick = () => { if (S.match) S.match.finish(); };
}

function refreshSettingsUI() {
  for (const b of $('track-list').children) b.classList.toggle('selected', b.dataset.id === G.arenaId);
  for (const c of $('time-chips').children) c.classList.toggle('selected', +c.dataset.min === G.minutes);
  const a = arenaById(G.arenaId);
  $('track-info').innerHTML = `<b>${esc(a.name)}</b>　${esc(a.desc)}`;
}

// ── 比賽 ─────────────────────────────────────────────

const flash = new Map();       // 被打中時閃白
const feed = [];               // 擊倒訊息
let lastTenShown = false;

function startMatch() {
  room.keepAwake();
  const entries = room.entries();
  if (!entries.length) return;
  S.match = new Match(arenaById(G.arenaId), entries, G.minutes * 60, { botInput: brawlBotInput });
  S.racers = entries.filter((e) => !e.bot).map((e) => e.id);
  S.results = null;
  S.phase = 'play';
  flash.clear();
  feed.length = 0;
  $('hud-feed').innerHTML = '';
  lastTenShown = false;
  rankRows.clear();
  $('hud-standings').innerHTML = '';
  resetHud();
  $('end-btn').classList.remove('hidden');
  show('h-race');
  resize();
  room.refreshLobby();
}

let shotSfxAt = 0;
function handleEvents() {
  const m = S.match;
  const byId = (id) => m.players.find((p) => p.id === id);
  for (const e of m.drainEvents()) {
    switch (e.type) {
      case 'count':
        bigText(String(e.n), 'c' + e.n); sfx.count();
        room.broadcast({ t: 'fx', k: 'count', n: e.n });
        break;
      case 'go':
        bigText('開打！', 'go'); sfx.go();
        room.broadcast({ t: 'fx', k: 'go' });
        break;
      case 'shot': {
        const now = performance.now();
        if (now - shotSfxAt > 90) { shotSfxAt = now; sfx.shot(); }
        break;
      }
      case 'splat':
        splat(paint.getContext('2d'), e.x, e.y, e.color, e.size);
        break;
      case 'hit':
        flash.set(e.id, 0.15);
        room.sendTo(e.id, { t: 'fx', k: 'hit', dmg: e.dmg });
        break;
      case 'ko': {
        const v = byId(e.id), k = byId(e.by);
        splat(paint.getContext('2d'), e.x, e.y, e.color, 3.2);
        sfx.bump();
        addFeed(k, v);
        if (k) room.sendTo(k.id, { t: 'fx', k: 'ko', name: v.name });
        room.sendTo(v.id, { t: 'fx', k: 'down', name: k ? k.name : '' });
        break;
      }
      case 'power': {
        const p = byId(e.id);
        sfx.lap();
        room.sendTo(e.id, { t: 'fx', k: 'power', kind: e.kind });
        if (p && !p.bot) toast(`${p.name} 撿到 ${POWERS[e.kind].name}！`, p.color);
        break;
      }
      case 'done':
        $('end-btn').classList.add('hidden');
        banner('時間到！', 'finish');
        sfx.finish();
        setTimeout(showResults, 1600);
        break;
      default:
        break;
    }
  }
  if (!lastTenShown && m.state === 'running' && m.timeLeft() <= 10) {
    lastTenShown = true;
    banner('最後 10 秒！');
  }
}

function addFeed(k, v) {
  const el = document.createElement('div');
  el.className = 'feed-row';
  el.innerHTML = k && k !== v
    ? `<span class="feed-face" style="--pc:${k.color}">${faceSVG(k.avatar, k.color)}</span><b style="color:${k.color}">${esc(k.name)}</b><span class="feed-hit">💥</span><span class="feed-face" style="--pc:${v.color}">${faceSVG(v.avatar, v.color)}</span><b style="color:${v.color}">${esc(v.name)}</b>`
    : `<b style="color:${v.color}">${esc(v.name)}</b> 被擊倒`;
  const box = $('hud-feed');
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => el.remove(), 6000);
}

function showResults() {
  if (!S.match || S.phase !== 'play') return;
  S.phase = 'results';
  const list = S.match.results();
  S.results = list;
  room.broadcast({ t: 'res', list });
  room.refreshLobby();
  const pod = $('podium');
  pod.innerHTML = '';
  for (const place of [2, 1, 3]) {
    const r = list[place - 1];
    if (!r) continue;
    const el = document.createElement('div');
    el.className = 'pod p' + place;
    el.style.setProperty('--pc', r.color);
    el.innerHTML = `<div class="pod-art">${coverTop(portraitSVG(r.avatar, r.color))}</div><div class="pod-name">${esc(r.name)}</div>` +
      `<div class="pod-time">擊倒 ${r.ko}・被擊倒 ${r.deaths}</div><div class="pod-block"><span class="pod-no">${r.place}</span></div>`;
    pod.appendChild(el);
  }
  $('results-table').innerHTML = list.slice(3).map((r) => `
    <div class="res-row" style="--pc:${r.color}">
      <div class="res-place">${r.place}</div>
      <div class="res-face">${faceSVG(r.avatar, r.color)}</div>
      <div class="res-name">${esc(r.name)}${r.bot ? ' <span class="tag">電腦</span>' : ''}<div class="res-sub">${esc(weaponById(r.weapon).name)}</div></div>
      <div class="res-time">擊倒 ${r.ko}・被擊倒 ${r.deaths}</div>
    </div>`).join('');
  $('results').classList.remove('hidden');
  requestAnimationFrame(startConfetti);
}

// ── 畫面 ─────────────────────────────────────────────

const canvas = $('game');
const ctx = canvas.getContext('2d');
const bg = document.createElement('canvas');      // 場地（畫一次）
const paint = document.createElement('canvas');   // 地上的彩漆（一直累積）
let view = null;

function resize() {
  if (!S.match) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const s = Math.min(w / ARENA_W, h / ARENA_H);
  const ox = (w - ARENA_W * s) / 2, oy = (h - ARENA_H * s) / 2;
  // 場地和彩漆各畫在一張圖上，解析度跟著螢幕走（高解析度螢幕也清楚）
  const k = Math.min(2.5, Math.max(1, s * dpr));
  view = { dpr, s, ox, oy, k, m: [s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr] };
  bg.width = paint.width = Math.round(ARENA_W * k);
  bg.height = paint.height = Math.round(ARENA_H * k);
  const b = bg.getContext('2d');
  b.setTransform(k, 0, 0, k, 0, 0);
  drawArena(b, S.match.arena);
  paint.getContext('2d').setTransform(k, 0, 0, k, 0, 0);
}
window.addEventListener('resize', () => {
  if (!S.match || !view) return;
  const keep = document.createElement('canvas');
  keep.width = paint.width; keep.height = paint.height;
  keep.getContext('2d').drawImage(paint, 0, 0);
  resize();
  paint.getContext('2d').drawImage(keep, 0, 0, ARENA_W, ARENA_H);
});

function render(dt) {
  const m = S.match;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = m.arena.theme === 'shrine' ? '#7fa58a' : '#2f6f6a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(...view.m);
  ctx.drawImage(bg, 0, 0, ARENA_W, ARENA_H);
  ctx.drawImage(paint, 0, 0, ARENA_W, ARENA_H);
  for (const pw of m.powers) drawPower(ctx, pw, m.time);
  const alive = m.players.filter((p) => p.alive).sort((a, b) => a.y - b.y);
  for (const p of alive) {
    const f = flash.get(p.id) || 0;
    drawFighter(ctx, p, m.time, { hitFlash: f });
    if (f > 0) flash.set(p.id, Math.max(0, f - dt));
  }
  for (const b of m.bullets) drawBullet(ctx, b);
  drawArenaOverlay(ctx, m.arena);
  const order = m.standings();
  const rank = new Map(order.map((p, i) => [p.id, i + 1]));
  for (const p of alive) drawFighterTag(ctx, p, rank.get(p.id));
}

// ── HUD ─────────────────────────────────────────────

const rankRows = new Map();
let hudAt = 0;
function updateHud(now) {
  if (now - hudAt < 150) return;
  hudAt = now;
  const m = S.match;
  const clock = $('hud-timer');
  clock.textContent = fmtClock(m.state === 'countdown' ? m.duration : m.timeLeft());
  clock.classList.toggle('urgent', m.state === 'running' && m.timeLeft() <= 10);
  const order = m.standings();
  const rows = order.map((p, i) => {
    let el = rankRows.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'rk-row';
      el.innerHTML = `<span class="rk-pos"></span><span class="rk-face">${faceSVG(p.avatar, p.color)}</span><span class="rk-name"></span><span class="rk-lap"></span>`;
      el.style.setProperty('--pc', p.color);
      el.querySelector('.rk-name').textContent = p.name;
      rankRows.set(p.id, el);
    }
    el.className = `rk-row rk-${i + 1}${p.alive ? '' : ' dead'}`;
    el.querySelector('.rk-pos').textContent = i + 1;
    el.querySelector('.rk-lap').textContent = p.alive ? `★ ${p.ko}` : `💤 ${Math.max(1, Math.ceil(p.respawnAt - m.time))}`;
    return el;
  });
  $('hud-standings').replaceChildren(...rows);
}

let statusAt = 0;
function sendStatus(now) {
  if (now - statusAt < 100) return;
  statusAt = now;
  const m = S.match;
  const order = m.standings();
  const ph = m.state === 'countdown' ? 'count' : m.state === 'running' ? 'run' : 'done';
  order.forEach((p, i) => {
    if (p.bot) return;
    room.sendTo(p.id, {
      t: 'st', g: 'brawl', ph, c: ph === 'count' ? Math.ceil(-m.time) : 0,
      hp: Math.max(0, Math.round(p.hp)), sh: Math.round(p.shield), ko: p.ko, de: p.deaths,
      rk: i + 1, n: order.length, tl: Math.ceil(m.timeLeft()),
      dead: p.alive ? 0 : Math.max(1, Math.ceil(p.respawnAt - m.time)),
      dash: Math.round((p.dashCd / 2.4) * 100) / 100,
      rapid: m.time < p.rapidUntil ? 1 : 0, speed: m.time < p.speedUntil ? 1 : 0,
    });
  });
}

// ── 主迴圈 ───────────────────────────────────────────

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if ((S.phase === 'play' || S.phase === 'results') && S.match && view) {
    if (S.phase === 'play') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 6) { S.match.step(STEP); acc -= STEP; n++; }
      if (n === 6) acc = 0;
      handleEvents();
      sendStatus(now);
    }
    render(dt);
    updateHud(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
