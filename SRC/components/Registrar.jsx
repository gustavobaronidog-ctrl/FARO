import { useEffect, useState } from 'react';
import { RESULTADOS, MOTIVOS_PERDA, dataLocal } from '../lib/util.js';
import { registrarResultado } from '../lib/dados.js';
import { useFaro } from '../Contexto.jsx';

// Botões de resultado do contato. Teclas 1–9 e 0 funcionam quando "atalhos" está ligado.
export default function Registrar({ lead, canal: canalInicial = 'ligacao', scriptId, atalhos = false, aoRegistrar }) {
  const { toast, mudou } = useFaro();
  const [canal, setCanal] = useState(canalInicial);
  const [pendente, setPendente] = useState(null); // resultado que pede data ou motivo
  const [data, setData] = useState(dataLocal(1, 10));
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setCanal(canalInicial); setPendente(null); setNota(''); }, [lead.id, canalInicial]);

  const salvar = async (res, extra = {}) => {
    setSalvando(true);
    try {
      const atualizado = await registrarResultado(lead.id, canal, res.chave, {
        texto: extra.texto ?? (nota.trim() || null), scriptId, proxima: extra.proxima ?? null,
      });
      toast(res.chave === 'fechou' ? 'Fechado! Mais um cliente.' : `${res.nome}: registrado`);
      setPendente(null); setNota(''); setMotivo('');
      mudou();
      aoRegistrar?.(atualizado, res);
    } catch (e) { toast(e.message, 'erro'); }
    finally { setSalvando(false); }
  };

  const escolher = (res) => {
    if (res.pedeData) { setData(dataLocal(res.chave === 'agendou_demo' ? 1 : 2, res.chave === 'agendou_demo' ? 10 : 14)); setPendente(res); return; }
    if (res.pedeMotivo) { setPendente(res); return; }
    salvar(res);
  };

  useEffect(() => {
    if (!atalhos) return;
    const f = (e) => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (pendente && e.key === 'Enter') { confirmar(); return; }
      const r = RESULTADOS.find(x => x.tecla === e.key);
      if (r && !salvando) { e.preventDefault(); escolher(r); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const confirmar = () => {
    if (!pendente) return;
    if (pendente.pedeData) salvar(pendente, { proxima: new Date(data).toISOString() });
    else salvar(pendente, { texto: [motivo, nota.trim()].filter(Boolean).join(' — ') || 'Sem interesse' });
  };

  return (
    <div>
      <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="abas" role="group" aria-label="Canal do contato">
          <button aria-pressed={canal === 'ligacao'} onClick={() => setCanal('ligacao')}>Liguei</button>
          <button aria-pressed={canal === 'whatsapp'} onClick={() => setCanal('whatsapp')}>Mandei WhatsApp</button>
          <button aria-pressed={canal === 'visita'} onClick={() => setCanal('visita')}>Visitei</button>
        </div>
        {atalhos && <span className="mini apagado esconde-cel">Atalhos: teclas 1 a 0</span>}
      </div>
      <div className="resultados">
        {RESULTADOS.map(r => (
          <button key={r.chave} className={`res ${r.tipo}`} onClick={() => escolher(r)} disabled={salvando} aria-pressed={pendente?.chave === r.chave}>
            {atalhos && <kbd>{r.tecla}</kbd>}{r.nome}
          </button>
        ))}
      </div>
      {pendente && (
        <div className="cartao-simples" style={{ marginTop: 12 }}>
          {pendente.pedeData && (
            <label className="campo">
              <span>{pendente.chave === 'agendou_demo' ? 'Quando é a demonstração?' : 'Quando retornar?'}</span>
              <input type="datetime-local" value={data} onChange={e => setData(e.target.value)} />
            </label>
          )}
          {pendente.pedeMotivo && (
            <div className="campo">
              <span>Por que não quis? (isso ensina o Faro)</span>
              <div className="linha">
                {MOTIVOS_PERDA.map(m => <button key={m} className="chip-toggle" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>)}
              </div>
            </div>
          )}
          <div className="linha" style={{ marginTop: 12 }}>
            <button className="btn primario" onClick={confirmar} disabled={salvando || (pendente.pedeMotivo && !motivo && !nota.trim())}>Salvar {pendente.nome.toLowerCase()}</button>
            <button className="btn fantasma" onClick={() => setPendente(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <input className="entrada" style={{ marginTop: 10 }} value={nota} onChange={e => setNota(e.target.value)}
        placeholder="Anotação rápida (opcional): o nome da dona, quantas profissionais, o que ela falou…" aria-label="Anotação do contato" />
    </div>
  );
}
