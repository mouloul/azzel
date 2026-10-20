---
title: 'Story 1.1 — Fondation du monorepo'
type: 'feature'
created: '2026-10-20'
status: 'done'
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
- [x] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore` -- workspace racine : apps/* + packages/*, scripts `build`/`typecheck` orchestrés, resolutions React 19.3.x unique.
- [x] `packages/shared/` -- `src/tokens.ts` (tokens typés, verbatim du frontmatter), `src/error-envelope.ts` (type + constructeur v1 : `{ version, error: { code, message, action } }`), `src/datetime.ts` (stockage ISO 8601 UTC → affichage local), `src/index.ts` (barrel) -- source unique du contrat inter-apps (AD-6).
- [x] `apps/web/` -- Next.js **16.4.2** exact, App Router : variables CSS injectées depuis les tokens (`:root` clair, `[data-theme="dark"]` sombre), script inline anti-flash, bascule clair/sombre dans l'en-tête (défaut système, override localStorage), page racine française typée aux tokens.
- [x] `apps/runners/` -- scaffold Expo SDK 58 / RN 0.88 (dev build, pas Expo Go) : App minimal consommant le thème RN dérivé de `shared`.
- [x] `README.md` -- français, sobre : structure, commandes, conventions (UI fr / code en, horodatages).
- [x] `git init` + premier commit -- « tout pousse au même endroit dès le premier commit ».

**Acceptance Criteria:**
- Given le dépôt fraîchement cloné avec Node compatible, when `pnpm install && pnpm build`, then les trois packages compilent et `apps/web` sert une page racine française.
- Given les tokens du frontmatter DESIGN.md, when on inspecte variables CSS et thème RN, then chaque valeur correspond verbatim et `shared` est la seule source.
- Given la bascule d'en-tête activée, when on recharge la page, then le choix persiste et surcharge la préférence système, sans flash.

## Implementation Notes

- Implémenté par subagent ; premier commit git : `59dbcc1` (`git init -b main`, tout le projet — scaffold + artefacts de planification — conformément au « tout pousse au même endroit »).
- Audit de matrice (step-03) : lignes 2/3/4 sans test → ajout de vitest 4 (root, `pnpm test`) + tests : `apps/web/src/lib/theme.test.ts` (résolution thème : système par défaut, override mémorisé, valeur invalide → système), `packages/shared/src/error-envelope.test.ts` (enveloppe v1 + garde), `packages/shared/src/datetime.test.ts` (ISO UTC → local fr-FR, TZ=UTC dans le test, entrée invalide → RangeError). Ligne 1 (build) couverte par `pnpm install && pnpm build` exécuté et passé.
- Refactor : logique de thème extraite de `theme-toggle.tsx` vers `apps/web/src/lib/theme.ts` (`resolveInitialTheme`, `nextTheme`, `THEME_STORAGE_KEY`) pour être testable ; le script inline anti-flash de `layout.tsx` garde la même sémantique (doit rester inline, pré-peinture).
- `pnpm-lock.yaml` : une seule version de React (19.3.1) dans tout le workspace (overrides pnpm).
- Vérifié : `pnpm install` (frozen-lockfile OK), `pnpm build`, `pnpm typecheck`, `pnpm test` (10 tests verts) ; page servie (`next start` + curl) : CSS vars clair/sombre verbatim, `lang="fr"`, script anti-flash présent.
- Reste manuel (non bloquant) : contrôle visuel navigateur de la bascule (`pnpm dev:web`) ; démarrage Metro/dev build non testé (nécessite build natif, hors périmètre Never).
- Sécurité : `.opencode/` (clé API Figma en clair dans `opencode.json`) exclu par `.gitignore` et non commité — clé à révoquer côté utilisateur.
- Revue (3 couches parallèles : blind hunter, edge cases, verification gap) : 9 entrées retenues → 8 patchs appliqués par le même subagent (script anti-flash généré depuis `lib/theme` + testé par exécution, localStorage protégé, garde anti-suivi alignée, build `shared` passé en noEmit — dist mort supprimé, garde win32 sur tests TZ, tests `buildTokensCss`/dérivation RN/parité tokens, `expo-dev-client` ajouté), 1 différé (tests de composant ThemeToggle → deferred-work.md). 11 rejets tracés dans le Review Triage Log. Vérification post-patch : `pnpm install --frozen-lockfile`, `pnpm test` (6 fichiers, 22 tests), `pnpm build`, `pnpm typecheck` — tout vert.

## Spec Change Log

## Review Triage Log

| # | Verdict | Preuve / route |
|---|---------|----------------|
| A | medium (BH1+VG1) | Script anti-flash de layout.tsx ré-implémente resolveInitialTheme + clé 'azzel-theme' en dur ; aucun test ne l'exécute → dérive silencieuse pré-peinture possible. → patch |
| B | medium (EC1+EC4) | localStorage.getItem (effet) et setItem (clic) non protégés : SecurityError en navigation privée → en-tête cassé. → patch |
| C | low (EC2) | onSystemChange bloque le suivi système sur toute valeur mémorisée, même invalide ('sombre'), que resolveInitialTheme ignore → sémantique incohérente, thème figé après valeur corrompue. Correctif direct. → patch |
| D | medium (BH4+EC6+VG-Other) | build shared émet dist/ jamais consommé (main → src), invalide en ESM Node (imports sans extension) et pollué par dist/*.test.js (+ .d.ts importants vitest). → patch (build = noEmit) |
| E | low (BH2+EC7) | process.env.TZ ignoré sous Windows → assertions 08:42:07 échouent sur toute machine Windows. Garde de plateforme directe. → patch |
| F | medium (VG2) | buildTokensCss sans aucun test : casser le slicing -sombre ou renommer un token casse le style web en silence (typecheck passe). → patch (test de sortie) |
| G | medium (VG3+BH5+BH14) | Dérivation RN (16 paires colorPairs, math lineHeight/letterSpacing) et parité clair/sombre des tokens hors de tout chemin de vérification ; vitest n'inclut pas apps/runners. → patch (tests + mock react-native) |
| H | low (BH3) | expo start --dev-client sans expo-dev-client dans les deps → workflow dev build incohérent au premier build natif (Epic 6). Une ligne. → patch |
| I | medium (VG4) | ThemeToggle non exécuté par aucun test (état initial, persistance, suivi système) — nécessite jsdom/testing-library, dépasse la fondation. → defer |
| BH6 | low, rejeté | Updater setState impur (applyTheme/setItem) double-exécuté en StrictMode — effets idempotents, aucun tort observable ; restructuration ≠ correction directe. |
| BH7 | false | Prétendue désynchronisation libellé/thème : l'effet ré-applique et ré-affiche la même valeur re-calculée des mêmes entrées — auto-correctif. |
| BH8 | low, rejeté | Absence ESLint/CI : l'intent (frozen) ne l'exige pas, l'architecture diffère CI/CD ; ajouter une chaîne d'outils ≠ correction directe. |
| BH9 | low, rejeté | 44px mobile codé dur dans globals.css : le DESIGN.md pose explicitement 44–48 px comme [ASSUMPTION] à figer sur écrans réels — pas une dérive de token. |
| BH10 | false | Liens _bmad-output « morts » : le premier commit inclut _bmad-output (1206 fichiers) — les chemins existent dans tout clone. |
| BH11 | low, rejeté | Alias @/ absent de vitest.config : spéculatif (aucun test actuel ne l'utilise) ; à ajouter au premier besoin. |
| BH12 | low, rejeté | Intl.DateTimeFormat recréé par tick (2/s) : négligeable, aucun tort mesurable. |
| BH13 | low, rejeté | ErrorEnvelopeInput duplique ErrorEnvelopePayload : cosmétique, distingue entrée/sortie pour divergence future. |
| BH15 | low, rejeté | .env.example manquant malgré le whitelist : inoffensif, placeholder pour le futur. |
| EC3 | low, rejeté | Clic avant l'effet : fenêtre d'une frame post-hydration, inatteignable en usage humain ; le garde ajouterait une branche pour rien. |
| EC5 | false | Locale invalide ('zz') : aucun appelant n'y passe (DEFAULT_LOCALE interne) ; échec bruyant d'un util interne = comportement correct. |

## Design Notes

Flot des tokens : `shared/src/tokens.ts` (objet typé unique) → web : boucle générant `--az-{role}` sur `:root` et `[data-theme="dark"]` (les rôles `-sombre` deviennent les valeurs du thème sombre) ; RN : `theme.ts` dérivé (clair/sombre en deux objets). Anti-flash : script inline dans `<head>` qui pose `data-theme` avant peinture (localStorage → sinon `prefers-color-scheme`), `color-scheme` déclaré pour les scrolls natifs sombres.

## Verification

**Commands:**
- `pnpm install` -- expected: installe sans erreur, lockfile créé.
- `pnpm build` -- expected: shared + runners compilent (tsc), web build Next réussi.
- `pnpm typecheck` -- expected: zéro erreur TS sur les trois packages.

**Manual checks (if no CLI):**
- Ouvrir la page racine : bascule d'en-tête fonctionne, choix survit au rechargement, suit le système par défaut ; inspecter les CSS vars = hex du frontmatter.
