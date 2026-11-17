// Laboratório (0.13.3): o que mudou no menu no build afdb307d50 (16/11) e a Sobrevida passou a tratar.
//   modo    — Difícil liberada e janela estreita (700 px: o seletor #menu-modes some): "Jogar" abre scr-mode; o farm
//             escolhe o modo que a pessoa já usa e a partida começa. Com a opção "modo mais difícil": a Difícil.
//   chal    — a pessoa abre o desafio da semana por cima do menu: o farm não clica em nada (nem "Jogar", nem o desafio)
//   robo    — a camada "Comprobando que no eres un robot…" do jogo aparece: o farm desliga e avisa (status robo)
//   ovos    — um ovo pronto na Incubadora: a rotina abre pelo botão "Abrir" do jogo
//   item    — "Objeto inicial" comprado e uma Moneda Amuleto na Mochila: a rotina escolhe a Moneda Amuleto pelo
//             botão da melhoria; sem renda medida, não compra outra
//   melhor  — melhorias na conta nova: com pouca moeda, a primeira compra é a Fortuna
// Convidado de TESTE no navegador de teste (o save de laboratório é ajustado só aqui). Jogo local (espelho).
// Uso: node testes/lab-menu-0133.cjs <piloto.js> [casos]
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const PIL = process.argv[2];
const SO = (process.argv[3] || 'modo,chal,robo,ovos,item,melhor').split(',');
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = { on: true, modo: 'solo', upgrades: false, shop: false, gacha: false, partner: false, missions: false, skins: false, ovos: false, itemInicial: false, dificil: false };
async function abrir(largura) {
  const b = await chromium.launch({ args: ['--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const p = await b.newPage({ viewport: { width: largura || 1366, height: 768 }, locale: 'pt-BR' });
  const logs = [];
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (/\[Sobrevida\]/.test(t)) logs.push(t); });
  await jl.servirJogo(p.context(), jl.PADRAO, { espelhar: !!process.env.ESPELHAR });
  await p.addInitScript(jl.nsInit());
  await p.addInitScript({ path: PIL });
  await p.addInitScript(() => { window.__st = null; document.addEventListener('sobrevida:st', (e) => { window.__st = JSON.parse(e.detail); }); });
  await p.goto('https://pokesurvivor.com/?svdebug=1'); await sleep(3000);
  await p.mouse.click(Math.min(640, (largura || 1366) / 2), 420); await sleep(2500);
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id));
  if ((await vis()).includes('scr-login')) { await p.click('#btn-guest'); await sleep(1500); }
  for (let i = 0; i < 8 && (await vis()).includes('scr-test'); i++) { await p.click('#test-a button.answer >> nth=0'); await sleep(300); }
  if ((await vis()).includes('scr-result')) { await p.click('#res-ok'); await sleep(1500); }
  if ((await vis()).includes('scr-video')) { await p.click('#video-close'); await sleep(400); }
  for (let i = 0; i < 40 && !(await p.evaluate(() => !!(window.__NS && window.__NS.DB && window.__NS.DB.save))); i++) await sleep(250);
  const cfg = (o) => p.evaluate((o) => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify(o) })), Object.assign({}, BASE, o));
  const estado = () => p.evaluate(() => ({ st: window.__NS.Game.state, scr: [...document.querySelectorAll('.scr')].filter((e) => !e.classList.contains('hidden')).map((e) => e.id), mode: window.__NS.DB.save.mode || null, on: (window.__st || {}).on, robo: (window.__st || {}).robo, acts: ((window.__st || {}).acts || []).map((a) => a.k) }));
  // farm desligado e de volta ao menu (a rotina sempre termina começando uma partida)
  const aoMenu = async () => {
    await cfg({ on: false }); await sleep(600);
    if ((await estado()).st !== 'ui') { await p.evaluate(() => window.__NS.Game.quit && window.__NS.Game.quit()); await sleep(1500); }
    for (let i = 0; i < 20; i++) { const e = await estado(); if (e.st === 'ui' && e.scr.includes('scr-menu') && !e.scr.includes('scr-over')) break; await p.evaluate(() => { const v = document.querySelector('#over-back'); if (v && v.offsetParent) v.click(); }); await sleep(700); }
  };
  return { b, p, logs, cfg, estado, vis, aoMenu };
}
const esperar = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };

(async () => {
  if (SO.includes('modo')) {
    const { b, p, cfg, estado, aoMenu } = await abrir(700);
    await p.evaluate(() => { const s = window.__NS.DB.save; s.modeWins = { normal: 1 }; s.mode = 'normal'; });   // Difícil liberada (save de laboratório)
    const mm = await p.evaluate(() => { const e = document.getElementById('menu-modes'); return e ? !!(e.offsetWidth || e.offsetHeight) : null; });
    console.log('  #menu-modes visível a 700 px:', mm);
    await cfg({});
    let viu = false;
    const comecou = await esperar(async () => { const e = await estado(); if (e.scr.includes('scr-mode')) viu = true; return e.st !== 'ui' && e.st !== 'over'; }, 30000);
    const e1 = await estado();
    ok(viu || mm === true, `"Jogar" abriu a escolha de dificuldade (scr-mode) ${viu ? '' : '(o seletor estava visível)'}`);
    ok(comecou, `a partida começou (estado ${e1.st})`);
    ok(e1.mode === 'normal', `no modo que você já usava (${e1.mode})`);
    // de volta ao menu e com a opção "modo mais difícil"
    await aoMenu();
    await cfg({ dificil: true });
    const c2 = await esperar(async () => { const e = await estado(); return e.st !== 'ui' && e.st !== 'over'; }, 30000);
    const e2 = await estado();
    ok(c2 && e2.mode === 'hard', `com "modo mais difícil": partida na Difícil (${e2.mode}, estado ${e2.st})`);
    await b.close();
  }
  if (SO.includes('chal') || SO.includes('robo')) {
    const { b, p, cfg, estado, logs } = await abrir(1366);
    if (SO.includes('chal')) {
      await p.evaluate(() => { const g = document.querySelector('#scr-menu [data-go="chal"]'); if (g) g.click(); });   // a "pessoa" abre o desafio
      await sleep(800);
      const e0 = await estado();
      console.log('  telas:', e0.scr.join(','));
      await cfg({});
      await sleep(9000);
      const e1 = await estado();
      ok(e0.scr.includes('scr-chal'), 'o desafio da semana abriu por cima do menu');
      ok(e1.st === 'ui' && e1.scr.includes('scr-chal'), `o farm não começou partida nem fechou o desafio (estado ${e1.st}; ${e1.scr.join(',')})`);
      ok(!logs.some((t) => /chal/.test(t)), 'nenhum clique do farm no desafio');
      await cfg({ on: false });
      await p.evaluate(() => { const x = document.querySelector('#scr-chal [data-back]'); if (x) x.click(); });
      await sleep(800);
    }
    if (SO.includes('robo')) {
      await cfg({});
      // a mesma camada que o jogo monta para o Turnstile (só aqui, no navegador de teste)
      await p.evaluate(() => { const d = document.createElement('div'); d.setAttribute('translate', 'no'); d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;background:rgba(11,16,32,.92);color:#fff'; const t = document.createElement('p'); t.textContent = 'Comprobando que no eres un robot…'; d.append(t, document.createElement('div')); document.body.appendChild(d); window.__robo = d; });
      const desligou = await esperar(async () => { const e = await estado(); return e.robo === true && e.on === false; }, 5000);
      await sleep(7000);
      const e = await estado();
      ok(desligou, `o farm desligou e avisou (on ${e.on}, robo ${e.robo})`);
      ok(e.st === 'ui', `nenhuma partida começou por cima da verificação (estado ${e.st})`);
      ok(e.acts.includes('robo'), 'o painel registrou a verificação');
      await p.evaluate(() => window.__robo.remove());
    }
    await b.close();
  }
  if (SO.includes('ovos') || SO.includes('item') || SO.includes('melhor')) {
    const { b, p, cfg, estado, logs, aoMenu } = await abrir(1366);
    if (SO.includes('ovos')) {
      const info = await p.evaluate(() => {
        const E = window.__NSRAW.Eggs, s = window.__NS.DB.save;
        try { E.give(1); } catch (e) {}   // give(região): o mesmo que o jogo chama
        if (!E.list().length) try { E.give(E.roll()); } catch (e) {}
        for (const o of E.list()) o.done = o.need;   // pronto (save de laboratório)
        return { n: E.list().length, ready: E.anyReady(), owned: Object.keys(s.owned || {}).length };
      });
      console.log('  ovos:', JSON.stringify(info));
      await cfg({ ovos: true });
      const abriu = await esperar(() => p.evaluate(() => !window.__NSRAW.Eggs.anyReady()), 45000);
      // o ovo conta como aberto no fim da animação; o "¡Genial!" aparece ~1,3 s depois e a rotina segue: espera ela
      await esperar(async () => (await estado()).acts.includes('eggs'), 20000);
      await sleep(1500);
      const e = await estado();
      const depois = await p.evaluate(() => ({ n: window.__NSRAW.Eggs.list().length, owned: Object.keys(window.__NS.DB.save.owned || {}).length }));
      ok(info.ready, 'havia um ovo pronto');
      ok(abriu && depois.n < info.n, `a rotina abriu o ovo (${info.n} → ${depois.n} ovos; Pokémon ${info.owned} → ${depois.owned})`);
      ok(e.acts.includes('eggs'), 'o painel registrou o ovo aberto');
      ok(!(await p.evaluate(() => { const h = document.getElementById('scr-hatch'); return !!h && !h.classList.contains('hidden'); })), 'a cena do ovo fechou');
      await aoMenu();
    }
    if (SO.includes('item')) {
      const a = await p.evaluate(() => { const N = window.__NS, s = N.DB.save, d = s.partner; s.pupg = s.pupg || {}; s.pupg[d] = Object.assign({}, s.pupg[d], { startitem: 1 }); s.bag = s.bag || {}; s.bag.amuletcoin = 1; s.coins = 3000; if (s.pitem) delete s.pitem[d]; N.UI.refreshCoins(); return { d, c: s.coins }; });
      await cfg({ itemInicial: true });
      const pegou = await esperar(() => p.evaluate((d) => ((window.__NS.DB.save.pitem || {})[d] || null) === 'amuletcoin', a.d), 30000);
      await sleep(1500);
      const z = await p.evaluate(() => ({ c: window.__NS.DB.save.coins, bag: (window.__NS.DB.save.bag || {}).amuletcoin || 0 }));
      const e = await estado();
      ok(pegou, 'a rotina escolheu a Moneda Amuleto no "Objeto inicial" (botão da melhoria)');
      ok(z.c === a.c && z.bag === 1, `sem renda medida não comprou outra (moedas ${a.c} → ${z.c}, na Mochila ${z.bag})`);
      ok(e.acts.includes('itemInicial'), 'o painel registrou o Objeto inicial');
      ok(!e.scr.includes('scr-upgrades'), `saiu da tela de Melhorias (${e.scr.join(',')})`);
      await aoMenu();
    }
    if (SO.includes('melhor')) {
      const a = await p.evaluate(() => { const N = window.__NS, s = N.DB.save, d = s.partner; s.pupg = s.pupg || {}; s.pupg[d] = {}; s.coins = 1600; N.UI.refreshCoins(); return { d }; });
      const l0 = logs.length;
      await cfg({ upgrades: true });
      await esperar(() => p.evaluate((d) => Object.keys(window.__NS.DB.upgradesOf(d) || {}).length > 0, a.d), 30000);
      await sleep(6000);
      const lv = await p.evaluate((d) => window.__NS.DB.upgradesOf(d), a.d);
      const ordem = (await estado()).acts;
      console.log('  melhorias:', JSON.stringify(lv), 'reserva 10%:', 160, 'atos:', ordem.join(','));
      ok((lv.coins || 0) >= 1, `comprou a Fortuna (+8% de moedas) (níveis ${JSON.stringify(lv)})`);
      ok((lv.coins || 0) >= (lv.atk || 0), 'a Fortuna veio antes da Fuerza');
      void l0;
    }
    await b.close();
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})();
