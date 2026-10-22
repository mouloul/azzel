---
title: 'Story 3.2 — Secteurs et missions typées'
type: 'feature'
created: '2026-10-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'ae154b1'
baseline_commit: 'ae154b1cbf9ccbce9c1dee139e5364b877a8f89b'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-3-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Avec les volontaires importés (3.1), l'organisation ne peut toujours pas découper l'édition : ni secteurs, ni missions typées, ni affectation — impossible de savoir qui se place où, ni quelle mission reste vacante (FR-10).

**Approach:** Module missions étendu : `secteur` (nom, lieu, contact PC) rattaché à l'édition courante, `mission` typée (6 types fermés) avec horaires et consignes, `affectation` mission↔volontaire. Surface admin `/admin/missions` : création/édition/suppression, couverture dérivée (`couverte`/`vacante`) par mission, affectation avec **avertissement non bloquant** de chevauchement horaire. Côté volontaire, `/volontaires` liste ses missions et l'état de couverture général. La fiche hors-ligne (3.3) viendra se brancher sur ces données — ne rien verrouiller.

## Boundaries & Constraints

**Always:**
- Types fermés : `scan_checkpoint`, `accueil`, `securite_troncon`, `securite_arrivee`, `distribution_dossards`, `communication` (CHECK SQL + domaine, libellés FR) — aucun type personnalisé.
- Couverture **dérivée** des affectations (≥ 1 affectation = couverte), jamais stockée ; visible côté admin ET côté volontaire.
- Chevauchement (`a.debut < b.fin AND b.debut < a.fin`, même volontaire, même édition) : avertissement informatif dans la réponse et l'UI — **jamais bloquant**, jamais une erreur.
- Édition courante résolue par le pattern `findCurrentEdition` d'inscriptions (la plus proche `date_course`) ; ÉDITION → SECTEUR → MISSION → AFFECTATION avec `organisation_id` + RLS stricte + `multi-org.integration.test.ts` étendu (pattern 0018).
- Horaires `timestamptz` CHECK `fin > debut` ; ISO 8601 UTC stocké, saisie/affichage locaux (`datetime-local`, helpers `shared`).
- Suppression : mission → cascade affectations ; secteur → refus clair (409) si missions présentes.
- Admin `requireRolePage('organisateur')`/`guardAdmin`, enveloppes `shared`, erreurs `role="alert"`/succès `role="status"` (pattern sponsors) ; tutoiement volontaire, vouvoiement admin.

**Never:**
- Pas de fiche mission hors-ligne/PWA (3.3), pas d'annuaire (3.4), pas de scan/sync (épopée 4), pas d'email d'affectation.
- Pas de modification du module inscriptions ni du schéma volontaire/account (3.1 intouché).
- Pas d'effectif minimum par mission ni de planning auto (la couverture est binaire en 3.2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Créer secteur | nom + lieu valides | Secteur créé, rattaché édition courante | erreurs champ (nom 1–120, lieu 1–200) |
| Créer mission | type fermé, horaires fin > début | Mission `vacante` visible sous son secteur | type hors liste / horaires invalides → erreurs champ |
| Affecter | volontaire sans conflit | Mission `couverte`, liste à jour | volontaire/mission d'une autre org → 404 |
| Affecter avec chevauchement | volontaire déjà affecté à une mission horaire conflictuelle (autre secteur inclus) | Affectation créée + avertissement listant la mission en conflit | jamais bloqué |
| Ré-affecter même volontaire | affectation existante | Doublon ignoré proprement (UNIQUE), pas d'erreur | idempotent |
| Désaffecter | dernière affectation d'une mission | Mission repasse `vacante` | idempotent |
| Supprimer secteur avec missions | missions rattachées | Refus 409 enveloppe « retire ses missions d'abord » | enveloppe |
| Supprimer mission affectée | affectations présentes | Mission + affectations supprimées (cascade), couverture recalculée | No error expected |
| Volontaire consulte /volontaires | session volontaire | Ses missions (secteur, type, titre, horaires) + toutes les missions avec couverture | sans missions : message d'attente |
| Accès non autorisé | non-organisateur sur admin | 403 / redirection rôle | enveloppe |
| Multi-org | données org B | Rien de visible/modifiable côté A | RLS |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/missions/` — module créé en 3.1 (domain/errors/service/store + migrations 0018/0019, RLS stricte pattern `0018_volontaires.sql`) à étendre ; helper tx `creerInvitation` comme style de code transactionnel.
- `apps/web/src/modules/inscriptions/store.ts` — `findCurrentEdition(organisationId)` : pattern de résolution d'édition (répliquer en requête locale missions, pas d'import cross-module).
- `apps/web/src/app/admin/volontaires/` (page + manager + css) — pattern UI admin 3.1 à reproduire (formulaires, chips statut, tables responsives, `data-libelle`).
- `apps/web/src/app/api/admin/volontaires/**` — patterns routes + `guardAdmin` + tests stubbés.
- `apps/web/src/db/multi-org.integration.test.ts` — ajouter `secteur`, `mission`, `affectation` à `ORG_TABLES`.
- `packages/shared/src/datetime.ts` — `formatLocalDateTime` pour l'affichage.
- `apps/web/src/app/volontaires/page.tsx` — placeholder 3.1 à enrichir (session volontaire, tutoiement).

## Tasks & Acceptance

**Execution:**
- [x] `modules/missions/migrations/0020_secteurs_missions.sql` — `secteur` (id, organisation_id, edition_id FK, nom, lieu, contact nullable, created_at, UNIQUE (edition_id, nom)) ; `mission` (id, organisation_id, secteur_id FK CASCADE, type CHECK fermé, titre, debut_le, fin_le CHECK fin>debut, consignes ≤ 5000 nullable, created_at) ; `affectation` (id, organisation_id, mission_id FK CASCADE, volontaire_id FK CASCADE, UNIQUE (mission_id, volontaire_id), created_at) ; RLS stricte + grants + index (mission par secteur, affectation par volontaire).
- [x] `modules/missions/domain.ts` — `MISSION_TYPES` + libellés FR, `couverture(mission)` dérivée, `chevauche(a, b)` (intervalles), validation secteur/mission (contact téléphone facultatif pattern 3.1), types/export client-safe.
- [x] `modules/missions/` (store + service + errors) — CRUD secteur/mission, refus suppression secteur occupé (409), affectation/désaffectation idempotentes, avertissement chevauchement (missions conflictuelles du volontaire listées, insertion maintenue), `getMissionsAdminState` (secteurs → missions + affectations + couverture), `getMissionsVolontaireState` (ses missions + couverture générale), édition courante locale ; tests unitaires (validation, chevauchement, couverture, libellés).
- [ ] Routes API — `/api/admin/missions/secteur` (POST), `.../secteur/[id]` (PUT, DELETE), `.../mission` (POST), `.../mission/[id]` (PUT, DELETE), `.../affectation` (POST, DELETE par corps) ; `guardAdmin`, enveloppes, no-store ; tests routes stubbés (401/403/400/409/200 + avertissement propagé).
- [ ] UI `/admin/missions` (page + manager + css) — formulaires secteur (nom, lieu, contact) et mission (secteur, type select, titre, datetime-local début/fin, consignes), édition pré-remplie, listes secteurs → missions avec chips `couverte`/`vacante`, affectation (select volontaire 3.1 + bouton), désaffectation, bandeau avertissement chevauchement (`role="status"`, jamais bloquant) ; lien depuis l'espace admin existant.
- [ ] UI `/volontaires` — remplacer le placeholder : « Tes missions » (secteur, type, titre, horaires formatLocalDateTime) + toutes les missions de l'édition avec couverture ; vide → message d'attente ; bouton Appeler l'équipe conservé.
- [ ] Tests intégration — CRUD + couverture end-to-end, chevauchement réel inter-secteurs (avertissement, non bloquant), désaffectation → vacante, cascade suppression mission, refus secteur occupé, isolation RLS multi-org (3 tables), gating rôle.

**Acceptance Criteria:**
- Given des volontaires importés, when l'admin crée secteurs et missions typées, then chaque mission affiche `couverte`/`vacante` côté admin et côté volontaire.
- Given Karim affecté à la mission A (06 h–12 h), when l'admin l'affecte aussi à la mission B (10 h–14 h, autre secteur), then l'affectation est créée et un avertissement de chevauchement s'affiche — sans jamais bloquer.
- Given deux organisations, when l'org A interroge l'état missions, then aucune donnée de l'org B n'apparaît (RLS testé).

## Review Triage Log

### 2026-10-22 — Review pass 1 (blind-hunter 15, edge-case-hunter 6, verification-gap 3 ; 24 findings)
- **patch (medium)** BF1+EC3+BF3+EC4 — deux courses de concurrence non verrouillées : (a) mission insérée entre COUNT et DELETE du secteur → cascade silencieuse contournant le 409 ; (b) deux affectations concurrentes chevauchantes du même volontaire → aucune ne voit l'autre (READ COMMITTED), avertissement jamais émis. Fix : verrous (FOR UPDATE secteur / volontaire, ou DELETE … WHERE NOT EXISTS).
- **patch (medium)** EC1+EC2 — id non-UUID (chemin ou corps) → erreur 22P02 postgres brute → 500 `internal_error` au lieu de 404/400 (contrat « jamais de code brut ») ; garde UUID regex dans le service/routes.
- **patch (low)** BF5 — `estHorodatageValide` accepte « 2027 » ou un ISO sans Z (interprété en heure locale serveur) → décalage horaire silencieux ; exiger RFC3339 strict avec Z.
- **patch (low)** BF4 — réponses PUT factices : `updateSecteur` renvoie `missions: []`, `updateMission` `affectations: []`/`vacante` même si la mission est couverte (le client s'en sort par refresh, mais le contrat de réponse ment) ; réduire à `{ok:true}`.
- **patch (low)** BF8 — `secteur.contact` sans CHECK SQL (asymétrie : nom/lieu/titre/consignes en ont) ; migration 0021 `ALTER … ADD CHECK (char_length(contact) <= 32)`.
- **patch (low)** VG1+BF14 — branches jamais testées : `MissionsBodyTooLargeError` (aucun test > 16 Ko, convention 3.1 respectée ailleurs) et helpers `isoVersDatetimeLocal`/`datetimeLocalVersIso` (piégeux fuseaux) → à déplacer dans domain.ts et tester.
- **patch (low)** VG2 — garde « aucune édition » (409 `admin.missions.aucune_edition`) jamais exécuté par un test (seule une vérification de nom de classe) + test fantôme à remplacer : rejet du service + enveloppe 409.
- **patch (low)** BF10 — test d'intégration lâche : refus du type `cuisine` asserté via `Error` générique → attendre `InvalidMissionFieldsError`.
- **patch (low)** BF7+BF11+BF12+EC6 — hygiène : `maxLength` contact codé en dur 32 (importer `MAX_TELEPHONE_LENGTH`), paramètre mort `raw` dans les asserts de validation, `router.refresh()` sur simple toggle d'édition secteur, cast `as string` sans garde dans multi-org test.
- **patch (low)** BF15 — `MissionVolontaireView.consignes` assemblé mais jamais rendu sur /volontaires ; rendre les consignes (details/summary, pattern 2.4) plutôt que porter un champ mort jusqu'à 3.3.
- **defer** BF2+EC5 — mission rattachable à un secteur d'une édition non courante → mission fantôme invisible/insupprimable : inatteignable aujourd'hui (une seule édition par organisation, aucun chemin de création d'édition) ; à reprendre quand les éditions multiples existeront (garde : secteur de l'édition courante dans createMission/updateMission).
- **false** BF9 — tie-breaker manquant dans `findCurrentEdition` (`ORDER BY race_date DESC` sans clé secondaire) : une seule édition par organisation (seed 2027, aucun tie possible) et réplique fidèle du pattern inscriptions — comportement identique au code existant.
- **rejeté (low)** BF6 — validation côté client non branchée (validateurs domaine inutilisés par le manager) : le 400 serveur avec erreurs champ affichées fonctionne ; brancher = confort, pas un défaut rencontré en usage courant.
- **rejeté (low)** BF13 — Content-Length obligatoire + corps sur DELETE : convention maison établie (sponsors, 3.1 import) ; le client fetch envoie toujours Content-Length.
- **rejeté (low)** VG3 — règle de chevauchement dupliquée (TS `chevauche` / SQL dans `affecter`) : les deux copies sont testées séparément, aucun tort utilisateur ; la story 3.3 arbitrera la source canonique.

## Design Notes

- Couverture dérivée plutôt que stockée : une colonne `couverte` mentirait à la première désaffectation oubliée — la source de vérité est l'ensemble des affectations.
- L'avertissement de chevauchement vit dans la **réponse** de l'affectation (`avertissement: { missions: [...] }`), affiché par le manager : pas de persistance (un chevauchement signalé reste visible par recalcul si besoin).
- Affectation N-N via table dédiée (UJ-2 : « ravitaillement 2 … 3 scanneurs ») — plusieurs volontaires par mission ; `couverte` dès qu'au moins une affectation.
- L'édition courante est réutilisée telle quelle (seed 2027) ; quand plusieurs éditions existeront, le pattern `findCurrentEdition` tranchera déjà.
- `consignes` et `contact` secteur sont posés dès 3.2 pour que la fiche 3.3 n'ajoute **aucune** migration — ses données existent déjà.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0020 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (dont nouveaux tests secteurs/missions/affectations).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- `/admin/missions` : créer secteur + mission, affecter un volontaire importé en 3.1 → chip `couverte` ; seconde affectation conflictuelle → bandeau d'avertissement ; `/volontaires` en session volontaire → missions + couverture.
