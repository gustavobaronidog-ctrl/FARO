// Rotina diária (a Vercel chama sozinha todo dia de manhã — ver vercel.json)
//   etapa=cacar  → aprende com os resultados de ontem, caça leads novos no Google, lê sinais
//   etapa=sinais → só lê sinais dos leads que ainda não foram analisados
import { db, ehCron, falha } from './_lib/supabase.js';
import { cacar, enriquecer, aprender, faxina } from './_lib/robos.js';

export default async function handler(req, res) {
  if (!ehCron(req)) return falha(res, 401, 'não autorizado');
  const etapa = req.query?.etapa || 'cacar';
  const prazo = Date.now() + 50_000;
  const cli = db();
  const { data: produtos, error } = await cli.from('produtos').select('*').eq('ativo', true);
  if (error) return falha(res, 500, error.message);

  const relatorio = {};
  for (const p of produtos) {
    relatorio[p.slug] = {};
    try {
      if (etapa === 'cacar') {
        relatorio[p.slug].aprendizado = await aprender(cli, p);
        relatorio[p.slug].cacada = await cacar(cli, p, {
          chave: process.env.GOOGLE_PLACES_API_KEY,
          maxChamadas: Math.ceil(30 / produtos.length),
          prazo: Date.now() + Math.max(5_000, (prazo - Date.now()) / produtos.length - 8_000),
        });
      }
      relatorio[p.slug].sinais = await enriquecer(cli, p, { limite: 80, prazo: Math.min(prazo, Date.now() + 20_000) });
    } catch (e) {
      relatorio[p.slug].erro = e.message;
    }
  }
  if (etapa === 'cacar') relatorio.faxina = await faxina(cli).catch(e => ({ erro: e.message }));
  res.status(200).json(relatorio);
}
