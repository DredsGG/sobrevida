// Sobrevida — E2E do farm (v0.2.0): extensão carregada de verdade + o PokéSurvivor REAL (build publicado do repo
// público do jogo) servido no endereço https://pokesurvivor.com por interceptação. Firebase e GitHub simulados (sem rede).
// Uso: node tests/e2e-farm.cjs <pasta-da-extensao> <pasta do jogo (testes/.game)> <pasta-de-prints> [minutos]
// 0.12.3: o repo do jogo sumiu (05/11); o jogo vem da cópia local testes/.game (ESPELHAR=1 busca o que faltar em
// pokesurvivor.com, só GET de arquivo estático; ver espelhar-jogo.cjs). O objeto do jogo é achado como o piloto acha
// e os módulos pelos nomes lógicos do mapa.js.
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const EXT = path.resolve(process.argv[2]), GAME = path.resolve(process.argv[3]), SHOTS = path.resolve(process.argv[4]);
const MIN = +(process.argv[5] || 2);
fs.mkdirSync(SHOTS, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esperar = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(250); } return false; };
const CT = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, channel: 'chromium', viewport: { width: 1366, height: 768 }, locale: 'pt-BR',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--lang=pt-BR', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  let selos = 0;
  await ctx.route('https://ice.pokesurvivor.com/**', (r) => { selos++; r.fulfill({ status: 200, contentType: 'application/json', body: '{"s":1,"g":"0"}' }); });
  await jl.servirJogo(ctx, GAME, { semIce: true });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await sw.evaluate(() => chrome.storage.local.set({ 'sv.onboard': { tutorial: 'visto', visto: '0.2.0', novLidas: '0.2.0' }, 'sv.alvo': 54 }));
  await sleep(1500);
  const page = await ctx.newPage();
  for (const pg of ctx.pages()) if (pg !== page) await pg.close();   // o guia de instalação roubaria o foco: a aba do jogo ficaria em segundo plano (2 fps)
  await page.bringToFront();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 200)); });
  await page.addInitScript(() => { window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); }); });
  await page.addInitScript(jl.nsInit());
  const shadow = (sel) => page.locator(`${jl.HOST} >> css=${sel}`);
  // contador interno do jogo: objeto do topo com exatamente {boot, v}; v tem que ficar em 0
  const hz = () => page.evaluate(() => { const R = window.__NSRAW; if (!R) return null; for (const k of Object.keys(R)) { const o = R[k]; if (o && typeof o === 'object' && Object.keys(o).sort().join() === 'boot,v') return o.v; } return null; });
  const bloqueio = () => page.evaluate(() => /no es compatible|not compatible|não é compatível/i.test(document.body.innerText) || [...document.querySelectorAll('body *')].some((e) => getComputedStyle(e).zIndex === '2147483647' && e.offsetWidth > innerWidth * 0.8));
  const vis = () => page.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  await page.goto('https://pokesurvivor.com/');
  await sleep(3500);
  for (let i = 0; i < 20 && !(await page.evaluate(() => window.__st && window.__st.ok)); i++) await sleep(500);
  const st0 = await page.evaluate(() => window.__st);
  ok(!!st0 && st0.ok === true, 'piloto pegou o jogo (namespace) e manda status: ' + JSON.stringify(st0 && { ok: st0.ok, err: st0.err, v: st0.v, mapaOk: st0.mapaOk, faltam: st0.faltam }));
  ok(!!st0 && st0.mapaOk === true, 'status com mapaOk:true (todos os módulos reconhecidos pela forma)');
  ok(await page.evaluate(() => window.__NSMAPA && !window.__NSMAPA.faltam.length && !window.__NSMAPA.ambiguos.length), 'mapa do teste (mesmo mapa.js) sem faltas nem ambíguos');
  ok(await page.evaluate(() => /[native code]/.test(Function.prototype.toString.call(Object.create))), 'funções nativas da página restauradas depois da carga');
  ok(await page.evaluate(() => Object.getOwnPropertyNames(Object.prototype).length) === 12, 'objetos nativos da página intactos (12 propriedades)');
  ok(await page.evaluate(() => !window.__psmod && !window.__psmodNS && !window.__sobrevidaPiloto && !document.querySelector('#sobrevida-host,#sv-cola-css,#sv-cola-jogo,[id^="psmod-"],[class*="psmod-"]')), 'sem globais, ids ou classes fixos da Sobrevida na página');
  ok(await jl.marcarHost(page), 'quadro da Sobrevida achado pelo conteúdo (id sorteado)');
  if (await shadow('.card.on').count()) { await page.keyboard.press('Escape'); await sleep(400); }   // tutorial da instalação nova
  // abertura "toque para começar": clica até aparecer o login (o jogo pode demorar a carregar)
  for (let i = 0; i < 10 && !(await vis()).some((v) => v === 'scr-login' || v === 'scr-menu' || v === 'scr-test'); i++) { await page.mouse.click(683, 450); await sleep(1500); }
  if ((await vis()).includes('scr-login')) { await page.click('#btn-guest'); }
  try { await page.waitForFunction(() => document.querySelector('#scr-menu') && !document.querySelector('#scr-menu').classList.contains('hidden'), null, { timeout: 30000 }); }
  catch (e) { console.log('telas', await vis()); await page.screenshot({ path: path.join(SHOTS, 'erro-menu.png') }); throw e; }
  ok(await page.evaluate(() => window.__NS.DB.save.partner) === 54, 'teste respondido sozinho → Psyduck (recurso da 0.1.0 continua)');
  await page.evaluate(() => { const s = window.__NS.DB.save; s.coins = 5000; s.tickets.t10 = 2; s.tickets.t1 = 15; window.__NS.UI.refreshCoins(); });
  await sleep(800);
  // quadros da extensão (novidades/tutorial) podem abrir depois do menu: fecha antes de clicar no coração
  for (let i = 0; i < 3 && await shadow('.card.on').count(); i++) { await page.keyboard.press('Escape'); await sleep(400); }
  await shadow('.fab').click(); await sleep(700);
  ok(await shadow('.menu .farm .fgo').count() === 1, 'menu do coração tem a seção Farm automático');
  // 0.2.6: dois modos separados, Sozinho e Em grupo
  ok(await shadow('.menu .farm > .modos button').count() === 2, 'farm com duas abas: Sozinho e Em grupo');
  await shadow('.menu .farm .modos button[data-modo="grupo"]').click(); await sleep(600);
  const fg = await shadow('.menu .farm').innerText();
  ok(/Ligar farm em grupo/.test(fg) && /nunca mexe no menu/.test(fg) && await shadow('.menu .farm .fopts').count() === 0,
    'aba Em grupo: botão "Ligar farm em grupo", explicação própria e sem as opções da rotina');
  ok((await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].modo === 'grupo', 'modo Em grupo fica salvo');
  await page.screenshot({ path: path.join(SHOTS, '10-farm-modo-grupo.png') });
  await shadow('.menu .farm .modos button[data-modo="solo"]').click(); await sleep(600);
  ok(/Ligar farm/.test(await shadow('.menu .farm .fgo').innerText()) && await shadow('.menu .farm .fopts').count() === 1, 'volta para Sozinho: opções da rotina de novo');
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
      // 0.12.4: na partida, só o botão Auto (ponto verde = ligado) e o "⋯"; a barrinha só se escolhida no menu
      ok(await shadow('.avb .ab').isVisible() && await shadow('.avb .am').isVisible() && !(await shadow('.pill').isVisible()), 'na partida: botão Auto e "⋯" no lugar da barrinha');
      const bx = await shadow('.avb').boundingBox(), am = await shadow('.avb .am').boundingBox(), ab = await shadow('.avb .ab').boundingBox();
      ok(bx && bx.width <= 96 && bx.height <= 32 && ab.height >= 32 && am.width >= 32 && am.height >= 32 && Math.abs(1366 - (bx.x + bx.width) - 14) <= 2 && Math.abs(bx.y - 48) <= 2,
        `botão Auto: canto (direita 14, topo 48), no máximo 96×32 e alvo >= 32 px: ${bx && Math.round(bx.width)}×${bx && Math.round(bx.height)} em x=${bx && Math.round(bx.x)} y=${bx && Math.round(bx.y)}`);
      ok(await shadow('.avb .ab').evaluate((e) => e.tagName) === 'BUTTON' && await shadow('.avb .ab').getAttribute('aria-pressed') === 'true' && await shadow('.avb .at').isHidden(), 'Auto ligado: <button>, aria-pressed=true e sem texto');
      await page.screenshot({ path: path.join(SHOTS, 'auto-ligado.png') });
      // clicar em Auto liga/desliga de verdade (o estado do piloto muda), pela mesma função do menu e do Alt+F
      await shadow('.avb .ab').click();
      ok(await esperar(async () => (await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === false && (await page.evaluate(() => window.__st && window.__st.on === false))), 'clique em Auto desliga: sv.farm.on=false e o piloto passa a on:false');
      ok(await shadow('.avb .ab').getAttribute('aria-pressed') === 'false', 'Auto desligado: aria-pressed=false (ponto cinza)');
      await page.screenshot({ path: path.join(SHOTS, 'auto-desligado.png') });
      await shadow('.avb .ab').click();
      ok(await esperar(async () => (await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === true && (await page.evaluate(() => window.__st && window.__st.on === true))), 'clique em Auto liga de novo: sv.farm.on=true e o piloto passa a on:true');
      // aviso âmbar: o piloto "some" (eventos descartados) e chega um status de erro do mapa, como se o jogo tivesse mudado
      await page.evaluate(() => { const o = EventTarget.prototype.dispatchEvent; window.__o = o; document.dispatchEvent = function (e) { return e && e.type === 'sobrevida:st' ? true : o.call(this, e); }; o.call(document, new CustomEvent('sobrevida:st', { detail: JSON.stringify({ ok: false, err: 'mapa', faltam: ['Moves'], v: '0.12.4' }) })); });
      ok(await esperar(async () => /jogo mudou/i.test(await shadow('.avb .at').innerText())), 'erro "mapa": o Auto fica âmbar e mostra o aviso curto');
      ok((await shadow('.avb .at').innerText()).length <= 40 && /Moves/.test(await shadow('.avb .at').getAttribute('title')) && await shadow('.avb').evaluate((e) => e.classList.contains('w2')), 'aviso com até 40 caracteres, texto completo no title (com o módulo que faltou) e classe âmbar');
      await page.screenshot({ path: path.join(SHOTS, 'auto-ambar-mapa.png') });
      await page.evaluate(() => { delete document.dispatchEvent; });
      ok(await esperar(async () => await shadow('.avb .at').isHidden()), 'piloto de volta: o aviso some (fora dos casos de aviso o botão não mostra texto)');
      // "⋯" abre o menu; a opção "completa" traz a barrinha de volta; "só botão" a esconde
      await shadow('.avb .am').click(); await sleep(800);
      ok(await shadow('.menu.on').count() === 1 && /Nv \d+/.test(await shadow('.menu .farm').innerText()), '"⋯" abre o menu no meio da partida e ele mostra o que o farm está fazendo');
      ok(await shadow('.menu .farm [data-barra="botao"]').getAttribute('aria-checked') === 'true', 'opção "Barra do farm": padrão = só botão');
      await shadow('.menu .farm [data-barra="completa"]').click(); await sleep(800);
      ok(await shadow('.pill').isVisible() && !(await shadow('.avb').isVisible()) && /Nv \d+/.test(await shadow('.pill span').innerText()), 'opção "completa": a barrinha de antes volta (com o andamento) e o botão Auto some');
      await page.screenshot({ path: path.join(SHOTS, 'auto-completa.png') });
      ok((await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].barra === 'completa', 'escolha da barra fica salva (sv.farm.barra)');
      await shadow('.pill button').click(); await sleep(900);   // o Parar/Ligar da barrinha continua funcionando
      ok(await esperar(async () => (await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === false), 'barrinha completa: o botão Parar continua desligando o farm');
      await shadow('.pill button').click(); await sleep(900);
      ok(await esperar(async () => (await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === true), 'barrinha completa: o botão Ligar liga de novo');
      await shadow('.menu .farm [data-barra="botao"]').click(); await sleep(800);
      ok(await shadow('.avb .ab').isVisible() && !(await shadow('.pill').isVisible()), 'volta para "só botão": o botão Auto e nada da barrinha');
      await page.keyboard.press('Escape'); await sleep(400);
      // 0.4.1: versão nova chegando no meio da partida: o quadro NÃO aparece (só no menu)
      await sw.evaluate(() => chrome.storage.local.set({ 'sv.update': { disponivel: true, ultima: '9.9.9', notas: '- teste', at: Date.now() } }));
      await sleep(1500);
      ok(await shadow('.card.on').count() === 0, 'versão nova no meio da partida: quadro não aparece (espera o menu)');
      await sw.evaluate(() => chrome.storage.local.set({ 'sv.update': {} }));
      await page.screenshot({ path: path.join(SHOTS, '12-farm-pilula.png') });
      await page.screenshot({ path: path.join(SHOTS, '12-farm-auto.png') });
    }
    console.log(`  ${Math.round((Date.now() - t0) / 1000)}s ${s.st} task=${s.task} mode=${s.mode} run=${s.run ? s.run.t + 's' : '-'} coins=${s.coins} t1=${s.t1} t10=${s.t10} parceiro=${s.partner && s.partner.name} ${s.partner && s.partner.have}/${s.partner && s.partner.total}`);
  }
  const s = await page.evaluate(() => window.__st);
  ok(s.ok === true && s.mapaOk === true, 'no fim do farm o status segue ok:true e mapaOk:true');
  const hzv = await hz();
  ok(hzv === 0, 'contador interno do jogo (v) ficou em 0: ' + hzv);
  ok(!(await bloqueio()), 'nenhuma tela de bloqueio aparece');
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
  // 0.2.5/0.12.4: na partida, com o farm desligado, o botão Auto continua no canto (cinza), abre o menu e liga o farm no meio
  const naPartida = await page.evaluate(() => !['ui', 'over'].includes(window.__NS.Game.state));
  if (naPartida) {
    ok(await shadow('.avb .ab').isVisible() && await shadow('.avb .ab').getAttribute('aria-pressed') === 'false', 'farm desligado na partida (Alt+F): o botão Auto fica no canto, cinza (aria-pressed=false)');
    await shadow('.avb .am').click(); await sleep(700);
    ok(await shadow('.menu.on').count() === 1, '"⋯" abre o menu no meio da partida (farm desligado)');
    await page.keyboard.press('Escape'); await sleep(400);
    await shadow('.avb .ab').click(); await sleep(1200);
    ok((await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on === true, 'o botão Auto liga o farm no meio da partida');
    // Alt+F e o botão do menu usam a mesma função: Alt+F desliga e o botão Auto acompanha
    await page.keyboard.press('Alt+f'); await sleep(1000);
    ok(await shadow('.avb .ab').getAttribute('aria-pressed') === 'false', 'Alt+F desliga e o botão Auto acompanha (aria-pressed=false)');
  } else console.log('  (a partida tinha acabado: pulei o teste do botão Auto com o farm desligado)');
  ok((await hz()) === 0 && !(await bloqueio()), 'no fim: contador interno em 0 e nenhuma tela de bloqueio');
  // piloto velho simulado: aba nova em que os status do piloto não chegam (como a Sobrevida atualizada com o jogo aberto);
  // com a partida começada à mão, o botão Auto fica âmbar e pede para recarregar
  if ((await sw.evaluate(() => chrome.storage.local.get('sv.farm')))['sv.farm'].on) await shadow('.avb .ab').click().catch(() => {});
  await page.close();
  const p3 = await ctx.newPage();
  await p3.addInitScript(() => { const o = EventTarget.prototype.dispatchEvent; document.dispatchEvent = function (e) { return e && e.type === 'sobrevida:st' ? true : o.call(this, e); }; });
  await p3.addInitScript(jl.nsInit());
  await p3.goto('https://pokesurvivor.com/'); await sleep(3500);
  const sh3 = (sel) => p3.locator(`${jl.HOST} >> css=${sel}`);
  await jl.marcarHost(p3);
  const vis3 = () => p3.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  for (let i = 0; i < 10 && !(await vis3()).some((v) => v === 'scr-login' || v === 'scr-menu' || v === 'scr-test'); i++) { await p3.mouse.click(683, 450); await sleep(1500); }
  if ((await vis3()).includes('scr-login')) await p3.click('#btn-guest');
  const menu3 = await esperar(async () => (await vis3()).includes('scr-menu'), 40000);
  ok(menu3, 'aba nova sem o piloto: chegou ao menu do jogo');
  if (menu3) {
    for (let i = 0; i < 3 && await sh3('.card.on').count(); i++) { await p3.keyboard.press('Escape'); await sleep(400); }
    await p3.evaluate(() => document.querySelector('#scr-menu [data-go="play"]').click());
    await sleep(12000);   // 8 s sem nenhum status = piloto ausente
    ok(await p3.evaluate(() => !['ui', 'over'].includes(window.__NS.Game.state)), 'partida começada à mão na aba sem piloto');
    ok(await esperar(async () => /F5/.test(await sh3('.avb .at').innerText()), 10000), 'piloto ausente/velho: o Auto fica âmbar e pede "Recarregue a página (F5)"');
    ok((await sh3('.avb .at').innerText()).length <= 40 && /F5/.test(await sh3('.avb .at').getAttribute('title')) && await sh3('.avb').evaluate((e) => e.classList.contains('w2')), 'aviso curto (<= 40 caracteres), texto completo no title, classe âmbar');
    await p3.screenshot({ path: path.join(SHOTS, 'auto-ambar.png') });
    ok(await sh3('.avb .ab').getAttribute('aria-pressed') === 'false', 'farm desligado e aviso âmbar ao mesmo tempo (o aviso aparece também com o farm desligado)');
  }
  await p3.close();
  console.log('  arquivos do jogo baixados nesta rodada:', jl.baixados.length, '| fora da lista do espelho:', [...jl.negados].join(', ') || '-');
  await ctx.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
