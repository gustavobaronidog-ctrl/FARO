import { useCallback, useEffect, useState } from 'react';
import Icone from './Icone.jsx';
import { Termometro, Sinais, TextoIA } from './Comuns.jsx';
import ScriptBox from './ScriptBox.jsx';
import Registrar from './Registrar.jsx';
import Gravacoes from './Gravacoes.jsx';
import { useFaro } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { formatarTelefone, linkLigar, linkWhatsApp, quando, ESTAGIOS, ROTULO_RESULTADO, nomeEstagio, corTermica } from '../lib/util.js';

const FONTES = { google: 'Google Maps', cnpj: 'Receita Federal (empresa nova)', manual: 'Cadastro manual', indicacao: 'Indicação' };

export default function LeadPainel() {
  const { leadAberto, abrirLead } = useFaro();
  if (!leadAberto) return null;
  return <Gaveta key={leadAberto.id} pedido={leadAberto} fechar={() => abrirLead(null)} />;
}

function Gaveta({ pedido, fechar }) {
  const { produto, toast, mudou, versao, podeWhats, admin, equipe } = useFaro();
  const [lead, setLead] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [scriptAtual, setScriptAtual] = useState({ id: pedido.scriptId || null, canal: pedido.canal || 'ligacao' });

  const carregar = useCallback(async () => {
    try {
      const [l, h] = await Promise.all([dados.carregarLead(pedido.id), dados.atividadesDoLead(pedido.id)]);
      setLead(l); setHistorico(h);
    } catch (e) { toast(e.message, 'erro'); }
  }, [pedido.id, toast]);
  useEffect(() => { carregar(); }, [carregar, versao]);

  useEffect(() => {
    const f = e => { if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest('input, textarea') && !document.querySelector('.modal')) fechar(); }; // com um modal aberto, o Esc fecha só o modal
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [fechar]);

  if (!lead) return (<><div className="veu" onClick={fechar} /><aside className="gaveta"><div className="vazio"><span className="carregando" /></div></aside></>);

  const nicho = produto?.nichos?.find(n => n.chave === lead.nicho)?.nome;
  return (
    <>
      <div className="veu" onClick={fechar} />
      <aside className="gaveta" aria-label={`Lead ${lead.nome}`}>
        <button className="btn fantasma btn-icone gaveta-fechar" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        <header className="gaveta-cab">
          <h1 style={{ fontSize: 26, paddingRight: 40 }}>{lead.nome}</h1>
          <p className="apagado pequeno" style={{ marginTop: 4 }}>
            {[lead.responsavel, nicho, [lead.bairro, lead.cidade, lead.uf].filter(Boolean).join(', ')].filter(Boolean).join('  /  ')}
          </p>
          <div style={{ marginTop: 14 }}><Termometro score={lead.score} /></div>
          {admin && lead.dono && equipe.length > 1 && (
            <span className="etq" style={{ marginTop: 10, display: 'inline-block' }}>Na fila de {equipe.find(p => p.id === lead.dono)?.nome || 'outra pessoa'}</span>
          )}
          <div className="contatos">
            {lead.telefone ? (
              <>
                <a className="btn ligar" href={linkLigar(lead.telefone)}><Icone nome="telefone" /> {formatarTelefone(lead.telefone)}</a>
                {podeWhats(lead)
                  ? <a className="btn whats" href={linkWhatsApp(lead.telefone)} target="_blank" rel="noopener noreferrer"><Icone nome="whats" /> WhatsApp</a>
                  : <span className="btn whats-travado" title="O WhatsApp libera depois que o cliente atender a sua ligação"><Icone nome="cadeado" /> WhatsApp depois da ligação</span>}
              </>
            ) : <span className="etq neg">Sem telefone: tente Instagram ou e-mail</span>}
            {lead.telefone2 && <a className="btn" href={linkLigar(lead.telefone2)}><Icone nome="telefone" /> {formatarTelefone(lead.telefone2)}</a>}
            {lead.instagram && <a className="btn" href={`https://instagram.com/${lead.instagram}`} target="_blank" rel="noopener noreferrer"><Icone nome="insta" /> @{lead.instagram}</a>}
            {lead.site && !/instagram\.com/i.test(lead.site) && <a className="btn" href={lead.site} target="_blank" rel="noopener noreferrer"><Icone nome="globo" /> Site</a>}
            {lead.email && <a className="btn" href={`mailto:${lead.email}`}><Icone nome="email" /> E-mail</a>}
            {lead.maps_url && <a className="btn" href={lead.maps_url} target="_blank" rel="noopener noreferrer"><Icone nome="pino" /> Maps</a>}
          </div>
        </header>

        <div className="gaveta-corpo">
          <section className="bloco" style={pedido.registrar ? { borderColor: 'var(--foco)' } : undefined}>
            <div className="bloco-cab">
              <h3>Como foi o contato?</h3>
              <span className="pequeno apagado">{nomeEstagio(lead.estagio)}{lead.tentativas ? `, ${lead.tentativas} tentativa${lead.tentativas > 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="bloco-corpo">
              {lead.proxima_acao_em && (
                <p className="pequeno" style={{ marginBottom: 10 }}>
                  Próximo passo: <b>{lead.proxima_acao || 'retorno'}</b>, {quando(lead.proxima_acao_em)}
                </p>
              )}
              <Registrar lead={lead} canal={scriptAtual.canal === 'whatsapp' || scriptAtual.canal === 'followup' ? 'whatsapp' : 'ligacao'}
                scriptId={scriptAtual.id} aoRegistrar={(l) => setLead(l)} />
            </div>
          </section>

          <ScriptBox lead={lead} canalInicial={pedido.canal || 'ligacao'} scriptInicial={pedido.scriptId}
            aoEscolher={(id, canal) => setScriptAtual({ id, canal })} />

          <Gravacoes lead={lead} />

          <PorQue lead={lead} />
          <Inteligencia lead={lead} aoMudar={carregar} whats={podeWhats(lead)} />
          <Ficha lead={lead} aoSalvar={(l) => { setLead(l); mudou(); }} />
          <Historico lead={lead} historico={historico} aoAnotar={carregar} />
        </div>
      </aside>
    </>
  );
}

function PorQue({ lead }) {
  const motivos = lead.motivos || [];
  return (
    <section className="bloco">
      <div className="bloco-cab"><h3>Por que esta nota</h3><span className="pequeno apagado">Base 35 + sinais</span></div>
      <div className="bloco-corpo">
        {motivos.length === 0 ? <p className="apagado pequeno">Nenhum sinal forte ainda. Clique em "Ler sinais do site" na ficha abaixo.</p> : (
          <div className="porque">
            {motivos.map(m => (
              <div key={m.sinal} className="porque-item">
                <b style={{ color: m.peso > 0 ? corTermica(80) : 'var(--frio)' }}>{m.peso > 0 ? '+' : ''}{m.peso}</b>
                <span>{m.sinal === 'usa_concorrente' && lead.concorrente ? `Usa ${lead.concorrente}` : m.rotulo}</span>
              </div>
            ))}
          </div>
        )}
        <div className="etiquetas" style={{ marginTop: 12 }}>
          <span className="etq">Fonte: {FONTES[lead.fonte] || lead.fonte}</span>
          {lead.aberto_em && <span className="etq">Aberta em {new Date(lead.aberto_em + 'T12:00').toLocaleDateString('pt-BR')}</span>}
          {lead.nota != null && <span className="etq">★ {String(lead.nota).replace('.', ',')} com {lead.avaliacoes} avaliações</span>}
          {lead.mei && <span className="etq">MEI</span>}
        </div>
      </div>
    </section>
  );
}

function Inteligencia({ lead, aoMudar, whats }) {
  const { toast } = useFaro();
  const [aberto, setAberto] = useState(null);
  const [entrada, setEntrada] = useState('');
  const [saida, setSaida] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const rodar = async (acao) => {
    setOcupado(true); setSaida(null);
    try { const r = await dados.pedirIA({ acao, lead_id: lead.id, entrada }); setSaida(r); if (acao === 'dossie') aoMudar(); }
    catch (e) { toast(e.message, 'erro'); }
    finally { setOcupado(false); }
  };
  return (
    <section className="bloco">
      <div className="bloco-cab">
        <h3>Assistente de vendas</h3>
        <div className="abas">
          <button aria-pressed={aberto === 'dossie'} onClick={() => { setAberto('dossie'); setSaida(null); }}>Dossiê antes de ligar</button>
          {whats && <button aria-pressed={aberto === 'resposta'} onClick={() => { setAberto('resposta'); setSaida(null); }}>Ele respondeu…</button>}
        </div>
      </div>
      <div className="bloco-corpo">
        {!aberto && <p className="apagado pequeno">A IA pesquisa o negócio na internet e te entrega o gancho para abrir a ligação, ou escreve a resposta certa quando o lead te responder no WhatsApp.</p>}
        {aberto === 'dossie' && (
          <button className="btn" onClick={() => rodar('dossie')} disabled={ocupado}><Icone nome="faisca" tam={16} /> Pesquisar {lead.nome}</button>
        )}
        {aberto === 'resposta' && (
          <div className="campo">
            <textarea rows={3} value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="Cole aqui o que ele respondeu no WhatsApp" aria-label="Resposta do lead" />
            <div><button className="btn" onClick={() => rodar('resposta')} disabled={ocupado || !entrada.trim()}><Icone nome="faisca" tam={16} /> Escrever resposta</button></div>
          </div>
        )}
        {ocupado && <p className="apagado" style={{ marginTop: 12 }}><span className="carregando" /> {aberto === 'dossie' ? 'Pesquisando na internet…' : 'Escrevendo…'}</p>}
        {saida && (
          <div style={{ marginTop: 12 }}>
            <div className="ia-saida"><TextoIA texto={saida.texto} /></div>
            {saida.fontes?.length > 0 && (
              <div className="ia-fontes apagado">
                {saida.fontes.map(f => <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo || f.url}</a>)}
              </div>
            )}
            {aberto === 'dossie' && <p className="mini apagado" style={{ marginTop: 6 }}>{saida.pesquisou === false ? 'Feito só com os dados do lead (a pesquisa no Google não está liberada na chave grátis da IA). ' : ''}Salvo no histórico do lead.</p>}
            {aberto === 'resposta' && lead.telefone && (
              <a className="btn pq whats" style={{ marginTop: 8 }} href={linkWhatsApp(lead.telefone, saida.texto)} target="_blank" rel="noopener noreferrer"><Icone nome="whats" tam={15} /> Enviar no WhatsApp</a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Ficha({ lead, aoSalvar }) {
  const { toast, produto } = useFaro();
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(lead);
  const [lendo, setLendo] = useState(false);
  useEffect(() => setF(lead), [lead]);
  const campo = (k, rotulo, props = {}) => (
    <label className="campo"><span>{rotulo}</span><input value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} {...props} /></label>
  );
  const salvar = async () => {
    try {
      const tel = (v) => { const d = String(v || '').replace(/\D/g, ''); return !d ? null : d.length <= 11 ? '55' + d : d; };
      const t1 = tel(f.telefone);
      const l = await dados.atualizarLead(lead.id, {
        nome: f.nome, responsavel: f.responsavel || null, telefone: t1, telefone2: tel(f.telefone2),
        celular: !!t1 && t1.length === 13 && t1[4] === '9',
        email: f.email || null, site: f.site || null, instagram: (f.instagram || '').replace(/^@/, '') || null,
        cidade: f.cidade || null, uf: (f.uf || '').toUpperCase() || null, nicho: f.nicho || null,
        valor_mensal: f.valor_mensal === '' || f.valor_mensal == null ? null : Number(f.valor_mensal),
        observacoes: f.observacoes || null, enriquecido_em: f.site !== lead.site ? null : lead.enriquecido_em,
      });
      toast('Ficha salva'); setEditando(false); aoSalvar(l);
    } catch (e) { toast(e.message, 'erro'); }
  };
  const lerSinais = async () => {
    setLendo(true);
    try { const r = await dados.acaoRobo('sinais', { produto_id: lead.produto_id, lead_id: lead.id }); toast(r.whatsapp ? 'Achei botão de WhatsApp no site' : r.concorrente ? 'Usa sistema concorrente' : 'Sinais atualizados'); aoSalvar(await dados.carregarLead(lead.id)); }
    catch (e) { toast(e.message, 'erro'); }
    finally { setLendo(false); }
  };
  const mover = async (estagio) => {
    try { aoSalvar(await dados.moverEstagio(lead.id, estagio)); toast(`Movido para ${nomeEstagio(estagio)}`); }
    catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <section className="bloco">
      <div className="bloco-cab">
        <h3>Ficha</h3>
        <div className="linha">
          <button className="btn pq" onClick={lerSinais} disabled={lendo || !lead.site}>{lendo ? <span className="carregando" /> : <Icone nome="girar" tam={15} />} Ler sinais do site</button>
          {!editando && <button className="btn pq" onClick={() => setEditando(true)}>Editar</button>}
        </div>
      </div>
      <div className="bloco-corpo">
        {!editando ? (
          <dl className="ficha">
            <dt>Estágio</dt>
            <dd>
              <select className="entrada" style={{ width: 'auto', padding: '4px 8px' }} value={lead.estagio} onChange={e => mover(e.target.value)} aria-label="Estágio">
                {ESTAGIOS.map(e => <option key={e.chave} value={e.chave}>{e.nome}</option>)}
              </select>
            </dd>
            {lead.responsavel && (<><dt>Responsável</dt><dd>{lead.responsavel}</dd></>)}
            {lead.cnpj && (<><dt>CNPJ</dt><dd>{lead.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</dd></>)}
            {lead.endereco && (<><dt>Endereço</dt><dd>{lead.endereco}</dd></>)}
            {lead.email && (<><dt>E-mail</dt><dd>{lead.email}</dd></>)}
            {lead.site && (<><dt>Site/link</dt><dd><a href={lead.site} target="_blank" rel="noopener noreferrer">{lead.site.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a></dd></>)}
            <dt>Sinais</dt><dd className="etiquetas" style={{ marginTop: 0 }}><Sinais lead={lead} max={10} /></dd>
            {lead.enriquecimento_erro && (<><dt>Leitor</dt><dd className="apagado">{lead.enriquecimento_erro}</dd></>)}
            {lead.valor_mensal != null && (<><dt>Valor mensal</dt><dd>R$ {Number(lead.valor_mensal).toLocaleString('pt-BR')}</dd></>)}
            {lead.motivo_perda && (<><dt>Motivo da perda</dt><dd>{lead.motivo_perda}</dd></>)}
            {lead.observacoes && (<><dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{lead.observacoes}</dd></>)}
          </dl>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {campo('nome', 'Nome do negócio')}
            <div className="grade-2">
              {campo('responsavel', 'Nome do dono / responsável')}
              <label className="campo"><span>Nicho</span>
                <select value={f.nicho || ''} onChange={e => setF({ ...f, nicho: e.target.value })}>
                  <option value="">Sem nicho</option>
                  {(produto?.nichos || []).map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}
                </select>
              </label>
              {campo('telefone', 'Telefone', { inputMode: 'tel' })}
              {campo('telefone2', 'Outro telefone', { inputMode: 'tel' })}
              {campo('instagram', 'Instagram')}
              {campo('email', 'E-mail', { type: 'email' })}
              {campo('cidade', 'Cidade')}
              {campo('uf', 'UF', { maxLength: 2 })}
            </div>
            {campo('site', 'Site ou link da bio')}
            {campo('valor_mensal', 'Valor mensal fechado (R$)', { inputMode: 'decimal', placeholder: String(produto?.ticket_mensal || '') })}
            <label className="campo"><span>Observações</span><textarea rows={3} value={f.observacoes || ''} onChange={e => setF({ ...f, observacoes: e.target.value })} /></label>
            <div className="linha"><button className="btn primario" onClick={salvar}>Salvar ficha</button><button className="btn fantasma" onClick={() => { setF(lead); setEditando(false); }}>Cancelar</button></div>
          </div>
        )}
      </div>
    </section>
  );
}

function Historico({ lead, historico, aoAnotar }) {
  const { toast } = useFaro();
  const [texto, setTexto] = useState('');
  const anotar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    try { await dados.anotar(lead, texto.trim()); setTexto(''); aoAnotar(); } catch (er) { toast(er.message, 'erro'); }
  };
  const bons = ['interessado', 'pediu_retorno', 'agendou_demo', 'iniciou_teste', 'fechou', 'respondeu'];
  const ruins = ['sem_interesse', 'numero_errado', 'nao_contatar', 'perdido'];
  const TIPOS = { ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', visita: 'Visita', nota: 'Anotação', estagio: 'Mudou de estágio', sistema: 'Sistema' };
  return (
    <section className="bloco">
      <div className="bloco-cab"><h3>Histórico</h3><span className="pequeno apagado">Entrou {quando(lead.criado_em)}</span></div>
      <div className="bloco-corpo">
        <form className="linha" onSubmit={anotar} style={{ marginBottom: 16 }}>
          <input className="entrada" style={{ flex: 1 }} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escrever uma anotação" aria-label="Nova anotação" />
          <button className="btn pq" disabled={!texto.trim()}><Icone nome="nota" tam={15} /> Anotar</button>
        </form>
        {historico.length === 0 ? <p className="apagado pequeno">Nenhum contato ainda. Este é o momento.</p> : (
          <div className="linha-tempo">
            {historico.map(a => (
              <div key={a.id} className="evento">
                <span className={`evento-ponto ${bons.includes(a.resultado) ? 'bom' : ruins.includes(a.resultado) ? 'ruim' : ''}`} />
                <div>
                  <div className="pequeno">
                    <b>{a.tipo === 'estagio' ? `Movido para ${nomeEstagio(a.resultado)}` : `${TIPOS[a.tipo] || a.tipo}${a.resultado ? `: ${ROTULO_RESULTADO[a.resultado] || a.resultado}` : ''}`}</b>
                    <span className="apagado"> {quando(a.criado_em)}{a.perfis?.nome ? `, ${a.perfis.nome}` : ''}</span>
                  </div>
                  {a.texto && <div className="evento-texto"><TextoIA texto={a.texto} /></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
