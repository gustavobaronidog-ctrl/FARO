"""Jornada completa no navegador (Chromium), contra o Faro rodando localmente (test/e2e/servidor.mjs).
Faz tudo que você vai fazer no dia a dia e falha se aparecer QUALQUER erro: na tela, no console,
numa chamada ao banco ou numa função da Vercel."""
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

APP = "http://127.0.0.1:8790"
FOTOS = os.environ.get("FOTOS", "/tmp/claude-0/e2e-fotos"); os.makedirs(FOTOS, exist_ok=True)
ADMIN = ("gustavo@faro.test", "senha-forte-123", "Gustavo")
VEND = ("ana@faro.test", "outra-senha-456", "Ana Vendedora")
problemas, passos = [], []

def passo(nome):
    passos.append(nome); print("  ✓", nome, flush=True)

def vigiar(pg, rotulo):
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL" not in m.text and problemas.append(f"[{rotulo}] console: {m.text[:300]}"))
    pg.on("pageerror", lambda e: problemas.append(f"[{rotulo}] erro de página: {e}"))
    def resp(r):
        if r.status >= 400 and "fonts.g" not in r.url and not getattr(pg, "_erro_esperado", False):
            problemas.append(f"[{rotulo}] HTTP {r.status} {r.request.method} {r.url[:160]}")
    pg.on("response", resp)
    pg.add_init_script("""new MutationObserver(() => document.querySelectorAll('.toast.erro').forEach(t => {
      if (!t.dataset.visto) { t.dataset.visto = 1; console.error('TOAST DE ERRO: ' + t.textContent); } })).observe(document, {subtree: true, childList: true});""")

def toast_ok(pg, trecho=None, t=20000):
    loc = pg.locator(".toast:not(.erro)") if not trecho else pg.locator(".toast:not(.erro)", has_text=trecho)
    loc.first.wait_for(timeout=t)
    return loc.first.inner_text()

def cadastrar(pg, email, senha, nome):
    pg.goto(APP + "/"); pg.get_by_text("Primeira vez? Criar conta").click()
    pg.get_by_label("Seu nome").fill(nome); pg.get_by_label("E-mail").fill(email); pg.get_by_label("Senha").fill(senha)
    pg.get_by_role("button", name="Criar conta", exact=True).click()

def entrar(pg, email, senha):
    pg.goto(APP + "/"); pg.get_by_label("E-mail").fill(email); pg.get_by_label("Senha").fill(senha)
    pg.get_by_role("button", name="Entrar", exact=True).click()

def sair(pg):
    pg.goto(APP + "/#/ajustes"); pg.get_by_role("button", name="Sair").first.click()
    pg.get_by_label("E-mail").wait_for()

def ir(pg, rota, titulo):
    pg.goto(APP + "/#/" + rota); pg.get_by_role("heading", name=titulo, exact=False).first.wait_for(timeout=15000); pg.wait_for_timeout(500)

import atexit
_pagina_atual = []
def _foto_falha():
    for x in _pagina_atual[-1:]:
        try: x.screenshot(path=f"{FOTOS}/FALHA.png")
        except Exception: pass
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    pg = ctx.new_page(); vigiar(pg, "pc"); _pagina_atual.append(pg)
    pg.on("popup", lambda pop: pop.close())

    # 1. primeira conta vira admin
    cadastrar(pg, *ADMIN)
    pg.get_by_text(re.compile(r"(Bom dia|Boa tarde|Boa noite), Gustavo")).wait_for(timeout=15000)
    passo("cadastro do Gustavo: entrou direto como administrador")

    # 2. caçar pelo painel Hoje
    pg.get_by_role("button", name=re.compile("Caçar leads agora")).first.click()
    print("    ", toast_ok(pg, "leads novos", 60000))
    pg.locator(".lead-linha").first.wait_for(timeout=20000)
    n = pg.locator(".lead-linha").count(); assert n >= 5, n
    pg.screenshot(path=f"{FOTOS}/01-hoje.png")
    passo(f"caçada no Google trouxe leads e a fila do dia montou ({n} na tela)")

    # 3. Caçada: robôs, praças, limites
    ir(pg, "cacada", "Caçada")
    pg.get_by_role("button", name="Ler sinais pendentes").click(); print("    ", toast_ok(pg, "sites lidos", 60000))
    pg.get_by_role("button", name="Aprender agora").click(); print("    ", toast_ok(pg, "Aprendeu", 60000))
    pg.get_by_label("Cidades").fill("Uberlândia/MG\nMoema, São Paulo/SP\ncidade sem uf")
    pg.get_by_text("1 linha(s) sem UF").wait_for()
    pg.get_by_role("button", name=re.compile(r"Adicionar \d+ praças")).click(); print("    ", toast_ok(pg, "praças novas"))
    pg.get_by_label("Ativa").first.click(); pg.wait_for_timeout(600)
    antes = pg.get_by_label("Apagar praça").count(); pg.get_by_label("Apagar praça").first.click(); pg.wait_for_timeout(800)
    assert pg.get_by_label("Apagar praça").count() == antes - 1
    pg.screenshot(path=f"{FOTOS}/02-cacada.png", full_page=True)
    passo("Caçada: ler sinais, aprender, adicionar/desligar/apagar praças")

    # 4. Radar com todos os filtros
    ir(pg, "radar", "Radar")
    pg.locator("tbody tr").first.wait_for(); total = pg.locator("tbody tr").count()
    for rot, val in [("Temperatura", "morno"), ("Estado", "SP"), ("Fonte", "google"), ("Ordenar", "nome"), ("Estágio", "")]:
        pg.get_by_label(rot).select_option(val); pg.wait_for_timeout(500)
    pg.get_by_label("Sinal").select_option(index=1); pg.wait_for_timeout(500)
    pg.get_by_label("Buscar").fill("Studio"); pg.wait_for_timeout(700)
    pg.get_by_label("Cidade").fill("sao paulo"); pg.wait_for_timeout(700)
    pg.get_by_label("Buscar").fill("11 9"); pg.wait_for_timeout(700)
    pg.get_by_role("button", name="Limpar").click(); pg.wait_for_timeout(700)
    assert pg.locator("tbody tr").count() == total
    passo(f"Radar: {total} leads, todos os filtros e a busca funcionam")

    # 5. ficha do lead: registrar, anotar, editar, IA
    pg.locator("tbody tr").first.click()
    gav = pg.locator(".gaveta"); gav.wait_for()
    nome_lead = gav.locator("h1").first.inner_text()
    gav.get_by_role("button", name="Não atendeu").click(); print("    ", toast_ok(pg))
    gav.get_by_role("button", name="Interessado").click(); print("    ", toast_ok(pg))
    gav.get_by_role("button", name="Pediu retorno").click()
    gav.get_by_role("button", name=re.compile("Salvar pediu retorno")).click(); print("    ", toast_ok(pg))
    gav.get_by_label("Nova anotação").fill("Dona Carla prefere ligação depois das 14h")
    gav.get_by_role("button", name="Anotar").click(); pg.wait_for_timeout(800)
    gav.get_by_text("Dona Carla prefere").first.wait_for()
    gav.get_by_role("button", name="Editar").click()
    gav.get_by_label("Nome do dono / responsável").fill("Carla Souza")
    gav.get_by_role("button", name="Salvar ficha").click(); print("    ", toast_ok(pg))
    gav.get_by_role("button", name="Dossiê antes de ligar").click()
    gav.get_by_role("button", name=re.compile("Pesquisar")).click()
    gav.get_by_text("Feito só com os dados do lead").wait_for(timeout=30000)
    gav.get_by_role("button", name="Ele respondeu…").click()
    gav.get_by_label("Resposta do lead").fill("Quanto custa?")
    gav.get_by_role("button", name="Escrever resposta").click()
    gav.get_by_role("link", name="Enviar no WhatsApp").wait_for(timeout=30000)
    pg.screenshot(path=f"{FOTOS}/03-ficha.png")
    pg.get_by_label("Fechar").click()
    passo(f"ficha de '{nome_lead}': 3 resultados, anotação, edição, dossiê e resposta da IA")

    # 6. scripts com IA dentro da ficha: WhatsApp personalizado e objeção
    pg.locator("tbody tr").nth(1).click(); gav.wait_for(); gav.locator("h1").wait_for()
    gav.get_by_role("button", name="WhatsApp", exact=True).click()
    gav.get_by_role("button", name="Personalizar com IA").click()
    gav.get_by_text("agenda cheia").first.wait_for(timeout=30000)
    gav.get_by_role("button", name="Objeções", exact=True).click()
    gav.get_by_label("Objeção do cliente").fill("Tá caro")
    gav.get_by_role("button", name="Como respondo?").click()
    gav.get_by_text("PERGUNTA DE VOLTA").first.wait_for(timeout=30000)
    pg.get_by_label("Fechar").click()
    passo("scripts com IA na ficha: mensagem de WhatsApp e resposta para objeção")

    # 7. lead manual
    ir(pg, "hoje", "")
    pg.get_by_role("button", name=re.compile(r"^\s*Lead$")).first.click()
    pg.get_by_label("Nome do negócio").fill("Salão da Vizinha")
    pg.get_by_label("Telefone com DDD").fill("(31) 98888-7777")
    pg.get_by_label("Cidade").last.fill("Contagem")
    pg.get_by_role("button", name="Cadastrar e abrir").click()
    pg.locator(".gaveta h1", has_text="Salão da Vizinha").wait_for()
    pg.get_by_label("Fechar").click()
    passo("lead cadastrado à mão (indicação) e aberto")

    # 8. sessão de ataque com teclado
    ir(pg, "hoje", "")
    pg.get_by_role("button", name=re.compile("Começar sessão de ataque")).click()
    pg.get_by_text(re.compile(r"\b1 de \d+")).first.wait_for()
    pg.keyboard.press("1"); pg.get_by_text(re.compile(r"\b2 de \d+")).first.wait_for(timeout=10000)
    pg.keyboard.press("3"); pg.get_by_text(re.compile(r"\b3 de \d+")).first.wait_for(timeout=10000)
    pg.screenshot(path=f"{FOTOS}/04-sessao.png")
    pg.get_by_role("button", name="Pular").click(); pg.get_by_text(re.compile(r"\b4 de \d+")).first.wait_for()
    pg.get_by_role("button", name="Sair").first.click()
    passo("sessão de ataque: teclas 1 e 3 registram e pulam para o próximo")

    # 9. funil: arrastar para Fechado e para Perdido (pede o motivo)
    ir(pg, "funil", "Funil")
    cartoes = pg.locator(".cartao[draggable=true]"); cartoes.first.wait_for()
    n0 = cartoes.count()
    cartoes.first.drag_to(pg.locator("section.coluna", has_text="Fechado").first)
    pg.get_by_text(re.compile(r"já fechados")).wait_for(timeout=10000)
    pg.evaluate("document.querySelector('.funil').scrollLeft = 10000"); pg.wait_for_timeout(300)
    pg.locator("section.coluna", has_text="Conversando").locator(".cartao").first.drag_to(pg.locator("section.coluna", has_text="Perdido").first)
    pg.get_by_role("button", name="Achou caro").click(); pg.wait_for_timeout(1200)
    assert cartoes.count() == n0 - 1, (n0, cartoes.count())
    pg.screenshot(path=f"{FOTOS}/05-funil.png")
    passo("funil: arrastar para Fechado soma no faturamento; para Perdido pede o motivo")

    # 10. scripts: criar, editar, apagar
    ir(pg, "scripts", "Scripts")
    pg.get_by_role("button", name=re.compile("Novo script")).click()
    pg.get_by_label("Título").fill("Teste automático")
    pg.locator("textarea").first.fill("Oi {primeiro_nome}, aqui é {vendedor} do {produto}.")
    pg.get_by_role("button", name="Salvar script").click(); print("    ", toast_ok(pg))
    pg.get_by_text("Teste automático").first.click(); pg.get_by_role("button", name="Editar").click()
    pg.get_by_role("button", name="Apagar").click(); pg.wait_for_timeout(1200)
    passo("scripts: criar, abrir, apagar")

    # 11. aprendizado
    ir(pg, "aprendizado", "Aprendizado"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{FOTOS}/06-aprendizado.png", full_page=True)
    passo("Aprendizado abriu")

    # 12. ajustes: perfil, limites, novo produto
    ir(pg, "ajustes", "Ajustes")
    pg.get_by_role("button", name="Salvar limites").click(); print("    ", toast_ok(pg, "Limites"))
    pg.get_by_role("button", name=re.compile("Novo produto")).first.click()
    pg.get_by_label(re.compile("^Nome")).first.fill("Cérebro do Mercado (teste)")
    pg.get_by_role("button", name="Criar produto").click(); print("    ", toast_ok(pg))
    pg.wait_for_timeout(800)
    passo("Ajustes: limites salvos e produto novo criado (com pesos padrão)")
    sair(pg)

    # 13. segundo usuário fica pendente até liberar
    cadastrar(pg, *VEND)
    pg.get_by_text(re.compile("aguard|liberar|pendente", re.I)).first.wait_for(timeout=15000)
    pg.screenshot(path=f"{FOTOS}/07-pendente.png")
    sessao = pg.evaluate("() => { for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) return JSON.parse(localStorage[k]).access_token }")
    pg.evaluate("() => localStorage.clear()")
    entrar(pg, ADMIN[0], ADMIN[1]); pg.get_by_text(re.compile("Gustavo")).first.wait_for()
    ir(pg, "ajustes", "Ajustes")
    pg.get_by_label(f"Acesso de {VEND[2]}").select_option("vendedor"); print("    ", toast_ok(pg, "Equipe"))
    pg.get_by_label(f"WhatsApp de {VEND[2]}").wait_for()
    sair(pg)
    entrar(pg, VEND[0], VEND[1])
    pg.get_by_text(re.compile(r"(Bom dia|Boa tarde|Boa noite), Ana")).wait_for(timeout=15000)
    pg.locator(".lead-linha").first.wait_for()
    menu = pg.locator(".trilho .nav-item").all_inner_texts()
    assert [m.strip() for m in menu] == ["Hoje", "Treino", "Seu perfil"], f"menu da vendedora: {menu}"
    assert pg.get_by_role("button", name="Lead").count() == 0, "vendedora não cadastra lead"
    pg.goto(APP + "/#/radar"); pg.wait_for_timeout(800)
    assert pg.locator("h1").first.inner_text() != "Radar", "vendedora não abre o Radar"
    # a fila dela é separada: nenhum lead da fila da Ana está na fila do Gustavo
    meus = pg.evaluate("""async () => { const k = Object.keys(localStorage).find(x => x.includes('auth-token'));
      const t = JSON.parse(localStorage[k]).access_token;
      const r = await fetch('http://127.0.0.1:54321/rest/v1/leads?select=id,dono', { headers: { apikey: 'sb_publishable_TESTElocal0000000000000000', Authorization: 'Bearer ' + t } });
      return (await r.json()).map(x => x.dono); }""")
    assert len(meus) > 0 and len(set(meus)) == 1, f"vendedora deveria ver só os leads dela: {set(meus)}"
    # WhatsApp travado até o cliente atender
    novo = pg.locator(".lead-linha", has=pg.locator(".whats-travado")).first
    novo.click(); pg.locator(".gaveta").wait_for(); pg.wait_for_timeout(500)
    assert pg.locator(".gaveta .whats-travado").count() >= 1, "WhatsApp deveria estar travado antes da ligação"
    assert pg.get_by_role("button", name="Mandei WhatsApp").count() == 0
    pg.locator(".gaveta .res", has_text="Interessado").first.click(); print("    ", toast_ok(pg, "Interessado"))
    pg.locator(".gaveta a.btn.whats").first.wait_for(timeout=10000)
    passo("vendedora: vê só Hoje/Treino, fila separada, WhatsApp libera depois que o cliente atende")
    pg.get_by_label("Fechar").click()
    sair(pg)

    # 14. celular
    cel = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
    pc = cel.new_page(); vigiar(pc, "celular"); _pagina_atual.append(pc)
    entrar(pc, ADMIN[0], ADMIN[1]); pc.locator(".lead-linha").first.wait_for(timeout=15000)
    pc.screenshot(path=f"{FOTOS}/08-cel-hoje.png")
    pc.locator(".lead-linha").first.click(); pc.locator(".gaveta").wait_for(); pc.wait_for_timeout(500)
    pc.screenshot(path=f"{FOTOS}/09-cel-ficha.png")
    pc.get_by_label("Fechar").click()
    for rota in ["hoje", "radar", "funil", "scripts", "cacada", "aprendizado", "ajustes"]:
        pc.goto(APP + "/#/" + rota); pc.wait_for_timeout(900)
        largura = pc.evaluate("document.documentElement.scrollWidth")
        if largura > 392: problemas.append(f"[celular] {rota}: tela mais larga que o celular ({largura}px)")
    pc.goto(APP + "/#/radar"); pc.wait_for_timeout(800); pc.screenshot(path=f"{FOTOS}/10-cel-radar.png")
    passo("celular: login, fila, ficha e todas as telas sem estourar a largura")

    # 15. segurança das funções da Vercel
    def post(caminho, corpo, token=None):
        req = urllib.request.Request(APP + caminho, data=json.dumps(corpo).encode(), method="POST", headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
        try: return urllib.request.urlopen(req).status
        except urllib.error.HTTPError as e: return e.code
    assert post("/api/acao", {"acao": "cacar"}) == 401
    assert post("/api/ia", {"acao": "mensagem"}, "token-falso") == 401
    req = urllib.request.Request(APP + "/api/cron?etapa=cacar")
    try: urllib.request.urlopen(req); assert False, "cron sem senha passou"
    except urllib.error.HTTPError as e: assert e.code == 401
    req = urllib.request.Request(APP + "/api/cron?etapa=cacar", headers={"Authorization": "Bearer segredo-do-cron"})
    rel = json.loads(urllib.request.urlopen(req, timeout=120).read())
    print("     cron:", json.dumps(rel)[:300])
    assert all("erro" not in v for k, v in rel.items() if isinstance(v, dict) and k != "faxina"), rel
    passo("funções protegidas: sem login = 401; robô diário (cron da Vercel) roda com a senha")
    b.close()

info = json.loads(urllib.request.urlopen("http://127.0.0.1:8791/").read())
google = [c for c in info["externas"] if c["tipo"] == "google"]
print(f"  · chamadas ao Google: {len(google)} | Gemini: {sum(c['tipo']=='gemini' for c in info['externas'])} | sites: {sum(c['tipo']=='site' for c in info['externas'])}")
for c in info["externas"]:
    if c["tipo"] == "bloqueado": problemas.append("chamada externa inesperada: " + c["url"])
for r in info["rest"]:
    if r["caminho"].startswith("/auth/v1/user") and r["status"] == 403: continue  # token falso de propósito no teste de segurança
    problemas.append(f"banco respondeu {r['status']} em {r['metodo']} {r['caminho'][:120]}: {r.get('erro')}")
if problemas:
    print("\nPROBLEMAS:"); [print("  ✗", x) for x in dict.fromkeys(problemas)]; sys.exit(1)
print(f">>> jornada completa OK ({len(passos)} etapas, nenhum erro)")
