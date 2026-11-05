# Story 11.1 — Pipeline GPX vers parcours.json

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-11-1-pipeline-gpx`
(tip = commit `ee3a572`). Tu es le développeur, je suis l'architecte. Interdits : aucune
commande git en écriture, pas de modification de `_bmad-output/planning-artifacts/`,
`sprint-status.yaml`, `deferred-work.md`, aucune dépendance installée (pas de lib GPX : parse
l'XML à la main comme le POC), aucun test existant désactivé/supprimé/affaibli. Lis `epics.md`
« Story 11.1 » (FR-28, FR-28b, FR-38, FR-39), `section-parcours.ts`
(`apps/web/src/modules/contenus/`, contrat à remplir) et le POC
`_bmad-output/brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/poc/gpx.py`
(référence de l'algorithme, en Python : **tu écris en TypeScript**, exécuté par `tsx` comme les
autres scripts de `apps/web/scripts`).

Baseline : 191 fichiers de test, 2547 tests, typecheck vert, `pnpm budget` 279 Kio.

## Données réelles disponibles — et ce qui manque (à ne PAS inventer)

- `docs/GPX/activity_24920331005.gpx` : relevé exploitable (26 933 points, pas médian 1 s,
  boucle fermée, ~28 km). C'est **l'épreuve longue**.
- `docs/GPX/activity_24827718657.gpx` : contre-exemple (598 points, ~69 % de la distance en
  segments > 30 s) : doit être **refusé** par la porte de qualité.
- **Il n'existe AUCUN relevé réel de l'épreuve moyenne**, ni aucune définition de sa portion
  commune avec la longue, ni aucun ravitaillement réel, ni heure de départ, ni barrière horaire.
  `parcours-synthetique.json` du POC est fictif : **ne l'utilise pas**. Les points « Point 1…4 »
  tous les 7 km du POC sont arbitraires : **ne les reprends pas** (AC explicite).
  → Le pipeline doit être **piloté par un fichier de configuration déclaratif versionné**
  (`apps/web/src/modules/contenus/parcours/parcours.config.json`) décrivant : le GPX source, les
  épreuves, et pour chaque épreuve la tranche de géométrie de base qu'elle emprunte (bornes
  exprimées par identifiants de points de passage) et la liste des points de passage réels. Je
  ne t'en fournis aucun réel : la config livrée ne déclare que la **longue** (toute la trace,
  départ et arrivée déduits de la géométrie), avec `pointsDePassage` limités à Départ et Arrivée ;
  l'épreuve moyenne **n'est pas déclarée** tant que l'organisation n'a pas fourni son tracé.
  Les tests couvrent la mécanique « deux épreuves, géométrie partagée » avec une **fixture
  synthétique de test** (dans le fichier de test, jamais dans les données livrées).

## À construire

1. **Pipeline** `apps/web/scripts/build-parcours.ts` (+ logique pure testable dans
   `apps/web/src/modules/contenus/parcours/`), script `pnpm -F @azzel/web parcours:build`,
   **build-time uniquement** (jamais appelé au runtime ni par `pnpm build`).
2. **Sortie** `apps/web/src/modules/contenus/parcours/parcours.json`, commitée, avec un champ
   `version` explicite : géométrie de base une seule fois ; `epreuves` (vues) ; `profile` =
   `[[dist_m, alt]]` ; points de passage ; métadonnées (source, date du relevé, constantes
   utilisées). L'altitude vient du GPX (`<ele>`), **jamais** du MNT. Pas de `profile_mnt`.
3. **Traitement** : rejet des points à vitesse implausible, fusion des points quasi immobiles,
   lissage du bruit d'altitude, distances cumulées, D+ et D− globaux et par segment entre points
   de passage.
4. **Constante unique du seuil D+** (hystérésis, 5 m) définie à UN endroit, commentée avec son
   **effet chiffré mesuré par toi sur `activity_24920331005.gpx`** : D+ brut vs D+ au seuil.
   Ne recopie pas les chiffres de l'epics (641/604, autre relevé) : mesure et cite les tiens.
5. **Porte de qualité (FR-28b)** : constantes nommées et documentées (pas médian maximal, part
   maximale de distance en segments > 30 s, nombre maximal de points à vitesse implausible).
   Un relevé hors seuils est **refusé ou signalé en nommant le défaut** et son chiffre, jamais un
   échec muet ; code de sortie non nul au refus. Test : le fichier 24827718657 est refusé
   (message nomme le défaut), 24920331005 accepté.
6. **Abscisse curviligne `s` par épreuve (FR-38)** : jamais globale. Chaque point de passage a un
   identifiant unique sur la géométrie de base (celui qui servira d'identité CHECKPOINT de
   l'épopée 4) et un kilométrage **distinct par épreuve** traversée, plus ses services (FR-39).
   Test avec la fixture à deux épreuves : un point de passage de la portion commune a deux
   kilométrages différents.
7. **Versionnage** : un tracé modifié produit une nouvelle `version` ; le pipeline refuse de
   réécrire silencieusement un `parcours.json` dont le contenu change sans incrément de version
   (compare et échoue en nommant la différence, sauf option explicite `--nouvelle-version`).
8. **Raccordement au contrat de la 9.3** : `getSectionParcours()` fusionne les métriques
   (D+, D−, altitudes min/max) et les points de passage du JSON dans le contrat existant, pour
   les seules épreuves présentes dans le JSON. Heure de départ et barrière horaire restent
   `null` (inconnues). Le composant de rendu n'est pas modifié ; les tests existants de la 9.3
   passent, seuls les tests qui supposaient `metriques: null` pour la longue peuvent être
   réalignés (liste-les). **Aucun chiffre n'apparaît pour l'épreuve moyenne.** Le JSON complet
   (géométrie) n'est **pas** importé dans un composant client ni dans le HTML de l'accueil :
   seules les métriques le sont. `pnpm budget` ≤ 300 Kio, et dis de combien l'HTML de l'accueil
   a changé.

## Contraintes

`pnpm typecheck` (3 paquets), `pnpm test` verts. Pas de chinois. Pas de commit. Le JSON produit
doit rester raisonnable (< 400 Ko ; sinon décime la géométrie avec une tolérance documentée et
dis l'erreur maximale introduite).

## Livrables

Rapport final honnête : chaque AC en *mesuré* / *couvert par test (nom)* / *non vérifiable ici*.
Donne : D+ brut vs au seuil, distance, nombre de points avant/après, taille du JSON, effet sur
le budget, fichiers modifiés, nombres de tests, et la liste explicite de ce qui manque à
l'organisation (tracé de la moyenne, ravitaillements réels, horaires).
