// 瀏覽器端對端測試：開一個主機分頁＋兩支「手機」分頁，走完 加入→設定→比賽→結果→回大廳。
// 用 ?net=local（BroadcastChannel），不需要網路。需要 Playwright：
//   node tests/e2e.browser.cjs
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

    const host = await ctx.newPage();
    watch(host, 'host');
    await host.goto(BASE + 'host.html?net=local');
    await host.waitForSelector('#h-lobby:not(.hidden)');
    const url = await host.getAttribute('#qr', 'data-url');
    check(/play\.html\?room=[A-Z0-9]{4}&net=local$/.test(url), 'QR code 指向加入網址 ' + url);

    const phones = [];
    for (let i = 0; i < 2; i++) {
      const p = await ctx.newPage();
      watch(p, 'phone' + i);
      await p.setViewportSize({ width: 390, height: 780 });
      await p.goto(url);
      await p.waitForSelector('#c-setup:not(.hidden)', { timeout: 5000 });
      phones.push(p);
    }
    check(true, '兩支手機都進入設定畫面');

    const [a, b] = phones;
    await a.fill('#name-input', '阿明');
    await a.click('.color-dot[data-hex="#3a86ff"]');
    await a.click('.car-card[data-id="bolt"]');
    await b.waitForTimeout(500);
    check(await b.$eval('.color-dot[data-hex="#3a86ff"]', (el) => el.disabled), '別人選走的顏色不能再選');
    await b.click('.color-dot[data-hex="#ff70a6"]');
    await b.click('.car-card[data-id="pixie"]');
    await a.click('#ready-btn');
    await b.click('#ready-btn');
    await host.click('#bot-plus');
    await host.waitForTimeout(500);

    const players = await host.evaluate(() => [...window.__host.players.values()].map((p) => [p.name, p.color, p.car, p.ready]));
    check(players.some(([n, c, car, r]) => n === '阿明' && c === '#3a86ff' && car === 'bolt' && r), '主機收到阿明的名稱、顏色、車款');
    check(players.some(([, c, car, r]) => c === '#ff70a6' && car === 'pixie' && r), '主機收到第二位玩家的設定');
    check((await host.$$('.player-card')).length === 3, '大廳顯示 2 位玩家＋1 台電腦');

    await host.click('#start-btn');
    for (const p of phones) await p.waitForSelector('#c-pad:not(.hidden)', { timeout: 3000 });
    check(true, '開始比賽後手機切換成搖桿');

    await host.waitForFunction(() => window.__host.race && window.__host.race.state === 'running', null, { timeout: 6000 });
    const progOf = () => host.evaluate(() => window.__host.race.cars.find((x) => x.name === '阿明').prog);
    const p0 = await progOf();
    // 阿明用觸控按住油門；另一位用鍵盤也一起開，免得停著的車擋在前面
    const gas = await (await a.$('#btn-gas')).boundingBox();
    await a.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2);
    await a.mouse.down();
    await b.keyboard.down('ArrowUp');
    await host.waitForTimeout(1500);
    const car = await host.evaluate(() => {
      const c = window.__host.race.cars.find((x) => x.name === '阿明');
      return { g: c.input.g, sp: Math.round(Math.hypot(c.vx, c.vy)), prog: c.prog };
    });
    check(car.g === 1 && car.prog - p0 > 60, `按住油門車子會往前跑（前進 ${(car.prog - p0).toFixed(0)}，速度 ${car.sp}）`);
    await b.keyboard.up('ArrowUp');
    await a.mouse.up();
    await a.waitForFunction(() => /\d/.test(document.getElementById('pad-pos').textContent));
    check(true, '手機上顯示名次');

    await host.click('#end-btn');
    await host.waitForSelector('#results:not(.hidden)', { timeout: 4000 });
    for (const p of phones) await p.waitForSelector('#c-result:not(.hidden)', { timeout: 4000 });
    check(true, '比賽結束，主機與手機都顯示結果');

    await host.click('#lobby-btn');
    for (const p of phones) await p.waitForSelector('#c-setup:not(.hidden)', { timeout: 3000 });
    check(true, '回大廳後手機回到設定畫面');

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
