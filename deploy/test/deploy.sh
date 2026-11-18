#!/usr/bin/env bash
# Bündelt API und Verwaltung auf dem Mac, lädt nur die Bündel (wenige MB) auf stuffdev und startet den Stack neu.
# Der Server installiert und baut nichts (zu wenig freier Speicher); er kopiert die Bündel nur in Node-Images.
#
# Aufruf vom Mac (Tailscale an):  deploy/test/deploy.sh
#   DEPLOY_KEY=<ssh-schlüssel>  (Standard: ../rag_stuffdev/.ssh/id_rag_setup neben dem Projekt)
# .env und hsp.json auf dem Server werden nie überschrieben (hsp.json nur beim ersten Mal angelegt).
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$ROOT"
SSH_HOST=${DEPLOY_HOST:-rangarius@100.66.150.61}
SSH_PORT=${DEPLOY_PORT:-1986}
SSH_KEY=${DEPLOY_KEY:-$ROOT/../../rag_stuffdev/.ssh/id_rag_setup}
DIR=/srv/stacks/badges
SSH_OPTS=(-o IdentitiesOnly=yes -i "$SSH_KEY")
ssh_() { ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "$SSH_HOST" "$@"; }
scp_() { scp -q "${SSH_OPTS[@]}" -P "$SSH_PORT" "$@"; }

TAG=$(git rev-parse --short HEAD)
git diff --quiet HEAD -- . ':!apps/app' && [ -z "$(git ls-files -o --exclude-standard -- . ':!apps/app')" ] || TAG="$TAG-dirty-$(date +%H%M%S)"
echo "== Stand $TAG → $SSH_HOST:$DIR"

ssh_ "test -f $DIR/.env" || { echo "Fehlt: $DIR/.env auf dem Server (Vorlage deploy/test/env.example)"; exit 1; }

echo "== Bündeln (auf dem Mac)"
CTX=$(mktemp -d)
trap 'rm -rf "$CTX"' EXIT
docker buildx build --target bundle --output "type=local,dest=$CTX" .
cp deploy/test/runtime.Dockerfile "$CTX/Dockerfile"
mkdir -p "$CTX/mock-hsp" && cp -R dev/mock-hsp/Dockerfile dev/mock-hsp/src dev/mock-hsp/data "$CTX/mock-hsp/"
echo "   $(du -sh "$CTX" | cut -f1) Bündel"

echo "== Hochladen und Images auf dem Server zusammensetzen (nur Kopieren, kein Bauen)"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$CTX" . | ssh_ "set -e; B=\$(mktemp -d); trap 'rm -rf \$B' EXIT; tar -xzf - -C \$B
  docker build -q --target api -t best-badges-api:$TAG \$B >/dev/null
  docker build -q --target manage -t best-badges-manage:$TAG \$B >/dev/null
  docker build -q -t best-badges-mock-hsp:$TAG \$B/mock-hsp >/dev/null
  echo '   Images fertig: $TAG'"

scp_ deploy/test/compose.yaml deploy/test/setup-db.sh deploy/test/env.example "$SSH_HOST:$DIR/"
ssh_ "test -f $DIR/hsp.json" || scp_ deploy/test/hsp.json "$SSH_HOST:$DIR/hsp.json"

echo "== Starten"
# Tag in .env festhalten, damit ein späteres 'docker compose up' denselben Stand nimmt
ssh_ "set -e; cd $DIR; chmod 600 .env; sed -i '/^BADGES_TAG=/d' .env; echo BADGES_TAG=$TAG >> .env
      docker compose up -d --remove-orphans --wait --wait-timeout 120
      docker compose ps
      # Alte Stände der drei Images aufräumen (laufende bleiben)
      docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^best-badges-(api|manage|mock-hsp):' | grep -v ':$TAG\$' | xargs -r docker rmi >/dev/null 2>&1 || true"
echo "== Fertig: https://badges.stuffdev.de  ·  https://badges-api.stuffdev.de/docs"
