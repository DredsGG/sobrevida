// PokéSurvivor REAL para o teste no Firefox de verdade (CI): o build publicado do repositório público do jogo
// (clone em GAME_DIR) servido em https://pokesurvivor.com. Firebase, Google e o selo do ranking (ice.pokesurvivor.com)
// apontam para cá e respondem 404/simulado: nada sai para os servidores reais. Conta quantos pedidos de selo chegaram
// (GET https://pokesurvivor.com/__test/seals) para o teste provar que o farm bloqueia o selo antes da rede.
// Uso: sudo node server.mjs <cert.pem> <key.pem> <pasta-do-jogo>
import https from 'https';
import fs from 'fs';
import path from 'path';

const [CERT, KEY, GAME_ARG] = process.argv.slice(2);
const GAME = path.resolve(GAME_ARG);
const CT = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json',
  '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml' };
let seals = 0;

https.createServer({ cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) }, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const u = new URL(req.url, 'https://' + host);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  if (host === 'ice.pokesurvivor.com') {
    if (u.pathname.startsWith('/v1/seal')) seals++;
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    return res.end('{"s":1,"g":"0"}');
  }
  if (host !== 'pokesurvivor.com') { res.writeHead(404, cors); return res.end(''); }
  if (u.pathname === '/__test/seals') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ seals })); }
  let f = path.join(GAME, decodeURIComponent(u.pathname));
  if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(GAME) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(''); }
  res.writeHead(200, { 'content-type': CT[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(443, () => console.log('ok 443'));
