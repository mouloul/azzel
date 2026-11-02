# Maquettes — refonte du design de l'application (2026-11-02)

**Support :** canvas de maquettes Azzel — https://claude.ai/artifact/BVNhALXErJbXjxA4zafRXH
(artefact privé ; demander l'accès au propriétaire du compte pour l'ouvrir)

**Statut :** maquettes de direction visuelle, pas de livrable d'implémentation. Les chiffres et
noms de coureurs qui y figurent sont fictifs, sauf les chiffres du bilan 2026 repris du code
existant (279 inscrits, 222 dossards, 214 arrivées, 116 enfants).

## Écrans maquettés

| Artboard | Surface | Contenu |
| --- | --- | --- |
| `Main.dc.html` | Vitrine | Accueil refondu : hero sombre plein cadre, section parcours (onglets d'épreuve, carte 3D, graphe de technicité), piliers, bande bilan, appel bénévoles, partenaires |
| `Inscription.dc.html` | Vitrine | Inscription en 4 étapes, dépôt du justificatif, récapitulatif |
| `Resultats.dc.html` | Vitrine | Podium, filtres, tableau de classement, pagination |
| `Volontaires.dc.html` | PWA volontaires | Mission en cours, missions à suivre, bandeau hors-ligne et file d'attente |
| `VolontairesScan.dc.html` | PWA volontaires | Viseur de scan, dernier pointage, saisie manuelle, file de synchronisation |
| `CoureurEdossard.dc.html` | App coureurs | E-dossard QR hors-ligne, informations de départ, matériel obligatoire |
| `CoureurSuivi.dc.html` | App coureurs | Progression, tracé, journal de synchronisation, abandon, économie de batterie |
| `AdminDossiers.dc.html` | Back-office | Compteurs, filtres, tableau des dossiers avec statuts, attribution des dossards |

## Décisions de charte portées par les maquettes

- Deux jeux de tokens conservés, tels qu'ils existent dans `packages/shared/src/tokens.ts` :
  `siteTokens` (crème / forêt / ocre, Barlow Condensed + Inter) pour vitrine et back-office,
  `colorTokens` (opérations, police arrondie, états de synchro) pour les surfaces terrain.
  Le design system Ouidou n'est pas utilisé : Azzel a sa propre charte « Aït Aïssi ».
- App coureurs en thème sombre par défaut, conformément à l'écran e-dossard déjà implémenté.
- Actions et chips en pilule ; cartes 14–20 px ; fin du mélange de rayons 4/6/8 px.

## Données de la section parcours

Relief, tracé, dénivelés, points de passage et graphe de technicité des maquettes sont calculés
depuis le relevé d'essai **`docs/GPX/activity_24920331005.gpx`** (« essai trail ait ainsi 2027 »,
Garmin Connect, 2026-10-31), via le `parcours.json` du POC :

- 26 933 points bruts, pas médian **1 s**, aucun segment de plus de 30 s — relevé exploitable,
  contrairement au premier essai `activity_24827718657.gpx` (598 points, 69 % de la distance en
  segments > 30 s).
- Trace brute : 30,68 km, D+ 1 459 m / D− 1 462 m, altitude 221–837 m, 8 h 14, boucle fermée
  (18 m entre départ et arrivée).
- Après lissage du POC (`parcours.json`) : **28,0 km, D+ 1 280 m, D− 1 281 m, 222–836 m**,
  3 222 points, 5 points de passage (km 0, 7, 14, 21, 28).

Les deux onglets des maquettes exposent donc **la Longue (28 km)** et **la Moyenne (14 km,
demi-boucle : D+ 528 m, D− 698 m, 222–677 m)**. Le découpage définitif des deux épreuves reste
à confirmer — la maquette porte la mention correspondante.

L'échelle de pente du graphe de technicité est celle du POC : < 5 %, 5–12 %, 12–20 %, > 20 %.

## Limite

Les maquettes rendent la carte 3D et le profil en SVG statique. En production, ce bloc est
**l'intégration de `poc/index.html`** — MapLibre GL JS, relief terrarium, bascules satellite/topo
et 3D, profil SVG et curseur partagé — décrite par FR-29 à FR-37. La maquette fixe la composition
et l'habillage de la section dans la page ; le POC fixe la mécanique.
