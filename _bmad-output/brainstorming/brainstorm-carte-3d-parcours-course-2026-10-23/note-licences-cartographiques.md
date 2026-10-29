# Note technique — Licences des sources cartographiques (carte 3D du parcours)

**Projet :** Azzel — association de trail en Algérie, projet non monétisé
**Date :** 23 octobre 2026
**Destinataires :** responsable du projet Azzel, développeur chargé de l'intégration des cartes
**Origine :** session de brainstorming « Carte animée 3D du parcours de course » (POC MapLibre livré)

> Cette note documente l'état **vérifié** des licences au 23/10/2026 et nomme explicitement ce qui doit être **confirmé auprès du fournisseur**. Ce n'est pas un avis juridique.

---

## 1. Tableau de synthèse

| Source | Usage dans Azzel | Licence | Usage commercial | Attribution obligatoire | Verdict |
|---|---|---|---|---|---|
| **AWS Terrain Tiles (terrarium)** | Relief 3D (raster-dem MapLibre) + calcul du profil altimétrique | Domaine public US (SRTM, GMTED2010, 3DEP / USGS), crédit demandé | **Oui** | **Oui** (crédit USGS + Mapzen/Tilezen) | ✅ **Utilisable tel quel** |
| **OpenTopoMap** | Fond de carte topographique (bascule « topo ») | **CC BY-SA 3.0** (données OSM + rendu OpenTopoMap) | **Oui** | **Oui** | ✅ **Utilisable tel quel**, avec réserve sur le volume de trafic et le préchargement (§4) |
| **Esri World Imagery** | Fond satellite du POC | Esri Master Agreement / E300 (propriétaire) | **Non couvert** sans licence ArcGIS | Oui (« Esri, Maxar, Earthstar Geographics… ») | ⚠️ **À remplacer / à clarifier** — point bloquant |
| **EOX Sentinel-2 cloudless** | Candidat de remplacement du fond satellite | **CC BY-NC-SA 4.0** (usage non commercial) ; usage commercial = licence EOX payante | **Non** en version gratuite | **Oui** | ⚠️ **Utilisable sous condition** : tant qu'Azzel reste strictement non commercial (§3) |
| **MapLibre GL JS 4.7.1** | Moteur de rendu de la carte | **BSD 3-Clause** | **Oui** | Recommandée (mention du moteur) ; la mention de copyright doit figurer dans la distribution du code | ✅ **Utilisable tel quel** |

---

## 2. Détail par source

### 2.1 AWS Terrain Tiles « terrarium » — relief

**Vérifié.** Jeu de données hébergé sur le *Registry of Open Data on AWS* (projet Tilezen/Joerd, héritage Mapzen). Hors des États-Unis et des hautes latitudes, l'élévation provient de **SRTM** et **GMTED2010**, tous deux publiés par l'USGS. La page d'attribution officielle (`tilezen/joerd/docs/attribution.md`) qualifie ces deux jeux de **domaine public** ; l'USGS demande un crédit en cas de rediffusion ou de publication. Accès libre, sans clé API.

**Conséquence pour Azzel :** aucun obstacle. C'est la source du relief 3D **et** du profil altimétrique, ce qui écarte aussi tout problème de licence sur le `parcours.json` généré au build.

**À confirmer :** rien de bloquant. Noter simplement que l'hébergement AWS n'offre **aucune garantie de disponibilité** ; prévoir, à terme, la possibilité de régénérer les tuiles DEM depuis Copernicus GLO-30 ou de les auto-héberger (ce que la licence autorise).

### 2.2 OpenTopoMap — fond topographique

**Vérifié.** Page « À propos » d'OpenTopoMap : les tuiles sont sous **CC BY-SA 3.0**, le style de rendu également. L'usage commercial est explicitement autorisé sans redevance, sous réserve d'attribution et de partage à l'identique des œuvres dérivées. OpenTopoMap demande **de ne pas surcharger ses serveurs, notamment par des téléchargements de masse**, ne garantit ni disponibilité ni support, et apprécie une notification quand la carte est intégrée dans un site ou une application.

**Conséquence pour Azzel :** utilisable pour la vitrine en ligne (épopée 2), trafic d'une association de trail. Voir §4 pour l'application coureur hors-ligne.

**À confirmer :** envoyer un court message d'information à OpenTopoMap (courtoisie demandée par eux) et décrire le volume attendu, si une bascule « topo » reste activée en production.

### 2.3 Esri World Imagery — satellite (point bloquant)

**Vérifié :**
- La couche *World Imagery* d'Esri est publiée sous **Esri Master License Agreement** — une licence propriétaire, pas une licence ouverte. La fiche de la couche indique explicitement qu'elle **n'est pas destinée à l'export de tuiles pour un usage hors-ligne**.
- L'endpoint anonyme `services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` **répond encore** au 23/10/2026 (test effectué : HTTP 200, image JPEG). Les SDK tiers (Cesium, par ex.) ont basculé leurs exemples vers `ibasemaps-api.arcgis.com` **avec jeton ArcGIS obligatoire**.
- Résolution constatée sur la zone du POC (Ath Aïssi) : **jusqu'au z18 (~0,6 m/px)**, z19 absent.

**À confirmer auprès d'Esri (non vérifié) :**
1. Existe-t-il une date annoncée de retrait de l'accès anonyme à `services.arcgisonline.com` ? Aucune annonce officielle n'a été trouvée — l'endpoint fonctionne, mais **rien ne le garantit** : il peut disparaître sans préavis, et avec lui le fond satellite de la vitrine.
2. Un usage associatif non monétisé est-il couvert par les conditions E300 sans contrat ? **Aucun document consulté ne l'autorise explicitement.** C'est précisément ce qui rend cette source non sûre pour une mise en production.

**Verdict :** acceptable dans le POC, **à remplacer ou à faire confirmer par écrit avant la mise en production**. C'est le seul vrai point bloquant du dossier.

### 2.4 EOX Sentinel-2 cloudless — remplacement satellite

**Vérifié.** Les mosaïques *Sentinel-2 cloudless* d'EOX (données Copernicus Sentinel-2, **10 m/px**) sont diffusées sous **CC BY-NC-SA 4.0** : usage **non commercial** uniquement, attribution obligatoire, partage à l'identique. Tout usage commercial requiert une *EOX Commercial Attribution-RestrictedUse 1.2 License* (payante, à négocier avec EOX). Depuis juin 2026, EOX a unifié le texte d'attribution des produits « Data » et « Viewing ». La sous-licence et la revente directe sont exclues par défaut, et il est interdit de laisser entendre un soutien de la Commission européenne ou de l'ESA.

**Conséquence pour Azzel :** utilisable **tant qu'Azzel reste strictement non commercial** (voir §3). Contrepartie technique : **10 m/px contre ~0,6 m/px chez Esri** — perte de détail nette au zoom proche sur un parcours de trail.

**À confirmer :** l'interprétation du « non commercial » dans le contexte précis d'Azzel (voir §3). En cas de doute, poser la question par écrit à EOX (`cloudless.eox.at`, contact commercial) : leur réponse, même informelle, fait trace.

### 2.5 MapLibre GL JS — moteur

**Vérifié.** MapLibre GL JS est sous **BSD 3-Clause** depuis la v2 (fork de Mapbox GL JS v1 avant son passage en licence propriétaire). Usage commercial libre, pas de clé, pas de quota, pas de télémétrie imposée. La seule obligation est de conserver la mention de copyright et le texte de licence dans les distributions du logiciel — ce que fait déjà `node_modules` / le bundle. Aucun risque sur ce poste.

---

## 3. Point de vigilance : « associatif » ≠ « non commercial »

**À lire par le responsable du projet.** C'est le risque le plus facile à sous-estimer.

Le statut juridique d'Azzel (association) **n'est pas** le critère retenu par les licences `NC` (CC BY-NC-SA, donc EOX Sentinel-2 cloudless). Le critère est la **nature de l'usage**, pas celle de l'organisation. Creative Commons définit l'usage non commercial comme un usage *« qui n'est pas principalement destiné à ou orienté vers un avantage commercial ou une compensation monétaire »*.

Font basculer l'analyse du côté commercial, ou au minimum la rendent discutable :

- des **inscriptions payantes** à la course, même au prix coûtant, si la carte sert à promouvoir l'épreuve ;
- des **logos de sponsors** affichés sur la même page que la carte, ou dans l'application coureur ;
- toute **vente** (dossards, textile, photos) depuis le site qui héberge la carte ;
- une **régie publicitaire** ou de l'affiliation sur le site vitrine.

À l'inverse, restent clairement du côté non commercial : une page d'information gratuite sur le parcours, sans sponsor ni paiement, et l'usage interne par les bénévoles et le PC course.

**Conclusion pratique.** Tant qu'Azzel n'a ni inscriptions payantes ni sponsors visibles, EOX Sentinel-2 cloudless est utilisable sous CC BY-NC-SA. **Dès que l'un des deux apparaît, la question doit être rouverte** — et c'est une hypothèse crédible pour une course de trail. Si l'on veut une solution qui ne se rediscute pas, il faut partir d'emblée sur une source dont l'usage commercial est autorisé (ArcGIS Location Platform avec clé, MapTiler, Mapbox) ou sur le fond topographique OpenTopoMap, dont l'usage commercial ne pose pas de question.

---

## 4. Cas particulier : préchargement hors-ligne pour l'application coureur

L'épopée 6 (application coureur) suppose un fonctionnement **sans réseau** sur le terrain. Or, le préchargement de tuiles est précisément ce que les licences et les politiques d'usage encadrent le plus strictement.

| Source | Préchargement / cache massif |
|---|---|
| OpenTopoMap | **Interdit sur leurs serveurs publics** (« ne pas surcharger le serveur, par exemple par des téléchargements de masse »). La licence CC BY-SA, elle, autorise la redistribution — mais il faut alors **générer les tuiles soi-même** depuis les données OSM + SRTM avec le style OpenTopoMap (publié sur GitHub), et non les aspirer depuis `tile.opentopomap.org`. |
| Esri World Imagery | **Explicitement non destinée à l'export de tuiles hors-ligne.** Exclue de fait. |
| EOX Sentinel-2 cloudless | Redistribution et œuvres dérivées autorisées sous CC BY-NC-SA avec attribution conservée — mais le téléchargement massif depuis leurs serveurs publics relève du même principe de courtoisie ; un contact préalable avec EOX est recommandé pour un préchargement de zone. |
| AWS Terrain Tiles (terrarium) | **Aucun obstacle de licence** (domaine public). Volume raisonnable à prévoir côté AWS, mais le DEM peut être précuit au build et embarqué. |

**Recommandation technique (rappel du brainstorming).** Ne pas chercher à précharger des tuiles pour l'application coureur. La piste du **ruban glTF pré-cuit** — maillage extrudé du MNT sur ~500 m de large autour de la trace, texture baked, quelques Mo versionnés par course — reste la bonne réponse hors-ligne : le MNT est en domaine public, la géométrie produite est une **œuvre dérivée d'une source libre**, et l'on échappe entièrement aux politiques d'usage des serveurs de tuiles. Le fond satellite ou topo reste, lui, en ligne uniquement.

---

## 5. Textes d'attribution exacts à afficher

À placer dans le contrôle d'attribution MapLibre (`AttributionControl`), visibles sans interaction, et repris dans une page « Crédits » du site.

### 5.1 Relief (toujours affiché, quel que soit le fond)

```
Relief : United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey — tuiles Terrain Tiles (Tilezen/Mapzen) via AWS Open Data
```

Variante courte acceptable si la place manque :

```
SRTM data courtesy of the U.S. Geological Survey | Mapzen
```

### 5.2 Fond topographique OpenTopoMap

Texte exact demandé par OpenTopoMap, à reproduire tel quel :

```
Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)
```

Équivalent français, acceptable si l'interface est francophone (conserver les liens vers openstreetmap.org/copyright et opentopomap.org) :

```
Données cartographiques : © Contributeurs OpenStreetMap, SRTM | Rendu : © OpenTopoMap (CC-BY-SA)
```

### 5.3 Fond satellite EOX Sentinel-2 cloudless

Format d'attribution unifié d'EOX (juin 2026). Remplacer `<année>` par le millésime de la mosaïque utilisée (ex. `2024`) :

```
EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data <année>)
```

Mention à ajouter sur la page Crédits, la licence étant `NC` :

```
Imagerie Sentinel-2 cloudless © EOX IT Services GmbH, sous licence CC BY-NC-SA 4.0. Usage non commercial.
```

### 5.4 Fond satellite Esri (uniquement tant que le POC est en l'état)

```
Imagerie : Esri, Maxar, Earthstar Geographics, et la communauté des utilisateurs SIG
```

> Cette attribution **ne suffit pas** à rendre l'usage conforme : elle accompagne une source dont les conditions restent à clarifier (§2.3).

### 5.5 Moteur de rendu

```
© MapLibre
```

---

## 6. Options de remplacement du fond satellite

| Option | Résolution | Coût | Usage commercial | Remarque |
|---|---|---|---|---|
| **EOX Sentinel-2 cloudless** (CC BY-NC-SA) | **10 m/px** | Gratuit | **Non** | Le plus simple **aujourd'hui**, tant qu'Azzel reste non commercial. Détail nettement inférieur au POC actuel. |
| **ArcGIS Location Platform** (compte + clé API) | Identique au POC (**~0,6 m/px**, z18 sur la zone) | Palier gratuit annoncé à **2 000 000 de tuiles/mois** ; au-delà ~**0,15 USD / 1 000 tuiles** | Oui, dans les termes du contrat | Même imagerie que le POC, en passant par `ibasemaps-api.arcgis.com` avec jeton. Palier gratuit très au-dessus des besoins d'une course. **Chiffres à revérifier sur location.arcgis.com/pricing.** |
| **MapTiler Cloud** (Satellite) | Haute résolution (variable selon la zone) | Plan **Free** : 5 000 chargements de carte et 100 000 requêtes/mois ; plan **Flex** : 30 USD/mois | Oui | Couverture en Kabylie à vérifier avant engagement. Conditions hors-ligne/self-hosting non documentées sur la page de tarifs. |
| **Mapbox Satellite** | Haute résolution | Facturation à l'usage, palier gratuit | Oui | Écarté lors du brainstorming (pas de besoin avéré de Mapbox). Reste un recours. |
| **Licence commerciale EOX** | 10 m/px | Sur devis | Oui | Pertinent uniquement si Azzel se monétise et veut conserver Sentinel-2. |
| **Pas de satellite du tout** | — | 0 | Oui | Garder OpenTopoMap seul comme fond. Option la plus sûre juridiquement ; perte de l'effet visuel « façon UTMB ». |

**Lecture recommandée.** Si le projet reste non monétisé : **EOX Sentinel-2 cloudless**, en acceptant les 10 m/px. Si l'on veut conserver la qualité visuelle du POC sans dépendre du statut associatif : **ArcGIS Location Platform avec clé**, dont le palier gratuit couvre largement le trafic attendu — c'est la même imagerie, mais sous un cadre contractuel explicite.

---

## 7. Actions à mener avant la mise en production

- [ ] **Trancher le fond satellite** entre EOX Sentinel-2 cloudless (gratuit, 10 m, NC) et ArcGIS Location Platform avec clé API (0,6 m, palier gratuit, usage commercial couvert). Décision à prendre par le responsable du projet, car elle dépend du point §3.
- [ ] **Retirer Esri World Imagery sans clé** du code livré en production, ou obtenir d'Esri une confirmation écrite que l'usage est couvert.
- [ ] **Vérifier à la source les chiffres de tarification** (ArcGIS Location Platform, MapTiler) au moment de la décision : ils évoluent.
- [ ] **Implémenter le bloc d'attributions** de la §5 dans le `AttributionControl` MapLibre, visible sans interaction, et créer une page « Crédits » reprenant les textes complets.
- [ ] **Statuer sur le modèle économique d'Azzel** (inscriptions payantes ? sponsors affichés ?) et consigner la réponse. Elle conditionne la validité de toute source `NC`.
- [ ] **Informer OpenTopoMap** de l'intégration (courtoisie demandée) et estimer le volume de tuiles attendu.
- [ ] **Confirmer l'absence de préchargement de tuiles** dans l'application coureur ; acter la piste du ruban glTF pré-cuit pour l'épopée 6.
- [ ] **Documenter les licences dans le dépôt** (fichier `CREDITS.md` ou section du README) et conserver le `parcours.json` comme œuvre dérivée d'un MNT en domaine public.
- [ ] **Programmer une revue annuelle** des conditions d'usage : ces politiques changent sans préavis (le retrait des endpoints Esri anonymes en est l'illustration).

---

## 8. Récapitulatif de ce qui est vérifié et de ce qui ne l'est pas

**Vérifié au 23/10/2026 (sources consultées en ligne) :**
- Statut domaine public de SRTM/GMTED2010 et texte d'attribution exact (page d'attribution Tilezen/Joerd).
- Licence CC BY-SA 3.0 d'OpenTopoMap, texte d'attribution exact, interdiction des téléchargements de masse sur leurs serveurs (page « À propos » d'OpenTopoMap).
- Licence CC BY-NC-SA et format d'attribution unifié d'EOX Sentinel-2 cloudless, nécessité d'une licence commerciale payante (page de licence EOX).
- Couche Esri World Imagery sous Esri Master License Agreement, non destinée à l'export hors-ligne.
- L'endpoint anonyme `services.arcgisonline.com/.../World_Imagery` répond encore (test HTTP effectué).
- MapLibre GL JS sous BSD 3-Clause.

**Non vérifié / à confirmer auprès des fournisseurs :**
- Date de retrait éventuelle de l'accès anonyme aux tuiles Esri — aucune annonce officielle trouvée.
- Couverture d'un usage associatif non monétisé par les conditions Esri E300 sans contrat.
- Interprétation précise du « non commercial » par EOX pour le cas Azzel.
- Montants exacts et actuels du palier gratuit ArcGIS Location Platform (2 M tuiles/mois annoncés) et des plans MapTiler.
- Couverture et résolution réelles de MapTiler Satellite sur la Kabylie.
- Conditions de MapTiler pour l'usage hors-ligne et l'auto-hébergement.
