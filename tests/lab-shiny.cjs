// Laboratório (0.12.6): o parceiro usa a versão shiny quando a pessoa tem o shiny dele.
// Convidado de TESTE no perfil descartável (o shiny é dado só no save de laboratório). Gacha, missões e loja desligados.
// Casos:
//   tem   — o parceiro tem o shiny e a versão normal está escolhida: a rotina escolhe o shiny pelo botão do menu
//   sem   — o parceiro não tem o shiny: nada é tocado
//   off   — tem o shiny, mas a opção "Usar a versão shiny do parceiro" está desligada: nada é tocado
//   troca — o parceiro atual está 100% (shiny escolhido) e o próximo também tem shiny: depois da troca, o novo fica
//           shiny; registra o que o próprio jogo faz com partnerShiny no momento da troca
// Uso: node testes/lab-shiny.cjs <piloto.js> <caso>
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const [PIL, CASO] = [process.argv[2], process.argv[3] || 'tem'];
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
  const info = await p.evaluate((caso) => {
    const N = window.__NS, s = N.DB.save, U = N.Upgrades, d0 = s.partner;
    s.shiny = s.shiny || {};
    if (caso !== 'sem') s.shiny[d0] = { at: 1 };
    s.partnerShiny = false;
    s.coins = 100; N.UI.refreshCoins();   // quase nada: a rotina não fica comprando
    let d1 = null;
    if (caso === 'troca') {
      const cheio = {}; for (const u of U.LIST) cheio[u.id] = u.max;
      s.pupg = s.pupg || {}; s.pupg[d0] = { ...cheio };
      d1 = N.DEX.filter((m) => !m.starter && N.Sprites.hasShiny(m.dex)).sort((a, b) => b.bst - a.bst)[0].dex;
      s.owned[d1] = s.owned[d1] || { at: 1 }; s.shiny[d1] = { at: 1 };
      s.partnerShiny = true;
    }
    N.DB.commit && N.DB.commit();
    return { d0, d1, nome0: N.DEX_BY[d0].name, nome1: d1 ? N.DEX_BY[d1].name : null };
  }, CASO);
  // o menu é redesenhado indo e voltando (para o #menu-shiny refletir o shiny de laboratório)
  await p.click('#scr-menu [data-go="dex"]').catch(() => {}); await sleep(600);
  await p.evaluate(() => { const b = document.querySelector('.scr:not(.hidden) [data-back], .scr:not(.hidden) .back'); if (b) b.click(); }); await sleep(800);
  console.log('conta de teste:', JSON.stringify(info), 'caso', CASO);
  // registra cada mudança de (parceiro, partnerShiny) — mostra o que o jogo faz na troca
  await p.evaluate(() => { const N = window.__NS; let ult = ''; window.__trilha = []; setInterval(() => { const s = N.DB.save, k = s.partner + ':' + !!s.partnerShiny; if (k !== ult) { ult = k; window.__trilha.push(k); } }, 50); });
  await p.evaluate((caso) => document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify({ on: true, modo: 'solo', upgrades: true, shop: false, gacha: false, partner: true, missions: false, skins: false, shinyParceiro: caso !== 'off' }) })), CASO);
  let jogou = null;
  for (let i = 0; i < 160 && !jogou; i++) { await sleep(500); jogou = await p.evaluate(() => (window.__NS.Game.state === 'playing' && window.__NS.Game.player ? { dex: window.__NS.Game.player.mon.dex, shiny: !!window.__NS.Game.player.shiny } : null)); }
  const fim = await p.evaluate(() => { const N = window.__NS, s = N.DB.save, st = window.__st || {}; return { partner: s.partner, partnerShiny: !!s.partnerShiny, shinyUlt: st.shinyUlt || null, trilha: window.__trilha, acts: (st.acts || []).map((a) => a.k + (a.a && a.a.paraN ? ':' + a.a.paraN : '') + (a.k === 'shiny' ? ':' + a.a.ok : '')) }; });
  console.log('  partida:', JSON.stringify(jogou), '· fim:', JSON.stringify(fim));
  ok(!!jogou, 'a partida começou (o shiny nunca segura a partida)');
  if (CASO === 'tem') {
    ok(fim.partnerShiny && jogou && jogou.shiny, 'versão shiny escolhida pelo botão do menu e usada na partida');
    ok(fim.acts.some((a) => a === 'shiny:true'), 'ação registrada no painel');
  } else if (CASO === 'sem') {
    ok(!fim.partnerShiny && !fim.acts.some((a) => a.startsWith('shiny')) && fim.trilha.length === 1, 'parceiro sem shiny: nada tocado (partnerShiny segue false, nenhuma ação)');
  } else if (CASO === 'off') {
    ok(!fim.partnerShiny && !fim.acts.some((a) => a.startsWith('shiny')) && fim.trilha.length === 1, 'opção desligada: nada tocado');
  } else if (CASO === 'troca') {
    ok(fim.partner === info.d1, `trocou para ${info.nome1}`);
    ok(fim.partnerShiny && jogou && jogou.dex === info.d1 && jogou.shiny, 'o novo parceiro ficou na versão shiny e a partida usa ele shiny');
    console.log('  trilha (parceiro:partnerShiny) durante a rotina:', fim.trilha.join(' → '));
  }
  await p.screenshot({ path: `shiny-${CASO}.png` });
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
