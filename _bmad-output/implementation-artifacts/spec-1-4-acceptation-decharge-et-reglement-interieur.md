---
title: 'Story 1.4 — Acceptation décharge et règlement intérieur'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '2f7c67e'
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      Tests du composant AcceptancesForm (corps posté, enveloppes affichées, lien 401, redirection)
    evidence: >-
      Aucune stack de test de composant (jsdom/testing-library) dans le dépôt ; la route est testée service mocké, le formulaire jamais exécuté.
    location: apps/web/src/app/acceptations/acceptances-form.tsx
    severity: medium
  - summary: >-
      Tests de rendu des pages /acceptations et espace-coureur (six gardes, récap horodaté)
    evidence: >-
      Tests node uniquement (api/modules/lib) ; aucune assertion de rendu n'existe dans le dépôt.
    location: apps/web/src/app/acceptations/page.tsx
    severity: medium
  - summary: >-
      Durcir le skip silencieux des suites d'intégration sans DATABASE_URL (échec bruyant ou CI)
    evidence: >-
      Patron skipIf préexistant (iam + inscriptions) ; sur clone frais pnpm test sort vert sans exécuter le SQL réel. Chantier repo-wide.
    severity: low
---

<intent-contract>

## Intent

**Problem:** Le dossier n'a aucune valeur juridique : décharge de bonne santé et règlement intérieur ne peuvent pas être acceptés en ligne avec horodatage et version.

**Approach:** Migration 0003 : table `document` (slug `decharge`/`reglement`, version, contenu texte, seed v1 à remplacer par l'organisateur) + colonnes d'acceptation sur `coureur` (accepted_at + version par document). Endpoint POST /api/inscriptions/acceptances (les DEUX acceptations ensemble, atomiques, horodatées serveur, version enregistrée) + page /acceptations lisible (documents affichés avec leur version, deux cases obligatoires, un seul bouton action).

## Boundaries & Constraints

**Always:**
- Horodatage **serveur** (now() SQL) + version du document au moment de l'acceptation, pour chaque document.
- Les deux acceptations sont enregistrées **dans une seule transaction** — jamais l'une sans l'autre ; sans les deux, le dossier ne peut pas être considéré complet (consommé par la checklist 1.7).
- Prérequis : coureur existant (formulaire 1.3), inscriptions ouvertes, statut « en constitution » (dossier validé = 409).
- Ré-acceptation possible (mise à jour des horodatages/versions) tant que le statut ne verrouille pas.
- Chaque document affiche sa version ; le contenu seed est un texte français clairement balisé « à remplacer par l'organisateur ».
- UI française accessible : documents lisibles avant acceptation (liens/accordéons natifs details/summary), cases reliées par label, erreur aria-live, enveloppe v1 pour toute erreur.

**Never:**
- Pas de génération PDF, pas de signature graphique, pas d'upload de documents (contenu texte en base, édition admin ultérieure).
- Pas de modification des modules iam/inscriptions existants au-delà de l'extension (store/service/routes additives, migration 0003 dédiée).
- Pas d'exclusion légale (le contenu juridique réel relève de l'organisateur, pas du code).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Acceptation complète | Session + coureur + les deux cases | Deux accepted_at (now serveur) + versions enregistrées, récap horodaté | No error expected |
| Une seule case | payload sans l'un des deux | Refus atomique : rien n'est écrit | 400 enveloppe `acceptances.both_required` |
| Non inscrit | Session sans coureur | Refus : s'inscrire d'abord | 409 enveloppe `acceptances.no_coureur` |
| Après clôture | registration fermée | Refus avec message explicite | 403 enveloppe `inscriptions.closed` |
| Dossier validé | statut ≠ en constitution | Refus immuable | 409 enveloppe `inscriptions.dossier_valide` |
| Non connecté | sans session | 401 + redirection | 401 enveloppe |

</intent-contract>

## Code Map

- `apps/web/src/modules/inscriptions/` — réutiliser : store (patterns tx, scoping organisationId), service (clôture, statut), errors (modèle enveloppes), migrations/0002 (style seeds), `db:migrate` composite (ajouter 0003).
- `apps/web/src/modules/iam/session.ts` — requireSession() pour la page.
- `apps/web/src/app/espace-coureur/page.tsx` — ajouter l'étape acceptations au dossier (CTA ou état), récap existant à étendre.
- `apps/web/src/app/api/inscriptions/route.ts` + `route.test.ts` — patterns de routes et tests stubbés (cap 32 Ko, readSession robuste).
- `apps/web/src/app/inscription/inscription-form.tsx` — patterns accessibles (fieldsets, aria-live, focus).

## Tasks & Acceptance

**Execution:**
- `apps/web/src/modules/inscriptions/migrations/0003_documents.sql` -- table document (organisation_id, slug UNIQUE(org,slug), version, content text, updated_at) + seeds decharge/reglement v1 (texte provisoire balisé) + colonnes coureur : decharge_accepted_at/decharge_version, reglement_accepted_at/reglement_version (nullables) ; intégrer au runner composite.
- `apps/web/src/modules/inscriptions/store.ts` + `service.ts` -- findDocuments(orgId), acceptDocuments(session, {dechargeVersion, reglementVersion}) : transaction unique (clôture re-vérifiée, statut verrouillé, versions résolues côté serveur depuis la table document — jamais depuis le client, horodatage now()), lecture de l'état d'acceptation pour le récap.
- `apps/web/src/app/api/inscriptions/acceptances/route.ts` + tests routes stubbés -- POST (matrice complète) + GET (état : versions acceptées, horodatages formatés ISO UTC).
- `apps/web/src/app/acceptations/page.tsx` -- documents lisibles (details/summary natifs, version affichée), deux cases obligatoires, bouton unique, états fermé/validé/409, erreur aria-live.
- `apps/web/src/app/espace-coureur/page.tsx` -- ligne d'état « Décharge + règlement : acceptés le … (vX) » ou CTA vers /acceptations.
- `apps/web/src/modules/inscriptions/inscriptions.test.ts` + intégration -- couvrir chaque ligne de matrice (versions résolues serveur, atomicité : une case → zéro écriture, ré-acceptation met à jour, horodatage serveur ≠ horloge client).

**Acceptance Criteria:**
- Given un coureur en constitution qui coche les deux cases, when il accepte, then chaque acceptation porte l'horodatage serveur et la version courante du document, et le récap les affiche.
- Given une seule case cochée, when la requête part, then rien n'est écrit (atomicité vérifiée en base).
- Given un dossier validé, when on tente de ré-accepter, then refus 409 sans modification.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 13, false 0, maybe-false 0 (10 entrées patch corrigées, 3 defer, 1 rejet bas)
- findings (résumé) :
  - `[medium]` `[patch]` Garde 32 Ko contournable sans Content-Length valide (BH2+EC1) — rejet des requêtes sans en-tête numérique, tests chunked ajoutés.
  - `[medium]` `[patch]` Documents partiellement seedés : formulaire à une case + 500 internal_error (BH3+EC2) — garde DOCUMENT_SLUGS.every + enveloppe dédiée 503 acceptances.documents_missing.
  - `[low]` `[patch]` CHECKs d'intégrité (pairs accepted_at/version + cohérence croisée) via migration 0004 (BH4+EC4/EC5).
  - `[low]` `[patch]` Factorisation du mapping d'erreurs partagé (BH5).
  - `[low]` `[patch]` Fuseau cohérent : clôture affichée en heure locale à côté des acceptations (BH6).
  - `[low]` `[patch]` Titre de test trompeur renommé + vérification SQL « rien n'est écrit » (BH1+BH7+VG-other).
  - `[low]` `[patch]` router.refresh() sur 403/409 (BH8) ; timeout fetch 15 s avec message dédié (EC3) ; repli documentTitle lisible (BH9) ; Cache-Control: no-store sur GET (BH10).
  - `[defer]` Formulaire AcceptancesForm sans test (VG1) — aucune stack de test composant dans le dépôt ; regroupé avec l'entrée UI existante.
  - `[defer]` Rendu des pages (gardes /acceptations, récap espace-coureur) sans test (VG2) — idem.
  - `[defer]` Suites d'intégration skippées silencieusement sans .env — chantier repo-wide (VG3, patron préexistant iam).
  - `[low]` `[reject]` Variante « piste d'audit » de FR-3 (conserver la trace des versions précédemment acceptées) : la spec a tranché pour l'état courant (Design Notes) — lecture défendable satisfaite ; à arbitrer avec l'organisateur si la valeur juridique l'exige.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Étape « décharge + règlement » du dossier : table document (slugs decharge/reglement, versions, contenu seed provisoire balisé), acceptations atomiques sur coureur (horodatage serveur now() dans la transaction, versions résolues depuis la base — jamais du client), migration 0004 de CHECKs d'intégrité (pairs + cohérence croisée), page /acceptations accessible (documents lisibles details/summary, deux cases obligatoires, un bouton), récap horodaté dans l'espace coureur, routes GET (no-store) + POST (cap 32 Ko durci), gardes clôture/statut/inscription.

### Revue
4 couches — 21 constats → 10 patchs (2 medium, 8 low) corrigés et re-vérifiés (138/138) ; 3 defer (UI sans stack de test, skip d'intégration repo-wide) ; 1 rejet bas motivé (piste d'audit FR-3).

**Recommandation de re-revue : true** — 2 medium patchées ; risques nommés : (1) surface UI (formulaire + gardes de pages) implémentée mais sans test automatique — parcours manuel à jouer à la review, (2) la garde de taille repose sur Content-Length (les proxys propres la posent ; un attaquant direct peut encore bufferiser un corps chunked avant rejet — défense en profondeur seulement), (3) contenu juridique seed provisoire — responsabilité de l'organisateur.

### Vérification
- `db:migrate` 0001–0004 idempotent ✓ (CHECKs vérifiées)
- `pnpm test` 138/138 ✓ ; `pnpm build` + `pnpm typecheck` ✓

### Risques résiduels
- Textes juridiques réels à fournir par l'organisateur (édition admin ultérieure).
- Ré-acceptation = mise à jour (pas d'historique des versions antérieures) — choix enregistré, arbitrage possible.

## Spec Change Log

## Review Triage Log

## Design Notes

Versions résolues **côté serveur** (le client n'envoie que l'intention d'accepter, pas les numéros de version) : évite qu'un client retire l'acceptation d'une ancienne version. L'horodatage serveur (now() SQL dans la transaction) fait foi — jamais l'horloge client (convention horodatages). Le contenu juridique seed est volontairement provisoire et balisé : la responsabilité du texte réel appartient à l'organisateur (à tracer dans le rapport).

## Verification

**Commands:**
- `bash scripts/dev-db.sh up && pnpm -F @azzel/web db:migrate` -- expected: 0001–0003 appliquées, idempotent.
- `pnpm test` -- expected: suite entière verte (matrice acceptations couverte, intégration incluse).
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- `pnpm dev:web` → parcours : connexion → inscription → /acceptations (lire les documents, cocher, accepter) → récap espace coureur horodaté.
