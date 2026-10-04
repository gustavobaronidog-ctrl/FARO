import { bancoFalso } from './fakes.mjs';
import { cacar, enriquecer, orcamentoGoogle } from '../api/_lib/robos.js';
import { analisarConteudo, lerSinais } from '../api/_lib/sinais.js';
import { placeParaLead } from '../api/_lib/google.js';
import { normalizarTelefone, ehCelular, formatarTelefone } from '../api/_lib/telefone.js';
import { montarPedido, gerar } from '../api/_lib/ia.js';

let falhas = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { console.error('  ✗', m); falhas++; } };

console.log('Telefone');
ok(normalizarTelefone('(31) 97777-0004') === '5531977770004', 'celular sem 55 ganha 55');
ok(normalizarTelefone('+55 11 3333-0002') === '551133330002', 'fixo internacional');
ok(normalizarTelefone('031 99999-0001') === '5531999990001', 'zero na frente');
ok(ehCelular('5531977770004') && !ehCelular('551133330002'), 'detecta celular');
ok(formatarTelefone('5531977770004') === '(31) 97777-0004', 'formata para exibir');

console.log('Google → lead');
const place = {
  id: 'ChIJabc', displayName: { text: 'Studio Bella' }, internationalPhoneNumber: '+55 31 99999-0001',
  websiteUri: 'https://instagram.com/studiobella', rating: 4.8, userRatingCount: 210, businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/?cid=1', location: { latitude: -19.9, longitude: -43.9 },
  addressComponents: [
    { longText: 'Savassi', shortText: 'Savassi', types: ['sublocality_level_1', 'sublocality'] },
    { longText: 'Belo Horizonte', shortText: 'Belo Horizonte', types: ['administrative_area_level_2'] },
    { longText: 'Minas Gerais', shortText: 'MG', types: ['administrative_area_level_1'] },
  ],
};
const l = placeParaLead(place, { nicho: 'salao', cidade: 'X', uf: 'Y' });
ok(l.telefone === '5531999990001' && l.celular, 'telefone e celular');
ok(l.cidade === 'Belo Horizonte' && l.uf === 'MG' && l.bairro === 'Savassi', 'cidade, UF e bairro do Google');
ok(l.nicho === 'salao' && l.avaliacoes === 210, 'nicho do alvo e avaliações');

console.log('Leitor de sinais');
const conc = [{ nome: 'Trinks', padroes: ['trinks.com'] }, { nome: 'Booksy', padroes: ['booksy.com'] }];
let a = analisarConteudo('<a href="https://wa.me/5531999990001?text=Quero agendar">Agende pelo WhatsApp</a> <a href="https://instagram.com/studio.bella/">', conc);
ok(a.sinais.whatsapp && !a.concorrente && a.instagram === 'studio.bella', 'site com botão de WhatsApp');
a = analisarConteudo('<iframe src="https://www.trinks.com/studiobella/agendamento"></iframe> <a href="https://wa.me/55">', conc);
ok(a.concorrente === 'Trinks' && a.sinais.whatsapp, 'site com Trinks embutido');
a = analisarConteudo('<a href="https://calendly.com/x">Agende online</a> contato@studiobella.com.br', conc);
ok(a.sinais.agenda_online && a.email === 'contato@studiobella.com.br', 'agenda genérica e e-mail');
a = analisarConteudo('<a href="https://instagram.com/p/ABC123">post</a>', conc);
ok(a.instagram === null, 'link de post não vira @');

const fetchFalso = (mapa) => async (url) => {
  const corpo = mapa[url];
  if (corpo === undefined) throw new Error('rede');
  return { ok: true, status: 200, url, text: async () => corpo };
};
let s = await lerSinais({ site: 'https://instagram.com/studiobella' }, conc, { fetchImpl: async () => { throw new Error('não deveria abrir'); } });
ok(s.sinais.redes && s.instagram === 'studiobella' && !s.erro, 'Instagram: não abre, só marca');
s = await lerSinais({ site: 'https://wa.me/5531999990001' }, conc, { fetchImpl: async () => { throw new Error('x'); } });
ok(s.sinais.whatsapp && !s.erro, 'link direto do WhatsApp');
s = await lerSinais({ site: 'https://linktr.ee/bella' }, conc, { fetchImpl: fetchFalso({ 'https://linktr.ee/bella': '"url":"https://wa.me/5531" "url":"https://booksy.com/pt-br/123"' }) });
ok(s.sinais.link_bio && s.sinais.whatsapp && s.concorrente === 'Booksy', 'Linktree aberto e lido');
s = await lerSinais({ site: 'https://www.trinks.com/bella' }, conc, { fetchImpl: fetchFalso({ 'https://www.trinks.com/bella': '<html></html>' }) });
ok(s.concorrente === 'Trinks', 'site do Google aponta direto pro concorrente');
s = await lerSinais({ site: 'https://quebrado.com.br' }, conc, { fetchImpl: fetchFalso({}) });
ok(s.erro === 'site não abriu', 'site fora do ar não derruba nada');

console.log('Robô de caça (Google simulado)');
const produto = { id: 'p1', slug: 'tem-encaixe', config: { google_paginas: 3 }, concorrentes: conc };
function bancoCacada(execucoesAnteriores = []) {
  const alvos = [
    { id: 'a1', produto_id: 'p1', ativo: true, nicho: 'salao', consulta: 'salão de beleza', cidade: 'Belo Horizonte', uf: 'MG', buscas: 0, encontrados: 0, novos: 0, ultima_busca: null },
    { id: 'a2', produto_id: 'p1', ativo: true, nicho: 'barbearia', consulta: 'barbearia', cidade: 'Belo Horizonte', uf: 'MG', buscas: 0, encontrados: 0, novos: 0, ultima_busca: null },
  ];
  const vistos = new Set();
  return bancoFalso(
    { alvos, execucoes: execucoesAnteriores, ajustes: [{ id: 1, google_limite_mensal: 950, google_limite_diario: 30 }], leads: [] },
    { ingerir_leads: ({ p_leads }) => {
        let novos = 0, duplicados = 0;
        for (const x of p_leads) { if (vistos.has(x.place_id)) duplicados++; else { vistos.add(x.place_id); novos++; } }
        return { novos, duplicados, bloqueados: 0 };
      } },
  );
}
let chamadas = [];
const googleFalso = async (url, opt) => {
  const corpo = JSON.parse(opt.body);
  chamadas.push(corpo);
  const pagina = corpo.pageToken ? Number(corpo.pageToken) : 0;
  const places = Array.from({ length: 20 }, (_, i) => ({ id: `${corpo.textQuery}-${pagina}-${i}`, displayName: { text: `Negócio ${i}` }, internationalPhoneNumber: `+55 31 9${String(pagina * 100 + i).padStart(8, '0')}` }));
  return { ok: true, status: 200, json: async () => ({ places, nextPageToken: pagina < 2 ? String(pagina + 1) : undefined }) };
};
const origSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => origSetTimeout(fn, 0); // pula as esperas entre páginas

let banco = bancoCacada();
let r = await cacar(banco, produto, { chave: 'k', fetchImpl: googleFalso, maxChamadas: 4 });
ok(r.requisicoes === 4, `respeita o máximo de chamadas (fez ${r.requisicoes})`);
ok(chamadas[0].textQuery === 'salão de beleza em Belo Horizonte MG' && chamadas[0].regionCode === 'BR', 'consulta montada com cidade e UF');
ok(chamadas[1].pageToken === '1', 'usa o token da próxima página');
ok(r.novos === 80 && r.encontrados === 80, 'ingeriu 80 leads (3 páginas + 1)');
ok(banco.tabelas.execucoes[0].requisicoes === 4, 'consumo do Google registrado para controlar a cota');
ok(banco.tabelas.alvos.every(x => x.ultima_busca), 'alvos marcados como buscados');

chamadas = [];
banco = bancoCacada([{ tipo: 'google', requisicoes: 950, iniciado_em: new Date().toISOString() }]);
r = await cacar(banco, produto, { chave: 'k', fetchImpl: googleFalso });
ok(r.pulado && chamadas.length === 0, 'cota do mês estourada: não chama o Google');

chamadas = [];
banco = bancoCacada([{ tipo: 'google', requisicoes: 28, iniciado_em: new Date().toISOString() }]);
r = await cacar(banco, produto, { chave: 'k', fetchImpl: googleFalso });
ok(r.requisicoes === 2, `limite diário: só usa o que sobrou do dia (usou ${r.requisicoes})`);
const orc = await orcamentoGoogle(banco);
ok(orc.restante === 0 && orc.usadoDia === 30, 'orçamento do dia zerado');

banco = bancoCacada();
r = await cacar(banco, produto, { chave: 'k', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API key not valid' } }) }) });
ok(r.erros === 1 && r.requisicoes === 0 && /API key/.test(r.alvos[0].erro), 'chave inválida: para tudo e mostra o erro');

r = await cacar(bancoCacada(), produto, { chave: '' });
ok(/GOOGLE_PLACES_API_KEY/.test(r.pulado), 'sem chave configurada avisa');

console.log('Robô de sinais');
banco = bancoFalso({ leads: [
  { id: 'l1', produto_id: 'p1', site: 'https://bella.com.br', enriquecido_em: null, sinais: {} },
  { id: 'l2', produto_id: 'p1', site: null, enriquecido_em: null, sinais: {} },
], execucoes: [] }, { pontuar: () => 2 });
r = await enriquecer(banco, produto, { fetchImpl: fetchFalso({ 'https://bella.com.br': '<a href="https://wa.me/5531">zap</a>' }) });
ok(r.analisados === 2 && r.whatsapp === 1, 'analisa todos, inclusive sem site');
ok(banco.tabelas.leads.every(x => x.enriquecido_em), 'marca como analisado');
ok(banco.log.some(x => x.rpc === 'pontuar'), 'recalcula a pontuação depois');

console.log('IA');
const pedido = montarPedido('objecao', { produto: { nome: 'Tem Encaixe', pitch: 'agenda' }, lead: { nome: 'Studio Bella', estagio: 'conversando', tentativas: 1 }, rotulos: ['Agenda pelo WhatsApp'], entrada: 'tá caro' });
ok(pedido.prompt.includes('tá caro') && pedido.prompt.includes('Agenda pelo WhatsApp') && !pedido.pesquisarNaWeb, 'objeção com contexto do lead');
ok(montarPedido('dossie', { produto: { nome: 'X' }, lead: { nome: 'Y', estagio: 'novo', tentativas: 0 } }).pesquisarNaWeb, 'dossiê pesquisa na web');
{
  const vistos = [];
  const fakeGemini = (regras) => async (url, op) => {
    const m = url.match(/models\/([^:]+):/)[1], corpo = JSON.parse(op.body);
    vistos.push(`${m}${corpo.tools ? '+busca' : ''}`);
    const r = regras(m, !!corpo.tools);
    return new Response(JSON.stringify(r.corpo), { status: r.status });
  };
  const okTexto = { status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Oi!' }] } }] } };
  // modelo aposentado → tenta o próximo da lista
  let g = await gerar({ sistema: 's', prompt: 'p', chave: 'k', modelo: 'gemini-velho', fetchImpl: fakeGemini(m => m === 'gemini-velho' ? { status: 404, corpo: { error: { message: 'not found' } } } : okTexto) });
  ok(g.texto === 'Oi!' && g.modelo === 'gemini-flash-latest', 'modelo aposentado: cai para o apelido do Flash mais novo e ignora o "pensamento"');
  // camada grátis sem pesquisa no Google → refaz sem pesquisa
  vistos.length = 0;
  g = await gerar({ sistema: 's', prompt: 'p', chave: 'k', pesquisarNaWeb: true, fetchImpl: fakeGemini((m, busca) => busca ? { status: 400, corpo: { error: { message: 'Search Grounding is not supported' } } } : okTexto) });
  ok(g.texto === 'Oi!' && g.pesquisou === false && vistos.join() === 'gemini-flash-latest+busca,gemini-flash-latest', 'sem pesquisa liberada: refaz sem pesquisa');
  // limite estourado em mensagem normal → avisa (não fica tentando)
  let erro429 = null;
  try { await gerar({ sistema: 's', prompt: 'p', chave: 'k', fetchImpl: fakeGemini(() => ({ status: 429, corpo: { error: { message: 'quota' } } })) }); } catch (e) { erro429 = e; }
  ok(erro429?.status === 429, 'limite da IA: erro 429 chega na tela');
}

globalThis.setTimeout = origSetTimeout;
if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\n>>> robôs OK');
