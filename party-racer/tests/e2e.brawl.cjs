// 彩彈大亂鬥瀏覽器端對端測試：主機＋兩支手機，走完 角色設定→選武器→比賽（雙搖桿）→結果→回等候室。
// 用 ?net=local，不需要網路。需要 Playwright：node tests/e2e.brawl.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

function check(cond, msg) {
  if (!cond) throw new Error('檢查失敗：' + msg);
  console.log('✓ ' + msg);
}

(async () => {
  const server = await serve();
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const watch = (p, tag) => p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));

    const home = await ctx.newPage();
    watch(home, 'home');
    await home.goto(BASE + 'index.html?net=local');
    await home.click('.game-card[data-game="brawl"] .host-btn');
    await home.waitForURL(/brawl\.html\?net=local$/);
    check(true, '首頁選「彩彈大亂鬥」會開射擊遊戲的主機畫面');
    const host = home;
    await host.waitForSelector('#h-lobby:not(.hidden)');
    const url = await host.getAttribute('#qr', 'data-url');

    const phones = [];
    for (const [name, species, eyes, weapon, color] of [['小櫻', 'rabbit', 'round', 'shotgun', '#ff70a6'], ['阿翔', 'fox', 'sharp', 'sniper', '#3a86ff']]) {
      const p = await ctx.newPage();
      watch(p, name);
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(url);
      await p.waitForSelector('#c-setup:not(.hidden)', { timeout: 5000 });
      await p.fill('#name-input', name);
      await p.click(`.color-dot[data-hex="${color}"]`);
      await p.click(`.opt-row[data-key="species"] .opt[data-val="${species}"]`);
      await p.click(`.opt-row[data-key="eyes"] .opt[data-val="${eyes}"]`);
      await p.click('.tab[data-tab="gear"]');
      await p.click(`#wpn-list .car-card[data-id="${weapon}"]`);
      phones.push(p);
    }
    const [a, b] = phones;
    check((await a.textContent('#tab-gear')) === '武器庫', '手機知道是射擊遊戲，顯示「武器庫」');
    check(await a.$eval('#chara-art svg', (el) => !!el), '角色設定畫面有立繪');
    await a.click('#ready-btn');
    await b.click('#ready-btn');
    await host.waitForTimeout(300);
    const ps = await host.evaluate(() => [...window.__host.players.values()].map((p) => ({ n: p.name, w: p.weapon, s: p.avatar.species, e: p.avatar.eyes, c: p.color, r: p.ready })));
    check(ps.some((p) => p.n === '小櫻' && p.w === 'shotgun' && p.s === 'rabbit' && p.c === '#ff70a6' && p.r), '主機收到小櫻的動物角色（兔子）、武器、顏色');
    check(ps.some((p) => p.n === '阿翔' && p.w === 'sniper' && p.s === 'fox' && p.e === 'sharp' && p.r), '主機收到阿翔的動物角色（狐狸）、武器');
    check((await host.$$('.slot.player-card .slot-art svg')).length === 2, '等候室顯示兩位玩家的立繪');

    await host.click('#bot-chips .chip[data-bots="1"]');
    await host.click('#time-chips .chip[data-min="1"]');
    await host.click('#start-btn');
    for (const p of phones) await p.waitForSelector('#c-brawl:not(.hidden)', { timeout: 4000 });
    check(true, '開打後手機切換成雙搖桿');
    await host.waitForFunction(() => window.__host.match && window.__host.match.state === 'running', null, { timeout: 6000 });

    // 用觸控同時推左右搖桿
    const mz = await (await a.$('#stick-move')).boundingBox();
    const az = await (await a.$('#stick-aim')).boundingBox();
    const cdp = await a.context().newCDPSession(a);
    const before = await host.evaluate(() => { const p = window.__host.match.players.find((x) => x.name === '小櫻'); return [p.x, p.y]; });
    const mx = mz.x + mz.width / 2, my = mz.y + mz.height / 2, ax = az.x + az.width / 2, ay = az.y + az.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mx, y: my, id: 1 }, { x: ax, y: ay, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx + 60, y: my, id: 1 }, { x: ax + 50, y: ay - 50, id: 2 }] });
    await host.waitForTimeout(1000);
    const st = await host.evaluate(() => { const p = window.__host.match.players.find((x) => x.name === '小櫻'); return { x: p.x, y: p.y, firing: p.firing }; });
    check(st.x - before[0] > 60, `左搖桿往右推，角色往右走（${Math.round(st.x - before[0])}）`);
    check(st.firing, '右搖桿推出去就會射擊');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await host.waitForTimeout(300);
    const after = await host.evaluate(() => window.__host.match.players.find((x) => x.name === '小櫻').input);
    check(after.mx === 0 && after.ax === 0, '放開搖桿就停下、停火');
    await a.waitForFunction(() => document.getElementById('b-hp-num').textContent !== '');
    check(true, '手機顯示血量與分數');

    // 安排一次擊倒：讓阿翔站在小櫻正前方，小櫻開火
    await host.evaluate(() => {
      const m = window.__host.match;
      const s = m.players.find((x) => x.name === '小櫻'), t = m.players.find((x) => x.name === '阿翔');
      s.x = 400; s.y = 450; t.x = 520; t.y = 450; t.hp = 10; t.protectUntil = 0; s.protectUntil = 0;
    });
    await a.keyboard.down('ArrowRight');
    await host.waitForFunction(() => window.__host.match.players.find((x) => x.name === '小櫻').ko >= 1, null, { timeout: 4000 });
    await a.keyboard.up('ArrowRight');
    check(true, '打倒對手會加分');
    await b.waitForSelector('#b-dead:not(.hidden)', { timeout: 3000 });
    check(true, '被擊倒的手機顯示復活倒數');

    await host.click('#end-btn');
    await host.waitForSelector('#results:not(.hidden)', { timeout: 6000 });
    for (const p of phones) await p.waitForSelector('#c-result:not(.hidden)', { timeout: 6000 });
    check((await host.$$('.pod .pod-art svg')).length >= 2, '結果頒獎台顯示立繪');
    check((await a.textContent('#r-sub')).includes('擊倒'), '手機結果顯示擊倒數');

    await host.click('#lobby-btn');
    for (const p of phones) await p.waitForSelector('#c-setup:not(.hidden)', { timeout: 4000 });
    check(true, '回等候室後手機回到設定畫面');
    check(errors.length === 0, '沒有 JavaScript 錯誤' + (errors.length ? '：\n' + errors.join('\n') : ''));
    console.log('\n全部通過');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
