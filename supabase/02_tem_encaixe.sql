-- =====================================================================
--  FARO · 02 · Espaço do TEM ENCAIXE (cliente ideal, sinais, alvos e scripts)
--  Rode depois do 01. Pode rodar de novo: não duplica nada.
--  Revise os scripts com o seu jeito de falar — eles são o ponto de partida.
-- =====================================================================

insert into public.produtos (slug, nome, cor, site, ticket_mensal, pitch, nichos, concorrentes, config)
values (
  'tem-encaixe', 'Tem Encaixe', '#ff6a3d', 'www.temencaixe.com', 149,
  $p$Tem Encaixe é um sistema de agendamento e gestão para salões de beleza, barbearias, esmalterias, estúdios de estética e clínicas.
A cliente agenda sozinha, 24 horas, por um link (na bio do Instagram ou no WhatsApp), escolhe o serviço e o profissional; o sistema impede horário duplicado.
A dona tem um painel com a agenda de toda a equipe, faturamento, metas, quanto cada profissional vendeu, promoções e cupons, avaliações e a ficha de cada cliente (inclusive quem sumiu, para chamar de volta).
Pagamento antecipado por Pix. Funciona no navegador do celular, sem instalar nada.
Teste grátis de 7 dias. Planos: Solo R$79 (1 profissional), Equipe R$149 (até 5), Studio R$249 (ilimitado + assistente de IA). No anual, 12 meses pelo preço de 10.
Posicionamento: não é "só uma agenda", é a gestão do salão — principalmente para quem tem equipe.$p$,
  $j$[
    {"chave":"salao","nome":"Salão de beleza","consultas":["salão de beleza","cabeleireiro"],"cnaes":["9602501"],"palavras":["salao","hair","cabeleir","cabelo","beauty","beleza"]},
    {"chave":"barbearia","nome":"Barbearia","consultas":["barbearia"],"cnaes":["9602501"],"palavras":["barb","barber"]},
    {"chave":"esmalteria","nome":"Esmalteria / Nail","consultas":["esmalteria","nail designer"],"cnaes":["9602501"],"palavras":["esmalt","nail","unha","manicure"]},
    {"chave":"estetica","nome":"Estética","consultas":["clínica de estética","estética facial e corporal"],"cnaes":["9602502"],"palavras":["estetic","estétic","spa","depil","laser"]},
    {"chave":"sobrancelha","nome":"Sobrancelha e cílios","consultas":["design de sobrancelhas","extensão de cílios"],"cnaes":["9602502"],"palavras":["sobrancel","cilio","cílio","lash","brow"]}
  ]$j$::jsonb,
  $j$[
    {"nome":"Trinks","padroes":["trinks.com"]},
    {"nome":"Avec","padroes":["avec.app","avec.beauty","salaoonline"]},
    {"nome":"Booksy","padroes":["booksy.com"]},
    {"nome":"Fresha","padroes":["fresha.com"]},
    {"nome":"Salão VIP","padroes":["salaovip.com.br"]},
    {"nome":"AppBarber","padroes":["appbarber"]},
    {"nome":"Simples Agenda","padroes":["simplesagenda"]},
    {"nome":"Agenda Viva","padroes":["agendaviva.com.br"]},
    {"nome":"Gendo","padroes":["gendo.app","gendo.com.br"]},
    {"nome":"BelaSis","padroes":["belasis"]}
  ]$j$::jsonb,
  '{"cnpj_ativo": true, "cnpj_janela_dias": 120, "cnpj_ufs": [], "google_paginas": 3}'::jsonb
)
on conflict (slug) do update set pitch = excluded.pitch, nichos = excluded.nichos, concorrentes = excluded.concorrentes;

-- ---------------------------------------------------------------------
-- Pesos iniciais (palpite de especialista). Depois o Faro ajusta sozinho.
-- ---------------------------------------------------------------------
insert into public.pesos (produto_id, sinal, rotulo, descricao, peso_inicial, peso_atual)
select p.id, v.sinal, v.rotulo, v.descricao, v.peso, v.peso
  from public.produtos p,
  (values
    ('agenda_whatsapp',  'Agenda pelo WhatsApp',          'Tem botão/link de WhatsApp e nenhum sistema de agenda: dor clara de organização', 18),
    ('novo_negocio',     'Abriu há menos de 90 dias',     'Empresa nova está montando a operação agora: decide rápido', 16),
    ('estrutura_grande', 'Estrutura grande',              '150+ avaliações no Google: equipe e volume, precisa de gestão', 14),
    ('celular',          'Tem celular',                   'Dá para ligar e chamar no WhatsApp direto', 12),
    ('so_redes',         'Só Instagram / link na bio',    'Não tem site próprio: o agendamento hoje é na conversa', 12),
    ('estrutura_media',  'Estrutura média',               '40 a 149 avaliações: negócio rodando, com clientela', 8),
    ('sem_site',         'Sem site',                      'Nenhum endereço na web', 6),
    ('nota_alta',        'Nota alta (4,6+)',              'Negócio bem cuidado, que valoriza experiência', 6),
    ('mei',              'MEI',                           'Profissional que atende sozinha ou com pouca gente (plano Solo)', 0),
    ('pequeno',          'Poucas avaliações',             'Menos de 15 avaliações: pequeno ou começando', -2),
    ('agenda_online',    'Já agenda online',              'Tem alguma agenda online genérica', -4),
    ('nota_baixa',       'Nota baixa (< 4)',              'Pode estar com problema de atendimento', -4),
    ('so_fixo',          'Só telefone fixo',              'Sem celular: mais difícil de chegar no WhatsApp', -6),
    ('usa_concorrente',  'Usa concorrente',               'Já tem sistema: venda é de troca (use o script de concorrente)', -8),
    ('sem_contato',      'Sem telefone',                  'Não tem como ligar nem chamar', -40),
    ('fechado',          'Fechado no Google',             'Marcado como fechado no Google', -60)
  ) as v(sinal, rotulo, descricao, peso)
 where p.slug = 'tem-encaixe'
on conflict (produto_id, sinal) do nothing;

-- ---------------------------------------------------------------------
-- Alvos iniciais: 5 nichos × 10 grandes cidades (edite à vontade na tela Caçada)
-- ---------------------------------------------------------------------
insert into public.alvos (produto_id, nicho, consulta, cidade, uf, prioridade)
select p.id, n.chave, n.consulta, c.cidade, c.uf, c.prio
  from public.produtos p,
  (values ('salao','salão de beleza'),('barbearia','barbearia'),('esmalteria','esmalteria'),
          ('estetica','clínica de estética'),('sobrancelha','design de sobrancelhas')) as n(chave, consulta),
  (values ('São Paulo','SP',10),('Belo Horizonte','MG',9),('Rio de Janeiro','RJ',9),('Curitiba','PR',8),
          ('Goiânia','GO',8),('Brasília','DF',8),('Campinas','SP',7),('Porto Alegre','RS',7),
          ('Salvador','BA',6),('Recife','PE',6)) as c(cidade, uf, prio)
 where p.slug = 'tem-encaixe'
on conflict (produto_id, consulta, cidade, uf) do nothing;

-- ---------------------------------------------------------------------
-- Scripts
--   Variáveis: {saudacao} {contato} {negocio} {cidade} {nicho} {vendedor} {produto} {site} {concorrente}
--   Se uma variável estiver vazia (ex.: não sabemos o nome do dono), o Faro tira ela do texto.
-- ---------------------------------------------------------------------
insert into public.scripts (produto_id, nicho, canal, sinal, titulo, gatilho, corpo, ordem)
select p.id, v.nicho, v.canal, v.sinal, v.titulo, v.gatilho, v.corpo, v.ordem
  from public.produtos p,
  (values
  -- ============================ LIGAÇÃO ============================
  (null, 'ligacao', null, 'Ligação · Abertura padrão', null, $s$
{saudacao}, falo com o responsável pelo {negocio}?

[se sim]
Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Vou ser rápido, é coisa de um minuto, pode ser?

Hoje vocês marcam os horários como: pelo WhatsApp, caderno, algum aplicativo?

[escute — deixe falar]

Entendi. A gente fez o {produto} justamente pra isso: sua cliente agenda sozinha, a qualquer hora, por um link no Instagram ou no WhatsApp, escolhe o serviço e com quem quer fazer. E você não perde mais tempo respondendo "tem horário amanhã?" no meio do atendimento.

Faz sentido eu te mostrar em 10 minutinhos como fica com a cara do {negocio}? Tenho {opcao_horario_1} ou {opcao_horario_2}, qual fica melhor?

[se pedir pra mandar no WhatsApp]
Mando sim! Já te deixo o link pra testar grátis 7 dias. Posso te chamar amanhã pra ver o que achou?
$s$, 1),

  ('salao', 'ligacao', 'estrutura_grande', 'Ligação · Salão com equipe (gestão)', null, $s$
{saudacao}, falo com o dono ou a dona do {negocio}?

Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Vi que o {negocio} tem bastante movimento e avaliação boa no Google, parabéns!

Te liguei por um motivo: salão com equipe normalmente sofre com três coisas — agenda espalhada no WhatsApp de cada profissional, encaixe que dá conflito, e no fim do mês ninguém sabe ao certo quanto cada um vendeu. Isso acontece aí também?

[escute]

O {produto} junta tudo num lugar só: a cliente agenda sozinha pelo link, escolhe a profissional, o sistema não deixa marcar horário em cima de outro, e você tem um painel com o faturamento de cada pessoa da equipe.

Não é só agenda, é a gestão do salão. Te mostro em 15 minutos? Pode ser {opcao_horario_1} ou {opcao_horario_2}?
$s$, 2),

  (null, 'ligacao', 'novo_negocio', 'Ligação · Negócio recém-aberto', null, $s$
{saudacao}, falo com o {contato}? Aqui é o {vendedor}, do {produto}.

Vi que o {negocio} abriu há pouco tempo — parabéns pelo novo negócio!

Te liguei porque esse é o melhor momento pra organizar a agenda: antes de virar bagunça de print de WhatsApp. Como você está marcando as clientes hoje?

[escute]

Com o {produto} você começa já profissional: link de agendamento pra colocar na bio, a cliente escolhe o horário sozinha, paga o sinal no Pix se você quiser, e você acompanha o faturamento desde o primeiro mês.

Você pode testar 7 dias grátis, sem cartão. Quer que eu deixe tudo configurado com você agora, em 10 minutos?
$s$, 3),

  (null, 'ligacao', null, 'Ligação · Passou pela recepção', null, $s$
[Quando quem atende não é o dono]

{saudacao}! Tudo bem? Aqui é o {vendedor}. Qual seu nome?

[nome] Prazer! Quem cuida da agenda e das decisões aí do {negocio}?

[se for a própria recepção] Perfeito, então é com você mesmo! Vocês perdem muito tempo respondendo cliente pelo WhatsApp pra marcar horário?

[se for o dono e não estiver]
Qual o melhor horário pra eu falar com ele(a)? E qual o nome?
→ Registre o nome e marque "Pediu retorno" com o horário combinado.
$s$, 4),

  ('barbearia', 'ligacao', null, 'Ligação · Barbearia', null, $s$
Fala, {saudacao}! É da {negocio}? Quem fala é o {vendedor}, do {produto}. Falo com o dono?

Beleza, {contato}! Rapidinho: hoje o pessoal marca o corte com vocês como? Direto no WhatsApp?

[escute]

Então, a gente tem um sistema onde o cliente marca sozinho pelo link, escolhe o barbeiro e o horário, e você para de ficar no celular entre um corte e outro. Ainda mostra quanto cada barbeiro fez no mês.

Te mostro em 10 minutos como fica? Pode ser {opcao_horario_1}?
$s$, 5),

  -- ============================ WHATSAPP ============================
  (null, 'whatsapp', null, 'WhatsApp · Primeiro contato', null, $s$
{saudacao}, {contato}! Tudo bem? Aqui é o {vendedor}, do {produto} 👋

Vi o {negocio} e queria te fazer uma pergunta rápida: hoje vocês marcam os horários pelo WhatsApp mesmo?
$s$, 1),

  (null, 'whatsapp', 'agenda_whatsapp', 'WhatsApp · Quem agenda pelo WhatsApp', null, $s$
{saudacao}, {contato}! Aqui é o {vendedor}, do {produto}.

Vi que no {negocio} o agendamento é pelo WhatsApp. Funciona, né? Mas imagino a quantidade de "tem horário hoje?" que você responde no meio do atendimento 😅

A gente criou um link onde a sua cliente vê os horários livres e marca sozinha, 24h, com o serviço e a profissional que ela quiser. Você só recebe o agendamento pronto.

Posso te mandar um exemplo de como fica?
$s$, 2),

  (null, 'whatsapp', 'novo_negocio', 'WhatsApp · Recém-aberto', null, $s$
{saudacao}, {contato}! Parabéns pela abertura do {negocio}! 🎉

Aqui é o {vendedor}, do {produto}. Ajudo negócios que estão começando a já organizar agenda, clientes e faturamento desde o primeiro dia — sem planilha e sem print de conversa.

Você pode testar grátis por 7 dias. Quer que eu te mande o link?
$s$, 3),

  (null, 'whatsapp', 'usa_concorrente', 'WhatsApp · Já usa outro sistema', null, $s$
{saudacao}, {contato}! Aqui é o {vendedor}, do {produto}.

Vi que vocês já usam sistema de agenda ({concorrente}) — ótimo sinal, vocês já são organizados!

Pergunta sincera: tem alguma coisa nele que te incomoda? Preço, dificuldade da cliente pra marcar, falta de relatório da equipe?

Pergunto porque muita gente tem vindo pro {produto} por causa da gestão da equipe e do preço. Se fizer sentido, te mostro a diferença em 10 minutos.
$s$, 4),

  ('barbearia', 'whatsapp', null, 'WhatsApp · Barbearia', null, $s$
Fala, {contato}! Tudo certo? Aqui é o {vendedor}, do {produto} 💈

Pergunta rápida: na {negocio} o cliente marca o corte pelo WhatsApp ou já tem algum app?
$s$, 5),

  ('estetica', 'whatsapp', null, 'WhatsApp · Estética / clínica', null, $s$
{saudacao}, {contato}! Tudo bem? Meu nome é {vendedor}, sou do {produto}.

Trabalhamos com clínicas e estúdios de estética organizando agenda, histórico das clientes e pagamento antecipado por Pix — o que ajuda muito a reduzir faltas em procedimentos.

Hoje o agendamento do {negocio} é feito pelo WhatsApp?
$s$, 6),

  (null, 'whatsapp', null, 'WhatsApp · Depois de ligação sem resposta', null, $s$
{saudacao}, {contato}! Tentei te ligar agora há pouco, imagino que estava atendendo 🙂

Sou o {vendedor}, do {produto}. É rápido: ajudo salões a pararem de marcar horário pelo WhatsApp — a cliente agenda sozinha por um link.

Qual o melhor horário pra eu te ligar?
$s$, 7),

  -- ============================ FOLLOW-UP ============================
  (null, 'followup', null, 'Follow-up · 2 dias depois', null, $s$
{saudacao}, {contato}! Passando aqui de novo 🙂

Conseguiu ver minha mensagem sobre o agendamento do {negocio}? Se preferir, te mando um vídeo curtinho mostrando como sua cliente marcaria pelo link.
$s$, 1),

  (null, 'followup', null, 'Follow-up · Depois da demonstração', null, $s$
{contato}, obrigado pelo tempo hoje!

Como combinamos, aqui está o link pra você criar a conta e testar 7 dias grátis: {site}

Se quiser, eu configuro os serviços e a equipe com você por vídeo chamada. Qual horário amanhã fica bom?
$s$, 2),

  (null, 'followup', null, 'Follow-up · Teste grátis acabando', null, $s$
{saudacao}, {contato}! Seu teste do {produto} termina em breve.

Como está sendo? Suas clientes já marcaram pelo link?

Pra continuar sem perder nada do que você configurou, é só escolher o plano — e no anual você paga 10 meses e leva 12. Posso te ajudar a escolher o melhor pra sua equipe?
$s$, 3),

  (null, 'followup', null, 'Follow-up · Última tentativa', null, $s$
{contato}, não quero ser chato 🙂 Essa é minha última mensagem.

Se em algum momento organizar a agenda e a equipe do {negocio} virar prioridade, é só me chamar aqui. Sucesso por aí!
$s$, 4),

  -- ============================ OBJEÇÕES ============================
  (null, 'objecao', null, 'Objeção · Já uso outro sistema', 'Já uso o Trinks / outro app', $s$
Que bom que vocês já usam sistema — significa que vocês já sabem o valor de ter a agenda organizada.

Posso te perguntar: o que você mais gosta nele? E o que mais te incomoda?

[escute — a resposta mostra onde atacar]

O que tem feito as pessoas trocarem pro {produto} é: preço por tamanho da equipe (não por profissão), o painel de quanto cada profissional vendeu, e a cliente conseguir marcar sem baixar aplicativo. Vale você testar 7 dias lado a lado, sem compromisso.
$s$, 1),

  (null, 'objecao', null, 'Objeção · Tá caro', 'Tá caro / não tenho dinheiro agora', $s$
Entendo total. Deixa eu te perguntar uma coisa: quantas clientes você acha que deixam de marcar porque você demorou pra responder no WhatsApp?

Se o {produto} trouxer UMA cliente a mais por mês, ele já se pagou. O plano Solo sai R$79 por mês — menos de R$3 por dia.

E você não precisa decidir agora: testa 7 dias grátis e vê se as clientes usam.
$s$, 2),

  (null, 'objecao', null, 'Objeção · WhatsApp funciona', 'Agendo pelo WhatsApp e funciona', $s$
Funciona mesmo — o problema é o preço escondido dele: você para o atendimento pra responder, esquece de anotar, marca duas pessoas no mesmo horário, e a cliente que manda mensagem às 23h fica sem resposta e marca em outro lugar.

Com o link, ela marca sozinha na hora que quiser e você continua usando o WhatsApp pra conversar — só não precisa mais ser a sua secretária.
$s$, 3),

  (null, 'objecao', null, 'Objeção · Minhas clientes não usam app', 'Minhas clientes são mais velhas / não vão usar', $s$
Ótima preocupação. Por isso o {produto} não é aplicativo pra baixar: é um link que abre no navegador do celular, igual abrir uma foto no WhatsApp. Ela clica, escolhe o horário e pronto.

E quem preferir continuar chamando no WhatsApp, você mesma lança no sistema em segundos. Ninguém é obrigado a mudar.
$s$, 4),

  (null, 'objecao', null, 'Objeção · Sem tempo agora', 'Não tenho tempo agora', $s$
Sem problema, sei que você está atendendo! Quando é o melhor horário pra eu te ligar 10 minutos — no fim do dia ou amanhã cedo?

→ Marque "Pediu retorno" com o horário que ela disser.
$s$, 5),

  (null, 'objecao', null, 'Objeção · Vou pensar', 'Vou pensar / depois eu vejo', $s$
Claro! Só pra eu entender: o que ficou de dúvida? É o preço, se as clientes vão usar ou o trabalho de configurar?

[escute]

Faz assim: eu crio a conta com você agora, você testa 7 dias sem pagar nada e sem cartão. Se não fizer diferença no seu dia, é só não continuar.
$s$, 6),

  (null, 'objecao', null, 'Objeção · Manda pelo WhatsApp', 'Me manda por WhatsApp', $s$
Mando sim! Pra eu te mandar o que faz sentido pra você, me fala rapidinho: quantas pessoas atendem aí com você?

[resposta] Perfeito. Te mando o link e um vídeo curto. Posso te chamar amanhã às {opcao_horario_1} pra ver o que achou?

→ Envie o script de WhatsApp e marque "Mensagem enviada".
$s$, 7),

  (null, 'objecao', null, 'Objeção · Já tentei e não deu certo', 'Já tentei sistema e não deu certo', $s$
Que pena — o que aconteceu? Era difícil de configurar, as clientes não usaram, ou ficou caro?

[escute]

A gente pensou exatamente nisso: você configura tudo pelo celular em poucos minutos, a cliente não precisa baixar nada, e eu acompanho você na primeira semana. Se não funcionar no teste, você não paga nada.
$s$, 8)
  ) as v(nicho, canal, sinal, titulo, gatilho, corpo, ordem)
 where p.slug = 'tem-encaixe'
   and not exists (select 1 from public.scripts s where s.produto_id = p.id and s.titulo = v.titulo);

select public.pontuar(id) from public.produtos where slug = 'tem-encaixe';
