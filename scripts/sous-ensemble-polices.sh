#!/usr/bin/env bash
# Élagage des polices servies : regénère apps/web/public/charte/fonts/*.woff2
# à partir des originaux conservés dans docs/polices-source/.
#
# Ce que l'élagage enlève : UNIQUEMENT les glyphes qu'aucun caractère de la
# police ne peut atteindre (variantes stylistiques, ligatures de fonctionnalités
# non utilisées). La table de correspondance caractère → glyphe est conservée
# INTÉGRALEMENT : pas un seul caractère affichable n'est perdu, accents
# combinants compris (un nom saisi en forme décomposée reste correct).
# Gain mesuré : environ 18 % par fichier, soit ~21 Ko sur le premier
# chargement de l'accueil, sans aucun changement visuel.
#
# Fonctionnalités OpenType conservées :
#   kern, liga, calt, ccmp, mark, mkmk, locl, rlig — rendu correct du texte ;
#   tnum — chiffres à chasse fixe, utilisés par les dossards, les horaires et
#          les tableaux de résultats (font-variant-numeric: tabular-nums).
# Retirer tnum casserait l'alignement des colonnes de chiffres : ne pas le
# sortir de cette liste sans vérifier les écrans de résultats et de chrono.
#
# Les champs de nom 0 (droit d'auteur), 13 et 14 (licence OFL et son URL) sont
# conservés dans chaque fichier, en plus des OFL-*.txt servis dans le même
# dossier.
#
# Prérequis : uv (déjà requis par les scripts BMad). fontTools et brotli sont
# installés à la volée dans un environnement jetable — rien n'est ajouté aux
# dépendances du projet. Les polices servies sont versionnées : la CI n'a pas
# besoin de lancer ce script, il ne sert qu'à régénérer après un changement de
# charte ou de liste de fonctionnalités.
#
# Usage :
#   bash scripts/sous-ensemble-polices.sh            # régénère et remplace
#   bash scripts/sous-ensemble-polices.sh --verifier  # compare sans écrire

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${ROOT}/docs/polices-source"
CIBLE="${ROOT}/apps/web/public/charte/fonts"
FONCTIONNALITES='kern,liga,calt,ccmp,mark,mkmk,locl,rlig,tnum'
VERIFIER=0

if [ "${1:-}" = "--verifier" ]; then
  VERIFIER=1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "Erreur : uv est requis (installation jetable de fontTools)." >&2
  exit 1
fi

if [ ! -d "$SOURCE" ]; then
  echo "Erreur : polices d'origine absentes de ${SOURCE}." >&2
  exit 1
fi

TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

total_avant=0
total_apres=0

for origine in "${SOURCE}"/*.woff2; do
  nom="$(basename "$origine")"
  liste="${TRAVAIL}/${nom}.unicodes"

  # Liste exhaustive des caractères présents dans la police d'origine : on ne
  # retire aucun caractère, seulement des glyphes devenus inatteignables.
  uv run --quiet --with 'fonttools[woff]' --with brotli python3 -I -c "
import sys
from fontTools.ttLib import TTFont
police = TTFont(sys.argv[1])
print(','.join('U+%04X' % point for point in sorted(police.getBestCmap())))
" "$origine" > "$liste"

  uv run --quiet --with 'fonttools[woff]' --with brotli pyftsubset "$origine" \
    --output-file="${TRAVAIL}/${nom}" \
    --flavor=woff2 \
    --layout-features="$FONCTIONNALITES" \
    --unicodes-file="$liste" \
    --name-IDs='0,1,2,3,4,5,6,13,14' \
    --notdef-outline

  avant=$(wc -c < "$origine" | tr -d ' ')
  apres=$(wc -c < "${TRAVAIL}/${nom}" | tr -d ' ')
  total_avant=$((total_avant + avant))
  total_apres=$((total_apres + apres))

  # Garde-fou : aucun caractère ne doit avoir disparu de la police élaguée.
  uv run --quiet --with 'fonttools[woff]' --with brotli python3 -I -c "
import sys
from fontTools.ttLib import TTFont
avant = set(TTFont(sys.argv[1]).getBestCmap())
apres = set(TTFont(sys.argv[2]).getBestCmap())
perdus = sorted(avant - apres)
if perdus:
    details = ' '.join('U+%04X' % point for point in perdus)
    print(f'Caractères perdus dans {sys.argv[2]} : {details}', file=sys.stderr)
    sys.exit(1)
" "$origine" "${TRAVAIL}/${nom}"

  printf '%-44s %7d → %7d o  (−%d %%)\n' "$nom" "$avant" "$apres" \
    $(( (avant - apres) * 100 / avant ))

  if [ "$VERIFIER" = "0" ]; then
    cp "${TRAVAIL}/${nom}" "${CIBLE}/${nom}"
  fi
done

printf '\nTotal %d → %d octets (−%d octets)\n' \
  "$total_avant" "$total_apres" "$((total_avant - total_apres))"

if [ "$VERIFIER" = "1" ]; then
  echo 'Mode vérification : aucun fichier servi n'"'"'a été modifié.'
fi
