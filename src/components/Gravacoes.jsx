import { useCallback, useEffect, useRef, useState } from 'react';
import Icone from './Icone.jsx';
import AnaliseLigacao, { corNota, virgula } from './AnaliseLigacao.jsx';
import { useFaro } from '../Contexto.jsx';
import * as dados from '../lib/dados.js';
import { quando } from '../lib/util.js';
import { iniciarGravacao, prepararAudio, podeGravar, podeGravarComputador, duracaoTexto } from '../lib/audio.js';

const ETAPAS = [
  { chave: 'preparando', nome: 'Preparando o áudio' },
  { chave: 'enviando', nome: 'Guardando a gravação' },
  { chave: 'transcrevendo', nome: 'Transcrevendo a conversa' },
  { chave: 'analisando', nome: 'Treinador analisando' },
];

// Gravar a ligação (viva-voz ou computador) ou enviar o áudio do celular; depois transcreve e analisa sozinho
export function GravarLigacao({ lead, compacto = false, aoTerminar }) {
  const { toast } = useFaro();
  const [estado, setEstado] = useState('parado'); // parado | gravando | processando
  const [etapa, setEtapa] = useState(null);
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState(null);
  const gravacao = useRef(null);
  const modo = useRef('microfone');
  const arquivo = useRef(null);
  const alvo = useRef(lead); // a gravação fica presa ao lead em que começou, mesmo se a tela passar para o próximo

  useEffect(() => {
    if (estado !== 'gravando') return;
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);
  useEffect(() => () => gravacao.current?.cancelar(), []);

  const processar = async (bruto, origem) => {
    const doLead = alvo.current;
    setEstado('processando'); setErro(null);
    let lig = null;
    try {
      setEtapa('preparando');
      const { wav, duracao } = await prepararAudio(bruto);
      setEtapa('enviando');
      lig = await dados.enviarGravacao(doLead, wav, { duracao, origem });
      const pronta = await dados.processarLigacao(lig, setEtapa);
      toast(`Análise pronta: nota ${virgula(pronta.nota)}${compacto ? '. A aula completa está em Treino' : ''}`);
      aoTerminar?.(pronta, true);
    } catch (e) {
      setErro(e.message);
      if (lig) aoTerminar?.(lig, false); // a gravação ficou guardada; dá para analisar de novo depois
    } finally { setEstado('parado'); setEtapa(null); }
  };

  const gravar = async (m) => {
    setErro(null); modo.current = m; alvo.current = lead;
    try {
      gravacao.current = await iniciarGravacao(m, setNivel);
      gravacao.current.quandoCair(() => parar());
      setSegundos(0); setEstado('gravando');
    } catch (e) { setErro(e.message); }
  };
  const parar = async () => {
    const g = gravacao.current; gravacao.current = null;
    if (!g) return;
    const blob = await g.parar();
    setNivel(0);
    if (segundosRef.current < 5) { setEstado('parado'); setErro('Gravação curta demais. Grave a ligação inteira.'); return; }
    processar(blob, modo.current);
  };
  const segundosRef = useRef(0);
  segundosRef.current = segundos;
  const cancelar = () => { gravacao.current?.cancelar(); gravacao.current = null; setEstado('parado'); setNivel(0); };
  const escolherArquivo = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { alvo.current = lead; processar(f, 'arquivo'); } };

  if (estado === 'gravando') {
    return (
      <div className={`gravador ativo ${compacto ? 'compacto' : ''}`}>
        <span className="rec" aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <b className="num" style={{ fontSize: 20 }}>{duracaoTexto(segundos)}</b>
          <div className="mini apagado">{alvo.current.id !== lead.id ? `Ligação com ${alvo.current.nome}` : modo.current === 'computador' ? 'Gravando você e o som do computador' : 'Gravando pelo microfone: deixe no viva-voz'}</div>
        </div>
        <div className="nivel" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(i => <i key={i} style={{ height: `${Math.max(12, Math.min(100, nivel * 100 * (0.55 + 0.45 * Math.sin((i + 1) * 1.7) ** 2)))}%` }} />)}</div>
        <span className="vazio-linha" />
        <button className="btn fantasma pq" onClick={cancelar}>Descartar</button>
        <button className="btn primario" onClick={parar}><span className="quadrado" aria-hidden="true" /> Parar e analisar</button>
      </div>
    );
  }
  if (estado === 'processando') {
    const atual = ETAPAS.findIndex(x => x.chave === etapa);
    return (
      <div className={`gravador ${compacto ? 'compacto' : ''}`}>
        <div className="etapas-ia">
          {ETAPAS.map((x, i) => (
            <span key={x.chave} className={i < atual ? 'feita' : i === atual ? 'agora' : ''}>
              {i < atual ? <Icone nome="check" tam={14} /> : i === atual ? <span className="carregando" /> : <i />}{x.nome}
            </span>
          ))}
        </div>
        <p className="mini apagado">Pode levar até um minuto. Não feche esta tela.</p>
      </div>
    );
  }
  return (
    <div className={`gravador ${compacto ? 'compacto' : ''}`}>
      <div className="linha">
        {podeGravar() && <button className="btn rec-btn" onClick={() => gravar('microfone')} title="Grave pelo microfone com a ligação no viva-voz"><span className="rec" aria-hidden="true" /> Gravar no viva-voz</button>}
        {podeGravarComputador() && <button className="btn" onClick={() => gravar('computador')} title="Para ligação feita no computador (WhatsApp Web/Desktop): grava você e o som do PC"><Icone nome="tela" tam={16} /> Gravar no computador</button>}
        <button className="btn" onClick={() => arquivo.current?.click()}><Icone nome="enviar" tam={16} /> Enviar áudio</button>
        <input ref={arquivo} type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.aac,.opus,.webm" hidden onChange={escolherArquivo} />
      </div>
      {!compacto && <p className="mini apagado" style={{ marginTop: 8 }}>Ligou pelo celular com um app gravador? Use “Enviar áudio”. No começo da ligação, avise: “essa ligação pode ser gravada pra melhorar o atendimento”.</p>}
      {erro && <div className="aviso erro" role="alert" style={{ marginTop: 10 }}>{erro}</div>}
    </div>
  );
}

// Bloco da gaveta do lead: gravar + lista das ligações deste lead
export default function Gravacoes({ lead }) {
  const [lista, setLista] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [falta, setFalta] = useState(null);
  const { mudou } = useFaro();

  const carregar = useCallback(async () => {
    try { setLista(await dados.listarLigacoes(lead.id)); setFalta(null); }
    catch (e) { setLista([]); setFalta(e.message); }
  }, [lead.id]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <section className="bloco">
      <div className="bloco-cab">
        <h3>Ligações gravadas</h3>
        <span className="pequeno apagado">Treinador com IA · método SPIN</span>
      </div>
      <div className="bloco-corpo">
        {falta ? <div className="aviso">{falta}</div> : (
          <GravarLigacao lead={lead} aoTerminar={(lig, ok) => { carregar(); mudou(); if (ok) setAberta(lig); }} />
        )}
        {lista?.length > 0 && (
          <div className="gravacoes">
            {lista.map(l => (
              <button key={l.id} className="gravacao" onClick={() => setAberta(l)}>
                <span className="gravacao-nota" style={l.nota != null ? { color: corNota(l.nota), borderColor: corNota(l.nota) } : undefined}>
                  {l.nota != null ? virgula(l.nota) : l.status === 'erro' ? '!' : <span className="carregando" />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="pequeno" style={{ display: 'block', fontWeight: 600 }}>{l.analise?.veredito || (l.status === 'erro' ? 'Não foi analisada: toque para tentar de novo' : 'Analisando…')}</span>
                  <span className="mini apagado">{quando(l.criado_em)}{l.duracao_seg ? ` · ${duracaoTexto(l.duracao_seg)} min` : ''}{l.perfis?.nome ? ` · ${l.perfis.nome}` : ''}</span>
                </span>
                <Icone nome="seta" tam={16} />
              </button>
            ))}
          </div>
        )}
      </div>
      {aberta && <AnaliseLigacao ligacao={{ ...aberta, leads: aberta.leads || { nome: lead.nome } }} aoFechar={() => setAberta(null)} aoMudar={() => { carregar(); mudou(); }} />}
    </section>
  );
}
