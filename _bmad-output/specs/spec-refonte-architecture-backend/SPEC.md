---
id: SPEC-refonte-architecture-backend
companions: [conventions.md]
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Séparation backend/frontend + migration ORM

## Why

Dette technique à résorber avant que le volume de code ne rende le changement prohibitif. `apps/web` (Next.js) mélange aujourd'hui UI, logique métier et accès données brut (`postgres` + `sql\`...\`` littéraux — 318 requêtes dans 41 fichiers). Boss (porteur technique) veut (1) séparer explicitement le backend du frontend et (2) sortir du SQL littéral au profit d'un ORM, pendant que le projet avance vite (épopées 1 à 7 en review/in-progress) — donc sans big-bang ni régression sur ce qui est déjà livré.

## Capabilities

- **CAP-1**
  - **intent:** Un backend dédié (`apps/api`, nouvelle app du monorepo pnpm) héberge la logique métier des modules (iam, inscriptions, chrono, missions, etc.) et l'expose en HTTP ; `apps/web` devient un client HTTP pur — plus d'accès DB direct ni de logique métier serveur dans `apps/web/src/app` ou `apps/web/src/modules`.
  - **success:** Au moins un module pilote tourne entièrement derrière `apps/api` ; `apps/web` l'appelle exclusivement en HTTP (plus un seul import de `postgres`/accès DB direct pour ce module côté `apps/web`) ; les tests existants du module passent.

- **CAP-2**
  - **intent:** La couche d'accès données du module migré utilise un ORM (Drizzle pressenti) au lieu de requêtes `sql\`...\`` littérales, en s'appuyant sur les migrations SQL existantes comme source de vérité du schéma.
  - **success:** Le module pilote ne contient plus de `sql\`...\`` brut ; `pnpm typecheck` et les tests du module passent ; le comportement fonctionnel (y compris le filtrage RLS par organisation) est inchangé.

## Constraints

- Migration progressive, module par module — jamais de big-bang. Les épopées 1 à 7 sont en `review`/`in-progress` (`sprint-status.yaml`) : aucune régression tolérée sur les stories déjà livrées.
- Le RLS Postgres multi-organisation (migrations `0008_rls_roles`, `0009_activate_rls`) doit rester respecté à l'identique : le GUC `app.organisation_id` doit être posé par transaction dans la nouvelle couche Drizzle, en reprenant le pattern `withOrg`/`withDefaultOrg` existant (`apps/web/src/db/org-scope.ts`).
- `apps/runners` (Expo — scan offline, sync par lots idempotente, épopée 4) consomme déjà des endpoints : son contrat d'API ne doit pas casser pendant la bascule vers `apps/api` (compat ascendante, ou bascule simultanée des deux clients côté module migré).
- L'authentification iam (email + code, session unique tous rôles) doit continuer à fonctionner de façon transparente entre `apps/web` (UI) et `apps/api` (logique + données) après la bascule.
- Le monorepo pnpm reste unique : `apps/api` s'ajoute à côté de `apps/web` et `apps/runners`, pas de repo séparé.

## Non-goals

- Pas de changement de SGBD (reste PostgreSQL).
- Pas de réécriture de la logique métier des modules : on déplace l'exécution côté `apps/api` et on change la couche SQL→ORM, le comportement fonctionnel ne change pas.
- Pas de réécriture UI au-delà du remplacement des accès directs DB/logique serveur par des appels HTTP vers `apps/api` côté `apps/web`.

## Success signal

Un module pilote (iam ou inscriptions — à trancher, voir Open Questions) tourne en production derrière `apps/api`, en Drizzle, avec zéro accès DB direct restant dans `apps/web` pour ce module et zéro régression sur les scénarios de recette de son épopée d'origine. Le découpage et le mode opératoire pour migrer les modules restants sont documentés pour être répétés sans réassistance.

## Assumptions

- ORM pressenti : Drizzle (proche SQL, bon support `postgres.js`, pas d'opinion imposée sur RLS/session) — à confirmer en story ; alternative envisageable : Kysely (query-builder typé, encore plus proche SQL).
- Framework backend pressenti : Fastify (léger, TypeScript-first) — à confirmer ; alternative : NestJS si le projet veut plus de structure formelle à mesure que l'équipe grandit.

## Open Questions

- Quel module pilote pour la première story concrète : iam (petit, central, utilisé par tout) ou inscriptions (plus gros mais représentatif du RLS) ?
- Déploiement cible d'`apps/api` (même hôte que `apps/web`, process séparé, conteneur) — impacte CORS, gestion de session, configuration réseau : pas encore défini.
