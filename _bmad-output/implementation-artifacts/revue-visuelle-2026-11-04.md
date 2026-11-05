# Revue visuelle des épopées 9, 10 et 11 — 2026-11-04

Première revue des écrans **regardés**, et non déduits de tests qui lisent des
feuilles de style. Les seize stories des épopées 9, 10 et 11 étaient en `review`
sans qu'aucun rendu n'ait jamais été vu.

## Méthode

Harnais Chrome par CDP (même plomberie que `scripts/mesure-chargement.mjs`),
build de production servi par `next start`, base ensemencée (`pnpm -F @azzel/web
seed`, 50 coureurs fictifs). 88 captures : 22 écrans × 2 largeurs (390 px et
1280 px) × 2 thèmes. Sessions ouvertes pour les trois rôles (coureur,
volontaire, organisateur) en insérant la ligne `session` attendue par le module
iam, ce qui donne accès aux écrans protégés — les quatre écrans que la story 9.6
n'avait pas pu mesurer sont donc couverts.

Les captures et le harnais sont dans le répertoire de travail de la session, non
versionnés. Le harnais mérite d'être versionné si l'équipe veut rejouer cette
revue à chaque épopée (voir « Suite à donner »).

---

## Bloquants

### B1 — La même carte annonce 35 km et 28 km

Sur l'accueil, la fiche de l'épreuve longue porte le titre **« LA LONGUE —
35 KM »** et, trois lignes plus bas, la ligne **« Distance 28 km »**. Plus bas
encore, le profil altimétrique dit « 28 km, altitude 222 à 836 m » et le
marqueur d'arrivée « km 28 ». Plus haut, les cartes d'épreuves disent « TRAIL
LONG — 35 KM » et le rail du hero « 35 km · 12 km ». L'e-dossard du coureur
affiche « La Longue — 35 km ».

L'écart est **assumé dans le code** : `apps/web/src/modules/contenus/section-parcours.ts:112`
porte le commentaire « pas la base (35) — le nom "La Longue — 35 km" reste
éditorial ». Le raisonnement tient en revue de code ; il ne survit pas à
l'écran, où les deux chiffres se touchent.

Origine du 35 : `inscriptions/migrations/0002_inscriptions.sql:70` et
`contenus/migrations/0014_contenus_vitrine.sql:55`. Origine du 28 :
`parcours.json`, issu du relevé d'essai.

**Décision attendue du PO** : soit le nom éditorial perd sa distance (« La
Longue »), soit les chiffres publiés restent ceux de la base tant que le tracé
officiel n'est pas livré. Ne pas publier en l'état.

### B2 — Le thème ignore la préférence système

`apps/web/src/lib/theme.ts:5-10` : `resolveInitialTheme` rend `'light'` dès
qu'aucun choix n'est mémorisé. Aucun appel à `matchMedia('(prefers-color-scheme)')`
nulle part dans `apps/web`.

UX-DR-2 exige « défaut préférence système, override mémorisé », repris dans les
critères des stories 1.6 (`epics.md:294`) et 9.x (`epics.md:436`).

Mesuré : sur 44 paires d'écrans capturées en `prefers-color-scheme: dark` puis
`light`, **41 rendent une image strictement identique**. Seule la PWA
volontaires réagit, par sa propre logique d'invitation au mode sombre.

Le défaut est **figé par un test** : `apps/web/src/lib/theme.test.ts:21`,
`expect(resolveInitialTheme(null)).toBe('light')`. Le test a été écrit sur
l'implémentation, pas sur la spécification.

### B3 — L'en-tête d'administration déborde de l'écran à 390 px

Sur `/admin/dossiers` en 390 px, le bouton « Passer en thème sombre » est **coupé
par le bord droit** : son contour droit n'est pas rendu et son libellé casse sur
quatre lignes. Trois éléments (logo, pastille « Administration », bascule de
thème) ne tiennent pas dans la largeur.

À distinguer du débordement au zoom 200 % déjà consigné au différé : celui-ci se
produit à taille normale, sur un téléphone ordinaire.

---

## Majeurs

### M1 — Les paliers de pente sont indiscernables entre eux

La couleur **est** l'information de technicité sur le profil. Contrastes mesurés
entre paliers adjacents :

| Paire | Thème clair | Thème sombre |
| --- | --- | --- |
| roulant / soutenu | **1,25:1** | 1,80:1 |
| soutenu / raide | **1,24:1** | — |
| raide / très raide | — | **1,36:1** |

Le seuil d'usage pour deux aires adjacentes porteuses d'information est 3:1.
À l'écran, roulant et soutenu — ensemble **76 % de la distance** — forment une
seule masse verte.

`apps/web/src/app/contrastes.test.ts:260-280` vérifie chaque palier **contre le
fond**, jamais les paliers entre eux. D'où un test vert sur un graphe illisible.

La légende en toutes lettres sauve la lecture pour qui la lit ; elle ne sauve pas
le graphe.

### M2 — La lecture du curseur s'affiche sans interaction

Au chargement du profil, le texte « km 0 · 677 m · descente −4,0 % — roulant »
est déjà visible et le trait du curseur est posé à km 0, superposé à l'axe des
altitudes. La story 11.4 garantissait qu'aucun **événement** ne part au montage —
garantie tenue — mais le texte de lecture visible, lui, n'avait jamais été jugé.
Un visiteur lit une valeur active sans avoir rien fait.

Le texte est en outre rendu en chasse fixe, sur deux lignes, et chevauche
visuellement le trait du curseur.

### M3 — Un numéro d'urgence coupé en plein milieu

Sur `/volontaires`, le bouton d'appel du PC de secteur affiche
« PC DÉPART · +213 555 03 » / « 0001 » : le numéro passe à la ligne entre deux
groupes de chiffres. C'est le bouton qu'un bénévole presse quand quelque chose
ne va pas.

### M4 — La bascule de thème domine l'en-tête de toutes les surfaces

Sur chaque écran capturé en 390 px, « Passer en thème sombre » est plus large
que le logo et occupe la moitié à 60 % de l'en-tête. Sur la PWA volontaires,
écran de terrain, c'est l'élément le plus visible avant le contenu. Un libellé
court ou une icône labellisée rendrait la place au contenu.

---

## Mineurs

- **Arrondis incohérents sur la même page** : la fiche dit « Altitude
  221,6–835,7 m », le profil « altitude 222 à 836 m » ; le point de départ est
  « 677,4 m » dans la liste, « 677 m » dans la lecture du curseur, et l'arrivée
  « 676 m » sans décimale.
- **`/volontaires` : le titre « Ton espace mission » est en Inter** alors que
  tous les autres titres de la page (« TA FICHE MISSION ») sont en Barlow
  Condensed capitales. Incohérence entre le H1 et le H2 d'un même écran.
- **Bloc de synchronisation en bleu-sarcelle** (`--az-sync-envoye: #2E6570`).
  C'est un token délibéré, pas un accident, mais il introduit une troisième
  famille de teintes qui n'apparaît nulle part ailleurs sur la surface. Choix à
  confirmer plutôt que défaut.
- **« ✓ envoyés — file : 0 »** : jargon, et commence par une minuscule après
  l'icône. Le brief 10.1 prévoyait « N passages en attente ».
- **Bouton « SCAN RETRAIT » puis « RETRAIT DES DOSSARDS »** : la même
  information deux fois, dans deux tailles, sur le même bouton.
- **« dont 36 femmes »** est le seul sous-libellé de l'accueil en Barlow
  Condensed gras ; il ressemble à une erreur de style plutôt qu'à une précision.
- **L'onglet latéral « Mon trail » chevauche le contenu** : il passe par-dessus
  le rail de chiffres du hero et par-dessus la carte e-dossard.
- **L'adresse e-mail technique du compte est affichée en gras** dans le
  paragraphe d'accueil volontaire.
- **Le profil est encadré de pointillés**, ce qui se lit comme une zone vide ou
  à venir plutôt que comme un contenu livré.
- **Horaires verbeux** sur la fiche mission : « 26 mars 2027 à 06:30 → 26 mars
  2027 à 08:30 » répète la date.

---

## Ce que la revue n'a pas couvert

- Les interactions : aucun clic, aucune saisie, aucun glissé du curseur du
  profil. Les captures sont des états au repos.
- L'application coureurs (`apps/runners`, React Native) : hors de portée d'un
  harnais navigateur. Elle reste non vue.
- Le rendu réel sur un appareil : couleurs, tailles tactiles perçues, lisibilité
  en plein soleil. Un émulateur ne remplace pas un téléphone au bout du bras.
- La bascule « La Moyenne » de la section parcours, et les états d'erreur.

## Suite à donner

1. Trancher B1, qui bloque toute publication de la vitrine.
2. Corriger B2 et B3, puis M1 à M4.
3. Décider si le harnais de captures rejoint `scripts/` pour rejouer cette revue
   à chaque clôture d'épopée. Il embarque un outil d'ouverture de session en
   base : à encadrer avant de le versionner.
