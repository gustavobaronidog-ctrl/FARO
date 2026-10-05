import { useEffect, useMemo, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { Carregando } from '../components/Comuns.jsx';
import AnaliseLigacao, { AnelNota, BarraNota, SPIN, HABILIDADES, corNota, virgula } from '../components/AnaliseLigacao.jsx';
import { useFaro } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { quando } from '../lib/util.js';
import { duracaoTexto } from '../lib/audio.js';

const media = (xs) => { const v = xs.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + Number(b), 0) / v.length : null; };

export default function Treino() {
  const { perfil, versao, mudou } = useFaro();
  const [quem, setQuem] = useState('eu');
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);
  const [aberta, setAberta] = useState(null);
  const admin = perfil?.papel === 'admin';

  useEffect(() => {
    let vivo = true;
    dados.ligacoesDoTreino({ usuarioId: quem === 'eu' ? perfil.id : null })
      .then(r => { if (vivo) { setLista(r); setErro(null); } })
      .catch(e => { if (vivo) { setLista([]); setErro(e.message); } });
    return () => { vivo = false; };
  }, [quem, perfil.id, versao]);

  const prontas = useMemo(() => (lista || []).filter(l => l.status === 'pronta' && l.nota != null), [lista]);
  const r = useMemo(() => resumir(prontas), [prontas]);

  return (
    <>
      <div className="topo">
        <div>
          <h1>Treino</h1>
          <p>Cada ligação gravada vira uma aula: nota, o que funcionou, o que falar no lugar e a sua evolução no método SPIN.</p>
        </div>
        {admin && (
          <div className="abas" role="group" aria-label="De quem">
            <button aria-pressed={quem === 'eu'} onClick={() => setQuem('eu')}>Meu treino</button>
            <button aria-pressed={quem === 'equipe'} onClick={() => setQuem('equipe')}>Equipe toda</button>
          </div>
        )}
      </div>

      {erro && <div className="aviso" style={{ marginBottom: 16 }}>{erro}</div>}
      {!lista ? <Carregando /> : prontas.length === 0 ? <Vazio /> : (
        <>
          <div className="treino-numeros">
            <div className="cartao-simples treino-destaque">
              <AnelNota nota={r.mediaRecente} tam={96} legenda="média" />
              <div>
                <span className="mini apagado">Nota das últimas {Math.min(5, prontas.length)} ligações</span>
                {r.variacao != null && (
                  <p className={`variacao ${r.variacao >= 0 ? 'sobe' : 'desce'}`}>
                    {r.variacao >= 0 ? '▲' : '▼'} {virgula(Math.abs(r.variacao))} <span className="mini apagado">em relação às 5 anteriores</span>
                  </p>
                )}
              </div>
            </div>
            <Numero rotulo="Ligações analisadas" valor={prontas.length} />
            <Numero rotulo="Melhor nota" valor={virgula(r.melhor)} />
            <Numero rotulo="Você fala, em média" valor={r.fala != null ? `${Math.round(r.fala)}%` : '–'} dica={r.fala != null ? (r.fala <= 50 ? 'boa proporção' : 'pergunte mais, fale menos') : ''} />
          </div>

          <div className="duas-col treino-grafico" style={{ marginTop: 22 }}>
            <section className="cartao-simples">
              <h3>Evolução da nota</h3>
              <p className="mini apagado" style={{ marginBottom: 10 }}>Cada ponto é uma ligação. A linha tracejada é a média das últimas 5.</p>
              <GraficoEvolucao pontos={prontas} aoAbrir={setAberta} />
            </section>
            <section className="cartao-simples foco-treino">
              <span className="mini plano-rotulo">Seu foco agora</span>
              <p className="plano-foco">{r.ultima.analise?.foco_do_treino}</p>
              <p className="pequeno apagado" style={{ marginTop: 6 }}>Ponto mais fraco no SPIN: <b style={{ color: 'var(--texto)' }}>{r.fraca.nome}</b> ({virgula(r.fraca.media)})</p>
              {r.ultima.analise?.proxima_ligacao?.length > 0 && (
                <>
                  <span className="mini plano-rotulo" style={{ marginTop: 16 }}>Na próxima ligação</span>
                  <ol className="plano-lista">{r.ultima.analise.proxima_ligacao.map((x, i) => <li key={i}>{x}</li>)}</ol>
                </>
              )}
            </section>
          </div>

          <div className="duas-col" style={{ marginTop: 22 }}>
            <section className="cartao-simples">
              <h3>Seu SPIN</h3>
              <p className="mini apagado" style={{ marginBottom: 14 }}>Média de cada etapa nas últimas 10 ligações.</p>
              <div className="spin-perfil">
                {SPIN.map(s => {
                  const m = r.spin[s.chave];
                  return (
                    <div key={s.chave} className={`spin-linha spin-${s.letra.toLowerCase()} ${r.fraca.chave === s.chave ? 'fraca' : ''}`}>
                      <span className="spin-letra">{s.letra}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="linha" style={{ justifyContent: 'space-between' }}>
                          <span className="pequeno" style={{ fontWeight: 600 }}>{s.nome}{r.fraca.chave === s.chave ? <span className="etq neg" style={{ marginLeft: 8 }}>treinar</span> : null}</span>
                          <b className="num">{virgula(m)}</b>
                        </div>
                        <BarraNota nota={m} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="cartao-simples">
              <h3>Habilidades</h3>
              <p className="mini apagado" style={{ marginBottom: 14 }}>Média nas últimas 10 ligações.</p>
              <div className="habilidades">
                {HABILIDADES.map(h => (
                  <div key={h.chave} className="habilidade">
                    <span className="pequeno">{h.nome}</span>
                    <BarraNota nota={r.hab[h.chave]} />
                    <b className="num pequeno">{virgula(r.hab[h.chave])}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section style={{ marginTop: 22 }}>
            <h3 style={{ marginBottom: 10 }}>Últimas ligações</h3>
            <div className="lista">
              {[...(lista || [])].reverse().slice(0, 30).map(l => (
                <button key={l.id} className="gravacao linha-treino" onClick={() => setAberta(l)}>
                  <span className="gravacao-nota" style={l.nota != null ? { color: corNota(l.nota), borderColor: corNota(l.nota) } : undefined}>
                    {l.nota != null ? virgula(l.nota) : l.status === 'erro' ? '!' : '…'}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="pequeno" style={{ display: 'block', fontWeight: 600 }}>{l.leads?.nome || 'Lead'}</span>
                    <span className="mini apagado" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.analise?.veredito || (l.status === 'erro' ? 'Não foi analisada' : 'Em análise')}</span>
                  </span>
                  <span className="mini apagado esconde-cel" style={{ textAlign: 'right' }}>{quando(l.criado_em)}<br />{l.duracao_seg ? `${duracaoTexto(l.duracao_seg)} min` : ''}{quem === 'equipe' && l.perfis?.nome ? ` · ${l.perfis.nome}` : ''}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      {aberta && <AbrirAnalise id={aberta.id} aoFechar={() => setAberta(null)} aoMudar={mudou} />}
    </>
  );
}

// a lista do treino vem enxuta: carrega a ligação completa (com transcrição) ao abrir
function AbrirAnalise({ id, aoFechar, aoMudar }) {
  const [lig, setLig] = useState(null);
  const { toast } = useFaro();
  useEffect(() => { dados.carregarLigacao(id).then(setLig).catch(e => { toast(e.message, 'erro'); aoFechar(); }); }, [id]); // eslint-disable-line
  return lig ? <AnaliseLigacao ligacao={lig} aoFechar={aoFechar} aoMudar={aoMudar} /> : null;
}

function resumir(prontas) {
  if (!prontas.length) return null;
  const notas = prontas.map(p => Number(p.nota));
  const ult5 = notas.slice(-5), ant5 = notas.slice(-10, -5);
  const ult10 = prontas.slice(-10);
  const spin = Object.fromEntries(SPIN.map(s => [s.chave, media(ult10.map(p => p.analise?.spin?.[s.chave]?.nota))]));
  const hab = Object.fromEntries(HABILIDADES.map(h => [h.chave, media(ult10.map(p => p.analise?.habilidades?.[h.chave]?.nota))]));
  const fraca = SPIN.map(s => ({ ...s, media: spin[s.chave] })).filter(s => s.media != null).sort((a, b) => a.media - b.media)[0] || SPIN[2];
  return {
    mediaRecente: media(ult5), variacao: ant5.length ? media(ult5) - media(ant5) : null,
    melhor: Math.max(...notas), fala: media(ult10.map(p => p.fala_vendedor)), spin, hab, fraca, ultima: prontas[prontas.length - 1],
  };
}

function Numero({ rotulo, valor, dica }) {
  return (
    <div className="cartao-simples treino-numero">
      <span className="mini apagado">{rotulo}</span>
      <b className="num">{valor}</b>
      {dica && <span className="mini apagado">{dica}</span>}
    </div>
  );
}

// Uma série só (a nota), por isso sem legenda: o título nomeia. Passe o mouse ou toque para ver cada ligação.
function GraficoEvolucao({ pontos, aoAbrir }) {
  const [sobre, setSobre] = useState(null);
  const L = 640, A = 220, m = { e: 30, d: 12, t: 12, b: 26 };
  const w = L - m.e - m.d, h = A - m.t - m.b;
  const n = pontos.length;
  const x = i => m.e + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = v => m.t + h - (Math.max(0, Math.min(10, v)) / 10) * h;
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.nota).toFixed(1)}`).join('');
  const movel = pontos.map((_, i) => media(pontos.slice(Math.max(0, i - 4), i + 1).map(p => p.nota)));
  const linhaMovel = movel.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const p = sobre != null ? pontos[sobre] : null;
  const perto = (ev) => {
    const caixa = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - caixa.left) / caixa.width) * L;
    let melhor = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    setSobre(melhor);
  };
  return (
    <div className="grafico" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label={`Evolução da nota em ${n} ligações`}
        onMouseMove={perto} onMouseLeave={() => setSobre(null)} onClick={() => p && aoAbrir(p)} style={{ cursor: p ? 'pointer' : 'default', display: 'block' }}>
        {[0, 2.5, 5, 7.5, 10].map(v => (
          <g key={v}>
            <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} stroke="var(--linha)" strokeWidth="1" strokeDasharray={v ? '2 4' : undefined} />
            <text x={m.e - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--apagado)">{String(v).replace('.', ',')}</text>
          </g>
        ))}
        {n > 1 && <path d={linhaMovel} fill="none" stroke="var(--texto-2)" strokeWidth="1.5" strokeDasharray="5 4" opacity=".55" />}
        {n > 1 && <path d={linha} fill="none" stroke="var(--texto)" strokeWidth="2" strokeLinejoin="round" />}
        {p && <line x1={x(sobre)} x2={x(sobre)} y1={m.t} y2={m.t + h} stroke="var(--linha-forte)" strokeWidth="1" />}
        {pontos.map((pt, i) => (
          <circle key={pt.id} cx={x(i)} cy={y(pt.nota)} r={sobre === i ? 7 : 5} fill={corNota(pt.nota)} stroke="var(--sup)" strokeWidth="2" />
        ))}
        <text x={m.e} y={A - 6} fontSize="11" fill="var(--apagado)">{new Date(pontos[0].criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</text>
        {n > 1 && <text x={L - m.d} y={A - 6} fontSize="11" fill="var(--apagado)" textAnchor="end">{new Date(pontos[n - 1].criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</text>}
      </svg>
      {p && (
        <div className="dica-grafico" style={{ left: `${(x(sobre) / L) * 100}%`, top: `${(y(p.nota) / A) * 100}%` }}>
          <b className="num">{virgula(p.nota)}</b> · {p.leads?.nome || 'Lead'}
          <div className="mini apagado">{quando(p.criado_em)} · clique para abrir</div>
        </div>
      )}
      <div className="so-leitor"><table>
        <caption>Notas das ligações</caption>
        <tbody>{pontos.map(pt => <tr key={pt.id}><td>{new Date(pt.criado_em).toLocaleDateString('pt-BR')}</td><td>{pt.leads?.nome}</td><td>{virgula(pt.nota)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

function Vazio() {
  return (
    <div className="treino-vazio">
      <div className="cartao-simples">
        <h2>Sua primeira aula começa na próxima ligação</h2>
        <ol className="plano-lista" style={{ marginTop: 14 }}>
          <li>Abra um lead e use o roteiro <b>SPIN</b> que aparece na ligação.</li>
          <li>Na gaveta do lead, em <b>Ligações gravadas</b>, toque em <b>Gravar no viva-voz</b> (ou <b>Gravar no computador</b>, se ligar pelo WhatsApp no PC).</li>
          <li>Ligou pelo celular com um app gravador? Use <b>Enviar áudio</b>.</li>
          <li>Em menos de um minuto o treinador te dá a nota, o que você acertou, o que falar no lugar e o seu foco de treino.</li>
        </ol>
        <p className="mini apagado" style={{ marginTop: 14 }}>No começo da ligação, avise: “essa ligação pode ser gravada pra melhorar o atendimento”.</p>
      </div>
      <div className="cartao-simples spin-explica">
        <h3>O método SPIN em 30 segundos</h3>
        {[
          ['S', 'Situação', 'Entenda como o negócio funciona hoje. Poucas perguntas, só o necessário.'],
          ['P', 'Problema', 'Faça o cliente falar das dificuldades, com as palavras dele.'],
          ['I', 'Implicação', 'Ele mesmo calcula quanto o problema custa. É aqui que a venda acontece.'],
          ['N', 'Necessidade', 'Ele diz que quer resolver. Aí sim você apresenta e marca o próximo passo.'],
        ].map(([l, n, d]) => (
          <div key={l} className={`spin-linha spin-${l.toLowerCase()}`} style={{ marginTop: 12 }}>
            <span className="spin-letra">{l}</span>
            <div><b className="pequeno">{n}</b><p className="mini apagado">{d}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
