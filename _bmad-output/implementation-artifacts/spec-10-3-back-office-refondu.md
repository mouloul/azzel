---
title: 'Story 10.3 — Back-office refondu'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5677393'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Brief : `briefs-glm-epopee-10/story-10-3.md`.
> `bmad-code-review` n'a PAS été exécuté. Rendu visuel admin NON vérifié (ni base ni session).

## Prémisses corrigées avant implémentation

Les « six feuilles CSS » faisaient 206 lignes sans couleur en dur ; les écrans admin utilisaient les
classes globales et aucune classe du socle. Il n'existait ni compteurs de tête de page ni filtre de statut.

## Réalisé

- Deux tableaux (dossiers, volontaires ×2) sur `.socle-table`, cellules numériques `.socle-num` (nouvelle classe du socle), statuts en `.socle-pastille--*` avec point + libellé.
- Chips passives → `.socle-chip` ; `.chip-meta` et `.chip-statut` supprimées (définies dans une feuille non chargée par la route qui les utilisait : défaut préexistant corrigé).
- Rayons des cartes admin → 16 px.
- Compteurs ajoutés sur `/admin/dossiers` : Validés, En constitution, Acceptations manquantes, Dossards attribués. Calculés sur la liste affichée (≤ 200), non cliquables faute de filtre de statut ; mention de troncature affichée.
- Tableau live vérifié et verrouillé, pas réécrit. Fraîcheur en en-tête (disposition 5.3), pas « en pied ».
- 187 fichiers / 2510 tests, typecheck vert, budget 279 Kio.

## Correction de l'architecte

GLM avait nommé un compteur « À contrôler » pour les dossiers « en constitution » : faux sens (incomplet ≠ à valider). Renommé « En constitution ».

## Réserves

Artboard `AdminDossiers` absent du dépôt. Compteurs « Validés » etc. portent sur ≤ 200 dossiers, pas sur l'édition entière.
