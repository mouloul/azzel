# Story 9.1 — Socle de style partagé (implémentation)

Nouvelle session, nouveau sujet : on quitte le sprint planning, on implémente.
Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`. Branche de travail déjà créée et
active : `feat/refonte-design-epopees-9-10`. **Ne change pas de branche.**

Tu es le développeur. Je suis l'architecte et le PO, je valide ton travail à chaque étape.

## Ligne de base à préserver

Avant toute modification, l'état du dépôt est vert et je l'ai vérifié :
`pnpm typecheck` passe sur les trois paquets, `pnpm test` passe — **174 fichiers de test,
2380 tests**. Toute régression sur ces chiffres est un échec de la story.

## Contexte réel, mesuré (ne le redécouvre pas, vérifie-le)

- Les tokens vivent dans `packages/shared/src/tokens.ts` : `siteTokens` (charte publique,
  crème/forêt/ocre) et `operationsTokens` (surfaces terrain, avec les rôles opérationnels
  `succes`, `danger`, `attention`, `sync-attente`, `sync-envoye` et leurs encres, chacun
  ayant un pendant `-sombre`).
- `apps/web/src/app/tokens-synchronises.css` est **généré** par
  `apps/web/scripts/sync-tokens.ts` depuis `apps/web/src/lib/tokens-css.ts`.
  Commande de régénération : `pnpm -F @azzel/web tokens:sync`.
  **Tu ne modifies JAMAIS ce fichier à la main.** Tu modifies `tokens-css.ts` et tu régénères.
- Audit des couleurs littérales dans le CSS écrit à la main (hors fichier généré), au 2026-11-02 :
  - `app/volontaires/scan/scan.css` : **14**
  - `app/espace-coureur/e-dossard/e-dossard.css` : **12**
  - `app/vitrine-textes.css` : **7**
  - tous les autres fichiers, `globals.css` compris : **0**
- Ces 33 littéraux ne sont pas de la négligence : ces écrans sont **toujours sombres**,
  indépendamment du thème choisi par l'utilisateur, alors que les variables `--az-*` exposent
  les valeurs **claires** et ne basculent en sombre que sous `[data-theme='dark']`.
  C'est le trou que cette story bouche.

## Ce que tu livres

### A. Rendre les tokens opérationnels sombres utilisables hors du thème sombre

Dans `apps/web/src/lib/tokens-css.ts`, expose les valeurs sombres des rôles opérationnels
d'une façon utilisable par une surface toujours sombre. Le choix du mécanisme t'appartient —
portée de classe qui redéfinit les `--az-*`, ou jeu de variables distinct — mais :

- il doit fonctionner que le thème global soit clair ou sombre ;
- il ne doit **rien changer** au rendu actuel des surfaces qui basculent avec le thème ;
- régénère ensuite `tokens-synchronises.css` par la commande, jamais à la main ;
- `apps/web/src/lib/tokens-css.test.ts` et `packages/shared/src/tokens.test.ts` doivent
  passer ; complète-les plutôt que de les contourner.

### B. Remplacer les 33 valeurs littérales

Dans les trois fichiers listés, remplace chaque couleur littérale par la variable
correspondante. Les commentaires existants nomment déjà le token visé (`/* succes-sombre */`,
`/* action-sombre */`…) : suis-les. Le rendu doit être **strictement identique** — même
couleur calculée, pas « équivalent approchant ».

Deux cas demandent ton jugement, traite-les explicitement dans ton compte rendu :
- `vitrine-textes.css` ligne 36 : un `linear-gradient` à trois arrêts dont `#122C20` n'est
  pas un token existant. Soit tu le remontes en token, soit tu le justifies en commentaire.
- `e-dossard.css` : les `#FFFFFF` des cartes du QR — le blanc du support du QR code est une
  contrainte de lisibilité du code, pas une couleur de charte. Décide et justifie.

### C. Le socle de classes sémantiques

Crée la couche de primitives partagées que les stories 9.2 à 9.5 et 10.1 à 10.3 consommeront.
Au minimum : action en pilule (variantes pleine et contour), chip, carte, en-tête de surface,
pastille d'état, tableau dense, champ de formulaire avec son étiquette.

Contraintes non négociables :
- chaque classe lit exclusivement des variables issues des tokens, aucune valeur littérale ;
- rayons : pilule pour les actions et les chips, 14 à 20 px pour les cartes ;
- toute cible interactive fait au moins 44 px de haut ;
- focus visible à 2 px, avec un décalage, sur fond clair **comme** sur fond forêt — attention,
  `globals.css` documente déjà que `var(--focus)` ne tient pas le 3:1 sur les fonds forêt :
  lis ce commentaire avant de décider ;
- contraste AA pour tout texte, y compris les petits libellés gris ;
- `prefers-reduced-motion` neutralise les transitions que tu introduis.

Tu **n'appliques ces classes à aucun écran existant** dans cette story. Tu poses la couche,
les stories suivantes l'utilisent. Si tu es tenté de refondre un écran, arrête-toi : ce n'est
pas le périmètre.

### D. Le garde-fou

Ajoute un test qui échoue si une couleur littérale apparaît dans une feuille CSS écrite à la
main. Le fichier généré est exclu. Les littéraux que tu n'as pas pu supprimer (cas B) sont
inscrits dans une liste d'exceptions explicite, avec leur raison, et le test vérifie que leur
nombre **ne peut que décroître**. Place-le là où vivent les tests existants du même genre.

## Interdits absolus

- Aucune commande git en écriture : jamais `add`, `commit`, `checkout`, `stash`, `restore`,
  `clean`, `push`, `branch`. Je m'occupe des commits. `git status` et `git diff` sont permis.
- Tu ne touches pas à `_bmad-output/` : ni `epics.md`, ni `sprint-status.yaml`, ni les specs.
- Tu ne modifies pas `tokens-synchronises.css` à la main.
- Tu ne refonds aucun écran. Aucun fichier `.tsx` ne devrait avoir besoin d'être modifié ;
  si tu penses le contraire, explique pourquoi **avant** de le faire.
- Tu ne désactives, ne supprimes ni ne marques `skip` aucun test existant. Si un test casse,
  c'est ton code qui est en cause jusqu'à preuve du contraire.
- Tu n'installes aucune dépendance.

## Ta boucle de vérification, avant de me rendre la main

```
pnpm -F @azzel/web tokens:sync
pnpm typecheck
pnpm test
git diff --stat
```

`pnpm test` doit afficher **au moins 2380 tests passés** et zéro échec.

## Ce que tu rends

1. Le mécanisme retenu en A, et pourquoi
2. Le tableau des 33 remplacements : fichier, ligne, littéral, variable retenue
3. Tes décisions sur les deux cas de jugement du point B
4. La liste des classes du socle, avec pour chacune la variable de focus et de contraste retenue
5. Le test du point D : où il vit, ce qu'il vérifie, ce que contient la liste d'exceptions
6. La sortie des quatre commandes de vérification
7. Ce dont tu n'es pas sûr — je préfère une question à une invention
