---
title: 'Dossier en validation totalement figé : plus de remplacement de preuve'
type: 'feature'
created: '2026-11-11'
status: 'done'
route: 'dispatch'
baseline_commit: '0f33db2'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un dossier « en validation » laisse encore le coureur remplacer sa preuve (bouton « Remplacer ma preuve » sur l'accusé de réception, `/preuve`, espace coureur, page `/inscription`). Le PO ne veut plus aucune action coureur pendant l'examen ; le remplacement permettait en outre à l'organisateur de valider une preuve qu'il n'a pas vue.

**Approach:** Décision PO (11/11/2026), qui amende la décision « en validation est figé, seule la preuve peut être remplacée » de `spec-dossier-refuse-modifiable.md` : en validation, **aucun dépôt**. Un coureur qui s'est trompé de fichier appelle l'organisation, qui refuse le dossier ; il le reprend par « Modifier mon inscription ».

## Boundaries & Constraints

**Always:**
- Le serveur refuse tout dépôt de preuve hors « en constitution » (`canDepositPreuve`), avec l'erreur 409 existante `DossierEnValidationError` pour « en validation » ; son action renvoie vers l'assistance, plus vers le remplacement.
- `/preuve` en validation : page en lecture seule — preuve déposée (date, format, n° de transaction), « en cours de validation », bouton d'assistance, lien vers l'espace ; aucun formulaire.
- Aucune action « Remplacer ma preuve » nulle part : accusé de réception (seul « Voir mon dossier » reste), checklist, `/inscription` figée, fil d'étapes (plus de lien sur Paiement en validation).
- L'accusé de réception n'a plus qu'un message (premier dépôt) : plus de variantes remplacement / déjà reçue.

**Never:**
- Aucun changement de la reprise après refus/expiration ni des décisions admin.
- Pas de migration.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu |
|---|---|---|
| Dépôt en constitution | acceptations faites, preuve valide | en validation, accusé de réception sans bouton de remplacement |
| Dépôt en validation | statut en validation, POST preuve | 409 `inscriptions.dossier_en_validation`, preuve active inchangée |
| `/preuve` en validation | GET | lecture seule : preuve déposée + assistance, aucun champ ni bouton d'envoi |
| Espace coureur en validation | checklist | aucune action sur la pièce preuve |
| `/inscription` en validation | GET | page figée sans lien de remplacement |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/domain.ts` -- `canDepositPreuve` (l.466) : en constitution seulement ; commentaires l.99 et l.461 à aligner.
- `apps/web/src/modules/inscriptions/store.ts` -- `savePreuve` : garde déjà `canDepositPreuve` + `erreurStatutFige` (ne rien ajouter si suffisant).
- `apps/web/src/modules/inscriptions/errors.ts` -- l.46 (commentaire), l.309 (action « Tu peux seulement remplacer ta preuve… »).
- `apps/web/src/modules/inscriptions/service.ts` -- l.947 : action « Remplacer ma preuve de paiement ».
- `apps/web/src/app/inscription/page.tsx` -- l.137-143 : texte et lien de remplacement en validation.
- `apps/web/src/app/preuve/page.tsx` -- l.129 (branche figée via `canDepositPreuve`), l.212-216 (encart « Tu peux encore la remplacer »).
- `apps/web/src/app/preuve/preuve-form.tsx` -- titre « Remplacer ta preuve », mention « Tu peux la remplacer », libellé « Remplacer ma preuve », état `envoi`/variantes, `onRemplacer`, `retourAuFormulaire`.
- `apps/web/src/app/preuve/preuve-envoyee.tsx` -- variantes et bouton « Remplacer ma preuve ».
- `apps/web/src/components/fil-etapes.tsx` -- l.93 : lien Paiement en validation.
- Tests concernés : `cycle-de-vie.integration.test.ts` (« remplacement de preuve accepté, reste en validation » à inverser), `app/preuve/page.test.tsx`, `preuve-envoyee.test.tsx`, `checklist.test.ts`, `app/inscription/cycle-de-vie.test.tsx`, fil d'étapes.
- `_bmad-output/implementation-artifacts/scenarios-recette-inscriptions.md` -- module I10 : étapes de remplacement en validation.

## Tasks & Acceptance

**Execution:**
- [x] `domain.ts`, `errors.ts`, `store.ts` -- dépôt réservé à « en constitution », message 409 orienté assistance.
- [x] `service.ts`, `fil-etapes.tsx`, `app/inscription/page.tsx` -- plus aucune action de remplacement.
- [x] `app/preuve/page.tsx` -- vue lecture seule en validation.
- [x] `preuve-form.tsx`, `preuve-envoyee.tsx` -- accusé à message unique, sans bouton de remplacement ; code de remplacement retiré.
- [x] Tests de la matrice ; recette I10 alignée ; note d'amendement dans `spec-dossier-refuse-modifiable.md` (Spec Change Log) ; entrée de `deferred-work.md` « preuve remplacée pendant l'examen » marquée résolue par cette décision (nouvelle entrée, ne pas modifier l'ancienne).

**Acceptance Criteria:**
- Given un dossier en validation, when le coureur ouvre son espace, `/preuve` ou `/inscription`, then aucun moyen de déposer ou remplacer une preuve n'est proposé, et l'assistance l'est.

## Implementation Notes

- `store.ts` : avant la garde `canDepositPreuve`, un rejeu à l'identique en validation (même sha256 ET même numéro que la preuve active) renvoie cette preuve sans rien écrire — renvoi après réponse perdue. Tout autre dépôt en validation reste refusé en 409.
- `/preuve` en validation est rendue AVANT le contrôle de clôture : un dossier déposé reste consultable en lecture seule après la clôture des inscriptions.
- `preuve-form.tsx` ne rafraîchit plus la page après un dépôt réussi : la page serveur, désormais en lecture seule, démonterait le formulaire et effacerait l'accusé de réception. Sur un 409 `inscriptions.dossier_en_validation` (second onglet, autre fichier), pas de rafraîchissement non plus (`doitRafraichirApresErreur`, code partagé `CODE_DOSSIER_EN_VALIDATION`) : le formulaire passe dans un état terminal (brouillon effacé, aucun contrôle de dépôt) et garde le message, l'assistance et un lien « Voir ma preuve déposée ».
- `/inscription` en validation : texte d'orientation vers l'organisation + bouton « Appeler l'équipe » (critère « l'assistance l'est »).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | BH, EC, VG | Renvoi après réponse perdue (même fichier, même numéro) → 409 « contacte l'organisation » alors que la preuve est enregistrée | medium | `canDepositPreuve` passe avant la branche de rejeu de `savePreuve` | patch (rejeu idempotent en validation) |
| 2 | BH, EC | Après 409 en validation, formulaire toujours actif (renvois voués à l'échec) | medium | `preuve-form.tsx` garde brouillon et boutons | patch (état terminal) |
| 3 | VG, BH | Décision « pas de rafraîchissement sur 409 en validation » et route non testées | medium | Aucun test de `PreuveForm` ni du cas dans `route.test.ts` | patch (fonction pure testée + cas de route) |
| 4 | BH | Lecture seule sans preuve lue : titre sans détail | low | `page.tsx` vue en validation, `preuve === null` | patch |
| 5 | BH | Accusé sans consigne en cas d'erreur de fichier | low | `/preuve` et `/inscription` l'ont, pas l'accusé | patch |
| 6 | BH | Recette I10 sans réponse perdue, second onglet, clôture | low | Document de recette | patch |
| 7 | BH | Commentaire `domain.ts` non réaligné | low | Ligne modifiée | patch |
| 8 | BH | Lecture seule sans aperçu du fichier déposé | medium | Aucune route de téléchargement coureur | defer |
| 9 | BH | Fichier écrit sur le stockage avant le contrôle de statut | low | Comportement préexistant ; fichier orphelin retiré au mieux | rejeté |
| 10 | BH, EC | Branche de remplacement du store inatteignable ; en constitution + preuve active (hérité) | low | Après 0044 et la reprise (preuve refusée inactive), état inatteignable | rejeté |
| 11 | BH | Pas de test client de `PreuveForm` | low | Aucun outillage DOM ; décision extraite en fonction pure (#3) | rejeté |
| 12 | BH | Spec et documents absents du diff relu | false | Fichiers suivis au commit | rejeté |

## Verification

**Commands:**
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` -- expected: aucune erreur
- `bash scripts/dev-db.sh up && AZZEL_REQUIRE_DB=1 node_modules/.bin/vitest run` -- expected: suite complète verte (node : `PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`)
