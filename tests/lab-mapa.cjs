// Laboratório (0.12.3): o mapa de módulos por forma contra o jogo local (testes/.game).
//  node testes/lab-mapa.cjs                       → mapeia com fonte-piloto/mapa.js (o mesmo código do piloto) e confere
//                                                    que todo nome lógico achou 1 chave e que os atalhos funcionam
//  node testes/lab-mapa.cjs <piloto.js> <Modulo>  → fumaça de regressão: tira <Modulo> do objeto do jogo de propósito
//                                                    (logo depois de o jogo montá-lo) e exige que o piloto emita
//                                                    {ok:false, err:'mapa'} com <Modulo> em "faltam"
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const jl = require('./espelhar-jogo.cjs');
const [PIL, TIRAR] = [process.argv[2], process.argv[3]];
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
  await jl.servirJogo(ctx, jl.PADRAO, { espelhar: process.env.ESPELHAR === '1' });
  const p = await ctx.newPage();
  const mapa = jl.lerMapa();
  if (!PIL) {
    // nenhum nome sorteado fixo nas fontes da Sobrevida (eles podem mudar a cada build do jogo)
    const pastas = [path.join(__dirname, '..', 'fonte-piloto'), path.join(__dirname, '..', 'instalada', 'src'), path.join(__dirname, '..', 'extension', 'src'), __dirname].concat(process.env.EXT ? [path.join(process.env.EXT, 'src')] : []).filter((d) => fs.existsSync(d));   // PC e layout do repo
    const achados = [];
    for (const d of pastas) for (const f of fs.readdirSync(d)) {
      if (!/\.(c?js|html|json|md)$/.test(f)) continue;
      fs.readFileSync(path.join(d, f), 'utf8').split('\n').forEach((l, i) => { if (/_[0-9a-f]{7}/.test(l)) achados.push(`${path.join(d, f)}:${i + 1}`); });
    }
    ok(!achados.length, `nenhum literal /_[0-9a-f]{7}/ nas fontes (${pastas.length} pastas)` + (achados.length ? ': ' + achados.join(' ') : ''));
    await p.addInitScript(jl.nsInit());
    await p.goto('https://pokesurvivor.com/'); await p.waitForTimeout(3500);
    const r = await p.evaluate(() => {
      const M = window.__NSMAPA || {}, N = window.__NS || {};
      let s54 = null, s2 = null, ch = null, tm = null;
      try { s54 = N.startMoveOf(54); s2 = N.startMove2Of(54); ch = N.startChoices(54); tm = N.TM_OF(54); } catch (e) { s54 = 'ERR ' + e.message; }
      return { faltam: M.faltam, ambiguos: M.ambiguos, n: Object.keys(M.chaves || {}).length, nomes: Object.keys(M.chaves || {}),
        state: N.Game && N.Game.state, lift: N.LIFT, dex: N.DEX && N.DEX.length, psy: N.DEX_BY && N.DEX_BY[54] && N.DEX_BY[54].name,
        s54, s2, ch: Array.isArray(ch) && ch.includes(s54), tm: Array.isArray(tm) && tm.length > 0 && tm.every((id) => N.Moves.BY_ID[id]),
        nat: N.NATURES && N.NATURES.length, natBy: N.NATURE_BY && !!N.NATURE_BY.adamant, revive: N.Player && N.Player.REVIVE_TIME,
        tick: N.Combat && N.Combat.tick.length, axis: N.Input && typeof N.Input.axis, icons: N.Icons && typeof N.Icons.draw,
        nativo: /\[native code\]/.test(Function.prototype.toString.call(Object.create)) };
    });
    console.log('  mapeados:', r.n, '|', r.nomes.join(' '));
    ok(r.faltam && !r.faltam.length, 'nenhum módulo faltando' + (r.faltam && r.faltam.length ? ': ' + r.faltam.join(', ') : ''));
    ok(r.ambiguos && !r.ambiguos.length, 'nenhum módulo ambíguo' + (r.ambiguos && r.ambiguos.length ? ': ' + r.ambiguos.join(', ') : ''));
    ok(r.lift === 18 && r.dex > 900 && r.psy === 'Psyduck', `atalhos leem o objeto real (LIFT=${r.lift}, DEX=${r.dex}, DEX_BY[54]=${r.psy})`);
    ok(typeof r.state === 'string', 'Game.state = ' + r.state);
    ok(typeof r.s54 === 'string' && r.ch && r.s2 === null && r.tm, `funções soltas: startMoveOf(54)=${r.s54}, está em startChoices(54)=${r.ch}, startMove2Of(54)=${r.s2}, TM_OF(54) só golpes=${r.tm}`);
    ok(r.nat === 25 && r.natBy && r.revive > 0 && r.tick >= 2 && r.axis === 'function' && r.icons === 'function', 'NATURES, NATURE_BY, Player.REVIVE_TIME, Combat.tick, Input.axis, Icons.draw');
    ok(r.nativo, 'Object.create voltou ao original');
    // escrita pelo atalho vai para o objeto real pela chave real (e volta)
    const w = await p.evaluate(() => { const N = window.__NS, R = window.__NSRAW, k = window.__NSMAPA.chaves.Rift, antes = R[k], novo = { teste: 1 }; N.Rift = novo; const foi = R[k] === novo && N.Rift === novo; N.Rift = antes; return foi && R[k] === antes; });
    ok(w, 'atribuição ao topo (ns.X = …) escreve no objeto real pela chave real');
    // revisão: isca com nome em claro e funções que gravam
    const rv = await p.evaluate((mapa) => {
      const { svMapear, svSoLe } = new Function(mapa + '; return { svMapear, svSoLe };')();
      const R = window.__NSRAW, falso = Object.create(null);
      for (const k of Object.keys(R)) { if (k === 'Ranking') falso['_x' + 'isca' + 'rk'] = R[k]; else falso[k] = R[k]; }
      falso.Ranking = { submitSolo() {}, submitGroup() {} };   // isca: mesmo nome, e o de verdade com outro nome
      const m = svMapear(falso);
      return { isca: m.ambiguos.includes('Ranking') && !m.ok, le: svSoLe("$=>{const $=$.DB.save;return $.pstart[$]}"),
        grava1: svSoLe("$=>{$.DB.save.pstart[$]=$;$.DB.commit(!0)}"), grava2: svSoLe("$=>{$.pupg[$].start++}"), grava3: svSoLe("$=>$.DB.grant($,'rescue')") };
    }, jl.lerMapa());
    ok(rv.isca, 'um "Ranking" de isca (o de verdade com nome sorteado) deixa o mapa ambíguo e o piloto não liga');
    ok(rv.le && !rv.grava1 && !rv.grava2 && !rv.grava3, 'função que só lê passa; função que grava/commit/concede não passa como startMoveOf etc.');
  } else {
    // fumaça: tira o módulo logo depois de o jogo montar o objeto (microtarefa no fim do script do jogo)
    await p.addInitScript(`(() => { ${mapa}
      const orig = Object.create;
      const emb = { create(pr, d) { const o = d === undefined ? orig(pr) : orig(pr, d);
        if (pr === null) queueMicrotask(() => { try { const m = svMapear(o); const k = m.chaves[${JSON.stringify(TIRAR)}]; if (k !== undefined) { delete o[k]; window.__tirado = true; } } catch (e) { window.__tirado = String(e); } });
        return o; } }.create;
      Object.defineProperty(Object, 'create', { value: emb, writable: true, configurable: true, enumerable: false });
      window.__sts = []; document.addEventListener('sobrevida:st', (e) => { try { window.__sts.push(JSON.parse(e.detail)); } catch (_) {} });
    })();`);
    await p.addInitScript({ path: path.resolve(PIL) });
    p.on('pageerror', () => {});
    await p.goto('https://pokesurvivor.com/'); await p.waitForTimeout(11000);
    const r = await p.evaluate(() => ({ tirado: window.__tirado, sts: window.__sts.slice(-3) }));
    const f = r.sts.find((s) => s.err === 'mapa');
    console.log('  status emitidos (últimos):', JSON.stringify(r.sts));
    ok(r.tirado === true, `módulo ${TIRAR} tirado do objeto do jogo de propósito`);
    ok(!!f && f.ok === false, "piloto emitiu {ok:false, err:'mapa'} e não ligou");
    ok(!!f && (f.faltam || []).includes(TIRAR), `"faltam" traz ${TIRAR}: ${f && JSON.stringify(f.faltam)}`);
    ok(!r.sts.some((s) => s.ok === true), 'nenhum status ok:true');
  }
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
