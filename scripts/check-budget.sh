#!/usr/bin/env bash
# Story 2.1 — budget de premier chargement de la page d'accueil (< 300 Ko).
#
# Mesure déterministe sur un build frais (`pnpm build`, ou `pnpm budget`)
# servi par `next start` :
#   - poids « fil » (tel que servi, gzip si le serveur compresse) du HTML de /
#   - poids de chaque ressource locale référencée par le HTML servi :
#     scripts JS, feuilles de style, liens (icône, polices préchargées…)
#     et la photo hero (attribut data-hero-photo, variante src = 640).
#   - hors périmètre, par conception (note de conception de la story 2.1) :
#     la variante grand écran 1280 (servie via <picture> au-delà de 700 px)
#     et les photos différées loading="lazy" sous la ligne de flottaison —
#     le budget mesure le chemin mobile (640 ; léger upscale accepté sous
#     le voile sur DPR ≥ 2).
# Sortie : détail par ressource, total, verdict. Exit 1 si le seuil de 300 Ko
# est dépassé, si une ressource est inaccessible ou si le contenu attendu est
# absent (égide, CTA /connexion, chiffres officiels 2026).
#
# Story 7.3 — mesure AUSSI /resultats (pare-chemin-critique de la carte) : le
# HTML servi ne doit référencer NI leaflet NI une URL de tuile (la lib et son
# CSS ne vivent que dans des chunks asynchrones chargés au clic « Afficher la
# carte », qui doit être présent).
#
# Usage :
#   pnpm budget                                      # build + mesure
#   bash scripts/check-budget.sh                     # mesure seule (build requis)
#   BUDGET_PORT=3124 bash scripts/check-budget.sh    # port personnalisé

set -euo pipefail

PORT="${BUDGET_PORT:-3123}"
BASE_URL="http://127.0.0.1:${PORT}"
LIMIT_BYTES=$((300 * 1024))
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    pkill -P "$SERVER_PID" 2>/dev/null || true
  fi
  if command -v lsof >/dev/null 2>&1; then
    LISTENERS="$(lsof -ti ":${PORT}" 2>/dev/null || true)"
    if [ -n "$LISTENERS" ]; then
      for pid_ecouteur in $LISTENERS; do
        kill "$pid_ecouteur" 2>/dev/null || true
      done
    fi
  fi
  if [ -n "$SERVER_PID" ]; then
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if ! command -v python3 >/dev/null 2>&1; then
  echo "Erreur : python3 est requis (parsing du HTML servi)." >&2
  exit 1
fi

if [ ! -f "${ROOT}/apps/web/.next/BUILD_ID" ]; then
  echo "Erreur : aucun build dans apps/web/.next — lancez « pnpm build » (ou « pnpm budget ») d'abord." >&2
  exit 1
fi

if curl -sf --max-time 1 "${BASE_URL}/" >/dev/null 2>&1; then
  echo "Erreur : un serveur répond déjà sur ${BASE_URL} — arrêtez-le ou changez BUDGET_PORT." >&2
  exit 1
fi

(cd "${ROOT}/apps/web" && exec pnpm exec next start -p "${PORT}") >/dev/null 2>&1 &
SERVER_PID=$!

prêt=0
for _ in $(seq 1 60); do
  if curl -sf --max-time 1 "${BASE_URL}/" >/dev/null 2>&1; then
    prêt=1
    break
  fi
  sleep 0.5
done

if [ "$prêt" != "1" ]; then
  echo "Erreur : le serveur next start n'a pas répondu sur ${BASE_URL}." >&2
  exit 1
fi

if ! HTML_BYTES=$(curl -sf --compressed --max-time 10 "${BASE_URL}/" -o "${WORK}/home.html" -w '%{size_download}'); then
  echo "Erreur : page d'accueil inaccessible sur ${BASE_URL}/." >&2
  exit 1
fi

python3 - "${WORK}/home.html" > "${WORK}/assets.txt" <<'PY'
import re
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    html = f.read()

urls = set()
for match in re.finditer(r'<script[^>]+src="([^"]+)"', html):
    urls.add(match.group(1))
for match in re.finditer(r'<link[^>]+href="([^"]+)"', html):
    urls.add(match.group(1))
for match in re.finditer(r'<img[^>]*data-hero-photo[^>]*>', html):
    src = re.search(r'\bsrc="([^"]+)"', match.group(0))
    if src:
        urls.add(src.group(1))

for url in sorted(urls):
    if url.startswith("/"):
        print(url)
PY

echo "Page d'accueil — détail du premier chargement"
echo "---------------------------------------------"
printf '%9s  %s\n' "octets" "ressource"
printf '%9s  %s\n' "$HTML_BYTES" "/ (HTML)"

TOTAL=$HTML_BYTES

while IFS= read -r chemin; do
  if ! TAILLE=$(curl -sf --compressed --max-time 10 "${BASE_URL}${chemin}" -o /dev/null -w '%{size_download}'); then
    echo "Erreur : asset inaccessible : ${chemin}" >&2
    exit 1
  fi
  TOTAL=$((TOTAL + TAILLE))
  printf '%9s  %s\n' "$TAILLE" "$chemin"
done < "${WORK}/assets.txt"

echo "---------------------------------------------"
printf 'Total : %s octets (%s Ko) — seuil %s Ko\n' "$TOTAL" "$((TOTAL / 1024))" "300"

DEPASSE=0
if [ "$TOTAL" -gt "$LIMIT_BYTES" ]; then
  echo "ÉCHEC : budget de premier chargement dépassé de $((TOTAL - LIMIT_BYTES)) octets."
  DEPASSE=1
fi

CONTENU_OK=1
verifier_contenu() {
  if ! grep -q "$1" "${WORK}/home.html"; then
    echo "ÉCHEC contenu : « $1 » absent du HTML servi."
    CONTENU_OK=0
  fi
}
verifier_contenu "Sous l’égide de la Fédération et du ministère des Sports"
verifier_contenu 'href="/connexion"'
verifier_contenu ">279<"
verifier_contenu ">222<"
verifier_contenu ">214<"
verifier_contenu ">116<"

# Story 7.3 — pare-chemin-critique de la carte publique : /resultats servi sans
# AUCUNE référence carto dans le HTML initial (la section est fermée par
# défaut ; Leaflet, son CSS et les tuiles ne chargent qu'au clic).
if ! RESULTATS_BYTES=$(curl -sf --compressed --max-time 10 "${BASE_URL}/resultats" -o "${WORK}/resultats.html" -w '%{size_download}'); then
  echo "Erreur : page /resultats inaccessible sur ${BASE_URL}/resultats." >&2
  exit 1
fi
printf '%9s  %s\n' "$RESULTATS_BYTES" "/resultats (HTML, hors chemin critique carte)"

CARTE_OK=1
if grep -qiE 'leaflet|openstreetmap|\{z\}' "${WORK}/resultats.html"; then
  echo "ÉCHEC carte : /resultats référence la carto (leaflet/tuiles) dans le HTML initial." >&2
  CARTE_OK=0
fi
if ! grep -q "Afficher la carte" "${WORK}/resultats.html"; then
  echo "ÉCHEC carte : le bouton « Afficher la carte » est absent de /resultats." >&2
  CARTE_OK=0
fi

if [ "$DEPASSE" != "0" ] || [ "$CONTENU_OK" != "1" ] || [ "$CARTE_OK" != "1" ]; then
  exit 1
fi

echo "OK : contenu attendu présent (égide, CTA /connexion, chiffres officiels 2026)."
echo "OK : /resultats sans chunk carto dans le HTML initial (carte différée au clic)."
