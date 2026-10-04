// Os três robôs do Faro: caçar (Google), ler sinais (sites) e aprender (resultados).
// Recebem o cliente do banco como parâmetro para poderem ser testados sem internet.
import { buscarPagina, placeParaLead, montarConsulta } from './google.js';
import { lerSinais } from './sinais.js';
import { ajustarModelo } from './modelo.js';

function inicioDoMesSP(agora = new Date()) {
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const deslocamento = agora.getTime() - sp.getTime();
  return new Date(new Date(sp.getFullYear(), sp.getMonth(), 1).getTime() + deslocamento);
}

function inicioDoDiaSP(agora = new Date()) {
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const deslocamento = agora.getTime() - sp.getTime();
  return new Date(new Date(sp.getFullYear(), sp.getMonth(), sp.getDate()).getTime() + deslocamento);
}

async function chamadasGoogleDesde(db, desde) {
  const { data, error } = await db.from('execucoes').select('requisicoes').eq('tipo', 'google').gte('iniciado_em', desde.toISOString());
  if (error) throw error;
  return (data || []).reduce((s, e) => s + (e.requisicoes || 0), 0);
}

// Quantas chamadas ao Google ainda podemos fazer sem sair da cota grátis
export async function orcamentoGoogle(db, agora = new Date()) {
  const { data: aj } = await db.from('ajustes').select('*').eq('id', 1).maybeSingle();
  const limMes = aj?.google_limite_mensal ?? 950, limDia = aj?.google_limite_diario ?? 30;
  const usadoMes = await chamadasGoogleDesde(db, inicioDoMesSP(agora));
  const usadoDia = await chamadasGoogleDesde(db, inicioDoDiaSP(agora));
  return { restante: Math.max(0, Math.min(limMes - usadoMes, limDia - usadoDia)), usadoMes, usadoDia, limMes, limDia };
}

// ------------------------------------------------------------------ CAÇAR
export async function cacar(db, produto, { chave, maxChamadas = Infinity, prazo = Date.now() + 45_000, origem = 'agendado', fetchImpl } = {}) {
  if (!chave) return { pulado: 'Sem GOOGLE_PLACES_API_KEY configurada' };
  const orc = await orcamentoGoogle(db);
  let restante = Math.min(orc.restante, maxChamadas);
  if (restante <= 0) return { pulado: 'Cota grátis do Google do dia/mês já usada', orcamento: orc };

  const paginas = Math.max(1, Math.min(3, produto.config?.google_paginas ?? 3));
  const trintaDias = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: alvos, error } = await db.from('alvos').select('*')
    .eq('produto_id', produto.id).eq('ativo', true)
    .or(`ultima_busca.is.null,ultima_busca.lt.${trintaDias}`)
    .order('ultima_busca', { ascending: true, nullsFirst: true })
    .order('prioridade', { ascending: false })
    .limit(40);
  if (error) throw error;

  const { data: exec } = await db.from('execucoes').insert({ produto_id: produto.id, tipo: 'google', origem }).select('id').single();
  const total = { requisicoes: 0, encontrados: 0, novos: 0, duplicados: 0, erros: 0, alvos: [] };
  const salvarExecucao = () => db.from('execucoes').update({
    finalizado_em: new Date().toISOString(), requisicoes: total.requisicoes, encontrados: total.encontrados,
    novos: total.novos, duplicados: total.duplicados, erros: total.erros, detalhe: { alvos: total.alvos.slice(0, 50) },
  }).eq('id', exec.id);

  try {
    for (const alvo of alvos || []) {
      if (restante <= 0 || Date.now() > prazo) break;
      let token = null, achados = [], erroAlvo = null;
      for (let p = 0; p < paginas && restante > 0; p++) {
        try {
          const r = await buscarPagina({ consulta: montarConsulta(alvo), chave, pageToken: token, fetchImpl });
          total.requisicoes++; restante--;
          achados.push(...r.places.map(pl => placeParaLead(pl, alvo)));
          token = r.proxima;
          // salva o consumo a cada chamada: se a função cair no meio, a cota continua certa
          await db.from('execucoes').update({ requisicoes: total.requisicoes }).eq('id', exec.id);
          if (!token) break;
          await new Promise(res => setTimeout(res, 1500)); // o Google pede um intervalo antes de usar o token
        } catch (e) {
          total.erros++; erroAlvo = e.message;
          if (e.status === 403 || e.status === 400) { restante = 0; } // chave inválida/sem faturamento: para tudo
          break;
        }
      }
      let r = { novos: 0, duplicados: 0 };
      if (achados.length) {
        const { data, error: e2 } = await db.rpc('ingerir_leads', { p_produto: produto.id, p_leads: achados });
        if (e2) { total.erros++; erroAlvo = e2.message; } else r = data;
      }
      total.encontrados += achados.length; total.novos += r.novos || 0; total.duplicados += r.duplicados || 0;
      total.alvos.push({ consulta: montarConsulta(alvo), achados: achados.length, novos: r.novos || 0, erro: erroAlvo });
      await db.from('alvos').update({
        ultima_busca: new Date().toISOString(), buscas: (alvo.buscas || 0) + 1,
        encontrados: (alvo.encontrados || 0) + achados.length, novos: (alvo.novos || 0) + (r.novos || 0),
      }).eq('id', alvo.id);
    }
  } finally {
    await salvarExecucao();
  }
  return total;
}

// ------------------------------------------------------------------ LER SINAIS
export async function enriquecer(db, produto, { limite = 60, prazo = Date.now() + 40_000, leadId = null, origem = 'agendado', fetchImpl } = {}) {
  let q = db.from('leads').select('id, site, sinais').eq('produto_id', produto.id);
  q = leadId ? q.eq('id', leadId) : q.is('enriquecido_em', null).order('score', { ascending: false }).limit(limite);
  const { data: leads, error } = await q;
  if (error) throw error;
  const total = { analisados: 0, whatsapp: 0, concorrente: 0, erros: 0 };
  const fila = [...(leads || [])];
  const trabalhador = async () => {
    while (fila.length && Date.now() < prazo) {
      const l = fila.shift();
      const r = await lerSinais(l, produto.concorrentes || [], { fetchImpl });
      const patch = { sinais: r.sinais, concorrente: r.concorrente, enriquecido_em: new Date().toISOString(), enriquecimento_erro: r.erro };
      if (r.instagram) patch.instagram = r.instagram;
      if (r.email) patch.email = r.email;
      await db.from('leads').update(patch).eq('id', l.id);
      total.analisados++; if (r.sinais.whatsapp) total.whatsapp++; if (r.concorrente) total.concorrente++; if (r.erro) total.erros++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabalhador));
  if (total.analisados) {
    await db.rpc('pontuar', { p_produto: produto.id, p_lead: leadId });
    if (!leadId) await db.from('execucoes').insert({
      produto_id: produto.id, tipo: 'enriquecimento', origem, finalizado_em: new Date().toISOString(),
      encontrados: total.analisados, erros: total.erros, detalhe: total,
    });
  }
  return total;
}

// ------------------------------------------------------------------ APRENDER
export async function aprender(db, produto) {
  const amostras = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('leads').select('sinais_ativos, max_rank')
      .eq('produto_id', produto.id).or('ultimo_contato_em.not.is.null,max_rank.gte.1,estagio.eq.perdido')
      .range(de, de + 999);
    if (error) throw error;
    amostras.push(...data.map(l => ({ sinais: l.sinais_ativos || [], positivo: l.max_rank >= 2 })));
    if (data.length < 1000) break;
  }
  let pesos = null, modelo = 'sinal-a-sinal';
  if (amostras.length >= 20) {
    const { data: p } = await db.from('pesos').select('sinal, peso_inicial').eq('produto_id', produto.id);
    const iniciais = Object.fromEntries((p || []).map(x => [x.sinal, Number(x.peso_inicial)]));
    pesos = ajustarModelo(amostras, iniciais).pesos;
    modelo = 'conjunto';
  }
  const { data, error } = await db.rpc('aprender', { p_produto: produto.id, p_pesos: pesos });
  if (error) throw error;
  return { ...data, modelo };
}

// ------------------------------------------------------------------ FAXINA
// Leads frios nunca trabalhados há mais de 6 meses saem do banco (o plano grátis tem 500 MB)
export async function faxina(db) {
  const limite = new Date(Date.now() - 180 * 864e5).toISOString();
  const { count } = await db.from('leads').delete({ count: 'exact' })
    .eq('estagio', 'novo').is('ultimo_contato_em', null).lt('score', 25).lt('criado_em', limite);
  return { removidos: count || 0 };
}
