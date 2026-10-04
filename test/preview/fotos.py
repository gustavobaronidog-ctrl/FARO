import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
dist = os.path.join(os.path.dirname(__file__), 'dist')
out = '/tmp/claude-0/fotos'; os.makedirs(out, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', dist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
erros = []
alvos = sys.argv[1:] or ['entrar', 'hoje', 'lead', 'foco', 'radar', 'funil', 'scripts', 'cacada', 'aprendizado', 'ajustes', 'cel-hoje', 'cel-lead']
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for nome in alvos:
            cel = nome.startswith('cel-')
            ctx = b.new_context(viewport={'width': 390, 'height': 844} if cel else {'width': 1440, 'height': 900}, device_scale_factor=1)
            pg = ctx.new_page()
            pg.on('console', lambda m: m.type in ('error', 'warning') and erros.append(f'{nome}: {m.text[:300]}'))
            pg.on('pageerror', lambda e: erros.append(f'{nome}: PAGEERROR {e}'))
            base = 'http://127.0.0.1:8765/index.html'
            if nome == 'entrar':
                pg.goto(base); pg.wait_for_timeout(600)
            else:
                pg.goto(base + '#logado'); pg.wait_for_timeout(300)
                pg.evaluate("sessionStorage.setItem('prev-logado','1')")
                rota = nome.replace('cel-', '')
                pg.goto(base + '#/' + ('hoje' if rota in ('lead', 'foco') else rota)); pg.reload(); pg.wait_for_timeout(900)
                if rota == 'lead':
                    pg.click('.lead-linha >> nth=0'); pg.wait_for_timeout(700)
                if rota == 'foco':
                    pg.click('text=Começar sessão de ataque'); pg.wait_for_timeout(700)
            pg.screenshot(path=f'{out}/{nome}.png', full_page=not cel and nome not in ('lead', 'foco'))
            ctx.close()
        b.close()
finally:
    srv.terminate()
print('\n'.join(erros) or 'sem erros no console')
