-- Simula 600 leads trabalhados onde a "verdade do mercado" é:
--   quem agenda pelo WhatsApp responde muito (40%), quem usa concorrente quase nunca (4%),
--   barbearias respondem muito mais que a média, e "nota alta" na prática não muda nada.
-- O Faro precisa descobrir isso sozinho só olhando os resultados.
\set ON_ERROR_STOP 1
\set QUIET 1
select setseed(0.42);

set role service_role;
select ingerir_leads((select id from produtos where slug='tem-encaixe'), (
  select jsonb_agg(jsonb_build_object(
    'fonte','google', 'place_id','sim'||i, 'nome','Lead '||i,
    'nicho', (array['salao','barbearia','esmalteria','estetica'])[1 + i % 4],
    'telefone', '55319' || lpad(i::text, 8, '0'), 'celular', true,
    'site', case when i % 3 = 0 then 'https://wa.me/5531900000000'
                 when i % 7 = 0 then 'https://www.trinks.com/salao' || i
                 else 'https://instagram.com/lead' || i end,
    'nota', case when i % 2 = 0 then 4.8 else 4.3 end,
    'avaliacoes', 20 + (i * 37) % 300, 'uf', 'MG'))
  from generate_series(1, 600) i)) ;
reset role;

-- leitor de sinais marcou concorrente nos que têm trinks
update leads set concorrente = 'Trinks' where site like '%trinks%';
select pontuar(id) from produtos where slug='tem-encaixe';

-- resultado "real" de cada lead
with r as (
  select id,
         random() < (0.10
           + case when 'agenda_whatsapp' = any(sinais_ativos) then 0.30 else 0 end
           + case when nicho = 'barbearia' then 0.18 else 0 end
           - case when concorrente is not null then 0.08 else 0 end) as avancou
    from leads where place_id like 'sim%'
)
update leads l set
  ultimo_contato_em = now(), tentativas = 1,
  estagio = case when r.avancou then (case when random() < 0.4 then 'ganho' else 'conversando' end) else 'perdido' end
  from r where l.id = r.id;

\echo '--- ANTES de aprender'
select sinal, peso_atual from pesos where produto_id = (select id from produtos where slug='tem-encaixe')
   and sinal in ('agenda_whatsapp','usa_concorrente','nota_alta','so_redes') order by sinal;

select aprender(id) from produtos where slug='tem-encaixe';

\echo '--- DEPOIS de aprender'
select sinal, rotulo, peso_inicial, peso_atual, amostras, positivos, taxa, lift
  from pesos where produto_id = (select id from produtos where slug='tem-encaixe') and amostras > 0
 order by peso_atual desc;

do $$
declare pid uuid := (select id from produtos where slug='tem-encaixe');
begin
  assert (select peso_atual from pesos where produto_id=pid and sinal='agenda_whatsapp') - (select peso_atual from pesos where produto_id=pid and sinal='usa_concorrente') > 25, 'WhatsApp deveria valer muito mais que concorrente';
  assert (select peso_atual from pesos where produto_id=pid and sinal='usa_concorrente') < -8, 'concorrente deveria cair';
  assert (select peso_atual from pesos where produto_id=pid and sinal='nicho:barbearia') > 3, 'barbearia deveria ganhar peso aprendido';
  assert (select count(*) from execucoes where tipo='aprendizado') = 1, 'execução registrada';
end $$;

-- com POUCOS dados o palpite inicial deve prevalecer (não sair chutando)
create temp table pesos_snapshot as select sinal, peso_atual from pesos;
delete from leads where place_id like 'sim%' and place_id not in ('sim1','sim2','sim3','sim4');
update pesos set peso_atual = peso_inicial, amostras = 0;
select aprender(id) from produtos where slug='tem-encaixe';
do $$ begin
  assert (select max(abs(peso_atual - peso_inicial)) from pesos where peso_inicial <> 0) < 3,
    'com 4 leads trabalhados os pesos não podem mudar muito';
end $$;

\echo '>>> aprendizado OK'
