import { createClient } from '@supabase/supabase-js';

let cliente;
export function db() {
  if (!cliente) {
    const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis da Vercel');
    cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return cliente;
}

// Confere se quem chamou está logado e liberado na equipe
export async function usuarioDaRequisicao(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: perfil } = await db().from('perfis').select('id, nome, papel').eq('id', data.user.id).maybeSingle();
  if (!perfil || !['admin', 'vendedor'].includes(perfil.papel)) return null;
  return perfil;
}

export function ehCron(req) {
  const segredo = process.env.CRON_SECRET;
  return !!segredo && req.headers.authorization === `Bearer ${segredo}`;
}

export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

export function falha(res, status, mensagem) {
  res.status(status).json({ erro: mensagem });
}
