// Sobrevida — jogo local para os testes (0.12.3).
// O repo público do jogo (JPTER78/pokesurvivor) sumiu em 2026-11-05 (404). Os testes passam a usar uma cópia local em
// testes/.game, montada sob demanda: com ESPELHAR=1, cada arquivo ESTÁTICO do jogo que faltar é buscado por GET em
// https://pokesurvivor.com (sem cookie, sem login, sem POST) e gravado em testes/.game no mesmo caminho.
// Firebase, ice.pokesurvivor.com, GitHub e raw.githubusercontent continuam simulados (nada sai para lá).
//
// ⚠️ testes/.game é cópia SÓ PARA TESTE LOCAL. O jogo é PolyForm Noncommercial e os sprites são CC BY-NC:
//    nunca commitar, nunca publicar, nunca pôr no zip. (.gitignore cobre testes/.game e tests/.game.)
//
// Também exporta nsInit(): script de página que acha o objeto interno do jogo do mesmo jeito que o piloto
// (Object.create embrulhado só no carregamento, devolvido logo depois) e expõe, SÓ NO NAVEGADOR DE TESTE,
// window.__NS (módulos pelos nomes lógicos, via fonte-piloto/mapa.js) e window.__NSRAW (o objeto real).
const path = require('path'), fs = require('fs');

const ORIGEM = 'https://pokesurvivor.com';
const PADRAO = path.join(__dirname, '.game');
const CT = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
// só arquivos estáticos do jogo: html, js, css, fontes, imagens e version.json
const PERMITIDO = /\.(html|js|css|ttf|otf|woff2?|png|webp|svg|gif|jpe?g|ico)$/i;
const permitido = (p) => PERMITIDO.test(p) || /(^|\/)version\.json$/.test(p);

const negados = new Set(), baixados = [];
const emVoo = new Map();

async function baixar(GAME, rel) {
  if (emVoo.has(rel)) return emVoo.get(rel);
  const pr = (async () => {
    const url = ORIGEM + '/' + rel.split(path.sep).join('/');
    const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'sobrevida-testes/0.12.3', accept: '*/*' }, credentials: 'omit' });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const f = path.join(GAME, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    baixados.push(rel);
    return f;
  })().catch(() => null).finally(() => emVoo.delete(rel));
  emVoo.set(rel, pr);
  return pr;
}

// arquivo local de um caminho do site (null = fora do jogo ou inexistente). Com espelhar, busca o que faltar.
async function arquivo(GAME, pathname, espelhar) {
  let p = decodeURIComponent(pathname);
  if (p.endsWith('/')) p += 'index.html';
  const rel = path.normalize(p.replace(/^\/+/, ''));
  const f = path.join(GAME, rel);
  if (!f.startsWith(GAME + path.sep)) return null;
  if (fs.existsSync(f) && !fs.statSync(f).isDirectory()) return f;
  if (!permitido(rel.split(path.sep).join('/'))) { negados.add(rel); return null; }
  if (!espelhar) return null;
  return baixar(GAME, rel);
}

// rotas do contexto: jogo local (com espelho) + serviços de fora simulados
async function servirJogo(ctx, GAME = PADRAO, opt = {}) {
  GAME = path.resolve(GAME);
  const espelhar = opt.espelhar != null ? opt.espelhar : process.env.ESPELHAR === '1';
  fs.mkdirSync(GAME, { recursive: true });
  if (!opt.semIce) await ctx.route('https://ice.pokesurvivor.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"s":1,"g":"0"}' }));
  if (!opt.semGithub) await ctx.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  for (const h of ['https://www.gstatic.com/**', 'https://raw.githubusercontent.com/**', 'https://*.firebaseio.com/**', 'https://*.googleapis.com/**', 'https://*.firebaseapp.com/**', 'https://www.youtube.com/**', 'https://*.ytimg.com/**'])
    await ctx.route(h, (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(ORIGEM + '/**', async (r) => {
    if (r.request().method() !== 'GET') return r.fulfill({ status: 404, body: '' });
    const u = new URL(r.request().url());
    const f = await arquivo(GAME, u.pathname, espelhar);
    if (!f) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: CT[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'cache-control': 'no-store' } });
  });
  return { GAME, espelhar, negados, baixados };
}

// o trecho do mapa: fonte-piloto/mapa.js (PC) ou, no layout do repo (sem fonte-piloto), o mesmo trecho dentro do piloto montado
function lerMapa() {
  const fonte = path.join(__dirname, '..', 'fonte-piloto', 'mapa.js');
  if (fs.existsSync(fonte)) return fs.readFileSync(fonte, 'utf8');
  for (const p of [process.env.PILOTO, path.join(__dirname, '..', 'instalada', 'src', 'piloto.js'), path.join(__dirname, '..', 'extension', 'src', 'piloto.js')]) {
    if (!p || !fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8'), i = s.indexOf('  // ---------- 1b. mapa dos módulos'), j = s.indexOf('  // ---------- fim do mapa dos módulos');
    if (i >= 0 && j > i) return s.slice(i, j);
  }
  throw new Error('mapa.js não encontrado (nem fonte-piloto/mapa.js nem o trecho no piloto.js)');
}

// script de página: acha o objeto interno como o piloto e expõe __NS (nomes lógicos) / __NSRAW, só no teste
function nsInit() {
  const mapa = lerMapa();
  return `(() => {
    ${mapa}
    const orig = Object.create, achados = [];
    const emb = { create(p, d) { const o = d === undefined ? orig(p) : orig(p, d); if (p === null && achados.length < 500) achados.push(o); return o; } }.create;
    Object.defineProperty(Object, 'create', { value: emb, writable: true, configurable: true, enumerable: false });
    // devolve quando o embrulho do teste estiver por cima (o piloto também embrulha; quem fica por baixo espera a vez)
    const devolve = () => { const t = Date.now(); const f = () => { if (Object.create === emb) Object.defineProperty(Object, 'create', { value: orig, writable: true, configurable: true, enumerable: false }); else if (Date.now() - t < 25000) setTimeout(f, 50); }; f(); };
    const t0 = Date.now();
    const iv = setInterval(() => {
      const raw = svAcharObjeto(achados);
      if (raw) {
        clearInterval(iv); devolve(); achados.length = 0;
        const m = svMapear(raw);
        window.__NSRAW = raw; window.__NSMAPA = { faltam: m.faltam, ambiguos: m.ambiguos, chaves: m.chaves }; window.__NS = m.mods;
      } else if (Date.now() - t0 > 20000) { clearInterval(iv); devolve(); achados.length = 0; window.__NSMAPA = { erro: 'namespace' }; }
    }, 15);
  })();`;
}

// quadro da Sobrevida: o id é sorteado a cada página (0.12.2); acha pelo conteúdo (shadow root com .fab)
async function marcarHost(page) {
  return page.evaluate(() => {
    const h = [...document.querySelectorAll('body > *, html > *')].find((e) => e.shadowRoot && e.shadowRoot.querySelector('.fab, .card, .menu, .pick'));
    if (!h) return false;
    h.setAttribute('data-teste-host', '1');
    return true;
  });
}
const HOST = '[data-teste-host="1"]';
// o mesmo, como script de página: marca o quadro assim que ele aparece (vale depois de recarregar a página)
function marcadorHost() {
  return `setInterval(() => { for (const e of document.querySelectorAll('body > *:not([data-teste-host]), html > *:not([data-teste-host])')) if (e.shadowRoot && e.shadowRoot.querySelector('.fab, .card, .menu, .pick')) e.setAttribute('data-teste-host', '1'); }, 100);`;
}

// hash curto (sha256) de um arquivo do jogo local
function hash(f) { return require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

module.exports = { servirJogo, arquivo, nsInit, lerMapa, marcarHost, marcadorHost, HOST, hash, PADRAO, ORIGEM, negados, baixados };

// uso direto: node testes/espelhar-jogo.cjs [pasta] → espelha index.html, version.json e o app.min.js e mostra o hash
if (require.main === module) (async () => {
  const GAME = path.resolve(process.argv[2] || PADRAO);
  fs.mkdirSync(GAME, { recursive: true });
  for (const p of ['/index.html', '/version.json']) console.log(p, (await arquivo(GAME, p, true)) ? 'ok' : 'FALHOU');
  const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|mailto:|\/\/)/.test(u));
  for (const u of new Set(refs)) { const p = '/' + u.replace(/^\.?\//, '').split('?')[0]; const f = await arquivo(GAME, p, true); console.log(p, f ? 'ok' : (permitido(p) ? 'FALHOU' : 'fora da lista')); }
  const app = path.join(GAME, 'js', 'app.min.js');
  const v = (html.match(/app\.min\.js\?v=([0-9a-f]+)/) || [])[1];
  console.log('index.html pede app.min.js?v=' + v);
  console.log('version.json:', fs.readFileSync(path.join(GAME, 'version.json'), 'utf8').trim());
  if (fs.existsSync(app)) console.log('app.min.js', fs.statSync(app).size, 'bytes sha256', hash(app));
})();
