---
title: 'Story 11.1 — Pipeline GPX vers parcours.json'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/briefs-glm-epopee-10/story-11-1.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le relevé GPX réel (`docs/GPX/activity_24920331005.gpx`, épreuve longue) n'est transformé en aucune donnée publiée : la section parcours (9.3) rend `metriques: null` et `pointsDePassage: null`, et aucun contrôle ne distingue un relevé exploitable d'un relevé à rejeter (`activity_24827718657.gpx`).

**Approach:** Pipeline build-time en TypeScript (tsx, sans dépendance : XML parsé à la main comme le POC `poc/gpx.py`), piloté par une config déclarative versionnée (`parcours.config.json`) qui ne déclare que la longue (Départ/Arrivée déduits de la géométrie) ; il produit `parcours.json` commité (versionné, porte de qualité FR-28b, D+ à seuil d'hystérésis, `s` par épreuve FR-38, services FR-39), et `getSectionParcours()` (9.3) fusionne métriques + points de passage sans toucher au composant de rendu.

## Boundaries & Constraints

**Always:** altitude lue dans `<ele>` du GPX (jamais MNT, pas de `profile_mnt`) ; `s` par épreuve, jamais global ; constante unique du seuil D+ (5 m) commentée avec effet chiffré mesuré sur 24920331005 (brut 1280 m → 1186 m au seuil) ; porte de qualité = constantes nommées + refus nommant le défaut et son chiffre + code de sortie non nul ; trace gelée : contenu changé sans `--nouvelle-version` ⇒ échec en nommant la différence ; heure de départ et barrière horaire restent `null`.

**Never:** aucune commande git en écriture, pas de commit ; pas de modification de `_bmad-output/planning-artifacts/`, `sprint-status.yaml`, `deferred-work.md` ; aucune dépendance installée ; aucun test existant désactivé/supprimé/affaibli ; pas de données inventées (moyenne non déclarée, ravitaillements/horaires absents ; points POC « tous les 7 km » et `parcours-synthetique.json` interdits) ; `parcours.json` jamais importé par un composant client ni référencé par le HTML de l'accueil ; jamais appelé au runtime ni par `pnpm build`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Relevé exploitable | `activity_24920331005.gpx` | `parcours.json` écrit (version 1), géométrie unique + vues épreuve | N/A |
| Relevé refusé | `activity_24827718657.gpx` | refus nommant chaque défaut mesuré (pas médian 3 s > 2 ; 68,8 % > 5 % ; 47 pts > 12,5 m/s > 1 %) | exit ≠ 0, aucun fichier écrit |
| Re-construction identique | parcours.json inchangé | no-op « aucun changement », exit 0 | N/A |
| Tracé modifié sans incrément | contenu ≠ sans `--nouvelle-version` | échec nommant la 1ʳᵉ différence (chemin) | exit ≠ 0 |
| Tracé modifié avec `--nouvelle-version` | flag explicite | réécrit avec version N+1 | N/A |
| Fusion 9.3 | JSON déclare `longue` seulement | longue : métriques + points de passage ; moyenne : `null` (aucun chiffre) | JSON invalide ⇒ dégradation `null` |
| Deux épreuves, géométrie partagée | fixture synthétique (dans le test) | point commun à 2 kilométrages distincts selon l'épreuve | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/contenus/section-parcours.ts` -- POINT DE BRANCHEMENT unique (l.10-14) : fusion dans `getSectionParcours()`, composant non modifié ; contrat `MetriquesEpreuve`, `PointDePassageEpreuve`.
- `apps/web/src/modules/contenus/service.ts` -- `getParcoursPage(deps)` l.226, `ContenusServiceDeps` l.76 ; `EpreuveView` = `{slug, nom, distanceKm, gpxUrl}` ; slugs réels : `longue`, `moyenne`.
- `apps/web/src/components/section-parcours.tsx` -- composant SERVEUR (pas de `use client`) : ne pas modifier.
- `apps/web/scripts/sync-tokens.ts` + `apps/web/package.json` l.7 -- gabarit de script tsx + déclaration (`parcours:build`).
- `apps/web/tsconfig.json` (inclut `scripts/`), `tsconfig.base.json` -- strict, `noUncheckedIndexedAccess`, `resolveJsonModule`.
- `_bmad-output/.../poc/gpx.py` -- algorithme de référence : regex trkpt/ele/time, fusion ≥ 8 m depuis le dernier gardé, lissage centré fenêtre 7, haversine, `[[dist_m, alt]]`.
- `docs/GPX/activity_{24827718657,24920331005}.gpx` -- entrées réelles (gate : 598 pts/3 s/68,8 %/47 imp. vs 26 933 pts/1 s/0,3 %/0).
- `scripts/check-budget.sh` -- mesure fil (gzip) HTML `/` + ressources locales, seuil 300 Kio (l.35).
- `apps/web/src/app/page.test.tsx`, `src/components/section-parcours.test.tsx` -- mockent `getSectionParcours` : non impactés (à vérifier par exécution).
- `vitest.config.ts` (racine) -- env node, alias `@`, `fileParallelism: false`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/contenus/parcours/geo.ts` -- haversine + arrondis stables.
- [x] `apps/web/src/modules/contenus/parcours/gpx.ts` -- parseur regex pur (nom, date, points lon/lat/ele/time) + erreurs nommées (point sans ele/time).
- [x] `apps/web/src/modules/contenus/parcours/traitement.ts` -- constantes documentées (SEUIL_DPLUS_M=5 avec effet mesuré 1280→1186 ; SEUIL_FUSION_M=8 ; FENETRE_LISSAGE=7 ; VITESSE_IMPLAUSIBLE_M_S=12.5 ; PAS_MEDIAN_MAX_S=2 ; PART_MAX_DISTANCE_SEGMENTS_LONGS=0.05, seuil segment 30 s ; PART_MAX_POINTS_VITESSE_IMPLAUSIBLE=0.01) + fonctions pures : rejet vitesse, fusion, lissage, distances, D+/D− brut et seuil, `evaluerQualiteReleve` (défauts nommés + chiffres).
- [x] `apps/web/src/modules/contenus/parcours/construire.ts` -- config validée → `ParcoursDoc` : géométrie de base, `profile[[dist_m,alt]]`, points de passage (id unique, `depart`/`arrivee` auto), vues d'épreuve (tranches par ids, `s` par épreuve, kilométrages par référentiel, D+/D− et altitude min/max par épreuve et par segment amont), métadonnées (source, date relevé, constantes, mesures de la porte).
- [x] `apps/web/src/modules/contenus/parcours/pipeline.ts` -- orchestration testable : FS injectable, gate ⇒ refus exit≠0 ; versionnage (comparaison hors `version`, nommage de la différence, `--nouvelle-version` ⇒ N+1).
- [x] `apps/web/scripts/build-parcours.ts` + `apps/web/package.json` -- CLI mince (`parcours:build [--nouvelle-version]`), exit codes (logique dans `parcours/cli.ts`, testée).
- [x] `apps/web/src/modules/contenus/parcours/parcours.config.json` -- ne déclare QUE la longue (toute la trace, Départ/Arrivée, services inconnus).
- [x] Générer `apps/web/src/modules/contenus/parcours/parcours.json` (version 1 ; commit laissé à l'humain — pas de git en écriture).
- [x] `apps/web/src/modules/contenus/parcours/lecture.ts` -- import statique + validation légère ⇒ `ParcoursDoc | null` (dégradation).
- [x] `apps/web/src/modules/contenus/section-parcours.ts` -- fusion pour les seules épreuves présentes dans le JSON (slug), heure/barrière `null`.
- [x] Tests : `gpx.test.ts`, `traitement.test.ts` (constantes, hystérésis, gate sur les 2 fichiers réels), `construire.test.ts` (fixture 2 épreuves à 2 kilométrages, s par épreuve), `pipeline.test.ts` (versionnage 3 cas + CLI exit codes), `section-parcours-fusion.test.ts` (longue fusionnée, moyenne `null`), non-régression homepage/budget.

**Acceptance Criteria:**
- Given le GPX 24827718657 hors seuils, when le pipeline s'exécute, then il refuse en nommant chaque défaut et son chiffre, exit ≠ 0, sans écrire de fichier.
- Given le GPX 24920331005, when le pipeline s'exécute, then parcours.json est produit (version 1) avec géométrie unique, profile, épreuve longue complète, métadonnées ; re-exécution ⇒ « aucun changement ».
- Given la fixture 2 épreuves, when les vues sont produites, then un point de passage commun porte 2 kilométrages distincts, `s` jamais global.
- Given parcours.json modifié sans `--nouvelle-version`, when réécriture, then échec nommant la différence ; with flag ⇒ version 2.
- Given l'accueil, when rendu, then la longue affiche métriques/points de passage, la moyenne aucun chiffre ; `pnpm budget` ≤ 300 Kio ; HTML accueil sans référence au JSON ni géométrie.

## Implementation Notes

- D+/D− calculés sur les altitudes lissées NON arrondies : arrondir à 0,1 m AVANT l’hystérésis fait basculer des franchissements de seuil (mesuré : 1186 → 1176 m). Les valeurs publiées (coords/profile/points) restent arrondies (0,1 m ; lon/lat 6 décimales).
- Sérialiseur JSON maison (`serialiserJson`) : objets multi-lignes, tableaux de primitifs en ligne — diff git lisible sur la trace gelée SANS exploser la taille (164,9 Kio, sous les 400 Ko ⇒ aucune décimation).
- Porte mesurée sur `activity_24827718657.gpx` : pas médian 3 s ; 68,7 % de la distance en segments > 30 s ; 47 points > 12,5 m/s. Relevé longue : 1 s / 0,28 % / 0.
- CLI : logique dans `parcours/cli.ts` (FS injecté, testée sans sous-processus) ; shim `scripts/build-parcours.ts`. Codes : 0 ok, 1 porte, 2 trace gelée, 3 entrées invalides.
- Fusion 9.3 : aucune réalignement de test existant nécessaire — `page.test.tsx` et `components/section-parcours.test.tsx` mockent `getSectionParcours` (vérifié par exécution).

## Spec Change Log

- 2026-11-03 (implémentation) : statut draft → review après implémentation complète ; notes d’implémentation ajoutées ci-dessus, aucune modification des sections gelées.

## Review Triage Log

## Design Notes

- Hystérésis D+ : ancre `ref` mise à jour seulement quand |Δ| ≥ 5 m ; Δ ≥ seuil ⇒ D+ += Δ ; Δ ≤ −seuil ⇒ D− += −Δ (symétrique, documenté). Publié = au seuil ; brut gardé en métadonnées.
- Position d'un point de passage sur la base : `positionBaseM` dans la config (accroche au point gardé le plus proche) ; ids réservés `depart` (0) / `arrivee` (distance totale) auto-déduits.
- Ordonnancement : gate sur points BRUTS (avant tout traitement) ⇒ rejet vitesse ⇒ fusion 8 m ⇒ lissage ⇒ distances ⇒ D+/D−.
- Import statique du JSON dans `lecture.ts` (module serveur uniquement) : rien dans le bundle client (composant serveur, vérifié par budget).
- Tests réels : lecture des 2 GPX via chemin résolu depuis `import.meta.url` (11 Mo parsés en regex : acceptable).

## Verification

**Commands:**
- `pnpm typecheck` -- expected: vert sur les 3 paquets
- `pnpm test` -- expected: 2547 tests existants + nouveaux, tous verts
- `pnpm -F @azzel/web parcours:build` -- expected: écrit parcours.json puis « aucun changement » au 2ᵉ appel ; exit 0
- `node -e` ou test CLI sur le mauvais GPX -- expected: exit ≠ 0, message nommant les défauts
- `pnpm budget` -- expected: ≤ 300 Kio (baseline 279 Kio), delta HTML accueil rapporté

**Manual checks (if no CLI):**
- Taille de parcours.json < 400 Ko (sinon décimation documentée avec erreur max).
