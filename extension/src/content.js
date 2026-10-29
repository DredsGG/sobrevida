// Sobrevida — dentro do PokéSurvivor (pokesurvivor.com).
// v0.1.0: menu de parceiro inicial. Antes do teste de personalidade (8 perguntas) a pessoa escolhe um dos 29 Pokémon
// e a Sobrevida responde o teste com as respostas que dão aquele Pokémon. Se o jogo sortear outro (pares com os mesmos
// traços) ou se o teste tiver mudado, termina pelo "Escolher outro" do próprio jogo, então o Pokémon sai sempre certo.
// Só clica nos botões do jogo (os mesmos que a pessoa clicaria); não mexe no save nem fala com servidor do jogo.
// Mapa das telas e da regra do teste: vault Jarvis, 02-projetos/extensoes/pokesurvivor/pokesurvivor-engenharia-reversa.md.
(() => {
  // reinjeção (versão nova na pasta / instalação com a aba aberta): a cópia velha se desliga
  document.dispatchEvent(new Event('sobrevida-takeover'));
  let dead = false;
  const onTakeover = () => stop();
  setTimeout(() => document.addEventListener('sobrevida-takeover', onTakeover), 0);

  const ext = (globalThis.browser && globalThis.browser.runtime) ? globalThis.browser : globalThis.chrome;
  const I = globalThis.SV_I18N, NOV = globalThis.SV_NOVIDADES || {}, D = globalThis.SV_DADOS;
  const alive = () => { try { return !dead && !!ext.runtime.id; } catch (_) { return false; } };
  const SYNC = ext.storage.sync || ext.storage.local; // Opera: sync pode não existir
  const VERSION = ext.runtime.getManifest().version;
  const IS_FF = /Firefox\//.test(navigator.userAgent);
  let lang = I.detect();
  const L = () => I.T[lang] || I.T.en;
  const S = { auto: true };
  let alvo = null; // dex escolhido
  const byDex = (d) => D.starters.find((s) => s.dex === d) || null;
  const BEST = byDex(D.melhor);

  // ───────────────────────── telas do jogo (index.html do PokéSurvivor) ─────────────────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const byId = (id) => document.getElementById(id);
  const vis = (id) => { const el = byId(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; };
  const SCR = ['scr-login', 'scr-test', 'scr-result', 'scr-starters', 'scr-menu'];
  const tela = () => SCR.find(vis) || null;
  const abaCriar = () => { const t = $('#scr-login .tab[data-tab="register"]'); return !!t && t.classList.contains('on'); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function esperar(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (dead) return false; try { if (fn()) return true; } catch (_) {} await sleep(80); } return false; }

  // ───────────────────────── registro (local, sem dado pessoal) ─────────────────────────
  async function registrar(ev) {
    try {
      const l = (await ext.storage.local.get('sv.log'))['sv.log'] || [];
      l.unshift(Object.assign({ em: Date.now() }, ev));
      await ext.storage.local.set({ 'sv.log': l.slice(0, 20) });
    } catch (_) {}
  }

  // ───────────────────────── o teste (roda sozinho) ─────────────────────────
  let run = null; // { dex, fase, i, total, cancel }
  let ultimoFim = 0;
  const pausado = () => urgente();
  function contador() { const m = (byId('test-count') || {}).textContent; const n = String(m || '').match(/(\d+)\D+(\d+)/); return n ? [+n[1], +n[2]] : [0, 0]; }

  async function responderTeste() {
    const s = byDex(alvo);
    if (!s || run || pausado()) return;
    const me = run = { dex: s.dex, fase: 'teste', i: 0, total: D.perguntas, cancel: false, mudou: false };
    status();
    try {
      for (let guard = 0; guard < 20 && vis('scr-test'); guard++) {
        if (me.cancel || dead) return;
        const [i, total] = contador();
        const btns = [...document.querySelectorAll('#test-a button.answer')];
        if (!i || !btns.length) { await sleep(120); continue; }
        if (total !== D.perguntas || btns.length !== D.respostas) me.mudou = true; // estrutura nova: responde qualquer uma e garante no "Escolher outro"
        me.i = i; me.total = total || D.perguntas; status();
        await sleep(420); // dá para ver a Sobrevida respondendo
        if (me.cancel || dead || !vis('scr-test')) break;
        const q = (byId('test-q') || {}).textContent;
        const k = me.mudou ? 0 : s.sol[i - 1];
        const b = btns[k] && btns[k].isConnected ? btns[k] : [...document.querySelectorAll('#test-a button.answer')][k];
        if (!b) { me.mudou = true; break; }
        b.click();
        await esperar(() => !vis('scr-test') || (byId('test-q') || {}).textContent !== q || contador()[0] !== i, 3000);
      }
      if (me.cancel || dead) return;
      if (!await esperar(() => vis('scr-result'), 5000)) { if (vis('scr-starters')) return escolherNaGrade(me, s); throw new Error('sem resultado'); }
      me.fase = 'resultado'; status();
      await sleep(900); // mostra o resultado do jogo antes de seguir
      if (me.cancel || dead) return;
      const nome = String((byId('res-name') || {}).textContent || '').trim();
      if (!me.mudou && nome.toLowerCase() === s.name.toLowerCase() && byId('res-ok')) {
        byId('res-ok').click();
        return fim(me, s, 'teste');
      }
      byId('res-other').click(); // sorteio do par (mesmos traços) ou teste mudado: o jogo deixa escolher qualquer um dos 29
      return escolherNaGrade(me, s);
    } catch (e) {
      registrar({ type: 'teste', ok: false, dex: s.dex, err: String(e && e.message || e).slice(0, 60) });
      run = null; status();
    }
  }

  async function escolherNaGrade(me, s) {
    me.fase = 'grade'; status();
    if (!await esperar(() => vis('scr-starters') && document.querySelectorAll('#starter-grid .cell').length, 4000)) throw new Error('sem grade');
    await sleep(350);
    if (me.cancel || dead) return;
    const cells = [...document.querySelectorAll('#starter-grid .cell')];
    let cell = cells.find((c) => String(($('b', c) || {}).textContent || '').trim().toLowerCase() === s.name.toLowerCase());
    if (!cell) { const ix = D.starters.indexOf(s); if (cells.length === D.starters.length) cell = cells[ix]; }
    if (!cell) throw new Error('sem ' + s.name);
    cell.click();
    await esperar(() => byId('starter-ok') && !byId('starter-ok').disabled, 1500);
    await sleep(500);
    if (me.cancel || dead) return;
    byId('starter-ok').click();
    return fim(me, s, 'grade');
  }

  function fim(me, s, via) {
    run = null; ultimoFim = Date.now();
    registrar({ type: via, ok: true, dex: s.dex, mudou: me.mudou ? 1 : 0 });
    toast(me.mudou ? L().changed : L().done(s.name), true);
    fecharPicker();
    status();
  }

  function pararTeste() { if (run) { run.cancel = true; run = null; } toast(L().stopped); status(); }

  // ───────────────────────── interface (shadow DOM, no visual PMD do jogo) ─────────────────────────
  let host = null, root = null;
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .w { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font: 16px/1.35 'Pixelify', 'Segoe UI', system-ui, sans-serif;
    color: #fff; -webkit-font-smoothing: none; font-variant-ligatures: none; font-feature-settings: 'liga' 0, 'clig' 0; --box1: #2c519f; --box2: #1a3170; --edge: #f4f8ff; --edge-in: #5b83d6; --edge-out: #0b1838;
    --gold: #ffd23f; --gold2: #f0a31e; --muted: #b9cbf0; --shadow: #0a1430; --red: #ff5f6d; --green: #5fe08a; }
  .w > * { pointer-events: auto; }
  [hidden] { display: none !important; }
  .box { background: linear-gradient(180deg, var(--box1), var(--box2)); border: 3px solid var(--edge); border-radius: 12px;
    box-shadow: 0 0 0 3px var(--edge-out), inset 0 0 0 2px var(--edge-in), 0 18px 50px rgba(0,0,0,.55); text-shadow: 2px 2px 0 var(--shadow); }
  .pop { opacity: 0; transform: scale(.94); transition: opacity .18s ease-out, transform .22s ease-out; }
  .pop.on { opacity: 1; transform: none; }
  button { font: inherit; color: inherit; cursor: pointer; }
  .btn { appearance: none; padding: 8px 16px; border: 3px solid var(--edge); border-radius: 9px; background: linear-gradient(180deg, #3d67c0, #26468f);
    box-shadow: 0 0 0 2px var(--edge-out), 0 4px 0 var(--edge-out); font-size: 16px; font-weight: 700; text-shadow: 2px 2px 0 var(--shadow); transition: transform .06s, filter .12s; }
  .btn:hover { filter: brightness(1.15); }
  .btn:active { transform: translateY(2px); box-shadow: 0 0 0 2px var(--edge-out), 0 2px 0 var(--edge-out); }
  .btn:disabled { filter: grayscale(.8) brightness(.7); cursor: not-allowed; transform: none; }
  .btn.gold { background: linear-gradient(180deg, #ffe37a, #f0a31e); color: #3a2300; text-shadow: 1px 1px 0 rgba(255,255,255,.4); border-color: #fff7d6; }
  .btn.ghost { background: transparent; box-shadow: none; border-color: rgba(244,248,255,.35); }
  .btn.sm { padding: 5px 10px; font-size: 14px; border-width: 2px; }
  .lk { background: none; border: 0; padding: 2px 4px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; font-size: 14px; text-shadow: 1px 1px 0 var(--shadow); }
  .lk:hover { color: #fff; }
  .x { appearance: none; width: 30px; height: 30px; border-radius: 8px; border: 2px solid rgba(244,248,255,.35); background: rgba(0,0,0,.2); display: grid; place-items: center; flex: none; }
  .x:hover { border-color: var(--edge); background: rgba(255,255,255,.1); }
  .x svg { width: 14px; height: 14px; }
  .sub { color: var(--muted); font-size: 14px; margin: 0; }
  .gold { color: var(--gold); }
  .chip { display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.45); border: 2px solid rgba(255,255,255,.35); }

  /* botão da Sobrevida (coração), arrastável */
  .fab { position: fixed; left: 14px; bottom: 14px; width: 48px; height: 48px; border-radius: 12px; padding: 0; border: 3px solid var(--edge);
    background: linear-gradient(180deg, var(--box1), var(--box2)); box-shadow: 0 0 0 3px var(--edge-out), inset 0 0 0 2px var(--edge-in), 0 6px 18px rgba(0,0,0,.5);
    display: grid; place-items: center; touch-action: none; }
  .fab:hover { filter: brightness(1.15); }
  .fab svg { width: 30px; height: 30px; image-rendering: pixelated; }
  .fab .dot { position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--gold); color: #3a2300; font-size: 12px; font-weight: 700; display: grid; place-items: center; text-shadow: none; border: 2px solid var(--edge-out); }

  /* farm automático */
  .farm .fgo { flex: 1; }
  .farm .fst { font-size: 14px; margin: 0; }
  .farm .fst.w { color: #ffd6a0; }
  .pbar { height: 8px; background: rgba(0,0,0,.35); border-radius: 8px; overflow: hidden; margin: 4px 0 2px; }
  .pbar i { display: block; height: 100%; background: var(--gold); }
  .farm small { color: var(--muted); font-size: 12px; }
  .farm .acts { font-size: 12px; color: #dbe6ff; display: flex; flex-direction: column; gap: 2px; text-align: left; }
  .farm details summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .farm details .opts { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; }
  /* canto superior direito, abaixo do quadro de clima do jogo (y 14–40): ali não fica nada da partida */
  .pill { position: fixed; right: 14px; top: 48px; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 10px; max-width: calc(100vw - 28px); font-size: 13px; cursor: pointer; }
  .pill svg { width: 22px; height: 22px; flex: none; }
  .pill span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill .btn { padding: 2px 8px; font-size: 13px; }
  /* faixa de status no topo (teste rodando) */
  .bar { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 12px; max-width: calc(100vw - 24px); }
  .bar canvas { width: 40px; height: 40px; image-rendering: pixelated; flex: none; }
  .bar b { font-size: 15px; }
  .toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); padding: 10px 16px; max-width: calc(100vw - 24px); font-size: 15px; }
  .toast.ok { border-color: #fff7d6; }
  .bar.pop, .toast.pop { transform: translateX(-50%) scale(.94); }
  .bar.pop.on, .toast.pop.on { transform: translateX(-50%); }

  /* menu da Sobrevida */
  .menu { position: fixed; width: 340px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto; padding: 14px 14px 10px; display: flex; flex-direction: column; gap: 10px; }
  .hd { display: flex; align-items: center; gap: 10px; }
  .hd .ic { width: 30px; height: 30px; flex: none; }
  .hd .t { flex: 1; min-width: 0; }
  .hd .t b { display: block; font-size: 18px; }
  .hd .t small { display: block; color: var(--muted); font-size: 13px; }
  .sec { background: rgba(0,0,0,.18); border: 2px solid rgba(244,248,255,.18); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .sec h4 { margin: 0; font-size: 13px; color: var(--muted); letter-spacing: .5px; text-transform: uppercase; }
  .cur { display: flex; align-items: center; gap: 10px; }
  .cur canvas { width: 64px; height: 64px; flex: none; image-rendering: pixelated; background: radial-gradient(ellipse at 50% 85%, rgba(120,170,255,.22), transparent 62%), linear-gradient(180deg, rgba(20,36,78,.88), rgba(8,14,34,.92)); border: 2px solid var(--cc, #5b83d6); border-radius: 10px; }
  .cur .nm { flex: 1; min-width: 0; }
  .cur .nm b { font-size: 18px; display: block; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sw { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px; }
  .sw input { appearance: none; width: 40px; height: 22px; border-radius: 11px; background: rgba(0,0,0,.35); border: 2px solid rgba(244,248,255,.35); position: relative; flex: none; cursor: pointer; margin: 0; }
  .sw input::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #c9d6f2; transition: left .15s; }
  .sw input:checked { background: linear-gradient(180deg, #ffe37a, #f0a31e); border-color: #fff7d6; }
  .sw input:checked::after { left: 20px; background: #fff; }
  .note { font-size: 13px; color: var(--muted); margin: 0; }
  .warn { font-size: 13px; color: #ffd6a0; margin: 0; }
  .ft { display: flex; align-items: center; gap: 4px 8px; flex-wrap: wrap; justify-content: space-between; border-top: 2px solid rgba(244,248,255,.15); padding-top: 8px; }
  .ft .links { display: flex; gap: 2px 6px; flex-wrap: wrap; }
  .sig { font-size: 13px; color: var(--muted); }
  .sig a { color: var(--gold); text-decoration: none; font-weight: 700; }
  .sig a:hover { text-decoration: underline; }
  .langs { display: inline-flex; gap: 4px; }
  .langs button { appearance: none; border: 2px solid rgba(244,248,255,.3); background: rgba(0,0,0,.2); border-radius: 6px; padding: 1px 6px; font-size: 12px; font-weight: 700; }
  .langs button.on { border-color: var(--gold); color: var(--gold); background: rgba(255,210,63,.14); }
  .chk { font-size: 13px; color: var(--muted); margin: 0; }

  /* escolha do parceiro */
  .pick { position: fixed; display: flex; flex-direction: column; gap: 10px; padding: 16px 18px 14px; overflow: hidden; }
  .pick.mid { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(880px, calc(100vw - 24px)); max-height: calc(100vh - 24px); }
  .pick.mid.pop { transform: translate(-50%, -50%) scale(.94); }
  .pick.mid.pop.on { transform: translate(-50%, -50%); }
  .pick.side { right: 14px; top: 14px; bottom: 14px; width: min(430px, calc(100vw - 28px)); }
  .pick h2 { margin: 0; font-size: 24px; }
  .pick .body { display: flex; gap: 12px; min-height: 0; flex: 1; }
  .pick.side .body { flex-direction: column; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; overflow-y: auto; padding: 3px; flex: 1; min-height: 120px; align-content: start; }
  .cell { position: relative; text-align: center; background: rgba(0,0,0,.2); border: 2px solid rgba(244,248,255,.18); border-radius: 10px; padding: 3px 2px 5px; transition: transform .08s, border-color .12s, background .12s; }
  .cell:hover { transform: translateY(-2px); border-color: var(--edge); background: rgba(255,255,255,.08); }
  .cell.on { border-color: var(--gold); background: rgba(255,210,63,.14); }
  .cell canvas { display: block; margin: 0 auto; width: 64px; height: 56px; image-rendering: pixelated; }
  .cell b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell .star { position: absolute; left: 4px; top: 2px; color: var(--gold); font-size: 15px; }
  .cell .ty { display: flex; justify-content: center; gap: 2px; margin-top: 2px; }
  .cell .ty i { width: 10px; height: 10px; border-radius: 3px; border: 1px solid rgba(255,255,255,.5); }
  .info { width: 300px; flex: none; display: flex; flex-direction: column; gap: 8px; background: rgba(0,0,0,.18); border: 2px solid rgba(244,248,255,.18); border-radius: 10px; padding: 10px; overflow-y: auto; }
  .pick.side .info { width: auto; max-height: 46%; }
  .stage { display: block; margin: 0 auto; width: 150px; height: 120px; image-rendering: pixelated; border: 3px solid var(--cc, #5b83d6); border-radius: 14px;
    background: radial-gradient(ellipse at 50% 88%, rgba(120,170,255,.22), transparent 60%), linear-gradient(180deg, rgba(20,36,78,.88), rgba(8,14,34,.92)); box-shadow: 0 0 0 3px #0b1838; }
  .pick.side .stage { width: 110px; height: 88px; }
  .info h3 { margin: 0; font-size: 20px; text-align: center; }
  .info .tags { display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; }
  .kv { font-size: 13px; color: var(--muted); }
  .kv b { color: #fff; }
  .stat { display: grid; grid-template-columns: 78px 1fr 44px; align-items: center; gap: 6px; font-size: 12px; }
  .stat span { color: var(--muted); }
  .stat em { font-style: normal; text-align: right; }
  .stat .tr { height: 8px; background: rgba(0,0,0,.35); border-radius: 8px; overflow: hidden; }
  .stat .tr i { display: block; height: 100%; background: var(--gold); border-radius: 8px; }
  .acts { display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
  .acts .grow { flex: 1; min-width: 120px; }

  /* quadros no meio da tela (tutorial, novidades, versão nova) */
  .card { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.94); width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 10px; }
  .card.on { transform: translate(-50%, -50%); }
  .card .bd h3 { margin: 0 0 4px; font-size: 19px; }
  .card .bd p, .card .bd li { font-size: 15px; margin: 0; }
  .card .bd ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 5px; }
  .card .cf { display: flex; align-items: center; gap: 8px; }
  .dots { display: flex; gap: 5px; flex: 1; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.3); }
  .dots i.on { background: var(--gold); }
  .card .warnb { display: inline-block; background: rgba(255,95,109,.2); border: 2px solid var(--red); border-radius: 8px; padding: 4px 8px; font-size: 14px; margin-bottom: 6px; }
  .card .nt { font-size: 14px; color: #c9f5d6; margin-top: 6px; }
  @media (max-width: 700px) { .pick .body { flex-direction: column; } .info { width: auto; } }
  `;
  const ICO = {
    heart: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#f0a31e" d="M3 3h3v1h1v1h2V4h1V3h3v1h1v5h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3V9H2V4h1z"/><path fill="#ffd23f" d="M3 4h3v1h1v1h2V5h1V4h3v4h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5V9H4V8H3z"/><path fill="#fff" d="M7 6h2v2h2v2H9v2H7v-2H5V8h2z" transform="translate(0,-.5)"/></svg>',
    x: '<svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
    star: '⭐', gift: '🎁', alert: '⚠️',
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ui() {
    if (root) return root;
    host = document.createElement('div');
    host.id = 'sobrevida-host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="w">
      <button class="fab" type="button" hidden>${ICO.heart}<span class="dot" hidden></span></button>
      <div class="bar box pop" hidden></div>
      <div class="toast box pop" hidden></div>
      <div class="menu box pop" hidden></div>
      <div class="pill box" hidden></div>
      <div class="pick box pop" hidden></div>
      <div class="card box pop" role="dialog" aria-modal="false" hidden></div></div>`;
    (document.body || document.documentElement).appendChild(host);
    const fab = root.querySelector('.fab');
    fab.addEventListener('pointerdown', onFabDown);
    fab.addEventListener('pointermove', onFabMove);
    fab.addEventListener('pointerup', onFabUp);
    // os cliques dentro da Sobrevida não chegam ao jogo (o jogo lê toque/clique para andar)
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) root.querySelector('.w').addEventListener(ev, (e) => e.stopPropagation(), { passive: ev === 'wheel' || ev === 'touchstart' });
    return root;
  }
  const showEl = (el) => { el._n = (el._n || 0) + 1; el.hidden = false; requestAnimationFrame(() => el.classList.add('on')); };
  const hideEl = (el) => { el._n = 0; el.classList.remove('on'); clearTimeout(el._t); el._t = setTimeout(() => { if (!el._n) el.hidden = true; }, 200); };
  const isOpen = (sel) => { const el = root && root.querySelector(sel); return !!el && !el.hidden && el.classList.contains('on'); };

  // ───────────────────────── sprites do próprio jogo (assets/pokemon/{dex}/Idle.png), animados ─────────────────────────
  const imgs = {};
  const sheet = (dex) => { if (!imgs[dex]) { const im = new Image(); im.src = `${location.origin}/assets/pokemon/${dex}/Idle.png`; imgs[dex] = im; } return imgs[dex]; };
  const canvases = new Set();
  const metaExtra = {}; // folha Idle de Pokémon fora dos 29 iniciais (o piloto manda a do parceiro)
  const metaDe = (dex) => { const s = byDex(dex); return s ? s.idle : metaExtra[dex] || null; };
  // área com pixels de verdade na folha (união de todos os quadros da linha de baixo): os quadros dos Pokémon
  // grandes têm muita borda vazia; recortando, o desenho cabe no quadro sem ficar minúsculo
  const caixas = {};
  function caixa(dex, im, fw, fh, n) {
    if (caixas[dex]) return caixas[dex];
    let b = { x: 0, y: 0, w: fw, h: fh };
    try {
      const k = document.createElement('canvas'); k.width = fw * n; k.height = fh;
      const g = k.getContext('2d'); g.drawImage(im, 0, 0, fw * n, fh, 0, 0, fw * n, fh);
      const d = g.getImageData(0, 0, fw * n, fh).data;
      let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw * n; x++) if (d[(y * fw * n + x) * 4 + 3] > 8) { const lx = x % fw; if (lx < x0) x0 = lx; if (lx > x1) x1 = lx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= x0 && y1 >= y0) b = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (_) {}
    return (caixas[dex] = b);
  }
  function spriteCanvas(dex, w, h, scale) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h; c._dex = dex; c._scale = scale; c._t0 = performance.now() + Math.random() * 400;
    canvases.add(c);
    sheet(dex);
    return c;
  }
  let raf = 0;
  function desenhar(now) {
    raf = 0;
    if (dead) return;
    let any = false;
    for (const c of canvases) {
      if (!c.isConnected) { canvases.delete(c); continue; }
      any = true;
      const meta = metaDe(c._dex), im = imgs[c._dex];
      if (!meta || !im || !im.complete || !im.naturalWidth) continue;
      const [fw, fh, n, dur] = meta, tot = dur.reduce((a, b) => a + b, 0) * (1000 / 60);
      let t = (now - c._t0) % tot, f = 0;
      for (; f < n - 1; f++) { t -= dur[f] * (1000 / 60); if (t < 0) break; }
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      // cabe no quadro: Pokémon grandes (Yveltal 80×96) encolhem; escala inteira quando dá, para o pixel art não borrar
      const b = caixa(c._dex, im, fw, fh, n);
      const fit = Math.min((c.width - 4) / b.w, (c.height - 4) / b.h);
      const sc = c._scale <= fit ? c._scale : fit >= 1 ? Math.floor(fit) : fit, dw = Math.round(b.w * sc), dh = Math.round(b.h * sc);
      ctx.drawImage(im, f * fw + b.x, b.y, b.w, b.h, Math.round((c.width - dw) / 2), Math.round((c.height - dh) / 2), dw, dh);
    }
    if (any) raf = requestAnimationFrame(desenhar);
  }
  const animar = () => { if (!raf) raf = requestAnimationFrame(desenhar); };

  const corTipo = (t) => D.corTipo[t] || '#5b83d6';
  const chips = (types) => types.map((t) => `<span class="chip" style="background:${corTipo(t)}">${esc(L().ty[t] || t)}</span>`).join(' ');

  // ───────────────────────── escolha do parceiro (menu flutuante) ─────────────────────────
  let sel = null, pickModo = null, pickAuto = false, abriuNoCriar = false;
  function abrirPicker(modo) {
    ui();
    pickModo = modo || (vis('scr-login') ? 'side' : 'mid');
    sel = alvo || (BEST && BEST.dex);
    renderPicker();
    showEl(root.querySelector('.pick'));
    fecharMenu();
  }
  function fecharPicker() { if (root && !root.querySelector('.pick').hidden) hideEl(root.querySelector('.pick')); pickAuto = false; }
  function statBar(lbl, val, txt, min, max) {
    const p = Math.max(6, Math.min(100, ((val - min) / (max - min)) * 100));
    return `<div class="stat"><span>${esc(lbl)}</span><div class="tr"><i style="width:${p.toFixed(0)}%"></i></div><em>${esc(txt)}</em></div>`;
  }
  function renderInfo() {
    const T = L(), s = byDex(sel), box = root.querySelector('.pick .info');
    if (!s) { box.innerHTML = `<p class="note">${esc(T.none)}</p>`; return; }
    const tw = s.twin && byDex(s.twin);
    box.innerHTML = `<div class="stg"></div><h3>${s.dex === D.melhor ? '⭐ ' : ''}${esc(s.name)}</h3>
      <div class="tags">${chips(s.types)}</div>
      <div class="kv">${esc(T.start)}: <b>${esc(T.mv[s.move] || s.move)}</b></div>
      <div class="kv">${esc(T.traitsL)}: <b>${s.traits.map((x) => esc(T.tr[x] || x)).join(', ')}</b></div>
      ${statBar(T.st.hp, s.hp, s.hp, 80, 112)}
      ${statBar(T.st.atk, s.pa, '×' + s.pa.toFixed(2), 0.88, 1.1)}
      ${statBar(T.st.sa, s.sa, '×' + s.sa.toFixed(2), 0.88, 1.1)}
      ${statBar(T.st.spd, s.spd, s.spd, 80, 110)}
      ${statBar(T.st.def, (s.df + s.sd) / 2, `${s.df}/${s.sd}`, 35, 66)}
      <div class="kv">${esc(T.record(s.lb[0]))} · ${esc(T.median(s.lb[2]))}</div>
      ${tw ? `<p class="warn">${esc(T.twin(tw.name))}</p>` : ''}
      ${s.dex === D.melhor ? `<p class="note"><b class="gold">${esc(T.whyTitle(s.name))}</b> ${esc(T.why(s.name, s.lb[0], s.lb[2]))}</p>` : ''}`;
    const st = spriteCanvas(s.dex, pickModo === 'side' ? 110 : 150, pickModo === 'side' ? 88 : 120, pickModo === 'side' ? 2 : 3);
    st.className = 'stage';
    st.style.setProperty('--cc', corTipo(s.types[0]));
    box.querySelector('.stg').replaceWith(st);
    animar();
    const go = root.querySelector('.pick .go');
    if (go) go.textContent = alvo === s.dex ? T.chosen(s.name) : T.choose(s.name);
  }
  function renderPicker() {
    const T = L(), p = root.querySelector('.pick');
    p.className = `pick box pop ${pickModo}${p.classList.contains('on') ? ' on' : ''}`;
    p.innerHTML = `<div class="hd"><span class="ic">${ICO.heart}</span><span class="t"><b>${esc(T.pickTitle)}</b><small>Sobrevida · PokéSurvivor</small></span>
        <button class="x" type="button" title="${esc(T.close)}" aria-label="${esc(T.close)}">${ICO.x}</button></div>
      <p class="sub">${esc(vis('scr-menu') ? T.hasPartner : T.pickSub)}</p>
      <div class="body"><div class="grid" role="listbox"></div><div class="info"></div></div>
      <div class="acts"><span class="grow">${langsHtml()}</span>
        ${vis('scr-test') ? `<button class="btn ghost manual" type="button">${esc(T.manual)}</button>` : ''}
        <button class="btn gold go" type="button"></button></div>`;
    const grid = p.querySelector('.grid');
    for (const s of D.starters) {
      const c = document.createElement('div');
      c.className = 'cell' + (s.dex === sel ? ' on' : '');
      c.setAttribute('role', 'option');
      c.title = s.name;
      c.appendChild(spriteCanvas(s.dex, 64, 56, 1.5));
      c.insertAdjacentHTML('beforeend', `${s.dex === D.melhor ? '<span class="star">⭐</span>' : ''}<b>${esc(s.name)}</b><span class="ty">${s.types.map((t) => `<i style="background:${corTipo(t)}"></i>`).join('')}</span>`);
      c.addEventListener('click', () => { sel = s.dex; for (const x of grid.querySelectorAll('.cell')) x.classList.toggle('on', x === c); renderInfo(); });
      c.addEventListener('dblclick', () => { sel = s.dex; confirmar(); });
      grid.appendChild(c);
    }
    p.querySelector('.x').addEventListener('click', fecharPicker);
    p.querySelector('.go').addEventListener('click', confirmar);
    const m = p.querySelector('.manual'); if (m) m.addEventListener('click', () => { S.auto = false; SYNC.set({ auto: false }).catch(() => {}); fecharPicker(); status(); });
    wireLangs(p, () => { renderPicker(); });
    renderInfo();
    animar();
    const on = grid.querySelector('.cell.on'); if (on) setTimeout(() => on.scrollIntoView({ block: 'nearest' }), 30);
  }
  async function confirmar() {
    if (!sel) return;
    alvo = sel;
    try { await ext.storage.local.set({ 'sv.alvo': alvo }); } catch (_) {}
    if (!S.auto) { S.auto = true; SYNC.set({ auto: true }).catch(() => {}); }
    registrar({ type: 'alvo', ok: true, dex: alvo });
    fecharPicker();
    toast(L().chosen(byDex(alvo).name), true);
    status();
    tick();
  }

  // ───────────────────────── menu da Sobrevida (botão de coração) ─────────────────────────
  let menuOpen = false, chkMsg = '';
  function abrirMenu() { ui(); menuOpen = true; renderMenu(); showEl(root.querySelector('.menu')); placeMenu(); }
  function fecharMenu() { if (!root || !menuOpen) return; menuOpen = false; hideEl(root.querySelector('.menu')); }
  const toggleMenu = () => (menuOpen ? fecharMenu() : abrirMenu());
  function renderMenu() {
    const T = L(), m = root.querySelector('.menu'), s = byDex(alvo);
    const temParceiro = vis('scr-menu');
    m.innerHTML = `<div class="hd"><span class="ic">${ICO.heart}</span><span class="t"><b>Sobrevida</b><small>PokéSurvivor</small></span>
        <button class="lk help" type="button" title="${esc(T.help)}">?</button>
        <button class="x" type="button" title="${esc(T.close)}" aria-label="${esc(T.close)}">${ICO.x}</button></div>
      <div class="sec farm"></div>
      <div class="sec ini"${pst && pst.ok && pst.partner ? ' hidden' : ''}><h4>${esc(T.sec.partner)}</h4>
        <div class="cur">${s ? '<span class="cv"></span>' : ''}<div class="nm">${s ? `<b>${s.dex === D.melhor ? '⭐ ' : ''}${esc(s.name)}</b><div>${chips(s.types)}</div>` : `<span class="note">${esc(T.none)}</span>`}</div>
          <button class="btn sm ${s ? '' : 'gold'} trocar" type="button">${esc(s ? T.change : T.pickTitle)}</button></div>
        <label class="sw"><input type="checkbox" class="auto"${S.auto ? ' checked' : ''}> ${esc(T.autoOn)}</label>
        ${S.auto ? '' : `<p class="note">${esc(T.autoHint)}</p>`}
        ${temParceiro ? `<p class="note">${esc(T.hasPartner)}</p>` : ''}
        ${pausado() ? `<p class="warn">${esc(T.pausedUrg)}</p>` : ''}
        ${run ? `<div class="row"><span class="note">${esc(statusTxt())}</span><button class="btn sm ghost stop" type="button">${esc(T.stop)}</button></div>` : ''}</div>
      ${chkMsg ? `<p class="chk">${esc(chkMsg)}</p>` : ''}
      <div class="ft"><div class="links"><button class="lk bug" type="button">${esc(T.bug)}</button><button class="lk chkb" type="button">${esc(T.check)}</button><button class="lk nov" type="button">${esc(T.news)}</button></div>
        ${langsHtml()}
        <span class="sig">${esc(T.madeBy)} <a href="https://github.com/DredsGG" target="_blank" rel="noopener noreferrer">Dreds</a> · v${esc(VERSION)}</span></div>`;
    if (s) { const c = spriteCanvas(s.dex, 64, 64, 2); c.style.setProperty('--cc', corTipo(s.types[0])); m.querySelector('.cv').replaceWith(c); animar(); }
    farmCanvas = null; farmSig = ''; renderFarm();   // a seção acabou de ser recriada vazia: redesenha sempre
    m.querySelector('.x').addEventListener('click', fecharMenu);
    m.querySelector('.help').addEventListener('click', () => { fecharMenu(); tutorial(); });
    m.querySelector('.trocar').addEventListener('click', () => abrirPicker());
    m.querySelector('.auto').addEventListener('change', (e) => { S.auto = e.target.checked; SYNC.set({ auto: S.auto }).catch(() => {}); if (!S.auto && run) pararTeste(); renderMenu(); placeMenu(); });
    const st = m.querySelector('.stop'); if (st) st.addEventListener('click', () => { pararTeste(); renderMenu(); });
    m.querySelector('.bug').addEventListener('click', abrirRelato);
    m.querySelector('.nov').addEventListener('click', () => { fecharMenu(); newsFrom = ''; news(true); });
    m.querySelector('.chkb').addEventListener('click', async () => {
      chkMsg = L().chk.busy; renderMenu(); placeMenu();
      const r = (await updCmd('check')) || {};
      upd = r; chkMsg = r.erro ? L().chk.err : r.semRelease ? L().chk.nr : r.disponivel ? L().chk.new(r.ultima) : L().chk.none;
      if (menuOpen) { renderMenu(); placeMenu(); }
      if (r.disponivel) { adiado = null; maybeUpdate(); }
    });
    wireLangs(m, () => { renderMenu(); placeMenu(); });
  }
  function placeMenu() {
    if (!root || !menuOpen) return;
    const fb = root.querySelector('.fab'), m = root.querySelector('.menu'), f = (fb.hidden ? root.querySelector('.pill') : fb).getBoundingClientRect();
    const w = m.offsetWidth || 340, h = m.offsetHeight || 300;
    let left = Math.min(Math.max(12, f.left), innerWidth - w - 12);
    let top = f.top - h - 12; if (top < 12) top = Math.min(f.bottom + 12, innerHeight - h - 12);
    m.style.left = left + 'px'; m.style.top = Math.max(12, top) + 'px';
  }

  // botão de coração: clique abre o menu; arrastando, muda de lugar (posição salva)
  let fabPos = null, drag = null;
  function placeFab() {
    if (!root) return;
    const f = root.querySelector('.fab');
    if (fabPos) { f.style.left = Math.min(Math.max(6, fabPos.l), innerWidth - 54) + 'px'; f.style.top = Math.min(Math.max(6, fabPos.t), innerHeight - 54) + 'px'; f.style.bottom = 'auto'; }
  }
  function onFabDown(e) { if (e.button !== 0) return; const f = root.querySelector('.fab'); drag = { x: e.clientX, y: e.clientY, moved: false, r0: f.getBoundingClientRect() }; f.setPointerCapture && f.setPointerCapture(e.pointerId); }
  function onFabMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    fabPos = { l: Math.round(drag.r0.left + dx), t: Math.round(drag.r0.top + dy) };
    placeFab(); placeMenu();
  }
  function onFabUp() {
    if (!drag) return;
    const moved = drag.moved; drag = null;
    if (moved) { try { ext.storage.local.set({ 'sv.fab': fabPos }); } catch (_) {} return; }
    toggleMenu();
  }

  // ───────────────────────── farm automático (v0.2.0) ─────────────────────────
  // O piloto (src/piloto.js, mundo da página) joga e cuida da rotina; aqui ficam a configuração, a ponte e o painel.
  const FARM_DEF = { on: false, upgrades: true, gacha: true, partner: true, missions: true, skins: true };
  let farm = Object.assign({}, FARM_DEF), pst = null, pstAt = 0, farmCanvas = null, farmSig = '';
  const mmss = I.mmss;
  function mandarCfg() {
    try { document.dispatchEvent(new CustomEvent('sobrevida:cfg', { detail: JSON.stringify(Object.assign({}, farm, { on: !!farm.on && dono && !pausado() })) })); } catch (_) {}
  }
  // uma aba só joga por vez (duas abas na mesma conta brigariam pelo save): a aba "dona" renova a posse a cada 3 s;
  // se ela fechar, outra assume em até 10 s
  let dono = false;
  const INICIO = Date.now();
  async function vigiaDono() {
    if (dead) return;
    try {
      const d = (await ext.storage.local.get('sv.dono'))['sv.dono'];
      if (!farm.on) {
        if (d && d.id === PAGE_ID) await ext.storage.local.remove('sv.dono');
        if (dono) { dono = false; mandarCfg(); }
        return;
      }
      const livre = !d || d.id === PAGE_ID || Date.now() - d.at > 10000;
      if (livre) await ext.storage.local.set({ 'sv.dono': { id: PAGE_ID, at: Date.now() } });
      if (livre !== dono) { dono = livre; mandarCfg(); farmSig = ''; renderFarm(); }
    } catch (_) {}
  }
  addEventListener('pagehide', () => { if (dono) try { ext.storage.local.remove('sv.dono'); } catch (_) {} });
  // a parte que joga (src/piloto.js) só entra quando a página carrega: depois de atualizar a Sobrevida com a aba aberta,
  // ela não está aqui e é preciso recarregar a página
  const semPiloto = () => !pst && Date.now() - INICIO > 8000 && !!document.getElementById('scr-menu');
  const onSt = (e) => {
    try { pst = JSON.parse(e.detail); pstAt = Date.now(); if (pst && pst.partner && pst.partner.meta) metaExtra[pst.partner.dex] = pst.partner.meta; } catch (_) {}
  };
  document.addEventListener('sobrevida:st', onSt);
  async function setFarm(patch) {
    Object.assign(farm, patch);
    try { await ext.storage.local.set({ 'sv.farm': farm }); } catch (_) {}
    if ('on' in patch) await vigiaDono();
    mandarCfg();
    if ('on' in patch) { registrar({ type: patch.on ? 'farm-on' : 'farm-off', ok: true }); toast(patch.on ? L().f.onToast : L().f.offToast, patch.on); }
    farmSig = ''; renderFarm(); pill();
  }
  const pronto = () => pst && pst.ok && Date.now() - pstAt < 5000;
  function farmStatus() {
    const T = L().f;
    if (semPiloto()) return { t: T.reload, w: true, reload: true };
    if (!pronto()) return { t: pst && pst.ok === false && pst.err === 'namespace' ? T.broken : T.waiting, w: !!(pst && pst.ok === false) };
    if (!farm.on) return { t: T.off };
    if (!dono) return { t: T.otherTab, w: true };
    if (pausado()) return { t: L().pausedUrg, w: true };
    if (pst.coop && !pst.coopOk) return { t: T.coopLate, w: true };
    if (pst.party && !pst.run) return { t: T.party };
    if (pst.hidden) return { t: T.hidden, w: true };
    if (pst.userPaused) return { t: T.userPaused, w: true };
    if (pst.fps != null && pst.fps < 15) return { t: T.slow(pst.fps), w: true };
    if (pst.task) return { t: T.task[pst.task] || pst.task };
    if (pst.run) return { t: `${T.mode[pst.mode] || T.mode.idle} · ${mmss(pst.run.t)} · ${T.lv} ${pst.run.lv} · ♥ ${pst.run.hp}/${pst.run.max}` };
    return { t: T.menu };
  }
  const nGen = (g) => ['', 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea', L().f.spooky][g] || ('Gen ' + g);
  function actTxt(a) {
    const T = L().f, x = a.a || {};
    switch (a.k) {
      case 'run': return T.aRun(mmss(x.t), x.lv, x.c, (x.t1 || 0) + (x.t10 || 0) * 10);
      case 'missions': return T.aMissions(x.n);
      case 'gacha': return T.aGacha(nGen(x.gen), x.n, x.nn, x.sh, (x.novos || []).join(', '));
      case 'partner': return T.aPartner(x.deN, x.paraN);
      case 'upgrades': return T.aUpgrades(x.n, x.nome);
      case 'skins': return T.aSkins(x.n);
      case 'save': return T.aSave;
      default: return a.k;
    }
  }
  const fmt = (n) => Number(n || 0).toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR');
  function renderFarm() {
    if (!root || !menuOpen) return;
    const box = root.querySelector('.menu .farm');
    if (!box) return;
    const T = L(), F = T.f, st = farmStatus(), p = pronto() ? pst : null, ss = p && p.sess;
    const horas = ss && ss.start ? Math.max(1 / 60, (Date.now() - ss.start) / 3600000) : 0;
    const pr = p && p.partner;
    const pct = pr && pr.total ? Math.round((pr.have / pr.total) * 100) : 0;
    const sig = JSON.stringify([lang, farm, st, pr, ss, p && p.acts && p.acts.map((a) => a.t), p && p.owned, p && p.maxed, p && p.guest, p && p.hw]);
    if (sig === farmSig) return;
    farmSig = sig;
    box.innerHTML = `<h4>${esc(F.title)}</h4>
      <div class="row"><button class="btn ${farm.on ? 'ghost' : 'gold'} fgo" type="button"${pausado() ? ' disabled' : ''}>${esc(farm.on ? F.stop : F.start)}</button><span class="note">Alt+F</span></div>
      <p class="fst${st.w ? ' w' : ''}">${esc(st.t)}</p>
      ${st.reload ? `<button class="btn gold sm frl" type="button">${esc(F.reloadBtn)}</button>` : ''}
      ${p && p.guest ? `<p class="warn">${esc(F.guest)}</p>` : ''}
      ${pr ? `<div class="cur"><span class="cvf"></span><div class="nm"><b>${esc(pr.name)}</b>
        <div class="pbar"><i style="width:${pct}%"></i></div><small>${esc(F.prog(pr.have, pr.total, pct))}</small><br><small>${esc(F.col(p.owned, p.maxed))}</small></div></div>` : ''}
      ${ss && ss.start ? `<div class="kv">${esc(F.sess(ss.runs, fmt(ss.coins), fmt(Math.round(ss.coins / horas)), ss.t1 + ss.t10 * 10, ss.best ? mmss(ss.best) : '—'))}${p.hw ? ' · ' + esc(F.candy(ss.candy)) : ''}</div>` : ''}
      ${p && p.acts && p.acts.length ? `<div class="acts">${p.acts.slice(0, 4).map((a) => `<div>· ${esc(actTxt(a))}</div>`).join('')}</div>` : ''}
      <details class="fopts"${farmOptsOpen ? ' open' : ''}><summary>${esc(F.opts)}</summary><div class="opts">
        ${['upgrades', 'gacha', 'partner', 'missions', 'skins'].map((k) => `<label class="sw"><input type="checkbox" data-f="${k}"${farm[k] ? ' checked' : ''}> ${esc(F.opt[k])}</label>`).join('')}
      </div></details>
      <p class="note">${esc(F.rank)}</p>`;
    if (pr) {
      if (!farmCanvas || farmCanvas._dex !== pr.dex) { farmCanvas = spriteCanvas(pr.dex, 64, 64, 2); farmCanvas.style.setProperty('--cc', corTipo((pr.types || [])[0])); }
      box.querySelector('.cvf').replaceWith(farmCanvas); animar();
    }
    box.querySelector('.fgo').addEventListener('click', () => setFarm({ on: !farm.on }));
    const rl = box.querySelector('.frl'); if (rl) rl.addEventListener('click', () => location.reload());
    box.querySelector('.fopts').addEventListener('toggle', (e) => { farmOptsOpen = e.target.open; placeMenu(); });
    for (const i of box.querySelectorAll('[data-f]')) i.addEventListener('change', () => setFarm({ [i.dataset.f]: i.checked }));
    placeMenu();
  }
  let farmOptsOpen = false;
  // pílula no canto quando o farm está ligado e o botão de coração não aparece (partida, gacha, melhorias...)
  function pill() {
    if (!root) return;
    const el = root.querySelector('.pill'), fab = root.querySelector('.fab');
    // 0.2.5: na partida a pílula aparece sempre (o coração some): com o farm desligado ela é o jeito de abrir o menu
    // e de ligar o farm no meio da partida
    const show = fab.hidden;
    if (!show) { if (!el.hidden) el.hidden = true; return; }
    const st = farm.on ? farmStatus() : { t: L().f.offShort };
    // monta uma vez (por idioma) e depois só troca o texto: o clique não pode cair num elemento que acabou de ser trocado
    if (el._lang !== lang) {
      el._lang = lang; el._on = null;
      el.innerHTML = `${ICO.heart}<span></span><button class="btn sm ghost" type="button"></button>`;
      el.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); setFarm({ on: !farm.on }); });
      el.addEventListener('click', (e) => { if (e.target.closest('button')) return; if (menuOpen) fecharMenu(); else abrirMenu(); });
    }
    if (el._on !== farm.on) {
      el._on = farm.on;
      const bt = el.querySelector('button');
      bt.textContent = farm.on ? `■ ${L().f.stop}` : `▶ ${L().f.startShort}`;
      bt.className = `btn sm ${farm.on ? 'ghost' : 'gold'}`;
    }
    const txt = `${L().f.short} · ${st.t}`;
    if (el._txt !== txt) { el._txt = txt; el.querySelector('span').textContent = txt; }
    if (el.hidden) el.hidden = false;
  }

  // ───────────────────────── status e avisos ─────────────────────────
  function statusTxt() {
    const T = L(), s = run && byDex(run.dex);
    if (!s) return '';
    return run.fase === 'grade' ? T.picking(s.name) : T.running(s.name, Math.min(run.i || 1, run.total), run.total);
  }
  function status() {
    if (!root) ui();
    const b = root.querySelector('.bar');
    if (run) {
      const s = byDex(run.dex);
      // monta a faixa uma vez por rodada e depois só troca o texto (o botão Parar não pode sumir debaixo do clique)
      if (b._run !== run || b._lang !== lang) {
        b._run = run; b._lang = lang;
        b.innerHTML = `<span class="cv"></span><b></b><button class="btn sm ghost stop" type="button">${esc(L().stop)}</button>`;
        const c = spriteCanvas(s.dex, 40, 40, 1); b.querySelector('.cv').replaceWith(c); animar();
        b.querySelector('.stop').addEventListener('click', pararTeste);
      }
      b.querySelector('b').textContent = statusTxt();
      if (b.hidden || !b.classList.contains('on')) showEl(b);
    } else if (!b.hidden) { b._run = null; hideEl(b); }
    if (menuOpen) { renderMenu(); placeMenu(); }
  }
  let toastT = 0;
  function toast(msg, ok) {
    ui();
    const t = root.querySelector('.toast');
    t.textContent = msg; t.classList.toggle('ok', !!ok);
    showEl(t); clearTimeout(toastT); toastT = setTimeout(() => hideEl(t), 3800);
  }

  // ───────────────────────── idiomas ─────────────────────────
  function langsHtml() {
    return `<span class="langs" role="radiogroup" aria-label="${esc(L().lang)}">${I.LANGS.map((l) => `<button type="button" data-l="${l}" role="radio" aria-checked="${lang === l}" class="${lang === l ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</span>`;
  }
  function wireLangs(el, redraw) {
    for (const b of el.querySelectorAll('.langs button')) b.addEventListener('click', async () => {
      lang = b.dataset.l;
      try { await SYNC.set({ lang }); } catch (_) {}
      redraw();
    });
  }

  // ───────────────────────── quadros no meio da tela (tutorial, novidades, versão nova) ─────────────────────────
  // Regras 12 e 14 do hub: procura sozinha (ao abrir, a cada 30 min pelo fundo e ao voltar para a aba, no máximo 1 vez a cada
  // 10 min); versão nova aparece na hora; o X só adia 1 h (nesta página; noutra abertura volta); "URGENTE" no título do
  // Release: quadro sem X e a Sobrevida pausa até atualizar.
  const PAGE_ID = Math.random().toString(36).slice(2);
  const ADIA_MS = 60 * 60 * 1000;
  let open = null, step = 0, newsFrom = '', upd = {}, adiado = null, updBusy = false, updDone = null, ready = false;
  const card = () => ui().querySelector('.card');
  const cmpVer = (a, b) => { const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
  const urgente = () => !!(upd.disponivel && upd.urgente && upd.ultima && cmpVer(upd.ultima, VERSION) > 0);
  const adiadoAqui = () => !!(adiado && adiado.pagina === PAGE_ID && adiado.ultima === upd.ultima && adiado.ate > Date.now());
  function head(icon, kick, title, sub, noX) {
    return `<div class="hd"><span class="ic" style="font-size:24px;display:grid;place-items:center">${icon}</span><span class="t"><small>${esc(kick)}</small><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      ${noX ? '' : `<button class="x" type="button" title="${esc(L().close)}" aria-label="${esc(L().close)}">${ICO.x}</button>`}</div>`;
  }
  function wireCard(c, redraw) {
    const x = c.querySelector('.x'); if (x) x.addEventListener('click', () => closeCard(true));
    wireLangs(c, redraw);
  }
  function paint(c) { if (c.hidden || !c.classList.contains('on')) showEl(c); }
  async function marcarNovLidas() {
    try { const ob = (await ext.storage.local.get('sv.onboard'))['sv.onboard'] || {}; await ext.storage.local.set({ 'sv.onboard': Object.assign({}, ob, { novLidas: BASE }) }); } catch (_) {}
  }
  const visivel = () => new Promise((ok) => {
    if (document.visibilityState === 'visible') return ok();
    const f = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); ok(); } };
    document.addEventListener('visibilitychange', f);
  });
  function closeCard(byX) {
    if (!root || !open) return;
    const was = open;
    if (was === 'news') marcarNovLidas();
    if (was === 'update' && urgente()) return; // urgente: não fecha
    hideEl(card());
    open = null;
    if (was === 'update') {
      adiado = { ultima: upd.ultima, ate: Date.now() + ADIA_MS, pagina: PAGE_ID };
      try { ext.storage.local.set({ 'sv.adiado': adiado }); } catch (_) {}
    } else setTimeout(() => { maybeUpdate(); if (was === 'tutorial') tick(); }, 400);
  }
  function renderTutorial() {
    const T = L(), n = T.steps.length, [h, p] = T.steps[step], last = step === n - 1, c = card();
    c.setAttribute('aria-label', T.tutTitle);
    c.innerHTML = `${head(ICO.heart, 'Sobrevida', T.tutTitle, T.step(step + 1, n))}
      <div class="bd"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>
      <div class="cf"><span class="dots">${T.steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</span>${langsHtml()}</div>
      <div class="acts">${last ? '' : `<button class="lk skip" type="button">${esc(T.skip)}</button>`}
        ${step ? `<button class="btn ghost back" type="button">${esc(T.back)}</button>` : ''}
        <button class="btn gold go" type="button">${esc(last ? T.ok : T.nextBtn)}</button></div>`;
    wireCard(c, renderTutorial);
    const sk = c.querySelector('.skip'); if (sk) sk.addEventListener('click', () => closeCard(false));
    const bk = c.querySelector('.back'); if (bk) bk.addEventListener('click', () => { step--; renderTutorial(); });
    c.querySelector('.go').addEventListener('click', () => { if (last) closeCard(false); else { step++; renderTutorial(); } });
  }
  function tutorial() { if (urgente()) return; fecharPicker(); open = 'tutorial'; step = 0; renderTutorial(); paint(card()); }
  const baseVer = (v) => String(v || '').split('.').slice(0, 3).join('.');
  const BASE = baseVer(VERSION);
  const versaoAnterior = (v) => Object.keys(NOV.en || NOV.pt || {}).filter((x) => cmpVer(x, v) < 0).sort((a, b) => cmpVer(b, a))[0] || '';
  const itensDe = (from, to) => {
    const N = NOV[lang] || NOV.en || {};
    const vs = Object.keys(N).filter((x) => cmpVer(x, to) <= 0 && (!from || cmpVer(x, from) > 0)).sort((a, b) => cmpVer(b, a));
    return [].concat(...vs.map((x) => N[x] || [])).slice(0, 8);
  };
  function news() {
    const items = itensDe(newsFrom, VERSION);
    if (!items.length || urgente()) return;
    open = 'news';
    const T = L(), c = card();
    c.setAttribute('aria-label', T.newsTitle(BASE));
    c.innerHTML = `${head('⭐', 'Sobrevida', T.newsTitle(BASE))}<div class="bd"><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="cf"><span class="dots"></span>${langsHtml()}</div><div class="acts"><button class="btn gold go" type="button">${esc(T.ok)}</button></div>`;
    wireCard(c, news);
    c.querySelector('.go').addEventListener('click', () => closeCard(false));
    paint(c);
  }
  const updCmd = (cmd, data) => new Promise((ok) => {
    try { ext.runtime.sendMessage({ type: 'sobrevida:update', cmd, data }).then(ok, () => ok(null)); } catch (_) { ok(null); }
  });
  const noteItems = (md) => String(md || '').split(/\r?\n/).filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/^\s*(#+|[-*+]|\d+\.)\s*/, '').replace(/[*_`]/g, '').trim())
    .filter((l) => l && !/^(install|download|works on|chrome, edge|firefox 1|open .?chrome|drag the zip)/i.test(l))
    .slice(0, 4);
  function updateCard() {
    open = 'update';
    const T = L(), c = card(), items = noteItems(upd.notas), urg = urgente();
    const note = updDone === 'xpi' || (updDone && IS_FF) ? T.updXpi : updDone === 'loja' ? T.updStore : updDone ? T.updZip : '';
    c.setAttribute('aria-label', urg ? T.urgTitle(upd.ultima) : T.updTitle(upd.ultima));
    c.innerHTML = `${head(urg ? ICO.alert : ICO.gift, urg ? T.urgKick : 'Sobrevida', urg ? T.urgTitle(upd.ultima) : T.updTitle(upd.ultima), `v${VERSION} → v${upd.ultima}`, urg)}
      <div class="bd">${urg ? `<span class="warnb">${esc(T.urgPaused)}</span><p>${esc(T.urgSub)}</p>` : ''}
        ${items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${note ? `<div class="nt">${esc(note)}</div>` : ''}</div>
      <div class="cf"><span class="dots"></span>${langsHtml()}</div>
      <div class="acts"><button class="lk how" type="button">${esc(T.updHow)}</button>
        <button class="btn gold go" type="button"${updBusy ? ' disabled' : ''}>${esc(updBusy ? '…' : T.updGo)}</button></div>`;
    wireCard(c, updateCard);
    c.querySelector('.how').addEventListener('click', () => updCmd('guide', '#atualizar'));
    c.querySelector('.go').addEventListener('click', async () => {
      updBusy = true; updateCard();
      const r = await updCmd('apply');
      updBusy = false; updDone = (r && r.modo) || 'download';
      if (open === 'update') updateCard();
    });
    paint(c);
  }
  function maybeUpdate() {
    if (!ready || dead) return;
    const tem = upd.disponivel && upd.ultima && cmpVer(upd.ultima, VERSION) > 0;
    if (!tem) { if (open === 'update') { open = null; hideEl(card()); } return; }
    if (urgente()) { mandarCfg(); if (open !== 'update') { if (run) pararTeste(); updateCard(); } return; }
    if (open || adiadoAqui()) return;
    updateCard();
  }

  // "Relatar bug": abre o relato nos Issues do repo com a versão e um diagnóstico sem dado pessoal (regra 9)
  function navegador() {
    const ua = navigator.userAgent, m = ua.match(/(Firefox|Edg|OPR|Chrome)\/(\d+)/);
    const nome = !m ? 'unknown' : m[1] === 'Edg' ? 'Edge' : m[1] === 'OPR' ? 'Opera' : (m[1] === 'Chrome' && navigator.brave) ? 'Brave' : m[1];
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'other';
    return `${nome} ${m ? m[2] : ''} · ${os}`;
  }
  async function abrirRelato() {
    const T = L();
    let loc = {};
    try { loc = await ext.storage.local.get(['sv.log', 'sv.update', 'sv.disco']); } catch (_) {}
    const diag = (await updCmd('diag')) || {};
    const agora = Date.now();
    const log = (loc['sv.log'] || []).map((e) => `- ${Math.round((agora - e.em) / 60000)} min: ${e.type} ${e.ok ? 'ok' : 'FAIL'} ${e.dex || ''}${e.mudou ? ' changed' : ''}${e.err ? ' ' + e.err : ''}`).join('\n') || '- (empty)';
    const u = loc['sv.update'] || {};
    const testeOk = !!(byId('scr-test') && byId('test-a') && byId('test-count') && byId('res-name') && byId('res-ok') && byId('res-other') && byId('starter-grid') && byId('starter-ok'));
    const txt = [`Sobrevida v${VERSION}`, `Browser: ${navegador()}`, `Install: ${diag.instalacao || '?'}`, `UI: ${lang} / ${navigator.language}`,
      `Settings: auto=${S.auto ? 1 : 0} target=${alvo || '-'}`, `Game: screen=${tela() || '-'} quizDom=${testeOk ? 'ok' : 'MISSING'} path=${location.pathname}`,
      `Update check: latest=${u.ultima || '-'} err=${u.erro || '-'}`,
      loc['sv.disco'] ? `Disk: ${loc['sv.disco'].estado || '-'} (${loc['sv.disco'].noDisco || '-'})` : null, '', 'Last events:', log].filter((x) => x !== null).join('\n');
    const body = `${T.bugBody}\n---\n\`\`\`\n${txt}\n\`\`\``;
    window.open(`https://github.com/DredsGG/sobrevida/issues/new?title=${encodeURIComponent(T.bugTitle)}&body=${encodeURIComponent(body)}&labels=bug`, '_blank', 'noopener');
  }

  // ───────────────────────── laço: olha a tela do jogo ─────────────────────────
  let ultimaTela = null, testeVisto = false;
  function tick() {
    tick.n = tick.n || 0;
    if (dead || !alive()) return;
    ui();
    const t = tela();
    const fab = root.querySelector('.fab');
    // o botão só aparece fora da partida (nas telas de entrar, teste, escolha e menu); durante a run fica escondido
    const fora = !!t;
    if (fab.hidden === fora) { fab.hidden = !fora; if (fora) placeFab(); }
    root.querySelector('.fab .dot').hidden = !(upd.disponivel && upd.ultima && cmpVer(upd.ultima, VERSION) > 0);
    if (!fora) { if (!run) fecharPicker(); }       // o menu pode ficar aberto na partida (pela pílula), com o farm ligado ou não
    pill();
    const naRun = !!(pst && pst.ok && pst.run);
    if (naRun && !tick.naRun && farm.on && menuOpen) fecharMenu();
    tick.naRun = naRun;
    if (menuOpen && tick.n++ % 4 === 0) { renderFarm(); const ini = root.querySelector('.menu .ini'); if (ini) ini.hidden = !!(pst && pst.ok && pst.partner); }
    if (t !== ultimaTela) {
      if (t === 'scr-test') testeVisto = false;
      ultimaTela = t;
      if (menuOpen) { renderMenu(); placeMenu(); }
    }
    if (open === 'tutorial' || !ready) return; // primeiro o tutorial
    // tela de criar conta: abre o menu de parceiro do lado (uma vez por página), para escolher antes do teste
    if (t === 'scr-login' && abaCriar() && !abriuNoCriar && S.auto) { abriuNoCriar = true; if (!run && !isOpen('.pick')) abrirPicker('side'); }
    if (t === 'scr-login' && !abaCriar() && pickModo === 'side' && isOpen('.pick') && !pickAuto) { /* deixa aberto: a pessoa abriu */ }
    if (t !== 'scr-login' && pickModo === 'side' && isOpen('.pick')) { pickModo = 'mid'; renderPicker(); }
    // o teste apareceu
    if (t === 'scr-test' && S.auto && !pausado() && !run && !testeVisto) {
      if (alvo) { testeVisto = true; responderTeste(); }
      else if (!isOpen('.pick')) { pickAuto = true; abrirPicker('mid'); }
    }
  }

  // ───────────────────────── teclado, mensagens e ciclo de vida ─────────────────────────
  const onKey = (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyS' || /^s$/i.test(e.key))) {
      const tg = e.target, typing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || ''));
      if (!typing && tela()) { e.preventDefault(); e.stopPropagation(); toggleMenu(); }
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyF' || /^f$/i.test(e.key))) {
      const tg = e.target, typing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || ''));
      if (!typing && !pausado()) { e.preventDefault(); e.stopPropagation(); setFarm({ on: !farm.on }); }
      return;
    }
    if (e.key !== 'Escape') return;
    // o Esc que fecha algo da Sobrevida não chega ao jogo (senão ele pausaria a partida ou voltaria de tela)
    const engole = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (open) { if (!(open === 'update' && urgente())) closeCard(open === 'update'); engole(); return; }
    if (isOpen('.pick')) { fecharPicker(); engole(); return; }
    if (menuOpen) { fecharMenu(); engole(); }
  };
  addEventListener('keydown', onKey, true);
  const onDocDown = (e) => {
    if (!menuOpen || !e.isTrusted) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(host)) return;
    fecharMenu();
  };
  document.addEventListener('pointerdown', onDocDown, true);
  const onResize = () => { placeFab(); placeMenu(); };
  addEventListener('resize', onResize);

  const procurarAgora = () => { if (alive()) updCmd('check-soft'); };
  const onVis = () => { if (document.visibilityState === 'visible') procurarAgora(); };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('focus', procurarAgora);

  const onStore = (ch, area) => {
    if (!alive()) return;
    if (area !== 'local') {
      if (ch.auto) S.auto = ch.auto.newValue !== false;
      if (ch.lang) { lang = ch.lang.newValue || I.detect(); if (open === 'tutorial') renderTutorial(); else if (open === 'news') news(); else if (open === 'update') updateCard(); if (isOpen('.pick')) renderPicker(); status(); }
      if (menuOpen) { renderMenu(); placeMenu(); }
    }
    if (area === 'local' && ch['sv.farm']) { farm = Object.assign({}, FARM_DEF, ch['sv.farm'].newValue || {}); mandarCfg(); farmSig = ''; renderFarm(); pill(); }
    if (area === 'local' && ch['sv.alvo']) { alvo = ch['sv.alvo'].newValue || null; if (menuOpen) { renderMenu(); placeMenu(); } }
    if (area === 'local' && ch['sv.adiado']) { adiado = ch['sv.adiado'].newValue || null; maybeUpdate(); }
    if (area === 'local' && ch['sv.update']) { upd = ch['sv.update'].newValue || {}; if (open === 'update' && upd.disponivel) updateCard(); else maybeUpdate(); if (menuOpen) { renderMenu(); placeMenu(); } }
  };
  ext.storage.onChanged.addListener(onStore);
  const onMsg = (m) => {
    if (!alive() || !m) return;
    if (m.type === 'sobrevida:tutorial') { ready = true; tutorial(); }
    if (m.type === 'sobrevida:news') { newsFrom = ''; news(); }
    if (m.type === 'sobrevida:menu') { if (tela()) toggleMenu(); else abrirPicker('mid'); }
  };
  ext.runtime.onMessage.addListener(onMsg);

  async function startBoxes() {
    let ob;
    try { ob = (await ext.storage.local.get('sv.onboard'))['sv.onboard']; } catch (_) { return; }
    try { upd = (await ext.storage.local.get('sv.update'))['sv.update'] || {}; adiado = (await ext.storage.local.get('sv.adiado'))['sv.adiado'] || null; } catch (_) {}
    procurarAgora();
    await sleep(1200); // deixa o jogo desenhar primeiro
    if (dead) return;
    await visivel();
    if (dead) return;
    try { ob = (await ext.storage.local.get('sv.onboard'))['sv.onboard'] || ob; } catch (_) {}
    if (urgente()) { ready = true; return maybeUpdate(); }
    if ((!ob || ob.tutorial === 'pendente') && !vis('scr-test')) { // no meio do teste o tutorial espera
      await ext.storage.local.set({ 'sv.onboard': Object.assign({}, ob || {}, { tutorial: 'visto', visto: VERSION, novLidas: BASE }) });
      ready = true;
      return tutorial();
    }
    ready = true;
    if (ob && ob.visto !== VERSION) await ext.storage.local.set({ 'sv.onboard': Object.assign({}, ob, { visto: VERSION }) });
    if (ob && ob.novLidas !== BASE) {
      let from = ob.novLidas ? ob.novLidas : (ob.visto || '');
      if (from && cmpVer(baseVer(from), BASE) >= 0) from = versaoAnterior(BASE);
      newsFrom = from;
      news();
      if (open) return;
      marcarNovLidas();
    }
    maybeUpdate();
  }

  let timer = 0, timerUpd = 0;
  function stop() {
    if (dead) return;
    dead = true;
    if (run) run.cancel = true;
    clearInterval(timer); clearInterval(timerUpd);
    document.removeEventListener('sobrevida-takeover', onTakeover);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('pointerdown', onDocDown, true);
    removeEventListener('focus', procurarAgora);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    try { ext.storage.onChanged.removeListener(onStore); ext.runtime.onMessage.removeListener(onMsg); } catch (_) {}
    document.removeEventListener('sobrevida:st', onSt);
    if (host) host.remove();
  }

  SYNC.get(null).then((s) => {
    if (s.auto === false) S.auto = false;
    if (I.LANGS.includes(s.lang)) lang = s.lang;
  }).catch(() => {}).then(() => ext.storage.local.get(['sv.alvo', 'sv.fab', 'sv.farm']).then((l) => { alvo = byDex(l['sv.alvo']) ? l['sv.alvo'] : null; fabPos = l['sv.fab'] || null; farm = Object.assign({}, FARM_DEF, l['sv.farm'] || {}); }, () => {})).finally(() => {
    if (dead) return;
    ui(); placeFab();
    mandarCfg(); setInterval(() => { if (!dead) mandarCfg(); }, 5000);
    vigiaDono(); setInterval(vigiaDono, 3000);
    timer = setInterval(tick, 250);
    timerUpd = setInterval(maybeUpdate, 30000); // o adiamento de 1 h vence → o aviso volta sozinho
    startBoxes().then(tick);
  });
})();
