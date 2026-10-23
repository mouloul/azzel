---
title: 'Story 7.3 — Carte publique anonyme'
type: 'feature'
created: '2026-10-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '6fde5ae'
baseline_commit: '6fde5ae0ce87f1d5cd715ce6b30c6b8ac1f0b4b5'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-7-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les positions GPS capturées par l'app coureurs (6.2) dorment en base : aucune carte publique ne les montre, et les proches qui suivent la course ne voient rien avancer sur le tracé officiel.

**Approach:** 1) Contrat `carte.ts` (`@azzel/shared`) : `PositionPublique {dossard, epreuveSlug, epreuveNom, lat, lon, capteA, estompée}` (estompée = capteA plus vieux que `POSITION_ESTOMPEE_MS` = 1 h, assumption X=1 h balisée) et `TracePublique {epreuveSlug, epreuveNom, points}`. 2) Backend : store tracking `dernieresPositions(organisationId)` (DISTINCT ON par appareil, jointure coureur VALIDÉ numéroté de l'édition courante — l'existence de positions EST l'opt-in) ; service `getPositionsPubliques()` (org par défaut, micro-cache 5 s, calque resultats 7.2) et `getTracesPubliques()` (fetch serveur des `gpx_url`, parse `trkpt`, échantillonnage ≤ ~500 points/épreuve, cache mémoire 1 h, échec doux). 3) API publiques `GET /api/carte-positions` et `GET /api/carte-trace` (no-store, enveloppe douce, anonymat dossard+épreuve uniquement). 4) Vitrine : section « Carte de la course » sur `/resultats`, PARE-CHEMIN-CRITIQUE : fermée par défaut, la carte ne charge qu'au clic (« Afficher la carte ») via import dynamique de Leaflet (choix local : Leaflet ~42 Ko gz, léger, tuiles OSM attribuées) — polling 10 s des positions seulement carte ouverte. 5) Sans position : message doux « les résultats racontent la course » (jamais inquiétant) ; positions estompées affichées comme « dernière position connue il y a X ».

## Boundaries & Constraints

**Always:**
- Anonymat strict : la carte ne rend QUE dossard + épreuve (+ position horodatée) — jamais nom, contact, photo, jeton (FR-19, NFR-7) ; pastille = couleur d'action, dossard en mono.
- La carte ne charge JAMAIS dans le chemin critique : aucun script/tuile avant le clic ; le HTML de `/resultats` reste sans chunk carto (budget intouché).
- Toutes les lectures publiques passent par le backend (AD-7) ; traces GPX récupérées et réduites CÔTÉ SERVEUR (le client ne télécharge jamais le GPX brut).
- Position estompée (> 1 h, assumption balisée) : opacité réduite + libellé « dernière position connue il y a X min/h » — jamais effacée, jamais alarmiste.
- Dernière position par coureur uniquement (par appareil, la plus récente fait foi) ; coureurs validés ET numérotés seulement ; édition courante.
- Tuiles OSM avec attribution visible ; lib carto locale au module vitrine (Leaflet), import dynamique au clic, démontée proprement (remove + cleanup).
- Échec GPX/tuiles/réseau : la section carte se dégrade avec un message sobre, la page résultats reste intacte.

**Never:**
- Pas de suivi individuel nominatif, pas d'historique des positions (UNIQUEMENT la dernière), pas de temps réel prétendu (fraîcheur affichée).
- Pas de nouvelle collecte (aucune donnée de visiteur), pas de tuiles auto-hébergées (hors scope), pas de Leaflet dans le HTML initial ni dans le bundle de la page résultats.
- Pas de modification du module tracking (6.2) ni du calcul des classements — lecture seule.
- Pas de coordonnées de checkpoints : le modèle n'en a pas (secteur/mission sans lat/lon) — voir Never ci-dessous et deferred-work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Carte ouverte (jour J) | positions récentes opt-in | Pastilles dossard sur les tracés épreuves, fraîcheur affichée | N/A |
| Position récente | capteA < 1 h | Pastille pleine, libellé horaire discret | N/A |
| Position estompée | capteA > 1 h | Opacité réduite + « dernière position connue il y a X » — jamais supprimée | N/A |
| Deux appareils, un coureur | positions de 2 appareils du même compte | Dernière par appareil ? NON : une pastille par COUREUR (la plus récente de ses appareils) | N/A |
| Sans tracking | aucune position en base | Message doux « Aucune position partagée — les résultats racontent la course » + tracés quand même affichables | N/A |
| Chargement initial | section fermée | AUCUN script/tuile chargés ; bouton « Afficher la carte » seul | N/A |
| Clic afficher | activation | Import dynamique Leaflet + tuiles + données, squelette le temps du chargement | échec lib → message sobre, réessai possible |
| Polling carte | carte ouverte, nouvelle position sync | Pastille mise à jour ≤ 10 s ; carte fermée → polling suspendu | réseau KO → état conservé |
| GPX cassé | gpx_url 404/timeout (5 s) | Trace absente de la réponse, les autres épreuves servies ; carte sans ce tracé | jamais d'erreur brute |
| GPX géant | 50 000 points | Échantillonnage serveur ≤ ~500 points/épreuve (fidélité visuelle suffisante) | N/A |
| Coureur non validé / non numéroté | positions présentes mais dossier invalide | Pastille ABSENTE (jamais exposée) | N/A |
| API positions | GET anonyme | {ok, positions, genereA} no-store, micro-cache 5 s | base KO → 503 douce vitrine.* |
| Multi-org | org B | Positions de l'org par défaut uniquement (RLS) | jamais de fuite |
| Anonymat | toute réponse/rendu | Uniquement dossard/épreuve/horodatage — asserté par test | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/tracking/` — table `position` (0030, index `position_appareil_recu_idx` « lecture naturelle de la carte publique story 7.3 »), `appareil_coureur` (account_id) ; store ingestion existant, jointure coureur calquée sur `partantRows` (chrono/store.ts ~1107).
- `apps/web/src/modules/chrono/service.ts:getResultatsPublic` + `errors.ts:toResultatsPublicApiError` — gabarit micro-cache 5 s + enveloppe douce 503 à décliner.
- `apps/web/src/modules/contenus/` — `epreuve.gpx_url` (migration 0014, CHECK https), `getParcoursPage` : source des tracés.
- `apps/web/src/app/api/resultats/route.ts` — gabarit route publique (no-store, ok/enveloppe).
- `apps/web/src/app/resultats/page.tsx` + `resultats-live.tsx` — page et patterns client (polling, squelettes, `enVol`, visibilitychange) ; la section carte se branche APRÈS ResultatsLive.
- `apps/web/src/app/parcours/page.tsx` — précédent de chargement différé (`<details>` GPX « la carte interactive relève de l'épopée 7 »).
- `scripts/check-budget.sh` — mesure le HTML de `/` : rien de la carte ne doit apparaître dans un HTML critique.
- Dépendance à ajouter : `leaflet` + `@types/leaflet` (apps/web) — import dynamique UNIQUEMENT dans le composant carte.
- Tests : `resultats.integration.test.ts` (gabarit service+base), `api/resultats/route.test.ts` (route), `resultats-live.test.tsx` (client pures), `page.test.tsx` (SSR).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/carte.ts` (+ tests) — `PositionPublique`, `TracePublique`, `POSITION_ESTOMPEE_MS = 3_600_000` (assumption X=1 h documentée), pures `estEstompee(capteA, maintenant)`, `libelleDerniereConnue(capteA, maintenant)` (« il y a X min/h », sobre), `echantillonnerPoints(points, max=500)` testée (fidélité extrémités, répartition régulière).
- [x] `apps/web/src/modules/tracking/store.ts` — `dernieresPositions(organisationId)` : DISTINCT ON par COUREUR (la plus récente de ses appareils), jointure appareil_coureur→account→coureur validé numéroté édition courante + épreuve (slug/nom) ; RLS via withOrg.
- [x] `apps/web/src/modules/chrono/` (ou vitrine) service — `getPositionsPubliques()` (org défaut, micro-cache 5 s, ISO + estompée calculée serveur) ; `getTracesPubliques()` (fetch gpx_url serveur timeout 5 s, parse `trkpt` défensif, échantillonnage shared, cache mémoire 1 h par URL, échec par épreuve isolé) ; erreurs enveloppe douce `vitrine.carte.*`.
- [x] `apps/web/src/app/api/carte-positions/route.ts` + `apps/web/src/app/api/carte-trace/route.ts` (+ tests) — GET publics no-store, `{ok, positions|traces}`, 503 douce base KO, AUCUNE donnée personnelle.
- [x] Intégration — dernières positions (2 appareils → 1 pastille, la plus récente), validé+numéroté seulement, estompée > 1 h, édition courante, RLS multi-org, anonymat (colonnes exactes), traces : GPX fixture (points, échantillonnage, 404 isolé).
- [x] `apps/web/src/app/resultats/carte-course.tsx` (+ tests des pures) — section fermée par défaut (« Afficher la carte ») ; au clic : import dynamique `leaflet`, montage (tracés par épreuve en polyline, pastilles dossard mono couleur action, estompées en opacité réduite + libellé), polling 10 s positions (carte ouverte seulement, garde en vol, visibilitychange), attribution OSM visible, démontage propre, échec lib/données → message sobre + réessai ; sans position → message doux « les résultats racontent la course ».
- [x] `apps/web/src/app/resultats/page.tsx` + CSS — section « Carte de la course » sous les classements (fermée, texte sobre, jamais dans le chemin critique) ; test SSR : le HTML ne contient AUCUNE référence leaflet/tuile tant que non activée.
- [x] `apps/web/package.json` — `leaflet` + `@types/leaflet` (dépendance locale module vitrine, import dynamique seul chemin d'accès).
- [x] Tests matrice — chaque rangée couverte (pures + routes + intégration + SSR).

**Acceptance Criteria:**
- Given des positions émises par des coureurs opt-in, when un proche ouvre la carte publique, then la dernière position connue de chaque coureur s'affiche sur le tracé GPX de son épreuve, identifiée par dossard qualifié par épreuve — jamais nom, contact ni photo (FR-19, NFR-7).
- Given des positions de plus d'une heure (assumption X=1 h balisée), when la carte s'affiche, then elles sont estompées et lisibles comme « dernière position connue » — jamais effacées, jamais alarmistes.
- Given le premier chargement de /resultats sur 3G, when la page s'affiche, then AUCUN script carto ni tuile n'a chargé (la carte n'entre en scène qu'au clic) — budget vitrine intact.
- Given `pnpm typecheck && pnpm test && pnpm test:db && pnpm budget`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : Leaflet (léger, tuiles OSM raster attribuées) en import dynamique au clic — jamais dans le HTML initial ; parsing/échantillonnage GPX côté serveur avec cache mémoire 1 h (le GPX brut ne transite jamais vers le client) ; l'existence de positions en base sert d'opt-in (6.2 ne stocke que sur activation) ; CHECKPOINTS NON GÉOLOCALISÉS : le modèle secteur/mission n'a pas de lat/lon — dessiner des marqueurs de checkpoints exigerait d'ajouter des coordonnées au modèle (voir deferred-work), la carte livre donc tracés + positions.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès
- `pnpm test:db` -- expected: succès (intégration positions/traces)
- `pnpm budget` -- expected: succès (aucun chunk carto dans le HTML critique)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | high | Traces non scopées à l'édition courante (`listEpreuvesParcours` toutes éditions ; slug unique PAR édition → doublons/mélange d'éditions). | patch |
| 2 | high | Validation par item absente dans les interpréteurs (position/traces malformées → innerHTML undefined / TypeError montage). | patch |
| 3 | low | capteA futur non clampé (horloge en avance = jamais estompée) — clamp serveur avec tolérance. | patch |
| 4 | medium | Échec GPX sans cache négatif (404/timeout re-fetch à chaque hit public). | patch |
| 5 | medium | `dernieresPositions` scanne toute la table (pas de fenêtre temporelle) derrière un endpoint public pollé — fenêtre 48 h sur recu_a. | patch |
| 6 | low | `editionCourante` dupliquée chrono/tracking avec commentaire mensonger (« un seul lieu ») — corriger le commentaire (extraction cross-store disproportionnée). | patch |
| 7 | medium | Le pare-chemin-critique de /resultats n'est mesuré par AUCUN test réel (budget = / seulement, regex source contournable) — étendre check-budget.sh à /resultats (aucune référence leaflet/tuile). | patch |
| 8 | medium | Aucun moyen de refermer la carte (polling jusqu'au départ de la page, aria-expanded figé) — bouton fermer + suspension. | patch |
| 9 | medium | Cycle de vie client (clic → import → montage → polling) jamais exécuté — déficit de harnais déjà inscrit (7.2 #14), étendre l'entrée à carte-course. | différé |
| 10 | medium | Pastilles inaccessibles clavier/lecteur (keyboard:false, tooltips survol) — liste texte alternative (dossards + fraîcheur). | patch |
| 11 | low | Parser GPX refuse les quotes simples et espaces (XML légal) — regex tolérante. | patch |
| 12 | medium | Fetch sans signal sur navigateurs anciens → enVol bloqué, polling figé — fallback AbortController+setTimeout. | patch |
| 13 | low | Test « vouvoiement » vacuue — regex sérieuse. | patch |
| 14 | low | Tuiles OSM directes jour J (usage policy : identification/limites) — note + déferré (cache/proxy de tuiles). | différé |
| 15 | medium | Appareils révoqués : positions toujours servies — filtrer `revoked_at IS NULL`. | patch |
| 16 | low | Corps GPX géant chargé avant garde — vérifier content-length avant text(). | patch |
| 17 | low | fitBounds sur bornes dégénérées (1 point) → zoom maximal illisible — setView zoom défaut. | patch |
| 18 | medium | Échec tuiles silencieux (carte grise, aucun message) — écoute tileerror → message sobre après seuil. | patch |
