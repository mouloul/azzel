# Story 9.2 — Accueil refondu

Même projet, même branche `feat/refonte-design-epopees-9-10`, mêmes interdits que la story 9.1
(aucune commande git en écriture, pas de `_bmad-output/`, pas d'édition manuelle du CSS généré,
aucune dépendance installée, aucun test désactivé). La story 9.1 est livrée et committée : le
socle de classes sémantiques existe, tu le consommes ici — tu ne le réinventes pas.

## L'écran

`apps/web/src/app/page.tsx` (accueil vitrine, rendu serveur en cache 60 s) et les sections de
`globals.css` qui le servent. Référence visuelle : l'artboard `Main` décrit dans
`_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md`.

## Décision d'architecture que je prends, et que tu appliques

La maquette remplace la photo du hero par un dégradé. **On ne fait pas ça.** La photo de la
ligne de départ 2026 est l'élément LCP de la page, elle est déjà optimisée (eager,
`fetchpriority=high`, art direction `<picture>` avec la variante 1280 réservée aux écrans
≥ 700 px) et c'est elle qui donne le trail. On garde la photo. Ce qui change :

- le voile au-dessus de la photo, pour porter la nouvelle échelle typographique ;
- la composition : titre condensé beaucoup plus grand, nom de l'événement en accent ocre,
  et un **rail de chiffres clés** (épreuves, D+ maximal, plage d'altitude, places) posé en
  grille cloisonnée, là où la maquette le met à droite du titre ;
- le bandeau de date et le badge des épreuves, qui se fondent dans ce rail.

Si tu penses que la photo et le rail ne cohabitent pas sur un écran de téléphone, dis-le-moi
avec ta proposition **avant** de coder autre chose que ce qui est écrit ici.

## Ce que tu livres

1. **Le hero refondu** — photo conservée, voile retravaillé, titre condensé à très grande
   échelle dégressive jusqu'au mobile, accent ocre sur « Aït Aïssi », rail de chiffres clés,
   les deux actions (S'inscrire, Appeler l'équipe) en pilules du socle 9.1.
2. **La bande bilan** — les chiffres de 2026 passent d'une grille de cartes pleine hauteur à
   une bande horizontale compacte sur fond forêt. Les valeurs ne changent pas.
3. **Les cartes piliers et la section épreuves** — reprise des primitives du socle (carte,
   chip), rayons et pilules harmonisés.
4. **La section contact** — mise au même vocabulaire.

## Ce qui ne doit pas bouger, et que des tests protègent déjà

`apps/web/src/app/page.test.tsx` contient 26 tests. Lis-le **en entier avant de coder**.

Tests dont l'**intention est intouchable** — si l'un d'eux casse, c'est ton code qui est en
cause, pas le test :
- le bandeau d'égide, texte exact en capitales espacées ;
- les chiffres officiels 2026 exacts, jamais additionnés ni inventés (279 / 222 / 214 / 116,
  « dont 36 femmes ») ;
- les deux épreuves : « Trail long — 35 km » et « Trail moyen — 12 km » ;
- les liens texte vers `/parcours` et `/region` ;
- le CTA S'inscrire pointant sur `/connexion?parcours=inscription` ;
- le bouton « Appeler l'équipe » en `tel:`, présent dans le hero **et** dans la section contact ;
- la photo du hero : eager, `fetchpriority=high`, dimensions alignées sur la variante 640,
  art direction `<picture>` sans `srcset` mobile ;
- les photos de section : lazy, `fetchpriority=low`, alts descriptifs ;
- les quatre glyphes de piliers : SVG inline, monochromes `currentColor`, trait sans
  remplissage, 20–24 px ;
- la frise en tête et en pied, `aria-hidden` ;
- les interdits : aucun « à confirmer », aucun objectif 2027 chiffré, aucun « Tafsut »,
  médaillon, mascotte ni drapeau ;
- le mode de rendu : cache court, la section partenaires relue sans rendre la page dynamique.

Tests que tu **as le droit de réécrire**, parce qu'ils décrivent la mise en page que l'on
remplace — et uniquement ceux-là :
- « structure : section plein écran, titre centré, crête, bandeau date, actions, badge épreuves »
- « CSS : hero à hauteur d'écran moins l'égide, contenu centré »
- « CSS : en-tête superposé à la photo sans JS (logo négatif, texte clair) »
- « crête : ligne ocre 1,5 px sous le titre du hero »

Pour chacun de ces quatre, tu écris le test **de la nouvelle structure**, avec la même
exigence que l'ancien. Tu ne supprimes pas un test sans le remplacer. Dans ton compte rendu,
tu montres l'ancien et le nouveau côte à côte et tu dis ce que le nouveau garantit.

La crête ocre est un élément d'identité (`<Crete />`, story 2.2) : si tu la déplaces ou la
redimensionnes, dis-le et justifie. Si tu la supprimes, c'est non.

## Les contraintes chiffrées

- Budget : le premier chargement de l'accueil reste **sous 300 Ko**, premier rendu lisible
  sous 5 s en 3G lent. Tu n'ajoutes **aucune** police, **aucune** image, **aucune**
  dépendance JavaScript. Les formes décoratives sont du SVG inline.
- Accessibilité : focus visible 2 px, cibles ≥ 44 px jamais au bord de l'écran, écart ≥ 8 px
  entre deux cibles, contraste AA sur tout texte y compris sur la photo voilée — le voile doit
  garantir le ratio, mesure-le, ne l'estime pas.
- `prefers-reduced-motion` neutralise les transitions que tu ajoutes.
- Mobile : le titre descend par paliers sans débordement horizontal, le rail de chiffres passe
  sous le titre au lieu de le comprimer.

## Ta boucle de vérification

```
pnpm typecheck
pnpm test
git diff --stat
```

`pnpm test` doit afficher **zéro échec**. Le nombre total de tests peut varier si tu réécris
les quatre tests autorisés : dis-moi le delta et à quoi il correspond.

## Ce que tu rends

1. La composition retenue pour le hero, et comment photo et rail cohabitent sur téléphone
2. Les quatre tests réécrits : ancien contre nouveau, et ce que le nouveau garantit
3. Le ratio de contraste mesuré du titre et du rail sur la photo voilée
4. Ce que tu as fait de la crête
5. La sortie des trois commandes
6. Ce dont tu n'es pas sûr
