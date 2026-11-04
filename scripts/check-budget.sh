#!/usr/bin/env bash
# Budget de premier chargement de la page d'accueil. Unité : KIBIoctet
# (1 Kio = 1024 octets). Le script rend DEUX verdicts, tous deux bloquants :
#
#   1. POIDS RÉEL (≤ 350 Kio) — tout ce que le navigateur télécharge
#      vraiment, mesuré par Chrome via scripts/mesure-chargement.mjs.
#   2. CHEMIN CRITIQUE (≤ 300 Kio) — ce que le HTML référence, donc ce qui
#      bloque le premier rendu. C'est la mesure historique des stories 2.1
#      et 2.4, conservée telle quelle.
#
# Pourquoi deux mesures (arbitrage du 2026-11-04) : le décompte du chemin
# critique ne voit pas les polices tirées par @font-face depuis la feuille de
# style. Une police pouvait donc sortir du budget par le simple retrait de son
# <link rel="preload">, sans qu'un octet quitte la page — c'est arrivé à Barlow
# Condensed 700 en story 9.6. Le poids réel ferme cette porte : les octets
# comptent où qu'ils se cachent.
#
# Pourquoi 350 Kio et plus 300 : la mesure honnête a montré un socle
# incompressible de 181 Kio (runtime d'App Router, HTML, RSC, CSS) sur lequel
# le projet n'a aucune prise. Tenir 300 Kio en octets réels laissait moins de
# 2 Kio de marge et aurait poussé à retoucher la charte typographique pour
# gagner des miettes. Le seuil réel est donc fixé à 350 Kio, avec le chemin
# critique maintenu à 300 Kio.
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
# Sortie : détail par ressource, totaux, verdicts. Exit 1 si l'un des deux
# seuils est dépassé, si une ressource est inaccessible ou si le contenu
# attendu est absent (CTA /connexion, chiffres officiels 2026).
#
# Story 7.3 — mesure AUSSI /resultats (pare-chemin-critique de la carte) : le
# HTML servi ne doit référencer NI leaflet NI une URL de tuile (la lib et son
# CSS ne vivent que dans des chunks asynchrones chargés au clic « Afficher la
# carte », qui doit être présent).
#
# Prérequis : Chrome ou Chromium pour le poids réel (présent sur les runners
# ubuntu-latest ; sinon renseigner CHROME_BIN).
#
# Usage :
#   pnpm budget                                      # build + mesure
#   bash scripts/check-budget.sh                     # mesure seule (build requis)
#   BUDGET_PORT=3124 bash scripts/check-budget.sh    # port personnalisé

set -euo pipefail

PORT="${BUDGET_PORT:-3123}"
BASE_URL="http://127.0.0.1:${PORT}"
LIMIT_BYTES=$((300 * 1024))      # chemin critique : 300 Kio = 307 200 octets
LIMIT_REEL_BYTES=$((350 * 1024)) # poids réel     : 350 Kio = 358 400 octets
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    pkill -P "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$SERVER_PID" ] && command -v lsof >/dev/null 2>&1; then
    # Uniquement si NOUS avons démarré un serveur : sinon le port appartient à
    # quelqu'un d'autre (le garde ci-dessous refuse justement de l'écraser).
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
printf 'Chemin critique : %s octets (%s Kio) — seuil %s Kio\n' \
  "$TOTAL" "$((TOTAL / 1024))" "300"

DEPASSE=0
if [ "$TOTAL" -gt "$LIMIT_BYTES" ]; then
  echo "ÉCHEC : chemin critique dépassé de $((TOTAL - LIMIT_BYTES)) octets."
  DEPASSE=1
fi

# --- Poids réel : ce que le navigateur télécharge, polices @font-face comprises.
echo
echo "Page d'accueil — poids réel du premier chargement (Chrome, mobile 390 px)"
echo "-------------------------------------------------------------------------"

if ! node "${ROOT}/scripts/mesure-chargement.mjs" "${BASE_URL}/" > "${WORK}/reel.txt"; then
  echo "Erreur : la mesure du poids réel a échoué (Chrome absent ? voir CHROME_BIN)." >&2
  exit 1
fi

TOTAL_REEL=$(awk -F'\t' '$1 == "TOTAL" { print $2 }' "${WORK}/reel.txt")
if [ -z "${TOTAL_REEL:-}" ]; then
  echo "Erreur : la mesure du poids réel n'a rendu aucun total." >&2
  exit 1
fi

# Détail lisible : les dix ressources les plus lourdes, déjà triées par la
# mesure, puis le cumul par famille pour situer d'où vient le poids.
printf '%9s  %-12s %s\n' "octets" "type" "ressource"
grep -v '^TOTAL' "${WORK}/reel.txt" | head -10 | while IFS=$'\t' read -r octets type url; do
  printf '%9s  %-12s %s\n' "$octets" "$type" "${url#"$BASE_URL"}"
done

echo "        —  cumul par type —"
grep -v '^TOTAL' "${WORK}/reel.txt" \
  | awk -F'\t' '{ somme[$2] += $1 } END { for (type in somme) printf "%9d  %s\n", somme[type], type }' \
  | sort -rn

echo "-------------------------------------------------------------------------"
printf 'Poids réel : %s octets (%s Kio) — seuil %s Kio\n' \
  "$TOTAL_REEL" "$((TOTAL_REEL / 1024))" "350"

if [ "$TOTAL_REEL" -gt "$LIMIT_REEL_BYTES" ]; then
  echo "ÉCHEC : poids réel dépassé de $((TOTAL_REEL - LIMIT_REEL_BYTES)) octets."
  DEPASSE=1
fi
echo

CONTENU_OK=1
verifier_contenu() {
  if ! grep -q "$1" "${WORK}/home.html"; then
    echo "ÉCHEC contenu : « $1 » absent du HTML servi."
    CONTENU_OK=0
  fi
}
# Lien « Me connecter » de l'onglet Mon trail (encart fermé, rendu en SSR par
# le layout) — ce n'est plus le CTA du hero, vérifié juste en dessous.
verifier_contenu 'href="/connexion"'
# CTA « S'inscrire » du hero : parcours « Créer mon compte » (même flux code).
verifier_contenu 'href="/connexion?parcours=inscription"'
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

echo "OK : poids réel et chemin critique sous leurs seuils respectifs."
echo "OK : contenu attendu présent (CTA /connexion, chiffres officiels 2026)."
echo "OK : /resultats sans chunk carto dans le HTML initial (carte différée au clic)."
