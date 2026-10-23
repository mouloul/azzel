---
title: 'Story 6.4 — Pédagogie batterie et rappel J-7'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '6265d5f'
baseline_commit: 6265d5faf174321834ba10fbb8576e8d6bb9a64b
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-6-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le coureur arrive le jour J avec une batterie à moitié vide et l'app tuée par le système : son suivi et son e-dossard meurent en pleine course ; et rien ne lui rappelle de préparer son téléphone à J-7.

**Approach:** 1) App : rubrique batterie (écran dédié) avec la carte à puces — partir à 100 %, ne pas tuer l'application pendant la course, powerbank en vente au village — CONCLUE par la citation « Un point après l'autre, et l'ouvrage est parfait » source « Sagesse kabyle (Hanoteau, 1867) » (formulation canonique du projet) ; affichée à l'ACTIVATION du suivi (navigation auto vers la rubrique) et accessible en permanence (bouton depuis Suivi et e-dossard). 2) Serveur : nouveau type d'email `rappel_j7` dans la file existante (worker, rejeu, backoff — épopée 1), texte brut tutoié avec lien vers l'app (`RUNNERS_APP_URL`, repli `APP_URL`) ; enfilement par CLI `emails:j7` (cron VPS, comme `emails:send`) : un email par coureur VALIDÉ de l'édition courante quand `aujourd'hui ≥ J-7` et avant la course, idempotent par index unique partiel. 3) L'alerte batterie < 15 % côté coureur reste balisée Should — NON implémentée ici.

## Boundaries & Constraints

**Always:**
- Carte à puces : exactement les trois conseils (100 % au départ / ne pas tuer l'app / powerbank au village), langage concret, tutoiement ; CONCLUE par la citation avec la source TOUJOURS notée « Sagesse kabyle (Hanoteau, 1867) ».
- La citation n'apparaît QUE dans la rubrique batterie (point d'usage) — jamais groupée ailleurs, jamais en zone critique (UX-DR-5/17).
- Rubrique accessible en permanence depuis l'écran Suivi ET l'écran e-dossard, suivi désactivé compris ; l'activation du suivi (toggle ON) y navigue automatiquement.
- Email `rappel_j7` : file `email_outbox` existante (worker, backoff, rejeu `emails:send`), texte brut tutoié, sujet clair, date de course lisible (fr), lien vers l'app en évidence, signature « L'équipe Azzel », aucune donnée personnelle au-delà du prénom/destinataire.
- Enfilement J-7 : uniquement les coureurs VALIDÉS de l'édition courante ; fenêtre `J-7 ≤ aujourd'hui < jour de course` (ratrappage si le cron a raté un jour) ; idempotence par index unique partiel `(organisation_id, destinataire) WHERE type = 'rappel_j7'` — un rejeu ne double JAMAIS l'envoi.
- `RUNNERS_APP_URL` (repli `APP_URL`) lu serveur-side, jamais codé dur.

**Never:**
- Pas d'alerte batterie < 15 % (Should balisé `[ASSUMPTION: à confirmer]` — aucune dépendance expo-battery).
- Pas de HTML email (texte brut, cohérent avec 1.8) ; pas de nouveau worker ni cron interne (le cron reste externe, comme documenté pour `emails:send`).
- Pas de modification du moteur de suivi/tracking (6.2) ni du guide permission (6.3) ; pas de tracking d'ouverture d'email.
- La citation n'est jamais recopiée dans un autre écran ni dans l'email (l'email donne les conseils courts, pas la citation).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Activation du suivi | toggle ON | Navigation auto vers la rubrique batterie (carte à puces + citation sourcée), Retour vers Suivi | N/A |
| Rubrique permanente | bouton depuis Suivi ou e-dossard | Même carte, même hors opt-in | N/A |
| Citation | rendu de la rubrique | Texte exact + « Sagesse kabyle (Hanoteau, 1867) » sous la citation | N/A |
| Enfilement J-7 | `emails:j7` le jour J-7, coureurs validés | 1 email `rappel_j7` par coureur dans la file, worker l'envoie (Mailpit en dev) | envoi échoue → backoff/rejeu standard |
| Rejeu cron même jour | `emails:j7` relancé | AUCUN doublon (index unique partiel, insert conflitté ignoré) | N/A |
| Ratrappage | cron raté J-7, relancé à J-5 | Les coureurs non encore notifiés reçoivent le rappel (fenêtre ≥ J-7, avant course) | N/A |
| Jour de course / après | `emails:j7` à J ou après | Aucun enfilement | N/A |
| Coureur non validé | statut ≠ validé | Aucun email | N/A |
| Email rendu | payload {prénom, dateCourse, url} | Sujet + texte tutoié, date fr lisible, lien app en évidence, assistance | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/notifications/email-contents.ts` — `NOTIFICATION_TYPES`, `buildNotificationEmail`, `readAppUrl` : ajouter `rappel_j7` + `readRunnersAppUrl()` (`RUNNERS_APP_URL` ?? APP_URL).
- `apps/web/src/modules/notifications/worker.ts` / `outbox-store.ts` / `send-cli.ts` — pattern existant à étendre : nouveau CLI `emails:j7` (planification + délégation au worker).
- `apps/web/src/modules/inscriptions/migrations/0007_email_outbox.sql` (CHECK sur `type`) — migration 0031 : CHECK étendu à `rappel_j7` + index unique partiel idempotence.
- `apps/web/src/modules/inscriptions/store.ts` — `findCurrentEdition` (race_date), `listCoureurs({editionId, organisationId})` (statut, email via account) : liste des validés à J-7.
- `apps/web/src/src/app/parcours/page.tsx:const CITATION_SOURCE` — format canonique « Sagesse kabyle (Hanoteau, 1867) » à réutiliser tel quel.
- `apps/runners/src/ecrans/suivi.tsx` / `edossard.tsx` — boutons d'accès à la rubrique ; `src/app-state.ts` écran `'batterie'` ; `App.tsx` câblage + navigation auto à l'activation (après succès du toggle ON).
- `apps/runners/src/ecrans/ui.tsx` — `Carte`/`Bouton` pour composer la rubrique.
- Tests : `notifications.test.ts` (rendu par type, mock nodemailer), `outbox.integration.test.ts` (flux file + Mailpit `probeMailpit`), runners vitest node.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/runners/src/ecrans/batterie.tsx` — carte à puces (3 conseils concrets tutoyés) conclue par la citation exacte + « Sagesse kabyle (Hanoteau, 1867) », cibles ≥ 48 dp, Retour vers l'écran d'origine.
- [ ] `apps/runners/src/app-state.ts` + `App.tsx` + `suivi.tsx` + `edossard.tsx` — écran `'batterie'` ; navigation AUTO à l'activation réussie du suivi ; bouton « Préparer ma batterie pour le jour J » depuis Suivi et e-dossard (mémoriser l'écran d'origine pour le Retour).
- [ ] `apps/web/src/modules/notifications/email-contents.ts` (+ tests) — type `rappel_j7` : sujet (« Ta course approche — prépare ta batterie »), texte tutoyé : date de course fr, les 3 conseils courts, lien app en évidence (`readRunnersAppUrl()`), assistance, signature ; `readRunnersAppUrl` (RUNNERS_APP_URL ?? APP_URL).
- [ ] `apps/web/src/modules/inscriptions/migrations/0031_rappel_j7.sql` + `MIGRATION_DIRS` inchangé (dossier inscriptions) — CHECK `type` étendu à `rappel_j7` ; index unique partiel `(organisation_id, destinataire) WHERE type = 'rappel_j7'`.
- [ ] `apps/web/src/modules/notifications/worker.ts` ou service dédié (+ tests) — `planifierRappelsJ7()` : édition courante par organisation, coureurs VALIDÉS, fenêtre `J-7 ≤ aujourd'hui < race_date`, enfilement idempotent (ON CONFLICT DO NOTHING sur l'index partiel) ; le worker existant envoie (aucun changement).
- [ ] `apps/web/src/modules/notifications/send-cli.ts` (ou CLI jumeau) — commande `emails:j7` : planifie PUIS délègue à `processOutbox` ; doc d'utilisation cron dans le README/scripts (une ligne, comme `emails:send`).
- [ ] Intégration — enfilement J-7 (fenêtre, coureur non validé exclu, idempotence sur rejeu, après-course aucun enfilement) + envoi effectif via le worker (Mailpit si dispo, skip sinon).
- [ ] Tests matrice — chaque rangée couverte (rendu + enfilement + app).

**Acceptance Criteria:**
- Given le suivi activé OU la rubrique ouverte, when la carte s'affiche, then les trois conseils batterie y sont, conclus par « Un point après l'autre, et l'ouvrage est parfait — Sagesse kabyle (Hanoteau, 1867) » (FR-20, UX-DR-5/17).
- Given J-7 atteint et le cron `emails:j7` lancé, when le worker traite la file, then chaque coureur validé reçoit un unique email de rappel avec lien vers l'app — rejeu le même jour = zéro doublon.
- Given `pnpm typecheck && pnpm test && pnpm test:db`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : rubrique batterie = écran dédié (réutilisable, citation au point d'usage) navigué automatiquement à l'activation ; email J-7 en texte brut cohérent 1.8, déclenchement par CLI cron externe (aucun cron interne introduit), fenêtre de ratrappage ≥ J-7 avant course, idempotence par index unique partiel ; alerte < 15 % NON implémentée (Should balisé, dépendance expo-battery à confirmer) — voir deferred-work.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès
- `pnpm test:db` -- expected: succès (intégration J-7)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | high | Pagination ignorée : `listCoureurs` plafonne à 200 (ORDER BY created_at DESC, hasMore jamais lu) — les validés au-delà ne reçoivent jamais le rappel, sans erreur (rappel-j7.ts:117-121, confirmé en lecture du store). | patch |
| 2 | medium | Idempotence non scopée par édition : index (org, destinataire) à vie — un coureur récurrent de la saison suivante ne reçoit JAMAIS son nouveau rappel. Scoper par date de course. | patch |
| 3 | medium | Objet fixe « dans une semaine » inexact en rattrapage (J-5/J-2 couverts par les tests eux-mêmes) — objet neutre « Ta course approche ». | patch + spec |
| 4 | low | README.md et .env.example modifiés mais non stagés dans le diff (fichiers racine hors des chemins add) — les inclure au commit. | process |
| 5 | low | Citation dupliquée web (parcours/page.tsx) / app (batterie-contenu.ts) — source unique dans @azzel/shared. | patch |
| 6 | low | dateUtcAujourdhui en UTC vs course algérienne (fenêtre évaluée à la veille entre 00h00–01h00 locale) — date civile Africa/Algiers. | patch |
| 7 | low | versUtcMs accepte les dates inexistantes (2027-02-31 roule) — validation aller-retour. | patch |
| 8 | low | formaterDateCourseFr('') rend « Ta course est le  — » : phrase de repli si date invalide. | patch |
| 9 | low | Une transaction par coureur dans le cron : coût négligeable pour un passage quotidien. | rejeté |
| 10 | low | EcranBatterie sans BoutonAssistance (incohérent avec Suivi/e-dossard/email). | patch |
| 11 | low | Chemin erroné dans le Code Map (apps/web/src/src/...) — coquille de spec. | spec-texte |
| 12 | false | Matrice « payload {…, url} » vs url lue au rendu : sémantique équivalente (URL toujours fraîche — meilleur choix), le correctif demandé édite la spec gelée. | rejeté |
| 13 | low | Course : écran changé pendant await basculerOptin → navigation batterie peut écraser le guide auto ; naviguer seulement si l'écran n'a pas bougé. | patch |
| 14 | medium | CLI `emails:j7` : limite défaut du worker (20) < file J-7 d'une grande édition — rappels envoyés 20 par passage, possiblement après la course. | patch |
| 15 | low | Câblage runners (navigation auto, boutons) sans test : harnais RN déjà arbitré disproportionné (deferred-work). | différé |
| 16 | low | Délégation CLI → worker non testée : précédent emails:send identique, logique testée de part et d'autre. | différé |

## Spec Change Log

- 2026-10-23 revue 1 : objet email « Ta course est dans une semaine — prépare ta batterie » remplacé par « Ta course approche — prépare ta batterie » (exact à J-7 comme en rattrapage J-2, la date précise restant dans le corps) ; tâche rendu mise en cohérence. KEEP : texte du corps inchangé (conseils + lien + assistance).
- 2026-10-23 revue 1 : idempotence affinée — l'index unique partiel porte (organisation, destinataire, date de course) et non plus (organisation, destinataire) à vie, pour qu'un coureur récurrent reçoive le rappel de CHAQUE saison. État connu-évité : rappel de saison 2 avalé par celui de saison 1.
