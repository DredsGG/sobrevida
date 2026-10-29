// Sobrevida — piloto do farm automático. Roda no mundo da PÁGINA (MAIN), em document_start, só em pokesurvivor.com.
//
// O motor da partida (escolha de cartas, vínculo, item, esferas, desvio, coleta, A*, fendas, Sentença de Arceus) é
// adaptado do PSBot — PokéSurvivor Auto-Farm, Copyright (c) 2026 BoundlessEgret, licença MIT
// (https://github.com/BoundlessEgret/pokesurvivor-autofarm, v1.6.6). Aviso completo em THIRD-PARTY-NOTICES.md.
// A rotina entre partidas (missões, troca de parceiro do melhor ao pior, melhorias, gacha, skins, Guardar), a proteção
// do ranking, a ponte com a extensão e os dados de status são da Sobrevida.
//
// Regras da casa (não mudar sem o André):
//  - nunca escreve no save por conta própria: compras, gacha, missões e skins vão pelos MESMOS botões do jogo;
//    a troca de parceiro faz exatamente o que o botão "Elegir compañero" faz;
//  - nunca mexe no jogador (vida, ataque, velocidade) nem no relógio: só devolve a direção do "joystick" (Input.axis)
//    e escolhe cartas como a pessoa faria;
//  - partida que o farm tocou NUNCA vai para o ranking (Ranking.submit* bloqueado + selo bloqueado pelo fundo).
(() => {
  'use strict';
  if (window.__sobrevidaPiloto) return;
  window.__sobrevidaPiloto = true;
  const HOOK_KEY = 'Game';
  const DEBUG = /[?&]svdebug=1/.test(location.search);
  const log = (...a) => { if (DEBUG) console.log('%c[Sobrevida]', 'color:#ffd23f', ...a); };

  // ---------- 1. pega o namespace do jogo ----------
  // O jogo publicado guarda tudo num objeto interno (ns = {BUILT:true, LIFT:18}; ns.Game = ...) que não vai para o window.
  // Um setter temporário 'Game' em Object.prototype recebe esse objeto na hora em que o jogo faz ns.Game = ..., e sai.
  const own = (obj, k, v) => Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(Object.prototype, HOOK_KEY, {
    configurable: true,
    get() { return undefined; },
    set(v) {
      own(this, HOOK_KEY, v);
      if (this && this.BUILT === true && 'LIFT' in this) {
        delete Object.prototype[HOOK_KEY];
        try { boot(this); } catch (e) { console.error('[Sobrevida] boot', e); }
      }
    },
  });
  // se nada pegar em 20 s (jogo mudou), tira a armadilha e avisa a extensão
  setTimeout(() => { if (!NS) { try { delete Object.prototype[HOOK_KEY]; } catch (_) {} emit({ ok: false, err: 'namespace' }); } }, 20000);

  // ---------- 2. configuração (vem da extensão) e ponte ----------
  // A extensão (mundo isolado) manda 'sobrevida:cfg' com JSON; o piloto responde 'sobrevida:st' com JSON a cada 500 ms.
  const cfg = {
    on: false,          // farm ligado
    modo: 'solo',       // 'solo': partidas sozinho + rotina do menu · 'grupo': só o seu Pokémon nas partidas com amigos
    upgrades: true,     // comprar melhorias do parceiro
    gacha: true,        // tirar gacha com os tickets
    gachaMenos: false,  // 0.9.0: gacha na região onde você tem menos Pokémon (padrão: a mais perto de completar)
    partner: true,      // trocar de parceiro sozinho: o melhor que ainda não está 100%
    skins: true,        // Halloween: comprar as skins de bruja com os doces
    cola: true,         // 0.7.0/0.8.0: colinha (coleção, cartas de nível, pausa e faixa no HUD)
    lang: 'pt',         // idioma da Sobrevida (textos que o piloto desenha)
    hud: true,          // 0.6.0: visual novo da partida (card do Pokémon, relógio, chefe, golpes); vale com o farm desligado
    shop: true,         // 0.5.0: Loja Kecleon — Menta, Cápsula e MT para o parceiro quando a conta mostra ganho
    missions: true,     // recolher prêmios de missões
    reserve: 1500,      // moedas que sempre ficam (o preço de uma Menta/Cápsula)
    // usados pelo motor da partida (PSBot)
    move: true, cards: true, bonds: true, items: true, rift: true, orbs: true, restart: true,
    passiveFirst: true, profiles: {},
    weave: true,        // 0.3.0: rotação de ataques (troca de espaço quando o outro golpe fica pronto antes; mantém os buffs)
  };
  let NS = null;
  const emit = (o) => { try { document.dispatchEvent(new CustomEvent('sobrevida:st', { detail: JSON.stringify(o) })); } catch (_) {} };
  document.addEventListener('sobrevida:cfg', (e) => {
    try {
      const c = JSON.parse(e.detail || '{}');
      const was = cfg.on;
      for (const k of ['on', 'upgrades', 'gacha', 'partner', 'skins', 'missions', 'shop', 'hud', 'cola', 'gachaMenos']) if (typeof c[k] === 'boolean') cfg[k] = c[k];
      if (typeof c.reserve === 'number' && c.reserve >= 0) cfg.reserve = c.reserve;
      if (c.modo === 'solo' || c.modo === 'grupo') cfg.modo = c.modo;
      if (c.lang === 'pt' || c.lang === 'en' || c.lang === 'es') cfg.lang = c.lang;
      if (c.learn && typeof c.learn === 'object') try {
        for (const [k, v] of Object.entries(c.learn)) if (v && v.eff > 0 && v.eff < 60 && v.n > 0 && !(k in KB.learn)) KB.learn[k] = { eff: +v.eff, n: Math.min(5000, v.n | 0) };
        KB.plans = {}; KB.vals = {};
      } catch (_) {}
      if (cfg.on && !was) { M.needMaint = true; M.lastPlay = -1e9; sess.start = sess.start || Date.now(); }
      if (cfg.on && NS && NS.Game && NS.Game.state !== 'ui' && NS.Game.state !== 'over') M.touched = true;
    } catch (_) {}
  });
  document.addEventListener('sobrevida:ping', () => status(true));

  const sess = { start: 0, runs: 0, coins: 0, t1: 0, t10: 0, candy: 0, kills: 0, best: 0, ms: 0 };
  const acts = [];   // últimas ações da rotina (para o painel)
  // estado do motor da partida (PSBot)
  const S = { pickTimer: null, lastPos: null, stuckT: 0, unstickT: 0, unstickDir: null, wanderA: Math.random() * 6.28, lastSlotCheck: 0, lastOrb: 0, lastT: performance.now(), lastDir: null, lastOffer: null, orbGoal: null, plan: null, seen: {}, ban: {}, noGo: {}, jCenter: null, holding: false, holdKey: null, holdSince: 0, wd: null, losBadT: 0, spin: 1, spinBlockT: 0, loopC: null, dirIdx: -1, holdT: 0, out: [1, 0], mode: '' };
  const act = (k, a) => { acts.unshift({ k, a: a || null, t: Date.now() }); acts.length = Math.min(acts.length, 8); };

  // ---------- 3. liga no jogo ----------
  const M = { needMaint: true, busy: false, task: '', lastPlay: -1e9, overAt: -1e9, lastSave: 0, touched: false, lastState: '', err: '', userPausedAt: -1e9, pausedAt: 0, lvlOpenAt: 0 };
  function boot(ns) {
    NS = ns;
    log('namespace ok');
    const wait = setInterval(() => {
      if (ns.Input && ns.RunUI && ns.LevelUp && ns.Moves && ns.Game && ns.UI && ns.DB && document.body) {
        clearInterval(wait);
        patch(ns);
        setInterval(() => { try { tick(ns); } catch (e) { M.err = String(e && e.message || e).slice(0, 80); log('tick', e); } }, 250);
        setInterval(() => status(false), 500);
        status(true);
      }
    }, 50);
  }

  function patch(ns) {
    // andar: o piloto devolve a direção do "joystick"; se a pessoa aperta uma direção, a mão dela manda
    const origAxis = ns.Input.axis.bind(ns.Input);
    ns.Input.axis = function () {
      const manual = origAxis();
      if (manual && (manual[0] || manual[1])) return manual;
      if (!cfg.move || !jogaAgora(ns)) return manual;
      try { return steer(ns); } catch (e) { log('steer', e); return manual; }
    };
    // cartas de nível (guarda a última oferta: o "trocar cartas" chama offer de novo)
    const origOffer = ns.LevelUp.offer;
    ns.LevelUp.offer = function () {
      const r = (S.lastOffer = origOffer.apply(this, arguments));
      // "trocar cartas" desenha as cartas novas sem passar por showLevelUp: marca a colinha de novo
      setTimeout(() => { try { if (ns.UI.isOpen('scr-levelup')) colaCartas(ns, r); } catch (_) {} }, 40);
      return r;
    };
    const R = ns.RunUI;
    const origLevel = R.showLevelUp;
    R.showLevelUp = function (level, cards) {
      const r = origLevel.apply(this, arguments);
      M.lvlOpenAt = performance.now();
      try { colaCartas(ns, cards); } catch (e) { log('colaCartas', e); }
      if (ativo(ns) && cfg.cards) schedule(() => chooseCard(ns, cards), 700); // 700 ms: o jogo ignora cliques nos primeiros 0,6 s
      return r;
    };
    const origBond = R.showBond;
    R.showBond = function (opt) {
      const r = origBond.apply(this, arguments);
      try { colaVinculo(ns, opt); } catch (e) { log('colaVinculo', e); }
      if (ativo(ns) && cfg.bonds) schedule(() => chooseBond(ns, opt), 700);
      return r;
    };
    const origItem = R.showItemChoice;
    R.showItemChoice = function (cur, next) {
      const r = origItem.apply(this, arguments);
      try { colaItem(ns, cur, next); } catch (e) { log('colaItem', e); }
      if (ativo(ns) && cfg.items) schedule(() => {
        const keep = itemRank(ns, cur) <= itemRank(ns, next);
        const el = document.querySelectorAll('#item-cards .card')[keep ? 0 : 1];
        el && el.click();
      }, 700);
      return r;
    };
    // fim da partida: conta para o painel e marca a rotina
    const origOver = R.showOver;
    R.showOver = function (d) {
      const r = origOver.apply(this, arguments);
      try { aprenderFim(); } catch (e) { log('aprenderFim', e); }
      if (M.touched) {
        sess.runs++; sess.coins += d.coins || 0; sess.t1 += d.t1 || 0; sess.t10 += d.t10 || 0; sess.candy += d.candy || 0;
        sess.kills += d.kills || 0; sess.best = Math.max(sess.best, d.time || 0);
        act('run', { t: Math.round(d.time || 0), lv: d.level, c: d.coins || 0, t1: d.t1 || 0, t10: d.t10 || 0, k: d.kills || 0, dead: !!d.dead });
        M.overAt = performance.now(); M.needMaint = true;
      }
      return r;
    };
    // ranking: partida que o farm tocou não sobe (o selo também é bloqueado pela extensão enquanto o farm está ligado)
    if (ns.Ranking) for (const k of ['submitSolo', 'submitGroup']) {
      const orig = ns.Ranking[k];
      if (typeof orig !== 'function') continue;
      ns.Ranking[k] = function () {
        if (M.touched || cfg.on) { log('ranking bloqueado'); return Promise.resolve(null); }
        return orig.apply(this, arguments);
      };
    }
    trackHazards(ns);
    try { instalarVisual(ns); } catch (e) { log('visual', e); }
    // 0.3.0: rotação de ataques roda a cada quadro, logo antes do jogo disparar os golpes
    if (ns.Combat && typeof ns.Combat.tick === 'function') {
      const origCT = ns.Combat.tick;
      ns.Combat.tick = function (dt, pl) {
        try { if (ativo(ns) && pl === ns.Game.player) weave(ns, pl); } catch (e) { log('weave', e); }
        const r = origCT.apply(this, arguments);
        try { if (pl === ns.Game.player && !pl.dead) aprenderTick(ns, pl); } catch (e) { log('aprender', e); }
        return r;
      };
    }
    if (ns.Audio && typeof ns.Audio.sfx === 'function') {
      const origSfx = ns.Audio.sfx;
      ns.Audio.sfx = function (name) { if (S.muteSelect && name === 'select') return; return origSfx.apply(this, arguments); };
    }
    // pausa feita pela pessoa (Esc/P) não é desfeita pelo piloto
    // (só conta se o jogo realmente pausou: o Esc que fecha o menu da Sobrevida não pausa o jogo)
    addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.code === 'KeyP') && ns.Game.state === 'playing' && e.isTrusted) {
        setTimeout(() => { if (ns.Game.state === 'paused') M.userPausedAt = performance.now(); }, 60);
      }
    }, true);
  }

  function schedule(fn, ms) { setTimeout(() => { try { fn(); } catch (e) { log(e); } }, ms); }
  // cooperativo (0.2.4): cada um pilota o próprio Pokémon, então o farm joga em grupo como anfitrião ou convidado.
  // Só joga partida em grupo que JÁ COMEÇOU com o farm ligado: o selo do ranking de cada membro é pedido no começo;
  // bloqueado o nosso, o anfitrião não consegue subir a partida do grupo (ranking.js exige o selo de todos).
  const emGrupo = (ns) => !!(ns.Coop && ns.Coop.active);
  const naSala = (ns) => !!(ns.Social && ns.Social.room);
  // Anfitrião pode ligar no meio: quem sobe a partida do grupo é ele, e o envio fica bloqueado aqui (M.touched).
  // Convidado não: o selo dele já foi para o anfitrião no começo e lá não dá para bloquear.
  const anfitriao = (ns) => !!(ns.Coop && ns.Coop.isHost);
  const bloqueadoGrupo = (ns) => emGrupo(ns) && !M.coopOk && !anfitriao(ns);
  // 0.2.6: dois modos separados. "solo" só joga partida sozinho (e faz a rotina do menu); "grupo" só joga partida
  // em grupo (e nunca mexe no menu). Partida do tipo errado: o farm não toca em nada e o painel diz por quê.
  const grupo = () => cfg.modo === 'grupo';
  const jogaAgora = (ns) => cfg.on && (emGrupo(ns) ? grupo() && !bloqueadoGrupo(ns) : !grupo());
  const ativo = jogaAgora;
  const now = () => performance.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const open = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
  async function waitFor(fn, ms) { const t0 = now(); while (now() - t0 < ms) { try { if (fn()) return true; } catch (_) {} await sleep(80); } return false; }

  // ---------- 4. laço: partida e rotina entre partidas ----------
  function tick(ns) {
    const st = ns.Game.state;
    const naRun = st !== 'ui' && st !== 'over';
    // começo de partida (saiu do menu): marca se o farm está nela; se o farm ligar no meio, também conta (ranking bloqueado)
    if (naRun && (M.lastState === 'ui' || !M.lastState)) { M.touched = cfg.on; M.coopRun = emGrupo(ns); M.coopOk = M.coopRun && cfg.on && grupo(); }
    if (cfg.on && naRun) M.touched = true;
    if (st === 'playing') M.userPausedAt = 0;
    M.lastState = st;
    if (naRun && !ativo(ns)) return;
    // 0.8.0: aviso "vídeo novo no canal" (jogo de 29-10) ficava aberto por cima da partida que o farm começava
    if (cfg.on && open('scr-video')) fecharVideo();
    if (st === 'playing' || st === 'levelup' || st === 'choice' || st === 'held') { housekeeping(ns); levelWatch(ns); return; }
    // fora da partida, só o modo solo faz alguma coisa (rotina, voltar da tela final, começar partida)
    if (!cfg.on || grupo()) return;
    if (st === 'paused') return autoResume(ns);
    if (M.busy) return;
    if (st === 'over' && M.coopRun) return;     // em grupo: o resumo é do time; quem volta para a sala é você
    if (st === 'over') { if (open('scr-over') && now() - M.overAt > 3500) $('#btn-again') && $('#btn-again').click(); return; }
    if (st === 'ui') {
      if (closePopups()) return;
      if (naSala(ns)) return;                  // numa sala com amigos: nada de menu (parceiro, gacha, partida solo)
      if (!open('scr-menu')) return;            // outra tela aberta (a pessoa mexendo ou o jogo trocando): espera
      if (document.visibilityState !== 'visible') return;
      M.busy = true;
      routine(ns).catch((e) => { M.err = String(e && e.message || e).slice(0, 80); log('rotina', e); })
        .finally(() => { M.busy = false; M.task = ''; });
    }
  }

  // cartas abertas há muito tempo (o agendamento falhou): escolhe de novo
  function levelWatch(ns) {
    if (!cfg.cards) return;
    if (ns.UI.isOpen('scr-levelup') && M.lvlOpenAt && now() - M.lvlOpenAt > 4000) {
      M.lvlOpenAt = now();
      if (S.lastOffer) chooseCard(ns, S.lastOffer);
    }
  }

  function closePopups() {
    for (const [scr, btn] of [['scr-savenote', 'savenote-ok'], ['scr-news', 'news-close'], ['scr-nick', 'nick-later'], ['scr-recover', 'rec-later']]) {
      if (open(scr)) { const b = document.getElementById(btn); if (b) { b.click(); return true; } }
    }
    return false;
  }

  function autoResume(ns) {
    if (M.userPausedAt > 0) return;    // a pessoa pausou (Esc/P): fica pausado até ela voltar
    if (document.visibilityState !== 'visible') { M.pausedAt = 0; return; }
    if (!M.pausedAt) M.pausedAt = now();
    else if (now() - M.pausedAt > 1500) { M.pausedAt = 0; ns.Game.togglePause(); }
  }

  const nome = (ns, d) => { const m = ns.DEX_BY && ns.DEX_BY[d]; return m ? m.name : '#' + d; };
  const SCR = { goals: 'scr-goals', upgrades: 'scr-upgrades', gacha: 'scr-gacha', shop: 'scr-shop', dex: 'scr-dex' };
  async function ir(go) {
    const b = $(`#scr-menu [data-go="${go}"]`);
    if (!b) return false;
    b.click();
    return waitFor(() => open(SCR[go]), 4000);
  }
  async function voltar(go) {
    const b = $(`#${SCR[go]} [data-back]`);
    if (b) b.click(); else dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await waitFor(() => open('scr-menu'), 3000);
    await sleep(250);
  }

  // "Ahora no" do aviso de vídeo novo: o jogo já guardou que mostrou esse vídeo, então ele não volta
  function fecharVideo() {
    const b = document.getElementById('video-close');
    if (b && open('scr-video')) { b.click(); act('video', {}); log('aviso de vídeo fechado'); }
  }
  async function routine(ns) {
    if (open('scr-video')) { fecharVideo(); await sleep(300); }
    if (M.needMaint) {
      M.needMaint = false;
      if (cfg.missions) { M.task = 'missions'; await missoes(ns); }
      if (cfg.gacha) { M.task = 'gacha'; await gacha(ns); }
      if (cfg.partner) { M.task = 'partner'; await parceiro(ns); }
      if (cfg.shop) { M.task = 'shop'; await loja(ns); }
      if (cfg.upgrades) { M.task = 'upgrades'; await melhorias(ns); }
      if (cfg.upgrades) { M.task = 'moves'; await golpes(ns); }
      if (cfg.skins && ns.Halloween && ns.Halloween.on) { M.task = 'skins'; await skins(ns); }
      M.task = 'save'; await guardar(ns);
      if (!cfg.on) return;
    }
    // começa outra partida (antes, fecha o aviso de vídeo novo do canal, se estiver aberto)
    if (open('scr-video')) { fecharVideo(); await sleep(300); }
    if (cfg.restart && open('scr-menu') && now() - M.lastPlay > 6000 && now() - M.overAt > 4000) {
      M.task = 'play';
      M.lastPlay = now();
      const b = $('#scr-menu [data-go="play"]');
      if (b) { b.click(); M.touched = true; }
      await sleep(600);
    }
  }

  // ---------- 5. rotina: missões ----------
  async function missoes(ns) {
    const P = ns.Progress;
    // só abre a tela se há prêmio pronto (evita navegar à toa)
    let pronto = 0;
    try { const s = ns.DB.save, m = s && s.missions; for (const lst of [m && m.daily, m && m.weekly]) for (const x of lst || []) if (!x.claimed && P.done(x)) pronto++; } catch (_) { pronto = 1; }
    if (!pronto) return;
    if (!await ir('goals')) return;
    const tab = $('#goals-tabs .tab[data-tab="missions"]'); if (tab) { tab.click(); await sleep(250); }
    let n = 0;
    for (let i = 0; i < 12 && cfg.on; i++) {
      const b = $('#scr-goals .mission.ready button.btn.gold');
      if (!b) break;
      b.click(); n++;
      await sleep(350);
    }
    if (n) act('missions', { n });
    await voltar('goals');
  }

  // ---------- 6. rotina: gacha ----------
  function gachaGen(ns) {
    const G = ns.Gacha, s = ns.DB.save;
    // Halloween: o banner da Noche Espectral (só Fantasma, shiny 2%), enquanto faltar algum Fantasma
    if (G.SPOOKY && G.isOpen(G.SPOOKY.gen)) {
      const ghosts = ns.DEX.filter((p) => p.types.includes('ghost'));
      if (ghosts.some((p) => !s.owned[p.dex])) return G.SPOOKY.gen;
    }
    // 0.9.0 (opção "Gacha: região onde você tem menos Pokémon"): o banner com a maior chance de Pokémon NOVO por tiro.
    // Chance = soma por raridade de (peso da raridade no gacha × fração que falta dessa raridade na região), com os
    // pesos do próprio jogo (G.Gacha.RATES). Na prática: a região onde você tem menos, contando que lendário é raro.
    if (cfg.gachaMenos) {
      const RATES = Array.isArray(G.RATES) && G.RATES.length ? G.RATES : [[1, 45], [2, 30], [3, 17], [4, 6.5], [5, 1.5]];
      const tot = RATES.reduce((a, [, w]) => a + w, 0);
      let best = null, bs = -1;
      for (const b of G.BANNERS) {
        if (!G.isOpen(b.gen)) continue;
        const all = ns.DEX.filter((p) => p.gen === b.gen && (!ns.SPRITE_META || ns.SPRITE_META[p.dex]));
        if (!all.some((p) => !s.owned[p.dex])) continue;
        let chance = 0;
        for (const [r, w] of RATES) {
          const da = all.filter((p) => p.rarity === r);
          if (da.length) chance += (w / tot) * (da.filter((p) => !s.owned[p.dex]).length / da.length);
        }
        const sc = chance + ((s.pity || {})[b.gen] || 0) / 1e6;
        if (sc > bs) { bs = sc; best = b.gen; }
      }
      return best;
    }
    // padrão: a região onde faltam MENOS Pokémon (fecha uma região → Amuleto Iris, shiny ×2); empate: mais pity
    let best = null, bs = Infinity;
    for (const b of G.BANNERS) {
      if (!G.isOpen(b.gen)) continue;
      const all = ns.DEX.filter((p) => p.gen === b.gen), miss = all.filter((p) => !s.owned[p.dex]).length;
      if (!miss) continue;
      const sc = miss - ((s.pity || {})[b.gen] || 0) / 1000;
      if (sc < bs) { bs = sc; best = b.gen; }
    }
    return best;
  }
  async function gacha(ns) {
    const s = ns.DB.save, t = () => (ns.DB.save && ns.DB.save.tickets) || {};
    if (!s || ((t().t10 || 0) < 1 && (t().t1 || 0) < 10)) return;
    const gen = gachaGen(ns);
    if (gen == null) return;
    if (!await ir('gacha')) return;
    const tab = $(`#gacha-gens .gen-tab[data-gen="${gen}"]`); if (tab) { tab.click(); await sleep(300); }
    const before = new Set(Object.keys(ns.DB.save.owned || {}));
    let pulls = 0, shiny = 0;
    for (let i = 0; i < 40 && cfg.on; i++) {
      const tk = t();
      const id = (tk.t10 || 0) >= 10 ? 'pull-100b' : (tk.t1 || 0) >= 100 ? 'pull-100' : (tk.t10 || 0) >= 1 ? 'pull-10b' : (tk.t1 || 0) >= 10 ? 'pull-10' : null;
      const b = id && document.getElementById(id);
      if (!b || b.disabled) break;
      const shBefore = Object.keys(ns.DB.save.shiny || {}).length;
      b.click();
      if (!await waitFor(() => open('pull-fx'), 3000)) break;
      await sleep(250);
      const sk = $('#pull-skip'); if (sk && !sk.classList.contains('hidden')) sk.click();
      await waitFor(() => { const c = $('#pull-close'); return c && !c.classList.contains('hidden'); }, 20000);
      await sleep(500);
      pulls += id.includes('100') ? 100 : 10;
      shiny += Object.keys(ns.DB.save.shiny || {}).length - shBefore;
      const c = $('#pull-close'); if (c) c.click();
      await waitFor(() => !open('pull-fx'), 3000);
      await sleep(250);
    }
    const novos = Object.keys(ns.DB.save.owned || {}).filter((d) => !before.has(d)).map(Number);
    if (pulls) act('gacha', { gen, n: pulls, novos: novos.slice(0, 4).map((d) => nome(ns, d)), nn: novos.length, sh: shiny });
    await voltar('gacha');
  }

  // ---------- 7. rotina: parceiro (do melhor ao pior, até ficar 100%) ----------
  // Força "de nascença" do Pokémon para jogar parado (fórmula do PSBot sem o investimento): o melhor golpe que não precisa
  // mirar × encaixe físico/especial × mesmo tipo ×1,2 × clima da habilidade, vezes resistência e velocidade.
  const WEATHER_OF = { drizzle: 'water', drought: 'fire', 'sand-stream': 'rock', 'snow-warning': 'ice' };
  const WEATHER_MUL = { water: 1.5, fire: 1.5, rock: 1.3, ice: 1.3 };
  const AFK_KINDS = ['homing', 'aura', 'orbit', 'nova'];
  const powerCache = {};
  function power(ns, dex) {
    if (powerCache[dex] != null) return powerCache[dex];
    // 0.4.0: força pela base de cálculo (build planejada × sobrevivência); a fórmula antiga fica de reserva
    try { const f = forcaDe(ns, dex); if (f > 0) return (powerCache[dex] = f); } catch (e) { log('forca', e); }
    const mon = ns.DEX_BY[dex];
    if (!mon) return 0;
    let pool = [];
    try { pool = ns.startChoices ? ns.startChoices(dex) : []; } catch (_) {}
    const abil = ((ns.DEX_ABIL && ns.DEX_ABIL[dex]) || []).filter(Boolean);
    let off = 0;
    for (const id of pool) {
      const m = ns.Moves.BY_ID[id];
      if (!m || !(AFK_KINDS.includes(m.kind) || (m.kind === 'projectile' && m.homing))) continue;
      let v = (mon.atk || 1) * (m.cat ? ns.Stats.fit(mon, m.cat) : 1);
      if (mon.types.length === 1 && m.type === mon.types[0]) v *= 1.2;
      for (const a of abil) if (WEATHER_OF[a] === m.type) v *= WEATHER_MUL[m.type];
      off = Math.max(off, v);
    }
    if (!off) off = (mon.atk || 1) * 0.6;
    const tough = Math.sqrt((mon.hp || 80) / 100 * (((mon.df || 60) + (mon.sd || 60)) / 180));
    return (powerCache[dex] = off * Math.sqrt(tough) * (0.8 + 0.2 * (mon.spd || 100) / 110));
  }
  function progresso(ns, dex) {
    const U = ns.Upgrades, lv = ns.DB.upgradesOf(dex) || {};
    let have = 0, total = 0;
    for (const u of U.LIST) { total += u.max; have += Math.min(u.max, lv[u.id] || 0); }
    return { have, total, maxed: have >= total };
  }
  function alvo(ns) {
    const s = ns.DB.save;
    const own = Object.keys(s.owned || {}).map(Number).filter((d) => ns.DEX_BY[d]);
    // 0.2.2 (pedido do André): termina um Pokémon antes de ir para outro. O parceiro atual (escolhido pelo
    // farm ou por você no jogo) fica até chegar a 100%; só então vai para o mais forte que ainda não está 100%.
    if (s.partner && s.owned && s.owned[s.partner] && !progresso(ns, s.partner).maxed) return s.partner;
    own.sort((a, b) => power(ns, b) - power(ns, a));
    return own.find((d) => !progresso(ns, d).maxed) || own[0] || s.partner;
  }
  async function parceiro(ns) {
    const s = ns.DB.save;
    if (!s || !s.owned) return;
    const t = alvo(ns);
    if (!t || t === s.partner) return;
    const de = s.partner;
    // o mesmo que o botão "Elegir compañero" da coleção faz
    s.partner = t;
    s.partnerShiny = !!(s.shiny && s.shiny[t]);
    ns.DB.commit();
    act('partner', { de, para: t, deN: nome(ns, de), paraN: nome(ns, t) });
    if (ns.Flow && ns.Flow.goMenu) ns.Flow.goMenu();
    await sleep(500);
  }

  // ---------- 8. rotina: melhorias do parceiro (valor ÷ preço, até 100%) ----------
  // 0.4.0: Golpe inicial, Segundo golpe inicial e Veto agora são configurados pela base de cálculo → valem mais
  const UPG_VALUE = { def: 1.2, xp: 1.15, atk: 1.1, cd: 1.1, coins: 1.1, reroll: 1.0, moves: 1.0, hp: 0.9, magnet: 0.9, crit: 0.8, regen: 0.8, spd: 0.5, start: 1.2, start2: 0.9, ban: 0.8 };
  // reserva calculada sozinha: 10% das moedas, no máximo o preço de uma Menta (1.500). Conta nova não fica travada.
  const reserva = (ns) => Math.min(cfg.reserve, Math.floor(((ns.DB.save && ns.DB.save.coins) || 0) * 0.1));
  async function melhorias(ns) {
    const s = ns.DB.save, U = ns.Upgrades;
    if (!s || !U) return;
    const dex = s.partner;
    const piso = reserva(ns);   // fixa no começo: 10% do que tinha (no máximo 1.500) fica guardado
    const escolher = () => {
      const lv = ns.DB.upgradesOf(dex) || {};
      let best = null, bs = 0;
      U.LIST.forEach((u, i) => {
        const l = lv[u.id] || 0;
        if (l >= u.max || (u.needs && !lv[u.needs])) return;
        const cost = U.cost(u.id, l);
        if (cost > ns.DB.save.coins - piso) return;
        const sc = (UPG_VALUE[u.id] || 0.5) / cost;
        if (sc > bs) { bs = sc; best = i; }
      });
      return best;
    };
    if (escolher() == null) return;
    if (!await ir('upgrades')) return;
    const sel = document.getElementById('upg-mon');
    if (sel && +sel.value !== dex) { sel.value = String(dex); sel.dispatchEvent(new Event('change')); await sleep(300); }
    const comprados = [];
    for (let k = 0; k < 120 && cfg.on; k++) {
      const i = escolher();
      if (i == null) break;
      const btn = document.querySelectorAll('#upg-list .upg-item')[i];
      const b = btn && btn.querySelector('[data-buy]');
      if (!b || b.disabled) break;
      const before = (ns.DB.upgradesOf(dex) || {})[U.LIST[i].id] || 0;
      b.click();
      await sleep(140);
      const after = (ns.DB.upgradesOf(dex) || {})[U.LIST[i].id] || 0;
      if (after <= before) break;
      comprados.push(U.LIST[i].id);
    }
    if (comprados.length) act('upgrades', { dex, nome: nome(ns, dex), n: comprados.length, ids: [...new Set(comprados)].slice(0, 6) });
    await voltar('upgrades');
  }

  // ---------- 8a. rotina (0.5.0): Loja Kecleon — Menta, Cápsula, Cápsula Oculta e MT do parceiro ----------
  // A base de cálculo diz quanto a força do parceiro sobe com cada natureza, habilidade e MT. Compra só se:
  //   - o ganho passa do mínimo (Menta e Cápsula 3%, Cápsula Oculta 5%, MT 4%), e
  //   - rende mais por moeda que o próximo nível de Fuerza (+4% de dano, a melhoria de dano mais direta), e
  //   - sobra a reserva de moedas.
  // O que já está na Mochila é usado se passar do mínimo. Compra pelos botões da loja e usa pelos botões da ficha
  // do Pokémon na coleção, um item por vez (cada troca muda a conta das outras).
  const LOJA_MIN = { mint: 0.03, cap: 0.03, caph: 0.05, tm: 0.04 };
  function lojaEscolha(ns, dex) {
    const s = ns.DB.save, U = ns.Upgrades;
    const lv = (ns.DB.upgradesOf(dex) || {}).atk | 0;
    const u = U && U.BY && U.BY.atk;
    const ref = u && lv < u.max ? (0.04 / (1 + 0.04 * lv)) / U.cost('atk', lv) : 0;
    const livre = (s.coins || 0) - reserva(ns);
    let best = null, bs = 0;
    for (const o of opcoesLoja(ns, dex)) {
      if (o.ganho < (LOJA_MIN[o.tipo] || 0.05)) continue;
      const sc = o.tem ? o.ganho * 1e6 : (o.preco <= livre && o.ganho / o.preco >= ref ? o.ganho / o.preco : 0);
      if (sc > bs) { bs = sc; best = o; }
    }
    return best;
  }
  async function sairDaColecao() {
    if (!open('scr-dex')) return;
    const q = document.getElementById('dex-q');
    if (M.dexBusca && q && q.value) { q.value = ''; q.dispatchEvent(new Event('input')); await sleep(250); }
    M.dexBusca = false;
    await voltar('dex');
  }
  async function comprarLoja(ns, key) {
    await sairDaColecao();
    if (!open('scr-shop') && !await ir('shop')) return false;
    const sel = `#shop-body [data-buy="${key}"]`;
    await waitFor(() => $(sel), 3000);
    const b = $(sel);
    if (!b || b.disabled) return false;
    const antes = ns.DB.save.coins;
    b.click();
    await sleep(400);
    return ns.DB.save.coins < antes;
  }
  async function fichaDe(ns, dex) {
    if (!open('scr-dex') && !await ir('dex')) return false;
    const achar = () => [...document.querySelectorAll('#dex-grid .cell .no')].find((n) => parseInt(n.textContent, 10) === dex);
    const naFicha = () => { const c = $('#dex-grid .cell.on .no'); return c && parseInt(c.textContent, 10) === dex && $('#dex-detail .mon-extra'); };
    if (!naFicha()) {
      const q = document.getElementById('dex-q');
      if (!achar() && q) { q.value = String(dex); q.dispatchEvent(new Event('input')); M.dexBusca = true; }
      await waitFor(achar, 2500);
      const n = achar();
      if (!n) return false;
      n.closest('.cell').click();
      await sleep(350);
    }
    return waitFor(naFicha, 2500);
  }
  async function usarNaFicha(ns, dex, o) {
    const btn = { mint: 'nat', cap: 'cap', caph: 'caph', tm: 'tm' }[o.tipo];
    const chip = () => $(`#mx-picker [data-v="${o.alvo}"]`);
    if (!chip()) {
      const b = $(`#dex-detail [data-extra="${btn}"]`);
      if (!b) return false;
      b.click();
      await waitFor(chip, 1500);
    }
    const c = chip();
    if (!c) return false;
    c.click();
    await sleep(450);
    if (o.tipo === 'mint') return ns.Mons.natureOf(dex).id === o.alvo;
    if (o.tipo === 'tm') return ns.Mons.taught(dex).includes(o.alvo);
    return ns.Mons.abilityOf(dex).slot === o.alvo;
  }
  function nomeLoja(ns, o) {
    try {
      if (o.tipo === 'mint') return ns.Mons.name(ns.NATURE_BY[o.alvo].n);
      if (o.tipo === 'tm') { const d = ns.Moves.BY_ID[o.alvo]; return ns.T ? ns.T(d.name, 'move') : d.name; }
      return ns.Mons.abilityName(o.ab);
    } catch (_) { return String(o.alvo); }
  }
  async function loja(ns) {
    const s = ns.DB.save, dex = s && s.partner;
    if (!dex || !ns.Shop || !ns.Mons) return;
    M.dexBusca = false;
    for (let k = 0; k < 4 && cfg.on; k++) {
      let o = null;
      try { o = lojaEscolha(ns, dex); } catch (e) { log('loja', e); }
      if (!o) break;
      let comprou = false;
      if (!o.tem) {
        comprou = await comprarLoja(ns, o.item);
        if (!comprou) break;
      }
      if (open('scr-shop')) await voltar('shop');
      if (!await fichaDe(ns, dex)) { log('loja: ficha não abriu'); break; }
      const ok = await usarNaFicha(ns, dex, o);
      esquecer(dex); delete powerCache[dex];
      act('shop', { dex, nome: nome(ns, dex), tipo: o.tipo, alvo: nomeLoja(ns, o), ganho: Math.round(o.ganho * 100), preco: comprou ? o.preco : 0, ok });
      if (!ok) break;
    }
    if (open('scr-shop')) await voltar('shop');
    await sairDaColecao();
  }

  // ---------- 8b. rotina (0.4.0): Golpe inicial, Segundo golpe inicial e Veto ----------
  // Pelos MESMOS botões da tela de Melhorias ("Escolher: …" e os golpes da lista), só quando algo está diferente
  // do que a base de cálculo recomenda.
  function golpesPendentes(ns, dex) {
    const lv = ns.DB.upgradesOf(dex) || {}, s = ns.DB.save, want = escolhasDe(ns, dex);
    if (!want) return null;
    const out = {};
    if (lv.start && want.start && ns.startMoveOf(dex) !== want.start) out.start = want.start;
    if (lv.start2 && lv.moves && want.start2 && ns.startMove2Of(dex) !== want.start2) out.start2 = want.start2;
    const nb = lv.ban | 0;
    if (nb) {
      const quero = want.bans.filter((id) => id !== (out.start || ns.startMoveOf(dex)) && id !== (out.start2 || ns.startMove2Of(dex))).slice(0, nb);
      const tem = ((s.pban || {})[dex] || []).slice();
      if (quero.length && (tem.length !== quero.length || quero.some((id) => !tem.includes(id)))) out.bans = { quero, tem };
    }
    return Object.keys(out).length ? out : null;
  }
  async function golpes(ns) {
    const s = ns.DB.save, dex = s && s.partner;
    if (!dex) return;
    const pend = golpesPendentes(ns, dex);
    if (!pend) return;
    if (!await ir('upgrades')) return;
    const sel = document.getElementById('upg-mon');
    if (sel && +sel.value !== dex) { sel.value = String(dex); sel.dispatchEvent(new Event('change')); await sleep(300); }
    const feito = {};
    // cada lista abre logo abaixo do seu item; a tela lembra o que ficou aberto, então fecha tudo antes e abre uma por vez
    const aberta = (attr) => { const b = $(`#upg-list [${attr}]`), it = b && b.closest('.upg-item'); return !!(it && it.nextElementSibling && it.nextElementSibling.classList.contains('ban-picker')); };
    const alternar = async (attr) => { const b = $(`#upg-list [${attr}]`); if (!b) return false; b.click(); await sleep(250); return true; };
    const abrir = async (attr) => { if (!aberta(attr)) await alternar(attr); return aberta(attr); };
    const fechar = async (attr) => { if (aberta(attr)) await alternar(attr); };
    for (const at of ['data-ban', 'data-start', 'data-start2']) await fechar(at);
    const chip = (id) => $(`#upg-list .ban-picker [data-id="${id}"]`);
    if (pend.start && await abrir('data-start')) {
      const c = chip(pend.start); if (c) { c.click(); await sleep(250); feito.start = pend.start; }
      await fechar('data-start');
    }
    if (pend.start2 && await abrir('data-start2')) {
      const c = chip(pend.start2); if (c) { c.click(); await sleep(250); feito.start2 = pend.start2; }
      await fechar('data-start2');
    }
    if (pend.bans && await abrir('data-ban')) {
      const { quero, tem } = pend.bans;
      for (const id of tem) if (!quero.includes(id)) { const c = chip(id); if (c) { c.click(); await sleep(200); } }
      for (const id of quero) if (!((s.pban || {})[dex] || []).includes(id)) { const c = chip(id); if (c) { c.click(); await sleep(200); } }
      feito.bans = ((s.pban || {})[dex] || []).slice();
      await fechar('data-ban');
    }
    const nm = (id) => { const d = id && ns.Moves.BY_ID[id]; return d ? (ns.T ? ns.T(d.name, 'move') : d.name) : id; };
    if (Object.keys(feito).length) act('moves', { dex, nome: nome(ns, dex), start: nm(feito.start), start2: nm(feito.start2), bans: (feito.bans || []).map(nm) });
    await voltar('upgrades');
  }

  // ---------- 9. rotina: Halloween (skins de bruja por 300 doces) ----------
  async function skins(ns) {
    const s = ns.DB.save, have = (s && s.bag && s.bag.candy) || 0, P = ns.Halloween.SKIN_PRICE || 300;
    const falta = (ns.Skins && ns.Skins.LIST || []).filter((id) => !ns.Skins.owns(s, id));
    if (!falta.length || have < P) return;
    if (!await ir('shop')) return;
    await sleep(300);
    let n = 0;
    for (let i = 0; i < 4 && cfg.on; i++) {
      const b = $('#scr-shop [data-skin]:not([disabled])');
      if (!b) break;
      b.click(); n++;
      await sleep(400);
    }
    if (n) act('skins', { n });
    await voltar('shop');
  }

  // ---------- 10. rotina: Guardar (sobe para a nuvem uma vez por ciclo; o jogo exige 25 s entre subidas) ----------
  async function guardar(ns) {
    const dot = $('#user-pill i.sync');
    if (!dot || !dot.classList.contains('pending')) return;
    if (Date.now() - M.lastSave < 30000) return;
    const b = document.getElementById('btn-save');
    if (b && !b.disabled) { b.click(); M.lastSave = Date.now(); act('save'); await sleep(600); }
  }

  // quadros por segundo: o Chrome freia a página quando a janela está minimizada ou coberta (o jogo anda em câmera lenta)
  const FPS = { n: 0, v: 60, t0: performance.now() };
  (function conta() { FPS.n++; const t = performance.now(); if (t - FPS.t0 >= 2000) { FPS.v = Math.round(FPS.n * 1000 / (t - FPS.t0)); FPS.n = 0; FPS.t0 = t; } requestAnimationFrame(conta); })();
  setInterval(() => { if (performance.now() - FPS.t0 > 3000) FPS.v = Math.min(FPS.v, Math.round(FPS.n * 1000 / (performance.now() - FPS.t0))); }, 1000);

  // ---------- 11. status para a extensão ----------
  function status(force) {
    const ns = NS;
    if (!ns || !ns.Game) return emit({ ok: false });
    const p = ns.Game.player, s = ns.DB && ns.DB.save, st = ns.Game.state;
    const inRun = !!p && st !== 'ui';
    let tgt = null, owned = 0, maxed = 0;
    try {
      if (s && s.owned && ns.Upgrades) {
        const own = Object.keys(s.owned).map(Number).filter((d) => ns.DEX_BY[d]);
        owned = own.length;
        if (force || !status.cnt || Date.now() - status.cnt.at > 15000) {
          status.cnt = { at: Date.now(), maxed: own.filter((d) => progresso(ns, d).maxed).length };
        }
        maxed = status.cnt.maxed;
        const pr = s.partner && progresso(ns, s.partner);
        const sm = ns.SPRITE_META && ns.SPRITE_META[s.partner], id = sm && sm.a && sm.a.Idle;
        tgt = s.partner ? { dex: s.partner, name: nome(ns, s.partner), have: pr.have, total: pr.total, meta: id ? [id.w, id.h, id.n, id.d] : null, types: (ns.DEX_BY[s.partner] || {}).types || [] } : null;
        // 0.4.0: build planejada pela base de cálculo, para o painel (nomes no idioma do jogo)
        if (tgt) try {
          const pl = planoDe(ns, s.partner), nm = (id) => { const d = id && ns.Moves.BY_ID[id]; return d ? (ns.T ? ns.T(d.name, 'move') : d.name) : null; };
          if (pl) tgt.build = { a: nm(pl.a), b: nm(pl.b), buffs: pl.buffs.map(nm).filter(Boolean), parceiro: nm(pl.parceiro) };
          try { tgt.nat = ns.Mons.name(ns.Mons.natureOf(s.partner).n); tgt.abil = ns.Mons.abilityName(ns.Mons.abilityOf(s.partner).id); } catch (_) {}
        } catch (e) { log('build', e); }
      }
    } catch (_) {}
    const scr = document.querySelector('#app > .scr:not(.hidden), body > .scr:not(.hidden), .scr:not(.hidden)');
    emit({
      ok: true, on: cfg.on, st, fps: FPS.v, scr: scr ? scr.id : null, mode: inRun ? (S.mode || '') : '', task: M.task, err: M.err,
      modo: cfg.modo, coop: emGrupo(ns), coopOk: !!M.coopOk || anfitriao(ns), coopHost: !!(ns.Coop && ns.Coop.active && ns.Coop.isHost), party: naSala(ns), hidden: document.visibilityState !== 'visible', userPaused: M.userPausedAt > 0 && st === 'paused',
      run: inRun ? { hp: Math.round(p.hp), max: Math.round(p.maxHp), lv: p.level, t: Math.round((ns.Game.st && ns.Game.st.time) || 0), k: p.kills, dex: p.dex } : null,
      coins: s ? s.coins : null, t1: s && s.tickets ? s.tickets.t1 : null, t10: s && s.tickets ? s.tickets.t10 : null,
      candy: s && s.bag ? s.bag.candy || 0 : 0, hw: !!(ns.Halloween && ns.Halloween.on), guest: !!(ns.DB && ns.DB.guest),
      partner: tgt, owned, maxed, sess, acts, touched: M.touched,
    });
  }

  // ======================= cérebro: base de cálculo (0.4.0) =======================
  // Tudo é lido do próprio jogo na hora (G.Moves, G.DEX_BY, G.Enemies, G.Types, G.Stats, G.Weather): quando o jogo
  // muda um número, os cálculos mudam junto, sem precisar reescrever nada aqui. Os cálculos alimentam:
  //   - as cartas (golpes novos, melhorias, evoluções) → seguem a build planejada do Pokémon;
  //   - a escolha do parceiro entre partidas (força calculada da build);
  //   - o desvio (ameaça de cada comportamento de inimigo);
  //   - o painel (build planejada e o porquê).
  const KB = { castKey: '', cov: null, covBoss: null, alvos: null, plans: {}, vals: {}, learn: {}, run: new Map(), fx: {}, abOut: {} };
  const CROWD_R = 46;                                         // ~1 inimigo a cada 46 px de raio numa horda
  const crowd = (r) => Math.max(1, Math.min(10, ((r || 0) / CROWD_R) ** 2));

  // Quantos inimigos um disparo acerta: alvo único grande (chefe) e horda. Geometria tirada de systems/combat.js.
  function hitsOf(m) {
    const n = Math.max(1, m.count | 0), pierce = m.pierce | 0, r = m.radius || 0;
    switch (m.kind) {
      case 'projectile': case 'homing': {
        const single = m.homing ? n : 1 + (n - 1) * 0.35;
        return [single, n * (1 + pierce * 0.7) * 0.9];
      }
      case 'bounce': return [1 + (n - 1) * 0.35, n * (1 + (m.bounce | 0) * 0.8)];
      case 'nova': { const k = Math.max(3, n); return [Math.max(1, k * 0.15), k * (1 + pierce * 0.6) * 0.45]; }
      case 'cone': return [n * 0.45, n * (1 + pierce * 0.6) * 0.55];
      case 'melee': return [1, Math.max(1, crowd(r) * Math.min(1, (m.arc || 1.7) / 6.283))];
      case 'beam': return [1, Math.max(1, Math.min(8, r * (m.width || 20) / 1800))];
      case 'charge': return [0.9, 0.9 * Math.max(1, Math.min(8, r * (m.width || 20) / 1800))];
      case 'aura': case 'shove': case 'stun': return [1, crowd(r)];
      case 'orbit': return [n * 0.6 * (m.speed || 2.4) / 2.4, n * 1.8 * (m.speed || 2.4) / 2.4];
      case 'boomerang': return [n * 1.6, n * Math.max(1, crowd(r * 0.6)) * 1.5];
      case 'chain': return [1, 1 + n];
      case 'mine': return [n * 0.35, n * crowd(r) * 0.6];
      case 'meteor': return [n * 0.6, n * crowd(r) * 0.5];
      case 'turret': { const shots = (m.dur || 4) / (m.rate || 1) * n; return [shots * 0.6, shots]; }
      case 'dash': return [1, Math.max(1, crowd(Math.sqrt(r * (m.width || 30))))];
      case 'trail': return [(m.dur || 3) * 0.5, crowd(r) * (m.dur || 3) * 0.5];
      case 'spin': return [n, n * crowd(r)];
      case 'quake': return [Math.max(1, n * 0.35), n * crowd(r) * 0.35];
      case 'vortex': return [(m.dur || 2.6), crowd(r) * (m.dur || 2.6) * 0.6];
      default: return [0, 0];
    }
  }
  // Dano por segundo "cru" de uma instância de golpe (sem os atributos do Pokémon): [chefe, horda].
  function rawDps(m) {
    if (!m || m.kind === 'buff' || !m.dmg) return [0, 0];
    let [h1, hN] = hitsOf(m);
    // aprendido nas partidas: acertos efetivos por disparo medidos de verdade (inclui tipo, crítico e erros de mira)
    const L = KB.learn[m.id] || KB.learn['k:' + m.kind];
    if (L && L.n > 20) { const c = Math.min(0.85, L.n / 300), mod = (0.4 * h1 + 0.6 * hN) || 1; const k = (1 - c) + c * (L.eff / mod); h1 *= k; hN *= k; }
    const per = m.kind === 'orbit' ? 1 : Math.max(0.1, m.cd || 1);
    const dot = (m.burn || m.poison) ? 1.15 : 1;
    return [m.dmg * h1 * dot / per, m.dmg * hN * dot / per];
  }
  // Instância do golpe no nível pedido (usa as escadas de melhoria do próprio jogo) e, se pedir, evoluído.
  function inst(ns, id, lvl, evo) {
    const key = id + ':' + lvl + ':' + (evo ? 1 : 0);
    if (KB.vals[key]) return KB.vals[key];
    let m = null;
    try {
      m = ns.Moves.instance(id, Math.min(lvl, (ns.Moves.BY_ID[id] || {}).maxLvl || 5));
      if (evo && ns.Moves.EVO && ns.Moves.EVO[id] && ns.Moves.evolve) ns.Moves.evolve(m);
    } catch (_) { m = null; }
    return (KB.vals[key] = m);
  }

  // Cobertura de tipo: média do multiplicador do jogo (G.Types.mult) contra os inimigos que vão aparecer nesta
  // partida (G.Enemies.cast, por tramo de tempo, peso pela duração do tramo) e contra os chefes (G.Enemies.BOSSES).
  function cobertura(ns) {
    const E = ns.Enemies, cast = E && E.cast;
    if (KB.fixa) return KB.cov;                                // colinha: cobertura geral travada durante a conta
    const key = cast ? cast.map((c) => c.from + ':' + c.list.map((d) => d.dex).join(',')).join('|') : 'none';
    if (KB.castKey === key && KB.cov) return KB.cov;
    KB.castKey = key; KB.cov = {}; KB.covBoss = {}; KB.tag = (KB.tag | 0) + 1;
    const tiposDe = (dex) => ((ns.DEX_BY && ns.DEX_BY[dex]) || {}).types || null;
    const alvos = [];
    if (cast && cast.length) cast.forEach((c, i) => {
      const dur = Math.max(60, ((cast[i + 1] && cast[i + 1].from) || c.from + 300) - c.from);
      for (const d of c.list) { const t = tiposDe(d.dex); if (t) alvos.push([t, dur / c.list.length]); }
    });
    const chefes = ((E && E.BOSSES) || []).map((b) => tiposDe(b.dex)).filter(Boolean);
    const tipos = Object.keys((ns.Types && ns.Types.CHART) || {});
    for (const ty of tipos) {
      let s = 0, w = 0;
      for (const [t, peso] of alvos) { s += ns.Types.mult(ty, t) * peso; w += peso; }
      KB.cov[ty] = w ? s / w : 1;
      KB.covBoss[ty] = chefes.length ? chefes.reduce((a, t) => a + ns.Types.mult(ty, t), 0) / chefes.length : 1;
    }
    KB.alvos = alvos.length ? alvos : null;
    KB.plans = {}; KB.abOut = {};
    return KB.cov;
  }

  // ----- 0.5.0: natureza e habilidade DE VERDADE do Pokémon (antes: Pokémon sem natureza e clima de qualquer
  // habilidade possível). A partida usa G.Mons.monFor(dex) (natureza) e G.AbilityFX.of(habilidade, mon).
  function monDe(ns, dex) {
    try { const s = ns.DB && ns.DB.save; if (ns.Mons && s && s.owned && s.owned[dex]) return ns.Mons.monFor(dex); } catch (_) {}
    return ns.DEX_BY && ns.DEX_BY[dex];
  }
  function abilDe(ns, dex) { try { return (ns.Mons && ns.Mons.abilityOf(dex).id) || ''; } catch (_) { return ''; } }
  function fxDe(ns, mon, id) {
    if (!ns.AbilityFX || !mon) return null;
    const ab = id != null ? id : abilDe(ns, mon.dex), k = mon.dex + ':' + ab;
    if (KB.fx[k] !== undefined) return KB.fx[k];
    let fx = null;
    try { fx = ns.AbilityFX.of(ab, mon); } catch (_) {}
    return (KB.fx[k] = fx);
  }
  // Clima que a habilidade põe (Weather.KINDS do jogo, systems/weather.js); fica ~75% da partida (volta a cada 3 min)
  const WX = { sun: { fire: 1.5, water: 0.5 }, rain: { water: 1.5, electric: 1.2, fire: 0.5 }, sand: { rock: 1.3, ground: 1.3, steel: 1.3 }, snow: { ice: 1.5 }, fog: { ghost: 1.3, fairy: 1.3, psychic: 1.3 } };
  // Chama os ganchos da habilidade com um Math.random fixo (mesma conta toda vez: Afán, Mal Olor... viram a média)
  function semSorte(fn) {
    const R = Math.random; let i = 0;
    Math.random = () => ((i++ * 0.6180339887 + 0.31) % 1);
    try { return fn(); } finally { Math.random = R; }
  }
  const plFalso = (mon, low) => ({ mon, hp: low ? 25 : 80, maxHp: 100, level: 25, moxie: 0.1, angry: low, slowT: 0, x: 0, y: 0, r: 12, bodyH: 20, buffs: {}, critChance: 0.1 });
  const inimigos = () => (KB.alvos && KB.alvos.length ? KB.alvos : [[['normal'], 1]]);
  // × no dano do golpe pela habilidade: 75% do tempo com vida alta, 25% com pouca, contra os inimigos desta partida
  function abilOut(ns, mon, fx, m) {
    if (!fx || !fx.out || !m) return 1;
    const key = (mon && mon.dex) + ':' + (fx.d || '') + ':' + m.id + ':' + (m.lvl || 1) + ':' + (m.dmg || 0) + ':' + (KB.fixa ? 'g' : KB.tag | 0);
    if (KB.abOut[key] != null) return KB.abOut[key];
    const alvos = inimigos();
    const v = semSorte(() => {
      let s = 0, w = 0;
      for (const low of [false, true]) {
        const pl = plFalso(mon, low), wl = low ? 0.25 : 0.75;
        for (let j = 0; j < alvos.length; j += Math.max(1, Math.floor(alvos.length / 10))) {
          const [types, peso] = alvos[j];
          let x = 0;
          for (let i = 0; i < 6; i++) { let o = 1; try { o = +fx.out(pl, m, { types, x: 40, y: 0, hp: 100, maxHp: 100 }); } catch (_) {} x += o > 0 ? o : 1; }
          s += (x / 6) * peso * wl; w += peso * wl;
        }
      }
      return w ? s / w : 1;
    });
    return (KB.abOut[key] = v);
  }
  // Sobrevivência e velocidade que a habilidade dá: [× vida efetiva, × velocidade, × ritmo de disparo]
  function abilCorpo(mon, fx) {
    if (!fx) return [1, 1, 1];
    return semSorte(() => {
      let inn = 0, dodge = 0, n = 0, spd = 1;
      const alvos = inimigos();
      for (let j = 0; j < alvos.length; j += Math.max(1, Math.floor(alvos.length / 10))) {
        const type = (alvos[j][0] || ['normal'])[0];
        for (const c of ['p', 's']) {
          const pl = plFalso(mon, false);
          let k = 1; try { if (fx.inMul) k = +fx.inMul(pl, type, c) || 1; } catch (_) {}
          if (fx.absorb === type) k = 0.2;
          let d = 0; try { if (fx.dodge) d = +fx.dodge(pl, type, c) || 0; } catch (_) {}
          inn += k; dodge += Math.min(0.6, d); n++;
        }
      }
      try { if (fx.speed) spd = +fx.speed(plFalso(mon, false)) || 1; } catch (_) {}
      const take = (inn / n) * (1 - dodge / n);
      return [1 / Math.max(0.3, take), spd, 1 / Math.max(0.5, fx.cdMul || 1)];
    });
  }
  // Defesa como o jogo conta (G.Stats.guard: 75 = normal, tudo entre −22% e +25% de dano recebido)
  const guarda = (d) => Math.min(1.25, Math.max(0.78, Math.pow(75 / Math.max(5, d || 75), 0.35)));

  // Valor de um golpe para um Pokémon: dano/s × lado físico/especial × monotipo × habilidade × cobertura,
  // misturando alvo único (chefes, peso 0,4) e horda (0,6).
  function valorGolpe(ns, mon, m, fx) {
    if (!m || m.kind === 'buff') return 0;
    cobertura(ns);
    const [s, h] = rawDps(m);
    let k = m.cat && ns.Stats ? ns.Stats.fit(mon, m.cat) : 1;
    if (mon.types && mon.types.length === 1 && m.type === mon.types[0]) k *= 1.2;
    if (fx === undefined) fx = fxDe(ns, mon);
    if (fx) {
      k *= abilOut(ns, mon, fx, m);
      const w = fx.summon && WX[fx.summon];
      if (w && w[m.type]) k *= 1 + (w[m.type] - 1) * 0.75;
    } else {
      const abil = ((ns.DEX_ABIL && ns.DEX_ABIL[mon.dex]) || []).filter(Boolean);
      for (const a of abil) if (WEATHER_OF[a] === m.type) k *= WEATHER_MUL[m.type];
    }
    // o farm luta andando em volta da horda (kite): golpe de alcance curto acerta menos do que a conta pura diz, e
    // órbita não combina com a troca de ataque (sumiria a cada troca)
    if (!(KB.learn[m.id] && KB.learn[m.id].n > 20)) k *= Math.max(0.5, Math.min(1, moveReach(m) / 200));
    if (m.kind === 'orbit') k *= 0.6;
    const cv = (KB.cov && KB.cov[m.type]) || 1, cb = (KB.covBoss && KB.covBoss[m.type]) || 1;
    return k * (0.4 * s * cb + 0.6 * h * cv);
  }
  // Valor no começo (nível 1) e no fim (nível máximo evoluído): a build olha os dois.
  function valorBuild(ns, mon, id, fx) {
    const d = ns.Moves.BY_ID[id];
    if (!d || d.kind === 'buff') return 0;
    const v1 = valorGolpe(ns, mon, inst(ns, id, 1, false), fx);
    const vMax = valorGolpe(ns, mon, inst(ns, id, d.maxLvl || 5, !!(ns.Moves.EVO && ns.Moves.EVO[id])), fx);
    return 0.35 * v1 * 3 + 0.65 * vMax;               // ×3 no nível 1: compara na mesma escala do fim
  }

  function poolDe(ns, mon) { try { return ns.Moves.poolFor(mon); } catch (_) { return []; } }
  // Build planejada de um Pokémon: os 2 ataques principais, os buffs e o parceiro de troca.
  // O 2º ataque ganha bônus se cobre o ponto fraco do 1º (horda × alvo único, ou tipo diferente).
  function planoCalc(ns, mon, fx, pool) {
    const ataques = pool.filter((id) => { const d = ns.Moves.BY_ID[id]; return d && d.kind !== 'buff'; })
      .map((id) => ({ id, v: valorBuild(ns, mon, id, fx), d: ns.Moves.BY_ID[id] }))
      .filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    if (!ataques.length) return null;
    const a = ataques[0];
    const [as, ah] = rawDps(inst(ns, a.id, 1, false));
    const aHorda = ah / Math.max(1e-6, as);
    let b = null, bs = -1;
    for (const x of ataques.slice(1)) {
      const [xs, xh] = rawDps(inst(ns, x.id, 1, false));
      let bonus = 1;
      if (x.d.type !== a.d.type) bonus *= 1.08;                                // outro tipo: cobre mais inimigos
      if ((aHorda > 2.5 && xh / Math.max(1e-6, xs) < 1.6) || (aHorda < 1.6 && xh / Math.max(1e-6, xs) > 2.5)) bonus *= 1.12;
      if (x.v * bonus > bs) { bs = x.v * bonus; b = x; }
    }
    // buff de ataque do lado dos ataques da build (a natureza pode virar o lado "forte" sem a build mudar)
    const lado = a.d.cat || (ns.Stats ? ns.Stats.sideOf(mon) : 'physical');
    const buffs = ['harden', lado === 'physical' ? 'swords-dance' : 'nasty-plot'].filter((id) => pool.includes(id));
    // parceiro de troca: golpe de recarga curta e que alcança longe (fica pronto rápido depois de cada troca)
    const resto = ataques.filter((x) => x !== a && x !== b && x.d.kind !== 'orbit' && x.d.kind !== 'charge');   // órbita/carga não servem de parceiro
    const parc = resto.slice().sort((x, y) => (x.d.cd || 1) - (y.d.cd || 1) || y.v - x.v)[0] || null;
    return { dex: mon.dex, a: a.id, b: b && b.id, buffs, parceiro: parc && parc.id, val: Object.fromEntries(ataques.map((x) => [x.id, x.v])), top: a.v };
  }
  function planoDe(ns, dex) {
    cobertura(ns);
    if (KB.plans[dex]) return KB.plans[dex];
    const mon = monDe(ns, dex);
    if (!mon) return null;
    const p = planoCalc(ns, mon, fxDe(ns, mon), poolDe(ns, mon));
    return p ? (KB.plans[dex] = p) : null;
  }

  // Força de um Pokémon (para escolher o parceiro e para a loja): dano da build × sobrevivência (vida e defesas
  // como o jogo conta) × velocidade, tudo com a natureza e a habilidade dele.
  function forcaPlano(mon, fx, p) {
    if (!p) return 0;
    const [vida, vel, ritmo] = abilCorpo(mon, fx);
    const off = (mon.atk || 1) * (p.top + 0.6 * ((p.b && p.val[p.b]) || 0)) * ritmo;
    const tough = (mon.hp || 80) / 100 / (0.5 * guarda(mon.df) + 0.5 * guarda(mon.sd)) * vida;
    return off * Math.sqrt(tough) * (0.8 + 0.2 * (mon.spd || 100) * vel / 110);
  }
  function forcaDe(ns, dex) {
    const mon = monDe(ns, dex), p = mon && planoDe(ns, dex);
    return p ? forcaPlano(mon, fxDe(ns, mon), p) : 0;
  }

  // Ganho de uma carta de melhoria: quanto o golpe sobe de valor no próximo nível (escada real do jogo).
  function ganhoMelhoria(ns, mon, m) {
    if (!m || m.kind === 'buff' || !m.def || m.lvl >= (m.def.maxLvl || 5)) return 0;
    const agora = valorGolpe(ns, mon, m);
    let prox = null;
    try { prox = Object.assign({}, m); ns.Moves.levelUp(prox); } catch (_) { prox = null; }
    return prox ? Math.max(0, valorGolpe(ns, mon, prox) - agora) : 0;
  }


  // ----- aprendizado: mede, em cada partida, o dano real de cada golpe por disparo -----
  // A cada disparo do golpe (m.castAt muda), soma dano-base × ataque do Pokémon; no fim da partida, o dano que o
  // próprio jogo contou (m.dealt) dividido por essa soma = acertos efetivos por disparo. Fica guardado (por golpe e
  // por tipo de ataque) e corrige o modelo nas próximas partidas.
  function aprenderTick(ns, pl) {
    for (const m of pl.activeGroup()) {
      if (m.kind === 'buff' || !m.dmg) continue;
      let r = KB.run.get(m);
      if (!r) { r = { last: m.castAt || 0, casts: 0, denom: 0 }; KB.run.set(m, r); }
      if (m.castAt && m.castAt !== r.last) { r.last = m.castAt; r.casts++; r.denom += m.dmg * pl.atkFor(m) * (m.kind === 'orbit' ? 0 : 1) * (pl.abil ? abilOut(ns, pl.mon, pl.abil, m) : 1); }
    }
  }
  function aprenderFim() {
    let mudou = false;
    for (const [m, r] of KB.run) {
      if (r.casts < 3 || r.denom <= 0 || !(m.dealt > 0)) continue;
      const eff = m.dealt / r.denom;
      if (!(eff > 0 && eff < 60)) continue;
      for (const key of [m.id, 'k:' + m.kind]) {
        const L = KB.learn[key] || { eff, n: 0 };
        const a = Math.min(0.5, r.casts / (L.n + r.casts));
        L.eff = L.eff * (1 - a) + eff * a; L.n = Math.min(5000, L.n + r.casts);
        KB.learn[key] = L; mudou = true;
      }
    }
    KB.run = new Map(); KB.plans = {}; KB.vals = {};
    if (mudou) try { document.dispatchEvent(new CustomEvent('sobrevida:learn', { detail: JSON.stringify(KB.learn) })); } catch (_) {}
  }

  // ----- 0.4.0: escolhas das Melhorias (Golpe inicial, Segundo golpe inicial, Veto) pela base de cálculo -----
  // Golpe inicial = o golpe de maior valor que o jogo deixa escolher para começar; segundo = o próximo; Veto = os que
  // menos servem para este Pokémon (primeiro os buffs fora da build, porque a partida aceita só 2 buffs; depois os
  // ataques de menor valor). Nunca veta golpe da build.
  function escolhasDe(ns, dex, planoDado, monDado) {
    const mon = monDado || monDe(ns, dex);
    const pl = planoDado || (mon && planoDe(ns, dex));
    if (!pl) return null;
    let choices = [];
    try { choices = ns.startChoices(dex) || []; } catch (_) {}
    const val = (id) => (pl.val[id] != null ? pl.val[id] : valorBuild(ns, mon, id));
    const ord = choices.filter((id) => { const d = ns.Moves.BY_ID[id]; return d && d.kind !== 'buff'; }).sort((x, y) => val(y) - val(x));
    const start = ord[0] || null, start2 = ord.find((id) => id !== start) || null;
    let pool = [];
    try { pool = ns.Moves.poolFor(mon); } catch (_) {}
    const manter = new Set([start, start2, pl.a, pl.b, pl.parceiro, ...pl.buffs].filter(Boolean));
    const resto = pool.filter((id) => !manter.has(id));
    const buffsFora = resto.filter((id) => (ns.Moves.BY_ID[id] || {}).kind === 'buff');
    const ataquesFracos = resto.filter((id) => (ns.Moves.BY_ID[id] || {}).kind !== 'buff').sort((x, y) => val(x) - val(y));
    return { start, start2, bans: buffsFora.concat(ataquesFracos) };
  }

  // ----- 0.5.0: Loja Kecleon — o que vale comprar/usar para o Pokémon -----
  // Para cada natureza (25), cada habilidade que a Cápsula/Cápsula Oculta deixa pôr e cada MT (do dia ou já na
  // Mochila) que ele aprende, refaz a build e a força com a mesma base de cálculo. Devolve as opções que melhoram,
  // com o ganho relativo de força e o preço.
  function opcoesLoja(ns, dex) {
    const s = ns.DB && ns.DB.save, base = ns.DEX_BY && ns.DEX_BY[dex];
    if (!s || !base || !ns.Mons || !ns.NATURES || !ns.Shop || !(s.owned && s.owned[dex])) return [];
    cobertura(ns);
    const mon0 = monDe(ns, dex), ab0 = abilDe(ns, dex), pool0 = poolDe(ns, mon0);
    const forca = (mon, ab, pool) => { const fx = fxDe(ns, mon, ab); return forcaPlano(mon, fx, planoCalc(ns, mon, fx, pool)); };
    const f0 = forca(mon0, ab0, pool0);
    if (!(f0 > 0)) return [];
    const out = [], preco = (k) => ((ns.Shop.ITEMS || {})[k] || {}).price || 0;
    // natureza: +10% num stat, −10% noutro (G.Mons.monFor)
    let bestN = null, fN = f0;
    for (const n of ns.NATURES) {
      const m = Object.assign({}, base);
      if (n.up) m[n.up] = base[n.up] * 1.1;
      if (n.down) m[n.down] = base[n.down] * 0.9;
      m.atk = Math.max(m.pa, m.sa); m.nature = n.id;
      const f = forca(m, ab0, pool0);
      if (f > fN * 1.0001) { fN = f; bestN = n; }
    }
    if (bestN) out.push({ tipo: 'mint', item: 'mint', alvo: bestN.id, ganho: fN / f0 - 1, preco: preco('mint'), tem: ns.Shop.count('mint') > 0 });
    // habilidade: Cápsula (as normais) e Cápsula Oculta (inclui a oculta)
    const slots = ns.Mons.slots(dex);
    for (const [item, oculta] of [['cap', false], ['caph', true]]) {
      let best = null, fA = f0;
      for (const i of ns.Mons.abilityChoices(dex, oculta)) {
        const f = forca(mon0, slots[i], pool0);
        if (f > fA * 1.0001) { fA = f; best = i; }
      }
      if (best != null) out.push({ tipo: item, item, alvo: best, ab: slots[best], ganho: fA / f0 - 1, preco: preco(item), tem: ns.Shop.count(item) > 0 });
    }
    // MT: as 8 do dia e as que já estão na Mochila
    let hoje = [];
    try { hoje = ns.Shop.dailyTms() || []; } catch (_) {}
    for (const id of new Set(hoje.concat(Object.keys(s.tms || {})))) {
      if (!ns.Mons.canLearn(dex, id)) continue;
      const tem = ns.Shop.tmCount(id) > 0;
      if (!tem && !hoje.includes(id)) continue;
      const f = forca(mon0, ab0, pool0.concat([id]));
      if (f > f0 * 1.0001) out.push({ tipo: 'tm', item: 'tm:' + id, alvo: id, ganho: f / f0 - 1, preco: ns.Shop.tmPrice(id), tem });
    }
    return out.sort((a, b) => b.ganho - a.ganho);
  }
  // Esqueça o que foi calculado deste Pokémon (mudou natureza, habilidade ou MT)
  function esquecer(dex) { KB.plans = {}; KB.plansG = {}; KB.fx = {}; KB.abOut = {}; }


  // ----- 0.7.0: colinha (natureza, habilidade, build e MT de cada Pokémon) -----
  // Para quem joga na mão: mesma base de cálculo, mas contra TODOS os inimigos que podem aparecer (G.Enemies.TIERS +
  // candidates(), sem o sorteio desta partida) e todos os chefes possíveis (BOSS_SLOTS por BST). Assim a colinha não
  // muda de uma partida para outra.
  function coberturaGeral(ns) {
    if (KB.geral) return KB.geral;
    const E = ns.Enemies, tipos = Object.keys((ns.Types && ns.Types.CHART) || {});
    const alvos = [], chefes = [];
    try {
      const T = E.TIERS || [];
      T.forEach((t, i) => {
        const dur = Math.max(60, ((T[i + 1] && T[i + 1].from) || t.from + 300) - t.from);
        const c = E.candidates(t) || [];
        for (const p of c) if (p.types) alvos.push([p.types, dur / c.length]);
      });
      for (const sl of (E.BOSS_SLOTS || [])) {
        const pool = (ns.DEX || []).filter((p) => !p.leg && p.bst >= sl.bst[0] && p.bst <= sl.bst[1]);
        for (const p of pool) chefes.push([p.types, 1 / pool.length]);
      }
    } catch (_) {}
    const cov = {}, covBoss = {};
    for (const ty of tipos) {
      let s = 0, w = 0, sb = 0, wb = 0;
      for (const [t, peso] of alvos) { s += ns.Types.mult(ty, t) * peso; w += peso; }
      for (const [t, peso] of chefes) { sb += ns.Types.mult(ty, t) * peso; wb += peso; }
      cov[ty] = w ? s / w : 1; covBoss[ty] = wb ? sb / wb : 1;
    }
    // amostra dos inimigos para os ganchos das habilidades (no máximo ~60, espalhados)
    const passo = Math.max(1, Math.floor(alvos.length / 60));
    return (KB.geral = { cov, covBoss, alvos: alvos.filter((_, i) => i % passo === 0) });
  }
  function comGeral(ns, fn) {
    const g = coberturaGeral(ns), salvo = { cov: KB.cov, covBoss: KB.covBoss, alvos: KB.alvos, fixa: KB.fixa, plans: KB.plans };
    KB.cov = g.cov; KB.covBoss = g.covBoss; KB.alvos = g.alvos; KB.fixa = true; KB.plans = KB.plansG || (KB.plansG = {});
    try { return fn(); } finally { KB.cov = salvo.cov; KB.covBoss = salvo.covBoss; KB.alvos = salvo.alvos; KB.fixa = salvo.fixa; KB.plans = salvo.plans; }
  }
  const COLA = new Map();
  function colinha(ns, dex) {
    const base = ns.DEX_BY && ns.DEX_BY[dex], s = ns.DB && ns.DB.save;
    if (!base || !ns.Mons || !ns.NATURES) return null;
    const dono = !!(s && s.owned && s.owned[dex]);
    const nat0 = dono ? ns.Mons.natureOf(dex) : null, ab0 = dono ? ns.Mons.abilityOf(dex) : null;
    const ensinadas = dono ? ns.Mons.taught(dex) : [];
    const chave = [dex, nat0 && nat0.id, ab0 && ab0.slot, ensinadas.join(','), Object.keys(KB.learn).length].join('|');
    if (COLA.has(chave)) return COLA.get(chave);
    const nm = (id) => { const d = id && ns.Moves.BY_ID[id]; return d ? (ns.T ? ns.T(d.name, 'move') : d.name) : null; };
    const r = comGeral(ns, () => {
      const comNat = (n) => { const m = Object.assign({}, base); if (n && n.up) { m[n.up] = base[n.up] * 1.1; m[n.down] = base[n.down] * 0.9; } m.atk = Math.max(m.pa, m.sa); m.nature = n ? n.id : ''; return m; };
      const slots = ns.Mons.slots(dex);
      const abAtual = ab0 ? ab0.id : slots[0];
      const pool0 = poolDe(ns, dono ? ns.Mons.monFor(dex) : base);
      const forca = (mon, ab, pool) => { const fx = fxDe(ns, mon, ab); const p = planoCalc(ns, mon, fx, pool); return [p ? forcaPlano(mon, fx, p) : 0, p]; };
      // 1) melhor natureza com a habilidade atual (ou a 1ª, se não tem o Pokémon)
      let bestN = null, fN = -1;
      for (const n of ns.NATURES) { const [f] = forca(comNat(n), abAtual, pool0); if (f > fN * 1.0001) { fN = f; bestN = n; } }
      // 2) melhor habilidade com essa natureza (normais e oculta à parte)
      const monN = comNat(bestN);
      const habs = [0, 1, 2].filter((i) => slots[i] && !(i === 1 && slots[1] === slots[0])).map((i) => ({ i, id: slots[i], f: forca(monN, slots[i], pool0)[0] }));
      const normal = habs.filter((h) => h.i < 2).sort((a, b) => b.f - a.f)[0] || null;
      const oculta = habs.find((h) => h.i === 2) || null;
      const melhorAb = oculta && normal && oculta.f > normal.f * 1.03 ? oculta : normal || oculta;
      // 3) natureza de novo com a melhor habilidade (uma muda a outra) e a build final
      let bestN2 = bestN, fN2 = -1;
      for (const n of ns.NATURES) { const [f] = forca(comNat(n), melhorAb.id, pool0); if (f > fN2 * 1.0001) { fN2 = f; bestN2 = n; } }
      const monF = comNat(bestN2);
      const [fFinal, plano] = forca(monF, melhorAb.id, pool0);
      // 4) MT que melhoram (todas as que ele aprende, não só as do dia)
      let mts = [];
      try {
        const lista = ns.Mons.learnable ? (dono ? ns.Mons.learnable(dex) : (ns.TM_OF(dex) || []).filter((id) => ns.Moves.BY_ID[id] && !ns.Mons.natural(dex, id))) : [];
        mts = lista.map((id) => ({ id, nome: nm(id), ganho: forca(monF, melhorAb.id, pool0.concat([id]))[0] / fFinal - 1, preco: ns.Shop ? ns.Shop.tmPrice(id) : 0 }))
          .filter((x) => x.ganho >= 0.02).sort((a, b) => b.ganho - a.ganho).slice(0, 3)
          .map((x) => ({ nome: x.nome, ganho: Math.round(x.ganho * 100), preco: x.preco }));
      } catch (_) {}
      // ganhos em relação ao que o Pokémon tem hoje
      let fHoje = 0;
      if (dono) fHoje = forca(ns.Mons.monFor(dex), abAtual, pool0)[0];
      const fSoNat = dono ? forca(comNat(bestN2), abAtual, pool0)[0] : 0;
      const nomeNat = (n) => (n ? ns.Mons.name(n.n) : '');
      const escolhas = (() => { try { return plano ? escolhasDe(ns, dex, plano, monF) : null; } catch (_) { return null; } })();
      return {
        dex, nome: base.name, dono,
        nat: { id: bestN2.id, nome: nomeNat(bestN2), up: bestN2.up, down: bestN2.down, atual: nat0 ? nomeNat(nat0) : null, ok: !!(nat0 && nat0.id === bestN2.id),
               ganho: dono && fHoje > 0 ? Math.round((fSoNat / fHoje - 1) * 100) : null },
        ab: { nome: ns.Mons.abilityName(melhorAb.id), oculta: melhorAb.i === 2, atual: ab0 ? ns.Mons.abilityName(ab0.id) : null, ok: !!(ab0 && ab0.id === melhorAb.id),
              ganho: dono && fSoNat > 0 ? Math.round((fFinal / fSoNat - 1) * 100) : null,
              desc: (() => { try { const fx = ns.AbilityFX.of(melhorAb.id, monF), t = (x) => (x && ns.T ? ns.T(x) : x); return [t(fx.d), t(fx.d2)].filter(Boolean).join(' '); } catch (_) { return ''; } })() },
        build: plano ? { a: nm(plano.a), b: nm(plano.b), buffs: plano.buffs.map(nm).filter(Boolean), parceiro: nm(plano.parceiro),
                         lado: (ns.Moves.BY_ID[plano.a] || {}).cat || '' } : null,
        inicio: escolhas ? { a: nm(escolhas.start), b: nm(escolhas.start2), vetos: escolhas.bans.slice(0, 3).map(nm).filter(Boolean) } : null,
        mts, total: dono && fHoje > 0 ? Math.round((fFinal / fHoje - 1) * 100) : null,
      };
    });
    if (COLA.size > 200) COLA.clear();
    COLA.set(chave, r);
    return r;
  }
  // pedido da extensão (mundo isolado): a colinha do Pokémon aberto na coleção
  document.addEventListener('sobrevida:pedir', (e) => {
    let q = null;
    try { q = JSON.parse(e.detail || '{}'); } catch (_) { return; }
    if (!q || q.tipo !== 'colinha' || !NS) return;
    let r = null;
    try { r = colinha(NS, +q.dex); } catch (er) { log('colinha', er); }
    try { document.dispatchEvent(new CustomEvent('sobrevida:colinha', { detail: JSON.stringify({ dex: +q.dex, r }) })); } catch (_) {}
  });

  // ======================= visual novo da partida (0.6.0) =======================
  // O jogo desenha o HUD inteiro no canvas, numa função só (G.HUD.draw, ui/hud.js). Aqui ela é envolvida:
  //   1. recorta (clip) as áreas que a Sobrevida redesenha;
  //   2. chama o desenho original (continua registrando os toques nos golpes e esferas, fenda, eventos, clima…);
  //   3. desenha por cima, no mesmo quadro: card do Pokémon, relógio, barra do chefe e barra de golpes.
  // Visual tirado do próprio jogo (css/style.css: caixa azul com borda branca, contorno escuro, dourado, Pixelify).
  // Qualquer erro → volta para o HUD do jogo sozinho (cfg.hud desliga pelo painel).
  const VIS = { falhas: 0, t: 0, dur: {}, hp: null, boss: new Map(), retrato: null, retratoKey: '', mini: new Map() };
  const COR = { box1: '#2c519f', box2: '#1a3170', edge: '#f4f8ff', edgeIn: '#5b83d6', edgeOut: '#0b1838', gold: '#ffd23f', gold2: '#f0a31e', muted: '#b9cbf0', shadow: '#0a1430', bond: '#ff8ad8' };
  const FNT = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const BUFF_COR = { atk: '#ff6b4d', patk: '#ff6b4d', satk: '#c47bff', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
  const BUFF_TXT = { atk: 'ATK', patk: 'ATK', satk: 'AT.E', spd: 'VEL', def: 'DEF', regen: 'REG' };
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Caixa do jogo: contorno escuro, borda branca, gradiente azul e linha interna
  function caixa(ctx, x, y, w, h, r, a = 0.93) {
    rr(ctx, x - 2, y - 2, w + 4, h + 4, r + 2); ctx.fillStyle = COR.edgeOut; ctx.fill();
    rr(ctx, x, y, w, h, r); ctx.fillStyle = COR.edge; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, COR.box1); g.addColorStop(1, COR.box2);
    ctx.globalAlpha = a; rr(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2)); ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
    rr(ctx, x + 3.5, y + 3.5, w - 7, h - 7, Math.max(2, r - 3)); ctx.lineWidth = 1.2; ctx.strokeStyle = COR.edgeIn; ctx.stroke();
  }
  function txt(ctx, s, x, y, cor, font, align = 'left') {
    ctx.font = font; ctx.textAlign = align;
    ctx.fillStyle = COR.shadow; ctx.fillText(s, x + 1.5, y + 1.5);
    ctx.fillStyle = cor; ctx.fillText(s, x, y);
  }
  // Barra com rastro do dano (o pedaço perdido some devagar, como nos jogos), brilho em cima e marcas
  function barra(ctx, x, y, w, h, frac, rastro, cores, marcas = 0) {
    frac = lim(frac, 0, 1); rastro = lim(rastro == null ? frac : rastro, frac, 1);
    rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2); ctx.fillStyle = COR.edgeOut; ctx.fill();
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = '#16203f'; ctx.fill();
    ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip();
    if (rastro > frac) { ctx.fillStyle = 'rgba(255,236,190,.85)'; ctx.fillRect(x, y, w * rastro, h); }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, cores[0]); g.addColorStop(1, cores[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w * frac, h);
    ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillRect(x, y + 1, w * frac, Math.max(1, h * 0.28));
    if (marcas) { ctx.fillStyle = 'rgba(11,24,56,.55)'; for (let i = 1; i < marcas; i++) ctx.fillRect(Math.round(x + w * i / marcas), y, 1, h); }
    ctx.restore();
  }
  const corVida = (f) => (f > 0.5 ? ['#8dfc9a', '#2fb854'] : f > 0.2 ? ['#ffe27a', '#e0a020'] : ['#ff9a9a', '#e0303f']);
  const corChefe = (f) => (f > 0.5 ? ['#ffe27a', '#f0a31e'] : f > 0.25 ? ['#ffb46b', '#e0601e'] : ['#ff9a9a', '#d42a3c']);
  // rastro: segue o valor na hora quando sobe e desce devagar quando cai
  function rastro(obj, k, frac, dt) {
    const v = obj[k];
    obj[k] = v == null || frac >= v ? frac : Math.max(frac, v - dt * 0.55);
    return obj[k];
  }
  const sigla = (ns) => { const l = (ns.I18n && ns.I18n.lang) || 'es'; return l === 'en' || l.startsWith('zh') ? 'HP' : 'PS'; };

  // ---------- geometria (igual à do jogo, para os toques continuarem batendo) ----------
  function layout(ns, w, h, pl) {
    const sa = ns.Touch && ns.Touch.safeArea ? ns.Touch.safeArea() : { left: 0, top: 0, right: 0, bottom: 0 };
    const touch = !!(ns.Touch && ns.Touch.active);
    const L = { sa, touch, cortes: [] };
    // card: fora do cooperativo (lá o jogo põe a vida dos amigos logo embaixo) e se couber ao lado do relógio
    const cardW = Math.min(276, w / 2 - 128 - sa.left);
    L.card = !(ns.Coop && ns.Coop.active) && cardW >= 196 ? { x: 12 + sa.left, y: 12 + sa.top, w: cardW, h: 74 } : null;
    L.relogio = { x: w / 2 - 108, y: 8 + sa.top * 0, w: 216, h: 60 };
    const boss = ns.EnemyMgr && ns.EnemyMgr.all().find((e) => e.boss && !e.dead);
    L.boss = boss || null;
    const bw = Math.min(420, w - 80);
    // painel do chefe: centrado, ou logo à direita do card quando a tela é estreita
    const cardDir = L.card ? L.card.x + L.card.w + 10 : 0;
    const cx0 = Math.max((w - bw) / 2, cardDir), cw0 = Math.min(bw, w - 10 - cx0);
    L.chefe = boss ? { x: cx0, y: 74, w: cw0, h: 30 } : null;
    // golpes (ui/hud.js: S 54, GAP 9, centrados embaixo; no celular, onde o jogador pôs)
    const S = 54, GAP = 9, n = Math.max(1, pl.slots.length), totalW = n * S + (n - 1) * GAP;
    let sx = (w - totalW) / 2;
    let sy = h - S - 18 - (touch ? Math.min(28, sa.bottom) : 0);
    const pb = touch && ns.Touch.spot && ns.Touch.spot('bar');
    if (pb) {
      const nAll = Math.max(n, pl.maxMoves), bw2 = S + 18 + nAll * S + (nAll - 1) * GAP;
      sx = lim(pb[0] * w - bw2 / 2, 6, Math.max(6, w - bw2 - 6)) + S + 18;
      sy = lim(pb[1] * h - S / 2, 24, h - S - 6);
    }
    L.golpes = { S, GAP, n, totalW, sx, sy };
    // áreas recortadas do desenho original (sem sobreposição: o recorte é evenodd)
    const meio = w / 2 - 215;
    let cardCut = 0;
    if (L.card) L.cortes.push([0, 0, w, 8]);                                          // XP na borda de cima (vai para o card)
    if (L.card) { cardCut = Math.min(meio, 470); L.cortes.push([0, 8, cardCut, 62 + sa.top]); }   // nome, vida e chips (até y 70)
    L.cortes.push([Math.max(meio, cardCut), 14, w / 2 + 215 - Math.max(meio, cardCut), 50]);   // relógio + bioma·derrotados·moedas
    if (boss || (ns.Rift && ns.Rift.inArena)) { const bx = Math.max(cardCut, Math.min((w - bw) / 2, w / 2 - 120) - 4); L.cortes.push([bx, 70 + sa.top, w - 2 * Math.min(bx, w / 2 - 120), 34]); }
    L.cortes.push([sx - S - 18 - 4, sy - 6 - 22, totalW + S + 18 + 8, S + 6 + 22 + 6]);  // golpes + objeto (com os nomes em cima)
    return L;
  }

  // ---------- card do Pokémon ----------
  function retrato(ns, pl, dt) {
    const dex = pl.mon.dex, key = dex + ':' + (pl.shiny ? 1 : 0) + ':' + ((pl.anim && pl.anim.skin) || '');
    if (!VIS.retrato || VIS.retratoKey !== key) {
      const bh = ns.Sprites.bodyHeight(dex, 1) || 48;
      VIS.retrato = new ns.Sprites.Animator(dex, lim(50 / bh, 0.35, 1.6), pl.shiny);
      VIS.retrato.skin = (pl.anim && pl.anim.skin) || null;
      VIS.retratoKey = key;
    }
    const a = VIS.retrato;
    a.dir = 0;
    // parado (Idle) olhando para a frente; o dano aparece como o clarão do jogo (as outras animações do PMD têm
    // outro enquadramento e saíam cortadas no retrato)
    a.loop('Idle');
    a.update(dt);
    return a;
  }
  function desenharCard(ns, ctx, pl, L, dt) {
    const { x, y, w, h } = L.card, P = 58, rx = x + 8, ry = y + 8;
    caixa(ctx, x, y, w, h, 12);
    const tc = (ns.U && ns.U.TYPE_COLOR && ns.U.TYPE_COLOR[pl.mon.types[0]]) || '#6b7a94';
    // retrato: fundo com a cor do tipo, chão e o sprite animado
    ctx.save();
    rr(ctx, rx, ry, P, P, 9); ctx.clip();
    const g = ctx.createRadialGradient(rx + P / 2, ry + P * 0.45, 4, rx + P / 2, ry + P / 2, P * 0.75);
    g.addColorStop(0, tc); g.addColorStop(1, '#0f1a3a');
    ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.fillRect(rx, ry, P, P); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(rx + P / 2, ry + P - 9, 17, 5, 0, 0, 6.2832); ctx.fill();
    try { retrato(ns, pl, dt).draw(ctx, rx + P / 2, ry + P - 9, { flash: pl.flash > 0, softFlash: true }); } catch (_) {}
    ctx.restore();
    rr(ctx, rx, ry, P, P, 9); ctx.lineWidth = 2; ctx.strokeStyle = tc; ctx.stroke();
    if (pl.shiny && ns.Icons) ns.Icons.draw(ctx, 'shiny', rx + P - 15, ry + 2, 13);
    // nome e nível
    const tx = rx + P + 10, right = x + w - 10;
    const nv = 'Nv. ' + pl.level;
    ctx.font = FNT(800, 11);
    const nw = ctx.measureText(nv).width + 12;
    rr(ctx, right - nw, y + 8, nw, 17, 8); ctx.fillStyle = 'rgba(10,20,48,.75)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = COR.gold; ctx.stroke();
    txt(ctx, nv, right - nw / 2, y + 20.5, COR.gold, FNT(800, 11), 'center');
    let nome = pl.mon.name;
    ctx.font = FNT(800, 14);
    while (nome.length > 3 && ctx.measureText(nome).width > right - nw - 6 - tx) nome = nome.slice(0, -2) + '…';
    txt(ctx, nome, tx, y + 21, '#ffffff', FNT(800, 14));
    // vida (verde → amarela → vermelha, como nos jogos) com rastro
    const fv = pl.maxHp > 0 ? pl.hp / pl.maxHp : 0;
    const bx = tx + 20, bw = right - bx;
    txt(ctx, sigla(ns), tx, y + 38, COR.gold, FNT(800, 10));
    let cores = corVida(fv);
    if (fv < 0.2 && !pl.dead) { const p = 0.5 + Math.sin(performance.now() / 120) * 0.5; ctx.globalAlpha = 0.75 + p * 0.25; }
    barra(ctx, bx, y + 30, bw, 9, fv, rastro(VIS, 'hp', fv, dt), cores);
    ctx.globalAlpha = 1;
    txt(ctx, Math.ceil(Math.max(0, pl.hp)) + ' / ' + Math.round(pl.maxHp), right, y + 52, '#eaf2ff', FNT(700, 10), 'right');
    // experiência
    const fx = pl.xpNext > 0 ? pl.xp / pl.xpNext : 0;
    txt(ctx, 'EXP', tx, y + 66, '#7fd8ff', FNT(800, 9));
    barra(ctx, tx + 24, y + 60, right - tx - 24, 5, fx, null, ['#8ae8ff', '#3a8cff']);
  }
  // chips de buff embaixo do card: acúmulos, segundos e barrinha do tempo (pisca nos 2 últimos segundos)
  function desenharBuffs(ns, ctx, pl, L) {
    let bx = L.card.x, by = L.card.y + L.card.h + 8 + (L.desvio || 0);
    const chips = [];
    for (const k in pl.buffs) {
      const b = pl.buffs[k];
      if (!(b.n > 0)) { VIS.dur[k] = 0; continue; }
      if (!(VIS.dur[k] >= b.t)) VIS.dur[k] = b.t;
      chips.push({ label: (BUFF_TXT[k] || k.toUpperCase()) + ' ×' + b.n, t: b.t, frac: b.t / (VIS.dur[k] || b.t || 1), cor: BUFF_COR[k] || '#ffffff' });
    }
    if (pl.power && pl.power.def) chips.push({ label: String(pl.power.def.name || '').toUpperCase(), t: pl.power.t, frac: pl.power.t / (pl.power.dur || pl.power.t || 1), cor: pl.power.def.color || COR.gold });
    for (const c of chips) {
      const seg = Math.ceil(c.t) + 's';
      ctx.font = FNT(800, 10); const w1 = ctx.measureText(c.label).width;
      ctx.font = FNT(700, 9); const w2 = ctx.measureText(seg).width;
      const cw = w1 + w2 + 22, ch = 20;
      if (bx + cw > L.card.x + L.card.w && bx > L.card.x) { bx = L.card.x; by += ch + 6; }
      const pisca = c.t < 2 ? 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 110)) : 1;
      ctx.globalAlpha = pisca;
      rr(ctx, bx - 1.5, by - 1.5, cw + 3, ch + 3, 8); ctx.fillStyle = COR.edgeOut; ctx.fill();
      rr(ctx, bx, by, cw, ch, 7); ctx.fillStyle = 'rgba(26,49,112,.94)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = c.cor; ctx.stroke();
      ctx.fillStyle = c.cor; rr(ctx, bx + 4, by + 5, 3, ch - 10, 1.5); ctx.fill();
      txt(ctx, c.label, bx + 11, by + 13.5, c.cor, FNT(800, 10));
      txt(ctx, seg, bx + 14 + w1, by + 13.5, COR.muted, FNT(700, 9));
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(bx + 5, by + ch - 4, cw - 10, 2);
      ctx.fillStyle = c.cor; ctx.fillRect(bx + 5, by + ch - 4, (cw - 10) * lim(c.frac, 0, 1), 2);
      ctx.globalAlpha = 1;
      bx += cw + 7;
    }
  }

  // ---------- relógio (e fenda), bioma, derrotados e moedas ----------
  function desenharRelogio(ns, ctx, pl, st, L) {
    const { x, y, w, h } = L.relogio;
    caixa(ctx, x, y, w, h, 12);
    const arena = ns.Rift && ns.Rift.inArena;
    const tempo = ns.U.mmss(st.time);
    if (ns.Icons) ns.Icons.draw(ctx, 'clock', x + 14, y + 10, 18);
    txt(ctx, tempo, x + w / 2 + 6, y + 28, '#ffffff', FNT(800, 24), 'center');
    let sub = ns.World && ns.World.biomeName ? String(ns.World.biomeName()).toUpperCase() : '';
    let corSub = COR.muted;
    if (arena) { sub = 'GRIETA · ' + ns.U.mmss(ns.Rift.timeLeft); corSub = '#d9c2ff'; }
    txt(ctx, sub, x + w / 2, y + 40, corSub, FNT(700, 9), 'center');
    // contadores com os ícones do jogo
    const itens = [['fist', String(pl.kills)], ['coin', String(pl.coins)]];
    if (ns.Halloween && ns.Halloween.inRun) itens.push(['candy', String(pl.candy || 0)]);
    ctx.font = FNT(800, 11);
    const larg = itens.map(([, v]) => 15 + ctx.measureText(v).width);
    let cx = x + w / 2 - (larg.reduce((a, b) => a + b, 0) + (itens.length - 1) * 14) / 2;
    itens.forEach(([ic, v], i) => {
      if (ns.Icons) ns.Icons.draw(ctx, ic, cx, y + 44, 12);
      txt(ctx, v, cx + 15, y + 54, ic === 'coin' ? COR.gold : '#ffffff', FNT(800, 11));
      cx += larg[i] + 14;
    });
  }

  // ---------- chefe ----------
  function miniChefe(ns, e, dt) {
    let a = VIS.mini.get(e);
    if (!a) {
      const bh = ns.Sprites.bodyHeight(e.dex, 1) || 48;
      a = new ns.Sprites.Animator(e.dex, lim(20 / bh, 0.12, 1), !!e.shiny);
      if (VIS.mini.size > 6) VIS.mini.clear();
      VIS.mini.set(e, a);
    }
    a.dir = 0; a.loop('Idle'); a.update(dt);
    return a;
  }
  function desenharChefe(ns, ctx, L, dt) {
    const e = L.boss, { x, y, w, h } = L.chefe;
    caixa(ctx, x, y, w, h, 10);
    ctx.save(); rr(ctx, x + 5, y + 4, 24, h - 8, 6); ctx.clip();
    ctx.fillStyle = 'rgba(10,20,48,.8)'; ctx.fillRect(x + 5, y + 4, 24, h - 8);
    try { miniChefe(ns, e, dt).draw(ctx, x + 17, y + h - 6, {}); } catch (_) {}
    ctx.restore();
    const f = e.maxHp > 0 ? e.hp / e.maxHp : 0;
    const k = 'b' + (e.id || e.dex);
    if (!VIS.boss.has(e)) { VIS.boss.clear(); VIS.boss.set(e, {}); }
    const o = VIS.boss.get(e);
    const pct = Math.max(0, Math.ceil(f * 100)) + '%';
    ctx.font = FNT(800, 11); const pw = ctx.measureText(pct).width;
    txt(ctx, String(e.name || '').toUpperCase(), x + 35, y + 13, COR.gold, FNT(800, 10));
    txt(ctx, pct, x + w - 9, y + 13, '#ffffff', FNT(800, 11), 'right');
    barra(ctx, x + 35, y + 17, w - 35 - 10, 7, f, rastro(o, k, f, dt), corChefe(f), 10);
    void pw;
  }

  // ---------- barra de golpes (mesmo lugar e tamanho do jogo) ----------
  function desenharGolpes(ns, ctx, pl, L) {
    const { S, GAP, n, totalW, sx, sy } = L.golpes;
    const agora = performance.now();
    // 0.7.1: golpe pronto esperando alvo (ninguém no alcance) — o jogo põe m.t = 0,05 a cada quadro até achar alguém
    // (systems/combat.js tickMove). Isso contava como recarga e a varredura piscava entre cheia e quase cheia.
    const ESPERA = 0.06;
    const cdOf = (m) => (m.kind === 'orbit' || !(m.t > ESPERA) ? 0 : lim(m.t / (m.cd * pl.cdMul), 0, 1));
    // objeto equipado, à esquerda
    {
      const ix = sx - S - 18, iy = sy;
      if (pl.item) {
        rr(ctx, ix - 2, iy - 2, S + 4, S + 4, 14); ctx.fillStyle = COR.edgeOut; ctx.fill();
        const g = ctx.createLinearGradient(0, iy, 0, iy + S); g.addColorStop(0, '#5a4210'); g.addColorStop(1, '#2a1d06');
        rr(ctx, ix, iy, S, S, 12); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = COR.gold; ctx.stroke();
        rr(ctx, ix + 4, iy + 4, S - 8, S - 8, 9); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,210,63,.35)'; ctx.stroke();
        if (ns.Icons) ns.Icons.draw(ctx, pl.item, ix + (S - 36) / 2, iy + (S - 36) / 2, 36);
        const nm = ns.Items && ns.Items.BY[pl.item] ? ns.Items.BY[pl.item].name : '';
        if (nm) faixa(ctx, nm, ix + S / 2, iy - 9, COR.gold);
      } else {
        rr(ctx, ix, iy, S, S, 12); ctx.fillStyle = 'rgba(10,16,28,.5)'; ctx.fill();
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(185,203,240,.3)'; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (let i = 0; i < n; i++) {
      const g = pl.slots[i] || [], m = g[0], fused = g.length > 1, on = i === pl.active;
      const x = sx + i * (S + GAP), y = on ? sy - 6 : sy;
      const tc = m ? ns.U.TYPE_COLOR[m.type] : '#4a5468';
      // moldura: contorno escuro + borda (cor do tipo no ativo, rosa no vínculo, dourada evoluído)
      if (on) { ctx.save(); ctx.shadowColor = tc; ctx.shadowBlur = 14; rr(ctx, x, y, S, S, 12); ctx.fillStyle = tc; ctx.fill(); ctx.restore(); }
      rr(ctx, x - 2, y - 2, S + 4, S + 4, 14); ctx.fillStyle = COR.edgeOut; ctx.fill();
      const gr = ctx.createLinearGradient(0, y, 0, y + S);
      gr.addColorStop(0, on ? '#2c519f' : '#1d2f63'); gr.addColorStop(1, on ? '#1a3170' : '#111d40');
      rr(ctx, x, y, S, S, 12); ctx.fillStyle = gr; ctx.fill();
      if (m) { ctx.save(); rr(ctx, x, y, S, S, 12); ctx.clip(); ctx.globalAlpha = on ? 0.32 : 0.16; ctx.fillStyle = tc; ctx.fillRect(x, y + S * 0.45, S, S * 0.55); ctx.restore(); }
      ctx.lineWidth = on ? 3 : 2;
      ctx.strokeStyle = fused ? COR.bond : m && m.evolved ? COR.gold : on ? tc : 'rgba(244,248,255,.55)';
      rr(ctx, x, y, S, S, 12); ctx.stroke();
      if (!m) continue;
      if (fused) {
        const C = 22, P = (S - C * 2) / 3;
        g.forEach((gm, k) => {
          const cx = x + P + (k % 2) * (C + P), cy = y + P + Math.floor(k / 2) * (C + P);
          if (ns.Icons) ns.Icons.draw(ctx, 'move:' + gm.id, cx, cy, C);
          const f = cdOf(gm);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx, cy, C, C * f); }
          const fl = 1 - (agora - (gm.castAt || 0)) / 180;
          if (fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.55).toFixed(2) + ')'; ctx.fillRect(cx, cy, C, C); }
        });
      } else {
        if (ns.Icons) ns.Icons.draw(ctx, 'move:' + m.id, x + (S - 32) / 2, y + (S - 32) / 2 - 3, 32);
        // recarga: varredura de relógio por cima (e os segundos no golpe ativo)
        const f = cdOf(m);
        if (f > 0.001) {
          ctx.save(); rr(ctx, x, y, S, S, 12); ctx.clip();
          ctx.fillStyle = 'rgba(5,10,24,.62)';
          ctx.beginPath(); ctx.moveTo(x + S / 2, y + S / 2);
          ctx.arc(x + S / 2, y + S / 2, S, -Math.PI / 2, -Math.PI / 2 + f * 6.2832); ctx.closePath(); ctx.fill();
          ctx.restore();
          if (on && m.t > 0.25) txt(ctx, m.t.toFixed(1), x + S / 2, y + S / 2 + 5, '#ffffff', FNT(800, 13), 'center');
        }
        const fl = 1 - (agora - (m.castAt || 0)) / 180;
        if (fl > 0) { rr(ctx, x, y, S, S, 12); ctx.fillStyle = 'rgba(255,255,255,' + (fl * 0.45).toFixed(2) + ')'; ctx.fill(); }
        // nível do golpe: losangos
        const dots = (m.def && m.def.maxLvl) || 5, dw = 5, dg = 2.5, tw = dots * dw + (dots - 1) * dg;
        for (let d = 0; d < dots; d++) {
          const cx = x + (S - tw) / 2 + d * (dw + dg) + dw / 2, cy = y + S - 6;
          ctx.beginPath(); ctx.moveTo(cx, cy - 3); ctx.lineTo(cx + 2.6, cy); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 2.6, cy); ctx.closePath();
          ctx.fillStyle = d < m.lvl ? (m.evolved ? COR.gold : tc) : 'rgba(255,255,255,.2)'; ctx.fill();
        }
        if (m.evolved && ns.Icons) ns.Icons.draw(ctx, 'star', x + S - 15, y + 3, 12);
      }
      // tecla
      rr(ctx, x - 4, y - 4, 15, 15, 5); ctx.fillStyle = COR.edgeOut; ctx.fill();
      rr(ctx, x - 3, y - 3, 13, 13, 4); ctx.fillStyle = on ? tc : '#2c519f'; ctx.fill();
      txt(ctx, String(i + 1), x + 3.5, y + 7.5, '#ffffff', FNT(800, 9), 'center');
      if (on) faixa(ctx, fused ? ns.T(m.name, 'move') + ' +' + (g.length - 1) : ns.T(m.name, 'move'), x + S / 2, y - 11, fused ? COR.bond : tc);
    }
  }
  // fita com o nome em cima do golpe ativo / do objeto
  function faixa(ctx, s, cx, cy, cor) {
    ctx.font = FNT(800, 10);
    const w = ctx.measureText(s).width + 14, h = 16, x = cx - w / 2, y = cy - h / 2;
    rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 8); ctx.fillStyle = COR.edgeOut; ctx.fill();
    rr(ctx, x, y, w, h, 7); ctx.fillStyle = 'rgba(26,49,112,.96)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = cor; ctx.stroke();
    txt(ctx, s, cx, cy + 3.5, '#ffffff', FNT(800, 10), 'center');
  }

  function instalarVisual(ns) {
    const H = ns.HUD;
    if (!H || typeof H.draw !== 'function' || H.__sv) return;
    const orig = H.draw;
    H.__sv = true;
    H.draw = function (ctx, w, h, pl, st) {
      if (!cfg.hud || VIS.falhas >= 3 || !pl || !pl.mon || !Array.isArray(pl.slots)) return orig.apply(this, arguments);
      const agora = performance.now(), dt = Math.min(0.1, Math.max(0, (agora - (VIS.t || agora)) / 1000));
      VIS.t = agora;
      let L;
      try { L = layout(ns, w, h, pl); } catch (e) { VIS.falhas++; log('visual', e); return orig.apply(this, arguments); }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h);
      for (const r of L.cortes) ctx.rect(r[0], r[1], r[2], r[3]);
      ctx.clip('evenodd');
      let r;
      try { r = orig.apply(this, arguments); } finally { ctx.restore(); }
      ctx.save();
      try {
        ctx.textBaseline = 'alphabetic';
        if (L.card) { desenharCard(ns, ctx, pl, L, dt); L.desvio = cfg.cola ? desenharFaixaCola(ns, ctx, pl, L) : 0; desenharBuffs(ns, ctx, pl, L); }
        desenharRelogio(ns, ctx, pl, st, L);
        if (L.chefe) desenharChefe(ns, ctx, L, dt);
        desenharGolpes(ns, ctx, pl, L);
        VIS.ok = true;
      } catch (e) {
        VIS.falhas++; M.err = 'visual: ' + String(e && e.message || e).slice(0, 60); log('visual', e);
      } finally { ctx.restore(); }
      return r;
    };
  }

  // ======================= colinha na partida (0.8.0) =======================
  // Para quem joga na mão: marca nas cartas de nível, no vínculo e no item o que a build da Sobrevida pegaria (a
  // mesma conta do farm: scoreCard / bondRank / itemRank), e desenha uma faixa da build embaixo do card do HUD.
  const COLA_TXT = { pt: { selo: 'Colinha', trocar: 'Colinha: trocar as cartas', faixa: 'Colinha' },
                     en: { selo: 'Cheat sheet', trocar: 'Cheat sheet: reroll', faixa: 'Cheat sheet' },
                     es: { selo: 'Chuleta', trocar: 'Chuleta: cambiar cartas', faixa: 'Chuleta' } };
  const ct = () => COLA_TXT[cfg.lang] || COLA_TXT.pt;
  function colaCss() {
    if (document.getElementById('sv-cola-jogo')) return;
    const st = document.createElement('style');
    st.id = 'sv-cola-jogo';
    st.textContent = `.sv-reco{position:relative;outline:3px solid #ffd23f !important;outline-offset:2px;box-shadow:0 0 22px rgba(255,210,63,.55) !important}
      .sv-reco::before{content:attr(data-sv);position:absolute;top:-12px;left:50%;transform:translateX(-50%);z-index:2;white-space:nowrap;
        background:linear-gradient(180deg,#ffe37a,#f0a31e);color:#1a3170;font:700 12px Pixelify,'Segoe UI',sans-serif;padding:2px 10px;border-radius:9px;
        border:2px solid #0b1838;text-shadow:none;pointer-events:none}`;
    (document.head || document.documentElement).appendChild(st);
  }
  function marcar(el, txt) {
    document.querySelectorAll('.sv-reco').forEach((x) => { if (x !== el) { x.classList.remove('sv-reco'); x.removeAttribute('data-sv'); } });
    if (!el) return;
    colaCss();
    el.classList.add('sv-reco');
    el.setAttribute('data-sv', txt);
    el.setAttribute('translate', 'no');
  }
  function colaCartas(ns, cards) {
    if (!cfg.cola || !Array.isArray(cards)) return;
    const p = ns.Game.player;
    if (!p) return;
    let best = 0, bestS = -Infinity;
    cards.forEach((c, i) => { const s = scoreCard(ns, p, c); if (s > bestS) { bestS = s; best = i; } });
    const rr = document.getElementById('lvl-reroll');
    const els = document.querySelectorAll('#cards .card');
    // nenhuma carta boa e ainda dá para trocar: a colinha manda trocar (o farm faz o mesmo)
    if (bestS < 500 && rr && !rr.classList.contains('hidden')) return marcar(rr, ct().trocar);
    marcar(els[best] || null, ct().selo);
  }
  function colaVinculo(ns, opt) {
    if (!cfg.cola || !opt || !opt.loose) return;
    const p = ns.Game.player;
    if (!p) return;
    const order = opt.loose.map((m, i) => ({ m, i })).sort((a, b) => bondRank(ns, p, a.m) - bondRank(ns, p, b.m));
    setTimeout(() => marcar(document.querySelectorAll('#bond-cards .card')[order[0] ? order[0].i : -1] || null, ct().selo), 30);
  }
  function colaItem(ns, cur, next) {
    if (!cfg.cola) return;
    const keep = itemRank(ns, cur) <= itemRank(ns, next);
    setTimeout(() => marcar(document.querySelectorAll('#item-cards .card')[keep ? 0 : 1] || null, ct().selo), 30);
  }
  // faixa da build no HUD: os 2 ataques, o de troca e os buffs; aceso = já tem nesta partida
  function desenharFaixaCola(ns, ctx, pl, L) {
    let plano = null;
    try { plano = planoDe(ns, pl.mon.dex); } catch (_) {}
    if (!plano) return 0;
    const ids = [plano.a, plano.b, plano.parceiro].filter(Boolean), buffs = plano.buffs || [];
    const tem = new Set((pl.moves || []).map((m) => m.id));
    const x = L.card.x, y = L.card.y + L.card.h + 8, I = 18, G = 4;
    ctx.font = FNT(800, 10);
    const lw = ctx.measureText(ct().faixa).width;
    const w = 12 + lw + 8 + (ids.length + buffs.length) * (I + G) + 10 + 6;
    rr(ctx, x - 1.5, y - 1.5, w + 3, 27, 9); ctx.fillStyle = COR.edgeOut; ctx.fill();
    rr(ctx, x, y, w, 24, 8); ctx.fillStyle = 'rgba(26,49,112,.94)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = COR.gold; ctx.stroke();
    txt(ctx, ct().faixa, x + 8, y + 16, COR.gold, FNT(800, 10));
    let cx = x + 12 + lw + 4;
    const icone = (id) => {
      ctx.globalAlpha = tem.has(id) ? 1 : 0.35;
      if (ns.Icons) ns.Icons.draw(ctx, 'move:' + id, cx, y + 3, I);
      ctx.globalAlpha = 1;
      cx += I + G;
    };
    ids.forEach(icone);
    cx += 6; ctx.fillStyle = 'rgba(244,248,255,.35)'; ctx.fillRect(cx - 5, y + 5, 1, 14);
    buffs.forEach(icone);
    return 32;
  }

  // ======================= motor da partida (adaptado do PSBot, MIT) =======================
  const STAT_PRI = { xp: 74, atk: 60, cd: 55, def: 45, hp: 40, rgn: 35, mag: 25, spd: 15, heal: 5 };
  const KIND_PRI = { homing: 13, nova: 12, aura: 12, orbit: 11, chain: 10, projectile: 9, boomerang: 8, beam: 8, meteor: 8, turret: 7, mine: 6, cone: 6, melee: 4, dash: 3, trail: 3 };

  function profileOf(ns) {
    const p = ns.Game.player;
    const prof = p && cfg.profiles[p.dex];
    return prof && prof.moves && prof.moves.length ? prof : null;
  }

  function scoreNewMove(ns, p, id) {
    const prof = profileOf(ns);
    if (prof) {
      const i = prof.moves.indexOf(id);
      return i >= 0 ? 900 - i * 5 : -100;
    }
    const m = ns.Moves.BY_ID[id];
    if (!m) return 0;
    const buffId = atkBuffOf(ns, p);
    if (id === 'harden') return 870;
    if (id === buffId) return 865;
    if (m.kind === 'buff') return -100;
    const atk = p.moves.filter(x => x.kind !== 'buff').length;
    const need = ['harden', buffId].filter(x => !p.hasMove(x)).length;
    // 0.4.0: a base de cálculo dá o valor de cada golpe para ESTE Pokémon (dano/s, lado, monotipo, clima, cobertura
    // contra os inimigos desta partida) e a build planejada (2 principais + parceiro de troca)
    let rel = null, plano = null;
    try { plano = planoDe(ns, p.dex); if (plano && plano.top > 0) rel = Math.min(1.2, (plano.val[id] || 0) / plano.top); } catch (e) { log('plano', e); }
    if (atk === 0) return 860 + (rel != null ? Math.round(30 * rel) : 0);
    if (p.maxMoves - p.slots.length - need < 1) return -100;
    // 0.3.0: um 3º ataque serve de parceiro de troca (rotação): depois de fundir o grupo principal, fica solto e
    // faz o grupo inteiro voltar com 35% da recarga a cada troca. Mais que isso, não.
    if (atk >= 3) return -100;
    if (rel == null) return atk === 2 ? 520 + Math.max(0, aoeScore(ns, p, m)) / 2 : 800 + aoeScore(ns, p, m);
    if (atk === 2) return 520 + Math.round(30 * rel) + (plano.parceiro === id ? 15 : 0);
    if (rel < 0.25) return 480;                                   // golpe muito fraco para este Pokémon: só se nada melhor
    return 800 + Math.round(60 * rel) + (plano.b === id || plano.a === id ? 10 : 0);
  }

  // 0.5.0: o buff de ataque segue a categoria dos ataques da build (com natureza, o lado "forte" pode não ser o da build)
  function atkBuffOf(ns, p) {
    let lado = null;
    try { const pl = planoDe(ns, p.dex != null ? p.dex : p.mon.dex), d = pl && ns.Moves.BY_ID[pl.a]; lado = d && d.cat; } catch (_) {}
    return (lado || ns.Stats.sideOf(p.mon)) === 'physical' ? 'swords-dance' : 'nasty-plot';
  }
  const AOE_PRI = { nova: 40, aura: 38, meteor: 36, vortex: 35, orbit: 34, spin: 33, bounce: 31, chain: 30, shove: 29, quake: 27, cone: 26, charge: 24, stun: 22, beam: 22, boomerang: 20, homing: 18, projectile: 12, turret: 12, mine: 8 };
  function aoeScore(ns, p, m) {
    if (!(m.kind in AOE_PRI)) return -350;
    const fit = m.cat ? ns.Stats.fit(p.mon, m.cat) : 1;
    if (fit < 0.9) return -350;  
    return AOE_PRI[m.kind] + (fit >= 0.999 ? 0 : -15) + ((p.mon.types || []).includes(m.type) ? 8 : 0);
  }

  function countOwned(p, ids) { return ids.filter(id => p.hasMove(id)).length; }

  function scoreCard(ns, p, c) {
    const [type, id] = [c.type, String(c.key).split(':').slice(1).join(':')];
    const lowHp = p.hp / p.maxHp < 0.35;
    if (type === 'evo') return 1000;
    if (type === 'new') return scoreNewMove(ns, p, id);
    const EVO = ns.Moves.EVO || {};
    const evoNeeds = new Set(p.moves.filter(m => !m.evolved && EVO[m.id] && !(p.statsTaken || {})[EVO[m.id]]).map(m => EVO[m.id]));
    if (type === 'stat') {
      if (id === 'heal') return lowHp ? 950 : 10;
      if (c.color === '#ffd23f') return 980;         
      if (evoNeeds.has(id)) return 700;              
      const pri = id === 'def' && (p.dmgReduce || 0) < 0.69 ? 70 : id === 'mag' && (p.magnet || 78) < 260 ? 72 : (STAT_PRI[id] || 20);
      return (cfg.passiveFirst ? 500 : 300) + pri;
    }
    if (type === 'up') {
      const m = p.moves.find(x => x.id === id);
      if (!m) return 0;
      // buffs agora ficam sempre carregados (rotação): +1 carga / +40% de potência valem como uma boa carta de atributo
      if (m.kind === 'buff') return cfg.passiveFirst ? 565 : 600;
      // 0.4.0: ordem pela base de cálculo — os 2 golpes de maior valor são o núcleo; o ganho real do próximo
      // nível (escada do jogo) decide entre eles
      let core = [], g = 0;
      try {
        const vals = p.moves.filter(x => x.kind !== 'buff').map(x => ({ id: x.id, v: valorGolpe(ns, p.mon, x), g: ganhoMelhoria(ns, p.mon, x) }));
        vals.sort((x, y) => y.v - x.v); core = vals.slice(0, 2).map(x => x.id);
        const maxG = Math.max(1e-6, ...vals.map(x => x.g)); g = (vals.find(x => x.id === id) || { g: 0 }).g / maxG;
      } catch (e) { log('ganho', e); }
      const isCore = core.includes(id);
      if (!m.evolved && EVO[id] && isCore) {
        const maxLvl = (m.def && m.def.maxLvl) || 5;
        return 600 + Math.round(40 * (m.lvl || 1) / maxLvl) + Math.round(10 * g);
      }
      return (cfg.passiveFirst ? 400 : 600) + Math.round(40 * g) + (isCore ? 20 : 0);
    }
    return 0;
  }

  function chooseCard(ns, cards) {
    const p = ns.Game.player;
    if (!p || !ns.UI.isOpen('scr-levelup')) return;
    let best = 0, bestS = -Infinity;
    cards.forEach((c, i) => { const s = scoreCard(ns, p, c); if (s > bestS) { bestS = s; best = i; } });
    const rr = document.getElementById('lvl-reroll');
    if (bestS < 500 && rr && !rr.classList.contains('hidden')) {
      log('reroll'); ns.RunUI.reroll();
      return schedule(() => chooseCard(ns, S.lastOffer || cards), 300);
    }
    log('pick', cards[best].key, bestS);
    ns.RunUI.pick(best);
  }
  function bondRank(ns, p, mv) {
    const prof = profileOf(ns);
    if (prof) { const i = prof.moves.indexOf(mv.id); return i >= 0 ? i : 50; }
    // 0.4.0: núcleo da fusão = o golpe de maior valor + Fortaleza + buff do lado + o 2º golpe; o resto fica solto
    // (um solto é o parceiro de troca da rotação)
    let ord = null;
    try { ord = p.moves.filter(x => x.kind !== 'buff').map(x => ({ id: x.id, v: valorGolpe(ns, p.mon, x) })).sort((x, y) => y.v - x.v).map(x => x.id); } catch (_) {}
    const first = ord ? { id: ord[0] } : p.moves.find(x => x.kind !== 'buff');
    if (first && mv.id === first.id) return 0;
    if (mv.id === 'harden') return 1;
    if (mv.id === atkBuffOf(ns, p)) return 2;
    if (ord && ord[1] === mv.id) return 3;
    return mv.kind === 'buff' ? 10 : 5;
  }
  function chooseBond(ns, opt) {
    const p = ns.Game.player;
    if (!p || !ns.UI.isOpen('scr-bond')) return;
    const order = opt.loose.map((m, i) => ({ m, i })).sort((a, b) => bondRank(ns, p, a.m) - bondRank(ns, p, b.m));
    if (opt.mode === 'add') { log('bond add', order[0].m.id); return ns.RunUI.pickBond(order[0].i); }
    const first = order[0].m, second = order[1].m;
    log('bond pair', first.id, second.id);
    ns.RunUI.pickBond(order[0].i);
    schedule(() => {
      const list = opt.loose.filter(m => m !== first);
      ns.RunUI.pickBond(list.indexOf(second));
    }, 250);
  }

  const ITEM_PRI = ['shellbell', 'luckyegg', 'leftovers', 'quickclaw', 'focussash', 'assaultvest', 'rockyhelmet', 'amuletcoin', 'choicescarf', 'lifeorb', 'choiceband'];
  function itemRank(ns, id) {
    const prof = profileOf(ns);
    if (prof && prof.item === id) return -1;
    const i = ITEM_PRI.indexOf(id);
    return i < 0 ? 99 : i;
  }

  // Sobrevida 0.2.2: alcance de cada golpe, igual ao reach() de systems/combat.js do jogo; os que não miram
  // (nova, aura, órbita, rastro, mina) pela área que cobrem. Só o grupo ATIVO ataca.
  function moveReach(m) {
    if (!m || m.kind === 'buff') return 0;
    const r = m.radius || 0, fly = (m.speed || 0) * (m.life || 0);
    switch (m.kind) {
      case 'melee': return r + 30;
      case 'beam': return r + 20;
      case 'boomerang': return r + 40;
      case 'chain': return 280;
      case 'meteor': return 340;
      case 'dash': return r + 60;
      case 'cone': return fly + 30;
      case 'spin': case 'shove': case 'charge': return r + 20;
      case 'quake': return (m.count | 0) * 34 + r;
      case 'vortex': case 'stun': case 'turret': return 300;
      case 'projectile': case 'homing': case 'bounce': return Math.min(520, fly || 520);
      case 'nova': return fly || 200;
      case 'aura': return r || 60;
      case 'orbit': return r + (m.size || 8);
      case 'mine': case 'trail': return 40;
      default: return 200;
    }
  }
  function groupReach(g) { let r = 0; for (const m of g || []) r = Math.max(r, moveReach(m)); return r; }

  function groupScore(g, prof) {
    let dmg = 0, buff = 0, rank = 0;
    for (const m of g) {
      if (m.kind === 'buff') buff++; else dmg += 10 + (m.lvl || 1) + (m.evolved ? 5 : 0);
      const i = prof ? prof.moves.indexOf(m.id) : -1;
      if (i >= 0 && m.kind !== 'buff') rank += 100 - i * 20;
    }
    if (!dmg) return 0;                      
    return prof ? rank + buff * 30 + g.length * 5 : dmg + buff * 6;
  }
  // ===== 0.3.0: rotação de ataques =====
  // No jogo só o espaço ATIVO ataca, e os outros espaços ficam parados (a recarga deles não anda). Ao trocar de
  // espaço, o jogo deixa a recarga dos golpes do espaço novo em no máximo 35% (player.setActive). Então, logo depois
  // que o golpe ativo dispara, vale trocar para o espaço que fica pronto antes: cada golpe sai a cada ~35% da recarga
  // e os buffs (Danza Espada, Fortaleza...) entram entre um golpe e outro, mantendo as cargas (duram 7 s).
  const TARGETED_K = new Set(['melee', 'beam', 'projectile', 'boomerang', 'chain', 'meteor', 'dash', 'cone', 'homing', 'bounce', 'charge', 'spin', 'quake', 'vortex', 'shove', 'stun']);
  function swapTo(ns, p, i) {
    // troca silenciosa: sem o som e o anel de "trocar ataque" a cada 0,3 s
    const fx = ns.FX && ns.FX.ring;
    S.muteSelect = true;
    if (fx) ns.FX.ring = function () {};
    try { p.setActive(i); } finally { S.muteSelect = false; if (fx) ns.FX.ring = fx; }
    S.swapAt = performance.now(); S.swaps = (S.swaps || 0) + 1;
  }
  function weave(ns, p) {
    if (!cfg.weave || !p || p.dead || !p.slots || p.slots.length < 2 || (p.hasItem && p.hasItem('choiceband'))) return;
    if (ns.Game.state !== 'playing') return;
    const now = performance.now();
    if (now - (S.swapAt || 0) < 90) return;
    const cur = p.slots[p.active] || [];
    if (cur.some(m => m.kind === 'orbit')) return;               // órbitas somem ao trocar: fica nelas
    const isBuff = g => g.length > 0 && g.every(m => m.kind === 'buff');
    // espaço recém-ativado espera o primeiro disparo (até 1,2 s), senão a troca não rende nada
    if (S.swapAt && now - S.swapAt < 1200 && cur.length && !cur.some(m => (m.castAt || 0) >= S.swapAt)) {
      if (isBuff(cur) || cur.some(m => m.kind !== 'buff' && m.t > 0.06)) return;
    }
    // 1) buffs: mantém as cargas (vale mais que um golpe solto)
    for (let i = 0; i < p.slots.length; i++) {
      const g = p.slots[i];
      if (i === p.active || !isBuff(g)) continue;
      const falta = g.some(m => { const b = p.buffs && p.buffs[m.stat]; return b && (b.n < Math.max(1, m.stacks | 0) || b.t < 2.2); });
      if (falta) return swapTo(ns, p, i);
    }
    // 2) golpes: vai para o espaço que fica pronto antes, entre os que alcançam o alvo
    const tg = p.target && !p.target.dead ? p.target : null;
    const dist = tg ? Math.hypot(tg.x - p.x, tg.y - p.y) : Infinity;
    const usable = m => m.kind !== 'buff' && m.kind !== 'orbit' && (!TARGETED_K.has(m.kind) || moveReach(m) >= dist);
    // eficácia de tipo contra o alvo (×1,6 super eficaz, ×0,6 pouco, ×0,3 imune): golpe fraco só ganha a vez se estiver bem mais pronto
    const tm = tg && tg.types && ns.Types && ns.Types.mult ? (m) => ns.Types.mult(m.type, tg.types) : () => 1;
    const ready = (g, active) => {
      let r = Infinity;
      for (const m of g) if (usable(m)) r = Math.min(r, ((active ? Math.max(0, m.t) : Math.min(Math.max(0, m.t), 0.35 * m.cd)) + 0.05) / tm(m));
      return r;
    };
    const rCur = ready(cur, true);
    let best = -1, rBest = rCur;
    for (let i = 0; i < p.slots.length; i++) {
      if (i === p.active || p.slots[i].some(m => m.kind === 'orbit')) continue;
      const r = ready(p.slots[i], false);
      if (r + 0.04 < rBest) { rBest = r; best = i; }
    }
    if (best >= 0) swapTo(ns, p, best);
  }

  function housekeeping(ns) {
    const p = ns.Game.player;
    if (!p || p.dead || ns.Game.state !== 'playing') return;
    const now = performance.now();
    if (!cfg.weave && now - S.lastSlotCheck > 600 && p.slots.length > 1 && !p.hasItem?.('choiceband')) {
      S.lastSlotCheck = now;
      const prof = profileOf(ns);
      const bossFight = !!((ns.Rift && ns.Rift.inArena) || (ns.EnemyMgr.bossAlive && ns.EnemyMgr.bossAlive()));
      const sc = g => { const s0 = groupScore(g, prof); return s0 && bossFight ? s0 * (groupReach(g) >= 200 ? 1.25 : 1) : s0; };
      let best = p.active, bs = sc(p.slots[p.active] || []);
      p.slots.forEach((g, i) => { const s = sc(g); if (s > bs + 0.5) { bs = s; best = i; } });
      if (best !== p.active) p.setActive(best);
    }
    if (cfg.orbs && ns.Orbs && p.orbs && now - S.lastOrb > 1500) {
      let around = 0;
      for (const e of ns.EnemyMgr.all()) if (!e.dead && e.behavior !== 'thief' && Math.abs(e.x - p.x) < 90 && Math.abs(e.y - p.y) < 90) around++;
      const danger = p.hp / p.maxHp < 0.4 || around >= 8;  
      const boss = (ns.EnemyMgr.bossAlive && ns.EnemyMgr.bossAlive()) || (ns.Judgment && ns.Judgment.active);
      p.orbs.forEach((o, i) => {
        if (!o || now - S.lastOrb < 1500) return;
        const kind = ns.Orbs.BY && ns.Orbs.BY[o.id] && ns.Orbs.BY[o.id].kind;
        if ((kind === 'foe' && danger) || (kind === 'buff' && boss)) { ns.Orbs.use(p, i); S.lastOrb = now; }
      });
    }
  }

  const PICK_W = { xp: 1, xpBig: 3, coin: 2, magnet: 5, bomb: 2.5, ticket: 9, ticket10: 12, item: 9, sphere: 6, candy: 6, heal: 0.4 };
  const DIRS = Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);
  const hazards = [];
  function trackHazards(ns) {
    if (!ns.Hazards || !ns.Hazards.add) return;
    const orig = ns.Hazards.add;
    ns.Hazards.add = function () { const h = orig.apply(this, arguments); if (h) hazards.push(h); return h; };
    const origClear = ns.Hazards.clear;
    ns.Hazards.clear = function () { hazards.length = 0; return origClear.apply(this, arguments); };
  }
  function inHazard(h, x, y, r) {
    if (h.kind === 'zone') return (x - h.x) ** 2 + (y - h.y) ** 2 < (h.r + r) ** 2;
    const c = Math.cos(h.angle || 0), s = Math.sin(h.angle || 0), dx = x - h.x, dy = y - h.y, along = dx * c + dy * s;
    return along > -r && along < (h.len || 0) + r && Math.abs(-dx * s + dy * c) <= (h.w || 0) / 2 + r;
  }

  const liquidOf = (ns, p) => {
    const W = ns.World, ab = p.abil || {};
    if (!W || !W.liquidEffect || ab.levitate) return {};
    const e = Object.assign({}, W.liquidEffect((p.mon && p.mon.types) || []) || {});
    if (ab.lavaProof) delete e.dmg;
    if (ab.steady) delete e.slow;
    return e;
  };
  const wetOk = (ns, p) => !liquidOf(ns, p).dmg;              
  const wetSlow = (ns, p) => liquidOf(ns, p).slow || 1;        
  const trapsNear = (W, x, y, r) => ((W && W.specialsNear && W.specialsNear(x, y, r)) || []).filter(t => t.type === 'trap');
  function findPath(ns, p, tx, ty, goalTol) {
    const W = ns.World, TS = W.TS || 32;
    if (!W.isFree) return null;
    const sx = Math.floor(p.x / TS), sy = Math.floor(p.y / TS), gx = Math.floor(tx / TS), gy = Math.floor(ty / TS);
    const span = Math.max(Math.abs(gx - sx), Math.abs(gy - sy)) + 20;
    if (span > 120) return null;                                  
    const traps = trapsNear(W, (p.x + tx) / 2, (p.y + ty) / 2, Math.hypot(tx - p.x, ty - p.y) / 2 + 200);
    const wet = wetOk(ns, p), wetCost = 1 / wetSlow(ns, p);  
    const walk = new Map();
    const K = (x, y) => (x + 50000) * 100000 + (y + 50000);
    const ok = (x, y) => {
      const k = K(x, y);
      let v = walk.get(k);
      if (v === undefined) {
        const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
        v = Math.abs(x - sx) <= span && Math.abs(y - sy) <= span && W.isFree(cx, cy, Math.min(p.r, TS * 0.45), wet)
          && !traps.some(t => (cx - t.x) ** 2 + (cy - t.y + 8) ** 2 < 26 * 26);
        walk.set(k, v);
      }
      return v;
    };
    const isGoal = (x, y) => Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= goalTol;
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const heap = [], push = n => { heap.push(n); let i = heap.length - 1; while (i) { const j = (i - 1) >> 1; if (heap[j].f <= n.f) break; heap[i] = heap[j]; i = j; } heap[i] = n; };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return top; };
    const g = new Map(), from = new Map();
    g.set(K(sx, sy), 0); push({ x: sx, y: sy, f: h(sx, sy) });
    let end = null, n = 0;
    while (heap.length && n++ < 8000) {
      const c = pop(), ck = K(c.x, c.y), cg = g.get(ck);
      if (isGoal(c.x, c.y)) { end = c; break; }
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = c.x + dx, ny = c.y + dy;
        if (!ok(nx, ny) && !isGoal(nx, ny)) continue;
        if (dx && dy && (!ok(c.x + dx, c.y) || !ok(c.x, c.y + dy))) continue;  
        const wetMul = wet && W.isLiquid && W.isLiquid(nx * TS + TS / 2, ny * TS + TS / 2) ? wetCost : 1;
        const ng = cg + (dx && dy ? 1.414 : 1) * wetMul, nk = K(nx, ny);
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, ck); push({ x: nx, y: ny, f: ng + h(nx, ny) }); }
      }
    }
    if (!end) return null;
    const pts = [];
    for (let k = K(end.x, end.y); k !== undefined; k = from.get(k)) {
      const x = Math.floor(k / 100000) - 50000, y = (k % 100000) - 50000;
      pts.push([x * TS + TS / 2, y * TS + TS / 2]);
    }
    pts.reverse();
    pts[pts.length - 1] = [tx, ty];
    return { pts, len: g.get(K(end.x, end.y)) * TS + Math.hypot(tx - pts[pts.length - 1][0], ty - pts[pts.length - 1][1]) };
  }
  function waypoint(ns, p, path) {
    const W = ns.World, traps = trapsNear(W, p.x, p.y, 320);
    const clear = (x, y) => {
      const d = Math.hypot(x - p.x, y - p.y), n = Math.ceil(d / 8);
      for (let i = 1; i <= n; i++) {
        if (d * (1 - i / n) < 26) break;
        const sx = p.x + (x - p.x) * i / n, sy = p.y + (y - p.y) * i / n;
        if (!W.isFree(sx, sy, p.r, wetOk(ns, p)) || traps.some(t => (sx - t.x) ** 2 + (sy - t.y + 8) ** 2 < 23 * 23)) return false;
      }
      return true;
    };
    let near = 0, nd = Infinity;
    path.pts.forEach(([x, y], i) => { const d = Math.hypot(x - p.x, y - p.y); if (d < nd) { nd = d; near = i; } });
    path.pts.splice(0, near);
    let wp = path.pts[0];
    for (let i = 1; i < Math.min(path.pts.length, 14); i++) {
      const [x, y] = path.pts[i];
      if (Math.hypot(x - p.x, y - p.y) > 260 || !clear(x, y)) break;
      wp = path.pts[i];
    }
    return { x: wp[0], y: wp[1], offPath: nd };
  }

  function candidates(ns, p, hpPct) {
    const out = [], now = ns.Game.st.time, W = ns.World;
    if (hpPct > 0.2) for (const e of ns.EnemyMgr.all()) {
      if (e.dead || e.behavior !== 'thief') continue;
      S.seen[e.id] = S.seen[e.id] ?? now;
      const gold = (e.def && e.def.loot === 'ticket10') || e.dex === 1000;
      out.push({ key: 'thief' + e.id, x: e.x, y: e.y, tier: gold ? 5 : 3, value: gold ? 14 : 3, left: 15 - (now - S.seen[e.id]), mode: gold ? 'thiefGold' : 'thief', goalTol: 2, chase: true, flee: e.spd || 92 });
    }
    const rift = ns.Rift && ns.Rift.rift;
    const bondDone = p.slots.some(g => g.length >= 4);
    // 0.3.0: com a rotação e a luta de chefe novas, fenda vale sempre (tickets, ×10, moedas, esferas); grupo cheio só com vida boa
    if (cfg.rift && rift && !ns.Rift.inArena && hpPct > (bondDone ? 0.5 : 0.2))
      out.push({ key: 'rift', tier: 4, x: rift.x, y: rift.y - 10, value: 12, left: rift.ttl ?? 45, mode: 'rift', goalTol: 0, chase: true, direct: true });
    const lost = ns.Events && ns.Events._dbg && ns.Events._dbg();
    if (lost && hpPct > 0.25 && !ns.Rift.inArena) {
      if (lost.state === 'wait') out.push({ key: 'lost', tier: 3, x: lost.x, y: lost.y, value: 8, left: 90, mode: 'lost', goalTol: 1, chase: true });
      else out.push({ key: 'escort', tier: 3, x: lost.tx, y: lost.ty, value: 9, left: 90, mode: 'escort', goalTol: 0, chase: true, hold: 20, escort: true });
    }
    const lt = S.losTarget;
    if (lt && !lt.dead && !lt.arceus && !(ns.Judgment && ns.Judgment.active) && S.losBadT > 0.4 && W && W.isFree && W.projectileBlock) {
      const clearShot = (x, y) => { const d = Math.hypot(lt.x - x, lt.y - y), n = Math.ceil(d / 12); for (let i = 1; i < n; i++) if (W.projectileBlock(x + (lt.x - x) * i / n, y + (lt.y - y) * i / n - (ns.LIFT || 0), 4)) return false; return true; };
      const spots = [];
      for (const r of [140, 220, 300]) for (let k = 0; k < 24; k++) {
        const a = k / 24 * 6.2832, x = lt.x + Math.cos(a) * r, y = lt.y + Math.sin(a) * r;
        if (W.isFree(x, y, p.r + 4, wetOk(ns, p)) && clearShot(x, y)) spots.push({ x, y, d: Math.hypot(x - p.x, y - p.y) });
      }
      spots.sort((a, b) => a.d - b.d);
      for (const sp of spots.slice(0, 2)) out.push({ key: 'los' + Math.round(sp.x / 64) + ',' + Math.round(sp.y / 64), tier: 1, x: sp.x, y: sp.y, value: 6, left: Infinity, mode: 'los', goalTol: 0, chase: true });
    }
    if (!ns.Rift.inArena && W && W.specialsNear) for (const o of W.specialsNear(p.x, p.y, 700)) {
      if (o.type === 'altar' && !o.used) out.push({ key: 'altar' + o.id, tier: 2, x: o.x, y: o.y, value: 5, left: Infinity, mode: 'altar', goalTol: 1, chase: true });
      else if (o.type === 'spring' && hpPct < 0.6 && (o.charge ?? 1) > 0.2) out.push({ key: 'spring' + o.id, tier: 2, x: o.x, y: o.y - 8, value: 7, left: Infinity, mode: 'spring', goalTol: 0, hold: 20, until: () => p.hp >= p.maxHp * 0.95 });
      else if (o.type === 'bigchest' && hpPct > 0.5) {
        let spot = null, sd = Infinity;
        for (const r of [22, 28, 34]) for (let k = 0; k < 16; k++) {
          const a = k / 16 * 6.2832, x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r;
          if (!W.isFree || W.isFree(x, y, p.r + 2)) { const d = Math.hypot(x - p.x, y - p.y); if (d < sd) { sd = d; spot = { x, y }; } }
        }
        if (spot) out.push({ key: 'chest' + o.id, tier: 2, x: spot.x, y: spot.y, value: 3, left: Infinity, mode: 'chest', goalTol: 0, hold: 10 });
      }
    }
    return out;
  }
  function plan(ns, p, hpPct) {
    const now = performance.now();
    const pSpd = (p.baseSpd || 100) * (p.spdMul || 1);
    const cur = S.plan;
    const gt = ns.Game.st.time;
    const cands = candidates(ns, p, hpPct).filter(c => !(S.ban[c.key] > gt));
    const live = cur && cands.find(c => c.key === cur.key);
    const higher = cur && cands.some(c => c.tier > cur.c.tier && !(S.noGo[c.key] > now));
    const stale = !live || higher || now - cur.at > 600 || Math.hypot(live.x - cur.c.x, live.y - cur.c.y) > 48 || (cur.path && cur.path.pts.length < 2);
    if (!stale) { cur.c = Object.assign(cur.c, live, { x: cur.c.x, y: cur.c.y }); return cur; }
    let best = null, bestScore = 0, bestTier = -1;
    const order = cands.sort((a, b) => (b.tier - a.tier) || (b.value / Math.hypot(b.x - p.x, b.y - p.y) - a.value / Math.hypot(a.x - p.x, a.y - p.y)));
    for (const c of order) {
      if (c.tier < bestTier) break;                   

      const path = findPath(ns, p, c.x, c.y, c.goalTol);
      if (!path) { S.noGo[c.key] = now + 1000; continue; }  
      const eta = c.flee ? Math.max(0, path.len - 220) / Math.max(8, pSpd - c.flee) : path.len / pSpd;
      if (eta > c.left - 1) { S.noGo[c.key] = now + 1000; continue; }  
      const score = c.value / (eta + 4) * (cur && cur.key === c.key ? 1.8 : 1);  
      if (c.tier > bestTier || score > bestScore) { bestTier = c.tier; bestScore = score; best = { key: c.key, c, path, at: now, eta }; }
    }
    S.plan = best;
    return best;
  }

  function pickTarget(ns, p, enemies, hpPct, fear) {
    const pl = plan(ns, p, hpPct);
    if (pl) {
      const c = pl.c;
      const wp = waypoint(ns, p, pl.path);
      if (wp.offPath > 3 * (ns.World.TS || 32)) pl.at = 0;  
      return { x: wp.x, y: wp.y, fx: c.x, fy: c.y, w: 6, mode: c.mode, chase: c.chase, hold: c.hold, until: c.until, escort: c.escort, direct: c.direct };
    }
    const W = ns.World;
    const mag = p.magnet || 78;
    const gt = ns.Game.st.time;
    const pSpd = (p.baseSpd || 100) * (p.spdMul || 1);
    const traps = ((W && W.specialsNear && W.specialsNear(p.x, p.y, 600)) || []).filter(t => t.type === 'trap');
    const onTrap = k => traps.some(t => (k.x - t.x) ** 2 + (k.y - t.y + 8) ** 2 < 23 * 23);
    S.orbBan = (S.orbBan || []).filter(b => b.until > gt);
    const banned = k => S.orbBan.some(b => Math.abs(k.x - b.x) < 70 && Math.abs(k.y - b.y) < 70);
    const all = ns.Pickups.all();
    let loose = 0;
    for (const k of all) if (!k.pulled && (k.kind === 'xp' || k.kind === 'xpBig')) loose += k.kind === 'xpBig' ? 3 : 1;
    const wOf = k => k.kind === 'heal' ? (hpPct < 0.7 ? 8 : 0.2) : k.kind === 'magnet' ? 5 + loose * 0.4 : (PICK_W[k.kind] ?? 1);
    const items = all.filter(k => !k.pulled && !(k.kind === 'heal' && hpPct >= 0.95) && !onTrap(k) && !banned(k));
    const clR = Math.max(90, mag * 0.8);  
    const g = S.orbGoal;
    if (g && gt < g.until) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < g.bestD - 40 || S.mode !== 'orbs') { g.bestD = Math.min(g.bestD, d); g.at = gt; }
      else if (gt - g.at > 3) { S.orbBan.push({ x: g.x, y: g.y, until: gt + 20 }); S.orbGoal = null; return pickTarget(ns, p, enemies, hpPct, fear); }
      let left = 0;
      for (const k of items) if (Math.abs(k.x - g.x) < clR && Math.abs(k.y - g.y) < clR) left += wOf(k);
      if (left > 0 && d > mag * 0.85) return { x: g.x, y: g.y, w: 2, mode: 'orbs', orb: true };
    }
    let best = null, bestS = 0;
    const [ox, oy] = S.out || [0, 0];
    const seeds = items.length > 120 ? items.map(k => [Math.hypot(k.x - p.x, k.y - p.y), k]).sort((a, b) => a[0] - b[0]).slice(0, 120).map(x => x[1]) : items;
    for (const k of seeds) {
      const dx = k.x - p.x, dy = k.y - p.y, d = Math.hypot(dx, dy);
      if (d < mag * 0.9) continue;  
      let cluster = 0;
      for (const o of items) if (Math.abs(o.x - k.x) < clR && Math.abs(o.y - k.y) < clR) cluster += wOf(o);
      let crowd = 0;
      for (const e of enemies) if (!e.dead && Math.abs(e.x - k.x) < 70 && Math.abs(e.y - k.y) < 70) crowd += e.boss ? 5 : 1;
      const ahead = (ox * dx + oy * dy) / (d || 1);
      const s = cluster / (d + 120) / (1 + crowd * 0.35 * fear) * (1 + 0.3 * ahead);
      if (s > bestS) { bestS = s; best = k; }
    }
    if (best) {
      const d = Math.hypot(best.x - p.x, best.y - p.y);
      S.orbGoal = { x: best.x, y: best.y, until: gt + 1.5 + 2 * d / pSpd, bestD: d, at: gt };
      return { x: best.x, y: best.y, w: 2, mode: 'orbs', orb: true };
    }
    S.orbGoal = null;
    if (hpPct > 0.5) {
      let hunt = null, hd = Infinity;
      for (const e of ns.EnemyMgr.all()) {
        if (e.dead || e.silent) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < hd) { hd = d; hunt = e; }
      }
      if (hunt && hd > 600) return { x: hunt.x, y: hunt.y, w: 0.8, mode: 'hunt' };
    }
    return null;
  }

  function steer(ns) {
    const p = ns.Game.player;
    if (!p || p.dead) return [0, 0];
    const now = performance.now();
    const dt = Math.min(0.1, (now - S.lastT) / 1000); S.lastT = now;
    const gt = ns.Game.st.time;
    const hpPct = p.hp / p.maxHp;
    let fear = hpPct < 0.35 ? 2.5 : hpPct < 0.6 ? 1 : 0.25;

    const near = [];
    for (const e of ns.EnemyMgr.all()) {
      if (e.dead || e.silent) continue;
      if (e.behavior === 'thief') continue;  
      if (Math.abs(e.x - p.x) < 360 && Math.abs(e.y - p.y) < 360) near.push(e);
    }
    const shots = ns.Projectiles.all().filter(s => !s.friendly && Math.abs(s.x - p.x) < 300 && Math.abs(s.y - p.y) < 300);
    for (let i = hazards.length - 1; i >= 0; i--) { const h = hazards[i]; if (h.hit && h.t >= h.delay + h.end) hazards.splice(i, 1); }

    const J = ns.Judgment;
    const unitPx = (ns.Tiles && ns.Sprites) ? ns.Tiles.T * ns.Sprites.PX : 32;
    const judging = !!(J && J.active);
    if (!judging) S.jCenter = null;
    else {
      const wa = ns.World && ns.World.arena;   // arena da Sentença: {tx, ty, r, type:'judgment'} em tiles
      if (wa && wa.type === 'judgment') S.jCenter = { x: wa.tx * unitPx + unitPx / 2, y: wa.ty * unitPx + unitPx / 2 };
      else if (!S.jCenter) S.jCenter = { x: p.x, y: p.y - 3 * unitPx };  
    }
    const arceus = judging ? ns.EnemyMgr.all().find(e => e.arceus) : null;

    let target = pickTarget(ns, p, near, hpPct, fear);
    if (target && target.escort) fear = Math.max(fear, 1);  
    if (judging && target && !(target.orb && Math.hypot(target.x - p.x, target.y - p.y) < 140 && (!arceus || Math.hypot(arceus.x - p.x, arceus.y - p.y) > 320))) target = null;
    const arena = (ns.Rift && ns.Rift.inArena) || judging;
    const W = ns.World;

    const pSpd = (p.baseSpd || 100) * (p.spdMul || 1);
    const bigFear = Math.max(1, fear);
    const red = 1 - Math.min(0.8, p.reduction ?? p.dmgReduce ?? 0);
    const hitFrac = (dmg, pure) => Math.min(1, (dmg || 0) * (pure ? 1 : red) / p.maxHp);
    const hazFrac = h => Math.min(1, (h.pct ? Math.max(h.dmg || 0, p.maxHp * h.pct) : (h.dmg || 0)) * (h.pure ? 1 : red) / p.maxHp);
    const DMG_W = hpPct < 0.6 ? 160 : 90, TOUCH_W = hpPct < 0.35 ? 160 : hpPct < 0.6 ? 100 : 30;
    // 0.2.2: lutar com o chefe em vez de só fugir. O alcance do golpe ativo decide a distância: de perto
    // (mordida, investida, aura) encosta enquanto a vida aguenta; de longe fica a ~70% do alcance (até 280 px,
    // dentro dos 330 px em que o jogo prioriza o chefe). Vida baixa: volta a desviar.
    const myReach = groupReach(p.slots && p.slots[p.active]);
    const short = myReach < 150;
    let engaged = null, engageF = 1;
    if (!judging) {
      const riftBoss = ns.Rift && ns.Rift.inArena && ns.Rift.arena && ns.Rift.arena.bossId && ns.EnemyMgr.get && ns.EnemyMgr.get(ns.Rift.arena.bossId);
      const cand = (riftBoss && !riftBoss.dead) ? riftBoss : near.find(e => e.boss && !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 450);
      const keep = S.engaged === (cand && cand.id) ? 0.05 : 0;   // histerese: não fica liga/desliga
      // perder na fenda não acaba a partida (volta ao mapa sem prêmio): lá dá para arriscar mais que com chefe do mapa
      const lim = riftBoss && cand === riftBoss ? (short ? 0.25 : 0.2) : (short ? 0.45 : 0.3);
      if (cand && myReach > 0 && hpPct > lim - keep) { engaged = cand; engageF = short ? 0.3 : 1; }   // de longe não precisa encostar: o chefe continua assustando igual (investidas de 330 px)
    }
    S.engaged = engaged ? engaged.id : null;
    S.engageD = engaged ? (short ? Math.max(28, myReach * 0.6) : Math.min(280, myReach * 0.7)) : 0;
    const danger = (x, y, tAhead) => {
      let c = 0, big = 0, worst = 0, haz = 0;
      for (const e of near) {
        const spd = e.arceus ? pSpd * 1.2 : e.spd || 40, fast = Math.min(2, spd / pSpd);
        const d = Math.hypot(x - e.x, y - e.y) - (e.r || 10) - p.r - spd * tAhead * 0.8;
        const reach = (e.arceus ? 140 : e.boss ? 90 : 35) + 45 * fast;
        const w = e.arceus ? 8 : (e.boss ? 4 : 1) * Math.min(3, Math.max(0.5, (e.dmg || 10) / (p.maxHp * 0.12)));
        const bf = e === engaged ? engageF : 1;          // 0.2.2: chefe que estamos enfrentando assusta menos
        const v = w * bf * Math.exp(-Math.max(d, -20) / reach);
        if (e.boss || e.arceus) big += v; else c += v;
        const touch = Math.exp(-Math.max(0, d) / 18);
        worst = Math.max(worst, touch * bf * (e.arceus ? 0.4 : hitFrac(e.dmg, false)));
        // 0.4.0: investida (comportamento "charger", enemy.js): parado 0,55 s mirando em você e depois corre
        // 0,42 s a 3,4× a velocidade na direção travada → fica fora do corredor da investida
        if (e.behavior === 'charger' && e.phase === 'aim' && !e.remote) {
          let ux = p.x - e.x, uy = p.y - e.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
          const L = (e.spd || 60) * 3.4 * 0.42 + (e.r || 10) + p.r + 12, Wd = (e.r || 10) + p.r + 10;
          const px = x - e.x, py = y - e.y, along = px * ux + py * uy, side = Math.abs(-px * uy + py * ux);
          if (along > -Wd && along < L && side < Wd) big += 8 + 20 * hitFrac(e.dmg, false);
        }
      }
      for (const s of shots) {
        const sx = s.x + (s.vx || 0) * tAhead, sy = s.y + (s.vy || 0) * tAhead;
        const d = Math.hypot(x - sx, y - sy) - (s.r || 6) - p.r;
        big += 6 * Math.exp(-Math.max(d, -10) / 30);
        worst = Math.max(worst, Math.exp(-Math.max(0, d) / 20) * Math.max(0.03, hitFrac(s.dmg, false)));
      }
      for (const h of hazards) if (!h.hit && inHazard(h, x, y, p.r)) { big += 25; haz += hazFrac(h); }
      return c * fear + big * bigFear + worst * TOUCH_W + haz * DMG_W;
    };

    const wet = wetOk(ns, p), slowWet = wet && wetSlow(ns, p) < 1 && W && W.isLiquid;
    const free = (x, y) => !W || !W.isFree || W.isFree(x, y, p.r, wet);
    const traps = ((W && W.specialsNear && W.specialsNear(p.x, p.y, 400)) || []).filter(t => t.type === 'trap');
    const onTrap = (x, y) => traps.some(t => (x - t.x) ** 2 + (y - t.y + 8) ** 2 < 23 * 23);
    const pathLen = (dx, dy, step) => {
      for (let t = 12; t <= step; t += 12) {
        const x = p.x + dx * t, y = p.y + dy * t;
        if (!free(x, y) || onTrap(x, y)) return t - 12;
      }
      return step;
    };
    const RING = DIRS.filter((_, i) => i % 2 === 0);
    const cramped = (x, y) => { let n = 0; for (const [rx, ry] of RING) if (!free(x + rx * 45, y + ry * 45)) n++; return n; };

    const los = (x1, y1, x2, y2) => {
      if (!W || !W.projectileBlock) return true;
      const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 12);
      for (let i = 1; i < n; i++) if (W.projectileBlock(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n - (ns.LIFT || 0), 4)) return false;
      return true;
    };
    const aimTargets = near.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 10);
    const lockedFrom = (x, y) => {
      let boss = null, nearest = null, nd = 520;
      for (const e of aimTargets) {
        if (e.arceus) continue;  
        const d = Math.hypot(e.x - x, e.y - y);
        if (e.boss && d < 330) boss = e;
        if (d < nd) { nd = d; nearest = e; }
      }
      return boss || nearest;
    };
    const blockedShot = (x, y) => { const e = lockedFrom(x, y); return e && !los(x, y, e.x, e.y) ? 1 : 0; };
    const shootable = aimTargets.filter(e => !e.arceus && Math.hypot(e.x - p.x, e.y - p.y) < 520).slice(0, 6);
    const blockedFrac = (x, y) => { if (!shootable.length) return 0; let b = 0; for (const e of shootable) if (!los(x, y, e.x, e.y)) b++; return b / shootable.length; };
    S.losTarget = lockedFrom(p.x, p.y);
    S.losBadT = blockedShot(p.x, p.y) || blockedFrac(p.x, p.y) >= 0.5 ? (S.losBadT || 0) + dt : 0;
    if (S.losBadT === 0 && S.plan && S.plan.key.startsWith('los')) S.plan = null;  
    const losW = S.losBadT > 0.4 ? 3 : 1.5;  

    const here = danger(p.x, p.y, 0);

    let kite = null;
    const hadTarget = S.hadTarget; S.hadTarget = !!target && here <= 2;
    const ar = judging ? (S.jCenter && { x: S.jCenter.x, y: S.jCenter.y, r: 24, judge: true }) : arena && ns.Rift.arena;
    if (ar) {
      const boss = ar.judge ? arceus : (ar.bossId && ns.EnemyMgr.get && ns.EnemyMgr.get(ar.bossId)) || near.find(e => e.boss);
      const unit = unitPx;
      const edge = Math.max(80, (ar.r - 1.4) * unit - p.r - 6);  
      const ring = edge * (ar.judge ? 0.55 : 0.82);
      let px0 = p.x - ar.x, py0 = p.y - ar.y; const pr = Math.hypot(px0, py0) || 1;
      const pa = Math.atan2(py0, px0);
      let kx = 0, ky = 0, w = 1.8;
      if (boss && !boss.dead && engaged === boss) {
        const ang = Math.atan2(p.y - boss.y, p.x - boss.x) + S.spin * (short ? 0.25 : 0.4);
        const R0 = S.engageD;
        let tx = boss.x + Math.cos(ang) * R0, ty = boss.y + Math.sin(ang) * R0;
        const tr = Math.hypot(tx - ar.x, ty - ar.y), lim = edge * 0.95;   // não encostar na parede da arena
        if (tr > lim) { tx = ar.x + (tx - ar.x) * lim / tr; ty = ar.y + (ty - ar.y) * lim / tr; S.spin *= -1; }
        kx = tx - p.x; ky = ty - p.y;
        w = Math.hypot(kx, ky) > 50 ? 4 : 2.2;
      } else if (boss && !boss.dead) {
        const ba = Math.atan2(boss.y - ar.y, boss.x - ar.x);
        let delta = pa - ba; while (delta > Math.PI) delta -= 2 * Math.PI; while (delta < -Math.PI) delta += 2 * Math.PI;
        if (Math.abs(delta) < Math.PI * 0.85) S.spin = delta >= 0 ? 1 : -1;
        const aim = pa + S.spin * 0.55;
        kx = ar.x + Math.cos(aim) * ring - p.x; ky = ar.y + Math.sin(aim) * ring - p.y;
        const bd = Math.hypot(p.x - boss.x, p.y - boss.y);
        if (bd < (ar.judge ? 240 : 180)) {                  
          const ux = (p.x - boss.x) / (bd || 1), uy = (p.y - boss.y) / (bd || 1);
          const kl0 = Math.hypot(kx, ky) || 1;
          kx = kx / kl0 + ux * 1.5; ky = ky / kl0 + uy * 1.5;
          w = 3.5;
        }
      } else if (!ar.judge) {
        kx = ar.x - p.x; ky = ar.y - p.y;                  
        if (pr < 40) kx = ky = 0;
      }                                                    
      const kl = Math.hypot(kx, ky);
      if (kl > 0.01) kite = { x: kx / kl, y: ky / kl, w };
    } else if (engaged && !(target && (target.hold || target.chase || target.escort))) {
      const ang = Math.atan2(p.y - engaged.y, p.x - engaged.x) + S.spin * (short ? 0.25 : 0.4);
      let kx = engaged.x + Math.cos(ang) * S.engageD - p.x, ky = engaged.y + Math.sin(ang) * S.engageD - p.y;
      const kl = Math.hypot(kx, ky) || 1;
      kite = { x: kx / kl, y: ky / kl, w: kl > 50 ? 3.5 : 2 };
      if (pathLen(kx / kl, ky / kl, 90) < 40) { S.spinBlockT += dt; if (S.spinBlockT > 0.6) { S.spin *= -1; S.spinBlockT = 0; } } else S.spinBlockT = 0;
    } else if ((!target || here > 2) && !(target && target.hold) && !(target && target.chase && here < 4)) {
      if (hadTarget) S.loopC = null;  
      let R = 380, c = S.loopC;
      const v = S.out || [1, 0];
      const anchor = () => ({ x: p.x - R * S.spin * v[1], y: p.y + R * S.spin * v[0] });
      if (!c || Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - R) > R * 0.6) c = S.loopC = anchor();
      let rx = p.x - c.x, ry = p.y - c.y; const rd = Math.hypot(rx, ry) || 1; rx /= rd; ry /= rd;
      const ang = Math.atan2(ry, rx) + S.spin * 0.5;
      let kx = c.x + Math.cos(ang) * R - p.x, ky = c.y + Math.sin(ang) * R - p.y;
      const kl = Math.hypot(kx, ky) || 1; kx /= kl; ky /= kl;
      kite = { x: kx, y: ky, w: 1.6 + Math.min(1.5, here * 0.4) };
      S.spinBlockT = pathLen(kx, ky, 90) < 60 ? S.spinBlockT + dt : 0;
      if (S.spinBlockT > 0.6) { S.spin *= -1; S.spinBlockT = 0; S.loopC = null; }
    }

    const hazardHits = (dx, dy) => {
      if (!hazards.length) return 0;
      const reach = pathLen(dx, dy, 240);
      let hit = 0, frac = 0;
      for (const h of hazards) {
        if (h.hit) continue;
        const tr = Math.max(0, (h.delay || 0) - (h.t || 0));
        const t2 = Math.min(tr * pSpd * 0.9, reach);  
        if (inHazard(h, p.x + dx * t2, p.y + dy * t2, p.r + 4)) { hit += 1; frac += hazFrac(h); }
      }
      return hit * 30 * bigFear + frac * DMG_W * 1.5;
    };

    // 0.3.0: risco de tiro pela trajetória inteira (colisão contínua): para cada direção, o ponto de maior
    // aproximação entre o jogador andando e cada projétil, em vez de só olhar onde o jogador termina o passo
    const shotRisk = (dx, dy, reach) => {
      if (!shots.length) return 0;
      const T = reach / pSpd, vx = dx * pSpd, vy = dy * pSpd;
      let risk = 0;
      for (const s of shots) {
        const rx = s.x - p.x, ry = s.y - p.y, rvx = (s.vx || 0) - vx, rvy = (s.vy || 0) - vy, vv = rvx * rvx + rvy * rvy;
        let t = vv > 1e-6 ? -(rx * rvx + ry * rvy) / vv : 0;
        t = Math.max(0, Math.min(T + 0.25, t));
        const d = Math.hypot(rx + rvx * t, ry + rvy * t) - (s.r || 6) - p.r - 4;
        const hf = hitFrac(s.dmg, false);
        if (d < 0) risk += (1 + 12 * hf) * 1.5 / (t + 0.3);
        else if (d < 18) risk += (0.5 + 6 * hf) * (1 - d / 18) / (t + 0.3);
      }
      return risk * (hpPct < 0.5 ? 2 : 1);
    };
    const cost = DIRS.map(([dx, dy]) => {
      let bestStep = Infinity;
      for (const step of [55, 120, 200]) {
        const reach = pathLen(dx, dy, step);
        if (reach < 12) continue;                      
        const x = p.x + dx * reach, y = p.y + dy * reach;
        let c = danger(x, y, reach / pSpd) + shotRisk(dx, dy, reach);
        c += (reach < step ? 6 + 6 * (1 - reach / step) : 0) + cramped(x, y) * 1.2 + (slowWet && W.isLiquid(x, y) ? 1.2 : 0);  
        if (target) {
          const before = Math.hypot(target.x - p.x, target.y - p.y), after = Math.hypot(target.x - x, target.y - y);
          c -= target.w * (before - after) / step;  
        }
        bestStep = Math.min(bestStep, c);
      }
      if (bestStep === Infinity) return Infinity;
      bestStep += hazardHits(dx, dy);
      bestStep += losW * (blockedShot(p.x + dx * 90, p.y + dy * 90) + blockedFrac(p.x + dx * 90, p.y + dy * 90));
      if (kite) bestStep -= kite.w * (dx * kite.x + dy * kite.y);
      else if (!target && !arena) bestStep -= 0.3 * (dx * Math.cos(S.wanderA) + dy * Math.sin(S.wanderA));
      return bestStep;
    });
    const sm = cost.map((c, i) => c === Infinity ? Infinity : 0.5 * c + 0.25 * (Math.min(cost[(i + 15) % 16], c + 3) + Math.min(cost[(i + 1) % 16], c + 3)));
    let bi = -1;
    for (let i = 0; i < 16; i++) if (sm[i] < Infinity && (bi < 0 || sm[i] < sm[bi])) bi = i;
    if (!target) S.wanderA += dt * 0.35;
    S.mode = judging ? (here > 2 ? 'judgeDodge' : 'judgeLoop') : engaged ? (here > 2 + (short ? 4 : 1) ? 'arenaDodge' : 'bossFight') : arena ? (here > 2 ? 'arenaDodge' : 'arenaBoss') : here > 2 ? 'dodge' : target && (target.chase || target.hold) ? target.mode : kite ? 'kite' : target ? target.mode : 'idle';
    const escape = () => {
      let bd = null, bs = -Infinity;
      for (const [dx, dy] of DIRS) {
        let r = pathLen(dx, dy, 120);
        if (r < 12) for (let t2 = 6; t2 <= 40; t2 += 6) { if (W && W.isFree && !W.isFree(p.x + dx * t2, p.y + dy * t2, p.r * 0.5, wet)) break; r = t2 * 0.5; }
        const sc = r - cramped(p.x + dx * r, p.y + dy * r) * 15 - danger(p.x + dx * r, p.y + dy * r, 0.5) * 20;
        if (sc > bs) { bs = sc; bd = [dx, dy]; }
      }
      return bd || DIRS[(Math.random() * 16) | 0];
    };
    if (bi < 0) { S.unstickT = Math.max(S.unstickT, 0.4); S.unstickDir = escape(); bi = 0; }

    let urgent = 0;
    for (const sh of shots) urgent += 6 * Math.exp(-Math.max(Math.hypot(p.x - sh.x, p.y - sh.y) - (sh.r || 6) - p.r, -10) / 30);
    for (const h of hazards) if (!h.hit && inHazard(h, p.x, p.y, p.r + 4)) urgent += 25;
    const emergency = urgent > 4;
    S.holdT -= dt;
    const keep = S.dirIdx >= 0 && sm[S.dirIdx] < Infinity && (emergency ? sm[S.dirIdx] - sm[bi] < 3 && S.holdT > 0 : S.holdT > 0 || sm[S.dirIdx] - sm[bi] < 0.6);
    if (keep) bi = S.dirIdx;
    else if (bi !== S.dirIdx) { S.dirIdx = bi; S.holdT = emergency ? 0.25 : 0.15; }
    let best = DIRS[bi];
    S.holding = false;
    if (target && target.hold && here < 4) {
      const d = Math.hypot((target.fx ?? target.x) - p.x, (target.fy ?? target.y) - p.y);
      if (d < target.hold && !(target.until && target.until())) {
        const key = S.plan && S.plan.key;
        if (S.holdKey !== key) { S.holdKey = key; S.holdSince = gt; }
        const limit = target.escort ? 20 : target.mode === 'chest' ? 6 : 10;
        if (gt - S.holdSince < limit) { S.holding = true; S.wd = null; return [0, 0]; }
        if (key) { S.ban[key] = gt + 30; S.plan = null; log('give up', key); }
      }
    }

    if (target && target.fx !== undefined && here < 2) {
      const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy) || 1;
      const safe = !hazards.some(h => !h.hit && inHazard(h, p.x + dx / d * 30, p.y + dy / d * 30, p.r));
      if (safe && d > 4) best = [dx / d, dy / d];
    }

    if (!arena && !emergency) {
      let close = 0; const sect = new Set();
      for (const e of near) {
        if (e.boss) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) - (e.r || 10) - p.r > 70) continue;
        close++; sect.add((Math.round(Math.atan2(e.y - p.y, e.x - p.x) / (Math.PI / 4)) + 8) % 8);
      }
      if (S.breakT > 0 && close >= 3 && pathLen(S.breakDir[0], S.breakDir[1], 40) >= 24) { S.breakT -= dt; best = S.breakDir; S.mode = 'breakout'; }
      else {
        S.breakT = 0;
        if (close >= 5 && sect.size >= 6) {
          let bd = null, bs = Infinity;
          for (const [dx, dy] of DIRS) {
            const reach = pathLen(dx, dy, 160);
            if (reach < 40) continue;
            let c = (160 - reach) / 20 + hazardHits(dx, dy);  
            for (const e of near) {
              const ex = e.x - p.x, ey = e.y - p.y, d = Math.hypot(ex, ey) || 1, cos = (ex * dx + ey * dy) / d;
              if (cos > 0) c += (e.boss ? 4 : 1) * (0.5 + 10 * hitFrac(e.dmg, false)) * cos * cos * 100 / Math.max(30, d);
            }
            if (target) c -= 0.5 * (dx * (target.x - p.x) + dy * (target.y - p.y)) / (Math.hypot(target.x - p.x, target.y - p.y) || 1);
            if (c < bs) { bs = c; bd = [dx, dy]; }
          }
          if (bd) { S.breakDir = bd; S.breakT = 2.5; best = bd; S.mode = 'breakout'; S.dirIdx = -1; }
        }
      }
    }

    if (S.lastPos) {
      const moved = Math.hypot(p.x - S.lastPos[0], p.y - S.lastPos[1]);
      S.stuckT = moved < 0.3 ? S.stuckT + dt : 0;
    }
    S.lastPos = [p.x, p.y];
    if (!S.wd || S.holding) S.wd = { x: p.x, y: p.y, t: gt };
    else if (gt - S.wd.t > 3) {
      if (Math.hypot(p.x - S.wd.x, p.y - S.wd.y) < 10) {
        log('watchdog: stuck, escaping');
        if (S.plan) { S.ban[S.plan.key] = gt + 15; S.plan = null; }
        S.loopC = null; S.unstickT = 0.8; S.unstickDir = escape();
      }
      S.wd = { x: p.x, y: p.y, t: gt };
    }
    if (S.stuckT > 0.4) { S.stuckT = 0; S.unstickT = 0.5; S.unstickDir = escape(); }  
    if (S.unstickT > 0) { S.unstickT -= dt; best = S.unstickDir; }
    const reversing = S.out[0] * best[0] + S.out[1] * best[1] < -0.2;  
    const a = emergency || reversing || S.unstickT > 0 ? 1 : Math.min(1, dt * 12);
    let ox = S.out[0] * (1 - a) + best[0] * a, oy = S.out[1] * (1 - a) + best[1] * a;
    const ol = Math.hypot(ox, oy) || 1;
    S.out = [ox / ol, oy / ol];
    if (!isFinite(S.out[0]) || !isFinite(S.out[1])) { S.out = escape(); S.loopC = null; S.plan = null; }
    return S.out;
  }
})();
