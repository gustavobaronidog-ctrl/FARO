import { useEffect, useState } from 'react';
import Icone, { Marca } from './components/Icone.jsx';
import LeadPainel from './components/LeadPainel.jsx';
import { FaroProvider, useFaro } from './Contexto.jsx';
import Entrar from './pages/Entrar.jsx';
import Hoje from './pages/Hoje.jsx';
import Radar from './pages/Radar.jsx';
import Funil from './pages/Funil.jsx';
import Scripts from './pages/Scripts.jsx';
import Cacada from './pages/Cacada.jsx';
import Aprendizado from './pages/Aprendizado.jsx';
import Treino from './pages/Treino.jsx';
import Ajustes from './pages/Ajustes.jsx';
import { configurado } from './lib/supabase.js';
import * as dados from './lib/dados.js';

const PAGINAS = [
  { rota: 'hoje', nome: 'Hoje', icone: 'hoje', C: Hoje },
  { rota: 'radar', nome: 'Radar', icone: 'radar', C: Radar },
  { rota: 'funil', nome: 'Funil', icone: 'funil', C: Funil },
  { rota: 'scripts', nome: 'Scripts', icone: 'scripts', C: Scripts },
  { rota: 'treino', nome: 'Treino', icone: 'treino', C: Treino },
  { rota: 'cacada', nome: 'Caçada', icone: 'cacada', C: Cacada },
  { rota: 'aprendizado', nome: 'Aprendizado', icone: 'aprendizado', C: Aprendizado },
  { rota: 'ajustes', nome: 'Ajustes', icone: 'ajustes', C: Ajustes },
];

function useRota() {
  const ler = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'hoje');
  const [rota, setRota] = useState(ler);
  useEffect(() => {
    const f = () => { setRota(ler()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rota;
}

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    if (!configurado) { setSessao(null); return; }
    dados.sessaoAtual().then(setSessao);
    return dados.aoMudarSessao(setSessao);
  }, []);
  useEffect(() => {
    if (!sessao) { setPerfil(null); return; }
    dados.meuPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, [sessao?.user?.id]); // eslint-disable-line

  if (sessao === undefined || (sessao && perfil === undefined)) return <div className="vazio" style={{ paddingTop: '40vh' }}><span className="carregando" /></div>;
  if (!sessao) return <Entrar semConfiguracao={!configurado} />;
  if (!perfil || perfil.papel === 'pendente') return <Aguardando email={sessao.user.email} />;
  return <FaroProvider perfil={perfil}><Casca /></FaroProvider>;
}

function Casca() {
  const rota = useRota();
  const { perfil } = useFaro();
  const pagina = PAGINAS.find(p => p.rota === rota) || PAGINAS[0];
  const Pagina = pagina.C;
  useEffect(() => { document.title = `${pagina.nome} | Faro`; }, [pagina]);
  return (
    <div className="casca">
      <nav className="trilho" aria-label="Menu">
        <a className="marca" href="#/hoje" style={{ textDecoration: 'none' }}><Marca /><span className="marca-nome">Faro</span></a>
        {PAGINAS.map(p => (
          <a key={p.rota} className="nav-item" href={`#/${p.rota}`} aria-current={p.rota === pagina.rota ? 'page' : undefined}>
            <Icone nome={p.icone} /> {p.nome}
          </a>
        ))}
        <div className="trilho-pe">
          <div className="pequeno"><b>{perfil.nome}</b><div className="mini apagado">{perfil.papel === 'admin' ? 'Administrador' : 'Vendedor'}</div></div>
        </div>
      </nav>
      <main className="conteudo"><Pagina /></main>
      <nav className="barra-baixo" aria-label="Menu">
        {PAGINAS.filter(p => !['ajustes', 'aprendizado', 'cacada'].includes(p.rota)).map(p => (
          <a key={p.rota} href={`#/${p.rota}`} aria-current={p.rota === pagina.rota ? 'page' : undefined}><Icone nome={p.icone} tam={20} />{p.nome}</a>
        ))}
        <a href="#/ajustes" aria-current={['ajustes', 'aprendizado', 'cacada'].includes(pagina.rota) ? 'page' : undefined}><Icone nome="ajustes" tam={20} />Mais</a>
      </nav>
      <LeadPainel />
    </div>
  );
}

function Aguardando({ email }) {
  return (
    <div className="entrada-form" style={{ minHeight: '100%' }}>
      <div style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Marca tam={40} />
        <h1>Quase lá</h1>
        <p className="apagado">A conta {email} foi criada, mas ainda precisa ser liberada pelo administrador do Faro (em Ajustes, Equipe). Assim que liberar, é só recarregar esta página.</p>
        <div className="linha"><button className="btn" onClick={() => window.location.reload()}>Recarregar</button><button className="btn fantasma" onClick={() => dados.sair()}>Sair</button></div>
      </div>
    </div>
  );
}
