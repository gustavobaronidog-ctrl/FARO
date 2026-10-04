#!/usr/bin/env python3
"""
FARO · Radar de empresas recém-abertas (dados abertos do CNPJ da Receita Federal)

Roda sozinho uma vez por mês no GitHub Actions (grátis). Para cada produto ativo:
  1. baixa a base pública mais recente de estabelecimentos da Receita;
  2. filtra só as empresas ATIVAS, abertas nos últimos N dias, nos CNAEs do produto
     (ex.: 9602-5/01 cabeleireiros, manicure e pedicure) e com telefone ou e-mail;
  3. busca a razão social / nome do responsável (MEI) e envia para o Faro.

Só usa a biblioteca padrão do Python (nada para instalar).
Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Opcionais: RF_TOKEN (token público da pasta da Receita), RF_MES (ex.: 2026-09), FARO_TESTE_DIR
"""
import csv, datetime as dt, io, json, os, re, sys, tempfile, time, unicodedata, urllib.request, urllib.error, urllib.parse, zipfile, base64
from html.parser import HTMLParser

RF_HOST = os.environ.get("RF_HOST", "https://arquivos.receitafederal.gov.br").rstrip("/")
RF_TOKEN = os.environ.get("RF_TOKEN", "YggdBLfdninEJX9")
RF_INDICE_ANTIGO = f"{RF_HOST}/dados/cnpj/dados_abertos_cnpj/"
csv.field_size_limit(10_000_000)

# ------------------------------------------------------------------ util
def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)

MINUSCULAS = {"da", "de", "do", "das", "dos", "e", "em", "a", "o"}
def titulo(txt):
    palavras = (txt or "").strip().lower().split()
    return " ".join(p if (i and p in MINUSCULAS) else p[:1].upper() + p[1:] for i, p in enumerate(palavras))

def limpar_razao(razao):
    """MEI vem como '12.345.678 MARIA DA SILVA' ou 'MARIA DA SILVA 12345678900'"""
    r = re.sub(r"^[\d.\-/\s]+", "", razao or "")
    r = re.sub(r"[\d.\-/\s]+$", "", r)
    return titulo(r)

def telefone(ddd, num):
    ddd = re.sub(r"\D", "", ddd or "").lstrip("0")[-2:]
    num = re.sub(r"\D", "", num or "")
    if len(ddd) != 2 or len(num) < 8:
        return None
    return "55" + ddd + num

def eh_celular(t):
    return bool(t) and len(t) == 13 and t[4] == "9"

# ------------------------------------------------------------------ Receita: onde estão os arquivos
class _Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs += [v for k, v in attrs if k == "href" and v]

def _get(url, metodo="GET", auth=None, cabecalhos=None, timeout=120):
    req = urllib.request.Request(url, method=metodo, headers=cabecalhos or {})
    if auth is not None:
        req.add_header("Authorization", "Basic " + base64.b64encode(f"{auth}:".encode()).decode())
    return urllib.request.urlopen(req, timeout=timeout)

def _propfind(url, auth):
    r = _get(url, "PROPFIND", auth=auth, cabecalhos={"Depth": "1"}, timeout=60)
    xml = r.read().decode("utf-8", "replace")
    hrefs = re.findall(r"<(?:d|D):href>([^<]+)</(?:d|D):href>", xml)
    return [urllib.parse.unquote(h.rstrip("/").split("/")[-1]) for h in hrefs]

def listar_receita(caminho=""):
    """Lista uma pasta da Receita. A Receita já mudou o endereço mais de uma vez, então
    tenta, em ordem: WebDAV público novo, WebDAV antigo (token como usuário) e o índice HTML antigo."""
    c = caminho.strip("/")
    sub = (c + "/") if c else ""
    jeitos = [
        (f"{RF_HOST}/public.php/dav/files/{RF_TOKEN}/{sub}", None),
        (f"{RF_HOST}/public.php/webdav/{sub}", RF_TOKEN),
    ]
    for base, auth in jeitos:
        try:
            itens = [i for i in _propfind(base, auth) if i and i != (c.split("/")[-1] if c else "") and i not in (RF_TOKEN, "webdav")]
            if itens:
                log(f"Receita: usando {base.split('/public.php')[1].split('/')[1]}")
                return itens, (lambda nome, base=base: base + nome), auth is not None
        except Exception as e:
            log(f"Receita: {base} indisponível ({e})")
    r = _get(RF_INDICE_ANTIGO + sub, timeout=60)
    p = _Links(); p.feed(r.read().decode("utf-8", "replace"))
    itens = [h.strip("/").split("/")[-1] for h in p.hrefs if not h.startswith("?") and not h.startswith("/") and not h.startswith("http")]
    return itens, (lambda nome: RF_INDICE_ANTIGO + sub + nome), False

def baixar(url, destino, usa_auth):
    for tentativa in range(4):
        try:
            with _get(url, auth=RF_TOKEN if usa_auth else None, timeout=300) as r, open(destino, "wb") as f:
                while True:
                    bloco = r.read(1 << 20)
                    if not bloco:
                        break
                    f.write(bloco)
            return destino
        except Exception as e:
            log(f"falha baixando {url} ({e}); tentativa {tentativa + 1}/4")
            time.sleep(20 * (tentativa + 1))
    raise RuntimeError(f"não consegui baixar {url}")

def linhas_zip(caminho_zip):
    with zipfile.ZipFile(caminho_zip) as z:
        for nome in z.namelist():
            with z.open(nome) as bruto:
                yield from csv.reader(io.TextIOWrapper(bruto, encoding="latin-1", newline=""), delimiter=";", quotechar='"')

# ------------------------------------------------------------------ Faro (Supabase)
def faro(caminho, corpo=None, metodo=None):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + caminho
    chave = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo or ("POST" if dados else "GET"), headers={
        "apikey": chave, "Content-Type": "application/json", "Prefer": "return=representation",
        # chaves novas (sb_secret_...) vão só no "apikey"; as antigas (JWT eyJ...) também no Authorization
        **({"Authorization": f"Bearer {chave}"} if chave.startswith("eyJ") else {})})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = r.read().decode()
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:500]
            if e.code < 500 or tentativa == 2:
                raise RuntimeError(f"Supabase {e.code}: {msg}")
            time.sleep(5)

# ------------------------------------------------------------------ regras de filtro
def montar_filtros(produtos, hoje):
    filtros = []
    for p in produtos:
        cfg = p.get("config") or {}
        if not cfg.get("cnpj_ativo", True):
            continue
        cnae_nichos = {}
        for n in p.get("nichos") or []:
            for c in n.get("cnaes") or []:
                cnae_nichos.setdefault(re.sub(r"\D", "", c), []).append(n)
        if not cnae_nichos:
            continue
        janela = int(cfg.get("cnpj_janela_dias", 120))
        filtros.append({
            "produto": p, "cnaes": cnae_nichos,
            "desde": (hoje - dt.timedelta(days=janela)).strftime("%Y%m%d"),
            "ufs": {u.upper() for u in cfg.get("cnpj_ufs") or []},
            "maximo": int(cfg.get("cnpj_max_por_mes", 3000)),
            "candidatos": [],
        })
    return filtros

def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if unicodedata.category(c) != "Mn")

def escolher_nicho(nichos, texto):
    """Casa palavras no começo de cada palavra do nome; vence a palavra mais específica (mais longa)."""
    t = sem_acento(texto)
    melhor, tamanho = nichos[0]["chave"], 0
    for n in nichos:
        for p in n.get("palavras") or []:
            p = sem_acento(p)
            if len(p) > tamanho and re.search(r"(^|[^a-z])" + re.escape(p), t):
                melhor, tamanho = n["chave"], len(p)
    return melhor

def processar_estabelecimentos(linhas, filtros, municipios):
    lidas = 0
    for c in linhas:
        lidas += 1
        if len(c) < 28 or c[5] != "02":
            continue
        cnae = c[11]
        for f in filtros:
            nichos = f["cnaes"].get(cnae)
            if not nichos or c[10] < f["desde"] or (f["ufs"] and c[19] not in f["ufs"]):
                continue
            t1, t2 = telefone(c[21], c[22]), telefone(c[23], c[24])
            if t2 and eh_celular(t2) and not eh_celular(t1):
                t1, t2 = t2, t1
            email = (c[27] or "").strip().lower() or None
            if not t1 and not email:
                continue
            f["candidatos"].append({
                "fonte": "cnpj", "cnpj": c[0] + c[1] + c[2], "_basico": c[0],
                "nome": titulo(c[4]) if c[4].strip() else None,
                "nicho": escolher_nicho(nichos, c[4]),
                "telefone": t1, "telefone2": t2, "celular": eh_celular(t1), "email": email,
                "endereco": " ".join(x for x in [c[13], c[14], c[15], c[16]] if x.strip()).title() or None,
                "bairro": titulo(c[17]) or None, "cidade": titulo(municipios.get(c[20], "")) or None, "uf": c[19],
                "aberto_em": f"{c[10][:4]}-{c[10][4:6]}-{c[10][6:8]}",
            })
    return lidas

def recortar(filtros):
    """Fica com os melhores de cada produto: celular primeiro, mais recentes primeiro."""
    for f in filtros:
        f["candidatos"].sort(key=lambda x: (x["celular"], x["aberto_em"]), reverse=True)
        f["candidatos"] = f["candidatos"][: f["maximo"]]

def processar_empresas(linhas, filtros):
    precisa = {x["_basico"]: [] for f in filtros for x in f["candidatos"]}
    for f in filtros:
        for x in f["candidatos"]:
            precisa[x["_basico"]].append(x)
    for c in linhas:
        if len(c) < 6 or c[0] not in precisa:
            continue
        razao, natureza, porte = c[1], c[2], c[5]
        for x in precisa[c[0]]:
            nome_limpo = limpar_razao(razao)
            x["natureza"], x["porte"] = natureza, {"01": "ME", "03": "EPP", "05": "Demais"}.get(porte)
            x["mei"] = natureza == "2135"
            if x["mei"]:
                x["responsavel"] = nome_limpo
            if not x["nome"]:
                x["nome"] = nome_limpo or "Empresa nova"

def enviar(filtros, enviar_lote, registrar):
    for f in filtros:
        p, lotes, tot = f["produto"], f["candidatos"], {"novos": 0, "duplicados": 0, "bloqueados": 0}
        for i in range(0, len(lotes), 300):
            lote = [{k: v for k, v in x.items() if not k.startswith("_")} for x in lotes[i:i + 300]]
            for x in lote:
                x["nome"] = x["nome"] or "Empresa nova"
            r = enviar_lote(p["id"], lote) or {}
            for k in tot:
                tot[k] += int(r.get(k, 0))
        log(f"{p['nome']}: {len(lotes)} candidatos → {tot}")
        registrar(p["id"], len(lotes), tot)

# ------------------------------------------------------------------ principal
def main():
    hoje = dt.date.today()
    produtos = faro("produtos?select=id,nome,slug,nichos,config&ativo=eq.true")
    filtros = montar_filtros(produtos, hoje)
    if not filtros:
        log("Nenhum produto com CNAE configurado. Nada a fazer."); return

    pasta_teste = os.environ.get("FARO_TESTE_DIR")
    if pasta_teste:
        arquivos = sorted(os.listdir(pasta_teste))
        local = lambda nome: os.path.join(pasta_teste, nome)
    else:
        meses, _, _ = listar_receita("")
        meses = sorted(m for m in meses if re.fullmatch(r"\d{4}-\d{2}", m))
        if not meses:
            raise RuntimeError("Não achei as pastas mensais da Receita. Confira RF_HOST/RF_TOKEN.")
        # a Receita sobe os arquivos aos poucos: usa o mês mais novo que já esteja completo
        for mes in ([os.environ["RF_MES"]] if os.environ.get("RF_MES") else list(reversed(meses))[:3]):
            arquivos, url_de, usa_auth = listar_receita(mes + "/")
            n_est = sum(1 for a in arquivos if a.lower().startswith("estabelecimentos") and a.lower().endswith(".zip"))
            n_emp = sum(1 for a in arquivos if a.lower().startswith("empresas") and a.lower().endswith(".zip"))
            if n_est >= 10 and n_emp >= 10 or os.environ.get("RF_MES"):
                break
            log(f"{mes} ainda incompleto ({n_est} estabelecimentos, {n_emp} empresas); tentando o mês anterior")
        log("Base da Receita:", mes)
        tmp = tempfile.mkdtemp()
        def local(nome):
            log("baixando", nome)
            return baixar(url_de(nome), os.path.join(tmp, nome), usa_auth)

    def pegar(prefixo):
        return sorted(a for a in arquivos if a.lower().startswith(prefixo.lower()) and a.lower().endswith(".zip"))

    municipios = {}
    for a in pegar("Municipios"):
        caminho = local(a)
        municipios.update({c[0]: c[1] for c in linhas_zip(caminho) if len(c) >= 2})
        if not pasta_teste: os.remove(caminho)

    total = 0
    for a in pegar("Estabelecimentos"):
        caminho = local(a)
        total += processar_estabelecimentos(linhas_zip(caminho), filtros, municipios)
        if not pasta_teste: os.remove(caminho)
        log(f"{a}: {total:,} linhas lidas; candidatos:", {f['produto']['slug']: len(f['candidatos']) for f in filtros})

    recortar(filtros)
    for a in pegar("Empresas"):
        caminho = local(a)
        processar_empresas(linhas_zip(caminho), filtros)
        if not pasta_teste: os.remove(caminho)

    enviar(
        filtros,
        lambda pid, lote: faro("rpc/ingerir_leads", {"p_produto": pid, "p_leads": lote}),
        lambda pid, n, tot: faro("execucoes", {"produto_id": pid, "tipo": "cnpj", "origem": "agendado",
                                              "finalizado_em": dt.datetime.now(dt.timezone.utc).isoformat(),
                                              "encontrados": n, "novos": tot["novos"], "duplicados": tot["duplicados"],
                                              "detalhe": {"linhas_lidas": total, **tot}}),
    )
    log("pronto.")

if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        sys.exit(f"Falta a variável de ambiente {e}")
