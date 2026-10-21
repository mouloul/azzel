---
title: 'Story 1.3 — Formulaire d’inscription à l’édition'
type: 'feature'
created: '2026-10-21'
status: 'done'
review_loop_iteration: 0
baseline_revision: '2600276'
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Un coureur connecté ne peut rien inscrire : aucune épreuve, aucune identité, aucune taille de t-shirt — la commande J-10 n'a pas de matière.

**Approach:** Module `inscriptions` : migration 0002 (evenement → edition avec clôture configurable → epreuve → coureur rattaché au compte), endpoint POST /api/inscriptions (session requise, clôture J-10 vérifiée côté serveur, champs obligatoires bloquants, catégorie d'âge dérivée), page /inscription protégée + récap dans l'espace coureur.

## Boundaries & Constraints

**Always:**
- Clôture **configurée côté serveur** : `edition.registration_closes_at` (seed 2027-03-16, J-10 du 26/03/2027) ; après échéance, soumission refusée avec message explicite + action.
- Champs obligatoires bloquants, validés **côté client ET côté serveur** : épreuve (longue ~35 km / moyenne 10–15 km), prénom, nom, téléphone, contact d'urgence (nom + téléphone), date de naissance, taille de t-shirt (XS–XXL).
- Catégorie d'âge **dérivée** de la date de naissance à la date de course (2027-03-26) : <20 U20, 20–39 Senior, 40–49 V1, 50–59 V2, ≥60 V3 — stockée avec l'âge calculé.
- Un coureur par compte et par édition (upsert tant que le dossier n'est pas validé) ; chaque ligne porte `organisation_id` (AD-4/FR-27, hiérarchie ER EVENEMENT → EDITION → EPREUVE/COUREUR).
- Page protégée via `requireSession()` (module iam) ; erreurs en enveloppe v1 ; UI française, tokens, accessible (labels, focus, aria-live), un seul bouton action.

**Never:**
- Pas de paiement, décharge, règlement, preuve CCP, checklist ni emails (stories 1.4–1.8).
- Pas d'admin ni de gestion d'éditions/épreuves (seed en migration seulement).
- Pas de modification des tables iam ni du module iam (réutiliser requireSession, patterns store/errors).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inscription complète | Session + tous champs valides | Coureur créé (éprouve/édition/compte liés), récap affiché | No error expected |
| Champ manquant | Session + formulaire incomplet | Soumission bloquée (client) ET refusée (serveur) champ par champ | 400 enveloppe nommant le champ |
| Après clôture | Session valide après registration_closes_at | Refus avec message explicite + action | 403 enveloppe `inscriptions.closed` |
| Non connecté | Aucune session | 401, redirection /connexion | 401 enveloppe |
| Double soumission | Session avec coureur existant (dossier non validé) | Mise à jour des champs, pas de doublon | No error expected |
| Date de naissance absurde | Âge < 10 ou > 100 ans à la course | Refus avec message clair | 400 enveloppe |

</intent-contract>

## Code Map

- `apps/web/src/modules/iam/` — réutiliser : `session.ts` (requireSession), `store.ts` (patterns withDb/transactions), `errors.ts`→enveloppes (créer erreurs inscriptions sur le même modèle), `migrate.ts` (runner 0001 → 0002 automatiquement trié).
- `apps/web/src/app/espace-coureur/page.tsx` — étendre : lien/CTA vers /inscription quand aucun coureur, récap quand inscrit.
- `apps/web/src/app/globals.css` — classes .auth/.field/.card réutilisables ; styles formulaire déjà présents.
- `apps/web/src/app/api/auth/auth.test.ts` — pattern de test des routes avec service stubbé (vi.mock).
- `packages/shared/src/error-envelope.ts` — enveloppe v1 telle quelle.
- Continuité 1-2 : alias `@` configuré dans vitest.config.ts ; tests intégration gated DATABASE_URL + garde localhost ; `test:db` racine.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/modules/inscriptions/migrations/0002_inscriptions.sql` -- tables evenement, edition (registration_closes_at NOT NULL), epreuve (slug longue/moyenne, distance), coureur (FK compte/édition/épreuve, identité, urgence, tshirt, birth_date, age + age_category dérivés, UNIQUE(account_id, edition_id)) + seeds Aït-Aïssi / édition 2027 (clôture 2027-03-16T23:59:59Z) / 2 épreuves.
- `apps/web/src/modules/inscriptions/service.ts` -- validation complète (champs, épreuve existante, dates cohérentes, dérivation âge/catégorie), contrôle de clôture, upsert coureur (interdit si dossier déjà validé — statut réservé aux stories suivantes, colonne status par défaut 'en constitution').
- `apps/web/src/modules/inscriptions/store.ts` + `errors.ts` -- accès données + erreurs domaine → enveloppes (400 champ, 403 clôture, 401) sur le modèle iam.
- `apps/web/src/app/api/inscriptions/route.ts` + `route.test.ts` -- POST (create/update) + GET (état du formulaire du compte) ; tests routes avec service stubbé.
- `apps/web/src/app/inscription/page.tsx` -- formulaire français accessible (fieldsets identité / épreuve / urgence / t-shirt, champs obligatoires bloquants, récap avant envoi), états d'erreur aria-live, redirection si non connecté.
- `apps/web/src/app/espace-coureur/page.tsx` -- CTA « M'inscrire à l'édition 2027 » si aucun coureur, sinon récap (épreuve, catégorie dérivée, t-shirt, clôture affichée).
- `apps/web/src/modules/inscriptions/inscriptions.test.ts` + `inscriptions.integration.test.ts` -- unitaires (dérivation âge/catégorie aux bornes, validation champ par champ, clôture) + intégration (matrice complète contre azzel_test, migrations 0001+0002).

**Acceptance Criteria:**
- Given un compte connecté sans inscription, when je soumets le formulaire complet, then le coureur existe en base rattaché à l'édition/épreuve/organisation et le récap s'affiche dans l'espace coureur.
- Given la date du jour postérieure à registration_closes_at, when je soumets, then le serveur refuse avec un message explicite et aucun coureur n'est créé.
- Given un coureur déjà inscrit non validé, when je re-soumets avec une autre épreuve, then la ligne est mise à jour sans doublon.
- Given une soumission incomplète, when le client la bloque ou le serveur la reçoit, then chaque champ manquant est nommé et aucun coureur n'est créé.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 27 findings — high 0, medium 4, low 15, false 2, maybe-false 0 (regroupés en 7 entrées patch, 8 rejets)
- findings:
  - `[medium]` `[patch]` P1 — Unicité globale des slugs (epreuve.slug, edition.slug UNIQUE seuls) bloque la 2e organisation/édition (FR-27) et les requêtes store ignorent organisation_id — UNIQUE composites + scoping org passé du service. Regroupe BH2+BH3+EC3.
  - `[medium]` `[patch]` P2 — Clôture seedée 2027-03-16T23:59:59Z = 17 mars 00:59 heure d'Alger (UTC+1) : J-10 visé est le 16 mars local — seed à 22:59:59Z (BH12).
  - `[medium]` `[patch]` P3 — upsertCoureur : chemin ON CONFLICT DO UPDATE sans garde de statut (dossier validé écrasable en concurrence), relecture hors transaction, clôture non re-vérifiée dans la tx — RETURNING + WHERE status + contrôle clôture in-tx. Regroupe EC2+BH14+BH4.
  - `[medium]` `[patch]` P4 — readSession hors try/catch des handlers : une erreur non-DB de getSession → 500 framework sans enveloppe (EC1).
  - `[low]` `[patch]` P5 — Finitions : CTA « édition 2027 » hardcodé (BH1+EC7), message épreuve figé « longue ou moyenne » (BH7+EC5), contactUrgenceNom sans borne 80 (BH8+EC4), 401 sans lien /connexion (BH10), `let state` non typé (BH15).
  - `[low]` `[patch]` P6 — Tests : intégration dépendante de l'ordre (clôture mutée à 2100 sans restauration, BH13) + branches routes non couvertes (409, 500, 503 GET, corps tableau, BH6).
  - `[low]` `[patch]` P7 — POST sans limite de taille de corps : cap content-length (BH18).
  - `[false]` `[reject]` BH5 — « table evenement morte » : elle porte la hiérarchie ER organisation → événement → édition exigée par FR-27 ; edition la référence.
  - `[low]` `[reject]` BH9 — Cast non filtré des fieldErrors serveur : payload contrôlé par notre API même origine ; aucun état nuisible joignable.
  - `[false]` `[reject]` BH11 — Libellé catégorie vide si valeur inattendue : CHECK SQL contraint age_category au domaine — valeur impossible depuis la base.
  - `[low]` `[reject]` BH16 — États vides incohérents édition absente : configuration saine = édition toujours présente ; cas déjà géré côté /inscription.
  - `[low]` `[reject]` BH17 — epreuve_id/edition_id sans FK composite : le service valide l'appartenance ; garantir au schéma coûte une contrainte composite pour un état non démontrable en V1.
  - `[low]` `[reject]` BH19 — fileParallelism:false « ralentit » : suite totale 2,1 s — aucun coût observable.
  - `[low]` `[reject]` BH20 — Map statut→libellé incomplète : seuls deux statuts existent aujourd'hui ; les statuts futurs arrivent avec leurs stories.
  - `[low]` `[reject]` EC6 — Zéro épreuve = impasse : état de mauvaise config seulement (seed garanti), différent de l'édition absente qui est gérée.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Module `inscriptions` : migration 0002 (evenement → edition avec clôture configurable → epreuve → coureur, unicité par parent, seeds Aït-Aïssi/2027/clôture 16/03/2027 23:59:59 heure d'Alger, épreuves longue 35 km + moyenne 12 km), service avec clôture vérifiée avant validation puis re-vérifiée en transaction, upsert gardé par statut (dossier validé immuable), dérivation âge/catégorie à la date de course (U20/Senior/V1/V2/V3, 10–100 ans), page /inscription protégée (fieldsets, aria, focus 1er champ en erreur, récap live), espace coureur avec CTA/récap dynamiques, routes GET/POST avec cap 32 Ko, scoping organisation sur toutes les requêtes.

### Revue
4 couches — 27 constats → 7 entrées patch (4 medium, 3 low) corrigées et re-vérifiées ; 8 rejets tracés. Points notables corrigés : clôture seedée en heure d'Alger (off-by-one-hour), DO UPDATE sans garde de statut, slugs UNIQUE globaux bloquant la 2e organisation (FR-27), erreurs non-DB sans enveloppe. Rien différé au-delà de l'existant (tests de composant UI).

**Recommandation de re-revue : true** — 4 medium patchées ; risques nommés : (1) surface formulaire/parcours coureur implémentée avec soin mais sans test automatique (déjà en deferred-work), (2) migration 0002 amendée après application initiale — base dev réinitialisée, aucun autre environnement concerné, (3) garde content-length contournable si un proxy amont omet l'en-tête (Next le pose en production).

### Vérification
- `dev-db.sh reset/up + db:migrate` ✓ (contraintes composites + seed vérifiés en psql)
- `pnpm test` : 100 tests verts / 12 fichiers (intégration ordre-indépendante)
- `pnpm build` + `pnpm typecheck` ✓

### Risques résiduels
- Distance moyenne seedée 12 km (spéc 10–15) — ajustable par SQL.
- Tranches d'âge = décision V1 enregistrée (Design Notes), ajustable sans migration.

## Spec Change Log

## Review Triage Log

## Design Notes

Catégorie d'âge : décision V1 enregistrée ci-dessus (bornes U20/Senior/V1/V2/V3 à la date de course) — ajustable sans migration (colonne dérivée au service, stockée pour la commande et les classements futurs). La clôture vit dans `edition.registration_closes_at` : configurable par SQL/outil admin ultérieur, jamais en dur dans le code. Upsert : ON CONFLICT (account_id, edition_id) DO UPDATE — le verrou « dossier validé » arrive avec la story 1.6 (colonne status预留 'in_progress' pour l'instant).

## Verification

**Commands:**
- `bash scripts/dev-db.sh up && pnpm -F @azzel/web db:migrate` -- expected: 0001 + 0002 appliquées, idempotent.
- `pnpm test` -- expected: tests inscriptions verts (unitaires + intégration + routes), suite iam intacte.
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- `pnpm dev:web` → se connecter, remplir /inscription, vérifier blocage client, récap espace coureur, puis rejouer la clôture en SQL (UPDATE edition SET registration_closes_at = now() - interval '1 day') et constater le refus.
