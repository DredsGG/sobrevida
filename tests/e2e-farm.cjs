// Sobrevida — E2E do farm (v0.2.0): extensão carregada de verdade + o PokéSurvivor REAL (build publicado do repo
// público do jogo) servido no endereço https://pokesurvivor.com por interceptação. Firebase e GitHub simulados (sem rede).
// Uso: node tests/e2e-farm.cjs <pasta-da-extensao> <clone de JPTER78/pokesurvivor> <pasta-de-prints> [minutos]
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const EXT = path.resolve(process.argv[2]), GAME = path.resolve(process.argv[3]), SHOTS = path.resolve(process.argv[4]);
const MIN = +(process.argv[5] || 2);
fs.mkdirSync(SHOTS, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, channel: 'chromium', viewport: { width: 1366, height: 768 }, locale: 'pt-BR',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--lang=pt-BR', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  let selos = 0;
  await ctx.route('https://ice.pokesurvivor.com/**', (r) => { selos++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"s":1,"g":"0"}' }); });
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
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await sw.evaluate(() => chrome.storage.local.set({ 'sv.onboard': { tutorial: 'visto', visto: '0.2.0', novLidas: '0.2.0' }, 'sv.alvo': 54 }));
  await sleep(1500);
  const page = await ctx.newPage();
  for (const pg of ctx.pages()) if (pg !== page) await pg.close();   // o guia de instalação roubaria o foco: a aba do jogo ficaria em segundo plano (2 fps)
  await page.bringToFront();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); });
    Object.defineProperty(Object.prototype, 'RunUI', { configurable: true, get() { return undefined; },
      set(v) { Object.defineProperty(this, 'RunUI', { value: v, writable: true, enumerable: true, configurable: true }); if (this && this.BUILT === true) { delete Object.prototype.RunUI; window.__NS = this; } } });
  });
  const shadow = (sel) => page.locator(`#sobrevida-host >> css=${sel}`);
  const vis = () => page.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  await page.goto('https://pokesurvivor.com/');
  await sleep(3500);
  ok(await page.evaluate(() => !!window.__st && window.__st.ok), 'piloto pegou o jogo (namespace) e manda status');
  if (await shadow('.card.on').count()) { await page.keyboard.press('Escape'); await sleep(400); }   // tutorial da instalação nova
  // abertura "toque para começar": clica até aparecer o login (o jogo pode demorar a carregar)
  for (let i = 0; i < 10 && !(await vis()).some((v) => v === 'scr-login' || v === 'scr-menu' || v === 'scr-test'); i++) { await page.mouse.click(683, 450); await sleep(1500); }
  if ((await vis()).includes('scr-login')) { await page.click('#btn-guest'); }
  try { await page.waitForFunction(() => document.querySelector('#scr-menu') && !document.querySelector('#scr-menu').classList.contains('hidden'), null, { timeout: 30000 }); }
  catch (e) { console.log('telas', await vis()); await page.screenshot({ path: path.join(SHOTS, 'erro-menu.png') }); throw e; }
  ok(await page.evaluate(() => window.__NS.DB.save.partner) === 54, 'teste respondido sozinho → Psyduck (recurso da 0.1.0 continua)');
  await page.evaluate(() => { const s = window.__NS.DB.save; s.coins = 5000; s.tickets.t10 = 2; s.tickets.t1 = 15; window.__NS.UI.refreshCoins(); });
  await sleep(800);
  await shadow('.fab').click(); await sleep(700);
  ok(await shadow('.menu .farm .fgo').count() === 1, 'menu do coração tem a seção Farm automático');
  await page.screenshot({ path: path.join(SHOTS, '11-farm-menu.png') });
  // reabrir o menu com o farm parado mostra a seção inteira (bug achado no PC do André: ficava vazia)
  await page.keyboard.press('Escape'); await sleep(400);
  await shadow('.fab').click(); await sleep(700);
  ok((await shadow('.menu .farm').innerText()).length > 40 && await shadow('.menu .farm .fgo').count() === 1, 'menu reaberto com o farm parado mostra a seção do farm inteira');
  await shadow('.menu .farm .fgo').click(); await sleep(1200);
  ok((await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === true, 'Ligar farm grava o estado');
  const regras = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  ok(regras.some((r) => r.action.type === 'block' && /ice\.pokesurvivor\.com\/v1\/seal/.test(r.condition.urlFilter)), 'selo do ranking bloqueado com o farm ligado');
  const antes = selos;
  await page.evaluate(() => fetch('https://ice.pokesurvivor.com/v1/seal', { method: 'POST' }).catch(() => null));
  await sleep(500);
  ok(selos === antes, 'pedido de selo não sai (bloqueado antes da rede)');
  // rotina + partida
  const t0 = Date.now(); let pillShot = false, runSeen = false, maint = new Set();
  while (Date.now() - t0 < MIN * 60000) {
    await sleep(3000);
    const s = await page.evaluate(() => window.__st);
    if (s.task) maint.add(s.task);
    if (s.run) runSeen = true;
    if (s.run && s.run.t > 25 && !pillShot) {
      pillShot = true;
      ok(await shadow('.pill').isVisible(), 'pílula do farm aparece durante a partida');
      await page.screenshot({ path: path.join(SHOTS, '12-farm-pilula.png') });
      ok(await shadow('.menu.on').count() === 0, 'menu da Sobrevida fecha sozinho quando o farm começa a partida (não cobre o jogo)');
      await shadow('.pill span').click(); await sleep(800);
      console.log('  menu depois do clique na pílula:', await page.evaluate(() => { const r = document.querySelector('#sobrevida-host').shadowRoot; const m = r.querySelector('.menu'); return { hidden: m.hidden, on: m.classList.contains('on'), txt: m.innerText.slice(0, 160) }; }));
      await page.screenshot({ path: path.join(SHOTS, '13-farm-menu-partida.png') });
      ok(await shadow('.menu.on').count() === 1 && /Nv \d+/.test(await shadow('.menu .farm').innerText()), 'menu aberto na partida mostra o que o farm está fazendo');
      await page.keyboard.press('Escape'); await sleep(400);
    }
    console.log(`  ${Math.round((Date.now() - t0) / 1000)}s ${s.st} task=${s.task} mode=${s.mode} run=${s.run ? s.run.t + 's' : '-'} coins=${s.coins} t1=${s.t1} t10=${s.t10} parceiro=${s.partner && s.partner.name} ${s.partner && s.partner.have}/${s.partner && s.partner.total}`);
  }
  const s = await page.evaluate(() => window.__st);
  ok(await page.evaluate(() => window.__NS.Game.state) !== 'paused', 'Esc que fechou o menu da Sobrevida não pausou o jogo');
  ok(runSeen, 'começou partida sozinho');
  ok(s.touched === true, 'partida marcada como do farm (não sobe ao ranking)');
  ok((s.acts || []).some((a) => a.k === 'gacha') && (s.acts || []).some((a) => a.k === 'upgrades'), 'painel registrou gacha e melhorias');
  // segunda aba do jogo: não joga junto (uma aba por vez)
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); }); });
  await p2.goto('https://pokesurvivor.com/'); await sleep(6000);
  ok(await p2.evaluate(() => window.__st && window.__st.ok && window.__st.on === false), 'segunda aba aberta: o farm não liga nela (uma aba por vez)');
  await p2.close(); await page.bringToFront(); await sleep(500);
  // Alt+F desliga
  await page.keyboard.press('Alt+f'); await sleep(1000);
  ok((await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === false, 'Alt+F desliga o farm');
  const regras2 = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  ok(!regras2.length, 'farm desligado: selo liberado de novo');
  await ctx.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
