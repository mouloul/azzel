---
title: 'Story 1.6 — Validation ou refus du dossier par l'organisateur'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '0ac692c'
followup_review_recommended: true
context:
  - {project-root}/_bmad-output/implementation-artifacts/note-archi-winston-1-6-1-9.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** L'organisateur ne peut rien décider : aucune surface pour examiner les preuves déposées, valider ou refuser un dossier — et le coureur ne saurait jamais pourquoi il est refusé.

**Approach:** Conforme à la note Winston : colonne `account.role` (coureur/organisateur) promue à la connexion via `AZZEL_ADMIN_EMAILS`, helper `requireRole`, première surface admin `/admin/dossiers` (liste + recherche, détail avec preuve téléchargeable, valider/refuser avec motif obligatoire), cycle de statut où le refus n'enferme pas (nouvelle preuve → retour « en constitution »), et l'espace coureur affiche statut + motif de refus avec action pour redéposer.

## Boundaries & Constraints

**Always:**
- Refus : motif en champ libre court OBLIGATOIRE (CHECK SQL `status='refusé' ⇔ refusal_reason IS NOT NULL`) — jamais de refus silencieux (FR-4). Validation : sans motif.
- Statuts coureur : `en constitution` / `validé` / `refusé`. `validé` immuable côté coureur (verrous existants 1-3/1-4/1-5). Dépôt d'une nouvelle preuve permis pour `en constitution` ET `refusé` → repasse `en constitution` (motif conservé, ancienne preuve reste `replaced`).
- Décisions de l'organisateur : depuis `en constitution` ou `refusé` (re-validation directe permise), transaction FOR UPDATE, jamais depuis `validé` sans changement (idempotent : re-valider un dossier validé = no-op 200).
- Rôle : `account.role` CHECK ('coureur','organisateur'), défaut coureur ; promotion idempotente à la connexion si email ∈ `AZZEL_ADMIN_EMAILS` (même transaction que le login, .env.example documenté) ; `SessionRecord` porte `role` ; `requireRole('organisateur')` → 403 enveloppe `iam.forbidden` pour un coureur, 401 sans session.
- Téléchargement preuve : `GET /api/admin/preuves/:id` (rôle organisateur, org-scopé) — stream, Content-Type et filename depuis la base, jamais le nom d'origine stocké autrement.
- Surfaces organisateur au vouvoiement ? Non — l'organisateur est un rôle interne : tutoiement cohérent avec l'espace connecté (décision enregistrée) ; UI française, composants charte, un seul bouton action par vue.
- Espace coureur : statut affiché ; si refusé → motif + action « Déposer une nouvelle preuve » (lien /preuve).

**Never:**
- Pas d'emails (story 1-8 consomme les décisions), pas de checklist (1-7), pas de RLS (1-9).
- Pas d'édition des données coureur par l'organisateur (lecture + décision uniquement).
- Pas de pagination complète (recherche + LIMIT 200, V1 ~1000 inscrits) ni de framework UI admin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Liste dossiers | Session organisateur | Coureurs de l'édition (statut, preuve, dates), recherche nom/email | No error expected |
| Validation | coureur en constitution + preuve active | statut → validé, horodaté, liste rafraîchie | No error expected |
| Refus sans motif | décision refusé, motif vide | Refus 400 nommant le motif obligatoire, statut inchangé | 400 enveloppe |
| Refus avec motif | refusé + motif court | statut → refusé, motif stocké, visible côté coureur | No error expected |
| Coureur redépose après refus | statut refusé + nouvelle preuve | Nouvelle preuve active, statut → en constitution | No error expected |
| Décision par un coureur | session role coureur | 403 enveloppe iam.forbidden | 403 |
| Download preuve | organisateur + preuve d'un coureur de son org | Fichier streamé (mime base), jamais celle d'une autre org | 404 si absente / hors org |
| Accès sans session | aucun cookie | 401 | 401 enveloppe |

</intent-contract>

## Code Map

- `apps/web/src/modules/iam/` — store (verifyCodeAndStartSession : ajouter promotion role + retour role), session.ts (requireRole à créer), errors.ts (ForbiddenError 403), constants (env AZZEL_ADMIN_EMAILS lu via env.ts).
- `apps/web/src/modules/inscriptions/store.ts` — savePreuve (élargir garde statut + reset en constitution), à étendre : listCoureurs/detail/decideDossier (FOR UPDATE, CHECK motif).
- `apps/web/src/modules/inscriptions/proof-store.ts` — read() déjà présent (utilisé en tests) : le consommer pour le stream.
- `apps/web/src/app/espace-coureur/page.tsx` — bloc statut + motif refus + CTA /preuve.
- `apps/web/src/app/layout.tsx` — lien « Administration » dans le header si session organisateur.
- Patterns : routes protégées (readSession), tests routes stubbés, intégration gated + garde localhost, .env.example.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/modules/inscriptions/migrations/0006_roles_statuts.sql` -- account.role (CHECK, défaut coureur), coureur.refusal_reason + CHECK statut/motif, statuts étendus au CHECK existant.
- `apps/web/src/modules/iam/` (store/service/session/errors) -- role dans SessionRecord, promotion AZZEL_ADMIN_EMAILS dans la transaction de login, requireRole('organisateur'), ForbiddenError 403 enveloppe.
- `apps/web/src/modules/inscriptions/store.ts` + `service.ts` + `errors.ts` -- listCoureurs (recherche, LIMIT 200, org), coureurDetail (admin, avec preuve active + acceptations), decideDossier (transaction, gardes statuts, motif), élargissement savePreuve (refusé → en constitution).
- `apps/web/src/app/api/admin/dossiers/route.ts`, `[id]/route.ts`, `[id]/decision/route.ts`, `preuves/[id]/route.ts` + tests routes -- liste/recherche, détail, décision, stream preuve ; tous requireRole.
- `apps/web/src/app/admin/dossiers/page.tsx`, `[id]/page.tsx` + formulaire décision -- liste (table sobre, statuts en chips), détail (pièces du dossier, preuve téléchargeable, valider / refuser+motif), styles charte.
- `apps/web/src/app/espace-coureur/page.tsx` + `layout.tsx` -- statut/motif/CTA coureur ; lien Administration si organisateur.
- `apps/web/src/modules/inscriptions/` tests (unit + intégration) -- matrice complète : promotion à la connexion, refus sans motif, cycle refusé→redépôt→en constitution, 403/401, download hors org = 404, re-validation idempotente.

**Acceptance Criteria:**
- Given un dossier avec preuve active, when l'organisateur refuse avec motif, then le statut passe à refusé, le motif est stocké et l'espace coureur l'affiche avec l'action pour redéposer.
- Given une tentative de refus sans motif, when la décision arrive au serveur, then refus 400 et rien ne change en base.
- Given un coureur (role coureur), when il appelle une route admin, then 403 enveloppe sans fuite de données.
- Given un dossier refusé, when le coureur dépose une nouvelle preuve, then elle devient active et le dossier repasse en constitution.

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 29 findings — high 0, medium 5, low 18, false 3, maybe-false 0 (12 entrées patch, 1 defer, 4 rejets)
- findings (résumé) :
  - `[medium]` `[patch]` Câblage verifyLoginCode→readAdminEmails non testé — la promotion pouvait mourir en silence (VG1, pré-vérifié) : cas via le service avec env posé.
  - `[medium]` `[patch]` Blocage « refusé » de submitInscription/acceptDocuments non épinglé — seul le redépôt de preuve rouvre (VG3, pré-vérifié).
  - `[medium]` `[patch]` refusalReason de getPreuveState non asserté — motif invisible côté coureur sans détection (VG2, pré-vérifié).
  - `[medium]` `[patch]` Pas de traçabilité des décisions (BH7) — colonnes decided_by/decided_at + affichage admin.
  - `[medium]` `[patch]` Motif sans numéro d'appel côté coureur refusé (IA-divergence + UX-DR-11) — AssistanceButton adjoint ; re-dépôt d'octets identiques → 409 dédié au lieu du silence (EC8).
  - `[low]` `[patch]` Guard admin catch-all + garde Content-Length unifiée (BH4+EC1+EC2) ; preuve inexistante vs fichier perdu distingués (BH5+EC3) ; preuves replaced non téléchargeables + détail en transaction + flag hasMore (BH13+BH10+BH8) ; CHECK longueur motif + normalisation statuts legacy (BH3+EC5) ; hygiène (format errors.ts, constante importée, précédence, factorisations — BH1+BH11+BH12+BH18+BH14) ; AdminHeaderLink client (accueil redevient statique, BH17) ; iam/migrate.ts mort supprimé (EC7) ; tests requireRolePage/500/désync URL/afterAll sûr (BH16+EC6).
  - `[false]` `[reject]` BH2 — casse de la promotion : l'email est normalisé en amont (normalizeEmail dans le service), la liste est minusculisée.
  - `[false]` `[reject]` EC4 — catégorie absente du rendu : CHECK SQL contraint le domaine.
  - `[low]` `[reject]` BH9 — migration IAM dans le dossier inscriptions : runner composite unique assumé (les migrations couvrent plusieurs domaines depuis 0002), renommage = churn.
  - `[low]` `[reject]` BH15 — refusé après clôture sans issue : motif affiché + assistance (patchée ci-dessus), inscriptions closes = attendu produit.
  - `[defer]` Pages/composants admin sans test de rendu (VG4) — dette UI déjà tracée.

## Auto Run Result

**Statut : done.**

### Changement implémenté
Décision organisateur de bout en bout : account.role (coureur/organisateur) promu à la connexion via AZZEL_ADMIN_EMAILS (transaction de login, idempotent), requireRole/requireRolePage + 403 iam.forbidden, premières surfaces admin (/admin/dossiers liste+recherche+chips, détail avec pièces et preuve streamée, valider/refuser+motif obligatoire, traçabilité decided_by/decided_at), cycle refus non terminal (canDepositPreuve, redépôt → en constitution, octets identiques → 409 dédié), motif + assistance visibles côté coureur, CHECK SQL motif/statuts/longueur, AdminHeaderLink client.

### Arbitrages enregistrés (à revoir par le PO)
- Contradiction spec « motif conservé » vs CHECK biconditional : le CHECK a primé — au redépôt le motif est remis à NULL (il a été vu par le coureur et partira par email en 1-8, l'outbox conservera la trace).
- Re-dépôt d'octets identiques depuis refusé : dédup conservée + message explicite (la même preuve reste refusée).
- Surfaces admin au tutoiement (rôle interne), vouvoiement réservé au public.

### Revue
4 couches — 29 constats → 12 patchs (5 medium, 7 low) corrigés (286/287 verts, 1 skip documenté) ; 1 defer ; 4 rejets.

**Recommandation de re-revue : true** — 5 medium patchées ; risques nommés : (1) surfaces UI non testées automatiquement (dette UI tracée), (2) CSRF couvert par SameSite=lax — pas de jeton dédié (défense en profondeur acceptable V1, à réévaluer si multi-domaine), (3) pagination par recherche seulement (V1 ≤ 1000 dossiers).

### Vérification
Dev DB réinitialisée + migrations 0001–0006 propres ✓ ; `pnpm test` 286 passés + 1 skip (22 fichiers, intégrations exécutées) ; `pnpm build` + `pnpm typecheck` verts.

### Risques résiduels
- AZZEL_ADMIN_EMAILS : toute adresse listée devient organisatrice à sa connexion — garder la variable hors des déploiements publics.
- Le téléchargement de preuve exige le rôle organisateur de la même organisation (pré-RLS 1-9, filtrage applicatif).

## Spec Change Log

## Review Triage Log

## Design Notes

Décisions Winston (note en context:) : colonne role unique (pas de N-N), promotion idempotente à la connexion via AZZEL_ADMIN_EMAILS (repli SQL documenté), refus non terminal côté coureur — c'est la correction du verrou 1-5 qui aurait enfermé les dossiers refusés. Le motif remonte par email en 1.8 ; ici il est stocké et affiché. L'admin consomme les composants charte existants (aa-_card/chip disponibles si utiles) — pas de bibliothèque UI.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0006, idempotent.
- `pnpm test` -- expected: suite verte, matrice 1-6 couverte.
- `pnpm build && pnpm typecheck` -- expected: tout vert.

**Manual checks (if no CLI):**
- `AZZEL_ADMIN_EMAILS=vous@example.dz pnpm dev:web` → se connecter avec cet email → lien Administration → liste, détail, télécharger une preuve, refuser sans motif (blocage), avec motif, puis côté coureur : motif affiché, redépôt → retour en constitution.

## Revue de code

**2026-10-22 — revue d'épopée (3 lentilles : adverse, chemins limites, trous de vérification) sur le diff complet des stories 1.1 à 1.9.**

### Constat retenu

`decideDossier`, branche `valider`, ne vérifiait **ni la présence d'une preuve de paiement active, ni les acceptations** (décharge, règlement intérieur). Un organisateur pouvait donc valider un dossier vide et délivrer un dossard sans décharge signée — exposition juridique réelle, et contradiction avec la matrice de cette story (« coureur en constitution **+ preuve active** → statut validé ») comme avec la story 1.4 (« sans les deux acceptations, le dossier ne peut pas être considéré complet »).

### Modifications apportées

- `apps/web/src/modules/inscriptions/errors.ts` — type `PieceDossier` (`'preuve' | 'decharge' | 'reglement'`), erreur `DossierIncompletError(pieces)`, helper `formatPiecesManquantes`, et mapping dans `toAdminApiError` → **409 `admin.dossier_incomplet`**, message et action en français nommant les pièces manquantes. Pas de 500.
- `apps/web/src/modules/inscriptions/store.ts`, `decideDossier`, branche `valider` — après le no-op idempotent, lecture **dans la même transaction que le `FOR UPDATE`** de la preuve `status = 'active'` et des colonnes `decharge_accepted_at` / `reglement_accepted_at` ; si une pièce manque, `DossierIncompletError`.
- Aucune modification de route : `POST /api/admin/dossiers/[id]/decision` passait déjà par `toAdminApiError`.

### Décision explicite

**Le refus reste possible sur un dossier incomplet** : seule la branche `valider` est gardée — refuser pour pièce manquante est précisément l'usage attendu. Un test l'épingle. La règle est exactement celle des specs (preuve + décharge + règlement), sans durcissement supplémentaire.

### Vérification

`dossiers-admin.integration.test.ts` : helper `completerDossier()` ajouté et appliqué aux quatre tests qui validaient un dossier vide ; quatre nouveaux tests (validation sans rien → 409 et statut inchangé ; preuve seule ; acceptations seules ; refus d'un dossier incomplet toujours permis). `inscriptions.test.ts` : deux tests d'enveloppe. Deux tests de `outbox.integration.test.ts` validaient également un dossier vide — complétés avec preuve et acceptations. Suite complète avec base : 558 passés, 0 échec.

### Constats non traités dans cette passe

Le refus n'est pas idempotent (refuser un dossier déjà refusé réécrit le statut et insère une nouvelle ligne d'outbox à chaque clic, alors que la validation est idempotente) ; un `id` non-UUID déclenche une erreur Postgres `22P02` convertie en 500 au lieu d'un 404 ; `listCoureurs` expose `hasMore` sans qu'aucun curseur ni paramètre de page n'existe dans la route, rendant les dossiers au-delà de 200 inaccessibles ; `escapeLike` n'est exercé par aucun test.
