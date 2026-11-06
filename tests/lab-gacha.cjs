// Laboratório do auto gacha (0.9.0 região; 0.12.4 modo shiny com a coleção completa), contra o jogo local (testes/.game).
//   node testes/lab-gacha.cjs <piloto.js>
// Cenários (cada um com um convidado novo, só no perfil descartável do teste; o save do teste é mexido à mão para montar a cena,
// nunca pelo piloto):
//   0. região: padrão × opção "menos Pokémon" (0.9.0) — o comportamento de antes segue igual
//   a. coleção incompleta → comportamento atual (sem modo shiny, o painel não mostra shiny)
//   b. coleção completa, opção ligada → tira ×100 no banner com MAIS shinies faltando, registra modo:'shiny' e conta shinies
//   c. parada por tiros seguidos sem shiny novo (N baixo de teste: o piloto de teste troca SHINY_SEM_MAX por 300 e o sorteio do
//      jogo é travado para nunca dar shiny)
//   d. todos os shinies obteníveis pegos → para, sem gastar ticket
//   e. opção desligada → não tira
//   f. acabaram os tickets → para e o painel diz o motivo
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const PIL = path.resolve(process.argv[2] || ['instalada', 'extension'].map((d) => path.join(__dirname, '..', d, 'src', 'piloto.js')).find((f) => fs.existsSync(f)));
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = { on: true, modo: 'solo', upgrades: false, shop: false, gacha: true, gachaMenos: false, gachaShiny: true, partner: false, missions: false, skins: false, hud: false, cola: false };

async function cena(b, piloto, montar, cfg, espera) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
  await jl.servirJogo(ctx, jl.PADRAO, { espelhar: process.env.ESPELHAR === '1' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   pageerror', String(e).slice(0, 140)));
  await p.addInitScript({ path: piloto });
  await p.addInitScript(() => { window.__st = null; document.addEventListener('sobrevida:st', (e) => { try { window.__st = JSON.parse(e.detail); } catch (_) {} }); });
  await p.addInitScript(jl.nsInit());
  await p.goto('https://pokesurvivor.com/'); await sleep(3000);
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  for (let i = 0; i < 10 && !(await vis()).some((v) => v === 'scr-login' || v === 'scr-menu' || v === 'scr-test'); i++) { await p.mouse.click(683, 450); await sleep(1500); }
  if ((await vis()).includes('scr-login')) { await p.click('#btn-guest'); await sleep(1500); }
  for (let i = 0; i < 8 && (await vis()).includes('scr-test'); i++) { await p.click('#test-a button.answer >> nth=0'); await sleep(300); }
  if ((await vis()).includes('scr-result')) { await p.click('#res-ok'); await sleep(1500); }
  await p.waitForFunction(() => document.querySelector('#scr-menu') && !document.querySelector('#scr-menu').classList.contains('hidden'), null, { timeout: 40000 });
  await sleep(1500);
  const antes = await p.evaluate(montar);
  await p.evaluate((c) => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify(c) })), Object.assign({}, BASE, cfg));
  const r = await espera(p);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify({ on: false }) })));
  const fim = await p.evaluate(() => { const s = window.__NS.DB.save; return { t1: s.tickets.t1, t10: s.tickets.t10, shiny: Object.keys(s.shiny || {}).length, st: window.__st && { shiny: window.__st.shiny, acts: window.__st.acts, task: window.__st.task } }; });
  await ctx.close();
  return { antes, fim, r };
}
const esperarAte = (cond, ms) => async (p) => { const t = Date.now(); let v = null; while (Date.now() - t < ms) { await sleep(500); v = await p.evaluate(cond); if (v) return v; } return null; };
const gachaAct = () => { const st = window.__st; return st && (st.acts || []).find((x) => x.k === 'gacha') || null; };
// coleção: tudo obtido; opcionalmente todos os shinies obteníveis
const COMPLETA = (todosShiny, deixa) => `() => {
  const N = window.__NS, s = N.DB.save;
  for (const m of N.DEX) s.owned[m.dex] = s.owned[m.dex] || { at: 1, from: 'lab' };
  const obt = N.DEX.filter((m) => N.Sprites.hasShiny(m.dex));
  s.shiny = {};
  if (${todosShiny}) for (const m of obt) s.shiny[m.dex] = { at: 1, from: 'lab' };
  ${deixa || ''}
  s.tickets.t1 = 1000; s.tickets.t10 = 0;
  const falta = {}; for (const m of obt) if (!s.shiny[m.dex]) falta[m.gen] = (falta[m.gen] || 0) + 1;
  return { obt: obt.length, faltaPorGen: falta, pity: s.pity || {} };
}`;

const SO = process.env.SO || '';
const roda = (k) => !SO || SO.includes(k);
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  // piloto de teste com N baixo (a constante é fácil de mudar: uma linha)
  const src = fs.readFileSync(PIL, 'utf8');
  ok(/const SHINY_SEM_MAX = 3000;/.test(src), 'piloto: SHINY_SEM_MAX = 3000 (constante de uma linha)');
  const pil300 = path.join(os.tmpdir(), 'piloto-shiny-300.js');
  fs.writeFileSync(pil300, src.replace('const SHINY_SEM_MAX = 3000;', 'const SHINY_SEM_MAX = 300;'));
  let r;

  // 0. região (0.9.0): Kanto quase completo, as outras com 3 — padrão fecha Kanto; "menos Pokémon" vai para onde há mais novos por tiro
  const KANTO = `() => { const N = window.__NS, s = N.DB.save; const k = N.DEX.filter((x) => x.gen === 1); k.slice(0, k.length - 5).forEach((x) => { s.owned[x.dex] = s.owned[x.dex] || { at: 1 }; });
    for (let g = 2; g <= 9; g++) N.DEX.filter((x) => x.gen === g).slice(0, 3).forEach((x) => { s.owned[x.dex] = s.owned[x.dex] || { at: 1 }; }); s.tickets.t10 = 1; s.tickets.t1 = 0; }`;
  if (roda('0')) for (const menos of [false, true]) {
    r = await cena(b, PIL, eval(KANTO), { gachaMenos: menos }, esperarAte(gachaAct, 40000));
    ok(r.r && r.r.a && r.r.a.gen === (menos ? 5 : 1) && r.r.a.modo === undefined, `0. ${menos ? 'opção "menos Pokémon"' : 'padrão'}: região ${r.r && r.r.a && r.r.a.gen} (esperado ${menos ? 5 : 1}), ${r.r && r.r.a && r.r.a.n} tiros, ${r.r && r.r.a && r.r.a.nn} novos, sem modo shiny`);
  }
  // a. coleção incompleta (faltam 5 em Kanto) → comportamento atual, mesmo com a opção shiny ligada
  if (roda('a')) {
    r = await cena(b, PIL, eval(KANTO), { gachaShiny: true }, esperarAte(gachaAct, 40000));
    ok(r.r && r.r.a && r.r.a.modo === undefined && r.fim.st && r.fim.st.shiny === null, 'a. coleção incompleta: tira como antes (sem modo:"shiny") e o painel não mostra shiny');
  }

  // b. coleção completa → modo shiny
  if (roda('b')) {
    r = await cena(b, PIL, eval(COMPLETA(false)), {}, esperarAte(() => { const st = window.__st, a = st && (st.acts || []).find((x) => x.k === 'gacha' && x.a.modo === 'shiny'); return a || null; }, 150000));
    const a = r.r && r.r.a;
    const topo = Object.entries(r.antes.faltaPorGen).sort((x, y) => y[1] - x[1]).filter((e, i, l) => e[1] === l[0][1]).map(([g]) => +g);
    console.log('   obteníveis:', r.antes.obt, '| faltam por banner:', JSON.stringify(r.antes.faltaPorGen), '| bancos usados:', a && JSON.stringify(a.gens), '| tiros:', a && a.n, '| shiny novos:', a && a.sh, '| painel:', JSON.stringify(r.fim.st && r.fim.st.shiny));
    ok(!!a && a.modo === 'shiny', 'b. coleção completa: a ação do gacha registra modo:"shiny"');
    ok(!!a && a.n >= 1000 && a.n % 10 === 0, `b. tira em blocos ×100 pelos botões do jogo (${a && a.n} tiros; só o resto dos tickets sai em ×10, como no gacha de antes)`);
    ok(!!a && topo.includes(a.gens[0]) && a.gen === a.gens[0], `b. começa pelo banner com mais shinies faltando (banner ${a && a.gen}; empatados no topo: ${topo})`);
    ok(!!a && a.sh > 0 && r.fim.shiny === a.sh && r.fim.st.shiny.tem === a.sh, `b. conta os shinies novos: ${a && a.sh} no registro = ${r.fim.shiny} no save = "tem ${r.fim.st && r.fim.st.shiny && r.fim.st.shiny.tem}" no painel`);
    ok(r.fim.st.shiny.de === r.antes.obt && r.fim.st.shiny.desde >= 0 && r.fim.st.shiny.max === 3000, `b. painel: Shiny ${r.fim.st.shiny.tem} de ${r.fim.st.shiny.de} (obteníveis ${r.antes.obt}), ${r.fim.st.shiny.desde} tiros desde o último, N = ${r.fim.st.shiny.max}`);
    ok(r.fim.t1 < 100, `b. gastou os tickets pelos botões (t1 ${1000} → ${r.fim.t1})`);
  }

  // c. parada por tiros seguidos sem shiny novo (N = 300 no piloto de teste; o sorteio do jogo travado: nunca dá shiny)
  if (roda('c')) {
    r = await cena(b, pil300, eval(COMPLETA(false).replace('s.tickets.t1 = 1000;', 's.tickets.t1 = 5000; Math.random = () => 0.5;')), {}, esperarAte(() => { const s = window.__st && window.__st.shiny; return s && s.parou === 'n' ? s : null; }, 150000));
    const ac = (r.fim.st.acts || []).find((x) => x.k === 'gacha'), gastos = ac ? ac.a.n : 0;
    if (process.env.DEBUG) console.log('   painel final:', JSON.stringify(r.fim.st));
    ok(!!r.r && r.r.parou === 'n', `c. parou por "N tiros seguidos sem shiny novo": parou=${r.r && r.r.parou}, desde=${r.r && r.r.desde}, max=${r.r && r.r.max}`);
    ok(gastos >= 300 && gastos <= 450, `c. tirou só o necessário: ${gastos} tiros (N = 300, blocos de 100) e sobrou ticket (t1 ${r.fim.t1})`);
  }

  // d. todos os shinies obteníveis pegos → para, sem gastar ticket
  if (roda('d')) {
    r = await cena(b, PIL, eval(COMPLETA(true)), {}, async (p) => { await sleep(14000); return p.evaluate(() => window.__st && window.__st.shiny); });
    ok(!!r.r && r.r.parou === 'todos' && r.r.tem === r.r.de && r.fim.t1 >= 1000 && !(r.fim.st.acts || []).some((x) => x.k === 'gacha'), `d. todos pegos (${r.r && r.r.tem} de ${r.r && r.r.de}): parou="${r.r && r.r.parou}", nenhum ticket gasto (t1 ${r.fim.t1} >= 1000; o farm joga partida e ganha tickets), sem ação de gacha`);
  }

  // e. opção desligada → não tira
  if (roda('e')) {
    r = await cena(b, PIL, eval(COMPLETA(false)), { gachaShiny: false }, async (p) => { await sleep(14000); return p.evaluate(() => window.__st); });
    ok(r.fim.t1 >= 1000 && !(r.fim.st.acts || []).some((x) => x.k === 'gacha') && r.fim.st.shiny === null, `e. opção desligada: não tirou (t1 ${r.fim.t1}) e o painel não mostra shiny`);
  }

  // f. acabaram os tickets → para e o painel diz o motivo
  if (roda('f')) {
    r = await cena(b, PIL, eval(COMPLETA(false).replace('s.tickets.t1 = 1000;', 's.tickets.t1 = 100; Math.random = () => 0.5;')), {}, esperarAte(() => { const s = window.__st && window.__st.shiny; return s && s.parou === 'tickets' ? s : null; }, 80000));
    ok(!!r.r && r.r.parou === 'tickets' && r.fim.t1 < 10, `f. sem tickets: parou="${r.r && r.r.parou}" (t1 ${r.fim.t1})`);
  }

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
