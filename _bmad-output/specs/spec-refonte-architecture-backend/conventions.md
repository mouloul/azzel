# Conventions — refonte backend/frontend + ORM

Référence technique pour qui implémente CAP-1/CAP-2. Ne prescrit pas le détail de code, fixe les repères du repo à respecter.

## État actuel (avant migration)

- Monorepo pnpm : `apps/web` (Next.js 16, UI + API routes + server actions + logique métier), `apps/runners` (Expo, client mobile offline-first), `packages/shared`.
- Accès données : driver `postgres` (postgres.js) brut, requêtes `sql\`...\`` littérales. 318 requêtes réparties sur 41 fichiers sous `apps/web/src/modules/*` et `apps/web/src/lib/*`.
- Modules métier : `iam`, `inscriptions`, `chrono`, `missions`, `notifications`, `rapports`, `retour-images`, `sponsors`, `tracking`, `contenus`.
- Migrations SQL maison : un fichier par changement sous `apps/web/src/modules/<module>/migrations/*.sql`, appliquées par `pnpm -F @azzel/web db:migrate` (`tsx src/modules/inscriptions/migrate.ts`).
- Isolation multi-organisation : RLS Postgres actif depuis la story 1.9 (migrations `0008_rls_roles`, `0009_activate_rls`). Toute requête métier passe par `withOrg(sql, organisationId, fn)` ou `withDefaultOrg(sql, fn)` (`apps/web/src/db/org-scope.ts`), qui pose `set_config('app.organisation_id', organisationId, true)` en portée transaction avant d'exécuter `fn`. Les `WHERE organisation_id` applicatifs sont conservés en défense en profondeur, pas supprimés.
- `apps/runners` consomme des endpoints exposés par `apps/web` (API routes Next) pour la sync offline (scan checkpoints, sync par lots idempotente — épopée 4).

## Cible

- Nouvelle app `apps/api` dans le monorepo pnpm, à côté de `apps/web` et `apps/runners`.
- `apps/api` héberge : logique métier des modules migrés + accès données via Drizzle.
- `apps/web` perd, module par module au fur et à mesure de la migration : ses API routes/server actions pour ce module, ses imports directs de `postgres`/stores SQL pour ce module. Il les remplace par des appels HTTP vers `apps/api`.
- Le pattern `withOrg`/`withDefaultOrg` (GUC `app.organisation_id` posé par transaction) doit avoir un équivalent strictement identique côté Drizzle dans `apps/api` — ne pas réinventer le mécanisme RLS, le porter tel quel.
- Les migrations SQL existantes restent la source de vérité du schéma : Drizzle doit s'appuyer dessus (introspection / `drizzle-kit pull`), pas de réécriture du schéma from scratch avec les migrateurs Drizzle natifs tant que la coexistence avec le système de migration maison n'est pas tranchée.

## Règles de migration progressive

- Un module à la fois. Le module migré doit être livrable et testable indépendamment des modules non encore migrés.
- Pendant la période de coexistence, `apps/web` peut appeler certains modules en direct (ancien chemin) et d'autres via HTTP vers `apps/api` (nouveau chemin) — c'est attendu, pas un défaut à corriger avant la fin de la migration complète.
- Ne jamais modifier le comportement fonctionnel observable (RLS, validations, formats de réponse) pendant une migration de module : la migration est un refactor de couche, pas une story fonctionnelle.
- Les scénarios de recette de l'épopée d'origine du module migré (`_bmad-output/implementation-artifacts/scenarios-recette-epic-<N>.md`) servent de non-régression : à rejouer après migration du module concerné.

## Points d'attention identifiés

- `apps/runners` dépend du contrat d'API existant : vérifier avant bascule qu'aucun endpoint consommé par les runners ne change de forme (payload, auth, codes d'erreur) sans version/compat.
- Authentification iam (email + code, session unique) : le mécanisme de session doit rester valide des deux côtés (`apps/web` et `apps/api`) pendant et après la migration — pas de double système de session.
- CORS / configuration réseau entre `apps/web` et `apps/api` à définir dès la première story (dépend du choix de déploiement, encore ouvert — voir Open Questions du SPEC).
