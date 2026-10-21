#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME=azzel-postgres
IMAGE=postgres:17-alpine
PORT=54329
VOLUME_NAME=azzel-postgres-data
POSTGRES_USER=azzel
POSTGRES_PASSWORD=azzel
POSTGRES_DB=azzel
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
DATABASE_URL_VALUE="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}"

usage() {
  cat <<EOF
Usage : bash scripts/dev-db.sh <commande>

  up      Démarre le Postgres 17 dédié à Azzel (port ${PORT}, volume ${VOLUME_NAME}),
          attend qu'il soit prêt et crée .env à la racine s'il est absent.
  down    Arrête le conteneur (les données sont conservées).
  reset   Supprime conteneur et volume : base vide au prochain « up ».
  status  Affiche l'état du conteneur.

DATABASE_URL documenté dans .env.example. Les autres conteneurs Docker ne sont pas touchés.
EOF
}

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'DATABASE_URL=%s\n# SMTP_URL=smtp://utilisateur:motdepasse@smtp.example.com:587\n' \
      "$DATABASE_URL_VALUE" >"$ENV_FILE"
    echo ".env créé : $ENV_FILE"
  fi
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"
}

wait_ready() {
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres ne répond pas sur le conteneur ${CONTAINER_NAME}." >&2
  return 1
}

case "${1:-}" in
  up)
    if container_exists; then
      docker start "$CONTAINER_NAME" >/dev/null
    else
      docker run -d --name "$CONTAINER_NAME" \
        -e POSTGRES_USER="$POSTGRES_USER" \
        -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        -e POSTGRES_DB="$POSTGRES_DB" \
        -p "$PORT":5432 \
        -v "$VOLUME_NAME":/var/lib/postgresql/data \
        "$IMAGE" >/dev/null
    fi
    wait_ready
    ensure_env_file
    echo "Postgres Azzel prêt : ${DATABASE_URL_VALUE}"
    echo "Applique ensuite les migrations : pnpm -F @azzel/web db:migrate"
    ;;
  down)
    if container_exists; then
      docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
      echo "Conteneur ${CONTAINER_NAME} arrêté (volume ${VOLUME_NAME} conservé)."
    else
      echo "Aucun conteneur ${CONTAINER_NAME}."
    fi
    ;;
  reset)
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
    echo "Base réinitialisée. Relance : bash scripts/dev-db.sh up"
    ;;
  status)
    docker ps -a --filter "name=^${CONTAINER_NAME}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *)
    usage
    exit 1
    ;;
esac
