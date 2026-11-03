---
title: 'Story 9.4 — Inscription et checklist refondues'
type: 'feature'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a667c61'
final_commit: 'e1ddc56'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Cette story a été implémentée à partir d'un brief de travail, sans spec écrite au préalable, contrairement aux stories 1 à 8. Ce document consigne l'intention, les décisions et les mesures **telles que committées** ; il ne prétend pas avoir précédé le code. Le brief d'origine est conservé dans `briefs-glm-epopee-9/`. **Aucune revue de code `bmad-code-review` n'a été passée** : voir le journal de revue.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** le parcours de dossier du coureur — inscription, acceptations, preuve, checklist — doit montrer où en est le coureur et ce qu'il lui reste à faire, sans toucher à la validation, à la compression, à l'horodatage des documents ni à la clôture J-10.

**Approche :** un fil d'étapes commun aux trois écrans du parcours, des formulaires au gabarit du socle, un habillage seul des écrans existants.

## Boundaries & Constraints

**Always :**
- Les critères des stories 1.3, 1.4, 1.5 et 1.7 restent dus. Verrouillés par leurs tests : les huit champs validés un par un, clôture J-10 et son message daté, le **serveur seul horodate** versions et date d'acceptation (le client n'en fournit jamais), détection de format de preuve par **octets magiques et jamais par extension**, cible 300 Ko, libellés d'action verbatim de la checklist, bandeau « Dossier validé — dossard prêt », lien e-dossard uniquement sur dossier complet.
- **Registre tutoyé** sur ces écrans (« Ton dossier », « Coche les deux cases »).
- Tout champ obligatoire est annoncé en texte, pas par un astérisque coloré.
- Les enveloppes d'erreur portent le bouton d'assistance.

**Never :**
- Ne pas toucher à la compression, au brouillon, au réessai sans re-sélection, ni à la validation.
- Pas de police, d'image ni de dépendance.

## Décisions prises

- **Fil d'étapes en quatre étapes (Inscription · Documents · Paiement · Validation)**, l'étape courante lue par la forme et le texte : disque plein à double filet et « Étape N sur 4 — en cours » (`aria-current="step"`), disque plein portant une coche pour les étapes faites (« Fait »), disque creux numéroté pour les autres.
- **Le fil ne promet rien vers l'avant.** Les étapes suivantes ne sont ni des liens ni porteuses d'un état, pas même « À venir » : un coureur ayant sauté une étape via la checklist ne serait pas « à venir » et le fil mentirait. Seules les étapes franchies sont des liens de retour de 44 px minimum. Plus sobre que la maquette ; arbitrage visuel laissé à la recette.
- **`documentsAcceptes` ajouté au read-model de `proof-service.ts`** pour que le fil de `/preuve` connaisse l'état « Documents » : booléen dérivé de `dechargeAcceptedAt` et `reglementAcceptedAt`, déjà chargés sur le même enregistrement coureur. Aucune requête supplémentaire, aucune donnée nouvelle exposée. **Seul fichier de service modifié.**
- **`dossier.css` n'est chargé que par quatre routes** : l'accueil ne le paie pas.

## I/O & Edge-Case Matrix

| Cas | Comportement attendu |
| --- | --- |
| Étape franchie | disque plein avec coche, « Fait », lien de retour ≥ 44 px |
| Étape courante | disque plein à double filet, « Étape N sur 4 — en cours » |
| Étape suivante | disque creux numéroté, ni lien ni état |
| Erreur serveur sur le formulaire | message + bouton « Appeler l'équipe » |
| Téléphone | une colonne, récapitulatif sous le formulaire ; colonne latérale ≥ 960 px |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/fil-etapes.tsx` — nouveau, 13 tests
- `apps/web/src/app/dossier.css` — nouveau, garde `dossier-css.test.ts` (10 tests)
- `apps/web/src/app/inscription/`, `acceptations/`, `preuve/` — pages, formulaires, tests de page
- `apps/web/src/app/espace-coureur/page.tsx` — actions en cibles pleines
- `apps/web/src/modules/inscriptions/proof-service.ts` — `documentsAcceptes`

## Tasks & Acceptance

- [x] Fil d'étapes sur les trois écrans du parcours
- [x] Formulaires au gabarit du socle, huit mentions « (obligatoire) » en texte
- [x] Checklist : cibles ≥ 44 px, puce « à faire » en anneau creux
- [x] Logique inchangée (validation, fetch, compression, horodatage, clôture)
- [x] Tests ajoutés dans la même passe que le code

## Implementation Notes

**+42 tests (2425 → 2467), aucune ligne supprimée dans les tests existants** : `fil-etapes.test.tsx` (13), `inscription/page.test.tsx` (7), `acceptations/page.test.tsx` (5), `preuve/page.test.tsx` (5), `dossier-css.test.ts` (10), un test dans `preuve.test.ts`, un dans `espace-coureur/page.test.tsx`.

**Couvert par construction seulement** (pas de DOM dans vitest) : la compression canvas et le réessai sans re-sélection, la gestion du focus sur le premier champ en erreur, le rendu visuel réel du fil et de la colonne latérale. Le groupe radio « épreuve » porte sa mention « obligatoire » dans son texte d'aide, pas dans un label par bouton.

## Spec Change Log

- 2026-11-03 — aucun changement d'intention.

## Review Triage Log

**Revue de code `bmad-code-review` : non passée.** Contrôles effectués : audit du seul changement de service (`proof-service.ts`, ajout pur), vérification qu'aucune ligne n'a été supprimée dans `preuve.test.ts` ni `espace-coureur/page.test.tsx`, recherche de littéraux de couleur dans `dossier.css` (zéro) et de caractères parasites, exécution indépendante de typecheck, tests et budget.

## Verification

- `pnpm typecheck` : vert
- `pnpm test` : 182 fichiers, 2467 passés (+42), zéro échec
- `pnpm budget` : 286 053 octets, 279 Kio
