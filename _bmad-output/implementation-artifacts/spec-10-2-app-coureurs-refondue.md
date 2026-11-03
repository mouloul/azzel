---
title: 'Story 10.2 — App coureurs refondue'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a0d6d97'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Brief : `briefs-glm-epopee-10/story-10-2.md`.
> `bmad-code-review` n'a PAS été exécuté. Rendu natif NON vérifié (ni appareil ni simulateur).

## Prémisses corrigées avant implémentation

- Le thème lisait déjà les tokens ; seuls littéraux : `edossard.tsx` (6, tous égaux à des tokens existants) + `#FFFFFF` du QR (exception documentée).
- « Abandon » n'existe pas dans l'app coureurs (saisi au PC, story 5.3). Les 64 dp du scan concernent la PWA volontaires. Aucune animation dans l'app : reduced-motion sans objet.
- « Progression / position sur le tracé » n'existent pas dans l'état de l'app : non affichées, non inventées.

## Réalisé

- Littéraux de l'e-dossard → `tokens.colors[...]`, rendu identique ; test `source-sans-litteraux.test.ts`.
- Suivi : état (4 états en toutes lettres) remonté au-dessus du titre, `libelleEtatSuivi()`.
- Variante `destructeur` de `Bouton` appliquée à « Se déconnecter » (2 écrans).
- E-dossard 74 px / mono / QR carte blanche : conformes, verrouillés par `edossard-garanties.test.ts`.
- 186 fichiers / 2496 tests, typecheck vert, budget 279 Kio.

## Réserves

Mode sombre par défaut non traité (le thème suit le système, UX-DR-2). Sur l'écran dossier, principal vert et destructeur rouge ne se distinguent que par couleur + libellé (pas d'icônes, aucune dépendance).
