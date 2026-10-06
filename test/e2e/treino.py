"""Teste de ponta a ponta do treinador de ligações, no navegador, contra o Faro local (test/e2e/servidor.mjs):
roteiro SPIN na tela → gravar pelo microfone (microfone falso do Chromium) → áudio vira WAV 8 kHz →
sobe para o armazenamento com as regras do banco → /api/coach transcreve e analisa → análise na tela →
enviar um arquivo de áudio → página Treino. Falha com QUALQUER erro na tela, no console, no banco ou na função."""
import json, os, struct, math, subprocess, urllib.request, wave
from playwright.sync_api import sync_playwright

APP = "http://127.0.0.1:8790"
FOTOS = os.environ.get("FOTOS", "/tmp/claude-0/e2e-fotos"); os.makedirs(FOTOS, exist_ok=True)
problemas = []
PSQL = ["psql", "-X", "-At", "-h", "/var/tmp/pgfaro", "-p", "54329", "-U", "postgres", "-d", "faro_e2e", "-c"]
def sql(q): return subprocess.run(PSQL + [q], capture_output=True, text=True, check=True).stdout.strip()
def passo(n): print("  ✓", n, flush=True)

def vigiar(pg):
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL" not in m.text and problemas.append(f"console: {m.text[:300]}"))
    pg.on("pageerror", lambda e: problemas.append(f"erro de página: {e}"))
    pg.on("response", lambda r: r.status >= 400 and "fonts.g" not in r.url and problemas.append(f"HTTP {r.status} {r.request.method} {r.url[:160]}"))
    pg.add_init_script("""new MutationObserver(() => document.querySelectorAll('.toast.erro, .aviso.erro').forEach(t => {
      if (!t.dataset.visto) { t.dataset.visto = 1; console.error('ERRO NA TELA: ' + t.textContent); } })).observe(document, {subtree: true, childList: true});""")

# áudio "do celular": WAV 44,1 kHz estéreo de 20 s (o app tem que converter para 8 kHz mono)
arq = os.path.join(FOTOS, "ligacao_celular.wav")
with wave.open(arq, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
    w.writeframes(b"".join(struct.pack("<hh", int(8000 * math.sin(i / 20)), int(6000 * math.sin(i / 33))) for i in range(44100 * 20)))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo", permissions=["microphone"])
    pg = ctx.new_page(); vigiar(pg)

    pg.goto(APP + "/"); pg.get_by_text("Primeira vez? Criar conta").click()
    pg.get_by_label("Seu nome").fill("Gustavo"); pg.get_by_label("E-mail").fill("gustavo@faro.test"); pg.get_by_label("Senha").fill("senha-forte-123")
    pg.get_by_role("button", name="Criar conta", exact=True).click()
    pg.get_by_text("Gustavo").first.wait_for(timeout=20000); pg.locator(".trilho").wait_for(timeout=20000)
    passo("conta criada e logada")

    sql("""set role service_role; select ingerir_leads((select id from produtos where slug='tem-encaixe'),
      '[{"fonte":"google","place_id":"t1","nome":"Studio Bella Treino","nicho":"salao","telefone":"5531999990001","celular":true,"cidade":"Belo Horizonte","uf":"MG"}]'::jsonb);""")
    pg.goto(APP + "/#/radar"); pg.reload(); pg.get_by_text("Studio Bella Treino").first.click()
    pg.locator(".gaveta").wait_for()
    assert pg.locator(".script-escolha button[aria-pressed=true]").first.inner_text().startswith("SPIN"), "o roteiro SPIN deveria ser o escolhido para a ligação"
    for etapa in ["Situação", "Problema", "Implicação", "Necessidade", "Fechamento"]:
        pg.locator(".etapa-spin", has_text=etapa).first.wait_for(timeout=5000)
    passo("roteiro SPIN do salão aparece com as 4 etapas")

    pg.get_by_role("button", name="Gravar no viva-voz").click()
    pg.locator(".gravador.ativo").wait_for(timeout=10000); pg.wait_for_timeout(7000)
    pg.screenshot(path=f"{FOTOS}/treino-gravando.png")
    pg.get_by_role("button", name="Parar e analisar").click()
    pg.get_by_text("Achou o ouro e não cavou.").first.wait_for(timeout=30000)
    passo("gravou pelo microfone, transcreveu e analisou")
    assert "10,0" in pg.locator(".anel-nota").first.inner_text(), "nota acima de 10 deveria ser limitada a 10,0"
    pg.wait_for_function("document.querySelector('.player audio') && document.querySelector('.player audio').duration > 5", timeout=15000)
    passo("áudio da ligação toca a partir do armazenamento (link assinado)")
    pg.screenshot(path=f"{FOTOS}/treino-analise.png")
    pg.get_by_role("button", name="Transcrição").click()
    pg.get_by_text("Umas quatro por semana, viu.").wait_for()
    pg.keyboard.press("Escape")
    try:
        pg.locator(".gravacao", has_text="Achou o ouro").first.wait_for(timeout=10000)
    except Exception:
        pg.screenshot(path=f"{FOTOS}/FALHA-treino.png"); raise
    passo("transcrição na tela e ligação listada no lead")

    pg.locator(".gravador input[type=file]").set_input_files(arq)
    pg.locator(".modal .anel-nota").wait_for(timeout=30000)
    pg.keyboard.press("Escape")
    assert pg.locator(".gravacao").count() == 2, "deveria ter 2 ligações no lead"
    passo("enviou um áudio do celular (44,1 kHz estéreo) e analisou")

    pg.locator(".evento", has_text="Ligação analisada pela IA").first.wait_for(timeout=10000)
    passo("análise registrada no histórico do lead")
    pg.keyboard.press("Escape")

    pg.goto(APP + "/#/treino"); pg.get_by_role("heading", name="Treino").first.wait_for()
    pg.locator(".treino-destaque").wait_for(timeout=10000)
    assert pg.locator(".linha-treino").count() == 2
    pg.screenshot(path=f"{FOTOS}/treino-pagina.png", full_page=True)
    passo("página Treino mostra a evolução")

    pg.locator(".linha-treino").first.click(); pg.locator(".modal .anel-nota").wait_for()
    pg.once("dialog", lambda d: d.accept())
    pg.get_by_role("button", name="Apagar gravação").click()
    pg.get_by_text("Gravação apagada").wait_for()
    passo("apagou uma gravação")
    b.close()

ext = json.loads(urllib.request.urlopen("http://127.0.0.1:8791/").read())
audios = [e for e in ext["externas"] if e["tipo"] == "gemini-audio"]
analises = [e for e in ext["externas"] if e["tipo"] == "gemini-analise"]
assert len(audios) == 2 and all(a["wavValido"] for a in audios), f"áudio deveria chegar à IA como WAV 8 kHz mono: {audios}"
assert all(a["temTranscricao"] and a["temSpin"] for a in analises), analises
print(f"  ✓ IA recebeu {len(audios)} áudios WAV válidos ({', '.join(str(a['bytes'] // 1024) + ' KB' for a in audios)}) e {len(analises)} pedidos de análise SPIN")
estado = sql("select string_agg(status || ':' || coalesce(nota::text,'-') || ':' || fala_vendedor, ' ') from ligacoes")
objetos = sql("select count(*) from storage.objects where bucket_id = 'gravacoes'")
assert objetos == "1", f"deveria sobrar 1 áudio no armazenamento, tem {objetos}"
print("  ✓ banco:", estado, "| áudios guardados:", objetos)
if problemas:
    print("\nPROBLEMAS:"); [print("  ✗", x) for x in problemas]; raise SystemExit(1)
print("\nTREINO OK")
