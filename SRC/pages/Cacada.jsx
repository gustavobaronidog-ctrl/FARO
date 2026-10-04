import { useCallback, useEffect, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { ProdutoSeletor, Carregando } from '../components/Comuns.jsx';
import { useFaro, useAcao } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { CAPITAIS, UFS, quando } from '../lib/util.js';

const TIPOS = { google: 'Busca no Google', cnpj: 'Empresas novas (Receita)', enriquecimento: 'Leitura de sinais', aprendizado: 'Aprendizado' };

export default function Cacada() {
  const { produto, perfil, versao, mudou, carregarProdutos, carregarPesos } = useFaro();
  const [alvos, setAlvos] = useState(null);
  const [execs, setExecs] = useState([]);
  const [res, setRes] = useState(null);
  const [rodar, ocupado] = useAcao();
  const admin = perfil?.papel === 'admin';

  const carregar = useCallback(async () => {
    if (!produto) return;
    const [a, e, r] = await Promise.all([dados.listarAlvos(produto.id), dados.ultimasExecucoes(30), dados.resumo(produto.id)]);
    setAlvos(a); setExecs(e); setRes(r);
  }, [produto]);
  useEffect(() => { carregar().catch(() => {}); }, [carregar, versao]);
  if (!produto) return null;

  const robo = (acao, extra, msg) => rodar(() => dados.acaoRobo(acao, { produto_id: produto.id, ...extra }), msg).then(r => { if (r) { mudou(); carregarPesos(); } });
  const pendentes = (alvos || []).filter(a => a.ativo && (!a.ultima_busca || Date.now() - new Date(a.ultima_busca) > 30 * 864e5)).length;
  const ultimoCnpj = execs.find(e => e.tipo === 'cnpj' && e.produto_id === produto.id);

  return (
    <>
      <div className="topo">
        <div>
          <h1>Caçada</h1>
          <p>Onde os robôs procuram clientes. Eles rodam sozinhos todo dia às 6h; aqui você manda rodar na hora e escolhe as praças.</p>
        </div>
        <ProdutoSeletor />
      </div>

      <div className="duas-col" style={{ marginBottom: 22 }}>
        <div className="cartao-simples">
          <h3>Google Maps</h3>
          <p className="pequeno apagado" style={{ marginTop: 4 }}>Cada busca traz até 20 negócios com telefone, site e nota. O Faro para sozinho antes de sair da cota grátis.</p>
          {res && (
            <>
              <div className={`medidor ${res.google_mes >= res.google_limite ? 'cheio' : ''}`}><i style={{ width: `${Math.min(100, (res.google_mes / res.google_limite) * 100)}%` }} /></div>
              <p className="mini apagado">{res.google_mes} de {res.google_limite} buscas grátis usadas neste mês. {pendentes} praças esperando busca.</p>
            </>
          )}
          <div className="linha" style={{ marginTop: 12 }}>
            <button className="btn" disabled={ocupado} onClick={() => robo('cacar', { max: 15 }, r => r.pulado || `${r.novos} leads novos (${r.duplicados} já existiam), ${r.requisicoes} buscas usadas`)}>
              {ocupado ? <span className="carregando" /> : <Icone nome="cacada" />} Caçar agora
            </button>
            <button className="btn" disabled={ocupado} onClick={() => robo('sinais', {}, r => `${r.analisados} sites lidos: ${r.whatsapp} com WhatsApp, ${r.concorrente} com concorrente`)}>
              <Icone nome="girar" /> Ler sinais pendentes
            </button>
            <button className="btn" disabled={ocupado} onClick={() => robo('aprender', {}, r => `Aprendeu com ${r.trabalhados} leads trabalhados (${r.modelo})`)}>
              <Icone nome="aprendizado" /> Aprender agora
            </button>
          </div>
        </div>
        <CnpjConfig produto={produto} admin={admin} ultimo={ultimoCnpj} aoSalvar={carregarProdutos} />
      </div>

      <NovosAlvos produto={produto} aoAdicionar={carregar} />

      <section style={{ marginTop: 22 }}>
        <div className="secao-cab"><h2>Praças de caça ({alvos?.length ?? 0})</h2></div>
        {!alvos ? <Carregando /> : alvos.length === 0 ? <div className="lista"><div className="vazio">Adicione nichos e cidades acima para o robô começar.</div></div> : (
          <div className="tabela-envolta" style={{ maxHeight: 460 }}>
            <table>
              <thead><tr><th>Busca</th><th>Cidade</th><th>Vezes</th><th>Achados</th><th>Novos</th><th>Última busca</th><th>Ativa</th><th aria-label="Apagar" /></tr></thead>
              <tbody>
                {alvos.map(a => (
                  <tr key={a.id} style={{ cursor: 'default', opacity: a.ativo ? 1 : 0.5 }}>
                    <td>{a.consulta}</td><td>{a.cidade}/{a.uf}</td><td className="num">{a.buscas}</td><td className="num">{a.encontrados}</td><td className="num">{a.novos}</td>
                    <td className="pequeno apagado">{a.ultima_busca ? quando(a.ultima_busca) : 'na fila'}</td>
                    <td><input type="checkbox" checked={a.ativo} aria-label="Ativa" onChange={e => rodar(() => dados.atualizarAlvo(a.id, { ativo: e.target.checked })).then(carregar)} /></td>
                    <td><button className="btn fantasma btn-icone" aria-label="Apagar praça" onClick={() => rodar(() => dados.excluirAlvo(a.id)).then(carregar)}><Icone nome="lixo" tam={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 22 }}>
        <div className="secao-cab"><h2>Diário dos robôs</h2></div>
        <div className="cartao-simples lista-simples">
          {execs.length === 0 && <p className="apagado">Nada ainda. A primeira rodada automática acontece amanhã às 6h, ou clique em "Caçar agora".</p>}
          {execs.map(e => (
            <div key={e.id} className="linha" style={{ justifyContent: 'space-between' }}>
              <div><b>{TIPOS[e.tipo]}</b> <span className="apagado pequeno">{e.produtos?.nome}{e.origem === 'manual' ? ', manual' : ''}</span></div>
              <div className="pequeno apagado">
                {e.tipo === 'google' && `${e.requisicoes} buscas, ${e.encontrados} achados, ${e.novos} novos`}
                {e.tipo === 'cnpj' && `${e.encontrados} empresas novas, ${e.novos} entraram`}
                {e.tipo === 'enriquecimento' && `${e.encontrados} sites lidos`}
                {e.tipo === 'aprendizado' && `${e.detalhe?.trabalhados ?? 0} leads analisados`}
                {e.erros ? `, ${e.erros} erros` : ''}, {quando(e.iniciado_em)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function NovosAlvos({ produto, aoAdicionar }) {
  const [nichos, setNichos] = useState(() => (produto.nichos || []).map(n => n.chave));
  const [todasConsultas, setTodasConsultas] = useState(false);
  const [cidades, setCidades] = useState('');
  const [rodar, ocupado] = useAcao();
  const linhas = cidades.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?)\s*[/,-]\s*([A-Za-z]{2})$/);
    return m ? { cidade: m[1].trim(), uf: m[2].toUpperCase() } : { cidade: l, uf: null };
  });
  const validas = linhas.filter(l => l.uf && UFS.includes(l.uf));
  const invalidas = linhas.length - validas.length;
  const novos = validas.flatMap(c => (produto.nichos || []).filter(n => nichos.includes(n.chave)).flatMap(n =>
    (todasConsultas ? n.consultas : n.consultas.slice(0, 1)).map(q => ({ produto_id: produto.id, nicho: n.chave, consulta: q, cidade: c.cidade, uf: c.uf }))));
  const adicionar = async () => {
    const r = await rodar(() => dados.adicionarAlvos(novos), r2 => `${r2?.length ?? 0} praças novas na fila do robô`);
    if (r) { setCidades(''); aoAdicionar(); }
  };
  return (
    <div className="cartao-simples">
      <h3>Adicionar praças</h3>
      <p className="pequeno apagado" style={{ marginTop: 4 }}>Escolha os nichos e cole as cidades, uma por linha, no formato Cidade/UF. Em cidade grande, coloque também bairros ou zonas (ex.: Savassi, Belo Horizonte/MG) para achar mais gente.</p>
      <div className="linha" style={{ marginTop: 12 }}>
        {(produto.nichos || []).map(n => (
          <button key={n.chave} className="chip-toggle" aria-pressed={nichos.includes(n.chave)}
            onClick={() => setNichos(nichos.includes(n.chave) ? nichos.filter(x => x !== n.chave) : [...nichos, n.chave])}>{n.nome}</button>
        ))}
        <label className="pequeno linha" style={{ gap: 6 }}><input type="checkbox" checked={todasConsultas} onChange={e => setTodasConsultas(e.target.checked)} /> Usar todas as variações de busca</label>
      </div>
      <textarea className="entrada" rows={4} style={{ marginTop: 12 }} value={cidades} onChange={e => setCidades(e.target.value)} placeholder={'Uberlândia/MG\nRibeirão Preto/SP\nMoema, São Paulo/SP'} aria-label="Cidades" />
      <div className="linha" style={{ marginTop: 10 }}>
        <button className="btn pq fantasma" onClick={() => setCidades(CAPITAIS.map(([c, u]) => `${c}/${u}`).join('\n'))}>Colar as 27 capitais</button>
        <span className="vazio-linha" />
        {invalidas > 0 && <span className="pequeno" style={{ color: 'var(--fogo)' }}>{invalidas} linha(s) sem UF</span>}
        <button className="btn primario" disabled={!novos.length || ocupado} onClick={adicionar}>Adicionar {novos.length || ''} praças</button>
      </div>
    </div>
  );
}

function CnpjConfig({ produto, admin, ultimo, aoSalvar }) {
  const cfg = produto.config || {};
  const [c, setC] = useState({ cnpj_ativo: cfg.cnpj_ativo ?? true, cnpj_janela_dias: cfg.cnpj_janela_dias ?? 120, cnpj_max_por_mes: cfg.cnpj_max_por_mes ?? 3000, cnpj_ufs: (cfg.cnpj_ufs || []).join(', ') });
  const [rodar, ocupado] = useAcao();
  const cnaes = [...new Set((produto.nichos || []).flatMap(n => n.cnaes || []))];
  const salvar = () => rodar(() => dados.salvarProduto({
    id: produto.id, config: { ...cfg, cnpj_ativo: c.cnpj_ativo, cnpj_janela_dias: Number(c.cnpj_janela_dias) || 120, cnpj_max_por_mes: Number(c.cnpj_max_por_mes) || 3000,
      cnpj_ufs: c.cnpj_ufs.split(/[\s,;]+/).map(x => x.toUpperCase()).filter(x => UFS.includes(x)) },
  }), 'Radar de empresas novas salvo').then(aoSalvar);
  return (
    <div className="cartao-simples">
      <h3>Empresas recém-abertas</h3>
      <p className="pequeno apagado" style={{ marginTop: 4 }}>
        Todo mês o Faro lê a base pública da Receita Federal e traz quem abriu CNPJ nas atividades {cnaes.map(x => x.replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3')).join(', ') || '(nenhum CNAE configurado)'}.
        {ultimo ? ` Última importação ${quando(ultimo.iniciado_em)}: ${ultimo.novos} novas.` : ' Ainda não rodou.'}
      </p>
      <div className="grade-2" style={{ marginTop: 12 }}>
        <label className="campo"><span>Abertas nos últimos (dias)</span><input type="number" min="15" max="365" value={c.cnpj_janela_dias} disabled={!admin} onChange={e => setC({ ...c, cnpj_janela_dias: e.target.value })} /></label>
        <label className="campo"><span>Máximo por mês</span><input type="number" min="100" max="20000" value={c.cnpj_max_por_mes} disabled={!admin} onChange={e => setC({ ...c, cnpj_max_por_mes: e.target.value })} /></label>
      </div>
      <label className="campo" style={{ marginTop: 10 }}><span>Só nestes estados (vazio = Brasil todo)</span><input value={c.cnpj_ufs} disabled={!admin} onChange={e => setC({ ...c, cnpj_ufs: e.target.value })} placeholder="MG, SP, RJ" /></label>
      <div className="linha" style={{ marginTop: 12 }}>
        <label className="pequeno linha" style={{ gap: 6 }}><input type="checkbox" checked={c.cnpj_ativo} disabled={!admin} onChange={e => setC({ ...c, cnpj_ativo: e.target.checked })} /> Ligado</label>
        <span className="vazio-linha" />
        {admin && <button className="btn pq" onClick={salvar} disabled={ocupado}>Salvar</button>}
      </div>
    </div>
  );
}
