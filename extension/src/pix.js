// Sobrevida — Pix do botão "Apoiar ♥" (regra 16 do hub). Dados SÓ de 02-projetos/extensoes/apoio.md do vault.
// BR Code estático montado aqui, sem internet: 00 · 26 (GUI + chave) · 52 · 53 · 54 (valor, opcional) · 58 · 59 · 60 ·
// 62/05 *** · 63 CRC16-CCITT-FALSE (poly 0x1021, início 0xFFFF) sobre tudo até "6304". QR: vendor/qrcode.js (MIT,
// Kazuhiko Arase), correção de erro M.
globalThis.SV_PIX = (() => {
  const APOIO = {
    sponsors: 'https://github.com/sponsors/DredsGG',
    chave: 'fa525dad-afca-4683-845d-eee7225a53e3',
    nome: 'Andre Miller Fleck',
    cidade: 'Sao Paulo',
  };
  const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function crc16(s) {
    let c = 0xffff;
    for (let i = 0; i < s.length; i++) {
      c ^= s.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }
  // valor: número em reais (1 a 10.000) ou nada (a pessoa digita no banco)
  function codigo(valor) {
    let s = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', APOIO.chave)) + campo('52', '0000') + campo('53', '986');
    if (valor) s += campo('54', Number(valor).toFixed(2));
    s += campo('58', 'BR') + campo('59', APOIO.nome) + campo('60', APOIO.cidade) + campo('62', campo('05', '***')) + '6304';
    return s + crc16(s);
  }
  // "12,50" / "12.50" / "R$ 12" → 12.5; fora de 1–10.000 → null (inválido); vazio → 0 (livre)
  function lerValor(txt) {
    const t = String(txt || '').replace(/r\$|\s/gi, '');
    if (!t) return 0;
    const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!isFinite(n) || n < 1 || n > 10000) return null;
    return Math.round(n * 100) / 100;
  }
  // matriz do QR (true = módulo escuro)
  function matriz(texto) {
    const q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    const n = q.getModuleCount(), m = [];
    for (let r = 0; r < n; r++) { const l = []; for (let c = 0; c < n; c++) l.push(q.isDark(r, c)); m.push(l); }
    return m;
  }
  // desenha num canvas: fundo branco, borda branca de 4 módulos, pixels inteiros (nítido)
  function desenhar(canvas, texto, tam) {
    const m = matriz(texto), n = m.length, borda = 4, k = Math.max(2, Math.floor(tam / (n + borda * 2)));
    const px = (n + borda * 2) * k;
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) ctx.fillRect((c + borda) * k, (r + borda) * k, k, k);
    return canvas;
  }
  return { APOIO, crc16, codigo, lerValor, matriz, desenhar };
})();
