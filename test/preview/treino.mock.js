// Prévia local: ligações gravadas e análises de exemplo (sem banco e sem IA)
import base from './dados.json';

const eu = base.perfil;
const L = (i) => base.leads[i];
const dia = (d, h = 14) => new Date(Date.now() - d * 864e5 + (h - 14) * 3600e3).toISOString();

const TRANSCRICAO = [
  ['vendedor', '00:00', 'Boa tarde! Falo com a responsável pelo Espaço Lumière?'],
  ['cliente', '00:03', 'É ela. Quem fala?'],
  ['vendedor', '00:05', 'Prazer, Carla! Aqui é o Gustavo, do Tem Encaixe. Te roubo dois minutinhos? Só te aviso que eu gravo minhas ligações pra melhorar o atendimento, tudo bem?'],
  ['cliente', '00:13', 'Tá, pode falar, mas rapidinho que tô com cliente.'],
  ['vendedor', '00:16', 'Claro. Quantas profissionais trabalham aí com você hoje?'],
  ['cliente', '00:19', 'Somos cinco, contando comigo.'],
  ['vendedor', '00:22', 'E cada uma cuida da própria agenda ou vem tudo pra um WhatsApp só?'],
  ['cliente', '00:26', 'Vem tudo pro WhatsApp do salão, e eu que respondo. É uma loucura, né.'],
  ['vendedor', '00:31', 'Imagino. E cliente que marca e não aparece, acontece?'],
  ['cliente', '00:34', 'Ah, direto. Essa semana mesmo foram umas quatro.'],
  ['vendedor', '00:38', 'Então, o Tem Encaixe resolve isso, a cliente agenda sozinha pelo link e ainda dá pra cobrar um sinal no Pix.'],
  ['cliente', '00:45', 'Hum. E quanto custa isso?'],
  ['vendedor', '00:47', 'Pra cinco profissionais fica R$ 149 por mês, e você testa sete dias grátis.'],
  ['cliente', '00:52', 'Olha, agora não dá pra pensar nisso, me manda no WhatsApp que eu vejo depois.'],
  ['vendedor', '00:57', 'Mando sim! Posso te chamar amanhã pra ver o que achou?'],
  ['cliente', '01:00', 'Pode, pode. Tchau.'],
].map(([quem, inicio, texto]) => ({ quem, inicio, texto }));

const ANALISE = {
  nota_geral: 6.4,
  resumo: 'Abertura boa e descoberta rápida da dor (4 faltas na semana), mas você pulou a Implicação e foi direto pro produto e pro preço. A cliente esfriou e pediu "manda no WhatsApp".',
  veredito: 'Você achou o ouro aos 34 segundos e não cavou.',
  spin: {
    situacao: { nota: 7.8, comentario: 'Duas perguntas certeiras (equipe e WhatsApp) e sem interrogatório. Exatamente o necessário.' },
    problema: { nota: 7.0, comentario: 'Boa pergunta sobre faltas, e ela confirmou a dor com número: "umas quatro essa semana".' },
    implicacao: { nota: 2.5, comentario: 'Nenhuma pergunta de implicação. Ela deu o número de faltas e você não perguntou quanto custa cada horário vazio.' },
    necessidade: { nota: 3.0, comentario: 'Ela nunca disse que queria resolver. Você apresentou antes de ela pedir a solução.' },
  },
  habilidades: {
    abertura: { nota: 8.2, comentario: 'Pediu permissão e avisou da gravação com naturalidade.' },
    escuta: { nota: 6.5, comentario: 'Deixou ela falar, mas não usou o que ela disse ("é uma loucura") para aprofundar.' },
    objecoes: { nota: 4.5, comentario: '"Agora não dá" virou "te mando no WhatsApp" sem você entender o porquê.' },
    fechamento: { nota: 6.0, comentario: 'Garantiu o retorno de amanhã, mas sem horário marcado.' },
    tom: { nota: 7.5, comentario: 'Firme e simpático, respeitou que ela estava com cliente.' },
  },
  pontos_fortes: [
    { titulo: 'Abertura com permissão', inicio: '00:05', trecho: 'Te roubo dois minutinhos? Só te aviso que eu gravo minhas ligações pra melhorar o atendimento', por_que: 'Pedir permissão baixa a guarda e o aviso da gravação passa profissionalismo.' },
    { titulo: 'Pergunta de problema certeira', inicio: '00:31', trecho: 'E cliente que marca e não aparece, acontece?', por_que: 'Simples e direta: ela respondeu com um número real de prejuízo.' },
  ],
  pontos_fracos: [
    { titulo: 'Pulou a Implicação', inicio: '00:38', trecho: 'Então, o Tem Encaixe resolve isso, a cliente agenda sozinha pelo link…', melhor_seria: 'Quatro numa semana? E quando a cliente falta, aquele horário fica vazio ou alguém encaixa? Uma escova com hidratação aí sai por quanto?' },
    { titulo: 'Preço antes do valor', inicio: '00:47', trecho: 'Pra cinco profissionais fica R$ 149 por mês', melhor_seria: 'Te falo já, é bem menos do que uma falta por mês. Mas antes: se essas quatro faltas por semana virassem atendimento, quanto entrava a mais no fim do mês?' },
    { titulo: 'Aceitou o "manda no WhatsApp"', inicio: '00:57', trecho: 'Mando sim! Posso te chamar amanhã pra ver o que achou?', melhor_seria: 'Mando sim! Pra não te atrapalhar: amanhã às 10h ou às 15h, qual horário você está sem cliente pra eu te mostrar em 10 minutos?' },
  ],
  momento_chave: { inicio: '00:34', descricao: 'Ela entregou o número de faltas. Era a hora de fazer ela calcular o prejuízo; ao ir direto para o produto, a conversa virou "quanto custa".' },
  perguntas_que_faltaram: [
    'Quando uma cliente falta, aquele horário fica vazio ou dá pra encaixar alguém?',
    'Uma escova ou coloração aí sai por quanto, em média?',
    'Então são umas quatro faltas por semana… quanto isso dá no fim do mês?',
    'E responder esse WhatsApp sozinha enquanto atende, quantas clientes você acha que desistem por demorar?',
  ],
  proxima_ligacao: [
    'Quando o cliente der um número de problema, pare e faça 2 perguntas de implicação antes de falar do produto.',
    'Só fale preço depois que o cliente disser em voz alta quanto o problema custa.',
    'Troque "te mando no WhatsApp" por duas opções de horário para a demonstração.',
  ],
  proximo_passo_com_este_cliente: 'Amanhã às 10h, mande no WhatsApp: "Carla, fiz a conta das 4 faltas da semana: dá uns R$ 1.200 por mês. Te mostro em 10 min como zerar isso, 15h serve?"',
  foco_do_treino: 'Perguntas de Implicação: fazer o cliente calcular o prejuízo',
  evolucao: 'Melhorou bastante a abertura em relação às últimas ligações (antes você já começava apresentando). A Implicação continua sendo a etapa que falta.',
};

const varia = (n, ajuste) => ({
  ...ANALISE, nota_geral: n,
  spin: Object.fromEntries(Object.entries(ANALISE.spin).map(([k, v], i) => [k, { ...v, nota: Math.max(1, Math.min(9.6, +(v.nota + ajuste + (i % 2 ? 0.4 : -0.3)).toFixed(1))) }])),
  habilidades: Object.fromEntries(Object.entries(ANALISE.habilidades).map(([k, v]) => [k, { ...v, nota: Math.max(1, Math.min(9.6, +(v.nota + ajuste).toFixed(1))) }])),
});

let ligacoes = [
  [L(3), 13, 4.6, -1.6, 312, 71], [L(1), 11, 5.3, -0.9, 245, 66], [L(5), 9, 5.0, -1.1, 198, 63], [L(2), 7, 5.9, -0.4, 421, 58],
  [L(4), 5, 6.2, -0.2, 287, 55], [L(1), 3, 7.1, 0.7, 356, 49], [L(3), 2, 6.8, 0.4, 264, 52], [L(0), 0, 6.4, 0, 61, 54],
].map(([lead, d, nota, aj, dur, fala], i) => ({
  id: `lig-${i}`, lead_id: lead.id, produto_id: lead.produto_id, usuario: eu.id, audio_path: `x/${i}.wav`, duracao_seg: dur, origem: 'microfone',
  status: 'pronta', erro: null, transcricao: TRANSCRICAO, analise: i === 7 ? ANALISE : varia(nota, aj), nota, fala_vendedor: fala,
  criado_em: dia(d, 10 + i), analisado_em: dia(d, 10 + i), leads: { nome: lead.nome, nicho: lead.nicho }, perfis: { nome: eu.nome },
}));

const espera = (v, ms = 120) => new Promise(r => setTimeout(() => r(structuredClone(v)), ms));
let audioUrl = null;
function silencio(seg) {
  const n = 8000 * Math.min(seg, 120), v = new DataView(new ArrayBuffer(44 + n * 2));
  const t = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  t(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); t(8, 'WAVE'); t(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); t(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
}

export async function listarLigacoes(leadId) { return espera(ligacoes.filter(l => l.lead_id === leadId).reverse()); }
export async function ligacoesDoTreino({ usuarioId } = {}) { return espera(ligacoes.filter(l => !usuarioId || l.usuario === usuarioId)); }
export async function carregarLigacao(id) { return espera(ligacoes.find(l => l.id === id)); }
export async function linkDoAudio() { audioUrl ||= silencio(61); return audioUrl; }
export async function apagarLigacao(lig) { ligacoes = ligacoes.filter(l => l.id !== lig.id); }
export async function enviarGravacao(lead, _wav, { duracao, origem }) {
  const l = { id: `lig-${Date.now()}`, lead_id: lead.id, produto_id: lead.produto_id, usuario: eu.id, audio_path: 'x', duracao_seg: duracao, origem, status: 'enviada', transcricao: null, analise: null, nota: null, criado_em: new Date().toISOString(), leads: { nome: lead.nome }, perfis: { nome: eu.nome } };
  ligacoes.push(l); return espera(l, 500);
}
export async function pedirCoach() { return espera({ ok: true }, 900); }
export async function processarLigacao(lig, aoAvancar) {
  aoAvancar?.('transcrevendo'); await espera(null, 1200);
  aoAvancar?.('analisando'); await espera(null, 1400);
  const l = ligacoes.find(x => x.id === lig.id);
  Object.assign(l, { status: 'pronta', transcricao: TRANSCRICAO, analise: ANALISE, nota: ANALISE.nota_geral, fala_vendedor: 54 });
  aoAvancar?.('pronta');
  return espera(l);
}
