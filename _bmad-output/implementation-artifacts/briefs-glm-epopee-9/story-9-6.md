# Story 9.6 — Non-régression de la vitrine refondue

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/refonte-design-epopees-9-10`.
Tu es le développeur, je suis l'architecte. Interdits habituels : aucune commande git en
écriture, pas de modification de `_bmad-output/planning-artifacts/` ni de `sprint-status.yaml`
ni de `deferred-work.md`, aucune dépendance installée, aucun test existant désactivé, supprimé
ou affaibli.

## Contexte

Les stories 9.1 à 9.5 sont livrées et committées (dernier commit `e1ddc56`). Baseline :
**182 fichiers de test, 2467 tests**, `pnpm budget` à **279 Kio pour 300**. Cette story est
une story de **vérification**, pas de refonte : tu **mesures** ce qui a été refondu et tu
dis ce que tu as mesuré.

## Règle d'honnêteté, la plus importante de ce brief

Pour chaque garantie ci-dessous, tu me dis dans laquelle de ces trois catégories elle tombe :
**mesurée** (tu as exécuté quelque chose et tu cites le chiffre), **couverte par un test**
(tu cites le test), ou **non vérifiable ici** (et tu dis pourquoi). Tu ne déclares jamais
« conforme » une garantie que tu n'as pas pu mesurer. Un trou annoncé est utile ; un trou
caché est un défaut que je découvre le 26 mars.

## Partie A — Mesures sur les écrans refondus

Écrans publics accessibles sans session : `/` (accueil, avec la section parcours), `/resultats`
(état vide, c'est ce que le serveur de build sert sans données), `/parcours`, `/region`,
`/connexion`. Les écrans qui exigent une session (`/inscription`, `/acceptations`, `/preuve`,
`/espace-coureur`) ne sont pas atteignables sans base : pour eux, mesure ce que le **rendu
serveur** permet (balisage, classes, CSS servi) et déclare le reste non vérifiable.

Pour chaque écran atteignable, mesure avec Chrome headless piloté en CDP (tu as déjà un
harnais de ce type : réutilise la même approche, **hors du dépôt**, zéro dépendance ajoutée) :

1. **Poids** : octets transférés du premier chargement. L'accueil doit rester sous 300 Ko —
   c'est `pnpm budget`. Pour les autres écrans, donne le poids sans exiger de seuil.
2. **Focus visible** : pour chaque élément interactif, le contour au focus fait au moins 2 px.
   Liste les éléments qui ne le font pas.
3. **Cibles tactiles** : hauteur et largeur calculées de chaque élément interactif, à 390 px
   de large. Liste ceux sous 44 px, et ceux à moins de 8 px d'un voisin interactif.
4. **Contraste AA** : pour les textes, calcule le ratio entre couleur calculée du texte et
   fond effectif, dans le thème clair **et** le thème sombre. Seuil 4,5:1, ou 3:1 pour le
   grand texte (≥ 24 px, ou ≥ 18,66 px en gras). **Un ratio de 4,3:1 est un échec, pas un
   arrondi.** Signale tout texte posé sur une photo : le fond effectif y est un calcul, pas
   une valeur — dis comment tu l'as estimé.
5. **Zoom 200 %** : à 390 px de large avec un facteur de zoom de 2, y a-t-il un défilement
   horizontal de la page ? Du contenu coupé ?
6. **`prefers-reduced-motion`** : émule la préférence et liste toute transition ou animation
   encore active sur les éléments introduits par les stories 9.1 à 9.5.
7. **Défilement horizontal** à 360 px : aucun, sauf dans les zones prévues (le tableau de
   résultats a sa propre zone).

Un serveur de production est nécessaire (`pnpm build` puis `next start` sur un port libre).
**Tu le tues à la fin** — vérifie avec `lsof -ti :<port>` qu'il ne reste rien.

## Partie B — Réaligner les scénarios de recette

Trois documents décrivent des écrans que la refonte a changés :

- `_bmad-output/implementation-artifacts/scenarios-recette-epic-2.md` (accueil, section
  parcours) — **exigé par la story**
- `_bmad-output/implementation-artifacts/scenarios-recette-epic-1.md` (inscription,
  acceptations, preuve, checklist — story 9.4)
- `_bmad-output/implementation-artifacts/scenarios-recette-epic-7.md` (résultats — story 9.5)

Pour chacun : lis-le en entier, lis les écrans tels qu'ils sont **maintenant**, et :

- **corrige** chaque pas qui désigne un élément disparu ou renommé (« bandeau de date »,
  « badge », « Section Bilan »…) — **ne supprime jamais un pas**, corrige-le ;
- **ajoute** des pas pour ce qui est neuf et visible par un testeur : la section parcours et
  son sélecteur d'épreuve (sans JavaScript), le rail de chiffres du hero, le fil d'étapes,
  les filtres et le podium des résultats ;
- ne change pas le périmètre ni la date d'en-tête des modules que tu ne touches pas ;
- écris pour un testeur humain sans connaissance du code, avec résultat attendu par étape,
  dans le format des pas existants (tableau `#`, `Action`, `Résultat attendu`).

Rappelle-toi la règle du projet : aucun chiffre de parcours inventé. Le rail du hero n'affiche
que la date, les épreuves, le départ et le cadre ; la section parcours n'affiche ni dénivelé
ni altitude tant que la donnée n'existe pas. Tes pas de recette doivent décrire **ça**, pas
la maquette.

## Défauts que tu trouves

Si la mesure révèle un défaut introduit par les stories 9.1 à 9.5 :
- **corrige-le toi-même** seulement s'il tient en quelques lignes de CSS ou de balisage, est
  sans ambiguïté, et si tu peux ajouter un test qui l'aurait attrapé ;
- sinon **ne le corrige pas** : décris-le précisément (écran, élément, valeur mesurée, valeur
  attendue) pour que je le range dans le travail différé.

## Vérification

```
pnpm typecheck
pnpm test
pnpm budget
```

Zéro échec. Le nombre de tests ne doit pas baisser.

## Ce que tu rends

1. Un tableau écran × mesure (poids, focus, cibles, contraste clair/sombre, zoom 200 %,
   reduced-motion, défilement horizontal), chaque cellule portant **mesuré**, **test** ou
   **non vérifiable** avec le chiffre ou la raison
2. La liste des défauts trouvés : corrigés (avec le test) et non corrigés (avec la mesure)
3. Pour chaque document de recette : combien de pas corrigés, combien ajoutés, lesquels
4. La confirmation que le serveur de build est tué
5. La sortie des trois commandes
