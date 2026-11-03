# Story 10.3 — Back-office refondu

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-10-3-back-office`
(tip = commit `5677393`, story 10.2). Tu es le développeur, je suis l'architecte. Interdits :
aucune commande git en écriture, pas de modification de `_bmad-output/planning-artifacts/`,
`sprint-status.yaml`, `deferred-work.md`, aucune dépendance installée, aucun test existant
désactivé/supprimé/affaibli. Lis d'abord `epics.md` « Story 10.3 » et l'artboard `AdminDossiers`
de `maquettes-refonte-design-2026-11-02.md`.

Baseline : 186 fichiers de test, 2496 tests, typecheck vert, `pnpm budget` 279 Kio.

## Constat mesuré de l'architecte — à vérifier, pas à croire

1. **« Six feuilles CSS admin à faire converger »** : les feuilles résiduelles font en tout
   206 lignes (`admin.css` 39, `course.css` 93, `missions.css` 23, `contenus.css` 11,
   `retour-images.css` 11, `sponsors.css` 8, `volontaires.css` 21) et ne contiennent aucune
   couleur en dur. Le vrai état : les écrans admin utilisent les classes **globales** de
   `globals.css` (`.btn-action`, `.btn-contour`, `.card`, `.table-dossiers`, `.table-wrap`,
   `.chip-meta`, `.field`…) et **aucune** classe `.socle-*`. Le travail réel est de faire adopter
   le socle de la 9.1 (`socle.css` : `.socle-table`, `.socle-pastille--*`, `.socle-action`,
   `.socle-chip`, `.socle-carte`, `.socle-champ`) là où c'est réellement équivalent, et de
   supprimer le CSS devenu mort. Tu ne touches PAS aux classes globales partagées avec d'autres
   surfaces (`.btn-action`, `.card`, `.field`… sont utilisées ailleurs) : tu fais changer le
   *markup admin*, pas la définition globale.
2. **Tableaux** : il n'y a que deux `<table>` — `dossiers/page.tsx` (déjà `th scope="col"`,
   `.table-wrap` + `.table-dossiers`) et `volontaires/volontaires-manager.tsx`
   (`.volontaires-table`). Applique un gabarit commun `.socle-table` : en-têtes associés,
   badges de statut en forme **et** en texte (`.socle-pastille--*`, jamais la couleur seule),
   dossards et heures en monospace alignés à droite, séparateurs discrets, conteneur à
   défilement horizontal en écran étroit (sans que la page déborde).
3. **Compteurs de tête de page** (validés, à contrôler, acceptations manquantes, dossards
   attribués) : vérifie s'ils existent. S'ils n'existent pas, ajoute-les **uniquement** à
   partir des données déjà chargées par la page (aucune nouvelle requête, aucun nouveau
   module), lisibles sans survol, chacun renvoyant au filtre correspondant **si un filtre
   existe** (sinon dis-le et ne crée pas de filtre : un compteur non cliquable est préférable
   à un lien mort). Les libellés doivent refléter exactement ce qui est compté.
4. **Tableau de bord live** (`course/course-live.tsx`, `course.css`) : la mise à jour est déjà
   par `setState` ciblé sans animation, fraîcheur en pied, alerte hors-délais à clignotement
   `1s steps(2)` avec reduced-motion neutralisé. Vérifie, cite fichier:ligne, et verrouille
   par test ce qui ne l'est pas déjà (texte intégral de l'alerte, période ≥ 1 s, actions
   « Appeler le secteur » et « Saisir l'abandon »). Ne réécris pas ce qui est conforme.
   `course.css` : `border-radius: var(--az-radius-sm)` etc. → aligne sur le vocabulaire du
   socle (cartes 14–20 px) seulement si cela ne change pas la lisibilité de l'alerte.
5. **Densité** : jamais sous le plancher de lisibilité (corps ≥ 15 px, cibles ≥ 44 px, écart
   ≥ 8 px). La densité s'obtient par l'espacement.

## Contraintes dures

- Tests existants verts avec leur intention (`missions-manager.test.tsx`, tests de routes
  admin, `course-live.test.tsx`, `dossiers/page.test.tsx`…) : seuls des sélecteurs/classes de
  markup peuvent être réalignés ; liste chacun.
- `css-sans-litteraux.test.ts` : le décompte ne fait que décroître.
- Aucune logique métier, aucune route, aucune requête modifiée.
- `pnpm typecheck` (3 paquets), `pnpm test`, `pnpm budget` ≤ 300 Kio verts.
- Pas de chinois. Pas de commit.

## Livrables

Rapport final honnête : pour chaque critère d'acceptation, *mesuré* / *couvert par test (nom)* /
*non vérifiable ici (pourquoi)* (le rendu visuel admin n'est pas vérifiable sans base ni
session : dis-le). Liste fichiers modifiés, sélecteurs réalignés, ce que tu laisses tel quel
et pourquoi, nombres de tests.

## Méthode (relance)

Une première tentative a passé trop de temps en lecture sans rien écrire. Lis uniquement les
fichiers de `apps/web/src/app/admin/` et `socle.css`, puis procède **dans cet ordre, en
écrivant après chaque étape** : (1) les deux tableaux, (2) compteurs, (3) tests de verrouillage
du tableau live, (4) CSS mort. Lance `pnpm typecheck` et les tests du dossier admin après
chaque étape, pas seulement à la fin.
