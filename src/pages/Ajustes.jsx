import { useEffect, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { useFaro, useAcao } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';

const lista = t => String(t || '').split(',').map(x => x.trim()).filter(Boolean);
const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Ajustes() {
  const { perfil, produto } = useFaro();
  const admin = perfil?.papel === 'admin';
  return (
    <>
      <div className="topo"><div><h1>Ajustes</h1><p>Produtos, cliente ideal de cada um, equipe e limites dos robôs.</p></div></div>
      <nav className="mais-telas" aria-label="Outras telas">
        <a className="btn" href="#/cacada"><Icone nome="cacada" tam={16} /> Caçada</a>
        <a className="btn" href="#/aprendizado"><Icone nome="aprendizado" tam={16} /> Aprendizado</a>
      </nav>
      <div className="duas-col" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <div>{admin ? <ProdutoEditor key={produto?.id || 'novo'} /> : <p className="apagado">Só o administrador edita os produtos.</p>}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MeuPerfil />
          {admin && <Equipe />}
          {admin && <Limites />}
        </div>
      </div>
    </>
  );
}

function ProdutoEditor() {
  const { produto, produtos, setProdutoId, carregarProdutos, carregarPesos } = useFaro();
  const [p, setP] = useState(produto || novoProduto());
  const [rodar, ocupado] = useAcao();
  useEffect(() => { setP(produto || novoProduto()); }, [produto]);
  function novoProduto() {
    return { nome: '', slug: '', cor: '#3E7CB1', site: '', ticket_mensal: 0, pitch: '', ativo: true, nichos: [], concorrentes: [], config: { cnpj_ativo: false, cnpj_janela_dias: 120, google_paginas: 3 } };
  }
  const set = k => e => setP({ ...p, [k]: e.target.value });
  const setNicho = (i, k, v) => setP({ ...p, nichos: p.nichos.map((n, j) => (j === i ? { ...n, [k]: v } : n)) });
  const setConc = (i, k, v) => setP({ ...p, concorrentes: p.concorrentes.map((n, j) => (j === i ? { ...n, [k]: v } : n)) });

  const salvar = async () => {
    const corpo = {
      ...p, slug: p.slug || slug(p.nome), ticket_mensal: Number(p.ticket_mensal) || 0,
      nichos: p.nichos.filter(n => n.nome).map(n => ({ ...n, chave: n.chave || slug(n.nome).slice(0, 24) })),
      concorrentes: p.concorrentes.filter(c => c.nome),
    };
    delete corpo.criado_em;
    const salvo = await rodar(async () => {
      const r = await dados.salvarProduto(corpo);
      if (!p.id) await dados.pesosPadrao(r.id);
      return r;
    }, p.id ? 'Produto salvo' : 'Produto criado. Agora adicione praças na Caçada.');
    if (salvo) { await carregarProdutos(); setProdutoId(salvo.id); carregarPesos(); }
  };

  return (
    <div className="cartao-simples">
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <h2>{p.id ? p.nome : 'Novo produto'}</h2>
        {p.id && <button className="btn pq" onClick={() => setP(novoProduto())}><Icone nome="mais" tam={15} /> Novo produto</button>}
      </div>
      <p className="pequeno apagado" style={{ marginTop: 4 }}>
        Cada produto ({produtos.map(x => x.nome).join(', ') || 'nenhum ainda'}) tem seus próprios leads, scripts, sinais e aprendizado. Nada se mistura.
      </p>
      <div className="grade-2" style={{ marginTop: 16 }}>
        <label className="campo"><span>Nome</span><input value={p.nome} onChange={set('nome')} /></label>
        <label className="campo"><span>Site</span><input value={p.site || ''} onChange={set('site')} /></label>
        <label className="campo"><span>Ticket mensal médio (R$)</span><input type="number" value={p.ticket_mensal} onChange={set('ticket_mensal')} /></label>
        <label className="campo"><span>Cor</span><input type="color" value={p.cor} onChange={set('cor')} style={{ height: 40, padding: 4 }} /></label>
      </div>
      <label className="campo" style={{ marginTop: 12 }}>
        <span>O que o produto resolve (a IA usa isso para escrever mensagens e responder objeções; seja específico e verdadeiro)</span>
        <textarea rows={7} value={p.pitch || ''} onChange={set('pitch')} />
      </label>

      <h3 style={{ marginTop: 22 }}>Nichos (cliente ideal)</h3>
      <p className="pequeno apagado">Buscas no Google viram praças de caça. CNAE é o código de atividade na Receita (ex.: 9602501 para cabeleireiros, 4711302 para supermercados). Palavras ajudam a separar nichos que dividem o mesmo CNAE.</p>
      {p.nichos.map((n, i) => (
        <div key={i} className="bloco" style={{ marginTop: 10 }}>
          <div className="bloco-corpo grade-2">
            <label className="campo"><span>Nome do nicho</span><input value={n.nome} onChange={e => setNicho(i, 'nome', e.target.value)} /></label>
            <label className="campo"><span>Buscas no Google (vírgula)</span><input value={(n.consultas || []).join(', ')} onChange={e => setNicho(i, 'consultas', lista(e.target.value))} /></label>
            <label className="campo"><span>CNAEs (vírgula)</span><input value={(n.cnaes || []).join(', ')} onChange={e => setNicho(i, 'cnaes', lista(e.target.value).map(x => x.replace(/\D/g, '')))} /></label>
            <label className="campo"><span>Palavras no nome (vírgula)</span><input value={(n.palavras || []).join(', ')} onChange={e => setNicho(i, 'palavras', lista(e.target.value))} /></label>
          </div>
          <div style={{ padding: '0 14px 12px' }}><button className="btn pq fantasma" onClick={() => setP({ ...p, nichos: p.nichos.filter((_, j) => j !== i) })}><Icone nome="lixo" tam={14} /> Tirar nicho</button></div>
        </div>
      ))}
      <button className="btn pq" style={{ marginTop: 10 }} onClick={() => setP({ ...p, nichos: [...p.nichos, { nome: '', consultas: [], cnaes: [], palavras: [] }] })}><Icone nome="mais" tam={15} /> Nicho</button>

      <h3 style={{ marginTop: 22 }}>Concorrentes</h3>
      <p className="pequeno apagado">Se o site do lead tiver um desses endereços, o Faro marca "Usa concorrente" e sugere o script de troca.</p>
      {p.concorrentes.map((c, i) => (
        <div key={i} className="linha" style={{ marginTop: 8 }}>
          <input className="entrada" style={{ width: 160 }} value={c.nome} onChange={e => setConc(i, 'nome', e.target.value)} placeholder="Nome" aria-label="Nome do concorrente" />
          <input className="entrada" style={{ flex: 1 }} value={(c.padroes || []).join(', ')} onChange={e => setConc(i, 'padroes', lista(e.target.value))} placeholder="trinks.com, ..." aria-label="Endereços do concorrente" />
          <button className="btn fantasma btn-icone" aria-label="Tirar concorrente" onClick={() => setP({ ...p, concorrentes: p.concorrentes.filter((_, j) => j !== i) })}><Icone nome="lixo" tam={15} /></button>
        </div>
      ))}
      <button className="btn pq" style={{ marginTop: 10 }} onClick={() => setP({ ...p, concorrentes: [...p.concorrentes, { nome: '', padroes: [] }] })}><Icone nome="mais" tam={15} /> Concorrente</button>

      <div className="linha" style={{ marginTop: 22 }}>
        <label className="pequeno linha" style={{ gap: 6 }}><input type="checkbox" checked={p.ativo} onChange={e => setP({ ...p, ativo: e.target.checked })} /> Robôs ligados para este produto</label>
        <span className="vazio-linha" />
        <button className="btn primario" onClick={salvar} disabled={ocupado || !p.nome}>{p.id ? 'Salvar produto' : 'Criar produto'}</button>
      </div>
    </div>
  );
}

function MeuPerfil() {
  const { perfil } = useFaro();
  const [f, setF] = useState({ nome: perfil?.nome || '', meta: perfil?.meta_contatos_dia || 40 });
  const [rodar, ocupado] = useAcao();
  return (
    <div className="cartao-simples">
      <h3>Você</h3>
      <p className="pequeno apagado" style={{ marginTop: 4 }}>{perfil?.email}. Seu primeiro nome entra nos scripts como {'{vendedor}'}.</p>
      <div className="grade-2" style={{ marginTop: 12 }}>
        <label className="campo"><span>Nome</span><input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></label>
        <label className="campo"><span>Meta de contatos por dia</span><input type="number" value={f.meta} onChange={e => setF({ ...f, meta: e.target.value })} /></label>
      </div>
      <div className="linha" style={{ marginTop: 12 }}>
        <button className="btn pq" disabled={ocupado} onClick={() => rodar(() => dados.atualizarPerfil(perfil.id, { nome: f.nome, meta_contatos_dia: Number(f.meta) || 40 }), 'Salvo. Recarregue a página para ver nos scripts.')}>Salvar</button>
        <span className="vazio-linha" />
        <button className="btn pq fantasma" onClick={() => dados.sair()}><Icone nome="sair" tam={15} /> Sair</button>
      </div>
    </div>
  );
}

function Equipe() {
  const [pessoas, setPessoas] = useState([]);
  const [rodar] = useAcao();
  const carregar = () => dados.listarEquipe().then(setPessoas).catch(() => {});
  useEffect(() => { carregar(); }, []);
  return (
    <div className="cartao-simples">
      <h3>Equipe</h3>
      <p className="pequeno apagado" style={{ marginTop: 4 }}>Quem se cadastrar no link do Faro fica "pendente" e não vê nada até você liberar aqui.</p>
      <div className="lista-simples" style={{ marginTop: 10 }}>
        {pessoas.map(p => (
          <div key={p.id} className="linha" style={{ justifyContent: 'space-between' }}>
            <div><b>{p.nome}</b><div className="mini apagado">{p.email}</div></div>
            <select className="entrada" style={{ width: 'auto' }} value={p.papel} aria-label={`Papel de ${p.nome}`}
              onChange={e => rodar(() => dados.atualizarPerfil(p.id, { papel: e.target.value }), 'Equipe atualizada').then(carregar)}>
              <option value="pendente">Pendente (sem acesso)</option>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function Limites() {
  const [a, setA] = useState(null);
  const [rodar, ocupado] = useAcao();
  useEffect(() => { dados.lerAjustes().then(setA).catch(() => {}); }, []);
  if (!a) return null;
  return (
    <div className="cartao-simples">
      <h3>Limites do Google</h3>
      <p className="pequeno apagado" style={{ marginTop: 4 }}>A cota grátis do Google é de 1.000 buscas por mês. Deixe uma margem para nunca ser cobrado.</p>
      <div className="grade-2" style={{ marginTop: 12 }}>
        <label className="campo"><span>Máximo por mês</span><input type="number" value={a.google_limite_mensal} onChange={e => setA({ ...a, google_limite_mensal: e.target.value })} /></label>
        <label className="campo"><span>Máximo por dia</span><input type="number" value={a.google_limite_diario} onChange={e => setA({ ...a, google_limite_diario: e.target.value })} /></label>
      </div>
      <button className="btn pq" style={{ marginTop: 12 }} disabled={ocupado}
        onClick={() => rodar(() => dados.salvarAjustes({ google_limite_mensal: Math.min(1000, Number(a.google_limite_mensal) || 950), google_limite_diario: Number(a.google_limite_diario) || 30 }), 'Limites salvos')}>Salvar limites</button>
    </div>
  );
}
