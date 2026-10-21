---
title: 'Story 1.9 — Socle multi-organisation (schéma + RLS)'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: 'cb96134'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/implementation-artifacts/note-archi-winston-1-6-1-9.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** L'isolation des données par organisation (FR-27, AD-4) n'est qu'applicative : un WHERE oublié fuiterait les données d'une organisation — la promesse « seconde organisation sans changement de schéma » n'est pas prouvée.

**Approach:** Appliquer la décision Winston (note en context:) : rôle applicatif Postgres distinct (`azzel_app`), RLS + FORCE RLS avec GUC `app.organisation_id` posé par transaction via un helper `withOrg`, toutes les requêtes métier migrées, et le test intégration qui crée une organisation B complète et prouve l'invisibilité croisée. Ajustement documenté : `organisation` lisible par slug sans GUC (résolution de l'org par défaut avant session) ; `session`/`login_code` en RLS SELECT permissive (leurs clés de recherche sont des secrets introuvables — l'isolation org s'exerce au niveau account/métier ; justifié en Design Notes).

## Boundaries & Constraints

**Always:**
- Deux rôles : `azzel` (propriétaire, migrations, bypass) et `azzel_app` (app : SELECT/INSERT/UPDATE/DELETE sur les tables métier) — créé par `dev-db.sh` (neuf) ET par la migration 0008 (environnements existants, DO block idempotent, mot de passe depuis env `AZZEL_APP_PASSWORD` défaut 'azzel').
- `DATABASE_URL` = connexion azzel_app ; `DATABASE_OWNER_URL` (défaut = même hôte, user azzel) pour `db:migrate` et la création des bases de test ; `.env`/`.env.example` mis à jour, `dev-db.sh` prépare les deux URLs.
- Migration 0009 (DERNIÈRE) : ENABLE + FORCE RLS sur organisation, evenement, edition, epreuve, coureur, document, preuve, email_outbox, account — politiques `USING (organisation_id = current_setting('app.organisation_id', true)::uuid)` (id pour organisation en écriture, SELECT public par slug) ; session/login_code : RLS activé avec SELECT USING (true) (exception documentée) ; schema_migrations exemptée.
- Helper `withOrg(sql, organisationId, fn)` : `sql.begin` + `set_config('app.organisation_id', orgId, true)` ; TOUTES les méthodes des stores (iam, inscriptions, notifications) passent par lui — les WHERE organisation_id existants conservés (défense en profondeur).
- Flows avant session (demande/vérification de code) : GUC = id de l'organisation par défaut (slug `ait-aissi`, lu hors GUC via la politique SELECT de organisation) ; après session : organisationId de la session (déjà portée par SessionRecord).
- Test intégration (la preuve FR-27) : organisation B + evenement/edition/épreuve/coureur/preuve créés ; avec GUC A → aucune ligne B visible (et inversement) ; sans GUC → zéro ligne sur les tables métier ; création de B SANS changement de schéma (aucune DDL hors migrations).
- Les tests d'intégration existants (iam, inscriptions, checklist, preuve, dossiers, outbox) repassent via le rôle app + GUC — leur reprise fait partie de la preuve.

**Never:**
- Pas de changement de schéma métier (aucune colonne nouvelle hors next_attempt_at déjà là ; les migrations 0008/0009 sont de l'infrastructure).
- Pas de résolution multi-tenant par domaine (post-2027, noté) ; pas d'UI admin des organisations.
- Pas de contournement : aucune requête métier hors withOrg après la story (grep sql` direct = zéro dans les stores).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deux organisations | org A + org B peuplées | withOrg(A) ne voit aucune ligne B (coureurs, preuves, éditions, outbox, accounts) et inversement | No error expected |
| Sans GUC | requête hors withOrg sur table métier | Zéro ligne (RLS), pas d'erreur | No error expected |
| Login avant session | demande de code sans session | GUC = org par défaut, flux intact | No error expected |
| Session validée | token → session → org | GUC = org de la session pour tout le reste | No error expected |
| Connexion app sur schéma | DATABASE_URL azzel_app | Lecture/écriture OK via GUC ; DDL refusée | Erreur SQL propre si DDL tentée |
| Migration | DATABASE_OWNER_URL | 0001–0009 en propriétaire, idempotent | No error expected |

</intent-contract>

## Code Map

- `apps/web/src/modules/iam/store.ts`, `inscriptions/store.ts`, `notifications/outbox-store.ts` — toutes les méthodes à migrer vers withOrg ; patterns tx existants conservés à l'intérieur.
- `apps/web/src/modules/iam/env.ts` — DATABASE_OWNER_URL ; `scripts/dev-db.sh` — création rôle + URLs ; `.env`/`.env.example`.
- `apps/web/src/modules/inscriptions/migrate.ts` — runner sur OWNER + migration 0008_rls_roles.sql (rôle+grants) et 0009_activate_rls.sql (policies, DERNIÈRE).
- Tests d'intégration : création base de test en owner puis connexion app (azzel_test via azzel_app) ; la suite existante doit passer sans affaiblir ses assertions.

## Tasks & Acceptance

**Execution:**
- `scripts/dev-db.sh` + `.env.example` + `iam/env.ts` -- rôle azzel_app, DATABASE_URL/DATABASE_OWNER_URL, .env régénéré.
- `migrations/0008_rls_roles.sql` + `0009_activate_rls.sql` -- rôle (DO block idempotent), grants, ENABLE/FORCE RLS + politiques (ajustement organisation/session documenté).
- `apps/web/src/db/org-scope.ts` (nouveau) -- withOrg + withDefaultOrg (résolution slug), tests unitaires du helper.
- Stores (iam, inscriptions, notifications) -- migration complète des accès vers withOrg (org de session, ou défaut pour les flows pré-session) ; suppression des accès sql nus.
- `migrate.ts` + tests d'intégration -- runner en owner ; bases de test via app role ; reprise des suites.
- `multi-org.integration.test.ts` (nouveau) -- la preuve FR-27 complète (matrice ci-dessus).

**Acceptance Criteria:**
- Given deux organisations peuplées, when chaque store opère via withOrg, then aucune requête ne voit les lignes de l'autre organisation, y compris sans WHERE applicatif.
- Given une requête métier sans GUC, when elle s'exécute en rôle app, then zéro ligne retournée (l'isolation est structurelle, AD-4).
- Given la création de l'organisation B, when elle est inspectée, then aucun changement de schéma n'a été requis (FR-27) et toute la suite existante reste verte.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 17, false 1, maybe-false 0 (10 entrées patch, 3 rejets)
- findings (résumé) :
  - `[medium]` `[patch]` Preuve vacante si .env ancien (app en superuser = RLS contourné en silence) : assert current_user='azzel_app' dans les tests, migration automatique du .env par dev-db.sh, avertissement runtime (BH1+EC10+VG-Other).
  - `[medium]` `[patch]` Rotation mot de passe azzel_app impossible (BH2+EC2) — ALTER ROLE ... PASSWORD quand le rôle existe.
  - `[medium]` `[patch]` Login multi-org : code résolu sous l'org du code (plus withDefaultOrg) + re-vérification atomique de la révocation dans la tx (BH4+EC7+EC8).
  - `[medium]` `[patch]` GRANT non pérennes : ALTER DEFAULT PRIVILEGES + suppression du DELETE mort + BYPASSRLS au propriétaire (gardé) (BH3+BH8+EC5).
  - `[medium]` `[patch]` Une org malade bloquait toute la file outbox (BH5+EC6) — accumulate + continue.
  - `[low]` `[patch]` ownerUrl mal formée → skip propre + garde même hôte (BH6+EC3+EC4) ; tests multi-org auto-suffisants + gardes seeds (BH7+EC9) ; garde UUID + cast withOrg simplifié (EC1+BH11) ; garde dupliquée ×7 centralisée (BH10) ; logout testé (VG1) ; fallback readDatabaseOwnerUrl testé (VG2) ; ordre/limite cross-org du worker testés (VG3).
  - `[low]` `[reject]` IA-D2 — pas de chemin applicatif de création d'organisation : V1 = opération opérateur (location d'instances post-2027) ; D4 — fingerprint schéma colonnes+politiques suffit à « aucune DDL requise » ; BH9 — course inter-fichiers azzel_test : fileParallelism:false déjà en place, garde ajoutée au helper.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Isolation multi-organisation structurelle (FR-27/AD-4) : rôle applicatif azzel_app (migration 0008 : création/rotation idempotentes, grants + default privileges, BYPASSRLS propriétaire), ENABLE+FORCE RLS avec GUC app.organisation_id (0009, nullif pour connexions poolées), helper withOrg/withDefaultOrg, TOUS les stores migrés (iam : secret→org en deux temps ; outbox : énumération par organisation), runner de migrations en connexion propriétaire, preuve multi-org : org B créée sans DDL (fingerprint), invisibilité croisée sur les 8 tables métier, zéro ligne sans GUC, INSERT/UPDATE cross-org bloqués, rôle appliqué vérifié dans les tests, .env existants migrés automatiquement, warning runtime si connexion non-app.

### Arbitrages enregistrés (vs note Winston)
- organisation lisible par slug sans GUC (résolution org par défaut pré-session) — écritures scopées.
- session/login_code : RLS activé, politiques SELECT permissives (le token/hash EST le contrôle d'accès ; isolation org au niveau account/métier via le second saut withOrg) — documenté.
- nullif(current_setting(...), '') : un GUC expiré sur connexion poolée donne zéro ligne sans erreur (prouvé par test).

### Revue
4 couches — 27 constats → 10 patchs (5 medium, 5 low) corrigés (369/370 verts, 1 skip documenté) ; 3 rejets motivés.

**Recommandation de re-revue : true** — 5 medium patchées ; risques nommés : (1) surface HTTP du multi-org non couverte par test dédié (routage slug→org latent, V1 mono-org), (2) les exceptions permissives session/login_code = décision d'architecture à faire entériner par Winston/PO à la prochaine revue, (3) 0008 suppose un owner createrole (vrai en dev ; Supabase cloud à vérifier au provisionnement).

### Vérification
`dev-db.sh reset/up + db:migrate` 0001–0009 idempotent ✓ (rôle, 17 politiques, default ACL, azzel.bypassrls) ; `pnpm test` 369 passés + 1 skip (31 fichiers, intégrations en rôle app) ; `pnpm build` + `pnpm typecheck` verts ; checks psql manuels (sans GUC → 0 ligne, GUC → lignes org, DDL refusée).

## Spec Change Log

## Review Triage Log

## Design Notes

Ajustements à la note Winston, découverts en spécifiant : (1) `organisation` doit rester lisible par slug sans GUC (résolution de l'org par défaut pour les flows pré-session — l'existence d'une organisation n'est pas sensible ; écritures scoppées) ; (2) `session`/`login_code` cherchées par secret (token/hash) avant que l'org soit connue — RLS SELECT permissive documentée : l'isolation org s'exerce sur account et toutes les tables métier, le token est le contrôle d'accès de la session. Coût assumé (Winston) : chaque accès devient une transaction explicite — invisible à l'échelle V1.

## Verification

**Commands:**
- `bash scripts/dev-db.sh reset && bash scripts/dev-db.sh up && pnpm -F @azzel/web db:migrate` -- expected: rôle créé, 0001–0009, idempotent.
- `pnpm test` -- expected: suite verte y compris multi-org (preuve FR-27).
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- En psql en rôle azzel_app : `SELECT count(*) FROM coureur;` → 0 sans `SET app.organisation_id` ; avec le GUC posé → les lignes de l'org seulement.
