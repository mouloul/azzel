---
title: 'Story 7.4 — Rapports post-course et export « commande »'
type: 'feature'
created: '2026-10-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'fc8ca0f'
baseline_commit: 'fc8ca0f2e7f5a51fa9b28ce2c3a1a6b8f4e3b0b3'
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-7-context.md
warnings: []
deferred: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'édition terminée ne laisse aucun bilan exploitable : le directoire n'a pas de fichier unique couvrant la course (inscrits, présents, passages, arrivées, abandons, portée des partages — FR-26), et la commande médailles/t-shirts à J-10 se ferait à la main (zéro stock, décomptes validés par épreuve et par taille).

**Approach:** 1) Module `apps/web/src/modules/rapports/` : encodeur CSV RFC 4180 pur (UTF-8 BOM + CRLF — s'ouvre proprement dans Excel FR), service assemblant les données de l'édition COURANTE en une transaction (inscrits par statut, validés par épreuve × taille t-shirt, retraits, passages par checkpoint, arrivées avec rang/temps via le calcul 7.1, abandons détaillés avec motif/auteur 5.3, portée des partages depuis `resultats_visite` 7.2). 2) DEUX fichiers : « rapport post-course » (fichier UNIQUE à sections : synthèse, passages par checkpoint, arrivées, abandons, partages) et « commande » (épreuve × taille + totaux t-shirts + médailles = 1 par validé par épreuve, mention zéro stock). 3) Routes `GET /api/admin/rapports/post-course` et `/api/admin/rapports/commande` (guardAdmin, `Content-Disposition: attachment`, text/csv). 4) Page `/admin/rapports` (organisateur) : deux cartes descriptives + boutons de téléchargement, note processus J-10 ; liens depuis `/admin/course` et `/admin/dossards` (pattern `btn-lien`).

## Boundaries & Constraints

**Always:**
- Choix local format : CSV (RFC 4180, échappement guillemets, BOM UTF-8, CRLF) — fichier unique par export, nom `azzel-{rapport-post-course|commande}-{edition}-{date}.csv`.
- Rapport post-course = fichier UNIQUE à sections titrées : Synthèse (inscrits total+par statut, présents/retraits, partants/arrivées/abandons par épreuve), Passages par checkpoint, Arrivées (épreuve, dossard, rang, temps), Abandons (épreuve, dossard, lieu, motif, heure, auteur), Portée des partages (total + par jour).
- Commande = validés par épreuve × taille (XS–XXL), totaux t-shirts toutes tailles, médailles = nombre de validés par épreuve (1 par coureur) + total — mention « zéro stock : commandé = validé ».
- Toutes les données d'un rapport viennent de la même lecture cohérente (UNE transaction, calque NFR-4) ; édition COURANTE de l'organisation de session uniquement.
- Détails au niveau DOSSARD (jamais nom/contact du coureur dans les CSV — l'auteur d'un abandon est un organisateur, son email reste) ; abandonne figurent (5.3) ; temps formatés HH:MM:SS depuis le calcul 7.1 (jamais recalculés).
- Routes : guardAdmin (401/403/503 enveloppes admin.*), `no-store`, attachment ; échec base → 503 douce, jamais de CSV à moitié servi.
- Page admin : requireRolePage organisateur, dégradée AdminIndisponible si base KO, boutons simples (liens GET), tutoiement organisateur.

**Never:**
- Pas de nouvelle collecte ; pas de page publique ; pas de modification des calculs 7.1/5.x (lecture seule par-dessus).
- Pas de XLSX/PDF (choix local CSV assumé, question ouverte archi tranchée ici) ; pas d'envoi automatique par email (le directoire télécharge).
- Pas de données d'autres organisations (RLS) ; pas de statistiques nominatives.
- La commande ne part QUE des VALIDÉS (les « en constitution » ne commandent rien).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rapport post-course | édition avec données | CSV unique à sections, BOM, CRLF, s'ouvre dans Excel FR | N/A |
| Édition vide | aucun inscrit | Sections présentes, zéros lisibles (pas de crash, pas de lignes fantômes) | N/A |
| Passages par checkpoint | 3 checkpoints, retraits + passages | Un bloc : checkpoint (secteur/titre), coureurs passés distincts (arbitré, annulations exclues) | N/A |
| Arrivées | classements 7.1 | Épreuve, dossard, rang, temps HH:MM:SS ; ex æquo = même rang | N/A |
| Abandons détaillés | 5.3 | Épreuve, dossard, lieu, motif, horodatage, auteur | N/A |
| Portée partages | resultats_visite 7.2 | Total visites + une ligne par jour | aucun partage → section « 0 visite » honnête |
| Commande | validés par tailles | Épreuve × tailles + totaux + médailles par épreuve, mention zéro stock | N/A |
| Commande sans validé | 0 validé | Zéros lisibles, aucune ligne fantôme | N/A |
| Accès non organisateur | volontaire/coureur/anonyme | 403/401 enveloppe admin.*, aucun octet de CSV | N/A |
| Base indisponible | db KO | 503 douce, jamais un CSV partiel | N/A |
| CSV malveillant | cellule `" ; =SOMME(...)` | Échappement RFC 4180 (guillemets doublés) — injection neutralisée | N/A |
| Multi-org | org B | Rapport de SON édition uniquement (RLS, session) | jamais de fuite |
| Édition sans heure de départ | épreuve non configurée | Arrivées sans temps (« — »), jamais de temps faux | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/modules/chrono/store.ts` — `etatCourse()` / `classements()` (gabarits transaction unique, arbitrages DISTINCT ON + NOT EXISTS annulation) ; `resultats_visite` (0034) ; abandon (0028 : jeton_coureur, lieu, motif CHECK, horodatage, auteur_email, reception).
- `apps/web/src/modules/chrono/service.ts` — `getClassements` (rang/temps à réutiliser TELS QUELS), `editionCourante` helper privé (gabarit).
- `apps/web/src/modules/inscriptions/` — `coureur.tshirt_size` CHECK XS–XXL (0002), statuts français (0006/domain.ts, `COUREUR_STATUS_LABELS`), `listCoureurs` (offset 7.1), `epreuve.heure_depart` (0033).
- `apps/web/src/modules/missions/` — `listMissionsEtat` (checkpoints par édition : titre, secteur, est_arrivee) pour le bloc passages.
- `apps/web/src/app/api/admin/preuves/[id]/route.ts` + `api/admin/volontaires/modele/route.ts` — gabarits route FICHIER (content-disposition attachment).
- `apps/web/src/app/api/admin/guard.ts` — guardAdmin + adminErrorResponse.
- `apps/web/src/app/admin/course/page.tsx` + `heures-depart.tsx` — gabarits page admin (requireRolePage, AdminIndisponible, card admin) ; liens `btn-lien` (dossards→course) à décliner vers /admin/rapports.
- `apps/web/src/modules/missions/import-format.ts` — parseur CSV entrant (référence de l'échappement RFC 4180) ; l'ENCODEUR sortant est à écrire (pures) dans rapports/domain.
- Tests : `admin/course/page.test.tsx` (page), `classements.integration.test.ts` / `resultats.integration.test.ts` (intégration base réelle, helpers jetons/missions).

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/modules/rapports/domain.ts` (+ tests) — pures : `encoderCelluleCsv` (RFC 4180, guillemets doublés, injection neutralisée), `construireCsv(sections)` (BOM UTF-8, CRLF, lignes vides entre sections), `formaterTempsRapport(tempsMs|null)` (HH:MM:SS / « — »), `lignesCommande(validés, tailles)` (épreuve × taille + totaux + médailles).
- [x] `apps/web/src/modules/rapports/store.ts` — UNE transaction withOrg : inscrits par statut, validés par épreuve×taille (dossard jamais requis), retraits arbitrés (premier par coureur), passages distincts par checkpoint (arbitrés, annulations exclues), abandons détaillés (join jeton→coureur→épreuve), visites par jour ; RLS.
- [x] `apps/web/src/modules/rapports/service.ts` (+ tests) — `genererRapportPostCourse(session)` et `genererCommande(session)` : édition courante de l'organisation de session, composition des sections (synthèse reprenant classements 7.1 pour partants/arrivées/rangs/temps), retour { nomFichier, contenu } ; erreurs enveloppe admin.* (503 douce).
- [x] `apps/web/src/app/api/admin/rapports/post-course/route.ts` + `commande/route.ts` (+ tests) — GET guardAdmin, text/csv charset=utf-8, Content-Disposition attachment (nom daté), no-store, 503 douce, AUCUN octet avant validation complète.
- [x] `apps/web/src/app/admin/rapports/page.tsx` (+ tests) — requireRolePage organisateur, AdminIndisponible si KO, deux cartes (rapport / commande, descriptions, boutons = liens GET), note processus J-10, tutoiement ; liens depuis `/admin/course` et `/admin/dossards`.
- [x] Intégration `rapports.integration.test.ts` — édition complète semée (statuts variés, tailles, retraits, passages multi-checkpoints + annulation, arrivées avec heures de départ, abandons, visites multi-jours) : CSV complet asserté (sections, valeurs, échappement, zéros sur édition vide), commande (totaux tailles, médailles), RLS multi-org, session volontaire → 403.
- [x] Tests matrice — chaque rangée couverte (pures + routes + page + intégration).

**Acceptance Criteria:**
- Given l'édition terminée, when l'organisateur télécharge le rapport post-course, then UN fichier CSV couvre l'édition complète (inscrits, présents, passages par checkpoint, arrivées avec rang/temps, abandons détaillés, portée des partages — FR-26) et s'ouvre proprement dans Excel FR.
- Given le processus J-10, when l'organisateur télécharge l'export commande, then les décomptes VALIDÉS par épreuve et par taille de t-shirt + les médailles (1/coureur) y figurent, mention zéro stock — rien commandé pour les non-validés.
- Given un compte non organisateur, when il demande un rapport, then 403 enveloppe admin.* et AUCUN octet de CSV ne sort.
- Given `pnpm typecheck && pnpm test && pnpm test:db`, then tout passe.

## Implementation Notes

Décisions (options recommandées, déléguées par l'utilisateur) : CSV RFC 4180 UTF-8 BOM (question ouverte archi tranchée localement — zéro dépendance, s'ouvre partout, la future richesse XLSX pourra s'ajouter) ; fichier UNIQUE à sections titrées pour le rapport (exigence FR-26) ; détails limités au DOSSARD (les CSV peuvent circuler au directoire sans exposer noms/contacts) ; médailles = validés par épreuve ; le « J-10 » est un processus (note UI), pas une contrainte technique.

## Verification

**Commands:**
- `pnpm typecheck` -- expected: succès
- `pnpm test` -- expected: succès
- `pnpm test:db` -- expected: succès (intégration rapports)

## Review Triage Log

| # | Verdict | Preuve / justification | Route |
|---|---------|------------------------|-------|
| 1 | high | Injection de formule NON neutralisée : `= + - @` passent (le quoting RFC 4180 n'empêche PAS l'exécution Excel) — préfixer `'`. | patch |
| 2 | medium | Horodatages abandons au fuseau du SERVEUR (UTC → décalage d'1 h) — formater en Africa/Algiers, réutiliser shared. | patch |
| 3 | medium | Commande jointe par NOM d'épreuve (name non unique par édition) — fusion de compteurs → clé par epreuveSlug. | patch |
| 4 | low | `versClassements` appelé 2× avec des instants différents (contradiction instant unique) — calculer une fois. | patch |
| 5 | low | Échec de téléchargement remplace la page par le JSON d'erreur — ouvrir dans un nouvel onglet (page intacte). | patch |
| 6 | low | Date du nom de fichier en UTC (veille entre minuit et 01:00 locale) — date civile Africa/Algiers. | patch |
| 7 | false | Route « /admin/dossards » du bloc figé : coquille — la page réelle est /admin/dossiers (corrigée dans Implementation Notes ; le texte gelé ne se retouche pas sans renégociation). | spec-note |
| 8 | false | Claim « enveloppes admin.* » pour 401/403 : la garde IAM partagée rend iam.* (cohérent avec tout le repo) — wording du bloc figé, assumé. | spec-note |
| 9 | medium | Date J-10 « 16/03/2027 » codée en dur (ment si l'édition change) — dériver de race_date − 10 j. | patch |
| 10 | low | Aucune ligne « généré le » dans le CSV (document d'audit non daté en interne) — en-tête daté + fraîcheur. | patch |
| 11 | low | `epreuveSlug` code mort du store — consommé par le fix #3. | patch |
| 12 | low | Registre incohérent page (tutoiement) vs errors.ts (vouvoiement) — aligner en tutoiement organisateur. | patch |
| 13 | medium | Content-Disposition injectable via slug d'édition (texte base libre) — sanitizer le nom de fichier. | patch |
| 14 | low | Retrait d'un coureur dont l'épreuve serait hors édition (FK libre) : synthèse incohérente — filtrer sur les épreuves de l'édition. | patch |
| 15 | medium | Liens passerelles vers /admin/rapports (course + dossiers) non testés — assertions SSR. | patch |
| 16 | false | 403 volontaire prouvé par les tests de routes (pattern repo : la garde est testée au niveau route, mock service) — l'intégration couvre le reste. | rejeté |
