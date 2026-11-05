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
