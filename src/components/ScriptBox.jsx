import { useEffect, useMemo, useState } from 'react';
import Icone from './Icone.jsx';
import { useFaro } from '../Contexto.jsx';
import { TextoIA } from './Comuns.jsx';
import { scriptsParaLead, preencher, variaveisDoLead, linkWhatsApp, taxaScript } from '../lib/util.js';
import { pedirIA } from '../lib/dados.js';

const CANAIS = [
  { chave: 'ligacao', nome: 'Ligação' },
  { chave: 'whatsapp', nome: 'WhatsApp' },
  { chave: 'followup', nome: 'Follow-up' },
  { chave: 'objecao', nome: 'Objeções' },
];

// "[S · SITUAÇÃO — dica]" vira o cabeçalho de uma etapa do SPIN
const ETAPA = /^\s*\[(S|P|I|N|APRESENTAÇÃO|FECHAMENTO)\s*(?:·\s*([^\]—]+?))?\s*(?:—\s*([^\]]+))?\]\s*$/;
export const ETAPAS_SPIN = { S: 'Situação', P: 'Problema', I: 'Implicação', N: 'Necessidade' };

export function TextoScript({ texto }) {
  return (
    <div className="script-texto">
      {texto.split('\n').map((l, i) => {
        const e = l.match(ETAPA);
        if (e) {
          const letra = e[1].length === 1 ? e[1] : null;
          return (
            <div key={i} className={`etapa-spin ${letra ? `spin-${letra.toLowerCase()}` : 'spin-fim'}`}>
              {letra && <span className="etapa-letra">{letra}</span>}
              <span className="etapa-nome">{letra ? ETAPAS_SPIN[letra] : e[1].charAt(0) + e[1].slice(1).toLowerCase()}</span>
              {e[3] && <span className="etapa-dica">{e[3]}</span>}
            </div>
          );
        }
        const marca = /^\s*(\[.*\]|→.*)\s*$/.test(l);
        const dica = !marca && l.match(/^\s*(\[[^\]]+\])\s*(.+)$/); // "[se estiver gravando] Só te aviso…"
        if (dica) return <div key={i}><span className="marcacao">{dica[1]}</span> {dica[2]}</div>;
        return <div key={i} className={marca ? 'marcacao' : undefined}>{l || '\u00a0'}</div>;
      })}
    </div>
  );
}

// Script recomendado para o lead, já preenchido com as variáveis
export default function ScriptBox({ lead, canalInicial = 'ligacao', scriptInicial, aoEscolher }) {
  const { scripts, produto, perfil, toast } = useFaro();
  const [canal, setCanal] = useState(canalInicial);
  const [escolhido, setEscolhido] = useState(scriptInicial || null);
  const [ia, setIa] = useState(null);
  const [carregandoIa, setCarregandoIa] = useState(false);
  const [objecao, setObjecao] = useState('');

  useEffect(() => { setCanal(canalInicial); }, [canalInicial, lead.id]);
  useEffect(() => { setIa(null); }, [canal, lead.id]);

  const opcoes = useMemo(() => scriptsParaLead(scripts, lead, canal), [scripts, lead, canal]);
  const atual = opcoes.find(s => s.id === escolhido) || opcoes[0];
  useEffect(() => { aoEscolher?.(atual?.id || null, canal); }, [atual?.id, canal]); // eslint-disable-line

  const vars = variaveisDoLead(lead, { produto, perfil });
  const texto = atual ? preencher(atual.corpo, vars) : '';
  const melhor = opcoes.reduce((m, s) => (s.usos >= 5 && (!m || (s.positivos + 1) / (s.usos + 2) > (m.positivos + 1) / (m.usos + 2)) ? s : m), null);

  const copiar = async (t) => {
    try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { toast('Não consegui copiar', 'erro'); }
  };
  const chamarIa = async (acao, entrada) => {
    setCarregandoIa(true); setIa(null);
    try { setIa(await pedirIA({ acao, lead_id: lead.id, script_id: atual?.id, entrada })); }
    catch (e) { toast(e.message, 'erro'); }
    finally { setCarregandoIa(false); }
  };

  return (
    <section className="bloco">
      <div className="bloco-cab">
        <div className="abas" role="group" aria-label="Tipo de script">
          {CANAIS.map(c => (
            <button key={c.chave} aria-pressed={canal === c.chave} onClick={() => { setCanal(c.chave); setEscolhido(null); }}>{c.nome}</button>
          ))}
        </div>
      </div>
      <div className="bloco-corpo">
        {opcoes.length === 0 && <p className="apagado">Nenhum script de {CANAIS.find(c => c.chave === canal)?.nome.toLowerCase()} para este nicho ainda. Crie um na tela Scripts.</p>}
        {opcoes.length > 1 && (
          <div className="script-escolha">
            {opcoes.map(s => (
              <button key={s.id} aria-pressed={s.id === atual?.id} onClick={() => setEscolhido(s.id)} title={s.usos ? `${s.usos} usos, ${taxaScript(s)}% positivos` : 'Ainda sem uso'}>
                {canal === 'objecao' ? s.gatilho || s.titulo : s.titulo.replace(/^(?!SPIN)[^·]*·\s*/, '')}
                {melhor?.id === s.id ? ' (o que mais converte)' : ''}
              </button>
            ))}
          </div>
        )}
        {atual && <TextoScript texto={texto} />}
        {atual && (
          <div className="linha" style={{ marginTop: 14 }}>
            <button className="btn pq" onClick={() => copiar(texto.replace(/^\s*(\[.*\]|→.*)\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim())}>
              <Icone nome="copiar" tam={15} /> Copiar
            </button>
            {['whatsapp', 'followup'].includes(canal) && lead.telefone && (
              <a className="btn pq whats" href={linkWhatsApp(lead.telefone, texto)} target="_blank" rel="noopener noreferrer">
                <Icone nome="whats" tam={15} /> Enviar no WhatsApp
              </a>
            )}
            {['whatsapp', 'followup'].includes(canal) && (
              <button className="btn pq" onClick={() => chamarIa('mensagem')} disabled={carregandoIa}>
                <Icone nome="faisca" tam={15} /> Personalizar com IA
              </button>
            )}
          </div>
        )}
        {canal === 'objecao' && (
          <form className="linha" style={{ marginTop: 16 }} onSubmit={e => { e.preventDefault(); chamarIa('objecao', objecao); }}>
            <input className="entrada" style={{ flex: 1, minWidth: 200 }} value={objecao} onChange={e => setObjecao(e.target.value)}
              placeholder="O que o cliente falou? Ex.: minha sobrinha faz meu Instagram" aria-label="Objeção do cliente" />
            <button className="btn pq" disabled={carregandoIa || !objecao.trim()}><Icone nome="faisca" tam={15} /> Como respondo?</button>
          </form>
        )}
        {carregandoIa && <p className="apagado" style={{ marginTop: 12 }}><span className="carregando" /> A IA está escrevendo…</p>}
        {ia && (
          <div style={{ marginTop: 14 }}>
            <div className="ia-saida"><TextoIA texto={ia.texto} /></div>
            <div className="linha" style={{ marginTop: 8 }}>
              <button className="btn pq" onClick={() => copiar(ia.texto)}><Icone nome="copiar" tam={15} /> Copiar</button>
              {canal !== 'objecao' && canal !== 'ligacao' && lead.telefone && (
                <a className="btn pq whats" href={linkWhatsApp(lead.telefone, ia.texto)} target="_blank" rel="noopener noreferrer"><Icone nome="whats" tam={15} /> Enviar esta versão</a>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
