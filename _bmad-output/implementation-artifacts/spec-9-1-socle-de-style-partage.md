---
title: 'Story 9.1 — Socle de style partagé'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9115cb9'
final_commit: '7d499de'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Cette story a été implémentée à partir d'un brief de travail, sans spec écrite au préalable, contrairement aux stories 1 à 8. Ce document consigne l'intention, les décisions et les mesures **telles que committées** ; il ne prétend pas avoir précédé le code. Le brief d'origine est conservé dans `briefs-glm-epopee-9/`. **Aucune revue de code `bmad-code-review` n'a été passée** : voir le journal de revue.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** les écrans toujours sombres — scanner plein écran, e-dossard — ne pouvaient pas lire les tokens opérationnels. Les variables `--az-*` exposent les valeurs claires et ne basculent en sombre que sous `[data-theme="dark"]`. Trois feuilles écrites à la main portaient donc 33 couleurs littérales : `volontaires/scan/scan.css` (14), `espace-coureur/e-dossard/e-dossard.css` (12), `vitrine-textes.css` (7). La rédaction initiale de la story supposait que quatorze feuilles redéfinissaient chacune leurs valeurs : c'était faux, `globals.css`, l'admin, volontaires et résultats n'avaient aucune couleur en dur. Critères corrigés dans `epics.md` avant implémentation.

**Approche :** exposer les paires sombres opérationnelles en variables distinctes, remplacer les littéraux par `var()` sans changer le rendu, poser une couche de classes sémantiques que les stories suivantes consomment, et fermer la porte avec un garde-fou à cliquet.

## Boundaries & Constraints

**Always :**
- Aucun changement de rendu : même couleur calculée, pas « équivalente ».
- `tokens-synchronises.css` est généré (`pnpm -F @azzel/web tokens:sync`) ; on modifie `tokens-css.ts`, jamais le fichier.
- Les surfaces qui basculent avec le thème ne changent pas.
- Toute classe du socle : aucune couleur littérale, cible ≥ 44 px, focus 2 px, contraste AA, `prefers-reduced-motion` respecté.

**Never :**
- Ne pas appliquer le socle à un écran existant dans cette story.
- Ne pas supprimer, désactiver ni affaiblir un test existant.
- Ne pas modifier de fichier `.tsx`.

## Décisions prises

- **Variables distinctes `--az-*-sombre`, émises une fois dans `:root`.** Noms distincts : zéro collision avec les `--az-*` qui suivent le thème. Une surface toujours sombre lit `--az-succes-sombre` et obtient la paire sombre quel que soit le thème global.
- **Rayons opérationnels en variables propres (`--az-rayon-*`, 8/16/24 px).** Les `--az-radius-*` existants sont remappés sur les rayons vitrine (4/6/8 px) ; le socle et les surfaces terrain ont besoin des rayons de carte 14 à 20 px.
- **Deux tokens charte ajoutés** : `forest-800` (`#122C20`, arrêt sombre du dégradé du poster trailer) et `vert-altitude` (`#8FD4A8`, pastille de lecture). `vert-altitude` a la même valeur que `action-sombre` mais une sémantique vitrine ; découplage volontaire pour que la palette opérations puisse être retournée pour la lisibilité terrain sans toucher la vitrine. Noms choisis par cohérence d'échelle, non validés par la charte (voir `deferred-work.md`).
- **Cinq littéraux conservés, documentés et épinglés** : `#0C1610` (fond de l'écran caméra, valeur historique différente de `bg-sombre` `#101A14`, le remplacer changerait le rendu), `#FFD9D6` (encre du bouton d'appel du voyant « inconnu », teinte non tokenisée), `#FFFFFF` ×3 (support du QR : contrainte de lisibilité du scanner, pas une couleur de charte).
- **Garde-fou à cliquet** (`css-sans-litteraux.test.ts`) : toute nouvelle couleur littérale échoue ; une exception dont le compte baisse échoue aussi, ce qui force à retirer l'entrée périmée. Le total ne peut que décroître.
- **« Aucune valeur littérale » s'entend des couleurs**, sinon les 44 px et 2 px exigés par la même story se contrediraient.

## I/O & Edge-Case Matrix

| Cas | Comportement attendu |
| --- | --- |
| Thème global clair, écran scanner | paire sombre appliquée (variable `-sombre`) |
| Thème global sombre, écran scanner | identique, aucune dérive |
| Surface qui suit le thème | `--az-*` inchangées, rendu inchangé |
| Nouveau littéral hex ajouté dans une feuille manuscrite | test en échec, nomme fichier et valeur |
| Littéral d'une exception supprimé | test en échec tant que l'entrée n'est pas retirée |
| Fond forêt (hero, bandes) | `.socle-sur-foret` bascule le contour en `--on-forest` : `var(--focus)` ne tient pas le 3:1 sur forêt |

</frozen-after-approval>

## Code Map

- `packages/shared/src/tokens.ts` — `forest-800`, `vert-altitude`
- `apps/web/src/lib/tokens-css.ts` — `operationsDarkSurfaceDeclarations()`, `rayonDeclarations()`
- `apps/web/src/app/tokens-synchronises.css` — régénéré
- `apps/web/src/app/socle.css` — nouveau : `.socle-action` (+ `--contour`), `.socle-chip`, `.socle-carte`, `.socle-entete`, `.socle-pastille` (5 états), `.socle-table`, `.socle-champ`, `.socle-etiquette`, `.socle-champ-aide`, `.socle-sur-foret`
- `apps/web/src/app/volontaires/scan/scan.css`, `espace-coureur/e-dossard/e-dossard.css`, `vitrine-textes.css` — 28 littéraux sur 33 remplacés
- `apps/web/src/app/css-sans-litteraux.test.ts`, `socle.test.ts` — nouveaux
- `apps/web/src/app/contrastes.test.ts`, `espace-coureur/e-dossard/tokens.test.ts`, `src/lib/tokens-css.test.ts` — modifiés

## Tasks & Acceptance

- [x] Paires sombres exposées hors thème sombre, rendu inchangé
- [x] 28 des 33 littéraux passent en `var()` ; 5 conservés et justifiés
- [x] Socle de classes sémantiques posé, appliqué à aucun écran
- [x] Garde-fou à cliquet en place
- [x] `tokens.test.ts` de `packages/shared` passe sans modification

## Implementation Notes

**Deux tests existants modifiés, aucun supprimé ni désactivé** : `contrastes.test.ts` et `e-dossard/tokens.test.ts` épinglaient les hex *dans le CSS*, mécanisme incompatible avec l'absence de littéraux. Ils épinglent désormais les constantes du domaine aux tokens et vérifient que le CSS sert les bonnes variables — une inversion de rôle reste attrapée.

`socle.css` est un fichier mort à l'issue de cette story ; il est importé par `layout.tsx` à partir de la story 9.2.

## Spec Change Log

- 2026-11-03 — critères de la story 9.1 corrigés dans `epics.md` sur l'état mesuré du CSS (la prémisse « quatorze feuilles redéfinissent leurs valeurs » était fausse).

## Review Triage Log

**Revue de code `bmad-code-review` : non passée.** Contrôles réellement effectués : relecture du diff par l'architecte, `git diff` des tests modifiés, exécution indépendante de `pnpm typecheck` et `pnpm test`. Écarts relevés par l'agent d'implémentation et consignés dans `deferred-work.md` : dérive `#0C1610` contre `bg-sombre`, teinte `#FFD9D6` non tokenisée, nommage des deux tokens.

## Verification

- `pnpm typecheck` : vert sur les trois paquets
- `pnpm test` : 176 fichiers, 2397 passés (baseline 174 / 2380, +17), zéro échec
