---
title: 'Story 9.5 — Résultats refondus'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5ce31fb'
final_commit: 'a667c61'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Cette story a été implémentée à partir d'un brief de travail, sans spec écrite au préalable, contrairement aux stories 1 à 8. Ce document consigne l'intention, les décisions et les mesures **telles que committées** ; il ne prétend pas avoir précédé le code. Le brief d'origine est conservé dans `briefs-glm-epopee-9/`. **Aucune revue de code `bmad-code-review` n'a été passée** : voir le journal de revue.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** la page publique de résultats, live pendant la course, doit permettre de retrouver un coureur et de lire un temps sans effort, sur téléphone, sans rien changer à ce que les stories 7.1 et 7.2 garantissent.

**Approche :** recherche et filtres étiquetés, tableau dense dans une zone à défilement propre, podium en lecture pure des rangs servis, états vide et dégradé au vocabulaire du socle.

## Boundaries & Constraints

**Always :**
- `force-dynamic`, `noindex`, Open Graph, « Classement provisoire » en toutes lettres, registre vouvoyé, états vide et dégradé aux textes verbatim, comptage des partages inchangé (`?partage=1`).
- **Anonymat strict (NFR-7, AD-7) : la page n'expose que des dossards.** Jamais un nom, un contact, une photo.
- Le podium lit les rangs déjà servis (`filter(rang !== null).slice(0, 3)`), jamais de classement dérivé côté vue.
- L'état des filtres vit dans `VueResultats`, indépendant du polling.

**Never :**
- Pas de recherche par nom. **La story avait été rédigée à tort avec « recherche par nom ou dossard »** ; l'agent a refusé en invoquant le contrat public anonyme et il avait raison. Texte corrigé dans `epics.md` avec la référence NFR-7.
- Aucune dépendance (pas de jsdom).

## Décisions prises

- **Podium masqué dès qu'un filtre est actif** : un podium dérivé d'un filtre serait un recalcul de classement, interdit (AD-7). Les ex æquo servis (1, 1, 3) donnent deux cartes « 1ᵉʳ ».
- **Filtre d'une valeur devenue étrangère aux données** (épreuve disparue au polling) : retombée sur « Toutes ».
- **Prop optionnelle `filtresInitial` sur `VueResultats`**, sur le modèle de `dossardInitial` de `FormulaireAbandon` : sème les trois `useState`, ce qui rend les états filtrés testables sans DOM. Valeur par défaut inchangée, aucun effet en production.
- **Tableau** : conteneur `.resultats-defile` (`overflow-x: auto`, table `min-width: 480px`) : la zone défile, jamais la page ; focusable au clavier, `role="region"` nommé par l'épreuve.

## I/O & Edge-Case Matrix

| Cas | Comportement attendu |
| --- | --- |
| Aucun filtre | podium visible, tout le classement |
| Un filtre actif | podium masqué, lignes filtrées, « Derniers arrivés » filtré aussi |
| Aucun partant | bandeau « Pas encore de partants — départ à --:-- », pas de formulaire |
| Épreuve sans heure configurée, filtre ne matchant qu'elle | « Aucun dossard ne correspond » dans les classements alors que le dossard figure dans « Derniers arrivés » — **comportement connu, à arbitrer** (test de caractérisation) |
| Abandons | filtrés par dossard seulement : le contrat ne porte pas la catégorie |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/resultats/resultats-live.tsx` — filtres, podium, tableau (+455 lignes)
- `apps/web/src/app/resultats/resultats.css`, `page.tsx`
- `apps/web/src/app/resultats/resultats-live.test.tsx` — +14 tests

## Tasks & Acceptance

- [x] Recherche par dossard et filtres épreuve / catégorie
- [x] Podium en lecture pure, masqué sous filtre
- [x] Tableau dense en zone de défilement propre
- [x] Garanties des stories 7.1 et 7.2 intactes
- [x] Anonymat vérifié sur le HTML rendu

## Implementation Notes

**Cette story est d'abord revenue sans aucun test** pour 455 lignes de logique neuve (2411 avant, 2411 après) ; elle a été renvoyée et les 14 tests ont été ajoutés dans une seconde passe : filtres seuls et combinés, podium dans les deux sens, ex æquo, repli sur « Toutes », effacement, anonymat, état vide sans formulaire, caractérisation.

**Limite assumée :** vitest tourne en `node` sans DOM. « Le polling ne vide pas la recherche » et le clic sur « Effacer » sont couverts **par construction** (champ contrôlé effectivement rendu, regex sur la source) et non en comportement. Décision jsdom, happy-dom ou Playwright consignée dans `deferred-work.md`.

## Spec Change Log

- 2026-11-03 — texte de la story corrigé dans `epics.md` : « recherche par nom ou dossard » → « par numéro de dossard » (NFR-7).

## Review Triage Log

**Revue de code `bmad-code-review` : non passée.** Contrôles effectués : vérification indépendante de typecheck, tests et budget ; contrôle qu'aucun test existant n'a été supprimé ; lecture des tests de la garantie « le polling ne vide pas la recherche », dont une partie est une regex sur le code source, ce qui prouve la structure et non le comportement.

## Verification

- `pnpm typecheck` : vert
- `pnpm test` : 177 fichiers, 2425 passés (+14), zéro échec
- `pnpm budget` : 286 051 octets, 279 Kio
