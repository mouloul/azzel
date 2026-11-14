#!/usr/bin/env bash
# Sauvegarde de la base et des preuves (story 12.2).
#
#   bash scripts/sauvegarde.sh <quotidien|course|manuel>
#
# Dump Postgres D'ABORD, preuves ENSUITE (tout fichier référencé par le dump
# est alors présent), archive tar chiffrée par `age` pour une clé PUBLIQUE,
# envoi vers SAUVEGARDE_DESTINATION (rclone, ou cp si chemin local), rétention,
# battement de cœur. Rien ne quitte la machine en clair ; le dossier temporaire
# est effacé dans tous les cas. Mode opératoire : docs/exploitation-sauvegardes.md
#
# Variables (environnement, sinon .env à la racine du dépôt) :
#   DATABASE_OWNER_URL        obligatoire — rôle propriétaire ; hors local, pooler
#                             en mode SESSION (5432), jamais en transaction (6543)
#   AGE_RECIPIENT             obligatoire — clé PUBLIQUE age (age1…)
#   SAUVEGARDE_DESTINATION    obligatoire — « remote:bucket/chemin » rclone, ou
#                             chemin local (commençant par / ou .)
#   PG_IMAGE                  facultative — image du pg_dump (postgres:17-alpine)
#   HEARTBEAT_URL_SAUVEGARDE  facultative — battement ; /fail en cas d'échec
# Les preuves sont lues avec la configuration de l'application (PROOF_STORAGE_*,
# STORAGE_DIR) par `pnpm -F @azzel/web preuves:exporter`.
#
# Modes et rétention :
#   quotidien  base + preuves, 7 gardées ; le dimanche (UTC) copie sous hebdo/, 4 gardées
#   course     base seule (preuves figées depuis la clôture J-10), 24 gardées
#   manuel     base + preuves, gardées jusqu'à suppression explicite
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
MOTIF_ARCHIVE='^azzel-[0-9]{8}T[0-9]{6}Z\.tar\.age$'

journal() {
  printf '%s [sauvegarde] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

echec() {
  printf '%s [sauvegarde] ÉCHEC : %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
  exit 1
}

# Valeur d'une variable : l'environnement d'abord, puis la dernière ligne
# NOM=… du .env (guillemets retirés), comme readEnv côté application. Le .env
# n'est jamais « sourcé » : une valeur avec espaces ou chevrons le casserait.
lire_env() {
  local nom="$1" valeur=""
  eval "valeur=\${$nom:-}"
  if [ -z "$valeur" ] && [ -f "$ENV_FILE" ]; then
    valeur="$(grep -E "^[[:space:]]*${nom}[[:space:]]*=" "$ENV_FILE" | tail -n 1 | sed -E "s/^[[:space:]]*${nom}[[:space:]]*=[[:space:]]*//; s/[[:space:]]+$//" || true)"
    case "$valeur" in
      \"*\") valeur="${valeur#\"}"; valeur="${valeur%\"}" ;;
      \'*\') valeur="${valeur#\'}"; valeur="${valeur%\'}" ;;
      *) valeur="${valeur%% #*}" ;;
    esac
  fi
  printf '%s' "$valeur"
}

exiger_env() {
  local valeur
  valeur="$(lire_env "$1")"
  [ -n "$valeur" ] || echec "$1 absente : définis-la (voir .env.example et docs/exploitation-sauvegardes.md)."
  printf '%s' "$valeur"
}

exiger_commande() {
  command -v "$1" >/dev/null 2>&1 || echec "commande « $1 » introuvable : $2"
}

# Battement facultatif : n'échoue jamais, ne bloque jamais plus de ~30 s.
battement() {
  local suffixe="$1" url
  [ -n "${HEARTBEAT_URL:-}" ] || return 0
  command -v curl >/dev/null 2>&1 || return 0
  url="${HEARTBEAT_URL%/}${suffixe}"
  curl -fsS -m 10 --retry 2 -o /dev/null "$url" >/dev/null 2>&1 || true
}

DOSSIER_TMP=""
SUCCES=0
nettoyer() {
  local statut=$?
  if [ -n "$DOSSIER_TMP" ] && [ -d "$DOSSIER_TMP" ]; then
    rm -rf "$DOSSIER_TMP"
  fi
  if [ "$SUCCES" -ne 1 ]; then
    [ "$statut" -ne 0 ] || statut=1
    battement /fail
  fi
  exit "$statut"
}
trap nettoyer EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Le battement est lu en premier : toute erreur qui suit appelle /fail.
HEARTBEAT_URL="$(lire_env HEARTBEAT_URL_SAUVEGARDE)"

MODE="${1:-}"
case "$MODE" in
  quotidien) RETENTION=7; AVEC_PREUVES=1 ;;
  course) RETENTION=24; AVEC_PREUVES=0 ;;
  manuel) RETENTION=0; AVEC_PREUVES=1 ;;
  *) echec "mode « ${MODE} » inconnu. Usage : bash scripts/sauvegarde.sh <quotidien|course|manuel>" ;;
esac
RETENTION_HEBDO=4

DATABASE_OWNER_URL="$(exiger_env DATABASE_OWNER_URL)"
AGE_RECIPIENT="$(exiger_env AGE_RECIPIENT)"
SAUVEGARDE_DESTINATION="$(exiger_env SAUVEGARDE_DESTINATION)"
PG_IMAGE="$(lire_env PG_IMAGE)"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
SAUVEGARDE_DESTINATION="${SAUVEGARDE_DESTINATION%/}"

case "$AGE_RECIPIENT" in
  AGE-SECRET-KEY-*) echec "AGE_RECIPIENT contient une clé PRIVÉE age : elle ne doit jamais être sur cette machine. Pose la clé publique (age1…) et révoque la paire." ;;
esac

case "$SAUVEGARDE_DESTINATION" in
  /* | .*) DESTINATION_LOCALE=1 ;;
  *:*) DESTINATION_LOCALE=0 ;;
  *) DESTINATION_LOCALE=1 ;;
esac

exiger_commande docker "le dump passe par « docker run $PG_IMAGE pg_dump »."
exiger_commande age "installe age (https://age-encryption.org) : chiffrement obligatoire avant envoi."
exiger_commande node "Node.js est requis (lecture de DATABASE_OWNER_URL, export des preuves)."
if [ "$AVEC_PREUVES" -eq 1 ]; then
  exiger_commande pnpm "l'export des preuves passe par « pnpm -F @azzel/web preuves:exporter »."
fi
if [ "$DESTINATION_LOCALE" -eq 0 ]; then
  exiger_commande rclone "installe rclone et configure le remote (docs/exploitation-sauvegardes.md)."
fi

# Décompose DATABASE_OWNER_URL en variables libpq : le mot de passe passe à
# docker par l'environnement, jamais en argument (visible par `ps`).
LIBPQ="$(DATABASE_OWNER_URL="$DATABASE_OWNER_URL" node -e '
  let url;
  try { url = new URL(process.env.DATABASE_OWNER_URL); } catch { process.exit(3); }
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  const locale = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hote);
  const sslUrl = url.searchParams.get("sslmode");
  const ssl = locale ? (sslUrl || "prefer")
    : (sslUrl === "verify-full" || sslUrl === "verify-ca" ? sslUrl : "require");
  const champs = [
    hote, url.port || "5432", decodeURIComponent(url.username),
    decodeURIComponent(url.password), decodeURIComponent(url.pathname.slice(1)) || "postgres",
    ssl, locale ? "1" : "0",
  ];
  if (champs.some((champ) => champ.includes("\n"))) process.exit(3);
  process.stdout.write(champs.join("\n"));
')" || echec "DATABASE_OWNER_URL mal formée (attendu : postgres://utilisateur:motdepasse@hote:port/base)."
# Découpage ligne à ligne sans here-string (qui passerait par un fichier temporaire).
champ_suivant() {
  CHAMP="${LIBPQ%%$'\n'*}"
  LIBPQ="${LIBPQ#*$'\n'}"
}
champ_suivant; PG_HOTE="$CHAMP"
champ_suivant; PG_PORT="$CHAMP"
champ_suivant; PG_UTILISATEUR="$CHAMP"
champ_suivant; PG_MOTDEPASSE="$CHAMP"
champ_suivant; PG_BASE="$CHAMP"
champ_suivant; PG_SSL="$CHAMP"
PG_LOCALE="$LIBPQ"
unset LIBPQ CHAMP

if [ "$PG_PORT" = "6543" ]; then
  echec "DATABASE_OWNER_URL vise le port 6543 (pooler en mode transaction) : le dump exige le mode session (5432)."
fi

# Réseau du conteneur : « host » sous Linux (VPS). Docker Desktop (macOS) n'y
# voit pas l'hôte : une base locale y est jointe par host.docker.internal.
RESEAU_DOCKER=(--network host)
if [ "$(uname -s)" = "Darwin" ]; then
  RESEAU_DOCKER=()
  if [ "$PG_LOCALE" = "1" ]; then
    PG_HOTE=host.docker.internal
  fi
fi

HORODATAGE="$(date -u +%Y%m%dT%H%M%SZ)"
NOM_ARCHIVE="azzel-${HORODATAGE}.tar.age"
DOSSIER_TMP="$(mktemp -d "${TMPDIR:-/tmp}/azzel-sauvegarde.XXXXXX")"
# Chemin absolu : la CLI d'export tourne depuis apps/web et interpréterait un
# TMPDIR relatif ailleurs, hors du dossier effacé par le trap.
DOSSIER_TMP="$(cd "$DOSSIER_TMP" && pwd)"
CONTENU="$DOSSIER_TMP/contenu"
ARCHIVE="$DOSSIER_TMP/$NOM_ARCHIVE"
mkdir -p "$CONTENU"

journal "mode ${MODE} : début (${NOM_ARCHIVE})."

# 1. Dump de la base (schéma public, sans propriétaires).
PGHOST="$PG_HOTE" PGPORT="$PG_PORT" PGUSER="$PG_UTILISATEUR" PGPASSWORD="$PG_MOTDEPASSE" \
  PGDATABASE="$PG_BASE" PGSSLMODE="$PG_SSL" PGCONNECT_TIMEOUT=15 \
  docker run --rm --quiet ${RESEAU_DOCKER[@]+"${RESEAU_DOCKER[@]}"} \
    -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE -e PGCONNECT_TIMEOUT \
    "$PG_IMAGE" pg_dump -Fc --schema=public --no-owner >"$CONTENU/base.dump" ||
  echec "pg_dump a échoué (image ${PG_IMAGE})."
[ -s "$CONTENU/base.dump" ] || echec "dump vide."
journal "dump : $(wc -c <"$CONTENU/base.dump" | tr -d ' ') octets."

# 2. Preuves, APRÈS le dump : vérifiées par sha256, manifeste écrit à côté.
if [ "$AVEC_PREUVES" -eq 1 ]; then
  (cd "$ROOT_DIR" && DATABASE_OWNER_URL="$DATABASE_OWNER_URL" \
    pnpm --silent -F @azzel/web preuves:exporter "$CONTENU") ||
    echec "export des preuves refusé : rien n'est envoyé."
  [ -s "$CONTENU/manifeste.json" ] || echec "manifeste absent après l'export des preuves."
fi

# 3. Archive chiffrée en flux : aucun tar en clair sur le disque.
tar -cf - -C "$CONTENU" . | age -r "$AGE_RECIPIENT" -o "$ARCHIVE" ||
  echec "archivage ou chiffrement age impossible (AGE_RECIPIENT valide ?)."
rm -rf "$CONTENU"
journal "archive chiffrée : $(wc -c <"$ARCHIVE" | tr -d ' ') octets."

# 4. Envoi, puis rétention seulement si tous les envois ont réussi.
envoyer() {
  local sous_dossier="$1"
  if [ "$DESTINATION_LOCALE" -eq 1 ]; then
    local partiel="$SAUVEGARDE_DESTINATION/$sous_dossier/.$NOM_ARCHIVE.partiel"
    mkdir -p "$SAUVEGARDE_DESTINATION/$sous_dossier" &&
      cp "$ARCHIVE" "$partiel" &&
      mv "$partiel" "$SAUVEGARDE_DESTINATION/$sous_dossier/$NOM_ARCHIVE" ||
      { rm -f "$partiel" 2>/dev/null; return 1; }
  else
    rclone copyto "$ARCHIVE" "$SAUVEGARDE_DESTINATION/$sous_dossier/$NOM_ARCHIVE"
  fi
}

lister() {
  local sous_dossier="$1"
  if [ "$DESTINATION_LOCALE" -eq 1 ]; then
    ls -1 "$SAUVEGARDE_DESTINATION/$sous_dossier"
  else
    rclone lsf --files-only "$SAUVEGARDE_DESTINATION/$sous_dossier/"
  fi
}

supprimer() {
  local chemin="$SAUVEGARDE_DESTINATION/$1/$2"
  if [ "$DESTINATION_LOCALE" -eq 1 ]; then
    rm -f "$chemin"
  else
    rclone deletefile "$chemin"
  fi
}

# Garde les N archives les plus récentes du sous-dossier (le nom horodaté UTC
# trie chronologiquement). Seuls les noms azzel-<horodatage>.tar.age sont
# candidats, et l'archive du jour n'est jamais supprimée.
appliquer_retention() {
  local sous_dossier="$1" garder="$2" liste total a_supprimer nom supprimees=0
  liste="$(lister "$sous_dossier")" || return 1
  liste="$(printf '%s\n' "$liste" | grep -E "$MOTIF_ARCHIVE" | sort || true)"
  [ -n "$liste" ] || return 0
  total="$(printf '%s\n' "$liste" | wc -l | tr -d ' ')"
  a_supprimer=$((total - garder))
  [ "$a_supprimer" -gt 0 ] || return 0
  for nom in $(printf '%s\n' "$liste" | head -n "$a_supprimer"); do
    [ "$nom" != "$NOM_ARCHIVE" ] || continue
    supprimer "$sous_dossier" "$nom" || return 1
    supprimees=$((supprimees + 1))
  done
  journal "rétention ${sous_dossier}/ : ${supprimees} archive(s) supprimée(s), ${garder} gardée(s)."
}

envoyer "$MODE" || echec "envoi vers la destination impossible : aucune purge de rétention."
journal "déposée : ${MODE}/${NOM_ARCHIVE}."
HEBDO=0
# SAUVEGARDE_JOUR_ISO : TESTS UNIQUEMENT (1 = lundi … 7 = dimanche), pour
# exercer la copie hebdo/ sans attendre dimanche. Jamais posée en production.
JOUR_ISO="${SAUVEGARDE_JOUR_ISO:-$(date -u +%u)}"
if [ "$MODE" = "quotidien" ] && [ "$JOUR_ISO" = "7" ]; then
  envoyer hebdo || echec "copie hebdomadaire impossible : aucune purge de rétention."
  journal "copie dimanche : hebdo/${NOM_ARCHIVE}."
  HEBDO=1
fi

if [ "$RETENTION" -gt 0 ]; then
  appliquer_retention "$MODE" "$RETENTION" || echec "rétention ${MODE}/ impossible (archive bien déposée)."
fi
if [ "$HEBDO" -eq 1 ]; then
  appliquer_retention hebdo "$RETENTION_HEBDO" || echec "rétention hebdo/ impossible (archive bien déposée)."
fi

SUCCES=1
battement ""
journal "mode ${MODE} : terminé."
