import { useEffect, useState } from 'react';
import { ProdutoSeletor, Carregando, Modal } from '../components/Comuns.jsx';
import { useFaro } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { corTermica, quando, atrasado, MOTIVOS_PERDA } from '../lib/util.js';

const COLUNAS = [
  { chave: 'tentando', nome: 'Tentando contato' },
  { chave: 'conversando', nome: 'Conversando' },
  { chave: 'demo', nome: 'Demonstração' },
  { chave: 'teste', nome: 'Em teste' },
  { chave: 'ganho', nome: 'Fechado' },
  { chave: 'perdido', nome: 'Perdido' },
];

export default function Funil() {
  const { produto, abrirLead, versao, toast, mudou } = useFaro();
  const [leads, setLeads] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [perda, setPerda] = useState(null);

  useEffect(() => {
    if (!produto) return;
    dados.leadsDoFunil(produto.id).then(setLeads).catch(e => toast(e.message, 'erro'));
  }, [produto, versao, toast]);
  if (!produto) return null;

  const mover = async (id, estagio, motivo) => {
    const antes = leads;
    setLeads(ls => estagio === 'perdido' ? ls.filter(l => l.id !== id) : ls.map(l => (l.id === id ? { ...l, estagio } : l)));
    try { await dados.moverEstagio(id, estagio, motivo); mudou(); }
    catch (e) { setLeads(antes); toast(e.message, 'erro'); }
  };
  const soltar = (estagio) => (e) => {
    e.preventDefault(); setSobre(null);
    const id = e.dataTransfer.getData('text/plain');
    const lead = leads.find(l => l.id === id);
    if (!lead || lead.estagio === estagio) return;
    if (estagio === 'perdido') setPerda(lead); else mover(id, estagio);
  };

  const mrr = (leads || []).filter(l => l.estagio === 'ganho').reduce((s, l) => s + Number(l.valor_mensal ?? produto.ticket_mensal ?? 0), 0);
  const potencial = (leads || []).filter(l => ['conversando', 'demo', 'teste'].includes(l.estagio)).length * Number(produto.ticket_mensal || 0);

  return (
    <>
      <div className="topo">
        <div>
          <h1>Funil</h1>
          <p>Arraste os cartões entre as colunas. {potencial > 0 && `R$ ${potencial.toLocaleString('pt-BR')}/mês em negociação, `}{mrr > 0 && `R$ ${mrr.toLocaleString('pt-BR')}/mês já fechados.`}</p>
        </div>
        <ProdutoSeletor />
      </div>
      {!leads ? <Carregando /> : (
        <div className="funil">
          {COLUNAS.map(c => {
            const daqui = c.chave === 'perdido' ? [] : leads.filter(l => l.estagio === c.chave);
            return (
              <section key={c.chave} className={`coluna ${sobre === c.chave ? 'sobre' : ''}`}
                onDragOver={e => { e.preventDefault(); setSobre(c.chave); }} onDragLeave={() => setSobre(null)} onDrop={soltar(c.chave)}>
                <div className="coluna-cab"><h3>{c.nome}</h3><span className="apagado pequeno">{c.chave === 'perdido' ? 'solte aqui' : daqui.length}</span></div>
                <div className="coluna-corpo">
                  {daqui.map(l => (
                    <div key={l.id} className="cartao" draggable onDragStart={e => e.dataTransfer.setData('text/plain', l.id)}
                      onClick={() => abrirLead({ id: l.id })} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && abrirLead({ id: l.id })}>
                      <span className="faixa" style={{ background: corTermica(l.score) }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                        <div className="mini apagado">{[l.cidade, l.uf].filter(Boolean).join('/')}</div>
                        {l.proxima_acao_em && (
                          <div className={`mini ${atrasado(l.proxima_acao_em) ? '' : 'apagado'}`} style={{ marginTop: 4, color: atrasado(l.proxima_acao_em) ? '#FF9EA1' : undefined }}>
                            {l.proxima_acao || 'Retorno'}, {quando(l.proxima_acao_em)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {c.chave === 'perdido' && <p className="pequeno apagado" style={{ padding: 6 }}>Perdidos ficam no Radar (filtro Estágio: Perdido). O motivo ensina o Faro.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {perda && (
        <Modal titulo={`Por que perdemos ${perda.nome}?`} aoFechar={() => setPerda(null)}>
          <div className="linha">
            {MOTIVOS_PERDA.map(m => <button key={m} className="chip-toggle" onClick={() => { mover(perda.id, 'perdido', m); setPerda(null); }}>{m}</button>)}
          </div>
        </Modal>
      )}
    </>
  );
}
