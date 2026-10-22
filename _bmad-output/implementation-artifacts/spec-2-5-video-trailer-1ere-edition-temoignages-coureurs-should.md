---
title: 'Story 2.5 — Vidéo trailer 1ʳᵉ édition & témoignages coureurs (Should)'
type: 'feature'
created: '2026-10-22'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: 'dcf88ca'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-2-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** La crédibilité de la 1ʳᵉ édition ne se voit pas : ni vidéo trailer, ni témoignages de coureurs — et la matière réelle n'est pas encore fournie par le comité (question ouverte).

**Approach:** Page publique `/retour-en-images` (arborescence charte) : bloc trailer (poster = dégradé forêt + bouton lecture, vidéo chargée UNIQUEMENT au clic, jamais d'autoplay, jamais dans le budget de l'accueil), témoignages sobres (citation courte, prénom + initiales en avatar, édition de référence — jamais en carrousel), galerie 2026 (photos existantes en lazy). Configuration admin `/admin/retour-images` : URL du trailer (https, facultative) + CRUD témoignages (max 6). **Dégradation propre** : sans URL → bloc trailer absent ; sans témoignages → section absente ; la page reste complète (intro + galerie). Accueil : un lien texte « Retour en images » dans le pied de page uniquement (marge budget ~336 o).

## Boundaries & Constraints

**Always:**
- Trailer : URL vidéo https fournie par l'admin (pas d'upload) ; poster = dégradé CSS forêt (zéro image) + bouton lecture (pastille ronde, vert altitude charte, contraste ≥ 3:1 vérifié par test) ; au clic SEULEMENT, la vidéo se charge (<video controls preload="none"> ou iframe selon l'URL) ; jamais d'autoplay.
- Témoignages : citation ≤ 280 car., prénom ≤ 40, édition de référence (ex. « Trail 2026 ») ; rendu en cartes sobres (aa-card), ordre défini par l'admin, avatar = initiales (cercle charte) ; jamais de carrousel automatique.
- Galerie : photos 2026 existantes (public/charte/photos-2026, WebP 640/1280 déjà générées + jusqu'à 3 nouvelles depuis la charte, enfants exclues), lazy loading, alt descriptifs, object-fit cover — hors chemin critique, page dédiée.
- Vouvoiement public ; charte (aa-) ; contraste bouton lecture testé (fonction pure) ; budget accueil : `pnpm budget` reste vert (un seul lien texte ajouté au pied).
- Admin : requireRole organisateur, org-scopé, RLS ; suppression avec confirmation ; citation requise.

**Never:**
- Pas d'upload vidéo ni de stockage média (URL externe — YouTube/streaming du comité) ; pas de lecteur custom (natif <video>/iframe) ; pas de nouvelle dépendance.
- Pas de carrousel, pas d'autoplay, pas de son au chargement ; pas de compteur de vues.
- Pas de modification de l'accueil au-delà du lien pied de page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page complète | trailer + 3 témoignages | Poster cliquable (vidéo au clic), cartes témoignages, galerie lazy | No error expected |
| Sans trailer | url absente | Bloc trailer absent, page intacte (témoignages + galerie) | No error expected |
| Sans témoignages | table vide | Section absente | No error expected |
| URL non https | admin saisit http:// | Refus 400 champ nommé (comme gpx) | 400 enveloppe |
| Clic poster | visiteur clique | Vidéo se charge alors (réseau), pas avant (preload none) | No error expected |
| Accueil | après la story | Budget < 300 Ko (lien pied seulement) | pnpm budget vert |
| Accès coureur | /admin/retour-images | 403 | 403 enveloppe |

</intent-contract>

## Code Map

- `apps/web/src/modules/contenus/` + `sponsors/` — patterns module (store withOrg, verrou, upsert, erreurs) ; réutiliser `corps-contenu.tsx`.
- `apps/web/src/app/admin/contenus|sponsors/` — patterns UI admin (formulaires, confirmations, états).
- `apps/web/public/charte/photos-2026/` — 3 paires WebP existantes + jusqu'à 3 nouvelles (générées depuis la charte, enfants exclues).
- `apps/web/src/app/globals.css` + footer — lien « Retour en images » dans le pied (léger).
- `contrastes.test.ts`, `pnpm budget`, CI (budget déjà en CI).

## Tasks & Acceptance

**Execution:**
- `migrations/0015_retour_images.sql` -- table temoignage (id, organisation_id, citation ≤ 280 CHECK, prenom ≤ 40, edition_reference ≤ 40, ordre int, created_at) + vitrine_media_config (organisation_id pk, trailer_url nullable CHECK https ≤ 2048) ; RLS + grants (pattern 0010/0014).
- `apps/web/src/modules/retour-images/` (domain/store/service/errors) -- CRUD témoignages (max 6/org, ordre), trailer get/set, validation, lectures publiques pré-session.
- `apps/web/src/app/api/admin/retour-images/` (route + tests) -- GET/PUT config trailer + POST/PATCH/DELETE témoignages, requireRole, enveloppes.
- `apps/web/src/app/admin/retour-images/page.tsx` + manager -- URL trailer (hint https, « laissez vide si pas encore de vidéo »), témoignages CRUD avec ordre.
- `apps/web/src/app/retour-en-images/page.tsx` -- intro (bloc contenus réutilisé ou inline sobre), trailer poster dégradé + bouton lecture (chargement au clic), témoignages cartes, galerie lazy (AaPhoto réutilisé), dégradations propres.
- `apps/web/src/app/globals.css` + layout footer -- styles page + lien pied « Retour en images ».
- Tests -- contraste bouton lecture (fonction pure) ; unitaires (validation, résolution dégradations) ; intégration (CRUD org-scopé, max 6, CHECK https) ; routes stubbées ; rendu page (poster sans vidéo avant clic/preload=none, absences propres, jamais d'autoplay) ; budget re-vérifié.

**Acceptance Criteria:**
- Given un trailer configuré, when la page s'ouvre, then le poster dégradé s'affiche sans charger la vidéo, et le clic seul déclenche le chargement.
- Given aucune matière (ni trailer ni témoignages), when la page s'ouvre, then elle reste digne (intro + galerie) sans bloc vide ni erreur.
- Given l'ajout d'un lien pied de page, when `pnpm budget` tourne, then l'accueil reste < 300 Ko.


## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 27 findings — high 0, medium 4, low 19, false 0 (9 entrées patch, 1 defer, 2 rejets)
- patches (medium) : course concurrente limite 6 (advisory lock + preuve parallèle), clés React sur prénom (key=id), trailer valide-mais-invisible (avertissement admin) + lecture au premier clic (autoplay interdit au chargement, pas au geste), contraste épingle sur le CSS servi (pas les constantes seules). Patches (low) : useEffect écrasant la saisie (dirty flag), refresh inutile à la fermeture, fields non-chaîne, AbortController repli, lireErreur simplifié, ordre borné 1-9999 (+CHECK), id non-UUID 404, page publique résiliente aux erreurs non-DB, lien footer asserté, fautes fixtures, mock impossible corrigé.
- defer : interaction clic→lecteur sans test DOM (convention repo). Rejets : chunked sans content-length (convention), caractères vs octets URL (théorique), galerie non configurable (3 photos codées, matière comité attendue).

## Auto Run Result

**Statut : done.** Page /retour-en-images : trailer poster CSS pur + lecture au premier clic (chargement nul avant geste), témoignages cartes sobres (max 6, ordre borné, avatar initiales), galerie 2026 lazy, dégradations propres (sans URL/ sans témoignages / erreur non-DB), admin /admin/retour-images (URL trailer avec avertissement si non affichable, CRUD confirmé), migration 0015 (RLS, CHECK https/ordre), lien pied accueil. Vérification : 733 passés + 5 skips (56 fichiers), budget 306 904/307 200 o (marge ~1,4 Ko), migrations 0001–0015. Recommandation re-revue : true (matière réelle absente — comportement avec vraie vidéo à vérifier ; UI admin sans test composant ; marge budget fine).

## Spec Change Log

## Review Triage Log

## Design Notes

Page dédiée plutôt qu'accueil : marge budget 336 o — un lien pied (~120 o) passe, une section non. L'arborescence de la charte (« Retour en images ») prévoyait cette page. Trailer par URL : le comité hébergera la vidéo où il voudra (YouTube etc.) — <video> natif pour un lien direct, iframe si URL de plateforme (détection : hostname youtube/vimeo → iframe lazy) ; preload="none" dans les deux cas. Poster en pur CSS (dégradé forêt + silhouettes SVG existantes si trivial) : zéro octet d'image. Dégradation = absence de bloc, jamais de « bientôt disponible » qui promet.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0015, idempotent.
- `pnpm test` -- expected: verts (matrice retour-images + contraste bouton).
- `pnpm build && pnpm budget && pnpm typecheck` -- expected: verts, accueil < 300 Ko.

**Manual checks (if no CLI):**
- /retour-en-images avec/sans matière ; clic poster → vidéo ; DevTools Network : rien de vidéo avant le clic ; lien pied sur l'accueil.
