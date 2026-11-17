// Laboratório (0.13.3): o que mudou na partida no build afdb307d50 (16/11) e a Sobrevida passou a tratar.
//   item    — itens soltos no chão pelo próprio jogo (Pickups.drop) nos 3 formatos da tela: vaga livre (leva o útil,
//             deixa o inútil), 1 item (troca só por um melhor) e 3 itens (troca o pior; fica se o novo é pior)
//   cassino — o cassino da Equipe Rocket aberto pelo próprio jogo (Game.casino): o farm sai sem apostar e a partida segue
//   esferas — uma esfera de ataque com o jogador em perigo: o jogo usa a esfera DENTRO do quadro (pela tecla), nunca o
//             farm chamando Orbs.use pelo laço dele
//   poder   — a marca de poder do jogo (player.powerPick): o farm escolhe Teracristal no tipo do golpe principal e usa o
//             poder pela tecla do jogo (Power.press chamado pelo quadro do jogo, não pelo farm)
//   cartas  — subida de nível de verdade: 4 cartas, o farm escolhe e nunca a carta que só esquece golpe
//   beat    — o relatório de cada minuto (Ranking.beat) é barrado com o farm ligado E depois de desligar na mesma partida
// Convidado de TESTE, jogo local (espelho). Só a partida deste navegador de teste é mexida.
// Uso: node testes/lab-partida-0133.cjs <piloto.js> [casos]
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const PIL = process.argv[2];
const SO = (process.argv[3] || 'item,cassino,esferas,poder,cartas,beat').split(',');
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR' });
  const logs = [];
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (/\[Sobrevida\]/.test(t)) logs.push(t); });
  await jl.servirJogo(p.context(), jl.PADRAO, { espelhar: !!process.env.ESPELHAR });
  const rede = [];
  p.on('request', (r) => { if (/\/v1\/(run|rank)\//.test(r.url())) rede.push(r.url()); });
  await p.addInitScript(jl.nsInit());
  await p.addInitScript({ path: PIL });
  await p.addInitScript(() => { window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); }); });
  await p.goto('https://pokesurvivor.com/?svdebug=1'); await sleep(3000);
  await p.mouse.click(640, 420); await sleep(2500);
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  if ((await vis()).includes('scr-login')) { await p.click('#btn-guest'); await sleep(1500); }
  for (let i = 0; i < 8 && (await vis()).includes('scr-test'); i++) { await p.click('#test-a button.answer >> nth=0'); await sleep(300); }
  if ((await vis()).includes('scr-result')) { await p.click('#res-ok'); await sleep(1500); }
  if ((await vis()).includes('scr-video')) { await p.click('#video-close'); await sleep(400); }
  // quem chama Orbs.use e Power.press: o quadro do jogo ou o laço do farm (pela pilha)
  await p.evaluate(() => {
    const N = window.__NS; window.__chamadas = [];
    const pilha = () => { const s = String(new Error().stack || ''); return /housekeeping|escolhaNova/.test(s) ? 'farm' : 'jogo'; };
    const oU = N.Orbs.use; N.Orbs.use = function () { window.__chamadas.push({ f: 'orb', de: pilha() }); return oU.apply(this, arguments); };
    const R = window.__NSRAW.Power; const oP = R.press; R.press = function () { window.__chamadas.push({ f: 'power', de: pilha() }); return oP.apply(this, arguments); };
  });
  const cfg = (o) => p.evaluate((o) => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify(Object.assign({ on: true, modo: 'solo', upgrades: false, shop: false, gacha: false, partner: false, missions: false, skins: false, ovos: false, itemInicial: false }, o)) })), o);
  await cfg({});
  let jogando = false;
  for (let i = 0; i < 160 && !jogando; i++) { await sleep(500); jogando = await p.evaluate(() => window.__NS.Game.state === 'playing' && !!window.__NS.Game.player); }
  ok(jogando, 'a partida começou com o farm');
  const vivo = () => p.evaluate(() => { const pl = window.__NS.Game.player; if (pl && !pl.dead) pl.hp = Math.max(pl.hp, pl.maxHp * 0.9); });
  const esperaJogo = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await p.evaluate(() => window.__NS.Game.state); if (s === 'playing') return true; await vivo(); await sleep(250); } return false; };
  const held = () => p.evaluate(() => window.__NS.Game.player.heldItems().slice());
  const solta = async (id) => {
    await esperaJogo(8000);
    const t0 = Date.now();
    await p.evaluate((id) => { const N = window.__NS, pl = N.Game.player; N.Pickups.drop('item', pl.x, pl.y, id); }, id);
    let abriu = false, fechou = false;
    for (let i = 0; i < 60; i++) { await sleep(100); const o = await p.evaluate(() => window.__NS.UI.isOpen('scr-item')); if (o) abriu = true; if (abriu && !o) { fechou = true; break; } }
    await sleep(400);
    return { abriu, fechou, ms: Date.now() - t0, held: await held() };
  };
  if (SO.includes('item')) {
    const h0 = await held();
    console.log('  itens no começo:', JSON.stringify(h0));
    let r = await solta('radargoggles');
    ok(r.abriu && r.fechou, `vaga livre, Gafas Radar: a tela abriu e fechou (${r.ms} ms)`);
    ok(!r.held.includes('radargoggles'), `vaga livre: deixou as Gafas Radar (leva ${JSON.stringify(r.held)})`);
    r = await solta('leftovers');
    ok(r.fechou && r.held.includes('leftovers'), `vaga livre: levou os Restos (leva ${JSON.stringify(r.held)})`);
    const um = r.held.length === 1;
    r = await solta('amuletcoin');
    ok(r.fechou && r.held.includes('amuletcoin') && (!um || !r.held.includes('leftovers')), `1 item: trocou os Restos pela Moneda Amuleto (leva ${JSON.stringify(r.held)})`);
    r = await solta('superpads');
    ok(r.fechou && r.held.includes('amuletcoin') && !r.held.includes('superpads'), `1 item: ficou com a Moneda Amuleto (Supertapones é pior) (leva ${JSON.stringify(r.held)})`);
    await p.evaluate(() => { window.__NS.Game.player.itemSlots = 3; });   // 3 vagas (como com Segundo e Tercer objeto)
    r = await solta('leftovers'); r = await solta('quickclaw');
    ok(r.fechou && ['amuletcoin', 'leftovers', 'quickclaw'].every((x) => r.held.includes(x)), `3 vagas: levou Restos e Garra Rápida nas vagas livres (leva ${JSON.stringify(r.held)})`);
    r = await solta('luckincense');
    ok(r.fechou && r.held.includes('luckincense') && !r.held.includes('quickclaw') && r.held.includes('amuletcoin') && r.held.includes('leftovers'), `3 itens: trocou o pior (Garra Rápida) pelo Incienso Suerte (leva ${JSON.stringify(r.held)})`);
    r = await solta('superpads');
    ok(r.fechou && !r.held.includes('superpads') && r.held.length === 3, `3 itens: ficou com os que leva (Supertapones é pior que todos) (leva ${JSON.stringify(r.held)})`);
  }
  if (SO.includes('cassino')) {
    await esperaJogo(8000);
    const a = await p.evaluate(() => ({ c: window.__NS.DB.save.coins, t: Math.round(window.__NS.Game.st.time) }));
    await p.evaluate(() => { window.__casinoFim = false; window.__NS.Game.casino(() => { window.__casinoFim = true; }); });
    let abriu = false, fechou = false; const t0 = Date.now();
    for (let i = 0; i < 100; i++) { await sleep(100); const o = await p.evaluate(() => window.__NS.UI.isOpen('scr-casino')); if (o) abriu = true; if (abriu && !o) { fechou = true; break; } }
    const ms = Date.now() - t0;
    await sleep(1500);
    const z = await p.evaluate(() => ({ c: window.__NS.DB.save.coins, st: window.__NS.Game.state, fim: window.__casinoFim, acts: ((window.__st || {}).acts || []).map((x) => x.k), t: Math.round(window.__NS.Game.st.time) }));
    ok(abriu, 'o cassino da Rocket abriu (Game.casino, o caminho do próprio jogo)');
    ok(fechou && ms < 5000, `o farm saiu do cassino (${ms} ms)`);
    ok(z.fim && /playing|held|levelup|choice/.test(z.st), `a partida voltou (estado ${z.st})`);
    ok(z.c === a.c, `nenhuma moeda apostada (${a.c} → ${z.c})`);
    ok(z.acts.includes('casino'), 'o painel registrou a saída do cassino');
    const s2 = await esperaJogo(6000); await sleep(2500);
    const t2 = await p.evaluate(() => Math.round(window.__NS.Game.st.time));
    ok(s2 && t2 > z.t, `o tempo da partida voltou a andar (${z.t} → ${t2} s)`);
  }
  if (SO.includes('esferas')) {
    await esperaJogo(8000);
    const n0 = await p.evaluate(() => window.__chamadas.filter((x) => x.f === 'orb').length);
    await p.evaluate(() => { const N = window.__NS, pl = N.Game.player; N.Pickups.drop('sphere', pl.x, pl.y, 'slumber'); });
    await sleep(1500);
    const tem = await p.evaluate(() => (window.__NS.Game.player.orbs || []).filter(Boolean).map((o) => o.id));
    console.log('  esferas na mão:', JSON.stringify(tem));
    // perigo: vida abaixo de 40% (só nesta partida de teste)
    let usou = false;
    for (let i = 0; i < 30 && !usou; i++) { await p.evaluate(() => { const pl = window.__NS.Game.player; pl.hp = pl.maxHp * 0.3; }); await sleep(200); usou = await p.evaluate((n0) => window.__chamadas.filter((x) => x.f === 'orb').length > n0, n0); }
    await vivo();
    const ch = await p.evaluate((n0) => window.__chamadas.filter((x) => x.f === 'orb').slice(n0), n0);
    console.log('  Orbs.use:', JSON.stringify(ch));
    ok(tem.includes('slumber'), 'pegou a Soporesfera do chão');
    ok(usou, 'usou a esfera de ataque com a vida baixa');
    ok(ch.length > 0 && ch.every((x) => x.de === 'jogo'), 'Orbs.use foi chamado pelo quadro do jogo (tecla), não pelo laço do farm');
  }
  if (SO.includes('poder')) {
    await esperaJogo(8000);
    const n0 = await p.evaluate(() => window.__chamadas.filter((x) => x.f === 'power').length);   // antes da escolha: o farm usa logo
    await p.evaluate(() => { window.__NS.Game.player.powerPick = true; });
    let fechou = false;
    for (let i = 0; i < 80 && !fechou; i++) { await sleep(150); fechou = await p.evaluate(() => !!window.__NS.Game.player.epower && !window.__NS.UI.isOpen('scr-power')); }
    const e = await p.evaluate(() => { const N = window.__NS, pl = N.Game.player, ep = pl.epower || {}; const opts = window.__NSRAW.Power.options(pl.dex != null ? pl.dex : pl.mon.dex).map((o) => o.kind); return { kind: ep.kind, type: ep.type, opts, tipos: pl.mon.types, golpes: pl.moves.filter((m) => m.kind !== 'buff').map((m) => m.id + ':' + m.type) }; });
    console.log('  poder:', JSON.stringify(e));
    ok(fechou, 'a tela do poder fechou com uma escolha');
    ok(!e.opts.includes('tera') || e.kind === 'tera', `escolheu Teracristal (${e.kind} ${e.type})`);
    ok(e.kind !== 'tera' || e.golpes.some((g) => g.endsWith(':' + e.type)), `o tipo do Teracristal é o de um golpe que ele usa (${e.type})`);
    // usar: o poder fica pronto e o farm aperta a tecla do jogo
    let ligou = false;
    for (let i = 0; i < 60 && !ligou; i++) { await vivo(); await sleep(250); ligou = await p.evaluate(() => { const ep = window.__NS.Game.player.epower; return !!(ep && (ep.on || ep.times > 0)); }); }
    const ch = await p.evaluate((n0) => window.__chamadas.filter((x) => x.f === 'power').slice(n0), n0);
    console.log('  Power.press:', JSON.stringify(ch));
    ok(ligou, 'o farm usou o poder quando ficou pronto');
    ok(ch.length > 0 && ch.every((x) => x.de === 'jogo'), 'Power.press foi chamado pelo quadro do jogo (tecla), não pelo farm');
    await esperaJogo(15000);
  }
  if (SO.includes('cartas')) {
    const vistos = [];
    await p.evaluate(() => { window.__lv = []; const N = window.__NS, o = N.LevelUp.offer; N.LevelUp.offer = function () { const r = o.apply(this, arguments); window.__lv.push(r.map((c) => c.type + ':' + c.key)); return r; }; });
    const l0 = logs.length;
    for (let i = 0; i < 120; i++) { await vivo(); await sleep(500); const n = await p.evaluate(() => window.__lv.length); if (n >= 6) break; }
    await esperaJogo(8000);
    const lv = await p.evaluate(() => window.__lv);
    const picks = logs.slice(l0).filter((t) => / pick /.test(t)).map((t) => t.replace(/.*pick /, ''));
    console.log('  ofertas:', JSON.stringify(lv.slice(0, 4)), 'escolhas:', JSON.stringify(picks.slice(0, 8)));
    ok(lv.length >= 3, `subiu de nível ${lv.length} vez(es) com o farm`);
    ok(lv.length > 0 && lv.every((o) => o.length === 4 || o.length >= 3), `as ofertas têm 4 cartas (${lv.map((o) => o.length).join(',')})`);
    ok(picks.length >= Math.min(3, lv.length), `o farm escolheu em todas (${picks.length} escolhas)`);
    ok(picks.every((k) => !/^forget/.test(k)), 'nunca escolheu a carta Quitamovimientos');
    void vistos;
  }
  if (SO.includes('beat')) {
    const conta = () => logs.filter((t) => /ranking bloqueado/.test(t)).length;
    const n0 = conta();
    await p.evaluate(() => window.__NSRAW.Ranking.beat({ t: 60, lv: 5, kills: 10, dmg: 0 }));
    await sleep(300);
    ok(conta() > n0, 'Ranking.beat barrado com o farm ligado');
    await cfg({ on: false }); await sleep(800);
    const n1 = conta();
    const st = await p.evaluate(() => window.__NS.Game.state);
    await p.evaluate(() => window.__NSRAW.Ranking.beat({ t: 120, lv: 6, kills: 20, dmg: 0 }));
    await sleep(300);
    ok(conta() > n1, `Ranking.beat barrado depois de desligar o farm na mesma partida (estado ${st})`);
    ok(!rede.some((u) => /run\/beat|rank\/submit|run\/start/.test(u)), `nada de selo, beat ou submit na rede (${rede.length} chamadas /v1/run|rank)`);
  }
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})();
