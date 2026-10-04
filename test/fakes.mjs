// Banco em memória que imita o cliente do Supabase (só o que os robôs usam)
import { randomUUID } from 'node:crypto';

export function bancoFalso(tabelas = {}, rpcs = {}) {
  const t = Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, v.map(r => ({ ...r }))]));
  const log = [];
  function from(nome) {
    t[nome] ||= [];
    const st = { filtros: [], op: 'select', patch: null, limite: null, unico: null, rows: null, count: false };
    const b = {
      select() { if (st.op === 'select') st.op = 'select'; return b; },
      eq(c, v) { st.filtros.push(r => r[c] === v); return b; },
      is(c, v) { st.filtros.push(r => (r[c] ?? null) === v); return b; },
      gte(c, v) { st.filtros.push(r => r[c] >= v); return b; },
      lt(c, v) { st.filtros.push(r => r[c] < v); return b; },
      or() { return b; },
      order() { return b; },
      range() { return b; },
      limit(n) { st.limite = n; return b; },
      insert(rows) { st.op = 'insert'; st.rows = [].concat(rows); return b; },
      update(p) { st.op = 'update'; st.patch = p; return b; },
      delete(o) { st.op = 'delete'; st.count = !!o?.count; return b; },
      single() { st.unico = 'single'; return b; },
      maybeSingle() { st.unico = 'maybe'; return b; },
      then(ok, err) { return Promise.resolve(exec()).then(ok, err); },
    };
    function exec() {
      log.push({ tabela: nome, op: st.op, patch: st.patch, rows: st.rows });
      const alvo = t[nome].filter(r => st.filtros.every(f => f(r)));
      let data;
      if (st.op === 'insert') { data = st.rows.map(r => ({ id: randomUUID(), ...(nome === 'execucoes' ? { iniciado_em: new Date().toISOString(), requisicoes: 0 } : {}), ...r })); t[nome].push(...data); }
      else if (st.op === 'update') { alvo.forEach(r => Object.assign(r, st.patch)); data = alvo; }
      else if (st.op === 'delete') { t[nome] = t[nome].filter(r => !alvo.includes(r)); return { data: null, count: alvo.length, error: null }; }
      else data = st.limite ? alvo.slice(0, st.limite) : alvo;
      if (st.unico) data = data[0] ?? null;
      return { data, error: null };
    }
    return b;
  }
  return {
    from, tabelas: t, log,
    async rpc(nome, args) { log.push({ rpc: nome, args }); return { data: await rpcs[nome]?.(args, t), error: null }; },
  };
}
