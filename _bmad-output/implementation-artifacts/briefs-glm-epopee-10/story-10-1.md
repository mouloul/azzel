# Story 10.1 — PWA volontaires refondue

Projet : `/Users/mouloudhaouili/Desktop/ouidou/Azzel`, branche `feat/story-10-1-pwa-volontaires`
(partie du tip de `feat/refonte-design-epopees-9-10`, commit `78de2c6`). Tu es le développeur,
je suis l'architecte. Interdits : aucune commande git en écriture, pas de modification de
`_bmad-output/planning-artifacts/`, de `sprint-status.yaml` ni de `deferred-work.md`, aucune
dépendance installée, aucun test existant désactivé, supprimé ou affaibli. Lis d'abord
`epics.md` section « Story 10.1 » et `maquettes-refonte-design-2026-11-02.md` (artboards
`Volontaires`, `VolontairesScan`).

Baseline : 183 fichiers de test, 2473 tests, `pnpm typecheck` vert, `pnpm budget` 279 Kio.

## Constat mesuré de l'architecte — à vérifier par toi, pas à croire

Comme pour la 9.1, la rédaction de la story contient une prémisse que j'ai contrôlée dans le code :

1. **« L'écran de scan déroge à UX-DR-7 » est FAUX sur le code actuel.** `scan/scan.css` a déjà
   `.scan-voyant` à `min-height: 96px`, texte `24px` / `800`, heure mono `16px`, clignotement
   `1s steps(2)` limité à 6 s puis statique, `prefers-reduced-motion` neutralisé, voyant en
   `role="status" aria-live="assertive"` (scan-client.tsx l.592 et l.609), icônes ✓ ↻ ⚠ + texte
   intégral. **Tu ne réécris donc PAS le voyant.** Tu le vérifies (liste ce qui est conforme,
   avec ligne), tu **verrouilles ces garanties par un test** (qui lit `scan.css` : min-height ≥ 96,
   font-size ≥ 24 et weight 800 du texte, heure ≥ 16, durée d'animation ≥ 1 s, bloc
   reduced-motion présent, `aria-live="assertive"` dans le client), et tu ne corriges que
   les vrais écarts que tu trouverais (ex. cible d'appel PC, voile ≥ 96 % derrière les badges
   LIVE : mesure la valeur réelle, dis ce qu'elle est).
2. **Le vrai travail est l'adoption du socle.** `volontaires-pwa.tsx`, `bandeau-sync.tsx`,
   `page.tsx` n'utilisent presque pas les classes de la 9.1 (`.socle-*` dans `socle.css`) ;
   `volontaires.css` (446 l.) et `scan.css` (273 l.) redéfinissent leurs propres pilules, cartes,
   chips, pastilles. Fais converger ce qui est réellement équivalent (action, chip, carte,
   pastille d'état) vers les classes du socle, supprime le CSS devenu mort, garde ce qui est
   propre à ces écrans. **Rendu pixel-équivalent hors changements voulus ci-dessous** ; si une
   classe du socle diffère visiblement, dis-le au lieu de forcer.
3. **Hiérarchie (AC 2)** : la mission en cours domine l'écran, les « missions à suivre » sont
   secondaires, l'état de synchro reste visible en permanence sans masquer l'action. Audite
   la hiérarchie actuelle de la page, décris-la, puis ajuste (taille, ordre, poids) le minimum
   nécessaire. Aucun contenu supprimé.
4. **Bandeau de synchro** : textes exacts « ◷ N passages en attente » puis « ✓ envoyés — file : 0 »,
   journal de synchro en lecture seule. Vérifie qu'ils existent verbatim ; ajoute un test s'il
   n'y en a pas.

## Contraintes dures

- Hors-ligne **inchangé** : ne touche ni au service worker, ni à la file IndexedDB, ni à la
  logique de scan/sync. Les tests `sw-volontaires.test.ts`, `pwa-assets.test.ts`, `bandeau-sync.test.tsx`,
  `page.test.tsx`, `layout.test.tsx`, `page-checkpoint.test.tsx` passent **sans changement
  d'intention** (seuls des sélecteurs de markup peuvent être réalignés ; liste chacun).
- Si `socle.css` doit être précaché par le service worker pour la PWA hors-ligne, **vérifie**
  (liste d'actifs dans `pwa-assets`/`sw`) et dis ce que tu constates. Ne modifie le SW que si
  c'est strictement nécessaire, et alors dis-le en tête de rapport.
- `css-sans-litteraux.test.ts` : le décompte autorisé ne peut que décroître. `#FFD9D6` dans
  scan.css : tu peux le tokeniser si une variable adéquate existe, sinon laisse.
- Cibles ≥ 44 px (48 dp pour les cibles tactiles volontaires existantes), jamais collées au bord,
  écart ≥ 8 px. Focus visible 2 px sur tout interactif.
- `pnpm budget` reste ≤ 300 Kio.

## Livrables

1. Code + tests, `pnpm typecheck` et `pnpm test` verts (donne les nombres).
2. Rapport final **honnête** : pour chaque critère d'acceptation de la story, dis
   *mesuré* / *couvert par test (nom)* / *non vérifiable ici (pourquoi)*. Liste les fichiers
   modifiés, les sélecteurs de test réalignés, ce que tu as laissé tel quel et pourquoi.
3. N'écris pas en chinois. Pas de commit.
