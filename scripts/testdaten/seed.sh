#!/usr/bin/env bash
# Testdaten auf stuffdev einspielen (wiederholbar). Vorher: Sicherung von hsp.json und Datenbank (*.pre-seed).
# Aufruf vom Mac (Tailscale an):  scripts/testdaten/seed.sh
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
SSH_HOST=${DEPLOY_HOST:-rangarius@100.66.150.61}
SSH_PORT=${DEPLOY_PORT:-1986}
SSH_KEY=${DEPLOY_KEY:-$ROOT/../../rag_stuffdev/.ssh/id_rag_setup}
DIR=/srv/stacks/badges
SSH_OPTS=(-o IdentitiesOnly=yes -i "$SSH_KEY")
ssh_() { ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "$SSH_HOST" "$@"; }
scp_() { scp -q "${SSH_OPTS[@]}" -P "$SSH_PORT" "$@"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
STAMP=$(date +%Y%m%d-%H%M%S)

echo "== Sicherung auf dem Server ($STAMP)"
ssh_ "set -e; cd $DIR; cp hsp.json hsp.json.pre-seed-$STAMP
  U=\$(docker exec postgres printenv POSTGRES_USER)
  docker exec postgres pg_dump -U \"\$U\" -d best_badges -Fc > best_badges.pre-seed-$STAMP.dump
  chmod 600 best_badges.pre-seed-$STAMP.dump; ls -la hsp.json.pre-seed-$STAMP best_badges.pre-seed-$STAMP.dump"

echo "== Testdaten erzeugen"
scp_ "$SSH_HOST:$DIR/hsp.json" "$TMP/hsp.json"
python3 "$ROOT/scripts/testdaten/seed.py" --hsp "$TMP/hsp.json" --out-hsp "$TMP/hsp.new.json" --out-sql "$TMP/seed.sql"

echo "== Test-HSP aktualisieren"
scp_ "$TMP/hsp.new.json" "$SSH_HOST:$DIR/hsp.json"
ssh_ "cd $DIR && docker compose restart mock-hsp >/dev/null && echo '   mock-hsp neu gestartet'"

echo "== Datenbank füllen"
ssh_ "U=\$(docker exec postgres printenv POSTGRES_USER); docker exec -i postgres psql -q -v ON_ERROR_STOP=1 -U \"\$U\" -d best_badges" < "$TMP/seed.sql"
echo "== Fertig. Zurück:  pg_restore --clean -d best_badges best_badges.pre-seed-$STAMP.dump  und  hsp.json.pre-seed-$STAMP"
