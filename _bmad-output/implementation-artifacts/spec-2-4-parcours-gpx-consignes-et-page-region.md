---
title: 'Story 2.4 — Parcours GPX, consignes et page région'
type: 'feature'
created: '2026-10-22'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '6f0c6bf'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-2-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Le coureur ou le proche ne peut pas se préparer : parcours (dénivelés, horaires, ravitaillements), consignes de sécurité et infos pratiques de la région ne sont nulle part — et l'organisateur ne peut pas les éditer sans développeur (FR-21/FR-23).

**Approach:** Système de contenus éditables : table `contenu_vitrine` (slug, titre, corps texte, org-scopée, seedée avec les blocs parcours-longue/parcours-moyenne/consignes-securite/region/hebergement/restauration/annexes — textes provisoires balisés) + champ URL GPX par épreuve. Surfaces publiques : page `/parcours` (les deux épreuves, horaires/dénivelés/ravitos, citation « Aman d laman » sourcée aux ravitaillements, lien GPX en chargement différé — jamais dans le chemin critique, pas de carte : épopée 7) et page `/region` (région, hébergement, restauration, annexes, consignes « ne pas défier la montagne » + singes sacrés du Jurjura). Surface admin `/admin/contenus` (édition des blocs, URL GPX) — bascule sans dev.

## Boundaries & Constraints

**Always:**
- Contenu éditable par l'organisateur (requireRole), org-scopé (withOrg/RLS), rendu public dynamique (immédiat) ; corps = texte simple (paragraphes/sauts de ligne, aucun HTML injecté — échappé), vouvoiement public.
- Seeds provisoires balisés « à confirmer par le comité » pour les faits 2027 (dénivelés exacts, horaires) ; chiffres 2026 officiels uniquement si utilisés.
- GPX : URL facultative par épreuve, rendue en lien de téléchargement dans une section chargée à la demande (bouton « Voir le tracé GPX » qui révèle le lien) — zéro octet GPX dans le chargement initial, aucune lib cartographique.
- Citation « Aman d laman — l'eau est sûre » exclusivement dans le contexte ravitaillements, attribution « Sagesse kabyle (Hanoteau, 1867) » ; aucune citation en zone critique.
- Pages accessibles sans compte, liées depuis l'accueil (navigation sobre : liens texte dans le pied ou la section épreuves) ; charte (aa-), contrastes, focus, mobile 360 px.
- Budget accueil inchangé (`pnpm budget` vert — les nouvelles pages ne touchent pas `/`).

**Never:**
- Pas de rendu de carte/GPX (épopée 7), pas de markdown riche ni HTML (texte simple échappé), pas d'upload de fichier GPX (URL fournie par l'admin).
- Pas de nouvelle dépendance ; pas de modification des pages existantes au-delà des liens de navigation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Visite /parcours | public | Épreuves avec dénivelé/horaires/ravitos (seed balisé), citation sourcée aux ravitos, bouton GPX qui révèle le lien | No error expected |
| Sans GPX | url gpx absente | Bouton absent (pas de lien mort), mention « Tracé à venir » | No error expected |
| Visite /region | public | Région + hébergement/restauration/annexes + consignes montagne et singes | No error expected |
| Édition admin | organisateur modifie un bloc | Public reflété au rechargement (dynamique) | No error expected |
| HTML injecté | corps contient <script> | Rendu échappé, rien d'exécuté | No error expected |
| Accès coureur | /admin/contenus en coureur | 403 | 403 enveloppe |
| Bloc manquant | seed absent en base | Page rend les blocs présents, aucune section vide | No error expected |

</intent-contract>

## Code Map

- `apps/web/src/modules/sponsors/` — pattern module vitrine (store withOrg, service, errors) à reproduire pour `modules/contenus`.
- `apps/web/src/app/admin/sponsors/` — patterns UI admin (requireRolePage, formulaires, états).
- `apps/web/src/app/page.tsx` — ajouter liens /parcours et /region (pied + section épreuves).
- Migrations runner — 0014_contenus_vitrine.sql (table contenu_vitrine + colonnes gpx_url sur epreuve via ALTER, seeds).
- `contrastes.test.ts`, `pnpm budget` — gardes existants.

## Tasks & Acceptance

**Execution:**
- `migrations/0014_contenus_vitrine.sql` -- contenu_vitrine (id, organisation_id, slug UNIQUE(org,slug), titre, corps text, updated_at) + seeds balisés + `epreuve.gpx_url` nullable ; intégrer au runner.
- `apps/web/src/modules/contenus/` (store/service/errors/domain) -- listPublic(slugs), get, update (validation : titre ≤ 120, corps ≤ 20 000, gpx_url https facultative), org-scopé.
- `apps/web/src/app/api/admin/contenus/[slug]/route.ts` (+ tests) -- GET/PUT requireRole, enveloppes, cap corps.
- `apps/web/src/app/admin/contenus/page.tsx` + formulaire -- liste des blocs, édition (textarea), URL GPX par épreuve, hint « à confirmer par le comité » visible sur les seeds.
- `apps/web/src/app/parcours/page.tsx` + `region/page.tsx` -- rendu public dynamique, échappement, citation sourcée, section GPX révélée au clic (details/summary natif), liens croisés.
- `apps/web/src/app/page.tsx` + footer -- liens /parcours /region.
- Tests -- unitaires (validation, échappement), intégration (CRUD org-scopé, seeds présents, gpx_url), routes stubbées, rendu statique des deux pages (blocs, citation, GPX différé, interdits : pas de <script> exécutable).

**Acceptance Criteria:**
- Given les seeds en base, when un visiteur ouvre /parcours et /region, then les blocs s'affichent (contenus balisés « à confirmer »), la citation n'apparaît qu'aux ravitaillements avec sa source, et le GPX n'est qu'un lien révélé au clic.
- Given un organisateur qui modifie un bloc, when la page publique est rechargée, then le nouveau contenu s'affiche — sans redéploiement.
- Given un corps contenant du HTML, when il est rendu, then il est affiché échappé (aucune exécution).


## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 25 findings — high 0, medium 4, low 17, false 0 (8 entrées patch, 1 defer, 3 rejets)
- patches (medium) : XSS stocké via gpx_url non https (CHECK SQL ^https + garde rendu, EC2) ; force-dynamic non épinglé — contenu figé sans échec (VG1, assert export) ; édition concurrente sans verrou (BH3+EC3, verrou optimiste updated_at + 409, date_trunc millisecondes découvert) ; AbortSignal.timeout cassant Safari anciens (BH4, feature detect). Patches (low) : upsert blocs absents (BH1), erreurs classifiées DB vs bug (BH2), budget ajouté à la CI (VG3), hygiène complète (fields tableau, aria-describedby, typage libellés, ordonnerParSlugs unifiée, listContenus mort, état vide, tests decouplés internals, code d'erreur unifié, gpx sans épreuve 400, unicité noms migrations).
- defer : formulaire admin sans test composant (VG2, convention repo). Rejets : « dates » sans champ dédié (affichées au hero/accueil), consigne en seed vs codée (défendable FR-23), chunked sans content-length (convention établie).

## Auto Run Result

**Statut : done.** Contenus éditables de bout en bout : migration 0014 (contenu_vitrine RLS + gpx_url CHECK https + 7 seeds balisés), module contenus (upsert, verrou optimiste, ordre canonique), API admin, /admin/contenus (badges à confirmer, URL GPX), pages publiques /parcours (citation sourcée aux ravitos, GPX <details> différé) et /region (montagne + singes), liens accueil/pied, budget en CI. Vérification : 639 passés + 5 skips (50 fichiers), budget 299/300 Ko, migrations 0001–0014 idempotentes. Recommandation re-revue : true (marge accueil 336 o — la 2-5 devra vivre sur page dédiée ; UI admin sans test composant ; seeds à valider par le comité).

## Spec Change Log

## Review Triage Log

## Design Notes

Texte simple plutôt que markdown : zéro dépendance, zéro surface XSS, l'organisateur écrit des paragraphes — le rendu splitte sur les lignes vides. GPX par URL + <details> natif : le « chargement différé » est structurel (rien ne charge avant le clic), la carte interactive et le rendu du tracé restent la décision locale de l'épopée 7 (map lib). Les seeds « à confirmer » matérialisent les données que le comité n'a pas encore fournies (CHARTE.md) — l'admin les remplace sans dev.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0014, idempotent.
- `pnpm test` -- expected: verts (matrice contenus).
- `pnpm build && pnpm budget && pnpm typecheck` -- expected: verts, budget < 300 Ko.

**Manual checks (if no CLI):**
- /parcours et /region en mobile ; édition d'un bloc en admin → reflétée ; GPX absent → « Tracé à venir » ; insertion <script> en admin → affichée comme texte.
