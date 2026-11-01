---
title: 'Story 8.1 — Fabrique de connexion unique (volet code)'
type: 'refactor'
created: '2026-11-01'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1e190374b0b5c3f01cdea9e4ee3f1afe5bcaf25f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** dix modules instancient chacun leur propre pool `postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 })`, soit jusqu'à cinquante connexions par instance de processus, et aucun ne désactive les requêtes préparées. Derrière un pooler en mode transaction — la cible de l'épopée 8 — les requêtes préparées nommées ne sont pas supportées : des erreurs `prepared statement already exists` surviendront dès qu'une connexion sera recyclée. Ce n'est pas un risque, c'est une certitude.

**Approche :** extraire une fabrique de connexion unique et mémoïsée dans `apps/web/src/db/client.ts`, posant `prepare: false` et une taille de pool pilotée par l'environnement, puis faire pointer les dix modules dessus sans toucher à leur logique ni à leur garde de rôle.

## Boundaries & Constraints

**Always :**
- `apps/web/src/db/org-scope.ts` reste intact. `withOrg` pose le GUC par `set_config(..., true)` — portée transaction — à l'intérieur de `sql.begin()` : déjà compatible pooler (audit du 2026-11-01). C'est un invariant vérifié, pas une zone de travail.
- Chaque module conserve exactement le câblage qu'il a aujourd'hui : `protegerStore` là où il est présent, `createAppRoleGuard` pour l'IAM, mémoïsation par `globalThis`, repli `createUnavailableStore` quand `DATABASE_URL` est absente.
- La suite de tests existante passe **sans modification d'un seul test**.
- **Correction de la passe de revue 1** : `multi-org.integration.test.ts` n'est PAS une preuve de non-régression de ce refactor. Il construit ses stores par `createIamStore`/`createInscriptionsStore`/`createMissionsStore`/`createChronoStore` sur sa propre connexion, sans jamais appeler `getDbClient()` ni un `getXStore()`. Il atteste que les fabriques de store tiennent, pas que le câblage réécrit tient. La preuve du câblage doit être produite : test unitaire de `protegerStore`, et test d'un `getXStore()` avec `@/db/client` doublé.
- `prepare: false` est posé inconditionnellement : un comportement unique entre local et hébergé vaut mieux qu'un écart qui ne se révèle qu'en production.

**Never :**
- Ne pas étendre `protegerStore` aux modules qui ne l'ont pas — voir la décision consignée plus bas.
- Ne pas toucher à `inscriptions/migrate.ts` (il lit `readDatabaseOwnerUrl()`, donc la connexion directe) ni à `src/test/integration-db.ts`.
- **Correction de la passe de revue 1** : `notifications/send-cli.ts` et `notifications/j7-cli.ts` lisent `readDatabaseUrl()` — la même URL que l'application, donc le pooler. La justification initiale (« connexion de courte vie ») était fausse : la durée de vie du client ne protège de rien, c'est la connexion serveur recyclée par le pooler qui porte `prepared statement already exists`. Ces deux CLI reçoivent `prepare: false`.
- Ne pas provisionner Supabase : hors de portée de cette session, consigné en reste-à-faire.
- Ne pas modifier la logique métier d'un seul store.

## Décisions prises

- **Garde de rôle sur les quatre modules non protégés** — `missions`, `chrono`, `rapports` et `tracking` n'appliquent pas `protegerStore`, contrairement à ce qu'annonce le commentaire de `db/app-role.ts`. L'écart préexiste au refactor : consigné dans `deferred-work.md`, traité séparément. Mêler un changement de comportement sécurité à un refactor de connexion rendrait la revue des deux impossible.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|----------|--------------|----------------------|------------------|
| Connexion nominale | `DATABASE_URL` définie | La fabrique retourne un pool `postgres.js` avec `prepare: false` ; deux appels retournent la **même** instance | N/A |
| Base absente | `DATABASE_URL` absente ou vide | La fabrique retourne `null` ; chaque module sert son `createUnavailableStore()` comme aujourd'hui | Aucune exception levée à l'import |
| Exécution serverless | Variable d'environnement signalant le serverless | Taille de pool réduite | N/A |
| Exécution locale | Hors serverless | `max: 5`, `connect_timeout: 5`, `idle_timeout: 20` — valeurs actuelles inchangées | N/A |
| Deux modules, une base | `inscriptions` puis `chrono` demandent leur store | Les deux partagent le même pool sous-jacent | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/db/client.ts` -- **à créer.** Fabrique unique. Mémoïsation par `globalThis` (même motif que les stores, pour survivre au rechargement à chaud de Next). Lit `readDatabaseUrl()`.
- `apps/web/src/db/org-scope.ts` -- **ne pas toucher.** `withOrg` ligne 32 : `set_config(..., true)` dans `sql.begin()`, déjà compatible pooler.
- `apps/web/src/db/app-role.ts` -- **ne pas toucher.** `protegerStore` reçoit le `sql` en paramètre : indifférent à l'origine du pool.
- `apps/web/src/modules/iam/env.ts:78` -- `readDatabaseUrl()` → `string | null`, applique les `.env` avant lecture.
- `apps/web/src/modules/iam/store.ts:440` -- `isProductionRuntime()` ; ligne 494, forme IAM : `createIamStore(sql, { ensureAppRole: createAppRoleGuard(sql, …) })`.
- Forme A — `protegerStore(sql, createXStore(sql), isProductionRuntime())` avec garde `sql !== null` :
  `inscriptions/store.ts:1237`, `sponsors/store.ts:372`, `contenus/store.ts:349`, `retour-images/store.ts:356`, `notifications/outbox-store.ts:286`.
- Forme B — `createXStore(postgres(…))` passé directement, sans `protegerStore` :
  `missions/store.ts:1051`, `chrono/store.ts:1381`, `rapports/store.ts:367`, `tracking/store.ts:384`.
- `apps/web/src/db/multi-org.integration.test.ts` -- preuve de non-régression RLS. **Ne pas modifier.**
- `apps/web/src/test/integration-db.ts:130,137,167` -- connexions de test dédiées. **Ne pas modifier.**

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/db/client.ts` -- créer la fabrique : pool unique mémoïsé, `prepare: false`, `max` selon l'environnement, retour `null` sans `DATABASE_URL` -- point d'entrée unique de la connexion applicative
- [x] `apps/web/src/db/client.test.ts` -- couvrir la matrice I/O : mémoïsation, retour `null`, options posées, taille de pool selon l'environnement -- la fabrique est désormais un point de défaillance unique, elle se teste
- [x] Forme A (`inscriptions`, `sponsors`, `contenus`, `retour-images`, `notifications/outbox-store`) -- remplacer `postgres(...)` par la fabrique, garde `sql !== null` et `protegerStore` conservées -- substitution ligne à ligne
- [x] Forme IAM (`iam/store.ts`) -- idem, `createAppRoleGuard(sql, …)` conservé
- [x] Forme B (`missions`, `chrono`, `rapports`, `tracking`) -- idem, câblage inchangé : ces quatre-là n'ont pas `protegerStore` et n'en gagnent pas
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- consigner l'écart de garde de rôle sur `missions`, `chrono`, `rapports`, `tracking` -- trouvaille hors périmètre à ne pas perdre

**Acceptance Criteria:**
- Étant donné le dépôt après refactor, quand on cherche `postgres(` dans `apps/web/src/modules`, alors seuls les trois CLI apparaissent — aucun store n'instancie plus de pool.
- Étant donné une base locale migrée, quand on lance `pnpm test`, alors la suite passe intégralement et aucun fichier de test préexistant n'a été modifié.
- Étant donné `DATABASE_URL` absente, quand une page appelle n'importe quel `getXStore()`, alors le store indisponible est servi comme avant, sans exception à l'import.

## Implementation Notes

- `apps/web/src/db/client.ts` expose `getDbClient()` (pool mémoïsé par `globalThis.__azzelDbClient`), `databasePoolOptions()`, `isServerlessRuntime()`, les constantes `POOL_MAX_LOCAL = 5` / `POOL_MAX_SERVERLESS = 1`, et `resetDbClientForTests()` (tests uniquement, calqué sur `resetOrganisationIdMemoForTests`).
- **Serverless détecté par `VERCEL` ou `AWS_LAMBDA_FUNCTION_NAME`** lus via `readEnv` (donc après application des fichiers `.env`). Hors serverless, les options restent exactement celles des stores d'avant : `max: 5, connect_timeout: 5, idle_timeout: 20` — plus `prepare: false`, posé inconditionnellement.
- **L'absence de `DATABASE_URL` n'est pas mémoïsée** : seul un pool réellement ouvert l'est. Une absence mise en cache aurait figé le repli `createUnavailableStore` pour tout le processus, y compris après qu'une variable d'environnement arrive — comportement non demandé et difficile à diagnostiquer. Les stores, eux, continuent de mémoïser leur propre résultat comme avant : le comportement observable des `getXStore()` est inchangé.
- **Câblage des modules, strictement ligne à ligne.** Forme A et IAM : `const databaseUrl = readDatabaseUrl(); const sql = databaseUrl ? postgres(...) : null;` devient `const sql = getDbClient();`, la garde `sql !== null`, `protegerStore` et `createAppRoleGuard` restant à l'identique. Forme B : `createXStore(postgres(...))` devient `createXStore(sql)` sous la même garde — ces quatre modules n'ont toujours pas `protegerStore`.
- Imports : `readDatabaseUrl` n'est plus importé par aucun store (il reste la source de vérité, appelée par la fabrique) ; l'import par défaut de `postgres` est devenu un import **de type** partout dans les stores — aucun d'eux ne peut plus instancier un pool à l'exécution.
- `db/org-scope.ts`, `db/app-role.ts`, les trois CLI et `src/test/integration-db.ts` n'ont pas été touchés.

## Spec Change Log

## Review Triage Log

**Itération 1 (2026-11-01) — corrigé :**
- `notifications/send-cli.ts` et `notifications/j7-cli.ts` lisent `readDatabaseUrl()`, donc la même URL que l'application : `prepare: false` ajouté à leurs options. `inscriptions/migrate.ts` lit `readDatabaseOwnerUrl()` (connexion directe) et reste inchangé.
- `apps/web/src/db/app-role.test.ts` (nouveau) : `protegerStore` n'était exercé par aucun test — cas nominal `azzel_app`, avertissement hors production, `AppRoleMisconfiguredError` en production, mémoïsation du verdict.
- `apps/web/src/modules/contenus/store.test.ts` (nouveau) : le câblage de `getContenusStore()` avec `@/db/client` doublé — garde de rôle effectivement posée, store indisponible quand la fabrique rend `null`.
- `client.test.ts` : l'assertion d'options passe de `expect.anything()` à `databasePoolOptions()`, et le doublon « deux modules appelants » est remplacé par un cas serverless qui vérifie `max: 1` à l'ouverture.
- `db/app-role.ts` : le docblock ne prétend plus couvrir TOUS les stores — les quatre exceptions sont nommées et renvoyées à `deferred-work.md`.
- `.env.example` : distinction documentée entre `DATABASE_URL` (pooler possible, requêtes préparées désactivées par la fabrique) et `DATABASE_OWNER_URL` (connexion directe obligatoire pour les migrations).
- `db/client.ts` : `PoolOptions` exprimé via le namespace (`postgres.Options<…>`) au lieu de `Parameters<typeof postgres>[1]`, qui ne résolvait qu'une des surcharges ; `resetDbClientForTests` dit explicitement qu'elle ne ferme aucun pool.
- Les dix stores : import `postgres` passé en import de type ; le commentaire recopié dix fois réduit à une ligne renvoyant à `@/db/client`.

Passe 1 — trois couches (blind-hunter 11, edge-case-hunter 11, verification-gap 2 + 3).

| # | Trouvaille | Verdict | Évidence |
|---|---|---|---|
| 1 | `send-cli.ts` / `j7-cli.ts` lisent `readDatabaseUrl()` sans `prepare: false` | **high** | Vérifié : les deux lisent la même URL que l'app, donc le pooler. `migrate.ts` lit `readDatabaseOwnerUrl()` (connexion directe) — hors de cause, la couche qui l'incluait se trompe. La justification du bloc gelé (« connexion de courte vie ») est fausse : c'est la connexion serveur recyclée qui porte l'erreur. |
| 2 | Aucun test n'exerce les dix blocs de câblage réécrits | **high** | Vérifié : `multi-org.integration.test.ts` importe `createIamStore`/`createInscriptionsStore`/`createMissionsStore`/`createChronoStore` et les construit sur sa propre connexion ; il n'appelle ni `getDbClient()` ni aucun `getXStore()`. Retirer `protegerStore` d'un des cinq sites passerait typecheck et toute la suite. Le critère d'acceptation du bloc gelé qui s'appuie sur ce test est creux. |
| 3 | `prepare: false` n'est vérifié que contre un double | **medium** | Vérifié : `client.test.ts` double le module `postgres` ; `integration-db.ts` ouvre ses connexions sans `prepare: false`. L'unique changement de comportement runtime n'est exercé par aucune requête réelle. |
| 4 | Docblock de `db/app-role.ts` : « appliquée à TOUS les stores » | **medium** | Vérifié et toujours faux après le diff, qui consigne lui-même l'écart dans `deferred-work.md`. Documentation mensongère laissée en place. |
| 5 | `getDbClient` : options assertées par `expect.anything()` | **medium** | Vérifié `client.test.ts:47`. Une régression passant des options littérales ne casse aucun test. |
| 6 | Test « partage le même pool entre deux modules » redondant | **low** | Vérifié : appelle `getDbClient()` deux fois, aucun module impliqué. Doublon du premier cas. |
| 7 | Six modules gardent un import de valeur `postgres` | **low** | Vérifié : usages restants tous en position de type (`postgres.TransactionSql`, `postgres.JSONValue`). `import type` les rendrait incapables d'ouvrir un pool. |
| 8 | `PoolOptions = NonNullable<Parameters<typeof postgres>[1]>` | **low** | `postgres` est surchargé ; `Parameters` n'en résout qu'une. Typecheck passe aujourd'hui. |
| 9 | `resetDbClientForTests` n'appelle pas `sql.end()` | **low** | Vérifié : utilisé uniquement avec un double. Aucune fuite réelle aujourd'hui. |
| 10 | `.env.example` muet sur pooler / connexion directe | **medium** | Vérifié inchangé. La distinction que la story existe pour introduire n'est documentée nulle part. |
| 11 | `POOL_MAX_SERVERLESS = 1` non surchargeable, non mesuré | **maybe-false** | Dix modules sérialisent sur une connexion en serverless. Aucune réentrance trouvée (`insertOutboxEmail`, `lireClassementsRecord` reçoivent `tx`). Se tranchera par mesure en recette, pas par lecture. |
| 12 | Capacité locale 10×5 → 5 | **maybe-false** | 2315 tests passent sans tension. Ne se tranchera que sous charge réelle. |
| 13 | `DATABASE_URL` malformée lève à l'ouverture | **false** | L'ancien code appelait `postgres(databaseUrl, …)` de la même façon. Aucune régression introduite par le diff. |
| 14 | Pool mort jamais ré-ouvert / `max_lifetime` absent | **maybe-false** | Aucun chemin démontré. Spéculatif. |
| 15 | Perte d'isolation de panne (dix pools → un) | **false** | C'est l'objet même de la story, pas un défaut. |
| 16 | Commentaire de trois lignes recopié dans dix fichiers | **low** | Vérifié. L'information vit déjà, plus complète, dans `client.ts`. |


## Verification

**Résultats (2026-11-01) :**
- `bash scripts/dev-db.sh up` — conteneur prêt, rôle `azzel_app` en place.
- `pnpm -F @azzel/web db:migrate` — « Migrations déjà appliquées ».
- `pnpm typecheck` — 3 projets, aucune erreur.
- `pnpm test` — 169 fichiers, 2315 tests passés, 5 skippés ; `multi-org.integration.test.ts` inclus et non modifié.
- `pnpm build` — build Next.js réussi.
- `git diff --stat -- '*.test.ts'` — vide ; seul `apps/web/src/db/client.test.ts` est ajouté (non suivi).
- `grep -rn 'postgres(' apps/web/src/modules --include='*.ts'` hors tests — uniquement `inscriptions/migrate.ts`, `notifications/j7-cli.ts`, `notifications/send-cli.ts`.

**Commands:**
- `bash scripts/dev-db.sh up` -- attendu : conteneur Postgres prêt
- `pnpm -F @azzel/web db:migrate` -- attendu : migrations appliquées, rôle `azzel_app` créé
- `pnpm typecheck` -- attendu : aucune erreur
- `pnpm test` -- attendu : suite complète au vert, `multi-org.integration.test.ts` inclus et non modifié
- `pnpm build` -- attendu : build Next.js réussi
- `git diff --stat -- '*.test.ts'` -- attendu : aucune ligne, hors le fichier de test nouvellement créé
