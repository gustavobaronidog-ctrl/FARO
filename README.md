# Faro · prospecção ativa inteligente

O Faro acha negócios que precisam do que você vende, dá uma nota de 0 a 100 para cada um (a "temperatura"),
monta a sua fila do dia, entrega o script certo e aprende com cada resultado que você registra.

Ele serve para qualquer produto: cada um (Tem Encaixe, o app de mercado, os próximos) tem o próprio espaço,
com cliente ideal, sinais, scripts e aprendizado separados. Nada se mistura.

## O que tem dentro

| Tela | Para que serve |
|---|---|
| **Hoje** | Sua fila de ataque: primeiro os retornos combinados, depois os leads mais quentes. Números do dia e meta de contatos. |
| **Sessão de ataque** | Um lead por vez, script do lado, resultado com as teclas 1 a 0. O próximo passo é agendado sozinho. |
| **Radar** | Todos os leads, com filtros por temperatura, nicho, sinal, cidade, estado e origem. |
| **Funil** | Arrastar entre Tentando, Conversando, Demonstração, Em teste, Fechado e Perdido. |
| **Scripts** | Roteiros por nicho e por situação (ligação, WhatsApp, follow-up, objeções), com a taxa de sucesso de cada um. |
| **Caçada** | Onde os robôs procuram (nicho × cidade), cota grátis do Google, empresas recém-abertas da Receita. |
| **Aprendizado** | Quanto vale cada sinal hoje, o que está convertendo por nicho/estado/origem, motivos de perda. |
| **Ajustes** | Produtos e cliente ideal, equipe, limites. |

**De onde vêm os leads (tudo gratuito):**
1. **Google Maps** (API Places): todo dia às 6h o robô busca nas praças que você escolheu. Cota grátis de 1.000 buscas/mês, cada uma com até 20 negócios. O Faro para sozinho antes de estourar.
2. **Receita Federal** (dados abertos do CNPJ): todo dia 18, o GitHub baixa a base pública e traz quem **abriu empresa** nos últimos 120 dias nas atividades do produto (salão = CNAE 9602-5/01 e 9602-5/02). Empresa nova é o lead mais quente que existe.
3. **Leitor de sinais**: abre o site/link da bio de cada lead e descobre se agenda pelo WhatsApp, se usa concorrente (Trinks, Booksy, Avec…), Instagram, e-mail.
4. **Manual / indicação**: botão "+ Lead".

**Como ele aprende:** cada resultado que você marca (não atendeu, interessado, fechou…) vira dado. Toda madrugada o Faro roda uma regressão logística que olha todos os sinais juntos e recalcula quanto cada um vale. Com poucos resultados, vale o palpite inicial; com muitos, vale o que os números mostram. Ele também descobre sozinho quais nichos, estados e origens convertem mais.

**IA (Gemini, camada gratuita):** dossiê do lead com pesquisa na internet antes de ligar, mensagem de WhatsApp personalizada, resposta para objeção na hora, e resposta quando o lead te responde.

---

## Instalação (uns 40 minutos, uma vez só)

Nada aqui mexe no Tem Encaixe ou no app de mercado. É um projeto novo, com banco novo.

### 1. Banco de dados (Supabase)

1. Entre em [supabase.com](https://supabase.com) → **New project**. Nome: `faro`. Região: **South America (São Paulo)**. Guarde a senha do banco.
   - O plano grátis permite 2 projetos por organização. Se você já tem 2, crie uma organização nova só para o Faro.
2. Menu **SQL Editor** → **New query** → cole o conteúdo inteiro de `supabase/01_estrutura.sql` → **Run**.
3. Nova query → cole `supabase/02_tem_encaixe.sql` → **Run**. (Isso cria o espaço do Tem Encaixe com nichos, pesos, 50 praças e 24 scripts.)
4. Menu **Authentication → Sign In / Providers → Email**: desligue **Confirm email** (assim você entra direto, sem esperar e-mail).
5. Menu **Project Settings → API Keys**: copie e guarde
   - **Project URL** (fica em Project Settings → Data API, ou no botão **Connect**)
   - **Publishable key** (começa com `sb_publishable_`)
   - **Secret key** (começa com `sb_secret_`; é secreta: só vai na Vercel e no GitHub)
   - Projeto antigo com chaves `anon`/`service_role` (começam com `eyJ`) também funciona.

### 2. Chave do Google Maps (grátis, mas o Google pede cartão)

1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto `faro`.
2. **APIs e serviços → Biblioteca** → procure **Places API (New)** → **Ativar**.
3. O Google exige uma conta de faturamento com cartão mesmo para usar o grátis. Cadastre.
4. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**. Clique na chave → **Restrições de API** → marque só **Places API (New)** → Salvar. Copie a chave.
5. **Trava de segurança (recomendado):** em **APIs e serviços → Places API (New) → Cotas**, procure a cota diária de requisições do *Text Search* e mude para **33**. Assim, mesmo que algo dê errado, nunca passa da cota grátis. Em **Faturamento → Orçamentos e alertas**, crie um alerta de R$ 1.

### 3. Chave da IA (Gemini, grátis, sem cartão)

[aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key** → copie.

### 4. GitHub

Crie um repositório **privado** chamado `faro` e envie todos os arquivos desta pasta (pode arrastar no navegador em *Add file → Upload files*).

Depois, no repositório: **Settings → Secrets and variables → Actions → New repository secret**, crie:
- `SUPABASE_URL` = Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = Secret key (`sb_secret_...`)

### 5. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório `faro`.
2. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_...`) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_...`) |
| `GOOGLE_PLACES_API_KEY` | chave do Google |
| `GEMINI_API_KEY` | chave do Gemini |
| `CRON_SECRET` | qualquer senha longa inventada (ex.: 40 letras e números) |

3. **Deploy**. A Vercel já agenda os robôs sozinha (arquivo `vercel.json`): caçada às 6h e leitura de sinais às 12h (horário de Brasília).

### 6. Primeiro acesso

1. Abra o endereço que a Vercel deu → **Criar conta**. A primeira conta vira **administrador**.
2. Vá em **Caçada → Caçar agora**. Em uns 40 segundos aparecem os primeiros leads.
3. No GitHub: **Actions → Radar CNPJ → Run workflow** para puxar as empresas recém-abertas agora (demora de 30 a 90 minutos; depois roda sozinho todo mês).
4. Em **Ajustes**, confira seu nome (ele entra nos scripts como `{vendedor}`) e sua meta de contatos por dia.

---

## Rotina diária

1. Abra o **Hoje**. Os retornos vencidos aparecem primeiro, em vermelho.
2. **Começar sessão de ataque.** Ligue, leia o script, marque o resultado com uma tecla. Ele pula para o próximo.
3. No WhatsApp, o botão verde já abre a conversa com a mensagem certa para aquele lead.
4. Antes de ligar para um lead grande, use **Dossiê antes de ligar**.
5. Quando ouvir uma objeção nova, digite em **Objeções → Como respondo?**.

**Ligar pelo computador:** no Windows, abra **Vincular ao Celular** e pareie o celular (Android; iPhone só no Windows 11). Depois, em **Configurações → Aplicativos → Aplicativos padrão**, procure **TEL** e escolha Vincular ao Celular. No Mac, o FaceTime liga pelo iPhone. No celular, liga direto.

**App no celular:** abra o endereço do Faro no celular. iPhone (Safari): Compartilhar → **Adicionar à Tela de Início**. Android (Chrome): menu ⋮ → **Instalar app**. Ele abre em tela cheia, com ícone próprio.

**IA:** a chave grátis do Gemini não libera pesquisa no Google; o dossiê é feito com os dados do lead e avisa o que conferir.

## Para colocar outro produto (ex.: app de mercado)

**Ajustes → Novo produto**: nome, o que ele resolve (a IA usa esse texto), nichos com as buscas do Google e os CNAEs (supermercado: 4711302; minimercado e mercearia: 4712100), concorrentes. Depois **Caçada → Adicionar praças** e **Scripts → Novo script**.

## Equipe

Quem se cadastrar no link do Faro fica **pendente** e não vê nada até você liberar em **Ajustes → Equipe**. Cada atividade fica registrada com o nome de quem fez.

## Limites (para não ter surpresa)

| Item | Limite grátis | O que o Faro faz |
|---|---|---|
| Google Places | 1.000 buscas/mês | Para em 950/mês e 30/dia (ajustável em Ajustes) |
| Google por busca | 60 resultados (3 páginas) | Em cidade grande, adicione bairros como praça |
| Supabase | 500 MB, pausa após 7 dias sem uso | Os robôs diários mantêm ativo; leads frios sem contato há 6 meses são apagados |
| Vercel Hobby | robôs 1x/dia | Botões "Caçar agora" para rodar na hora |
| Gemini | limite por minuto | Se estourar, a tela avisa para tentar em 1 minuto |
| GitHub Actions | 2.000 min/mês (repositório privado) | A importação mensal usa uns 60–90 min |

**Instagram:** o Instagram bloqueia leitura automática, então o Faro não lê o perfil; ele usa o link do Google, o site e o Linktree. O dossiê da IA pesquisa o Instagram pelo Google.

## Cuidados (LGPD)

Os dados vêm de fontes públicas (Google Maps e Receita Federal) e são usados para contato comercial com empresas. Sempre se identifique, e quando alguém pedir para não ser contatado, use **Não ligar mais**: o número entra numa lista que bloqueia para todos os produtos e o robô nunca mais traz esse contato.

## Para desenvolvedores

- `supabase/` banco (tabelas, segurança por linha, pontuação, cadência, aprendizado)
- `api/` funções da Vercel: `cron.js` (rotina diária), `acao.js` (botões dos robôs), `ia.js` (Gemini)
- `api/_lib/modelo.js` regressão logística com prior gaussiano no palpite inicial
- `scripts/cnpj/importar.py` importador da Receita (só biblioteca padrão do Python)
- `src/` interface React
- `test/tudo.sh` roda todos os testes, inclusive o de ponta a ponta no navegador (`test/e2e/`)
