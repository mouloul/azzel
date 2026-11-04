# Corrections issues de la revue de l'épopée 9

Projet `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `fix/revue-epopee-9` (tip `0596289`).
Tu es développeur, je suis l'architecte/PO. Lis `_bmad-output/implementation-artifacts/revue-epopee-9.md`
(ta propre revue, que j'ai triée). **Pas de point de contrôle bmad** : modifications directes, puis
rapport. Interdits : aucune commande git en écriture, pas de modification de
`_bmad-output/planning-artifacts/` ni de `sprint-status.yaml` ni de `deferred-work.md`, aucune
dépendance, aucun test existant affaibli (un test qui épinglait un défaut peut être réaligné, en le
justifiant). Postgres de dev doit rester allumé. Une autre session (revue de l'épopée 10) lit le dépôt
en lecture seule en parallèle : ne touche à AUCUN fichier de `apps/runners`, `apps/web/src/app/volontaires`,
`apps/web/src/app/admin`, `apps/web/src/lib/scan`.

## À corriger (décisions de l'architecte)

- **I2** : étends `css-sans-litteraux.test.ts` aux notations fonctionnelles de couleur littérale
  (`rgb(`, `rgba(`, `hsl(`, `hsla(` dont l'argument n'est pas un `var(...)`), avec le même mécanisme
  d'exceptions épinglées et de décompte qui ne peut que décroître. Pour les `rgba()` actuels : convertis
  en `color-mix(in srgb, var(--token) N%, transparent)` ceux qui ont un token équivalent exact
  (rendu identique, vérifie la valeur) ; ceux qui n'en ont pas (voile du hero, voiles du scan) sont
  épinglés en exceptions **avec la raison**, sans changer le rendu. N'y touche pas dans `scan.css`
  (hors périmètre, session parallèle) : épingle-les seulement.
- **I4** : retire de `globals.css` les déclarations `.checklist-*` entièrement redéfinies par
  `dossier.css` (garde seulement ce dont `dossier.css` ne se passe pas). Vérifie par test que
  `dossier.css` porte tout ce qui reste nécessaire et que rien ne dépend plus de l'ordre d'import.
- **I5(b)** : `categoriesPresentes` ne doit proposer que des catégories présentes dans une épreuve
  **configurée** (sinon option sans effet). Test. **I5(a)** : ne change pas le comportement, mais
  remplace la mention « à arbitrer » du test de caractérisation par la décision : « comportement
  conservé : une épreuve sans heure de départ n'expose rien au classement ; le message de recherche
  vide s'applique à la liste filtrée » (ajoute-le au test, sans le rendre faux).
- **I6** : porte les cartes ajoutées par la 9.5 (`.resultats-aucun`, `.resultats-podium-carte`) au
  rayon de carte du socle (token 16 px de la 9.1, `--az-rayon-md` ou équivalent). Ne touche pas aux
  autres surfaces publiques à 6 px (`.aa-btn`, `.carte-course`, `vitrine-textes.css`) : je consigne
  le reste. Test d'épinglage des rayons si un existe, à réaligner.
- **I3** : vérifie que `getSectionParcours()` est maintenant exécutée par un test avec store
  stubbé (la 11.1 a ajouté `section-parcours-fusion.test.ts`). S'il manque les cas : blocs sans épreuve
  filtrés, ordre `PARCOURS_SLUGS`, dégradation `DbUnavailableError` → `SECTION_PARCOURS_VIDE`, ajoute-les.
- **M1** supprime le CSS mort `.aa-stat*`. **M2** donne `href: '/acceptations'` à l'étape Documents
  quand elle est `fait` (test de rendu). **M3** raccourcis l'aide du champ de la preuve pour ne plus
  répéter le plafond (garde les formats). **M4** `/resultats` : retire les non-chiffres dans le
  `onChange` du champ (champ contrôlé, test de la fonction pure). **M5** réécris le commentaire périmé
  de `layout.tsx` : le retrait du preload ne retire aucun octet de la page, il sort la police du
  décompte du script et débloque le premier rendu (cite la spec 9.6). **M6** corrige le commentaire
  `--cloison` (seul le rail du hero l'utilise). **M7** retire la classe fantôme
  `aa-parcours-accueil__bascule`. **M8** supprime la redondance `derniersAAfficher` et le cast
  `as never` (typage correct). **M9** remplace `not.toContain('*')` par une assertion ciblée sur les labels.

## Rédaction demandée (I8)

Écris `_bmad-output/implementation-artifacts/scenarios-recette-epic-9.md` selon la règle de
`AGENTS.md` (gabarit : `scenarios-recette-epic-1.md`) : prérequis d'environnement en tête (commandes
exactes dev-db.sh, dev-mail.sh, db:migrate, variables), **un module par story 9.1 à 9.6** (préconditions,
étapes numérotées concrètes `#`/`Action`/`Résultat attendu` pour un testeur humain sans connaissance du
code, cases à cocher), tableau de synthèse final. Décris ce qui existe vraiment (rail du hero = date,
épreuves, départ, cadre ; section parcours = D+ et profil pour la longue seulement, mention « tracé
provisoire », moyenne sans chiffre ; sélecteur d'épreuve sans JS ; recherche par dossard uniquement).
Ne recopie pas les recettes réalignées 1/2/7 : renvoie-y.

## Exigences

`pnpm typecheck` (3 paquets), `pnpm test`, `pnpm budget` ≤ 300 Kio verts : donne les nombres avant/après.
Pas de chinois. Pas de commit. Rapport final honnête : pour chaque point, *corrigé + test (nom)* /
*non fait (pourquoi)*.
