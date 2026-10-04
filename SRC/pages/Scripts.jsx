import { useState } from 'react';
import Icone from '../components/Icone.jsx';
import { ProdutoSeletor, Modal } from '../components/Comuns.jsx';
import { TextoScript } from '../components/ScriptBox.jsx';
import { useFaro, useAcao } from '../Contexto.jsx';
import { salvarScript, excluirScript } from '../lib/dados.js';
import { preencher, taxaScript } from '../lib/util.js';

const CANAIS = [
  { chave: 'ligacao', nome: 'Ligação' }, { chave: 'whatsapp', nome: 'WhatsApp' },
  { chave: 'followup', nome: 'Follow-up' }, { chave: 'objecao', nome: 'Objeções' }, { chave: 'email', nome: 'E-mail' },
];
const VARIAVEIS = ['saudacao', 'contato', 'negocio', 'cidade', 'nicho', 'vendedor', 'produto', 'site', 'concorrente', 'opcao_horario_1', 'opcao_horario_2'];
const EXEMPLO = {
  saudacao: 'Boa tarde', contato: 'Juliana', negocio: 'Studio Bella', cidade: 'Belo Horizonte', nicho: 'salão de beleza',
  vendedor: 'Gustavo', produto: '', site: '', concorrente: 'Trinks', opcao_horario_1: 'hoje às 16h', opcao_horario_2: 'amanhã às 10h',
};

export default function Scripts() {
  const { produto, scripts, carregarScripts, pesos } = useFaro();
  const [canal, setCanal] = useState('ligacao');
  const [editando, setEditando] = useState(null);
  const [verId, setVerId] = useState(null);
  if (!produto) return null;
  const lista = scripts.filter(s => s.canal === canal);
  const ver = lista.find(s => s.id === verId) || lista[0];
  const nomeNicho = c => produto.nichos?.find(n => n.chave === c)?.nome;
  const nomeSinal = s => pesos.find(p => p.sinal === s)?.rotulo || s;
  const exemplo = { ...EXEMPLO, produto: produto.nome, site: produto.site || '' };

  return (
    <>
      <div className="topo">
        <div>
          <h1>Scripts</h1>
          <p>O roteiro certo para cada nicho e situação. O Faro escolhe o melhor para cada lead e mede quais convertem.</p>
        </div>
        <div className="linha">
          <ProdutoSeletor />
          <button className="btn primario" onClick={() => setEditando({ produto_id: produto.id, canal, titulo: '', corpo: '', nicho: null, sinal: null, gatilho: '', ordem: 99, ativo: true })}>
            <Icone nome="mais" /> Novo script
          </button>
        </div>
      </div>
      <div className="abas" style={{ marginBottom: 16 }} role="group" aria-label="Canal">
        {CANAIS.map(c => <button key={c.chave} aria-pressed={canal === c.chave} onClick={() => { setCanal(c.chave); setVerId(null); }}>{c.nome} ({scripts.filter(s => s.canal === c.chave).length})</button>)}
      </div>
      {lista.length === 0 ? (
        <div className="lista"><div className="vazio"><h3>Nenhum script aqui</h3><p>Crie o primeiro. Use {'{contato}'}, {'{negocio}'} e as outras variáveis para o texto se encaixar em cada lead.</p></div></div>
      ) : (
        <div className="duas-col" style={{ gridTemplateColumns: 'minmax(0, .9fr) minmax(0, 1.3fr)' }}>
          <div className="lista">
            {lista.map(s => (
              <button key={s.id} className="lead-linha" style={{ gridTemplateColumns: '1fr auto', padding: '12px 16px', minHeight: 0, background: ver?.id === s.id ? 'var(--sup-2)' : undefined }} onClick={() => setVerId(s.id)}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{canal === 'objecao' && s.gatilho ? `"${s.gatilho}"` : s.titulo.replace(/^[^·]*·\s*/, '')}</div>
                  <div className="etiquetas">
                    <span className="etq">{s.nicho ? nomeNicho(s.nicho) : 'Todos os nichos'}</span>
                    {s.sinal && <span className="etq pos">Quando: {nomeSinal(s.sinal)}</span>}
                    {!s.ativo && <span className="etq neg">Desligado</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {s.usos ? <><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{taxaScript(s)}%</div><div className="mini apagado">{s.usos} usos</div></> : <span className="mini apagado">sem uso</span>}
                </div>
              </button>
            ))}
          </div>
          {ver && (
            <div className="bloco" style={{ background: 'var(--sup)' }}>
              <div className="bloco-cab">
                <h3>{ver.titulo}</h3>
                <button className="btn pq" onClick={() => setEditando(ver)}>Editar</button>
              </div>
              <div className="bloco-corpo">
                <p className="mini apagado" style={{ marginBottom: 10 }}>Prévia com um lead de exemplo:</p>
                <TextoScript texto={preencher(ver.corpo, exemplo)} />
              </div>
            </div>
          )}
        </div>
      )}
      {editando && <Editor script={editando} produto={produto} pesos={pesos} aoFechar={() => setEditando(null)} aoSalvar={async (s) => { await carregarScripts(); setVerId(s?.id); setCanal(s?.canal || canal); setEditando(null); }} />}
    </>
  );
}

function Editor({ script, produto, pesos, aoFechar, aoSalvar }) {
  const [s, setS] = useState(script);
  const [rodar, ocupado] = useAcao();
  const set = k => e => setS({ ...s, [k]: e.target.value || null });
  const inserir = v => setS({ ...s, corpo: `${s.corpo || ''}{${v}}` });
  const salvar = async () => {
    const r = await rodar(() => salvarScript({
      id: s.id, produto_id: s.produto_id, canal: s.canal, titulo: s.titulo, corpo: s.corpo, nicho: s.nicho || null,
      sinal: s.sinal || null, gatilho: s.gatilho || null, ordem: s.ordem ?? 99, ativo: s.ativo,
    }), 'Script salvo');
    if (r) aoSalvar(r);
  };
  const apagar = async () => {
    if (!window.confirm('Apagar este script?')) return;
    const r = await rodar(() => excluirScript(s.id), 'Script apagado');
    if (r !== undefined) aoSalvar(null);
  };
  return (
    <Modal titulo={s.id ? 'Editar script' : 'Novo script'} aoFechar={aoFechar} largura={720}>
      <div className="grade-2">
        <label className="campo"><span>Título</span><input value={s.titulo || ''} onChange={set('titulo')} placeholder="Ex.: Ligação para salão com equipe" /></label>
        <label className="campo"><span>Tipo</span>
          <select value={s.canal} onChange={set('canal')}>{CANAIS.map(c => <option key={c.chave} value={c.chave}>{c.nome}</option>)}</select>
        </label>
        <label className="campo"><span>Para qual nicho</span>
          <select value={s.nicho || ''} onChange={set('nicho')}>
            <option value="">Todos os nichos</option>
            {(produto.nichos || []).map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}
          </select>
        </label>
        <label className="campo"><span>Usar quando o lead tiver</span>
          <select value={s.sinal || ''} onChange={set('sinal')}>
            <option value="">Qualquer situação</option>
            {pesos.filter(p => !p.sinal.includes(':')).map(p => <option key={p.sinal} value={p.sinal}>{p.rotulo}</option>)}
          </select>
        </label>
      </div>
      {s.canal === 'objecao' && <label className="campo"><span>O que o cliente fala</span><input value={s.gatilho || ''} onChange={set('gatilho')} placeholder="Ex.: Tá caro" /></label>}
      <label className="campo"><span>Texto</span><textarea rows={12} value={s.corpo || ''} onChange={e => setS({ ...s, corpo: e.target.value })} /></label>
      <div>
        <p className="mini apagado" style={{ marginBottom: 6 }}>Clique para inserir. Linhas entre [colchetes] ou começando com → viram instruções para quem está ligando.</p>
        <div className="linha" style={{ gap: 6 }}>{VARIAVEIS.map(v => <button key={v} type="button" className="chip-toggle" onClick={() => inserir(v)}>{`{${v}}`}</button>)}</div>
      </div>
      <label className="linha pequeno"><input type="checkbox" checked={s.ativo} onChange={e => setS({ ...s, ativo: e.target.checked })} /> Ativo (aparece para os leads)</label>
      <div className="linha">
        <button className="btn primario" onClick={salvar} disabled={ocupado || !s.titulo || !s.corpo}>Salvar script</button>
        <button className="btn fantasma" onClick={aoFechar}>Cancelar</button>
        <span className="vazio-linha" />
        {s.id && <button className="btn fantasma" onClick={apagar}><Icone nome="lixo" tam={16} /> Apagar</button>}
      </div>
    </Modal>
  );
}
