// Teste do Pix da Sobrevida: códigos iguais aos de referência do vault (apoio.md), "outro valor" e CRC.
const path = require('path').resolve(process.argv[2] || require('path').join(__dirname, '..', 'extension', 'src'));
global.qrcode = require(path + '/vendor/qrcode.js');
require(path + '/pix.js');
const P = globalThis.SV_PIX;
const REF = {
  livre: '00020126580014br.gov.bcb.pix0136fa525dad-afca-4683-845d-eee7225a53e35204000053039865802BR5918Andre Miller Fleck6009Sao Paulo62070503***63047D61',
  5: '00020126580014br.gov.bcb.pix0136fa525dad-afca-4683-845d-eee7225a53e352040000530398654045.005802BR5918Andre Miller Fleck6009Sao Paulo62070503***6304C8ED',
  10: '00020126580014br.gov.bcb.pix0136fa525dad-afca-4683-845d-eee7225a53e3520400005303986540510.005802BR5918Andre Miller Fleck6009Sao Paulo62070503***6304DCD7',
  25: '00020126580014br.gov.bcb.pix0136fa525dad-afca-4683-845d-eee7225a53e3520400005303986540525.005802BR5918Andre Miller Fleck6009Sao Paulo62070503***63044036',
};
let f = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) f++; };
ok(P.codigo(0) === REF.livre, 'valor livre = referência do vault');
for (const v of [5, 10, 25]) ok(P.codigo(v) === REF[v], `R$ ${v} = referência do vault`);
const c12 = P.codigo(P.lerValor('12,50'));
ok(P.lerValor('12,50') === 12.5 && c12.includes('540512.50'), 'outro valor 12,50 → campo 54 05 12.50');
ok(P.crc16('123456789') === '29B1', 'CRC16-CCITT-FALSE de "123456789" = 29B1 (valor padrão do algoritmo)');
ok(c12.slice(-4) === P.crc16(c12.slice(0, -4)), 'CRC do código de 12,50 confere');
ok(P.lerValor('') === 0 && P.lerValor('0,50') === null && P.lerValor('10001') === null && P.lerValor('10.000') === 10000 && P.lerValor('R$ 7') === 7, 'campo de valor: vazio = livre, fora de 1–10.000 recusado, vírgula/ponto/R$ aceitos');
console.log(f ? 'FALHOU ' + f : 'TUDO PASSOU');
process.exit(f ? 1 : 0);
