---
title: 'Cycle de vie du dossier : en validation, et reprise après refus ou expiration'
type: 'feature'
created: '2026-11-11'
status: 'done'
route: 'dispatch'
baseline_commit: 'e235fcf972f8d1f81a251b13bb2af925ffc879f2'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un dossier refusé ou expiré est figé : le coureur ne peut plus corriger son inscription (la page affiche à tort « Dossier déjà validé »), alors que l'email d'expiration l'invite à se réinscrire. Et rien ne distingue un dossier qui attend son paiement d'un dossier qui attend l'examen de l'organisation : les deux sont « en constitution ».

**Approach:** Cycle de vie explicite, décidé par le PO (11/11/2026) :

```
en constitution (place réservée, max 48 h) ── preuve déposée ──▶ en validation
en constitution (max 48 h) ── preuve manquante ──▶ expirée (place rendue)
en validation ──▶ validé
en validation ──▶ refusé (place rendue)
refusé / expirée ── « Modifier mon inscription » ──▶ en constitution (48 h) ou liste d'attente
```

**Décisions (PO, 11/11/2026) :**
- **Reprise = règle commune** : enregistrer « Modifier mon inscription » depuis `refusé` ou `expirée` donne `en constitution` avec une nouvelle échéance (J+délai) s'il reste une place, sinon `liste d'attente` ; le lit suit le contingent commun. Motif de refus effacé, `expired_at` conservé.
- **Nouvelle preuve exigée après un refus** : à la reprise, la preuve refusée cesse d'être active ; le coureur doit en déposer une nouvelle (un fichier identique à la preuve refusée reste refusé). Depuis `refusé`, la seule action proposée est « Modifier mon inscription ».
- **`en validation` est figé** jusqu'à la décision : le coureur peut seulement remplacer sa preuve (le dossier reste en validation).
- **Acceptations avant preuve** (PO, 11/11/2026, revue) : le dépôt d'une preuve exige la décharge et le règlement acceptés ; aucune acceptation n'est possible en validation.

## Boundaries & Constraints

**Always:**
- Nouveau statut `en validation` : occupe une place (et son lit), n'expire jamais.
- Le dépôt d'une preuve fait passer `en constitution` → `en validation`, dans la même transaction.
- L'organisateur ne décide (valider / refuser) que depuis `en validation`.
- `refusé` et `expirée` rendent la place et le lit (inchangé) et deviennent modifiables par le coureur ; « Dossier déjà validé » est réservé à `validé`.
- Migration des données : tout dossier `en constitution` avec une preuve active passe `en validation`.
- Libellés, pastilles, checklist, file admin « à examiner » et emails (refus, expiration) suivent le nouveau cycle.

**Never:**
- Aucun changement de la durée de réservation (délai paramétrable existant, 48 h par défaut) ni de la liste d'attente.
- `validé` reste figé.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu |
|---|---|---|
| Dépôt de preuve | en constitution, acceptations faites, preuve valide | en validation, plus d'échéance |
| Dépôt sans acceptations | en constitution, décharge ou règlement manquant | refus 409 nommé, renvoi vers les acceptations |
| Échéance passée sans preuve | en constitution, `preuve_due_at` dépassée | expirée, place rendue (inchangé) |
| Échéance passée en validation | en validation, `preuve_due_at` dépassée | reste en validation |
| Décision admin | en validation | validé, ou refusé + motif |
| Décision admin hors validation | en constitution / refusé / expirée | refus 409, rien ne change |
| Modifier un refusé, place dispo | refusé, envoi valide | en constitution, nouvelle échéance, motif effacé, preuve refusée inactive |
| Modifier un refusé ou expiré, complet | capacité atteinte | liste d'attente, sans échéance |
| Redépôt du fichier refusé | reprise faite, mêmes octets que la preuve refusée | refus 409 dédié |
| Modifier en validation | en validation, envoi | 409, dossier figé ; remplacement de preuve accepté, reste en validation |
| Modifier un expiré, place dispo | expirée, même email, envoi valide | en constitution, nouvelle échéance, `expired_at` conservé |
| Modifier un validé | validé, envoi | 409, page « Dossier déjà validé » |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/domain.ts` -- statuts (l.30-45), `STATUTS_OCCUPANT_UNE_PLACE` (l.68), `STATUTS_MODIFIABLES` (l.71), `statutInitial` (l.96), libellés/pastilles (l.265-290), `canDepositPreuve` (l.400).
- `apps/web/src/modules/inscriptions/migrations/0036_expiration_preuve.sql` -- CHECK des statuts à étendre ; prochain numéro libre : `0044`.
- `apps/web/src/modules/inscriptions/store.ts` -- `expirerInscriptionsEchues` (l.809, filtre `en constitution`) ; `upsertCoureur` (l.1210-1340, `ON CONFLICT ... WHERE status = ANY(STATUTS_MODIFIABLES)`, ne touche pas au statut à la mise à jour) ; `acceptDocuments` (l.1355, exige en constitution) ; `savePreuve` (l.1440-1545, refusé → en constitution) ; `decideDossier` (l.1680-1800).
- `apps/web/src/modules/inscriptions/service.ts` -- checklist (l.900-965).
- `apps/web/src/app/inscription/page.tsx` (l.122), `app/acceptations/page.tsx` (l.127), `app/preuve/page.tsx` (l.129-160), `app/admin/dossiers/page.tsx` (l.74), `app/admin/dossiers/[id]/page.tsx`.
- `apps/web/src/modules/notifications/email-contents.ts` -- emails `inscription_expiree` (l.216) et `dossier_refuse` (l.287).
- `apps/web/src/modules/seed/seed.ts` -- stades fictifs à aligner.

## Tasks & Acceptance

**Execution:**
- [x] `migrations/0044_statut_en_validation.sql` -- CHECK des statuts + `en validation` ; migration des dossiers en constitution avec preuve active.
- [x] `domain.ts` -- statut, libellé, pastille ; ensembles de statuts ; fonction pure de transition « reprise » testée.
- [x] `store.ts` -- dépôt → en validation ; décision depuis en validation seulement ; `upsertCoureur` : reprise depuis refusé/expirée sous le verrou d'édition (`statutInitial`, `hebergementAccorde`), motif effacé, nouvelle échéance, preuve refusée désactivée ; `savePreuve` : dépôt depuis refusé interdit, garde « fichier identique à la preuve refusée » conservée.
- [x] `service.ts`, pages coureur et admin -- checklist, actions, file « à examiner », pages figées libellées selon le statut.
- [x] `email-contents.ts` -- refus et expiration : « Modifier mon inscription ».
- [x] `seed` -- stades alignés sur le nouveau cycle.
- [x] Tests unitaires et d'intégration de la matrice ; recette `scenarios-recette-inscriptions.md` (module « Cycle de vie du dossier »).

**Acceptance Criteria:**
- Given la migration appliquée sur une base existante, when on la rejoue, then elle est idempotente et aucun dossier avec preuve active ne reste en constitution.
- Given un coureur refusé ou expiré, when il ouvre son espace, then il voit le motif (refus) et l'action « Modifier mon inscription ».

## Implementation Notes

- **Preuve « refusée »** : nouveau statut de preuve (`active | replaced | refusée`, CHECK étendu en 0044). À la reprise d'un dossier refusé, la preuve active passe `refusée` ; le garde « fichier identique » compare le nouveau dépôt aux preuves `refusée` du coureur (`PreuveIdenticalRefusedError`, 409 `preuve.identique_refusee`).
- **`expired_at` conservé** : la contrainte 0036 `(status = 'expirée') = (expired_at IS NOT NULL)` devient une implication `status <> 'expirée' OR expired_at IS NOT NULL`.
- **`preuve_due_at` en validation** : la colonne n'est pas effacée au dépôt ; « plus d'échéance » est porté par le statut (balayage et rappel ne visent que `en constitution`, l'encart d'échéance ne s'affiche qu'en constitution).
- **Acceptations avant preuve** : `peutAccepterDocuments` ne vaut que pour `en constitution` ; `savePreuve` refuse le dépôt sans décharge et règlement (`AcceptationsManquantesError`, 409 `preuve.acceptations_manquantes`, action vers `/acceptations`) ; `/preuve` renvoie vers `/acceptations` au lieu du formulaire.
- **Décision admin** : `valider` sur un `validé` reste un no-op idempotent ; `refuser` un `validé` reste `DossierValidatedError` ; tout autre statut que `en validation` → `DossierHorsValidationError` (409 `admin.dossier_hors_validation`). Le formulaire de décision n'est rendu qu'en validation.
- **Erreurs coureur** : `DossierEnValidationError` (409 `inscriptions.dossier_en_validation`), `DossierAReprendreError` (409 `inscriptions.dossier_a_reprendre`, refusé/expirée) et `DossierListeAttenteError` (409 `inscriptions.dossier_liste_attente`) remplacent le « déjà validé » trompeur ; `DossierValidatedError` est réservé à `validé`.
- **Trace de décision** : `decided_by/decided_at` conservés après reprise ; la page admin ne les affiche que sur un dossier validé ou refusé.
- **Emails par échéance** : `rappel_preuve` et `inscription_expiree` portent `echeance` (ISO de `preuve_due_at`) dans le payload ; 0044 complète les lignes existantes puis recrée les deux index uniques sur (organisation, coureurId, échéance). Un dossier repris est rappelé et prévenu de nouveau à sa nouvelle échéance.
- **Numérotation** : la branche non fusionnée `feat/inscriptions-wilaya-hebergement` porte aussi une `0044_wilaya_pays.sql` ; les noms diffèrent, le runner les applique toutes deux (ordre alphabétique : statut puis wilaya).

## Spec Change Log

- **Itération 1 (revue, 11/11/2026)** — Constat : une preuve pouvait être déposée sans acceptations, d'où un dossier « en validation » invalidable ; l'implémentation avait ajouté une exception (compléter les acceptations en validation) contraire au gel. Amendement (décision PO dans le bloc gelé) : acceptations exigées avant le dépôt. État évité : dossier en validation bloqué, ou mutable pendant l'examen. KEEP : tout le reste de l'implémentation (migration 0044, reprise sous verrou, erreurs dédiées, tests du cycle) ; correction localisée sans réécriture, l'écart n'étant pas structurel.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | BH, EC | Exception « compléter les acceptations en validation » contraire au gel ; textes contradictoires ; blocage après clôture | high | `peutAccepterDocuments` ; `/preuve` ne vérifie pas les acceptations | intent_gap → décision PO (acceptations avant preuve), correction localisée |
| 2 | BH, EC, VG | Rappel et email d'expiration dédoublonnés par coureur : un dossier repris qui expire de nouveau n'est pas prévenu | medium | Index uniques 0036 sur `(organisation_id, coureurId)` | patch |
| 3 | BH, EC | Liste d'attente : « Dossier déjà validé » en 409 sur dépôt/acceptation | medium | `erreurStatutFige` replie sur `DossierValidatedError` ; spec réserve ce titre à validé | patch |
| 4 | BH, EC, VG | Compteur « Acceptations manquantes » : liste d'attente comptée, exclusion expirée non testée | low | `admin/dossiers/page.tsx:79-84` | patch |
| 5 | EC | Checklist : liste d'attente annonce la validation « après la preuve » ; en validation sans preuve lue → « dépose ta preuve » | low | `service.ts:977-984` | patch |
| 6 | BH | Fil d'étapes ignore « en validation » | medium | `components/fil-etapes.tsx` non modifié | patch |
| 7 | BH | Branche morte « déjà validé » dans `decision-form.tsx` | low | Formulaire rendu seulement en validation | patch |
| 8 | BH | Motif du seed « déposer une nouvelle preuve » contraire au cycle | low | `seed/donnees.ts` ~l.150 | patch |
| 9 | BH | Recette 9.27 inexécutable, 9.2 vague, remise en état I9 absente | low | Document de recette | patch |
| 10 | VG, BH | Tests manquants : 409 en validation sur acceptation (assertion lâche), expirée sur dépôt, pages liste d'attente/expirée, checklist | medium | `dossiers-admin.integration.test.ts:297` `.rejects.toThrow()` ; fixtures sans ces statuts | patch |
| 11 | BH | Preuve remplacée pendant l'examen : l'admin valide une preuve non vue | medium | `decideDossier` sans identifiant de preuve ; course déjà possible avant (en constitution avec preuve) | defer |
| 12 | BH | Historique du refus perdu à la reprise côté admin | medium | Motif effacé (gelé) ; seule la preuve « refusée » trace | defer |
| 13 | BH | Reprise impossible après clôture alors que les messages la proposent | medium | `submitInscription` lève `RegistrationClosedError` ; même limite avant (rejet BH15 de 1-6) | defer (décision PO) |
| 14 | EC | Ordre des verrous inverse entre `upsertCoureur` et `decideDossier` → interblocage possible | low | Ordre de `decideDossier` préexistant | defer |
| 15 | EC | Preuves refusées de l'ancien cycle (« replaced ») non couvertes par le garde « fichier identique » | low | Données héritées rares ; correctif = migration de données incertaine | rejeté |

## Verification

**Commands:**
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` -- expected: aucune erreur
- `bash scripts/dev-db.sh up && AZZEL_REQUIRE_DB=1 node_modules/.bin/vitest run` -- expected: suite complète verte
