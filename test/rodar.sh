#!/bin/bash
# Recria o banco de teste e roda todos os testes SQL
P="psql -h /var/tmp/pgfaro -p 54329 -U postgres -q"
$P -c "drop database if exists faro" -c "create database faro" >/dev/null
$P -d faro -v ON_ERROR_STOP=1 -f test/supabase_stub.sql -f supabase/01_estrutura.sql -f supabase/02_tem_encaixe.sql -f supabase/03_spin_e_treino.sql -f supabase/04_equipe.sql 2>&1 | grep -E "ERROR|FATAL"
for f in "$@"; do $P -d faro -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -v NOTICE; done
