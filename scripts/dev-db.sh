#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME=azzel-postgres
IMAGE=postgres:17-alpine
PORT=54329
VOLUME_NAME=azzel-postgres-data
POSTGRES_USER=azzel
POSTGRES_PASSWORD=azzel
POSTGRES_DB=azzel
# Rôle applicatif (story 1.9) : l'app s'y connecte, les migrations en propriétaire.
APP_USER=azzel_app
APP_PASSWORD="${AZZEL_APP_PASSWORD:-azzel}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
DATABASE_URL_VALUE="postgres://${APP_USER}:${APP_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}"
DATABASE_OWNER_URL_VALUE="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}"

usage() {
  cat <<EOF
Usage : bash scripts/dev-db.sh <commande>

  up      Démarre le Postgres 17 dédié à Azzel (port ${PORT}, volume ${VOLUME_NAME}),
          attend qu'il soit prêt, crée le rôle applicatif ${APP_USER} (idempotent)
          et crée .env à la racine s'il est absent (DATABASE_URL + DATABASE_OWNER_URL).
  down    Arrête le conteneur (les données sont conservées).
  reset   Supprime conteneur et volume : base vide au prochain « up ».
  status  Affiche l'état du conteneur.

DATABASE_URL (rôle ${APP_USER}) et DATABASE_OWNER_URL (propriétaire, migrations)
documentés dans .env.example. Les autres conteneurs Docker ne sont pas touchés.
EOF
}

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'DATABASE_URL=%s\nDATABASE_OWNER_URL=%s\n# SMTP_URL=smtp://utilisateur:motdepasse@smtp.example.com:587\n' \
      "$DATABASE_URL_VALUE" "$DATABASE_OWNER_URL_VALUE" >"$ENV_FILE"
    echo ".env créé : $ENV_FILE"
  fi
}

env_file_needs_migration() {
  ! grep -qF "DATABASE_URL=${DATABASE_URL_VALUE}" "$ENV_FILE" ||
    ! grep -qF "DATABASE_OWNER_URL=${DATABASE_OWNER_URL_VALUE}" "$ENV_FILE"
}

# Story 1.9 : un .env EXISTANT (DATABASE_URL en propriétaire, sans
# DATABASE_OWNER_URL) est migré — les autres lignes (SMTP_URL, etc.) conservées.
migrate_env_file() {
  local tmp has_url has_owner line
  tmp="${ENV_FILE}.tmp"
  has_url=0
  has_owner=0
  : >"$tmp"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      DATABASE_URL=*)
        has_url=1
        printf 'DATABASE_URL=%s\n' "$DATABASE_URL_VALUE" >>"$tmp"
        ;;
      DATABASE_OWNER_URL=*)
        has_owner=1
        printf 'DATABASE_OWNER_URL=%s\n' "$DATABASE_OWNER_URL_VALUE" >>"$tmp"
        ;;
      *)
        printf '%s\n' "$line" >>"$tmp"
        ;;
    esac
  done <"$ENV_FILE"
  if [ "$has_url" -eq 0 ]; then
    printf 'DATABASE_URL=%s\n' "$DATABASE_URL_VALUE" >>"$tmp"
  fi
  if [ "$has_owner" -eq 0 ]; then
    printf 'DATABASE_OWNER_URL=%s\n' "$DATABASE_OWNER_URL_VALUE" >>"$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
  echo ".env migré (story 1.9) : DATABASE_URL → rôle ${APP_USER}, DATABASE_OWNER_URL présente."
}

# Rôle applicatif : créé au niveau du cluster (idempotent). Les GRANT viennent de la
# migration 0008_rls_roles.sql — sur une base neuve elle s'appliquera ensuite.
ensure_app_role() {
  local escaped="${APP_PASSWORD//\'/\'\'}"
  docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c \
    "DO \$\$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN
         CREATE ROLE ${APP_USER} LOGIN PASSWORD '${escaped}';
       END IF;
     END \$\$;" >/dev/null
  echo "Rôle applicatif ${APP_USER} prêt (migrations via DATABASE_OWNER_URL)."
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
    ensure_app_role
    ensure_env_file
    if env_file_needs_migration; then
      migrate_env_file
    fi
    echo "Postgres Azzel prêt : app ${DATABASE_URL_VALUE}"
    echo "                      migrations ${DATABASE_OWNER_URL_VALUE}"
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
