---
title: 'Story 3.1 — Import Excel des volontaires et invitations'
type: 'feature'
created: '2026-10-22'
status: 'done'
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

**Approach:** Écran admin `/admin/volontaires` : import d'un fichier Excel/CSV (nom, email, téléphone), validation ligne par ligne, création en une transaction des comptes (rôle `volontaire`), fiches volontaires, invitations et emails en file (outbox existante, rejeu worker/CLI). Rapport obligatoire ligne par ligne — jamais d'import silencieux. Le volontaire reçoit un lien d'invitation, définit son mot de passe (scrypt) à la première connexion et atterrit sur `/volontaires` (placeholder tutoiement).

## Boundaries & Constraints

**Always:**
- Rapport affiché pour chaque ligne : `créé` / `ignoré` / `rejeté` + raison ; résumé (créés, ignorés, rejetés, invitations en file).
- Tout est org-scopé : `withOrg` + colonne `organisation_id` + policy RLS `<table>_org_isolation` + grants `azzel_app` + cas ajouté à `multi-org.integration.test.ts` (story 1.9).
- Invitations via `email_outbox` (type `invitation_volontaire`, CHECK élargi par migration) — l'envoi reste best effort, échec SMTP ne bloque jamais l'import.
- Mot de passe : scrypt (`node:crypto`, zéro dépendance), min 8 max 128, hash uniquement ; invitation = jeton brut 32 octets (base64url) en URL, stocké **hashé sha256** (pattern `login_code`), TTL 14 jours, consommée à l'usage ; nouvelle invitation révoque les précédentes non consommées.
- Session unique tous rôles réutilisée : définir son mot de passe ouvre la session et révoque les anciennes.
- Rôle unique par compte (note Winston 1.6/1.9) : email déjà coureur/organisateur → ligne rejetée avec raison explicite ; la connexion par code refuse le rôle `volontaire` avec orientation vers `/connexion-volontaire`.
- Décisions de remplissage : téléphone **facultatif** (vide accepté, sinon format vérifié) ; en-tête détecté et ignoré (insensible casse) ; `.xlsx` ET `.csv` acceptés (séparateur `;` ou `,`) ; gabarit `.xlsx` téléchargeable ; limites 2 Mo / 500 lignes.
- Admin : `requireRolePage('organisateur')` / `guardAdmin` ; enveloppes d'erreur `shared` ; erreurs `role="alert"`, succès `role="status"` (pattern sponsors).

**Never:**
- Pas de secteurs/missions/affectations (story 3.2), pas de PWA/offline/fiche mission (3.3), pas d'annuaire (3.4), pas de renvoi automatique d'invitation au re-import (bouton manuel uniquement).
- Aucun changement à la logique de connexion coureur/organisateur (code email) — un lien discret vers `/connexion-volontaire` seulement.
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
| Invitation expirée/invalide | jeton inconnu, > 14 j, consommé | Message clair + contact, aucun mot de passe défini | 400/410 enveloppe |
| Définition mot de passe | jeton valide, mdp ≥ 8 | Hash scrypt, invitation consommée, session ouverte → `/volontaires` | session unique révoque anciennes |
| Connexion volontaire | email + mdp corrects | Session → `/volontaires` | mdp erroné → message générique |
| Code demandé par volontaire | `/connexion` avec email volontaire | Refus + orientation `/connexion-volontaire`, aucun code envoyé | enveloppe |
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

**Acceptance Criteria:**
- Given un fichier de 200 lignes dont 7 invalides, when l'admin importe, then 193 volontaires sont créés avec invitations en file et le rapport affiche les 7 rejets ligne par ligne.
- Given un volontaire ayant reçu l'invitation, when il ouvre le lien et définit son mot de passe, then sa session s'ouvre sur `/volontaires` et toute session antérieure est révoquée.
- Given deux organisations, when l'org A importe, then aucune donnée de l'org B n'est lisible/modifiable (RLS vérifié par test).
- Given SMTP indisponible, when l'import se lance, then l'import réussit et les invitations restent en file (rejeu `emails:send`).

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
- L'invitation stocke `email_outbox_id` : le statut affiché dans la liste admin (en file / envoyée / échec) vient directement de l'outbox — pas de double source de vérité.
- Énumération de comptes : messages génériques sur `/connexion-volontaire` ; la page `/invitation` ne révèle rien au-delà de la validité du jeton.
- Référence UX : EXPERIENCE.md « Import Excel volontaires — rapport ligne par ligne, jamais d'import silencieux » ; tutoiement côté volontaire, vouvoiement admin.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0018 appliquées, idempotent.
- `pnpm typecheck && pnpm test && pnpm test:db` -- expected: verts (dont nouveaux tests missions/iam).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- Mailpit (`scripts/dev-mail.sh`) : import d'un xlsx réel → rapport → email reçu → lien → mot de passe → `/volontaires` ; re-import → lignes « ignoré » ; renvoi d'invitation → nouvel email.
