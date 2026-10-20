---
title: 'Story 1.1 — Fondation du monorepo'
type: 'feature'
created: '2026-10-20'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'NO_VCS'
review_loop_iteration: 0
context:
  - {project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/DESIGN.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le projet Azzel n'a encore aucun code : il faut un socle unique pour que tout pousse au même endroit dès le premier commit, gérable par une équipe bénévole à bus factor 1.

**Approach:** Scaffold du monorepo pnpm (`apps/web` Next.js 16.4.2, `apps/runners` Expo SDK 58 / RN 0.88 dev build, `packages/shared` TypeScript) avec les design tokens « Vert Djurdjura » en source unique dans `shared`, le mode sombre fonctionnel sur le web, et l'enveloppe d'erreur unique versionnée — `pnpm install && pnpm build` passe sur Node ^22.13 || ^24.3 || ≥26.

## Boundaries & Constraints

**Always:**
- Tokens repris **tel quels** du frontmatter DESIGN.md (hex, typo, rounded, spacing) — source unique dans `packages/shared`, déclinée en variables CSS web + thème RN.
- React 19.3.x en version unique workspace (resolutions/overrides pnpm).
- Mode sombre : défaut préférence système, override mémorisé, bascule visible dans l'en-tête, sans flash au chargement.
- Enveloppe d'erreur unique **versionnée** dans `shared` : message homogène + action à faire, jamais de code brut.
- Horodatages ISO 8601 UTC stockés, affichage local (helper dans `shared`).
- Aucune webfont (stacks système du frontmatter). UI en français, code et identifiants en anglais.

**Never:**
- Pas de fonctionnalité métier (inscription, auth, Supabase) — stories suivantes.
- Pas d'Expo Go : dev build uniquement. Pas de build natif EAS dans cette story.
- Pas de second accent décoratif ni déviation des tokens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build complet | `pnpm install && pnpm build` | web build + page racine servie ; runners et shared compilent (tsc) | N/A |
| Première visite web | Aucune préférence mémorisée | Thème = préférence système (`prefers-color-scheme`) | N/A |
| Bascule manuelle | Clic sur la bascule d'en-tête | Thème inversé immédiatement, mémorisé au rechargement, prioritaire sur le système | N/A |
| Erreur d'API | Rejet/échec réseau | Enveloppe d'erreur v1 : message humain + action, pas de code brut | N/A |

</frozen-after-approval>

## Code Map

- Racine projet — **verte** : aucun code, pas de git, pas de package.json (création intégrale).
- `_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/DESIGN.md` — frontmatter = tokens canoniques (couleurs clair/sombre + 5 opérationnelles avec encres, typo, rounded 8/16/24/full, spacing 4–48). Charger avant implémentation.
- `_bmad-output/planning-artifacts/architecture/architecture-Azzel-2026-10-19/ARCHITECTURE-SPINE.md` — AD-6 (monorepo, contrat dans `shared`), Structural Seed, Stack verrouillée.
- `_bmad-output/planning-artifacts/epics.md` — Story 1.1 : critères d'acceptation (l. 174–186).
- `_bmad-output/implementation-artifacts/epic-1-context.md` — contexte épopée 1 (décisions transverses).

## Tasks & Acceptance

**Execution:**
- [ ] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore` -- workspace racine : apps/* + packages/*, scripts `build`/`typecheck` orchestrés, resolutions React 19.3.x unique.
- [ ] `packages/shared/` -- `src/tokens.ts` (tokens typés, verbatim du frontmatter), `src/error-envelope.ts` (type + constructeur v1 : `{ version, error: { code, message, action } }`), `src/datetime.ts` (stockage ISO 8601 UTC → affichage local), `src/index.ts` (barrel) -- source unique du contrat inter-apps (AD-6).
- [ ] `apps/web/` -- Next.js **16.4.2** exact, App Router : variables CSS injectées depuis les tokens (`:root` clair, `[data-theme="dark"]` sombre), script inline anti-flash, bascule clair/sombre dans l'en-tête (défaut système, override localStorage), page racine française typée aux tokens.
- [ ] `apps/runners/` -- scaffold Expo SDK 58 / RN 0.88 (dev build, pas Expo Go) : App minimal consommant le thème RN dérivé de `shared`.
- [ ] `README.md` -- français, sobre : structure, commandes, conventions (UI fr / code en, horodatages).
- [ ] `git init` + premier commit -- « tout pousse au même endroit dès le premier commit ».

**Acceptance Criteria:**
- Given le dépôt fraîchement cloné avec Node compatible, when `pnpm install && pnpm build`, then les trois packages compilent et `apps/web` sert une page racine française.
- Given les tokens du frontmatter DESIGN.md, when on inspecte variables CSS et thème RN, then chaque valeur correspond verbatim et `shared` est la seule source.
- Given la bascule d'en-tête activée, when on recharge la page, then le choix persiste et surcharge la préférence système, sans flash.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Flot des tokens : `shared/src/tokens.ts` (objet typé unique) → web : boucle générant `--az-{role}` sur `:root` et `[data-theme="dark"]` (les rôles `-sombre` deviennent les valeurs du thème sombre) ; RN : `theme.ts` dérivé (clair/sombre en deux objets). Anti-flash : script inline dans `<head>` qui pose `data-theme` avant peinture (localStorage → sinon `prefers-color-scheme`), `color-scheme` déclaré pour les scrolls natifs sombres.

## Verification

**Commands:**
- `pnpm install` -- expected: installe sans erreur, lockfile créé.
- `pnpm build` -- expected: shared + runners compilent (tsc), web build Next réussi.
- `pnpm typecheck` -- expected: zéro erreur TS sur les trois packages.

**Manual checks (if no CLI):**
- Ouvrir la page racine : bascule d'en-tête fonctionne, choix survit au rechargement, suit le système par défaut ; inspecter les CSS vars = hex du frontmatter.
