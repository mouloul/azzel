---
title: 'Story 3.4 rouverte — Annuaire sans identité, réservé aux missions de scan (+ corrections de revue)'
type: 'feature'
created: '2026-10-30'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-30.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-préchargement-de-l-annuaire-des-coureurs.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'annuaire nominatif (dossard, nom, prénom, jeton) part sur le téléphone de TOUT volontaire (API + `annuaireInitial` + shell SW) et le voyant retrait affiche le prénom, alors que le PO a tranché (29/10, SCP 2026-10-30 approuvée) : les volontaires ne voient AUCUNE donnée personnelle des coureurs — le scan ne donne qu'une confirmation, les données vont au tableau de bord organisateur. La revue 3.4 laisse en outre 14 corrections `[Review][Patch]` ouvertes.

**Approach:** Réduire la réplique au strict besoin de validation hors-ligne (`{dossard, jeton}`, contrat shared v3), la réserver aux volontaires affectés à une mission de scan, purger toute réplique nominative déjà présente sur les appareils, retirer le prénom du voyant retrait, aligner les documents (SCP §4.1–4.6) ; puis appliquer les 14 corrections de la revue 3.4.

## Boundaries & Constraints

**Always:**
- Décisions PO : (1) réplique = `{ dossard, jeton }` uniquement ; (2) trois états de voyant conservés (succès / déjà passé / inconnu) ; (3) numéro de dossard CONSERVÉ au voyant, retrait = « ✓ Dossard N · retrait enregistré » ; (4) annuaire servi seulement aux volontaires affectés, dans l'édition courante, à une mission `scan_checkpoint` ou `distribution_dossards` (quel que soit l'horaire : préchargement la veille) — sinon 403 `volontaires.annuaire_reserve`, pas d'`annuaireInitial`, pas de section ; (5) organisateurs inchangés.
- `ANNUAIRE_SCHEMA_VERSION = 3` ; une réplique v2 trouvée en IndexedDB est SUPPRIMÉE (pas seulement ignorée) ; le cache du SW volontaires change de version (les shells HTML v1 portaient l'annuaire nominatif dans le payload RSC).
- 403 `volontaires.annuaire_reserve` côté client → purge de la réplique locale + section masquée, JAMAIS le bandeau « session expirée » ; 401 et 403 `iam.*` → bandeau inchangé.
- Contrat dans `packages/shared` uniquement (AD-8) ; tutoiement, enveloppes `volontaires.*`, `no-store` sur toute réponse.

**Never:**
- Aucun nom, prénom, photo ni contact coureur dans : réponse annuaire, IndexedDB, props SSR volontaires, libellés de scan.
- Pas de migration SQL, pas de changement du tableau de bord PC, de l'e-dossard coureur ni des payloads de sync.
- Pas de changement de la logique de scan au-delà du libellé retrait.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Volontaire scan | mission `scan_checkpoint` ou `distribution_dossards` (édition courante) | 200 `{version:3, editionId, genereA, coureurs:[{dossard,jeton}]}` ; section + badge | — |
| Volontaire sans scan | missions accueil/sécurité ou aucune | API 403 `volontaires.annuaire_reserve` ; pas d'`annuaireInitial` ; pas de section ; réplique locale purgée | pas de bandeau session |
| Réplique v2 en poche | IDB contient `{dossard,nom,prenom,jeton}` v2 | `lireAnnuaire` supprime l'entrée, renvoie null | silencieux |
| Désaffecté du scan | réplique v3 en poche puis 403 reserve | réplique supprimée, section masquée | — |
| Retrait succès | QR connu | « ✓ Dossard 217 · retrait enregistré » | — |
| Checkpoint | QR connu | libellé inchangé (dossard seul) | — |

</frozen-after-approval>

## Code Map

- `packages/shared/src/annuaire.ts` (+ `.test.ts`) -- `CoureurAnnuaire`, `ANNUAIRE_SCHEMA_VERSION` (2→3), `estCoureurAnnuaire` (retirer `nom`/`prenom`), `indexerAnnuaire`.
- `apps/web/src/modules/missions/store.ts:~981` -- `listCoureursAnnuaire` (SELECT sans `last_name`/`first_name`, commentaire faux « aucun import du module inscriptions » à corriger) ; `CoureurAnnuaireRecord` l.~87 ; ajouter `volontaireAMissionScan(organisationId, editionId, accountId)` (pattern `findVolontaireIdByAccount` l.~883 + jointure `affectation af JOIN mission m JOIN secteur s` l.~430) ; stub `createUnavailableStore` l.~1037.
- `apps/web/src/modules/missions/domain.ts:~100` -- `MISSION_TYPES` ; ajouter `MISSION_TYPES_SCAN` + `aMissionDeScan(missions)` (pur, partagé page/service).
- `apps/web/src/modules/missions/service.ts:~425` -- `getAnnuaireEdition` : contrôle de réservation avant lecture → `AnnuaireReserveError`.
- `apps/web/src/modules/missions/errors.ts:~137` -- nouvelle `AnnuaireReserveError`.
- `apps/web/src/app/api/volontaires/guard.ts` -- `toVolontairesApiError` : mappe `AnnuaireReserveError` → 403 `volontaires.annuaire_reserve` ; `AucuneEditionError` aujourd'hui générique (« L'annuaire… n'est pas encore publié » servi aussi sur `/etat`) → message par route (patch revue).
- `apps/web/src/app/api/volontaires/{annuaire,etat}/route.ts` (+ tests) -- no-store déjà posé ; tests d'en-tête des erreurs manquants.
- `apps/web/src/app/volontaires/page.tsx` -- `annuaireInitial` seulement si `aMissionDeScan(state.mesMissions)`.
- `apps/web/src/app/volontaires/volontaires-pwa.tsx:163-363,543-565` -- `libelleAnnuaire`, `statutInitialAnnuaire`, effet annuaire, section ; condition d'affichage `aMissionDeScan(etat.mesMissions)`.
- `apps/web/src/lib/annuaire-replique.ts` -- `resoudreAnnuaireHorsLigne` (+ filtrage `editionId`), comparateur de fraîcheur à mutualiser avec `etatLePlusFrais` de `lib/revalidation-etat.ts`.
- `apps/web/src/lib/idb-volontaires.ts:255-300` -- `lireAnnuaire` (suppression si invalide), nouvelle `effacerAnnuaire()`.
- `apps/web/public/sw-volontaires.js:33` -- `VERSION = 'v1'` → `'v2'` (l'`activate` purge déjà les caches `az-volontaires-*` d'une autre version) ; vérifier `sw-volontaires.test.ts`.
- `apps/web/src/lib/scan/etats-scan.ts:~128-136` (+ test) -- `libelleVoyantRetrait`.
- Patches de revue restants (détail dans `spec-3-4-préchargement-…md` § Review Findings) : `lib/attribution-dossards.ts:41` (pluriels), `app/admin/dossiers/attribution-dossards.tsx` (région live permanente), `app/api/admin/dossiers/dossards/route.ts:21` (no-store erreurs), `modules/inscriptions/errors.ts` (action `admin.dossards_epuises`), `modules/inscriptions/dossards.integration.test.ts` (épuisement 9999 réel, RLS réel `listCoureursAnnuaire(orgA, editionB)`), `app/admin/dossiers/page.test.tsx` + `[id]/page.tsx` (colonne/ligne dossard rendues), `scenarios-recette-epic-3.md` S4.
- Ne pas toucher : sync 4.5, outbox, `apps/runners`, `/admin/dossiers` hors patches, migrations.

## Tasks & Acceptance

**Execution:**
- [ ] Documents SCP §4.1–4.6 -- PRD (glossaire, FR-12), `epics.md` (FR-12, AC 3.4, AC 4.3), EXPERIENCE.md (voyant), spec 3.4 (Always/Never/matrice renégociés, D1 cochée), specs 4.2/4.3, `epic-3-context.md`, recettes 3 (S4) et 4 (3.2) -- décision PO.
- [ ] `packages/shared/src/annuaire.ts` + test -- v3 `{dossard, jeton}` ; v2 nominative rejetée -- contrat.
- [ ] `modules/missions/{domain,errors,store,service}.ts` + tests -- `aMissionDeScan`, `AnnuaireReserveError`, `volontaireAMissionScan`, SELECT sans noms, commentaire corrigé -- réservation serveur.
- [ ] `app/api/volontaires/guard.ts` + `annuaire/route.ts` + `etat/route.ts` + tests -- 403 reserve, messages `AucuneEditionError` par route, no-store asserté sur 401/403/503 -- enveloppes.
- [ ] `lib/idb-volontaires.ts` + test -- `lireAnnuaire` supprime l'invalide, `effacerAnnuaire` -- purge des noms existants.
- [ ] `public/sw-volontaires.js` + test -- VERSION v2 -- purge des shells nominatifs.
- [ ] `lib/annuaire-replique.ts` + test -- filtrage `editionId` (poche d'une autre édition ou sans édition courante écartée), comparateur de fraîcheur unique partagé avec `revalidation-etat`, statut « prêt » seulement après écriture réussie (repli compris) -- patches badge/repli/fraîcheur.
- [ ] `app/volontaires/page.tsx` + `volontaires-pwa.tsx` + css + tests page -- section conditionnelle, 403 reserve → purge, états d'échec stylés distinctement, pluriel « 1 coureur » -- UI.
- [ ] `lib/scan/etats-scan.ts` + test -- libellé retrait sans prénom.
- [ ] Patches admin dossards (pluriels, région live, no-store, action épuisement, tests colonne/ligne dossard) + tests d'intégration (épuisement 9999, RLS réel, 403 sans mission de scan, 200 checkpoint et distribution, aucune colonne nom).
- [ ] `scenarios-recette-epic-3.md` S4 -- patch recette de la revue + étapes réservation/absence d'identité.

**Acceptance Criteria:**
- Given un volontaire affecté à une mission de scan, when il ouvre `/volontaires` en ligne, then la réplique IndexedDB ne contient aucun champ autre que `dossard`/`jeton` par coureur et le badge « Annuaire prêt — N coureurs » n'apparaît qu'après écriture réussie.
- Given le code de l'annuaire, when on cherche `nom`/`prenom`/`first_name`/`last_name` sur la chaîne store → API → shared → IDB → scan, then aucune occurrence.
- Given la revue 3.4, when l'implémentation se termine, then les 14 `[Review][Patch]` et la décision D1 sont cochés dans `spec-3-4-préchargement-…md`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

- Le 403 reserve n'est pas une session morte : code d'enveloppe distinct pour que le client purge sans afficher « reconnecte-toi ».
- La réservation ignore l'horaire de la mission (contrairement aux boutons de scan, « en cours ») : le préchargement doit se faire la veille, en ligne.

## Verification

**Commands:**
- `pnpm typecheck && pnpm test` -- expected: verts.
- `./scripts/dev-db.sh` puis `AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (intégration annuaire/dossards).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil ≤ 300 Kio.
- `rg -n "prenom|first_name|last_name" packages/shared/src/annuaire.ts apps/web/src/lib/idb-volontaires.ts apps/web/src/lib/scan apps/web/src/app/api/volontaires` -- expected: aucune occurrence hors tests de rejet.
