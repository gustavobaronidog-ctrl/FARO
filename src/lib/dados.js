// Toda conversa com o banco passa por aqui
import { supabase } from './supabase.js';

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ---------------------------------------------------------------- sessão
export async function sessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function aoMudarSessao(fn) {
  const { data } = supabase.auth.onAuthStateChange((_e, s) => fn(s));
  return () => data.subscription.unsubscribe();
}
export async function entrar(email, senha) {
  ok(await supabase.auth.signInWithPassword({ email, password: senha }));
}
export async function cadastrar(email, senha, nome) {
  ok(await supabase.auth.signUp({ email, password: senha, options: { data: { nome } } }));
}
export async function sair() { await supabase.auth.signOut(); }
export async function meuPerfil() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const perfil = ok(await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle());
  if (perfil) return perfil;
  ok(await supabase.rpc('garantir_perfil'));
  return ok(await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle());
}

// ---------------------------------------------------------------- produtos e painel
export async function listarProdutos() {
  return ok(await supabase.from('produtos').select('*').order('criado_em'));
}
export async function salvarProduto(p) {
  const { id, ...resto } = p;
  if (id) return ok(await supabase.from('produtos').update(resto).eq('id', id).select().single());
  return ok(await supabase.from('produtos').insert(resto).select().single());
}
export async function resumo(produtoId) {
  return ok(await supabase.rpc('resumo', { p_produto: produtoId }));
}
export async function filaHoje(produtoId, limite = 60) {
  const linhas = ok(await supabase.rpc('fila_hoje', { p_produto: produtoId, p_limite: limite }));
  return linhas.map(l => ({ ...l.lead, motivo_fila: l.motivo_fila }));
}

// ---------------------------------------------------------------- leads
export const POR_PAGINA = 50;
export async function buscarLeads({ produtoId, busca, temperatura, estagio, nicho, uf, cidade, sinal, fonte, ordem = 'score', pagina = 0 }) {
  let q = supabase.from('leads').select('*', { count: 'exact' }).eq('produto_id', produtoId);
  if (busca) {
    const b = busca.replace(/[%,()]/g, ' ').trim();
    const digitos = b.replace(/\D/g, '');
    q = digitos.length >= 6 ? q.or(`telefone.ilike.%${digitos}%,cnpj.ilike.%${digitos}%`) : q.or(`nome.ilike.%${b}%,responsavel.ilike.%${b}%,bairro.ilike.%${b}%`);
  }
  if (temperatura === 'fogo') q = q.gte('score', 75);
  if (temperatura === 'quente') q = q.gte('score', 55).lt('score', 75);
  if (temperatura === 'morno') q = q.gte('score', 35).lt('score', 55);
  if (temperatura === 'frio') q = q.lt('score', 35);
  if (estagio === 'abertos') q = q.not('estagio', 'in', '(ganho,perdido)');
  else if (estagio) q = q.eq('estagio', estagio);
  if (nicho) q = q.eq('nicho', nicho);
  if (uf) q = q.eq('uf', uf);
  if (cidade) q = q.ilike('cidade_busca', `%${semAcento(cidade)}%`);
  if (sinal) q = q.contains('sinais_ativos', [sinal]);
  if (fonte) q = q.eq('fonte', fonte);
  const ordens = { score: ['score', false], recentes: ['criado_em', false], retorno: ['proxima_acao_em', true], nome: ['nome', true] };
  const [col, asc] = ordens[ordem] || ordens.score;
  q = q.order(col, { ascending: asc, nullsFirst: false }).range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { leads: data, total: count };
}
export function semAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

export async function carregarLead(id) {
  return ok(await supabase.from('leads').select('*').eq('id', id).single());
}
export async function atividadesDoLead(id) {
  return ok(await supabase.from('atividades').select('*, perfis(nome)').eq('lead_id', id).order('criado_em', { ascending: false }).limit(50));
}
export async function registrarResultado(leadId, tipo, resultado, { texto = null, scriptId = null, proxima = null } = {}) {
  return ok(await supabase.rpc('registrar_resultado', {
    p_lead: leadId, p_tipo: tipo, p_resultado: resultado, p_texto: texto, p_script: scriptId, p_proxima: proxima,
  }));
}
export async function moverEstagio(leadId, estagio, motivo = null) {
  return ok(await supabase.rpc('mover_estagio', { p_lead: leadId, p_estagio: estagio, p_motivo: motivo }));
}
export async function atualizarLead(id, patch) {
  const l = ok(await supabase.from('leads').update(patch).eq('id', id).select().single());
  await supabase.rpc('pontuar', { p_produto: l.produto_id, p_lead: id });
  return carregarLead(id);
}
export async function criarLead(produtoId, dados) {
  const tel = String(dados.telefone || '').replace(/\D/g, '');
  const e164 = tel.length === 10 || tel.length === 11 ? '55' + tel : tel || null;
  const l = ok(await supabase.from('leads').insert({
    produto_id: produtoId, fonte: dados.fonte || 'manual', nome: dados.nome, responsavel: dados.responsavel || null,
    nicho: dados.nicho || null, telefone: e164, celular: !!e164 && e164.length === 13 && e164[4] === '9',
    site: dados.site || null, cidade: dados.cidade || null, uf: dados.uf || null, observacoes: dados.observacoes || null,
  }).select().single());
  await supabase.rpc('pontuar', { p_produto: produtoId, p_lead: l.id });
  return carregarLead(l.id);
}
export async function anotar(lead, texto) {
  return ok(await supabase.from('atividades').insert({ lead_id: lead.id, produto_id: lead.produto_id, tipo: 'nota', texto }).select().single());
}
export async function leadsDoFunil(produtoId) {
  return ok(await supabase.from('leads').select('*').eq('produto_id', produtoId)
    .in('estagio', ['tentando', 'conversando', 'demo', 'teste', 'ganho'])
    .order('atualizado_em', { ascending: false }).limit(400));
}

// ---------------------------------------------------------------- scripts
export async function listarScripts(produtoId) {
  return ok(await supabase.from('scripts').select('*').eq('produto_id', produtoId).order('canal').order('ordem'));
}
export async function salvarScript(s) {
  const { id, ...resto } = s;
  resto.atualizado_em = new Date().toISOString();
  if (id) return ok(await supabase.from('scripts').update(resto).eq('id', id).select().single());
  return ok(await supabase.from('scripts').insert(resto).select().single());
}
export async function excluirScript(id) { ok(await supabase.from('scripts').delete().eq('id', id)); }

// ---------------------------------------------------------------- aprendizado
export async function listarPesos(produtoId) {
  return ok(await supabase.from('pesos').select('*').eq('produto_id', produtoId).order('peso_atual', { ascending: false }));
}
export async function estatisticas(produtoId) {
  return ok(await supabase.rpc('estatisticas', { p_produto: produtoId }));
}
export async function salvarPeso(produtoId, sinal, pesoInicial) {
  return ok(await supabase.from('pesos').update({ peso_inicial: pesoInicial }).eq('produto_id', produtoId).eq('sinal', sinal));
}

// ---------------------------------------------------------------- caçada
export async function listarAlvos(produtoId) {
  return ok(await supabase.from('alvos').select('*').eq('produto_id', produtoId).order('prioridade', { ascending: false }).order('cidade'));
}
export async function adicionarAlvos(linhas) {
  return ok(await supabase.from('alvos').upsert(linhas, { onConflict: 'produto_id,consulta,cidade,uf', ignoreDuplicates: true }).select());
}
export async function atualizarAlvo(id, patch) { return ok(await supabase.from('alvos').update(patch).eq('id', id)); }
export async function excluirAlvo(id) { return ok(await supabase.from('alvos').delete().eq('id', id)); }
export async function ultimasExecucoes(limite = 25) {
  return ok(await supabase.from('execucoes').select('*, produtos(nome)').order('iniciado_em', { ascending: false }).limit(limite));
}
export async function lerAjustes() { return ok(await supabase.from('ajustes').select('*').eq('id', 1).single()); }
export async function salvarAjustes(patch) { return ok(await supabase.from('ajustes').update(patch).eq('id', 1)); }

// ---------------------------------------------------------------- equipe
export async function listarEquipe() { return ok(await supabase.from('perfis').select('*').order('criado_em')); }
export async function atualizarPerfil(id, patch) { return ok(await supabase.from('perfis').update(patch).eq('id', id)); }

// ---------------------------------------------------------------- servidor (robôs e IA)
async function chamar(caminho, corpo) {
  const s = await sessaoAtual();
  const r = await fetch(caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token}` },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
export const acaoRobo = (acao, corpo = {}) => chamar('/api/acao', { acao, ...corpo });
export const pedirIA = (corpo) => chamar('/api/ia', corpo);
export async function pesosPadrao(produtoId) { return ok(await supabase.rpc('pesos_padrao', { p_produto: produtoId })); }

// ---------------------------------------------------------------- ligações gravadas e treino
const SEM_TABELA = /ligacoes|schema cache|does not exist|Bucket not found/i;
const avisoBanco = (e) => (SEM_TABELA.test(e.message) ? new Error('Falta rodar o arquivo supabase/03_spin_e_treino.sql no Supabase.') : e);

export async function listarLigacoes(leadId) {
  const { data, error } = await supabase.from('ligacoes').select('*, perfis(nome)').eq('lead_id', leadId).order('criado_em', { ascending: false });
  if (error) throw avisoBanco(error);
  return data;
}
export async function ligacoesDoTreino({ usuarioId = null, dias = 120 } = {}) {
  let q = supabase.from('ligacoes')
    .select('id, lead_id, usuario, nota, analise, fala_vendedor, duracao_seg, status, criado_em, leads(nome, nicho), perfis(nome)')
    .gte('criado_em', new Date(Date.now() - dias * 864e5).toISOString())
    .order('criado_em', { ascending: true });
  if (usuarioId) q = q.eq('usuario', usuarioId);
  const { data, error } = await q;
  if (error) throw avisoBanco(error);
  return data;
}
export async function enviarGravacao(lead, wav, { duracao, origem }) {
  const caminho = `${lead.produto_id}/${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  const up = await supabase.storage.from('gravacoes').upload(caminho, wav, { contentType: 'audio/wav', upsert: false });
  if (up.error) throw avisoBanco(up.error);
  const { data, error } = await supabase.from('ligacoes')
    .insert({ lead_id: lead.id, produto_id: lead.produto_id, audio_path: caminho, duracao_seg: duracao, origem })
    .select('*, perfis(nome)').single();
  if (error) { await supabase.storage.from('gravacoes').remove([caminho]); throw avisoBanco(error); }
  return data;
}
export async function linkDoAudio(caminho) {
  const { data, error } = await supabase.storage.from('gravacoes').createSignedUrl(caminho, 60 * 60 * 6);
  if (error) throw avisoBanco(error);
  return data.signedUrl;
}
export async function carregarLigacao(id) {
  return ok(await supabase.from('ligacoes').select('*, perfis(nome), leads(nome, nicho, responsavel)').eq('id', id).single());
}
export async function apagarLigacao(lig) {
  await supabase.storage.from('gravacoes').remove([lig.audio_path]);
  ok(await supabase.from('ligacoes').delete().eq('id', lig.id));
}
export const pedirCoach = (acao, ligacaoId) => chamar('/api/coach', { acao, ligacao_id: ligacaoId });
// Transcreve (se ainda não transcreveu) e analisa. Retoma de onde parou se der erro no meio.
export async function processarLigacao(lig, aoAvancar) {
  if (!Array.isArray(lig.transcricao) || lig.transcricao.length < 2) {
    aoAvancar?.('transcrevendo');
    await pedirCoach('transcrever', lig.id);
  }
  aoAvancar?.('analisando');
  await pedirCoach('analisar', lig.id);
  aoAvancar?.('pronta');
  return carregarLigacao(lig.id);
}

// ---------------------------------------------------------------- equipe (fila separada por pessoa)
export async function reservarLeads(produtoId, quantos = 40) {
  const { data, error } = await supabase.rpc('reservar_leads', { p_produto: produtoId, p_quantos: quantos });
  if (error && !/reservar_leads|schema cache/i.test(error.message)) throw new Error(error.message);
  return data ?? null; // null = banco ainda sem o arquivo 04 (a fila funciona como antes)
}
export async function liberarLeads(usuarioId) { return ok(await supabase.rpc('liberar_leads', { p_usuario: usuarioId })); }
export async function equipeResumo(produtoId) {
  const { data, error } = await supabase.rpc('equipe_resumo', { p_produto: produtoId });
  if (error) return {};
  return data || {};
}
