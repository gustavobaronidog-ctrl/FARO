-- =====================================================================
--  FARO · 03 · Roteiros SPIN + gravação de ligações + treino com IA
--  Rode depois do 01 e do 02, no SQL Editor do Supabase.
--  Pode rodar de novo quantas vezes quiser: não duplica nada e não apaga nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ligações gravadas e a análise da IA
-- ---------------------------------------------------------------------
create table if not exists public.ligacoes (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  produto_id    uuid not null references public.produtos(id) on delete cascade,
  usuario       uuid references public.perfis(id) on delete set null default auth.uid(),
  audio_path    text not null,                 -- caminho no armazenamento "gravacoes"
  duracao_seg   int,
  origem        text not null default 'arquivo' check (origem in ('arquivo','microfone','computador')),
  status        text not null default 'enviada' check (status in ('enviada','transcrevendo','analisando','pronta','erro')),
  erro          text,
  transcricao   jsonb,                         -- [{quem:'vendedor'|'cliente', inicio:'mm:ss', texto}]
  analise       jsonb,                         -- nota, SPIN, pontos fortes e fracos, próximos passos
  nota          numeric(3,1),                  -- 0 a 10 (cópia da análise, para gráficos rápidos)
  fala_vendedor int,                           -- % das palavras ditas pelo vendedor
  criado_em     timestamptz not null default now(),
  analisado_em  timestamptz
);
create index if not exists ligacoes_lead_ix    on public.ligacoes (lead_id, criado_em desc);
create index if not exists ligacoes_usuario_ix on public.ligacoes (usuario, criado_em desc);

alter table public.ligacoes enable row level security;
drop policy if exists faro_ligacoes on public.ligacoes;
create policy faro_ligacoes on public.ligacoes for all using (public.eh_membro()) with check (public.eh_membro());
grant select, insert, update, delete on public.ligacoes to authenticated;
grant all on public.ligacoes to service_role;

-- ---------------------------------------------------------------------
-- 2. Armazenamento privado dos áudios (só quem é da equipe ouve)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gravacoes', 'gravacoes', false, 52428800, array['audio/wav','audio/x-wav','audio/wave'])
on conflict (id) do nothing;

drop policy if exists faro_gravacoes_ler    on storage.objects;
drop policy if exists faro_gravacoes_enviar on storage.objects;
drop policy if exists faro_gravacoes_apagar on storage.objects;
create policy faro_gravacoes_ler    on storage.objects for select to authenticated using (bucket_id = 'gravacoes' and public.eh_membro());
create policy faro_gravacoes_enviar on storage.objects for insert to authenticated with check (bucket_id = 'gravacoes' and public.eh_membro());
create policy faro_gravacoes_apagar on storage.objects for delete to authenticated using (bucket_id = 'gravacoes' and public.eh_membro());

-- ---------------------------------------------------------------------
-- 3. Roteiros SPIN de ligação (Tem Encaixe)
--    S = Situação · P = Problema · I = Implicação · N = Necessidade
--    O cliente chega sozinho à conclusão de que está perdendo dinheiro.
--    Linhas entre [colchetes] e começando com → são instruções para você (não se fala).
-- ---------------------------------------------------------------------
insert into public.scripts (produto_id, nicho, canal, sinal, titulo, gatilho, corpo, ordem)
select p.id, v.nicho, 'ligacao', v.sinal, v.titulo, null, trim(v.corpo), v.ordem
  from public.produtos p,
  (values
  -- ============================ TODOS OS NICHOS ============================
  (null, null, 'SPIN · Ligação completa', $s$
{saudacao}, falo com o responsável pelo {negocio}?

[se for a pessoa certa]
Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Te roubo dois minutinhos?
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?

[S · SITUAÇÃO — descubra como funciona hoje. Pergunte e escute, não venda nada ainda.]
Me conta uma coisa: hoje as clientes marcam horário com vocês como? WhatsApp, ligação, Instagram?
E quem responde essas mensagens, você ou alguém da equipe?
Quantas pessoas atendem aí hoje?
→ Anote os números que ele falar. Você vai usar daqui a pouco.

[P · PROBLEMA — faça ele falar da dor com as palavras dele.]
E responder WhatsApp no meio de um atendimento, atrapalha?
Já aconteceu de marcar duas pessoas no mesmo horário?
E cliente que marca e não aparece, acontece?
→ Se ele disser "às vezes", pergunte: "e quando acontece, o que você faz?"

[I · IMPLICAÇÃO — o coração da ligação. Ele mesmo calcula o prejuízo. Você não afirma, você pergunta.]
Quando alguém falta, aquele horário fica vazio ou dá pra encaixar outra pessoa?
Mais ou menos quantas vezes isso acontece numa semana?
E um atendimento aí sai por quanto, em média?
→ Faça a conta em voz alta junto com ele: "então umas X faltas por semana, a R$ Y… quanto dá no fim do mês?"
→ Fique em silêncio e deixe o número pesar.
E as mensagens que chegam enquanto você está atendendo… já teve cliente que cansou de esperar resposta e foi marcar em outro lugar?

[N · NECESSIDADE — ele diz que quer resolver. Você só pergunta.]
Se esses horários vazios voltassem a ser ocupados, o que mudaria pra você no fim do mês?
E se a cliente marcasse sozinha, a qualquer hora, sem você parar o atendimento pra responder, ajudaria?
→ Só apresente depois que ele disser algo como "ajudaria muito".

[APRESENTAÇÃO — curta e ligada ao que ELE falou]
Então, é exatamente isso que o {produto} resolve. A cliente agenda sozinha pelo link no Instagram ou no WhatsApp, 24 horas, escolhe o serviço e com quem quer fazer. O sistema não deixa marcar em cima de outro horário, e você pode pedir um sinal no Pix pra segurar quem costuma faltar.

[FECHAMENTO — duas opções de horário, nunca "você quer?"]
Te mostro em 10 minutos como fica com a cara do {negocio}. Pra você é melhor {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ SALÃO ============================
  ('salao', null, 'SPIN · Salão de beleza', $s$
{saudacao}, falo com o dono ou a dona do {negocio}?

[se for a pessoa certa]
Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Te roubo dois minutinhos?
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?

[S · SITUAÇÃO — entenda a operação do salão]
Quantas profissionais trabalham aí com você hoje?
Cada uma cuida da própria agenda ou vem tudo pra um WhatsApp só?
E no fim do mês, como você fecha quanto cada uma atendeu? Caderno, planilha?

[P · PROBLEMA]
E dá trabalho juntar tudo isso no fim do mês?
Já aconteceu de duas profissionais marcarem a mesma cliente, ou de a cliente chegar e o horário não estar anotado?
E cliente que marca e falta?

[I · IMPLICAÇÃO — ele calcula, você pergunta]
Quando uma cliente falta, quanto tempo da profissional fica parado? Uma hora, duas?
E isso acontece quantas vezes por semana, somando a equipe toda?
Quanto é um serviço médio aí? Escova, coloração…
→ Faça a conta junto: "então são umas X faltas, a R$ Y… dá R$ Z por mês saindo pela porta."
E aquelas clientes que vinham todo mês e sumiram… você consegue saber quem são pra chamar de volta?
→ Silêncio. Deixe ele perceber que não sabe.

[N · NECESSIDADE]
Se você tivesse na tela quem faltou, quem sumiu e quanto cada profissional faturou, o que você faria de diferente?
E se a cliente marcasse sozinha, já escolhendo a profissional, quanto tempo de WhatsApp isso te devolveria por dia?

[APRESENTAÇÃO]
O {produto} junta isso tudo num lugar só. A cliente agenda sozinha pelo link e escolhe a profissional, o sistema não deixa marcar horário em cima de outro, você pode pedir sinal no Pix, e tem um painel com o faturamento de cada uma e a lista de quem sumiu pra chamar de volta.
Não é só uma agenda, é a gestão do salão.

[FECHAMENTO]
Te mostro em 15 minutos como fica com a equipe do {negocio}. Fica melhor {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ BARBEARIA ============================
  ('barbearia', null, 'SPIN · Barbearia', $s$
Fala, {saudacao}! É da {negocio}? Aqui é o {vendedor}, do {produto}. Falo com o dono?

[se for a pessoa certa]
Beleza, {contato}! Coisa rápida, dois minutos.
[se estiver gravando] Só te aviso que gravo minhas ligações pra melhorar o atendimento, tranquilo?

[S · SITUAÇÃO]
Quantos barbeiros tão cortando aí hoje?
O cliente marca como, chama no WhatsApp da barbearia ou direto no de cada barbeiro?

[P · PROBLEMA]
E pra responder o WhatsApp no meio do corte, como fica? Para a máquina e pega o celular?
Cliente que marca e não aparece, rola muito?

[I · IMPLICAÇÃO]
Quando o cara fura, a cadeira fica parada quanto tempo?
Quantas vezes isso acontece numa semana, somando todo mundo?
E um corte com barba sai por quanto aí?
→ Faça a conta junto: "umas X furadas, a R$ Y… dá quanto no mês?"
E quem manda mensagem enquanto vocês estão cortando, demora pra ter resposta… já viu cliente que acabou indo em outra barbearia por causa disso?

[N · NECESSIDADE]
Se o cliente marcasse sozinho, escolhendo o barbeiro e o horário, sem ninguém largar a máquina, ajudaria?
E se a cadeira que fica vazia por falta fosse ocupada, quanto isso mudava no seu mês?

[APRESENTAÇÃO]
Então, o {produto} faz isso. O cliente marca pelo link, escolhe o barbeiro e o horário, não tem como marcar dois no mesmo horário, e dá pra cobrar um sinal no Pix de quem costuma furar. Ainda mostra quanto cada barbeiro fez no mês.

[FECHAMENTO]
Te mostro em 10 minutos como fica com a cara da {negocio}. Pode ser {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ ESMALTERIA ============================
  ('esmalteria', null, 'SPIN · Esmalteria e nail', $s$
{saudacao}, falo com a responsável pelo {negocio}?

[se for a pessoa certa]
Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Te roubo dois minutinhos?
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?

[S · SITUAÇÃO]
Você atende sozinha ou tem mais manicures com você?
As clientes marcam como? Pelo WhatsApp?
Um alongamento ou uma manutenção leva quanto tempo mais ou menos?

[P · PROBLEMA]
E com a mão ocupada, com gel, com a mão da cliente na sua… dá pra responder o WhatsApp?
Então as mensagens ficam esperando até você terminar?
Cliente que marca e não aparece, acontece?

[I · IMPLICAÇÃO]
Se uma manutenção leva umas duas horas e a cliente falta, são duas horas paradas, né? Quanto você cobra nesse serviço?
Quantas vezes por mês acontece isso?
→ Faça a conta junto com ela e deixe ela falar o valor.
E quem manda mensagem às 10 da manhã e só recebe resposta de tarde… ela espera, ou marca com outra pessoa?

[N · NECESSIDADE]
Se a cliente pudesse ver seus horários livres e marcar sozinha, sem você soltar o pincel, ia te ajudar?
E se quem costuma faltar tivesse que pagar um sinal antes, você acha que elas faltariam menos?

[APRESENTAÇÃO]
É isso que o {produto} faz. Você coloca um link no Instagram, a cliente vê os horários livres e marca sozinha, a qualquer hora. Dá pra cobrar sinal no Pix, e o sistema não deixa marcar em cima de outro horário.

[FECHAMENTO]
Te mostro em 10 minutinhos como fica com a cara do {negocio}. Fica melhor {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ ESTÉTICA ============================
  ('estetica', null, 'SPIN · Estética e clínica', $s$
{saudacao}, falo com o responsável pelo {negocio}?

[se for a pessoa certa]
Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Te roubo dois minutinhos?
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?

[S · SITUAÇÃO]
Quais procedimentos saem mais aí hoje?
Os agendamentos chegam como? WhatsApp, Instagram, telefone?
Muita cliente faz pacote ou sessões seguidas?

[P · PROBLEMA]
Já aconteceu de a paciente faltar numa sessão e bagunçar a sequência do tratamento?
E a confirmação na véspera, alguém fica mandando mensagem uma por uma?
Cliente que fez um procedimento uma vez e não voltou mais, você consegue acompanhar?

[I · IMPLICAÇÃO]
Um procedimento aí sai por quanto em média?
Quando alguém falta, aquele horário consegue ser preenchido ou fica vazio?
Quantas faltas dessas por mês, mais ou menos?
→ Faça a conta junto. Em estética o valor por horário é alto, então o número costuma assustar.
E das clientes que não voltaram depois da primeira sessão… se uma parte delas voltasse, quanto seria isso?

[N · NECESSIDADE]
Se a paciente tivesse que deixar um sinal pra garantir o horário, você acha que as faltas diminuiriam?
E ter a lista de quem não voltou, pra chamar de novo, ajudaria nas suas vendas?

[APRESENTAÇÃO]
O {produto} faz isso. A cliente agenda sozinha pelo link, você pode pedir sinal no Pix pra garantir o horário, e tem a ficha de cada cliente, inclusive de quem sumiu, pra chamar de volta.

[FECHAMENTO]
Te mostro em 15 minutos como fica pro {negocio}. Fica melhor {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ SOBRANCELHA E CÍLIOS ============================
  ('sobrancelha', null, 'SPIN · Sobrancelha e cílios', $s$
{saudacao}, falo com a {contato}, do {negocio}?

[se for a pessoa certa]
Prazer! Aqui é o {vendedor}, do {produto}. Te roubo dois minutinhos?
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?

[S · SITUAÇÃO]
Você atende mais design de sobrancelha ou extensão de cílios?
A manutenção das clientes é de quanto em quanto tempo? 15, 20 dias?
E como elas marcam, pelo WhatsApp?

[P · PROBLEMA]
E pra lembrar cada cliente que está na hora da manutenção, você faz isso na mão?
Já perdeu cliente porque ela passou do tempo e acabou fazendo com outra?

[I · IMPLICAÇÃO]
Quantas clientes fixas você tem mais ou menos?
Se uma parte delas atrasa ou some sem você perceber… quantas você acha que deixam de voltar num mês?
E cada manutenção sai por quanto?
→ Faça a conta junto: cliente fixa que some é dinheiro que se repetia todo mês.

[N · NECESSIDADE]
Se você tivesse na tela quem está atrasada na manutenção, pra chamar na hora certa, quantas clientes você acha que recuperaria?
E se ela já pudesse marcar a próxima sozinha, pelo link, ajudaria?

[APRESENTAÇÃO]
O {produto} faz isso. A cliente marca sozinha pelo link no Instagram, a qualquer hora, e você tem a ficha de cada uma, com quem sumiu, pra chamar de volta. E dá pra pedir sinal no Pix pra quem costuma faltar.

[FECHAMENTO]
Te mostro em 10 minutos como fica pro {negocio}. Pode ser {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ JÁ USA CONCORRENTE ============================
  (null, 'usa_concorrente', 'SPIN · Já usa outro sistema', $s$
{saudacao}, falo com o responsável pelo {negocio}?

[se for a pessoa certa]
Prazer, {contato}! Aqui é o {vendedor}, do {produto}. Te roubo dois minutinhos?
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?
→ Não fale mal do {concorrente}. Elogie que ele já é organizado e deixe ele mesmo apontar o que falta.

[S · SITUAÇÃO]
Vi que vocês já usam o {concorrente}, né? Faz quanto tempo?
Quem usa no dia a dia, você ou a equipe toda?
E o que você mais usa nele?

[P · PROBLEMA]
E tem alguma coisa nele que te incomoda? Preço, a cliente achar difícil de marcar, falta algum relatório?
Tem alguma coisa que você ainda faz por fora, no caderno ou na planilha?

[I · IMPLICAÇÃO]
E esse "por fora" toma quanto tempo seu por semana?
Quanto vocês pagam hoje por mês nele?
→ Se ele reclamou de algo, aprofunde: "e por causa disso, o que acaba acontecendo?"
E das clientes que chegam no link e desistem no meio, você consegue saber quantas são?

[N · NECESSIDADE]
Se você tivesse isso resolvido, pelo mesmo preço ou menos, valeria olhar?
O que precisaria ter pra você trocar sem dor de cabeça?

[APRESENTAÇÃO — responda só ao que ele reclamou]
Então, muita gente tem vindo pro {produto} justamente por isso: a gestão da equipe, o faturamento de cada profissional e a lista de quem sumiu ficam no mesmo painel da agenda.

[FECHAMENTO]
Te mostro a diferença em 10 minutos, lado a lado com o que você já usa. Fica melhor {opcao_horario_1} ou {opcao_horario_2}?
$s$, 0),

  -- ============================ RECÉM-ABERTO ============================
  (null, 'novo_negocio', 'SPIN · Negócio recém-aberto', $s$
{saudacao}, falo com o {contato}? Aqui é o {vendedor}, do {produto}.
Vi que o {negocio} abriu há pouco tempo. Parabéns pelo novo negócio!
[se estiver gravando] Só te aviso que eu gravo minhas ligações pra melhorar meu atendimento, tudo bem?

[S · SITUAÇÃO]
Como está o movimento nesse começo?
E as clientes estão marcando como, pelo WhatsApp?
Você está atendendo sozinha ou já tem gente com você?

[P · PROBLEMA]
E dá pra dar conta de responder tudo e ainda atender?
Você já está anotando o que entra de dinheiro, ou fica pra depois?

[I · IMPLICAÇÃO — leve ele pro futuro]
Se o movimento dobrar nos próximos meses, que é o que você quer, como fica esse WhatsApp?
E se você contratar mais uma profissional, como vai saber quanto cada uma atendeu?
→ Deixe ele imaginar a bagunça. Negócio novo decide rápido quando enxerga o problema antes de ele chegar.

[N · NECESSIDADE]
Não seria mais fácil já começar organizado, em vez de arrumar a casa depois que ela bagunçar?
Se a cliente já marcasse sozinha desde o primeiro mês, como seria seu dia?

[APRESENTAÇÃO]
É isso que o {produto} faz. Você já começa com um link de agendamento pra bio do Instagram, a cliente marca sozinha, paga o sinal no Pix se você quiser, e você vê o faturamento desde o primeiro mês.

[FECHAMENTO]
Você pode testar 7 dias grátis. Quer que eu deixe tudo configurado com você agora, ou prefere {opcao_horario_1}?
$s$, 0)
  ) as v(nicho, sinal, titulo, corpo, ordem)
 where p.slug = 'tem-encaixe'
   and not exists (select 1 from public.scripts s where s.produto_id = p.id and s.titulo = v.titulo);
