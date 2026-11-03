# Story 9.5 — tests manquants sur la logique neuve de la page résultats

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/refonte-design-epopees-9-10`.
Tu es le développeur, je suis l'architecte. Interdits habituels : aucune commande git en
écriture, pas de `_bmad-output/`, aucune dépendance installée, aucun test existant désactivé,
supprimé ou affaibli.

## État

La refonte de la page `apps/web/src/app/resultats/` est écrite, **non committée**, et acceptée
sur le fond : `pnpm typecheck` vert, 2411 tests verts, `pnpm budget` OK (279 Kio). Ne la
réécris pas.

## Le problème

Tu as ajouté environ 455 lignes à `apps/web/src/app/resultats/resultats-live.tsx` — recherche
par dossard, filtres d'épreuve et de catégorie, podium, repli des filtres — et **aucun test**.
Le total est resté à 2411. C'est une page publique et live : la logique de filtrage et de
podium ne peut pas rester sans filet.

## Ce que tu écris

Dans `apps/web/src/app/resultats/`, ajoute des tests (le fichier existant
`resultats-live.test.tsx` est le modèle de style ; étends-le ou crée un fichier voisin, à ton
choix) qui vérifient **chacune** de ces garanties, au niveau où ton code les porte :

1. Le filtre par dossard ne retient que les lignes dont le dossard correspond, et s'applique
   aussi à « Derniers arrivés ».
2. Le filtre d'épreuve et le filtre de catégorie fonctionnent seuls et combinés.
3. **Le podium est masqué dès qu'un filtre est actif**, et visible sans filtre. Teste les deux
   sens.
4. Le podium reprend les lignes **déjà classées** : avec des ex æquo servis (rangs 1, 1, 3),
   deux cartes « 1ᵉʳ » apparaissent et aucun classement n'est recalculé côté vue.
5. Une valeur de filtre devenue étrangère aux données — une épreuve qui disparaît au polling
   suivant — retombe sur « Toutes » sans erreur.
6. **Un rafraîchissement ne vide pas la recherche en cours** : l'état des filtres est
   indépendant du polling. C'est la garantie la plus importante, c'est elle qui empêche une
   page live de réinitialiser la saisie d'un visiteur toutes les quelques secondes.
7. Le bouton « Effacer les filtres » n'apparaît que lorsqu'un filtre est actif, et les remet
   tous à zéro.
8. Aucun nom de coureur n'est jamais rendu : la page n'expose que des dossards (NFR-7).
   Fais-en une assertion explicite sur le HTML rendu.
9. L'état vide ne propose pas de formulaire de filtre quand il n'y a aucun partant.

Si l'une de ces garanties n'est **pas** vraie dans ton code, ne bricole pas le test pour qu'il
passe : écris-le correct, constate qu'il échoue, et dis-le-moi. Un bug trouvé ici vaut mieux
qu'une page live fausse le jour J.

Le cas que tu as signalé toi-même — un filtre qui ne matche que des dossards d'une épreuve sans
heure configurée affiche « Aucun dossard ne correspond » dans les classements alors que le
dossard apparaît dans « Derniers arrivés » — écris-le comme **test de caractérisation** qui
documente le comportement actuel, avec un commentaire qui dit que c'est un comportement
connu à arbitrer, pas une garantie voulue.

## Vérification

```
pnpm typecheck
pnpm test
pnpm budget
```

Le nombre de tests doit **augmenter** : dis-moi de combien et lesquels.

## Ce que tu rends

1. La liste des tests ajoutés, un par garantie ci-dessus
2. Les garanties qui se sont révélées fausses, s'il y en a — avec le comportement observé
3. La sortie des trois commandes
