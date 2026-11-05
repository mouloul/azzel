---
title: 'Story 9.6 — Non-régression de la vitrine refondue'
type: 'verification'
created: '2026-11-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '71e72b0'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/maquettes-refonte-design-2026-11-02.md'
---

> **Spec reconstituée a posteriori (2026-11-03).** Story de vérification implémentée à partir d'un brief
> (`briefs-glm-epopee-9/story-9-6.md`) ; ce document consigne ce qui a été demandé, mesuré et décidé.
> **Aucune revue de code `bmad-code-review` n'a été passée.**

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** les stories 9.1 à 9.5 ont refondu la vitrine. Il faut la preuve chiffrée qu'elle n'a rien dégradé : poids, focus, cibles tactiles, contraste, zoom, mouvement.

**Approche :** mesurer, sans jamais déclarer « conforme » une garantie qui n'a pas pu l'être. Chaque cellule du tableau de mesure est classée **mesurée**, **couverte par un test** ou **non vérifiable ici**.

## Boundaries & Constraints

**Always :**
- Un défaut introduit par 9.1 à 9.5 n'est corrigé que s'il tient en quelques lignes, sans ambiguïté, avec un test qui l'aurait attrapé ; sinon il est décrit pour le travail différé.
- Les scénarios de recette sont corrigés, jamais supprimés ; les ajouts décrivent ce qui est réellement affiché (aucun chiffre de parcours inventé).
- Le serveur de build est tué à la fin ; aucun serveur résiduel.

**Never :**
- Aucune commande git en écriture, aucune dépendance installée, aucun test affaibli.

## Décisions prises

- **Harnais CDP hors du dépôt** (Chrome headless, Node 22 natif, zéro dépendance) : viewport par `Emulation.setDeviceMetricsOverride`, poids par `encodedDataLength` cache désactivé, focus par vraies tabulations, contraste par compositing canvas photo + voile + socle (pire fenêtre de 8 px), mouvement par `Emulation.setEmulatedMedia`. **Deux pièges de mesure trouvés et écartés** : Chrome headless démarre en `prefers-reduced-motion: reduce`, ce qui faussait l'absence d'animations ; `color-mix()` se sérialise en `color(srgb …)` et le premier parseur ratait le socle du hero, d'où un faux 2,6:1 (valeur réelle 3,7:1).
- **Deux défauts 9.x corrigés** : cibles de 25,5 px sur les liens texte de l'accueil (`.aa-lien-texte`, portée six pages) ; défilement horizontal à 200 % sur `/resultats` (265 → 227 px, le résidu est antérieur à l'épopée 9).
- **Défauts antérieurs à l'épopée 9 non corrigés**, consignés : débordement à 200 % sur toutes les pages (`header-actions`, onglet « Mon trail »), liens de pied de page, skip-link à 43,5 px.
- **Réalignement de trois recettes** (épopées 1, 2 et 7), au-delà de l'épopée 2 seule exigée par la story, parce que 9.4 et 9.5 ont changé des écrans qu'elles décrivent.

## I/O & Edge-Case Matrix

| Cas | Comportement attendu |
| --- | --- |
| `/`, `/resultats`, `/parcours`, `/region`, `/connexion` | mesurés au harnais |
| `/inscription`, `/acceptations`, `/preuve`, `/espace-coureur` | redirigent vers `/connexion` sans base : non vérifiables à l'écran, couverts par des tests de feuille de style |
| Texte sur photo | contraste calculé par compositing, pas lu sur une valeur |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/globals.css` — `.aa-lien-texte` : `display:inline-flex; min-height:44px`
- `apps/web/src/app/resultats/resultats.css` — `min-width: 0`, grilles `auto-fit`, `flex-wrap`
- `apps/web/src/app/resultats/resultats-css.test.ts` — nouveau, 5 tests
- `apps/web/src/app/page.test.tsx` — un test ajouté (cibles ≥ 44 px)
- `scenarios-recette-epic-1.md` (+3 pas), `-epic-2.md` (2 pas corrigés, 5 ajoutés), `-epic-7.md` (+5 pas)

## Tasks & Acceptance

- [x] Mesure sur cinq écrans, sept critères
- [x] Défauts 9.x corrigés avec test
- [x] Défauts antérieurs décrits pour le travail différé
- [x] Trois recettes réalignées
- [x] Serveur de build tué

## Implementation Notes

**Constat majeur : le budget de `pnpm budget` n'est pas le poids transféré.** Mesuré : 321,2 Kio sur `/`, 334,7 sur `/resultats`, 300,5 sur `/connexion`, dont environ 68,5 Kio de polices non préchargées. Le script ne compte que les ressources référencées par le HTML ; le retrait du préchargement de Barlow 700 (story 9.3) a donc sorti 22 Ko du décompte sans les retirer de la page. Voir `deferred-work.md` et la correction de la spec 9.3.

## Spec Change Log

- 2026-11-03 — aucun changement d'intention.

## Review Triage Log

**Revue de code `bmad-code-review` : non passée.** Contrôles effectués : aucune ligne de test supprimée ; recettes additives (les deux lignes retirées de l'épopée 2 sont les deux pas corrigés) ; audit de la portée de `.aa-lien-texte` (six pages) ; vérification qu'aucun serveur ne reste en écoute ; exécution indépendante de typecheck, tests et budget. **Cette vérification a révélé que mon propre arbitrage de budget (9.3) avait été présenté comme un gain d'octets alors qu'il n'en était pas un.**

## Verification

- `pnpm typecheck` : vert
- `pnpm test` : 183 fichiers, 2473 passés (+6), zéro échec
- `pnpm budget` : 286 065 octets, 279 Kio (chemin critique, voir ci-dessus)
