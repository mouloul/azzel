# Note d'architecture — stories 1-6 et 1-9

**Auteur :** Winston (System Architect) · **Date :** 2026-10-21 · **Statut :** décisionnel, à consommer par les specs 1-6 et 1-9

## 1. Story 1-6 — Rôles, bootstrap organisateur, cycle de statut

### Rôle sur le compte — colonne unique, pas de table

Trois lectures possibles : colonne `account.role`, table de jointure N-N, rôle dérivé d'une entité organisateur. La N-N est prématurée (un seul rôle par compte aujourd'hui — Rule of Three) ; le rôle dérivé est implicite donc fragile. **Décision : `account.role text NOT NULL DEFAULT 'coureur' CHECK (role IN ('coureur','organisateur'))`** (migration 0006). L'épopée 3 ajoutera `'volontaire'` au CHECK — changement de contrainte, pas de schéma. FR-1 (« session unique tous rôles ») l'ancrait déjà sur COMPTE.

### Bootstrap du premier organisateur — promotion à la connexion

Un seed SQL coderait un email personnel en base de code ; un CLI dédié ajoute une étape opéatoire pour un solo dev. **Décision : variable `AZZEL_ADMIN_EMAILS` (liste séparée par virgules)** — à chaque vérification de code réussie (`verifyCodeAndStartSession`, transaction existante), si l'email normalisé est dans la liste : `role = 'organisateur'` (upsert idempotent, même transaction que le login). Révocation : retirer l'email de l'env + `UPDATE account SET role='coureur'`. Repli documenté : SQL direct. Zéro nouvelle surface, le login est déjà l'endroit où le compte existe.

### Session porte le rôle

`SessionRecord` étendu de `role` (JOIN account dans `findSessionByTokenHash`). Helper iam `requireRole('organisateur')` (403 enveloppe `iam.forbidden` si coureur) — même famille que `requireSession`.

### Cycle de statut du dossier — le refus ne doit pas enfermer

Point de vigilance que la story 1-5 a figé : le dépôt de preuve n'est permis que si `status = 'en constitution'`. Si 1-6 introduit `refusé` comme état terminal côté coureur, un dossier refusé ne pourrait jamais être corrigé. **Décision : statuts `en constitution` → `validé` | `refusé` ; le dépôt d'une NOUVELLE preuve est permis pour `en constitution` ET `refusé`, et repasse le statut à `en constitution`** (cycle de correction : motif conservé, nouvelle preuve active, l'ancienne reste `replaced`). `validé` reste immuable côté coureur (1-3/1-4/1-5 verrouillent déjà). Le refus exige `refusal_reason` (CHECK : `status='refusé' ⇒ refusal_reason IS NOT NULL`, et inversement). La ré-validation directe depuis `refusé` est permise à l'organisateur (motif non requis pour valider).

### Surface admin

`/admin/dossiers` : liste des coureurs de l'édition (recherche nom/email, `LIMIT 200` — V1 ~1000 inscrits, pas de pagination complète), détail avec preuve téléchargeable (`GET /api/admin/preuves/:id`, rôle organisateur, stream via `ProofStore.read`), actions valider/refuser (motif obligatoire). Tout derrière `requireRole`. Pas de framework UI admin — mêmes composants charte.

## 2. Story 1-9 — Isolation multi-organisation par RLS réel

### Le problème honnête

Aujourd'hui l'« isolation » est applicative (WHERE organisation_id dans les stores). AD-4 exige une contrainte **structurelle** (« jamais un filtrage applicatif seul »). Avec un monolithe server-authoritative et un pool service, un simple RLS activé ne protège rien si la connexion passe en BYPASSRLS.

### Décision — RLS + GUC transactionnel + rôle applicatif distinct

1. **Deux rôles Postgres** : `azzel` (propriétaire, migrations, BYPASSRLS implicite) et `azzel_app` (LOGIN, GRANT SELECT/INSERT/UPDATE/DELETE sur les tables métier, USAGE sur séquences — créé par `dev-db.sh` et par une migration d'infrastructure pour les environnements existants). L'application se connecte en `azzel_app` (DATABASE_URL), les migrations en propriétaire (`DATABASE_OWNER_URL`, défaut = même serveur, user `azzel`).
2. **RLS + FORCE ROW LEVEL SECURITY** sur toutes les tables métier (organisation, account, login_code, session, evenement, edition, epreuve, coureur, document, preuve). `schema_migrations` exemptée. Politique unique : `USING (organisation_id = current_setting('app.organisation_id', true)::uuid)` — pour `organisation` elle-même : `id = current_setting(...)`. Aucune politique pour le rôle propriétaire (BYPASSRLS).
3. **Plumbing applicatif** : helper `withOrg(sql, organisationId, fn)` — `sql.begin` + `set_config('app.organisation_id', $orgId, true)` (portée transaction), puis les requêtes du store. Tous les accès des stores passent par des transactions locale-GUC ; les lectures simples aussi (coût négligeable à l'échelle V1 — c'est le prix d'AD-4).
4. **Avant session** (demande de code, avant connexion) : GUC posé sur l'organisation par défaut V1 (slug `ait-aissi`). Post-2027 (location d'instances) : résolution par domaine — hors périmètre, noté.
5. **Test de la promesse FR-27** : l'intégration crée une organisation B avec son événement/édition/épreuves/coureur ; assertions : avec GUC A, les coureurs B sont invisibles (et inversement) ; sans GUC : zéro ligne ; la seconde organisation s'est créée **sans changement de schéma**. Le filtrage applicatif existant est conservé — défense en profondeur, pas remplacement.

### Trade-offs assumés

- Chaque requête devient une transaction explicite : verrouillage plus fin, verbosité des stores accrue. À 1000 coureurs, invisible.
- `FORCE RLS` s'applique aussi au propriétaire des tables — le rôle applicatif doit exister avant l'activation : la migration d'activation est **la dernière** (0009) et vérifie le rôle.
- Les tests d'intégration existants (iam, inscriptions) doivent passer par le rôle app + GUC — leur reprise fait partie de la story, c'est la preuve que la plomberie est complète.

## Consignes pour Amelia (specs 1-6 → 1-9)

- 1-6 : colonne role + AZZEL_ADMIN_EMAILS + requireRole + cycle statut (refus non terminal côté coureur) + surface /admin/dossiers minimale.
- 1-7 : la checklist lit l'état consolidé (formulaire, acceptations, preuve active, statut) — aucune écriture.
- 1-8 : file d'envoi `email_outbox` (destinataire, type, payload, statut pending/sent/failed, tentatives, prochaine tentative) — envoi au moment de l'événement (non bloquant) + rejeu ; types : inscription_reçue, dossier_validé, dossier_refusé (motif inclus). Test local contre Mailpit (assertions via son API) pour un test d'intégration d'envoi réel, stubs pour l'unitaire.
- 1-9 : appliquer la décision RLS ci-dessus, reprendre les stores et les tests, livrer le test 2e organisation.
