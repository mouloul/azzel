---
title: 'Story 2.2 — Identité Village : piliers, frises, contrastes'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '5c21191'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-2-context.md
warnings: []
deferred: []
---

> **Habillage remplacé par la story 9.2 — Accueil refondu (épopée 9, décision du 2026-11-02).**
> Les critères d'acceptation ci-dessous restent exigibles et sont repris tels quels
> dans la story de refonte : seule la mise en forme des écrans change. Le statut de
> cette story et sa recette restent dus.

<intent-contract>

## Intent

**Problem:** La vitrine ne respire pas encore l'identité kabyle du village : les quatre piliers (sport, santé, citoyenneté, écologie) et les seuils décoratifs manquent — la crédibilité « portée par son village » ne se voit pas (UX-DR-3/4).

**Approach:** Section « piliers » sur l'accueil : quatre cartes sobres, chacune avec un petit glyphe SVG inline (20–24 px, monochrome) — ⵣ Yaz (sport), tala la fontaine (santé), tabzimt la fibule (citoyenneté), ingel le cèdre (écologie) — dessinés simples et géométriques, jamais médaillon ni mascotte. Frise décorative géométrique en seuils (tête/pied de la vitrine) + ligne de crête ocre 1,5 px sous le bloc titre du hero (charte), `aria-hidden`, jamais derrière du texte. Contrastes AA+ **prouvés par test** (fonction pure sur siteTokens : paires texte/fond ≥ 4,5:1, deux thèmes).

## Boundaries & Constraints

**Always:**
- Glyphes : SVG inline 20–24 px, trait simple, monochrome (accent/heading selon fond), alternance textuelle uniquement si porteuse de sens (sinon aria-hidden) ; signes sobres et sourcés — ⵣ Yaz, fontaine, fibule, cèdre : formes reconnues, aucune signification inventée.
- Interdits absolus (testés) : le mot « Tafsut » nulle part dans les pages/contenus rendus ; pas de médaillon/cartes autour des glyphes seuls, pas de mascotte, pas de drapeau amazigh, pas de symbole politique ou sacré.
- Frise : bandeau SVG géométrique simple (motifs triangulaires/triangles imbriqués), monochrome forest/accent, opacité ≤ 85 %, hauteur ≤ 24 px, en tête et pied de la vitrine, `aria-hidden`, jamais superposée à du texte ; ligne de crête ocre (1,5 px) sous le titre du hero.
- Piliers : libellés exacts Sport / Santé / Citoyenneté / Écologie + une ligne concrète chacun (faits 2026/lieux, aucune invention) ; vouvoiement.
- Contrastes : test unitaire calculant les ratios des paires utilisées (ink/surface, ink-muted/surface, on-forest/forest-surface, accent/surface en ≥ 24 px uniquement documenté, on-action/action, focus) dans les DEUX thèmes depuis siteTokens — ≥ 4,5:1 texte courant ; le test échoue si une paire utilisée en < 24 px descend sous 4,5:1.
- Budget maintenu : `pnpm budget` doit rester < 300 Ko (SVG inline = quelques centaines d'octets).

**Never:**
- Pas de webfont supplémentaire (Tifinagh en texte interdit — glyphes en SVG uniquement), pas de lib, pas d'image bitmap nouvelle.
- Pas de nouvelle page (la section vit sur l'accueil) ; pas de sponsors/région/trailer (stories suivantes).
- Pas de section dédiée « culture amazighe » — les piliers sont la vitrine des valeurs, rien d'autre.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Visite accueil | page publique | Section piliers : 4 glyphes + libellés, frise en tête et pied, crête sous le titre | No error expected |
| Thème sombre | bascule | Glyphes/frise en valeurs sombres, contrastes tenus (test) | No error expected |
| Lecteur d'écran | navigation SR | Frise et crète ignorées (aria-hidden), piliers lisibles (libellés texte) | No error expected |
| Budget | pnpm budget | < 300 Ko maintenu | Exit 1 sinon |
| Interdits | rendu statique | Aucun « Tafsut », pas de médaillon autour d'un glyphe seul | Test rouge sinon |

</intent-contract>

## Code Map

- `apps/web/src/app/page.tsx` — ajouter la section piliers (entre épreuves et contact) ; frise en tête/pied de la section vitrine principale.
- `apps/web/src/components/` — nouveau `glyphes-piliers.tsx` (4 SVG inline) + `frise.tsx` (bandeau SVG paramétrable couleur/hauteur) ; composants serveur purs.
- `packages/shared/src/tokens.ts` — siteTokens light/dark : source du test de contrastes (fonction luminance/ratio dans le test ou dans shared — test only).
- `apps/web/src/app/page.test.tsx` + `layout.test.tsx` — étendre : glyphes présents (4), aria-hidden sur frise/crête, interdits (Tafsut, médaillon), libellés piliers.
- `apps/web/public/charte/photos-2026/` — aucun changement.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/components/glyphes-piliers.tsx` -- 4 SVG inline sobres (Yaz, fontaine, fibule, cèdre), 20–24 px, currentColor.
- `apps/web/src/components/frise.tsx` -- bandeau géométrique SVG (répétition simple), + classe crête (ligne 1,5 px ocre) sous le titre hero.
- `apps/web/src/app/page.tsx` -- section piliers (4 colonnes → 2 colonnes mobile), lignes concrètes ; frise en seuils ; vouvoiement.
- `apps/web/src/app/contrastes.test.ts` (ou dans tokens tests) -- ratios WCAG des paires utilisées, deux thèmes, seuils (courant 4,5:1).
- Tests rendu -- piliers/glyphes/aria/interdits dans page.test.tsx ; budget re-vérifié.

**Acceptance Criteria:**
- Given l'accueil rendue, when on inspecte la section piliers, then les quatre glyphes SVG sont présents avec leurs libellés, aucun médaillon, et « Tafsut » n'apparaît nulle part.
- Given les deux thèmes, when le test de contrastes tourne, then chaque paire texte/fond utilisée atteint le seuil WCAG (4,5:1 courant) — échec sinon.
- Given `pnpm budget`, when la page est mesurée, then le total reste < 300 Ko.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 18 findings — high 0, medium 2, low 13, false 0, maybe-false 0 (6 entrées patch, 2 rejets implicites)
- findings (résumé) :
  - `[medium]` `[patch]` Eyebrow « Contact » échouant AA en sombre (3,35:1) et paire absente du test (VG1, pré-vérifié, ratios recalculés) — on-forest sur la bande forêt + paire ajoutée.
  - `[medium]` `[patch]` var(--az-space-8) inexistant (marges effondrées) — échelle charte ; 4 occurrences additionnelles de la 2-1 corrigées à la main (.aa-section__actions/.aa-cards/.aa-galerie).
  - `[low]` `[patch]` couleur() strict (rôle absent du thème = échec) + paires manquantes (focus/forest-surface 2,23:1 corrigé légitimement par outline on-forest sur bandes forêt, accent/surface-raised, action-hover) + interdite ink-muted/forest garée négativement (BH2+BH3+EC4+BH7) ; piliers 1 colonne < 640 px + tokens (BH1+BH4) ; Frise useId + NaN + clamp testés (BH6+EC2+EC3) ; garde glyphes sur bloc svg complet + data-glyphe kabyles (yaz/tala/tabzimt/ingel) + plage 20–24 (BH5+VG2+IA).
  - `[low]` `[reject]` IA — « Tafsut » à l'échelle produit : rendu des deux surfaces vitrine couvert, liste noire lexicale assumée ; crête (charte verbatim) hors énumération du snippet : présente dans la charte intégrée.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Section piliers (4 glyphes SVG kabyles sobres yaz/tala/tabzimt/ingel, libellés + faits concrets, 1/2/4 colonnes responsives), frise géométrique en seuils + crête ocre sous le titre (aria-hidden, jamais sous texte), test de contrastes WCAG sur siteTokens deux thèmes (13+ paires, strict, interdites gardées, exemption décoratives documentée), correction AA vivante (eyebrow contact sombre) et outline focus sur bandes forêt, bug tokens spacing corrigé.

### Revue
4 couches — 18 constats → 6 patchs (2 medium, 4 low) corrigés (460/465 verts) ; rejets motivés.

**Recommandation de re-revue : true** — 2 medium patchées dont une violation AA vivante ; risques nommés : (1) budget 299/300 Ko — marge 1 Ko pour 2-3/2-4 (levier documenté : alléger le preload police), (2) glyphes dessinés par l'agent — validation visuelle comité recommandée, (3) contrastes testés au niveau tokens (proxy), pas sur photo composite.

### Vérification
`pnpm test` 460 passés + 5 skips (37 fichiers) ; `pnpm build` + `pnpm typecheck` verts ; `pnpm budget` 299/300 Ko exit 0.

## Spec Change Log

## Review Triage Log

## Design Notes

Couleurs des glyphes : currentColor hérité (heading sur fond clair, on-forest sur forest-surface) — la charte prime sur le « monochrome sapin » de UX-DR-3/4 (Djurdjura supplanté, décision 21/10). Formes : Yaz = le caractère tifinigue ⵣ simplifié en path ; fontaine = coupole + filet d'eau stylisé ; fibule = triangle double ; cèdre = sapin stylisé — géométrie minimale, trait 1,5–2 px, aucun remplissage. La frise reprend les triangles imbriqués des tapis kabyles en répétition CSS (SVG en background répété ou flex d'SVG) — sobriété : une seule couleur, opacité réduite.

## Verification

**Commands:**
- `pnpm test` -- expected: verts incl. contrastes + interdits.
- `pnpm build && pnpm budget` -- expected: < 300 Ko.
- `pnpm typecheck` -- expected: vert.

**Manual checks (if no CLI):**
- Accueil : glyphes nets, frise discrète, thème sombre, navigation SR rapide (VoiceOver : frise ignorée).
