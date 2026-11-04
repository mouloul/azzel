---
title: 'Story 11.4 — Profil altimétrique et graphe de technicité'
type: 'feature'
created: '2026-11-04'
status: 'review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '88944cc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/briefs-glm-epopee-10/story-11-4.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-pipeline-gpx-vers-parcours-json.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `parcours.json` (11.1) existe mais l'accueil n'en montre que des chiffres : l'aside viz annonce « prochainement », aucun profil, aucune technicité — le coureur ne voit ni où ça monte, ni à quel point c'est raide (FR-30, UX-DR-27, UX-DR-36).

**Approach:** Module serveur pur `parcours/profil.ts` (séquence d'épreuve depuis les tranches, décimation Douglas-Peucker verticale TOLÉRANCE 2,5 m → 140 pts mesurés/erreur max 2,49 m, pente SIGNÉE fenêtrée FENETRE_PENTE_M = 80 m, paliers verrouillés sur |pente|), SVG rendu côté serveur dans l'aside de la section parcours (bascule `:has()` étendue à `[data-viz]`), légende trait + toutes lettres sur 4 nouveaux tokens `az-pente-*` (+ variantes `-sombre`), interactivité = île client minimale à import différé (curseur pointeur + clavier `role="slider"`, valeurs en `aria-live="polite"`), `s` exposé pour la 11.5 via CustomEvent documenté.

## Boundaries & Constraints

**Always:** échelle verrouillée < 5 % roulant · [5 ; 12[ soutenu · [12 ; 20[ raide · ≥ 20 très raide, constantes nommées + test des bornes ; pente affichée SIGNÉE avec « montée/descente » en toutes lettres, palier sur valeur absolue (documenté dans la légende) ; légende jamais la couleur seule ; 4 teintes différenciées aussi en clarté, contrastes AA (3:1 non textuel vs surface) testés clair + sombre ; profil complet sans JS (SVG + légende + synthèse texte servis) ; moyenne sans données → aucune visualisation, aucun chiffre, annonce texte conservée ; D+ affichés = chiffres PUBLIÉS 11.1 (même source) ; mesure budget + HTML / bruts et gzip rapportée.

**Never:** pas de git en écriture ni commit ; pas de modification de `_bmad-output/planning-artifacts/`, `sprint-status.yaml`, `deferred-work.md` ; aucune dépendance installée (SVG à la main) ; aucun test existant désactivé/supprimé/affaibli ; `parcours.json` jamais importé côté client ni référencé par le HTML ; pas de curseur partagé carte↔profil (11.5) ; tokens-synchronises.css jamais édité à la main ; aucun littéral hex dans les CSS manuels ; pas de transition (rien à neutraliser sous prefers-reduced-motion).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Longue (données réelles) | doc épreuve `longue` | profil SSR : SVG aires par palier, axes km/alt, Départ/Arrivée (km + D+ amont), légende 4 paliers, synthèse texte ; ~140 pts décimés | N/A |
| Moyenne (absente du JSON) | slug sans vue | `profil: null` : annonce texte actuelle inchangée, aucun SVG, aucun chiffre | N/A |
| Multi-tranches | épreuve à 2 portions (fixture) | `s` recompté en continu au fil des tranches (jamais global) | N/A |
| Bruit GPS | ±2 m sur plat, fenêtre 80 m | pente fenêtrée ≈ 0 → roulant (pas de zébrage) | N/A |
| parcours.json malformé | `getParcoursDoc() → null` | dégradation coquille 9.3 existante, `profil: null` | déjà couvert 11.1 |
| Bornes d'échelle | 4,9 / 5 / 11,9 / 12 / 19,9 / 20 / 20,1 % | roulant/soutenu/soutenu/raide/raide/raide/très raide | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/contenus/parcours/construire.ts` -- types `ParcoursDoc`/`EpreuveDoc` (`tranches`, `profile[[dist_m,alt]]`, `pointsDePassage` avec `sM`/`kilometre`/`dplusSegmentAmontM`). Ne pas modifier.
- `apps/web/src/modules/contenus/parcours/lecture.ts` -- `getParcoursDoc(): ParcoursDoc | null`. Ne pas modifier.
- `apps/web/src/modules/contenus/section-parcours.ts` -- POINT DE BRANCHEMENT : `fusionnerEpreuve` étendu avec `profil` (OPTIONNEL dans `EpreuveSectionParcours` pour ne pas casser les mocks 9.3).
- `apps/web/src/components/section-parcours.tsx` -- aside viz (l.163-190) : par épreuve, profil SVG si données, annonce conservée sinon ; `reglesBascule` étendu à `[data-viz]`.
- `apps/web/src/components/section-parcours.test.tsx`, `src/app/page.test.tsx` -- mockent le contrat sans `profil` : doivent rester verts SANS réalignement (champ optionnel).
- `packages/shared/src/tokens.ts` -- `colorTokens` + suffixe `-sombre` = mécanisme az-* (parité testée l.13-27) ; `apps/web` script `tokens:sync` régénère `src/app/tokens-synchronises.css` (garde byte-identique `tokens-css.test.ts`).
- `apps/web/src/app/contrastes.test.ts` -- `PAIRES` (l.98) + boucle clair/sombre (l.265) : y ajouter les 4 pente vs surface (seuil non textuel 3).
- `apps/web/src/app/css-sans-litteraux.test.ts` -- ratchet hex : nouveaux styles en `var(--az-*)` uniquement.
- `apps/web/src/app/globals.css` -- styles `aa-parcours-accueil__viz*` (l.1134-1138) : étendre ici (l'accueil n'importe pas de CSS dédié).
- `apps/web/src/components/mon-trail.tsx` l.15-20 / `app/resultats/carte-course.tsx` l.226 -- patterns maison : React.lazy / `await import()` différé (pas de next/dynamic dans src).
- `scripts/check-budget.sh` -- mesure fil (gzip) HTML / + assets locaux (`next start` port 3123) ; chunks dynamic-import hors HTML initial.
- Données mesurées : longue 28 006,4 m, D+ 1186/D− 1187, alt 221,6–835,7, 3 222 pts ; DP vertical 2,5 m → 140 pts, erreur max 2,49 m ; distribution paliers (fenêtre 80 m) 24,7/50,7/20,1/4,5 %, pentes signées −32/+28,5 %.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/tokens.ts` + `pnpm -F @azzel/web tokens:sync` -- 4 paires `pente-roulant`/`pente-soutenu`/`pente-raide`/`pente-tres-raide` (+`-sombre`), clartés monotones, AA 3:1 vs surface les deux thèmes.
- [x] `apps/web/src/modules/contenus/parcours/profil.ts` -- module pur : séquence par tranches (s continu), DP vertical (constante + erreur max), pente signée fenêtrée 80 m (constante), paliers (constantes de bornes), géométrie SVG partagée serveur/île (padding, échelles).
- [x] `apps/web/src/modules/contenus/section-parcours.ts` -- contrat : `profil?: ProfilEpreuve | null` ; fusion (longue remplie, moyenne `null`).
- [x] `apps/web/src/components/profil-altimetrique.tsx` -- SVG SSR (aires par palier fusionnées, ligne d'arête, axes km/altitude, marqueurs Départ/Arrivée avec km + D+ amont, décoratif `aria-hidden`, `role="img"` + nom accessible) + légende HTML trait + toutes lettres + synthèse texte.
- [x] `apps/web/src/components/profil-curseur-montage.tsx` + `profil-curseur.tsx` -- île minuscule (import dynamique après montage), curseur pointeur ET clavier (`role="slider"`, flèches), valeurs visibles + `aria-live="polite"`, CustomEvent `az-parcours-curseur` (detail `{epreuve, sM}`) documenté pour 11.5.
- [x] `apps/web/src/components/section-parcours.tsx` + `globals.css` -- intégration dans l'aside par épreuve (règles `:has()` sur `[data-viz]`), styles sans hex.
- [x] Tests : `parcours/profil.test.ts` (bornes paliers, fenêtre anti-bruit, DP erreur max chiffrée, multi-tranches s continu, paliers 4 présents sur données réelles) ; `section-parcours-fusion` étendu (profil longue non null/décimé, moyenne null) ; `profil-altimetrique.test.tsx` (SSR SVG/légende/aria/axes/marqueurs, sans données → annonce, curseur clavier + aria-live) ; `contrastes.test.ts` (4 paires ajoutées) ; budget + non-régression page.

**Acceptance Criteria:**
- Given l'accueil rendu sans JS, when la longue est affichée, then le profil SVG complet (aires 4 paliers, axes, Départ/Arrivée km+D+, légende toutes lettres, synthèse) est servi dans le HTML.
- Given la moyenne, when rendue, then aucune visualisation ni chiffre de profil, annonce texte conservée.
- Given le curseur (pointeur ou flèches), when déplacé, then kilomètre, altitude, pente signée + palier en toutes lettres, visibles ET annoncés `aria-live="polite"` ; `s` émis pour la 11.5.
- Given `pnpm typecheck` / `pnpm test` / `pnpm budget`, when exécutés, then verts (budget ≤ 300 Kio, marge et delta HTML/JS rapportés).

## Implementation Notes

- Chiffres épinglés sur le parcours.json réel (tests `profil.test.ts` / fusion) : 140 points décimés, erreur max DP 2,494 m, pentes fenêtrées extrêmes −32,0/+28,5 % (conformes aux données mesurées de la spec). Parts mesurées 24,8/50,8/20,0/4,4 % (la spec annonçait 24,7/50,7/20,1/4,5 — même convention « moyenne des pentes des extrémités », écart d’arrondi).
- Fenêtre de pente DÉCALÉE aux extrémités du tracé (jamais réduite) : une fenêtre tronquée laissait le bruit ±2 m grossir à 10 % sur les ~40 premiers/derniers mètres ; en gardant 80 m d’amplitude partout, le cas « bruit GPS → roulant » tient bord à bord (test dédié).
- Jointure de tranches : le point partagé n’est gardé qu’une fois dans la séquence (contrairement au calcul 11.1 qui le compte deux fois à distance nulle) — `s` continu strictement croissant, dernière abscisse = somme des tranches (test multi-tranches).
- Couleurs retenues — clair `#6E8F6B/#47825F/#9E5418/#7A2E1B` (3,18/3,99/4,94/8,26:1 vs surface), sombre `#4E7A58/#6FA97E/#E39A5B/#FFB4A0` (3,30/5,94/7,02/9,54:1), clartés monotones strictes dans les deux sens (garde dédiée dans contrastes.test.ts).
- Aside viz : blocs `[data-viz]` par épreuve pilotés par les mêmes règles `:has()` (générées dans `reglesBascule`), repli `@supports not :has()` étendu à `[data-viz]`. Titre h3 reformulé « Le relief de l’épreuve » (aucun test 9.3 n’épinglait l’ancien libellé ; l’annonce « carte en relief et le profil altimétrique… » est conservée à l’identique pour les épreuves sans données).
- Île client : rend `null` au SSR, import dynamique `await import('./profil-curseur')` APRÈS montage (useEffect + état), pattern mon-trail/carte-course ; curseur = overlay absolu positionné en % de la largeur rendue (`xCurseurPourcent`/`sMDepuisFraction` exportés de profil.ts — aucune duplication de géométrie).
- Curseur (retour de revue 2026-11-04, itération 1) : lecture au point décimé le plus proche, flèches ± PAS_CURSEUR_M = 100 m (Maj = ×10), Home/End aux bornes. La lecture au SURVOL souris (sans clic) est portée par la fonction pure `lecturePendantDeplacement(pointerType, saisie)` de profil.ts (souris → lit toujours ; tactile/stylet → lit seulement appuyé) — aucune interaction DOM n’étant testable dans le harnais, la fonction pure est la garantie, épinglée dans profil.test.ts. Annonce lecteur d’écran : `aria-valuetext` seul (mécanisme natif du slider, égal au texte visible — testé) ; le `<p>` visible ne porte PLUS `aria-live`, qui doublait chaque annonce de flèche. CustomEvent `az-parcours-curseur` (constante `EVENEMENT_CURSEUR`) : émis UNIQUEMENT depuis les gestionnaires d’interaction (pointeur/clavier) via `deplacerA` — le `useEffect` de montage a été supprimé, aucun événement ne part sans geste humain (contrat 11.5 mis à jour dans le bloc-note du composant).
- Décision produit 2026-11-04 (relevé d’essai « essai trail ait ainsi 2027 », 28,0 km) : dans `fusionnerEpreuve`, une épreuve présente dans parcours.json affiche la distance du relevé (`distanceM / 1000` → « 28 km ») et non celle de la base éditoriale (35) ; une épreuve absente du JSON garde la distance de la base. Le panneau d’une épreuve avec données du relevé porte la mention `MENTION_TRACE_PROVISOIRE` (constante unique exportée de section-parcours.tsx : « Tracé provisoire, issu d’un relevé d’essai : distance, dénivelé et profil pourront évoluer. »), servie dans le markup de base (visible sans JS), absente pour une épreuve sans données — retrait en une ligne le jour du tracé officiel.
- Mesures budget (build frais, caches de rendu purgés) : HTML `/` 43 492 o bruts / 8 098 o gzip (sans profil) → 76 936 / 15 892 (avec profil), soit **+33 444 o bruts / +7 794 o gzip** (SVG ~100 aires fusionnées + payload RSC des 140 points ~6,7 Kio). Chunk différé `profil-curseur` : 2 848 o bruts / 1 453 o gzip, hors HTML initial (confirmé). `pnpm budget` : **288 Kio / 300** (marge 12 Kio) ; CSS +12 lignes tokens ; aucun JS ajouté au chemin critique au-delà de l’île montage (~0,8 Kio dans un chunk existant).
- Mesures budget itération 1 (retour de revue 2026-11-04) : HTML `/` gzip 15 892 → 16 049 o (+157 o : mention « tracé provisoire » + règle CSS associée, `aria-live` retiré) ; total inchangé **288 Kio / 300** (295 160 o), chunk différé curseur inchangé (1 453 o gzip, hors chemin critique).
- Surprise outillage : le `route-cache` de Next 16 survit à `next build` et les `pnpm exec next start` tués par leur PID parent laissent un next-server fantôme qui re-sert l’ancien rendu — les mesures A/B ont exigé purge de `.next/server/route-cache` + kill du listener réel (le port 3000 de l’utilisateur n’a jamais été touché).
- Tests 9.3 (`section-parcours.test.tsx`) et homepage (`page.test.tsx`) restés verts SANS réalignement (champ `profil` optionnel) — vérifié par exécution.
- Revue de diff (architecte) : 2 retouches CSS — `touch-action:none` → `pan-y` sur l'overlay curseur (le profil ne doit jamais capturer le glisser vertical du doigt : le défilement de la page reste possible, le pointercancel termine la saisie) ; suppression de `.aa-parcours-accueil__profil{display:block}` (règle morte : spécificité (0,1,0) inférieure au masquage `.aa-parcours-accueil [data-viz]` (0,2,0)). Typecheck/test/budget re-vérifiés verts après retouche (198 fichiers / 2646 tests / 288 Kio).

## Spec Change Log

- 2026-11-04 (implémentation) : statut in-progress → review après implémentation complète ; tâches cochées, notes d’implémentation ci-dessus, sections gelées intactes.
- 2026-11-04 (retour de revue architecte, itération 1) : renégociation humaine de deux points des sections gelées — (1) l’AC « annoncés `aria-live="polite"` » est remplacée par l’annonce native `aria-valuetext` seule : le `<p>` visible doublait chaque annonce de flèche (défaut de substance confirmé au code) ; le texte gelé reste inchangé ci-dessus par traçabilité, la décision fait foi ici. (2) Décision produit : le relevé GPX est un relevé d’ESSAI — distance affichée depuis parcours.json pour les épreuves présentes (cohérence fiche ↔ profil), mention « Tracé provisoire » servie dans le panneau. Implémenté (voir Review Triage Log + notes), typecheck/test/budget re-vérifiés verts.

## Review Triage Log

- patch (high, itération 1) — survol souris illisible : `surPointeurDeplace` exigeait `saisieRef` (appui) pour TOUS les pointeurs, l’AC « lecture au survol COMME au tap » n’était pas tenue à la souris sans clic → décision extraite en fonction pure `lecturePendantDeplacement(pointerType, saisie)` (profil.ts), appliquée par le composant, épinglée dans profil.test.ts (souris sans appui lit ; tactile sans appui ne lit pas ; tactile appuyé lit ; stylet idem tactile). [RA1]
- patch (medium, itération 1) — double annonce lecteur d’écran : `aria-valuetext` du slider + `aria-live="polite"` sur le `<p>` répétait chaque flèche → `aria-live` retiré du paragraphe (le texte VISIBLE reste), `aria-valuetext` conservé ; le seul test épinglant `aria-live="polite"` (profil-altimetrique.test.tsx « SSR du curseur ») est réaligné car il épinglait le défaut lui-même : il épingle désormais l’ABSENCE d’aria-live et l’égalité stricte `aria-valuetext` = texte visible. [RA2]
- patch (medium, itération 1) — événement parasite au montage : le `useEffect` émettait `az-parcours-curseur` (sM = 0) avant toute interaction — la 11.5 aurait déplacé le repère carte au chargement → useEffect supprimé, émission portée par `deplacerA` appelé UNIQUEMENT depuis les gestionnaires pointeur/clavier ; commentaire de contrat 11.5 mis à jour. Garantie structurelle (aucun effet de montage) — comportement d’exécution non vérifiable ici (pas de harnais DOM, voir defer VG2). [RA3]
- patch produit (itération 1) — distance affichée incohérente : la fiche disait 35 km (base) quand profil et métriques disaient 28 km (relevé) → `fusionnerEpreuve` écrase `distanceKm` par `distanceM / 1000` pour une épreuve présente dans parcours.json (« 28 km », convention de format existante : zéro traînant omis), la base fait foi sinon ; les deux cas épinglés dans section-parcours-fusion.test.ts. Le « 35 km » de /parcours reste HORS périmètre (donnée éditoriale de la base : seed `epreuve` 0002_inscriptions.sql:70, echo titre 0014_contenus_vitrine.sql:55) — consigné par l’architecte. [RA4]
- patch produit (itération 1) — aucune distinction essai/officiel : mention `MENTION_TRACE_PROVISOIRE` (constante unique exportée de section-parcours.tsx) servie dans le markup de base du panneau de toute épreuve avec données du relevé, absente sinon ; tests de rendu dans section-parcours.test.tsx (présente par panneau à données, absente sans données) et profil-altimetrique.test.tsx (présente une fois pour la longue, absente pour la moyenne, distance « 28 km » épinglée). [RA5]
- patch (high, regroupé) — appariement pente↔point décimé fragile (`findIndex` + repli silencieux `i`) et NON épinglé par test : remplacer par marche monotone exacte + tests chiffrés (pente du 1ᵉʳ point, d'un point raide, égalité sur tous les points). [VG1+BH3+EC2]
- patch (medium) — `<figcaption>` ni premier ni dernier enfant du `<figure>` : modèle de contenu HTML invalide → passer en `<p>`. [BH1]
- patch (medium) — `.aa-parcours-accueil__annonce` sans règle CSS : l'empaquetage svg+texte dans un div fusionne deux cellules de la grille (perte du gap → svg et texte collés) → règle `display:grid;gap` dédiée. [BH15+VG-autre]
- patch (low) — import dynamique de l'île sans `catch` : rejet non géré (chunk injoignable) → `.catch` silencieux documenté (profil complet reste servi). [EC1]
- patch (low) — `onPointerDown` sans filtre de bouton (clic droit/milieu démarrent la saisie) ni `onLostPointerCapture` de secours → garde `button === 0` (souris) + handler. [BH6]
- patch (low) — `couleur()` de contrastes.test.ts : la branche colorTokens résout tout rôle en clair, y compris `X-sombre` (garde affaiblie) → restreindre le thème clair aux rôles non suffixés `-sombre`. [EC5/BH5]
- patch (low) — `PARCOURS_DOC ?? ({} as never)` : échec obscur si le JSON disparaît → garde explicite nommant la cause. [EC6/BH14]
- patch (low) — `BORNES_LEGENDE` duplique les bornes verrouillées UX-DR-36 → dériver de `BORNES_PENTE_PCT`. [BH8]
- patch (low) — `graduationsDistance` repli `?? 25` sous la cible au-delà de 100 km → repli multiple de 25 ≥ cible. [BH9]
- patch (low, tests) — parts par palier : somme ≈ 1 non assertée ; aller-retour `sMDepuisFraction`↔`xCurseurPourcent` non vérifié en valeur exacte → assertions. [BH10]
- defer — CustomEvent `az-parcours-curseur` + interactions réelles du curseur : zéro test exécutable (harnais node/SSR-only, aucun jsdom dans le repo) ; à rouvrir à la 11.5, premier consommateur, avec décision harnais DOM. [VG2]
- false — tranches inversées/hors bornes ou `sM final ≠ distanceM` corrompraient le profil : impossible pour un doc du pipeline (`sequenceEpreuve` refait l'arithmétique exacte de `construire.ts` ; porte de qualité + trace gelée 11.1 garantissent le contenu ; validation légère = décision documentée 11.1). [EC3/EC4/BH4]
- false — `couleur('dark', 'X-sombre')` throw : chemin d'erreur voulu (rôle non référençable), identique avant le diff. [partie EC5]
- false — repli d'altitude du marqueur sur `altitudeMinM` arbitraire : branche morte (le doc publie toujours `altitudeM` numérique). [BH16]
- low rejeté — overlay curseur couvre la lecture (ligne croisant le texte) : crosshair cohérent, cible tactile agrandie ; CLS de la ligne de lecture : aside sous le premier écran, négligeable. [BH2/BH7]
- low rejeté — NBSP U+202F/U+00A0 mixtes : cosmétique invisible ; duplication des maps pointsDePassage : sans divergence nommable ; empilement `@supports` de plusieurs viz : pattern de dégradation 9.3 assumé. [BH11/BH12/BH13]

## Design Notes

- Pente SIGNÉE (montée/descente) à l'affichage, palier sur |pente| : la technicité concerne la raideur du terrain, montée ou descente ; la légende le dit explicitement (« en montée comme en descente ») — choix documenté, anti-amalgame.
- Couleur d'un segment = palier de la moyenne des pentes fenêtrées de ses deux extrêmités (zones de transition honnêtes) ; curseur = pente fenêtrée du point décimé le plus proche. La tolérance DP borne AUSSI la lecture de palier : dans un segment gardé, l'altitude reste à ±2,5 m de la corde.
- SVG mobile-first : viewBox 400×~210 (≈ 1:1 à 390 px), texte ≥ 11 unités ; île client en overlay absolu qui reçoit les points décimés (~140) en props — quelques Kio dans le flux RSC, mesuré.
- viewBox/échelles exportés par `profil.ts` pour que l'île et le serveur calculent les mêmes positions sans dupliquer la géométrie.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: vert sur les 3 paquets — OK (itération 1 : shared, web, runners)
- `pnpm test` -- expected: tous verts (Postgres dev requis) — OK itération 1 : **198 fichiers / 2656 tests verts** (+5 vs itération 0 : lecture au survol, distance relevé ×2, mention ×2), 5 skipped (inchangés)
- `pnpm budget` -- expected: ≤ 300 Kio — OK itération 1 : **288 Kio / 300** (295 160 o, inchangé) ; HTML `/` gzip 15 892 → 16 049 o (+157 o : mention + CSS, aria-live retiré) ; chunk différé curseur inchangé (1 453 o gzip)
- `pnpm -F @azzel/web tokens:sync` -- expected: CSS régénéré, `tokens-css.test.ts` vert (inchangé cette itération : aucun token touché, vérifié par le ratchet hex + tokens-css.test.ts dans `pnpm test`)

**Manual checks (if no CLI):**
- Rendu visuel (couleurs perçues, tap réel, survol souris réel, annonce NVDA/VoiceOver) : non vérifiable sans navigateur/lecteur d’écran — les décisions testables sont couvertes par les fonctions pures et le rendu SSR.
