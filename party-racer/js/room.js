// 主機共用的「房間」：連線、玩家資料、心跳、電腦玩家、QR code、等候室 8 個位置。
// 派對賽車、彩彈大亂鬥兩個遊戲的主機頁都用它，各自只寫遊戲本身的部分。

import { CARS, COLORS, MAX_PLAYERS, FUN_NAMES } from './config.js';
import { WEAPONS } from './brawl.js';
import { createHost, passthroughQuery } from './net.js';
import { sanitizeAvatar, randomAvatar, faceSVG } from './avatar.js';
import { sfx, unlockAudio, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const HEARTBEAT_TIMEOUT = 7000;   // 這麼久沒收到手機訊息就當斷線
const LOBBY_KEEP = 60000;         // 等候室裡斷線的玩家保留多久（讓他重連回來）

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
}

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function cleanName(s) {
  const clean = String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return Array.from(clean).slice(0, 10).join('');
}

// opts:
//   game          'racer' | 'brawl'（告訴手機要顯示哪種設定和搖桿）
//   storageKey    主機設定存在 localStorage 的名字
//   loadSettings(saved) / saveSettings() → 物件：遊戲自己的設定（賽道、圈數…）
//   lobbyInfo()   → 放進等候室訊息的遊戲設定
//   slotArt(el, p) 在等候室卡片上畫角色或車子；slotSub(p) → 卡片下方小字
//   onInput(p, m) 收到手機操作；onDrop(p) 手機斷線
//   onReady()     房間建好、等候室畫面已經準備好
//   start()       主機按下開始
export function createRoom(opts) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(opts.storageKey) || '{}'); } catch (e) { /* ignore */ }

  const S = {
    code: null,
    phase: 'boot',                  // boot | lobby | play | results
    players: new Map(),             // 真人玩家 id → player
    bots: [],
    botWanted: Number.isInteger(saved.bots) ? Math.max(0, Math.min(MAX_PLAYERS, saved.bots)) : 0,
    botCount: 0,
    racers: [],                     // 這一場有上場的真人
    results: null,
  };
  if (opts.loadSettings) opts.loadSettings(saved);

  const room = { S };

  room.humans = () => [...S.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  room.broadcast = (msg) => { for (const p of S.players.values()) if (p.link) p.link.send(msg); };
  room.sendTo = (id, msg) => { const p = S.players.get(id); if (p && p.link) p.link.send(msg); };

  room.saveSettings = () => {
    try { localStorage.setItem(opts.storageKey, JSON.stringify({ ...(opts.saveSettings ? opts.saveSettings() : {}), bots: S.botWanted })); } catch (e) { /* ignore */ }
  };

  // ── 連線 ──
  const net = createHost({
    onReady(code) {
      S.code = code;
      S.phase = 'lobby';
      setupLobby();
      if (opts.onReady) opts.onReady();
      room.refreshLobby();
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
  room.net = net;

  function onLink(link) {
    let pid = null;
    link.onMessage = (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') { pid = onHello(link, m); return; }
      const p = pid && S.players.get(pid);
      if (!p || p.link !== link) return;
      p.lastSeen = performance.now();
      if (m.t === 'prof') { applyProfile(p, m); room.refreshLobby(); }
      else if (m.t === 'ready') { p.ready = !!m.v; room.refreshLobby(); }
      else if (m.t === 'in' && opts.onInput) opts.onInput(p, m);
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
      p = { id, ready: false, joinedAt: Date.now(), link, name: '', color: null, car: CARS[0].id, weapon: WEAPONS[0].id, avatar: sanitizeAvatar(null) };
      S.players.set(id, p);
      applyProfile(p, m);
      sfx.join();
    }
    p.connected = true;
    p.lastSeen = performance.now();
    p.lostAt = null;
    if (typeof m.ready === 'boolean' && S.phase === 'lobby') p.ready = m.ready;
    link.send({ t: 'welcome', id, code: S.code, game: opts.game });
    room.refreshLobby();
    if (S.phase === 'results' && S.results) link.send({ t: 'res', list: S.results });
    return id;
  }

  function dropLink(p) {
    p.link = null;
    p.connected = false;
    p.lostAt = performance.now();
    if (opts.onDrop) opts.onDrop(p);
    room.refreshLobby();
  }

  function colorTaken(hex, exceptId) {
    for (const p of S.players.values()) if (p.id !== exceptId && p.color === hex) return true;
    return false;
  }

  function applyProfile(p, m) {
    const name = cleanName(m.name);
    p.name = name || p.name || FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    if (m.car && CARS.some((c) => c.id === m.car)) p.car = m.car;
    if (m.weapon && WEAPONS.some((w) => w.id === m.weapon)) p.weapon = m.weapon;
    if (m.avatar) p.avatar = sanitizeAvatar(m.avatar);
    const want = COLORS.some((c) => c.hex === m.color) ? m.color : null;
    if (want && !colorTaken(want, p.id)) p.color = want;
    else if (!p.color || colorTaken(p.color, p.id)) {
      const free = COLORS.find((c) => !colorTaken(c.hex, p.id));
      p.color = free ? free.hex : COLORS[0].hex;
    }
  }

  // 心跳：太久沒消息的手機視為斷線；等候室中斷線太久的玩家移除
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
    if (changed) room.refreshLobby();
    room.broadcast({ t: 'hb' });
  }, 2000);

  // ── 電腦玩家 ──
  room.setBots = (n) => {
    S.botWanted = Math.max(0, Math.min(MAX_PLAYERS - S.players.size, n));
    room.saveSettings();
    room.refreshLobby();
  };

  function rebuildBots() {
    // 真人優先：空位不夠時電腦先讓位，有人離開再補回來
    const max = MAX_PLAYERS - S.players.size;
    S.botCount = Math.max(0, Math.min(S.botWanted, max));
    const used = new Set([...S.players.values()].map((p) => p.color));
    S.bots = [];
    for (let k = 0; k < S.botCount; k++) {
      const color = (COLORS.find((c) => !used.has(c.hex)) || COLORS[k % COLORS.length]).hex;
      used.add(color);
      S.bots.push({
        id: 'bot-' + k, name: '電腦 ' + (k + 1), color, bot: true, ready: true, connected: true,
        car: CARS[(k + 1) % CARS.length].id, weapon: WEAPONS[k % WEAPONS.length].id,
        avatar: randomAvatar(seeded(k * 7919 + 13)),
      });
    }
  }
  room.rebuildBots = rebuildBots;

  // 這一場的參賽名單（真人＋電腦）
  room.entries = () => {
    rebuildBots();
    return [
      ...room.humans().filter((p) => p.connected).map((p) => ({ id: p.id, name: p.name, color: p.color, car: p.car, weapon: p.weapon, avatar: p.avatar })),
      ...S.bots.map((b) => ({ ...b })),
    ];
  };

  // ── 等候室 ──
  let qrUrl = '';

  function setupLobby() {
    const url = new URL('play.html', location.href);
    const extra = passthroughQuery();
    url.search = `room=${S.code}` + (extra ? '&' + extra : '');
    qrUrl = url.toString();
    $('room-code').textContent = S.code;
    if ($('hud-room')) $('hud-room').textContent = S.code;
    const base = new URL('./', location.href);
    $('join-url-short').textContent = (base.host + base.pathname).replace(/\/$/, '');
    drawQR();

    const isLocalNet = new URLSearchParams(location.search).get('net') === 'local';
    if (!isLocalNet && (location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(location.hostname))) {
      const w = $('local-warn');
      w.textContent = '⚠ 目前是本機網址，其他手機掃描會連不到。請用部署後的網址（例如 GitHub Pages）或電腦的區網 IP 開啟。';
      w.classList.remove('hidden');
    }

    const chips = $('bot-chips');
    chips.innerHTML = '';
    for (let n = 0; n < MAX_PLAYERS; n++) {
      const c = document.createElement('button');
      c.className = 'chip';
      c.dataset.bots = n;
      c.textContent = n;
      c.setAttribute('role', 'radio');
      c.setAttribute('aria-label', `${n} 台電腦玩家`);
      c.onclick = () => room.setBots(n);
      chips.appendChild(c);
    }
    // 點空位＝加一台電腦；點電腦的 ✕＝少一台
    $('player-list').addEventListener('click', (e) => {
      if (e.target.closest('.slot.empty')) room.setBots(S.botCount + 1);
      else if (e.target.closest('.slot-badge.bot')) room.setBots(S.botCount - 1);
    });
    $('start-btn').onclick = () => { unlockAudio(); keepAwake(); opts.start(); };

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

  const publicInfo = (p) => ({
    id: p.id, name: p.name, color: p.color, car: p.car, weapon: p.weapon, avatar: p.avatar,
    ready: !!p.ready, connected: !!p.connected, bot: !!p.bot,
  });

  room.refreshLobby = () => {
    rebuildBots();
    const all = [...room.humans(), ...S.bots];
    room.broadcast({
      t: 'lobby', game: opts.game, phase: S.phase, code: S.code, racers: S.racers,
      players: all.map(publicInfo), ...(opts.lobbyInfo ? opts.lobbyInfo() : {}),
    });
    if (S.phase === 'boot') return;

    $('p-count').textContent = `${all.length}/${MAX_PLAYERS}`;
    const free = MAX_PLAYERS - S.players.size;
    for (const c of $('bot-chips').children) {
      const n = +c.dataset.bots;
      c.disabled = n > free;
      c.classList.toggle('selected', n === S.botCount);
      c.setAttribute('aria-checked', n === S.botCount ? 'true' : 'false');
    }
    $('slots-sum').textContent = `真人 ${S.players.size}・電腦 ${S.botCount}` + (all.length < MAX_PLAYERS ? '　點空位可加電腦玩家' : '');

    // 等候室：固定 8 個位置，有人的顯示角色／車子，沒人的顯示「等待加入」
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
        el.innerHTML = '<div class="slot-no"></div><div class="slot-badge"></div><div class="slot-face"></div><div class="slot-art"></div><div class="slot-name"></div><div class="slot-car"></div>';
      }
      el.querySelector('.slot-no').textContent = 'P' + (i + 1);
      el.querySelector('.slot-name').textContent = p.name;
      el.querySelector('.slot-car').textContent = opts.slotSub ? opts.slotSub(p) : '';
      const st = el.querySelector('.slot-badge');
      if (p.bot) { st.textContent = '電腦 ✕'; st.className = 'slot-badge bot'; st.title = '移除這台電腦玩家'; }
      else if (!p.connected) { st.textContent = '斷線'; st.className = 'slot-badge off'; }
      else if (p.ready) { st.textContent = 'READY'; st.className = 'slot-badge ok'; }
      else { st.textContent = '設定中'; st.className = 'slot-badge wait'; }
      el.style.setProperty('--pc', p.color);
      el.classList.toggle('disconnected', !p.connected);
      const faceKey = JSON.stringify(p.avatar) + p.color;
      const face = el.querySelector('.slot-face');
      if (face.dataset.key !== faceKey) { face.dataset.key = faceKey; face.innerHTML = faceSVG(p.avatar, p.color); }
      opts.slotArt(el.querySelector('.slot-art'), p);
      nodes.push(el);
    }
    list.replaceChildren(...nodes);

    const hs = room.humans().filter((p) => p.connected);
    const canStart = hs.length + S.bots.length > 0;
    $('start-btn').disabled = !canStart;
    const notReady = hs.filter((p) => !p.ready).length;
    $('start-hint').textContent = !canStart ? '至少要有一位玩家或電腦對手'
      : notReady ? `還有 ${notReady} 人在設定中（主機仍可直接開始）` : '全員準備完成！';
    if (opts.afterRefresh) opts.afterRefresh();
  };

  room.backToLobby = () => {
    S.phase = 'lobby';
    S.racers = [];
    S.results = null;
    for (const p of S.players.values()) p.ready = false;
    show('h-lobby');
    room.refreshLobby();
  };

  // ── 其他 ──
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* 不支援就算了 */ }
  }
  room.keepAwake = keepAwake;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.phase !== 'boot') keepAwake(); });
  window.addEventListener('beforeunload', (e) => {
    if (S.players.size) { e.preventDefault(); e.returnValue = ''; }
  });

  // 測試用
  window.__host = S;
  window.__room = room;
  return room;
}
