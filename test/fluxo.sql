-- Teste de ponta a ponta do banco: entrada de leads, segurança, cadência e aprendizado
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'gustavo@exemplo.com'),
  ('22222222-2222-2222-2222-222222222222', 'estranho@exemplo.com');

do $$ begin
  assert (select papel from perfis where id = '11111111-1111-1111-1111-111111111111') = 'admin', 'primeiro usuário deveria ser admin';
  assert (select papel from perfis where id = '22222222-2222-2222-2222-222222222222') = 'pendente', 'segundo deveria ser pendente';
end $$;

-- ---------- robô (service_role) ----------
set role service_role;
select ingerir_leads((select id from produtos where slug='tem-encaixe'), $j$[
 {"fonte":"google","place_id":"g1","nome":"Studio Bella","nicho":"salao","telefone":"+55 31 99999-0001","celular":true,"site":"https://instagram.com/studiobella","cidade":"Belo Horizonte","uf":"mg","nota":4.8,"avaliacoes":210},
 {"fonte":"google","place_id":"g2","nome":"Barbearia do Zé","nicho":"barbearia","telefone":"+55 11 3333-0002","celular":false,"site":"https://barbeariaze.com.br","cidade":"São Paulo","uf":"SP","nota":4.2,"avaliacoes":35},
 {"fonte":"google","place_id":"g3","nome":"Esmalteria Rosa","nicho":"esmalteria","telefone":"+55 41 98888-0003","celular":true,"cidade":"Curitiba","uf":"PR","nota":3.7,"avaliacoes":8},
 {"fonte":"cnpj","cnpj":"12345678000199","nome":"Espaço Nova","responsavel":"Maria Souza","nicho":"salao","telefone":"5531977770004","celular":true,"cidade":"Belo Horizonte","uf":"MG","aberto_em":"2026-09-01","mei":true},
 {"fonte":"google","place_id":"g4","nome":"Espaço Nova (Google)","telefone":"(31) 97777-0004","celular":true,"nota":4.9,"avaliacoes":12},
 {"fonte":"google","place_id":"g5","nome":"Fechado Hair","telefone":"5521966660005","celular":true,"status_google":"CLOSED_PERMANENTLY"},
 {"fonte":"google","place_id":"g6","nome":"Sem Telefone Spa","nicho":"estetica"}
]$j$::jsonb) as r1;
-- de novo: tudo duplicado
select ingerir_leads((select id from produtos where slug='tem-encaixe'), '[{"fonte":"google","place_id":"g1","nome":"Studio Bella"}]') as r2;
reset role;

do $$ begin
  assert (select count(*) from leads) = 6, 'esperava 6 leads (g4 é duplicata do CNPJ pelo telefone)';
  assert (select place_id from leads where cnpj = '12345678000199') = 'g4', 'lead do CNPJ deveria ganhar o place_id do Google';
  assert (select nota from leads where cnpj = '12345678000199') = 4.9, 'lead do CNPJ deveria ganhar a nota do Google';
  assert (select 'so_redes' = any(sinais_ativos) from leads where place_id = 'g1'), 'Studio Bella: só redes';
  assert (select 'novo_negocio' = any(sinais_ativos) from leads where cnpj = '12345678000199'), 'Espaço Nova: novo negócio';
  assert (select score from leads where place_id='g5') = 0, 'fechado deveria zerar';
  assert (select score from leads where place_id='g1') > (select score from leads where place_id='g2'), 'Studio Bella deveria ser mais quente que Barbearia do Zé';
end $$;

select nome, score, sinais_ativos, (select string_agg(m->>'rotulo' || ' ' || (m->>'peso'), ', ') from jsonb_array_elements(motivos) m) motivos
  from leads order by score desc;

-- ---------- segurança: usuário pendente não vê nada ----------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from leads) = 0, 'pendente não pode ver leads';
  assert (select count(*) from produtos) = 0, 'pendente não pode ver produtos';
  begin
    perform aprender((select id from produtos limit 1));
    raise exception 'pendente conseguiu rodar aprender';
  exception when others then
    if sqlerrm = 'pendente conseguiu rodar aprender' then raise; end if;
  end;
  begin
    perform ingerir_leads(gen_random_uuid(), '[]');
    raise exception 'authenticated conseguiu ingerir';
  exception when insufficient_privilege then null;
  end;
  -- não consegue se promover a admin
  begin
    update perfis set papel = 'admin' where id = auth.uid();
  exception when insufficient_privilege then null;  -- bloqueado pela RLS: correto
  end;
end $$;
reset role;
do $$ begin
  assert (select papel from perfis where id = '22222222-2222-2222-2222-222222222222') = 'pendente', 'pendente se promoveu!';
end $$;

-- ---------- admin trabalhando os leads ----------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare pid uuid := (select id from produtos where slug='tem-encaixe');
        bella uuid := (select id from leads where place_id='g1');
        ze uuid := (select id from leads where place_id='g2');
        nova uuid := (select id from leads where cnpj='12345678000199');
        rosa uuid := (select id from leads where place_id='g3');
        scr uuid := (select id from scripts where titulo='WhatsApp · Quem agenda pelo WhatsApp');
        l leads;
begin
  assert (select count(*) from leads) = 6, 'admin deveria ver os leads';
  assert (select count(*) from fila_hoje(pid)) = 4, 'fila: 4 novos com telefone, sem o fechado';
  assert (select (lead->>'nome') from fila_hoje(pid) order by ordem, (lead->>'score')::int desc limit 1) is not null;

  l := registrar_resultado(ze, 'ligacao', 'nao_atendeu');
  assert l.estagio = 'tentando' and l.tentativas = 1 and l.proxima_acao = 'Ligar de novo', 'cadência 1';
  l := registrar_resultado(ze, 'ligacao', 'nao_atendeu');
  assert l.proxima_acao = 'Tentar pelo WhatsApp', 'cadência 2 deveria sugerir WhatsApp';

  l := registrar_resultado(bella, 'whatsapp', 'mensagem_enviada', null, scr);
  l := registrar_resultado(bella, 'whatsapp', 'interessado', 'quer ver demo', scr);
  assert l.estagio = 'conversando' and l.max_rank = 2, 'bella conversando';
  l := registrar_resultado(bella, 'ligacao', 'agendou_demo', null, null, now() + interval '2 days');
  assert l.estagio = 'demo' and l.proxima_acao_em > now() + interval '1 day', 'demo com data escolhida';
  l := registrar_resultado(bella, 'ligacao', 'fechou');
  assert l.estagio = 'ganho' and l.ganho_em is not null and l.proxima_acao_em is null, 'ganho';
  assert (select usos from scripts where id = scr) = 2 and (select positivos from scripts where id = scr) = 1, 'estatística do script';

  l := registrar_resultado(rosa, 'ligacao', 'nao_contatar');
  assert l.estagio = 'perdido', 'rosa perdida';
  assert exists (select 1 from nao_contatar where telefone = l.telefone), 'telefone na lista de não contatar';

  l := mover_estagio(nova, 'conversando');
  assert l.max_rank = 2, 'mover estágio atualiza max_rank';
  l := mover_estagio(nova, 'perdido', 'Achou caro');
  assert l.motivo_perda = 'Achou caro' and l.max_rank = 2, 'perdido mantém max_rank';

  assert (resumo(pid)->>'ganhos_mes')::int = 1, 'resumo ganhos';
  assert (resumo(pid)->>'contatos_hoje')::int = 7, 'resumo contatos hoje = ' || (resumo(pid)->>'contatos_hoje');
end $$;
reset role;

-- lead bloqueado não volta pelo robô
set role service_role;
do $$ begin
  assert (ingerir_leads((select id from produtos where slug='tem-encaixe'),
          '[{"fonte":"google","place_id":"g99","nome":"Rosa de novo","telefone":"+55 41 98888-0003"}]')->>'bloqueados')::int = 1,
         'número em não contatar deveria ser bloqueado';
end $$;
reset role;

\echo '>>> fluxo básico OK'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare e jsonb := estatisticas((select id from produtos where slug='tem-encaixe'));
begin
  assert (e->'funil'->>'ganho')::int = 1, 'estatística funil';
  assert jsonb_array_length(e->'por_nicho') >= 2, 'estatística por nicho';
  assert (e->'motivos_perda'->0->>'n')::int >= 1, 'motivos de perda';
  assert jsonb_array_length(e->'scripts') = 1, 'ranking de scripts';
end $$;
reset role;
\echo '>>> estatísticas OK'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare pid uuid; begin
  insert into produtos (slug, nome) values ('mercado-teste', 'Mercado teste') returning id into pid;
  assert pesos_padrao(pid) = 16, 'pesos padrão criados';
  assert pesos_padrao(pid) = 0, 'não duplica';
end $$;
reset role;
\echo '>>> produto novo OK'
