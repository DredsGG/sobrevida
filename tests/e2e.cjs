// Sobrevida — teste E2E em Chromium com a extensão carregada de verdade.
// O PokéSurvivor é simulado por tests/site/index.html (mesmos IDs e mesma regra do teste de js/ui/test.js do jogo,
// CSS, fonte e sprites vêm do repositório público do jogo, sem cópia aqui; pasta em GAME_DIR ou tests/.game),
// com empate sorteado), servido no endereço real https://pokesurvivor.com/ por interceptação. GitHub simulado.
// Uso: node tests/e2e.cjs [pasta-da-extensao] [pasta-de-prints]   (GAME_DIR=<clone de JPTER78/pokesurvivor>)
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const EXT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'extension'));
const SHOTS = path.resolve(process.argv[3] || path.join(__dirname, 'prints'));
const SITE = path.join(__dirname, 'site');
const GAME = path.resolve(process.env.GAME_DIR || path.join(__dirname, '.game'));
fs.mkdirSync(SHOTS, { recursive: true });
const ST = JSON.parse(fs.readFileSync(path.join(EXT, 'src', 'dados.js'), 'utf8').match(/starters: \[([\s\S]*?)\n  \],/)[0].replace(/^starters: /, '').replace(/,\n  \],$/, ']'));
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(150); } return false; };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-'));
  let release = { status: 404, body: '{}' };
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true, channel: 'chromium', viewport: { width: 1366, height: 768 }, locale: 'pt-BR',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--lang=pt-BR'],
  });
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: release.status, contentType: 'application/json', body: release.body }));
  await ctx.route('https://pokesurvivor.com/**', (r) => {
    const u = new URL(r.request().url());
    let f = path.join(SITE, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    if (!/\/index\.html$/.test(f)) f = path.join(GAME, decodeURIComponent(u.pathname));   // CSS, fonte e sprites do jogo
    if (!(f.startsWith(SITE) || f.startsWith(GAME)) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : f.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream';
    r.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const store = (o) => sw.evaluate((o) => chrome.storage.local.set(o), o);
  const sync = (o) => sw.evaluate((o) => chrome.storage.sync.set(o), o);
  for (const p of ctx.pages()) if (/COMO-INSTALAR/.test(p.url())) { await sleep(500); await p.screenshot({ path: path.join(SHOTS, '00-guia.png') }); }
  const page = ctx.pages().find((p) => !/COMO-INSTALAR|chrome-extension/.test(p.url())) || await ctx.newPage();
  const shadow = (sel) => page.locator(`#sobrevida-host >> css=${sel}`);
  const abrir = async (hash) => { await page.goto('about:blank'); await page.goto('https://pokesurvivor.com/' + (hash || '')); await page.waitForSelector('#sobrevida-host', { state: 'attached', timeout: 8000 }); await sleep(1700); };

  // 1. instalação nova: tutorial no meio da tela
  await abrir();
  ok(await ate(async () => await shadow('.card.on').count() === 1), 'tutorial aparece sozinho na primeira abertura');
  await page.screenshot({ path: path.join(SHOTS, '01-tutorial.png') });
  await page.keyboard.press('Escape'); await sleep(400);
  ok(await shadow('.card.on').count() === 0, 'Esc fecha o tutorial');
  ok(await shadow('.fab').isVisible(), 'botão de coração visível na tela de entrar');

  // 2. aba "Crear cuenta": o menu de parceiro abre do lado
  await page.click('#scr-login .tab[data-tab="register"]'); await sleep(800);
  ok(await ate(async () => await shadow('.pick.side.on').count() === 1), 'menu "Escolha seu parceiro" abre do lado na aba Criar conta');
  ok(await shadow('.pick .cell').count() === 29, '29 parceiros no menu');
  await sleep(600);
  const spriteOk = await page.evaluate(() => { const c = document.querySelector('#sobrevida-host').shadowRoot.querySelector('.pick .cell canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok(spriteOk > 50, `sprite do jogo desenhado no menu (${spriteOk} px)`);
  await page.screenshot({ path: path.join(SHOTS, '02-escolha-lado.png') });
  await shadow('.pick .cell[title="Charmander"]').click(); await sleep(300);
  ok((await shadow('.pick .info h3').innerText()).includes('Charmander'), 'clique mostra os detalhes do Charmander');
  await shadow('.pick .go').click(); await sleep(400);
  ok(await page.evaluate(() => 1) && (await sw.evaluate(() => chrome.storage.local.get('sv.alvo')))['sv.alvo'] === 4, 'escolha salva (Charmander, 4)');

  // 3. teste: responde sozinho e confirma
  await page.click('#btn-guest');
  await sleep(1500);
  await page.screenshot({ path: path.join(SHOTS, '03-respondendo.png') });
  await page.waitForFunction(() => window.__chosen, null, { timeout: 15000 });
  ok(await page.evaluate(() => window.__chosen) === 4, `teste respondido sozinho → Charmander (via ${await page.evaluate(() => window.__via)})`);
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, '04-pronto.png') });
  ok(await shadow('.fab').isVisible(), 'botão de coração aparece no menu do jogo');
  await sleep(1000);   // a troca de telas do jogo (resultado → menu) pode fechar um menu aberto cedo demais
  await shadow('.fab').click();
  ok(await ate(async () => await shadow('.menu.on').count() === 1, 3000), 'clique no coração abre o menu da Sobrevida');
  const rod = await shadow('.menu .ft').innerText();
  ok(/Relatar bug/.test(rod) && /Procurar atualização/.test(rod) && /feito por/.test(rod) && rod.includes('v' + JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'))).version), 'rodapé com Relatar bug, Procurar atualização e "feito por Dreds · vX"');
  ok(await shadow('.menu .sig a[href="https://github.com/DredsGG"][target="_blank"]').count() === 1, '"Dreds" abre o GitHub em aba nova');
  await page.screenshot({ path: path.join(SHOTS, '05-menu.png') });
  await shadow('.menu .langs button[data-l="es"]').click(); await sleep(300);
  ok(/Reportar un fallo/.test(await shadow('.menu .ft').innerText()), 'trocar para ES traduz o menu');
  await shadow('.menu .langs button[data-l="en"]').click(); await sleep(300);
  ok(/Report a bug/.test(await shadow('.menu .ft').innerText()), 'trocar para EN traduz o menu');
  await shadow('.menu .langs button[data-l="pt"]').click(); await sleep(300);
  // Procurar atualização sem Release
  await shadow('.menu .chkb').click(); await sleep(1200);
  ok(/Ainda não há versão publicada/.test(await shadow('.menu').innerText()), 'Procurar atualização responde (sem Release ainda)');
  await page.keyboard.press('Escape');

  // 4. os 29 parceiros, um por um (empates do jogo resolvidos pelo "Escolher outro")
  const vias = {};
  for (const s of ST) {
    await store({ 'sv.alvo': s.dex });
    await abrir();
    await page.click('#btn-guest');
    try { await page.waitForFunction(() => window.__chosen, null, { timeout: 15000 }); } catch (_) {}
    const r = await page.evaluate(() => ({ c: window.__chosen, via: window.__via, tie: window.__tie, log: window.__log.length }));
    vias[r.via] = (vias[r.via] || 0) + 1;
    ok(r.c === s.dex, `${s.name}: veio ${r.c} pelo ${r.via}${r.tie && r.tie.length > 1 ? ` (empate ${r.tie.join('/')})` : ''}`);
  }
  console.log('   vias:', JSON.stringify(vias));

  // 5. teste mudado (respostas em outra ordem): termina pelo "Escolher outro"
  await store({ 'sv.alvo': 725 });
  await abrir('#shuffle');
  await page.click('#btn-guest');
  await page.waitForFunction(() => window.__chosen, null, { timeout: 15000 }).catch(() => {});
  ok(await page.evaluate(() => window.__chosen) === 725, `teste com respostas embaralhadas ainda dá o Litten (via ${await page.evaluate(() => window.__via)})`);

  // 6. sem escolha: o menu abre no meio quando o teste aparece; escolher já responde
  await sw.evaluate(() => chrome.storage.local.remove('sv.alvo'));
  await abrir();
  await page.click('#btn-guest'); await sleep(900);
  ok(await ate(async () => await shadow('.pick.mid.on').count() === 1), 'sem escolha: o menu de parceiro abre no meio do teste');
  ok(await shadow('.pick .manual').count() === 1, 'tem "Responder eu mesmo"');
  await page.screenshot({ path: path.join(SHOTS, '06-escolha-no-teste.png') });
  await shadow('.pick .cell[title="Psyduck"]').click(); await sleep(200);
  await page.screenshot({ path: path.join(SHOTS, '07-psyduck-melhor.png') });
  await shadow('.pick .go').click();
  await page.waitForFunction(() => window.__chosen, null, { timeout: 15000 }).catch(() => {});
  ok(await page.evaluate(() => window.__chosen) === 54, 'escolher no meio do teste responde e dá o Psyduck');

  // 7. "Responder eu mesmo": a Sobrevida não toca no teste
  await sw.evaluate(() => chrome.storage.local.remove('sv.alvo'));
  await abrir();
  await page.click('#btn-guest'); await sleep(900);
  await shadow('.pick .manual').click(); await sleep(1500);
  ok(await page.evaluate(() => window.__log.length) === 0 && await shadow('.pick.on').count() === 0, '"Responder eu mesmo" fecha e não responde nada');
  await sync({ auto: true });

  // 8. Parar no meio
  await store({ 'sv.alvo': 1 });
  await abrir();
  await page.click('#btn-guest'); await sleep(700);
  await shadow('.bar .stop').click(); await sleep(1500);
  const n = await page.evaluate(() => window.__log.length);
  ok(n < 8 && !(await page.evaluate(() => window.__chosen)), `"Parar" interrompe (respondeu ${n} de 8)`);

  // 9. novidades depois de atualizar
  await store({ 'sv.onboard': { tutorial: 'visto', visto: '0.0.9', novLidas: '0.0.9' } });
  await abrir();
  ok(await ate(async () => await shadow('.card.on').count() === 1 && /Novidades da v/.test(await shadow('.card').innerText())), 'quadro "Novidades" aparece depois de atualizar');
  await page.screenshot({ path: path.join(SHOTS, '08-novidades.png') });
  await page.keyboard.press('Escape'); await sleep(300);

  // 10. versão nova no GitHub: aviso no meio, sem recarregar; X adia
  release = { status: 200, body: JSON.stringify({ tag_name: 'v9.9.0', name: 'v9.9.0', body: '- Nova coisa\n- Outra coisa', html_url: 'https://github.com/DredsGG/sobrevida/releases/tag/v9.9.0', assets: [{ name: 'sobrevida-v9.9.0.zip', browser_download_url: 'https://github.com/DredsGG/sobrevida/releases/download/v9.9.0/sobrevida-v9.9.0.zip' }] }) };
  await sw.evaluate(() => chrome.storage.local.remove(['sv.update', 'sv.adiado']));
  await abrir();
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(2500);
  ok(await shadow('.card.on').count() === 1 && /Nova versão v9\.9\.0/.test(await shadow('.card').innerText()), 'aviso "Nova versão" aparece sozinho no meio');
  await page.screenshot({ path: path.join(SHOTS, '09-versao-nova.png') });
  await shadow('.card .x').click(); await sleep(400);
  ok(await shadow('.card.on').count() === 0, 'X adia o aviso');
  // urgente: sem X e o teste não roda
  release = { status: 200, body: JSON.stringify({ tag_name: 'v9.9.1', name: 'v9.9.1 URGENTE', body: '- Conserto grave', html_url: 'https://github.com/DredsGG/sobrevida/releases/tag/v9.9.1', assets: [] }) };
  await sw.evaluate(() => chrome.storage.local.remove(['sv.update', 'sv.adiado']));
  await store({ 'sv.alvo': 7 });
  await abrir();
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(2500);
  ok(await shadow('.card.on').count() === 1 && await shadow('.card .x').count() === 0, 'versão URGENTE: aviso sem X');
  await page.click('#btn-guest', { force: true }).catch(() => {}); await sleep(2500);
  ok(await page.evaluate(() => window.__log.length) === 0, 'versão URGENTE: a Sobrevida pausa (não responde o teste)');
  await page.screenshot({ path: path.join(SHOTS, '10-urgente.png') });

  await ctx.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
