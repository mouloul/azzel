---
title: 'Story 2.1 — Page d'annonce publique minimale'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '2da8f2b'
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

**Problem:** La course n'existe pas publiquement : aucune page d'annonce pour le jalon du 15/11/2026 (ouverture des inscriptions).

**Approach:** Réécrire la page d'accueil en vitrine d'annonce (composants aa- de la charte) : hero photo 2026 avec voile forêt, chiffres officiels 2026 (stat tiles), les deux épreuves 2027, bandeau égide toujours visible, CTA « S'inscrire » vers /connexion et contact « Appeler l'équipe ». Budget mesuré : premier chargement < 300 Ko, premier rendu lisible sans attendre la photo ni les polices (fallbacks métriques + swap). Squelettes de chargement calqués sur la mise en page.

## Boundaries & Constraints

**Always:**
- **< 300 Ko** de premier chargement (HTML + CSS + JS + polices + hero) mesuré par un script (`scripts/check-budget.sh` : démarre `next start` sur un build frais, curl la page, somme les poids des ressources locales référencées) ; **premier rendu lisible sans la photo** (hero = fond forêt + voile dès le CSS, photo en lazy/swap par-dessus, jamais bloquante).
- Chiffres 2026 officiels de la charte uniquement (279 inscrits, 222 dossards, 214 finishers dont 36 femmes, 116 enfants Course Kids) — jamais additionnés, jamais inventés ; 2027 écrit comme objectif (« Objectif : 600 inscrits » si chiffre utilisé — n'en mettre aucun tant que le comité n'a pas confirmé).
- Dates : « printemps 2027 » en vitrine — la date exacte du seed édition (26/03/2027) reste interne tant que le comité ne l’a pas annoncée (recette 04/11/2026) ; lieu : stade Agni Lhoudh, Aït Aïssi (Yakouren). Mentions « à confirmer » nowhere on the page — seuls les faits sûrs.
- Bandeau égide « Sous l'égide de la Fédération et du ministère des Sports » toujours visible (forêt + on-forest, capitales espacées).
- CTA « S'inscrire » → /connexion (parcours épopée 1) ; bouton « Appeler l'équipe » (ASSISTANCE_PHONE) visible dans la section contact/infos.
- **Vouvoiement** intégral (page publique) ; composants aa- (hero, stat, card, section header avec eyebrow) ; thème clair par défaut, sombre fonctionnel ; photos 2026 en WebP 640/1280 + srcset générées dans public/ (sips ou équivalent), objet cover, voile 60–85 % côté texte, alt descriptifs.
- Accessibilité : contrastes charte (ocre ≥ 24 px), focus 2 px, reduced-motion (fondu seulement), squelettes aria-busy.

**Never:**
- Pas de GPX, carte, sponsors, page région, trailer, témoignages (stories 2-2→2-5) — pas de lien mort vers eux.
- Pas de nouvelle lib JS (aucune dépendance) ; pas de photo pleine largeur non optimisée dans le chemin critique ; pas de CDN.
- Pas de données dynamiques en base pour cette story (contenu statique de la page ; sponsors/infos pratiques = stories suivantes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Visite 3G lente | première visite, cache vide | Texte lisible immédiatement (fallbacks), photo arrive en second, total < 300 Ko | No error expected |
| JS désactivé | navigateur sans JS | Contenu complet lisible (page statique serveur), pas de blocage | No error expected |
| Thème sombre | bascule mémorisée | Hero et stats en valeurs sombres charte, photo conservée, voile assombri | No error expected |
| Mobile 360 px | viewport étroit | Une colonne, titres réduits (44–48 px), aucun scroll horizontal | No error expected |
| Budget dépassé | script check-budget | Échec explicite avec détail par ressource | Exit 1 + liste |
| Photo absente/erreur réseau | hero image 404 | Fond forêt + voile restent élégants, aucun layout cassé | No error expected |

</intent-contract>

## Code Map

- `apps/web/src/app/page.tsx` — placeholder actuel : réécrire (composant serveur, statique).
- `apps/web/src/app/globals.css` — classes aa- intégrées (hero, stat, card, section header, veil) depuis la story charte.
- `apps/web/public/charte/` — logos/fonts en place ; créer `photos-2026/` (WebP 640/1280 depuis `_bmad-output/planning-artifacts/.../charte-web-ait-aissi/photos-2026/aitaissi-2026-celebration-montagne.jpg` + 2–3 photos max, enfants exclues sans accord).
- `apps/web/src/app/layout.tsx` — header/footer existants (logo, footer « Plateforme Azzel »), bandeau égide à ajouter (layout, toutes pages).
- `packages/shared` siteTokens + `apps/web/src/lib/assistance-phone.ts` — réutiliser tels quels.
- Vouvoiement : page publique — textes neufs uniquement (aucune enveloppe d'erreur impliquée).

## Tasks & Acceptance

**Execution:**
- `apps/web/public/charte/photos-2026/` -- générer WebP 640/1280 (qualité ~80) de 3 photos max (hero conseillé : aitaissi-2026-celebration-montagne) + alts descriptifs français.
- `apps/web/src/app/page.tsx` -- vitrine d'annonce : hero (eyebrow « 2ᵉ édition — printemps 2027 », titre, lieu, CTA S'inscrire + Appeler l'équipe), section chiffres 2026 (3–4 stats officielles, labels exacts), section épreuves (Longue 35 km / Moyenne 12 km, cartes aa-), égide, footer existant.
- `apps/web/src/app/layout.tsx` + `globals.css` -- bandeau égide toujours visible (toutes pages) ; squelettes image (aspect-ratio + fond neutre, aria-busy) ; hero photo lazy/non bloquante par-dessus fond forêt.
- `scripts/check-budget.sh` -- mesure déterministe : build, start, curl / (+ assets locaux référencés, décompression gzip), seuil 300 Ko, sortie détaillée ; documenté dans README.
- Tests -- poids des assets générés (WebP ≤ 100 Ko l'unité en 640), présence des sections (rendu statique : le HTML servi contient égide, CTA /connexion, stats officielles, alts), check-budget en test d'intégration opt-in (skip si serveur injoignable).

**Acceptance Criteria:**
- Given un build frais, when `scripts/check-budget.sh` tourne, then la page d'accueil totale < 300 Ko (détail par ressource affiché) et le HTML servi contient l'égide, le CTA /connexion, les chiffres 2026 officiels.
- Given une connexion lente, when la page s'ouvre, then le texte est lisible avant l'arrivée de la photo et des polices (aucun écran blanc/attente).
- Given le thème sombre, when on bascule, then hero, stats et égide passent aux valeurs sombres charte sans casser la mise en page.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 22 findings — high 0, medium 6, low 13, false 1, maybe-false 0 (9 entrées patch, 1 defer, 3 rejets)
- findings (résumé) :
  - `[medium]` `[patch]` Hero LCP auto-saboté (lazy+low above-the-fold, test verrouillant l'anti-pattern) — eager/high sur le hero (BH1).
  - `[medium]` `[patch]` Mobiles DPR≥2 hors budget (1280 non compté, sans plafond) — art direction <picture> (640 mobile / 1280 ≥700px), crop 1280×720, plafond 120 Ko (BH2+BH6+BH4).
  - `[medium]` `[patch]` Clignotement au hydration (extinction post-mount) — CSS-first, plus d'état cachant, no-JS visible (BH3).
  - `[medium]` `[patch]` Égide du layout testée nulle part (suppression = suite verte, prouvé par mutation) — layout.test.tsx (VG1, pré-vérifié).
  - `[medium]` `[patch]` Budget jamais exécuté en routine — script racine `pnpm budget`, variable unique BUDGET_PORT, test d'intégration échoue sur HTTP non-OK (VG2 pré-vérifié + BH9+BH12+EC1).
  - `[medium]` `[patch]` Intégrité/règles assets : assertion « enfants » morte → listing réel du répertoire ; RIFF/taille ; largeur pixels réelle ; plafonds 640/1280 (BH7+EC2+EC3).
  - `[low]` `[patch]` CSS mort (.freshness/.mono-lg) + fallback rgba avant color-mix (BH8+EC7+EC6) ; robustesse check-budget (EC4+EC5).
  - `[defer]` Cycle fade-in de AaPhoto sans test DOM (VG3) — dette UI déjà tracée.
  - `[low]` `[reject]` ASSISTANCE_PHONE figé au build (page statique) — choix documenté, changement = rebuild ; next-env.d.ts churn — artefact next auto-généré ; <5 s non simulé — proxy budget assumé et documenté.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Page d'accueil = vitrine d'annonce : hero photo 2026 (picture art direction, voile forêt, eager/high, LCP propre), 4 stats officielles 2026 (279/222/214 dont 36 femmes/116, jamais additionnées), épreuves 2027 (35/12 km), bandeau égide layout toutes pages, CTA /connexion + Appeler l'équipe, squelettes CSS-first, WebP 640/1280 (crops 16:9 exacts, plafonds), script `pnpm budget` (build + mesure fil gzip, 297/300 Ko), tests contenu/assets/layout/intégration.

### Revue
4 couches — 22 constats → 9 patchs (6 medium, 3 low) corrigés (405/410 verts, 5 skips opt-in documentés) ; 1 defer ; 3 rejets motivés.

**Recommandation de re-revue : true** — 6 medium patchées ; risques nommés : (1) marge budget 3 Ko — toute dépendance nouvelle sur l'accueil fera échouer `pnpm budget` (voulu), (2) alts des photos rédigés d'après les noms descriptifs — validation comité, (3) < 5 s vérifié par proxy budget uniquement (pas de simulation 3G automatisée).

### Vérification
`pnpm test` 405 passés + 5 skips (35 fichiers) ; `pnpm build` + `pnpm typecheck` verts ; `pnpm budget` 297/300 Ko exit 0.

## Spec Change Log

## Review Triage Log

## Design Notes

Le budget < 300 Ko avec webfonts (~100 Ko préchargées : Barlow 700/800 + Inter 400) laisse ~150 Ko pour HTML+CSS+JS+photo hero : photo 640 WebP ≤ 80 Ko, le 1280 ne charge qu'en grand écran (srcset). Le hero rend lisible AVANT tout : fond forêt + voile en CSS pur, photo en calque `img` lazy — le premier rendu ne dépend d'aucune ressource réseau au-delà du HTML/CSS. UX-DR-14 (« aucune webfont ») est caduc pour le web depuis l'intégration charte (décision du 21/10, contexte épopée 2) — le budget reste la contrainte réelle, désormais mesurée par script.

## Verification

**Commands:**
- `pnpm build && bash scripts/check-budget.sh` -- expected: total < 300 Ko, détail par ressource.
- `pnpm test` -- expected: suite verte + assertions contenu page (égide, stats, CTA).
- `pnpm typecheck` -- expected: vert.

**Manual checks (if no CLI):**
- Navigateur + DevTools Network (cache désactivé, throttling 3G) : rendu lisible < 5 s, poids total confirmé ; bascule sombre ; 360 px ; JS désactivé.
