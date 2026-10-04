-- =====================================================================
--  FARO · Prospecção ativa inteligente
--  01 · Estrutura do banco (cole inteiro no SQL Editor do Supabase e rode)
--  Pode rodar de novo sem medo: tudo é "create ... if not exists" / "or replace".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nome       text,
  papel      text not null default 'pendente' check (papel in ('admin','vendedor','pendente')),
  meta_contatos_dia int not null default 40,
  criado_em  timestamptz not null default now()
);

-- O primeiro usuário a se cadastrar vira admin. Os seguintes ficam "pendente"
-- até o admin liberar na tela Equipe (ninguém de fora enxerga seus leads).
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome, papel)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.perfis where papel = 'admin') then 'pendente' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Cria o gatilho só se ainda não existir (no Supabase o SQL Editor não pode apagar
-- gatilhos da tabela de login). Se o Supabase não deixar criar, o app cria o perfil
-- sozinho no primeiro acesso (função garantir_perfil, logo abaixo).
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'faro_novo_usuario' and tgrelid = 'auth.users'::regclass) then
    create trigger faro_novo_usuario after insert on auth.users
      for each row execute function public.novo_usuario();
  end if;
exception when insufficient_privilege then
  raise notice 'Sem permissão para gatilho em auth.users: o perfil será criado no primeiro acesso.';
end $$;

create or replace function public.garantir_perfil() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.perfis (id, email, nome, papel)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
         case when exists (select 1 from public.perfis where papel = 'admin') then 'pendente' else 'admin' end
    from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;

create or replace function public.eh_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel in ('admin','vendedor'))
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin')
$$;

-- ---------------------------------------------------------------------
-- Produtos (cada empresa/app é um espaço separado, com seu cliente ideal)
-- ---------------------------------------------------------------------
create table if not exists public.produtos (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  nome          text not null,
  cor           text not null default '#ff6a3d',
  pitch         text,                      -- o que o produto resolve (usado pela IA)
  site          text,
  ticket_mensal numeric not null default 0,
  nichos        jsonb not null default '[]'::jsonb,
  -- [{chave, nome, consultas:[...], cnaes:[...], palavras:[...]}]
  concorrentes  jsonb not null default '[]'::jsonb,
  -- [{nome, padroes:[...]}]   padrões procurados no site/link do lead
  config        jsonb not null default '{}'::jsonb,
  -- {cnpj_janela_dias, cnpj_ufs:[], cnpj_ativo, google_paginas}
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Pesos dos sinais: começam com o "palpite de especialista" e
-- se ajustam sozinhos conforme os leads respondem / fecham.
create table if not exists public.pesos (
  produto_id    uuid not null references public.produtos(id) on delete cascade,
  sinal         text not null,
  rotulo        text not null,
  descricao     text,
  peso_inicial  numeric not null default 0,
  peso_atual    numeric not null default 0,
  amostras      int not null default 0,     -- leads trabalhados com o sinal
  positivos     int not null default 0,     -- desses, quantos avançaram (responderam+)
  ganhos        int not null default 0,     -- desses, quantos fecharam
  taxa          numeric,                    -- taxa de avanço suavizada
  lift          numeric,                    -- quantas vezes melhor que quem não tem o sinal
  atualizado_em timestamptz not null default now(),
  primary key (produto_id, sinal)
);

-- Alvos de caça: nicho × cidade. O robô gira por eles todo dia.
create table if not exists public.alvos (
  id           uuid primary key default gen_random_uuid(),
  produto_id   uuid not null references public.produtos(id) on delete cascade,
  nicho        text not null,
  consulta     text not null,
  cidade       text not null,
  uf           text not null,
  ativo        boolean not null default true,
  prioridade   int not null default 0,
  buscas       int not null default 0,
  encontrados  int not null default 0,
  novos        int not null default 0,
  ultima_busca timestamptz,
  criado_em    timestamptz not null default now(),
  unique (produto_id, consulta, cidade, uf)
);

-- ---------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  produto_id      uuid not null references public.produtos(id) on delete cascade,
  fonte           text not null check (fonte in ('google','cnpj','manual','indicacao')),
  place_id        text,
  cnpj            text,
  nome            text not null,
  responsavel     text,
  nicho           text,
  telefone        text,           -- só dígitos, com 55 na frente
  telefone2       text,
  celular         boolean not null default false,
  email           text,
  site            text,
  instagram       text,
  maps_url        text,
  endereco        text,
  bairro          text,
  cidade          text,
  cidade_busca    text generated always as (lower(translate(coalesce(cidade, ''),
                    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))) stored,
  uf              text,
  lat             double precision,
  lng             double precision,
  nota            numeric,
  avaliacoes      int,
  status_google   text,
  aberto_em       date,
  natureza        text,
  porte           text,
  mei             boolean,
  sinais          jsonb not null default '{}'::jsonb,   -- achados do leitor de sinais
  sinais_ativos   text[] not null default '{}',         -- sinais que valem pontos
  concorrente     text,
  score           int not null default 0,
  motivos         jsonb not null default '[]'::jsonb,   -- por que está quente
  estagio         text not null default 'novo'
                  check (estagio in ('novo','tentando','conversando','demo','teste','ganho','perdido')),
  max_rank        int not null default 0,               -- estágio mais longe que já chegou
  tentativas      int not null default 0,
  dono            uuid references public.perfis(id) on delete set null,
  proxima_acao_em timestamptz,
  proxima_acao    text,
  motivo_perda    text,
  valor_mensal    numeric,
  observacoes     text,
  ultimo_contato_em timestamptz,
  ganho_em        timestamptz,
  perdido_em      timestamptz,
  enriquecido_em  timestamptz,
  enriquecimento_erro text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create unique index if not exists leads_place_uk on public.leads (produto_id, place_id) where place_id is not null;
create unique index if not exists leads_cnpj_uk  on public.leads (produto_id, cnpj)     where cnpj is not null;
create index if not exists leads_tel_ix   on public.leads (produto_id, telefone);
create index if not exists leads_fila_ix  on public.leads (produto_id, estagio, score desc);
create index if not exists leads_prox_ix  on public.leads (produto_id, proxima_acao_em);
create index if not exists leads_enr_ix   on public.leads (enriquecido_em) where enriquecido_em is null;

create table if not exists public.scripts (
  id          uuid primary key default gen_random_uuid(),
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  nicho       text,                         -- null = serve para todos os nichos
  canal       text not null check (canal in ('ligacao','whatsapp','followup','objecao','email')),
  titulo      text not null,
  gatilho     text,                         -- objeção: a frase que o cliente fala
  sinal       text,                         -- recomendado quando o lead tem este sinal
  corpo       text not null,
  ordem       int not null default 0,
  ativo       boolean not null default true,
  usos        int not null default 0,
  positivos   int not null default 0,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists scripts_prod_ix on public.scripts (produto_id, canal);

create table if not exists public.atividades (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  usuario     uuid references public.perfis(id) on delete set null default auth.uid(),
  tipo        text not null check (tipo in ('ligacao','whatsapp','email','visita','nota','estagio','sistema')),
  resultado   text,
  texto       text,
  script_id   uuid references public.scripts(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists atividades_lead_ix on public.atividades (lead_id, criado_em desc);
create index if not exists atividades_dia_ix  on public.atividades (produto_id, criado_em desc);

-- Quem pediu para não ser contatado (vale para todos os produtos - LGPD)
create table if not exists public.nao_contatar (
  id        uuid primary key default gen_random_uuid(),
  telefone  text unique,
  cnpj      text unique,
  motivo    text,
  criado_em timestamptz not null default now()
);

-- Diário dos robôs (e controle da cota grátis do Google)
create table if not exists public.execucoes (
  id           uuid primary key default gen_random_uuid(),
  produto_id   uuid references public.produtos(id) on delete cascade,
  tipo         text not null check (tipo in ('google','cnpj','enriquecimento','aprendizado')),
  origem       text not null default 'agendado',
  iniciado_em  timestamptz not null default now(),
  finalizado_em timestamptz,
  requisicoes  int not null default 0,
  encontrados  int not null default 0,
  novos        int not null default 0,
  duplicados   int not null default 0,
  erros        int not null default 0,
  detalhe      jsonb not null default '{}'::jsonb
);
create index if not exists execucoes_ix on public.execucoes (tipo, iniciado_em desc);

create table if not exists public.ajustes (
  id                    int primary key default 1 check (id = 1),
  google_limite_mensal  int not null default 950,   -- cota grátis = 1.000 / mês; margem de segurança
  google_limite_diario  int not null default 30,
  enriquecer_por_rodada int not null default 60
);
insert into public.ajustes (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Ranking dos estágios
-- ---------------------------------------------------------------------
create or replace function public.rank_estagio(e text) returns int
language sql immutable as $$
  select case e when 'novo' then 0 when 'tentando' then 1 when 'conversando' then 2
                when 'demo' then 3 when 'teste' then 4 when 'ganho' then 5 else 0 end
$$;

create or replace function public.leads_antes_salvar() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  new.max_rank := greatest(coalesce(old.max_rank, 0), coalesce(new.max_rank, 0), public.rank_estagio(new.estagio));
  if new.estagio = 'ganho'   and new.ganho_em   is null then new.ganho_em   := now(); end if;
  if new.estagio = 'perdido' and new.perdido_em is null then new.perdido_em := now(); end if;
  if new.estagio not in ('ganho','perdido') then new.perdido_em := null; end if;
  return new;
end $$;

drop trigger if exists leads_antes_salvar on public.leads;
create trigger leads_antes_salvar before insert or update on public.leads
  for each row execute function public.leads_antes_salvar();

-- ---------------------------------------------------------------------
-- Sinais: transforma os dados do lead nos sinais que pontuam
-- ---------------------------------------------------------------------
create or replace function public.calcular_sinais(l public.leads) returns text[]
language plpgsql stable as $$
declare
  s text[] := '{}';
  site_social boolean := coalesce(l.site ~* '(instagram\.com|facebook\.com|fb\.com|linktr\.ee|linktree|bio\.link|beacons\.ai|taplink|wa\.me|whatsapp\.com)', false);
begin
  if l.telefone is null and l.telefone2 is null then s := s || 'sem_contato'::text;
  elsif l.celular then s := s || 'celular'::text;
  else s := s || 'so_fixo'::text; end if;

  -- "agenda pelo WhatsApp" = tem WhatsApp e NENHUM sistema de agenda
  if (coalesce((l.sinais->>'whatsapp')::boolean, false) or coalesce(l.site ~* '(wa\.me|whatsapp\.com)', false))
     and l.concorrente is null and not coalesce((l.sinais->>'agenda_online')::boolean, false)
     then s := s || 'agenda_whatsapp'::text; end if;
  if l.site is null then s := s || 'sem_site'::text;
  elsif site_social then s := s || 'so_redes'::text; end if;
  if l.concorrente is not null then s := s || 'usa_concorrente'::text;
  elsif coalesce((l.sinais->>'agenda_online')::boolean, false) then s := s || 'agenda_online'::text; end if;

  if l.aberto_em is not null and l.aberto_em >= current_date - 90 then s := s || 'novo_negocio'::text; end if;
  if l.nota >= 4.6 then s := s || 'nota_alta'::text; elsif l.nota < 4.0 then s := s || 'nota_baixa'::text; end if;
  if l.avaliacoes >= 150 then s := s || 'estrutura_grande'::text;
  elsif l.avaliacoes >= 40 then s := s || 'estrutura_media'::text;
  elsif l.avaliacoes is not null and l.avaliacoes < 15 then s := s || 'pequeno'::text; end if;
  if l.mei then s := s || 'mei'::text; end if;
  if l.status_google in ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY') then s := s || 'fechado'::text; end if;

  -- segmentos: o sistema aprende sozinho quais nichos, fontes e estados convertem mais
  if l.nicho is not null then s := s || ('nicho:' || l.nicho); end if;
  s := s || ('fonte:' || l.fonte);
  if l.uf is not null then s := s || ('uf:' || upper(l.uf)); end if;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- Pontuação 0-100
-- ---------------------------------------------------------------------
create or replace function public.pontuar(p_produto uuid, p_lead uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not public.eh_membro() then
    raise exception 'sem permissão';
  end if;
  with base as (
    select l.id, public.calcular_sinais(l) as sa
      from public.leads l
     where l.produto_id = p_produto
       and (p_lead is null or l.id = p_lead)
  ), calc as (
    select b.id, b.sa,
           coalesce(sum(p.peso_atual), 0) as soma,
           coalesce(jsonb_agg(jsonb_build_object('sinal', p.sinal, 'rotulo', p.rotulo, 'peso', round(p.peso_atual)))
                    filter (where p.sinal is not null and round(p.peso_atual) <> 0), '[]'::jsonb) as mot
      from base b
      left join public.pesos p on p.produto_id = p_produto and p.sinal = any(b.sa)
     group by b.id, b.sa
  )
  update public.leads l
     set sinais_ativos = c.sa,
         score   = greatest(0, least(100, round(35 + c.soma)))::int,
         motivos = (select coalesce(jsonb_agg(x order by (x->>'peso')::numeric desc), '[]'::jsonb)
                      from jsonb_array_elements(c.mot) x)
    from calc c
   where l.id = c.id
     and (l.sinais_ativos is distinct from c.sa
          or l.score is distinct from greatest(0, least(100, round(35 + c.soma)))::int
          or l.motivos = '[]'::jsonb);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Aprendizado: recalcula os pesos a partir do que aconteceu de verdade
--   "positivo" = o lead avançou (respondeu / conversou / demo / teste / fechou)
--   Suavização bayesiana: com poucos dados vale o palpite inicial;
--   conforme os resultados chegam, vale o que os números mostram.
-- ---------------------------------------------------------------------
drop function if exists public.aprender(uuid);
create or replace function public.aprender(p_produto uuid, p_pesos jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_n int; v_k int; v_g int; p0 numeric;
  a constant numeric := 8;    -- força da suavização
  c constant numeric := 25;   -- amostras para "confiar" no aprendido
  esc constant numeric := 20; -- pontos por unidade de log-lift (2x melhor ≈ +14)
  r record; atualizados int := 0;
begin
  if auth.uid() is not null and not public.eh_membro() then
    raise exception 'sem permissão';
  end if;

  -- garante que os sinais estão calculados
  perform public.pontuar(p_produto);

  create temp table if not exists _trab (id uuid, sa text[], pos boolean, ganho boolean) on commit drop;
  delete from _trab;
  insert into _trab
  select id, sinais_ativos, max_rank >= 2, estagio = 'ganho'
    from public.leads
   where produto_id = p_produto
     and (ultimo_contato_em is not null or estagio in ('perdido','ganho') or max_rank >= 1);

  select count(*), count(*) filter (where pos), count(*) filter (where ganho)
    into v_n, v_k, v_g from _trab;
  p0 := (v_k + 1)::numeric / (v_n + 2);

  for r in
    with sinais as (select distinct unnest(sa) as sinal from _trab)
    select s.sinal,
           count(t.*) filter (where s.sinal = any(t.sa))                         as n_s,
           count(t.*) filter (where s.sinal = any(t.sa) and t.pos)               as k_s,
           count(t.*) filter (where s.sinal = any(t.sa) and t.ganho)             as g_s,
           count(t.*) filter (where not (s.sinal = any(t.sa)))                   as n_o,
           count(t.*) filter (where not (s.sinal = any(t.sa)) and t.pos)         as k_o
      from sinais s cross join _trab t
     group by s.sinal
  loop
    declare
      r_s numeric := (r.k_s + a * p0) / (r.n_s + a);
      r_o numeric := (r.k_o + a * p0) / (r.n_o + a);
      lf  numeric := ln(r_s / r_o);
      conf numeric := r.n_s / (r.n_s + c);
    begin
      -- sinal de segmento que ainda não existe na tabela entra com peso inicial 0
      if r.sinal like '%:%' and r.n_s >= 5 then
        insert into public.pesos (produto_id, sinal, rotulo, descricao, peso_inicial, peso_atual)
        values (p_produto, r.sinal,
                case split_part(r.sinal, ':', 1)
                  when 'nicho' then 'Nicho ' || coalesce((select n->>'nome' from public.produtos pr, jsonb_array_elements(pr.nichos) n
                                                           where pr.id = p_produto and n->>'chave' = split_part(r.sinal, ':', 2) limit 1),
                                                          split_part(r.sinal, ':', 2))
                  when 'fonte' then 'Fonte ' || split_part(r.sinal, ':', 2)
                  when 'uf'    then 'Estado ' || split_part(r.sinal, ':', 2)
                  else r.sinal end,
                'Aprendido automaticamente pelos resultados', 0, 0)
        on conflict do nothing;
      end if;

      update public.pesos
         set amostras = r.n_s, positivos = r.k_s, ganhos = r.g_s,
             taxa = round(r_s, 4), lift = round(r_s / r_o, 3),
             -- p_pesos vem do modelo conjunto (regressão logística, rodado pelo servidor);
             -- sem ele, usa a estimativa sinal-a-sinal
             peso_atual = round(coalesce((p_pesos->>r.sinal)::numeric, peso_inicial * (1 - conf) + (esc * lf) * conf), 2),
             atualizado_em = now()
       where produto_id = p_produto and sinal = r.sinal;
      if found then atualizados := atualizados + 1; end if;
    end;
  end loop;

  perform public.pontuar(p_produto);

  insert into public.execucoes (produto_id, tipo, origem, finalizado_em, encontrados, detalhe)
  values (p_produto, 'aprendizado', case when auth.uid() is null then 'agendado' else 'manual' end, now(), v_n,
          jsonb_build_object('trabalhados', v_n, 'avancaram', v_k, 'ganhos', v_g, 'pesos_atualizados', atualizados,
                             'modelo', case when p_pesos is null then 'sinal-a-sinal' else 'conjunto' end));

  return jsonb_build_object('trabalhados', v_n, 'avancaram', v_k, 'ganhos', v_g, 'pesos_atualizados', atualizados);
end $$;

-- Telefone sempre no mesmo formato: 55 + DDD + número (só dígitos)
create or replace function public.normalizar_tel(t text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(t, ''), '\D', '', 'g');
begin
  d := regexp_replace(d, '^0+', '');
  if length(d) in (10, 11) then d := '55' || d; end if;
  if length(d) not in (12, 13) or left(d, 2) <> '55' then
    return nullif(d, '');
  end if;
  return d;
end $$;

create or replace function public.eh_celular(t text) returns boolean
language sql immutable as $$
  select coalesce(length(t) = 13 and substr(t, 5, 1) = '9', false)
$$;

-- ---------------------------------------------------------------------
-- Entrada de leads pelos robôs (Google / CNPJ) com anti-duplicação
--   Só o servidor (service_role) chama esta função.
-- ---------------------------------------------------------------------
create or replace function public.ingerir_leads(p_produto uuid, p_leads jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j jsonb; v_id uuid; v_tel text; novos int := 0; dup int := 0; bloq int := 0;
begin
  for j in select * from jsonb_array_elements(p_leads) loop
    v_tel := public.normalizar_tel(j->>'telefone');

    if exists (select 1 from public.nao_contatar n
                where (v_tel is not null and n.telefone = v_tel)
                   or (j->>'cnpj' is not null and n.cnpj = j->>'cnpj')) then
      bloq := bloq + 1; continue;
    end if;

    select id into v_id from public.leads l
     where l.produto_id = p_produto
       and ((j->>'place_id' is not null and l.place_id = j->>'place_id')
         or (j->>'cnpj' is not null and l.cnpj = j->>'cnpj')
         or (v_tel is not null and l.telefone = v_tel))
     limit 1;

    if v_id is not null then
      -- já existe: completa o que estiver faltando (ex.: lead do CNPJ achado no Google)
      update public.leads l set
        place_id   = coalesce(l.place_id, j->>'place_id'),
        cnpj       = coalesce(l.cnpj, j->>'cnpj'),
        responsavel= coalesce(l.responsavel, j->>'responsavel'),
        site       = coalesce(l.site, j->>'site'),
        email      = coalesce(l.email, j->>'email'),
        maps_url   = coalesce(l.maps_url, j->>'maps_url'),
        nota       = coalesce((j->>'nota')::numeric, l.nota),
        avaliacoes = coalesce((j->>'avaliacoes')::int, l.avaliacoes),
        status_google = coalesce(j->>'status_google', l.status_google),
        aberto_em  = coalesce(l.aberto_em, (j->>'aberto_em')::date),
        lat        = coalesce(l.lat, (j->>'lat')::float8),
        lng        = coalesce(l.lng, (j->>'lng')::float8)
      where l.id = v_id;
      dup := dup + 1;
    else
      insert into public.leads (produto_id, fonte, place_id, cnpj, nome, responsavel, nicho, telefone, telefone2, celular,
                                email, site, maps_url, endereco, bairro, cidade, uf, lat, lng, nota, avaliacoes,
                                status_google, aberto_em, natureza, porte, mei)
      values (p_produto, coalesce(j->>'fonte', 'google'), j->>'place_id', j->>'cnpj',
              coalesce(nullif(j->>'nome', ''), 'Sem nome'), j->>'responsavel', j->>'nicho',
              v_tel, public.normalizar_tel(j->>'telefone2'),
              coalesce((j->>'celular')::boolean, false) or public.eh_celular(v_tel),
              j->>'email', j->>'site', j->>'maps_url', j->>'endereco', j->>'bairro', j->>'cidade', upper(j->>'uf'),
              (j->>'lat')::float8, (j->>'lng')::float8, (j->>'nota')::numeric, (j->>'avaliacoes')::int,
              j->>'status_google', (j->>'aberto_em')::date, j->>'natureza', j->>'porte', (j->>'mei')::boolean)
      returning id into v_id;
      novos := novos + 1;
    end if;
    perform public.pontuar(p_produto, v_id);
  end loop;
  return jsonb_build_object('novos', novos, 'duplicados', dup, 'bloqueados', bloq);
end $$;

-- ---------------------------------------------------------------------
-- Registrar o resultado de um contato + cadência automática do próximo passo
-- ---------------------------------------------------------------------
create or replace function public.registrar_resultado(
  p_lead uuid, p_tipo text, p_resultado text, p_texto text default null,
  p_script uuid default null, p_proxima timestamptz default null
) returns public.leads
language plpgsql security invoker set search_path = public as $$
declare
  l public.leads; t int; prox timestamptz; est text; acao text; motivo text; positivo boolean := false;
begin
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'lead não encontrado'; end if;

  t := l.tentativas; est := l.estagio; prox := null; acao := null; motivo := l.motivo_perda;

  case p_resultado
    when 'nao_atendeu', 'caixa_postal' then
      t := t + 1;
      if est = 'novo' then est := 'tentando'; end if;
      if t >= 6 and l.max_rank < 2 then
        est := 'perdido'; motivo := 'Sem resposta após 6 tentativas';
      else
        prox := now() + (case when t <= 1 then interval '1 day' when t = 2 then interval '2 days' else interval '3 days' end);
        acao := case when t >= 2 then 'Tentar pelo WhatsApp' else 'Ligar de novo' end;
      end if;
    when 'mensagem_enviada' then
      t := t + 1;
      if est = 'novo' then est := 'tentando'; end if;
      prox := now() + interval '2 days'; acao := 'Cobrar resposta (follow-up)';
    when 'respondeu', 'interessado' then
      positivo := true;
      if public.rank_estagio(est) < 2 then est := 'conversando'; end if;
      prox := now() + interval '1 day'; acao := 'Marcar demonstração';
    when 'pediu_retorno' then
      positivo := true;
      if public.rank_estagio(est) < 2 then est := 'conversando'; end if;
      prox := now() + interval '2 days'; acao := 'Retornar como combinado';
    when 'agendou_demo' then
      positivo := true; est := 'demo';
      prox := now() + interval '1 day'; acao := 'Fazer a demonstração';
    when 'iniciou_teste' then
      positivo := true; est := 'teste';
      prox := now() + interval '3 days'; acao := 'Acompanhar o teste grátis';
    when 'fechou' then
      positivo := true; est := 'ganho'; acao := null;
    when 'sem_interesse' then
      est := 'perdido'; motivo := coalesce(nullif(p_texto, ''), 'Sem interesse');
    when 'numero_errado' then
      est := 'perdido'; motivo := 'Número errado';
    when 'nao_contatar' then
      est := 'perdido'; motivo := 'Pediu para não ser contatado';
      insert into public.nao_contatar (telefone, cnpj, motivo)
      values (l.telefone, l.cnpj, 'Pedido do contato')
      on conflict do nothing;
    else
      null; -- 'nota' e outros: só registra
  end case;

  if p_proxima is not null and est not in ('ganho','perdido') then prox := p_proxima; end if;

  insert into public.atividades (lead_id, produto_id, tipo, resultado, texto, script_id)
  values (l.id, l.produto_id, p_tipo, p_resultado, p_texto, p_script);

  if p_script is not null and p_tipo in ('ligacao','whatsapp','email') then
    update public.scripts set usos = usos + 1, positivos = positivos + case when positivo then 1 else 0 end
     where id = p_script;
  end if;

  update public.leads set
    tentativas = t, estagio = est,
    proxima_acao_em = case when est in ('ganho','perdido') then null else coalesce(prox, proxima_acao_em) end,
    proxima_acao    = case when est in ('ganho','perdido') then null else coalesce(acao, proxima_acao) end,
    motivo_perda = case when est = 'perdido' then motivo else null end,
    ultimo_contato_em = case when p_tipo in ('ligacao','whatsapp','email','visita') then now() else ultimo_contato_em end,
    dono = coalesce(dono, auth.uid())
  where id = l.id
  returning * into l;
  return l;
end $$;

-- Arrastar no funil
create or replace function public.mover_estagio(p_lead uuid, p_estagio text, p_motivo text default null)
returns public.leads
language plpgsql security invoker set search_path = public as $$
declare l public.leads;
begin
  update public.leads set
    estagio = p_estagio,
    motivo_perda = case when p_estagio = 'perdido' then coalesce(p_motivo, motivo_perda, 'Movido para perdido') else null end,
    proxima_acao_em = case when p_estagio in ('ganho','perdido') then null else proxima_acao_em end,
    proxima_acao    = case when p_estagio in ('ganho','perdido') then null else proxima_acao end
  where id = p_lead returning * into l;
  insert into public.atividades (lead_id, produto_id, tipo, resultado, texto)
  values (l.id, l.produto_id, 'estagio', p_estagio, p_motivo);
  return l;
end $$;

-- ---------------------------------------------------------------------
-- Fila do dia: primeiro quem tem retorno vencido, depois os mais quentes
-- ---------------------------------------------------------------------
create or replace function public.fila_hoje(p_produto uuid, p_limite int default 60)
returns table (lead jsonb, motivo_fila text, ordem int)
language sql stable security invoker set search_path = public as $$
  with fim_dia as (select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day')
                          at time zone 'America/Sao_Paulo' as t)
  select to_jsonb(l), 'retorno', 1
    from public.leads l, fim_dia
   where l.produto_id = p_produto and l.estagio not in ('ganho','perdido')
     and l.proxima_acao_em is not null and l.proxima_acao_em < fim_dia.t
  union all
  select * from (
    select to_jsonb(l), 'quente', 2
      from public.leads l
     where l.produto_id = p_produto and l.estagio = 'novo'
       and (l.telefone is not null or l.telefone2 is not null)
       and not ('fechado' = any(l.sinais_ativos))
     order by l.score desc, l.criado_em desc
     limit p_limite
  ) q
$$;

create or replace function public.resumo(p_produto uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with ini as (select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' as hoje,
                      (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' as mes)
  select jsonb_build_object(
    'retornos_hoje', (select count(*) from public.leads l, ini where l.produto_id = p_produto
                        and l.estagio not in ('ganho','perdido') and l.proxima_acao_em < ini.hoje + interval '1 day'),
    'atrasados',     (select count(*) from public.leads l, ini where l.produto_id = p_produto
                        and l.estagio not in ('ganho','perdido') and l.proxima_acao_em < ini.hoje),
    'quentes_novos', (select count(*) from public.leads l where l.produto_id = p_produto and l.estagio = 'novo' and l.score >= 55),
    'novos_hoje',    (select count(*) from public.leads l, ini where l.produto_id = p_produto and l.criado_em >= ini.hoje),
    'contatos_hoje', (select count(*) from public.atividades a, ini where a.produto_id = p_produto
                        and a.tipo in ('ligacao','whatsapp','email','visita') and a.criado_em >= ini.hoje
                        and a.usuario = auth.uid()),
    'positivos_hoje',(select count(*) from public.atividades a, ini where a.produto_id = p_produto and a.criado_em >= ini.hoje
                        and a.resultado in ('respondeu','interessado','pediu_retorno','agendou_demo','iniciou_teste','fechou')),
    'ganhos_mes',    (select count(*) from public.leads l, ini where l.produto_id = p_produto and l.ganho_em >= ini.mes),
    'mrr_mes',       (select coalesce(sum(coalesce(l.valor_mensal, p.ticket_mensal)), 0) from public.leads l
                        join public.produtos p on p.id = l.produto_id, ini
                       where l.produto_id = p_produto and l.ganho_em >= ini.mes),
    'em_aberto',     (select count(*) from public.leads l where l.produto_id = p_produto and l.estagio in ('conversando','demo','teste')),
    'total',         (select count(*) from public.leads l where l.produto_id = p_produto),
    'google_mes',    (select coalesce(sum(requisicoes), 0) from public.execucoes e, ini where e.tipo = 'google' and e.iniciado_em >= ini.mes),
    'google_limite', (select google_limite_mensal from public.ajustes where id = 1)
  )
$$;

-- ---------------------------------------------------------------------
-- Segurança (RLS): só membros liberados enxergam e mexem
-- ---------------------------------------------------------------------
alter table public.perfis       enable row level security;
alter table public.produtos     enable row level security;
alter table public.pesos        enable row level security;
alter table public.alvos        enable row level security;
alter table public.leads        enable row level security;
alter table public.scripts      enable row level security;
alter table public.atividades   enable row level security;
alter table public.nao_contatar enable row level security;
alter table public.execucoes    enable row level security;
alter table public.ajustes      enable row level security;

do $$
declare t text;
begin
  -- limpa políticas antigas do Faro para poder rodar de novo
  for t in select tablename || '.' || policyname from pg_policies where schemaname = 'public' and policyname like 'faro_%' loop
    execute format('drop policy %I on public.%I', split_part(t, '.', 2), split_part(t, '.', 1));
  end loop;
end $$;

create policy faro_perfis_ler    on public.perfis for select using (id = auth.uid() or public.eh_membro());
create policy faro_perfis_admin  on public.perfis for update using (public.eh_admin()) with check (public.eh_admin());
create policy faro_perfis_proprio on public.perfis for update using (id = auth.uid())
  with check (id = auth.uid() and papel = (select p.papel from public.perfis p where p.id = auth.uid()));

create policy faro_produtos_ler   on public.produtos for select using (public.eh_membro());
create policy faro_produtos_admin on public.produtos for all using (public.eh_admin()) with check (public.eh_admin());
create policy faro_pesos_ler      on public.pesos for select using (public.eh_membro());
create policy faro_pesos_admin    on public.pesos for all using (public.eh_admin()) with check (public.eh_admin());
create policy faro_ajustes_ler    on public.ajustes for select using (public.eh_membro());
create policy faro_ajustes_admin  on public.ajustes for update using (public.eh_admin()) with check (public.eh_admin());

create policy faro_alvos       on public.alvos        for all using (public.eh_membro()) with check (public.eh_membro());
create policy faro_leads       on public.leads        for all using (public.eh_membro()) with check (public.eh_membro());
create policy faro_scripts     on public.scripts      for all using (public.eh_membro()) with check (public.eh_membro());
create policy faro_atividades  on public.atividades   for all using (public.eh_membro()) with check (public.eh_membro());
create policy faro_naocontatar on public.nao_contatar for all using (public.eh_membro()) with check (public.eh_membro());
create policy faro_execucoes   on public.execucoes    for select using (public.eh_membro());

revoke execute on function public.ingerir_leads(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.ingerir_leads(uuid, jsonb) to service_role;
revoke execute on function public.novo_usuario() from public, anon, authenticated;
revoke execute on function public.garantir_perfil() from public, anon;
grant execute on function public.garantir_perfil() to authenticated;
grant execute on function public.aprender(uuid, jsonb), public.pontuar(uuid, uuid), public.fila_hoje(uuid, int),
                          public.resumo(uuid), public.registrar_resultado(uuid, text, text, text, uuid, timestamptz),
                          public.mover_estagio(uuid, text, text) to authenticated;
revoke execute on function public.aprender(uuid, jsonb), public.pontuar(uuid, uuid) from anon;

-- ---------------------------------------------------------------------
-- Números para a tela Aprendizado
-- ---------------------------------------------------------------------
create or replace function public.estatisticas(p_produto uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with trab as (
    select * from public.leads
     where produto_id = p_produto
       and (ultimo_contato_em is not null or max_rank >= 1 or estagio in ('ganho','perdido'))
  )
  select jsonb_build_object(
    'funil', (select coalesce(jsonb_object_agg(estagio, n), '{}'::jsonb)
                from (select estagio, count(*) n from public.leads where produto_id = p_produto group by estagio) x),
    'por_nicho', (select coalesce(jsonb_agg(x order by x.trabalhados desc), '[]'::jsonb) from (
                    select coalesce(nicho, 'sem nicho') as chave, count(*) trabalhados,
                           count(*) filter (where max_rank >= 2) avancaram, count(*) filter (where estagio = 'ganho') ganhos
                      from trab group by 1) x),
    'por_fonte', (select coalesce(jsonb_agg(x order by x.trabalhados desc), '[]'::jsonb) from (
                    select fonte as chave, count(*) trabalhados,
                           count(*) filter (where max_rank >= 2) avancaram, count(*) filter (where estagio = 'ganho') ganhos
                      from trab group by 1) x),
    'por_uf', (select coalesce(jsonb_agg(x order by x.trabalhados desc), '[]'::jsonb) from (
                    select coalesce(uf, '?') as chave, count(*) trabalhados,
                           count(*) filter (where max_rank >= 2) avancaram, count(*) filter (where estagio = 'ganho') ganhos
                      from trab group by 1 order by 2 desc limit 12) x),
    'motivos_perda', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
                    select motivo_perda as motivo, count(*) n from public.leads
                     where produto_id = p_produto and estagio = 'perdido' and motivo_perda is not null
                     group by 1 order by 2 desc limit 8) x),
    'dias', (select coalesce(jsonb_agg(x order by x.dia), '[]'::jsonb) from (
                    select (a.criado_em at time zone 'America/Sao_Paulo')::date as dia,
                           count(*) filter (where a.tipo in ('ligacao','whatsapp','email','visita')) contatos,
                           count(*) filter (where a.resultado in ('respondeu','interessado','pediu_retorno','agendou_demo','iniciou_teste','fechou')) positivos
                      from public.atividades a
                     where a.produto_id = p_produto and a.criado_em > now() - interval '14 days'
                     group by 1) x),
    'scripts', (select coalesce(jsonb_agg(x order by x.taxa desc nulls last), '[]'::jsonb) from (
                    select id, titulo, canal, usos, positivos,
                           round((positivos + 1)::numeric / (usos + 2), 3) taxa
                      from public.scripts where produto_id = p_produto and usos > 0) x)
  )
$$;
grant execute on function public.estatisticas(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Pesos de partida para um produto novo (ajuste depois na tela Aprendizado)
-- ---------------------------------------------------------------------
create or replace function public.pesos_padrao(p_produto uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not public.eh_admin() then raise exception 'só o admin cria produto'; end if;
  insert into public.pesos (produto_id, sinal, rotulo, descricao, peso_inicial, peso_atual)
  select p_produto, v.sinal, v.rotulo, v.descricao, v.peso, v.peso from (values
    ('novo_negocio',     'Abriu há menos de 90 dias', 'Empresa nova montando a operação', 10),
    ('estrutura_grande', 'Estrutura grande',          '150+ avaliações no Google', 10),
    ('celular',          'Tem celular',               'Dá para ligar e chamar no WhatsApp', 12),
    ('estrutura_media',  'Estrutura média',           '40 a 149 avaliações', 6),
    ('so_redes',         'Só Instagram / link na bio','Sem site próprio', 4),
    ('sem_site',         'Sem site',                  'Nenhum endereço na web', 4),
    ('nota_alta',        'Nota alta (4,6+)',          'Negócio bem avaliado', 4),
    ('agenda_whatsapp',  'Atende pelo WhatsApp',      'Tem botão de WhatsApp e nenhum sistema', 0),
    ('mei',              'MEI',                       'Empresário individual', 0),
    ('pequeno',          'Poucas avaliações',         'Menos de 15 avaliações', 0),
    ('agenda_online',    'Já usa ferramenta online',  'Tem alguma ferramenta genérica', 0),
    ('nota_baixa',       'Nota baixa (< 4)',          'Pode estar com problema', -4),
    ('so_fixo',          'Só telefone fixo',          'Sem celular', -4),
    ('usa_concorrente',  'Usa concorrente',           'Já tem sistema: venda de troca', -6),
    ('sem_contato',      'Sem telefone',              'Não tem como ligar', -40),
    ('fechado',          'Fechado no Google',         'Marcado como fechado', -60)
  ) as v(sinal, rotulo, descricao, peso)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.pesos_padrao(uuid) from public, anon;
grant execute on function public.pesos_padrao(uuid) to authenticated;
