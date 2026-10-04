import { useEffect, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { ProdutoSeletor, Sinais, LeadLinha, Carregando } from '../components/Comuns.jsx';
import NovoLead from '../components/NovoLead.jsx';
import Foco from './Foco.jsx';
import { useFaro } from '../Contexto.jsx';
import { useContato } from '../lib/contato.js';
import * as dados from '../lib/dados.js';
import { TEMPERATURAS, ESTAGIOS, UFS, corTermica, formatarTelefone, nomeEstagio, quando } from '../lib/util.js';

const FILTROS_VAZIOS = { busca: '', temperatura: '', estagio: 'abertos', nicho: '', uf: '', cidade: '', sinal: '', fonte: '', ordem: 'score' };

export default function Radar() {
  const { produto, abrirLead, versao, pesos, toast } = useFaro();
  const contatar = useContato();
  const [f, setF] = useState(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(0);
  const [res, setRes] = useState(null);
  const [novo, setNovo] = useState(false);
  const [foco, setFoco] = useState(null);
  const [estreito, setEstreito] = useState(() => window.matchMedia('(max-width: 760px)').matches);

  useEffect(() => {
    const m = window.matchMedia('(max-width: 760px)');
    const f2 = () => setEstreito(m.matches);
    m.addEventListener('change', f2);
    return () => m.removeEventListener('change', f2);
  }, []);
  useEffect(() => { setPagina(0); }, [f, produto?.id]);
  useEffect(() => {
    if (!produto) return;
    let vivo = true;
    const t = setTimeout(() => {
      dados.buscarLeads({ produtoId: produto.id, ...f, pagina }).then(r => vivo && setRes(r)).catch(e => toast(e.message, 'erro'));
    }, f.busca || f.cidade ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [produto, f, pagina, versao, toast]);

  if (!produto) return null;
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const sinaisFiltro = pesos.filter(p => !p.sinal.includes(':'));
  const totalPaginas = res ? Math.ceil(res.total / dados.POR_PAGINA) : 0;

  if (foco) return <Foco fila={foco} aoSair={() => setFoco(null)} />;

  return (
    <>
      <div className="topo">
        <div>
          <h1>Radar</h1>
          <p>{res ? `${res.total.toLocaleString('pt-BR')} leads com esses filtros` : 'Buscando…'}</p>
        </div>
        <div className="linha">
          <ProdutoSeletor />
          <button className="btn" onClick={() => setNovo(true)}><Icone nome="mais" /> Lead</button>
          <button className="btn brasa" disabled={!res?.leads?.length} onClick={() => setFoco(res.leads.filter(l => l.telefone))}>
            <Icone nome="raio" /> Atacar esta lista
          </button>
        </div>
      </div>

      <div className="filtros">
        <input className="entrada busca" value={f.busca} onChange={set('busca')} placeholder="Buscar por nome, dono, bairro, telefone ou CNPJ" aria-label="Buscar" />
        <select className="entrada" value={f.temperatura} onChange={set('temperatura')} aria-label="Temperatura">
          <option value="">Toda temperatura</option>
          {TEMPERATURAS.map(t => <option key={t.chave} value={t.chave}>{t.nome}</option>)}
        </select>
        <select className="entrada" value={f.estagio} onChange={set('estagio')} aria-label="Estágio">
          <option value="abertos">Em aberto</option>
          <option value="">Todos os estágios</option>
          {ESTAGIOS.map(e => <option key={e.chave} value={e.chave}>{e.nome}</option>)}
        </select>
        <select className="entrada" value={f.nicho} onChange={set('nicho')} aria-label="Nicho">
          <option value="">Todo nicho</option>
          {(produto.nichos || []).map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}
        </select>
        <select className="entrada" value={f.sinal} onChange={set('sinal')} aria-label="Sinal">
          <option value="">Qualquer sinal</option>
          {sinaisFiltro.map(p => <option key={p.sinal} value={p.sinal}>{p.rotulo}</option>)}
        </select>
        <select className="entrada" value={f.uf} onChange={set('uf')} aria-label="Estado">
          <option value="">Brasil todo</option>
          {UFS.map(u => <option key={u}>{u}</option>)}
        </select>
        <input className="entrada" value={f.cidade} onChange={set('cidade')} placeholder="Cidade" aria-label="Cidade" style={{ maxWidth: 160 }} />
        <select className="entrada" value={f.fonte} onChange={set('fonte')} aria-label="Fonte">
          <option value="">Toda fonte</option>
          <option value="google">Google Maps</option>
          <option value="cnpj">Empresas novas (Receita)</option>
          <option value="manual">Manual</option>
          <option value="indicacao">Indicação</option>
        </select>
        <select className="entrada" value={f.ordem} onChange={set('ordem')} aria-label="Ordenar">
          <option value="score">Mais quentes</option>
          <option value="recentes">Chegaram por último</option>
          <option value="retorno">Próximo retorno</option>
          <option value="nome">Nome</option>
        </select>
        {JSON.stringify(f) !== JSON.stringify(FILTROS_VAZIOS) && <button className="btn fantasma" onClick={() => setF(FILTROS_VAZIOS)}>Limpar</button>}
      </div>

      {!res ? <Carregando /> : res.leads.length === 0 ? (
        <div className="lista"><div className="vazio"><h3>Nada com esses filtros</h3><p>Tire algum filtro, ou vá em Caçada e adicione cidades e nichos para o robô buscar.</p></div></div>
      ) : estreito ? (
        <div className="lista">{res.leads.map(l => <LeadLinha key={l.id} lead={l} aoAbrir={x => abrirLead({ id: x.id })} aoContatar={contatar} />)}</div>
      ) : (
        <div className="tabela-envolta">
          <table>
            <thead>
              <tr><th>Nota</th><th>Negócio</th><th>Sinais</th><th>Cidade</th><th>Google</th><th>Telefone</th><th>Estágio</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {res.leads.map(l => (
                <tr key={l.id} onClick={() => abrirLead({ id: l.id })}>
                  <td><span className="nota-celula" style={{ color: corTermica(l.score) }}><i style={{ background: corTermica(l.score) }} />{l.score}</span></td>
                  <td style={{ maxWidth: 260 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                    <div className="mini apagado">{[produto.nichos?.find(n => n.chave === l.nicho)?.nome, l.responsavel].filter(Boolean).join(', ')}</div>
                  </td>
                  <td><div className="etiquetas" style={{ marginTop: 0 }}><Sinais lead={l} max={2} /></div></td>
                  <td className="pequeno">{[l.cidade, l.uf].filter(Boolean).join('/')}</td>
                  <td className="pequeno">{l.nota != null ? `★ ${String(l.nota).replace('.', ',')} (${l.avaliacoes})` : l.fonte === 'cnpj' ? `Aberta ${quando(l.aberto_em + 'T12:00')}` : '–'}</td>
                  <td className="pequeno" style={{ whiteSpace: 'nowrap' }}>{l.telefone ? formatarTelefone(l.telefone) : <span className="apagado">sem</span>}</td>
                  <td className="pequeno">{nomeEstagio(l.estagio)}{l.proxima_acao_em ? <div className="mini apagado">{quando(l.proxima_acao_em)}</div> : null}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {l.telefone && (
                      <div className="lead-acoes">
                        <a className="btn btn-icone ligar" href={`tel:+${l.telefone}`} onClick={() => contatar(l, 'ligacao')} title="Ligar"><Icone nome="telefone" tam={16} /></a>
                        {l.celular && <button className="btn btn-icone whats" onClick={() => contatar(l, 'whatsapp')} title="WhatsApp com script"><Icone nome="whats" tam={16} /></button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res && totalPaginas > 1 && (
        <div className="paginacao">
          <button className="btn pq" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}><Icone nome="voltar" tam={15} /> Anterior</button>
          <span className="pequeno apagado">Página {pagina + 1} de {totalPaginas}</span>
          <button className="btn pq" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima <Icone nome="seta" tam={15} /></button>
        </div>
      )}
      {novo && <NovoLead aoFechar={() => setNovo(false)} />}
    </>
  );
}
