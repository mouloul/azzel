---
title: 'Carte du parcours — surcouche noms de lieux et chemins (OpenStreetMap) sur le satellite'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '372cce6c31c327ce5b6a164b01908cf13ce9d789'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/decision-fond-cartographique-2026-11-05.md'
  - '{project-root}/CREDITS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur la carte 3D du parcours, le fond satellite (Esri World_Imagery) n'affiche ni noms de villes/villages ni routes et sentiers : le visiteur ne sait pas où il est. La clé ArcGIS du projet ne donne accès à aucune couche de libellés Esri (services `Reference/*` en 404, Basemap Styles en « Token Invalid »).

**Approach:** Superposer au satellite, « comme Google Maps », une surcouche vectorielle OpenFreeMap (données OpenStreetMap, schéma OpenMapTiles ; gratuite, sans clé, usage commercial autorisé) : tracé des routes, pistes et sentiers, noms des routes, noms de lieux (ville, bourg, village, hameau). La surcouche suit le fond satellite : visible avec lui, masquée sur le topographique (OpenTopoMap porte déjà ces libellés incrustés, les doubler brouillerait la carte).

## Boundaries & Constraints

**Always:**
- Surcouche présente dans le style UNIQUEMENT quand un fond satellite est fourni (clé ArcGIS valide) ; sans clé, style strictement inchangé et aucun appel vers openfreemap.org.
- Visibilité de toutes les couches de la surcouche = visibilité du satellite (état initial et bascule `definirFond`).
- Ordre des couches : satellite < lignes de routes/chemins < halo + tracé de l'épreuve < libellés (noms de routes, noms de lieux). Le tracé de l'épreuve n'est jamais recouvert par une route.
- Libellés lisibles sur imagerie : texte clair, halo sombre ; nom en alphabet latin en priorité (`name:fr`, puis `name:latin`, puis `name`) — la police servie (Noto Sans) ne couvre pas l'arabe.
- Attribution OpenFreeMap / OpenMapTiles / OpenStreetMap reproduite telle que publiée, présente dans le bloc et la mention courte quand le satellite est actif, et dans `CREDITS.md`.
- Couleurs de la surcouche : constantes nommées du module de style, documentées comme convention cartographique (blanc/gris des routes, jaune pâle des grands axes), pas de littéraux épars.

**Never:**
- Pas de clé, pas de préchargement de tuiles, pas de nouveau contrôle d'interface (pas de bouton « libellés »).
- Ne pas toucher au fond topographique, au relief, à la carte Leaflet de /resultats, ni à `carte-parcours.tsx` au-delà de ce qu'impose `attributions()`.
- Ne pas importer maplibre-gl hors de `carte-maplibre.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Satellite par défaut | clé valide, ouverture | satellite + routes/chemins + noms visibles | N/A |
| Bascule topo | clic « Topographique » | satellite ET surcouche masqués, topo seul | N/A |
| Retour satellite | clic « Satellite » | surcouche réaffichée | N/A |
| Sans clé | `satellite = null` | aucune source/couche surcouche, pas de `glyphs` | N/A |
| OpenFreeMap injoignable | réseau coupé vers openfreemap | satellite + tracé restent affichés, simplement sans libellés | MapLibre ignore les tuiles en erreur ; aucun message dédié |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/contenus/parcours/fonds-carte.ts` -- module PUR des sources et crédits ; y décrire la surcouche (`SURCOUCHE_OSM` : TileJSON `https://tiles.openfreemap.org/planet`, glyphes `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`, police `Noto Sans Regular`, attribution `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`, licence ODbL) ; `attributions(fond)` / `attributionCourte(fond)` : ajouter la surcouche quand `fond.id === 'satellite'`, la mention courte DÉRIVÉE de `SURCOUCHE_OSM` (pas un second littéral).
- `apps/web/src/modules/contenus/parcours/carte.ts` -- `specificationStyle(...)` : NE déclare PAS la source ni les couches de la surcouche ; seulement `glyphs` (aucun appel réseau tant qu'aucun texte n'est rendu) quand `satellite !== null`. Ce module est dans un chunk du chemin critique de l'accueil : rien de lourd ici.
- `apps/web/src/modules/contenus/parcours/surcouche-osm.ts` (NOUVEAU, pur, importé SEULEMENT par `carte-maplibre.ts`, donc hors chemin critique) -- ids de source/couches, `COULEURS_SURCOUCHE`, et fonctions rendant la spec de la source et des couches (lignes, libellés).
- `apps/web/src/components/carte-maplibre.ts` -- ajout PARESSEUX : la surcouche est ajoutée (`addSource` + `addLayer`) après `load` si le satellite est affiché, ou au premier `definirFond('satellite')` ; lignes insérées avec `beforeId = IDS.coucheHalo`, libellés au sommet ; ensuite `definirFond` ne fait que basculer la visibilité. AUCUN écouteur `error` (il ferait taire le `console.error` de MapLibre, cf. `Evented.fire`).
- `apps/web/src/components/vue-parcours.tsx` -- consommateur réel ; aucun changement attendu.
- Tests : `fonds-carte.test.ts`, `carte.test.ts`, NOUVEAUX `surcouche-osm.test.ts` et `components/carte-maplibre.test.ts` (MapLibre remplacé par `vi.mock('maplibre-gl')` + `vi.mock('maplibre-gl/dist/maplibre-gl.css')`, environnement vitest `node`, `reperes: []`).
- `CREDITS.md`, `decision-fond-cartographique-2026-11-05.md` -- crédits et amendement.
- Faits vérifiés : MapLibre 4.7.1 ; une source TileJSON en échec reste non chargée et bloque `load` si elle est dans le style initial ; schéma OpenFreeMap = `place`, `transportation` (`class`, `brunnel`), `transportation_name` ; `name:latin` présent (OpenMapTiles le calcule).

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/contenus/parcours/fonds-carte.ts` -- `SURCOUCHE_OSM`, `urlPorteUneCle` (réutilisée par `exigeUneCle`), attributions satellite -- crédits à une seule source.
- [x] `apps/web/src/modules/contenus/parcours/surcouche-osm.ts` -- spec source + couches : lignes `transportation` limitées aux géométries linéaires, tunnels (`brunnel = tunnel`) exclus, groupes chemins (`track`, `path`), routes (`minor`, `service` + leurs `*_construction`), grands axes (`motorway`…`tertiary` + leurs `*_construction`) ; libellés `transportation_name` et `place` (city/town/village/hamlet) en `coalesce(name:fr, name:latin)` SANS repli sur `name` (police sans arabe) ; texte clair, halo sombre ; doc des couleurs fidèle (pas de « liseré » inexistant) -- hors chemin critique.
- [x] `apps/web/src/modules/contenus/parcours/carte.ts` -- `glyphs` seul quand satellite proposé -- pas d'OpenFreeMap dans le style initial.
- [x] `apps/web/src/components/carte-maplibre.ts` -- ajout paresseux et bascule décrits au Code Map -- `load` ne dépend jamais d'OpenFreeMap ; un visiteur resté en topo ne contacte jamais openfreemap.org.
- [x] Tests -- matrice complète + : filtres et `source-layer` de CHAQUE couche de lignes ; tunnels exclus ; pas de `name` en repli ; le pilote ouvre la carte quand la carte factice n'émet `load` que si les sources du style INITIAL sont chargées ; ouverture en topo → aucun `addSource` surcouche ; satellite → ajout avec `beforeId` halo, une seule fois même après plusieurs bascules ; aucun écouteur `error` enregistré ; URL de la surcouche vérifiées avec `urlPorteUneCle`.
- [x] `CREDITS.md` -- section surcouche ; dire que le TileJSON et les tuiles ne sont demandés qu'à l'affichage du satellite.
- [x] `_bmad-output/implementation-artifacts/decision-fond-cartographique-2026-11-05.md` -- amendement daté du 2026-11-12.

**Acceptance Criteria:**
- Given une clé ArcGIS valide, when la carte s'ouvre sur le satellite, then les noms des villages et les routes/pistes/sentiers autour du parcours sont lisibles, et le tracé de l'épreuve reste au-dessus des routes.
- Given le topographique actif, when le visiteur regarde la carte, then aucun libellé ne se superpose en double à ceux d'OpenTopoMap.
- Given le satellite actif, when on lit le bloc d'attributions, then OpenStreetMap et OpenMapTiles y figurent ; given le topo actif, then ils n'y figurent pas en plus du texte OpenTopoMap.
- Given OpenFreeMap lent ou injoignable, when la carte s'ouvre, then relief, cadrage et repères apparaissent sans attendre OpenFreeMap.

## Implementation Notes

- Implémenté par un sous-agent : `fonds-carte.ts` (`SURCOUCHE_OSM`, `urlPorteUneCle`, attributions satellite), `carte.ts` (`IDS`, `COUCHES_SURCOUCHE`, `COULEURS_SURCOUCHE`, 3 couches de lignes sous le tracé, 2 couches de libellés au-dessus), `carte-maplibre.ts` (`definirFond`), tests, `CREDITS.md`, amendement de décision. Style validé par `validateStyleMin` (maplibre-gl-style-spec 20.4.0).
- Écart constaté à la vérification : avec MapLibre 4.7.1, un TileJSON en échec laisse la source « non chargée » pour toujours ; `load` ne part jamais et `ouvrirCarte` resterait bloqué — la ligne « OpenFreeMap injoignable » de la matrice n'était pas tenue. Ajout de `modules/contenus/parcours/surcouche-repli.ts` (pur) : sur une erreur de la source surcouche dont le TileJSON n'est pas chargé, retrait des couches puis de la source ; une tuile isolée en erreur ne retire rien. `definirFond` saute les couches absentes.
- Ajout de `components/carte-maplibre.test.ts` (MapLibre factice) : bascule topo/satellite, repli TileJSON, tuile isolée, erreur d'une autre source.
- Vérif : vitest `apps/web/src/modules/contenus/parcours` + `apps/web/src/components` → 20 fichiers, 319 tests verts ; `tsc --noEmit` OK.
- Budget (`check-budget.sh`) : déjà en échec AVANT ce changement (chemin critique 309 422 o > 300 Kio) ; la surcouche ajoute ~825 o car `carte.ts` est déjà inclus dans un chunk du chemin critique de l'accueil. Hors périmètre, à arbitrer.
- Non fait : contrôle visuel dans le navigateur.
- Itération 1 (ré-implémentation après bad_spec) : surcouche déplacée dans `modules/contenus/parcours/surcouche-osm.ts` (pur, importé seulement par `carte-maplibre.ts`) ; `carte.ts` ne gagne que `glyphs` ; ajout paresseux après `load` / au premier `definirFond('satellite')`, lignes avant `IDS.coucheHalo`, libellés au sommet ; aucun écouteur `error` ; `surcouche-repli.ts` abandonné ; mention courte dérivée de `SURCOUCHE_OSM.ayantsDroit`. Tests : `surcouche-osm.test.ts`, `components/carte-maplibre.test.ts` (carte factice qui retient `load` tant qu'une source du style initial n'est pas chargée). Vérif : 21 fichiers, 336 tests verts ; `tsc --noEmit` OK ; `validateStyleMin` passé hors dépôt sur 3 variantes de style.

## Spec Change Log

- **Itération 1 (2026-11-12)** — Déclencheur : relecture (edge-case + blind hunter) : la source TileJSON OpenFreeMap déclarée dans le style INITIAL bloque `load` tant que le TileJSON n'est pas lu ; un serveur lent/muet fige la carte (le repli sur `error` ne couvre pas le blocage) et un visiteur en topo contacte quand même openfreemap.org. Amendé : Code Map, Tasks, Design Notes, Verification, AC « OpenFreeMap lent ou injoignable » (hors bloc figé) → surcouche ajoutée paresseusement après `load`, spec des couches déplacée hors du chemin critique, aucun écouteur `error`. État évité : carte figée sur panne tierce ; `console.error` de MapLibre réduit au silence ; +825 o sur le chemin critique. KEEP : reprendre de `/private/tmp/claude-501/-Users-mouloudhaouili-Desktop-ouidou-Azzel/0f82bf4e-94d5-4def-89c6-af3014ee2f60/scratchpad/diff-surcouche-iteration-0.patch` — `SURCOUCHE_OSM` et sa doc, attributions satellite/topo et leurs tests, `urlPorteUneCle`, couleurs (#D9D9D9 chemins en tirets, #FFFFFF routes, #FFF2A8 grands axes, texte #FFFFFF, halo #1B1B1B), largeurs interpolées z12→z16, tailles et `symbol-sort-key` des lieux, `minzoom: 13` des noms de routes, textes de `CREDITS.md` et de l'amendement (à corriger sur le moment des appels réseau), tests de `carte-maplibre.test.ts` sur la bascule. Abandonner `surcouche-repli.ts`.

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|---|---|---|---|
| 1 | edge+blind | TileJSON lent/muet → `load` bloqué, carte figée | high | bad_spec — source dans le style initial ; `SourceCache.loaded()` faux tant que le TileJSON n'est pas lu (maplibre 4.7.1) |
| 2 | edge+blind | Visiteur topo avec clé contacte openfreemap et attend son TileJSON | medium | bad_spec — même cause racine que #1 |
| 3 | verif+edge+blind | Test de repli : la carte factice émet `load` d'office, ne prouve pas le déblocage | low | bad_spec — fusionné à #1 (nouveau test exigé) |
| 4 | blind | `surcouche-repli.ts` sans test direct, booléen inutilisé | low | bad_spec — module abandonné par #1 |
| 5 | edge+blind | Écouteur `error` → MapLibre ne fait plus `console.error` | medium | patch (repris en spec : aucun écouteur) — `Evented.fire` ne logue que sans écouteur |
| 6 | verif | Aucun test ne valide le style complet (`validateStyleMin`) | medium | defer — `@maplibre/maplibre-gl-style-spec` non résoluble depuis `apps/web` (dépendance transitive pnpm) ; ajout d'une devDependency impossible ici (pnpm absent) |
| 7 | verif | Filtres de classes des couches de lignes non testés | low | patch (repris en spec) |
| 8 | edge | Repli sur `name` → arabe illisible (Noto Sans sans arabe, pas de plugin RTL) | low | patch (repris en spec) — correction = suppression |
| 9 | edge | Classes `*_construction` absentes | low | patch (repris en spec) |
| 10 | blind | Tunnels dessinés comme routes en surface | low | patch (repris en spec) |
| 11 | blind | Doc `halo` annonce un « liseré des lignes » inexistant | low | patch (repris en spec) |
| 12 | blind | Test recopie la regex au lieu de `urlPorteUneCle` | low | patch (repris en spec) |
| 13 | blind | Mention courte : second littéral des ayants droit | low | patch (repris en spec : dérivée de `SURCOUCHE_OSM`) |
| 14 | edge | Surcouche perdue pour la session après échec transitoire | low | rejet — cas rare, correctif = état de ré-essai |
| 15 | edge+blind | Attributions OSM affichées alors que la surcouche a échoué | low | rejet — sur-crédit sans préjudice, correctif = état remonté à l'UI |
| 16 | edge | Noms de villages illisibles (critère d'acceptation) | false | `name:latin` présent dans les tuiles de la zone (vérifié), calculé par OpenMapTiles |
| 17 | blind | Attribution ODbL sans lien | medium | defer — motif préexistant : OpenTopoMap déjà rendu en texte brut dans `vue-parcours.tsx` |
| 18 | blind | Crédit accroché au littéral `fond.id === 'satellite'` | low | rejet — aucun appelant ne fait diverger l'id ; préjudice hypothétique |
| 19 | blind | Spec hors du diff, fichiers `docs/*` non suivis | false | la spec est relue à part par conception ; rien n'est indexé, le commit sera explicite |
| 20 | blind+edge (it.1) | `ajouterSurcouche` lève dans `load` → `resolve()` jamais appelé | false | seuls lancers synchrones possibles : `_checkLoaded` (appel après `load`) et source en double (empêchée par le drapeau) ; `addLayer` avec `beforeId` absent émet une erreur sans lever (maplibre 4.7.1) |
| 21 | verif+blind (it.1) | Test « carte factice fidèle » ne teste que le mock | low | patch — titre/commentaire honnêtes ; `maplibre-gl` déjà épinglé `4.7.1` dans `apps/web/package.json` |
| 22 | blind (it.1) | `glyphs` OpenFreeMap dans le style initial même en topo | low | rejet — aucune requête sans couche `symbol` ; préjudice hypothétique |
| 23 | blind (it.1) | Docs : satellite par défaut ⇒ OpenFreeMap contacté à l'ouverture pour presque tous ; tiers supplémentaire (IP) | medium | patch — préciser `CREDITS.md` et l'amendement (aucune page de confidentialité dans `apps/web/src`) |
| 24 | blind (it.1) | Attribution sans lien ; « Data from OpenStreetMap » vs « Contributeurs OpenStreetMap » | medium | carried — #17 defer (motif préexistant) ; texte = celui publié par OpenFreeMap |
| 25 | blind (it.1) | Pas de test d'interface du crédit en satellite | low | rejet — `vue-parcours.tsx` inchangé, `attributions()` couvert en unitaire |
| 26 | blind (it.1) | Noms de routes sans repli sur `ref` (RN, CW) | low | patch — ajout de `ref` (latin) en dernier recours pour les noms de routes |
| 27 | blind (it.1) | Sommets, cours d'eau absents | low | rejet — l'intention énumère ville/bourg/village/hameau |
| 28 | blind (it.1) | `path_construction` / `track_construction` absents | low | patch — ajout direct |
| 29 | blind (it.1) | Aucun plan de sortie si OpenFreeMap disparaît | low | patch — ligne « Reste à faire » dans l'amendement |
| 30 | blind (it.1) | Tests en double (URL sans clé) | low | rejet — sans préjudice |
| 31 | blind (it.1) | En-tête `surcouche-osm.ts` inexact sur le poids (`SURCOUCHE_OSM` dans `fonds-carte.ts`) | low | patch — correction du commentaire |
| 32 | blind (it.1) | Spec absente du patch | false | carried — #19 |
| 33 | edge (it.1) | Noms de routes affichés sur tunnels et classes non dessinées | low | patch — filtre des noms : hors tunnels + classes dessinées |

## Design Notes

Source vectorielle par TileJSON (`url`) : les tuiles OpenFreeMap sont versionnées (`/planet/<date>/…`) et changent chaque semaine. Mais une source TileJSON présente dans le style INITIAL retient `load` jusqu'à la lecture du TileJSON (et pour toujours s'il échoue). D'où l'ajout APRÈS `load` : la carte s'ouvre sans dépendre d'OpenFreeMap ; si celui-ci échoue ensuite, seuls les libellés manquent. `glyphs` peut rester dans le style initial : aucune requête tant qu'aucun texte n'est rendu.

## Verification

**Commands:**
- `./node_modules/.bin/vitest run apps/web/src/modules/contenus/parcours apps/web/src/components` (racine, Node de `~/.nvm/versions/node/v22.13.1/bin` dans le PATH) -- expected: tous verts
- `apps/web/node_modules/.bin/tsc --noEmit` (depuis `apps/web`) -- expected: aucune erreur

**Manual checks (if no CLI):**
- `pnpm dev:web`, /parcours, ouvrir la carte : satellite avec noms et chemins ; bascule topo → libellés absents ; DevTools, bloquer `tiles.openfreemap.org` → la carte s'ouvre, sans libellés.
