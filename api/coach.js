// Treinador de vendas: { acao: 'transcrever' | 'analisar', ligacao_id }
// São dois passos separados para cada um caber no tempo de uma função da Vercel.
import { db, usuarioDaRequisicao, lerCorpo, falha } from './_lib/supabase.js';
import {
  gerarJSON, parteDeAudio, ESQUEMA_TRANSCRICAO, ESQUEMA_ANALISE, SISTEMA_TREINADOR, LIMITE_AUDIO,
  pedidoTranscricao, pedidoAnalise, falaDoVendedor, limparNota,
} from './_lib/coach.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'use POST');
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return falha(res, 401, 'faça login com um usuário liberado');
  const { acao, ligacao_id } = await lerCorpo(req);
  if (!['transcrever', 'analisar'].includes(acao)) return falha(res, 400, 'ação desconhecida');

  const cli = db();
  const { data: lig } = await cli.from('ligacoes').select('*').eq('id', ligacao_id).maybeSingle();
  if (!lig) return falha(res, 404, 'gravação não encontrada');
  const [{ data: lead }, { data: produto }, { data: dono }] = await Promise.all([
    cli.from('leads').select('*').eq('id', lig.lead_id).single(),
    cli.from('produtos').select('*').eq('id', lig.produto_id).single(),
    lig.usuario ? cli.from('perfis').select('nome').eq('id', lig.usuario).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const vendedor = dono?.nome || usuario.nome;
  const ia = { chave: process.env.GEMINI_API_KEY, modelo: process.env.GEMINI_MODEL };
  const marcar = (patch) => cli.from('ligacoes').update(patch).eq('id', lig.id);

  try {
    if (acao === 'transcrever') {
      await marcar({ status: 'transcrevendo', erro: null });
      const { data: arquivo, error } = await cli.storage.from('gravacoes').download(lig.audio_path);
      if (error || !arquivo) throw Object.assign(new Error('Não achei o áudio no armazenamento. Envie de novo.'), { status: 404 });
      const bytes = Buffer.from(await arquivo.arrayBuffer());
      if (bytes.length > LIMITE_AUDIO) throw Object.assign(new Error('Áudio longo demais (o limite é perto de 30 minutos).'), { status: 413 });
      const audio = await parteDeAudio(bytes, 'audio/wav', ia);

      const { dados } = await gerarJSON({
        ...ia, sistema: 'Você é um transcritor profissional de ligações telefônicas em português do Brasil.',
        partes: [audio, { text: pedidoTranscricao({ vendedor, produto: produto.nome }) }],
        esquema: ESQUEMA_TRANSCRICAO, temperatura: 0,
      });
      const falas = (dados.falas || []).filter(f => String(f.texto || '').trim());
      if (!dados.teve_conversa || falas.length < 2) {
        await marcar({ status: 'erro', erro: 'Não deu para ouvir uma conversa nesse áudio (caixa postal, silêncio ou só um lado gravado).', transcricao: falas });
        return falha(res, 422, 'Não deu para ouvir uma conversa nesse áudio. Se gravou pelo microfone, deixe a ligação no viva-voz.');
      }
      await marcar({ status: 'analisando', transcricao: falas, fala_vendedor: falaDoVendedor(falas) });
      return res.status(200).json({ ok: true, falas: falas.length });
    }

    // analisar
    if (!Array.isArray(lig.transcricao) || lig.transcricao.length < 2) return falha(res, 409, 'transcreva a ligação primeiro');
    await marcar({ status: 'analisando', erro: null });
    const { data: anteriores } = await cli.from('ligacoes').select('nota, analise, criado_em')
      .eq('usuario', lig.usuario).eq('status', 'pronta').neq('id', lig.id).order('criado_em', { ascending: false }).limit(5);
    const nicho = produto.nichos?.find(n => n.chave === lead.nicho)?.nome;
    const { dados: a } = await gerarJSON({
      ...ia, sistema: SISTEMA_TREINADOR, temperatura: 0.4,
      partes: [{ text: pedidoAnalise({ produto, lead: { ...lead, nicho }, vendedor, falas: lig.transcricao, falaVendedor: lig.fala_vendedor, duracaoSeg: lig.duracao_seg, anteriores: anteriores || [] }) }],
      esquema: ESQUEMA_ANALISE,
    });
    a.nota_geral = limparNota(a.nota_geral);
    for (const grupo of [a.spin, a.habilidades]) for (const k in grupo || {}) grupo[k].nota = limparNota(grupo[k].nota);

    await marcar({ status: 'pronta', analise: a, nota: a.nota_geral, analisado_em: new Date().toISOString() });
    await cli.from('atividades').insert({
      lead_id: lead.id, produto_id: lead.produto_id, usuario: lig.usuario, tipo: 'nota', resultado: 'analise_ligacao',
      texto: `**Nota ${String(a.nota_geral).replace('.', ',')}**: ${a.resumo}\n**Próximo passo:** ${a.proximo_passo_com_este_cliente}`,
    });
    return res.status(200).json({ ok: true, analise: a });
  } catch (e) {
    const limite = e.status === 429;
    const msg = limite ? 'Limite gratuito da IA atingido agora. Tente de novo em 1 minuto.' : e.message;
    await marcar({ status: 'erro', erro: msg });
    return falha(res, limite ? 429 : e.status && e.status < 600 && e.status >= 400 ? e.status : 500, msg);
  }
}
