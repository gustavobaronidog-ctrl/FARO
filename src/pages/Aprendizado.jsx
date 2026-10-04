import { useEffect, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { ProdutoSeletor, Carregando } from '../components/Comuns.jsx';
import { useFaro, useAcao } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { corTermica, nomeEstagio } from '../lib/util.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function Aprendizado() {
  const { produto, pesos, carregarPesos, perfil, versao, mudou } = useFaro();
  const [est, setEst] = useState(null);
  const [rodar, ocupado] = useAcao();
  useEffect(() => { if (produto) dados.estatisticas(produto.id).then(setEst).catch(() => {}); }, [produto, versao]);
  if (!produto) return null;

  const aprender = () => rodar(() => dados.acaoRobo('aprender', { produto_id: produto.id }),
    r => `Pesos recalculados com ${r.trabalhados} leads trabalhados`).then(r => { if (r) { carregarPesos(); mudou(); } });
  const nomeNicho = c => produto.nichos?.find(n => n.chave === c)?.nome || c;
  const ordenados = [...pesos].sort((a, b) => b.peso_atual - a.peso_atual);
  const trabalhados = (est?.por_fonte || []).reduce((s, x) => s + x.trabalhados, 0);

  return (
    <>
      <div className="topo">
        <div>
          <h1>Aprendizado</h1>
          <p>Cada resultado que você registra ajusta a nota dos próximos leads. {trabalhados ? `Até agora: ${trabalhados} leads trabalhados.` : 'Ainda sem leads trabalhados.'}</p>
        </div>
        <div className="linha">
          <ProdutoSeletor />
          <button className="btn" onClick={aprender} disabled={ocupado}>{ocupado ? <span className="carregando" /> : <Icone nome="girar" />} Aprender agora</button>
        </div>
      </div>

      <div className="duas-col" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)' }}>
        <section className="cartao-simples">
          <h2>Quanto vale cada sinal</h2>
          <p className="pequeno apagado" style={{ marginTop: 4, marginBottom: 14 }}>
            A barra é o peso atual; o risquinho é o palpite inicial. Com poucos resultados vale o palpite; conforme os resultados chegam, o Faro confia mais nos números.
            O modelo olha todos os sinais juntos, então separa o que realmente converte do que só andava junto.
          </p>
          {ordenados.length === 0 ? <Carregando /> : ordenados.map(p => <LinhaPeso key={p.sinal} p={p} admin={perfil?.papel === 'admin'} produto={produto} aoSalvar={carregarPesos} />)}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="cartao-simples">
            <h3>Últimos 14 dias</h3>
            {!est ? <Carregando /> : <Dias dias={est.dias} />}
          </section>
          <section className="cartao-simples">
            <h3>Onde está convertendo</h3>
            {!est ? null : (
              <>
                <Taxas titulo="Por nicho" linhas={est.por_nicho.map(x => ({ ...x, nome: nomeNicho(x.chave) }))} />
                <Taxas titulo="Por origem" linhas={est.por_fonte.map(x => ({ ...x, nome: { google: 'Google Maps', cnpj: 'Empresas novas', manual: 'Manual', indicacao: 'Indicação' }[x.chave] || x.chave }))} />
                <Taxas titulo="Por estado" linhas={est.por_uf.map(x => ({ ...x, nome: x.chave }))} />
              </>
            )}
          </section>
          <section className="cartao-simples">
            <h3>Funil completo</h3>
            <div className="lista-simples" style={{ marginTop: 8 }}>
              {est && ['novo', 'tentando', 'conversando', 'demo', 'teste', 'ganho', 'perdido'].map(e => (
                <div key={e} className="linha" style={{ justifyContent: 'space-between' }}><span>{nomeEstagio(e)}</span><b className="num">{(est.funil[e] || 0).toLocaleString('pt-BR')}</b></div>
              ))}
            </div>
          </section>
          {est?.motivos_perda?.length > 0 && (
            <section className="cartao-simples">
              <h3>Por que estamos perdendo</h3>
              <div className="lista-simples" style={{ marginTop: 8 }}>
                {est.motivos_perda.map(m => <div key={m.motivo} className="linha" style={{ justifyContent: 'space-between' }}><span>{m.motivo}</span><b className="num">{m.n}</b></div>)}
              </div>
            </section>
          )}
          {est?.scripts?.length > 0 && (
            <section className="cartao-simples">
              <h3>Scripts que mais funcionam</h3>
              <div className="lista-simples" style={{ marginTop: 8 }}>
                {est.scripts.slice(0, 8).map(s => (
                  <div key={s.id} className="linha" style={{ justifyContent: 'space-between' }}>
                    <span>{s.titulo}</span><span className="pequeno"><b className="num">{pct(s.positivos, s.usos)}%</b> <span className="apagado">de {s.usos}</span></span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function LinhaPeso({ p, admin, produto, aoSalvar }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(p.peso_inicial);
  const [rodar] = useAcao();
  const escala = v => 50 + (Math.max(-40, Math.min(40, v)) / 40) * 50;
  const atual = Number(p.peso_atual), inicial = Number(p.peso_inicial);
  const esq = Math.min(escala(0), escala(atual)), larg = Math.abs(escala(atual) - escala(0));
  const salvar = async () => { await rodar(() => dados.salvarPeso(produto.id, p.sinal, Number(valor)), 'Palpite atualizado. Clique em "Aprender agora" para recalcular.'); setEditando(false); aoSalvar(); };
  return (
    <div className="peso-linha">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.rotulo}</div>
        <div className="mini apagado">{p.amostras ? `${p.amostras} ${p.amostras === 1 ? 'trabalhado' : 'trabalhados'}, ${pct(p.positivos, p.amostras)}% avançaram${p.lift ? `, ${String(p.lift).replace('.', ',')}x` : ''}` : 'sem dados ainda'}</div>
      </div>
      <div className="peso-barra" title={`Palpite inicial ${inicial}, peso atual ${atual}`}>
        <span className="atual" style={{ left: `${esq}%`, width: `${Math.max(larg, 0.6)}%`, background: atual >= 0 ? corTermica(60 + atual) : 'var(--frio)' }} />
        <span className="inicial" style={{ left: `${escala(inicial)}%` }} />
      </div>
      {editando ? (
        <div className="linha" style={{ gap: 4 }}>
          <input className="entrada" type="number" value={valor} onChange={e => setValor(e.target.value)} style={{ width: 64, padding: '4px 6px' }} aria-label="Palpite inicial" />
          <button className="btn pq" onClick={salvar}>OK</button>
        </div>
      ) : (
        <button className="peso-valor" style={{ background: 'none', border: 0, cursor: admin ? 'pointer' : 'default', color: 'inherit', fontSize: 16 }}
          onClick={() => admin && setEditando(true)} title={admin ? 'Clique para mudar o palpite inicial' : undefined}>
          {atual > 0 ? '+' : ''}{Math.round(atual)}
        </button>
      )}
    </div>
  );
}

function Dias({ dias }) {
  const mapa = Object.fromEntries((dias || []).map(d => [d.dia, d]));
  const lista = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 13 + i);
    const k = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return { k, dia: d.getDate(), ...(mapa[k] || { contatos: 0, positivos: 0 }) };
  });
  const max = Math.max(1, ...lista.map(d => d.contatos));
  return (
    <>
      <div className="barras-dia" style={{ marginTop: 14 }} aria-label="Contatos e respostas boas por dia">
        {lista.map(d => (
          <div key={d.k} title={`${d.contatos} contatos, ${d.positivos} bons`}>
            <span className="c" style={{ height: `${((d.contatos - d.positivos) / max) * 100}%` }} />
            <span className="p" style={{ height: `${(d.positivos / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="linha mini apagado" style={{ justifyContent: 'space-between', marginTop: 6 }}><span>{lista[0].dia}</span><span>hoje</span></div>
      <p className="mini apagado" style={{ marginTop: 6 }}><span style={{ color: 'var(--quente)' }}>■</span> respostas boas <span style={{ marginLeft: 10 }}>■</span> demais contatos</p>
    </>
  );
}

function Taxas({ titulo, linhas }) {
  if (!linhas?.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="pequeno apagado" style={{ marginBottom: 4 }}>{titulo}</div>
      {linhas.slice(0, 8).map(l => (
        <div key={l.chave} className="taxa-linha">
          <span>{l.nome}</span>
          <b className="num" style={{ textAlign: 'right' }}>{pct(l.avancaram, l.trabalhados)}%</b>
          <span className="mini apagado">{l.trabalhados} {l.trabalhados === 1 ? 'trabalhado' : 'trabalhados'}, {l.ganhos} {l.ganhos === 1 ? 'fechado' : 'fechados'}</span>
        </div>
      ))}
    </div>
  );
}
