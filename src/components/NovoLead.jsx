import { useState } from 'react';
import { Modal } from './Comuns.jsx';
import { useFaro, useAcao } from '../Contexto.jsx';
import { criarLead } from '../lib/dados.js';
import { UFS } from '../lib/util.js';

// Cadastro manual: indicação, cliente que você viu na rua, lista que te passaram
export default function NovoLead({ aoFechar }) {
  const { produto, abrirLead, mudou } = useFaro();
  const [f, setF] = useState({ nome: '', responsavel: '', telefone: '', nicho: produto?.nichos?.[0]?.chave || '', cidade: '', uf: '', site: '', fonte: 'manual', observacoes: '' });
  const [rodar, ocupado] = useAcao();
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const salvar = async (e) => {
    e.preventDefault();
    const l = await rodar(() => criarLead(produto.id, f), 'Lead cadastrado');
    if (l) { mudou(); aoFechar(); abrirLead({ id: l.id }); }
  };
  return (
    <Modal titulo="Novo lead" aoFechar={aoFechar}>
      <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="campo"><span>Nome do negócio</span><input required autoFocus value={f.nome} onChange={set('nome')} /></label>
        <div className="grade-2">
          <label className="campo"><span>Dono / responsável</span><input value={f.responsavel} onChange={set('responsavel')} /></label>
          <label className="campo"><span>Telefone com DDD</span><input inputMode="tel" value={f.telefone} onChange={set('telefone')} placeholder="(31) 99999-9999" /></label>
          <label className="campo"><span>Nicho</span>
            <select value={f.nicho} onChange={set('nicho')}>{(produto?.nichos || []).map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}</select>
          </label>
          <label className="campo"><span>Origem</span>
            <select value={f.fonte} onChange={set('fonte')}><option value="manual">Encontrei eu mesmo</option><option value="indicacao">Indicação</option></select>
          </label>
          <label className="campo"><span>Cidade</span><input value={f.cidade} onChange={set('cidade')} /></label>
          <label className="campo"><span>UF</span><select value={f.uf} onChange={set('uf')}><option value="" />{UFS.map(u => <option key={u}>{u}</option>)}</select></label>
        </div>
        <label className="campo"><span>Instagram ou site</span><input value={f.site} onChange={set('site')} placeholder="https://instagram.com/…" /></label>
        <label className="campo"><span>Observações</span><textarea rows={2} value={f.observacoes} onChange={set('observacoes')} /></label>
        <div className="linha"><button className="btn primario" disabled={ocupado}>Cadastrar e abrir</button><button type="button" className="btn fantasma" onClick={aoFechar}>Cancelar</button></div>
      </form>
    </Modal>
  );
}
