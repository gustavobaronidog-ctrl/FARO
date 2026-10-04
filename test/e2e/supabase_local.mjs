// "Supabase de bolso" para testes de ponta a ponta.
// Imita o que o app usa do Supabase de verdade, em cima de um Postgres local:
//   /auth/v1  login (cadastro, senha, renovação, usuário, sair) com JWT HS256 igual ao Supabase
//   /rest/v1  PostgREST: select com relacionamentos, filtros, ordem, contagem, insert/update/delete/upsert, rpc
// Cada pedido roda num papel do Postgres (anon / authenticated / service_role) com as claims do JWT,
// então as regras de segurança (RLS) e as permissões são as do banco de verdade.
// É estrito de propósito: coluna, função, parâmetro ou relacionamento que não existe dá erro.
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const PORTA = Number(process.env.PORTA || 54321);
const BANCO = process.env.BANCO || 'faro_e2e';
export const SEGREDO_JWT = 'segredo-local-de-teste-com-mais-de-32-caracteres';
export const CHAVE_PUBLICA = 'sb_publishable_TESTElocal0000000000000000';
export const CHAVE_SECRETA = 'sb_secret_TESTElocal00000000000000000000';
const ESTRITO_BEARER = true; // como o gateway do Supabase: Bearer precisa ser JWT válido ou a própria chave

// ------------------------------------------------------------------ Postgres via psql
function sql(texto) {
  return new Promise((ok) => {
    const p = spawn('psql', ['-X', '-q', '-At', '-h', '/var/tmp/pgfaro', '-p', '54329', '-U', 'postgres', '-d', BANCO, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', () => ok({ out: out.trim(), err: err.trim() }));
    p.stdin.end('\\set VERBOSITY verbose\n' + texto);
  });
}
const lit = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const ident = n => { if (!/^[a-z_][a-z0-9_]*$/i.test(n)) throw erro(400, 'PGRST100', `nome inválido: ${n}`); return `"${n}"`; };
function erro(status, code, message, details = null, hint = null) { const e = new Error(message); Object.assign(e, { status, corpo: { code, message, details, hint } }); return e; }

function erroDoPg(err, papel) {
  const m = err.match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
  const code = m?.[1] || 'XX000', message = m?.[2] || err;
  const details = err.match(/DETAIL:\s+(.*)/)?.[1] || null, hint = err.match(/HINT:\s+(.*)/)?.[1] || null;
  let status = 400;
  if (code === '42501') status = papel === 'anon' ? 401 : 403;
  else if (code === '23505' || code === '23503') status = 409;
  else if (code === 'P0001') status = 400;
  else if (code === '42883' || code === '42P01') status = 404;
  return erro(status, code, message, details, hint);
}

async function rodar(papel, claims, consulta) {
  const script = `begin;
set local role ${papel};
\\o /dev/null
select set_config('request.jwt.claims', ${lit(JSON.stringify(claims || {}))}, true);
select set_config('request.jwt.claim.sub', ${lit(claims?.sub || '')}, true);
select set_config('request.jwt.claim.role', ${lit(papel)}, true);
\\o
${consulta};
commit;`;
  const { out, err } = await sql(script);
  if (/ERROR:/.test(err)) throw erroDoPg(err, papel);
  return out;
}

// ------------------------------------------------------------------ catálogo (estrito)
let cat = null;
async function catalogo() {
  if (cat) return cat;
  const r = await sql(`select json_build_object(
    'colunas', (select json_object_agg(table_name, cols) from (select table_name, json_agg(column_name order by ordinal_position) cols from information_schema.columns where table_schema='public' group by table_name) x),
    'fks', (select coalesce(json_agg(json_build_object('de', cl.relname, 'cols', (select json_agg(a.attname) from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k), 'para', cf.relname, 'refs', (select json_agg(a.attname) from unnest(c.confkey) k join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k))), '[]')
       from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_class cf on cf.oid=c.confrelid
       where c.contype='f' and cl.relnamespace='public'::regnamespace and cf.relnamespace='public'::regnamespace),
    'funcoes', (select coalesce(json_agg(json_build_object('nome', p.proname, 'args', coalesce(p.proargnames, '{}'), 'modos', p.proargmodes, 'tipos', (select json_agg(format_type(t, null)) from unnest(p.proargtypes) t), 'nargs', p.pronargs, 'padroes', p.pronargdefaults, 'set', p.proretset, 'ret', format_type(p.prorettype, null), 'tipotipo', (select typtype from pg_type where oid=p.prorettype))), '[]')
       from pg_proc p where p.pronamespace='public'::regnamespace)
  )`);
  if (r.err && /ERROR/.test(r.err)) throw new Error(r.err);
  cat = JSON.parse(r.out);
  return cat;
}

// ------------------------------------------------------------------ select=... (com relacionamentos)
function dividirTopo(s, sep = ',') {
  const partes = []; let prof = 0, atual = '';
  for (const ch of s) {
    if (ch === '(') prof++; if (ch === ')') prof--;
    if (ch === sep && prof === 0) { partes.push(atual); atual = ''; } else atual += ch;
  }
  if (atual !== '') partes.push(atual);
  return partes.map(p => p.trim()).filter(Boolean);
}
function colunasSelect(tabela, select, c, alias) {
  const itens = dividirTopo(select || '*');
  const saida = [];
  for (const item of itens) {
    const emb = item.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s);
    if (emb) {
      const [, apelido, rel, , dentro] = emb;
      if (!c.colunas[rel]) throw erro(400, 'PGRST200', `Could not find a relationship between '${tabela}' and '${rel}' in the schema cache`);
      const paraCima = c.fks.find(f => f.de === tabela && f.para === rel);   // muitos-para-um → objeto
      const paraBaixo = c.fks.find(f => f.de === rel && f.para === tabela); // um-para-muitos → lista
      const a2 = 'r' + Math.random().toString(36).slice(2, 7);
      const inner = colunasSelect(rel, dentro, c, a2);
      if (paraCima) {
        const cond = paraCima.cols.map((col, i) => `${a2}.${ident(paraCima.refs[i])} = ${alias}.${ident(col)}`).join(' and ');
        saida.push(`(select json_build_object(${inner.map(x => `'${x.nome}', ${x.expr}`).join(', ')}) from public.${ident(rel)} ${a2} where ${cond}) as ${ident(apelido || rel)}`);
      } else if (paraBaixo) {
        const cond = paraBaixo.cols.map((col, i) => `${a2}.${ident(col)} = ${alias}.${ident(paraBaixo.refs[i])}`).join(' and ');
        saida.push(`(select coalesce(json_agg(json_build_object(${inner.map(x => `'${x.nome}', ${x.expr}`).join(', ')})), '[]') from public.${ident(rel)} ${a2} where ${cond}) as ${ident(apelido || rel)}`);
      } else throw erro(400, 'PGRST200', `Could not find a relationship between '${tabela}' and '${rel}' in the schema cache`);
      continue;
    }
    if (item === '*') { for (const col of c.colunas[tabela]) saida.push({ nome: col, expr: `${alias}.${ident(col)}` }); continue; }
    const m = item.match(/^(?:(\w+):)?(\w+)(?:::\w+)?$/);
    if (!m) throw erro(400, 'PGRST100', `select inválido: ${item}`);
    const [, apelido, col] = m;
    if (!c.colunas[tabela].includes(col)) throw erro(400, '42703', `column ${tabela}.${col} does not exist`);
    saida.push({ nome: apelido || col, expr: `${alias}.${ident(col)}` });
  }
  return saida.map(x => typeof x === 'string' ? { nome: x.match(/as "(\w+)"$/)[1], expr: x.replace(/ as "\w+"$/, '') } : x);
}

// ------------------------------------------------------------------ filtros
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
function lista(v) { return dividirTopo(v.replace(/^\(|\)$/g, '')).map(x => x.replace(/^"|"$/g, '')); }
function condicao(alias, col, expr, c, tabela) {
  if (!c.colunas[tabela].includes(col)) throw erro(400, '42703', `column ${tabela}.${col} does not exist`);
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.');
  const op = expr.slice(0, i), val = expr.slice(i + 1);
  const C = `${alias}.${ident(col)}`;
  let s;
  if (OPS[op]) s = `${C} ${OPS[op]} ${lit(op.includes('like') ? val.replace(/\*/g, '%') : val)}`;
  else if (op === 'in') s = `${C} in (${lista(val).map(lit).join(', ') || 'null'})`;
  else if (op === 'is') s = `${C} is ${({ null: 'null', true: 'true', false: 'false' })[val] ?? (() => { throw erro(400, 'PGRST100', 'is inválido'); })()}`;
  else if (op === 'cs') s = `${C} @> ${lit(val)}`;
  else if (op === 'cd') s = `${C} <@ ${lit(val)}`;
  else if (op === 'ov') s = `${C} && ${lit(val)}`;
  else throw erro(400, 'PGRST100', `operador não suportado no teste: ${op}`);
  return neg ? `not (${s})` : s;
}
function ondeDe(params, alias, c, tabela) {
  const conds = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    if (k === 'or' || k === 'and') {
      const partes = dividirTopo(v.replace(/^\(|\)$/g, '')).map(p => { const j = p.indexOf('.'); return condicao(alias, p.slice(0, j), p.slice(j + 1), c, tabela); });
      conds.push(`(${partes.join(k === 'or' ? ' or ' : ' and ')})`);
    } else conds.push(condicao(alias, k, v, c, tabela));
  }
  return conds.length ? 'where ' + conds.join(' and ') : '';
}
function ordemDe(v, alias, c, tabela) {
  if (!v) return '';
  return 'order by ' + v.split(',').map(p => {
    const [col, ...mods] = p.split('.');
    if (!c.colunas[tabela].includes(col)) throw erro(400, '42703', `column ${tabela}.${col} does not exist`);
    return `${alias}.${ident(col)} ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}`;
  }).join(', ');
}

// ------------------------------------------------------------------ REST
async function rest(req, url, corpo, papel, claims) {
  const c = await catalogo();
  const caminho = url.pathname.replace(/^\/rest\/v1\//, '');
  const prefer = req.headers['prefer'] || '';
  const objeto = (req.headers['accept'] || '').includes('vnd.pgrst.object');
  const params = [...url.searchParams.entries()];

  if (caminho.startsWith('rpc/')) {
    const nome = caminho.slice(4);
    const args = corpo && typeof corpo === 'object' ? corpo : Object.fromEntries(params);
    const cands = c.funcoes.filter(f => f.nome === nome);
    const fn = cands.find(f => { const nomes = f.args.slice(0, f.nargs); const obrig = nomes.slice(0, f.nargs - f.padroes); return Object.keys(args).every(k => nomes.includes(k)) && obrig.every(k => k in args); });
    if (!fn) throw erro(404, 'PGRST202', `Could not find the function public.${nome}(${Object.keys(args).join(', ')}) in the schema cache`);
    const lista = Object.entries(args).map(([k, v]) => {
      const tipo = fn.tipos[fn.args.indexOf(k)];
      const val = v === null ? 'null' : (tipo === 'jsonb' || tipo === 'json') ? lit(JSON.stringify(v)) : Array.isArray(v) ? lit(`{${v.map(x => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}`) : lit(v);
      return `${ident(k)} => ${val}::${tipo}`;
    }).join(', ');
    const chamada = `public.${ident(nome)}(${lista})`;
    let q;
    if (fn.ret === 'void') q = `select 'null' from (select ${chamada}) x`;
    else if (fn.set) q = `select coalesce(json_agg(r), '[]') from ${chamada} r`;
    else if (fn.tipotipo === 'c') q = `select row_to_json(r) from ${chamada} r`;
    else q = `select to_json(${chamada})`;
    const out = await rodar(papel, claims, q);
    return { status: 200, corpo: out || 'null' };
  }

  const tabela = caminho;
  if (!c.colunas[tabela]) throw erro(404, '42P01', `relation "public.${tabela}" does not exist`);
  const A = 't';
  const sel = colunasSelect(tabela, url.searchParams.get('select'), c, A);
  const proj = `json_build_object(${sel.map(x => `'${x.nome}', ${x.expr}`).join(', ')})`;
  const onde = ondeDe(params, A, c, tabela);
  const devolver = prefer.includes('return=representation');
  const contar = prefer.includes('count=exact');
  let q, total = null;

  if (req.method === 'GET' || req.method === 'HEAD') {
    const lim = url.searchParams.get('limit'), off = url.searchParams.get('offset');
    q = `select coalesce(json_agg(x), '[]') from (select ${proj} x from public.${ident(tabela)} ${A} ${onde} ${ordemDe(url.searchParams.get('order'), A, c, tabela)} ${lim ? 'limit ' + Number(lim) : ''} ${off ? 'offset ' + Number(off) : ''}) s`;
    if (contar) total = Number(await rodar(papel, claims, `select count(*) from public.${ident(tabela)} ${A} ${onde}`));
  } else if (req.method === 'POST') {
    const linhas = Array.isArray(corpo) ? corpo : [corpo];
    const cols = url.searchParams.get('columns')?.split(',').map(s => s.replace(/"/g, '')) || [...new Set(linhas.flatMap(Object.keys))];
    for (const k of cols) if (!c.colunas[tabela].includes(k)) throw erro(400, 'PGRST204', `Could not find the '${k}' column of '${tabela}' in the schema cache`);
    const lc = cols.map(ident).join(', ');
    let conflito = '';
    const oc = url.searchParams.get('on_conflict');
    if (prefer.includes('resolution=ignore-duplicates')) conflito = `on conflict ${oc ? `(${oc.split(',').map(ident).join(', ')})` : ''} do nothing`;
    else if (prefer.includes('resolution=merge-duplicates')) conflito = `on conflict (${(oc || 'id').split(',').map(ident).join(', ')}) do update set ${cols.map(k => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;
    q = `with ins as (insert into public.${ident(tabela)} (${lc}) select ${lc} from json_populate_recordset(null::public.${ident(tabela)}, ${lit(JSON.stringify(linhas))}) ${conflito} returning *)
      select coalesce(json_agg(${proj}), '[]') from ins ${A}`;
  } else if (req.method === 'PATCH') {
    const cols = Object.keys(corpo || {});
    for (const k of cols) if (!c.colunas[tabela].includes(k)) throw erro(400, 'PGRST204', `Could not find the '${k}' column of '${tabela}' in the schema cache`);
    const lc = cols.map(ident).join(', ');
    q = `with up as (update public.${ident(tabela)} ${A} set (${lc}) = (select ${lc} from json_populate_record(null::public.${ident(tabela)}, ${lit(JSON.stringify(corpo))})) ${onde} returning ${A}.*)
      select coalesce(json_agg(${proj}), '[]') from up ${A}`;
  } else if (req.method === 'DELETE') {
    q = `with del as (delete from public.${ident(tabela)} ${A} ${onde} returning ${A}.*) select coalesce(json_agg(${proj}), '[]') from del ${A}`;
  } else throw erro(405, 'PGRST000', 'método');

  const out = JSON.parse(await rodar(papel, claims, q) || '[]');
  if (req.method !== 'GET' && contar) total = out.length;
  const cab = {};
  if (total !== null) cab['content-range'] = `${out.length ? `0-${out.length - 1}` : '*'}/${total}`;
  if (req.method !== 'GET' && !devolver) return { status: req.method === 'POST' ? 201 : 204, corpo: '', cab };
  if (objeto) {
    if (out.length !== 1) throw erro(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${out.length} rows`);
    return { status: 200, corpo: JSON.stringify(out[0]), cab };
  }
  return { status: req.method === 'POST' ? 201 : 200, corpo: JSON.stringify(out), cab };
}

// ------------------------------------------------------------------ JWT e login
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function assinar(claims) {
  const cab = b64({ alg: 'HS256', typ: 'JWT' }), corpo = b64(claims);
  return `${cab}.${corpo}.${crypto.createHmac('sha256', SEGREDO_JWT).update(`${cab}.${corpo}`).digest('base64url')}`;
}
function verificar(token) {
  const [a, b, s] = String(token).split('.');
  if (!s) return null;
  const esperado = crypto.createHmac('sha256', SEGREDO_JWT).update(`${a}.${b}`).digest('base64url');
  if (esperado !== s) return null;
  const c = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (c.exp && c.exp < Date.now() / 1000) return null;
  return c;
}
const refreshTokens = new Map();
async function sessao(usuario) {
  const agora = Math.floor(Date.now() / 1000);
  const claims = { aud: 'authenticated', exp: agora + 3600, iat: agora, iss: `http://127.0.0.1:${PORTA}/auth/v1`, sub: usuario.id, email: usuario.email, role: 'authenticated', session_id: crypto.randomUUID(), user_metadata: usuario.user_metadata, app_metadata: usuario.app_metadata };
  const refresh = crypto.randomBytes(16).toString('hex');
  refreshTokens.set(refresh, usuario.id);
  return { access_token: assinar(claims), token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: refresh, user: usuario };
}
async function usuarioPorId(id) {
  const r = await sql(`select row_to_json(u) from (select id, aud, role, email, email_confirmed_at, confirmed_at, created_at, updated_at, last_sign_in_at, raw_user_meta_data as user_metadata, raw_app_meta_data as app_metadata from auth.users where id = ${lit(id)}) u`);
  return r.out ? { ...JSON.parse(r.out), identities: [] } : null;
}
async function auth(req, url, corpo) {
  const rota = url.pathname.replace(/^\/auth\/v1/, '');
  if (rota === '/signup' && req.method === 'POST') {
    const { email, password, data } = corpo || {};
    if (!email || !password || password.length < 6) throw erro(422, 'weak_password', 'Password should be at least 6 characters.');
    const existe = await sql(`select id from auth.users where email = lower(${lit(email)})`);
    if (existe.out) throw erro(422, 'user_already_exists', 'User already registered');
    const r = await sql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', lower(${lit(email)}), extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', ${lit(JSON.stringify(data || {}))}, now(), now(), now()) returning id`);
    if (/ERROR/.test(r.err)) throw erro(500, 'unexpected_failure', 'Database error saving new user: ' + r.err);
    return { status: 200, corpo: JSON.stringify(await sessao(await usuarioPorId(r.out))) };
  }
  if (rota === '/token' && req.method === 'POST') {
    const tipo = url.searchParams.get('grant_type');
    if (tipo === 'password') {
      const r = await sql(`select id from auth.users where email = lower(${lit(corpo.email)}) and encrypted_password = extensions.crypt(${lit(corpo.password)}, encrypted_password)`);
      if (!r.out) throw erro(400, 'invalid_credentials', 'Invalid login credentials');
      return { status: 200, corpo: JSON.stringify(await sessao(await usuarioPorId(r.out))) };
    }
    if (tipo === 'refresh_token') {
      const id = refreshTokens.get(corpo.refresh_token);
      if (!id) throw erro(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      return { status: 200, corpo: JSON.stringify(await sessao(await usuarioPorId(id))) };
    }
  }
  if (rota === '/user' && req.method === 'GET') {
    const c = verificar((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!c || c.role !== 'authenticated') throw erro(403, 'bad_jwt', 'invalid JWT');
    const u = await usuarioPorId(c.sub);
    if (!u) throw erro(403, 'user_not_found', 'User from sub claim in JWT does not exist');
    return { status: 200, corpo: JSON.stringify(u) };
  }
  if (rota === '/logout') return { status: 204, corpo: '' };
  if (rota === '/settings') return { status: 200, corpo: JSON.stringify({ external: { email: true }, mailer_autoconfirm: true }) };
  throw erro(404, 'not_found', 'rota de auth não simulada: ' + rota);
}

// ------------------------------------------------------------------ servidor
export const registro = [];
export function iniciar(porta = PORTA) {
  const srv = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const url = new URL(req.url, `http://127.0.0.1:${porta}`);
    let txt = ''; for await (const p of req) txt += p;
    const corpo = txt ? JSON.parse(txt) : null;
    const entrada = { metodo: req.method, caminho: url.pathname + url.search };
    try {
      const chave = req.headers['apikey'];
      if (chave !== CHAVE_PUBLICA && chave !== CHAVE_SECRETA) throw erro(401, 'unauthorized', 'Invalid API key');
      let r;
      if (url.pathname.startsWith('/auth/v1')) r = await auth(req, url, corpo);
      else if (url.pathname.startsWith('/rest/v1')) {
        let papel = chave === CHAVE_SECRETA ? 'service_role' : 'anon', claims = { role: papel };
        const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (bearer && bearer !== chave) {
          const c = verificar(bearer);
          if (!c) { if (ESTRITO_BEARER) throw erro(401, 'PGRST301', 'JWT inválido no Authorization'); }
          else { papel = c.role; claims = c; }
        }
        r = await rest(req, url, corpo, papel, claims);
      } else throw erro(404, 'not_found', 'rota');
      entrada.status = r.status; registro.push(entrada);
      res.writeHead(r.status, { 'content-type': 'application/json', ...cors, ...(r.cab || {}) });
      res.end(r.corpo);
    } catch (e) {
      const status = e.status || 500;
      entrada.status = status; entrada.erro = e.corpo?.message || e.message; registro.push(entrada);
      const corpoErro = url.pathname.startsWith('/auth') ? { code: status, error_code: e.corpo?.code, msg: e.corpo?.message || e.message } : (e.corpo || { message: e.message });
      res.writeHead(status, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(corpoErro));
    }
  });
  return new Promise(ok => srv.listen(porta, '127.0.0.1', () => ok(srv)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  iniciar().then(() => console.log(`Supabase local em http://127.0.0.1:${PORTA} (banco ${BANCO})`));
}
