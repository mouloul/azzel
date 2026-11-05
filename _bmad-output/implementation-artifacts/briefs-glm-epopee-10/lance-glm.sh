#!/bin/bash
# Usage: lance-glm.sh <brief.md> <sortie.txt> <titre>
# Relance opencode tant qu'il ne produit aucune sortie dans les 90 s (blocage
# intermittent au démarrage). 5 tentatives maximum, puis échec explicite.
BRIEF="$1"; OUT="$2"; TITRE="$3"
cd /Users/mouloudhaouili/Desktop/ouidou/Azzel || exit 2
MSG=$(cat "$BRIEF")
for essai in 1 2 3 4 5; do
  : > "$OUT"
  opencode run --pure -m zai-coding-plan/glm-5.3 --title "$TITRE" "$MSG" > "$OUT" 2>&1 &
  PID=$!
  for t in $(seq 1 9); do
    sleep 10
    [ "$(wc -c < "$OUT" | tr -d ' ')" -gt 100 ] && break
    kill -0 "$PID" 2>/dev/null || break
  done
  if [ "$(wc -c < "$OUT" | tr -d ' ')" -gt 100 ]; then
    echo "essai $essai : demarre" >&2
    wait "$PID"; echo "FINI rc=$?"; exit 0
  fi
  echo "essai $essai : bloque, relance" >&2
  kill "$PID" 2>/dev/null; sleep 1; kill -9 "$PID" 2>/dev/null
done
echo "ECHEC: opencode ne demarre pas apres 5 essais"; exit 1
