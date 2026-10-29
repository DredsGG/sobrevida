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
    partner: true,      // trocar de parceiro sozinho: o melhor que ainda não está 100%
    skins: true,        // Halloween: comprar as skins de bruja com os doces
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
      for (const k of ['on', 'upgrades', 'gacha', 'partner', 'skins', 'missions']) if (typeof c[k] === 'boolean') cfg[k] = c[k];
      if (typeof c.reserve === 'number' && c.reserve >= 0) cfg.reserve = c.reserve;
      if (c.modo === 'solo' || c.modo === 'grupo') cfg.modo = c.modo;
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
    ns.LevelUp.offer = function () { return (S.lastOffer = origOffer.apply(this, arguments)); };
    const R = ns.RunUI;
    const origLevel = R.showLevelUp;
    R.showLevelUp = function (level, cards) {
      const r = origLevel.apply(this, arguments);
      M.lvlOpenAt = performance.now();
      if (ativo(ns) && cfg.cards) schedule(() => chooseCard(ns, cards), 700); // 700 ms: o jogo ignora cliques nos primeiros 0,6 s
      return r;
    };
    const origBond = R.showBond;
    R.showBond = function (opt) {
      const r = origBond.apply(this, arguments);
      if (ativo(ns) && cfg.bonds) schedule(() => chooseBond(ns, opt), 700);
      return r;
    };
    const origItem = R.showItemChoice;
    R.showItemChoice = function (cur, next) {
      const r = origItem.apply(this, arguments);
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

  async function routine(ns) {
    if (M.needMaint) {
      M.needMaint = false;
      if (cfg.missions) { M.task = 'missions'; await missoes(ns); }
      if (cfg.gacha) { M.task = 'gacha'; await gacha(ns); }
      if (cfg.partner) { M.task = 'partner'; await parceiro(ns); }
      if (cfg.upgrades) { M.task = 'upgrades'; await melhorias(ns); }
      if (cfg.upgrades) { M.task = 'moves'; await golpes(ns); }
      if (cfg.skins && ns.Halloween && ns.Halloween.on) { M.task = 'skins'; await skins(ns); }
      M.task = 'save'; await guardar(ns);
      if (!cfg.on) return;
    }
    // começa outra partida
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
    // senão: a região onde faltam MENOS Pokémon (fecha uma região → Amuleto Iris, shiny ×2); empate: mais pity
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
  const KB = { castKey: '', cov: null, covBoss: null, plans: {}, vals: {}, learn: {}, run: new Map() };
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
    const key = cast ? cast.map((c) => c.from + ':' + c.list.map((d) => d.dex).join(',')).join('|') : 'none';
    if (KB.castKey === key && KB.cov) return KB.cov;
    KB.castKey = key; KB.cov = {}; KB.covBoss = {};
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
    KB.plans = {};
    return KB.cov;
  }

  // Valor de um golpe para um Pokémon: dano/s × lado físico/especial × monotipo × clima da habilidade × cobertura,
  // misturando alvo único (chefes, peso 0,4) e horda (0,6).
  function valorGolpe(ns, mon, m) {
    if (!m || m.kind === 'buff') return 0;
    cobertura(ns);
    const [s, h] = rawDps(m);
    let k = m.cat && ns.Stats ? ns.Stats.fit(mon, m.cat) : 1;
    if (mon.types && mon.types.length === 1 && m.type === mon.types[0]) k *= 1.2;
    const abil = ((ns.DEX_ABIL && ns.DEX_ABIL[mon.dex]) || []).filter(Boolean);
    for (const a of abil) if (WEATHER_OF[a] === m.type) k *= WEATHER_MUL[m.type];
    // o farm luta andando em volta da horda (kite): golpe de alcance curto acerta menos do que a conta pura diz, e
    // órbita não combina com a troca de ataque (sumiria a cada troca)
    if (!(KB.learn[m.id] && KB.learn[m.id].n > 20)) k *= Math.max(0.5, Math.min(1, moveReach(m) / 200));
    if (m.kind === 'orbit') k *= 0.6;
    const cv = (KB.cov && KB.cov[m.type]) || 1, cb = (KB.covBoss && KB.covBoss[m.type]) || 1;
    return k * (0.4 * s * cb + 0.6 * h * cv);
  }
  // Valor no começo (nível 1) e no fim (nível máximo evoluído): a build olha os dois.
  function valorBuild(ns, mon, id) {
    const d = ns.Moves.BY_ID[id];
    if (!d || d.kind === 'buff') return 0;
    const v1 = valorGolpe(ns, mon, inst(ns, id, 1, false));
    const vMax = valorGolpe(ns, mon, inst(ns, id, d.maxLvl || 5, !!(ns.Moves.EVO && ns.Moves.EVO[id])));
    return 0.35 * v1 * 3 + 0.65 * vMax;               // ×3 no nível 1: compara na mesma escala do fim
  }

  // Build planejada de um Pokémon: os 2 ataques principais, os buffs e o parceiro de troca.
  // O 2º ataque ganha bônus se cobre o ponto fraco do 1º (horda × alvo único, ou tipo diferente).
  function planoDe(ns, dex) {
    cobertura(ns);
    if (KB.plans[dex]) return KB.plans[dex];
    const mon = ns.DEX_BY && ns.DEX_BY[dex];
    if (!mon) return null;
    let pool = [];
    try { pool = ns.Moves.poolFor(mon); } catch (_) {}
    const ataques = pool.filter((id) => { const d = ns.Moves.BY_ID[id]; return d && d.kind !== 'buff'; })
      .map((id) => ({ id, v: valorBuild(ns, mon, id), d: ns.Moves.BY_ID[id] }))
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
    const lado = ns.Stats ? ns.Stats.sideOf(mon) : 'physical';
    const buffs = ['harden', lado === 'physical' ? 'swords-dance' : 'nasty-plot'].filter((id) => pool.includes(id));
    // parceiro de troca: golpe de recarga curta e que alcança longe (fica pronto rápido depois de cada troca)
    const resto = ataques.filter((x) => x !== a && x !== b && x.d.kind !== 'orbit' && x.d.kind !== 'charge');   // órbita/carga não servem de parceiro
    const parc = resto.slice().sort((x, y) => (x.d.cd || 1) - (y.d.cd || 1) || y.v - x.v)[0] || null;
    const plano = { dex, a: a.id, b: b && b.id, buffs, parceiro: parc && parc.id, val: Object.fromEntries(ataques.map((x) => [x.id, x.v])), top: a.v };
    return (KB.plans[dex] = plano);
  }

  // Força de um Pokémon (para escolher o parceiro): valor da build × sobrevivência (vida, defesas, velocidade).
  function forcaDe(ns, dex) {
    const mon = ns.DEX_BY && ns.DEX_BY[dex];
    const p = mon && planoDe(ns, dex);
    if (!p) return 0;
    const off = (mon.atk || 1) * (p.top + 0.6 * ((p.b && p.val[p.b]) || 0));
    const tough = Math.sqrt((mon.hp || 80) / 100 * (((mon.df || 60) + (mon.sd || 60)) / 180));
    return off * Math.sqrt(tough) * (0.8 + 0.2 * (mon.spd || 100) / 110);
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
      if (m.castAt && m.castAt !== r.last) { r.last = m.castAt; r.casts++; r.denom += m.dmg * pl.atkFor(m) * (m.kind === 'orbit' ? 0 : 1); }
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
  function escolhasDe(ns, dex) {
    const mon = ns.DEX_BY && ns.DEX_BY[dex];
    const pl = mon && planoDe(ns, dex);
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

  function atkBuffOf(ns, p) { return ns.Stats.sideOf(p.mon) === 'physical' ? 'swords-dance' : 'nasty-plot'; }
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
