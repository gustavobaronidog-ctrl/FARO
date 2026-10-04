// Modelo de aprendizado do Faro
// Regressão logística com "prior" gaussiano centrado no palpite inicial de cada sinal.
//  - Com poucos resultados, o peso fica perto do palpite do especialista.
//  - Com muitos resultados, vale o que os dados mostram.
//  - Avalia todos os sinais juntos, então separa causa de coincidência
//    (ex.: "nota alta" não ganha crédito só porque andava junto com outro sinal bom).

export const PONTOS_POR_LOGODDS = 20; // dobrar a chance de avanço ≈ +14 pontos

export function ajustarModelo(amostras, pesosIniciais, opcoes = {}) {
  const { lambda = 4, iteracoes = 30, minimoPorSinal = 3 } = opcoes;
  // amostras: [{ sinais: string[], positivo: boolean }]
  const contagem = new Map();
  for (const a of amostras) for (const s of new Set(a.sinais)) contagem.set(s, (contagem.get(s) || 0) + 1);

  const n = amostras.length;
  // sinal presente em todos (ou quase) não dá para separar do intercepto
  const sinais = [...contagem.entries()]
    .filter(([, c]) => c >= minimoPorSinal && c <= n - minimoPorSinal)
    .map(([s]) => s)
    .sort();
  const k = sinais.length + 1; // +1 intercepto (posição 0)
  const idx = new Map(sinais.map((s, i) => [s, i + 1]));
  const mu = new Float64Array(k);
  sinais.forEach((s, i) => { mu[i + 1] = (pesosIniciais[s] ?? 0) / PONTOS_POR_LOGODDS; });

  const X = amostras.map(a => {
    const linha = [0];
    for (const s of new Set(a.sinais)) if (idx.has(s)) linha.push(idx.get(s));
    return linha; // índices das colunas ativas (matriz esparsa binária)
  });
  const y = amostras.map(a => (a.positivo ? 1 : 0));

  const taxa = (y.reduce((x, v) => x + v, 0) + 1) / (n + 2);
  const beta = Float64Array.from(mu);
  beta[0] = Math.log(taxa / (1 - taxa));

  for (let it = 0; it < iteracoes; it++) {
    const g = new Float64Array(k);
    const H = Array.from({ length: k }, () => new Float64Array(k));
    for (let r = 0; r < n; r++) {
      const cols = X[r];
      let z = 0;
      for (const c of cols) z += beta[c];
      const p = 1 / (1 + Math.exp(-z));
      const w = p * (1 - p);
      const e = y[r] - p;
      for (const a of cols) {
        g[a] += e;
        for (const b of cols) H[a][b] += w;
      }
    }
    for (let j = 1; j < k; j++) { g[j] -= lambda * (beta[j] - mu[j]); H[j][j] += lambda; }
    H[0][0] += 1e-6;
    const passo = resolver(H, g);
    if (!passo) break;
    let maior = 0;
    for (let j = 0; j < k; j++) { beta[j] += passo[j]; maior = Math.max(maior, Math.abs(passo[j])); }
    if (maior < 1e-6) break;
  }

  const pesos = {};
  sinais.forEach((s, i) => {
    const pts = beta[i + 1] * PONTOS_POR_LOGODDS;
    pesos[s] = Math.round(Math.max(-60, Math.min(40, pts)) * 100) / 100;
  });
  return { pesos, sinais, intercepto: beta[0], amostras: n, positivos: y.reduce((x, v) => x + v, 0) };
}

// Eliminação de Gauss com pivotamento parcial: resolve H·x = g
function resolver(H, g) {
  const n = g.length;
  const A = H.map((linha, i) => [...linha, g[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((linha, i) => linha[n] / linha[i]);
}
