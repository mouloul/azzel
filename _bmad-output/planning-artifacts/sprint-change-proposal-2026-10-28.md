---
title: 'Sprint Change Proposal — Connexion par code unifiée (volontaires)'
date: '2026-10-28'
status: 'approved'
approved: '2026-10-28 — Boss'
trigger: 'code review story 3.1 (2026-10-28)'
scope: 'moderate'
mode: 'incremental'
---

# Sprint Change Proposal — Connexion par code unifiée pour tous les rôles

## 1. Résumé du problème

**Constat.** Les volontaires s'authentifient par **mot de passe** (invitation à jeton → définition du mot de passe scrypt → `/connexion-volontaire`), alors que coureurs et organisateurs utilisent **email + code de vérification**. Ce double mécanisme vient de FR-9 (« définition du mot de passe à la première connexion »), repris tel quel dans UJ-2, epics, architecture et UX — **aucun document n'en donne la justification** (l'addendum PRD §1 ne décrit que le code par email).

**Découverte.** Revue de code de la story 3.1 (2026-10-28, 4 couches). Le flux mot de passe concentre à lui seul :

- 3 décisions ouvertes : D1 anti-force-brute (aucun quota par compte, quota IP partagé avec les codes, scrypt avant lookup du jeton = DoS CPU), D2 mot de passe oublié sans recours, D3 validation du jeton à l'ouverture ;
- 1 défaut de sécurité : le jeton d'invitation **brut** persiste indéfiniment dans `email_outbox.payload` (le hash sha256 ne protège rien) ;
- une seconde page de connexion, un refus de code-login spécifique (oracle d'énumération), et 5 patches de revue.

**Décision.** Généraliser la connexion par code à tous les rôles (coureur, volontaire, organisateur — ce dernier l'utilise déjà) et supprimer le flux mot de passe.

## 2. Analyse d'impact

### Épopées

| Épopée | Impact |
|---|---|
| 1 | Aucun — story 1.2 fournit déjà le mécanisme (session unique tous rôles). Titre « Accès coureur » conservé. |
| 3 | **Story 3.1 rouverte** (`review` → `in-progress`) : AC amendés. **Story 3.3** : liens PWA / service worker `/connexion-volontaire` → `/connexion`. 3.2, 3.4 : aucun. |
| 4 | Aucun — la sync utilise le jeton d'appareil (`/api/volontaires/appareil`), indépendant de la session. |
| 5, 6, 7 | Aucun. |

Aucune épopée rendue obsolète, aucune à créer, ordre inchangé. **MVP inchangé.**

### Artefacts

| Artefact | Sections |
|---|---|
| PRD | §2.3 UJ-2, §4.3 description, FR-9 |
| epics.md | FR-9 (inventaire), résumé épopée 3 (×2), story 3.1 AC |
| ARCHITECTURE-SPINE | ligne « Auth & emails » |
| EXPERIENCE.md | tableau des surfaces (surface 4), parcours volontaire étape 1 |
| Wireframe | `flow-scan-2026-10-20.excalidraw` + `.svg` (champ « Mot de passe (1re fois) ») |
| epic-3-context.md | exigences (ligne 18), décisions techniques (ligne 28) |
| spec-3-1 | Intent renégocié, Always/Never, matrice I/O, AC2, tâches, Review Findings |
| scenarios-recette-epic-3.md | module S1 (1.4, 1.7–1.14), synthèse |

### Technique

- **Supprimé :** `modules/iam/password.ts` (+ tests), `app/invitation/*`, `app/connexion-volontaire/*`, `app/api/iam/invitation/*`, `app/api/iam/connexion-volontaire/*`, `VolunteerCodeLoginRefusedError` et le refus code-login (service + store), cycle invitation à jeton (`creerInvitation`, `consumeInvitationAndStartSession`, `revokePendingInvitations` côté jeton), `CONNEXION_VOLONTAIRE_PATH`.
- **Nouvelle migration :** DROP `account.password_hash`, `account.password_set_at`, table `invitation` ; ADD `account.activated_at timestamptz NULL` ; ADD `volontaire.invitation_outbox_id uuid NULL REFERENCES email_outbox(id)` (statut d'envoi affiché côté admin, source unique). Pas de conversion de données (dev uniquement — choix Q2).
- **Modifié :** `verifyCodeAndStartSession` pose `activated_at` à la première connexion d'un volontaire ; `requireRolePage('volontaire')` non connecté → `/connexion` ; email d'invitation : lien `/connexion` sans jeton + « connecte-toi la veille » ; `statutInvitation` dérivé de `activated_at` + outbox ; renvoi d'invitation = nouvel email, refusé (409) si activé.
- **Infra / CI / déploiement :** aucun changement. Variables d'environnement inchangées.

## 3. Approche recommandée

**Option 1 — Ajustement direct**, retenue : refonte dans la story 3.1 rouverte, avec les 8 patches de revue encore valides.

- **Pourquoi :** une seule porte d'entrée (moins de code, moins de surface d'attaque) ; supprime D1/D2/D3 et le jeton brut au lieu de les corriger ; réutilise un mécanisme éprouvé (story 1.2 : quota IP, expiration, `one-time-code`, compte à rebours).
- **Alternatives écartées :** garder le mot de passe et traiter D1–D3 (plus de code, plus de risques, aucun bénéfice utilisateur documenté) ; MVP review (inutile).
- **Risque résiduel :** un volontaire qui se reconnecte le matin du jour J dépend de la délivrabilité SMTP. Mitigé par la session 30 jours, la consigne « connecte-toi la veille » dans l'invitation, et le jeton d'appareil qui maintient la sync même session révoquée.
- **Effort :** moyen (~25 fichiers, majoritairement suppressions). **Risque :** faible (aucune donnée volontaire hors dev). **Délai :** sans effet sur le jalon V1 du 15/11/2026 (inscriptions).

## 4. Propositions de modification détaillées (toutes approuvées)

### 4.1 PRD — `prds/prd-Azzel-2026-10-19/prd.md`

**UJ-2 (l. 40)**
- AVANT : « … reçoit son invitation (import Excel), définit son mot de passe, découvre sa mission : … »
- APRÈS : « … reçoit son invitation (import Excel), se connecte avec son email et un code de vérification, découvre sa mission : … »

**§4.3 Description (l. 113)**
- AVANT : « 150–200 volontaires, importés par Excel, reçoivent une invitation à définir leur mot de passe ; … »
- APRÈS : « 150–200 volontaires, importés par Excel, reçoivent une invitation à se connecter (email + code de vérification, comme tous les rôles) ; … »

**FR-9 (l. 116)**
- AVANT : « L'admin peut importer une liste de volontaires (nom, email, téléphone) et déclencher les invitations ; les volontaires définissent leur mot de passe à la première connexion. »
- APRÈS : « L'admin peut importer une liste de volontaires (nom, email, téléphone) et déclencher les invitations ; les volontaires se connectent par email + code de vérification, mécanisme d'accès unique pour tous les rôles (coureur, volontaire, organisateur). »

### 4.2 Epics — `epics.md`

**FR-9 inventaire (l. 35)**
- AVANT : « FR-9: Import Excel volontaires (nom, email, téléphone) + invitations ; définition du mot de passe à la première connexion ; rapport ligne par ligne des rejets. »
- APRÈS : « FR-9: Import Excel volontaires (nom, email, téléphone) + invitations ; connexion par email + code de vérification (mécanisme unique tous rôles) ; rapport ligne par ligne des rejets. »

**Résumé épopée 3 (l. 204 et 427)**
- AVANT : « … ; chaque volontaire définit son mot de passe et retrouve sa fiche mission hors-ligne ; … »
- APRÈS : « … ; chaque volontaire se connecte par email + code et retrouve sa fiche mission hors-ligne ; … »

**Story 3.1 AC (l. 440)**
- AVANT : « **And** chaque volontaire reçoit une invitation (file d'envoi avec rejeu) et définit son mot de passe à la première connexion »
- APRÈS :
  - « **And** chaque volontaire reçoit une invitation (file d'envoi avec rejeu) l'orientant vers la connexion par email + code — même mécanisme que coureurs et organisateurs (story 1.2), aucun mot de passe »
  - « **And** sa première connexion réussie le marque « activé » dans la liste admin ; la session ouverte révoque les sessions antérieures (session unique tous rôles) »

### 4.3 Architecture — `architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md` (l. 86, « Auth & emails »)

- AVANT : « … Invitation volontaires : import Excel → premier login → mot de passe. (PRD addendum §1) »
- APRÈS : « … **Mécanisme d'accès unique, tous rôles** (coureur, volontaire, organisateur) : aucun mot de passe stocké. Invitation volontaires : import Excel → email d'invitation (lien vers `/connexion`, sans jeton) → connexion par code → `account.activated_at` posé à la première connexion. Le rôle vient du compte (import → `volontaire`, `AZZEL_ADMIN_EMAILS` → `organisateur`) et détermine l'espace d'atterrissage. Session interactive 30 j ; la PWA scanneuse conserve son jeton d'appareil indépendant. (PRD addendum §1) »

### 4.4 UX — `ux-designs/ux-Azzel-2026-10-20/`

**EXPERIENCE.md, tableau des surfaces (l. 41)**
- AVANT : « | **4 · PWA volontaires** (invitation Excel → mot de passe) | Invitation | … »
- APRÈS : « | **4 · PWA volontaires** (invitation Excel → email + code) | Email + code (session unique) | … »

**EXPERIENCE.md, parcours volontaire étape 1 (l. 234)**
- AVANT : « 1. Reçoit son invitation (import Excel) ; définit son mot de passe à la première connexion (PWA). »
- APRÈS : « 1. Reçoit son invitation (import Excel) ; se connecte avec son email et le code reçu — même écran que les coureurs, il atterrit sur ses missions (PWA). Conseil de l'invitation : « connecte-toi la veille » (session 30 jours, pas de code à attendre le jour J). »

**Wireframe `wireframes/flow-scan-2026-10-20.excalidraw` (l. 201, 208) + export `.svg`**
- AVANT : « Identifiant (issu Excel) / [____] / Mot de passe (1re fois) / [____] »
- APRÈS : « Email (issu de l'Excel) / [____] / Code reçu par email / [______] »

### 4.5 Contexte épopée 3 — `implementation-artifacts/epic-3-context.md`

**Exigences (l. 18, fin)**
- AVANT : « … et définit son mot de passe à la première connexion. »
- APRÈS : « … et se connecte par **email + code de vérification**, mécanisme unique tous rôles — **aucun mot de passe**. Sa première connexion le marque « activé ». »

**Décisions techniques (l. 28)**
- AVANT : « … `iam` (invitations, comptes), … »
- APRÈS : « … `iam` (comptes, connexion par code unique tous rôles — `/connexion`, rôle lu sur le compte, `homePathForRole`), … »

### 4.6 Spec 3.1 — `implementation-artifacts/spec-3-1-import-excel-des-volontaires-et-invitations.md` (Intent renégocié)

- **Frontmatter :** `status: 'in-progress'` ; ajout `renegotiated: '2026-10-28 — sprint-change-proposal-2026-10-28'`.
- **Approach (fin)** — AVANT : « Le volontaire reçoit un lien d'invitation, définit son mot de passe (scrypt) à la première connexion et atterrit sur `/volontaires` (placeholder tutoiement). » — APRÈS : « Le volontaire reçoit un email d'invitation (lien vers `/connexion`, sans jeton), se connecte par email + code comme tous les rôles et atterrit sur `/volontaires` ; sa première connexion pose `account.activated_at`. »
- **Always :** retirer les puces « Mot de passe : scrypt … TTL 14 jours … » et « Session unique … définir son mot de passe ouvre la session » ; ajouter « Accès : connexion par code unique tous rôles (`/connexion`) ; rôle lu sur le compte → `homePathForRole` ; première connexion réussie → `activated_at` ; session unique révoque les anciennes » ; puce « Rôle unique » réduite à « email déjà coureur/organisateur → ligne rejetée avec raison explicite ».
- **Never (ajout) :** « Aucun mot de passe stocké, aucun jeton d'invitation, aucune page de connexion propre aux volontaires. »
- **Matrice I/O :** retirer « Invitation expirée/invalide », « Définition mot de passe », « Connexion volontaire », « Code demandé par volontaire » ; ajouter « Connexion volontaire — email importé + code valide → session → `/volontaires`, `activated_at` posé si nul ; code erroné → message clair (story 1.2) » et « Renvoi d'invitation — volontaire non activé → nouvel email en file ; activé → 409 ».
- **AC2 :** « Given un volontaire importé, when il se connecte par email + code, then sa session s'ouvre sur `/volontaires`, il passe « activé » et toute session antérieure est révoquée. »
- **Nouvelles tâches :** (a) migration (DROP `password_hash`/`password_set_at`/`invitation`, ADD `account.activated_at`, `volontaire.invitation_outbox_id`) ; (b) suppressions (`password.ts`, `/invitation`, `/connexion-volontaire`, `api/iam/{invitation,connexion-volontaire}`, refus code-login) ; (c) email d'invitation → `/connexion` + « connecte-toi la veille » ; (d) liens PWA / service worker 3.3 → `/connexion` ; (e) tests mis à jour ; (f) 8 patches de revue valides : API coureur refusant `volontaire`, « Appeler l'équipe » sur `/connexion`, gabarit téléphone en texte, révocation outbox incluant `sending`, bornes non codées en dur, `role="status"` au renvoi, aide « À renvoyer », test de route `modele`.
- **Review Findings :** D1, D2, D3 → `[x] résolu par changement de cap` ; patches devenus sans objet barrés (jeton en outbox, bornes mot de passe, EC8 `password.ts`, test AC2 activation, test refus code-login, assertion `jeton=` du worker).

### 4.7 Recette — `implementation-artifacts/scenarios-recette-epic-3.md` (module S1)

1.1–1.3, 1.5, 1.6 inchangés. Remplacer 1.4, 1.7–1.13 par :

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.4 | Mailpit (`localhost:8026`) | 2 emails « Azzel — ton accès volontaire », tutoiement, lien `http://localhost:3000/connexion` (**sans jeton**), conseil « connecte-toi la veille » |
| 1.7 | Ouvrir le lien de Karim, saisir son email, demander un code | Code reçu dans Mailpit (même écran et même email que les coureurs) |
| 1.8 | Saisir un code erroné | Message clair + action (comportement story 1.2), aucune session |
| 1.9 | Saisir le bon code | Session ouverte, redirection vers `/volontaires` (« Ton accès mission ») |
| 1.10 | `/admin/volontaires` | Karim « Activé » ; l'autre volontaire « Envoyée » |
| 1.11 | Connecter Karim sur un 2ᵉ navigateur, recharger le 1ᵉʳ | 1ᵉʳ navigateur déconnecté (session unique) |
| 1.12 | « Renvoyer l'invitation » sur le volontaire **non** activé | Nouvel email dans Mailpit ; bouton grisé pour Karim (activé) |
| 1.13 | Ouvrir `/invitation` et `/connexion-volontaire` | 404 (supprimées) |
| 1.14 | Session Karim : `POST /api/inscriptions` (ou ouvrir `/inscription`) | 403 / redirection `/volontaires` (rôle unique) |

Mettre à jour le tableau de synthèse final ; module S3 (service worker) : redirection session expirée → `/connexion`.

## 5. Passation

**Classification : modérée** — artefacts de planification amendés + rouverture d'une story ; pas de replan PM/Architecte.

| Rôle | Responsabilité |
|---|---|
| Developer (Amelia / `bmad-build`) | Appliquer 4.1–4.7 aux documents ; implémenter la refonte et les 8 patches dans la story 3.1 ; mettre à jour les tests et la recette ; commit sur une branche de travail (jamais `main`). |
| Product Owner (Boss) | Valider la recette S1 révisée (Mailpit) ; confirmer la consigne « connecte-toi la veille » dans le briefing volontaires du dry-run. |

**Suivi de sprint :** `3-1-import-excel-des-volontaires-et-invitations: review` → `in-progress` ; `epic-3` reste `in-progress`.

**Critères de succès :**
- Aucune occurrence de `password_hash`, `scrypt`, `/invitation`, `/connexion-volontaire` dans `apps/web/src` (hors migration de suppression).
- Un volontaire importé se connecte par code sur `/connexion` et atterrit sur `/volontaires` ; la liste admin l'affiche « Activé ».
- Une session volontaire est refusée par les API et pages coureur.
- `pnpm typecheck && pnpm test && pnpm test:db` verts ; `pnpm build && pnpm budget` verts ; `db:migrate` idempotent.
- Recette S1 révisée passée de bout en bout.
