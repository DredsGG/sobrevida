// Confere o manifest.json como MV3 de navegador Chromium (Chrome, Edge, Brave, Opera GX), sem navegador e sem rede.
//   node tests/manifest.cjs [pasta-da-extensao]
// O `web-ext lint` é feito para o Firefox: num manifest só Chromium ele reclama do service worker e da falta de id, por
// isso o workflow filtra esses dois avisos e deixa esta conferência cuidar do resto.
const fs = require('fs'), path = require('path');
const EXT = path.resolve(process.argv[2] || ['extension', 'instalada'].map((d) => path.join(__dirname, '..', d)).find((d) => fs.existsSync(path.join(d, 'manifest.json'))));
let falhas = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) falhas++; };
const existe = (f) => fs.existsSync(path.join(EXT, f));
const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
ok(m.manifest_version === 3, `manifest_version 3 (${m.manifest_version})`);
ok(/^\d+(\.\d+){0,3}$/.test(m.version), `version válida para o Chromium: ${m.version}`);
ok(typeof m.name === 'string' && m.name.length > 0 && m.name.length <= 75, `name: ${m.name}`);
ok(m.background && typeof m.background.service_worker === 'string' && existe(m.background.service_worker), `background só com service_worker (${m.background && m.background.service_worker}) e o arquivo existe`);
ok(m.background && !('scripts' in m.background) && !('persistent' in m.background), 'background sem "scripts" nem "persistent"');
ok(!('browser_specific_settings' in m) && !('applications' in m), 'sem browser_specific_settings');
ok(JSON.stringify(m).toLowerCase().indexOf('gecko') < 0 && JSON.stringify(m).toLowerCase().indexOf('firefox') < 0, 'nenhuma menção a gecko/firefox no manifest');
const PERMS = ['storage', 'alarms', 'downloads', 'scripting', 'declarativeNetRequest', 'tabs', 'activeTab', 'notifications', 'contextMenus'];
ok((m.permissions || []).every((p) => PERMS.includes(p)), `permissions conhecidas do Chromium: ${(m.permissions || []).join(', ')}`);
ok((m.host_permissions || []).every((h) => /^https:\/\/[^/]+\/\*$/.test(h)), `host_permissions só https: ${(m.host_permissions || []).join(', ')}`);
const cs = m.content_scripts || [];
ok(cs.length > 0 && cs.every((c) => (c.js || []).every(existe) && (c.matches || []).every((x) => /^https:\/\//.test(x)) && ['document_start', 'document_end', 'document_idle'].includes(c.run_at)), `content_scripts: ${cs.length} entradas, todos os arquivos existem`);
ok(cs.every((c) => !c.world || c.world === 'MAIN' || c.world === 'ISOLATED'), 'world só MAIN ou ISOLATED');
const icons = Object.assign({}, m.icons, m.action && m.action.default_icon);
ok(Object.values(icons).length > 0 && Object.values(icons).every(existe), `ícones existem (${Object.values(icons).length})`);
if (m.default_locale) {
  const msgs = path.join('_locales', m.default_locale, 'messages.json');
  ok(existe(msgs), `default_locale ${m.default_locale} tem ${msgs}`);
  if (existe(msgs)) {
    const M = JSON.parse(fs.readFileSync(path.join(EXT, msgs), 'utf8'));
    const usados = [...JSON.stringify(m).matchAll(/__MSG_(\w+)__/g)].map((x) => x[1]);
    ok(usados.every((k) => M[k] && M[k].message), `textos __MSG_*__ do manifest existem em ${msgs}: ${usados.join(', ')}`);
  }
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
