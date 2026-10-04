// Telefone sempre como 55 + DDD + número, só dígitos (igual à função do banco)
export function normalizarTelefone(t) {
  let d = String(t ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!d) return null;
  return d;
}

export function ehCelular(e164) {
  return !!e164 && e164.length === 13 && e164[4] === '9';
}

export function formatarTelefone(e164) {
  const d = normalizarTelefone(e164);
  if (!d || !d.startsWith('55')) return e164 || '';
  const ddd = d.slice(2, 4), n = d.slice(4);
  return n.length === 9 ? `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
}
