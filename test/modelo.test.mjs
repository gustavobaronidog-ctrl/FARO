// Testa o modelo conjunto com os mesmos dados simulados do teste SQL
import { readFileSync } from 'node:fs';
import { ajustarModelo } from '../api/_lib/modelo.js';

const dados = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const iniciais = Object.fromEntries(dados.pesos.map(p => [p.sinal, Number(p.peso_inicial)]));
const t0 = Date.now();
const r = ajustarModelo(dados.amostras.map(a => ({ sinais: a.s, positivo: a.p })), iniciais);
console.log(`ajustado em ${Date.now() - t0}ms · ${r.amostras} amostras · ${r.sinais.length} sinais`);
for (const [s, p] of Object.entries(r.pesos).sort((a, b) => b[1] - a[1])) console.log(String(p).padStart(8), s);

const ok = (c, m) => { if (!c) { console.error('FALHOU:', m); process.exit(1); } };
ok(r.pesos.agenda_whatsapp > 18, 'agenda_whatsapp deveria subir');
ok(r.pesos['nicho:barbearia'] > 5, 'barbearia deveria ganhar peso');
// na simulação 'só redes' e 'concorrente' são complementares: vale a diferença entre eles
ok(r.pesos.so_redes - r.pesos.usa_concorrente > 8, 'concorrente deveria valer bem menos que só redes');
ok(Math.abs(r.pesos.nota_alta) < 4, `nota_alta deveria ficar perto de zero (deu ${r.pesos.nota_alta})`);
ok(Math.abs(r.pesos.estrutura_media ?? 0) < 6, 'estrutura_media sem efeito real');

// poucos dados: fica perto do palpite
const poucos = ajustarModelo(dados.amostras.slice(0, 12).map(a => ({ sinais: a.s, positivo: a.p })), iniciais, { minimoPorSinal: 1 });
for (const [s, p] of Object.entries(poucos.pesos)) ok(Math.abs(p - (iniciais[s] ?? 0)) < 8, `com 12 amostras ${s} mudou demais (${p})`);

console.log(JSON.stringify(r.pesos));
console.log('>>> modelo conjunto OK');
