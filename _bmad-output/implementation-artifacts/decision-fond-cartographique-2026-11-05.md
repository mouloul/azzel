# Décision — fond cartographique de production (story 11.2)

**Date :** 5 novembre 2026
**Décideur :** responsable du projet Azzel
**Source :** `_bmad-output/brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/note-licences-cartographiques.md`

## Décision

**OpenTopoMap seul, sans fond satellite.** Relief terrarium conservé.

| Poste | Source retenue | Licence | Usage commercial | Coût | Plafond |
| --- | --- | --- | --- | --- | --- |
| Fond de carte | OpenTopoMap | CC BY-SA 3.0 | **Autorisé sans redevance** | 0 | Aucun plafond contractuel ; politique d'usage : pas de téléchargement de masse |
| Relief 3D | AWS Terrain Tiles (terrarium) | Domaine public — SRTM, GMTED2010, 3DEP de l'USGS | Autorisé | 0 | Aucun ; service sans garantie de disponibilité |
| Moteur | MapLibre GL JS | BSD 3-Clause | Autorisé | 0 | Aucun |
| Fond satellite | **aucun** | — | — | — | — |

## Pourquoi

**La clause qui décide est le paragraphe 3 de la note licences.** Le critère des licences `NC` porte sur la nature de l'**usage**, pas sur le statut associatif de la structure. Azzel vend des inscriptions (FR-4) et affiche des sponsors (FR-22) sur les pages mêmes qui porteraient la carte. Toute source non commerciale — au premier rang desquelles EOX Sentinel-2 cloudless, en CC BY-NC-SA 4.0 — placerait le projet dans une zone discutable, et la question se rouvrirait à chaque évolution du modèle économique.

**Clause de monétisation retenue :** aucune. OpenTopoMap autorise explicitement l'usage commercial sous réserve d'attribution et de partage à l'identique des œuvres dérivées ; le relief est en domaine public. Rien dans la chaîne ne dépend du caractère non monétisé du projet. C'est le seul montage qui ne se rediscutera pas si Azzel vend davantage demain.

**Options écartées :**

- **EOX Sentinel-2 cloudless** (gratuit, 10 m/px) — écarté par le §3 ci-dessus. L'aurait-on retenu que la résolution tombait déjà de ~0,6 m/px à 10 m/px.
- **ArcGIS Location Platform avec clé** (~0,6 m/px, palier gratuit annoncé à 2 000 000 tuiles/mois, puis ~0,15 USD/1 000 tuiles) — juridiquement propre et techniquement supérieur, mais introduit une clé à gérer, un compte fournisseur, un plafond à surveiller et une dépendance contractuelle. Disproportionné tant que personne n'a réclamé le satellite. **Reste le recours** si l'effet visuel manque : la décision est réversible, le module `fonds-carte.ts` expose un tableau de fonds précisément pour cela.
- **MapTiler, Mapbox** — payants, couverture en Kabylie non vérifiée.

**Conséquence assumée :** perte de l'effet « vue satellite façon UTMB » du POC. Le relief 3D, lui, est conservé entièrement — c'est le DEM qui le produit, pas le fond. La carte reste spectaculaire.

## Ce que la décision impose au code

- Les endpoints Esri sans clé du POC **ne partent pas en production**. Un test le vérifie (`fonds-carte.test.ts`) : aucune URL ne contient « arcgis » ni « esri ».
- **Aucune clé n'est nécessaire**, donc rien à tenir hors du dépôt ni à restreindre par domaine. Un test vérifie qu'aucune source ne réclame de clé, pour que l'ajout futur d'un fond à clé soit un acte conscient.
- Le bloc d'attributions est **visible en permanence, sans interaction**, et le relief y figure quel que soit le fond actif.
- **Aucun préchargement de tuiles**, ici ni dans l'application coureur : la politique d'OpenTopoMap l'interdit sur ses serveurs publics. La piste hors-ligne reste le ruban glTF pré-cuit (§4 de la note).

## Amendement d'acceptation de la story 11.3

Le critère « bascule entre fond satellite et fond topographique » **tombe** : il n'y a plus qu'un fond. La barre de contrôles garde ses autres chips (3D, exagération du relief). `FONDS_DISPONIBLES` reste un tableau pour que l'ajout d'un fond satellite ne demande pas de refondre l'interface.

## Reste à faire, hors code

- [ ] **Informer OpenTopoMap** de l'intégration et du volume attendu — courtoisie demandée par le projet, pas une obligation de licence.
- [ ] **Revue annuelle** des conditions d'usage. Le retrait progressif des endpoints Esri anonymes montre que ces politiques changent sans préavis.
- [ ] Rouvrir la question du satellite si l'organisation le réclame : prendre alors ArcGIS Location Platform avec clé, et vérifier les tarifs à la source le jour même.

## Amendement — satellite sous clé (2026-11-05)

Le responsable du projet autorise le fond satellite **à condition d'une clé** ArcGIS Location Platform
(`NEXT_PUBLIC_ARCGIS_API_KEY`). L'endpoint anonyme `server.arcgisonline.com` du POC reste exclu.
Sans clé : décision d'origine inchangée (OpenTopoMap seul, aucun appel Esri).
Tuiles : `ibasemaps-api.arcgis.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}?token=…`, z18 max.
La couche satellite est masquée tant que non choisie ; attribution Esri suit le fond actif.
À faire à la mise en production : confronter l'attribution au `copyrightText` du service et restreindre la clé au domaine.

## Amendement — surcouche noms et chemins sur le satellite (2026-11-12)

L'imagerie Esri n'affiche ni noms de lieux ni routes, et la clé ArcGIS du projet n'ouvre aucune
couche de libellés Esri (services `Reference/*` en 404, Basemap Styles en « Token Invalid »).
Le satellite reçoit donc une **surcouche vectorielle OpenFreeMap** (données OpenStreetMap, schéma
OpenMapTiles) : routes, pistes et sentiers, noms des routes, noms de lieux (ville, bourg, village,
hameau).

| Poste | Source retenue | Licence | Usage commercial | Coût | Plafond |
| --- | --- | --- | --- | --- | --- |
| Surcouche noms et chemins | OpenFreeMap (`tiles.openfreemap.org/planet`, TileJSON) | ODbL 1.0 (données OSM) | Autorisé | 0 | Aucun ; sans clé, sans garantie de service |

- La surcouche n'existe **que si le satellite est proposé** (clé ArcGIS valide) ; sans clé, le style
  est inchangé et aucun appel ne part vers openfreemap.org.
- Sa visibilité **suit celle du satellite** : masquée sur le topographique, qui porte déjà ses
  libellés OpenTopoMap.
- **Appels réseau :** la surcouche n'est pas dans le style initial (son TileJSON y retiendrait
  l'ouverture de la carte, et pour toujours s'il échouait). Elle est ajoutée après l'ouverture, au
  premier affichage du satellite : TileJSON et tuiles ne partent qu'à ce moment. Or, avec clé, le
  satellite est le fond par défaut : pour la plupart des visiteurs, la surcouche se charge dès
  l'ouverture de la carte, et leur adresse IP est exposée à un tiers supplémentaire (OpenFreeMap).
  Seul un visiteur qui n'affiche jamais le satellite ne contacte pas openfreemap.org. Si OpenFreeMap
  ne répond pas, la carte s'affiche quand même, simplement sans libellés.
- Ordre des couches : satellite < routes et chemins < tracé de l'épreuve < libellés.
- Libellés en alphabet latin seulement (`name:fr`, sinon `name:latin`), sans repli sur `name` :
  la police servie (Noto Sans) ne couvre pas l'arabe. Tunnels non dessinés.
- Attribution « OpenFreeMap © OpenMapTiles Data from OpenStreetMap » ajoutée au bloc et à la mention
  courte quand le satellite est actif, et à `CREDITS.md`.
- Pas de clé, pas de préchargement, pas de nouveau contrôle d'interface.
- Noms de routes : nom latin, sinon référence (`ref`, ex. RN12) ; tunnels, rail et ferry non nommés.

**Reste à faire :**

- [ ] Surveiller la disponibilité d'OpenFreeMap (service gratuit, sans garantie). Solution de sortie :
  auto-héberger les tuiles OpenMapTiles (PMTiles) ou passer à un autre fournisseur.
