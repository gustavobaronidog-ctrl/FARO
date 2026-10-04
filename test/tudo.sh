#!/bin/bash
# Roda TODOS os testes do Faro, na ordem. Para no primeiro que falhar.
set -e
cd "$(dirname "$0")/.."
echo "== 1. robôs, IA e telefone (unitários)";       node test/robos.test.mjs | tail -1
echo "== 2. modelo que aprende";                      node test/modelo.test.mjs ${SIM:-/tmp/claude-0/sim.json} | tail -1
echo "== 3. banco: fluxo, segurança, aprendizado";    ./test/rodar.sh test/fluxo.sql test/aprendizado.sql | grep ">>>"
./test/rodar.sh > /dev/null
echo "== 4. importador da Receita";                   python3 test/cnpj_teste.py | tail -1
echo "== 5. endereços da Receita";                    python3 test/receita_enderecos.py | tail -1
echo "== 6. ponta a ponta (navegador + Supabase + Vercel)"; ./test/e2e/rodar.sh | grep -E "✓|>>>|✗|PROBLEMAS"
echo "== 7. importador da Receita no Supabase (chave nova)"
node test/e2e/servidor.mjs > /tmp/faro-e2e2.log 2>&1 & S=$!; sleep 5
python3 test/e2e/cnpj_no_supabase.py | tail -1; kill $S
echo "== TUDO OK"
