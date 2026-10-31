---
title: 'Accueil façon UTMB et onglet « Mon trail »'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c1f5610d5a2a4ad83d23174a03a1528c43049a87'
baseline_tree: 'f35ad819b1d9a1a6c8b26a9223051908bb0afa2c' # arbre de travail non commité au démarrage (main sale) : diff à faire contre cet arbre
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-charte-web-integration.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'accueil ne plaît pas (hero bas et tassé à gauche, rien d'immersif), et il n'existe aucun point d'entrée visible pour se connecter ou s'inscrire selon son rôle — seul un bouton « S'inscrire » mène à `/connexion`.

**Approach:** Refaire le hero sur le modèle de montblanc.utmb.world/fr/races/UTMB (photo plein écran sous voile, en-tête posé sur la photo, titre centré, bandeau date, badge épreuves en bas à gauche) et ajouter un onglet vertical « Mon trail » fixé au bord droit, qui ouvre un encart « Me connecter » / « M'inscrire » ; après connexion, chaque rôle aboutit dans son espace.

**Décisions (31/10) :**
- Encart = deux boutons vers la page de connexion existante (pas de formulaire dans l'encart).
- « M'inscrire » = même flux email + code, écran titré « Créer mon compte », puis arrivée sur le formulaire `/inscription`.
- Coureur connecté = première étape non faite du dossier (`/inscription` → `/acceptations` → `/preuve`), dossier complet ou illisible → `/espace-coureur`. Organisateur → `/admin/dossiers`, volontaire → `/volontaires`, quel que soit le bouton.
- Onglet présent partout sauf sous `/admin` et `/volontaires`.

## Boundaries & Constraints

**Always:**
- Charte Aït Aïssi : tokens existants, voile du hero entre 60 et 85 %, ocre réservé aux textes ≥ 24 px, cibles ≥ 44 px, focus visible, thèmes clair et sombre.
- Accueil en ISR (`revalidate = 60`) : aucune lecture de cookie serveur dans la page ni le layout ; l'onglet lit la session côté client (`/api/auth/session`), à l'ouverture de l'encart seulement.
- Budget `scripts/check-budget.sh` tenu (< 307 200 octets) ; photo hero 640 en mobile, 1280 ≥ 700 px, eager + fetchpriority high.
- Encart accessible : `aria-expanded`/`aria-controls`, Échap et clic extérieur ferment, focus dans l'encart à l'ouverture et rendu à l'onglet à la fermeture, `prefers-reduced-motion` respecté.
- Redirections : chemins relatifs internes uniquement (`destinationApresConnexion` conservée).

**Never:**
- Pas de nouveau mode d'authentification ; contrat natif de `/api/auth/verify` (`client: 'native'`) inchangé.
- Pas de modification des gardes de rôle ni de `homePathForRole`.
- Pas de webfont ni de bibliothèque UI ; contenu des sections sous le hero inchangé.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Visiteur ouvre l'onglet | Pas de session | « Me connecter » (`/connexion`) et « M'inscrire » (`/connexion?parcours=inscription`) | N/A |
| Déjà connecté | Session valide | « Mon espace » (espace du rôle) + « Me déconnecter » | Session illisible → encart anonyme |
| Organisateur / volontaire | Code valide, l'un ou l'autre bouton | `/admin/dossiers` / `/volontaires` | N/A |
| Nouveau coureur | Code valide, aucun dossier | `/inscription` | N/A |
| Coureur inscrit, conditions non cochées | Code valide | `/acceptations` | N/A |
| Coureur sans preuve | Épreuve + conditions faites | `/preuve` | N/A |
| Dossier complet | Tout fait | `/espace-coureur` | N/A |
| Prochaine étape sans lien | Inscriptions fermées, aucun dossier | `/espace-coureur` | État dossier en erreur → `/espace-coureur` |
| Mobile 360 px | Onglet fermé | Onglet visible sans masquer le contenu ; encart pleine largeur | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/page.tsx` -- hero actuel (`aa-hero`, `AaPhoto` couverture, `Crete`, CTA `/connexion`) ; sections suivantes à garder telles quelles.
- `apps/web/src/app/globals.css:786-794,1061-1100` -- styles `aa-hero*` (minifiés) + voile sombre ; `.site-header*` l.58-115 (logo en `background-image`, variante négative en sombre).
- `apps/web/src/app/layout.tsx` -- en-tête/pied communs, `AdminHeaderLink` ; point de montage de l'onglet.
- `apps/web/src/components/admin-header-link.tsx` -- modèle de lecture de session client (`fetchAvecDelai`).
- `apps/web/src/components/logout-button.tsx` -- déconnexion à réutiliser.
- `apps/web/src/app/connexion/connexion-form.tsx` -- flux email + code ; `destinationApresConnexion`.
- `apps/web/src/app/api/auth/verify/route.ts` -- renvoie `redirectTo: homePathForRole(role)`.
- `apps/web/src/modules/iam/service.ts` -- `getSession(token)` → `SessionRecord` (pour calculer l'étape coureur).
- `apps/web/src/modules/inscriptions/service.ts:368` -- `getChecklistState(session)` : pièces ordonnées (`fait`, `actionHref`).
- `apps/web/public/charte/photos-2026/aitaissi-2026-ligne-depart-*` -- foule au départ, proche de la référence.
- Tests existants : `app/page.test.tsx` (hero, CTA, LCP, crête), `app/layout.test.tsx`, `connexion/page.test.tsx`, `api/auth/auth.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/inscriptions/prochaine-etape.ts` (+ test) -- `prochaineEtapeCoureur(pieces)` pure : `actionHref` de la première pièce non faite, sinon `/espace-coureur` ; wrapper async qui avale les erreurs → `/espace-coureur`.
- [x] `apps/web/src/app/api/auth/verify/route.ts` -- réponse web : coureur → `prochaineEtapeCoureur`, autres rôles → `homePathForRole` ; natif inchangé.
- [x] `apps/web/src/app/connexion/page.tsx` + `connexion-form.tsx` -- lire `parcours=inscription` (valeur inconnue ignorée) : surtitre/titre « Créer mon compte », lead adapté.
- [x] `apps/web/src/components/mon-trail.tsx` + styles -- onglet vertical fixe bord droit + encart (client), masqué sous `/admin` et `/volontaires`.
- [x] `apps/web/src/app/layout.tsx` -- monter `MonTrail` ; nav vitrine (Parcours, La région, Retour en images, Résultats) dans l'en-tête ≥ 960 px.
- [x] `apps/web/src/app/page.tsx` + `globals.css` -- hero plein écran (`min-height: 100svh` moins égide), en-tête superposé via `body:has(.aa-hero--plein)` (logo négatif, texte clair), titre centré, bandeau date, badge « 35 km · 12 km » bas-gauche ; CTA « S'inscrire » → `/connexion?parcours=inscription`.
- [ ] Tests : onglet (ouverture, Échap, focus, état connecté, masquage admin), hero (structure, LCP, voile), redirections par rôle et étapes coureur.

**Acceptance Criteria:**
- Given un écran ≥ 1280 px, when l'accueil se charge, then la photo couvre toute la largeur et la hauteur visible, l'en-tête est lisible dessus, le titre est centré.
- Given le clavier seul, when on active l'onglet puis Échap, then l'encart s'ouvre, reçoit le focus, se ferme et rend le focus à l'onglet.
- Given `bash scripts/check-budget.sh`, when il tourne, then le premier chargement reste < 307 200 octets.

## Implementation Notes

- Implémenté par sous-agent (31/10). Fichiers : `prochaine-etape.ts` (+test), `api/auth/verify/route.ts`, `connexion/{page,connexion-form}.tsx` + `connexion/parcours.ts` (Next refuse les exports non standard dans `page.tsx`), `components/mon-trail.tsx` (+test), `logout-button.tsx` (libellé/classe optionnels, chargé en lazy dans l'encart), `layout.tsx`, `page.tsx`, `globals.css`, `scripts/check-budget.sh` (contrôle du CTA `?parcours=inscription`).
- Budget : 305 928 / 307 200 octets — marge ~1,2 Kio.
- Photo hero = `ligne-depart`, déjà présente dans la galerie (doublon visible).
- Mobile < 640 px : couloir de 44 px réservé à droite de `main` et du pied de page ; le hero déborde dessous.
- Hauteurs égide (40/58 px) et frise (16 px) codées en dur pour le calcul du hero.
- Pas d'environnement DOM dans vitest : focus/Échap testés via `activerEncart` sur objets factices ; parcours réel vérifié dans Chrome (Playwright) à 360/768/1440 px, clair et sombre. État connecté de l'encart non essayé de bout en bout.

## Spec Change Log

## Review Triage Log

Passe 1 (31/10) — blind-hunter (BH), edge-case-hunter (EC), verification-gap (VG).

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | BH, EC | Encart resté ouvert après déconnexion (état connecté périmé) | medium | `LogoutButton` fait `router.replace('/connexion')`, `MonTrail` vit dans le layout, `ouvert` reste vrai → patch (fermer sur changement de pathname) |
| 2 | BH, EC | Encart non fermé au changement de route (retour, lien clavier) ; panneau détaché après passage par /admin | medium | même cause que 1 (aucun effet sur `pathname`) → patch |
| 3 | BH, EC | État précédent affiché et cliquable pendant la lecture de session | medium | `session` n'est pas remis à zéro à l'ouverture ; boutons rendus pendant `chargement` → patch |
| 4 | VG | Branche connectée de l'encart jamais rendue en test | medium | pré-vérifié → patch (composant pur `ContenuEncart` + SSR) |
| 5 | VG | Câblage des effets (ouverture → lecture session, `activerEncart`) non observable | medium | pas d'environnement DOM dans vitest → defer |
| 6 | VG | `redirectTo` coureur réel jamais vérifié contre Postgres | medium | pré-vérifié : auth.test mocke le module, aucun `redirectTo` dans les tests d'intégration → patch |
| 7 | BH | Même photo `ligne-depart` dans le hero et la galerie | low | page.tsx l.70 et l.168 → patch (galerie reprend `celebration-montagne`) |
| 8 | BH | Photo 1280 px max pour un hero plein écran (flou ≥ 1920 / HiDPI) | medium | aucune variante plus grande dans `public/charte/photos-2026` → defer (nouvel asset) |
| 9 | EC | Breakpoints 639 vs 640 : à 640 px pas de couloir ni de tiroir bas | low | globals.css `max-width: 639px` vs `640px` → patch |
| 10 | EC, BH | Couloir mobile : bandes pleine largeur (`vitrine-bande--foret`, `aa-frise`) s'arrêtent à 44 px du bord | medium | padding sur `main`, seul le hero compense → patch |
| 11 | EC | `ConnexionForm` garde l'étape code en passant de /connexion à ?parcours=inscription | low | pas de `key` → patch (`key={parcours}`) |
| 12 | BH, EC | `.aa-hero__eyebrow` orphelin | low | aucune référence restante → patch (suppression) |
| 13 | BH, VG | `check-budget.sh` : `href="/connexion"` ne vient plus du CTA | low | vient du lien « Me connecter » SSR → patch (commentaire) |
| 14 | BH | Recette épopée 2 (module 1.5) périmée | low | « Mène à /connexion » → patch (doc) |
| 15 | BH | Étape sautée si règlement non fait et décharge faite | false | décharge et règlement sont posés ensemble par `/acceptations` ; état inatteignable |
| 16 | BH, EC | Pas de délai maximal sur la lecture checklist au login | low | une base qui pend bloque déjà `verifyLoginCode` ; rejeté (garde ajoutée, cas improbable) |
| 17 | BH | Relecture de session redondante dans verify | low | une requête de plus, rejeté (changer `verifyLoginCode` élargit la surface) |
| 18 | BH | Spec non suivie / sprint-status | false | rien n'est commité à dessein ; travail hors épopée |
| 19 | BH, VG | `next-env.d.ts` modifié | low | fichier régénéré par Next (dev/build), déjà modifié avant ; rejeté |
| 20 | BH, EC | Hauteurs égide/frise codées en dur | low | débordement de quelques px en zoom ; correctif structurel → rejeté |
| 21 | EC | Navigateurs sans `:has()` | low | Firefox < 121 : espace en trop, pas de casse ; rejeté |
| 22 | BH | `aria-current` absent de la nav d'en-tête | low | demande un composant client ; pied de page identique ; rejeté |
| 23 | BH | Fond du badge non adapté au thème sombre | false | badge posé sur la photo voilée, contraste identique dans les deux thèmes |
| 24 | BH | Chapeau « inscription » vu par un orga passant par M'inscrire | low | cas marginal ; rejeté |
| 25 | BH | Pas de test `parcours` à l'étape code / valeur tableau | low | `lireParcours` compare à la chaîne exacte ; rejeté |
| 26 | EC | « M'inscrire » sans édition → espace coureur | false | conforme à la matrice (« Prochaine étape sans lien ») |
| 27 | EC | Inscriptions fermées → espace au lieu du formulaire | false | conforme à la matrice |

## Design Notes

En-tête superposé sans JS : `body:has(.aa-hero--plein) .site-header { position:absolute; inset-inline:0; background:transparent; border:0 }` + logo négatif — layout statique, ISR intact. Étape coureur calculée côté serveur dans `verify` (une seule source : la checklist), jamais côté client.

## Verification

**Commands:**
- `pnpm -F @azzel/web typecheck` -- expected: aucune erreur
- `pnpm -F @azzel/web test` -- expected: tous les tests passent
- `pnpm -F @azzel/web build` -- expected: `/` reste ISR (○ 1m)
- `bash scripts/check-budget.sh` -- expected: OK sous le budget

**Manual checks:**
- Accueil en clair et sombre à 360 / 768 / 1440 px ; onglet au clavier seul.
