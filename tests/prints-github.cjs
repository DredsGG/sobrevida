// Prints do README (em inglês) no PokéSurvivor REAL (clone do repositório público do jogo) servido em https://pokesurvivor.com.
// Conta de convidado nova, sem nenhum dado pessoal. Firebase, GitHub e o selo do ranking simulados.
// Uso: node tests/prints-github.cjs <pasta-da-extensao> <clone de JPTER78/pokesurvivor> <pasta-de-saida>
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const EXT = path.resolve(process.argv[2]), GAME = path.resolve(process.argv[3]), OUT = path.resolve(process.argv[4]);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'svp-')), { headless: true, channel: 'chromium', viewport: { width: 1366, height: 768 }, locale: 'en-US',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--lang=en-US', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  await ctx.route('https://ice.pokesurvivor.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"s":1,"g":"0"}' }));
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await ctx.route('https://www.gstatic.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('https://pokesurvivor.com/**', (r) => {
    const u = new URL(r.request().url());
    let f = path.join(GAME, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    if (!f.startsWith(GAME) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: CT[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await sleep(1500);
  const page = await ctx.newPage();
  for (const pg of ctx.pages()) if (pg !== page) await pg.close();
  await page.bringToFront();
  await page.addInitScript(() => {
    window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); });
    Object.defineProperty(Object.prototype, 'RunUI', { configurable: true, get() { return undefined; },
      set(v) { Object.defineProperty(this, 'RunUI', { value: v, writable: true, enumerable: true, configurable: true }); if (this && this.BUILT === true) { delete Object.prototype.RunUI; window.__NS = this; } } });
  });
  const shadow = (sel) => page.locator(`#sobrevida-host >> css=${sel}`);
  const vis = () => page.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  await page.goto('https://pokesurvivor.com/'); await sleep(3500);
  if (await shadow('.card.on').count()) { await sleep(600); await page.screenshot({ path: path.join(OUT, 'sobrevida-tutorial.png') }); await page.keyboard.press('Escape'); await sleep(400); }
  for (let i = 0; i < 10 && !(await vis()).some((v) => v === 'scr-login' || v === 'scr-menu' || v === 'scr-test'); i++) { await page.mouse.click(683, 450); await sleep(1500); }
  await page.click('#scr-login .tab[data-tab="register"]'); await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'sobrevida-starter-picker.png') });
  await shadow('.pick .go').click(); await sleep(400);
  await page.click('#btn-guest');
  await page.waitForFunction(() => document.querySelector('#scr-menu') && !document.querySelector('#scr-menu').classList.contains('hidden'), null, { timeout: 30000 });
  await sleep(1200);
  // convidado de teste: moedas e tickets só para o print mostrar a rotina (nunca numa conta de verdade)
  await page.evaluate(() => { const s = window.__NS.DB.save; s.coins = 5000; s.tickets.t10 = 2; s.tickets.t1 = 15; window.__NS.UI.refreshCoins(); });
  await sleep(800);
  await shadow('.fab').click(); await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'sobrevida-farm-menu.png') });
  await shadow('.menu .farm .fgo').click();
  const t0 = Date.now(); let pill = false;
  while (Date.now() - t0 < 150000) {
    await sleep(2000);
    const s = await page.evaluate(() => window.__st);
    if (s && s.run && s.run.t > 45 && !pill) {
      pill = true;
      await page.screenshot({ path: path.join(OUT, 'sobrevida-farm-run.png') });
      await shadow('.pill span').click(); await sleep(900);
      await page.screenshot({ path: path.join(OUT, 'sobrevida-farm-panel.png') });
      await page.keyboard.press('Escape');
      break;
    }
  }
  await ctx.close();
  console.log(pill ? 'prints ok' : 'sem partida para o print');
})().catch((e) => { console.error(e); process.exit(2); });
