# Intention — Carte 3D animée du parcours de course (Azzel)

Source : session de brainstorming BMad du 2026-10-23 (`.memlog.md`, statut `complete`) + POC fonctionnel livré.
Public : skills `bmad-spec` / `bmad-prd` et le développeur qui reprendra le sujet.

## 1. Intention

Donner au coureur une représentation du parcours en relief (carte 3D + profil altimétrique à points de passage), à la manière allégée de la page parcours UTMB Mont-Blanc.
Cible immédiate : le site vitrine en ligne (épopée 2), pour préparer le parcours en amont de la course.
Cible différée : l'app coureur hors-ligne (épopée 6) et l'écran live du PC course, qui réutiliseront la même donnée.

## 2. Décisions d'architecture arrêtées

### Stack de rendu (validée par l'utilisateur)

| Couche | Choix | Détail |
|---|---|---|
| Moteur carte | **MapLibre GL JS 4.7.1** | CDN cdnjs ; `setTerrain({source:'dem', exaggeration})`, `NavigationControl({visualizePitch:true})` |
| Relief | **AWS Terrain Tiles, encodage `terrarium`** | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, `raster-dem`, tileSize 256, maxzoom 15 |
| Fond satellite | **Esri World Imagery** (POC) | `server.arcgisonline.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxzoom 18 — **à remplacer avant prod**, cf. §3 |
| Fond topo | **OpenTopoMap** | `a.tile.opentopomap.org/{z}/{x}/{y}.png`, maxzoom 17 |
| Glyphes | `fonts.openmaptiles.org/{fontstack}/{range}.pbf` | |

Arbitrage tranché : **MapLibre + tuiles terrain**, et non « ruban mesh extrudé + .glb Draco pré-cuit sous three.js ». La référence UTMB a montré que la 3D visée est du terrain tuilé complet (terrain-RGB + ortho), pas un ruban découpé autour de la trace. Pas de Mapbox : Esri expose réellement du z18 (~0,6 m/px) sur Ath Aïssi, donc aucun besoin d'un fournisseur payant pour la vitrine.

### L'abscisse curviligne `s` — le vrai livrable d'architecture

`s` (distance cumulée le long de la trace officielle) est le **bus d'état unique** partagé par toutes les surfaces :

- profil altimétrique : couple `(s, altitude)` ;
- checkpoints : positions `s_i` figées sur la trace ;
- position live du coureur : projection de chaque scan (épopée 4) et de chaque ping GPS sur `s`, puis interpolation entre points ;
- caméra 3D / survol animé : paramétrée par `s`, une seule variable d'état ;
- fallback 2D : le même `(s, altitude)` alimente un profil SVG sans WebGL.

Conséquence : la 3D est un bonus, `(s, altitude)` est le socle. Le profil repliable et le fallback sans WebGL sont la même idée.

### Pipeline de données (build-time, pas runtime)

Source unique `parcours.json`, produite hors-ligne, consommée à l'identique par la carte 3D et par le profil :

1. `dem.py` — lecture des tuiles terrarium z14 (cache disque local), décodage `(r*256 + g + b/256) - 32768`, haversine.
2. `route.py` — densification de la trace à **45 m**, échantillonnage du MNT, **lissage glissant sur 5 points** (le DEM 30 m est bruité), distances cumulées, D+/D− global, checkpoints avec `km`, `alt`, `lon`, `lat`, `index`, `services`, puis **D+ et km par segment inter-checkpoint**.
3. Sortie `parcours.json` : `coords[[lon,lat,alt]]`, `profile[[dist_m,alt]]`, `checkpoints[]`, métadonnées.

En production, l'entrée du pipeline est un **GPX** (le POC part d'une liste de waypoints codée en dur).

### Position live (cadrage arrêté, mise en œuvre différée)

- Deux sources fusionnées : scans aux checkpoints (épopée 4) **et** GPS du téléphone avec **ping toutes les 10 min** (pas de temps réel).
- Entre deux pings : **point figé sur le dernier `s` connu + horodatage « vu il y a X min »**. Pas d'extrapolation, pas d'animation inter-ping — choix du plus simple techniquement, pas de faux positif.
- Strava / Garmin écartés comme fond de carte : ce sont des traces d'activité. Strava interdit de stocker/afficher les traces d'autrui ; Garmin Connect API exige un partenariat ; Garmin LiveTrack dépendrait de la montre du coureur et du réseau.

### Rendu

- **Exagération verticale paramétrable x1,5–2** (cf. Relive / Strava Flyby) : sans elle le trail paraît plat.
- **Bandeau profil repliable** (implémenté au POC) : en-tête cliquable, résumé km / D+ / nb points quand replié, `map.resize()` au toggle, pour laisser la carte seule en plein écran.
- Bascule satellite ↔ topo, bascule 3D on/off (`setTerrain(null)`).

## 3. Contraintes dures

**Licences** (vérifiées en session) :

- AWS Terrain Tiles terrarium — **domaine public** (SRTM/GMTED, USGS). Usage commercial OK. Attribution obligatoire : « SRTM data courtesy of the U.S. Geological Survey » + Mapzen.
- OpenTopoMap — **CC-BY-SA**. Usage commercial OK, attribution obligatoire, **téléchargement massif interdit sur leurs serveurs publics**.
- Esri World Imagery — **point bloquant** : usage commercial non couvert sans licence ArcGIS, et les endpoints sans clé sont en voie de retrait. Seul élément restant à clarifier (ToU + pérennité des endpoints).
- EOX Sentinel-2 cloudless — **CC BY-NC-SA** : payant en commercial, mais **Azzel est un projet associatif non monétisé**, donc utilisable en l'état. C'est ce statut associatif qui débloque le volet licences.
- Options de remplacement d'Esri si nécessaire : compte ArcGIS Location Platform (2 M tuiles/mois offertes), MapTiler / Mapbox Satellite payant, licence commerciale EOX.

**Données géographiques en Algérie** :

- Aucune agence cartographique nationale équivalente à swisstopo (CH) ou IGN-F (FR). Le niveau de détail de la démo UTMB n'est pas reproductible à l'identique.
- DEM disponible : Copernicus GLO-30 ou SRTM **30 m**.
- Ortho disponible : Sentinel-2 **10 m** (libre), Esri World Imagery, Mapbox Satellite.
- Résolutions réellement constatées en ligne : tuiles DEM terrarium **z14** OK sur Yakouren (gratuit, sans clé) ; Esri World Imagery réelle **jusqu'au z18 (~0,6 m/px)** sur Ath Aïssi, **z19 absent**.
- Le DEM 30 m est bruité : le lissage 5 points n'est pas cosmétique, il conditionne la crédibilité du D+.

**Interdiction de préchargement massif** : pas de téléchargement en masse des tuiles OpenTopoMap (et par extension des serveurs publics tiers). Corollaire structurant : **MapLibre ne peut pas servir un mode hors-ligne par préchargement de tuiles**.

## 4. Périmètre MoSCoW (validé sans modification)

**MUST — épopée 2 (vitrine)**
- Carte 3D MapLibre + relief terrarium
- Profil altimétrique avec checkpoints, services, segments
- Synchronisation profil ↔ carte
- Pipeline GPX → `parcours.json`
- Attributions légales
- Arbitrage définitif du fond satellite

**SHOULD**
- Survol animé
- Relief exagérable
- Bandeau profil repliable
- Barrières horaires

**COULD**
- Bascule satellite / topo
- Fallback 2D sans WebGL
- Lien depuis l'e-dossard

**WON'T (cette fois)**
- App hors-ligne 3D (ruban .glb)
- Écran live
- Ping GPS 10 min
- Strava / Garmin

## 5. Reporté à une épopée ultérieure — et pourquoi

| Sujet | Épopée cible | Raison du report |
|---|---|---|
| App hors-ligne 3D, **ruban mesh extrudé → .glb Draco** (~500 m de large autour de la trace, hillshade/hypsométrie bakés en texture, poids /50 vs tuile complète) | 6 (app coureur) | **Le ruban n'est pas mort** : c'est la bonne réponse là où MapLibre ne peut pas précharger de tuiles. Quelques Mo, versionné par course, mis en cache PWA une fois. Inutile pour une vitrine en ligne. |
| Écran live (grand écran PC course / public) affichant les coureurs sur la carte | non attribuée (surface implicite identifiée en session) | Troisième surface, dépend du live |
| Ping GPS 10 min + synchro offline/online du coureur | 6 | Dépend de l'app coureur |
| Strava / Garmin | — | Contraintes API/licence, pas de valeur de fond de carte |

## 6. Questions ouvertes à trancher avant implémentation

1. **Fond satellite de production** : Esri World Imagery est-il tenable (ToU ArcGIS, retrait annoncé des endpoints sans clé) ? Sinon, bascule sur EOX Sentinel-2 cloudless (CC BY-NC-SA, admissible au titre associatif, mais 10 m contre ~0,6 m) ou compte ArcGIS Location Platform. Arbitrage détail visuel vs sécurité juridique.
2. Format et provenance exacts du GPX d'entrée du pipeline, et mode de versionnement de `parcours.json` par course.
3. Où s'exécute le pipeline : script Python hors CI, ou intégré au build web (la session évoque un script Node en build-time).
4. Hébergement/mise en cache des tuiles OpenTopoMap compatible avec l'interdiction de trafic lourd.
5. Valeur par défaut de l'exagération verticale dans la plage x1,5–2.
6. Modélisation des barrières horaires (SHOULD) : rattachement aux checkpoints existants de l'épopée 4 ou entité propre.

## 7. Actifs déjà produits

POC fonctionnel et validé par l'utilisateur, dans
`/Users/mouloudhaouili/Desktop/ouidou/Azzel/_bmad-output/brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/poc/` :

- `index.html` — carte MapLibre 4.7.1 (3D terrain, bascule satellite/topo, bascule 3D, exagération, marqueurs checkpoints avec popups, profil SVG synchronisé, curseur partagé, bandeau repliable, marqueur coureur)
- `dem.py` — lecture/décodage des tuiles terrarium z14 avec cache disque
- `route.py` — densification 45 m, lissage 5 points, D+/D− global et par segment, génération des checkpoints
- `parcours.json` / `parcours-data.js` — sortie du pipeline

Chiffres réels du parcours de référence — **Trail d'Ath Aïssi** (Yakouren, Tizi Ouzou) :

- 15 614 m (15,6 km), **337 points** densifiés
- D+ 1 156 m / D− 1 177 m
- Altitude 219 – 973 m
- 6 checkpoints :

| km | alt | Nom | D+ segment | Services |
|---|---|---|---|---|
| 0,0 | 671 m | Départ Ath Aïssi | — | chrono, eau, wc |
| 3,5 | 952 m | Crête d'Akfadou | 345 m | eau, solide, médical |
| 6,0 | 632 m | Col de Taourirt | 85 m | eau |
| 9,5 | 572 m | Chêne-liège | 273 m | eau, solide |
| 12,5 | 286 m | Ravin d'Ighzer | 11 m | eau, médical, bus |
| 15,6 | 650 m | Arrivée Ath Aïssi | 442 m | chrono, repas, médical, wc |

Note : la trace du POC part d'une liste de 24 waypoints codée en dur dans `route.py`, pas d'un GPX réel.
