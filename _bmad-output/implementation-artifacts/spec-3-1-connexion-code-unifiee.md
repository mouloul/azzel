---
title: 'Story 3.1 (rouverte) — Connexion par code unifiée pour les volontaires'
type: 'refactor'
created: '2026-10-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '44403eebeb80ba6a9622ae1d020d17d568c84fd1'
baseline_snapshot: '93d999dc8de8a6203a9aa189298d5425ab18f2ce' # arbre de travail non commité au départ (git commit-tree, hors branche) — diff de revue = snapshot → état final
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
- [x] `apps/web/src/modules/iam/migrations/0035_connexion_code_unifiee.sql` -- ADD `account.activated_at timestamptz` (backfill depuis `password_set_at`/`invitation.consomme_le`) ; ADD `volontaire.invitation_outbox_id uuid REFERENCES email_outbox(id)` (backfill dernière invitation) ; `UPDATE email_outbox SET payload = payload - 'jeton' WHERE type='invitation_volontaire'` ; DROP TABLE `invitation` ; DROP `account.password_hash`, `password_set_at` -- schéma cible SCP, purge des jetons bruts.
- [x] `apps/web/src/modules/iam/{store,service,errors,constants,session}.ts` -- supprimer le flux mot de passe/invitation et les refus par rôle ; poser `activated_at` dans l'upsert ; `requireRolePage` → `/connexion`.
- [x] Supprimer `modules/iam/password.ts`, `app/invitation/`, `app/connexion-volontaire/`, `app/api/iam/invitation/`, `app/api/iam/connexion-volontaire/` (+ tests).
- [x] `apps/web/src/modules/missions/{store,service,domain,errors}.ts` -- invitation = mise en file `{nom}` + `invitation_outbox_id` ; statuts sans `expiree` ; renvoi selon `activated_at` ; rejet import des `AZZEL_ADMIN_EMAILS`.
- [x] `apps/web/src/modules/notifications/{email-contents,worker}.ts` -- email d'invitation vers `/connexion` (tutoiement, code, « connecte-toi la veille », assistance).
- [x] `apps/web/src/app/connexion/page.tsx` + `app/volontaires/volontaires-pwa.tsx` -- retirer lien volontaire, `AssistanceButton` sur `/connexion` [patch], liens session expirée → `/connexion`.
- [x] `apps/web/src/app/api/inscriptions/{route,acceptances/route,preuve/route}.ts` -- refuser tout rôle ≠ coureur (403) + tests [patch].
- [x] `apps/web/src/app/admin/volontaires/volontaires-manager.tsx` -- succès du renvoi annoncé `role="status"` [patch] ; aide statuts complète (« À renvoyer », « Activé (première connexion faite) ») [patch] ; « 2 Mo » dérivé de `MAX_IMPORT_BYTES` [patch].
- [x] `apps/web/src/modules/missions/{import-format,errors}.ts` -- colonne Téléphone du gabarit en texte (`numFmt '@'`) [patch] ; « 2 Mo » → constante [patch].
- [x] `apps/web/src/app/api/admin/volontaires/modele/route.test.ts` -- nouveau : 401/403, `Content-Type` xlsx, `Content-Disposition` [patch].
- [x] Tests listés au Code Map -- mettre à jour ; intégration : connexion volontaire par code (`activated_at` posé une fois, session antérieure révoquée), renvoi activé/non activé, multi-org sur `invitation_outbox_id`, payload sans `jeton`.
- [x] `_bmad-output/implementation-artifacts/spec-3-1-import-excel-des-volontaires-et-invitations.md` -- appliquer SCP §4.6 (Intent renégocié, Always/Never, matrice, AC2, Review Findings D1–D3 résolues, patches sans objet barrés) avec renvoi vers cette spec pour les tâches.
- [x] `_bmad-output/implementation-artifacts/scenarios-recette-epic-3.md` -- appliquer SCP §4.7 (S1 1.4, 1.7–1.14, synthèse, S3 → `/connexion`).

**Acceptance Criteria:**
- Given le code de `apps/web/src`, when on cherche `password_hash`, `scrypt`, `connexion-volontaire`, `/invitation?jeton`, then aucune occurrence hors migration 0035.
- Given un volontaire importé qui reçoit l'invitation (Mailpit), when il se connecte par code sur `/connexion`, then il atterrit sur `/volontaires` et la liste admin l'affiche « Activé ».
- Given une base dev existante, when `db:migrate` passe deux fois, then 0035 s'applique une fois, aucune ligne `invitation_volontaire` ne contient `jeton`.

## Implementation Notes

- `/connexion` scindée en `page.tsx` (serveur, `force-dynamic`, lit `ASSISTANCE_PHONE`) + `connexion-form.tsx` (client, ex-contenu de la page) : `AssistanceButton` exige le numéro côté serveur.
- Garde des API inscriptions : `requireRole(ROLE_COUREUR)` ; 401/503 gardent les enveloppes `inscriptions.*` / `acceptances.*` / `preuve.*`, 403 = `iam.forbidden` (mappeur iam) — GET et POST.
- Rejet `AZZEL_ADMIN_EMAILS` fait dans le service (avant la transaction), raison `adresse réservée à l'organisation`.
- Renvoi : `mettreEnFileInvitation` annule l'ancienne ligne de `invitation_outbox_id` si `pending`/`failed` puis repointe la fiche ; une ligne `sent`/`sending` reste intacte. Statut outbox `cancelled` ou absent → « À renvoyer ».
- `MAX_IMPORT_LIBELLE` (domaine, client-safe) dérivé de `MAX_IMPORT_BYTES` : erreur serveur + manager admin.
- FK `volontaire.invitation_outbox_id` en `ON DELETE SET NULL` (aucune suppression outbox aujourd'hui, garde-fou).
- AC1 (`rg`) : `0017_comptes_volontaires.sql` contient encore `password_hash`/`scrypt`/`/invitation?jeton` (migration historique, jamais éditée — Always) ; hors 0017/0035, aucune occurrence dans `apps/web/src` (le test d'intégration de schéma filtre `account.password*` sans littéral).

## Spec Change Log

## Review Triage Log

### 2026-10-29 — passe 1 (blind-hunter 15, edge-case-hunter 8, verification-gap 3 + 2 autres ; 28 constats) — 8 patch, 1 defer, 19 rejetés, aucun loopback

| # | Source | Constat | Verdict | Route | Preuve |
|---|--------|---------|---------|-------|--------|
| 1 | BH5+ECH1+ECH6 | Promotion `AZZEL_ADMIN_EMAILS` d'un compte `volontaire` au code-login (rôle changé en silence) | medium | patch ✅ | `store.ts:323` promouvait tout rôle ≠ organisateur ; garde `role !== 'volontaire'` + test intégration. |
| 2 | BH1 | Aide admin « sur/connexion » (espace JSX perdu) | low | patch ✅ | `volontaires-manager.tsx:347` texte + saut de ligne + `<code>` ; `{' '}` ajouté. |
| 3 | BH2 | `/connexion` titrée « Espace coureur » pour tous les rôles | low | patch ✅ | surtitre :159/:195 → « Connexion ». Vouvoiement conservé (ton préexistant de la page coureur). |
| 4 | BH6 | « Connecte-toi la veille » trompeur avec la session unique | low | patch ✅ | une connexion sur un autre appareil révoque la 1ʳᵉ ; conseil précisé « sur le téléphone que tu utiliseras le jour J ». |
| 5 | BH10 | `routes-supprimees.test.ts` ne vérifie que `page.tsx`/`route.ts` | low | patch ✅ | vérifie désormais l'absence des répertoires de route. |
| 6 | BH13 | `logout-button.tsx` code `/connexion` en dur | low | patch ✅ | `CONNEXION_PATH` (constants client-safe). |
| 7 | VG2 | Renvoi annulant une invitation `failed` non testé | low | patch ✅ | scénario SMTP prolongé : `['cancelled','pending']` puis un seul email envoyé. |
| 8 | VG3 | `/connexion` (AssistanceButton) jamais rendue en test | low | patch ✅ | `app/connexion/page.test.tsx` : lien `tel:`, surtitre, aucun lien `/connexion-` ni `/invitation`. |
| 9 | ECH4 | Migrateur sans garde BYPASSRLS : backfill à 0 ligne puis DROP | maybe-false (medium si prod) | defer | 0008 avale `insufficient_privilege` ; owner dev superuser, aucune donnée hors dev (Q2) — défaut antérieur, `deferred-work.md`. |
| 10 | BH15 | Migration 0035 sans transaction (échec partiel) | false | rejeté | `migrate.ts:81` : chaque fichier dans `sql.begin`. |
| 11 | ECH3+ECH8 | Volontaire d'une org non par défaut → compte coureur | false | rejeté | V1 mono-org : tous les codes naissent dans `getDefaultOrganisationId()`, l'import l'est aussi (triage revue 3.1 du 2026-10-28). |
| 12 | BH3+ECH5+VG-o1 | Anciens liens `/invitation`, `/connexion-volontaire` → 404 sec ; pas de redirection | low | rejeté | matrice gelée : anciennes routes = 404 ; aucune donnée/invitation réelle hors dev (Q2). |
| 13 | BH4 | Volontaires non activés à email `sent` obsolète sans rattrapage | low | rejeté | dev uniquement (Q2) ; le bouton « Renvoyer » reste disponible. |
| 14 | BH7 | Lien d'invitation sans `?email=` pré-rempli | low | rejeté | ajoute un paramètre public ; comportement find-or-create préexistant de `/connexion`. |
| 15 | BH8 | Pas d'index sur `volontaire.invitation_outbox_id` | low | rejeté | aucune suppression d'`email_outbox` en V1, ~200 volontaires. |
| 16 | BH9+ECH2 | Renvoi pendant `sending` → doublon d'email | low | rejeté | les deux emails pointent vers `/connexion` sans jeton : doublon inoffensif, cas rare. |
| 17 | BH11 | `readSession` copié 3× (routes inscriptions) | low | rejeté | duplication préexistante (même structure avant la story). |
| 18 | BH12 | Test multi-org dépendant de l'état | low | rejeté | refactor de fixtures, aucun faux vert démontré. |
| 19 | BH14 | Message de succès du renvoi jamais effacé ; `colSpan` en dur | low | rejeté | ajout d'effet/timer, cosmétique. |
| 20 | ECH7 | Critère d'acceptation 1 (rg) non tenu à la lettre | low | rejeté | occurrences restantes : 0017 (non éditable) et tests de garde ; correction = édition du spec. |
| 21 | VG1 | Backfill 0035 jamais testé sur données héritées | low | rejeté | aucune donnée volontaire hors dev (Q2) ; vérifié à la main sur la base dev (0 `jeton`, schéma cible) ; harnais « migrer jusqu'à N » = complexité. |

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
