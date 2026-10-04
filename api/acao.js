// Botões da tela: "Caçar agora", "Ler sinais", "Aprender agora"
import { db, usuarioDaRequisicao, lerCorpo, falha } from './_lib/supabase.js';
import { cacar, enriquecer, aprender, orcamentoGoogle } from './_lib/robos.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'use POST');
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return falha(res, 401, 'faça login com um usuário liberado');
  const { acao, produto_id, lead_id, max } = await lerCorpo(req);
  const cli = db();

  if (acao === 'orcamento') return res.status(200).json(await orcamentoGoogle(cli));

  const { data: produto } = await cli.from('produtos').select('*').eq('id', produto_id).maybeSingle();
  if (!produto) return falha(res, 404, 'produto não encontrado');

  try {
    if (acao === 'cacar') {
      const r = await cacar(cli, produto, {
        chave: process.env.GOOGLE_PLACES_API_KEY, origem: 'manual',
        maxChamadas: Math.max(1, Math.min(Number(max) || 15, 30)), prazo: Date.now() + 40_000,
      });
      if (r.novos) await enriquecer(cli, produto, { limite: 30, prazo: Date.now() + 12_000, origem: 'manual' });
      return res.status(200).json(r);
    }
    if (acao === 'sinais') {
      return res.status(200).json(await enriquecer(cli, produto, { leadId: lead_id || null, limite: 80, prazo: Date.now() + 45_000, origem: 'manual' }));
    }
    if (acao === 'aprender') {
      return res.status(200).json(await aprender(cli, produto));
    }
    return falha(res, 400, 'ação desconhecida');
  } catch (e) {
    return falha(res, 500, e.message);
  }
}
