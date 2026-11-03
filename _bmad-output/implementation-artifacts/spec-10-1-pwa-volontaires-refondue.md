---
title: 'Story 10.1 — PWA volontaires refondue'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '78de2c6'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Brief : `briefs-glm-epopee-10/story-10-1.md`.
> `bmad-code-review` n'a PAS été exécuté.

## Prémisse corrigée avant implémentation

La story affirmait que l'écran de scan déroge à UX-DR-7. Mesuré dans le code : faux. Le voyant fait
déjà 96 px, texte 24 px / 800, heure mono 16 px, clignotement 1 s borné à 6 s, `prefers-reduced-motion`
neutralisé, `aria-live="assertive"`, voile 96 %, appel PC 48 px. Le voyant n'a pas été réécrit ; ses
garanties sont verrouillées par des tests.

## Réalisé

- Adoption du socle (`.socle-carte`, `.socle-action(--contour)`, `.socle-chip`) sur la fiche mission,
  l'annuaire, les cinq écrans d'état du scan, les CTA ; CSS devenu mort supprimé.
- Hiérarchie : « Ta fiche mission » en titre principal 24 px / 800 ; ordre inchangé (déjà correct).
- Bandeau : « ◷ N passages en attente » (le « passages » manquait) ; « ✓ envoyés — file : 0 » déjà exact.
- Service worker non modifié : le chunk global contenant `socle.css` est précaché à l'installation.
- +7 tests (2480 / 183 fichiers), typecheck vert, budget 279 Kio.

## Deltas visuels assumés (à valider à l'œil par un humain)

Rayon des cartes 6→16 px avec ombre légère ; CTA rectangulaires→pilules ; chip avec bordure et
majuscules ; CTA en Barlow Condensed. Aucune capture n'a été comparée : non vérifié visuellement.

## Laissé tel quel

`.volontaires-badge` (pilule pleine « HORS-LIGNE PRÊT », différente de `.socle-pastille`) ; boutons du
bandeau sync (contraste sur fonds opérationnels) ; `LogoutButton` / `AssistanceButton` (partagés,
hors périmètre) ; pages de garde auth/card ; littéraux `#0C1610` / `#FFD9D6`.
