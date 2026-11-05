---
title: 'Story 9.3 — Coquille de la section parcours'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6c23e41'
final_commit: '5ce31fb'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Cette story a été implémentée à partir d'un brief de travail, sans spec écrite au préalable, contrairement aux stories 1 à 8. Ce document consigne l'intention, les décisions et les mesures **telles que committées** ; il ne prétend pas avoir précédé le code. Le brief d'origine est conservé dans `briefs-glm-epopee-9/`. **Aucune revue de code `bmad-code-review` n'a été passée** : voir le journal de revue.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** le visiteur doit pouvoir comparer les deux épreuves depuis l'accueil. La carte 3D et le profil altimétrique relèvent de l'épopée 11 ; cette story livre la **coquille** : structure, sélecteur, données réellement disponibles, emplacement annoncé pour la visualisation. Elle doit se tenir debout seule.

**Approche :** un contrat de données unique côté vitrine qui mappe la source existante, un sélecteur d'épreuve sans JavaScript client, un rendu qui n'affiche que ce qui est connu.

## Boundaries & Constraints

**Always :**
- **Aucun chiffre inventé sur une page publique.** Un champ sans donnée n'est pas affiché du tout : ni tiret, ni « à venir ». `page.test.tsx` interdit déjà « à confirmer » et tout objectif 2027 chiffré.
- Une seule source des épreuves : le contrat mappe `getParcoursPage()`, la même que `/parcours`.
- Chaque point de passage porte son kilomètre dans le référentiel de son épreuve (portion commune : un même point n'aura pas le même kilomètre selon l'épreuve).
- La section ne prend jamais le premier écran ; le lien vers `/parcours` reste présent.

**Never :**
- Aucune police, image ni dépendance ajoutée.
- Ne pas relever le plafond de budget, ne pas dégrader la section pour y entrer.

## Décisions prises

- **Sélecteur en boutons radio natifs + règles `:has()` générées côté serveur.** Un groupe de radios = une seule variable d'état, possédée par le navigateur. Zéro JavaScript client ajouté (chunks du chemin critique inchangés). Clavier natif, cibles ≥ 44 px, épreuve active annoncée par le radio coché, le fond plein du chip et le nom répété en `<h3>` du panneau, pas seulement par la couleur. Repli `@supports not selector(:has(*))` : panneaux empilés lisibles.
- **Contrat de données** (`modules/contenus/section-parcours.ts`, `getSectionParcours()`) : nom, distance, GPX https depuis la base ; `denivelePositifM`, `deniveleNegatifM`, `altitudeMin/MaxM`, `heureDepart`, `barriereHoraire` et points de passage à `null` jusqu'à l'épopée 11. Story 11.1 ne touche que cette fonction ; le rendu sait déjà afficher des valeurs non nulles (test avec un point partagé).
- **Dépassement de budget arbitré, pas subi.** Section remplie : 308 526 octets contre 307 200, soit **1 326 octets de trop**. Refusé : relever le plafond (NFR-2 est une promesse faite à un coureur en 3G), dégrader la section, toucher à la photo LCP. Retenu : retrait du **seul `<link rel="preload">` de Barlow Condensed 700**, dont le `@font-face` reste en place. Mesuré en CDP avec la police retardée de 2,5 s : géométrie des sections identique au centième de pixel, CLS 0,002 desktop et 0,000025 mobile pour un seuil de 0,1 ; le repli métriquement calibré (`ascent`, `descent`, `size-adjust`) fait ce pour quoi il a été construit. Gain : 22 471 octets **sur le décompte de `pnpm budget`**. **Correction (2026-11-03, story 9.6) : ce ne sont pas des octets économisés.** `check-budget.sh` ne compte que les ressources référencées par le HTML, préchargements compris ; la police est toujours téléchargée dès qu'un texte en graisse 700 s'affiche. Le retrait garantit un premier rendu non bloqué, pas un poids moindre. Voir `deferred-work.md`.

## I/O & Edge-Case Matrix

| Cas | Comportement attendu |
| --- | --- |
| Donnée épopée 11 nulle | champ absent du rendu |
| Navigateur sans `:has()` | panneaux empilés, tout lisible |
| Visualisation absente | bloc annoncé, utile (fiches et GPX à côté), jamais un cadre vide |
| Point partagé entre épreuves | kilomètre de l'épreuve active, épreuve visible au contact du chiffre |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/contenus/section-parcours.ts` — contrat de données (91 lignes)
- `apps/web/src/components/section-parcours.tsx` — rendu (201 lignes)
- `apps/web/src/components/section-parcours.test.tsx` — 9 tests
- `apps/web/src/app/page.tsx`, `page.test.tsx` (+5 tests), `globals.css`
- `apps/web/src/app/layout.tsx` — retrait du préchargement Barlow 700

## Tasks & Acceptance

- [x] Contrat de données posé, un seul point d'entrée
- [x] Sélecteur d'épreuve sans JavaScript
- [x] Aucun chiffre de parcours inventé
- [x] Section complète sans la visualisation
- [x] Budget de chemin critique tenu sans relever le plafond (le poids transféré réel reste au-dessus de 300 Ko : voir Review Triage Log)

## Implementation Notes

Bascule d'épreuve testée par rendu serveur ; le comportement navigateur du sélecteur (`:has()`) est couvert par construction. Le sous-ensemble de caractères de Barlow, estimé à environ 23 Ko de gain supplémentaire, est consigné au travail différé sans avoir été implémenté.

## Spec Change Log

- 2026-11-03 — correction de l'affirmation sur le gain de budget : retrait d'un préchargement ≠ octets économisés (mesuré par la story 9.6).

## Review Triage Log

**Revue de code `bmad-code-review` : non passée.** Contrôles effectués : relecture du rapport, vérification indépendante de `pnpm typecheck`, `pnpm test` et `pnpm budget` après le correctif de budget, recherche de caractères parasites dans les fichiers modifiés (un mélange de caractères chinois était apparu dans le rapport de l'agent, pas dans le code).

## Verification

- `pnpm typecheck` : vert
- `pnpm test` : 177 fichiers, 2411 passés (+14), zéro échec
- `pnpm budget` : 286 052 octets, 279 Kio, marge 21 Ko — **mesure de chemin critique** ; poids réellement transféré : 321 Kio (story 9.6)
