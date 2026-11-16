#!/usr/bin/env bash
# Einmalig auf dem Server: Datenbank und Benutzer best_badges im vorhandenen postgres-Container anlegen.
# Liest das Passwort aus /srv/stacks/badges/.env; gibt es nirgends aus.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
: "${BADGES_DB_PASSWORD:?BADGES_DB_PASSWORD fehlt in .env}"
PGUSER=$(docker exec "${PG_CONTAINER:-postgres}" printenv POSTGRES_USER)
# Passwort über stdin statt Kommandozeile (taucht so nicht in ps oder der Shell-Historie auf)
{
  printf "\\set pw '%s'\n" "${BADGES_DB_PASSWORD//\'/\'\'}"
  cat <<'SQL'
SELECT 'CREATE ROLE best_badges LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'best_badges') \gexec
ALTER ROLE best_badges WITH LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SELECT 'CREATE DATABASE best_badges OWNER best_badges' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'best_badges') \gexec
REVOKE ALL ON DATABASE best_badges FROM PUBLIC;
SQL
} | docker exec -i "${PG_CONTAINER:-postgres}" psql -q -v ON_ERROR_STOP=1 -U "$PGUSER" -d postgres
echo "Datenbank best_badges bereit."
