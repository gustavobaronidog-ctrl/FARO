import { useEffect } from 'react';
import Icone from './Icone.jsx';
import { useFaro } from '../Contexto.jsx';
import { corTermica, temperatura, formatarTelefone, linkLigar, linkWhatsApp, quando, atrasado, rotuloSinal, nomeEstagio, textoIA } from '../lib/util.js';

export function Termometro({ score }) {
  const t = temperatura(score);
  return (
    <div className="termo">
      <div className="termo-num" style={{ color: corTermica(score) }}>{score ?? 0}</div>
      <div style={{ flex: 1 }}>
        <div className="termo-rotulo">{t.nome}</div>
        <div className="termo-escala" style={{ marginTop: 10 }}><i style={{ left: `${Math.max(2, Math.min(98, score ?? 0))}%` }} /></div>
      </div>
    </div>
  );
}

// Etiquetas dos sinais do lead: positivas em âmbar, negativas em vermelho
export function Sinais({ lead, max = 4 }) {
  const { pesos } = useFaro();
  const mapa = Object.fromEntries(pesos.map(p => [p.sinal, p]));
  const lista = (lead.sinais_ativos || [])
    .filter(s => !s.includes(':') && s !== 'celular' && s !== 'so_fixo')
    .map(s => ({ s, peso: mapa[s]?.peso_atual ?? 0 }))
    .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso))
    .slice(0, max);
  return (
    <>
      {lista.map(({ s, peso }) => (
        <span key={s} className={`etq ${peso > 3 ? 'pos' : peso < -3 ? 'neg' : ''}`}>
          {s === 'usa_concorrente' && lead.concorrente ? `Usa ${lead.concorrente}` : rotuloSinal(s, pesos)}
        </span>
      ))}
    </>
  );
}

export function LeadLinha({ lead, aoAbrir, aoContatar }) {
  const { produto, podeWhats } = useFaro();
  const nicho = produto?.nichos?.find(n => n.chave === lead.nicho)?.nome;
  const temRetorno = lead.motivo_fila === 'retorno' || (lead.proxima_acao_em && !['ganho', 'perdido'].includes(lead.estagio));
  return (
    <div className="lead-linha" role="button" tabIndex={0} onClick={() => aoAbrir(lead)}
      onKeyDown={e => { if (e.key === 'Enter') aoAbrir(lead); }}>
      <span className="faixa" style={{ background: corTermica(lead.score) }} />
      <div className="lead-nota"><b style={{ color: corTermica(lead.score) }}>{lead.score}</b><small>{temperatura(lead.score).curto || temperatura(lead.score).nome}</small></div>
      <div className="lead-meio">
        <div className="lead-nome">{lead.nome}</div>
        <div className="lead-sub">
          {[nicho, [lead.cidade, lead.uf].filter(Boolean).join('/'), lead.nota != null && `★ ${String(lead.nota).replace('.', ',')} (${lead.avaliacoes})`, lead.estagio !== 'novo' && nomeEstagio(lead.estagio)]
            .filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}
        </div>
        <div className="etiquetas">
          {temRetorno && lead.proxima_acao_em && (
            <span className={`etq ${atrasado(lead.proxima_acao_em) ? 'atrasado' : 'retorno'}`}>
              {lead.proxima_acao || 'Retorno'} ({quando(lead.proxima_acao_em)})
            </span>
          )}
          <Sinais lead={lead} max={3} />
        </div>
      </div>
      <div className="lead-acoes" onClick={e => e.stopPropagation()}>
        {lead.telefone && (
          <>
            <a className="btn btn-icone ligar" href={linkLigar(lead.telefone)} title={`Ligar ${formatarTelefone(lead.telefone)}`}
              onClick={() => aoContatar?.(lead, 'ligacao')}><Icone nome="telefone" /></a>
            {lead.celular && (podeWhats(lead) ? (
              <button className="btn btn-icone whats" title="Abrir no WhatsApp com o script" onClick={() => aoContatar?.(lead, 'whatsapp')}>
                <Icone nome="whats" />
              </button>
            ) : (
              <span className="btn btn-icone whats-travado" title="O WhatsApp libera depois que o cliente atender a sua ligação" aria-label="WhatsApp travado até o cliente atender">
                <Icone nome="cadeado" tam={16} />
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function Modal({ titulo, aoFechar, children, largura }) {
  useEffect(() => {
    // marca o Esc como já usado: assim a gaveta de trás não fecha junto
    const f = e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); aoFechar(); } };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aoFechar]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="veu" onClick={aoFechar} />
      <div className="modal-caixa" style={largura ? { width: `min(${largura}px, 100%)` } : undefined}>
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2>{titulo}</h2>
          <button className="btn fantasma btn-icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProdutoSeletor() {
  const { produtos, produto, setProdutoId } = useFaro();
  if (!produtos.length) return null;
  return (
    <label className="produto-sel" title="Para qual produto você está prospectando">
      <span className="ponto" style={{ background: produto?.cor || 'var(--quente)' }} />
      <select value={produto?.id || ''} onChange={e => setProdutoId(e.target.value)} aria-label="Produto">
        {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}{p.ativo ? '' : ' (pausado)'}</option>)}
      </select>
    </label>
  );
}

export function Carregando({ texto = 'Carregando' }) {
  return <div className="vazio"><span className="carregando" /> <span style={{ marginLeft: 8 }}>{texto}</span></div>;
}

export function TextoIA({ texto }) {
  return <>{textoIA(texto).map(p => p.negrito ? <b key={p.i}>{p.texto}</b> : <span key={p.i}>{p.texto}</span>)}</>;
}
