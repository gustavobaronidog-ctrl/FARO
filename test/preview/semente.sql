-- Dados de exemplo (fictícios) para a prévia visual
\set QUIET 1
insert into auth.users (id, email, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', 'gustavo@exemplo.com', '{"nome":"Gustavo"}');
set role service_role;
select ingerir_leads((select id from produtos where slug='tem-encaixe'), $j$[
 {"fonte":"google","place_id":"p1","nome":"Studio Bella Hair","nicho":"salao","telefone":"5531999110001","site":"https://instagram.com/studiobellahair","cidade":"Belo Horizonte","uf":"MG","bairro":"Savassi","nota":4.8,"avaliacoes":312,"maps_url":"https://maps.google.com"},
 {"fonte":"google","place_id":"p2","nome":"Barbearia Navalha de Ouro","nicho":"barbearia","telefone":"5511988220002","site":"https://wa.me/5511988220002","cidade":"São Paulo","uf":"SP","bairro":"Pinheiros","nota":4.9,"avaliacoes":188},
 {"fonte":"cnpj","cnpj":"51234567000101","nome":"Ateliê das Unhas","responsavel":"Camila Rocha Andrade","nicho":"esmalteria","telefone":"5531977330003","cidade":"Contagem","uf":"MG","aberto_em":"2026-09-12","mei":true},
 {"fonte":"google","place_id":"p4","nome":"Clínica Pele Viva Estética","nicho":"estetica","telefone":"5541991440004","site":"https://www.trinks.com/peleviva","cidade":"Curitiba","uf":"PR","nota":4.7,"avaliacoes":96},
 {"fonte":"google","place_id":"p5","nome":"Espaço Lumière Beauty","nicho":"salao","telefone":"5562985550005","site":"https://linktr.ee/lumiere","cidade":"Goiânia","uf":"GO","nota":4.6,"avaliacoes":154},
 {"fonte":"cnpj","cnpj":"51234567000202","nome":"Sobrancelhas da Lia","responsavel":"Lia Martins","nicho":"sobrancelha","telefone":"5521966660006","cidade":"Niterói","uf":"RJ","aberto_em":"2026-08-20","mei":true},
 {"fonte":"google","place_id":"p7","nome":"Barber Club Savassi","nicho":"barbearia","telefone":"553132270007","site":"https://barberclub.com.br","cidade":"Belo Horizonte","uf":"MG","nota":4.4,"avaliacoes":61},
 {"fonte":"google","place_id":"p8","nome":"Salão Cachos & Cia","nicho":"salao","telefone":"5571988880008","cidade":"Salvador","uf":"BA","nota":4.5,"avaliacoes":43},
 {"fonte":"google","place_id":"p9","nome":"Nail Bar Pétala","nicho":"esmalteria","telefone":"5519999990009","site":"https://instagram.com/nailbarpetala","cidade":"Campinas","uf":"SP","nota":4.9,"avaliacoes":220},
 {"fonte":"google","place_id":"p10","nome":"Corte Fino Barbearia","nicho":"barbearia","telefone":"5581987100010","site":"https://booksy.com/pt-br/cortefino","cidade":"Recife","uf":"PE","nota":4.3,"avaliacoes":38},
 {"fonte":"google","place_id":"p11","nome":"Instituto Belle Estética Avançada","nicho":"estetica","telefone":"5561999110011","site":"https://institutobelle.com.br","cidade":"Brasília","uf":"DF","nota":4.8,"avaliacoes":402},
 {"fonte":"cnpj","cnpj":"51234567000303","nome":"Espaço Joana Beleza","responsavel":"Joana da Silva Pereira","nicho":"salao","telefone":"5531977120012","cidade":"Betim","uf":"MG","aberto_em":"2026-09-25","mei":true},
 {"fonte":"google","place_id":"p13","nome":"Hair Studio Moema","nicho":"salao","telefone":"551150550013","cidade":"São Paulo","uf":"SP","nota":3.8,"avaliacoes":12},
 {"fonte":"google","place_id":"p14","nome":"Lash Design Ana Clara","nicho":"sobrancelha","telefone":"5551981230014","site":"https://instagram.com/lashanaclara","cidade":"Porto Alegre","uf":"RS","nota":5.0,"avaliacoes":77},
 {"fonte":"google","place_id":"p15","nome":"Salão Glamour Fechado","nicho":"salao","telefone":"5531999990015","status_google":"CLOSED_PERMANENTLY"}
]$j$::jsonb) \g /dev/null
reset role;
update leads set sinais = '{"whatsapp":true}', enriquecido_em = now() where place_id in ('p5','p7','p11');
update leads set concorrente = 'Trinks', enriquecido_em = now() where place_id = 'p4';
update leads set concorrente = 'Booksy', enriquecido_em = now() where place_id = 'p10';
select pontuar(id) from produtos \g /dev/null

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select registrar_resultado((select id from leads where place_id='p7'), 'ligacao', 'nao_atendeu') \g /dev/null
select registrar_resultado((select id from leads where place_id='p8'), 'ligacao', 'pediu_retorno', 'Dona é a Rose, pediu pra ligar depois das 14h', null, now() - interval '2 hours') \g /dev/null
select registrar_resultado((select id from leads where place_id='p11'), 'whatsapp', 'interessado', 'Tem 9 profissionais, quer ver a parte de faturamento por pessoa') \g /dev/null
select registrar_resultado((select id from leads where place_id='p11'), 'ligacao', 'agendou_demo', null, null, now() + interval '1 day') \g /dev/null
select registrar_resultado((select id from leads where place_id='p14'), 'whatsapp', 'iniciou_teste') \g /dev/null
select registrar_resultado((select id from leads where place_id='p9'), 'ligacao', 'fechou') \g /dev/null
update leads set valor_mensal = 149 where place_id = 'p9';
reset role;
