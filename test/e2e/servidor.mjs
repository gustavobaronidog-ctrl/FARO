// Sobe o Faro inteiro localmente, do jeito que vai rodar de verdade:
//  - tela: build de produção (esbuild, igual ao Vite) com o supabase-js REAL e chave nova sb_publishable_
//  - /api/*: as funções da Vercel de verdade (acao, ia, cron) com req/res no formato da Vercel e chave sb_secret_
//  - banco/login: Supabase local (supabase_local.mjs) em cima do Postgres com o esquema de login real do Supabase
//  - Google Places, Gemini e sites dos leads: respostas no formato oficial (sem internet aqui)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import { build } from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { iniciar, CHAVE_PUBLICA, CHAVE_SECRETA, registro } from './supabase_local.mjs';

const raiz = path.resolve(import.meta.dirname, '../..');
const dist = path.join(raiz, 'test/e2e/dist');
const PORTA_SB = 54321, PORTA_APP = Number(process.env.PORTA_APP || 8790);

process.env.SUPABASE_URL = `http://127.0.0.1:${PORTA_SB}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE_SECRETA;
process.env.GOOGLE_PLACES_API_KEY = 'AIza-teste';
process.env.GEMINI_API_KEY = 'gemini-teste';
process.env.CRON_SECRET = 'segredo-do-cron';

// ------------------------------------------------------------------ build de produção da tela
mkdirSync(dist, { recursive: true });
await build({
  entryPoints: [path.join(raiz, 'src/main.jsx')], bundle: true, minify: true, format: 'esm', jsx: 'automatic',
  outfile: path.join(dist, 'assets/app.js'), nodePaths: [path.join(raiz, 'node_modules'), '/opt/npm-tools/node_modules'],
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(`http://127.0.0.1:${PORTA_SB}`),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(CHAVE_PUBLICA),
  },
  logLevel: 'error', target: 'es2022',
});
const html = readFileSync(path.join(raiz, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.jsx"></script>', '<script type="module" src="/assets/app.js"></script>')
  .replace('</head>', '<link rel="stylesheet" href="/assets/app.css" /></head>');
writeFileSync(path.join(dist, 'index.html'), html);
for (const f of ['favicon.svg', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png', 'apple-touch-icon.png'])
  if (existsSync(path.join(raiz, 'public', f))) cpSync(path.join(raiz, 'public', f), path.join(dist, f));

// ------------------------------------------------------------------ internet simulada
export const chamadasExternas = [];
const fetchReal = globalThis.fetch;
const NOMES = ['Studio Bella', 'Espaço Charme', 'Salão Glamour', 'Barbearia Navalha', 'Unhas da Rô', 'Estética Pele de Seda', 'Cabelo & Cia', 'Studio Fios de Ouro', 'Salão Bem Me Quer', 'Barbearia Dom Bigode'];
function lugares(consulta, pagina) {
  const n = pagina < 3 ? 20 : 8;
  const cidade = consulta.split(' em ')[1] || 'São Paulo SP';
  const uf = cidade.trim().split(' ').pop();
  return Array.from({ length: n }, (_, i) => {
    const k = (pagina - 1) * 20 + i;
    const semente = [...consulta].reduce((a, c) => a + c.charCodeAt(0), 0) + k;
    const tipo = k % 5;
    return {
      id: `ChIJ${Buffer.from(consulta).toString('hex').slice(0, 10)}${String(k).padStart(3, '0')}`,
      displayName: { text: `${NOMES[semente % NOMES.length]} ${k + 1}`, languageCode: 'pt-BR' },
      formattedAddress: `Rua ${k + 1}, ${k * 7} - Centro, ${cidade}, Brasil`,
      addressComponents: [
        { longText: 'Centro', shortText: 'Centro', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { longText: cidade.replace(/ \w\w$/, ''), shortText: cidade.replace(/ \w\w$/, ''), types: ['administrative_area_level_2', 'political'] },
        { longText: 'Estado', shortText: uf, types: ['administrative_area_level_1', 'political'] },
        { longText: 'Brasil', shortText: 'BR', types: ['country', 'political'] },
      ],
      ...(tipo === 4 ? {} : { nationalPhoneNumber: tipo < 3 ? `(11) 9${String(80000000 + semente * 37).slice(0, 4)}-${String(1000 + k).slice(-4)}` : `(11) 3${String(1000000 + semente).slice(0, 3)}-${String(2000 + k).slice(-4)}`,
        internationalPhoneNumber: tipo < 3 ? `+55 11 9${String(80000000 + semente * 37).slice(0, 4)}-${String(1000 + k).slice(-4)}` : `+55 11 3${String(1000000 + semente).slice(0, 3)}-${String(2000 + k).slice(-4)}` }),
      ...(k % 3 === 0 ? { websiteUri: `https://site-${k}.exemplo-salao.com.br/` } : k % 3 === 1 ? { websiteUri: `https://www.instagram.com/salao_${k}/` } : {}),
      rating: Math.round((3.8 + (semente % 12) / 10) * 10) / 10,
      userRatingCount: 5 + (semente % 300),
      businessStatus: k === 7 ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL',
      location: { latitude: -23.55 + k / 1000, longitude: -46.63 - k / 1000 },
      googleMapsUri: `https://maps.google.com/?cid=${semente}`,
    };
  });
}
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(typeof url === 'string' ? url : url.url);
  if (u.hostname === 'places.googleapis.com') {
    const corpo = JSON.parse(op.body);
    chamadasExternas.push({ tipo: 'google', consulta: corpo.textQuery, pagina: corpo.pageToken || '1', mascara: op.headers['X-Goog-FieldMask'] });
    if (op.headers['X-Goog-Api-Key'] !== 'AIza-teste') return new Response(JSON.stringify({ error: { code: 403, message: 'API key not valid' } }), { status: 403 });
    if (corpo.maxResultCount) return new Response(JSON.stringify({ error: { code: 400, message: 'maxResultCount deprecated' } }), { status: 400 });
    const pagina = corpo.pageToken ? Number(corpo.pageToken.replace('pg', '')) : 1;
    return Response.json({ places: lugares(corpo.textQuery, pagina), ...(pagina < 3 ? { nextPageToken: `pg${pagina + 1}` } : {}) });
  }
  if (u.hostname === 'generativelanguage.googleapis.com') {
    const corpo = JSON.parse(op.body);
    const modelo = u.pathname.match(/models\/([^:]+):/)[1];
    chamadasExternas.push({ tipo: 'gemini', modelo, pesquisa: !!corpo.tools });
    // como na camada grátis de 2026: o apelido existe, mas a pesquisa no Google não é liberada
    if (!['gemini-flash-latest', 'gemini-3.5-flash'].includes(modelo)) return new Response(JSON.stringify({ error: { code: 404, message: `models/${modelo} is not found` } }), { status: 404 });
    if (corpo.tools) return new Response(JSON.stringify({ error: { code: 400, message: 'Search Grounding is not supported for this API key tier.' } }), { status: 400 });
    // treinador de ligações: respostas em JSON, como o Gemini faz com responseSchema
    if (corpo.generationConfig?.responseMimeType === 'application/json') {
      if (!corpo.generationConfig.responseSchema) return new Response(JSON.stringify({ error: { code: 400, message: 'schema faltando' } }), { status: 400 });
      const audio = corpo.contents[0].parts.find(p => p.inline_data);
      if (audio) {
        const wav = Buffer.from(audio.inline_data.data, 'base64');
        const ok = wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE' && wav.readUInt32LE(24) === 8000 && wav.readUInt16LE(22) === 1;
        chamadasExternas.push({ tipo: 'gemini-audio', mime: audio.inline_data.mime_type, bytes: wav.length, wavValido: ok });
        if (!ok || audio.inline_data.mime_type !== 'audio/wav') return new Response(JSON.stringify({ error: { code: 400, message: 'Unsupported audio' } }), { status: 400 });
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ teve_conversa: true, falas: [
          { quem: 'vendedor', inicio: '00:00', texto: 'Boa tarde, falo com a responsável?' },
          { quem: 'cliente', inicio: '00:03', texto: 'É ela.' },
          { quem: 'vendedor', inicio: '00:05', texto: 'E cliente que marca e falta, acontece?' },
          { quem: 'cliente', inicio: '00:09', texto: 'Umas quatro por semana, viu.' },
        ] }) }] }, finishReason: 'STOP' }] });
      }
      const pedidoJson = corpo.contents[0].parts[0].text;
      chamadasExternas.push({ tipo: 'gemini-analise', temTranscricao: /CLIENTE: Umas quatro por semana/.test(pedidoJson), temSpin: /SPIN/.test(corpo.systemInstruction.parts[0].text) });
      const crit = (nota) => ({ nota, comentario: 'ok' });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        nota_geral: 12, resumo: 'Achou a dor e não aprofundou.', veredito: 'Achou o ouro e não cavou.',
        spin: { situacao: crit(7.5), problema: crit(7), implicacao: crit(2.4), necessidade: crit(3) },
        habilidades: { abertura: crit(8), escuta: crit(6), objecoes: crit(5), fechamento: crit(5.5), tom: crit(7) },
        pontos_fortes: [{ titulo: 'Abertura', inicio: '00:00', trecho: 'Boa tarde', por_que: 'educado' }],
        pontos_fracos: [{ titulo: 'Pulou a implicação', inicio: '00:09', trecho: 'Umas quatro por semana', melhor_seria: 'E quanto custa cada horário vazio?' }],
        momento_chave: { inicio: '00:09', descricao: 'Ela deu o número.' }, perguntas_que_faltaram: ['Quanto sai um atendimento?'],
        proxima_ligacao: ['a', 'b', 'c'], proximo_passo_com_este_cliente: 'Ligar amanhã às 10h.', foco_do_treino: 'Implicação', evolucao: 'Primeira ligação.',
      }) }] }, finishReason: 'STOP' }] });
    }
    const pedido = corpo.contents[0].parts[0].text;
    const texto = /Quem é/.test(pedido) ? '**Quem é**: salão de bairro.\n**Gancho de abertura**: Vi que vocês agendam pelo WhatsApp…'
      : /O lead acabou de dizer/.test(pedido) ? '1) RESPOSTA PARA FALAR AGORA\nEntendo…\n2) PERGUNTA DE VOLTA\nComo vocês…\n3) SE ELE INSISTIR\nPosso te mandar…'
      : 'Oi! Tudo bem? Vi que vocês agendam pelo WhatsApp. Posso te mostrar em 2 minutos como ficar com a agenda cheia sem responder mensagem de madrugada?';
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: texto }] }, finishReason: 'STOP' }] });
  }
  if (u.hostname.endsWith('exemplo-salao.com.br')) {
    chamadasExternas.push({ tipo: 'site', url: u.href });
    const k = Number(u.hostname.match(/site-(\d+)/)?.[1] || 0);
    const corpo = k % 2 === 0
      ? `<html><body><a href="https://wa.me/5511987654321?text=Quero%20agendar">Agende pelo WhatsApp</a> <a href="https://instagram.com/salao_site_${k}">insta</a> contato@salao${k}.com.br</body></html>`
      : `<html><body><a href="https://www.trinks.com/salao-${k}">Agende online</a> <script src="https://browser.sentry-cdn.com/x.js"></script> sentry@sentry.io</body></html>`;
    return new Response(corpo, { headers: { 'content-type': 'text/html' } });
  }
  if (u.hostname.endsWith('instagram.com')) return new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return fetchReal(url, op);
  chamadasExternas.push({ tipo: 'bloqueado', url: u.href });
  throw new TypeError('fetch failed (sem internet no teste): ' + u.href);
};

// ------------------------------------------------------------------ funções da Vercel
const handlers = {};
for (const nome of ['acao', 'ia', 'cron', 'coach']) handlers[nome] = (await import(path.join(raiz, 'api', nome + '.js'))).default;

function resVercel(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.headersSent) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(typeof b === 'string' ? b : JSON.stringify(b)); return res; };
  return res;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

await iniciar(PORTA_SB);
const app = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORTA_APP}`);
  if (url.pathname.startsWith('/api/')) {
    const nome = url.pathname.slice(5).replace(/\/$/, '');
    if (!handlers[nome]) { res.statusCode = 404; return res.end('{}'); }
    let txt = ''; for await (const p of req) txt += p;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = txt && /json/.test(req.headers['content-type'] || '') ? JSON.parse(txt) : txt; }
    catch { res.statusCode = 400; return res.end('{"error":"Invalid JSON"}'); }
    try { await handlers[nome](req, resVercel(res)); }
    catch (e) { console.error('FUNÇÃO QUEBROU', nome, e); res.statusCode = 500; res.end(JSON.stringify({ erro: 'FUNCTION_INVOCATION_FAILED: ' + e.message })); }
    return;
  }
  let arq = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!arq.startsWith(dist) || !existsSync(arq)) arq = path.join(dist, 'index.html');
  res.setHeader('content-type', TIPOS[path.extname(arq)] || 'application/octet-stream');
  res.end(readFileSync(arq));
});
app.listen(PORTA_APP, '127.0.0.1', () => console.log(`Faro local em http://127.0.0.1:${PORTA_APP}`));

// relatório para o teste do navegador
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ externas: chamadasExternas, rest: registro.filter(r => r.status >= 400) }));
}).listen(PORTA_APP + 1, '127.0.0.1');
