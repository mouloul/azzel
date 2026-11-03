# Epic 11 Context: Le parcours en 3D

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Donner au visiteur à voir la course avant de la courir : un pipeline build-time transforme l'export GPX du relevé terrain en `parcours.json` vérifié par une porte de qualité, consommé par une carte MapLibre à relief terrarium et un profil altimétrique coloré par pente, synchronisés par l'abscisse curviligne `s`. Deux épreuves partagent la géométrie de base. L'ensemble se branche dans la coquille de la section parcours livrée par l'épopée 9, avec dégradation textuelle complète sans WebGL. L'épopée porte aussi l'arbitrage bloquant du fond cartographique de production (question de licences).

## Stories

- Story 11.1: Pipeline GPX vers parcours.json
- Story 11.2: Fond cartographique de production et attributions
- Story 11.3: Carte 3D du parcours
- Story 11.4: Profil altimétrique et graphe de technicité
- Story 11.5: Curseur partagé et bascule d'épreuve
- Story 11.6: Confort de lecture du parcours (Should)
- Story 11.7: Barrières horaires sur le parcours (Should)

## Requirements & Constraints

- Pipeline build-time, jamais runtime : entrée = export GPX **manuel** (montre Garmin, altitude barométrique, via Garmin Connect ou Strava) versionné dans le dépôt — aucune intégration API Strava/Garmin ; sortie = `parcours.json` (géométrie de base une seule fois, vues d'épreuve, `profile[[dist_m, alt]]`, points de passage, métadonnées), consommé à l'identique par la carte et le profil.
- Porte de qualité du relevé : un relevé hors seuils est refusé ou signalé en nommant le défaut (pas médian entre points, part de distance en segments > 30 s, points à vitesse implausible) — jamais d'échec muet. Deux relevés de référence dans `docs/GPX/` : `activity_24920331005.gpx` (exploitable — 26 933 points, pas médian 1 s, boucle fermée à 18 m) et `activity_24827718657.gpx` (contre-exemple — 598 points, 69 % de la distance en segments > 30 s) ; les deux cas couverts par un test.
- Altitude lue dans le GPX, jamais échantillonnée depuis le MNT (le relief terrarium ne sert qu'au rendu). Seuil d'accumulation du D+ = constante unique du pipeline, documentée avec son effet chiffré (641 m brut → 604 m au seuil de 5 m sur le relevé d'essai, soit 6 % d'écart). Chiffre D+/D− unique publié sur toutes les surfaces : carte, profil et contenu éditorial lisent la même source.
- Deux épreuves sur géométrie partagée : une géométrie de base relevée une fois, chaque épreuve étant une composition ordonnée de portions ; `s` est calculé par épreuve, jamais globalement. Chaque point de passage porte une identité unique sur la géométrie de base (celle partagée avec l'entité CHECKPOINT de l'épopée 4), un kilométrage distinct par épreuve traversée, et ses services. Les checkpoints arbitraires du POC ne sont pas repris.
- Trace gelée à la publication : une fois le parcours annoncé, toute évolution est une nouvelle version explicite de `parcours.json`, jamais une modification silencieuse.
- Licences (bloquant) : EOX Sentinel-2 cloudless (CC BY-NC-SA) est incompatible avec les inscriptions payantes et le bloc sponsors déjà présents. L'arbitrage retient l'une des options — ArcGIS Location Platform avec clé, fournisseur payant, ou OpenTopoMap seul sans satellite — avec coût, plafond d'usage et clause de monétisation cités. Les endpoints Esri sans clé du POC ne partent pas en production ; clé éventuelle hors du dépôt, restreinte au domaine de production. Attributions permanentes, adaptées au fond actif, jamais masquées ; aucun téléchargement massif de tuiles depuis les serveurs publics (pas de préchargement hors-ligne).
- Budget vitrine préservé : la carte 3D vit hors du flux de la page course, jamais dans le premier écran ni le chemin critique ; < 300 Ko au premier chargement et premier rendu < 5 s en 3G lent, mesuré en CI et non déclarés.
- Dégradation propre : sans WebGL, GPU indisponible ou tuiles injoignables, le bloc parcours textuel reste complet et lisible, avec un message explicite — jamais un cadre vide.

## Technical Decisions

- Stack de rendu verrouillée : MapLibre GL JS 4.7.1 (CDN cdnjs), relief AWS Terrain Tiles encodage `terrarium` (`raster-dem`, tileSize 256, maxzoom 15, domaine public SRTM/GMTED), fond topo OpenTopoMap (maxzoom 17, CC-BY-SA), glyphes `fonts.openmaptiles.org`. L'alternative « ruban mesh .glb three.js » est écartée : la 3D visée est du terrain tuilé complet. Le .glb Draco reste la piste hors-ligne 3D de l'app coureuse, reporté à l'épopée 6.
- `s` (abscisse curviligne, relative à une épreuve) est le bus d'état unique de toutes les surfaces parcours : profil, checkpoints, future position live, caméra du survol animé, fallbacks 2D. C'est l'unique variable synchronisée entre carte et profil.
- `poc/index.html` est le modèle d'intégration à reprendre (carte MapLibre, bascules satellite/topo et 3D, profil SVG synchronisé, curseur partagé, bandeau repliable) ; il tourne sur le relevé réel. `poc/route.py` et `poc/dem.py` sont périmés en production.
- Prérequis non logiciel : le relevé officiel se fait en enregistrement à 1 seconde (jamais « intelligent »), avec plusieurs relevés de la même portion sous couvert forestier (retenir le meilleur ou le médian, documenter l'écart), et doit fermer la boucle (départ = arrivée).
- Position live sur la carte 3D : hors périmètre de cette itération. Cadrage arrêté pour plus tard : fusion scans checkpoints + ping GPS, point figé sur le dernier `s` connu avec « vu il y a X min », aucune extrapolation.
- Questions ouvertes à trancher en cours d'épopée : lieu d'exécution du pipeline (script Python hors CI vs script Node en build web) ; versionnement de `parcours.json` par édition ; altitude brute du GPX vs correction Strava, et seuil D+ ; ordre d'enchaînement des boucles de l'épreuve longue (le pipeline doit supporter les deux cas) ; valeur par défaut d'exagération verticale dans la plage x1,5–2 ; modélisation des barrières horaires (rattachement aux CHECKPOINT de l'épopée 4 ou entité propre).
- La carte publique live (épopée 7) affiche aujourd'hui les dossards sur un tracé unique ; avec deux épreuves partageant une portion, filtrer par épreuve ou superposer reste à arbitrer — l'information existe déjà (le dossard porte son épreuve).

## UX & Interaction Patterns

- Contrôles discrets en chips labellisés (bascule 3D, survol, exagération du relief, choix du fond), `NavigationControl` avec visualisation du tangage, cibles ≥ 44/48 px jamais au bord de l'écran ; indication explicite de l'interaction (glisser pour pivoter, molette pour zoomer) ; la carte n'occupe jamais le premier écran.
- Points de passage : pastilles numérotées sur la trace, fiche au tap **et** au clavier (nom, kilomètre, altitude, D+ du segment amont, services en icône et en texte — jamais la couleur seule).
- Profil : SVG lisible d'abord sur téléphone, lisible au survol **et** au tap (aucune information ne dépend du survol — Android entrée de gamme), valeurs sous le curseur annoncées en texte accessible (kilomètre, altitude, pente). Graphe de technicité : échelle verrouillée < 5 % roulant, 5–12 % soutenu, 12–20 % raide, > 20 % très raide ; légende en trait et en toutes lettres, teintes différenciées aussi en clarté (daltonisme, niveaux de gris).
- Épreuve active toujours visible au contact du kilométrage, sur la carte comme sur le profil : aucun chiffre orphelin de son référentiel ; la bascule d'épreuve fait tout basculer ensemble et se lit comme voulue, jamais comme un défaut.
- Bandeau profil repliable : résumé kilomètres / D+ / nombre de points quand replié, état mémorisé, carte correctement redimensionnée. Survol animé : démarrage et arrêt explicites, jamais automatique, neutralisé sous `prefers-reduced-motion`.
- Bloc d'attributions permanent, lisible au contraste AA, jamais superposé à du contenu ; le déploiement d'un détail ne fait jamais disparaître la mention courte.

## Cross-Story Dependencies

- La story 9.3 (épopée 9) fournit la coquille de la section parcours et le contrat de données (structure unique par épreuve) ; les stories 11.3 et suivantes s'y branchent sans changer le rendu.
- 11.2 (arbitrage du fond) conditionne 11.3 à 11.6 : tant que le fond de production n'est pas arbitré, rien ne part en ligne. 11.1 est indépendante.
- 11.7 peut toucher l'entité CHECKPOINT (épopée 4, en recette) : l'impact sur les écrans de scan et l'arbitrage serveur des passages doit être évalué et nommé avant toute migration ; les critères des stories 4.3–4.5 ne doivent pas être cassés.
- 11.6 est coupable sans toucher à 11.1–11.5 si l'arbitrage du fond interdit le fond visé ou si le calendrier se tend.
- Le relevé officiel du terrain (enregistrement 1 s, boucle fermée) est un prérequis non logiciel : sans lui, le pipeline n'a pas d'entrée valide.
