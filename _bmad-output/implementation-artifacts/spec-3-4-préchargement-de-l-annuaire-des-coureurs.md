---
title: 'Story 3.4 — Préchargement de l'annuaire des coureurs'
type: 'feature'
created: '2026-10-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: '6214d86'
baseline_commit: '6214d86139a4dfd63c8cab692ebacf24c6adaff4'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-3-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Avant le départ, les appareils scanneurs doivent porter l'annuaire de l'édition (dossards, identité) pour valider les scans en zone blanche (FR-12, AD-8) — or aucun dossard n'existe en base (l'épopée 1 valide les dossiers sans numéroter) et aucun contrat de réplique n'est versionné dans `shared`.

**Approach:** 1) Attribuer les dossards : colonne `coureur.dossard` (nullable, UNIQUE par édition), bouton admin « Attribuer les dossards » sur `/admin/dossiers` (numérotation séquentielle des validés sans dossard, après le max courant, jamais renumérotée). 2) Contrat versionné dans `packages/shared` : schéma de l'annuaire + recherche par dossard + libellé « DOSSARD INCONNU » (consommé par l'épopée 4). 3) Endpoint `GET /api/volontaires/annuaire` + section « Annuaire des coureurs » de la PWA : préchargement automatique à chaque ouverture en ligne → IndexedDB (store dédié, version 2), état visible et annoncé au lecteur d'écran (« Annuaire prêt — N coureurs »).

## Boundaries & Constraints

**Always:**
- Le contrat de réplique vit UNIQUEMENT dans `packages/shared` (AD-8) : `ANNUAIRE_SCHEMA_VERSION`, types `CoureurAnnuaire`/`AnnuaireEdition`, validation défensive du payload, `chercherParDossard()` (null si absent), `DOSSARD_INCONNU_LABEL` — l'épopée 4 consomme, jamais ne réinvente.
- Dossards : `dossard integer` nullable sur `coureur`, CHECK 1–9999, UNIQUE partielle `(edition_id, dossard)` ; attribution par lot idempotente (validés sans dossard uniquement, ordre `created_at`, suite du max de l'édition) ; jamais de renumérotation.
- Annuaire servi : coureurs de l'édition courante avec statut `validé` ET dossard non null, triés par dossard — org-scopé `withOrg`/RLS, `no-store`.
- PWA : préchargement automatique à chaque ouverture en ligne (même paradigme que l'état 3.3), persistance IndexedDB (base `azzel-volontaires` **version 2**, store `annuaire`), badge `role="status"` + `aria-live="polite"` : « Annuaire prêt — N coureurs » / « hors-ligne — annuaire du JJ/MM HH:MM » / « aucun coureur à dossard — rien à précharger » (N = 0).
- La purge de déconnexion efface aussi l'annuaire (appareil partagé, 3.3).
- Accessibilité : annonce au lecteur d'écran, cibles ≥ 48 px, frappe ≥ 15 px ; tutoiement côté volontaire.

**Never:**
- Pas de scan/caméra/validation locale au scan (épopée 4), pas de QR e-dossard (4-1), pas d'affichage de la liste complète des coureurs côté PWA (seul l'état de préchargement est requis — l'épopée 4 consommera les données).
- Pas de saisie manuelle individuelle de dossard, pas de renumérotation, pas de modification du flux de validation 1.6.
- Pas de nouvelle dépendance ; aucune photo/identité au-delà de dossard + nom + prénom (NFR-7 : le minimum pour valider un scan).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Attribuer (lot) | validés sans dossard | Numéros séquentiels après max, visibles dans /admin/dossiers, idempotent (2ᵉ clic : 0 changement) | pas de validé → message « rien à attribuer » |
| Re-attribution | nouveaux validés après un 1ᵉʳ lot | Suite de la numérotation, existants inchangés | No error expected |
| Annuaire (API) | session volontaire, ≥ 1 dossard | `{ version, editionId, genereA, coureurs:[{dossard,nom,prenom}] }` trié, no-store | 401/403 enveloppes volontaires.* |
| Préchargement PWA | ouverture en ligne | Fetch → IndexedDB v2, badge « Annuaire prêt — N coureurs » annoncé | échec réseau → IDB lu, badge hors-ligne |
| Hors-ligne | réseau absent après préchargement | Badge « hors-ligne — annuaire du … », données intactes | jamais d'écran vide |
| Aucun dossard | 0 coureur numéroté | « aucun coureur à dossard — rien à précharger » (role=status) | No error expected |
| Lookup partagé | dossard absent/présent | `chercherParDossard` → null/coureur ; `DOSSARD_INCONNU_LABEL` exporté | payload invalide → null, jamais d'exception |
| Déconnexion | logout | IDB etat + annuaire purgés | No error expected |
| Multi-org | org B a ses dossards | A ne voit/précharge que ses coureurs | RLS |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/inscriptions/` — possède `coureur` (migrations 0002/0004/0006, store, service, `/admin/dossiers`) : y ajouter dossard + attribution (pattern `updateDossier` du store 1.6 pour le style transactionnel).
- `apps/web/src/app/admin/dossiers/` — page existante (liste/validation) : bouton « Attribuer les dossards » + colonne dossard, pattern manager 1.6/3.2.
- `packages/shared/src/` — `index.ts` exporte tout ; y ajouter `annuaire.ts` (+ tests) — le contrat versionné AD-8.
- `apps/web/src/app/api/volontaires/` — `guard.ts` (garde rôle volontaire, enveloppes `volontaires.*`) + pattern route etat (3.3).
- `apps/web/src/lib/idb-volontaires.ts` — base version 1 → **2** (onupgradeneeded crée `annuaire`), lire/ecrire + purge étendue ; le stub de test gère la v2.
- `apps/web/src/app/volontaires/volontaires-pwa.tsx` + `page.tsx` — section annuaire (badge role=status), même paradigme revalidation que l'état.
- `apps/web/src/modules/missions/store.ts` — pattern de requête locale cross-table (`findCurrentEdition`) pour lire `coureur` depuis la surface volontaires.
- `apps/web/src/db/multi-org.integration.test.ts` — RLS coureur déjà couvert ; l'attribution passe par les mêmes requêtes org-scopées.

## Tasks & Acceptance

**Execution:**
- [x] `modules/inscriptions/migrations/0022_dossards.sql` — `ALTER TABLE coureur ADD COLUMN dossard integer` + CHECK (1–9999) + index/UNIQUE partielle `(edition_id, dossard) WHERE dossard IS NOT NULL` ; intégrée au runner (déjà déclaré).
- [x] `packages/shared/src/annuaire.ts` (+ tests) — `ANNUAIRE_SCHEMA_VERSION = 1`, types `CoureurAnnuraire`/`AnnuaireEdition`, `estAnnuaireValide()` (défensif : formes, doublons de dossard rejetés), `chercherParDossard()`, `DOSSARD_INCONNU_LABEL = 'DOSSARD INCONNU'` ; exporté depuis l'index.
- [x] `modules/inscriptions/` (store + service + errors) — `attribuerDossards(session)` : lot idempotent (verrou/`FOR UPDATE` sur les lignes ciblées ou re-vérification en transaction, suite du `max(dossard)` de l'édition, ordre `created_at`), retourne `{ attribues, premier, dernier }` ; jamais de renumérotation ; tests unitaires + intégration.
- [x] `POST /api/admin/dossiers/dossards` (+ tests route) — `guardAdmin`, enveloppes, no-store ; UI `/admin/dossiers` : bouton « Attribuer les dossards » + colonne dossard + résultat affiché (« 12 dossards attribués (101–112) » / « rien à attribuer »).
- [x] `GET /api/volontaires/annuaire` (+ tests route) — `guardVolontaire`, assemblage `AnnuaireEdition` (version shared, validés + dossard, tri dossard), `no-store`, enveloppes `volontaires.*`.
- [x] `apps/web/src/lib/idb-volontaires.ts` (+ tests) — passage base en version 2 + store `annuaire` (clé `courant`), `lireAnnuaire`/`ecrireAnnuaire` avec validation de forme (shared `estAnnuaireValide`), purge étendue ; le stub de test gère l'upgrade v1→v2.
- [x] `volontaires-pwa.tsx` + `page.tsx` + css — section « Annuaire des coureurs » : revalidation auto à l'ouverture → IDB, badge `role="status"` `aria-live="polite"` (prêt — N coureurs / hors-ligne — annuaire du … / aucun coureur à dossard), pas de liste affichée ; tests page (badge, états).
- [x] Tests intégration — attribution : nominal, idempotence, suite après max, multi-org (isolation des numérotations par édition/org), UNIQUE défendu en SQL direct ; annuaire : contenus validés+dossard uniquement, tri, RLS cross-org.

**Acceptance Criteria:**
- Given des dossiers validés, when l'admin attribue les dossards, then chaque validé porte un numéro unique dans son édition et l'annuaire les expose versionnés via `shared`.
- Given un appareil scanneur ouvert en ligne avant le départ, when l'annuaire se précharge, then « Annuaire prêt — N coureurs » s'affiche et est annoncé au lecteur d'écran, et la réplique survit hors-ligne (IndexedDB).
- Given un dossard absent de la réplique, when l'épopée 4 cherchera via `chercherParDossard`, then elle obtient null et le libellé `DOSSARD INCONNU` vient du contrat shared (testé).

## Review Triage Log

### 2026-10-23 — Review pass 1 (blind-hunter 14, edge-case-hunter 7, verification-gap 5 ; 26 findings)
- **patch (medium)** BF2+EC2 — badge « Annuaire prêt » malgré l'échec d'écriture IndexedDB (mode privé iOS, quota) : la poche est vide alors que les scans hors-ligne dépendent d'elle — l'état affiché doit refléter la persistance.
- **patch (low)** BF11+EC1 — fetch annuaire sans timeout : requête suspendue (portail captif) → badge bloqué « préchargement… » à vie ; AbortSignal.timeout comme partout ailleurs.
- **patch (low)** BF7+EC3+EC4+VG3 — comparaison de fraîcheur par chaînes brutes (fragile hors toISOString strict) et branche « annuaireInitial gagne » sans réécriture dans la poche (UI/poche divergent) : comparer par `Date.getTime()`, réécrire, et EXTRAIRE la résolution de repli en fonction pure testée (pattern lib/ du repo) ; même correction de comparaison appliquée au repli etat 3.3.
- **patch (low)** BF12 — `estDateIsoParseable` laxiste (accepte dates non UTC) alors que le contrat documente ISO 8601 UTC : exiger le suffixe Z (RFC3339 strict, pattern 3.2), tests.
- **patch (low)** BF1+VG2 — `libelleAttributionDossards` mort en production (le composant réimplémente les chaînes en dur ; le helper vit dans service.ts inimportable côté client) : déplacer en module client-safe, le composant l'importe, les tests suivent — le libellé affiché ne peut plus dériver du contrat testé.
- **patch (low)** VG1+VG-other — le dossard n'est jamais observé à travers `getDossiersState` (SQL direct uniquement, titre de test mensonger ; fixture route sans le champ) : le test d'intégration nominal asserte les dossards via la surface de liste, fixture complétée.
- **patch (low)** EC5+EC6 — épuisement des dossards (> 9999) → CHECK SQL violé en erreur brute 500 : garde explicite avec enveloppe dédiée ; réponse 200 malformée côté client attribution → « undefined dossard(s)… » : validation de forme.
- **patch (low)** EC7 — enveloppes d'erreur de l'API annuaire (et etat) servies sans `Cache-Control: no-store` : un intermédiaire peut cacher une erreur périmée.
- **patch (low)** BF8 — sémantique a11y : le `h2` « Annuaire des coureurs » est hors de la section et `aria-labelledby` étiquette le surtitre décoratif — la région est annoncée sous le mauvais nom.
- **patch (low)** BF9 — littéral `'validé'` codé en dur dans missions/store au lieu de la constante canonique `COUREUR_STATUS_VALIDE` (couplage caché : le vocabulaire bouge → l'annuaire se vide en silence).
- **patch (low)** BF10 — le dossard n'apparaît pas sur la fiche détaillée `/admin/dossiers/[id]` (seule la liste le montre).
- **patch (low)** BF13 — assertion `toContain('aria-live="polite"')` matche aussi le badge missions : pincer le badge annuaire précisément.
- **defer** BF3+BF4(partie composants) — tests du composant client (effet fetch/persistance orchestration, AttributionDossards) : aucun harnais DOM dans le repo (convention, déjà différée en 3.3) ; la résolution de repli extraite en fonction pure sera, elle, testée.
- **rejeté (low)** BF5 — lot en N UPDATE séquentiels : ~350 lignes sub-seconde en local, concurrence admin-only rare ; réécriture en UPDATE…FROM non triviale.
- **rejeté (low)** BF6 — tests d'intégration ordre-dépendants : convention des suites du repo (missions, secteurs — séquentielles, fileParallelism off), exécution toujours complète.
- **false** BF14 — sprint-status 3-4 `in-progress` : état piloté par le workflow (passé en review à la clôture), pas un défaut d'implémentation.

## Design Notes

- L'attribution atterrit en 3.4 par nécessité : aucune story ne numeralise les coureurs avant l'épopée 4, et le Given de la 3-4 (« coureurs aux dossards attribués ») n'existe pas sinon. Minimal : lot idempotent, pas d'édition individuelle (le besoin guichet réel dira si une saisie manuelle s'impose).
- Le numéro n'est jamais réutilisé ni renuméroté : UNIQUE partielle SQL en défense, le lot ne touche que les `dossard IS NULL`.
- Deux stores IndexedDB (etat 3.3 + annuaire) dans la même base versionnée : l'upgrade v1→v2 crée `annuaire` sans toucher `etat` — l'épopée 4 greffera l'outbox en v3 pareillement.
- Le badge d'annuaire est une `role="status"` distincte de celle de l'état missions : deux annonces séparées au lecteur d'écran, chacune nommée (« Annuaire… »).

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0022 appliquées, idempotent.
- `pnpm typecheck && pnpm test && AZZEL_REQUIRE_DB=1 pnpm test` -- expected: verts (shared annuaire, attribution, routes, IDB v2, page).
- `pnpm build && pnpm budget` -- expected: verts, budget accueil inchangé.

**Manual checks (if no CLI):**
- `/admin/dossiers` : attribuer deux fois de suite → compteurs ; `/volontaires` en session volontaire : badge « Annuaire prêt — N coureurs », DevTools offline → badge hors-ligne, onglet Application : IndexedDB `azzel-volontaires` v2 avec store `annuaire`.
