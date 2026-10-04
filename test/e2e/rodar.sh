#!/bin/bash
# Teste de ponta a ponta: banco tipo Supabase + Faro inteiro + navegador fazendo a rotina completa
cd "$(dirname "$0")/../.."
ps -eo pid,args | awk '$2=="node" && $3 ~ /e2e/ {print $1}' | xargs -r kill; sleep 0.5
./test/e2e/banco_supabase.sh | tail -1 || exit 1
node test/e2e/servidor.mjs > /tmp/faro-e2e.log 2>&1 &
SRV=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8790/ && break; sleep 0.5; done
timeout 900 python3 test/e2e/jornada.py; R=$?
kill $SRV 2>/dev/null
grep -E "FUNÇÃO QUEBROU|Error" /tmp/faro-e2e.log | head -20
exit $R
