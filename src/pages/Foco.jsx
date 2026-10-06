import { useEffect, useState } from 'react';
import Icone from '../components/Icone.jsx';
import { Termometro } from '../components/Comuns.jsx';
import ScriptBox from '../components/ScriptBox.jsx';
import Registrar from '../components/Registrar.jsx';
import { GravarLigacao } from '../components/Gravacoes.jsx';
import { useFaro } from '../Contexto.jsx';
import { formatarTelefone, linkLigar, linkWhatsApp, nomeEstagio, quando, TEXTO_WHATS_TRAVADO } from '../lib/util.js';

// Sessão de ataque: um lead por vez, script do lado, resultado no teclado
export default function Foco({ fila: filaInicial, aoSair }) {
  const [fila] = useState(filaInicial); // congela a lista da sessão (a fila do painel muda enquanto você trabalha)
  const { produto, abrirLead, podeWhats } = useFaro();
  const [i, setI] = useState(0);
  const [placar, setPlacar] = useState({ contatos: 0, bons: 0, fechados: 0 });
  const [script, setScript] = useState({ id: null, canal: 'ligacao' });
  const lead = fila[i];

  useEffect(() => {
    const f = e => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.modal, .gaveta')) aoSair();
      if (e.key === 'ArrowRight') setI(x => Math.min(x + 1, fila.length));
      if (e.key === 'ArrowLeft') setI(x => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [fila.length, aoSair]);

  const proximo = (_l, res) => {
    setPlacar(p => ({
      contatos: p.contatos + 1,
      bons: p.bons + (['bom', 'otimo'].includes(res.tipo) ? 1 : 0),
      fechados: p.fechados + (res.chave === 'fechou' ? 1 : 0),
    }));
    setTimeout(() => setI(x => x + 1), 250);
  };

  if (!lead) {
    return (
      <div className="foco">
        <div className="foco-corpo" style={{ display: 'grid', placeItems: 'center', gridTemplateColumns: '1fr' }}>
          <div style={{ textAlign: 'center', maxWidth: 520 }}>
            <h1 style={{ fontSize: 44 }}>Sessão concluída</h1>
            <p className="apagado" style={{ marginTop: 10, fontSize: 17 }}>
              {placar.contatos} contatos, {placar.bons} respostas boas{placar.fechados ? ` e ${placar.fechados} fechado${placar.fechados > 1 ? 's' : ''}` : ''}.
              Os retornos que você combinou já estão agendados na fila.
            </p>
            <button className="btn primario gd" style={{ marginTop: 24 }} onClick={aoSair}>Voltar para o painel</button>
          </div>
        </div>
      </div>
    );
  }

  const nicho = produto?.nichos?.find(n => n.chave === lead.nicho)?.nome;
  return (
    <div className="foco" role="dialog" aria-label="Sessão de ataque">
      <div className="foco-topo">
        <button className="btn fantasma pq" onClick={aoSair}><Icone nome="voltar" tam={16} /> Sair</button>
        <span className="pequeno num">{i + 1} de {fila.length}</span>
        <div className="foco-progresso"><i style={{ width: `${(i / fila.length) * 100}%` }} /></div>
        <span className="pequeno apagado esconde-cel">{placar.contatos} contatos, {placar.bons} bons</span>
        <button className="btn pq" onClick={() => setI(i + 1)}>Pular <Icone nome="seta" tam={15} /></button>
      </div>

      <div className="foco-corpo">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            {lead.motivo_fila === 'retorno' && (
              <span className="etq retorno" style={{ marginBottom: 10 }}>{lead.proxima_acao || 'Retorno'} ({quando(lead.proxima_acao_em)})</span>
            )}
            <h1 className="foco-nome">{lead.nome}</h1>
            <p className="apagado" style={{ marginTop: 6 }}>
              {[lead.responsavel && `Falar com ${lead.responsavel}`, nicho, [lead.cidade, lead.uf].filter(Boolean).join('/'), lead.estagio !== 'novo' && nomeEstagio(lead.estagio)].filter(Boolean).join('  /  ')}
            </p>
          </div>
          <Termometro score={lead.score} />
          <div className="linha">
            {lead.telefone && <a className="btn ligar gd" href={linkLigar(lead.telefone)} onClick={() => setScript(s => ({ ...s, canal: 'ligacao' }))}><Icone nome="telefone" /> Ligar {formatarTelefone(lead.telefone)}</a>}
            {lead.telefone && (podeWhats(lead)
              ? <a className="btn whats gd" href={linkWhatsApp(lead.telefone)} target="_blank" rel="noopener noreferrer"><Icone nome="whats" /> WhatsApp</a>
              : <span className="btn gd whats-travado" title={TEXTO_WHATS_TRAVADO}><Icone nome="cadeado" /> WhatsApp depois da ligação</span>)}
            {lead.instagram && <a className="btn gd" href={`https://instagram.com/${lead.instagram}`} target="_blank" rel="noopener noreferrer"><Icone nome="insta" /></a>}
            {lead.maps_url && <a className="btn gd" href={lead.maps_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Maps"><Icone nome="pino" /></a>}
          </div>
          <GravarLigacao lead={lead} compacto />
          <div className="bloco">
            <div className="bloco-cab"><h3>Por que agora</h3><button className="btn pq fantasma" onClick={() => abrirLead({ id: lead.id })}>Ficha completa</button></div>
            <div className="bloco-corpo porque">
              {(lead.motivos || []).slice(0, 6).map(m => (
                <div key={m.sinal} className="porque-item"><b>{m.peso > 0 ? '+' : ''}{m.peso}</b><span>{m.sinal === 'usa_concorrente' && lead.concorrente ? `Usa ${lead.concorrente}` : m.rotulo}</span></div>
              ))}
              {lead.nota != null && <p className="pequeno apagado" style={{ marginTop: 6 }}>★ {String(lead.nota).replace('.', ',')} no Google com {lead.avaliacoes} avaliações</p>}
              {lead.observacoes && <p className="pequeno" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{lead.observacoes}</p>}
            </div>
          </div>
        </div>
        <ScriptBox lead={lead} canalInicial={script.canal} aoEscolher={(id, canal) => setScript({ id, canal })} />
      </div>

      <div className="foco-pe">
        <Registrar lead={lead} canal={script.canal === 'whatsapp' || script.canal === 'followup' ? 'whatsapp' : 'ligacao'}
          scriptId={script.id} atalhos aoRegistrar={proximo} />
      </div>
    </div>
  );
}
