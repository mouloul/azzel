# Story 9.5 — Résultats refondus

Même projet, même branche `feat/refonte-design-epopees-9-10`, mêmes interdits que les stories
précédentes : aucune commande git en écriture, pas de `_bmad-output/`, pas d'édition manuelle
du CSS généré, aucune dépendance installée, aucun test existant désactivé ni supprimé.
Les stories 9.1, 9.2 et 9.3 sont livrées et committées (dernier commit `5ce31fb`). `socle.css`
est chargé par `layout.tsx` : tu consommes ses classes sans import.

**État du budget** : l'accueil est à 279 Kio pour 300, après retrait du préchargement de
Barlow 700. La commande est `pnpm budget`. Ta page a son propre chemin, mais lance-la avant
de me rendre la main : je veux voir qu'elle passe.

**Outil** : utilise exactement les commandes de vérification listées plus bas. N'ouvre pas
de serveur de développement et ne lance rien en arrière-plan sans le tuer ensuite.

## L'écran

`apps/web/src/app/resultats/` — page, composants live, `resultats.css`. C'est une page
**publique et live** : elle se met à jour pendant la course.

## Ce que tu refonds

- La barre de recherche et les filtres (épreuve, catégorie) : visibles sans défilement sur
  téléphone, vrais contrôles étiquetés, au gabarit du socle.
- Le tableau de classement : gabarit dense du socle, en-têtes de colonnes associés, places et
  temps en chiffres monospace alignés, conteneur à défilement horizontal propre en écran
  étroit plutôt qu'un tableau qui déborde.
- La mise en avant des premiers : la maquette propose des cartes de podium. **Ne les ajoute
  que si les données le permettent sans calcul nouveau** — si cela demande de dériver un
  classement côté vue, abstiens-toi et dis-le.
- L'état vide et l'état dégradé : au vocabulaire du socle, sans changer leurs textes.

## Ce qui est intouchable, et que des tests protègent

Lis `apps/web/src/app/resultats/page.test.tsx` **en entier** avant de coder. En particulier :

- `force-dynamic` : jamais de cache sur une page live ;
- `noindex` et les métadonnées Open Graph ;
- « Classement provisoire » **en toutes lettres**, classements par épreuve, derniers arrivés,
  témoin live ;
- registre **vouvoyé** : aucun tutoiement dans la page publique ;
- l'état vide avec heure configurée, au verbatim exact : « Pas encore de partants — départ à
  --:-- », sans flash serveur ;
- l'état vide sans heure : texte neutre, **jamais** un départ à 00:00 ;
- base indisponible : page dégradée avec message et assistance, jamais d'erreur brute ;
- le comptage des partages : `?partage=1` compte une visite par chargement, trois chargements
  comptent trois fois, aucun autre paramètre ne compte, un comptage en échec ne change rien
  au rendu.

Si l'un de ces tests casse, c'est ton code. Tu n'as **aucun** test autorisé à réécrire dans
cette story : la mise en page des résultats n'est pas décrite par des assertions de structure
comme l'était le hero. Si tu en trouves une qui te bloque, montre-la-moi avant de la toucher.

## Contraintes

- La fraîcheur des données reste affichée, le rafraîchissement ne provoque pas de clignotement
  complet de la page.
- Budget : la marge est de 0,3 Kio sur l'accueil ; cette page a son propre chemin, mais tu
  n'ajoutes ni police, ni image, ni dépendance.
- Accessibilité : focus 2 px, cibles ≥ 44 px, contraste AA, tableau annoncé correctement aux
  lecteurs d'écran, `prefers-reduced-motion` neutralise les transitions ajoutées.

## Boucle de vérification

```
pnpm typecheck
pnpm test
pnpm budget
git diff --stat
```

Zéro échec, et le nombre de tests ne doit pas baisser.

## Ce que tu rends

1. Ce que tu as refondu, écran par état (liste pleine, état vide, état dégradé)
2. Ta décision sur les cartes de podium, et pourquoi
3. Comment le tableau se comporte en écran étroit
4. La sortie des trois commandes
5. Ce dont tu n'es pas sûr
