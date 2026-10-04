#!/bin/bash
# Monta um Postgres o mais parecido possível com um projeto Supabase novo:
#  - esquema auth criado pelas migrações REAIS do servidor de login do Supabase (github.com/supabase/auth)
#  - papéis anon / authenticated / service_role / supabase_auth_admin
#  - "postgres" do Supabase NÃO é superusuário: aqui ele é o papel "dono" (sem superuser)
#  - privilégios padrão do Supabase (tudo novo no public já nasce liberado para anon/authenticated)
#  - pgcrypto no esquema "extensions", como no Supabase
# Depois roda os SQLs do Faro como "dono", igual você fará colando no SQL Editor.
set -e
MIG=${MIG:-/tmp/gotrue/migrations}
SU="psql -h /var/tmp/pgfaro -p 54329 -U postgres -q -v ON_ERROR_STOP=1"
$SU -c "drop database if exists faro_e2e" -c "create database faro_e2e" >/dev/null
$SU -d faro_e2e >/dev/null <<'SQL'
do $$ begin
  create role anon nologin noinherit;              exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_auth_admin login createrole noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role dono login createrole bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to dono;
create schema auth authorization supabase_auth_admin;
create schema extensions;
create extension pgcrypto schema extensions;
create extension "uuid-ossp" schema extensions;
grant usage on schema extensions to public;
alter schema public owner to dono;
grant create on database faro_e2e to dono;
alter role supabase_auth_admin set search_path = auth;
alter role dono set search_path = "$user", public, extensions;
SQL
for f in $(ls $MIG/*.up.sql | sort); do
  sed -E 's/\{\{ ?index \.Options "Namespace" ?\}\}/auth/g' "$f" | $SU -d faro_e2e -U supabase_auth_admin 2>&1 | grep -E "ERROR" && { echo "migração falhou: $f"; exit 1; } || true
done
$SU -d faro_e2e >/dev/null <<'SQL'
grant usage on schema auth to anon, authenticated, service_role, dono;
grant all on all tables in schema auth to dono;
grant all on all routines in schema auth to dono;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role dono in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role dono in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role dono in schema public grant all on sequences to anon, authenticated, service_role;
SQL
cd "$(dirname "$0")/../.."
for f in supabase/01_estrutura.sql supabase/02_tem_encaixe.sql; do
  $SU -d faro_e2e -U dono -f "$f" 2>&1 | grep -v NOTICE | grep -E "ERROR|FATAL" && { echo "falhou: $f"; exit 1; } || true
done
echo ">>> banco tipo Supabase montado"
