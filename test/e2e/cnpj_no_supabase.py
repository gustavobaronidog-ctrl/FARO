"""Roda o importador da Receita de verdade contra o Supabase local (chave nova sb_secret_),
usando os mesmos arquivos de exemplo do teste do importador."""
import os, subprocess, sys, json, urllib.request
codigo = open(os.path.join(os.path.dirname(__file__), "..", "cnpj_teste.py")).read()
exec(codigo[:codigo.index("class API(")])  # só monta os arquivos de exemplo (variável: pasta)
env = {**os.environ, "SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_TESTElocal00000000000000000000", "FARO_TESTE_DIR": pasta}
r = subprocess.run([sys.executable, "scripts/cnpj/importar.py"], env=env, capture_output=True, text=True)
print(r.stdout[-1500:]); print(r.stderr[-1500:])
assert r.returncode == 0, "importador falhou"
q = lambda s: subprocess.run(["psql", "-h", "/var/tmp/pgfaro", "-p", "54329", "-U", "postgres", "-d", "faro_e2e", "-At", "-c", s], capture_output=True, text=True).stdout.strip()
n = int(q("select count(*) from leads where cnpj is not null"))  # um deles já existia (cadastrado à mão com o mesmo celular) e só ganhou o CNPJ
assert n == 4, n
assert q("select count(*) from execucoes where tipo='cnpj'") == "1"
info = json.loads(urllib.request.urlopen("http://127.0.0.1:8791/").read())
erros = [x for x in info["rest"] if "auth/v1/user" not in x["caminho"]]
assert not erros, erros
print(f">>> importador da Receita gravou {n} empresas novas no Supabase com a chave sb_secret_")
