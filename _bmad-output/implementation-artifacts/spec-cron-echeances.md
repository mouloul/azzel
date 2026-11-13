---
title: 'Déclenchement automatique du balayage des échéances (expiration et rappel)'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'dispatch'
baseline_commit: '413982d6b6a8807e8b67caf12ab9f1aec4294a9d'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'expiration des dossiers sans preuve et le rappel de la veille ne tournent que si quelqu'un lance à la main la commande `inscriptions:echeances` depuis un poste. En recette comme en production, aucun dossier n'expire, aucune place n'est rendue, aucun rappel ne part.

**Approach:** Décisions PO (13/11/2026) :
- **Production (VPS IONOS)** : la crontab système lance la commande existante `inscriptions:echeances` toutes les heures, comme `emails:send` et `emails:j7` (convention du README) — aucune route, aucun secret.
- **Recette (Vercel, sans crontab)** : le balayage est exposé par une route API protégée par un secret, appelée par **deux déclencheurs** — un cron Vercel quotidien (seule fréquence permise par l'offre Hobby) en filet de sécurité, et un workflow GitHub Actions horaire.

Le balayage est idempotent : un double passage est sans effet.

## Boundaries & Constraints

**Always:**
- Une seule logique de balayage (rappels, puis expirations, puis envoi de la file d'emails), partagée par la commande `inscriptions:echeances` et la route — extraite de `echeances-cli.ts`, pas dupliquée.
- Route `GET /api/cron/echeances` : exige `Authorization: Bearer <CRON_SECRET>` (en-tête qu'envoie Vercel Cron quand la variable `CRON_SECRET` est posée) ; comparaison en temps constant ; `CRON_SECRET` absente ou vide → 503, jamais d'accès ouvert ; mauvais secret → 401 ; succès → 200 avec le bilan JSON (rappels, expirées, emails enfilés, emails envoyés) ; base injoignable → 503. Exécution Node, jamais mise en cache.
- `apps/web/vercel.json` (racine du projet Vercel = `apps/web`) : un cron quotidien à 06:00 UTC (07:00 à Alger) sur cette route.
- `.github/workflows/echeances.yml` : planifié toutes les heures (minute décalée, pas `:00`) + déclenchement manuel ; appelle la route avec les secrets de dépôt `CRON_SECRET` et `AZZEL_ECHEANCES_URL` ; échoue (rouge) si la réponse n'est pas 2xx ; ne fait rien d'autre (pas de checkout, pas d'installation).
- Documentation : `.env.example` (`CRON_SECRET`, recette seulement) ; `deploiement-recette.md` (variable Vercel, secrets GitHub, test manuel par `curl` et par « Run workflow ») ; `README.md`, section des crons VPS : ligne horaire `inscriptions:echeances` (minute décalée) à côté de `emails:send` et `emails:j7`, avec l'équivalent « Scheduled Tasks » si Coolify.

**Never:**
- Pas de changement des règles d'échéance, de rappel ou d'expiration.
- Aucun secret en dur, aucun secret dans les journaux ni dans la réponse.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu |
|---|---|---|
| Appel autorisé | bon `Bearer`, dossiers échus | 200, bilan ; dossiers expirés, emails enfilés et envoyés |
| Rejoué aussitôt | même appel une seconde fois | 200, bilan à zéro (idempotent) |
| Mauvais secret | `Bearer` faux ou absent | 401, rien n'est fait |
| Secret non configuré | `CRON_SECRET` vide côté serveur | 503, rien n'est fait |
| Base injoignable | erreur de connexion | 503, enveloppe d'erreur, pas de trace du secret |
| Commande locale | `pnpm -F @azzel/web inscriptions:echeances` | même bilan qu'avant, même logique |

</frozen-after-approval>

## Code Map

**Racine de travail : `/Users/mouloudhaouili/Desktop/ouidou/Azzel-cron` (worktree git, branche `feat/cron-echeances`).** Tous les chemins relatifs s'y résolvent ; ne rien lire ni modifier sous `/Users/mouloudhaouili/Desktop/ouidou/Azzel` (autre branche en cours). Ne pas commiter.

- `apps/web/src/modules/inscriptions/echeances-cli.ts` -- logique actuelle (rappels → expirations → `processOutbox`) à extraire dans une fonction réutilisable ; la commande devient un appelant.
- `apps/web/src/modules/inscriptions/store.ts` -- `enfilerRappelsPreuve`, `expirerInscriptionsEchues` (inchangés).
- `apps/web/src/modules/notifications/worker.ts` -- `processOutbox`, `clampOutboxLimit`, `DEFAULT_OUTBOX_LIMIT`.
- `apps/web/src/app/api/` -- routes existantes : patron d'enveloppe d'erreur et d'accès base (`getInscriptionsStore`, client partagé `@/db/client`).
- `apps/web/src/modules/iam/env.ts` -- `readEnv`.
- `.env.example`, `_bmad-output/implementation-artifacts/deploiement-recette.md`, `README.md` (l.79-92 : crons VPS existants).
- `.github/workflows/ci.yml` -- patron des workflows existants.

## Tasks & Acceptance

**Execution:**
- [x] `modules/inscriptions/echeances.ts` (nouveau) -- `balayerEcheances(deps, maintenant)` ; `echeances-cli.ts` l'appelle.
- [x] `app/api/cron/echeances/route.ts` (nouveau) -- garde du secret, appel, bilan ; tests de route (matrice).
- [x] `apps/web/vercel.json` -- cron quotidien.
- [x] `.github/workflows/echeances.yml` -- planification horaire + manuelle.
- [x] `.env.example`, `deploiement-recette.md`, `README.md` -- configuration recette, test, cron VPS de production.

**Acceptance Criteria:**
- Given `CRON_SECRET` posé sur Vercel et dans les secrets GitHub, when le workflow « Run workflow » est lancé, then il passe au vert et les dossiers échus de la recette sont expirés.

## Implementation Notes

- `balayerEcheances(deps, maintenant, options?)` (`modules/inscriptions/echeances.ts`) rend le bilan brut (`rappels`, `expirees`, `emailsExpiration`, `envoi`). Options : `plafondEnvoi` (borne la file du passage) et `progression` (rappelée après chaque étape). La commande s'en sert pour journaliser rappels puis expirations au fil de l'eau, comme avant ; elle garde sa connexion propre, le comptage des impasses et ses codes de sortie.
- Route : plafond de la file à 30 emails par appel (un transport SMTP par email, `maxDuration = 60`) ; le reste part au passage suivant.
- Bilan JSON : `rappels`, `expirees`, `emailsEnfiles` (= rappels + avis d'expiration enfilés par CE passage), `emailsEnvoyes`, `emailsEnEchec`.
- Statuts au-delà de la matrice : `502 cron.emails_failed` (au moins un email en échec, bilan joint — même verdict que la commande qui sort en 1) ; `503 cron.outbox_unavailable` (file illisible en tout ou partie, message distinct si une partie est partie, bilan joint) ; `503 cron.db_not_configured` (`DATABASE_URL` absente, vérifié après l'authentification) ; `503 cron.db_misconfigured` ; `500 cron.internal_error`.
- Secret : rogné côté serveur et côté jeton reçu, schéma `Bearer` insensible à la casse, 32 caractères minimum (sinon 503 `cron.not_configured`).
- Base injoignable : la garde de rôle (`protegerStore`) interroge la base avant `withDb` et laisse passer une erreur de connexion brute — `isConnectionError` est exportée de `inscriptions/store.ts`, et les codes du client `postgres` (`CONNECT_TIMEOUT`, `CONNECTION_CLOSED`, `CONNECTION_ENDED`, `CONNECTION_DESTROYED`) rejoignent `CONNECTION_ERROR_CODES` (donc aussi traduits par `withDb` pour les autres routes `inscriptions`).
- Workflow : statut HTTP lu explicitement (`--write-out`), pas `--fail` — un 3xx passerait sinon au vert ; `--max-time 75`, `--retry-max-time 240`, `timeout-minutes: 6` ; URL en variable de dépôt `vars.AZZEL_ECHEANCES_URL`, secret `CRON_SECRET`.
- Docs : `deploiement-recette.md` (note `vercel.json` amendée, section 5 bis, étape 9 de la vérification) ; `note-archi-winston-deploiement-vercel.md` §7.7 : ligne d'amendement datée, décision d'origine conservée.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | BH, EC | File jusqu'à 500 emails sous `maxDuration = 60` → 504, doublons | medium | `clampOutboxLimit` ; un transport SMTP par email | patch |
| 2 | BH, EC | 200 malgré des emails en échec ; message `outbox_unavailable` inexact | medium | La commande sort en 1 dans ce cas | patch |
| 3 | BH, EC | Secret : espaces/retour à la ligne → 401 permanent ; pas de longueur minimale ; `bearer` en minuscules refusé | medium | `trim()` pour l'absence, valeur brute pour la comparaison | patch |
| 4 | VG, EC | `DATABASE_URL` absente rendue « réessayez » | low | `DbUnavailableError('DATABASE_URL absente')` | patch |
| 5 | BH | Codes de connexion postgres en deux listes | low | `CODES_CONNEXION_POSTGRES` hors `CONNECTION_ERROR_CODES` | patch |
| 6 | BH, VG, EC | Commande : « Rappels » plus journalisé avant les expirations | low | Régression du refactor | patch |
| 7 | VG | Tests du bilan incapables de détecter une inversion de champs | medium | Fixtures à valeurs égales | patch |
| 8 | BH, EC | Workflow : timeout < pire cas de curl ; URL masquée en secret | low | 390 s > 300 s | patch |
| 9 | BH | Doc : codes manquants, « bilan à zéro » inexact, route seul chemin de reprise | low | § 5 bis | patch |
| 10 | BH | Note d'archi § 7.7 « Pas de vercel.json » contredite | low | Deux documents en contradiction | patch (amendement daté) |
| 11 | EC | Rappel en file non envoyé puis dossier expiré : rappel reçu après l'avis d'expiration | low | Cas rare (file en échec entre deux passages) ; correctif = annulation dans l'expiration | rejeté |
| 12 | EC | Route présente dans le build du VPS de production | low | Inerte sans `CRON_SECRET` (503) ; protégée si posée | rejeté |
| 13 | EC | Deux passages simultanés : rappel enfilé pour un dossier qui vient d'expirer | low | Course étroite entre déclencheurs décalés (06:xx / :17) | rejeté |
| 14 | BH | Spec absente du diff | false | Suivie au commit | rejeté |

Reporté : déclencheur de `emails:j7` en recette (aucun aujourd'hui) — voir `deferred-work.md`.

## Verification

**Commands:**
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` -- expected: aucune erreur
- `AZZEL_REQUIRE_DB=1 node_modules/.bin/vitest run` -- expected: suite complète verte (node : `PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`). ⚠ Base de test partagée avec une autre implémentation en cours : pendant l'implémentation, lancer seulement les tests unitaires et les tests de route concernés (`vitest run <fichiers>`, sans `*.integration.test.ts`) ; la suite complète est lancée ensuite par l'orchestrateur.
