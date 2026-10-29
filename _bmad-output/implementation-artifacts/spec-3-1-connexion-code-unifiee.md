---
title: 'Story 3.1 (rouverte) — Connexion par code unifiée pour les volontaires'
type: 'refactor'
created: '2026-10-28'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - {project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-28.md
  - {project-root}/_bmad-output/implementation-artifacts/epic-3-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les volontaires se connectent par mot de passe (invitation à jeton → scrypt → `/connexion-volontaire`) alors que coureurs et organisateurs utilisent email + code ; ce second mécanisme, sans justification documentée, porte les décisions D1–D3 de la revue 3.1 et laisse le jeton d'invitation brut en `email_outbox.payload`.

**Approach:** Un seul accès pour tous les rôles : `/connexion` (code email, story 1.2). L'import crée le compte `volontaire` et met en file un email d'invitation sans jeton pointant vers `/connexion` ; la première connexion pose `account.activated_at`. Tout le flux mot de passe / jeton d'invitation est supprimé. On y joint les 7 patches de revue 3.1 encore valides (SCP 2026-10-28 §4.6 f, le patch « révocation `sending` » étant devenu sans objet : plus de jeton mort).

## Boundaries & Constraints

**Always:**
- Rôle lu sur le compte ; `/api/auth/verify` renvoie déjà `redirectTo: homePathForRole(role)` → volontaire sur `/volontaires`. Session unique (révocation existante) inchangée.
- `activated_at` = première connexion réussie, jamais réécrit ensuite (`COALESCE`).
- Statut admin dérivé de `activated_at` + statut outbox de `volontaire.invitation_outbox_id` (source unique) : `active` › `aucune` › `echec` › `envoyee` › `en_file`. Plus de statut `expiree` (plus de TTL).
- Renvoi d'invitation : volontaire non activé → nouvel email en file, l'ancien `pending`/`failed` passe `cancelled` ; activé → 409 `VolontaireDejaActifError`.
- Email d'invitation : texte brut, tutoiement, lien `{APP_URL}/connexion`, « connecte-toi avec cette adresse, tu recevras un code », conseil « connecte-toi la veille du jour J », assistance. Type `invitation_volontaire` conservé (CHECK 0016/0031).
- Import : email listé dans `AZZEL_ADMIN_EMAILS` → ligne `rejeté` « adresse réservée à l'organisation » (sinon la promotion admin, désormais atteignable au code-login, changerait silencieusement le rôle).
- Migration nouvelle (0035), jamais d'édition de 0017/0018 (migrateur sans checksum).
- Arbre de travail non commité préservé (`client-ip.ts`, `homePathForRole`, etc.) : modifier par-dessus, ne rien revert.

**Never:**
- Aucun mot de passe stocké, aucun jeton d'invitation, aucune page de connexion propre aux volontaires, aucun refus de code-login par rôle.
- Ne pas toucher au jeton d'appareil (`/api/volontaires/appareil`, sync épopée 4), ni à `APP_PASSWORD_ENV_NAME` (rôle DB).
- Pas de commit sans demande expresse de l'utilisateur (on travaille sur `main`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion volontaire | email importé, code valide | session → `/volontaires` ; `activated_at` posé si nul | code erroné/expiré → enveloppe story 1.2 |
| Reconnexion | volontaire déjà activé | session ; `activated_at` inchangé ; sessions antérieures révoquées | — |
| Renvoi non activé | admin, volontaire `activated_at` nul | nouvelle ligne outbox, précédente `pending`/`failed` → `cancelled`, `invitation_outbox_id` mis à jour | volontaire inconnu → 404 |
| Renvoi activé | `activated_at` posé | aucun email | 409 `VolontaireDejaActifError` |
| Import email admin | email ∈ `AZZEL_ADMIN_EMAILS` | ligne `rejeté` avec raison | jamais silencieux |
| Session volontaire sur API coureur | `POST /api/inscriptions`, `acceptances`, `preuve` | 403 enveloppe `iam.forbidden` | — |
| Anciennes routes | `/invitation`, `/connexion-volontaire`, `/api/iam/{invitation,connexion-volontaire}` | 404 (supprimées) | — |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/iam/store.ts` -- `verifyCodeAndStartSession` (:275) : upsert compte :341–347 (poser `activated_at`), refus volontaire :352–357 (supprimer), promotion admin :358–369, révocation session :370–380 (garder). Supprimer : types `ActivationOutcome`/`PasswordLoginOutcome`, reason `'volontaire'`, `hashLeurre`, `findAccountRoleByEmail`, `consumeInvitationAndStartSession`, `verifyPasswordAndStartSession`, `revokePendingInvitations`, `insertInvitation` (+ entrées interface/unavailable store).
- `apps/web/src/modules/iam/service.ts` -- refus `requestLoginCode` :107–113 et `verifyLoginCode` :160–162 ; `activerVolontaire`, `connecterVolontaire`, `ActivationVolontaire`.
- `apps/web/src/modules/iam/{errors,constants,session}.ts` -- retirer `VolunteerCodeLoginRefusedError`, `InvalidCredentialsError`, `InvitationInvalid/ExpiredError`, `PasswordInvalidError` (+ branches `toApiError`) ; `PASSWORD_*`, `INVITATION_TTL_DAYS`, `CONNEXION_VOLONTAIRE_PATH` ; `requireRolePage` non connecté → `/connexion`. Garder `APP_PASSWORD_ENV_NAME`.
- Supprimer : `modules/iam/password.ts` (+test), `app/invitation/*`, `app/connexion-volontaire/*`, `app/api/iam/invitation/*`, `app/api/iam/connexion-volontaire/*`.
- `apps/web/src/modules/missions/store.ts` -- `creerInvitation` :188 (→ simple mise en file `{nom}` + `invitation_outbox_id`), `importVolontaires` :413, `LISTE_COLUMNS` :397 (join outbox via `v.invitation_outbox_id`, `a.activated_at`), `VolontaireRow` :258, `renvoyerInvitation` :526.
- `apps/web/src/modules/missions/{domain,service,errors}.ts` -- `StatutInvitation` :77 (retirer `expiree`), libellés :79, `statutInvitation` :375 ; `expireLe` exposé :59–61, :90–92 (retirer).
- `apps/web/src/modules/notifications/{email-contents,worker}.ts` -- payload `{nom}`, builder :179–196, `INVITATION_PATH`/`buildInvitationUrl` :55–61 → `readConnexionUrl()` sur le modèle `readEspaceCoureurUrl` :57 / `readAppUrl` :85 ; `normalizeNotificationPayload` :269 ; worker `contentFor` :47–56.
- `apps/web/src/app/admin/volontaires/volontaires-manager.tsx` -- `actif` :234, renvoi :244–255, aide statuts :330–334, « 2 Mo » :157.
- `apps/web/src/app/connexion/page.tsx` -- lien volontaire :252–259 (supprimer), ajouter `AssistanceButton` (`@/components`, usage modèle `app/espace-coureur/page.tsx`).
- `apps/web/src/app/volontaires/volontaires-pwa.tsx` -- `EcranSessionExpiree` :54,60 → `/connexion`.
- `apps/web/src/app/api/inscriptions/{route,acceptances/route,preuve/route}.ts` -- `readSession` local : `getSession` → `requireRole(ROLE_COUREUR, token)` (`iam/session.ts:74`), `forbidden` → `ForbiddenError` (`iam/errors.ts:32`).
- `apps/web/src/modules/missions/import-format.ts` -- `buildModeleXlsx` :206 (colonne Téléphone `numFmt '@'`), réexport :18 ; `missions/errors.ts:166` « 2 Mo » → `MAX_IMPORT_BYTES`.
- `apps/web/src/modules/iam/migrations/` -- dernière migration globale 0034 (chrono) ; `MIGRATION_DIRS` trie globalement par nom.
- Tests : supprimer `password.test.ts`, `api/iam/{invitation,connexion-volontaire}/route.test.ts` ; mettre à jour `iam.test.ts` (:222–224, :308–460), `session.test.ts` (:135–138), `missions.test.ts` (:86–95), `missions.integration.test.ts`, `secteurs-missions.test.ts` (:655), `admin/volontaires/[id]/invitation/route.test.ts`, `notifications.test.ts`, `sw-volontaires.test.ts` (fixtures :201,247,305,378), `volontaires/page.test.tsx`, `db/multi-org.integration.test.ts` (:44,293,460,554–598), routes inscriptions.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/src/modules/iam/migrations/0035_connexion_code_unifiee.sql` -- ADD `account.activated_at timestamptz` (backfill depuis `password_set_at`/`invitation.consomme_le`) ; ADD `volontaire.invitation_outbox_id uuid REFERENCES email_outbox(id)` (backfill dernière invitation) ; `UPDATE email_outbox SET payload = payload - 'jeton' WHERE type='invitation_volontaire'` ; DROP TABLE `invitation` ; DROP `account.password_hash`, `password_set_at` -- schéma cible SCP, purge des jetons bruts.
- [ ] `apps/web/src/modules/iam/{store,service,errors,constants,session}.ts` -- supprimer le flux mot de passe/invitation et les refus par rôle ; poser `activated_at` dans l'upsert ; `requireRolePage` → `/connexion`.
- [ ] Supprimer `modules/iam/password.ts`, `app/invitation/`, `app/connexion-volontaire/`, `app/api/iam/invitation/`, `app/api/iam/connexion-volontaire/` (+ tests).
- [ ] `apps/web/src/modules/missions/{store,service,domain,errors}.ts` -- invitation = mise en file `{nom}` + `invitation_outbox_id` ; statuts sans `expiree` ; renvoi selon `activated_at` ; rejet import des `AZZEL_ADMIN_EMAILS`.
- [ ] `apps/web/src/modules/notifications/{email-contents,worker}.ts` -- email d'invitation vers `/connexion` (tutoiement, code, « connecte-toi la veille », assistance).
- [ ] `apps/web/src/app/connexion/page.tsx` + `app/volontaires/volontaires-pwa.tsx` -- retirer lien volontaire, `AssistanceButton` sur `/connexion` [patch], liens session expirée → `/connexion`.
- [ ] `apps/web/src/app/api/inscriptions/{route,acceptances/route,preuve/route}.ts` -- refuser tout rôle ≠ coureur (403) + tests [patch].
- [ ] `apps/web/src/app/admin/volontaires/volontaires-manager.tsx` -- succès du renvoi annoncé `role="status"` [patch] ; aide statuts complète (« À renvoyer », « Activé (première connexion faite) ») [patch] ; « 2 Mo » dérivé de `MAX_IMPORT_BYTES` [patch].
- [ ] `apps/web/src/modules/missions/{import-format,errors}.ts` -- colonne Téléphone du gabarit en texte (`numFmt '@'`) [patch] ; « 2 Mo » → constante [patch].
- [ ] `apps/web/src/app/api/admin/volontaires/modele/route.test.ts` -- nouveau : 401/403, `Content-Type` xlsx, `Content-Disposition` [patch].
- [ ] Tests listés au Code Map -- mettre à jour ; intégration : connexion volontaire par code (`activated_at` posé une fois, session antérieure révoquée), renvoi activé/non activé, multi-org sur `invitation_outbox_id`, payload sans `jeton`.
- [ ] `_bmad-output/implementation-artifacts/spec-3-1-import-excel-des-volontaires-et-invitations.md` -- appliquer SCP §4.6 (Intent renégocié, Always/Never, matrice, AC2, Review Findings D1–D3 résolues, patches sans objet barrés) avec renvoi vers cette spec pour les tâches.
- [ ] `_bmad-output/implementation-artifacts/scenarios-recette-epic-3.md` -- appliquer SCP §4.7 (S1 1.4, 1.7–1.14, synthèse, S3 → `/connexion`).

**Acceptance Criteria:**
- Given le code de `apps/web/src`, when on cherche `password_hash`, `scrypt`, `connexion-volontaire`, `/invitation?jeton`, then aucune occurrence hors migration 0035.
- Given un volontaire importé qui reçoit l'invitation (Mailpit), when il se connecte par code sur `/connexion`, then il atterrit sur `/volontaires` et la liste admin l'affiche « Activé ».
- Given une base dev existante, when `db:migrate` passe deux fois, then 0035 s'applique une fois, aucune ligne `invitation_volontaire` ne contient `jeton`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

`activated_at` posé dans l'upsert existant : `ON CONFLICT … DO UPDATE SET last_login_at = now(), activated_at = COALESCE(account.activated_at, now())` (et `now()` à l'insertion) — vaut pour tous les rôles, inoffensif pour coureurs/organisateurs, une seule requête. Le rejet des emails admin à l'import remplace le refus de code-login comme garde du rôle unique.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` (×2) -- expected: 0035 appliquée puis ignorée.
- `pnpm typecheck && pnpm test && pnpm test:db` -- expected: verts.
- `pnpm build && pnpm budget` -- expected: verts.
- `rg -n "password_hash|scrypt|connexion-volontaire|invitation\?jeton" apps/web/src` -- expected: seulement `0035_*.sql`.

**Manual checks (if no CLI):**
- Mailpit : import → email lien `/connexion` → code → `/volontaires` → admin « Activé ».
