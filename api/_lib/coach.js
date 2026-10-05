// Treinador de vendas: transcreve a ligação gravada e analisa com o método SPIN (Gemini)
import { MODELOS } from './ia.js';

export const LIMITE_AUDIO = 31 * 1024 * 1024;   // ~32 min em WAV de telefone (8 kHz mono)
const LIMITE_DIRETO = 13 * 1024 * 1024;          // até aqui o áudio vai junto no pedido; acima, sobe antes para o Gemini

// Parte do pedido com o áudio: direto no corpo (até ~13 MB) ou pelo envio de arquivos do Gemini
export async function parteDeAudio(bytes, mime, { chave, fetchImpl = fetch }) {
  if (bytes.length <= LIMITE_DIRETO) return { inline_data: { mime_type: mime, data: bytes.toString('base64') } };
  const base = 'https://generativelanguage.googleapis.com';
  const inicio = await fetchImpl(`${base}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': chave, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'ligacao' } }),
  });
  const destino = inicio.headers.get('x-goog-upload-url');
  if (!inicio.ok || !destino) throw Object.assign(new Error(`Gemini não aceitou o envio do áudio (HTTP ${inicio.status})`), { status: inicio.status === 429 ? 429 : 502 });
  const envio = await fetchImpl(destino, {
    method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(bytes.length) }, body: bytes,
  });
  const j = await envio.json().catch(() => ({}));
  let arq = j.file;
  if (!envio.ok || !arq?.uri) throw Object.assign(new Error('Falha ao enviar o áudio para a IA'), { status: 502 });
  for (let i = 0; i < 20 && arq.state === 'PROCESSING'; i++) {
    await new Promise(r => setTimeout(r, 1000));
    arq = await (await fetchImpl(`${base}/v1beta/${arq.name}`, { headers: { 'x-goog-api-key': chave } })).json();
  }
  if (arq.state === 'FAILED') throw Object.assign(new Error('A IA não conseguiu ler esse áudio'), { status: 422 });
  return { file_data: { mime_type: mime, file_uri: arq.uri } };
}

// Chamada ao Gemini que devolve JSON no formato pedido (com troca automática de modelo, igual ao assistente)
export async function gerarJSON({ sistema, partes, esquema, chave, modelo, temperatura = 0.3, maxTokens = 32768, fetchImpl = fetch }) {
  if (!chave) { const e = new Error('Falta GEMINI_API_KEY nas variáveis da Vercel'); e.status = 500; throw e; }
  const fila = [...new Set([modelo, ...MODELOS].filter(Boolean))];
  let ultimo;
  for (const m of fila) {
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: partes }],
        generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens, responseMimeType: 'application/json', responseSchema: esquema },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j?.error?.message || `Gemini HTTP ${r.status}`); e.status = r.status; ultimo = e;
      if (r.status === 404 || (r.status === 400 && /model/i.test(e.message))) continue; // modelo aposentado: tenta o próximo
      throw e;
    }
    const texto = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    try { return { dados: JSON.parse(texto), modelo: m }; }
    catch {
      const e = new Error(j.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'A ligação é longa demais para analisar de uma vez.' : 'A IA devolveu uma resposta incompleta. Tente de novo.');
      e.status = 502; throw e;
    }
  }
  throw ultimo;
}

// ------------------------------------------------------------------ 1. transcrição
export const ESQUEMA_TRANSCRICAO = {
  type: 'OBJECT',
  properties: {
    falas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          quem: { type: 'STRING', enum: ['vendedor', 'cliente'] },
          inicio: { type: 'STRING', description: 'minuto:segundo em que a fala começa, ex.: 01:07' },
          texto: { type: 'STRING' },
        },
        required: ['quem', 'inicio', 'texto'],
      },
    },
    teve_conversa: { type: 'BOOLEAN', description: 'false se for caixa postal, silêncio ou ninguém atendeu' },
  },
  required: ['falas', 'teve_conversa'],
};

export function pedidoTranscricao({ vendedor, produto }) {
  return `Transcreva esta ligação de vendas, em português do Brasil, palavra por palavra.
O VENDEDOR é quem ligou${vendedor ? ` (${vendedor})` : ''} e apresenta o ${produto}. O CLIENTE é o dono ou funcionário do negócio que atendeu.
Separe cada fala na ordem em que acontece, marcando quem falou e o minuto:segundo em que começou.
Mantenha o jeito de falar (gírias, "né", "tipo") mas corrija o que for claramente erro de áudio.
Se um trecho estiver inaudível, escreva [inaudível]. Não resuma, não invente e não comente nada.`;
}

// % das palavras ditas pelo vendedor (bom vendedor de SPIN fala menos que o cliente)
export function falaDoVendedor(falas = []) {
  let v = 0, t = 0;
  for (const f of falas) { const n = String(f.texto || '').split(/\s+/).filter(Boolean).length; t += n; if (f.quem === 'vendedor') v += n; }
  return t ? Math.round((v / t) * 100) : null;
}

// ------------------------------------------------------------------ 2. análise
const NOTA = (descricao) => ({ type: 'NUMBER', description: `${descricao} De 0 a 10, com uma casa decimal.` });
const CRITERIO = (descricao) => ({
  type: 'OBJECT',
  properties: { nota: NOTA(descricao), comentario: { type: 'STRING', description: '1 ou 2 frases diretas, citando o que aconteceu na ligação' } },
  required: ['nota', 'comentario'],
});

export const ESQUEMA_ANALISE = {
  type: 'OBJECT',
  properties: {
    nota_geral: NOTA('Nota da ligação como um todo.'),
    resumo: { type: 'STRING', description: 'O que aconteceu na ligação em 1 ou 2 frases.' },
    veredito: { type: 'STRING', description: 'Uma frase de técnico, curta e marcante, sobre a ligação.' },
    spin: {
      type: 'OBJECT',
      properties: {
        situacao: CRITERIO('S: fez perguntas para entender como o negócio funciona hoje, sem exagerar?'),
        problema: CRITERIO('P: fez o cliente falar das dificuldades com as palavras dele?'),
        implicacao: CRITERIO('I: levou o cliente a perceber sozinho quanto o problema custa (dinheiro, tempo, clientes perdidos)?'),
        necessidade: CRITERIO('N: fez o cliente dizer que quer resolver e o valor de resolver?'),
      },
      required: ['situacao', 'problema', 'implicacao', 'necessidade'],
    },
    habilidades: {
      type: 'OBJECT',
      properties: {
        abertura: CRITERIO('Abertura: passou confiança e conseguiu permissão para conversar?'),
        escuta: CRITERIO('Escuta: deixou o cliente falar, não interrompeu, aproveitou o que ele disse?'),
        objecoes: CRITERIO('Objeções: tratou as resistências validando e devolvendo com pergunta? Se não houve objeção, avalie como lidou com hesitações.'),
        fechamento: CRITERIO('Fechamento: pediu um próximo passo concreto (dia e horário) com segurança?'),
        tom: CRITERIO('Tom e energia: firme, entusiasmado, sem soar ansioso nem robótico?'),
      },
      required: ['abertura', 'escuta', 'objecoes', 'fechamento', 'tom'],
    },
    pontos_fortes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          titulo: { type: 'STRING' },
          inicio: { type: 'STRING', description: 'minuto:segundo do trecho, copiado da transcrição' },
          trecho: { type: 'STRING', description: 'frase exata da transcrição' },
          por_que: { type: 'STRING', description: 'por que funcionou, em 1 frase' },
        },
        required: ['titulo', 'trecho', 'por_que'],
      },
    },
    pontos_fracos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          titulo: { type: 'STRING' },
          inicio: { type: 'STRING', description: 'minuto:segundo do trecho, copiado da transcrição' },
          trecho: { type: 'STRING', description: 'frase exata da transcrição' },
          melhor_seria: { type: 'STRING', description: 'exatamente o que ele poderia ter falado no lugar, pronto para usar' },
        },
        required: ['titulo', 'trecho', 'melhor_seria'],
      },
    },
    momento_chave: {
      type: 'OBJECT',
      properties: { inicio: { type: 'STRING' }, descricao: { type: 'STRING', description: 'o momento em que a venda foi ganha ou perdida' } },
      required: ['descricao'],
    },
    perguntas_que_faltaram: { type: 'ARRAY', items: { type: 'STRING' }, description: 'perguntas SPIN que teriam feito diferença nesta conversa, prontas para falar' },
    proxima_ligacao: { type: 'ARRAY', items: { type: 'STRING' }, description: '3 orientações práticas para a próxima ligação' },
    proximo_passo_com_este_cliente: { type: 'STRING', description: 'o que fazer agora com este lead específico' },
    foco_do_treino: { type: 'STRING', description: 'a UMA habilidade para treinar a partir de agora, em poucas palavras' },
    evolucao: { type: 'STRING', description: 'comparação com as ligações anteriores (se houver): o que melhorou e o que continua igual' },
  },
  required: ['nota_geral', 'resumo', 'veredito', 'spin', 'habilidades', 'pontos_fortes', 'pontos_fracos', 'momento_chave',
    'perguntas_que_faltaram', 'proxima_ligacao', 'proximo_passo_com_este_cliente', 'foco_do_treino', 'evolucao'],
};

export const SISTEMA_TREINADOR = `Você é um treinador de vendas de elite, especialista em SPIN Selling (Neil Rackham) e em prospecção por telefone de pequenos negócios no Brasil.
Seu trabalho é transformar o vendedor num profissional de alto nível, ligação após ligação.
Você é direto e exigente como um bom técnico: elogia o que merece, aponta o erro sem rodeio e sempre mostra exatamente o que falar no lugar.
Avalie com rigor: 5 é uma ligação mediana, 8 é muito boa, 10 é raro. Não infle nota.
O vendedor vende para quem realmente precisa: o objetivo é o cliente perceber sozinho o custo do problema dele e decidir com clareza.
Nunca sugira mentir, inventar números, prometer o que o produto não faz ou pressionar quem claramente não tem a necessidade.
Use só o que está na transcrição: não invente falas. Escreva em português do Brasil, como gente fala.`;

export function pedidoAnalise({ produto, lead, vendedor, falas, falaVendedor, duracaoSeg, anteriores = [] }) {
  const conversa = falas.map(f => `[${f.inicio}] ${f.quem === 'vendedor' ? 'VENDEDOR' : 'CLIENTE'}: ${f.texto}`).join('\n');
  const historico = anteriores.length
    ? anteriores.map(a => `- ${String(a.criado_em).slice(0, 10)}: nota ${a.nota ?? '?'}; foco indicado: ${a.analise?.foco_do_treino || '-'}; SPIN S${a.analise?.spin?.situacao?.nota ?? '?'} P${a.analise?.spin?.problema?.nota ?? '?'} I${a.analise?.spin?.implicacao?.nota ?? '?'} N${a.analise?.spin?.necessidade?.nota ?? '?'}`).join('\n')
    : 'Esta é a primeira ligação analisada deste vendedor.';
  return `PRODUTO QUE ELE VENDE: ${produto.nome}
${produto.pitch || ''}

LEAD: ${lead.nome}${lead.nicho ? ` (${lead.nicho})` : ''}${lead.cidade ? `, ${lead.cidade}/${lead.uf || ''}` : ''}
VENDEDOR: ${vendedor || 'vendedor'}
DURAÇÃO: ${duracaoSeg ? `${Math.floor(duracaoSeg / 60)} min ${duracaoSeg % 60} s` : 'não informada'}
O VENDEDOR FALOU ${falaVendedor ?? '?'}% DAS PALAVRAS (no SPIN, o ideal é o cliente falar mais).

LIGAÇÕES ANTERIORES DESTE VENDEDOR (mais recente primeiro):
${historico}

TRANSCRIÇÃO:
${conversa}

Analise esta ligação. Dê de 2 a 4 pontos fortes e de 2 a 4 pontos fracos, sempre com o trecho exato e o minuto.
Em "melhor_seria" e "perguntas_que_faltaram", escreva frases prontas para ele falar na próxima ligação, adaptadas ao nicho desse cliente.
Se a ligação não chegou a ter conversa de venda (atendeu e desligou, pediu para ligar depois), avalie só o que deu para fazer e diga o que tentar na próxima.`;
}

// Garante números entre 0 e 10 com uma casa
export function limparNota(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(Math.max(0, Math.min(10, x)) * 10) / 10 : null;
}
