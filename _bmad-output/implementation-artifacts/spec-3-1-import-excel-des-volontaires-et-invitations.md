---
title: 'Story 3.1 — Import Excel des volontaires et invitations'
type: 'feature'
created: '2026-10-22'
status: 'done'
renegotiated: '2026-10-28 — sprint-change-proposal-2026-10-28'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '6d541e7'
baseline_commit: '6d541e7ef01e8cb09303f6ff1d6a43381f23095a'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-3-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'organisation doit armer 150–200 villageois sans saisie manuelle ; aujourd'hui il n'existe ni volontaires, ni invitations, ni accès volontaire ( connexion = code email coureur uniquement) — FR-9, épopée 3.

**Approach:** Écran admin `/admin/volontaires` : import d'un fichier Excel/CSV (nom, email, téléphone), validation ligne par ligne, création en une transaction des comptes (rôle `volontaire`), fiches volontaires, invitations et emails en file (outbox existante, rejeu worker/CLI). Rapport obligatoire ligne par ligne — jamais d'import silencieux. Le volontaire reçoit un email d'invitation (lien vers `/connexion`, sans jeton), se connecte par email + code comme tous les rôles et atterrit sur `/volontaires` ; sa première connexion pose `account.activated_at`.

## Boundaries & Constraints

**Always:**
- Rapport affiché pour chaque ligne : `créé` / `ignoré` / `rejeté` + raison ; résumé (créés, ignorés, rejetés, invitations en file).
- Tout est org-scopé : `withOrg` + colonne `organisation_id` + policy RLS `<table>_org_isolation` + grants `azzel_app` + cas ajouté à `multi-org.integration.test.ts` (story 1.9).
- Invitations via `email_outbox` (type `invitation_volontaire`, CHECK élargi par migration) — l'envoi reste best effort, échec SMTP ne bloque jamais l'import.
- Accès : connexion par code unique tous rôles (`/connexion`) ; rôle lu sur le compte → `homePathForRole` ; première connexion réussie → `activated_at` ; session unique révoque les anciennes.
- Rôle unique par compte (note Winston 1.6/1.9) : email déjà coureur/organisateur → ligne rejetée avec raison explicite.
- Décisions de remplissage : téléphone **facultatif** (vide accepté, sinon format vérifié) ; en-tête détecté et ignoré (insensible casse) ; `.xlsx` ET `.csv` acceptés (séparateur `;` ou `,`) ; gabarit `.xlsx` téléchargeable ; limites 2 Mo / 500 lignes.
- Admin : `requireRolePage('organisateur')` / `guardAdmin` ; enveloppes d'erreur `shared` ; erreurs `role="alert"`, succès `role="status"` (pattern sponsors).

**Never:**
- Pas de secteurs/missions/affectations (story 3.2), pas de PWA/offline/fiche mission (3.3), pas d'annuaire (3.4), pas de renvoi automatique d'invitation au re-import (bouton manuel uniquement).
- Aucun changement à la logique de connexion par code (story 1.2) — elle devient l'accès unique, tous rôles.
- Aucun mot de passe stocké, aucun jeton d'invitation, aucune page de connexion propre aux volontaires.
- Pas d'envoi SMTP dans la requête d'import ; pas de HTML dans les emails (texte brut) ; pas de multi-rôle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Import nominal | .xlsx 3 colonnes, lignes valides | Comptes+volontaires+invitations+emails en file en une transaction ; rapport « N créés » | échec DB → import entier annulé, enveloppe |
| Lignes invalides | email malformé, nom vide, ligne 501+ | Ligne `rejeté` + raison ; valides importées quand même | jamais d'import silencieux |
| Doublon dans le fichier | même email 2× | 1ʳᵉ `créé`, 2ᵉ `rejeté` « doublon dans le fichier » | idem |
| Déjà volontaire | re-import / email existant rôle volontaire | `ignoré` « déjà volontaire — invitation non renvoyée » | idem |
| Email déjà coureur/orga | compte autre rôle | `rejeté` « un compte coureur existe déjà » | idem |
| Fichier illisible | corrompu, mauvais type, > 2 Mo, 0 ligne | 400 enveloppe + action « vérifie le fichier » | enveloppe shared |
| Connexion volontaire | email importé + code valide | Session → `/volontaires`, `activated_at` posé si nul | code erroné → message clair (story 1.2) |
| Renvoi d'invitation | volontaire non activé / activé | Non activé → nouvel email en file ; activé → 409 | enveloppe |
| Accès non autorisé | non-organisateur sur admin | 403 / redirection rôle | enveloppe |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/sponsors/` — pattern canonique module (domain/errors/service/store + migrations + tests) à reproduire pour `modules/missions`.
- `apps/web/src/modules/iam/constants.ts` — `ACCOUNT_ROLES` à étendre ; `iam/store.ts` `verifyCodeAndStartSession` (session unique à réutiliser), garde rôle applicatif.
- `apps/web/src/modules/iam/migrations/0001_iam.sql` + `0006` — tables account/login_code/session ; nouvelle migration 0017 (rôle, password_hash, invitation).
- `apps/web/src/db/org-scope.ts` + `apps/web/src/db/multi-org.integration.test.ts` — withOrg/RLS, test à étendre.
- `apps/web/src/modules/inscriptions/migrations/0007_email_outbox.sql` — CHECK `type` à élargir (migration 0016).
- `apps/web/src/modules/notifications/` — `outbox-store.insertOutboxEmail` (dans la tx métier), worker/CLI intacts, `email-contents.ts` (`NOTIFICATION_TYPES`, `buildNotificationEmail`, `readEspaceCoureurUrl` → même pattern pour l'URL d'invitation).
- `apps/web/src/app/api/admin/guard.ts` + `sponsors/body.ts` — garde admin + lecture corps.
- `apps/web/src/app/api/inscriptions/preuve/route.ts` + `modules/inscriptions/proof-format.ts` — pattern multipart (Content-Length, formData, sniff de type).
- `apps/web/src/app/admin/sponsors/page.tsx` + `sponsors-manager.tsx` — pattern page serveur + manager client + CSS co-localisé ; `admin/indisponible.tsx`.
- `apps/web/src/modules/iam/session.ts` — `requireRole`/`requireRolePage` à étendre (volontaire → `/volontaires`).
- `apps/web/src/modules/inscriptions/migrate.ts` — `MIGRATION_DIRS` + `missions`.
- `apps/web/src/test/integration-db.ts` — harnais intégration (skip hors `AZZEL_REQUIRE_DB=1`).

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/package.json` -- ajouter `exceljs` (dépendance serveur uniquement, jamais importée côté client).
- [x] `modules/inscriptions/migrations/0016_outbox_invitation.sql` -- élargir le CHECK `type` (+ `invitation_volontaire`).
- [x] `modules/iam/migrations/0017_comptes_volontaires.sql` -- `account.role` CHECK + `volontaire` ; colonnes `password_hash`/`password_set_at` nullable ; table `invitation` (id, organisation_id, account_id, jeton_hash UNIQUE, email_outbox_id, expire_le, consomme_le, created_at) + RLS + grants.
- [x] `modules/missions/migrations/0018_volontaires.sql` -- table `volontaire` (id, organisation_id, account_id UNIQUE, nom, telephone nullable, created_at) + RLS + grants ; inscrire `missions` dans `MIGRATION_DIRS`.
- [x] `modules/iam/password.ts` (+ tests) -- scrypt hash/verify, format salté, `timingSafeEqual` ; constantes min/max.
- [x] `modules/iam/` (constants, store, service, errors) -- rôle `volontaire`, création compte volontaire, cycle invitation (créer/révoquer/consommer, TTL 14 j), `verifyPasswordAndStartSession`, refus code-login pour volontaire avec orientation.
- [x] `modules/notifications/email-contents.ts` (+ tests) -- type + contenu invitation (tutoiement, lien `/invitation?jeton=…`, expiration, assistance).
- [x] `modules/missions/` (domain, import-format, service, store, errors + tests) -- parsing exceljs/csv (en-tête, séparateur), validation ligne (nom 1–120 requis, email ≤ 254, téléphone facultatif), transaction unique (comptes + volontaires + invitations + outbox), rapport `{lignes[], resume}` ; `listVolontaires` avec statut invitation (join outbox) ; `renvoyerInvitation`.
- [ ] Routes API -- `POST /api/admin/volontaires/import` (multipart ≤ 2 Mo, ≤ 500 lignes), `GET /api/admin/volontaires/modele` (xlsx généré), `POST /api/admin/volontaires/[id]/invitation` ; publiques : `POST /api/iam/invitation` (définir mot de passe), `POST /api/iam/connexion-volontaire` (+ tests routes).
- [ ] UI -- `/admin/volontaires` (page + manager + css : import, rapport accessible ligne par ligne, liste + renvoi) ; `/invitation` (validation jeton + formulaire) ; `/connexion-volontaire` (+ lien discret depuis `/connexion`) ; `/volontaires` placeholder tutoiement.
- [x] `requireRolePage` -- gérer le rôle `volontaire` (redirection `/volontaires`).
- [ ] Tests intégration -- import nominal/doublons/illisible, isolation RLS multi-org, invitation (consommation, expiration, rejeu outbox, renvoi), connexion mdp + session unique + gating rôle.

**Renégociation 2026-10-28 (SCP §4.6) — tâches détaillées et suivies dans [`spec-3-1-connexion-code-unifiee.md`](spec-3-1-connexion-code-unifiee.md) :**
- [x] (a) migration `0035_connexion_code_unifiee.sql` -- DROP `password_hash`/`password_set_at`/`invitation`, ADD `account.activated_at`, `volontaire.invitation_outbox_id`, purge des jetons des payloads.
- [x] (b) suppressions -- `password.ts`, `/invitation`, `/connexion-volontaire`, `api/iam/{invitation,connexion-volontaire}`, refus code-login.
- [x] (c) email d'invitation → `/connexion` + « connecte-toi la veille ».
- [x] (d) liens PWA / service worker 3.3 → `/connexion`.
- [x] (e) tests mis à jour.
- [x] (f) patches de revue valides : API coureur refusant `volontaire`, « Appeler l'équipe » sur `/connexion`, gabarit téléphone en texte, bornes non codées en dur, `role="status"` au renvoi, aide « À renvoyer », test de route `modele` (révocation outbox `sending` : sans objet, plus de jeton mort).

**Acceptance Criteria:**
- Given un fichier de 200 lignes dont 7 invalides, when l'admin importe, then 193 volontaires sont créés avec invitations en file et le rapport affiche les 7 rejets ligne par ligne.
- Given un volontaire importé, when il se connecte par email + code, then sa session s'ouvre sur `/volontaires`, il passe « activé » et toute session antérieure est révoquée.
- Given deux organisations, when l'org A importe, then aucune donnée de l'org B n'est lisible/modifiable (RLS vérifié par test).
- Given SMTP indisponible, when l'import se lance, then l'import réussit et les invitations restent en file (rejeu `emails:send`).

### Review Findings

_Code review 2026-10-28 (passe 2, lot story 3.1 de l'épopée 3 — commit `ae154b1`, blind-hunter 16, edge-case-hunter 14, verification-gap 5, acceptance-auditor 11 ; vérifié contre `ae154b1` ET l'arbre de travail courant)._

- [x] [Review][Decision] — **résolu par changement de cap (SCP 2026-10-28 : plus de mot de passe).** Quota anti-brute-force inefficace sur les endpoints publics à mot de passe — (a) `connecterVolontaire` n'a aucun quota d'échecs par compte/email ; (b) avec `readTrustedClientIp` (arbre de travail), sans `AZZEL_TRUSTED_PROXY_HOPS` il n'y a plus AUCUN quota IP ; (c) le seau est partagé avec la demande de code (`recordCodeRequestIp`, 20/h) et compte aussi les succès → 150–200 volontaires derrière le NAT du village épuisent le quota des coureurs ; (d) `activerVolontaire` exécute scrypt AVANT de chercher le jeton, sans aucun quota → DoS CPU non authentifié sur `/api/iam/invitation`. Choix : compteur d'échecs par email (risque de verrouillage malveillant d'un compte) vs seau IP dédié échecs-seulement vs les deux ; lookup jeton avant hash.
- [x] [Review][Decision] — **résolu par changement de cap (SCP 2026-10-28 : plus de mot de passe, reconnexion par code).** Volontaire activé qui oublie son mot de passe : aucun recours — `renvoyerInvitation` lève `VolontaireDejaActifError` (409), bouton désactivé si `active`, alors que `/connexion-volontaire` promet « demande à l'équipe de te le renvoyer ». Choix : réinitialisation par l'admin (ré-invitation d'un compte actif, efface `password_hash`) vs réinitialisation self-service par email vs corriger le texte seulement.
- [x] [Review][Decision] — **résolu par changement de cap (SCP 2026-10-28 : `/invitation` supprimée, plus de jeton).** `/invitation` ne valide pas le jeton à l'ouverture — jeton inconnu/expiré/consommé découvert seulement après saisie des deux mots de passe. Choix : nouvel endpoint public `GET` de vérification (surface publique supplémentaire, oracle de validité) vs garder le refus au submit.
- [x] ~~[Review][Patch] Jeton d'invitation BRUT conservé indéfiniment dans `email_outbox.payload` (contredit « stocké hashé sha256 ») — purger `jeton` du payload au passage `sent`/`cancelled` et à la consommation [apps/web/src/modules/missions/store.ts:205, apps/web/src/modules/notifications/outbox-store.ts:188]~~ — sans objet (plus de jeton ; 0035 purge les payloads existants).
- [x] [Review][Patch] — fait (spec-3-1-connexion-code-unifiee : `requireRole(ROLE_COUREUR)` + tests 403). API coureur acceptent une session volontaire (rôle unique non appliqué) — `readSession` via `getSession` sans contrôle de rôle ; pages déjà corrigées dans l'arbre de travail, pas les API ; + tests 403 [apps/web/src/app/api/inscriptions/route.ts:25, apps/web/src/app/api/inscriptions/acceptances/route.ts:25, apps/web/src/app/api/inscriptions/preuve/route.ts:23]
- [x] [Review][Patch] — fait sur `/connexion` (pages volontaires supprimées). Bouton « Appeler l'équipe » absent de `/invitation` et `/connexion-volontaire` (parcours qui coincent : lien expiré, mdp oublié) — réutiliser `AssistanceButton` [apps/web/src/app/invitation/page.tsx:9, apps/web/src/app/connexion-volontaire/page.tsx:29]
- [x] [Review][Patch] — fait (`numFmt '@'` + tests). Gabarit xlsx : colonne Téléphone non forcée en texte → Excel supprime le 0 de tête (`0555…` → `555…`, accepté par `TELEPHONE_PATTERN`, stocké faux sans signal) — `numFmt: '@'` sur la colonne [apps/web/src/modules/missions/import-format.ts:212]
- [x] ~~[Review][Patch] Révocation n'annule pas une ligne outbox `sending` — `markOutboxFailed` la repasse `failed`, le worker renvoie un lien à jeton mort [apps/web/src/modules/iam/store.ts:708]~~ — sans objet (plus de jeton mort : un email d'invitation en vol reste valide).
- [x] [Review][Patch] — fait pour « 2 Mo » (`MAX_IMPORT_LIBELLE` dérivé de `MAX_IMPORT_BYTES`) ; ~~bornes mot de passe « 8 et 128 »~~ sans objet. Bornes encore en dur (« 2 Mo », « 8 et 128 ») malgré BF11 + action « Choisis un mot de passe plus long » fausse quand > 128 [apps/web/src/modules/iam/errors.ts:281, apps/web/src/modules/missions/errors.ts:166, apps/web/src/app/admin/volontaires/volontaires-manager.tsx:157, apps/web/src/app/invitation/invitation-form.tsx:56]
- [x] [Review][Patch] — fait. Renvoi d'invitation : succès non annoncé (`role="status"` manquant, réponse `{email, expireLe}` ignorée) [apps/web/src/app/admin/volontaires/volontaires-manager.tsx:255]
- [x] [Review][Patch] — fait (+ « Activé (première connexion faite) »). Aide des statuts sans « À renvoyer » (statut `aucune`) [apps/web/src/app/admin/volontaires/volontaires-manager.tsx:331]
- [x] ~~[Review][Patch] Test worker : `toContain('/invitation?jeton=')` passe avec un jeton vide — asserter `buildInvitationUrl(jeton)` réel [apps/web/src/modules/missions/missions.integration.test.ts:320]~~ — sans objet (plus de jeton ; le test asserte désormais le lien `/connexion` sans jeton).
- [x] ~~[Review][Patch] Refus code-login volontaire dans `verifyCodeAndStartSession` testé uniquement par store mocké — ajouter cas intégration (code demandé avant import → refus, rôle inchangé) [apps/web/src/modules/missions/missions.integration.test.ts]~~ — sans objet (plus aucun refus de code-login par rôle).
- [x] ~~[Review][Patch] Régression EC8 non gardée : réexports `password.ts`→constantes et `import-format.ts`→bornes rendent tentant l'import client de `node:crypto`/`exceljs` — supprimer les réexports [apps/web/src/modules/iam/password.ts:18, apps/web/src/modules/missions/import-format.ts:18]~~ — sans objet (`password.ts` supprimé ; le réexport `import-format.ts` reste serveur uniquement).
- [x] ~~[Review][Patch] AC2 partiellement testé : l'activation par invitation ne vérifie pas la révocation d'une session antérieure [apps/web/src/modules/missions/missions.integration.test.ts:206]~~ — sans objet (AC2 renégocié ; la révocation de session antérieure est testée sur la connexion par code).
- [x] [Review][Patch] — fait (`modele/route.test.ts`). `GET /api/admin/volontaires/modele` sans test de route (garde 401/403, Content-Type/Disposition) [apps/web/src/app/api/admin/volontaires/modele/route.ts]
- [x] [Review][Defer] Ni correction ni suppression d'un volontaire — email mal saisi = compte fantôme permanent, bloque même un futur coureur sur cette adresse [apps/web/src/modules/missions/store.ts] — deferred: fonctionnalité hors périmètre 3.1 (CRUD volontaire), à cadrer avec l'admin.

**Rejected (passe 2)**
- false — Connexion volontaire limitée à l'org par défaut : en V1 toute session naît dans l'org par défaut (`requestLoginCode` insère les codes dans `getDefaultOrganisationId()`, `verifyCodeAndStartSession` résout l'org depuis le code) → un admin d'org B est inatteignable, l'import est toujours en org par défaut.
- false — `statutInvitation` affiche `cancelled` comme « En file » : une ligne `cancelled` n'est produite que par `revokePendingInvitations`, qui SUPPRIME l'invitation dans la même tx → plus de jointure ; `sending` = « En file » est exact.
- false — Fuite du jeton par Referer : politique par défaut navigateur `strict-origin-when-cross-origin` + aucun lien/ressource externe sur `/invitation`.
- false — Texte `/volontaires` promettant une notification d'affectation : texte absent du code courant.
- fixed (arbre de travail) — Organisateur redirigé vers l'espace coureur (`homePathForRole`) ; `x-forwarded-for` forgeable (`readTrustedClientIp`).
- spec — Énumération via le refus code-login volontaire : orientation exigée par le spec (Always « refuse le rôle volontaire avec orientation »).
- spec — Tutoiement admin vs « vouvoiement admin » : convention du repo = tutoiement (16 « Réessaie » vs 1 « Réessayez » côté admin) → c'est la Design Note qui diverge.
- spec — Migration 0019/worker hors Code Map ; frontmatter `done` vs cases décochées/sprint `review` : correction = édition du spec.
- low — En-tête lu par position / `MOTS_EN_TETE` incomplet : lignes rejetées avec raison (non silencieux), gabarit fourni ; mapping par en-tête = nouvelle logique.
- low — Email admin (`AZZEL_ADMIN_EMAILS`) importé comme volontaire : rare (co-orga jamais connecté), fix = garde supplémentaire. **Repris le 2026-10-28** : la promotion admin devenant atteignable au code-login, l'import rejette désormais ces adresses (« adresse réservée à l'organisation »).
- low — `[id]` non-UUID → 500 : URL forgée par un admin uniquement.
- low — Commentaire 0017 contradictoire avec son GRANT : migration déjà appliquée, ne pas réécrire.
- low — Policy `invitation` permissive sans GUC : exception documentée (pattern 0011, lookup par jeton avant org connue).
- low — Import 500 lignes séquentiel (~3 500 requêtes, une tx) : quelques secondes en local, sous le timeout 30 s ; batch = restructuration.
- low — Tests intégration dépendants de l'ordre : refactor de fixtures, aucun faux vert démontré.
- low — Pas de test « worker ignore `cancelled` » : exclu par construction (`listOutstanding` filtre `pending`/`failed`).
- low — Jeton conservé dans l'historique / pas de `no-store` sur POST : POST non mis en cache, jeton à usage unique.

## Review Triage Log

### 2026-10-22 — Review pass 1 (blind-hunter 14, edge-case-hunter 9, verification-gap 3 ; 26 findings)
- **patch (medium)** EC8 — `node:crypto` (scrypt, randomBytes) bundlé dans le chunk client de /invitation via `invitation-form.tsx` important `password.ts` — vérifié dans `.next/static/chunks` (grep scrypt). Fix : constantes bornes déplacées côté client-safe.
- **patch (medium)** BF4+EC2+VG-other1 — révocation d'invitation laisse l'ancienne ligne outbox `pending`/`failed` : le worker enverra un email portant un jeton mort. Mécanisme vérifié dans `revokePendingInvitations` (DELETE invitation, outbox intacte) + `listOutstanding` (filtre statut uniquement).
- **patch (medium)** BF1+EC4 — `/api/iam/connexion-volontaire` publique sans quota d'échec (force brute en ligne), alors que la demande de code a le correctif sécurité 1.2 (quota IP). Écart au pattern sécurité du repo.
- **patch (medium)** BF7+EC7 — CSV Windows-1252 (export Excel par défaut) décodé UTF-8 non fatal → noms accentués stockés en mojibake, silencieux. `TextDecoder('utf-8')` sans `{fatal:true}` vérifié.
- **patch (low)** BF2 — oracle de timing : scrypt (~100 ms) exécuté seulement si le compte existe → réponse distinguable ; contredit « jamais d'énumération ». Chemins négatifs à temps constant (hash factice).
- **patch (low)** EC5 — `connecterVolontaire` n'borne pas la longueur du mot de passe avant scrypt (DoS CPU par mégaoctets de saisie).
- **patch (low)** BF6+EC6+EC9(claim) — `estEnTete` se déclenche sur UNE cellule-clé : une ligne de données « Nom » sans en-tête est avalée sans ligne de rapport — atteinte à « jamais d'import silencieux ».
- **patch (low)** BF10+VG-other2 — fichier vide → `BodyTooLargeError` (« dépasse 2 Mo ») message trompeur (route `file.size === 0` et service `bytes.length === 0`).
- **patch (low)** BF11 — « 14 jours », « 2 Mo », « 500 lignes » en dur dans email/erreurs/UI au lieu de `INVITATION_TTL_DAYS`, `MAX_IMPORT_BYTES`, `MAX_IMPORT_LINES` (divergence inévitable si bornes changées).
- **patch (low)** BF13 — `VolontaireSummary.statutInvitation: string` au lieu du union `StatutInvitation` (comparaison client non gardée).
- **false** BF3+EC1 — « invitation brûlée sans activation » : le `return` (vs throw) après `UPDATE account` est réel mais inatteignable — FK `ON DELETE CASCADE` (compte supprimé ⇒ invitation supprimée), aucun chemin de changement de rôle (promotion admin réservée au flux code, refusé aux volontaires), `SELECT FOR UPDATE` réussi ⇒ compte présent et rôle 'volontaire' invariant.
- **false** BF5 — lien invitation vide dans le worker : payload `jeton` vide invivable — seul producteur du type `invitation_volontaire` (`creerInvitation`) pose toujours le jeton brut, aucune ligne legacy.
- **rejeté (low)** BF8+EC3 — import concurrent même email → 500 : rare (double admin simultané), récupérable (re-import → ignoré), correction = restructuration ON CONFLICT.
- **rejeté (low)** BF9 — zip bomb xlsx : endpoint authentifié organisateur, plafond 2 Mo, menace auto-infligée.
- **rejeté (low)** BF12 — liste volontaires sans pagination : cible 150–200, volumétrie V1 fine.
- **rejeté (low)** BF14 — CSV retour-ligne dans guillemets : rare sur colonnes nom/email/téléphone, correction = machine à états complète.
- **rejeté (low)** BF15 — regex email dupliquée missions/iam : choix documenté (client-safe), divergence spéculative, fix cross-package.
- **rejeté (low)** BF16 — `FOR UPDATE` tenu pendant scrypt (~100 ms) : échelle village, sérialisation négligeable, restructuration non triviale.
- **defer** VG-main — aucun test du lien statique « Volontaire ? Connecte-toi ici » sur /connexion (gap pré-vérifié ; enveloppe `iam.volontaire_code_refused` testée et orientant déjà ; disposition defer déposée).

## Design Notes

- **exceljs** plutôt que `xlsx` (SheetJS npm : gelé, CVE connues) ; lit `.xlsx` et `.csv` ; côté serveur uniquement — budget accueil et bundle client inchangés (`pnpm budget`).
- Import atomique pour les lignes valides (une transaction `withOrg`) : un crash DB n'importe rien ; les rejets sont des décisions de validation, pas des erreurs.
- La fiche volontaire stocke `invitation_outbox_id` (0035) : le statut affiché dans la liste admin (en file / envoyée / échec) vient directement de l'outbox, « Activé » de `account.activated_at` — pas de double source de vérité.
- ~~Énumération de comptes : messages génériques sur `/connexion-volontaire` ; la page `/invitation` ne révèle rien au-delà de la validité du jeton.~~ Sans objet depuis la renégociation : connexion par code unique, aucun refus par rôle.
- Référence UX : EXPERIENCE.md « Import Excel volontaires — rapport ligne par ligne, jamais d'import silencieux » ; tutoiement côté volontaire, vouvoiement admin.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0018 appliquées, idempotent.
- `pnpm typecheck && pnpm test && pnpm test:db` -- expected: verts (dont nouveaux tests missions/iam).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Mailpit (`scripts/dev-mail.sh`) : import d'un xlsx réel → rapport → email reçu → lien `/connexion` → code → `/volontaires` → admin « Activé » ; re-import → lignes « ignoré » ; renvoi d'invitation (non activé) → nouvel email.
