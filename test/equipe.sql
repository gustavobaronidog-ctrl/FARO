-- Equipe: vendedor só vê o que é dele, filas separadas, WhatsApp depois de atender
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'gustavo@exemplo.com', '{"nome":"Gustavo"}'),
  ('33333333-3333-3333-3333-333333333333', 'ana@exemplo.com', '{"nome":"Ana"}'),
  ('44444444-4444-4444-4444-444444444444', 'bia@exemplo.com', '{"nome":"Bia"}'),
  ('22222222-2222-2222-2222-222222222222', 'estranho@exemplo.com', '{}');
update perfis set papel = 'vendedor' where id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');

set role service_role;
select ingerir_leads((select id from produtos where slug='tem-encaixe'),
  (select jsonb_agg(jsonb_build_object('fonte','google','place_id','e'||i,'nome','Salão '||i,'nicho','salao',
     'telefone','55319999'||lpad(i::text,5,'0'),'celular',true,'cidade','BH','uf','MG','avaliacoes',i*10,'nota',4.7))
     from generate_series(1, 30) i)) is not null as leads_ok;
reset role;

do $$ begin
  assert (select whatsapp from perfis where id = '11111111-1111-1111-1111-111111111111') = 'apos_ligacao'
      or (select papel from perfis where id = '11111111-1111-1111-1111-111111111111') = 'admin', 'admin existe';
  assert (select whatsapp from perfis where id = '33333333-3333-3333-3333-333333333333') = 'apos_ligacao', 'vendedor nasce com WhatsApp depois da ligação';
end $$;

-- ---------- Ana (vendedora) reserva a fila dela ----------
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare pid uuid := (select id from produtos where slug='tem-encaixe'); l leads; meu uuid; outro uuid;
begin
  assert (select count(*) from leads) = 0, 'sem reservar, a Ana não vê nenhum lead';
  assert reservar_leads(pid, 10) = 10, 'Ana reservou 10';
  assert reservar_leads(pid, 10) = 10, 'reservar de novo não pega mais que a meta';
  assert (select count(*) from leads) = 10, 'Ana vê só os 10 dela';
  assert (select count(*) from fila_hoje(pid)) = 10, 'fila da Ana tem os 10';
  assert (select min(score) from leads) >= (select max(score) from leads) - 1000, 'ok';

  meu := (select id from leads order by score desc limit 1);
  l := registrar_resultado(meu, 'ligacao', 'nao_atendeu');
  assert l.atendeu_em is null, 'não atendeu: WhatsApp continua travado';
  l := registrar_resultado(meu, 'ligacao', 'interessado', null, (select id from scripts where titulo = 'SPIN · Salão de beleza'));
  assert l.atendeu_em is not null and l.estagio = 'conversando', 'atendeu: libera o WhatsApp';
  assert (select usos from scripts where titulo = 'SPIN · Salão de beleza') = 1, 'uso do script conta mesmo para o vendedor';
  assert (select count(*) from atividades) = 2, 'Ana vê o histórico dos leads dela';

  -- não pode mexer em script, praça, nem no próprio acesso
  update scripts set corpo = 'hackeado';
  assert not exists (select 1 from scripts where corpo = 'hackeado'), 'vendedor não edita script';
  assert (select count(*) from alvos) = 0, 'vendedor não vê as praças';
  assert (select count(*) from execucoes) = 0, 'vendedor não vê o diário dos robôs';
  begin
    update perfis set whatsapp = 'sempre' where id = auth.uid();
    raise exception 'Ana liberou o próprio WhatsApp';
  exception when insufficient_privilege or check_violation then null;
  end;
  update perfis set nome = 'Ana Paula' where id = auth.uid();
  assert (select nome from perfis where id = auth.uid()) = 'Ana Paula', 'pode mudar o próprio nome';
end $$;

-- ---------- Bia (outra vendedora): fila sem repetir nenhum lead da Ana ----------
reset role;
select id as outro from leads where dono = '33333333-3333-3333-3333-333333333333' limit 1 \gset
select set_config('teste.outro', :'outro', false) is not null as ok;
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare pid uuid := (select id from produtos where slug='tem-encaixe'); outro uuid := current_setting('teste.outro')::uuid; n int;
begin
  assert reservar_leads(pid, 15) = 15, 'Bia reservou 15';
  assert (select count(*) from leads) = 15, 'Bia vê só os 15 dela';
  -- tentar mexer num lead da Ana não faz nada
  update leads set observacoes = 'mexi' where id = outro;
  get diagnostics n = row_count;
  assert n = 0, 'Bia não mexe em lead da Ana';
  begin
    perform registrar_resultado(outro, 'ligacao', 'fechou');
    raise exception 'Bia registrou resultado em lead da Ana';
  exception when others then
    if sqlerrm not like '%lead não encontrado%' then raise; end if;
  end;
  assert (select count(*) from ligacoes) = 0, 'Bia não vê gravações de ninguém';
end $$;
reset role;

do $$ begin
  assert (select count(*) from leads where dono = '33333333-3333-3333-3333-333333333333') = 10, 'Ana 10';
  assert (select count(*) from leads where dono = '44444444-4444-4444-4444-444444444444') = 15, 'Bia 15';
  assert (select count(*) from leads where dono is null) = 5, 'sobraram 5 no monte';
end $$;

-- ---------- gravações: cada um ouve as suas ----------
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into storage.objects (bucket_id, name) values ('gravacoes', 'p/ana.wav');
insert into ligacoes (lead_id, produto_id, audio_path) select id, produto_id, 'p/ana.wav' from leads limit 1;
do $$ begin
  assert (select count(*) from ligacoes) = 1, 'Ana vê a gravação dela';
  assert (select count(*) from storage.objects where bucket_id = 'gravacoes') = 1, 'Ana ouve o áudio dela';
  delete from storage.objects where name = 'p/ana.wav';
  assert (select count(*) from storage.objects where bucket_id = 'gravacoes') = 1, 'vendedor não apaga gravação';
end $$;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'gravacoes') = 0, 'Bia não ouve o áudio da Ana';
  assert (select equipe_resumo((select id from produtos where slug='tem-encaixe'))) = '{}'::jsonb, 'vendedor não vê o painel da equipe';
end $$;

-- ---------- pendente não vê nada ----------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from leads) = 0 and (select count(*) from atividades) = 0 and (select count(*) from scripts) = 0, 'pendente não vê nada';
  begin perform reservar_leads((select id from produtos limit 1), 10); raise exception 'pendente reservou';
  exception when others then if sqlerrm not like '%sem acesso%' then raise; end if; end;
end $$;

-- ---------- admin: vê tudo, painel da equipe, devolve a fila da Bia ----------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare pid uuid := (select id from produtos where slug='tem-encaixe'); r jsonb;
begin
  assert (select count(*) from leads) = 30, 'admin vê todos os leads';
  assert (select count(*) from ligacoes) = 1 and (select count(*) from storage.objects) = 1, 'admin vê e ouve tudo';
  r := equipe_resumo(pid);
  assert (r->'33333333-3333-3333-3333-333333333333'->>'na_fila')::int = 9, 'Ana: 9 na fila (1 já trabalhado) ' || r::text;
  assert (r->'33333333-3333-3333-3333-333333333333'->>'ligacoes_hoje')::int = 2, 'Ana: 2 ligações hoje';
  assert (r->'33333333-3333-3333-3333-333333333333'->>'atendeu_hoje')::int = 1, 'Ana: 1 atendeu';
  assert (r->'44444444-4444-4444-4444-444444444444'->>'na_fila')::int = 15, 'Bia: 15 na fila';
  assert liberar_leads('44444444-4444-4444-4444-444444444444') = 15, 'devolveu a fila da Bia';
  assert reservar_leads(pid, 40) = 20, 'admin pegou os 20 que sobraram';
  assert (select count(*) from fila_hoje(pid) where motivo_fila = 'quente') = 20, 'fila do admin';
  update scripts set ativo = ativo where titulo like 'SPIN%';
  update perfis set whatsapp = 'sempre' where id = '33333333-3333-3333-3333-333333333333';
  assert (select whatsapp from perfis where id = '33333333-3333-3333-3333-333333333333') = 'sempre', 'admin libera o WhatsApp da Ana';
end $$;
reset role;

-- ---------- reserva parada há mais de 2 dias volta para o monte ----------
update leads set reservado_em = now() - interval '3 days' where dono = '11111111-1111-1111-1111-111111111111' and tentativas = 0;
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin
  assert reservar_leads((select id from produtos where slug='tem-encaixe'), 12) = 12, 'Bia pega leads que estavam parados com o admin';
end $$;
reset role;
select '>>> equipe OK' as resultado;
