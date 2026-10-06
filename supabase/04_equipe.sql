-- =====================================================================
--  FARO · 04 · Equipe: vendedor vê só o que precisa, fila separada por pessoa
--  e WhatsApp liberado só depois que o cliente atende a ligação.
--  Rode depois do 01, 02 e 03. Pode rodar de novo quantas vezes quiser.
--  Atenção: se um dia rodar o 01 de novo, rode o 03 e este 04 depois dele.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos campos
-- ---------------------------------------------------------------------
-- WhatsApp de cada pessoa: 'apos_ligacao' (padrão do vendedor), 'sempre' ou 'nunca'
alter table public.perfis add column if not exists whatsapp text not null default 'apos_ligacao';
do $$ begin
  alter table public.perfis add constraint perfis_whatsapp_ck check (whatsapp in ('nunca','apos_ligacao','sempre'));
exception when duplicate_object then null; end $$;
update public.perfis set whatsapp = 'sempre' where papel = 'admin' and whatsapp <> 'sempre';

alter table public.leads add column if not exists atendeu_em   timestamptz; -- quando o cliente atendeu uma ligação
alter table public.leads add column if not exists reservado_em timestamptz; -- quando entrou na fila de alguém
create index if not exists leads_dono_ix on public.leads (produto_id, dono, estagio);

-- quem já atendeu alguma ligação antes desta atualização
update public.leads l set atendeu_em = a.quando
  from (select lead_id, min(criado_em) quando from public.atividades
         where tipo = 'ligacao' and resultado in ('respondeu','interessado','pediu_retorno','agendou_demo','iniciou_teste','fechou','sem_interesse')
         group by lead_id) a
 where a.lead_id = l.id and l.atendeu_em is null;

-- ---------------------------------------------------------------------
-- 2. Fila separada: cada pessoa reserva os leads quentes que vai trabalhar
--    (ninguém liga duas vezes para o mesmo salão)
-- ---------------------------------------------------------------------
create or replace function public.reservar_leads(p_produto uuid, p_quantos int default 40)
returns int
language plpgsql security definer set search_path = public as $$
declare tenho int; pegos int := 0;
begin
  if not public.eh_membro() then raise exception 'sem acesso'; end if;
  -- reservas paradas há mais de 2 dias, sem nenhuma tentativa, voltam para o monte
  update public.leads set dono = null, reservado_em = null
   where produto_id = p_produto and estagio = 'novo' and tentativas = 0
     and dono is not null and reservado_em < now() - interval '2 days';
  select count(*) into tenho from public.leads
   where produto_id = p_produto and dono = auth.uid() and estagio = 'novo' and tentativas = 0;
  if tenho < p_quantos then
    with escolhidos as (
      select id from public.leads
       where produto_id = p_produto and estagio = 'novo' and dono is null
         and (telefone is not null or telefone2 is not null)
         and not ('fechado' = any(sinais_ativos))
       order by score desc, criado_em desc
       limit least(p_quantos, 120) - tenho
       for update skip locked
    )
    update public.leads l set dono = auth.uid(), reservado_em = now()
      from escolhidos e where l.id = e.id;
    get diagnostics pegos = row_count;
  end if;
  return tenho + pegos;
end $$;

-- O admin devolve para o monte os leads ainda não trabalhados de alguém (ex.: quando a pessoa sai)
create or replace function public.liberar_leads(p_usuario uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'só o admin'; end if;
  update public.leads set dono = null, reservado_em = null
   where dono = p_usuario and estagio = 'novo' and tentativas = 0;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fila_hoje(p_produto uuid, p_limite int default 60)
returns table (lead jsonb, motivo_fila text, ordem int)
language sql stable security invoker set search_path = public as $$
  with fim_dia as (select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day')
                          at time zone 'America/Sao_Paulo' as t)
  select to_jsonb(l), 'retorno', 1
    from public.leads l, fim_dia
   where l.produto_id = p_produto and l.estagio not in ('ganho','perdido')
     and l.proxima_acao_em is not null and l.proxima_acao_em < fim_dia.t
     and (l.dono = auth.uid() or (l.dono is null and public.eh_admin()))
  union all
  select * from (
    select to_jsonb(l), 'quente', 2
      from public.leads l
     where l.produto_id = p_produto and l.estagio = 'novo' and l.dono = auth.uid()
       and (l.telefone is not null or l.telefone2 is not null)
       and not ('fechado' = any(l.sinais_ativos))
     order by l.score desc, l.criado_em desc
     limit p_limite
  ) q
$$;

-- ---------------------------------------------------------------------
-- 3. Registrar resultado: igual ao de antes + marca quando o cliente atendeu
-- ---------------------------------------------------------------------
-- contador de uso dos scripts (o vendedor não pode editar scripts, mas o uso dele conta)
create or replace function public.contar_uso_script(p_script uuid, p_positivo boolean)
returns void
language sql security definer set search_path = public as $$
  update public.scripts set usos = usos + 1, positivos = positivos + case when p_positivo then 1 else 0 end
   where id = p_script and public.eh_membro()
$$;

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
    perform public.contar_uso_script(p_script, positivo);
  end if;

  update public.leads set
    tentativas = t, estagio = est,
    proxima_acao_em = case when est in ('ganho','perdido') then null else coalesce(prox, proxima_acao_em) end,
    proxima_acao    = case when est in ('ganho','perdido') then null else coalesce(acao, proxima_acao) end,
    motivo_perda = case when est = 'perdido' then motivo else null end,
    ultimo_contato_em = case when p_tipo in ('ligacao','whatsapp','email','visita') then now() else ultimo_contato_em end,
    atendeu_em = case when p_tipo = 'ligacao' and p_resultado in ('respondeu','interessado','pediu_retorno','agendou_demo','iniciou_teste','fechou','sem_interesse')
                      then coalesce(atendeu_em, now()) else atendeu_em end,
    dono = coalesce(dono, auth.uid())
  where id = l.id
  returning * into l;
  return l;
end $$;

-- ---------------------------------------------------------------------
-- 4. Painel da equipe (só o admin vê os números de todo mundo)
-- ---------------------------------------------------------------------
create or replace function public.equipe_resumo(p_produto uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with ini as (select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' as hoje)
  select coalesce(jsonb_object_agg(p.id, jsonb_build_object(
    'na_fila',     (select count(*) from public.leads l where l.produto_id = p_produto and l.dono = p.id and l.estagio = 'novo' and l.tentativas = 0),
    'em_aberto',   (select count(*) from public.leads l where l.produto_id = p_produto and l.dono = p.id and l.estagio in ('tentando','conversando','demo','teste')),
    'ligacoes_hoje', (select count(*) from public.atividades a, ini where a.produto_id = p_produto and a.usuario = p.id and a.tipo = 'ligacao' and a.criado_em >= ini.hoje),
    'atendeu_hoje',  (select count(*) from public.atividades a, ini where a.produto_id = p_produto and a.usuario = p.id and a.tipo = 'ligacao' and a.criado_em >= ini.hoje
                        and a.resultado in ('respondeu','interessado','pediu_retorno','agendou_demo','iniciou_teste','fechou','sem_interesse')),
    'positivos_hoje',(select count(*) from public.atividades a, ini where a.produto_id = p_produto and a.usuario = p.id and a.criado_em >= ini.hoje
                        and a.resultado in ('respondeu','interessado','pediu_retorno','agendou_demo','iniciou_teste','fechou')),
    'ganhos_mes',  (select count(*) from public.leads l where l.produto_id = p_produto and l.dono = p.id and l.ganho_em >= date_trunc('month', now())),
    'nota_treino', (select round(avg(g.nota), 1) from public.ligacoes g where g.usuario = p.id and g.status = 'pronta' and g.criado_em > now() - interval '14 days'),
    'gravadas',    (select count(*) from public.ligacoes g where g.usuario = p.id and g.criado_em > now() - interval '14 days')
  )), '{}'::jsonb)
  from public.perfis p
  where public.eh_admin() and p.papel in ('admin','vendedor')
$$;

-- ---------------------------------------------------------------------
-- 5. Segurança: o vendedor só enxerga e mexe no que é dele
-- ---------------------------------------------------------------------
-- o próprio usuário não pode mudar o próprio papel nem a própria permissão de WhatsApp
drop policy if exists faro_perfis_proprio on public.perfis;
create policy faro_perfis_proprio on public.perfis for update using (id = auth.uid())
  with check (id = auth.uid()
    and papel    = (select p.papel    from public.perfis p where p.id = auth.uid())
    and whatsapp = (select p.whatsapp from public.perfis p where p.id = auth.uid()));

-- leads: admin vê tudo; vendedor só os da fila dele
drop policy if exists faro_leads on public.leads;
drop policy if exists faro_leads_admin on public.leads;
drop policy if exists faro_leads_vendedor_ler on public.leads;
drop policy if exists faro_leads_vendedor_mexer on public.leads;
create policy faro_leads_admin          on public.leads for all    using (public.eh_admin()) with check (public.eh_admin());
create policy faro_leads_vendedor_ler   on public.leads for select using (public.eh_membro() and dono = auth.uid());
create policy faro_leads_vendedor_mexer on public.leads for update using (public.eh_membro() and dono = auth.uid())
  with check (public.eh_membro() and dono = auth.uid());

-- histórico: o vendedor vê e registra só nos leads dele
drop policy if exists faro_atividades on public.atividades;
drop policy if exists faro_atividades_admin on public.atividades;
drop policy if exists faro_atividades_vendedor_ler on public.atividades;
drop policy if exists faro_atividades_vendedor_criar on public.atividades;
create policy faro_atividades_admin          on public.atividades for all using (public.eh_admin()) with check (public.eh_admin());
create policy faro_atividades_vendedor_ler   on public.atividades for select
  using (public.eh_membro() and exists (select 1 from public.leads l where l.id = lead_id));
create policy faro_atividades_vendedor_criar on public.atividades for insert
  with check (public.eh_membro() and usuario = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id));

-- scripts: todos leem; só o admin cria, edita e apaga
drop policy if exists faro_scripts on public.scripts;
drop policy if exists faro_scripts_ler on public.scripts;
drop policy if exists faro_scripts_admin on public.scripts;
create policy faro_scripts_ler   on public.scripts for select using (public.eh_membro());
create policy faro_scripts_admin on public.scripts for all    using (public.eh_admin()) with check (public.eh_admin());

-- praças da caçada e diário dos robôs: só o admin
drop policy if exists faro_alvos on public.alvos;
drop policy if exists faro_alvos_admin on public.alvos;
create policy faro_alvos_admin on public.alvos for all using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists faro_execucoes on public.execucoes;
drop policy if exists faro_execucoes_admin on public.execucoes;
create policy faro_execucoes_admin on public.execucoes for select using (public.eh_admin());

-- ligações gravadas: o vendedor vê as dele; só o admin apaga
drop policy if exists faro_ligacoes on public.ligacoes;
drop policy if exists faro_ligacoes_admin on public.ligacoes;
drop policy if exists faro_ligacoes_vendedor_ler on public.ligacoes;
drop policy if exists faro_ligacoes_vendedor_criar on public.ligacoes;
create policy faro_ligacoes_admin          on public.ligacoes for all    using (public.eh_admin()) with check (public.eh_admin());
create policy faro_ligacoes_vendedor_ler   on public.ligacoes for select using (public.eh_membro() and usuario = auth.uid());
create policy faro_ligacoes_vendedor_criar on public.ligacoes for insert
  with check (public.eh_membro() and usuario = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id));

-- áudios: o vendedor ouve só as próprias gravações; só o admin apaga
drop policy if exists faro_gravacoes_ler    on storage.objects;
drop policy if exists faro_gravacoes_apagar on storage.objects;
create policy faro_gravacoes_ler on storage.objects for select to authenticated using (
  bucket_id = 'gravacoes' and (public.eh_admin()
    or exists (select 1 from public.ligacoes g where g.audio_path = name and g.usuario = auth.uid())));
create policy faro_gravacoes_apagar on storage.objects for delete to authenticated using (bucket_id = 'gravacoes' and public.eh_admin());

-- ---------------------------------------------------------------------
-- 6. Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function public.reservar_leads(uuid, int), public.liberar_leads(uuid), public.equipe_resumo(uuid),
                           public.contar_uso_script(uuid, boolean) from public, anon;
grant  execute on function public.reservar_leads(uuid, int), public.liberar_leads(uuid), public.equipe_resumo(uuid),
                           public.contar_uso_script(uuid, boolean), public.fila_hoje(uuid, int),
                           public.registrar_resultado(uuid, text, text, text, uuid, timestamptz) to authenticated;
