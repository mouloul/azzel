---
title: 'Story 9.2 — Accueil refondu'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7d499de'
final_commit: '6c23e41'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Cette story a été implémentée à partir d'un brief de travail, sans spec écrite au préalable, contrairement aux stories 1 à 8. Ce document consigne l'intention, les décisions et les mesures **telles que committées** ; il ne prétend pas avoir précédé le code. Le brief d'origine est conservé dans `briefs-glm-epopee-9/`. **Aucune revue de code `bmad-code-review` n'a été passée** : voir le journal de revue.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** l'accueil était classique — hero centré, bandeau de date et badge d'épreuves flottants, bilan 2026 en section pleine hauteur de quatre cartes. La refonte doit se lire d'un coup d'œil sans toucher ce que les stories 2.1 et 2.2 protègent.

**Approche :** recomposer le hero (titre condensé à grande échelle, rail de chiffres clés qui absorbe bandeau et badge), compacter le bilan en bande horizontale, harmoniser piliers, épreuves et contact sur le socle 9.1.

## Boundaries & Constraints

**Always :**
- **La photo du hero reste.** La maquette la remplaçait par un dégradé ; c'est l'élément LCP, déjà optimisé par la story 2.1 (eager, `fetchpriority=high`, art direction `<picture>`). Décision d'architecture : on retravaille le voile et la composition, pas l'image.
- Les critères de 2.1 et 2.2 restent exigibles : égide en texte exact, chiffres 2026 exacts (279 / 222 / 214 / 116, « dont 36 femmes »), épreuves « Trail long — 35 km » et « Trail moyen — 12 km », CTA vers `/connexion?parcours=inscription`, « Appeler l'équipe » dans le hero et la section contact, glyphes SVG `currentColor` 20–24 px, frise en tête et pied `aria-hidden`.
- Budget < 300 Ko, aucune police ni image ni dépendance ajoutée, formes décoratives en SVG inline.
- Contraste **mesuré**, jamais estimé.

**Never :**
- Aucun chiffre sans source officielle sur le rail (pas de D+, d'altitude ni de nombre de places).
- Ne pas supprimer la crête ocre (identité de la story 2.2).

## Décisions prises

- **Rail de chiffres clés limité aux données officielles : Date, Épreuves (35 km · 12 km), Départ, Cadre.** La maquette montrait D+ 1 280 m, altitude 222–836 m, 600 places : ces valeurs viennent du relevé d'essai (28 km), contradictoires avec les 35 km annoncés, et un nombre de places serait un objectif 2027 chiffré, interdit par `page.test.tsx`. La grille cloisonnée est dimensionnée pour accueillir les cellules manquantes quand le comité aura validé les valeurs.
- **Socle translucide `forest-800` à 45 % sous le bloc de texte.** Mesuré sur la photo réelle (décodage du PNG, compositing du dégradé ligne par ligne, pire fenêtre de 8 px, deux thèmes) : l'ancien voile laissait l'accent ocre à **2,37:1**, sous le seuil. Avec le socle : ocre **3,49:1** en clair et **3,98:1** en sombre (grand texte, seuil 3:1), texte principal **8,39:1** et **9,57:1**.
- **`socle.css` importé depuis `layout.tsx`**, pas depuis la page : c'était le seul moyen de repasser sous 300 Ko (chunk CSS fusionné). Conséquence assumée : le socle charge sur toutes les routes.
- **Quatre tests de mise en page réécrits**, ceux que la story autorisait : structure du hero, CSS du hero, en-tête superposé, crête. Chacun est remplacé par un test de la nouvelle structure, plus strict.

## I/O & Edge-Case Matrix

| Cas | Comportement attendu |
| --- | --- |
| Desktop ≥ 960 px | grille 2 colonnes : titre à gauche (`clamp(72px, 10.5vw, 136px)`), rail à droite |
| Mobile < 960 px | une colonne, ordre titre → crête → rail → méta → actions ; le rail passe sous le titre |
| Titre | paliers 136→72, 96 (tablette), 72/44 (≤ 640), 40 (≤ 400), sans débordement |
| Ancien bandeau de date / badge | absents (`aa-hero__date`, `aa-hero__badge`), fondus dans le rail |
| `prefers-reduced-motion` | transitions neutralisées |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/page.tsx` — hero, rail, bande bilan, cartes
- `apps/web/src/app/globals.css` — composition du hero, voile, bande bilan
- `apps/web/src/app/layout.tsx` — import de `socle.css`
- `apps/web/src/app/page.test.tsx` — quatre tests réécrits

## Tasks & Acceptance

- [x] Hero recomposé, photo et LCP conservés
- [x] Rail de chiffres clés absorbant date et badge, données officielles seulement
- [x] Bande bilan compacte, valeurs inchangées
- [x] Contraste mesuré dans les deux thèmes
- [x] Budget tenu

## Implementation Notes

Budget mesuré sur build frais : **306 848 octets, 299,7 Kio pour 300**. Marge de 0,3 Kio, risque consigné dans `deferred-work.md` ; il a effectivement fait déborder la story 9.3.

## Spec Change Log

- 2026-11-03 — aucun changement d'intention.

## Review Triage Log

**Revue de code `bmad-code-review` : non passée.** Contrôles effectués : relecture de la composition et du rapport de contraste, `git diff` des quatre tests réécrits (nouveaux plus stricts que les anciens), exécution indépendante de typecheck et tests.

## Verification

- `pnpm typecheck` : vert
- `pnpm test` : 176 fichiers, 2397 passés, zéro échec
- `pnpm budget` : 299,7 Kio
