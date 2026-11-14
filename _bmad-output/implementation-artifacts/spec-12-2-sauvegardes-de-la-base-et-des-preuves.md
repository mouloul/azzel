---
title: 'Story 12.2 — Sauvegardes de la base et des preuves'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '099acbc62cd6c9cc9489e911825272636b0be1a3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le free tier Supabase ne sauvegarde rien. Une fausse manipulation, une panne ou la perte du projet effacerait dossiers, preuves de paiement et passages du jour J, sans retour possible.

**Approach:** Un script lancé par la crontab du VPS archive un dump Postgres et toutes les preuves (vérifiées par sha256), puis chiffre l'archive avec une clé publique `age`. Il l'envoie sur Backblaze B2 en région UE, applique la rétention et signale chaque passage par un battement de cœur.

**Décisions (Boss, 2026-11-14) :**
- **Stockage hors site** : Backblaze B2, région EU-Central (Amsterdam), dans l'offre gratuite de 10 Go. Le chiffrement `age` fait que B2 ne voit jamais que du chiffré. Le code reste générique (`rclone`, toute destination S3).
- **Pas de Supabase Pro** autour du jour J : la sauvegarde hors site suffit. À revoir au dry-run.
- **Restauration et vérification de l'archive : sorties de cette story** (voir `deferred-work.md`).

## Boundaries & Constraints

**Always :**
- Ordre : dump d'abord, preuves ensuite. Tout fichier référencé par le dump est alors présent dans l'archive, car les fichiers ne sont jamais supprimés hors rollback.
- Le dump passe par `DATABASE_OWNER_URL`, jamais par `DATABASE_URL`. Hors local, l'hôte est le pooler Supabase **en mode session (5432)**, jamais en mode transaction (6543) : l'hôte direct ne répond qu'en IPv6.
- Les preuves sont exportées via `getProofStore()`, avec la même configuration que l'application. Le sha256 de chaque fichier est comparé à `preuve.sha256`.
- Rien ne quitte la machine en clair : chiffrement avant envoi, dossier temporaire effacé dans tous les cas (`trap`).
- Une variable obligatoire absente provoque un arrêt immédiat qui la nomme. Tout échec donne un code de sortie non nul et appelle `$HEARTBEAT_URL_SAUVEGARDE/fail`. Le battement est facultatif et ne fait jamais échouer le script.
- Modes et rétention :
  - `quotidien` : base et preuves, 7 archives gardées ; le dimanche (UTC), une copie va aussi sous `hebdo/`, qui en garde 4 ;
  - `course` : base seule, les preuves étant figées depuis la clôture J-10 ; 24 archives gardées ;
  - `manuel` : base et preuves, gardées jusqu'à suppression explicite.

**Never :**
- La clé privée `age` n'est jamais sur le VPS, ni dans le dépôt, ni dans l'environnement.
- Aucune donnée personnelle dans les journaux ni dans le manifeste : clés opaques, sha256 et comptages seulement.
- Aucun service permanent ajouté, et pas de dépendance à `battement.ts` (story 12.1) : un `curl` suffit.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Comportement attendu | Gestion d'erreur |
|---|---|---|---|
| Nominal | `sauvegarde.sh quotidien`, tout configuré | `quotidien/azzel-<horodatage UTC>.tar.age` déposé, rétention appliquée, battement OK | — |
| Preuve active manquante | ligne `preuve` `active` sans fichier | rien n'est envoyé, sortie 1 | `/fail` ; la clé est nommée |
| Preuve remplacée manquante | ligne `replaced` sans fichier | avertissement dans le manifeste, la sauvegarde continue | — |
| sha256 divergent | octets lus ≠ `preuve.sha256` | rien n'est envoyé, sortie 1 | `/fail` ; la clé est nommée |
| Destination injoignable | échec de l'envoi | aucune purge de rétention, sortie 1 | `/fail` |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/proof-store.ts` -- `getProofStore()`, `ProofStore.read`, `sha256Hex`, `LocalDiskProofStore` (pour les tests). Ne pas modifier l'interface.
- `apps/web/src/modules/inscriptions/migrations/0005_preuve.sql` -- table `preuve` (`storage_key`, `sha256`, `status`).
- `apps/web/src/modules/inscriptions/echeances-cli.ts` -- patron de CLI : `postgres(... max:1, prepare:false, exigeTls)`, garde `invokedDirectly`, `process.exitCode`.
- `apps/web/src/modules/iam/env.ts` -- `readEnv`, lecture du `.env`.
- `README.md` §Notifications -- emplacement de la crontab VPS et des Scheduled Tasks Coolify.

## Tasks & Acceptance

**Execution :**
- [x] `apps/web/src/modules/sauvegarde/exporter.ts` (+ `.test.ts`) -- `exporterPreuves(sql, store, dossier)` : écrit chaque preuve sous son nom de clé, vérifie son sha256, puis écrit `manifeste.json` (horodatage, dernière migration, comptages par table de `public`, clés et sha256, avertissements). Tests sur `LocalDiskProofStore` couvrant les lignes de la matrice.
- [x] `apps/web/src/modules/sauvegarde/exporter-cli.ts` + `apps/web/package.json` -- commande `preuves:exporter <dossier>` via `DATABASE_OWNER_URL`, sur le patron d'`echeances-cli.ts`.
- [x] `scripts/sauvegarde.sh` -- `pg_dump -Fc --schema=public --no-owner` via `docker run --rm $PG_IMAGE` (défaut `postgres:17-alpine`), export des preuves (sauf en mode `course`), `tar`, chiffrement `age -r $AGE_RECIPIENT`, envoi `rclone copyto` vers `$SAUVEGARDE_DESTINATION` (ou `cp` si c'est un chemin local), rétention, battement.
- [x] `.env.example` -- `AGE_RECIPIENT`, `SAUVEGARDE_DESTINATION`, `PG_IMAGE`, `HEARTBEAT_URL_SAUVEGARDE`.
- [x] `docs/exploitation-sauvegardes.md` + lien depuis `README.md` -- compte B2 EU et clé applicative limitée au bucket, `rclone config`, installation d'`age`, génération de la paire de clés et lieu de garde de la clé privée, crontab (quotidien 02:30 UTC ; horaire en mode `course` le jour J ; `manuel` avant le départ et après l'arrivée), estimation de volume face aux 10 Go, décision Supabase Pro.

**Acceptance Criteria :**
- Étant donné dev-db migré et le jeu de démonstration chargé, quand on lance `sauvegarde.sh manuel` vers un dossier local, alors une archive est produite et le battement est appelé (doublure locale).
- Étant donné cette archive, quand on la lit sans clé privée, alors son en-tête est `age-encryption.org` et rien n'est lisible ; avec la clé, le dump passe `pg_restore --list` et les preuves correspondent au manifeste.
- Étant donné une 8e archive `quotidien`, quand elle est déposée, alors la plus ancienne est supprimée et les archives `manuel` restent intactes.

## Implementation Notes

- Statut `refusée` (migration 0044, absent de la matrice) traité comme une preuve non active : avertissement s'il manque. Un sha256 divergent reste bloquant quel que soit le statut.
- Garde-fous ajoutés : l'export refuse un rôle sans `rolsuper`/`rolbypassrls` (sinon zéro preuve en silence) ; le script refuse le port 6543 et une clé `AGE-SECRET-KEY-` dans `AGE_RECIPIENT` ; le mot de passe passe à `docker` par l'environnement, pas en argument.
- Docker : `--network host` sous Linux ; sous macOS une base locale est jointe par `host.docker.internal`.
- Tests : `exporter.test.ts` (7), `exporter.integration.test.ts` (2), `sauvegarde-script.integration.test.ts` (2, lance le vrai script : nominal + rétention, destination injoignable ; saut si docker/age absents, échec si `AZZEL_REQUIRE_DB`).
- Non vérifié : un vrai bucket B2 (la doc exige la règle de cycle de vie `daysFromHidingToDeleting: 1`, sans laquelle la rétention ne libère rien) ; que le rôle propriétaire Supabase (`postgres`) a bien `BYPASSRLS` — à contrôler sur la recette avant la mise en production.
- Prérequis hôte : clone du dépôt + Node/pnpm, Docker, `age`, `rclone`, `.env` reprenant `PROOF_STORAGE_*` ; ne tourne pas en Scheduled Task Coolify (crontab de l'hôte).

## Spec Change Log

## Verification

**Commands :**
- `pnpm -F @azzel/web typecheck` -- aucune erreur
- `pnpm vitest run apps/web/src/modules/sauvegarde` -- vert
- dev-db + `db:migrate` + `seed`, puis `bash scripts/sauvegarde.sh manuel` vers un dossier temporaire, puis `age -d` et `pg_restore --list` -- archive lisible avec la clé, illisible sans

## Review Triage Log

Passe 1 (2026-11-14) — couches : blind-hunter (BH), edge-case-hunter (ECH), verification-gap (VG).

| # | Couche | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | VG | CI : `age` non installé alors que `AZZEL_REQUIRE_DB=1` → le test du script lève à la collecte | high | `.github/workflows/ci.yml` pose `AZZEL_REQUIRE_DB: '1'`, aucune étape d'installation d'`age`/`rclone` | patch |
| 2 | VG, BH | Mode `course` (base seule, 24 gardées) jamais exécuté par un test | medium | seul `quotidien` est lancé dans `sauvegarde-script.integration.test.ts` | patch |
| 3 | VG, BH | Copie `hebdo/` du dimanche et rétention 4 non testées (jour non injectable) | medium | `date -u +%u` lu en dur ; aucun test ne lit `hebdo/` | patch |
| 4 | VG, BH | Garde-fous (6543, `AGE-SECRET-KEY-`, variable absente, mode inconnu) et refus sha/preuve manquante non testés au niveau du script | medium | aucune occurrence dans les tests ; seule `ecrireExport` est couverte | patch |
| 5 | VG | Branche `rclone` (production) jamais exécutée | medium | les tests passent un chemin absolu → branche `cp` | patch |
| 6 | BH | AC2 (`pg_restore --list`, sha256 vs manifeste) non automatisé | medium | le test ne vérifie que la présence de 3 entrées du tar | patch |
| 7 | VG, BH, ECH | Journal de rétention : compte annoncé ≠ suppressions réelles | low | `a_supprimer` calculé avant la boucle qui saute `NOM_ARCHIVE` ; correction directe | patch |
| 8 | ECH | `TMPDIR` relatif → preuves en clair écrites sous `apps/web/` hors du nettoyage | low | la CLI résout le chemin depuis `apps/web` ; correction directe (`cd && pwd`) | patch |
| 9 | BH | README : ligne cron sans `PATH=` → « node introuvable » sous cron | medium | README l.131 ; la doc §6 exige `PATH=` | patch |
| 10 | BH | `.env.example` : bloc « DÉPLOIEMENT HÉBERGÉ » contredit l'usage de `DATABASE_OWNER_URL` dans le `.env` d'hôte | medium | l.21-25 « aucun usage à l'exécution » | patch |
| 11 | BH | Doc : archives `course` annoncées avec `manifeste.json` | medium | doc l.28 ; le manifeste n'est écrit que par l'export des preuves | patch (doc) |
| 12 | BH, ECH | Manifeste et dump : deux instantanés distincts | medium | dump puis inventaire dans une autre transaction | patch (doc : comptages postérieurs au dump, bornes) + defer (alignement d'instantané) |
| 13 | BH, ECH | Pas de verrou contre deux passages simultanés | low | chevauchement improbable (dump de quelques secondes) ; `flock -n` dans les lignes crontab de la doc = correction directe | patch (doc) |
| 14 | BH | Doc §5 : `tar -C ./restauration` sans `mkdir -p` ; `jq`/`shasum` non signalés | low | `tar -C` ne crée pas le dossier ; correction directe | patch (doc) |
| 15 | BH | Espace disque temporaire non documenté (≈ 2 × archive) | low | correction directe d'une ligne de doc | patch (doc) |
| 16 | VG | `PGSSLMODE=require` hors local non vérifié par un test | maybe-false | exige un faux binaire `docker` ; si régression : dump en clair (high) | defer |
| 17 | ECH | SIGKILL/OOM : dossier temporaire en clair laissé | low | rare, `/tmp` purgé au reboot ; le correctif ajoute un balayage | rejeté |
| 18 | ECH | Pas de timeout global | low | un passage bloqué ne bat pas : Better Stack alerte à l'expiration du battement | rejeté |
| 19 | ECH | Erreur transitoire du stockage → toute la sauvegarde échoue | low | échec bruyant avec `/fail`, rejeu manuel ; un retry ajoute des branches | rejeté |
| 20 | ECH | `PROOF_STORAGE_DRIVER` absente → échec attribué à des preuves manquantes | low | échec bruyant au premier passage ; garde = complexité ajoutée | rejeté |
| 21 | ECH | `exigeTls` et IPv6 littéral `[::1]` | low | comportement antérieur de `exigeTls`, cas improbable | rejeté |
| 22 | ECH | Dossier d'export réutilisé non vide | low | le script crée toujours un `mktemp` neuf | rejeté |
| 23 | ECH | `curl` absent, battement silencieux | low | l'absence de battement déclenche l'alerte Better Stack | rejeté |
| 24 | BH | `verify-full`/`verify-ca` inopérants, TLS sans vérification du certificat | low | même posture que l'app (`ssl: 'require'`) ; `verify-*` échoue bruyamment | rejeté |
| 25 | BH | Manifeste sans sha du dump, mode, commit | low | amélioration : ajout de champs et de paramètres | rejeté |
| 26 | BH | Montage de tests dupliqué ; branche `dejaEcrites` non testée | low | divergence future détectée par l'échec des tests eux-mêmes | rejeté |
| 27 | VG | Le `.env` du dépôt peut influencer le test du script | low | seules `PG_IMAGE` et variables non posées ; test explicite sur l'essentiel | rejeté |
| 28 | BH | Doc volumes : archives `manuel` sous-comptées | low | estimation indicative | rejeté |
