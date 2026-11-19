---
title: 'Story 12.1 (lot A) — Être alerté : erreurs serveur, santé, battements des crons'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '53f09df7c1074c6f6c9dc61d594a44d586fc9d71'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aujourd'hui, une panne en production n'est vue par personne : les erreurs serveur ne remontent nulle part, personne ne sait si le site répond, et un cron arrêté passe inaperçu. Boss l'apprendrait par un coureur ou par le comité.

**Approach:** Brancher Sentry (région UE) côté serveur web. Il reçoit les erreurs de rendu via `onRequestError`, et les erreurs d'API via les points uniques où elles deviennent un 500. Un masquage RGPD commun est placé dans `packages/shared`. On expose `GET /api/sante` pour un moniteur externe, et chaque cron VPS envoie un battement de cœur. Tout reste inerte tant que les variables d'environnement sont absentes.

**Décisions (Boss, 2026-11-14 et 2026-11-19) :**
- Story 12.1 découpée : seul le lot A est ici. Le journal JSON (B), Sentry sur Expo (C) et le SDK navigateur (D) sont dans `deferred-work.md`.
- Alertes envoyées à Boss seul.

## Boundaries & Constraints

**Always :**
- Sans `SENTRY_DSN`, rien ne s'initialise et aucun appel réseau n'est fait. Sans `HEARTBEAT_URL_<NOM>`, aucun battement. Dev local, tests et CI restent inchangés.
- Réglages Sentry : `sendDefaultPii: false`, `tracesSampleRate: 0`, pas de replay, `environment` = `SENTRY_ENVIRONMENT`. Chaque événement passe par le masquage commun avant envoi.
- Masquage :
  - par valeur : emails, numéros de téléphone (formats algérien et français), clés de preuve (`<uuid>.<ext>`), jetons (JWT, `Bearer …`) ;
  - par nom de clé : `email`, `telephone`, `nom`, `prenom`, `latitude`/`longitude`/`lat`/`lon`, `password`, `token`/`jeton`, `cookie`, `authorization` ;
  - côté requête, on supprime `cookies`, `data` et les en-têtes `cookie`/`authorization` ;
  - l'utilisateur est réduit à son `id`.
- Les 16 points qui produisent un 500 générique (10 fichiers `modules/*/errors.ts` et `app/api/volontaires/guard.ts`) passent par une fonction unique. Elle fait ce que fait déjà `journaliserErreurInattendue`, puis appelle `captureException` avec une étiquette `module`.
- `battement(nom, issue)` : délai de 5 s, ne lève jamais. Succès vers l'URL, échec vers l'URL suffixée `/fail`. L'issue suit `process.exitCode`, ou une exception non rattrapée.
- `/api/sante` : un `select 1` borné à 3 s. Réponse `200 {"ok":true}` ou `503 {"ok":false}`, toujours en `Cache-Control: no-store`, sans aucun détail sur l'infrastructure.
- Le bundle client ne grossit pas : `pnpm budget` donne le même verdict avant et après.

**Never :**
- Pas de SDK navigateur, pas d'`instrumentation-client.ts`, pas de Sentry sur Expo (lots C et D).
- Pas de migration des `console.*` existants (lot B).
- Aucune donnée personnelle dans un événement, ni dans la réponse de santé.
- `withSentryConfig` ne s'applique que si `SENTRY_AUTH_TOKEN` est présent au build. Sinon, `next.config.ts` produit exactement la même configuration qu'aujourd'hui.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Comportement attendu | Gestion d'erreur |
|---|---|---|---|
| Erreur d'API non classée | un store lève, `SENTRY_DSN` posé | réponse 500 inchangée ; une capture avec l'étiquette `module` ; ligne de journal conservée | — |
| Sans DSN | même erreur, pas de `SENTRY_DSN` | réponse et journal identiques ; aucun envoi | — |
| Événement avec données personnelles | email, téléphone, clé de preuve, jeton, `latitude`, cookie | tout est remplacé par `[masqué]` ou supprimé ; `user` = `{ id }` | — |
| Santé nominale | base qui répond | `200 {"ok":true}`, `no-store` | — |
| Base muette ou absente | délai de 3 s dépassé, ou pas de `DATABASE_URL` | `503 {"ok":false}`, `no-store`, aucun détail | — |
| Cron réussi | `exitCode` 0, URL posée | un seul appel à l'URL | — |
| Cron en échec | `exitCode` 1, ou exception | un seul appel à `URL/fail` ; le code de sortie est conservé | — |
| Moniteur en panne | l'URL du battement répond 500 ou dépasse le délai | le cron garde son propre code de sortie | battement avalé |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/errors.ts` -- `journaliserErreurInattendue` (fix `897db75`) : patron à généraliser. Il y a 3 sites `status: 500`.
- `apps/web/src/modules/{chrono,contenus,iam,missions,rapports,retour-images,sponsors,tracking}/errors.ts`, `apps/web/src/app/api/volontaires/guard.ts` -- les autres sites `status: 500` (`git grep -n "status: 500" -- 'apps/web/src/*.ts' ':!*.test.ts'`).
- `apps/web/src/lib/lecture-bornee.ts` -- patron `borner`/`lectureBorneeOuIndisponible`, à réutiliser pour `/api/sante`.
- `apps/web/src/db/client.ts` -- `getDbClient()` (pool unique, peut valoir `null`).
- `apps/web/src/modules/notifications/send-cli.ts`, `notifications/j7-cli.ts`, `inscriptions/echeances-cli.ts` -- les crons VPS (`EMAILS`, `J7`, `ECHEANCES`). Garde `invokedDirectly` + `main().catch`.
- `apps/web/next.config.ts` -- `export default nextConfig` : seul point d'emballage de `withSentryConfig`.
- `packages/shared/src/index.ts` -- barrel. Le masquage est générique, sans dépendance Sentry, et réutilisable par Expo (lot C).
- `README.md` §Notifications (crontab et Scheduled Tasks) ; `scripts/sauvegarde.sh` envoie déjà son battement par `curl` : à ne pas modifier.
- `@sentry/nextjs` 11.14.0 (dernière version, pair `next ^16`).
- Pas de keep-alive Supabase dans le dépôt : le cron horaire des échéances interroge la base, donc la pause de 7 jours n'arrive jamais. Aucun battement `KEEPALIVE`.

## Tasks & Acceptance

**Execution :**
- [x] `packages/shared/src/masquage.ts` (+ `.test.ts`, export dans l'index) -- `masquerDonneesPersonnelles<T>(valeur: T): T`, récursif et sans muter l'entrée, appliquant les règles « par valeur » et « par nom de clé ». Tests couvrant chaque famille de règle.
- [x] `apps/web/src/lib/observabilite.ts` (+ `.test.ts`) -- `optionsSentry()` (DSN, environnement, réglages imposés, `beforeSend` = traitement de la requête et de l'utilisateur, puis `masquerDonneesPersonnelles`) ; `signalerErreurInattendue(module, error)` = `console.error` actuel + `captureException(error, { tags: { module } })`.
- [x] `apps/web/instrumentation.ts` -- `register()` : `Sentry.init(optionsSentry())` si `NEXT_RUNTIME === 'nodejs'` et `SENTRY_DSN` présent ; `export const onRequestError = Sentry.captureRequestError`.
- [x] Les 10 `errors.ts` + `guard.ts` -- chaque branche 500 générique appelle `signalerErreurInattendue`. `journaliserErreurInattendue` est remplacée.
- [x] `apps/web/src/app/api/sante/route.ts` (+ `.test.ts`) -- route de santé (`dynamic = 'force-dynamic'`, `runtime = 'nodejs'`).
- [x] `apps/web/src/lib/battement.ts` (+ `.test.ts`) -- `battement(nom, issue)` et `terminerAvecBattement(nom, main)`. Branché dans les 3 CLI de cron.
- [x] `apps/web/next.config.ts` -- emballage conditionnel `withSentryConfig` (upload des source maps seulement).
- [x] `apps/web/package.json` -- dépendance `@sentry/nextjs` (version exacte).
- [x] `.env.example` + `docs/exploitation-observabilite.md` (lien depuis `README.md`) -- variables `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN`, `HEARTBEAT_URL_EMAILS`/`_ECHEANCES`/`_J7`. Création de l'organisation Sentry directement en région UE (`de.sentry.io`), spike protection, `ignoreErrors`. Better Stack : moniteurs sur `/` et `/api/sante`, battements des 3 crons et de la sauvegarde, alertes par email à Boss, lecture des CGU (repli Healthchecks.io + UptimeRobot). Comment lire un événement, comment basculer vers GlitchTip, ajout au registre des sous-traitants.

**Acceptance Criteria :**
- Étant donné aucune variable d'observabilité, quand on lance `pnpm test` et `pnpm budget`, alors tout est vert et le verdict du budget est inchangé.
- Étant donné un `SENTRY_DSN` factice pointant vers un faux serveur local, quand une route d'API produit un 500 générique, alors le serveur reçoit un événement étiqueté `module`, sans donnée personnelle.

## Spec Change Log

## Verification

**Commands :**
- `pnpm typecheck` -- aucune erreur
- `pnpm vitest run packages/shared/src/masquage.test.ts apps/web/src/lib apps/web/src/app/api/sante` -- vert
- `AZZEL_REQUIRE_DB=1 pnpm test` -- vert (aucune régression sur les tests des `errors.ts`)
- `pnpm budget` -- même verdict qu'avant le changement (mesurer d'abord sur `main`)

## Implementation Notes

- `instrumentation.ts` placé dans `apps/web/src/` (Next l'exige quand l'app vit sous `src/`). `withSentryConfig` importé de `@sentry/nextjs/config` (v11).
- La branche 500 `PreuveStorageError` de `toAdminApiError` est aussi signalée (16 points).
- Budget (mesuré par la session, 2026-11-19) : `main` propre déjà en échec (395 294 o, carte 3D absente) ; branche 397 917 o, Script 151 857 o contre 151 820 o (noms de chunks seulement) — aucun SDK Sentry côté client ; l'écart vient de la catégorie Other (ressource comptée deux fois). Verdict inchangé.
- Implémentation déléguée à un sous-agent Sonnet ; revue et tri par la session.

- Relecture des patchs par la session (2026-11-19, passe 2) : 12 patchs vérifiés dans le code. Deux reprises directes : plage d'accents écrite `\u0300-\u036f` dans `normaliserCle` (n° 5, restée en caractères littéraux) ; `/api/cron/echeances` ne journalise plus deux fois un 500 (le `console.error` du `catch` est réservé aux 503 base, le 500 passant par `signalerErreurInattendue`).
- Vérification rejouée par la session : `pnpm typecheck` vert ; `AZZEL_REQUIRE_DB=1 pnpm test` 248 fichiers, 3 431 tests verts (8 ignorés) ; budget mesuré sur les deux arbres dans la même session — `main` 53f09df : chemin critique 309 457 o, Script 151 820 o, poids réel 397 890 o ; branche : 309 488 o, 151 857 o, 397 910 o. Mêmes trois échecs préexistants (chemin critique, poids réel, carte 3D absente) : verdict inchangé. Aucune occurrence de « sentry » dans `.next/static`.

## Review Triage Log

Passe 1 (2026-11-19) — couches sur Sonnet : blind-hunter (BH), edge-case-hunter (ECH), verification-gap (VG) ; tri par la session. VG a lu le dossier principal au lieu du worktree (paquet « absent ») : ses constats sur le paquet sont écartés.

| # | Couche | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | BH, ECH | En-têtes (`x-forwarded-for`, `x-real-ip`, `set-cookie`, `x-api-key`), `query_string` et requête de l'URL envoyés à Sentry | medium | `nettoyerEvenement` ne retire que cookie/authorization ; l'IP est une donnée personnelle | patch |
| 2 | BH, ECH | Liste de clés sensibles trop étroite (`access_token`, `secret`, `session`, `phone`, `name`, `adresse`, `ip`…) | medium | égalité stricte après normalisation | patch |
| 3 | BH | Motifs téléphone peuvent mordre un `event_id`/id hexadécimal | low | lookbehind `(?<![\d.])` laisse passer une lettre ; correction directe des bornes | patch |
| 4 | ECH | Regex email non bornée : backtracking quadratique sur une longue chaîne | low | `[…]+@` sans borne ; correction directe `{1,64}`/`{1,255}` | patch |
| 5 | VG | Plage d'accents écrite en caractères combinants littéraux | low | `normaliserCle` ; correction directe `\u0300-\u036f` | patch |
| 6 | session | `battement` lit `process.env` au lieu de `readEnv` : le `.env` n'est vu que si le CLI a déjà appelé `readEnv` | medium | `battement.ts` ; les crons VPS se configurent par `.env` | patch |
| 7 | ECH | `/api/sante` : `getDbClient()` hors `try` → 500 Next au lieu de 503 | low | `readDatabaseUrl`/`postgres()` peuvent lever ; correction directe | patch |
| 8 | VG | `/api/cron/echeances` : 500 non signalé à Sentry | medium | `route.ts` catch → `console.error` seul | patch |
| 9 | VG | Câblage des 16 mappers vers `signalerErreurInattendue` non testé | medium | seul l'helper est testé | patch |
| 10 | VG | `register()` (inertie sans DSN, garde edge, réglages) non testé | medium | aucun test d'`instrumentation.ts` | patch |
| 11 | BH, ECH | Serverless (recette Vercel) : capture sans flush, événements perdables | low | prod = VPS (processus long) ; correction directe = mention dans la doc | patch (doc) |
| 12 | BH | Doc : « erreurs de rendu » sans préciser que le client est exclu ; 503 base non signalés ; exemple crontab sans `HEARTBEAT_URL_*` | low | correction directe de la doc | patch (doc) |
| 13 | VG | `next.config.ts` avec jeton : `headers` préservé non testé | maybe-false | dépend de `withSentryConfig` ; si perdu : en-têtes de sécurité absents (high) | defer |
| 14 | VG | Noms de battement des 3 CLI non vérifiés | maybe-false | derrière `invokedDirectly` ; à vérifier en recette (URL locale) — faute de nom = cron muet (medium) | defer |
| 15 | BH | Export `DELAI_SANTE_MS` invalide dans une route | false | `pnpm budget` (build Next 16) passe sur la branche | rejeté |
| 16 | ECH | `@sentry/nextjs` tiré dans le bundle client via `errors.ts` | false | Script 151 857 o contre 151 820 o sur `main` | rejeté |
| 17 | BH, ECH | Requête `select 1` orpheline / sonde publique sans limite | low | toute page vitrine interroge déjà la base ; base muette = tout est muet | rejeté |
| 18 | BH, ECH | `Map`/`Set`/`Buffer`/getters dans `masquer` | low | Sentry normalise l'événement avant `beforeSend` | rejeté |
| 19 | ECH | URL de battement avec query string ; `exitCode` pré-positionné | low | URL Better Stack sans query ; CLI mono-tâche | rejeté |
| 20 | ECH | `beforeBreadcrumb` absent | false | les breadcrumbs font partie de l'événement masqué par `beforeSend` | rejeté |
| 21 | ECH | Branche `PreuveStorageError` désormais signalée | false | voulu : panne de stockage = erreur inattendue | rejeté |
| 22 | ECH | « 10 fichiers errors.ts » dans la spec | low | 9 `errors.ts` + `guard.ts` = 10 fichiers, 16 sites ; correction = éditer la spec | rejeté |
| 23 | BH | CLI de cron sans Sentry, sans `/start`, sans retry | low | hors périmètre : `/fail` + journal VPS | rejeté |
| 24 | BH | Destinataire unique, `ignoreErrors` manuel, procédure de recette | low | décision de Boss ; recette à la clôture d'épopée (AGENTS.md) | rejeté |
| 25 | VG | `retour-en-images/page.tsx` avale une erreur | low | antérieur, dégradation voulue | rejeté |
| 26 | BH | Source maps publiques après upload | low | upload inactif sans jeton | rejeté |
