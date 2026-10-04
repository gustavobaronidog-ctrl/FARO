// Utilitários de tela: temperatura, telefone, scripts, datas

export const TEMPERATURAS = [
  { chave: 'fogo', nome: 'Pegando fogo', curto: 'Fogo', min: 75, cor: 'var(--fogo)' },
  { chave: 'quente', nome: 'Quente', min: 55, cor: 'var(--quente)' },
  { chave: 'morno', nome: 'Morno', min: 35, cor: 'var(--morno)' },
  { chave: 'frio', nome: 'Frio', min: -1, cor: 'var(--frio)' },
];
export function temperatura(score) {
  return TEMPERATURAS.find(t => (score ?? 0) >= t.min) || TEMPERATURAS[3];
}
// cor contínua da escala térmica (0 = azul, 100 = vermelho brasa)
export function corTermica(score) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const paradas = [[0, [62, 124, 177]], [40, [120, 160, 170]], [55, [224, 180, 76]], [72, [240, 122, 58]], [100, [229, 72, 77]]];
  for (let i = 1; i < paradas.length; i++) {
    const [b, cb] = paradas[i], [a, ca] = paradas[i - 1];
    if (s <= b) {
      const t = (s - a) / (b - a);
      const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
      return `rgb(${c.join(',')})`;
    }
  }
  return 'rgb(229,72,77)';
}

export const ESTAGIOS = [
  { chave: 'novo', nome: 'Novo' },
  { chave: 'tentando', nome: 'Tentando contato' },
  { chave: 'conversando', nome: 'Conversando' },
  { chave: 'demo', nome: 'Demonstração' },
  { chave: 'teste', nome: 'Em teste' },
  { chave: 'ganho', nome: 'Fechado' },
  { chave: 'perdido', nome: 'Perdido' },
];
export const nomeEstagio = c => ESTAGIOS.find(e => e.chave === c)?.nome || c;

export const RESULTADOS = [
  { chave: 'nao_atendeu', nome: 'Não atendeu', tecla: '1', tipo: 'neutro' },
  { chave: 'mensagem_enviada', nome: 'Mandei mensagem', tecla: '2', tipo: 'neutro' },
  { chave: 'interessado', nome: 'Interessado', tecla: '3', tipo: 'bom' },
  { chave: 'pediu_retorno', nome: 'Pediu retorno', tecla: '4', tipo: 'bom', pedeData: true },
  { chave: 'agendou_demo', nome: 'Agendou demo', tecla: '5', tipo: 'bom', pedeData: true },
  { chave: 'iniciou_teste', nome: 'Começou o teste', tecla: '6', tipo: 'bom' },
  { chave: 'fechou', nome: 'Fechou!', tecla: '7', tipo: 'otimo' },
  { chave: 'sem_interesse', nome: 'Sem interesse', tecla: '8', tipo: 'ruim', pedeMotivo: true },
  { chave: 'numero_errado', nome: 'Número errado', tecla: '9', tipo: 'ruim' },
  { chave: 'nao_contatar', nome: 'Não ligar mais', tecla: '0', tipo: 'ruim' },
];
export const MOTIVOS_PERDA = ['Achou caro', 'Já usa concorrente', 'Não vê necessidade', 'Sem tempo agora', 'Não é quem decide', 'Fechou o negócio'];

export const ROTULO_RESULTADO = Object.fromEntries([
  ...RESULTADOS.map(r => [r.chave, r.nome]),
  ['caixa_postal', 'Caixa postal'], ['respondeu', 'Respondeu'], ['dossie', 'Dossiê da IA'],
]);

// ---------------------------------------------------------------- telefone
export function formatarTelefone(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  const n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  const ddd = n.slice(0, 2), num = n.slice(2);
  return num.length === 9 ? `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}` : `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}
export const linkLigar = t => `tel:+${String(t || '').replace(/\D/g, '')}`;
export const linkWhatsApp = (t, texto = '') =>
  `https://wa.me/${String(t || '').replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(String(texto).replace(/\*\*(.+?)\*\*/g, '*$1*'))}` : ''}`; // no WhatsApp negrito é *assim*

// ---------------------------------------------------------------- datas
const fmtDia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
export function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso), agora = new Date();
  const dias = Math.round((inicioDia(d) - inicioDia(agora)) / 864e5);
  const h = fmtHora.format(d);
  if (dias === 0) return `hoje, ${h}`;
  if (dias === -1) return `ontem, ${h}`;
  if (dias === 1) return `amanhã, ${h}`;
  if (dias < 0 && dias > -7) return `há ${-dias} dias`;
  return fmtDia.format(d).replace('.', '');
}
function inicioDia(d) {
  const s = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
}
export function atrasado(iso) { return iso && new Date(iso).getTime() < Date.now(); }
export function horaSP(d = new Date()) {
  return Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(d));
}
export function saudacao(d = new Date()) {
  const h = horaSP(d);
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
// sugestões de horário para marcar a demonstração
export function opcoesDeHorario(d = new Date()) {
  const h = horaSP(d);
  const dia = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay();
  const amanha = dia === 6 ? 'segunda' : 'amanhã';
  if (h < 13) return [`hoje às ${Math.max(h + 3, 14)}h`, `${amanha} às 10h`];
  if (h < 16) return [`hoje às ${h + 2}h`, `${amanha} às 10h`];
  return [`${amanha} às 10h`, `${amanha} às 15h`];
}
// valor para <input type=datetime-local> daqui a N dias em um horário
export function dataLocal(dias = 1, hora = 10) {
  const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(hora, 0, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------- scripts
export function primeiroNome(nome) {
  const n = String(nome || '').trim().split(/\s+/)[0] || '';
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : '';
}
export function variaveisDoLead(lead, { produto, perfil } = {}) {
  const nicho = (produto?.nichos || []).find(n => n.chave === lead?.nicho);
  const [h1, h2] = opcoesDeHorario();
  return {
    saudacao: saudacao(), contato: primeiroNome(lead?.responsavel), negocio: lead?.nome || '',
    cidade: lead?.cidade || '', nicho: nicho?.nome?.toLowerCase() || '', vendedor: primeiroNome(perfil?.nome),
    produto: produto?.nome || '', site: produto?.site || '', concorrente: lead?.concorrente || 'outro sistema',
    opcao_horario_1: h1, opcao_horario_2: h2,
  };
}
// Preenche {variaveis}; se alguma estiver vazia, some com ela (e a vírgula/espaço antes)
export function preencher(texto, vars) {
  return String(texto || '')
    .replace(/(,\s*|\s+)?\{(\w+)\}/g, (m, antes, nome) => {
      const v = vars[nome];
      if (v === undefined) return m;
      return v ? `${antes || ''}${v}` : '';
    })
    .replace(/ +([!?.,])/g, '$1')
    .trim();
}
// Melhores scripts para este lead: combina sinal e nicho, depois taxa de sucesso
export function scriptsParaLead(scripts, lead, canal) {
  const sinais = new Set(lead?.sinais_ativos || []);
  return scripts
    .filter(s => s.ativo && s.canal === canal && (!s.nicho || s.nicho === lead?.nicho) && (!s.sinal || sinais.has(s.sinal)))
    .map(s => ({ ...s, _pontos: (s.sinal ? 3 : 0) + (s.nicho ? 2 : 0) + (s.positivos + 1) / (s.usos + 2) }))
    .sort((a, b) => b._pontos - a._pontos || a.ordem - b.ordem);
}
export function taxaScript(s) {
  return s.usos ? Math.round((s.positivos / s.usos) * 100) : null;
}

export const ROTULOS_SINAL_BASICOS = {
  agenda_whatsapp: 'Agenda pelo WhatsApp', novo_negocio: 'Abriu há pouco', estrutura_grande: 'Estrutura grande',
  estrutura_media: 'Estrutura média', celular: 'Tem celular', so_redes: 'Só Instagram/link', sem_site: 'Sem site',
  nota_alta: 'Nota alta', nota_baixa: 'Nota baixa', mei: 'MEI', pequeno: 'Poucas avaliações', agenda_online: 'Já agenda online',
  so_fixo: 'Só fixo', usa_concorrente: 'Usa concorrente', sem_contato: 'Sem telefone', fechado: 'Fechado',
};
export function rotuloSinal(sinal, pesos) {
  return pesos?.find(p => p.sinal === sinal)?.rotulo || ROTULOS_SINAL_BASICOS[sinal] || sinal;
}

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
export const CAPITAIS = [
  ['Rio Branco','AC'],['Maceió','AL'],['Manaus','AM'],['Macapá','AP'],['Salvador','BA'],['Fortaleza','CE'],['Brasília','DF'],
  ['Vitória','ES'],['Goiânia','GO'],['São Luís','MA'],['Belo Horizonte','MG'],['Campo Grande','MS'],['Cuiabá','MT'],['Belém','PA'],
  ['João Pessoa','PB'],['Recife','PE'],['Teresina','PI'],['Curitiba','PR'],['Rio de Janeiro','RJ'],['Natal','RN'],['Porto Velho','RO'],
  ['Boa Vista','RR'],['Porto Alegre','RS'],['Florianópolis','SC'],['Aracaju','SE'],['São Paulo','SP'],['Palmas','TO'],
];

// Texto da IA vem com **negrito** e listas em markdown: mostra limpo, sem os asteriscos
export function textoIA(t) {
  return String(t || '').split(/(\*\*[^*\n]+\*\*)/g).map((parte, i) =>
    /^\*\*[^*]+\*\*$/.test(parte) ? { negrito: true, texto: parte.slice(2, -2), i } : { negrito: false, texto: parte.replace(/^\s*[*-]\s+/gm, '• ').replace(/^#{1,4}\s*/gm, ''), i });
}
