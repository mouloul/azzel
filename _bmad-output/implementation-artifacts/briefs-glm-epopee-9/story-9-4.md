# Story 9.4 — Inscription et checklist refondues

Même projet, même branche `feat/refonte-design-epopees-9-10`, mêmes interdits que les stories
précédentes : aucune commande git en écriture, pas de `_bmad-output/`, pas d'édition manuelle
du CSS généré, aucune dépendance installée, aucun test existant désactivé ni supprimé.
`socle.css` est chargé par `layout.tsx` : tu consommes ses classes sans import.

**État du dépôt** : stories 9.1, 9.2, 9.3 et 9.5 livrées et committées (dernier commit
`a667c61`). Budget de l'accueil : 279 Kio pour 300 ; la commande est `pnpm budget`. Lance-la
avant de me rendre la main. Baseline : **177 fichiers de test, 2425 tests**, zéro échec.

**Leçon des stories précédentes, à appliquer ici** : quand tu ajoutes de la logique, ajoute
les tests dans la même passe. La story 9.5 est revenue sans aucun test pour 455 lignes de
logique neuve, et j'ai dû la renvoyer. Le nombre de tests doit **augmenter** si tu ajoutes
un comportement. L'environnement vitest est `node` sans DOM et l'installation de dépendances
est interdite : teste par rendu serveur, comme le fait `resultats-live.test.tsx`, et dis
honnêtement ce qui n'est couvert que par construction.

## Les écrans

Le parcours de dossier du coureur, dans l'ordre où il le traverse :

- `apps/web/src/app/inscription/` — `page.tsx`, `inscription-form.tsx`
- `apps/web/src/app/acceptations/` — `page.tsx`, `acceptances-form.tsx`
- `apps/web/src/app/preuve/` — `page.tsx`, `preuve-form.tsx`
- la checklist de dossier (trouve-la : `espace-coureur/`)

## Ce que tu livres

1. **Un fil d'étapes** visible sur les trois écrans du parcours, indiquant l'étape courante
   **par la forme et par le texte**, jamais par la couleur seule. Il ne doit pas prétendre
   que l'étape suivante est accessible si elle ne l'est pas.
2. **Les formulaires au gabarit du socle** : champ, étiquette associée, texte d'aide,
   message d'erreur. Chaque champ obligatoire est annoncé en texte, pas seulement par un
   astérisque coloré.
3. **La checklist** : compteur de pièces, action nommée pour chaque pièce manquante, bandeau
   « Dossier validé — dossard prêt » quand tout est vert.
4. **Le dépôt de preuve** : la compression client, le retour visible, le rejet de format
   listant les formats acceptés, le brouillon conservé et le réessai sans re-sélection
   **fonctionnent déjà** — tu ne touches qu'à leur habillage.

## Ce qui est intouchable

Les critères des stories 1.3, 1.4, 1.5 et 1.7 restent dus. Avant de coder, lis les tests de
ces trois dossiers **en entier** et liste-moi ce qu'ils verrouillent. En particulier :

- la clôture J-10 et son message ;
- l'horodatage de la **version** des documents acceptés — décharge et règlement ;
- les formats de preuve refusés avec un message qui liste les formats acceptés ;
- la compression côté client avec sa cible de taille ;
- l'enveloppe d'erreur unique, qui inclut toujours le bouton d'assistance ;
- le registre : **tutoiement** pour le coureur, contrairement à la vitrine publique qui
  vouvoie. Vérifie dans les tests existants lequel s'applique à chaque écran avant de
  réécrire une phrase.

Tu n'as **aucun** test autorisé à réécrire d'office. Si une assertion de structure te bloque,
montre-la-moi avec ta proposition avant de la toucher.

## Contraintes

- Une colonne sur téléphone, le récapitulatif passe sous le formulaire.
- Accessibilité : focus 2 px, cibles ≥ 44 px jamais au bord, écart ≥ 8 px, contraste AA y
  compris sur les textes d'aide gris, erreurs annoncées aux lecteurs d'écran.
- Pas de police, pas d'image, pas de dépendance.

## Boucle de vérification

```
pnpm typecheck
pnpm test
pnpm budget
git diff --stat
```

Zéro échec, et le nombre de tests ne doit pas baisser.

## Ce que tu rends

1. Ce que les tests des stories 1.3 à 1.7 verrouillent, tel que tu l'as lu
2. Le fil d'étapes : comment l'étape courante se lit sans la couleur
3. Ce que tu as changé écran par écran, et ce que tu as laissé
4. La sortie des trois commandes
5. Ce dont tu n'es pas sûr
