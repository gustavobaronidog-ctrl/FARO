import { useMemo, useState } from 'react';
import { Marca } from '../components/Icone.jsx';
import { entrar, cadastrar } from '../lib/dados.js';
import { corTermica } from '../lib/util.js';

// Campo de pontos com alguns focos de calor: a primeira coisa que o Faro mostra é o mapa
function MapaDeCalor() {
  const pontos = useMemo(() => {
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const focos = [[0.72, 0.28, 0.16], [0.35, 0.55, 0.12], [0.8, 0.7, 0.1], [0.22, 0.2, 0.08]];
    return Array.from({ length: 900 }, () => {
      const x = r(), y = r();
      const calor = Math.max(0, ...focos.map(([fx, fy, raio]) => 1 - Math.hypot(x - fx, (y - fy) * 1.2) / raio));
      return { x: x * 100, y: y * 100, score: Math.round(calor * 100 + r() * 18), raio: 0.35 + calor * 0.55 };
    });
  }, []);
  return (
    <svg className="mapa-calor" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {pontos.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.raio} fill={corTermica(p.score)} opacity={0.25 + p.score / 160} />)}
      <rect width="100" height="100" fill="url(#escurecer)" />
      <defs>
        <linearGradient id="escurecer" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".35" stopColor="#13282D" stopOpacity="0" /><stop offset="1" stopColor="#13282D" stopOpacity=".96" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Entrar({ semConfiguracao }) {
  const [modo, setModo] = useState('entrar');
  const [f, setF] = useState({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault(); setErro(''); setAviso(''); setOcupado(true);
    try {
      if (modo === 'entrar') await entrar(f.email, f.senha);
      else { await cadastrar(f.email, f.senha, f.nome); setAviso('Conta criada. Se o Supabase pedir confirmação, abra o e-mail que chegou e depois entre.'); setModo('entrar'); }
    } catch (er) {
      setErro(/Invalid login/i.test(er.message) ? 'E-mail ou senha errados.' : /already registered/i.test(er.message) ? 'Esse e-mail já tem conta. Entre com ele.' : er.message);
    } finally { setOcupado(false); }
  };

  return (
    <div className="entrada-tela">
      <div className="entrada-arte">
        <MapaDeCalor />
        <div className="linha" style={{ position: 'absolute', top: 32, left: 40 }}><Marca tam={34} /><span className="marca-nome">Faro</span></div>
        <h1>Seus próximos clientes já estão no mapa.</h1>
        <p>O Faro encontra negócios que precisam do que você vende, mostra quem está mais quente e te dá o roteiro certo para fechar.</p>
      </div>
      <div className="entrada-form">
        <form onSubmit={enviar}>
          <h2>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h2>
          {semConfiguracao && (
            <div className="aviso erro">Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel. Siga o passo 3 do guia de instalação.</div>
          )}
          {aviso && <div className="aviso">{aviso}</div>}
          {modo === 'cadastrar' && <label className="campo"><span>Seu nome</span><input required value={f.nome} onChange={set('nome')} autoComplete="name" /></label>}
          <label className="campo"><span>E-mail</span><input type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="campo"><span>Senha</span><input type="password" required minLength={8} value={f.senha} onChange={set('senha')} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} /></label>
          {erro && <div className="aviso erro" role="alert">{erro}</div>}
          <button className="btn primario gd" disabled={ocupado || semConfiguracao}>{ocupado ? <span className="carregando" /> : modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
          <button type="button" className="btn fantasma" onClick={() => { setModo(modo === 'entrar' ? 'cadastrar' : 'entrar'); setErro(''); }}>
            {modo === 'entrar' ? 'Primeira vez? Criar conta' : 'Já tenho conta'}
          </button>
          {modo === 'cadastrar' && <p className="mini apagado">A primeira conta criada vira a de administrador. As próximas esperam sua liberação.</p>}
        </form>
      </div>
    </div>
  );
}
