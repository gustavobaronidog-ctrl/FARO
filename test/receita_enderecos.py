"""Testa se o importador acha os arquivos da Receita nos 3 formatos de endereço que ela já usou:
1) WebDAV público novo  /public.php/dav/files/<token>/AAAA-MM/
2) WebDAV antigo        /public.php/webdav/AAAA-MM/   (token como usuário, senha vazia)
3) Índice HTML antigo   /dados/cnpj/dados_abertos_cnpj/AAAA-MM/
E se pula um mês que ainda está incompleto."""
import base64, http.server, os, sys, threading, importlib.util

TOKEN = "YggdBLfdninEJX9"
MESES = {"2026-08": [f"Estabelecimentos{i}.zip" for i in range(10)] + [f"Empresas{i}.zip" for i in range(10)] + ["Municipios.zip"],
         "2026-09": ["Estabelecimentos0.zip", "Empresas0.zip"]}  # setembro ainda subindo

def propfind_xml(base, itens):
    resp = "".join(f"<d:response><d:href>{base}{i}{'/' if '.' not in i else ''}</d:href></d:response>" for i in [""] + itens)
    return f'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">{resp}</d:multistatus>'.encode()

def servidor(modo):
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def responder(self, cod, corpo=b"", tipo="application/xml"):
            self.send_response(cod); self.send_header("Content-Type", tipo); self.send_header("Content-Length", str(len(corpo))); self.end_headers(); self.wfile.write(corpo)
        def pasta(self, resto):
            resto = resto.strip("/")
            return list(MESES) if not resto else MESES.get(resto)
        def do_PROPFIND(self):
            if modo == "novo" and self.path.startswith(f"/public.php/dav/files/{TOKEN}/"):
                resto = self.path[len(f"/public.php/dav/files/{TOKEN}/"):]
                itens = self.pasta(resto)
                return self.responder(207, propfind_xml(f"/public.php/dav/files/{TOKEN}/{resto}", itens)) if itens is not None else self.responder(404)
            if modo == "antigo" and self.path.startswith("/public.php/webdav/"):
                if self.headers.get("Authorization") != "Basic " + base64.b64encode(f"{TOKEN}:".encode()).decode():
                    return self.responder(401)
                resto = self.path[len("/public.php/webdav/"):]
                itens = self.pasta(resto)
                return self.responder(207, propfind_xml(f"/public.php/webdav/{resto}", itens)) if itens is not None else self.responder(404)
            self.responder(404)
        def do_GET(self):
            if modo == "html" and self.path.startswith("/dados/cnpj/dados_abertos_cnpj/"):
                resto = self.path[len("/dados/cnpj/dados_abertos_cnpj/"):]
                itens = self.pasta(resto)
                if itens is None: return self.responder(404)
                links = "".join(f'<a href="{i}{"/" if "." not in i else ""}">{i}</a>' for i in itens)
                return self.responder(200, f'<html><a href="?C=N;O=D">Name</a><a href="/dados/cnpj/">Parent</a>{links}</html>'.encode(), "text/html")
            self.responder(404)
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

def carregar(host):
    os.environ["RF_HOST"] = host
    spec = importlib.util.spec_from_file_location("imp", os.path.join(os.path.dirname(__file__), "..", "scripts", "cnpj", "importar.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

for modo in ["novo", "antigo", "html"]:
    s = servidor(modo)
    m = carregar(f"http://127.0.0.1:{s.server_port}")
    meses, _, _ = m.listar_receita("")
    meses = sorted(x for x in meses if len(x) == 7 and x[4] == "-")
    assert meses == ["2026-08", "2026-09"], (modo, meses)
    arq, url_de, auth = m.listar_receita("2026-08/")
    assert sum(a.startswith("Estabelecimentos") for a in arq) == 10, (modo, arq)
    u = url_de("Estabelecimentos0.zip")
    assert u.endswith("2026-08/Estabelecimentos0.zip"), (modo, u)
    print(f"  {modo}: ok → {u.split(str(s.server_port))[1]}")
    s.shutdown()
print(">>> endereços da Receita OK")
