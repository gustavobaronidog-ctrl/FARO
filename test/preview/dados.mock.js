// Substitui src/lib/dados.js na prévia local: mesmos nomes, dados de exemplo em memória
import base from './dados.json';
import spin from './spin.json';

const db = JSON.parse(JSON.stringify(base));
const espera = (v) => new Promise(r => setTimeout(() => r(structuredClone(v)), 60));
let ouvinte = null;
let logado = location.hash.includes('logado') || sessionStorage.getItem('prev-logado') === '1';

export async function sessaoAtual() { return logado ? { user: { id: db.perfil.id, email: db.perfil.email }, access_token: 'x' } : null; }
export function aoMudarSessao(fn) { ouvinte = fn; return () => {}; }
export async function entrar() { logado = true; sessionStorage.setItem('prev-logado', '1'); ouvinte?.(await sessaoAtual()); }
export async function cadastrar() {}
export async function sair() { logado = false; sessionStorage.removeItem('prev-logado'); ouvinte?.(null); }
// prévia como vendedora: abra com #vendedor na primeira vez
if (location.hash.includes('vendedor')) sessionStorage.setItem('prev-papel', 'vendedor');
if (location.hash.includes('administrador')) sessionStorage.removeItem('prev-papel');
const papel = () => sessionStorage.getItem('prev-papel') || 'admin';
export async function meuPerfil() { return espera(papel() === 'vendedor' ? { ...db.perfil, id: 'v-ana', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'vendedor', whatsapp: 'apos_ligacao' } : { ...db.perfil, whatsapp: 'sempre' }); }
export async function reservarLeads() { return 20; }
export async function liberarLeads() { return 7; }
export async function equipeResumo() {
  return { [db.perfil.id]: { na_fila: 31, ligacoes_hoje: 12, atendeu_hoje: 5, positivos_hoje: 3, nota_treino: 6.5 },
           'v-ana': { na_fila: 28, ligacoes_hoje: 18, atendeu_hoje: 7, positivos_hoje: 4, nota_treino: 5.8, gravadas: 6 } };
}
export async function listarProdutos() { return espera(db.produtos); }
export async function salvarProduto(p) { return espera(p); }
export async function resumo() { return espera(db.resumo); }
export async function filaHoje() { return espera(db.fila.map(l => ({ ...l.lead, motivo_fila: l.motivo_fila }))); }
export const POR_PAGINA = 50;
export function semAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
export async function buscarLeads(f) {
  let l = db.leads;
  if (f.estagio === 'abertos') l = l.filter(x => !['ganho', 'perdido'].includes(x.estagio));
  else if (f.estagio) l = l.filter(x => x.estagio === f.estagio);
  if (f.nicho) l = l.filter(x => x.nicho === f.nicho);
  if (f.busca) l = l.filter(x => semAcento(x.nome).includes(semAcento(f.busca)));
  return espera({ leads: l, total: l.length });
}
export async function carregarLead(id) { return espera(db.leads.find(l => l.id === id)); }
export async function atividadesDoLead(id) { return espera(db.atividades.filter(a => a.lead_id === id)); }
export async function registrarResultado(id) { return espera(db.leads.find(l => l.id === id)); }
export async function moverEstagio(id, estagio) { const l = db.leads.find(x => x.id === id); l.estagio = estagio; return espera(l); }
export async function atualizarLead(id) { return carregarLead(id); }
export async function criarLead() { return espera(db.leads[0]); }
export async function anotar() { return espera({}); }
export async function leadsDoFunil() { return espera(db.leads.filter(l => ['tentando', 'conversando', 'demo', 'teste', 'ganho'].includes(l.estagio))); }
export async function listarScripts() { return espera([...spin, ...db.scripts]); }
export async function salvarScript(s) { return espera(s); }
export async function excluirScript() { return null; }
export async function listarPesos() { return espera(db.pesos); }
export async function estatisticas() { return espera(db.estatisticas); }
export async function salvarPeso() {}
export async function listarAlvos() { return espera(db.alvos); }
export async function adicionarAlvos(l) { return espera(l); }
export async function atualizarAlvo() {}
export async function excluirAlvo() {}
export async function ultimasExecucoes() {
  return espera([
    { id: 'e1', tipo: 'google', origem: 'agendado', produto_id: db.produtos[0].id, iniciado_em: new Date(Date.now() - 5 * 3600e3).toISOString(), requisicoes: 30, encontrados: 512, novos: 388, erros: 0, produtos: { nome: 'Tem Encaixe' } },
    { id: 'e2', tipo: 'enriquecimento', origem: 'agendado', produto_id: db.produtos[0].id, iniciado_em: new Date(Date.now() - 4.9 * 3600e3).toISOString(), encontrados: 80, erros: 6, produtos: { nome: 'Tem Encaixe' } },
    { id: 'e3', tipo: 'cnpj', origem: 'agendado', produto_id: db.produtos[0].id, iniciado_em: new Date(Date.now() - 15 * 864e5).toISOString(), encontrados: 3000, novos: 2741, erros: 0, produtos: { nome: 'Tem Encaixe' } },
  ]);
}
export async function lerAjustes() { return espera({ id: 1, google_limite_mensal: 950, google_limite_diario: 30 }); }
export async function salvarAjustes() {}
export async function listarEquipe() {
  return espera([{ ...db.perfil, whatsapp: 'sempre' },
    { id: 'v-ana', nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'vendedor', whatsapp: 'apos_ligacao' },
    { id: 'v-novo', nome: 'Carlos Lima', email: 'carlos@exemplo.com', papel: 'pendente', whatsapp: 'apos_ligacao' }]);
}
export async function atualizarPerfil() {}
export async function pesosPadrao() { return 16; }
export async function acaoRobo() { return espera({ novos: 0, encontrados: 0, requisicoes: 0 }); }
export async function pedirIA({ acao }) {
  await new Promise(r => setTimeout(r, 400));
  return acao === 'objecao'
    ? { texto: '1) RESPOSTA PARA FALAR AGORA\nEntendo! E faz sentido você ter cuidado com gasto agora…\n\n2) PERGUNTA DE VOLTA\nQuantas clientes você acha que deixam de marcar porque a resposta demorou?\n\n3) SE ELE INSISTIR\nFaz o teste de 7 dias sem pagar nada e a gente conversa sexta.' }
    : { texto: 'Boa tarde! Aqui é o Gustavo, do Tem Encaixe…' };
}

export * from './treino.mock.js';
