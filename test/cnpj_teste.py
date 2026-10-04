"""Teste de ponta a ponta do importador CNPJ:
arquivos no formato da Receita → importador → API simulada do Supabase → banco Postgres real."""
import csv, io, json, os, subprocess, sys, tempfile, threading, zipfile, datetime as dt
from http.server import BaseHTTPRequestHandler, HTTPServer

PSQL = ["psql", "-h", "/var/tmp/pgfaro", "-p", "54329", "-U", "postgres", "-d", "faro", "-qAt", "-v", "ON_ERROR_STOP=1"]
def sql(q):
    return subprocess.run(PSQL, input=q, capture_output=True, text=True, check=True).stdout.strip()

hoje = dt.date.today()
d = lambda dias: (hoje - dt.timedelta(days=dias)).strftime("%Y%m%d")

def linha_estab(basico, fantasia, situacao, inicio, cnae, uf, mun, ddd, tel, email="", ddd2="", tel2=""):
    c = [""] * 30
    c[0], c[1], c[2], c[3], c[4], c[5], c[10], c[11] = basico, "0001", "99", "1", fantasia, situacao, inicio, cnae
    c[13], c[14], c[15], c[17], c[18], c[19], c[20] = "RUA", "DAS FLORES", "10", "CENTRO", "30000000", uf, mun
    c[21], c[22], c[23], c[24], c[27] = ddd, tel, ddd2, tel2, email
    return c

pasta = tempfile.mkdtemp()
def criar_zip(nome, linhas):
    buf = io.StringIO()
    csv.writer(buf, delimiter=";", quotechar='"', quoting=csv.QUOTE_ALL).writerows(linhas)
    with zipfile.ZipFile(os.path.join(pasta, nome), "w") as z:
        z.writestr(nome.replace(".zip", ".CSV"), buf.getvalue().encode("latin-1"))

criar_zip("Municipios.zip", [["4123", "BELO HORIZONTE"], ["7107", "SAO PAULO"]])
criar_zip("Estabelecimentos0.zip", [
    linha_estab("11111111", "", "02", d(10), "9602501", "MG", "4123", "031", "988887777"),                 # MEI novo, celular → entra
    linha_estab("22222222", "BARBEARIA DO TONHO", "02", d(30), "9602501", "SP", "7107", "11", "33334444", ddd2="11", tel2="977776666"),  # celular no tel2
    linha_estab("33333333", "SALAO FECHADO", "08", d(5), "9602501", "MG", "4123", "31", "999990000"),    # baixada → fora
    linha_estab("44444444", "SALAO ANTIGO", "02", d(400), "9602501", "MG", "4123", "31", "999991111"),   # antiga → fora
    linha_estab("55555555", "PADARIA", "02", d(5), "1091102", "MG", "4123", "31", "999992222"),          # outro CNAE → fora
    linha_estab("66666666", "ESPACO LASH E BROW", "02", d(20), "9602502", "MG", "4123", "31", "", "contato@lash.com"),  # só e-mail → entra
    linha_estab("77777777", "SEM CONTATO", "02", d(20), "9602502", "MG", "4123", "", ""),                 # sem nada → fora
])
criar_zip("Estabelecimentos1.zip", [
    linha_estab("88888888", "NAIL STUDIO", "02", d(2), "9602501", "MG", "4123", "31", "977770004"),
])
criar_zip("Empresas0.zip", [
    ["11111111", "61.111.111 JOANA DA SILVA PEREIRA", "2135", "50", "1000,00", "01", ""],
    ["22222222", "TONHO BARBEARIA LTDA", "2062", "49", "50000,00", "03", ""],
    ["88888888", "ANA PAULA SOUZA 12345678900", "2135", "50", "1000,00", "01", ""],
])

class API(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _ok(self, obj):
        b = json.dumps(obj).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        assert self.headers["apikey"] == "chave-servico"
        self._ok(json.loads(sql("select coalesce(json_agg(json_build_object('id',id,'nome',nome,'slug',slug,'nichos',nichos,'config',config)),'[]') from produtos where ativo")))
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path.endswith("/rpc/ingerir_leads"):
            r = sql(f"set role service_role; select ingerir_leads('{corpo['p_produto']}', $json${json.dumps(corpo['p_leads'])}$json$::jsonb);")
            self._ok(json.loads(r.splitlines()[-1]))
        elif self.path.endswith("/execucoes"):
            sql(f"insert into execucoes (produto_id,tipo,encontrados,novos) values ('{corpo['produto_id']}','cnpj',{corpo['encontrados']},{corpo['novos']})")
            self._ok([corpo])

srv = HTTPServer(("127.0.0.1", 0), API)
threading.Thread(target=srv.serve_forever, daemon=True).start()
subprocess.run(["chmod", "-R", "a+rx", pasta])

env = {**os.environ, "SUPABASE_URL": f"http://127.0.0.1:{srv.server_port}", "SUPABASE_SERVICE_ROLE_KEY": "chave-servico", "FARO_TESTE_DIR": pasta}
for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"): env.pop(k, None)
r = subprocess.run([sys.executable, "scripts/cnpj/importar.py"], env=env, capture_output=True, text=True)
print(r.stdout, r.stderr)
assert r.returncode == 0, "importador falhou"

leads = json.loads(sql("select json_agg(json_build_object('cnpj',cnpj,'nome',nome,'resp',responsavel,'nicho',nicho,'tel',telefone,'cel',celular,'mei',mei,'cidade',cidade,'score',score,'email',email) order by cnpj) from leads where fonte='cnpj'"))
for l in leads: print(l)
por = {l["cnpj"][:8]: l for l in leads}
falhas = []
def ok(c, m): print(("  ✓ " if c else "  ✗ ") + m); c or falhas.append(m)
ok(set(por) == {"11111111", "22222222", "66666666", "88888888"}, "só entram ativas, novas, do CNAE certo e com contato")
ok(por["11111111"]["nome"] == "Joana da Silva Pereira" and por["11111111"]["resp"] == "Joana da Silva Pereira", "MEI sem fantasia: nome e responsável pela razão social limpa")
ok(por["11111111"]["tel"] == "5531988887777" and por["11111111"]["cel"], "telefone com DDD '031' normalizado e celular")
ok(por["22222222"]["tel"] == "5511977776666" and por["22222222"]["nicho"] == "barbearia", "prefere o celular e detecta barbearia pelo nome")
ok(por["22222222"]["resp"] is None and por["22222222"]["mei"] is False, "LTDA não vira responsável")
ok(por["66666666"]["nicho"] == "sobrancelha" and por["66666666"]["email"] == "contato@lash.com", "estética 9602-5/02: nicho de cílios pelo nome, entra pelo e-mail")
ok(por["88888888"]["nicho"] == "esmalteria" and por["88888888"]["resp"] == "Ana Paula Souza", "segundo arquivo lido; CPF tirado do nome")
ok(por["11111111"]["cidade"] == "Belo Horizonte", "município traduzido")
ok(all(l["score"] >= 50 for l in leads if l["cel"]), "recém-abertas com celular já chegam quentes")
ok(sql("select count(*) from execucoes where tipo='cnpj'") == "1", "execução registrada")

# rodar de novo não duplica
r2 = subprocess.run([sys.executable, "scripts/cnpj/importar.py"], env=env, capture_output=True, text=True)
ok("'novos': 0" in r2.stdout and sql("select count(*) from leads where fonte='cnpj'") == "4", "segunda rodada não duplica")
srv.shutdown()
if falhas: sys.exit(f"{len(falhas)} falha(s)")
print(">>> importador CNPJ OK")
