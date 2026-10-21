---
title: 'Intégration charte web Aït Aïssi (pré-requis épopée 1)'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '3bbcedd'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/charte-web-ait-aissi/CHARTE.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Le site applique encore l'identité provisoire « Vert Djurdjura » ; la charte officielle du Week-end Sportif Aït Aïssi (dépôt du 20-21/10) doit devenir l'identité du web avant les stories 1-6→1-9.

**Approach:** Deux palettes dans `shared` : `siteTokens` (charte — crème/forêt/ocre, Barlow Condensed + Inter auto-hébergées, rayons 4/6/8, composants aa-) pour tout apps/web ; l'existant devient `operationsTokens` (jour J terrain : scan/succès/danger/sync) conservé pour les futures surfaces PWA/PC — l'app runners ne change pas. Les variables `--az-*` des pages existantes sont remappées sur les valeurs charte, les variables natives de la charte (`--font-display`, `--space-*`, `--radius-*`, `--shadow-card`, `--container-max`…) sont ajoutées, les classes `aa-` de composants.css sont intégrées, le header porte le logo Aït Aïssi, le thème passe à **défaut clair**, la voix devient **mixte** (vouvoiement public, tutoiement espace coureur).

## Boundaries & Constraints

**Always:**
- Assets copiés dans `apps/web/public/charte/` (fonts woff2, logos SVG) — jamais référencés depuis `_bmad-output` ; favicon = symbole.
- @font-face auto-hébergées `font-display: swap` ; preload du seul Barlow Condensed 700 (titres) ; pas de CDN Google Fonts.
- `siteTokens` : palette light + dark de tokens.css de la charte, verbatim (hex, spacing 4–96, radius 4/6/8, shadow-card, container-max, text-max 68ch, header-height 72px, bp 640/960/1280) ; source unique dans `shared`, tests de parité light/dark.
- Remap sémantique `--az-*` : bg→surface, surface→surface-raised, texte→ink, texte-2→ink-muted, action→action (+action-hover), action-texte→on-action, filet→line, focus→focus charte ; les opérationnelles (succes/danger/attention/sync-*) restent disponibles (futures surfaces terrain).
- Header : logo complet 40px (desktop) / 32px (mobile), symbole seul si largeur d'en-tête < 160px (deux <img> basculés par media query, alt descriptif) ; zone de protection respectée ; pied de page : mention discrète « Plateforme Azzel ».
- Thème : **défaut clair** — `resolveInitialTheme(stored)` = stored ?? 'light' ; plus de suivi système par défaut ; bascule et mémorisation inchangées ; script anti-flash conservé (sans matchMedia) ; `color-scheme` par thème.
- Voix : pages publiques (accueil, /connexion) au **vouvoiement**, enveloppes d'erreur iam incluses (« Vérifiez votre adresse… ») ; pages coureur connecté (/inscription, /acceptations, /preuve, /espace-coureur) au **tutoiement** inchangé.
- Accessibilité maintenue : focus visible 2px (var --focus), cibles ≥ 44px, aria existants conservés ; contrastes charte respectés (highlight/ocre ≥ 24px seulement).

**Never:**
- Pas de refonte des contenus/pages (la vitrine complète = épopée 2) — retheme et typographic styling uniquement.
- Pas de changement de l'app runners ni du thème RN (charte = web).
- Pas de photos dans les pages existantes (matière 2026 = épopée 2), pas de nouveau composant métier.
- Pas de CDN de polices, pas de dégradés décoratifs (seul le voile forest sur photo est autorisé, épopée 2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Première visite | Aucune préférence mémorisée | Thème clair (charte), pas de flash, aucune lecture de prefers-color-scheme | No error expected |
| Bascule mémorisée | localStorage azzel-theme=dark | Thème sombre charte (valeurs dark de tokens.css), survit au rechargement | No error expected |
| Page publique | /connexion | Vouvoiement, boutons/formulaires aux couleurs charte, logo header | No error expected |
| Page coureur | /espace-coureur (connecté) | Tutoiement conservé, habillage charte | No error expected |
| Étroit | largeur header < 160px | Symbole seul affiché (logo complet masqué) | No error expected |
| Police indisponible | woff2 non chargée | Fallbacks "Arial Narrow"/system-ui lisibles (swap), mise en page tenue | No error expected |

</intent-contract>

## Code Map

- Source charte : `_bmad-output/planning-artifacts/ux-designs/ux-Azzel-2026-10-20/charte-web-ait-aissi/` — `tokens.css` (palette + @font-face), `composants.css` (classes aa-), `fonts/*.woff2` (11 fichiers), `logos/*.svg` (logo, négatif, symbole, badge, monochromes).
- `packages/shared/src/tokens.ts` — renommer les exports actuels en `operationsTokens` (+ alias `tokens` conservé pour runners/theme RN : zéro breakage) ; ajouter `siteTokens` typé.
- `apps/web/src/lib/tokens-css.ts` — réécrire : remap --az-* + ajout des variables charte ; `apps/web/src/lib/theme.ts` — défaut clair (signature simplifiée), anti-flash sans matchMedia.
- `apps/web/src/app/globals.css` — intégrer composants.css (aa-), ajuster focus/inputs aux rayons charte ; boutons existants (.btn-action/.btn-contour) restylés aux valeurs charte (radius-md, uppercase display).
- `apps/web/src/app/layout.tsx` — logo header + favicon + preload ; `connexion/page.tsx` — vouvoiement ; enveloppes `modules/iam/errors.ts` — vouvoiement.
- Tests à mettre à jour : `theme.test.ts` (défaut clair), `tokens-css.test.ts` (assertions charte), `packages/shared/src/tokens.test.ts` (parité siteTokens light/dark), tests routes iam (copies vouvoiement si libellés assertés).

## Tasks & Acceptance

**Execution:**
- `apps/web/public/charte/` -- copier fonts/ + logos/ + favicon (symbole → app/icon.svg) depuis la charte.
- `packages/shared/src/tokens.ts` -- `operationsTokens` (alias `tokens` conservé) + `siteTokens` complet (light+dark, typo stacks, spacing, radius, shadow, layout) verbatim de tokens.css.
- `apps/web/src/lib/tokens-css.ts` -- émission : variables charte natives + remap --az-* vers siteTokens ; dark = bloc [data-theme=dark] de la charte.
- `apps/web/src/app/globals.css` -- intégration classes aa- (adaptées chemins), restyle boutons/champs/erreurs aux rayons et ombres charte.
- `apps/web/src/app/layout.tsx` -- header logo (2 tailles + bascule <160px), favicon, preload Barlow 700, footer « Plateforme Azzel » discret.
- `apps/web/src/lib/theme.ts` + `connexion/page.tsx` + `modules/iam/errors.ts` -- thème défaut clair (script anti-flash mis à jour) ; vouvoiement public (connexion + enveloppes iam).
- Tests -- mise à jour de theme/tokens-css/tokens + toute assertion de libellé impactée ; parité siteTokens light/dark.

**Acceptance Criteria:**
- Given un navigateur sans préférence mémorisée, when on ouvre n'importe quelle page, then le thème clair charte s'applique sans flash et la bascule sombre mémorisée fonctionne toujours.
- Given les tokens charte, when on inspecte les variables émises, then chaque valeur correspond verbatim à tokens.css et shared reste la source unique (runners compilé sans changement fonctionnel).
- Given /connexion, when on lit la page, then les textes vouvoient et l'habillage est charte (Barlow titres, crème/forêt/ocre, rayons fins) ; /espace-coureur tutoie toujours.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 23 findings — high 0, medium 5, low 14, false 2, maybe-false 0 (10 entrées patch, 2 defer, 4 rejets)
- findings (résumé) :
  - `[medium]` `[patch]` Header : 4 <img> toutes téléchargées, logo déformé (32px sans width auto), container query pleine largeur inatteignable (BH2+BH4+BH3+EC5) — un span background-image par état, aspect-ratio, media ≤480px, aria-label sur Link.
  - `[medium]` `[patch]` Champs invisibles sur cartes (bg identique) + bordure non conforme 1.4.11 (BH6).
  - `[medium]` `[patch]` Focus invisible sur CTA (focus = fond bouton) — double anneau générique (BH11).
  - `[medium]` `[patch]` Licences SIL OFL 1.1 absentes pour les woff2 redistribués (BH14).
  - `[medium]` `[patch]` Vérif existence fonts/logos aucun test (VG1+VG2, pré-vérifié) — couverts par les tests tokens/assets mis à jour avec les patchs.
  - `[low]` `[patch]` Preload Inter 400 + Barlow 800 (BH1+EC4) ; pluralisation minute(s) (EC6) ; voix : état indisponible espace-coureur repassé au tu (EC7) ; hygiène tokens (valeurs codées en dur → vars, émissions mortes supprimées, container-max, BH7+BH8+BH10) ; Link next/link + metadata « Week-end Sportif Aït Aïssi » (BH12+BH13) ; fallbacks à métriques ajustées Inter/Barlow (BH15) ; hover aa-btn--on-forest (EC3).
  - `[false]` `[reject]` BH9 — suppression du suivi système : décision produit validée (« défaut clair »), tests l'épinglent.
  - `[low]` `[reject]` BH5/EC2 — aa-nav sans menu mobile : bibliothèque aa- = scaffolding épopée 2 (aucun consommateur aujourd'hui) ; BH16 voile hero : idem, les photos arrivent avec la vitrine.
  - `[defer]` VG3 — ThemeToggle monté sans test (infra composant absente, moitié pré-peinture déjà couverte).
  - `[low]` `[reject]` IA — « 11 woff2 » de la spec : la charte en fournit 8, correction apportée à la ligne de vérification.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Identité charte Aït Aïssi appliquée au web : `siteTokens` dans shared (palette crème/forêt/ocre light+dark, Barlow Condensed + Inter auto-hébergées avec fallbacks métriques, rayons 4/6/8, shadow-card, layout) ; `operationsTokens` (ex-tokens, alias conservé) pour les surfaces jour J et l'app runners ; remap sémantique `--az-*` + variables charte natives + classes `aa-` (scaffolding épopée 2) ; header logo Aït Aïssi (span background 4 états, Link, aria) ; favicon symbole sur crème ; thème **défaut clair** (anti-flash sans matchMedia, mémorisation conservée) ; voix mixte (connexion + enveloppes iam au vous, pages coureur au tu) ; licences OFL ; preload Barlow 700/800 + Inter 400.

### Revue
4 couches — 23 constats → 10 patchs (5 medium, 5 low) corrigés et re-vérifiés (205/206 verts, 1 skip documenté) ; 2 defer ; 4 rejets motivés.

**Recommandation de re-revue : true** — 5 medium patchées ; risques nommés : (1) rendu non testé automatiquement (pas de stack composant) — contrôle visuel navigateur recommandé : https://localhost:3000 (/connexion, espace coureur, thème, étroit), (2) licences OFL rédigées par l'agent — faire relire le texte avant toute publication, (3) container query remplacée par media query ≤480px : le seuil charte « <160px » était inopérable tel quel — à revoir si la charte exigeait autre chose.

### Vérification
`pnpm test` 205 passés + 1 skip ; `pnpm build` + `pnpm typecheck` verts ; 8 woff2 + 7 SVG + 2 OFL présents.

### Risques résiduels
- Classes aa- non consommées (épopée 2) — livrées comme bibliothèque.
- Fallbacks métriques calculés via fontTools : à valider visuellement (CLS à l'échange).

## Spec Change Log

## Review Triage Log

## Design Notes

Décisions de la review du matin (validées) : voix mixte (vous public / tu coureur), logo Aït Aïssi partout + Azzel discret en pied, thème défaut clair. Le remap --az-* évite de réécrire les 6 pages : les pages consomment les mêmes noms sémantiques, seuls les fonds/couleurs/typos changent — les classes aa- servent aux prochains composants (1-6→1-9, épopée 2). Highlight/ocre réservés aux ≥ 24px (contraste 3:1) ; les libellés .meta restent en Inter (plus de mono système côté site — le mono reste dans operationsTokens pour le jour J).

## Verification

**Commands:**
- `pnpm test` -- expected: suite verte (theme/tokens mis à jour, iam/inscriptions intactes).
- `pnpm build && pnpm typecheck` -- expected: tout vert, runners inchangé fonctionnellement.
- `ls apps/web/public/charte/fonts | wc -l` -- expected: 8 woff2 (4 Barlow Condensed + 4 Inter — la charte source n'en fournit que 8).

**Manual checks (if no CLI):**
- `pnpm dev:web` → : thème clair par défaut, bascule mémorisée, logo (desktop/mobile/étroit), /connexion vouvoie avec accents Barlow, espace coureur tutoie, aucun flash au rechargement.
