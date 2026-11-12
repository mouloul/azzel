# Crédits et licences des sources externes

Sources tierces utilisées par Azzel, avec le texte d'attribution que leur
licence impose. Les textes ci-dessous sont reproduits **tels quels** dans
l'interface : les raccourcir ou les reformuler romprait la clause
d'attribution.

Référence : `_bmad-output/brainstorming/brainstorm-carte-3d-parcours-course-2026-10-23/note-licences-cartographiques.md`
et `_bmad-output/implementation-artifacts/decision-fond-cartographique-2026-11-05.md`.

## Cartographie

### Fond topographique — OpenTopoMap

Licence **CC BY-SA 3.0**. Usage commercial autorisé sans redevance, sous
réserve d'attribution et de partage à l'identique des œuvres dérivées.

```
Données cartographiques : © Contributeurs OpenStreetMap, SRTM | Rendu : © OpenTopoMap (CC-BY-SA)
```

Liens à conserver : <https://www.openstreetmap.org/copyright> et
<https://opentopomap.org>.

OpenTopoMap ne garantit ni disponibilité ni support, et **interdit les
téléchargements de masse** sur ses serveurs publics. Azzel ne précharge
aucune tuile, ni sur la vitrine ni dans l'application coureur.

### Surcouche noms et chemins — OpenFreeMap / OpenMapTiles / OpenStreetMap

Posée sur le fond satellite uniquement (masquée sur le topographique, qui
porte déjà ses libellés) : routes, pistes et sentiers, noms des routes, noms
de lieux. Données **OpenStreetMap sous ODbL 1.0**, schéma OpenMapTiles,
tuiles et polices servies par OpenFreeMap. **Usage commercial autorisé**,
gratuit, sans clé ; **aucune garantie de service** (si OpenFreeMap ne répond
pas, la carte reste affichée, simplement sans libellés).

Texte d'attribution, reproduit tel que publié dans le TileJSON
(`https://tiles.openfreemap.org/planet`) :

```
OpenFreeMap © OpenMapTiles Data from OpenStreetMap
```

Liens à conserver : <https://openfreemap.org>, <https://www.openmaptiles.org/>
et <https://www.openstreetmap.org/copyright>.

Le TileJSON et les tuiles ne sont demandés **qu'à l'affichage du satellite** :
la surcouche est ajoutée à la carte après son ouverture, au premier passage
sur le satellite. Sans clé ArcGIS, la surcouche n'existe pas. **Avec une clé,
le satellite est le fond par défaut** : la surcouche se charge donc dès
l'ouverture de la carte pour la plupart des visiteurs, dont l'adresse IP est
alors exposée à un tiers supplémentaire (OpenFreeMap). Seul un visiteur qui
n'affiche jamais le satellite ne contacte pas openfreemap.org. Aucune tuile
n'est préchargée ; seules les tuiles affichées sont demandées.

### Relief — AWS Terrain Tiles (terrarium)

**Domaine public** (SRTM, GMTED2010 et 3DEP de l'U.S. Geological Survey),
crédit demandé en cas de rediffusion.

```
Relief : données 3DEP, GMTED2010 et SRTM — U.S. Geological Survey, tuiles Terrain Tiles (Tilezen/Mapzen) via AWS Open Data
```

Cette source produit **le relief 3D et le profil altimétrique**. Le fichier
`parcours.json` généré au build en est une œuvre dérivée : étant issu d'un
modèle numérique de terrain en domaine public, il n'est grevé d'aucune
licence.

L'hébergement AWS n'offre aucune garantie de disponibilité. La licence
autorise l'auto-hébergement, qui est le recours si le service disparaît.

### Moteur de rendu — MapLibre GL JS

Licence **BSD 3-Clause**. Usage commercial libre, sans clé ni quota. La
mention de copyright et le texte de licence sont conservés dans le bundle.

```
© MapLibre
```

### Fonds non utilisés

- **Esri World Imagery** — le POC l'utilisait sans clé. Écarté : couvert par
  le Master License Agreement d'Esri, qui n'autorise pas cet usage hors
  contrat. Aucun endpoint Esri ne subsiste dans le code livré.
- **EOX Sentinel-2 cloudless** — écarté : licence CC BY-NC-SA 4.0, donc
  réservée à l'usage non commercial, alors qu'Azzel vend des inscriptions et
  affiche des sponsors.

## Polices

- **Inter** et **Barlow Condensed** — SIL Open Font License 1.1. Textes de
  licence complets dans `apps/web/public/charte/fonts/OFL-Inter.txt` et
  `OFL-Barlow-Condensed.txt`. Les fichiers servis sont élagués
  (`scripts/sous-ensemble-polices.sh`) ; les mentions de droit d'auteur et de
  licence sont conservées dans chaque fichier.

## Citation

- « Aman d laman » — proverbe kabyle, source : Hanoteau, 1867. Affiché
  uniquement aux ravitaillements, conformément à la charte éditoriale.

## Revue

Ces conditions changent sans préavis. **Revue annuelle à programmer** ; le
retrait progressif des endpoints Esri anonymes en est l'illustration.
