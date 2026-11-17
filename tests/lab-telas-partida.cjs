// Laboratório (0.13.2): as telas novas do meio da partida (builds de 14–16/11) não podem parar o farm.
//   evo     — partida de verdade até passar do nível 20: a tela de evolução/forma (scr-evo) abre e o farm escolhe
//             "não mudar" (o parceiro continua o mesmo Pokémon); a partida segue
//   poder   — a marca de poder do próprio jogo (player.powerPick) abre scr-power: o farm escolhe e a partida segue
//   esquecer— a marca de esquecer golpe (player.forgetPick) abre scr-forget: o farm não esquece nenhum golpe
// Convidado de TESTE, jogo local (espelho), rotina toda desligada. Só a partida deste navegador de teste é mexida.
// Uso: node testes/lab-telas-partida.cjs <piloto.js> [casos]
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const PIL = process.argv[2];
const SO = (process.argv[3] || 'evo,poder,esquecer').split(',');
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR' });
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  await jl.servirJogo(p.context(), jl.PADRAO, { espelhar: !!process.env.ESPELHAR });
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
  // registra cada abertura/fechamento das telas novas e o Pokémon do jogador
  await p.evaluate(() => {
    const N = window.__NS; window.__telas = []; const ab = {};
    setInterval(() => {
      for (const id of ['scr-evo', 'scr-power', 'scr-forget']) {
        const o = N.UI.isOpen(id);
        if (o && !ab[id]) { ab[id] = performance.now(); window.__telas.push({ id, abriu: Math.round((N.Game.st && N.Game.st.time) || 0), dex: N.Game.player && N.Game.player.mon.dex, lvl: N.Game.player && N.Game.player.level, cartas: (document.getElementById(id === 'scr-evo' ? 'evo-cards' : id === 'scr-power' ? 'pow-cards' : 'forget-cards') || { children: [] }).children.length }); }
        if (!o && ab[id]) { const t = window.__telas.filter((x) => x.id === id).at(-1); t.ms = Math.round(performance.now() - ab[id]); t.dexDepois = N.Game.player && N.Game.player.mon.dex; ab[id] = 0; }
      }
    }, 50);
  });
  const dexMenu = await p.evaluate(() => window.__NS.DB.save.partner);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify({ on: true, modo: 'solo', upgrades: false, shop: false, gacha: false, partner: false, missions: false, skins: false, moves: false }) })));
  let jogando = false;
  for (let i = 0; i < 160 && !jogando; i++) { await sleep(500); jogando = await p.evaluate(() => window.__NS.Game.state === 'playing' && !!window.__NS.Game.player); }
  ok(jogando, 'a partida começou com o farm');
  const estado = () => p.evaluate(() => { const N = window.__NS, pl = N.Game.player; return { st: N.Game.state, t: Math.round((N.Game.st && N.Game.st.time) || 0), lvl: pl && pl.level, dex: pl && pl.mon.dex, moves: pl ? pl.moves.map((m) => m.id).join(',') : '', telas: window.__telas, log: ((window.__st || {}).acts || []).slice(-3).map((a) => a.k) }; });
  const seguiu = async (ms) => { const a = await estado(); await sleep(ms); const z = await estado(); return { a, z, andou: z.t > a.t }; };
  const vivo = () => p.evaluate(() => { const pl = window.__NS.Game.player; if (pl) { pl.hp = pl.maxHp || pl.hp; } });   // a partida de teste não acaba antes do nível 20
  if (SO.includes('poder')) {
    const antes = await estado();
    await p.evaluate(() => { window.__NS.Game.player.powerPick = true; });
    await sleep(6000);
    const t = (await estado()).telas.filter((x) => x.id === 'scr-power');
    console.log('  poder:', JSON.stringify(t));
    ok(t.length > 0, 'a marca de poder do jogo abriu scr-power');
    ok(t.length > 0 && t.every((x) => x.ms != null && x.ms < 4000), `o farm escolheu o poder e a tela fechou (${t.map((x) => x.ms).join(',')} ms)`);
    const s = await seguiu(3000);
    ok(s.andou && /playing|held/.test(s.z.st), `a partida seguiu depois do poder (estado ${s.z.st}, tempo ${s.a.t} → ${s.z.t})`);
    void antes;
  }
  if (SO.includes('esquecer')) {
    const antes = await estado();
    await p.evaluate(() => { window.__NS.Game.player.forgetPick = 1; });
    await sleep(6000);
    const d = await estado(), t = d.telas.filter((x) => x.id === 'scr-forget');
    console.log('  esquecer:', JSON.stringify(t), 'golpes', antes.moves, '→', d.moves);
    ok(t.length > 0, 'a marca de esquecer do jogo abriu scr-forget');
    ok(t.length > 0 && t.every((x) => x.ms != null && x.ms < 4000), `o farm respondeu e a tela fechou (${t.map((x) => x.ms).join(',')} ms)`);
    // um nível subido nesses 6 s pode ACRESCENTAR golpe (cartas do nível); o que não pode é sumir um golpe de antes
    const depoisG = d.moves.split(',');
    ok(antes.moves.split(',').filter(Boolean).every((m) => depoisG.includes(m)), `nenhum golpe foi esquecido (${antes.moves} → ${d.moves})`);
    const s = await seguiu(3000);
    ok(s.andou && /playing|held|levelup/.test(s.z.st), `a partida seguiu depois do esquecer (estado ${s.z.st})`);
  }
  if (SO.includes('evo')) {
    let e = await estado(); const dex0 = e.dex;
    console.log('  evo: parceiro', dexMenu, 'na partida', dex0, 'nível', e.lvl);
    for (let i = 0; i < 900 && !(e.telas.some((x) => x.id === 'scr-evo' && x.ms != null) && e.lvl > 20); i++) { await vivo(); await sleep(1000); e = await estado(); if (e.st === 'over' || e.st === 'ui') break; if (i % 30 === 0) console.log(`  … ${e.t} s, nível ${e.lvl}, ${e.st}`); }
    const t = e.telas.filter((x) => x.id === 'scr-evo');
    console.log('  evo:', JSON.stringify(t), 'estado', e.st, 'nível', e.lvl);
    ok(t.length > 0, 'a tela de evolução/forma (scr-evo) abriu na partida de verdade');
    ok(t.length > 0 && t.every((x) => x.ms != null && x.ms < 4000), `o farm escolheu e a tela fechou (${t.map((x) => x.ms).join(',')} ms)`);
    ok(t.length > 0 && t.every((x) => x.dexDepois === x.dex), 'o parceiro continuou o mesmo Pokémon ("não mudar")');
    const s = await seguiu(3000);
    ok(s.andou && /playing|held|levelup/.test(s.z.st), `a partida seguiu depois da evolução (estado ${s.z.st}, tempo ${s.a.t} → ${s.z.t})`);
  }
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})();
