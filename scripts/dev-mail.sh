#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME=azzel-mailpit
IMAGE=axllent/mailpit:latest
SMTP_PORT=2525
UI_PORT=8026
VOLUME_NAME=azzel-mailpit-data
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
SMTP_URL_VALUE="smtp://azzel:azzel@localhost:${SMTP_PORT}"

usage() {
  cat <<EOF
Usage : bash scripts/dev-mail.sh <commande>

  up      Démarre le faux SMTP Mailpit dédié à Azzel (SMTP ${SMTP_PORT}, UI http://localhost:${UI_PORT},
          volume ${VOLUME_NAME}) et active SMTP_URL dans .env s'il est absent.
  down    Arrête le conteneur (les messages sont conservés).
  reset   Supprime conteneur et volume : boîte vide au prochain « up ».
  status  Affiche l'état du conteneur.

Les emails envoyés par l'application (codes de connexion, notifications) sont visibles
dans l'interface http://localhost:${UI_PORT}. Mailpit accepte toute authentification SMTP.
Les autres conteneurs Docker ne sont pas touchés.
EOF
}

ensure_smtp_url() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'SMTP_URL=%s\n' "$SMTP_URL_VALUE" >"$ENV_FILE"
    echo ".env créé : $ENV_FILE"
  elif ! grep -q '^SMTP_URL=' "$ENV_FILE"; then
    printf '\n# Faux SMTP local (bash scripts/dev-mail.sh up) — UI http://localhost:%s\nSMTP_URL=%s\n' \
      "$UI_PORT" "$SMTP_URL_VALUE" >>"$ENV_FILE"
    echo "SMTP_URL ajoutée à $ENV_FILE"
  else
    echo "SMTP_URL déjà présente dans $ENV_FILE (valeur conservée)."
  fi
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"
}

case "${1:-}" in
  up)
    if container_exists; then
      docker start "$CONTAINER_NAME" >/dev/null
    else
      docker run -d --name "$CONTAINER_NAME" \
        -p "${SMTP_PORT}:1025" \
        -p "${UI_PORT}:8025" \
        -v "${VOLUME_NAME}:/data" \
        "$IMAGE" >/dev/null
    fi
    ensure_smtp_url
    echo "Mailpit prêt : SMTP localhost:${SMTP_PORT} — UI http://localhost:${UI_PORT}"
    ;;
  down)
    if container_exists; then
      docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
      echo "Conteneur ${CONTAINER_NAME} arrêté (messages conservés dans ${VOLUME_NAME})."
    else
      echo "Aucun conteneur ${CONTAINER_NAME}."
    fi
    ;;
  reset)
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
    echo "Mailpit réinitialisé. Relance : bash scripts/dev-mail.sh up"
    ;;
  status)
    docker ps -a --filter "name=^${CONTAINER_NAME}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *)
    usage
    exit 1
    ;;
esac
