---
title: 'Story 1.8 — Notifications de statut par email'
type: 'feature'
created: '2026-10-21'
status: 'done'
review_loop_iteration: 0
baseline_revision: '93f26b8'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/implementation-artifacts/note-archi-winston-1-6-1-9.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Le coureur doit vérifier le site tous les jours : aucun email ne l'informe des changements de statut de son dossier (FR-6), et l'échec SMTP ne doit jamais bloquer le parcours.

**Approach:** File d'envoi `email_outbox` (migration 0007) : chaque événement (inscription reçue, dossier validé, dossier refusé avec motif) insère un email pending dans la MÊME transaction que l'événement (jamais bloquant), puis un worker déclenche l'envoi au meilleur effort (après commit + rejeu). Envoi via le transport SMTP existant (nodemailer/Mailpit en local), tentatives comptées, erreurs stockées, rejeu manuel/automatique. Les libellés suivent la Voice & Tone (sobres, actionnables), le refus inclut le motif et le numéro d'assistance (UX-DR-11).

## Boundaries & Constraints

**Always:**
- Table `email_outbox` : id, organisation_id, destinataire (email), type ('inscription_recue'|'dossier_valide'|'dossier_refuse'), payload jsonb (prénom, épreuve, motif?, …), statut ('pending'|'sent'|'failed'), attempts, last_error, sent_at, created_at — horodatages UTC.
- Insertion **dans la transaction de l'événement** (submitInscription, decideDossier valider/refuser) : si l'insertion échoue, l'événement échoue (cohérence) ; si l'ENVOI échoue, jamais bloquant.
- Worker `processOutbox(limit)` : envoie les pending (ordre created_at), marque sent/failed + attempts+1 + last_error ; appelé après chaque événement (best effort, erreurs avalées + log) ; exposable par un script `pnpm -F @azzel/web emails:send` (rejeu manuel/cron VPS).
- Contenus français sobres : objet + texte (pas d'HTML), tutoiement coureur ; refus = motif + « Appeler l'équipe » (numéro ASSISTANCE_PHONE) ; inscription reçue = récap pièces restantes (lien vers l'espace coureur).
- Idempotence : re-envoyer un même outbox id déjà sent = no-op ; un événement ne produit qu'une ligne (pas de doublon pour re-validation idempotente).
- Test local contre Mailpit (assertions via API http://localhost:8026) pour un test d'intégration d'envoi réel ; unitaires avec transport stubbé.

**Never:**
- Pas de templating HTML/CSS, pas de pièces jointes, pas de batch marketing (un destinataire par ligne).
- Pas de cron interne (pas d'infra) — le rejeu est best-effort post-événement + script manuel.
- Pas de notification pour les acceptations/dépôts de preuve (PRD FR-6 : reçu, validé, refusé).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inscription soumise | formulaire valide | Ligne pending 'inscription_recue' créée dans la même transaction, puis envoi best effort | Échec envoi : ligne failed, parcours intact |
| Dossier validé | decideDossier valider | Ligne 'dossier_valide' + envoi, statut sent | No error expected |
| Dossier refusé | refus + motif | Email refus avec motif + numéro assistance | No error expected |
| SMTP indisponible | transport qui échoue | pending → failed, attempts+1, last_error, événement métier réussi quand même | Log serveur |
| Rejeu | emails:send après retour SMTP | failed/pending renvoyés, sent non re-sent | No error expected |
| Re-validation idempotente | valider un dossier déjà validé | Aucune nouvelle ligne outbox | No error expected |
| Sans SMTP_URL | dev sans transport | Console log (déjà en place) : ligne sent avec note dev | No error expected |

</intent-contract>

## Code Map

- `apps/web/src/modules/iam/email.ts` — transport SMTP existant (readSmtpUrl, nodemailer, repli console) : réutiliser, ne pas dupliquer.
- `apps/web/src/modules/inscriptions/store.ts` — submitInscription (insertion outbox à ajouter dans la tx), decideDossier (idem valider/refuser, pas pour no-op) ; pattern tx FOR UPDATE en place.
- `apps/web/src/modules/inscriptions/migrations/` — 0007_email_outbox.sql ; runner composite (scan).
- `scripts/dev-mail.sh` — Mailpit SMTP 2525 / API 8026 (tests d'intégration d'envoi réel : créer la ligne, processOutbox, GET /api/v1/messages, chercher destinataire+objet, puis DELETE les messages pour isoler les tests).
- `apps/web/package.json` — script emails:send (tsx).
- ASSISTANCE_PHONE déjà lu (assistance-button) — centraliser la lecture.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/modules/inscriptions/migrations/0007_email_outbox.sql` -- table + index (statut, created_at).
- `apps/web/src/modules/notifications/` (nouveau module mince) -- outbox-store (insert in tx existantes, claim/fetch pending, mark sent/failed), email-contents.ts (types, sujets/corps français, motif+assistance pour refus), processOutbox(limit, deps) worker.
- `apps/web/src/modules/inscriptions/store.ts` + service -- brancher les insertions outbox dans submitInscription et decideDossier (skippées sur no-op), passer le prénom/épreuve/motif dans le payload.
- `apps/web/package.json` + `apps/web/src/modules/notifications/send-cli.ts` -- script emails:send (limite en argument, sortie lisible).
- Tests -- unitaires (contenus exacts, insertion dans tx, worker sent/failed/attempts, no-op idempotent, pas de re-send) ; intégration Postgres (cycle complet avec transport stubbé) ; intégration Mailpit gated (skip propre si API injoignable) : inscription → outbox → processOutbox → message visible dans Mailpit → purge.

**Acceptance Criteria:**
- Given une inscription soumise, when la transaction commit, then une ligne 'inscription_recue' existe ET l'envoi (réussi ou échoué) n'a jamais fait échouer la soumission.
- Given un refus avec motif, when l'email part, then il contient le motif et le numéro d'assistance.
- Given SMTP en panne, when processOutbox tourne, then les lignes passent failed avec last_error et le rejeu après réparation les envoie.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 22 findings — high 0, medium 5, low 13, false 1, maybe-false 0 (10 entrées patch, 3 rejets bas)
- findings (résumé) :
  - `[medium]` `[patch]` Double envoi concurrent : listOutstanding sans claim atomique (BH1+EC1) — revendication UPDATE...RETURNING + statut 'sending' (0007 amendé, dev réinitialisée).
  - `[medium]` `[patch]` Rejeu infini sans plafond ni backoff (BH2+EC2) — attempts < 5 (dead-letter signalée au CLI), next_attempt_at croissant.
  - `[medium]` `[patch]` SMTP absent en prod marquait sent sans envoi (EC3 + IA) — EmailSendError en production, repli console réservé au dev.
  - `[medium]` `[patch]` Tests checklist/preuve déclenchaient le VRAI worker contre la base DEV (VG-Other) — vi.mock via helper partagé (déduplication des 3 siblings, BH11).
  - `[medium]` `[patch]` Mapping SMTP jamais testé hors Mailpit (VG1, pré-vérifié) — vi.mock('nodemailer') assertant {from,to,subject,text} exact.
  - `[low]` `[patch]` Contrat « n'échoue jamais » : contentFor/getOutboxStore englobés (BH6+EC4) ; CLI catch + exitCode + realpath des symlinks (BH7+EC7) ; APP_URL validée avec repli (EC6) ; APP_EMAIL_FROM + dédup repli console (BH4+BH5) ; motif vide omis + destinataire vide loggé (BH12+BH8) ; README rejeu/cron/dead-letter (BH13+BH14) ; ordre/coverage du trigger (BH15).
  - `[low]` `[reject]` BH3 — doublon après échec du marquage post-envoi : at-least-once inhérent au pattern, atténué par le claim atomique, compromis assumé.
  - `[low]` `[reject]` BH9 — rétention des sent : volumes V1 faibles, purge ops ultérieure (CLI la rendra triviale).
  - `[low]` `[reject]` IA-B′ — emails pour toutes les transitions : FR-6 énumère reçu/validé/refusé ; périmètre spec respecté.

## Auto Run Result

**Statut : done.**

### Changement implémenté
File d'envoi email_outbox (0007 : pending/sending/sent/failed, attempts, next_attempt_at, last_error) insérée dans la transaction des événements (inscription reçue, validé, refusé avec motif) ; worker processOutbox à claim atomique, plafond 5 tentatives avec backoff, dead-letter signalée ; transport SMTP unique (nodemailer/Mailpit local, échec dur en prod sans SMTP_URL) ; CLI emails:send (rejeu manuel/cron VPS) ; contenus français sobres avec motif + numéro d'assistance et lien espace coureur (APP_URL validée) ; tests : contenus exacts, atomicité, claim/backoff/poison, mapping SMTP mocké, intégration Postgres + Mailpit end-to-end.

### Revue
4 couches — 22 constats → 10 patchs (5 medium, 5 low) corrigés (345/346 verts, 1 skip documenté) ; 3 rejets bas.

**Recommandation de re-revue : true** — 5 medium patchées ; risques nommés : (1) at-least-once assumé (doublon possible si crash entre envoi et marquage — rare, non fatale pour l'utilisateur), (2) le trigger post-événement est fire-and-forget : en serverless il pourrait ne pas finir — le cron emails:send couvre, (3) migration 0007 amendée post-application : base dev réinitialisée, aucun autre environnement.

### Vérification
Dev DB reset + 0001–0007 ✓ ; `pnpm test` 345 passés + 1 skip (28 fichiers) ; `pnpm build` + `pnpm typecheck` verts ; smoke CLI + Mailpit fait par le subagent (email refus reçu avec motif + numéro, puis nettoyé).

## Spec Change Log

## Review Triage Log

## Design Notes

Décisions : outbox inséré DANS la transaction métier (l'événement et son email sont atomiques — un échec d'insertion = incohérence à refuser), l'envoi est hors transaction (best effort + rejeu). Le worker est une fonction pure appelée post-commit par le service + un CLI : pas de boucle interne (sobriété, pas d'infra). Mailpit sert de SMTP réel local — le test d'intégration Mailpit est la seule vérification du transport nodemailer end-to-end (combler le gap VG4 de la 1-2).

## Verification

**Commands:**
- `bash scripts/dev-mail.sh up && pnpm -F @azzel/web db:migrate` -- expected: 0001–0007, Mailpit joignable.
- `pnpm test` -- expected: suite verte, matrice outbox couverte (Mailpit inclus si up).
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- Parcours : inscription → http://localhost:8026 (email reçu) ; refus avec motif → email avec motif+numéro ; couper Mailpit (`dev-mail.sh down`) → refuser → `dev-mail.sh up` + `pnpm -F @azzel/web emails:send` → email parti.

## Revue de code

**2026-10-22 — revue d'épopée (3 lentilles : adverse, chemins limites, trous de vérification) sur le diff complet des stories 1.1 à 1.9.**

### Constat retenu

`claimOutboxRow` passait la ligne à `statut = 'sending'` avant l'envoi SMTP, mais `listOutstanding` ne reprenait que `pending` et `failed`, et `countDeadLetters` ne comptait que `failed`. Si le process mourait entre la revendication et `markOutboxSent`/`markOutboxFailed` — crash, redéploiement, fin d'exécution serverless — la ligne restait bloquée en `sending` **à vie** : email jamais envoyé, jamais rejoué, et invisible du CLI. Les trois lentilles ont relevé ce défaut indépendamment. Il contredit directement le « and replay » du message de commit : un coureur pouvait ne jamais apprendre la décision sur son dossier, sans que personne ne le voie.

### Modifications apportées

- `migrations/0013_outbox_claimed_at.sql` (nouveau) — colonne `claimed_at timestamptz` sur `email_outbox` et index partiel `email_outbox_sending_claimed_idx` sur les lignes `sending`. Écrite en `IF NOT EXISTS` : applicable sur une base déjà migrée.
- `apps/web/src/modules/notifications/outbox-store.ts` — constante exportée `OUTBOX_CLAIM_LEASE_MINUTES = 15` et condition partagée « bail expiré » (`statut = 'sending' AND (claimed_at IS NULL OR claimed_at <= now() - 15 min)`) ; `claimed_at IS NULL` couvre les lignes `sending` antérieures à la migration, traitées comme un bail déjà expiré. `claimOutboxRow` horodate la revendication et accepte une ligne au bail expiré. `listOutstanding` reprend ces lignes. `markOutboxSent` / `markOutboxFailed` libèrent le bail. `countDeadLetters` compte les lignes abandonnées dont les tentatives sont épuisées. Le type `OutboxRow` n'a pas été élargi : `claimed_at` reste interne au store, aucun appelant n'est impacté.

### Incident de numérotation, à connaître

La migration a d'abord été écrite en `0010`, numéro **déjà pris** par `0010_sponsors.sql` (épopée 2, en cours en parallèle). Les deux auraient cohabité sans erreur, le runner triant par nom de fichier — c'est exactement le défaut relevé par ailleurs : `schema_migrations` est clé sur le seul nom de fichier, donc deux migrations homonymes de modules différents se masqueraient silencieusement. Renumérotée en `0013` et rendue idempotente avant d'être rejouée. Le défaut de fond (clé = basename) reste ouvert, documenté en story 1.1.

### Vérification

Test d'intégration ajouté : claim sans marquage → `processOutbox` ne propose rien (l'envoi lève s'il est appelé) → `claimed_at` reculé de 16 minutes → la ligne est reprise, `sent = 1`, `attempts = 2`. Par ailleurs, deux tests de ce fichier validaient un dossier sans preuve ni acceptations : complétés suite à la nouvelle règle de la story 1.6. Suite complète avec base : 558 passés, 0 échec.

### Constats non traités dans cette passe

`notifyOutbox` est lancé en promesse flottante (`void (async () => …)()`) sans `after()` ni `waitUntil` : Next peut geler l'exécution après la réponse, ce qui **produit** la situation corrigée ici plutôt que de l'éviter — le bail la rattrape désormais, mais la cause demeure. `buildNotificationEmail` retombe silencieusement sur « inscription reçue » pour un `type` inconnu. `APP_URL` absente produit sans bruit des liens `http://localhost:3000` dans les emails envoyés, alors que `SMTP_URL` absente échoue explicitement. Enfin, supprimer les deux appels à `notifyOutbox` ne fait échouer aucun test.
