---
title: 'Story 2.3 — Bloc sponsors option A / option B'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '1f05525'
followup_review_recommended: false
context:
  - {project-root}/_bmad-output/implementation-artifacts/epic-2-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Le sponsoring (Ifri visé en option A, repli multi-sponsors en B) ne peut pas être configuré : la vitrine n'a aucun bloc sponsors et la bascule A→B exigerait un développeur (FR-22).

**Approach:** Table `sponsor` + config mode ('A'|'B') en base (migration 0010, org-scopée, RLS via withOrg), surface admin minimale `/admin/sponsors` (bascule de mode + CRUD nom/url/logo facultatif, requireRole organisateur), et section partenaires sur l'accueil rendue dynamiquement (lecture serveur à chaque requête — reflet immédiat, bascule sans dev) : option A = un emplacement signature (nom en display, bande forêt), option B = grille d'emplacements équivalents ; aucun sponsor configuré = section absente proprement.

## Boundaries & Constraints

**Always:**
- Mode et sponsors édités depuis l'espace admin (organisateur) — jamais par env ni code ; tout est org-scopé (organisation_id + RLS withObj).
- Option A : le sponsor désigné (seul actif affiché) porte l'emplacement signature — nom en Barlow capitales sur bande forêt (charte : « bandeau partenaires » forest-surface), mention « Partenaire signature » ; option B : 2+ sponsors, emplacements équivalents (grille sobre), sans exclusivité.
- Rendu **dynamique** de la section (lecture serveur par requête) : la bascule et les créations sont visibles immédiatement — c'est le « sans développement » de FR-22 ; le reste de la page d'accueil reste rendue serveur (budget transfert inchangé, < 300 Ko à re-vérifier).
- Sponsor : nom (requis, ≤ 80 car.), url facultatif, logo_url facultatif (rendu <img> si fourni, alt = nom, jamais déformé) ; en option A, un sponsor porte le flag signature ; en option B tous équivalents (ordre = création).
- Vouvoissement vitrine (« Ils soutiennent le week-end »), tutoiement admin ; accessibilité (liens labellisés, contrastes via paires testées) ; aucune photo/bitmaps nouvelle hors logo_url fourni par l'admin.
- La vitrine ne casse jamais si la config est absente/vide : section masquée.

**Never:**
- Pas de compteur d'impressions/clics, pas de contrat/tarifs dans l'app (le sponsoring se contractualise hors application).
- Pas d'upload de logo (URL fournie par l'admin — l'upload de fichiers sponsors = hors périmètre V1).
- Pas de multi-organisation dans l'UI (l'admin opère son organisation).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mode A + 1 sponsor signature | config mode A | Bande forêt : nom en display + « Partenaire signature » (+lien si url) | No error expected |
| Mode B + 3 sponsors | config mode B | Grille équivalente 3 emplacements | No error expected |
| Aucun sponsor | table vide | Section absente de l'accueil, aucun vide | No error expected |
| Bascule A→B | admin change le mode | Accueil reflète B au rechargement (dynamique) | No error expected |
| Mode A sans signature | mode A + sponsors sans flag | Premier sponsor actif affiché en signature | No error expected |
| Accès coureur | session role coureur sur /admin/sponsors | 403/redirection | 403 enveloppe |
| Nom vide/long | CRUD invalide | Refus champ nommé (comme inscriptions) | 400 enveloppe |
| Logo cassé | logo_url 404 | Alt affiché, mise en page tenue | img onError → masqué |

</intent-contract>

## Code Map

- `apps/web/src/modules/inscriptions/migrations/` — runner composite : ajouter 0010_sponsors.sql.
- `apps/web/src/modules/iam/session.ts` (requireRole/requireRolePage), `apps/web/src/app/admin/` (patterns dossiers : pages, indisponible, formulaires) — réutiliser.
- `apps/web/src/app/page.tsx` — ajouter la section partenaires (dynamic read) entre piliers et contact.
- `apps/web/src/app/api/admin/` — patterns routes + guard + tests stubbés.
- Contrastes/paires testés (`contrastes.test.ts`) — on-forest/forest-surface déjà couvert.
- Budget : `pnpm budget` doit rester < 300 Ko (section texte ~1 Ko).

## Tasks & Acceptance

**Execution:**
- `migrations/0010_sponsors.sql` -- table sponsor (id, organisation_id, name, url nullable, logo_url nullable, is_signature bool défaut false, created_at) + table vitrine_sponsors_config (organisation_id pk, mode CHECK 'A'|'B', updated_at) ; intégrer au runner.
- `apps/web/src/modules/sponsors/` (store + service + errors) -- CRUD org-scopé (withOrg), config get/set, résolution du rendu (mode + sponsors + signature effective), validation (nom requis ≤ 80, url/logo_url http(s) valides si fournis).
- `apps/web/src/app/api/admin/sponsors/route.ts` + `[id]/route.ts` + `config/route.ts` + tests -- GET/POST/PATCH/DELETE + mode, requireRole, enveloppes.
- `apps/web/src/app/admin/sponsors/page.tsx` + composants -- liste, ajout/édition (nom/url/logo), flag signature (actif en mode A), bascule A/B avec explication concrète des deux options, états vides.
- `apps/web/src/app/page.tsx` + composant section -- rendu dynamique A/B/vide décrit ci-dessus, vouvoiement.
- Tests -- unitaires (résolution A/B/signature par défaut, validation), intégration (CRUD + config org-scopée + cross-org invisible), routes stubbées, rendu statique de la section par mode (renderToStaticMarkup).

**Acceptance Criteria:**
- Given un sponsor signature et le mode A, when la vitrine s'affiche, then l'emplacement signature est rendu (nom display, bande forêt) et le basculement en mode B depuis l'admin est visible au simple rechargement.
- Given aucun sponsor, when la vitrine s'affiche, then aucune section vide n'apparaît.
- Given un coureur, when il accède aux routes sponsors admin, then 403 sans fuite.

## Spec Change Log

## Review Triage Log

## Design Notes

Le rendu dynamique (lecture DB par requête) est le mécanisme du « bascule sans dev » : plus simple et plus honnête qu'un cache à invalider — la page d'accueil reste un composant serveur ; le prérendu statique de 2-1 devient dynamique (coût compute négligeable, budget transfert inchangé). Signature effective = flag is_signature, sinon premier sponsor actif (mode A seul) — jamais de section vide en A. Logo par URL : l'upload viendra si le comité fournit des fichiers.

## Verification

**Commands:**
- `pnpm -F @azzel/web db:migrate` -- expected: 0001–0010, idempotent.
- `pnpm test` -- expected: verts (matrice sponsors + suites intactes).
- `pnpm build && pnpm budget` -- expected: < 300 Ko.
- `pnpm typecheck` -- expected: vert.

**Manual checks (if no CLI):**
- En admin : ajouter « Ifri » + signature, mode A → accueil (bande signature) ; passer en B, ajouter 2 sponsors → grille équivalente ; vider → section absente.
