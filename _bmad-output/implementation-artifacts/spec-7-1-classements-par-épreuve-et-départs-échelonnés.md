---
title: 'Story 7.1 — Classements par épreuve et départs échelonnés'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '1c53050'
baseline_commit: '1c53050357e652c35b0640597c68153cb4c1b1c9'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-7-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rien ne permet de comparer les coureurs équitablement : aucune heure de départ officielle n'existe (ni table ni colonne), aucun classement n'est calculé (le PC course 5.1 ne compte que des totaux), et la vitrine publique de l'épopée 7 restera sans résultats justes.

**Approach:** 1) Modèle : colonne `epreuve.heure_depart` (timestamptz nullable, une par épreuve = départs échelonnés), migration 0033 ; configuration organisateur (carte « Heures de départ » sur `/admin/course`, API dédiée). 2) Contrat partagé `classements.ts` (`@azzel/shared`) : par épreuve, lignes {dossard, rang, tempsMs, statut arrivé/en course/abandonné, categorieAge}. 3) Service chrono `getClassements(organisationId)` : UNE transaction (instant cohérent NFR-4, gabarit `etatCourse`) — partants par épreuve (validés + numérotés + retirés), temps = premier Passage ARRIVÉE arbitré (horodatage serveur AD-3) − heure de départ officielle de l'épreuve ; abandons exclus du classement mais listés ; annulations neutres (premier non-annulé fait foi). 4) Scratch + catégories d'âge (`age_category` existante) ; classement par sexe balisé assumption → NON implémenté (aucune donnée sexe à l'inscription, à confirmer produit). Le scan au départ n'entre JAMAIS dans le calcul (AD-3, testé).

## Boundaries & Constraints

**Always:**
- Un coureur n'apparaît que dans le classement de SON épreuve ; le rang ne se compare QUE entre coureurs de la même épreuve.
- Temps = `horodatage_reception` serveur du premier passage ARRIVÉE non annulé − `heure_depart` officielle de l'épreuve — jamais l'heure appareil, jamais un scan de départ (AD-3).
- Cohérence NFR-4 : toutes les données d'un classement proviennent d'UNE transaction (même instant) ; sans heure de départ configurée pour une épreuve, son classement est `{ configure: false }` (jamais de temps faux à zéro).
- Classement PROVISOIRE par nature : le contrat porte le libellé, jamais « officiel » ni « temps réel » ; fraîcheur (dernier passage reçu) servie avec.
- Abandonnés : jamais rangés (sortis de la course), listés à part avec leur dossard ; partants non arrivés : « en course », sans temps.
- Égalité de temps : rang ex æquo (même rang, rang suivant sauté — 1,1,3).
- RLS : lecture sous GUC organisation ; heures de départ éditables uniquement par un organisateur (garde admin).

**Never:**
- Pas de page publique ni de partage (story 7.2) ; pas de carte ni de positions (7.3) ; pas de rapport/export (7.4).
- Pas de colonne `sexe` ni de champ au formulaire d'inscription (assumption à confirmer — deferred).
- Aucun calcul de classement côté client ; jamais de temps calculé depuis le scan de départ ou l'heure appareil.
- Pas de modification de l'arbitrage 4.5 ni des saisies PC (5.x) — lecture seule par-dessus.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Départs échelonnés | épreuve A 09:00, B 09:30, arrivées arbitraires | Classements SÉPARÉS ; temps relatifs à CHAQUE heure de départ (pas l'ordre d'arrivée brut) | N/A |
| Scratch | épreuve A : 3 arrivés | Rangs par temps croissant, ex æquo gérés (1,1,3) | N/A |
| Catégories d'âge | lignes avec categorieAge | Filtrable par catégorie (U20/Senior/V1/V2/V3) sans recalcul serveur | N/A |
| Abandonné | coureur retiré puis abandon saisi | Jamais rangé ; statut « abandonné », dossard listé à part | N/A |
| En course | partant sans passage arrivée | Statut « en course », temps null, jamais rangé | N/A |
| Annulation (5.4) | premier passage arrivée annulé, un second existe | Le SECOND fait foi (ré-arbitrage en lecture) — rang recalculé | N/A |
| AD-3 | scan de départ horodaté avant/après l'heure officielle | AUCUN effet sur le temps (testé : mêmes rangs avec/sans scan départ) | N/A |
| Heure de départ absente | épreuve sans heure_depart | Classement `{ configure: false }` pour cette épreuve, les autres normales | N/A |
| Avant tout départ | aucun passage | Tous « en course », libellé provisoire, fraîcheur nulle | N/A |
| Non partant | validé/numéroté MAIS jamais retiré | Absent du classement (pas partant) | N/A |
| Cohérence snapshot | calcul pendant une sync | Les lignes viennent toutes du même instant (une transaction) | jamais partiel incohérent |
| Admin : config heures | organisateur édite A 09:00, B 09:30 | Sauvegarde ISO UTC, réaffichage heure locale ; volontaire → 403 | heure invalide → erreur champ |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/chrono/store.ts` — `etatCourse()` (UNE tx, 7 requêtes, `premierRecu` DISTINCT ON + NOT EXISTS annulation, `dossardParJeton`, `editionCourante`) : gabarit direct des requêtes classements.
- `apps/web/src/modules/chrono/service.ts` — `getEtatCourse` (serde ISO, `fraicheur`) : calque pour `getClassements`.
- `apps/web/src/modules/chrono/migrations/0025-0029` — terrain_evenement (index clé naturelle), abandons (0028), annulations (0029) ; prochain numéro 0033 (0030-0032 pris).
- `apps/web/src/modules/inscriptions/migrations/0002` — `epreuve` (slug/name/distance_km), `coureur` (`dossard` 0022, `age_category` CHECK U20/Senior/V1/V2/V3, `status`, `epreuve_id`, `jeton_edossard` 0023).
- `apps/web/src/modules/missions/` — checkpoint = mission `scan_checkpoint`, `est_arrivee` (0026, unique par édition, global à l'édition → croiser avec `coureur.epreuve_id`).
- `apps/web/src/app/admin/course/page.tsx` + `course-live.tsx` — page PC course (SSR organisateur) : y ajouter la carte « Heures de départ » ; pattern polling/garde.
- `apps/web/src/app/api/admin/course/etat/route.ts` — pattern route admin (guardAdmin, no-store) pour l'API heures de départ.
- `apps/web/src/app/admin/missions/missions-manager.tsx` — pattern datetime-local ↔ ISO (`corpsMissionSoumis`).
- `packages/shared/src/` — `dossier.ts` (`categorieAge`), `tracking.ts`/`terrain.ts` gabarits de contrat ; nouveau `classements.ts`.
- Tests : `chrono.integration.test.ts` / `etat-course.integration.test.ts` (helpers jetons, secteurs/missions arrivée, dates relatives) — gabarits directs ; `course-live.test.tsx` (composant admin).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/classements.ts` (+ tests) — contrat : `LigneClassement {dossard, rang|null, tempsMs|null, statut: 'arrivé'|'en-course'|'abandonné', categorieAge}`, `ClassementEpreuve {epreuveSlug, epreuveNom, distanceKm, heureDepart: string|null, configure: boolean, lignes: LigneClassement[], abandons: number[]}`, `ClassementsEdition { genereA, fraicheur|null, libelle: 'Classement provisoire', epreuves: ClassementEpreuve[] }` ; pure `departagerExAequo(temps)` (1,1,3) testée.
- [x] `apps/web/src/modules/chrono/migrations/0033_heures_depart.sql` — `epreuve.heure_depart timestamptz` nullable (CHECK : NULL ou postérieure à 2000-01-01) ; RLS inchangé (ligne épreuve existante).
- [x] `apps/web/src/modules/chrono/` — store : requêtes classements DANS une transaction (partants par épreuve, premier passage arrivée non annulé par jeton, abandons, heures de départ, fraîcheur) ; service `getClassements(organisationId)` : assemblage ISO, rangs ex æquo, statuts, `configure` par épreuve ; erreurs enveloppe `course.*` existantes.
- [x] `apps/web/src/app/api/admin/course/heures-depart/route.ts` (+ tests) — PUT organisateur `{heures: [{epreuveId, heureDepart: ISO|null}]}` : validation ISO/NULL, mise à jour sous GUC, no-store ; volontaire → 403, corps invalide → 400.
- [x] `apps/web/src/app/admin/course/` (+ tests) — carte « Heures de départ » : une ligne par épreuve (nom, distance, datetime-local), bouton Enregistrer, retour à l'état serveur, heure locale affichée ; sans permission → invisible.
- [x] Intégration `classements.integration.test.ts` — départs échelonnés (2 épreuves, heures différentes, ordre d'arrivée brut ≠ ordre des temps), scratch + ex æquo, catégories d'âge présentes, abandonné listé non rangé, en-course sans rang, annulation ré-arbitrée, AD-3 (scan départ sans effet, avant ET après l'heure officielle), heure absente → configure:false, non-partant absent, multi-org isolé.
- [x] Tests matrice — chaque rangée couverte (unitaires pures + intégration).

**Acceptance Criteria:**
- Given des Passages arbitrés (épopée 4) et des heures de départ officielles configurées, when les classements sont calculés, then chaque épreuve a son classement aux temps réels (départs échelonnés gérés), un coureur n'apparaissant que dans sa course (FR-15).
- Given un rafraîchissement à tout moment, then le classement servi n'est jamais partiel incohérent (une transaction, NFR-4) et porte « Classement provisoire » + fraîcheur.
- Given un scan au départ (avant ou après l'heure officielle), then le classement est IDENTIQUE avec ou sans ce scan (AD-3).
- Given `pnpm typecheck && pnpm test && pnpm test:db`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : heure de départ portée par `epreuve` (une colonne suffit aux départs échelonnés) plutôt qu'une table dédiée ; config admin intégrée à `/admin/course` (pas de nouvelle page) ; scratch + catégories d'âge implémentés (données existantes), classement par sexe DIFFÉRÉ (aucune donnée sexe à l'inscription — assumption à confirmer) ; contrat partagé prêt pour la vitrine 7.2 sans recalcul client.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès
- `pnpm test:db` -- expected: succès (intégration classements)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | low | Erreur structurelle `heures` (doublon d'épreuve) stockée mais jamais rendue — l'afficher au niveau carte. | patch |
| 2 | low | « Pas d'édition courante » diagnostiqué « épreuve inconnue » (fields vides, message trompeur) — erreur dédiée. | patch |
| 3 | low | fraîcheur = max réception sur TOUS les événements (retraits compris) alors que le contrat documente « dernier passage reçu » — filtrer sur les passages. | patch |
| 4 | low | Snapshot NFR-4 garanti structurellement (une transaction) ; l'épingler exigerait une injection d'écritures concurrentes hors harnais du dépôt. | différé |
| 5 | low | Cast `categorieAge as union` sans garde — une catégorie inconnue entrerait silencieusement dans le contrat 7.2. | patch |
| 6 | medium | Cheminement soumission/resynchronisation de la carte jamais exécuté par un test — extraire la lecture d'enveloppe + validation de réponse en pures testées (pattern heures-depart-form). | patch |
| 7 | low | Comparaison de modification par CHAÎNE (secondes non nulles → bouton actif au chargement, troncature) ; réponse 200 malformée → crash ; messages réseau trompeurs sur 413/500. | patch |
| 8 | low | Migration 0033 dans chrono/ modifie `epreuve` (table inscriptions) — déplacer le fichier dans inscriptions/migrations (suivi par nom, transparent). | patch |
| 9 | false | Artéfacts de spec (cases non cochées, deferred vide) : état documentaire du workflow, corrigé à la clôture — pas un défaut de code. | process |
| 10 | low | Indices positionnels (`receptions.length - 2`) fragiles dans l'intégration — étiqueter par lot. | patch |
| 11 | low | SQL épreuves triplé dans le store — extraire un helper. | patch |
| 12 | false | `getClassements(organisationId)` vs session : JUSTIFIÉ — le canal public 7.2 n'a pas de session ; les deux styles coexistent à dessein. | rejeté |
| 13 | low | PUT sans content-length (chunked) contourne la garde taille — rejeter l'absence d'en-tête comme la route sync. | patch |
| 14 | low | Titre de test « même transaction de page » trompeur (Promise.all = 2 transactions). | patch |
