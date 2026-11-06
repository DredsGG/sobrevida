// Laboratório (0.12.6): o farm gasta TODAS as moedas (trocando de parceiro quantas vezes precisar) antes de começar
// uma partida. Convidado de TESTE no perfil descartável do navegador (moedas, Pokémon e tickets só de laboratório).
// Casos:
//   gastar  — ~600 mil moedas, 20 Pokémon sem melhoria: a partida só começa sem moeda gastável sobrando
//   mortos  — os botões de compra e de "escolher parceiro" não fazem nada: a rotina termina (sem laço) e a partida vem
//   parar   — o farm é desligado no meio da rotina: ela para entre compras/voltas e nenhuma partida começa
//   tudo100 — todos os Pokémon já 100%: não gasta nada e a partida começa
//   gacha   — coleção quase completa, muitos tickets e vários parceiros sem melhoria: tickets zerados (ou parada do
//             gacha registrada) e moedas gastáveis zeradas antes da partida (o que o gacha devolve também é gasto)
// Uso: node testes/lab-gastar.cjs <piloto.js> <caso>
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const [PIL, CASO] = [process.argv[2], process.argv[3] || 'gastar'];
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  await jl.servirJogo(p.context(), jl.PADRAO);
  await p.addInitScript(jl.nsInit());
  await p.addInitScript({ path: PIL });
  await p.addInitScript(() => { window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); }); });
  await p.goto('https://pokesurvivor.com/'); await sleep(3000);
  await p.mouse.click(640, 420); await sleep(2500);
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  if ((await vis()).includes('scr-login')) { await p.click('#btn-guest'); await sleep(1500); }
  for (let i = 0; i < 8 && (await vis()).includes('scr-test'); i++) { await p.click('#test-a button.answer >> nth=0'); await sleep(300); }
  if ((await vis()).includes('scr-result')) { await p.click('#res-ok'); await sleep(1500); }
  if ((await vis()).includes('scr-video')) { await p.click('#video-close'); await sleep(400); }
  // conta de laboratório
  if (process.env.MOEDAS) await p.evaluate((m) => { window.__MOEDAS = m; }, process.env.MOEDAS);
  const info = await p.evaluate((caso) => {
    const N = window.__NS, s = N.DB.save, U = N.Upgrades;
    const fortes = N.DEX.filter((m) => !m.starter).sort((a, b) => b.bst - a.bst);
    const lista = fortes.slice(0, 20).map((m) => m.dex).concat([s.partner]);
    for (const d of lista) s.owned[d] = s.owned[d] || { at: 1, from: 'lab' };
    s.pupg = s.pupg || {};
    if (caso === 'tudo100') { const cheio = {}; for (const u of U.LIST) cheio[u.id] = u.max; for (const d of Object.keys(s.owned)) s.pupg[d] = { ...cheio }; }
    if (caso === 'gacha') {
      for (const m of N.DEX) s.owned[m.dex] = s.owned[m.dex] || { at: 1, from: 'lab' };
      N.DEX.filter((m) => m.gen === 1).slice(-6).forEach((m) => { delete s.owned[m.dex]; });   // faltam 6 em Kanto
      s.tickets.t10 = 30; s.tickets.t1 = 300;
    }
    s.coins = +(window.__MOEDAS || 0) || (caso === 'gacha' ? 300000 : 600000);
    N.UI.refreshCoins();
    return { coins: s.coins, owned: Object.keys(s.owned).length, partner: s.partner, t1: s.tickets.t1, t10: s.tickets.t10 };
  }, CASO);
  console.log('conta de teste:', JSON.stringify(info), 'caso', CASO);
  if (CASO === 'mortos') await p.evaluate(() => {
    // botões de compra e de escolher parceiro mortos (o clique não chega no jogo)
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-buy], #dex-pick, #shop-list button, .shop-item button')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  });
  // moedas gastáveis: a melhoria mais barata do PARCEIRO (o alvo do farm: ele fica até 100%) cabe em (moedas − reserva)?
  // Se o parceiro está 100%, vale o próximo que não está.
  // a reserva vale a do começo da rotina (10% do saldo inicial, no máximo 1.500)
  const PISO = Math.min(1500, Math.floor(info.coins * 0.1));
  const gastavel = () => p.evaluate((piso) => {
    const N = window.__NS, s = N.DB.save, U = N.Upgrades;
    let menor = Infinity, quem = null;
    const prog = (d) => { const lv = N.DB.upgradesOf(d) || {}; return U.LIST.every((u) => (lv[u.id] || 0) >= u.max); };
    const alvos = prog(s.partner) ? Object.keys(s.owned).map(Number).filter((d) => N.DEX_BY[d] && !prog(d)) : [s.partner];
    for (const d of alvos) {
      if (!N.DEX_BY[d]) continue;
      const lv = N.DB.upgradesOf(d) || {};
      for (const u of U.LIST) { const l = lv[u.id] || 0; if (l >= u.max || (u.needs && !lv[u.needs])) continue; const c = U.cost(u.id, l); if (c < menor) { menor = c; quem = d; } }
    }
    return { coins: s.coins, piso, menor: menor === Infinity ? null : menor, quem, sobra: menor !== Infinity && menor <= s.coins - piso };
  }, PISO);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify({ on: true, modo: 'solo', upgrades: true, shop: true, gacha: true, partner: true, missions: false, skins: false, gachaShiny: true }) })));
  const t0 = Date.now(); let jogou = null, parou = false;
  const LIM = CASO === 'parar' ? 25000 : 9 * 60000;
  while (Date.now() - t0 < LIM) {
    await sleep(500);
    jogou = await p.evaluate(() => (window.__NS.Game.state === 'playing' ? true : null));
    if (jogou) break;
    if (CASO === 'parar' && !parou && Date.now() - t0 > 12000) {
      parou = true;
      await p.evaluate(() => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify({ on: false }) })));
      console.log('  (farm desligado aos', Math.round((Date.now() - t0) / 1000), 's)');
    }
  }
  const seg = Math.round((Date.now() - t0) / 1000);
  await sleep(1500);   // o status sai a cada 0,5 s: numa rotina rápida a partida começa antes do status com o resumo
  const g = await gastavel();
  const fim = await p.evaluate(() => { const N = window.__NS, s = N.DB.save, st = window.__st || {};
    return { err: st.err || '', state: N.Game.state, coins: s.coins, t1: s.tickets.t1, t10: s.tickets.t10, rotina: st.rotinaUlt || null, gacha: st.gachaUlt || null,
      acts: (st.acts || []).map((a) => a.k + (a.a && a.a.paraN ? ':' + a.a.paraN : '') + (a.a && a.a.parou ? ':' + a.a.parou : '')) }; });
  console.log(`  ${jogou ? 'partida começou' : 'sem partida'} aos ${seg} s · moedas ${info.coins} → ${fim.coins} (reserva ${g.piso}; melhoria mais barata ${g.menor} do #${g.quem}) · tickets t1 ${fim.t1} t10 ${fim.t10}`);
  if (fim.err) console.log('  ERRO do piloto:', fim.err);
  console.log('  rotina:', JSON.stringify(fim.rotina), '· gacha:', JSON.stringify(fim.gacha));
  console.log('  últimas ações:', JSON.stringify(fim.acts));
  if (CASO === 'gastar') {
    ok(!fim.err, 'sem erro no piloto' + (fim.err ? ': ' + fim.err : ''));
    ok(!!jogou, 'a partida começou depois da rotina');
    ok(!g.sobra, 'a partida só começou sem moeda gastável sobrando' + (g.sobra ? ` (sobrou ${fim.coins}, dava para comprar ${g.menor} no #${g.quem})` : ''));
    ok(fim.coins >= PISO, `a reserva da rotina ficou guardada (${fim.coins} ≥ ${PISO})`);
    ok(fim.rotina && fim.rotina.gasto > 0 && fim.rotina.n >= 2, 'rotina registrou o gasto e os parceiros trabalhados');
  } else if (CASO === 'mortos') {
    ok(!!jogou, 'sem laço infinito: a rotina terminou e a partida começou');
    ok(fim.coins === info.coins, 'nada foi comprado (os botões estavam mortos)');
    ok(fim.rotina && fim.rotina.parou === 'nada-a-comprar', 'motivo registrado: nada-a-comprar');
  } else if (CASO === 'parar') {
    ok(!jogou, 'farm desligado no meio: nenhuma partida começou');
    ok(fim.rotina && fim.rotina.parou === 'desligado', 'motivo registrado: desligado');
  } else if (CASO === 'tudo100') {
    ok(!!jogou, 'todos 100%: a partida começou');
    ok(!g.sobra && (fim.rotina && fim.rotina.gasto <= 1500 * 3), 'não comprou melhoria (só loja: Menta/Cápsula do parceiro, se a conta mandou)');
    ok(fim.rotina && fim.rotina.parou === 'tudo-100', 'motivo registrado: tudo-100');
  } else if (CASO === 'gacha') {
    ok(!!jogou, 'a partida começou depois da rotina');
    ok((fim.t1 < 1 && fim.t10 < 1) || (fim.gacha && fim.gacha.parou && fim.gacha.parou !== 'tickets'), 'tickets acabaram (ou o gacha parou com motivo registrado): ' + JSON.stringify(fim.gacha));
    ok(!g.sobra, 'moedas gastáveis zeradas antes da partida (inclusive as que o gacha devolveu)');
    ok(fim.coins >= Math.min(1500, PISO), 'a reserva ficou guardada');
  }
  await p.screenshot({ path: `gastar-${CASO}.png` });
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
