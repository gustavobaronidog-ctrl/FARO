import { useCallback, useEffect, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { LeadLinha, ProdutoSeletor, Carregando } from '../components/Comuns.jsx';
import Foco from './Foco.jsx';
import NovoLead from '../components/NovoLead.jsx';
import { useFaro, useAcao } from '../Contexto.jsx';
import { useContato } from '../lib/contato.js';
import * as dados from '../lib/dados.js';
import { saudacao, primeiroNome, quando } from '../lib/util.js';

export default function Hoje() {
  const { produto, perfil, abrirLead, versao, pesos, mudou } = useFaro();
  const contatar = useContato();
  const [fila, setFila] = useState(null);
  const [res, setRes] = useState(null);
  const [filtro, setFiltro] = useState('tudo');
  const [foco, setFoco] = useState(false);
  const [novo, setNovo] = useState(false);
  const [ultima, setUltima] = useState(null);
  const [rodar, ocupado] = useAcao();

  const carregar = useCallback(async () => {
    if (!produto) return;
    const [f, r, ex] = await Promise.all([dados.filaHoje(produto.id, 80), dados.resumo(produto.id), dados.ultimasExecucoes(8)]);
    setFila(f); setRes(r); setUltima(ex.find(e => e.produto_id === produto.id && e.tipo === 'google') || null);
  }, [produto]);
  useEffect(() => { setFila(null); carregar().catch(() => {}); }, [carregar, versao]);

  if (!produto) return <SemProduto />;

  const retornos = (fila || []).filter(l => l.motivo_fila === 'retorno');
  const quentes = (fila || []).filter(l => l.motivo_fila === 'quente');
  const lista = filtro === 'retornos' ? retornos : filtro === 'quentes' ? quentes : fila || [];
  const meta = perfil?.meta_contatos_dia || 40;
  const insight = pesos.filter(p => p.amostras >= 20 && p.lift).sort((a, b) => b.lift - a.lift)[0];

  const cacarAgora = () => rodar(() => dados.acaoRobo('cacar', { produto_id: produto.id, max: 10 }),
    r => r.pulado ? r.pulado : `Caçada feita: ${r.novos} leads novos de ${r.encontrados} encontrados`).then(() => mudou());

  if (foco) return <Foco fila={lista} aoSair={() => { setFoco(false); mudou(); }} />;

  return (
    <>
      <div className="topo">
        <div>
          <h1>{saudacao()}, {primeiroNome(perfil?.nome) || 'time'}</h1>
          <p>
            {res ? <>
              {res.retornos_hoje > 0 ? `${res.retornos_hoje} ${res.retornos_hoje === 1 ? 'retorno combinado' : 'retornos combinados'} e ` : ''}
              {quentes.length} leads quentes esperando por você no {produto.nome}.
            </> : 'Montando sua fila do dia…'}
          </p>
        </div>
        <div className="linha">
          <ProdutoSeletor />
          <button className="btn" onClick={() => setNovo(true)}><Icone nome="mais" /> Lead</button>
          <button className="btn brasa gd" onClick={() => setFoco(true)} disabled={!lista.length}>
            <Icone nome="raio" /> Começar sessão de ataque
          </button>
        </div>
      </div>

      <div className="bordo" aria-label="Seu dia em números">
        <div>
          <div className={`valor ${res?.atrasados ? 'alerta' : ''}`}>{res?.retornos_hoje ?? '–'}</div>
          <div className="rotulo">{res?.atrasados ? `retornos hoje (${res.atrasados} atrasados)` : 'retornos para hoje'}</div>
        </div>
        <div><div className="valor">{res?.quentes_novos ?? '–'}</div><div className="rotulo">quentes ainda sem contato</div></div>
        <div>
          <div className="valor">{res?.contatos_hoje ?? '–'}<span className="apagado" style={{ fontSize: 18 }}>/{meta}</span></div>
          <div className="rotulo">seus contatos hoje</div>
          <div className="meta-barra"><i style={{ width: `${Math.min(100, ((res?.contatos_hoje || 0) / meta) * 100)}%` }} /></div>
        </div>
        <div><div className="valor">{res?.positivos_hoje ?? '–'}</div><div className="rotulo">respostas boas hoje</div></div>
        <div>
          <div className="valor">{res?.ganhos_mes ?? '–'}</div>
          <div className="rotulo">fechados no mês{res?.mrr_mes ? `, R$ ${Number(res.mrr_mes).toLocaleString('pt-BR')}/mês` : ''}</div>
        </div>
      </div>

      <div className="ataque">
        <section>
          <div className="secao-cab">
            <h2>Fila de ataque</h2>
            <div className="abas" role="group" aria-label="Filtrar fila">
              <button aria-pressed={filtro === 'tudo'} onClick={() => setFiltro('tudo')}>Tudo ({fila?.length ?? 0})</button>
              <button aria-pressed={filtro === 'retornos'} onClick={() => setFiltro('retornos')}>Retornos ({retornos.length})</button>
              <button aria-pressed={filtro === 'quentes'} onClick={() => setFiltro('quentes')}>Novos quentes ({quentes.length})</button>
            </div>
          </div>
          {fila === null ? <Carregando texto="Montando a fila" /> : lista.length === 0 ? (
            <div className="lista"><div className="vazio">
              <h3>Fila limpa</h3>
              <p>Ninguém para chamar agora. Mande o robô buscar mais leads ou abra o Radar para escolher a dedo.</p>
              <button className="btn" onClick={cacarAgora} disabled={ocupado}>{ocupado ? <span className="carregando" /> : <Icone nome="cacada" />} Caçar leads agora</button>
            </div></div>
          ) : (
            <div className="lista">
              {lista.map(l => <LeadLinha key={l.id} lead={l} aoAbrir={x => abrirLead({ id: x.id })} aoContatar={contatar} />)}
            </div>
          )}
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cartao-simples">
            <h3>Robô de caça</h3>
            <p className="pequeno apagado" style={{ marginTop: 4 }}>
              {ultima ? `Última busca ${quando(ultima.iniciado_em)}: ${ultima.novos} novos de ${ultima.encontrados}.` : 'Ainda não rodou. Ele roda sozinho todo dia às 6h.'}
            </p>
            {res && (
              <>
                <div className={`medidor ${res.google_mes >= res.google_limite ? 'cheio' : ''}`}><i style={{ width: `${Math.min(100, (res.google_mes / res.google_limite) * 100)}%` }} /></div>
                <p className="mini apagado">{res.google_mes} de {res.google_limite} buscas grátis do Google usadas neste mês</p>
              </>
            )}
            <button className="btn pq" style={{ marginTop: 12 }} onClick={cacarAgora} disabled={ocupado}>
              {ocupado ? <span className="carregando" /> : <Icone nome="cacada" tam={15} />} Caçar agora
            </button>
          </div>
          <div className="cartao-simples">
            <h3>O que o Faro aprendeu</h3>
            {insight ? (
              <p className="pequeno" style={{ marginTop: 6 }}>
                Leads com <b>{insight.rotulo.toLowerCase()}</b> estão avançando <b>{String(insight.lift).replace('.', ',')}x</b> mais que os outros.
                A fila já está priorizando eles.
              </p>
            ) : (
              <p className="pequeno apagado" style={{ marginTop: 6 }}>
                Registre o resultado de cada contato. Com uns 20 leads trabalhados, o Faro começa a mostrar quais sinais fecham mais e reordena a fila sozinho.
              </p>
            )}
          </div>
          <div className="cartao-simples">
            <h3>{res?.em_aberto ?? 0} negociações abertas</h3>
            <p className="pequeno apagado" style={{ marginTop: 4 }}>Conversando, em demonstração ou testando. Acompanhe no Funil.</p>
            <a className="btn pq" href="#/funil" style={{ marginTop: 12 }}><Icone nome="funil" tam={15} /> Abrir funil</a>
          </div>
        </aside>
      </div>
      {novo && <NovoLead aoFechar={() => setNovo(false)} />}
    </>
  );
}

function SemProduto() {
  return (
    <div className="cartao-simples" style={{ maxWidth: 560 }}>
      <h2>Nenhum produto ainda</h2>
      <p className="apagado" style={{ marginTop: 8 }}>
        Rode os arquivos 01 e 02 da pasta supabase no SQL Editor (eles criam o espaço do Tem Encaixe), ou crie um produto em Ajustes.
      </p>
      <a className="btn" href="#/ajustes" style={{ marginTop: 14 }}>Ir para Ajustes</a>
    </div>
  );
}
