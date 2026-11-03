# Budget de l'accueil — dépassement à résorber

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/refonte-design-epopees-9-10`.
Tu es le développeur, je suis l'architecte.

**État du dépôt** : la story 9.3 (section parcours sur l'accueil) vient d'être écrite et est
**non committée** dans l'arbre de travail — `apps/web/src/components/section-parcours.tsx`,
`section-parcours.test.tsx`, `apps/web/src/modules/contenus/section-parcours.ts`, plus des
modifications de `page.tsx`, `page.test.tsx` et `globals.css`. Ne la défais pas, ne la
réécris pas : elle est acceptée sur le fond, `pnpm typecheck` et `pnpm test` sont verts
(177 fichiers, 2411 tests).

Un seul problème reste, et c'est ta mission : **la commande de budget échoue**.

Reste le dépassement : **308 526 octets contre 307 200 — 1 326 octets de trop**. Tu as eu
raison de me le remonter au lieu de dégrader ta section. Voici mon arbitrage.

## Ce que je ne veux pas

- Relever le plafond. NFR-2 est une promesse faite à un coureur en 3G, pas une variable
  d'ajustement.
- Dégrader la coquille parcours pour grappiller 400 octets.
- Toucher à la photo du hero : c'est l'élément LCP, déjà optimisé.

## Ce que je veux que tu étudies, dans cet ordre

### Piste 1 — le préchargement de Barlow Condensed 700

`layout.tsx` précharge trois polices : Barlow 700 (22 444 o), Barlow 800 (22 464 o),
Inter 400 (23 664 o). Soit 68 572 octets, 22 % du budget.

Les trois servent au-dessus de la ligne de flottaison — titre du hero en 800, libellés de
boutons en 700, texte courant en Inter 400. Mais **précharger** et **charger** sont deux
choses différentes : retirer un `<link rel="preload">` ne retire pas la police, il la sort du
chemin critique mesuré. Et `tokens-synchronises.css` définit déjà des polices de repli
métriquement calibrées — `Barlow Condensed Fallback` sur Arial Narrow, avec
`ascent-override`, `descent-override` et `size-adjust` — précisément pour que la substitution
ne décale pas la mise en page.

Question à trancher, mesures à l'appui :
1. Quelle surface de texte au-dessus de la ligne de flottaison est réellement en Barlow 700
   sur l'accueil ? Liste les éléments.
2. Si on retire **le seul préchargement de Barlow 700** (en gardant son `@font-face`), quel
   est l'effet mesuré sur le budget, et quel est le décalage de mise en page réel pendant la
   substitution, compte tenu du repli calibré ?
3. Même question pour Inter 400, à titre de comparaison.

Si le décalage est nul ou imperceptible, retire ce préchargement. Si tu mesures un décalage
visible, **ne le fais pas** et passe à la piste 2.

### Piste 2 — le sous-ensemble de caractères

Barlow Condensed ne sert qu'à du texte d'affichage, très majoritairement en capitales.
Un sous-ensemble limité aux caractères réellement utilisés couperait ces fichiers de moitié.
C'est un changement d'actif, plus lourd : **tu ne le fais pas cette nuit**. Tu me dis
seulement ce qu'il rapporterait, estimé sur le jeu de caractères réellement employé, pour
que je puisse l'inscrire au travail différé.

### Piste 3 — ta section

Si et seulement si les pistes 1 et 2 ne suffisent pas, dis-le-moi et nous arbitrerons
ensemble. Ne dégrade rien de ta propre initiative.

## Règle de sortie

La commande de budget doit passer. Si elle ne passe pas, tu ne me dis pas « c'est presque
bon » : tu me donnes le chiffre et la raison.

## Interdits

Inchangés : aucune commande git en écriture, pas de `_bmad-output/`, pas d'édition manuelle
du CSS généré, aucune dépendance, aucun test désactivé ou supprimé. Tu ne touches pas à la
photo du hero ni à ses variantes.

## Ce que tu rends

1. Les éléments en Barlow 700 au-dessus de la ligne de flottaison
2. L'effet mesuré du retrait de préchargement, et le décalage de mise en page observé
3. Le gain estimé d'un sous-ensemble de caractères, pour le travail différé
4. La sortie de `pnpm typecheck`, `pnpm test`, et de la commande de budget
5. Ce que tu as finalement changé, et ce que tu as laissé
