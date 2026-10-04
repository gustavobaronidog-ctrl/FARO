// Assistente de vendas com IA (Gemini — camada gratuita do Google AI Studio)

// Modelos tentados em ordem. "gemini-flash-latest" é o apelido oficial do Google que sempre aponta
// para o Flash mais novo, então não quebra quando um modelo é aposentado.
// Dá para fixar outro com a variável GEMINI_MODEL na Vercel.
export const MODELOS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];

export async function gerar({ sistema, prompt, pesquisarNaWeb = false, chave, modelo, fetchImpl = fetch }) {
  if (!chave) throw new Error('Falta GEMINI_API_KEY nas variáveis da Vercel');
  const tentativa = async (m, comPesquisa) => {
    const corpo = {
      systemInstruction: { parts: [{ text: sistema + (pesquisarNaWeb && !comPesquisa ? '\nVocê NÃO tem acesso à internet agora: use só os dados do lead e deixe claro o que o vendedor deve conferir no Instagram/Google antes de ligar.' : '') }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };
    if (comPesquisa) corpo.tools = [{ google_search: {} }];
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j?.error?.message || `Gemini HTTP ${r.status}`); e.status = r.status; throw e; }
    const partes = j.candidates?.[0]?.content?.parts || [];
    const texto = partes.filter(p => !p.thought).map(p => p.text || '').join('').trim();
    const fontes = (j.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .map(c => c.web).filter(Boolean).map(w => ({ titulo: w.title, url: w.uri })).slice(0, 6);
    if (!texto) { const e = new Error('A IA não devolveu texto. Tente de novo.'); e.status = 502; throw e; }
    return { texto, fontes, modelo: m, pesquisou: comPesquisa };
  };
  const fila = [...new Set([modelo, ...MODELOS].filter(Boolean))];
  let ultimo;
  for (const m of fila) {
    try { return await tentativa(m, pesquisarNaWeb); }
    catch (e) {
      ultimo = e;
      // modelo aposentado ou inexistente para esta chave: tenta o próximo
      if (e.status === 404 || (e.status === 400 && /model/i.test(e.message) && !/search|grounding|tool/i.test(e.message))) continue;
      // a camada grátis pode não liberar a pesquisa no Google: refaz sem pesquisa
      if (pesquisarNaWeb && [400, 403, 429].includes(e.status)) {
        try { return await tentativa(m, false); } catch (e2) { ultimo = e2; if (e2.status === 404) continue; throw e2; }
      }
      throw e;
    }
  }
  throw ultimo;
}

function fichaDoLead(lead, rotulos) {
  const linhas = [
    `Negócio: ${lead.nome}`,
    lead.responsavel && `Responsável: ${lead.responsavel}`,
    lead.nicho && `Nicho: ${lead.nicho}`,
    (lead.cidade || lead.uf) && `Cidade: ${[lead.cidade, lead.uf].filter(Boolean).join('/')}`,
    lead.nota != null && `Google: nota ${lead.nota} com ${lead.avaliacoes ?? 0} avaliações`,
    lead.aberto_em && `Empresa aberta em: ${lead.aberto_em}`,
    lead.site && `Site/link: ${lead.site}`,
    lead.instagram && `Instagram: @${lead.instagram}`,
    lead.concorrente && `Já usa o sistema concorrente: ${lead.concorrente}`,
    rotulos.length && `Sinais detectados: ${rotulos.join('; ')}`,
    `Estágio no funil: ${lead.estagio}; tentativas de contato: ${lead.tentativas}`,
    lead.observacoes && `Anotações: ${lead.observacoes}`,
  ];
  return linhas.filter(Boolean).join('\n');
}

const REGRAS = `Você é um vendedor brasileiro experiente em prospecção ativa (ligação e WhatsApp) para pequenos negócios.
Escreva em português do Brasil, natural, como gente fala — nada de linguagem de robô, nada de "Prezado".
Seja curto e direto. Nunca invente funcionalidades, preços, números ou fatos que não estejam nas informações do produto ou do lead.
Não use hashtags. No WhatsApp, no máximo 1 ou 2 emojis.`;

export function montarPedido(acao, { produto, lead, rotulos = [], vendedor, script, entrada, historico = [] }) {
  const contexto = `PRODUTO QUE VOCÊ VENDE: ${produto.nome}\n${produto.pitch || ''}\nSite: ${produto.site || '-'}\n\nLEAD:\n${fichaDoLead(lead, rotulos)}`
    + (historico.length ? `\n\nHISTÓRICO DE CONTATO (mais recente primeiro):\n${historico.map(h => `- ${h.criado_em?.slice(0, 10)} ${h.tipo} ${h.resultado || ''} ${h.texto || ''}`).join('\n')}` : '');
  switch (acao) {
    case 'mensagem':
      return {
        sistema: REGRAS, pesquisarNaWeb: false,
        prompt: `${contexto}\n\n${script ? `MODELO BASE (adapte, não copie igual):\n${script}\n\n` : ''}Escreva a PRIMEIRA mensagem de WhatsApp para esse lead, assinando como ${vendedor || 'o vendedor'}.
Use os sinais detectados para personalizar (ex.: se agenda pelo WhatsApp, fale disso; se abriu há pouco, parabenize).
No máximo 5 linhas curtas. Termine com UMA pergunta fácil de responder. Responda só com a mensagem, sem comentários.`,
      };
    case 'objecao':
      return {
        sistema: REGRAS, pesquisarNaWeb: false,
        prompt: `${contexto}\n\nO lead acabou de dizer: "${entrada}"\n\nMe dê:
1) RESPOSTA PARA FALAR AGORA (2 a 4 frases, tom de conversa, que valide a preocupação e reposicione o valor)
2) PERGUNTA DE VOLTA (uma pergunta que mantenha a conversa andando)
3) SE ELE INSISTIR (uma saída elegante que deixe a porta aberta — teste grátis, retorno marcado)
Use exatamente esses três títulos.`,
      };
    case 'resposta':
      return {
        sistema: REGRAS, pesquisarNaWeb: false,
        prompt: `${contexto}\n\nO lead respondeu no WhatsApp:\n"""${entrada}"""\n\nEscreva a melhor resposta para levar a conversa para uma demonstração rápida ou para o teste grátis. Máximo 5 linhas. Responda só com a mensagem.`,
      };
    case 'dossie':
      return {
        sistema: `${REGRAS}\nVocê está preparando um vendedor para uma ligação. Pesquise o negócio na internet antes de responder.`,
        pesquisarNaWeb: true,
        prompt: `${contexto}\n\nPesquise este negócio na internet (Instagram, Google, site, reportagens) e me entregue, em tópicos curtos:
**Quem é**: o que fazem, tamanho aparente (equipe, unidades), público.
**Como agendam hoje**: o que dá para perceber (WhatsApp, link, sistema, telefone).
**Dores prováveis**: 2 ou 3, ligadas ao que o ${produto.nome} resolve.
**Gancho de abertura**: uma frase para abrir a ligação mostrando que você conhece o negócio.
**Cuidado com**: algo que pode virar objeção.
Se não encontrar informação confiável sobre algo, diga "não encontrei" — não invente.`,
      };
    default:
      throw new Error('ação de IA desconhecida');
  }
}
