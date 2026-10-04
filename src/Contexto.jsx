import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as dados from './lib/dados.js';

const Ctx = createContext(null);
export const useFaro = () => useContext(Ctx);

const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navegador sem armazenamento */ } };

export function FaroProvider({ perfil, children }) {
  const [produtos, setProdutos] = useState([]);
  const [produtoId, setProdutoIdBruto] = useState(lerLocal('faro.produto'));
  const [pesos, setPesos] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [leadAberto, setLeadAberto] = useState(null);
  const [versao, setVersao] = useState(0);

  const toast = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setToasts(t => [...t, { id, texto, tipo }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tipo === 'erro' ? 6000 : 2800);
  }, []);

  const carregarProdutos = useCallback(async () => {
    const ps = await dados.listarProdutos();
    setProdutos(ps);
    setProdutoIdBruto(atual => (ps.some(p => p.id === atual) ? atual : ps.find(p => p.ativo)?.id || ps[0]?.id || null));
  }, []);
  useEffect(() => { carregarProdutos().catch(e => toast(e.message, 'erro')); }, [carregarProdutos, toast]);

  const setProdutoId = (id) => { setProdutoIdBruto(id); gravarLocal('faro.produto', id); };
  const produto = produtos.find(p => p.id === produtoId) || null;

  const carregarScripts = useCallback(async () => { if (produtoId) setScripts(await dados.listarScripts(produtoId)); }, [produtoId]);
  const carregarPesos = useCallback(async () => { if (produtoId) setPesos(await dados.listarPesos(produtoId)); }, [produtoId]);
  useEffect(() => {
    setScripts([]); setPesos([]);
    carregarScripts().catch(e => toast(e.message, 'erro'));
    carregarPesos().catch(e => toast(e.message, 'erro'));
  }, [carregarScripts, carregarPesos, toast]);

  const mudou = useCallback(() => setVersao(v => v + 1), []);

  const valor = useMemo(() => ({
    perfil, produtos, produto, produtoId, setProdutoId, carregarProdutos,
    pesos, carregarPesos, scripts, carregarScripts,
    toast, leadAberto, abrirLead: setLeadAberto, versao, mudou,
  }), [perfil, produtos, produto, produtoId, carregarProdutos, pesos, carregarPesos, scripts, carregarScripts, toast, leadAberto, versao, mudou]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.tipo === 'erro' ? 'erro' : ''}`}>{t.texto}</div>)}
      </div>
    </Ctx.Provider>
  );
}

// Executa uma ação assíncrona mostrando erro em toast
export function useAcao() {
  const { toast } = useFaro();
  const [ocupado, setOcupado] = useState(false);
  const rodar = useCallback(async (fn, sucesso) => {
    setOcupado(true);
    try { const r = await fn(); if (sucesso) toast(typeof sucesso === 'function' ? sucesso(r) : sucesso); return r; }
    catch (e) { toast(e.message, 'erro'); return undefined; }
    finally { setOcupado(false); }
  }, [toast]);
  return [rodar, ocupado];
}
