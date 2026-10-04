// IA de vendas: mensagem personalizada, quebra de objeção, resposta ao lead e dossiê com pesquisa na web
import { db, usuarioDaRequisicao, lerCorpo, falha } from './_lib/supabase.js';
import { gerar, montarPedido } from './_lib/ia.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'use POST');
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return falha(res, 401, 'faça login com um usuário liberado');
  const { acao, lead_id, script_id, entrada } = await lerCorpo(req);
  if (['objecao', 'resposta'].includes(acao) && !String(entrada || '').trim()) return falha(res, 400, 'escreva o que o lead falou');

  const cli = db();
  const { data: lead } = await cli.from('leads').select('*').eq('id', lead_id).maybeSingle();
  if (!lead) return falha(res, 404, 'lead não encontrado');
  const [{ data: produto }, { data: pesos }, { data: historico }, scriptRes] = await Promise.all([
    cli.from('produtos').select('*').eq('id', lead.produto_id).single(),
    cli.from('pesos').select('sinal, rotulo').eq('produto_id', lead.produto_id),
    cli.from('atividades').select('tipo, resultado, texto, criado_em').eq('lead_id', lead.id).order('criado_em', { ascending: false }).limit(8),
    script_id ? cli.from('scripts').select('corpo').eq('id', script_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const mapa = Object.fromEntries((pesos || []).map(p => [p.sinal, p.rotulo]));
  const rotulos = (lead.sinais_ativos || []).filter(s => !s.includes(':')).map(s => mapa[s] || s);

  try {
    const pedido = montarPedido(acao, {
      produto, lead, rotulos, vendedor: usuario.nome, script: scriptRes?.data?.corpo, entrada, historico: historico || [],
    });
    const r = await gerar({ ...pedido, chave: process.env.GEMINI_API_KEY, modelo: process.env.GEMINI_MODEL });
    if (acao === 'dossie') {
      await cli.from('atividades').insert({ lead_id: lead.id, produto_id: lead.produto_id, usuario: usuario.id, tipo: 'nota', resultado: 'dossie', texto: r.texto });
    }
    res.status(200).json(r);
  } catch (e) {
    falha(res, e.status === 429 ? 429 : 500, e.status === 429 ? 'Limite gratuito da IA atingido agora. Tente em 1 minuto.' : e.message);
  }
}
