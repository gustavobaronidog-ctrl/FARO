import { useEffect, useRef, useState } from 'react';
import Icone from './Icone.jsx';
import { Modal } from './Comuns.jsx';
import { useFaro } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { quando } from '../lib/util.js';
import { duracaoTexto, emSegundos } from '../lib/audio.js';

export const SPIN = [
  { chave: 'situacao', letra: 'S', nome: 'Situação' },
  { chave: 'problema', letra: 'P', nome: 'Problema' },
  { chave: 'implicacao', letra: 'I', nome: 'Implicação' },
  { chave: 'necessidade', letra: 'N', nome: 'Necessidade' },
];
export const HABILIDADES = [
  { chave: 'abertura', nome: 'Abertura' }, { chave: 'escuta', nome: 'Escuta' },
  { chave: 'objecoes', nome: 'Objeções' }, { chave: 'fechamento', nome: 'Fechamento' }, { chave: 'tom', nome: 'Tom e energia' },
];
export const virgula = n => (n == null ? '–' : String(Number(n).toFixed(1)).replace('.', ','));
// faixas de desempenho (o número sempre aparece junto, a cor só reforça): abaixo de 5, de 5 a 7,4, 7,5 ou mais
export const corNota = n => (n == null ? 'var(--linha-forte)' : n >= 7.5 ? 'var(--bom)' : n >= 5 ? 'var(--quente)' : 'var(--ruim)');

// Anel com a nota de 0 a 10
export function AnelNota({ nota, tam = 112, legenda = 'nota' }) {
  const r = tam / 2 - 7, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, (nota ?? 0) / 10));
  return (
    <div className="anel-nota" style={{ width: tam, height: tam }} role="img" aria-label={`Nota ${virgula(nota)} de 10`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--sup-3)" strokeWidth="6" />
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={corNota(nota)} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      </svg>
      <div><b className="num" style={{ fontSize: tam * 0.3 }}>{virgula(nota)}</b><span className="mini apagado">{legenda}</span></div>
    </div>
  );
}

export function BarraNota({ nota }) {
  return <div className="barra-nota" aria-hidden="true"><i style={{ width: `${(nota ?? 0) * 10}%`, background: corNota(nota) }} /></div>;
}

export default function AnaliseLigacao({ ligacao: inicial, aoFechar, aoMudar }) {
  const { toast, admin } = useFaro();
  const [lig, setLig] = useState(inicial);
  const [aba, setAba] = useState('analise');
  const [url, setUrl] = useState(null);
  const [agora, setAgora] = useState(0);
  const [refazendo, setRefazendo] = useState(false);
  const audio = useRef(null);
  const a = lig.analise;

  useEffect(() => { dados.linkDoAudio(lig.audio_path).then(setUrl).catch(() => setUrl(null)); }, [lig.audio_path]);

  const tocar = (mmss) => {
    const s = emSegundos(mmss);
    if (s == null || !audio.current) return;
    audio.current.currentTime = Math.max(0, s - 1);
    audio.current.play().catch(() => {});
  };
  const refazer = async () => {
    setRefazendo(true);
    try { const nova = await dados.processarLigacao(lig); setLig(nova); aoMudar?.(); toast('Análise pronta'); }
    catch (e) { toast(e.message, 'erro'); }
    finally { setRefazendo(false); }
  };
  const apagar = async () => {
    if (!window.confirm('Apagar esta gravação e a análise? Não dá para desfazer.')) return;
    try { await dados.apagarLigacao(lig); aoMudar?.(); aoFechar(); toast('Gravação apagada'); } catch (e) { toast(e.message, 'erro'); }
  };
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { toast('Não consegui copiar', 'erro'); } };

  const titulo = `Ligação${lig.leads?.nome ? ` com ${lig.leads.nome}` : ''}`;
  return (
    <Modal titulo={titulo} aoFechar={aoFechar} largura={980}>
      <div className="linha pequeno apagado" style={{ marginTop: -8 }}>
        <span>{quando(lig.criado_em)}</span>
        {lig.duracao_seg ? <span>· {duracaoTexto(lig.duracao_seg)} min</span> : null}
        {lig.perfis?.nome ? <span>· {lig.perfis.nome}</span> : null}
      </div>

      <div className="player">
        {url ? <audio ref={audio} src={url} controls preload="metadata" onTimeUpdate={e => setAgora(e.currentTarget.currentTime)} /> : <span className="pequeno apagado">Carregando o áudio…</span>}
      </div>

      {!a ? (
        <div className="cartao-simples" style={{ textAlign: 'center' }}>
          {lig.status === 'erro' ? <p>{lig.erro || 'A análise falhou.'}</p> : <p className="apagado"><span className="carregando" /> A IA ainda está ouvindo esta ligação…</p>}
          <button className="btn" style={{ marginTop: 12 }} onClick={refazer} disabled={refazendo}>{refazendo ? <span className="carregando" /> : <Icone nome="girar" tam={16} />} Analisar de novo</button>
        </div>
      ) : (
        <>
          <div className="abas" role="group" aria-label="Ver">
            <button aria-pressed={aba === 'analise'} onClick={() => setAba('analise')}>Análise do treinador</button>
            <button aria-pressed={aba === 'transcricao'} onClick={() => setAba('transcricao')}>Transcrição</button>
          </div>

          {aba === 'analise' ? (
            <div className="analise">
              <section className="analise-topo">
                <AnelNota nota={a.nota_geral} />
                <div style={{ minWidth: 0 }}>
                  <p className="veredito">“{a.veredito}”</p>
                  <p className="apagado" style={{ marginTop: 6 }}>{a.resumo}</p>
                  {lig.fala_vendedor != null && <Proporcao vendedor={lig.fala_vendedor} />}
                </div>
              </section>

              <section>
                <h3 className="analise-titulo">Método SPIN</h3>
                <div className="spin-grade">
                  {SPIN.map(s => (
                    <div key={s.chave} className={`spin-cartao spin-${s.letra.toLowerCase()}`}>
                      <div className="linha" style={{ justifyContent: 'space-between' }}>
                        <span className="spin-letra">{s.letra}</span>
                        <b className="num" style={{ fontSize: 22 }}>{virgula(a.spin?.[s.chave]?.nota)}</b>
                      </div>
                      <div className="pequeno" style={{ fontWeight: 600, marginTop: 6 }}>{s.nome}</div>
                      <BarraNota nota={a.spin?.[s.chave]?.nota} />
                      <p className="mini apagado" style={{ marginTop: 8 }}>{a.spin?.[s.chave]?.comentario}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="analise-duas">
                <div>
                  <h3 className="analise-titulo">Habilidades</h3>
                  <div className="habilidades">
                    {HABILIDADES.map(h => (
                      <div key={h.chave} className="habilidade" title={a.habilidades?.[h.chave]?.comentario}>
                        <span className="pequeno">{h.nome}</span>
                        <BarraNota nota={a.habilidades?.[h.chave]?.nota} />
                        <b className="num pequeno">{virgula(a.habilidades?.[h.chave]?.nota)}</b>
                        <p className="mini apagado">{a.habilidades?.[h.chave]?.comentario}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="momento">
                  <h3 className="analise-titulo">Momento-chave</h3>
                  <p>{a.momento_chave?.descricao}</p>
                  {a.momento_chave?.inicio && <button className="btn pq" style={{ marginTop: 10 }} onClick={() => tocar(a.momento_chave.inicio)}><Icone nome="play" tam={14} /> Ouvir em {a.momento_chave.inicio}</button>}
                </div>
              </section>

              <section className="analise-duas">
                <div>
                  <h3 className="analise-titulo"><span className="ponto bom" /> O que você acertou</h3>
                  {(a.pontos_fortes || []).map((p, i) => (
                    <div key={i} className="trecho forte">
                      <div className="linha" style={{ justifyContent: 'space-between' }}><b>{p.titulo}</b>{p.inicio && <button className="btn fantasma pq" onClick={() => tocar(p.inicio)}><Icone nome="play" tam={13} /> {p.inicio}</button>}</div>
                      <blockquote>{p.trecho}</blockquote>
                      <p className="pequeno apagado">{p.por_que}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="analise-titulo"><span className="ponto ruim" /> O que melhorar</h3>
                  {(a.pontos_fracos || []).map((p, i) => (
                    <div key={i} className="trecho fraco">
                      <div className="linha" style={{ justifyContent: 'space-between' }}><b>{p.titulo}</b>{p.inicio && <button className="btn fantasma pq" onClick={() => tocar(p.inicio)}><Icone nome="play" tam={13} /> {p.inicio}</button>}</div>
                      <blockquote>{p.trecho}</blockquote>
                      <div className="melhor"><span className="mini">Fale assim</span>{p.melhor_seria}</div>
                    </div>
                  ))}
                </div>
              </section>

              {a.perguntas_que_faltaram?.length > 0 && (
                <section>
                  <h3 className="analise-titulo">Perguntas que faltaram</h3>
                  <div className="perguntas">
                    {a.perguntas_que_faltaram.map((q, i) => (
                      <button key={i} className="pergunta" onClick={() => copiar(q)} title="Copiar">“{q}”<Icone nome="copiar" tam={14} /></button>
                    ))}
                  </div>
                </section>
              )}

              <section className="plano">
                <div>
                  <span className="mini plano-rotulo">Seu foco de treino</span>
                  <p className="plano-foco">{a.foco_do_treino}</p>
                  {a.evolucao && <p className="pequeno apagado" style={{ marginTop: 8 }}>{a.evolucao}</p>}
                </div>
                <div>
                  <span className="mini plano-rotulo">Na próxima ligação</span>
                  <ol className="plano-lista">{(a.proxima_ligacao || []).map((x, i) => <li key={i}>{x}</li>)}</ol>
                </div>
                <div>
                  <span className="mini plano-rotulo">Com este cliente</span>
                  <p className="pequeno">{a.proximo_passo_com_este_cliente}</p>
                </div>
              </section>
            </div>
          ) : (
            <Transcricao falas={lig.transcricao || []} agora={agora} aoTocar={tocar} />
          )}
        </>
      )}

      <div className="linha" style={{ borderTop: '1px solid var(--linha)', paddingTop: 12 }}>
        {a && <button className="btn pq fantasma" onClick={refazer} disabled={refazendo}>{refazendo ? <span className="carregando" /> : <Icone nome="girar" tam={14} />} Refazer análise</button>}
        <span className="vazio-linha" />
        {admin && <button className="btn pq fantasma" onClick={apagar}><Icone nome="lixo" tam={14} /> Apagar gravação</button>}
      </div>
    </Modal>
  );
}

function Proporcao({ vendedor }) {
  const cliente = 100 - vendedor;
  const bom = vendedor <= 50;
  return (
    <div className="proporcao">
      <div className="linha mini" style={{ justifyContent: 'space-between' }}>
        <span>Você falou <b>{vendedor}%</b></span><span>Cliente falou <b>{cliente}%</b></span>
      </div>
      <div className="proporcao-barra" aria-hidden="true"><i style={{ width: `${vendedor}%` }} /><i style={{ width: `${cliente}%` }} /></div>
      <span className="mini apagado">{bom ? 'Boa: no SPIN, quem fala mais é o cliente.' : 'No SPIN, o ideal é o cliente falar mais que você. Pergunte e escute.'}</span>
    </div>
  );
}

function Transcricao({ falas, agora, aoTocar }) {
  const tempos = falas.map(f => emSegundos(f.inicio) ?? 0);
  let atual = -1;
  for (let i = 0; i < tempos.length; i++) if (agora + 0.3 >= tempos[i]) atual = i;
  if (!falas.length) return <p className="apagado">Sem transcrição.</p>;
  return (
    <div className="transcricao">
      {falas.map((f, i) => (
        <div key={i} className={`fala ${f.quem === 'vendedor' ? 'eu' : 'ele'} ${i === atual && agora > 0 ? 'tocando' : ''}`}>
          <button className="fala-tempo" onClick={() => aoTocar(f.inicio)} aria-label={`Ouvir a partir de ${f.inicio}`}>{f.inicio}</button>
          <div className="fala-balao"><span className="mini">{f.quem === 'vendedor' ? 'Você' : 'Cliente'}</span>{f.texto}</div>
        </div>
      ))}
    </div>
  );
}
